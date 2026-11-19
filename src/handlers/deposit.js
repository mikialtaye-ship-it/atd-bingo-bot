'use strict';
const { Markup } = require('telegraf');
const env = require('../config/env');
const {
  mainMenu,
  depositModeKeyboard,
  confirmShopKeyboard,
  adminApprovalKeyboard,
  cancelKeyboard,
} = require('../utils/keyboards');
const {
  getTelegramLink,
  upsertTelegramLink,
  verifyShop,
  isDuplicateTransaction,
  createTransaction,
  updateTransactionStatus,
  approveOfflineDepositRpc,
  approveOnlineDepositRpc,
  getOnlineWallet,
} = require('../services/supabase');
const { parseSms } = require('../utils/smsParser');
const { pushToControlDashboard } = require('../services/syncApi');

// ════════════════════════════════════════════════════════════════
//  SESSION STORE  (in-memory; for multi-instance use Redis)
// ════════════════════════════════════════════════════════════════
const sessions = new Map();   // userId → session object

// ── Helper: render payment accounts block ────────────────────────
function paymentAccountsBlock() {
  const lines = ['\n💳 <b>ወደ አንዱ አካውንት ይክፈሉ፦</b>\n'];
  if (env.TELEBIRR_NUMBER)
    lines.push(`📱 <b>ቴሌብር (Telebirr):</b>\n   <code>${env.TELEBIRR_NUMBER}</code> — ${env.TELEBIRR_NAME}`);
  if (env.CBE_ACCOUNT)
    lines.push(`🏦 <b>ንግድ ባንክ (CBE):</b>\n   <code>${env.CBE_ACCOUNT}</code> — ${env.CBE_NAME}`);
  if (env.BOA_ACCOUNT)
    lines.push(`🏦 <b>አቢሲኒያ ባንክ (Abyssinia):</b>\n   <code>${env.BOA_ACCOUNT}</code> — ${env.BOA_NAME}`);
  return lines.join('\n');
}

// ════════════════════════════════════════════════════════════════
module.exports = function registerDepositHandler(bot) {

  // ════════════════════════════════════════════════════════════
  //  ENTRY POINT: 💰 ባላንስ መሙላት
  // ════════════════════════════════════════════════════════════
  bot.hears('💰 ባላንስ መሙላት', async (ctx) => {
    sessions.delete(ctx.from.id);
    await ctx.replyWithHTML(
      '💰 <b>ባላንስ መሙላት</b>\n\nባላንስ ለየትኛው አገልግሎት ይሞሉ?',
      depositModeKeyboard,
    );
  });

  // Quick top-up from online games hub
  bot.action('deposit:online_quick', async (ctx) => {
    await ctx.answerCbQuery();
    sessions.set(ctx.from.id, { mode: 'online', step: 'amount' });
    await ctx.replyWithHTML(
      '🎮 <b>ለኦንላይን ጨዋታ ባላንስ መሙላት</b>\n\n' +
      'ማስገባት የሚፈልጉትን <b>የብር መጠን</b> ያስገቡ\n(ለምሳሌ: <code>500</code>)፦',
      cancelKeyboard,
    );
  });

  // ════════════════════════════════════════════════════════════
  //  STEP 0 — Mode selection
  // ════════════════════════════════════════════════════════════

  // 🏪 Offline Shop Sync chosen
  bot.action('deposit:offline', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const link   = await getTelegramLink(userId);

    if (link?.shop_id && link?.username) {
      sessions.set(userId, {
        mode: 'offline', step: 'confirm_shop',
        shopId: link.shop_id, username: link.username,
      });
      await ctx.replyWithHTML(
        `🏪 <b>ተቀድሞ የተገናኘ ቤት</b>\n\n` +
        `Shop ID: <code>${link.shop_id}</code>\n` +
        `Username: <code>${link.username}</code>\n\n` +
        `ቀጥሎ ምን ያድርጉ?`,
        confirmShopKeyboard(link.shop_id, link.username),
      );
    } else {
      sessions.set(userId, { mode: 'offline', step: 'enter_shop_id' });
      await ctx.replyWithHTML(
        '🏪 <b>ኦፍላይን ቤት ባላንስ Sync</b>\n\n' +
        'Shop ID ያስገቡ\n(ለምሳሌ: <code>SHOP-BF24C9E7</code>)፦',
        cancelKeyboard,
      );
    }
  });

  // 🎮 Online Game Wallet chosen
  bot.action('deposit:online', async (ctx) => {
    await ctx.answerCbQuery();
    sessions.set(ctx.from.id, { mode: 'online', step: 'amount' });
    await ctx.replyWithHTML(
      '🎮 <b>ለኦንላይን ጨዋታ ባላንስ መሙላት</b>\n\n' +
      'ማስገባት የሚፈልጉትን <b>የብር መጠን</b> ያስገቡ\n(ለምሳሌ: <code>500</code>)፦',
      cancelKeyboard,
    );
  });

  // Use saved shop link
  bot.action('deposit:use_saved', async (ctx) => {
    await ctx.answerCbQuery();
    const session = sessions.get(ctx.from.id);
    if (!session) return;
    session.step = 'amount';
    sessions.set(ctx.from.id, session);
    await ctx.replyWithHTML(
      `✅ Shop ID: <code>${session.shopId}</code>  (Username: <code>${session.username}</code>)\n\n` +
      '💵 Sync ማድረግ የሚፈልጉትን <b>የብር መጠን</b> ያስገቡ\n(ለምሳሌ: <code>20000</code>)፦',
      cancelKeyboard,
    );
  });

  // Change to a different shop
  bot.action('deposit:change_shop', async (ctx) => {
    await ctx.answerCbQuery();
    const session = sessions.get(ctx.from.id) || { mode: 'offline' };
    session.step  = 'enter_shop_id';
    delete session.shopId;
    delete session.username;
    sessions.set(ctx.from.id, session);
    await ctx.replyWithHTML(
      '🔄 አዲስ Shop ID ያስገቡ\n(ለምሳሌ: <code>SHOP-BF24C9E7</code>)፦',
      cancelKeyboard,
    );
  });

  // ════════════════════════════════════════════════════════════
  //  TEXT INPUT — Multi-step deposit wizard
  // ════════════════════════════════════════════════════════════
  bot.on('text', async (ctx, next) => {
    const userId  = ctx.from.id;
    const session = sessions.get(userId);
    if (!session) return next();

    const text = ctx.message.text.trim();

    // Universal cancel
    if (text === '❌ ሰርዝ') {
      sessions.delete(userId);
      return ctx.reply('❌ ተሰርዟል።', mainMenu);
    }

    // ── STEP: enter_shop_id ──────────────────────────────────
    if (session.step === 'enter_shop_id') {
      const shopId = text.toUpperCase();
      if (!/^SHOP-[A-F0-9]{7,8}$/.test(shopId)) {
        return ctx.replyWithHTML(
          '❌ Shop ID ትክክለኛ አይደለም።\n' +
          'ምሳሌ: <code>SHOP-BF24C9E7</code>\nእንደገና ያስገቡ፦'
        );
      }
      session.shopId = shopId;
      session.step   = 'enter_username';
      sessions.set(userId, session);
      return ctx.replyWithHTML(
        `✅ Shop ID: <code>${shopId}</code>\n\n` +
        'ATD <b>Username</b> ያስገቡ\n(ለምሳሌ: <code>adis</code>)፦'
      );
    }

    // ── STEP: enter_username ─────────────────────────────────
    if (session.step === 'enter_username') {
      const username = text.toLowerCase().replace(/\s+/g, '');
      const shop = await verifyShop(session.shopId, username);
      if (!shop) {
        return ctx.replyWithHTML(
          `❌ <b>Shop ID / Username አልተገኘም ወይም ACTIVE አይደለም።</b>\n\n` +
          `Shop ID: <code>${session.shopId}</code>\n` +
          `Username: <code>${username}</code>\n\n` +
          `እባክዎ እንደገና ያረጋግጡ ወይም Admin ያስተናግዱ።\n` +
          `📞 ${env.SUPPORT_PHONE_1}`
        );
      }
      session.username = username;
      session.step     = 'amount';
      // Link Telegram account to this shop for future use
      await upsertTelegramLink({
        telegramId:       userId,
        telegramUsername: ctx.from.username,
        shopId:           session.shopId,
        username,
      });
      sessions.set(userId, session);
      return ctx.replyWithHTML(
        `✅ ቤቱ ተረጋገጠ! <code>${session.shopId}</code> (${username})\n\n` +
        '💵 Sync ማድረግ የሚፈልጉትን <b>የብር መጠን</b> ያስገቡ\n(ለምሳሌ: <code>20000</code>)፦',
        cancelKeyboard,
      );
    }

    // ── STEP: amount ─────────────────────────────────────────
    if (session.step === 'amount') {
      const amount = parseFloat(text.replace(/[,،]/g, ''));
      if (isNaN(amount) || amount <= 0) {
        return ctx.reply('❌ ትክክለኛ የብር መጠን ያስገቡ (ለምሳሌ: 500)።');
      }
      session.amount = amount;
      session.step   = 'proof';
      sessions.set(userId, session);

      let summaryLines = ['💳 <b>የክፍያ ማጠቃለያ</b>\n'];
      if (session.mode === 'offline') {
        summaryLines.push(`🏪 Shop ID: <code>${session.shopId}</code>`);
        summaryLines.push(`👤 Username: <code>${session.username}</code>`);
      } else {
        summaryLines.push(`🎮 አገልግሎት: ኦንላይን ጨዋታ Wallet`);
      }
      summaryLines.push(`💵 መጠን: <b>${amount.toLocaleString()} ETB</b>`);

      await ctx.replyWithHTML(
        summaryLines.join('\n') +
        paymentAccountsBlock() +
        '\n\n📸 ደረሰኙን (Screenshot ምስል) ወይም Telebirr/CBE/Abyssinia SMS ቅጅ ያስቀምጡ / ያስገቡ 👇',
        cancelKeyboard,
      );
      return;
    }

    // ── STEP: proof (text = SMS paste) ───────────────────────
    if (session.step === 'proof') {
      const parsed = parseSms(text);
      if (!parsed) {
        return ctx.replyWithHTML(
          '⚠️ SMS ወይም ደረሰኝ ቁጥር ሊነበብ አልቻለም።\n\n' +
          'Telebirr / CBE / Abyssinia SMS ቅጅ ያስገቡ፤\n' +
          'ወይም Screenshot ምስሉን ቀጥለው ይላኩ 👇'
        );
      }

      // Amount verification
      if (parsed.amount !== null && parsed.amount < session.amount) {
        return ctx.replyWithHTML(
          `❌ <b>SMS ያሳያው መጠን ያነሰ ነው!</b>\n\n` +
          `SMS Amount: <b>${parsed.amount} ETB</b>\n` +
          `ተጠያቂ: <b>${session.amount} ETB</b>\n\n` +
          `ትክክለኛ ደረሰኝ SMS ወይም Screenshot ያስቀምጡ።`
        );
      }

      // Duplicate prevention
      const dup = await isDuplicateTransaction(parsed.transactionId);
      if (dup) {
        return ctx.replyWithHTML(
          `❌ <b>ይህ ደረሰኝ ቀደም ብሎ ጥቅም ላይ ውሏል!</b>\n\n` +
          `Transaction ID: <code>${parsed.transactionId}</code>\n\n` +
          `ሌላ ደረሰኝ ወይም Admin ያስተናግዱ።`
        );
      }

      await _submitDeposit(ctx, bot, session, parsed.transactionId, parsed.amount, text, null);
      return;
    }

    return next();
  });

  // ════════════════════════════════════════════════════════════
  //  PHOTO PROOF
  // ════════════════════════════════════════════════════════════
  bot.on('photo', async (ctx, next) => {
    const userId  = ctx.from.id;
    const session = sessions.get(userId);
    if (!session || session.step !== 'proof') return next();

    const photo  = ctx.message.photo[ctx.message.photo.length - 1];
    const fileId = photo.file_id;
    const refId  = `PHOTO-${Date.now()}-${userId}`;

    await _submitDeposit(ctx, bot, session, refId, null, null, fileId);
  });

  // ════════════════════════════════════════════════════════════
  //  SHARED: Save transaction + notify Admin
  // ════════════════════════════════════════════════════════════
  async function _submitDeposit(ctx, bot, session, transactionId, parsedAmount, rawSms, photoFileId) {
    const userId = ctx.from.id;
    sessions.delete(userId);

    // Save to Supabase
    await createTransaction({
      transaction_id:   transactionId,
      type:             session.mode === 'offline' ? 'OFFLINE_SHOP' : 'ONLINE_WALLET',
      telegram_id:      userId,
      shop_id:          session.shopId || null,
      username:         session.username || null,
      requested_amount: session.amount,
      parsed_amount:    parsedAmount,
      status:           'PENDING',
      raw_sms:          rawSms,
      photo_file_id:    photoFileId,
    });

    // Confirm to user
    await ctx.replyWithHTML(
      `✅ <b>ደረሰኝዎ ደረሰ!</b> Admin ሲፈቅዱ ያሳውቅዎታል።\n` +
      `🔑 Ref: <code>${transactionId}</code>`,
      mainMenu,
    );

    // Build admin notification
    const adminCaption =
      `💰 <b>አዲስ ክፍያ ደረሰ${photoFileId ? ' (Screenshot)' : ' (SMS)'}!</b>\n\n` +
      `📋 ዓይነት: ${session.mode === 'offline' ? '🏪 ኦፍላይን ቤት' : '🎮 ኦንላይን'}\n` +
      (session.shopId ? `🏪 Shop: <code>${session.shopId}</code>\n👤 Username: <code>${session.username}</code>\n` : '') +
      `💵 ተጠያቂ: <b>${session.amount.toLocaleString()} ETB</b>\n` +
      (parsedAmount !== null ? `💵 SMS Amount: <b>${parsedAmount} ETB</b>\n` : '') +
      `🔑 Ref: <code>${transactionId}</code>\n` +
      `📱 Telegram: @${ctx.from.username || ctx.from.id}`;

    const approvalKb = adminApprovalKeyboard(transactionId, session.mode);

    if (photoFileId) {
      await bot.telegram.sendPhoto(env.ADMIN_TELEGRAM_ID, photoFileId, {
        caption:    adminCaption,
        parse_mode: 'HTML',
        ...approvalKb,
      });
    } else {
      await bot.telegram.sendMessage(env.ADMIN_TELEGRAM_ID, adminCaption, {
        parse_mode: 'HTML',
        ...approvalKb,
      });
    }
  }

  // ════════════════════════════════════════════════════════════
  //  ADMIN: APPROVE OFFLINE DEPOSIT
  // ════════════════════════════════════════════════════════════
  bot.action(/^admin:approve:offline:(.+)$/, async (ctx) => {
    if (String(ctx.from.id) !== String(env.ADMIN_TELEGRAM_ID)) {
      return ctx.answerCbQuery('❌ ፈቃድ የለዎትም');
    }
    const txId = ctx.match[1];
    await ctx.answerCbQuery('⏳ በማስፈቀድ ላይ...');

    try {
      const { supabase } = require('../services/supabase');
      const { data: tx } = await supabase
        .from('transactions').select('*').eq('transaction_id', txId).single();
      if (!tx) return ctx.reply('❌ Transaction አልተገኘም: ' + txId);

      // 1. Atomic Supabase update
      await approveOfflineDepositRpc(txId, tx.shop_id, tx.username, tx.requested_amount);

      // 2. Push to ATD Control Dashboard (3 auto-retries)
      const syncOk = await pushToControlDashboard({
        shopId:   tx.shop_id,
        username: tx.username,
        amount:   tx.requested_amount,
        refId:    txId,
      }, bot);

      // 3. Update admin message
      const originalMsg = ctx.callbackQuery.message?.text || ctx.callbackQuery.message?.caption || '';
      await ctx.editMessageText(
        originalMsg + `\n\n✅ ተፈቅዷል! ATD Dashboard Sync: ${syncOk ? '✅' : '⚠️ ስህተት — Admin ያስተናግዱ'}`,
        { parse_mode: 'HTML' }
      ).catch(() => {
        // caption messages need editMessageCaption
        return ctx.editMessageCaption(
          originalMsg + `\n\n✅ ተፈቅዷል! ATD Dashboard Sync: ${syncOk ? '✅' : '⚠️ ስህተት'}`,
          { parse_mode: 'HTML' }
        ).catch(() => {});
      });

      // 4. Notify user in Amharic with Wi-Fi sync instructions
      await bot.telegram.sendMessage(
        tx.telegram_id,
        `✅ <b>ክፍያዎ ተረጋግጧል!</b>\n\n` +
        `💵 <b>${(tx.requested_amount || 0).toLocaleString()} ብር</b> ወደ ` +
        `<code>${tx.username}</code> (Shop ID: <code>${tx.shop_id}</code>) ተልኳል።\n\n` +
        `⚠️ <b>ማሳሰቢያ — ባላንስ ለማስገባት:</b>\n` +
        `1️⃣ ኮምፒውተርዎን ዋይፋይ (ኢንተርኔት) ጋር ያገናኙ\n` +
        `2️⃣ ATD Bingo አፕ ውስጥ ሲጫወቱ <b>"Sync Balance"</b> ቁልፍ ይንኩ\n` +
        `3️⃣ ጥቂት ሰኮንዶች ቆዩ — ባላንሱ ይታደሳል ✅`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[ADMIN APPROVE OFFLINE]', err.message);
      await bot.telegram.sendMessage(
        env.ADMIN_TELEGRAM_ID,
        `❌ Error approving ${txId}: ${err.message}`
      );
    }
  });

  // ════════════════════════════════════════════════════════════
  //  ADMIN: APPROVE ONLINE DEPOSIT
  // ════════════════════════════════════════════════════════════
  bot.action(/^admin:approve:online:(.+)$/, async (ctx) => {
    if (String(ctx.from.id) !== String(env.ADMIN_TELEGRAM_ID)) {
      return ctx.answerCbQuery('❌ ፈቃድ የለዎትም');
    }
    const txId = ctx.match[1];
    await ctx.answerCbQuery('⏳ በማስፈቀድ ላይ...');

    try {
      const { supabase } = require('../services/supabase');
      const { data: tx } = await supabase
        .from('transactions').select('*').eq('transaction_id', txId).single();
      if (!tx) return ctx.reply('❌ Transaction አልተገኘም: ' + txId);

      // Atomic credit to online_wallets
      await approveOnlineDepositRpc(txId, tx.telegram_id, tx.requested_amount);

      const originalMsg = ctx.callbackQuery.message?.text || ctx.callbackQuery.message?.caption || '';
      await ctx.editMessageText(
        originalMsg + '\n\n✅ ተፈቅዷል! Online Wallet ተሞልቷል።',
        { parse_mode: 'HTML' }
      ).catch(() =>
        ctx.editMessageCaption(originalMsg + '\n\n✅ ተፈቅዷል! Online Wallet ተሞልቷል።', { parse_mode: 'HTML' }).catch(() => {})
      );

      const wallet = await getOnlineWallet(tx.telegram_id);
      await bot.telegram.sendMessage(
        tx.telegram_id,
        `✅ <b>ኦንላይን Wallet ተሞልቷል!</b>\n\n` +
        `💵 ተጨመረ: <b>${(tx.requested_amount || 0).toLocaleString()} ETB</b>\n` +
        `💰 አሁን ያለ ባላንስ: <b>${parseFloat(wallet?.balance || 0).toLocaleString()} ETB</b>\n\n` +
        `🎮 ጨዋታ ለመጀመር ዋና ምናሌ ሄደው <b>ኦንላይን ጨዋታዎች</b> ይምረጡ!`,
        { parse_mode: 'HTML' }
      );
    } catch (err) {
      console.error('[ADMIN APPROVE ONLINE]', err.message);
      await bot.telegram.sendMessage(
        env.ADMIN_TELEGRAM_ID,
        `❌ Error approving online ${txId}: ${err.message}`
      );
    }
  });

  // ════════════════════════════════════════════════════════════
  //  ADMIN: REJECT ANY DEPOSIT
  // ════════════════════════════════════════════════════════════
  bot.action(/^admin:reject:(.+)$/, async (ctx) => {
    if (String(ctx.from.id) !== String(env.ADMIN_TELEGRAM_ID)) {
      return ctx.answerCbQuery('❌');
    }
    const txId = ctx.match[1];
    await ctx.answerCbQuery('❌ ውድቅ ተደርጓል');

    try {
      const { supabase } = require('../services/supabase');
      const { data: tx } = await supabase
        .from('transactions').select('*').eq('transaction_id', txId).single();

      await updateTransactionStatus(txId, 'REJECTED', 'Admin rejected');

      const originalMsg = ctx.callbackQuery.message?.text || ctx.callbackQuery.message?.caption || '';
      await ctx.editMessageText(
        originalMsg + '\n\n❌ ውድቅ ተደርጓል።',
        { parse_mode: 'HTML' }
      ).catch(() =>
        ctx.editMessageCaption(originalMsg + '\n\n❌ ውድቅ ተደርጓል።', { parse_mode: 'HTML' }).catch(() => {})
      );

      if (tx) {
        await bot.telegram.sendMessage(
          tx.telegram_id,
          `❌ <b>ክፍያዎ ውድቅ ተደርጓል።</b>\n\n` +
          `🔑 Ref: <code>${txId}</code>\n\n` +
          `ለበለጠ መረጃ Admin ያነጋግሩ:\n` +
          `📞 ${env.SUPPORT_PHONE_1}\n` +
          `💬 @${env.SUPPORT_TELEGRAM_USERNAME}`,
          { parse_mode: 'HTML' }
        );
      }
    } catch (err) {
      console.error('[ADMIN REJECT]', err.message);
      await ctx.answerCbQuery('❌ Error: ' + err.message);
    }
  });
};
