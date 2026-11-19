const { Telegraf } = require('telegraf');
const config = require('./config');
const logger = require('./utils/logger');
const sessionStore = require('./utils/sessionStore');
const amharicKeyboards = require('./keyboards/amharicKeyboards');

// Handlers
const startHandler = require('./handlers/start');
const balanceHandler = require('./handlers/balance');
const depositHandler = require('./handlers/deposit');
const downloadHandler = require('./handlers/download');
const supportHandler = require('./handlers/support');
const adminHandler = require('./handlers/admin');

/**
 * Configure and initialize Telegraf bot instance
 */
const createBot = () => {
  if (!config.telegramBotToken) {
    logger.warn('TELEGRAM_BOT_TOKEN is missing. Bot cannot be initialized.');
    return null;
  }

  const bot = new Telegraf(config.telegramBotToken);

  // Global Error Handler
  bot.catch((err, ctx) => {
    logger.error(`Unhandled error for updateType "${ctx.updateType}":`, err.message || err);
    try {
      ctx.reply('ይቅርታ፣ ያልታሰበ ስህተት ተከስቷል። እባክዎ እንደገና ይሞክሩ ወይም /start ብለው ይጀምሩ።');
    } catch (_) {}
  });

  // -------------------------------------------------------------
  // COMMANDS
  // -------------------------------------------------------------
  bot.command('start', (ctx) => startHandler.handleStart(ctx));
  bot.command('deposit', (ctx) => depositHandler.handleDepositMenu(ctx));
  bot.command('balance', (ctx) => balanceHandler.handleMyBalance(ctx));
  bot.command('download', (ctx) => downloadHandler.handleDownload(ctx));
  bot.command('support', (ctx) => supportHandler.handleSupportMenu(ctx));
  bot.command('history', (ctx) => balanceHandler.handleHistory(ctx));
  bot.command('setapp', (ctx) => downloadHandler.handleSetApp(ctx));

  // -------------------------------------------------------------
  // CONTACT SHARING (1-click phone registration)
  // -------------------------------------------------------------
  bot.on('contact', (ctx) => startHandler.handleContact(ctx));

  // -------------------------------------------------------------
  // INLINE CALLBACK QUERIES
  // -------------------------------------------------------------
  // Main Menu Navigation
  bot.action('menu_main', async (ctx) => {
    await ctx.answerCbQuery();
    return ctx.reply('ከታች ባሉት አማራጮች ይጠቀሙ:', amharicKeyboards.mainMenu());
  });

  bot.action('menu_support', (ctx) => supportHandler.handleSupportMenu(ctx));
  bot.action('menu_download', (ctx) => downloadHandler.handleDownload(ctx));
  bot.action('view_history', (ctx) => balanceHandler.handleHistory(ctx));

  // Deposit Actions
  bot.action('deposit_select_method', (ctx) => depositHandler.handleDepositMenu(ctx));
  bot.action('pay_telebirr', (ctx) => depositHandler.handleMethodSelection(ctx, 'TELEBIRR'));
  bot.action('pay_cbe', (ctx) => depositHandler.handleMethodSelection(ctx, 'CBE'));
  bot.action('pay_boa', (ctx) => depositHandler.handleMethodSelection(ctx, 'BOA'));

  // Support & FAQ Actions
  bot.action('faq_payment_delay', (ctx) => supportHandler.handleFaqPayment(ctx));
  bot.action('faq_app_help', (ctx) => supportHandler.handleFaqApp(ctx));
  bot.action('faq_account_link', (ctx) => supportHandler.handleFaqAccount(ctx));

  // Admin Approval & Rejection Actions (approve_<txId>, reject_<txId>)
  bot.action(/^approve_(.+)$/, (ctx) => {
    const txId = ctx.match[1];
    return adminHandler.handleApprove(ctx, txId);
  });

  bot.action(/^reject_(.+)$/, (ctx) => {
    const txId = ctx.match[1];
    return adminHandler.handleReject(ctx, txId);
  });

  // -------------------------------------------------------------
  // DOCUMENT HANDLER (For offline .zip uploads by Admin)
  // -------------------------------------------------------------
  bot.on('document', (ctx) => {
    const caption = ctx.message.caption || '';
    if (caption.startsWith('/setapp')) {
      return downloadHandler.handleSetApp(ctx);
    }
  });

  // -------------------------------------------------------------
  // PHOTO HANDLER (For receipt screenshots)
  // -------------------------------------------------------------
  bot.on('photo', (ctx) => {
    const photos = ctx.message.photo;
    const caption = ctx.message.caption || '';
    return depositHandler.handlePaymentPhoto(ctx, photos, caption);
  });

  // -------------------------------------------------------------
  // TEXT MESSAGE HANDLER (Persistent Menu buttons & User Input)
  // -------------------------------------------------------------
  bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim();
    const telegramId = ctx.from.id;

    // 1. Reply Keyboard Menu Clicks
    switch (text) {
      case '💰 ባላንስ መሙላት':
        return depositHandler.handleDepositMenu(ctx);

      case '💳 የእኔ ባላንስ':
        return balanceHandler.handleMyBalance(ctx);

      case '📲 ኦፍላይን አፕ አውርድ':
        return downloadHandler.handleDownload(ctx);

      case '📜 የግብይት ታሪክ':
        return balanceHandler.handleHistory(ctx);

      case '📞 እርዳታ':
        return supportHandler.handleSupportMenu(ctx);

      case '❌ ተመለስ':
        sessionStore.clear(telegramId);
        return ctx.reply('ወደ ዋናው ገጽ ተመልሰዋል:', amharicKeyboards.mainMenu());
    }

    // 2. Check User Session State
    const session = sessionStore.get(telegramId);

    if (session && session.step === 'AWAITING_ACCOUNT_LINK') {
      return startHandler.linkWithIdentifier(
        ctx,
        telegramId,
        ctx.from.username,
        text
      );
    }

    if (session && session.step === 'AWAITING_PAYMENT_PROOF') {
      return depositHandler.handlePaymentText(ctx, text);
    }

    // 3. Fallback: Check if message is a bank / Telebirr SMS or transaction code
    // If user directly pasted an SMS without clicking the menu first
    const looksLikeSms =
      /telebirr|ቴሌብር|ብር|ETB|FT[0-9A-Z]|Transaction|Txn/i.test(text);

    if (looksLikeSms) {
      return depositHandler.handlePaymentText(ctx, text);
    }

    // 4. Default fallback: prompt user with persistent main menu
    return ctx.reply(
      'እንኳን ወደ ATD Bingo በደህና መጡ! ከታች ካሉት አማራጮች አንዱን ይምረጡ:',
      amharicKeyboards.mainMenu()
    );
  });

  return bot;
};

module.exports = createBot;
