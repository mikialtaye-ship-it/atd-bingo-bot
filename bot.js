require('dotenv').config();
const { Telegraf, Markup, session } = require('telegraf');
const express = require('express');
const axios = require('axios');
const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');

// ─── Supabase Client ────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── In-Memory State Management ─────────────────────────────────────────────
const userState = new Map();
function getState(userId) { return userState.get(String(userId)) || null; }
function setState(userId, step, data = {}) { userState.set(String(userId), { step, data }); }
function clearState(userId) { userState.delete(String(userId)); }

// ─── Payment Info Helper ─────────────────────────────────────────────────────
function getPaymentAccountsText() {
  return `\n\n💳 ለሚከተሉት መለያዎች ይክፈሉ:\n\n` +
    `📱 ቴሌብር (Telebirr): ${process.env.TELEBIRR_NUMBER} (${process.env.TELEBIRR_NAME})\n` +
    `🏦 የኢትዮጵያ ንግድ ባንክ (CBE): ${process.env.CBE_ACCOUNT} (${process.env.CBE_NAME})\n` +
    `🏦 አቢሲኒያ ባንክ (Abyssinia): ${process.env.BOA_ACCOUNT} (${process.env.BOA_NAME})\n\n` +
    `✅ ክፍያ ከፈጸሙ በኋላ የባንክ/ቴሌብር የማረጋገጫ SMS ጽሑፍ ወይም የደረሰኝ ፎቶ ያስገቡ።`;
}

// ─── SMS/Ref Parsing Helper ──────────────────────────────────────────────────
function parseTransactionRef(text) {
  // Telebirr patterns
  let match = text.match(/(?:Ref|Reference|Transaction|TxnID)[:\s#]*([A-Z]{2}[0-9]{8,})/i);
  if (match) return match[1];
  // CBE FT pattern
  match = text.match(/FT[0-9A-Z]{8,}/i);
  if (match) return match[0].toUpperCase();
  // Any long numeric ref
  match = text.match(/\b([0-9]{10,})\b/);
  if (match) return match[1];
  // Fallback: any alphanumeric ref 8+ chars
  match = text.match(/\b([A-Z0-9]{8,})\b/);
  if (match) return match[1];
  return null;
}

// ─── Main Keyboard ───────────────────────────────────────────────────────────
const mainKeyboard = Markup.keyboard([
  ['🎮 ኦንላይን ጨዋታዎች', '💰 ባላንስ መሙላት'],
  ['💳 የእኔ ባላንስ', '📲 ኦፍላይን አፕ አውርድ'],
  ['📝 አዲስ ቤት መመዝገብ', '📜 የግብይት ታሪክ'],
  ['📞 እርዳታ']
]).resize();

// ─── Bot Init ────────────────────────────────────────────────────────────────
const bot = new Telegraf(process.env.BOT_TOKEN);

// ─── /start ──────────────────────────────────────────────────────────────────
bot.start(async (ctx) => {
  try {
    const telegramId = String(ctx.from.id);
    await supabase
      .from('online_wallets')
      .upsert({ telegram_id: telegramId, balance: 0 }, { onConflict: 'telegram_id', ignoreDuplicates: true });

    await ctx.reply(
      '🎉 እንኳን ወደ ATD Bingo በደህና መጡ!\n\nከታች ካለው ምናሌ ይምረጡ:',
      mainKeyboard
    );
  } catch (err) {
    console.error('[/start]', err);
    ctx.reply('❌ ስህተት ተከስቷል። እባክዎ እንደገና ይሞክሩ።').catch(() => {});
  }
});

// ─── /setapp (admin only) ────────────────────────────────────────────────────
bot.command('setapp', async (ctx) => {
  try {
    if (Number(ctx.from.id) !== Number(process.env.ADMIN_TELEGRAM_ID)) {
      return ctx.reply('❌ ይህን ትዕዛዝ ለመጠቀም ፈቃድ የለዎትም።');
    }
    const replyMsg = ctx.message.reply_to_message;
    if (!replyMsg || !replyMsg.document) {
      return ctx.reply('❌ /setapp ትዕዛዙን ወደ ሰነድ (Document) ፋይሉ Reply አድርገው ይጠቀሙ።');
    }
    const fileId = replyMsg.document.file_id;
    await supabase
      .from('app_settings')
      .upsert({ key: 'offline_app_file_id', value: fileId }, { onConflict: 'key' });
    await ctx.reply('✅ አፕሊኬሽን ፋይሉ ተቀምጧል!');
  } catch (err) {
    console.error('[/setapp]', err);
    ctx.reply('❌ ስህተት ተከስቷል። እባክዎ እንደገና ይሞክሩ።').catch(() => {});
  }
});

// ─── 🎮 ኦንላይን ጨዋታዎች ───────────────────────────────────────────────────────
bot.hears('🎮 ኦንላይን ጨዋታዎች', async (ctx) => {
  try {
    const telegramId = String(ctx.from.id);
    const { data: wallet } = await supabase
      .from('online_wallets')
      .select('balance')
      .eq('telegram_id', telegramId)
      .single();

    const balance = wallet ? wallet.balance : 0;
    const buttons = [];

    // Bingo
    if (process.env.ONLINE_BINGO_URL && !process.env.ONLINE_BINGO_URL.includes('placeholder')) {
      buttons.push([Markup.button.webApp('🎰 ቢንጎ', process.env.ONLINE_BINGO_URL)]);
    } else {
      buttons.push([Markup.button.callback('🎰 ቢንጎ (በቅርብ ቀን)', 'coming_soon_bingo')]);
    }

    // Keno
    if (process.env.ONLINE_KENO_URL && !process.env.ONLINE_KENO_URL.includes('placeholder')) {
      buttons.push([Markup.button.webApp('🎲 ኬኖ', process.env.ONLINE_KENO_URL)]);
    } else {
      buttons.push([Markup.button.callback('🎲 ኬኖ (በቅርብ ቀን)', 'coming_soon_keno')]);
    }

    // Aviator
    if (process.env.ONLINE_AVIATOR_URL && !process.env.ONLINE_AVIATOR_URL.includes('placeholder')) {
      buttons.push([Markup.button.webApp('✈️ አቪዬተር', process.env.ONLINE_AVIATOR_URL)]);
    } else {
      buttons.push([Markup.button.callback('✈️ አቪዬተር (በቅርብ ቀን)', 'coming_soon_aviator')]);
    }

    buttons.push([Markup.button.callback('💰 ለኦንላይን ባላንስ ሙላ', 'deposit_online_start')]);

    await ctx.reply(
      `🎮 የኦንላይን ጨዋታዎች\n\n💰 የአሁን ባላንስ: ${balance} ብር\n\nጨዋታ ይምረጡ:`,
      Markup.inlineKeyboard(buttons)
    );
  } catch (err) {
    console.error('[ኦንላይን ጨዋታዎች]', err);
    ctx.reply('❌ ስህተት ተከስቷል። እባክዎ እንደገና ይሞክሩ።').catch(() => {});
  }
});

// ─── 💰 ባላንስ መሙላት ──────────────────────────────────────────────────────────
bot.hears('💰 ባላንስ መሙላት', async (ctx) => {
  try {
    await ctx.reply(
      '💰 ባላንስ ለየትኛው ማስገባት ይፈልጋሉ?',
      Markup.inlineKeyboard([
        [Markup.button.callback('🏪 ለኦፍላይን ቤት (Offline Shop Sync)', 'deposit_offline_start')],
        [Markup.button.callback('🎮 ለኦንላይን ጨዋታ (Online Game Wallet)', 'deposit_online_start')]
      ])
    );
  } catch (err) {
    console.error('[ባላንስ መሙላት]', err);
    ctx.reply('❌ ስህተት ተከስቷል። እባክዎ እንደገና ይሞክሩ።').catch(() => {});
  }
});

// ─── 💳 የእኔ ባላንስ ────────────────────────────────────────────────────────────
bot.hears('💳 የእኔ ባላንስ', async (ctx) => {
  try {
    const telegramId = String(ctx.from.id);

    const { data: wallet } = await supabase
      .from('online_wallets')
      .select('balance')
      .eq('telegram_id', telegramId)
      .single();

    const { data: links } = await supabase
      .from('telegram_links')
      .select('shop_id, username, shops(name, status)')
      .eq('telegram_id', telegramId);

    let msg = `💳 የእኔ ባላንስ\n\n`;
    msg += `🎮 ኦንላይን ዋሌት ባላንስ: ${wallet ? wallet.balance : 0} ብር\n\n`;

    if (links && links.length > 0) {
      msg += `🏪 ለተገናኙ ኦፍላይን ቤቶች:\n`;
      links.forEach((link, i) => {
        const shopName = link.shops ? link.shops.name : link.shop_id;
        const status = link.shops ? link.shops.status : 'N/A';
        msg += `${i + 1}. Shop ID: ${link.shop_id}\n   Username: ${link.username}\n   ቤት: ${shopName}\n   ሁኔታ: ${status}\n\n`;
      });
    } else {
      msg += `🏪 ኦፍላይን ቤት: አልተገናኙም\n`;
    }

    await ctx.reply(msg, mainKeyboard);
  } catch (err) {
    console.error('[የእኔ ባላንስ]', err);
    ctx.reply('❌ ስህተት ተከስቷል። እባክዎ እንደገና ይሞክሩ።').catch(() => {});
  }
});

// ─── 📲 ኦፍላይን አፕ አውርድ ──────────────────────────────────────────────────────
bot.hears('📲 ኦፍላይን አፕ አውርድ', async (ctx) => {
  try {
    const amharicInstallCaption =
      `📲 ATD Bingo ኦፍላይን አፕሊኬሽን\n\n` +
      `1️⃣ የ.zip ፋይሉን ወደ ኮምፒውተርዎ አውርዱ\n` +
      `2️⃣ ፋይሉን Unzip/Extract ያድርጉ\n` +
      `3️⃣ ATD-Bingo.exe ወይም index.html ይክፈቱ\n\n` +
      `⚠️ አስፈላጊ ማሳሰቢያ: ባላንሱን ከ ATD ሰርቨር ወደ አፕሊኬሽንዎ ለማስገባት:\n` +
      `• ኮምፒውተርዎን/መሳሪያዎን ከዋይፋይ (ኢንተርኔት) ጋር ያገናኙ\n` +
      `• ATD Bingo አፕ ውስጥ ገብተው "Sync Balance" ይንኩ`;

    const { data: setting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'offline_app_file_id')
      .single();

    if (setting && setting.value) {
      await ctx.replyWithDocument(setting.value, { caption: amharicInstallCaption });
    } else if (process.env.OFFLINE_APP_DOWNLOAD_URL) {
      await ctx.reply(
        amharicInstallCaption,
        Markup.inlineKeyboard([[Markup.button.url('📥 አፕ አውርድ', process.env.OFFLINE_APP_DOWNLOAD_URL)]])
      );
    } else {
      await ctx.reply('አፕሊኬሽኑ እስካሁን አልተቀመጠም። ለእርዳታ 📞 ያነጋግሩ።', mainKeyboard);
    }
  } catch (err) {
    console.error('[ኦፍላይን አፕ አውርድ]', err);
    ctx.reply('❌ ስህተት ተከስቷል። እባክዎ እንደገና ይሞክሩ።').catch(() => {});
  }
});

// ─── 📝 አዲስ ቤት መመዝገብ ──────────────────────────────────────────────────────
bot.hears('📝 አዲስ ቤት መመዝገብ', async (ctx) => {
  try {
    const userId = String(ctx.from.id);
    setState(userId, 'reg_enter_name', {});
    await ctx.reply('🏪 አዲስ ቤት/ማዕከል ለመመዝገብ:\n\nቤቱ/ማዕከሉን ስም ያስገቡ:');
  } catch (err) {
    console.error('[አዲስ ቤት መመዝገብ]', err);
    ctx.reply('❌ ስህተት ተከስቷል። እባክዎ እንደገና ይሞክሩ።').catch(() => {});
  }
});

// ─── 📜 የግብይት ታሪክ ──────────────────────────────────────────────────────────
bot.hears('📜 የግብይት ታሪክ', async (ctx) => {
  try {
    const telegramId = String(ctx.from.id);
    const { data: txns } = await supabase
      .from('transactions')
      .select('*')
      .eq('telegram_id', telegramId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (!txns || txns.length === 0) {
      return ctx.reply('📜 እስካሁን ምንም ግብይት የለዎትም።', mainKeyboard);
    }

    const typeMap = {
      OFFLINE_DEPOSIT: '🏪 ኦፍላይን ክፍያ',
      ONLINE_DEPOSIT: '🎮 ኦንላይን ክፍያ',
      REGISTRATION: '📝 ምዝገባ',
      GAME_BET: '🎲 ጨዋታ ወጪ',
      GAME_WIN: '🏆 ጨዋታ ትርፍ'
    };
    const statusMap = {
      PENDING_OFFLINE: '⏳ በጥበቃ ላይ',
      PENDING_ONLINE: '⏳ በጥበቃ ላይ',
      APPROVED: '✅ ተፈቅዷል',
      REJECTED: '❌ ውድቅ ተደርጓል'
    };

    let msg = '📜 የግብይት ታሪክ (የቅርብ ጊዜ 10):\n\n';
    txns.forEach((t, i) => {
      const type = typeMap[t.type] || t.type;
      const status = statusMap[t.status] || t.status;
      const date = new Date(t.created_at).toLocaleDateString('am-ET');
      msg += `${i + 1}. ${type}\n   💰 መጠን: ${t.amount || '-'} ብር\n   ሁኔታ: ${status}\n   📅 ቀን: ${date}\n\n`;
    });

    await ctx.reply(msg, mainKeyboard);
  } catch (err) {
    console.error('[የግብይት ታሪክ]', err);
    ctx.reply('❌ ስህተት ተከስቷል። እባክዎ እንደገና ይሞክሩ።').catch(() => {});
  }
});

// ─── 📞 እርዳታ ────────────────────────────────────────────────────────────────
bot.hears('📞 እርዳታ', async (ctx) => {
  try {
    const supportMsg =
      `📞 እርዳታ\n\n` +
      `ለማንኛውም ጥያቄ ወይም ችግር:\n` +
      `📞 ስልክ: ${process.env.SUPPORT_PHONE || 'N/A'}\n` +
      `💬 Telegram: @${process.env.SUPPORT_TELEGRAM_USERNAME || 'support'}\n\n` +
      `ዓይነተኛ ጥያቄዎች:`;

    await ctx.reply(
      supportMsg,
      Markup.inlineKeyboard([
        [Markup.button.callback('💳 ባላንስ Sync አልሆነልኝም?', 'faq_sync')],
        [Markup.button.callback('📲 ኦፍላይን አፕ አልከፈተልኝም?', 'faq_app')],
        [Markup.button.callback('🔗 Shop ID እና Username እንዴት ላገናኝ?', 'faq_link')],
        [Markup.button.callback('🎮 ኦንላይን ጌም እንዴት ልጫወት?', 'faq_online')],
        [Markup.button.url('📞 ወደ ደጋፊ ቡድን ይሂዱ', `https://t.me/${process.env.SUPPORT_TELEGRAM_USERNAME || 'support'}`)]
      ])
    );
  } catch (err) {
    console.error('[እርዳታ]', err);
    ctx.reply('❌ ስህተት ተከስቷል። እባክዎ እንደገና ይሞክሩ።').catch(() => {});
  }
});

// ─── Callback: deposit_offline_start ─────────────────────────────────────────
bot.action('deposit_offline_start', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const userId = String(ctx.from.id);

    const { data: links } = await supabase
      .from('telegram_links')
      .select('shop_id, username')
      .eq('telegram_id', userId)
      .limit(1)
      .single();

    if (links) {
      setState(userId, 'offline_deposit_confirm_shop', { shop_id: links.shop_id, username: links.username });
      await ctx.reply(
        `🏪 የተቀመጠ ቤት:\nShop ID: ${links.shop_id}\nUsername: ${links.username}\n\nምን ማድረግ ይፈልጋሉ?`,
        Markup.inlineKeyboard([
          [Markup.button.callback('✅ በዚህ ቀጥል', 'offline_use_saved')],
          [Markup.button.callback('🔄 ሌላ ቤት አስገባ', 'offline_enter_new')]
        ])
      );
    } else {
      setState(userId, 'offline_deposit_enter_shop_id', {});
      await ctx.reply('SHOP-XXXXXXX ቅጹን ያስገቡ (ለምሳሌ: SHOP-BF24C9E7):');
    }
  } catch (err) {
    console.error('[deposit_offline_start]', err);
    ctx.reply('❌ ስህተት ተከስቷል። እባክዎ እንደገና ይሞክሩ።').catch(() => {});
  }
});

// ─── Callback: deposit_online_start ──────────────────────────────────────────
bot.action('deposit_online_start', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const userId = String(ctx.from.id);
    setState(userId, 'online_deposit_enter_amount', {});
    try {
      await ctx.editMessageText('🎮 ለኦንላይን ጨዋታ ባላንስ ለማስገባት:\n\nያስገባ የሚፈልጉትን የብር መጠን ያስገቡ (ለምሳሌ: 500):');
    } catch {
      await ctx.reply('🎮 ለኦንላይን ጨዋታ ባላንስ ለማስገባት:\n\nያስገባ የሚፈልጉትን የብር መጠን ያስገቡ (ለምሳሌ: 500):');
    }
  } catch (err) {
    console.error('[deposit_online_start]', err);
    ctx.reply('❌ ስህተት ተከስቷል። እባክዎ እንደገና ይሞክሩ።').catch(() => {});
  }
});

// ─── Callback: offline_use_saved ─────────────────────────────────────────────
bot.action('offline_use_saved', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const userId = String(ctx.from.id);
    const state = getState(userId);
    const data = state ? state.data : {};
    setState(userId, 'offline_deposit_enter_amount', data);
    await ctx.reply(
      `ወደ ኦፍላይን አፕሊኬሽንዎ Sync ማድረግ የሚፈልጉትን የብር መጠን ያስገቡ (ለምሳሌ፡ 20000):` +
      getPaymentAccountsText()
    );
  } catch (err) {
    console.error('[offline_use_saved]', err);
    ctx.reply('❌ ስህተት ተከስቷል። እባክዎ እንደገና ይሞክሩ።').catch(() => {});
  }
});

// ─── Callback: offline_enter_new ─────────────────────────────────────────────
bot.action('offline_enter_new', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const userId = String(ctx.from.id);
    setState(userId, 'offline_deposit_enter_shop_id', {});
    await ctx.reply('SHOP-XXXXXXX ቅጹን ያስገቡ:');
  } catch (err) {
    console.error('[offline_enter_new]', err);
    ctx.reply('❌ ስህተት ተከስቷል። እባክዎ እንደገና ይሞክሩ።').catch(() => {});
  }
});

// ─── Callback: coming_soon ───────────────────────────────────────────────────
bot.action('coming_soon_bingo', async (ctx) => {
  await ctx.answerCbQuery('🚧 ኦንላይን ቢንጎ በቅርብ ቀን ይከፈታል!', { show_alert: true });
});
bot.action('coming_soon_keno', async (ctx) => {
  await ctx.answerCbQuery('🚧 ኬኖ በቅርብ ቀን ይከፈታል!', { show_alert: true });
});
bot.action('coming_soon_aviator', async (ctx) => {
  await ctx.answerCbQuery('🚧 አቪዬተር በቅርብ ቀን ይከፈታል!', { show_alert: true });
});

// ─── FAQ Callbacks ───────────────────────────────────────────────────────────
bot.action('faq_sync', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.reply(
      `💳 ባላንስ Sync አላደረገም?\n\n` +
      `ባላንሱን ወደ ኦፍላይን አፕሊኬሽንዎ ለማስገባት የሚከተሉትን ያድርጉ:\n\n` +
      `1️⃣ ⚠️ ኮምፒውተርዎን/መሳሪያዎን ከዋይፋይ (ኢንተርኔት) ጋር ያገናኙ — ይህ አስፈላጊ ነው!\n` +
      `2️⃣ ATD Bingo አፕ ውስጥ ይግቡ\n` +
      `3️⃣ "Sync Balance" ወይም "ባላንስ አስገባ" የሚለውን ቁልፍ ይንኩ\n` +
      `4️⃣ ስልክዎ/ኮምፒውተርዎ ኢንተርኔት ካለው ባላንሱ ወዲያው ይታያል\n\n` +
      `❓ አሁንም ካልሆነ: አስተዳዳሪው Transaction ID ሲፈቅዱ ትዕዛዙ ይሠራል።\n` +
      `📞 ለተጨማሪ እርዳታ: ${process.env.SUPPORT_PHONE || ''}`
    );
  } catch (err) {
    console.error('[faq_sync]', err);
    ctx.reply('❌ ስህተት ተከስቷል።').catch(() => {});
  }
});

bot.action('faq_app', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.reply(
      `📲 ኦፍላይን አፕ አልከፈተልኝም?\n\n` +
      `የሚከተሉትን ይሞክሩ:\n\n` +
      `1️⃣ ፋይሉ ሙሉ በሙሉ Download ሆኗል? — ወሰን ያለው ወይም ያልተጠናቀቀ ፋይል አይሠራም\n` +
      `2️⃣ .zip ፋይሉን Extract/Unzip አድርገዋል?\n` +
      `3️⃣ ATD-Bingo.exe ወይም index.html ን ሁለት ጊዜ ጠቅ አድርጉ\n` +
      `4️⃣ Windows: "Run anyway" ወይም "More info" → "Run anyway" ይምረጡ\n` +
      `5️⃣ Antivirus ፋይሉን ካቆመ ጊዜያዊ ያጥፉ\n\n` +
      `📞 ለተጨማሪ እርዳታ: ${process.env.SUPPORT_PHONE || ''}`
    );
  } catch (err) {
    console.error('[faq_app]', err);
    ctx.reply('❌ ስህተት ተከስቷል።').catch(() => {});
  }
});

bot.action('faq_link', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.reply(
      `🔗 Shop ID እና Username እንዴት ላገናኝ?\n\n` +
      `Shop ID እና Username ማገናኘት ማለት ባላንስ ሲሞሉ ቀጥታ ወደ ትክክለኛ ቤቱ እንዲሄድ ማድረግ ነው።\n\n` +
      `📋 ሂደቱ:\n` +
      `1️⃣ "💰 ባላንስ መሙላት" ይምረጡ\n` +
      `2️⃣ "🏪 ለኦፍላይን ቤት" ይምረጡ\n` +
      `3️⃣ SHOP-XXXXXXX ቅጽ ያስገቡ (ቤቱ ሲመዘገብ ያገኙት)\n` +
      `4️⃣ Username (ቤቱ ስርዓት ውስጥ ያለዎ ስም) ያስገቡ\n` +
      `5️⃣ ካረጋገጡ በኋላ ቀጥሎ ሁልጊዜ ይታሰባል\n\n` +
      `❓ Shop ID ያልያዙ ከሆነ "📝 አዲስ ቤት መመዝገብ" ይጠቀሙ።`
    );
  } catch (err) {
    console.error('[faq_link]', err);
    ctx.reply('❌ ስህተት ተከስቷል።').catch(() => {});
  }
});

bot.action('faq_online', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.reply(
      `🎮 ኦንላይን ጌም እንዴት ልጫወት?\n\n` +
      `1️⃣ "🎮 ኦንላይን ጨዋታዎች" ምናሌን ይምረጡ\n` +
      `2️⃣ ባላንስ ካለዎ ቀጥታ ጨዋታ ይጫወቱ\n` +
      `3️⃣ ባላንስ ከሌለዎ "💰 ለኦንላይን ባላንስ ሙላ" ይምረጡ\n` +
      `4️⃣ ብሩን ወደ ሚከፈሉ ቁጥሮች ይላኩ\n` +
      `5️⃣ SMS ወይም ፎቶ ደረሰኝ ያስገቡ\n` +
      `6️⃣ አስተዳዳሪው ሲፈቅዱ ባላንሱ ወዲያው ይታያል\n\n` +
      `💡 ፍጥነቱ: ፈቃድ ብዙ ጊዜ ውስጥ 1-30 ደቂቃ ይወስዳል።`
    );
  } catch (err) {
    console.error('[faq_online]', err);
    ctx.reply('❌ ስህተት ተከስቷል።').catch(() => {});
  }
});

// ─── Admin Callbacks: approve/reject offline ──────────────────────────────────
bot.action(/^approve_offline_(.+)$/, async (ctx) => {
  try {
    if (Number(ctx.from.id) !== Number(process.env.ADMIN_TELEGRAM_ID)) {
      return ctx.answerCbQuery('❌ ፈቃድ የለዎትም!', { show_alert: true });
    }
    const transactionId = ctx.match[1];
    await ctx.answerCbQuery('✅ ተፈቅዷል!');

    const { data: rpcResult, error: rpcError } = await supabase.rpc('approve_offline_deposit_and_sync', {
      p_transaction_id: parseInt(transactionId)
    });

    if (rpcError) {
      console.error('[approve_offline RPC]', rpcError);
      await bot.telegram.sendMessage(
        process.env.ADMIN_TELEGRAM_ID,
        `❌ RPC ስህተት (ID: ${transactionId}): ${rpcError.message}`
      );
      return;
    }

    // Fetch transaction details for sync
    const { data: txn } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', parseInt(transactionId))
      .single();

    if (txn) {
      // Retry loop up to 3 times
      let synced = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await axios.post(
            `${process.env.SYNC_API_URL}/api/transfers`,
            {
              shop_id: txn.shop_id,
              username: txn.username,
              amount: txn.amount,
              ref_id: txn.id,
              status: 'READY_TO_SYNC'
            },
            {
              headers: { Authorization: `Bearer ${process.env.SYNC_API_SECRET}` },
              timeout: 10000
            }
          );
          synced = true;
          break;
        } catch (syncErr) {
          console.error(`[Sync attempt ${attempt}]`, syncErr.message);
          if (attempt === 3) {
            await bot.telegram.sendMessage(
              process.env.ADMIN_TELEGRAM_ID,
              `⚠️ Sync API ጥሪ ሦስቴ ሞክሬ አልተሳካም!\nTransaction ID: ${transactionId}\nShop: ${txn.shop_id}\nError: ${syncErr.message}`
            );
          }
        }
      }

      // Notify user
      try {
        await bot.telegram.sendMessage(
          txn.telegram_id,
          `✅ ክፍያዎ ተፈቅዷል!\n\n` +
          `💰 ${txn.amount} ብር ወደ Shop ${txn.shop_id} ለ ${txn.username} ተዘጋጅቷል።\n\n` +
          `⚠️ ባላንሱን ለማስገባት:\n• ኮምፒውተርዎን/መሳሪያዎን ከዋይፋይ (ኢንተርኔት) ጋር ያገናኙ\n• ATD Bingo አፕ ውስጥ "Sync Balance" ይንኩ`
        );
      } catch (notifyErr) {
        console.error('[notify user approve_offline]', notifyErr.message);
      }
    }

    // Update admin message
    try {
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    } catch {}
  } catch (err) {
    console.error('[approve_offline]', err);
    ctx.reply('❌ ስህተት ተከስቷል።').catch(() => {});
  }
});

bot.action(/^reject_offline_(.+)$/, async (ctx) => {
  try {
    if (Number(ctx.from.id) !== Number(process.env.ADMIN_TELEGRAM_ID)) {
      return ctx.answerCbQuery('❌ ፈቃድ የለዎትም!', { show_alert: true });
    }
    const transactionId = ctx.match[1];
    await ctx.answerCbQuery('❌ ውድቅ ተደርጓል');

    const { data: txn } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', parseInt(transactionId))
      .single();

    await supabase
      .from('transactions')
      .update({ status: 'REJECTED' })
      .eq('id', parseInt(transactionId));

    if (txn) {
      try {
        await bot.telegram.sendMessage(
          txn.telegram_id,
          `❌ ክፍያዎ ውድቅ ተደርጓል።\n\n` +
          `💰 ${txn.amount} ብር ለ Shop ${txn.shop_id} (${txn.username}) ያቀረቡት ጥያቄ አስተዳዳሪው ውድቅ አድርጎታል።\n\n` +
          `📞 ለበለጠ መረጃ: ${process.env.SUPPORT_PHONE || ''}`
        );
      } catch (notifyErr) {
        console.error('[notify user reject_offline]', notifyErr.message);
      }
    }

    try {
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    } catch {}
  } catch (err) {
    console.error('[reject_offline]', err);
    ctx.reply('❌ ስህተት ተከስቷል።').catch(() => {});
  }
});

// ─── Admin Callbacks: approve/reject online ───────────────────────────────────
bot.action(/^approve_online_(.+)$/, async (ctx) => {
  try {
    if (Number(ctx.from.id) !== Number(process.env.ADMIN_TELEGRAM_ID)) {
      return ctx.answerCbQuery('❌ ፈቃድ የለዎትም!', { show_alert: true });
    }
    const transactionId = ctx.match[1];
    await ctx.answerCbQuery('✅ ተፈቅዷል!');

    const { data: rpcResult, error: rpcError } = await supabase.rpc('approve_online_deposit', {
      p_transaction_id: parseInt(transactionId)
    });

    if (rpcError) {
      console.error('[approve_online RPC]', rpcError);
      await bot.telegram.sendMessage(
        process.env.ADMIN_TELEGRAM_ID,
        `❌ Online deposit RPC ስህተት (ID: ${transactionId}): ${rpcError.message}`
      );
      return;
    }

    const { data: txn } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', parseInt(transactionId))
      .single();

    if (txn) {
      const { data: wallet } = await supabase
        .from('online_wallets')
        .select('balance')
        .eq('telegram_id', txn.telegram_id)
        .single();

      try {
        await bot.telegram.sendMessage(
          txn.telegram_id,
          `✅ ኦንላይን ክፍያዎ ተፈቅዷል!\n\n` +
          `💰 ${txn.amount} ብር ወደ ዋሌትዎ ገብቷል።\n` +
          `🎮 አሁን ያለዎ ባላንስ: ${wallet ? wallet.balance : 'N/A'} ብር`
        );
      } catch (notifyErr) {
        console.error('[notify user approve_online]', notifyErr.message);
      }
    }

    try {
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    } catch {}
  } catch (err) {
    console.error('[approve_online]', err);
    ctx.reply('❌ ስህተት ተከስቷል።').catch(() => {});
  }
});

bot.action(/^reject_online_(.+)$/, async (ctx) => {
  try {
    if (Number(ctx.from.id) !== Number(process.env.ADMIN_TELEGRAM_ID)) {
      return ctx.answerCbQuery('❌ ፈቃድ የለዎትም!', { show_alert: true });
    }
    const transactionId = ctx.match[1];
    await ctx.answerCbQuery('❌ ውድቅ ተደርጓል');

    const { data: txn } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', parseInt(transactionId))
      .single();

    await supabase
      .from('transactions')
      .update({ status: 'REJECTED' })
      .eq('id', parseInt(transactionId));

    if (txn) {
      try {
        await bot.telegram.sendMessage(
          txn.telegram_id,
          `❌ ኦንላይን ክፍያዎ ውድቅ ተደርጓል።\n\n` +
          `💰 ${txn.amount} ብር ጥያቄ ውድቅ ሆኗል።\n\n` +
          `📞 ለበለጠ መረጃ: ${process.env.SUPPORT_PHONE || ''}`
        );
      } catch (notifyErr) {
        console.error('[notify user reject_online]', notifyErr.message);
      }
    }

    try {
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    } catch {}
  } catch (err) {
    console.error('[reject_online]', err);
    ctx.reply('❌ ስህተት ተከስቷል።').catch(() => {});
  }
});

// ─── Admin Callbacks: approve_reg ────────────────────────────────────────────
bot.action(/^approve_reg_(.+)$/, async (ctx) => {
  try {
    if (Number(ctx.from.id) !== Number(process.env.ADMIN_TELEGRAM_ID)) {
      return ctx.answerCbQuery('❌ ፈቃድ የለዎትም!', { show_alert: true });
    }
    const userId = ctx.match[1];
    await ctx.answerCbQuery('✅ ተፈቅዷል!');

    // Look up most recent pending registration for this user
    const { data: regTxn } = await supabase
      .from('transactions')
      .select('*')
      .eq('telegram_id', userId)
      .eq('type', 'REGISTRATION')
      .eq('status', 'PENDING_OFFLINE')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!regTxn) {
      await bot.telegram.sendMessage(
        process.env.ADMIN_TELEGRAM_ID,
        `❌ User ${userId} ምዝገባ ጥያቄ አልተገኘም።`
      );
      return;
    }

    let notes = {};
    try {
      notes = typeof regTxn.notes === 'string' ? JSON.parse(regTxn.notes) : regTxn.notes;
    } catch {}

    const { center_name, username, phone, region, mac_address } = notes;

    // Generate unique shop ID
    const shopId = 'SHOP-' + Math.random().toString(16).slice(2, 10).toUpperCase();

    // Insert into shops
    const { data: shop, error: shopError } = await supabase
      .from('shops')
      .insert({
        shop_id: shopId,
        name: center_name,
        username,
        phone,
        region,
        mac_address,
        status: 'ACTIVE',
        owner_telegram_id: userId
      })
      .select()
      .single();

    if (shopError) {
      console.error('[approve_reg insert shop]', shopError);
      await bot.telegram.sendMessage(
        process.env.ADMIN_TELEGRAM_ID,
        `❌ Shop ሲፈጠር ስህተት: ${shopError.message}`
      );
      return;
    }

    // Insert into telegram_links
    const { error: linkError } = await supabase
      .from('telegram_links')
      .insert({ telegram_id: userId, shop_id: shopId, username });

    if (linkError) {
      console.error('[approve_reg insert link]', linkError);
    }

    // Update registration transaction
    await supabase
      .from('transactions')
      .update({ status: 'APPROVED' })
      .eq('id', regTxn.id);

    // Notify user
    try {
      await bot.telegram.sendMessage(
        userId,
        `✅ ምዝገባዎ ተፈቅዷል!\n\n` +
        `🏪 ማዕከልዎ ስም: ${center_name}\n` +
        `🔑 Shop ID: ${shopId}\n` +
        `👨‍💼 Username: ${username}\n\n` +
        `💡 ባላንስ ለመሙላት "💰 ባላንስ መሙላት" ምናሌን ይጠቀሙ።\n` +
        `📲 አፕ ለማውረድ "📲 ኦፍላይን አፕ አውርድ" ምናሌን ይጠቀሙ።`
      );
    } catch (notifyErr) {
      console.error('[notify user approve_reg]', notifyErr.message);
    }

    try {
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    } catch {}
  } catch (err) {
    console.error('[approve_reg]', err);
    ctx.reply('❌ ስህተት ተከስቷል።').catch(() => {});
  }
});

// ─── Message Handler ──────────────────────────────────────────────────────────
bot.on('message', async (ctx) => {
  try {
    const userId = String(ctx.from.id);
    const state = getState(userId);

    if (!state) return; // No active state flow

    const { step, data } = state;
    const text = ctx.message.text || '';
    const isPhoto = !!(ctx.message.photo && ctx.message.photo.length > 0);

    // ── OFFLINE DEPOSIT FLOW ──────────────────────────────────────────────────

    if (step === 'offline_deposit_enter_shop_id') {
      if (!/^SHOP-[A-Z0-9]{6,10}$/i.test(text)) {
        return ctx.reply('❌ ትክክለኛ SHOP-ID ቅጽ አይደለም። ለምሳሌ: SHOP-BF24C9E7\n\nዳግም ያስገቡ:');
      }
      setState(userId, 'offline_deposit_enter_username', { shop_id: text.toUpperCase() });
      return ctx.reply('Username ያስገቡ (ለምሳሌ: adis):');
    }

    if (step === 'offline_deposit_enter_username') {
      const { data: shop } = await supabase
        .from('shops')
        .select('shop_id, username, status')
        .eq('shop_id', data.shop_id)
        .eq('username', text.trim())
        .eq('status', 'ACTIVE')
        .single();

      if (!shop) {
        return ctx.reply(`❌ "${data.shop_id}" ቤት ውስጥ "${text.trim()}" Username አልተገኘም ወይም ቤቱ ንቁ አይደለም።\n\nዳግም ያስገቡ:`);
      }

      setState(userId, 'offline_deposit_enter_amount', { shop_id: data.shop_id, username: text.trim() });
      return ctx.reply('ወደ ኦፍላይን አፕሊኬሽንዎ Sync ማድረግ የሚፈልጉትን የብር መጠን ያስገቡ (ለምሳሌ፡ 20000):' + getPaymentAccountsText());
    }

    if (step === 'offline_deposit_enter_amount') {
      const amount = parseInt(text);
      if (!amount || amount <= 0 || isNaN(amount)) {
        return ctx.reply('❌ ትክክለኛ የብር መጠን ያስገቡ (ቁጥር ብቻ፣ ለምሳሌ: 500):\n\nዳግም ያስገቡ:');
      }
      setState(userId, 'offline_deposit_await_proof', { ...data, amount });
      return ctx.reply(
        `💰 ${amount} ብር ለ ${data.shop_id} (${data.username})\n\n` +
        getPaymentAccountsText() +
        `\n\nSMS ወይም ደረሰኝ ፎቶ ያስገቡ:`
      );
    }

    if (step === 'offline_deposit_await_proof') {
      let transactionRef = null;
      let proofPhotoFileId = null;

      if (isPhoto) {
        proofPhotoFileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        // Try to get ref from caption
        if (ctx.message.caption) {
          transactionRef = parseTransactionRef(ctx.message.caption);
        }
      } else if (text) {
        transactionRef = parseTransactionRef(text);
      }

      // Check duplicate
      if (transactionRef) {
        const { data: dup } = await supabase
          .from('transactions')
          .select('id')
          .eq('transaction_id', transactionRef)
          .not('transaction_id', 'is', null)
          .single();

        if (dup) {
          return ctx.reply('❌ ይህ Transaction ID ቀደም ሲል ጥቅም ላይ ውሏል!');
        }
      }

      const now = new Date();
      const { data: inserted, error: insertError } = await supabase
        .from('transactions')
        .insert({
          telegram_id: userId,
          type: 'OFFLINE_DEPOSIT',
          status: 'PENDING_OFFLINE',
          shop_id: data.shop_id,
          username: data.username,
          amount: data.amount,
          transaction_id: transactionRef,
          proof_photo_file_id: proofPhotoFileId,
          created_at: now.toISOString()
        })
        .select()
        .single();

      if (insertError) {
        console.error('[offline_deposit_await_proof insert]', insertError);
        return ctx.reply('❌ ስህተት ተከስቷል። እባክዎ እንደገና ይሞክሩ።');
      }

      const adminMsg =
        `🏪 አዲስ የኦፍላይን ቤት ክፍያ ጥያቄ\n\n` +
        `👤 Telegram ID: ${userId}\n` +
        `🏪 Shop ID: ${data.shop_id}\n` +
        `👨‍💼 Username: ${data.username}\n` +
        `💰 የተጠየቀ መጠን: ${data.amount} ብር\n` +
        `🔖 Transaction ID: ${transactionRef || 'ፎቶ'}\n` +
        `📅 ቀን: ${now.toLocaleDateString('am-ET')}`;

      const adminButtons = Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ አጽድቅና Sync አድርግ', `approve_offline_${inserted.id}`),
          Markup.button.callback('❌ ውድቅ አድርግ', `reject_offline_${inserted.id}`)
        ]
      ]);

      await bot.telegram.sendMessage(process.env.ADMIN_TELEGRAM_ID, adminMsg, adminButtons);

      if (proofPhotoFileId) {
        await bot.telegram.sendPhoto(process.env.ADMIN_TELEGRAM_ID, proofPhotoFileId, {
          caption: `📸 ደረሰኝ ፎቶ — Transaction ${inserted.id}`
        });
      }

      await ctx.reply('✅ ጥያቄዎ ተልኳል! አስተዳዳሪው ሲፈቅዱ ያሳውቅዎታል።', mainKeyboard);
      clearState(userId);
      return;
    }

    // ── ONLINE DEPOSIT FLOW ───────────────────────────────────────────────────

    if (step === 'online_deposit_enter_amount') {
      const amount = parseInt(text);
      if (!amount || amount <= 0 || isNaN(amount)) {
        return ctx.reply('❌ ትክክለኛ የብር መጠን ያስገቡ (ቁጥር ብቻ፣ ለምሳሌ: 500):\n\nዳግም ያስገቡ:');
      }
      setState(userId, 'online_deposit_await_proof', { amount });
      return ctx.reply(
        `💰 ለኦንላይን ዋሌት ${amount} ብር\n\n` +
        getPaymentAccountsText() +
        `\n\nSMS ወይም ደረሰኝ ፎቶ ያስገቡ:`
      );
    }

    if (step === 'online_deposit_await_proof') {
      let transactionRef = null;
      let proofPhotoFileId = null;

      if (isPhoto) {
        proofPhotoFileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        if (ctx.message.caption) {
          transactionRef = parseTransactionRef(ctx.message.caption);
        }
      } else if (text) {
        transactionRef = parseTransactionRef(text);
      }

      // Check duplicate
      if (transactionRef) {
        const { data: dup } = await supabase
          .from('transactions')
          .select('id')
          .eq('transaction_id', transactionRef)
          .not('transaction_id', 'is', null)
          .single();

        if (dup) {
          return ctx.reply('❌ ይህ Transaction ID ቀደም ሲል ጥቅም ላይ ውሏል!');
        }
      }

      const now = new Date();
      const { data: inserted, error: insertError } = await supabase
        .from('transactions')
        .insert({
          telegram_id: userId,
          type: 'ONLINE_DEPOSIT',
          status: 'PENDING_ONLINE',
          amount: data.amount,
          transaction_id: transactionRef,
          proof_photo_file_id: proofPhotoFileId,
          created_at: now.toISOString()
        })
        .select()
        .single();

      if (insertError) {
        console.error('[online_deposit_await_proof insert]', insertError);
        return ctx.reply('❌ ስህተት ተከስቷል። እባክዎ እንደገና ይሞክሩ።');
      }

      const adminMsg =
        `🎮 አዲስ ኦንላይን ክፍያ ጥያቄ\n\n` +
        `👤 Telegram ID: ${userId}\n` +
        `💰 የተጠየቀ መጠን: ${data.amount} ብር\n` +
        `🔖 Transaction ID: ${transactionRef || 'ፎቶ'}\n` +
        `📅 ቀን: ${now.toLocaleDateString('am-ET')}`;

      const adminButtons = Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ አጽድቅ', `approve_online_${inserted.id}`),
          Markup.button.callback('❌ ውድቅ', `reject_online_${inserted.id}`)
        ]
      ]);

      await bot.telegram.sendMessage(process.env.ADMIN_TELEGRAM_ID, adminMsg, adminButtons);

      if (proofPhotoFileId) {
        await bot.telegram.sendPhoto(process.env.ADMIN_TELEGRAM_ID, proofPhotoFileId, {
          caption: `📸 ደረሰኝ ፎቶ — Online Transaction ${inserted.id}`
        });
      }

      await ctx.reply('✅ ጥያቄዎ ተልኳል! አስተዳዳሪው ሲፈቅዱ ያሳውቅዎታል።', mainKeyboard);
      clearState(userId);
      return;
    }

    // ── REGISTRATION FLOW ─────────────────────────────────────────────────────

    if (step === 'reg_enter_name') {
      if (!text.trim()) {
        return ctx.reply('❌ ስም ያስገቡ:');
      }
      setState(userId, 'reg_enter_username', { center_name: text.trim() });
      return ctx.reply('Username ያስገቡ (ለምሳሌ: adis):');
    }

    if (step === 'reg_enter_username') {
      if (!text.trim()) {
        return ctx.reply('❌ Username ያስገቡ:');
      }
      setState(userId, 'reg_enter_phone', { ...data, username: text.trim() });
      return ctx.reply('ስልክ ቁጥር ያስገቡ (09...):');
    }

    if (step === 'reg_enter_phone') {
      if (!text.trim()) {
        return ctx.reply('❌ ስልክ ቁጥር ያስገቡ:');
      }
      setState(userId, 'reg_enter_region', { ...data, phone: text.trim() });
      return ctx.reply('ክልል/አድራሻ ያስገቡ:');
    }

    if (step === 'reg_enter_region') {
      if (!text.trim()) {
        return ctx.reply('❌ ክልል/አድራሻ ያስገቡ:');
      }
      setState(userId, 'reg_enter_mac', { ...data, region: text.trim() });
      return ctx.reply('ኮምፒውተር MAC Address ያስገቡ (ለምሳሌ: AA:BB:CC:DD:EE:FF):');
    }

    if (step === 'reg_enter_mac') {
      if (!text.trim()) {
        return ctx.reply('❌ MAC Address ያስገቡ:');
      }
      const mac_address = text.trim();
      const regData = { ...data, mac_address };

      const now = new Date();
      const { data: inserted, error: insertError } = await supabase
        .from('transactions')
        .insert({
          telegram_id: userId,
          type: 'REGISTRATION',
          status: 'PENDING_OFFLINE',
          notes: JSON.stringify(regData),
          created_at: now.toISOString()
        })
        .select()
        .single();

      if (insertError) {
        console.error('[reg_enter_mac insert]', insertError);
        return ctx.reply('❌ ስህተት ተከስቷል። እባክዎ እንደገና ይሞክሩ።');
      }

      const adminMsg =
        `📝 አዲስ ቤት ምዝገባ ጥያቄ\n\n` +
        `🏪 ማዕከል ስም: ${regData.center_name}\n` +
        `👨‍💼 Username: ${regData.username}\n` +
        `📞 ስልክ: ${regData.phone}\n` +
        `📍 ክልል/አድራሻ: ${regData.region}\n` +
        `💻 MAC Address: ${regData.mac_address}\n` +
        `👤 Telegram ID: ${userId}`;

      const adminButtons = Markup.inlineKeyboard([
        [Markup.button.callback('✅ አጽድቅና SHOP-ID ስጥ', `approve_reg_${userId}`)]
      ]);

      await bot.telegram.sendMessage(process.env.ADMIN_TELEGRAM_ID, adminMsg, adminButtons);

      await ctx.reply('✅ ምዝገባዎ ተልኳል! አስተዳዳሪው ሲፈቅዱ Shop ID ያገኛሉ።', mainKeyboard);
      clearState(userId);
      return;
    }
  } catch (err) {
    console.error('[message handler]', err);
    ctx.reply('❌ ስህተት ተከስቷል። እባክዎ እንደገና ይሞክሩ።').catch(() => {});
  }
});

// ─── Express App ──────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'ATD Bingo Bot' });
});

// SMS Forwarder webhook
app.post('/webhook/sms-forwarder', async (req, res) => {
  try {
    const secret = req.headers['x-sms-webhook-secret'];
    if (secret !== process.env.SMS_WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { from, body, timestamp } = req.body;
    const msg = `📱 አዲስ SMS ደርሷል:\nFrom: ${from}\nDate: ${timestamp}\n\n${body}`;
    await bot.telegram.sendMessage(process.env.ADMIN_TELEGRAM_ID, msg);
    res.json({ success: true });
  } catch (err) {
    console.error('[SMS webhook]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Online user balance API
app.get('/api/online-user/:telegram_id', async (req, res) => {
  try {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${process.env.ONLINE_GAME_API_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { data, error } = await supabase
      .from('online_wallets')
      .select('*')
      .eq('telegram_id', req.params.telegram_id)
      .single();
    if (error || !data) return res.status(404).json({ error: 'User not found' });
    res.json({ telegram_id: data.telegram_id, balance: data.balance });
  } catch (err) {
    console.error('[GET /api/online-user]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bet result API
app.post('/api/online-user/bet-result', async (req, res) => {
  try {
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${process.env.ONLINE_GAME_API_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { telegram_id, delta, game, ref_id } = req.body;

    // Insert transaction record
    await supabase.from('transactions').insert({
      telegram_id,
      type: delta < 0 ? 'GAME_BET' : 'GAME_WIN',
      status: 'APPROVED',
      amount: Math.abs(delta),
      game,
      ref_id
    });

    // Get current balance
    const { data: wallet, error: walletError } = await supabase
      .from('online_wallets')
      .select('balance')
      .eq('telegram_id', telegram_id)
      .single();

    if (walletError || !wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    const newBalance = Number(wallet.balance) + Number(delta);
    if (newBalance < 0) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    await supabase
      .from('online_wallets')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('telegram_id', telegram_id);

    res.json({ success: true, new_balance: newBalance });
  } catch (err) {
    console.error('[POST /api/online-user/bet-result]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`Express server running on port ${process.env.PORT || 3000}`);
});

// ─── Keep-Alive Cron ──────────────────────────────────────────────────────────
cron.schedule('*/10 * * * *', async () => {
  if (!process.env.RENDER_EXTERNAL_URL) return;
  try {
    await axios.get(`${process.env.RENDER_EXTERNAL_URL}/health`);
    console.log('[KeepAlive] ✅ Ping successful');
  } catch (err) {
    console.error('[KeepAlive] ❌ Ping failed:', err.message);
  }
});

// ─── Bot Launch ───────────────────────────────────────────────────────────────
bot.launch().then(() => console.log('🤖 ATD Bingo Bot started!'));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
