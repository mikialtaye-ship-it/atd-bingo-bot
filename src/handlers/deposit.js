const supabaseService = require('../services/supabase');
const smsParser = require('../services/smsParser');
const sessionStore = require('../utils/sessionStore');
const amharicKeyboards = require('../keyboards/amharicKeyboards');
const config = require('../config');
const logger = require('../utils/logger');
const bingoSyncService = require('../services/bingoSync');

const depositHandler = {
  /**
   * Display payment options
   */
  async handleDepositMenu(ctx) {
    const telegramId = ctx.from.id;

    try {
      const user = await supabaseService.getUserByTelegramId(telegramId);
      if (!user) {
        return ctx.replyWithHTML(
          '⚠️ <b>አካውንትዎ አልተገናኘም!</b>\n\nባላንስ ለመሙላት መጀመሪያ /start ብለው አካውንትዎን ያገናኙ።',
          amharicKeyboards.requestContact()
        );
      }

      const msg =
        `💰 <b>የ ATD Bingo ባላንስ መሙያ (Deposit)</b>\n\n` +
        `እባክዎ ክፍያ የሚፈጽሙበትን ምቹ የክፍያ አማራጭ ይምረጡ:`;

      if (ctx.callbackQuery) {
        return ctx.editMessageText(msg, {
          parse_mode: 'HTML',
          ...amharicKeyboards.paymentMethods(),
        });
      }

      return ctx.replyWithHTML(msg, amharicKeyboards.paymentMethods());
    } catch (err) {
      logger.error('Error in handleDepositMenu:', err.message);
      return ctx.reply('ባላንስ መሙያ አማራጮችን በማምጣት ላይ ችግር አጋጥሟል።');
    }
  },

  /**
   * Show payment details for chosen method
   */
  async handleMethodSelection(ctx, method) {
    const telegramId = ctx.from.id;
    let title = '';
    let accountInfo = '';

    if (method === 'TELEBIRR') {
      title = '📱 <b>ቴሌብር (Telebirr)</b>';
      accountInfo =
        `📞 <b>ስልክ ቁጥር:</b> <code>${config.telebirr.number}</code>\n` +
        `👤 <b>የመለያ ስም:</b> <b>${config.telebirr.name}</b>`;
    } else if (method === 'CBE') {
      title = '🏦 <b>የኢትዮጵያ ንግድ ባንክ (CBE)</b>';
      accountInfo =
        `💳 <b>የሂሳብ ቁጥር:</b> <code>${config.cbe.account}</code>\n` +
        `👤 <b>የመለያ ስም:</b> <b>${config.cbe.name}</b>`;
    } else if (method === 'BOA') {
      title = '🏛️ <b>አቢሲኒያ ባንክ (Bank of Abyssinia)</b>';
      accountInfo =
        `💳 <b>የሂሳብ ቁጥር:</b> <code>${config.boa.account}</code>\n` +
        `👤 <b>የመለያ ስም:</b> <b>${config.boa.name}</b>`;
    }

    sessionStore.set(telegramId, {
      step: 'AWAITING_PAYMENT_PROOF',
      selectedMethod: method,
    });

    const instructionMsg =
      `${title}\n\n` +
      `${accountInfo}\n\n` +
      `═══════════════════════\n` +
      `📋 <b>ክፍያውን ከፈጸሙ በኋላ:</b>\n\n` +
      `1️⃣ ከቴሌብር ወይም ከባንክ የደረሰዎትን <b>የማረጋገጫ SMS</b> ሙሉውን ኮፒ አድርገው እዚህ ይላኩ፤\n` +
      `ወይም\n` +
      `2️⃣ የከፈሉበትን <b>ደረሰኝ ፎቶ (Screenshot)</b> እዚህ ይላኩ።\n\n` +
      `ሲስተሙ የግብይት ቁጥሩን እና መጠኑን በራሱ ለይቶ ያረጋግጥልዎታል!`;

    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
      return ctx.editMessageText(instructionMsg, {
        parse_mode: 'HTML',
        ...amharicKeyboards.paymentInstructionsMenu(),
      });
    }

    return ctx.replyWithHTML(instructionMsg, amharicKeyboards.paymentInstructionsMenu());
  },

  /**
   * Process payment confirmation SMS text
   */
  async handlePaymentText(ctx, text) {
    const telegramId = ctx.from.id;
    const session = sessionStore.get(telegramId);
    const selectedMethod = session && session.selectedMethod ? session.selectedMethod : null;

    // Parse SMS
    const parseResult = smsParser.parse(text);

    if (!parseResult.success) {
      const guidance =
        `⚠️ <b>የግብይት ቁጥር ወይም መጠን ማግኘት አልተቻለም!</b>\n\n` +
        `እባክዎ ከሚከተሉት አንዱን ያድርጉ:\n` +
        `1. ከቴሌብር ወይም ከባንክ የደረሰዎትን <b>SMS ሙሉውን ኮፒ አድርገው</b> ይላኩ\n` +
        `2. ወይም የከፈሉበትን <b>የደረሰኝ ፎቶ (Screenshot)</b> እዚህ ይላኩ\n` +
        `3. ወይም የግብይት ቁጥሩን እና መጠኑን ብቻ ይላኩ (ምሳሌ: <code>10B9K38L21 200</code>)\n\n` +
        `ድጋፍ ከፈለጉ ከታች ያለውን <b>📞 እርዳታ</b> ይጫኑ።`;

      return ctx.replyWithHTML(guidance, amharicKeyboards.paymentInstructionsMenu());
    }

    const { transactionId, amount, provider } = parseResult;
    const paymentMethod = selectedMethod || provider || 'TELEBIRR';

    // 1. Verify User is linked
    const user = await supabaseService.getUserByTelegramId(telegramId);
    if (!user) {
      return ctx.replyWithHTML(
        '⚠️ <b>አካውንትዎ አልተገናኘም!</b>\n\nእባክዎ መጀመሪያ /start ብለው አካውንትዎን ያገናኙ።',
        amharicKeyboards.requestContact()
      );
    }

    // 2. Check for duplicate transaction ID (Double-spending protection)
    const isDuplicate = await supabaseService.checkDuplicateTransaction(transactionId);
    if (isDuplicate) {
      const duplicateMsg =
        `🚫 <b>ይህ የግብይት ቁጥር ቀደም ሲል ጥቅም ላይ ውሏል!</b>\n\n` +
        `• <b>የግብይት ቁጥር:</b> <code>${transactionId}</code>\n\n` +
        `ተመሳሳይ ደረሰኝ በድጋሚ ማስገባት አይቻልም። ጥያቄ ካለዎት እባክዎ <b>📞 እርዳታ</b> የሚለውን ይጫኑ።`;

      return ctx.replyWithHTML(duplicateMsg, amharicKeyboards.supportMenu());
    }

    // 3. Insert pending transaction into Supabase
    const insertResult = await supabaseService.createPendingTransaction({
      userId: user.id,
      telegramId,
      username: user.username,
      amount,
      paymentMethod,
      transactionId,
      rawSms: text,
      source: 'telegram_bot',
    });

    if (!insertResult.success) {
      return ctx.reply('ይቅርታ፣ ክፍያዎን በመመዝገብ ላይ ስህተት ተፈጥሯል። እባክዎ ትንሽ ቆይተው እንደገና ይሞክሩ።');
    }

    sessionStore.clear(telegramId);

    // 4. Handle AUTO vs ADMIN Verification Mode
    if (config.verificationMode === 'AUTO') {
      // Auto-approve mode
      logger.info(`Auto-approving transaction ${transactionId} for user ${user.username}...`);
      const approval = await supabaseService.approveDepositRPC(transactionId, 'AUTO_VERIFIED');

      if (approval && approval.success) {
        // Sync to controller
        await bingoSyncService.notifyBalanceUpdated({
          userId: user.id,
          amount,
          newBalance: approval.new_balance,
          transactionId,
        });

        const successMsg =
          `🎉 <b>ክፍያዎ በተሳካ ሁኔታ ተረጋግጧል!</b>\n\n` +
          `💰 <b>የተጨመረው መጠን:</b> <code>${Number(amount).toFixed(2)} ብር</code>\n` +
          `💳 <b>አዲሱ ባላንስዎ:</b> <code>${Number(approval.new_balance).toFixed(2)} ብር</code>\n` +
          `🔖 <b>የግብይት ቁጥር:</b> <code>${transactionId}</code>\n\n` +
          `በ ATD Bingo መልካም የጨዋታ ጊዜ ይሁንልዎት! 🎱🇪🇹`;

        return ctx.replyWithHTML(successMsg, amharicKeyboards.mainMenu());
      }
    }

    // 5. Default ADMIN Verification Mode
    const userReceiptMsg =
      `⏳ <b>የክፍያ ጥያቄዎ ደርሶናል!</b>\n\n` +
      `• <b>የግብይት ቁጥር:</b> <code>${transactionId}</code>\n` +
      `• <b>የክፍያ መጠን:</b> <code>${Number(amount).toFixed(2)} ብር</code>\n` +
      `• <b>የክፍያ ዘዴ:</b> ${paymentMethod}\n` +
      `• <b>የአካውንት ስም:</b> <code>${user.username}</code>\n\n` +
      `ክፍያው እንደተጣራ በደቂቃዎች ውስጥ ወደ ATD Bingo አካውንትዎ ገቢ ተደርጎ መልዕክት ይደርስዎታል!`;

    await ctx.replyWithHTML(userReceiptMsg, amharicKeyboards.mainMenu());

    // 6. Forward to Admin for approval
    await depositHandler.forwardToAdminForApproval(ctx.telegram, {
      transactionId,
      amount,
      paymentMethod,
      username: user.username,
      phone: user.phone,
      telegramId,
      rawSms: text,
      receiptUrl: null,
    });
  },

  /**
   * Process uploaded receipt screenshot
   */
  async handlePaymentPhoto(ctx, photoArray, caption = '') {
    const telegramId = ctx.from.id;
    const session = sessionStore.get(telegramId);
    const selectedMethod = session && session.selectedMethod ? session.selectedMethod : 'OTHER';

    // 1. Verify User
    const user = await supabaseService.getUserByTelegramId(telegramId);
    if (!user) {
      return ctx.replyWithHTML(
        '⚠️ <b>አካውንትዎ አልተገናኘም!</b>\n\nእባክዎ መጀመሪያ /start ብለው አካውንትዎን ያገናኙ።',
        amharicKeyboards.requestContact()
      );
    }

    // Get highest quality photo file_id
    const bestPhoto = photoArray[photoArray.length - 1];
    const fileId = bestPhoto.file_id;

    // Check if caption contains transaction ID and amount
    let transactionId = null;
    let amount = 0;

    if (caption) {
      const parsed = smsParser.parse(caption);
      if (parsed.success) {
        transactionId = parsed.transactionId;
        amount = parsed.amount;
      }
    }

    // Generate fallback unique reference if caption didn't include transaction ID
    if (!transactionId) {
      const timestamp = Date.now().toString().slice(-6);
      transactionId = `IMG-${telegramId}-${timestamp}`;
      amount = 0.0; // Admin will verify amount visually
    }

    // Check duplicate
    const isDuplicate = await supabaseService.checkDuplicateTransaction(transactionId);
    if (isDuplicate) {
      return ctx.replyWithHTML(
        `🚫 ይህ ደረሰኝ ቀደም ሲል ተመዝግቧል (መለያ: <code>${transactionId}</code>)። ጥያቄ ካለዎት <b>📞 እርዳታ</b> ይጫኑ።`,
        amharicKeyboards.supportMenu()
      );
    }

    // Insert pending transaction
    const insertResult = await supabaseService.createPendingTransaction({
      userId: user.id,
      telegramId,
      username: user.username,
      amount: amount > 0 ? amount : 1.0, // placeholder amount until admin approves
      paymentMethod: selectedMethod,
      transactionId,
      receiptUrl: fileId,
      rawSms: caption || 'Screenshot uploaded',
      source: 'telegram_bot',
    });

    sessionStore.clear(telegramId);

    if (!insertResult.success) {
      return ctx.reply('ይቅርታ፣ ደረሰኙን በማስቀመጥ ላይ ችግር ተፈጥሯል። እባክዎ እንደገና ይሞክሩ።');
    }

    // Acknowledge to user
    const confirmMsg =
      `📸 <b>የከፈሉበት ደረሰኝ ፎቶ ደርሶናል!</b>\n\n` +
      `• <b>የማጣቀሻ መለያ:</b> <code>${transactionId}</code>\n` +
      `• <b>ተጠቃሚ:</b> <code>${user.username}</code>\n\n` +
      `አድሚኑ ደረሰኙን ተመልክቶ በደቂቃዎች ውስጥ ያጸድቅልዎታል። እንደጸደቀ ማሳወቂያ ይደርስዎታል!`;

    await ctx.replyWithHTML(confirmMsg, amharicKeyboards.mainMenu());

    // Forward Photo to Admin
    await depositHandler.forwardToAdminForApproval(ctx.telegram, {
      transactionId,
      amount,
      paymentMethod: selectedMethod,
      username: user.username,
      phone: user.phone,
      telegramId,
      rawSms: caption || 'Receipt Screenshot',
      receiptUrl: fileId,
    });
  },

  /**
   * Forward deposit proof to ADMIN_TELEGRAM_ID with inline Approve / Reject buttons
   */
  async forwardToAdminForApproval(telegram, depositData) {
    const adminId = config.adminTelegramId;
    if (!adminId) {
      logger.warn('ADMIN_TELEGRAM_ID not set. Admin approval message cannot be sent.');
      return;
    }

    const {
      transactionId,
      amount,
      paymentMethod,
      username,
      phone,
      telegramId,
      rawSms,
      receiptUrl,
    } = depositData;

    const adminMessage =
      `🔔 <b>አዲስ የባላንስ መሙያ ጥያቄ (New Deposit Alert)</b>\n\n` +
      `👤 <b>ተጠቃሚ:</b> <code>${username || 'N/A'}</code>\n` +
      `📱 <b>ስልክ:</b> <code>${phone || 'N/A'}</code>\n` +
      `🆔 <b>Telegram ID:</b> <code>${telegramId}</code>\n\n` +
      `💰 <b>መጠን:</b> <b>${amount > 0 ? Number(amount).toFixed(2) + ' ብር' : 'ፎቶውን ይመልከቱ'}</b>\n` +
      `💳 <b>የክፍያ ዘዴ:</b> <b>${paymentMethod}</b>\n` +
      `🔖 <b>የግብይት ቁጥር:</b> <code>${transactionId}</code>\n\n` +
      `📝 <b>የተላከው መረጃ/SMS:</b>\n<i>${rawSms || 'ፎቶ ተልኳል'}</i>`;

    try {
      if (receiptUrl) {
        // Send Photo to Admin with Caption and Action Buttons
        await telegram.sendPhoto(adminId, receiptUrl, {
          caption: adminMessage,
          parse_mode: 'HTML',
          ...amharicKeyboards.adminApproval(transactionId),
        });
      } else {
        // Send Text to Admin with Action Buttons
        await telegram.sendMessage(adminId, adminMessage, {
          parse_mode: 'HTML',
          ...amharicKeyboards.adminApproval(transactionId),
        });
      }
      logger.info(`Deposit request forwarded to Admin (${adminId}) for Txn: ${transactionId}`);
    } catch (err) {
      logger.error(`Failed to forward deposit to Admin (${adminId}):`, err.message);
    }
  },
};

module.exports = depositHandler;
