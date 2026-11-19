const supabaseService = require('../services/supabase');
const bingoSyncService = require('../services/bingoSync');
const amharicKeyboards = require('../keyboards/amharicKeyboards');
const config = require('../config');
const logger = require('../utils/logger');

const adminHandler = {
  /**
   * Handle Admin click on [✅ አጽድቅ (Approve)]
   */
  async handleApprove(ctx, transactionId) {
    const adminTelegramId = String(ctx.from.id);
    const configuredAdminId = String(config.adminTelegramId).trim();

    // Verify Admin rights
    if (configuredAdminId && adminTelegramId !== configuredAdminId) {
      return ctx.answerCbQuery('⛔ ይህንን እርምጃ የመፈጸም ፈቃድ የለዎትም።', { show_alert: true });
    }

    await ctx.answerCbQuery('ክፍያው እየጸደቀ ነው...');

    try {
      const adminName = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name || 'Admin';

      // 1. Atomically approve deposit in Supabase
      const result = await supabaseService.approveDepositRPC(transactionId, adminName);

      if (!result || !result.success) {
        const errorReason = result && result.error ? result.error : 'የማይታወቅ ስህተት';
        logger.warn(`Admin approval failed for ${transactionId}: ${errorReason}`);
        return ctx.reply(`⚠️ ማጽደቅ አልተቻለም: ${errorReason}`);
      }

      const { user_id, telegram_id, amount, new_balance } = result;

      // 2. Notify main game controller (bingo-sync-api)
      await bingoSyncService.notifyBalanceUpdated({
        userId: user_id,
        amount,
        newBalance: new_balance,
        transactionId,
      });

      // 3. Update the Admin Telegram message to show approval
      const approvedAdminNote =
        `\n\n═══════════════════════\n` +
        `✅ <b>የጸደቀ ግብይት (APPROVED)</b>\n` +
        `👤 ያጸደቀው አድሚን: ${adminName}\n` +
        `💰 የተጨመረው: ${Number(amount).toFixed(2)} ብር\n` +
        `💳 አዲሱ ባላንስ: ${Number(new_balance).toFixed(2)} ብር\n` +
        `⏰ ሰዓት: ${new Date().toLocaleString()}`;

      try {
        if (ctx.callbackQuery.message.caption) {
          await ctx.editMessageCaption(ctx.callbackQuery.message.caption + approvedAdminNote, {
            parse_mode: 'HTML',
          });
        } else {
          await ctx.editMessageText(ctx.callbackQuery.message.text + approvedAdminNote, {
            parse_mode: 'HTML',
          });
        }
      } catch (uiErr) {
        logger.warn(`Could not update admin message text: ${uiErr.message}`);
      }

      // 4. Send Instant Amharic Notification to User
      if (telegram_id) {
        const userCelebrationMsg =
          `🎉 <b>ክፍያዎ ተረጋግጧል!</b>\n\n` +
          `✅ <b>${Number(amount).toFixed(2)} ብር</b> ወደ ATD Bingo አካውንትዎ ገብቷል።\n` +
          `💳 <b>አዲሱ ባላንስዎ:</b> <code>${Number(new_balance).toFixed(2)} ብር</code>\n` +
          `🔖 <b>የግብይት ቁጥር:</b> <code>${transactionId}</code>\n\n` +
          `መልካም የጨዋታ ጊዜ ይሁንልዎት! 🎱🇪🇹`;

        try {
          await ctx.telegram.sendMessage(telegram_id, userCelebrationMsg, {
            parse_mode: 'HTML',
            ...amharicKeyboards.mainMenu(),
          });
          logger.success(`User ${telegram_id} notified of approved deposit ${transactionId}`);
        } catch (notifyErr) {
          logger.warn(`Could not send telegram message to user ${telegram_id}: ${notifyErr.message}`);
        }
      }

      logger.success(`Transaction ${transactionId} successfully approved by ${adminName}`);
    } catch (err) {
      logger.error(`Exception during admin approval for ${transactionId}:`, err.message);
      return ctx.reply(`❌ ስህተት ተከስቷል: ${err.message}`);
    }
  },

  /**
   * Handle Admin click on [❌ ውድቅ አድርግ (Reject)]
   */
  async handleReject(ctx, transactionId) {
    const adminTelegramId = String(ctx.from.id);
    const configuredAdminId = String(config.adminTelegramId).trim();

    if (configuredAdminId && adminTelegramId !== configuredAdminId) {
      return ctx.answerCbQuery('⛔ ይህንን እርምጃ የመፈጸም ፈቃድ የለዎትም።', { show_alert: true });
    }

    await ctx.answerCbQuery('ክፍያው ውድቅ እየተደረገ ነው...');

    try {
      const adminName = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name || 'Admin';

      // 1. Reject deposit in Supabase
      const result = await supabaseService.rejectDepositRPC(
        transactionId,
        'የከፈሉት ክፍያ በባንክ አልተገኘም ወይም መረጃው የተሳሳተ ነው',
        adminName
      );

      if (!result || !result.success) {
        return ctx.reply(`⚠️ ውድቅ ማድረግ አልተቻለም: ${result ? result.error : 'ያልታወቀ ስህተት'}`);
      }

      const { telegram_id } = result;

      // 2. Update Admin message
      const rejectedAdminNote =
        `\n\n═══════════════════════\n` +
        `❌ <b>ውድቅ የተደረገ ግብይት (REJECTED)</b>\n` +
        `👤 ውድቅ ያደረገው: ${adminName}\n` +
        `⏰ ሰዓት: ${new Date().toLocaleString()}`;

      try {
        if (ctx.callbackQuery.message.caption) {
          await ctx.editMessageCaption(ctx.callbackQuery.message.caption + rejectedAdminNote, {
            parse_mode: 'HTML',
          });
        } else {
          await ctx.editMessageText(ctx.callbackQuery.message.text + rejectedAdminNote, {
            parse_mode: 'HTML',
          });
        }
      } catch (uiErr) {
        logger.warn(`Could not update admin rejected text: ${uiErr.message}`);
      }

      // 3. Notify User of rejection with support guidance
      if (telegram_id) {
        const userRejectionMsg =
          `❌ <b>የክፍያ ጥያቄዎ ውድቅ ተደርጓል!</b>\n\n` +
          `• <b>የግብይት ቁጥር:</b> <code>${transactionId}</code>\n` +
          `• <b>ምክንያት:</b> የከፈሉት ክፍያ በባንክ አልተገኘም ወይም መረጃው የተሳሳተ ነው።\n\n` +
          `ትክክለኛ ክፍያ ፈጽመው ከሆነ እባክዎ ከታች ያለውን <b>📞 እርዳታ</b> በመጫን ደረሰኝዎን ለአድሚን ይላኩ።`;

        try {
          await ctx.telegram.sendMessage(telegram_id, userRejectionMsg, {
            parse_mode: 'HTML',
            ...amharicKeyboards.supportMenu(),
          });
        } catch (notifyErr) {
          logger.warn(`Could not send rejection message to user ${telegram_id}: ${notifyErr.message}`);
        }
      }

      logger.info(`Transaction ${transactionId} rejected by ${adminName}`);
    } catch (err) {
      logger.error(`Exception rejecting transaction ${transactionId}:`, err.message);
      return ctx.reply(`❌ ስህተት ተከስቷል: ${err.message}`);
    }
  },
};

module.exports = adminHandler;
