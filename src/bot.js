const { Telegraf, Markup } = require('telegraf');
const config = require('./config');
const db = require('./supabase');
const { parsePaymentSms, pushToControlDashboard } = require('./payments');

const bot = new Telegraf(config.botToken);

bot.catch((err, ctx) => {
  console.error(`❌ [Bot Error] Update ${ctx.updateType} failed:`, err);
});

const userSessions = new Map();

function getSession(userId) {
  if (!userSessions.has(userId)) {
    userSessions.set(userId, { step: null, data: {} });
  }
  return userSessions.get(userId);
}

function clearSession(userId) {
  userSessions.set(userId, { step: null, data: {} });
}

function isAdmin(userId) {
  return config.adminIds.includes(Number(userId));
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function notifyAdmins(text, extra = {}) {
  for (const adminId of config.adminIds) {
    try {
      await bot.telegram.sendMessage(adminId, text, { parse_mode: 'Markdown', ...extra });
    } catch (err) {
      console.error(`Failed to notify admin ${adminId}:`, err.message);
    }
  }
}

// Helper: Save or update telegram_links safely without crashing on duplicate key
async function safeLinkTelegram(params) {
  try {
    await db.saveTelegramLink(params);
  } catch (err) {
    console.warn('⚠️ saveTelegramLink fallback update:', err.message);
    try {
      await db.supabase
        .from('telegram_links')
        .update({
          telegram_username: params.telegramUsername || null,
          phone: params.phone || null,
          shop_id: params.shopId,
          shop_username: params.shopUsername
        })
        .eq('telegram_id', params.telegramId);
    } catch (updateErr) {
      console.error('❌ Failed to update telegram_links:', updateErr.message);
    }
  }
}

// ============================================================================
// 100% AMHARIC PERSISTENT MAIN MENU KEYBOARD
// ============================================================================
const MAIN_MENU_KEYBOARD = Markup.keyboard([
  ['🎮 ኦንላይን ጨዋታዎች (Bingo / Keno / Aviator)'],
  ['💰 ባላንስ መሙላት', '💳 የእኔ ባላንስ'],
  ['📲 ኦፍላይን አፕ አውርድ', '📝 አዲስ ቤት መመዝገብ'],
  ['📜 የግብይት ታሪክ', '📞 እርዳታ']
]).resize();

// ============================================================================
// /START & SHOP LINKING
// ============================================================================
bot.start(async (ctx) => {
  clearSession(ctx.from.id);
  const fullName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ');

  try {
    await db.ensureOnlineWallet(ctx.from.id, ctx.from.username, fullName);
  } catch (err) {
    console.error('Error initializing online wallet:', err.message);
  }

  let link = null;
  try {
    link = await db.getTelegramLink(ctx.from.id);
  } catch (err) {
    console.error('Error fetching telegram link:', err.message);
  }

  let statusLine =
    `🔗 *የኦፍላይን ቤት ሁኔታ፦* ገና አልተገናኘም።\n` +
    `ነባር የATD Bingo ቤት ካለዎት ስልክ ቁጥርዎን ያጋሩ ወይም \`SHOP-XXXXXXX\` / \`Username\` ይላኩ፤ አዲስ ከሆኑ *📝 አዲስ ቤት መመዝገብ* ይጫኑ።`;

  if (link) {
    statusLine = `✅ *የተገናኘ ኦፍላይን ቤት፦* \`${link.shop_id}\` (Username: \`${link.shop_username}\`)`;
  }

  const welcomeMsg =
    `🎉 *እንኳን ወደ ATD Bingo በደህና መጡ!*\n\n` +
    `በዚህ ቦት ሁለት የተለያዩ አገልግሎቶችን በአንድ ላይ ያገኛሉ፦\n` +
    `1️⃣ *🏪 ኦፍላይን ቤት (Offline Shop Sync & App):* ለቢንጎ/ኬኖ ቤት ባለቤቶች ባላንስ መሙያ እና የPC/ሞባይል ኦፍላይን አፕ ማውረጃ።\n` +
    `2️⃣ *🎮 ኦንላይን ጨዋታዎች (Online Gaming Hub):* ቢንጎ (Bingo)፣ ኬኖ (Keno) እና አቪዬተር (Aviator) በቀጥታ በቴሌግራም መጫወቻ።\n\n` +
    `${statusLine}`;

  await ctx.reply(welcomeMsg, {
    parse_mode: 'Markdown',
    ...MAIN_MENU_KEYBOARD
  });

  if (!link) {
    await ctx.reply(
      '📱 ነባር ኦፍላይን ቤትዎን በፍጥነት ለማገናኘት ከታች ያለውን ቁልፍ ተጭነው ስልክ ቁጥርዎን ያጋሩ፦',
      Markup.keyboard([
        [Markup.button.contactRequest('📱 ስልክ ቁጥሬን በማጋራት አገናኝ')],
        ['🏠 ወደ ዋና ማውጫ ተመለስ']
      ]).resize()
    );
  }
});

bot.hears('🏠 ወደ ዋና ማውጫ ተመለስ', async (ctx) => {
  clearSession(ctx.from.id);
  await ctx.reply('🏠 ወደ ዋናው ማውጫ ተመልሰዋል።', MAIN_MENU_KEYBOARD);
});

bot.on('contact', async (ctx) => {
  const phone = ctx.message.contact.phone_number;
  const shop = await db.findShopByQuery(phone);

  if (!shop) {
    return ctx.reply(
      `❌ በዚህ ስልክ ቁጥር (${phone}) የተመዘገበ ACTIVE ቤት አልተገኘም።\n` +
        `እባክዎ \`SHOP-XXXXXXX\` ወይም \`Username\` ይጻፉ፣ ወይም *📝 አዲስ ቤት መመዝገብ* የሚለውን ይጫኑ።`,
      MAIN_MENU_KEYBOARD
    );
  }

  await safeLinkTelegram({
    telegramId: ctx.from.id,
    telegramUsername: ctx.from.username,
    phone,
    shopId: shop.shop_id,
    shopUsername: shop.username
  });

  await ctx.reply(
    `✅ *ቤትዎ በተሳካ ሁኔታ ተገናኝቷል!*\n\n` +
      `🏪 *Shop ID:* \`${shop.shop_id}\`\n` +
      `👤 *Username:* \`${shop.username}\`\n\n` +
      `አሁን *💰 ባላንስ መሙላት* በመጫን ባላንስ ማስገባት ይችላሉ።`,
    { parse_mode: 'Markdown', ...MAIN_MENU_KEYBOARD }
  );
});

// ============================================================================
// MODE B: ONLINE GAMING HUB (BINGO / KENO / AVIATOR)
// ============================================================================
bot.hears('🎮 ኦንላይን ጨዋታዎች (Bingo / Keno / Aviator)', async (ctx) => {
  clearSession(ctx.from.id);
  const userId = ctx.from.id;
  const wallet = await db.ensureOnlineWallet(userId, ctx.from.username);

  const buttons = [];

  if (config.onlineGames.bingoUrl && config.onlineGames.bingoUrl.startsWith('http')) {
    buttons.push([
      Markup.button.webApp('🎱 ኦንላይን ቢንጎ (Online Bingo)', `${config.onlineGames.bingoUrl}?tg_id=${userId}`)
    ]);
  } else {
    buttons.push([Markup.button.callback('🎱 ኦንላይን ቢንጎ (Online Bingo)', 'GAME_SOON_BINGO')]);
  }

  if (config.onlineGames.kenoUrl && config.onlineGames.kenoUrl.startsWith('http')) {
    buttons.push([
      Markup.button.webApp('🔢 ኬኖ (Online Keno)', `${config.onlineGames.kenoUrl}?tg_id=${userId}`)
    ]);
  } else {
    buttons.push([Markup.button.callback('🔢 ኬኖ (Online Keno)', 'GAME_SOON_KENO')]);
  }

  if (config.onlineGames.aviatorUrl && config.onlineGames.aviatorUrl.startsWith('http')) {
    buttons.push([
      Markup.button.webApp('✈️ አቪዬተር (Aviator)', `${config.onlineGames.aviatorUrl}?tg_id=${userId}`)
    ]);
  } else {
    buttons.push([Markup.button.callback('✈️ አቪዬተር (Aviator)', 'GAME_SOON_AVIATOR')]);
  }

  buttons.push([Markup.button.callback('💰 ለኦንላይን ባላንስ ሙላ', 'DEPOSIT_MODE_ONLINE')]);

  const msg =
    `🎮 *ATD Online Gaming Hub*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `💳 *የኦንላይን ዋሌት ባላንስዎ፦* *${Number(wallet.balance).toFixed(2)} ETB*\n\n` +
    `⚠️ *ማሳሰቢያ፦* ይህ ባላንስ ለኦንላይን ጨዋታዎች ብቻ የሚያገለግል ሲሆን ከኦፍላይን ሱቅ ባላንስ ጋር አይቀላቀልም።\n\n` +
    `👇 መጫወት የሚፈልጉትን ጨዋታ ይምረጡ፦`;

  await ctx.reply(msg, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });
});

bot.action('GAME_SOON_BINGO', (ctx) =>
  ctx.answerCbQuery('🚧 ኦንላይን ቢንጎ በቅርብ ቀን ይከፈታል!', { show_alert: true })
);
bot.action('GAME_SOON_KENO', (ctx) =>
  ctx.answerCbQuery('🚧 ኬኖ በቅርብ ቀን ይከፈታል!', { show_alert: true })
);
bot.action('GAME_SOON_AVIATOR', (ctx) =>
  ctx.answerCbQuery('🚧 አቪዬተር በቅርብ ቀን ይከፈታል!', { show_alert: true })
);

// ============================================================================
// DEPOSIT FLOW (MODE A: OFFLINE SHOP SYNC & MODE B: ONLINE GAME WALLET)
// ============================================================================
bot.hears('💰 ባላንስ መሙላት', async (ctx) => {
  clearSession(ctx.from.id);

  await ctx.reply(
    `💰 *ባላንስ መሙላት (Deposit)*\n\n` +
      `ባላንስ መሙላት የሚፈልጉትን አገልግሎት ይምረጡ፦`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🏪 ለኦፍላይን ቤት (Offline Shop Sync)', 'DEPOSIT_MODE_OFFLINE')],
        [Markup.button.callback('🎮 ለኦንላይን ጨዋታ (Online Game Wallet)', 'DEPOSIT_MODE_ONLINE')]
      ])
    }
  );
});

bot.action('DEPOSIT_MODE_OFFLINE', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const link = await db.getTelegramLink(userId);

  if (link) {
    const activeShop = await db.verifyActiveShop(link.shop_id, link.shop_username);
    if (activeShop) {
      const session = getSession(userId);
      session.step = 'OFFLINE_CONFIRM_SHOP';
      session.data = {
        mode: 'OFFLINE_SHOP',
        shopId: activeShop.shop_id,
        shopUsername: activeShop.username
      };

      return ctx.reply(
        `🏪 *የተመዘገበ ኦፍላይን ቤትዎ ተገኝቷል፦*\n\n` +
          `🆔 *Shop ID:* \`${activeShop.shop_id}\`\n` +
          `👤 *Username:* \`${activeShop.username}\`\n\n` +
          `በዚህ መለያ መቀጠል ይፈልጋሉ?`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('✅ በዚህ ቀጥል', 'OFFLINE_USE_SAVED_SHOP')],
            [Markup.button.callback('🔄 ሌላ Shop ID አስገባ', 'OFFLINE_ENTER_NEW_SHOP')]
          ])
        }
      );
    }
  }

  const session = getSession(userId);
  session.step = 'OFFLINE_AWAIT_SHOP_PAIR';
  session.data = { mode: 'OFFLINE_SHOP' };

  await ctx.reply(
    `🏪 *ደረጃ 1/4 — የኦፍላይን ቤት መለያ ያስገቡ*\n\n` +
      `እባክዎ የቤትዎን *Shop ID* እና *Username* አንድ ላይ ያስገቡ (ለምሳሌ፦ \`SHOP-BF24C9E7 adis\`) ወይም ስልክ ቁጥርዎን ይጻፉ፦`,
    { parse_mode: 'Markdown' }
  );
});

bot.action('OFFLINE_USE_SAVED_SHOP', async (ctx) => {
  await ctx.answerCbQuery();
  const session = getSession(ctx.from.id);
  if (!session.data.shopId) {
    return ctx.reply('⚠️ እባክዎ ከ *💰 ባላንስ መሙላት* እንደገና ይጀምሩ።');
  }

  session.step = 'DEPOSIT_AWAIT_AMOUNT';
  await ctx.reply(
    `💵 *ደረጃ 2/4 — የብር መጠን ያስገቡ*\n\n` +
      `ወደ ኦፍላይን አፕሊኬሽንዎ Sync ማድረግ የሚፈልጉትን የብር መጠን ያስገቡ (ለምሳሌ፡ 20000)፦`,
    { parse_mode: 'Markdown' }
  );
});

bot.action('OFFLINE_ENTER_NEW_SHOP', async (ctx) => {
  await ctx.answerCbQuery();
  const session = getSession(ctx.from.id);
  session.step = 'OFFLINE_AWAIT_SHOP_PAIR';
  session.data = { mode: 'OFFLINE_SHOP' };

  await ctx.reply(
    `🔄 እባክዎ *Shop ID* እና *Username* ያስገቡ (ለምሳሌ፦ \`SHOP-BF24C9E7 adis\`)፦`,
    { parse_mode: 'Markdown' }
  );
});

bot.action('DEPOSIT_MODE_ONLINE', async (ctx) => {
  await ctx.answerCbQuery();
  const session = getSession(ctx.from.id);
  session.step = 'DEPOSIT_AWAIT_AMOUNT';
  session.data = { mode: 'ONLINE_GAME' };

  await ctx.reply(
    `🎮 *ለኦንላይን ጨዋታ ዋሌት ባላንስ መሙላት*\n\n` +
      `ወደ ኦንላይን ዋሌትዎ ማስገባት የሚፈልጉትን የብር መጠን ያስገቡ (ለምሳሌ፡ 500)፦`,
    { parse_mode: 'Markdown' }
  );
});

async function sendPaymentInstructions(ctx, sessionData) {
  const targetInfo =
    sessionData.mode === 'OFFLINE_SHOP'
      ? `🏪 *አገልግሎት:* ኦፍላይን ቤት (Offline Shop Sync)\n🆔 *Shop ID:* \`${sessionData.shopId}\`\n👤 *Username:* \`${sessionData.shopUsername}\`\n`
      : `🎮 *አገልግሎት:* ኦንላይን ጨዋታ ዋሌት (Online Game Wallet)\n`;

  const msg =
    `🏦 *ደረጃ 3/4 — ክፍያ የሚፈጸምባቸው አካውንቶች*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${targetInfo}` +
    `💰 *የሚከፈል መጠን:* *${sessionData.amount} ETB*\n\n` +
    `📱 *ቴሌብር (Telebirr):*\n` +
    `   ቁጥር፦ \`${config.accounts.telebirrNumber}\` (${config.accounts.telebirrName})\n\n` +
    `🏦 *የኢትዮጵያ ንግድ ባንክ (CBE):*\n` +
    `   አካውንት፦ \`${config.accounts.cbeAccount}\` (${config.accounts.cbeName})\n\n` +
    `🏦 *አቢሲኒያ ባንክ (Abyssinia Bank):*\n` +
    `   አካውንት፦ \`${config.accounts.boaAccount}\` (${config.accounts.boaName})\n\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📩 *ደረጃ 4/4 — ማረጋገጫ ይላኩ፦*\n` +
    `ክፍያውን እንደፈጸሙ የደረሰዎትን *የባንክ/ቴሌብር SMS ጽሑፍ Copy-Paste አድርገው ይላኩ* ወይም *የደረሰኝ ፎቶ (Screenshot)* ይላኩ።`;

  await ctx.reply(msg, { parse_mode: 'Markdown' });
}

// ============================================================================
// NEW CENTER REGISTRATION (📝 አዲስ ቤት መመዝገብ)
// ============================================================================
bot.hears('📝 አዲስ ቤት መመዝገብ', async (ctx) => {
  const session = getSession(ctx.from.id);
  session.step = 'REG_CENTER_NAME';
  session.data = {};

  await ctx.reply(
    `📝 *አዲስ የATD Bingo ቤት መመዝገቢያ (1/5)*\n\n` +
      `እባክዎ የቢንጎ/ኬኖ ቤትዎን *ስም (Center Name)* ያስገቡ፦`,
    { parse_mode: 'Markdown' }
  );
});

bot.action(/^APPROVE_SHOP:(.+):(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    return ctx.answerCbQuery('⛔ ፈቃድ የለዎትም!', { show_alert: true });
  }

  const shopId = ctx.match[1];
  const applicantTgId = Number(ctx.match[2]);

  try {
    const shop = await db.activateShop(shopId);
    await safeLinkTelegram({
      telegramId: applicantTgId,
      phone: shop.phone,
      shopId: shop.shop_id,
      shopUsername: shop.username
    });

    await ctx.editMessageText(
      `${ctx.callbackQuery.message.text}\n\n✅ *ጸድቋል (ACTIVE)* — በ Admin ተረጋግጧል።`,
      { parse_mode: 'Markdown' }
    );

    await bot.telegram.sendMessage(
      applicantTgId,
      `🎉 *እንኳን ደስ አለዎት! አዲስ ቤትዎ ጸድቋል!*\n\n` +
        `🏪 *Shop ID:* \`${shop.shop_id}\`\n` +
        `👤 *Username:* \`${shop.username}\`\n` +
        `📊 *Status:* ACTIVE\n\n` +
        `አሁን *📲 ኦፍላይን አፕ አውርድ* በመጫን ሶፍትዌሩን ማውረድ እና *💰 ባላንስ መሙላት* በመጫን ባላንስ መሙላት ይችላሉ!`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    await ctx.answerCbQuery(`❌ Error: ${err.message}`, { show_alert: true });
  }
});

// ============================================================================
// ADMIN DEPOSIT APPROVAL & REJECTION CALLBACKS
// ============================================================================
bot.action(/^APPROVE_DEP:(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    return ctx.answerCbQuery('⛔ ፈቃድ የለዎትም!', { show_alert: true });
  }

  const txUuid = ctx.match[1];
  await ctx.answerCbQuery('⏳ በማጽደቅ ላይ...');

  try {
    const { data: tx } = await db.supabase
      .from('transactions')
      .select('*')
      .eq('id', txUuid)
      .single();

    if (!tx || tx.status !== 'PENDING') {
      return ctx.reply(`⚠️ ይህ ግብይት ቀድሞውኑ ተስተናግዷል (${tx?.status || 'NOT FOUND'})።`);
    }

    if (tx.mode === 'OFFLINE_SHOP') {
      const rpcResult = await db.approveOfflineDeposit(txUuid, ctx.from.id);
      if (!rpcResult.success) {
        return ctx.reply(`❌ ማጽደቅ አልተቻለም፦ ${rpcResult.error}`);
      }

      // shop_username ባዶ ከሆነ ከ shops ሠንጠረዥ በቀጥታ ማምጣት (Client Username null እንዳይሆን!)
      let finalUsername = rpcResult.username || rpcResult.client_username || tx.shop_username;
      const finalShopId = rpcResult.shop_id || tx.shop_id;
      if (!finalUsername && finalShopId) {
        const { data: shopRow } = await db.supabase
          .from('shops')
          .select('username')
          .ilike('shop_id', finalShopId)
          .single();
        finalUsername = shopRow?.username || '';
      }

      const finalAmount = rpcResult.amount || tx.amount;
      const finalRefId = rpcResult.ref_id || tx.transaction_id;

      const syncResult = await pushToControlDashboard(
        {
          shop_id: finalShopId,
          username: finalUsername,
          amount: finalAmount,
          ref_id: finalRefId
        },
        notifyAdmins
      );

      await db.updateTransactionSyncStatus(
        txUuid,
        syncResult.success ? 'SYNCED' : 'FAILED'
      );

      const statusBadge = syncResult.success
        ? '✅ ጸድቋል & ወደ Control Dashboard Sync ሆኗል!'
        : '⚠️ Supabase ጸድቋል ነገር ግን Dashboard Sync አልተሳካም (Alert ተልኳል)';

      if (ctx.callbackQuery.message.photo) {
        await ctx.editMessageCaption(
          `${escapeHtml(ctx.callbackQuery.message.caption)}\n\n${statusBadge}`,
          { parse_mode: 'HTML' }
        );
      } else {
        await ctx.editMessageText(
          `${escapeHtml(ctx.callbackQuery.message.text)}\n\n${statusBadge}`,
          { parse_mode: 'HTML' }
        );
      }

      const userSuccessMsg =
        `✅ ክፍያዎ ተረጋግጧል! *${finalAmount} ብር* ወደ *${finalUsername}* (Shop ID: \`${finalShopId}\`) ተልኳል።\n\n` +
        `⚠️ *ማሳሰቢያ፦* ባላንሱን ወደ አፕሊኬሽንዎ ለማስገባት መጀመሪያ ኮምፒውተርዎን/መሳሪያዎን ከዋይፋይ (ኢንተርኔት) ጋር ያገናኙ (Online ያድርጉ)፤ ከዚያም ATD Bingo አፕ ውስጥ ገብተው *"Sync Balance"* የሚለውን ይንኩ!`;

      await bot.telegram.sendMessage(rpcResult.telegram_id || tx.telegram_id, userSuccessMsg, {
        parse_mode: 'Markdown'
      });
    } else {
      const rpcResult = await db.approveOnlineDeposit(txUuid, ctx.from.id);
      if (!rpcResult.success) {
        return ctx.reply(`❌ ማጽደቅ አልተቻለም፦ ${rpcResult.error}`);
      }

      const statusBadge = '✅ ጸድቋል! የኦንላይን ዋሌት ባላንስ ተጨምሯል።';
      if (ctx.callbackQuery.message.photo) {
        await ctx.editMessageCaption(
          `${escapeHtml(ctx.callbackQuery.message.caption)}\n\n${statusBadge}`,
          { parse_mode: 'HTML' }
        );
      } else {
        await ctx.editMessageText(
          `${escapeHtml(ctx.callbackQuery.message.text)}\n\n${statusBadge}`,
          { parse_mode: 'HTML' }
        );
      }

      await bot.telegram.sendMessage(
        rpcResult.telegram_id,
        `✅ *የኦንላይን ጨዋታ ዋሌት ክፍያዎ ተረጋግጧል!*\n\n` +
          `💰 *የተጨመረ መጠን:* +${rpcResult.amount} ETB\n` +
          `💳 *አዲስ የኦንላይን ባላንስ:* *${Number(rpcResult.new_balance).toFixed(2)} ETB*\n\n` +
          `አሁን *🎮 ኦንላይን ጨዋታዎች* በመጫን መጫወት ይችላሉ!`,
        { parse_mode: 'Markdown' }
      );
    }
  } catch (err) {
    console.error('Approval error:', err);
    await ctx.reply(`❌ ስህተት ተፈጥሯል፦ ${err.message}`);
  }
});

bot.action(/^REJECT_DEP:(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) {
    return ctx.answerCbQuery('⛔ ፈቃድ የለዎትም!', { show_alert: true });
  }

  const txUuid = ctx.match[1];
  const rejected = await db.rejectTransaction(txUuid, ctx.from.id);

  if (!rejected) {
    return ctx.answerCbQuery('⚠️ ግብይቱ ቀድሞ ተስተናግዷል።', { show_alert: true });
  }

  if (ctx.callbackQuery.message.photo) {
    await ctx.editMessageCaption(
      `${escapeHtml(ctx.callbackQuery.message.caption)}\n\n❌ <b>ውድቅ ተደርጓል (REJECTED)</b>`,
      { parse_mode: 'HTML' }
    );
  } else {
    await ctx.editMessageText(
      `${escapeHtml(ctx.callbackQuery.message.text)}\n\n❌ <b>ውድቅ ተደርጓል (REJECTED)</b>`,
      { parse_mode: 'HTML' }
    );
  }

  await bot.telegram.sendMessage(
    rejected.telegram_id,
    `❌ *የላኩት የክፍያ ማረጋገጫ (Ref: \`${rejected.transaction_id}\`) ውድቅ ተደርጓል።*\n` +
      `ትክክለኛ የክፍያ ደረሰኝ መላክዎን ያረጋግጡ ወይም *📞 እርዳታ* የሚለውን በመጫን ያግኙን።`,
    { parse_mode: 'Markdown' }
  );
});

// ============================================================================
// OFFLINE APP DISTRIBUTION (📲 ኦፍላይን አፕ አውርድ & ADMIN /setapp)
// ============================================================================
bot.command('setapp', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;

  const repliedDoc = ctx.message.reply_to_message?.document;
  if (!repliedDoc) {
    return ctx.reply(
      '⚠️ እባክዎ መጀመሪያ ~147MB–170MB የሆነውን `ATD-Bingo-Offline.zip` ፋይል ወደ ቦቱ ይላኩና በዚያ ፋይል ላይ **Reply** በማድረግ `/setapp` ይጻፉ።',
      { parse_mode: 'Markdown' }
    );
  }

  await db.setAppSetting('offline_app_file_id', repliedDoc.file_id);
  await db.setAppSetting('offline_app_filename', repliedDoc.file_name || 'ATD-Bingo-Offline.zip');

  await ctx.reply(
    `✅ *የኦፍላይን አፕ ፋይል በተሳካ ሁኔታ ተቀምጧል!*\n` +
      `📦 *ፋይል:* \`${repliedDoc.file_name}\`\n` +
      `🆔 *Cached File ID:* \`${repliedDoc.file_id}\``,
    { parse_mode: 'Markdown' }
  );
});

bot.hears('📲 ኦፍላይን አፕ አውርድ', async (ctx) => {
  clearSession(ctx.from.id);
  const cachedFileId = await db.getAppSetting('offline_app_file_id');

  const installGuide =
    `📲 *ATD Bingo Offline Software (~147MB - 170MB)*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🛠 *የአጫጫን እና አጠቃቀም መመሪያ፦*\n` +
    `1️⃣ የወረደውን \`.zip\` ፋይል Right-Click አድርገው *"Extract All..."* (Unzip) ያድርጉት።\n` +
    `2️⃣ Windows Defender / Antivirus ፋይሉን እንዳይዘጋው ፎልደሩን Exclusion ውስጥ ያስገቡ።\n` +
    `3️⃣ ጨዋታው ሙሉ በሙሉ *ያለ ኢንተርኔት (Offline)* ይሰራል።\n\n` +
    `⚠️ *እጅግ አስፈላጊ ማሳሰቢያ (Sync Balance):*\n` +
    `ባላንስ ሲሞሉ ገንዘቡ ወደ አፑ እንዲገባ መጀመሪያ ኮምፒውተርዎን/መሳሪያዎን ከ *Wi-Fi / ኢንተርኔት* ጋር ያገናኙ (Online ያድርጉ)፤ ከዚያም አፑ ውስጥ ገብተው *"Sync Balance"* የሚለውን ይጫኑ!`;

  if (cachedFileId) {
    await ctx.reply('⏳ የኦፍላይን ሶፍትዌሩን በመላክ ላይ ነው...');
    return ctx.replyWithDocument(cachedFileId, {
      caption: installGuide,
      parse_mode: 'Markdown'
    });
  }

  if (config.offlineApp.downloadUrl && config.offlineApp.downloadUrl.startsWith('http')) {
    return ctx.reply(installGuide, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.url('⬇️ ATD-Bingo-Offline.zip አውርድ', config.offlineApp.downloadUrl)]
      ])
    });
  }

  await ctx.reply(
    `${installGuide}\n\n📌 የቀጥታ ማውረጃ ሊንክ ለማግኘት *📞 እርዳታ* የሚለውን በመጫን ያግኙን።`,
    { parse_mode: 'Markdown' }
  );
});

// ============================================================================
// BALANCE, TRANSACTION HISTORY & SUPPORT / FAQS
// ============================================================================
bot.hears('💳 የእኔ ባላንስ', async (ctx) => {
  clearSession(ctx.from.id);
  const wallet = await db.ensureOnlineWallet(ctx.from.id, ctx.from.username);
  const link = await db.getTelegramLink(ctx.from.id);

  let offlineSection = `🏪 *1. የኦፍላይን ቤት (Offline Shop):*\n   🔗 ገና አልተገናኘም።`;
  if (link) {
    const shop = await db.verifyActiveShop(link.shop_id, link.shop_username);
    offlineSection =
      `🏪 *1. የኦፍላይን ቤት (Offline Shop):*\n` +
      `   🆔 *Shop ID:* \`${link.shop_id}\`\n` +
      `   👤 *Username:* \`${link.shop_username}\`\n` +
      `   💰 *የተመዘገበ ባላንስ:* *${Number(shop?.balance || 0).toFixed(2)} ETB*\n` +
      `   ℹ️ _(አፑ ውስጥ ባላንሱን ለማየት Wi-Fi አገናኝተው "Sync Balance" ይጫኑ)_`;
  }

  const onlineSection =
    `🎮 *2. የኦንላይን ጨዋታ ዋሌት (Online Wallet):*\n` +
    `   💳 *ቀሪ ባላንስ:* *${Number(wallet.balance).toFixed(2)} ETB*`;

  await ctx.reply(
    `💳 *የእርስዎ የATD Bingo ባላንሶች*\n━━━━━━━━━━━━━━━━━━━━\n\n${offlineSection}\n\n${onlineSection}`,
    { parse_mode: 'Markdown' }
  );
});

bot.hears('📜 የግብይት ታሪክ', async (ctx) => {
  clearSession(ctx.from.id);
  const txs = await db.getUserTransactions(ctx.from.id, 10);

  if (!txs.length) {
    return ctx.reply('📜 እስካሁን ምንም የተመዘገበ የግብይት ታሪክ የለዎትም።');
  }

  const lines = txs.map((t, idx) => {
    const icon = t.status === 'APPROVED' ? '✅' : t.status === 'REJECTED' ? '❌' : '⏳';
    const modeLabel =
      t.mode === 'OFFLINE_SHOP'
        ? `🏪 Offline (${t.shop_id})`
        : t.mode === 'ONLINE_GAME'
        ? '🎮 Online Deposit'
        : `🎲 ${t.mode}`;
    return `${idx + 1}. ${icon} *${t.amount} ETB* — ${modeLabel}\n   Ref: \`${t.transaction_id}\` | Status: *${t.status}*`;
  });

  await ctx.reply(
    `📜 *የቅርብ ጊዜ 10 ግብይቶችዎ፦*\n━━━━━━━━━━━━━━━━━━━━\n\n${lines.join('\n\n')}`,
    { parse_mode: 'Markdown' }
  );
});

bot.hears('📞 እርዳታ', async (ctx) => {
  clearSession(ctx.from.id);

  const msg =
    `📞 *የATD Bingo የደንበኞች አገልግሎት እና እርዳታ*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `☎️ *ስልክ ቁጥር 1:* \`${config.support.phone1}\`\n` +
    `☎️ *ስልክ ቁጥር 2:* \`${config.support.phone2}\`\n` +
    `💬 *ቀጥታ ቴሌግራም:* @${config.support.telegramUsername}\n\n` +
    `❓ *ተደጋጋሚ ጥያቄዎች (FAQs) — መልሱን ለማየት ከታች ይምረጡ፦*`;

  await ctx.reply(msg, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.url('💬 በቴሌግራም በቀጥታ ያናግሩን', `https://t.me/${config.support.telegramUsername}`)],
      [Markup.button.callback('💳 ባላንስ Sync አልሆነልኝም?', 'FAQ_SYNC')],
      [Markup.button.callback('📲 ኦፍላይን አፕ አልከፈተልኝም?', 'FAQ_APP')],
      [Markup.button.callback('🔗 Shop ID እና Username እንዴት ላገናኝ?', 'FAQ_LINK')],
      [Markup.button.callback('🎮 ኦንላይን ጌም (Bingo/Keno/Aviator) እንዴት ልጫወት?', 'FAQ_ONLINE')]
    ])
  });
});

bot.action('FAQ_SYNC', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    `💳 *ባላንስ Sync አልሆነልኝም? — መፍትሄ፦*\n\n` +
      `1️⃣ ጨዋታው ኦፍላይን ቢሰራም ባላንስ ለመሳብ ግን ኮምፒውተርዎ/መሳሪያዎ በትክክል ከ *Wi-Fi ወይም ኢንተርኔት* ጋር መገናኘት (Online መሆን) አለበት።\n` +
      `2️⃣ ኢንተርኔት ካገናኙ በኋላ ATD Bingo አፕ ውስጥ ገብተው *"Sync Balance"* የሚለውን ቁልፍ ይጫኑ።\n` +
      `3️⃣ አሁንም ካልገባ የክፍያ ደረሰኝዎ በAdmin መጽደቁን *📜 የግብይት ታሪክ* ውስጥ ያረጋግጡ።`,
    { parse_mode: 'Markdown' }
  );
});

bot.action('FAQ_APP', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    `📲 *ኦፍላይን አፕ አልከፈተልኝም? — መፍትሄ፦*\n\n` +
      `1️⃣ የወረደው ፋይል \`.zip\` ስለሆነ በቀጥታ ሳይሆን መጀመሪያ Right-Click አድርገው *"Extract All"* በማድረግ ፎልደሩን ያውጡት።\n` +
      `2️⃣ Windows Defender / Antivirus አፑን እንዳይከለክለው ፎልደሩን *Virus & Threat Protection -> Exclusions* ውስጥ ያስገቡት።`,
    { parse_mode: 'Markdown' }
  );
});

bot.action('FAQ_LINK', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    `🔗 *Shop ID እና Username እንዴት ላገናኝ?*\n\n` +
      `• \`/start\` በመንካት *"📱 ስልክ ቁጥሬን በማጋራት አገናኝ"* የሚለውን ይጫኑ፤ ወይም በቀጥታ \`SHOP-XXXXXXX\` ወይም \`Username\` በመጻፍ ይላኩ።\n` +
      `• አዲስ ከሆኑ *📝 አዲስ ቤት መመዝገብ* የሚለውን ተጭነው ይመዝገቡ።`,
    { parse_mode: 'Markdown' }
  );
});

bot.action('FAQ_ONLINE', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(
    `🎮 *ኦንላይን ጌም (Bingo/Keno/Aviator) እንዴት ልጫወት?*\n\n` +
      `1️⃣ መጀመሪያ *💰 ባላንስ መሙላት* -> *🎮 ለኦንላይን ጨዋታ (Online Game Wallet)* በመምረጥ ዋሌትዎን ይሙሉ።\n` +
      `2️⃣ ከዚያ *🎮 ኦንላይን ጨዋታዎች (Bingo / Keno / Aviator)* የሚለውን ተጭነው የሚፈልጉትን ጌም ይክፈቱ።`,
    { parse_mode: 'Markdown' }
  );
});

// ============================================================================
// CONVERSATIONAL TEXT & PHOTO HANDLER (DEPOSIT, REGISTRATION, QUICK SHOP LINK)
// ============================================================================
bot.on('photo', async (ctx) => {
  const userId = ctx.from.id;
  const session = getSession(userId);

  if (session.step !== 'DEPOSIT_AWAIT_PROOF') {
    return ctx.reply(
      '📸 የክፍያ ደረሰኝ ፎቶ ለመላክ እባክዎ መጀመሪያ *💰 ባላንስ መሙላት* የሚለውን ይጫኑ።',
      MAIN_MENU_KEYBOARD
    );
  }

  const photos = ctx.message.photo;
  const bestPhoto = photos[photos.length - 1];
  const generatedRef = `IMG-${Date.now().toString(36).toUpperCase()}`;

  await finalizeDepositProof(ctx, session, {
    transactionId: generatedRef,
    parsedAmount: session.data.amount,
    paymentMethod: 'SCREENSHOT',
    proofText: ctx.message.caption || 'Receipt Screenshot',
    proofFileId: bestPhoto.file_id
  });
});

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text.trim();
  const session = getSession(userId);

  // --- HANDLE ACTIVE CONVERSATION STEPS ---
  if (session.step === 'OFFLINE_AWAIT_SHOP_PAIR') {
    const parts = text.split(/\s+/);
    let shop = null;

    if (parts.length >= 2) {
      shop = await db.verifyActiveShop(parts[0], parts[1]);
    }
    if (!shop) {
      shop = await db.findShopByQuery(text);
    }

    if (!shop) {
      return ctx.reply(
        `❌ ያስገቡት Shop ID / Username አልተገኘም ወይም ACTIVE አይደለም።\n` +
          `እባክዎ በትክክል ያስገቡ (ለምሳሌ፦ \`SHOP-BF24C9E7 adis\`) ወይም *📝 አዲስ ቤት መመዝገብ* ይጫኑ።`,
        { parse_mode: 'Markdown' }
      );
    }

    await safeLinkTelegram({
      telegramId: userId,
      telegramUsername: ctx.from.username,
      phone: shop.phone,
      shopId: shop.shop_id,
      shopUsername: shop.username
    });

    session.data.shopId = shop.shop_id;
    session.data.shopUsername = shop.username;
    session.step = 'DEPOSIT_AWAIT_AMOUNT';

    return ctx.reply(
      `✅ ቤትዎ ተረጋግጧል፦ \`${shop.shop_id}\` (\`${shop.username}\`)\n\n` +
        `💵 *ደረጃ 2/4 — የብር መጠን ያስገቡ*\n` +
        `ወደ ኦፍላይን አፕሊኬሽንዎ Sync ማድረግ የሚፈልጉትን የብር መጠን ያስገቡ (ለምሳሌ፡ 20000)፦`,
      { parse_mode: 'Markdown' }
    );
  }

  if (session.step === 'DEPOSIT_AWAIT_AMOUNT') {
    const amount = parseFloat(text.replace(/,/g, ''));
    if (Number.isNaN(amount) || amount < 10) {
      return ctx.reply('⚠️ እባክዎ ትክክለኛ የብር መጠን በቁጥር ያስገቡ (ቢያንስ 10 ብር)፦');
    }

    session.data.amount = amount;
    session.step = 'DEPOSIT_AWAIT_PROOF';
    return sendPaymentInstructions(ctx, session.data);
  }

  if (session.step === 'DEPOSIT_AWAIT_PROOF') {
    const parsed = parsePaymentSms(text);
    if (!parsed.isValid) {
      return ctx.reply(
        `⚠️ ከላኩት መልዕክት ውስጥ የግብይት ቁጥር (Transaction ID) እና የብር መጠን ማግኘት አልተቻለም።\n` +
          `እባክዎ ሙሉውን የቴሌብር/CBE/BOA SMS መልዕክት Copy-Paste ያድርጉ ወይም የደረሰኙን ፎቶ (Screenshot) ይላኩ።`
      );
    }

    if (parsed.amount < session.data.amount) {
      return ctx.reply(
        `⚠️ በSMS የተገኘው መጠን (*${parsed.amount} ETB*) እርስዎ ከጠየቁት (*${session.data.amount} ETB*) ያነሰ ነው። እባክዎ ትክክለኛውን ደረሰኝ ይላኩ።`,
        { parse_mode: 'Markdown' }
      );
    }

    return finalizeDepositProof(ctx, session, {
      transactionId: parsed.transactionId,
      parsedAmount: parsed.amount,
      paymentMethod: parsed.bank,
      proofText: text,
      proofFileId: null
    });
  }

  // --- NEW CENTER REGISTRATION STEPS ---
  if (session.step === 'REG_CENTER_NAME') {
    session.data.centerName = text;
    session.step = 'REG_USERNAME';
    return ctx.reply('2️⃣ የመለያ ስም (*Username*) ያስገቡ (ለምሳሌ፦ `adis`)፦', { parse_mode: 'Markdown' });
  }

  if (session.step === 'REG_USERNAME') {
    session.data.username = text.replace(/\s+/g, '');
    session.step = 'REG_PHONE';
    return ctx.reply('3️⃣ የባለቤቱን *ስልክ ቁጥር* ያስገቡ (ለምሳሌ፦ `0911223344`)፦', { parse_mode: 'Markdown' });
  }

  if (session.step === 'REG_PHONE') {
    session.data.phone = text;
    session.step = 'REG_REGION';
    return ctx.reply('4️⃣ ክልል / ከተማ / አድራሻ (*Region/Address*) ያስገቡ፦', { parse_mode: 'Markdown' });
  }

  if (session.step === 'REG_REGION') {
    session.data.region = text;
    session.step = 'REG_MAC';
    return ctx.reply(
      '5️⃣ የኮምፒውተሩን *PC MAC Address* ያስገቡ (ካልታወቀ `N/A` ብለው ይጻፉ)፦',
      { parse_mode: 'Markdown' }
    );
  }

  if (session.step === 'REG_MAC') {
    session.data.macAddress = text;
    try {
      const newShop = await db.registerNewShop(session.data);
      clearSession(userId);

      await ctx.reply(
        `✅ *የአዲስ ቤት ምዝገባ ጥያቄዎ ለAdmin ተልኳል!*\n\n` +
          `🏪 *የቤት ስም:* ${newShop.center_name}\n` +
          `🆔 *የተመደበ Shop ID:* \`${newShop.shop_id}\`\n` +
          `👤 *Username:* \`${newShop.username}\`\n\n` +
          `Admin እንዳጸደቀው ወዲያውኑ መልዕክት ይደርስዎታል።`,
        { parse_mode: 'Markdown', ...MAIN_MENU_KEYBOARD }
      );

      const adminRegMsg =
        `🆕 *አዲስ የATD Bingo ቤት ምዝገባ ጥያቄ*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🏪 *Center Name:* ${newShop.center_name}\n` +
        `🆔 *Shop ID:* \`${newShop.shop_id}\`\n` +
        `👤 *Username:* \`${newShop.username}\`\n` +
        `📱 *Phone:* ${newShop.phone}\n` +
        `📍 *Region:* ${newShop.region}\n` +
        `💻 *MAC Address:* \`${newShop.mac_address}\`\n` +
        `🙋 *Telegram ID:* \`${userId}\``;

      await notifyAdmins(
        adminRegMsg,
        Markup.inlineKeyboard([
          [Markup.button.callback('✅ አጽድቅ (Activate Shop)', `APPROVE_SHOP:${newShop.shop_id}:${userId}`)]
        ])
      );
    } catch (err) {
      clearSession(userId);
      await ctx.reply(`❌ ምዝገባው አልተሳካም፦ ${err.message}`, MAIN_MENU_KEYBOARD);
    }
    return;
  }

  // --- QUICK SHOP LINKING IF USER TYPES SHOP-XXXXXXX OR PHONE OR USERNAME ---
  const quickShop = await db.findShopByQuery(text);
  if (quickShop) {
    await safeLinkTelegram({
      telegramId: userId,
      telegramUsername: ctx.from.username,
      phone: quickShop.phone,
      shopId: quickShop.shop_id,
      shopUsername: quickShop.username
    });

    return ctx.reply(
      `✅ *ቤትዎ በተሳካ ሁኔታ ተገናኝቷል!*\n` +
        `🏪 *Shop ID:* \`${quickShop.shop_id}\` | 👤 *Username:* \`${quickShop.username}\``,
      { parse_mode: 'Markdown', ...MAIN_MENU_KEYBOARD }
    );
  }
});

async function finalizeDepositProof(ctx, session, proof) {
  const userId = ctx.from.id;

  try {
    const duplicate = await db.isTransactionDuplicate(proof.transactionId);
    if (duplicate) {
      return ctx.reply(
        `🚫 *ማስጠንቀቂያ፦ ይህ የግብይት ቁጥር (\`${proof.transactionId}\`) ቀድሞ ጥቅም ላይ ውሏል!*\n` +
          `እባክዎ አዲስ የክፍያ ማረጋገጫ ይላኩ።`,
        { parse_mode: 'Markdown' }
      );
    }

    const tx = await db.createPendingTransaction({
      transactionId: proof.transactionId,
      telegramId: userId,
      mode: session.data.mode,
      shopId: session.data.shopId || null,
      shopUsername: session.data.shopUsername || null,
      amount: session.data.amount,
      parsedAmount: proof.parsedAmount,
      paymentMethod: proof.paymentMethod,
      proofText: proof.proofText,
      proofFileId: proof.proofFileId
    });

    clearSession(userId);

    await ctx.reply(
      `⏳ *የክፍያ ማረጋገጫዎ በተሳካ ሁኔታ ተልኳል!*\n\n` +
        `🧾 *Ref ID:* \`${tx.transaction_id}\`\n` +
        `💰 *መጠን:* ${tx.amount} ETB\n\n` +
        `Admin እንዳረጋገጠው ወዲያውኑ መልዕክት ይደርስዎታል።`,
      { parse_mode: 'Markdown', ...MAIN_MENU_KEYBOARD }
    );

    const typeHeader =
      tx.mode === 'OFFLINE_SHOP'
        ? `🏪 <b>Type:</b> OFFLINE SHOP\n🆔 <b>Shop ID:</b> <code>${escapeHtml(tx.shop_id)}</code>\n👤 <b>Username:</b> <code>${escapeHtml(tx.shop_username)}</code>\n`
        : `🎮 <b>Type:</b> ONLINE GAME\n`;

    const adminCaption =
      `💰 <b>አዲስ የክፍያ ማረጋገጫ (Deposit Request)</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `${typeHeader}` +
      `💵 <b>Requested Amount:</b> <b>${tx.amount} ETB</b>\n` +
      `📊 <b>Parsed Amount:</b> ${tx.parsed_amount || tx.amount} ETB\n` +
      `🧾 <b>Transaction ID:</b> <code>${escapeHtml(tx.transaction_id)}</code>\n` +
      `🏦 <b>Method:</b> ${escapeHtml(tx.payment_method)}\n` +
      `🙋 <b>User TG:</b> <code>${userId}</code> (@${escapeHtml(ctx.from.username || 'N/A')})`;

    const approveLabel =
      tx.mode === 'OFFLINE_SHOP'
        ? '✅ አጽድቅና Sync አድርግ (Approve & Sync)'
        : '✅ አጽድቅ (Approve Online Wallet)';

    const inlineKb = Markup.inlineKeyboard([
      [Markup.button.callback(approveLabel, `APPROVE_DEP:${tx.id}`)],
      [Markup.button.callback('❌ ውድቅ አድርግ (Reject)', `REJECT_DEP:${tx.id}`)]
    ]);

    for (const adminId of config.adminIds) {
      if (proof.proofFileId) {
        await bot.telegram.sendPhoto(adminId, proof.proofFileId, {
          caption: adminCaption,
          parse_mode: 'HTML',
          ...inlineKb
        });
      } else {
        await bot.telegram.sendMessage(
          adminId,
          `${adminCaption}\n\n📩 <b>SMS Proof:</b>\n<code>${escapeHtml(proof.proofText)}</code>`,
          { parse_mode: 'HTML', ...inlineKb }
        );
      }
    }
  } catch (err) {
    console.error('Deposit submission error:', err);
    await ctx.reply(`❌ ስህተት ተፈጥሯል፦ ${err.message}`, MAIN_MENU_KEYBOARD);
  }
}

module.exports = { bot, notifyAdmins };
