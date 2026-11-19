const express = require('express');
const config = require('../config');
const smsParser = require('../services/smsParser');
const supabaseService = require('../services/supabase');
const bingoSyncService = require('../services/bingoSync');
const logger = require('../utils/logger');
const amharicKeyboards = require('../keyboards/amharicKeyboards');

/**
 * Creates the SMS Forwarder Webhook Router
 * @param {import('telegraf').Telegraf} bot
 */
const createWebhookRouter = (bot) => {
  const router = express.Router();

  /**
   * POST /webhook/sms-forwarder
   * Endpoint for Android SMS Forwarder apps to automate Telebirr/Bank deposits
   */
  router.post('/sms-forwarder', async (req, res) => {
    // 1. Authenticate Request
    const secretHeader = req.headers['x-sms-secret'] || req.query.secret;
    if (!secretHeader || secretHeader !== config.smsWebhookSecret) {
      logger.warn('Unauthorized SMS forwarder webhook attempt received.');
      return res.status(401).json({ error: 'Unauthorized: Invalid SMS_WEBHOOK_SECRET' });
    }

    // 2. Extract SMS payload
    const payload = req.body || {};
    const rawSms =
      payload.body ||
      payload.text ||
      payload.message ||
      payload.content ||
      payload.msg ||
      (typeof payload === 'string' ? payload : '');

    const sender = payload.from || payload.sender || 'UNKNOWN';

    logger.info(`Received SMS from forwarder [${sender}]: ${rawSms.substring(0, 80)}...`);

    if (!rawSms) {
      return res.status(400).json({ error: 'Missing SMS body or text in request payload' });
    }

    // 3. Parse SMS with our Ethiopian SMS parser
    const parsed = smsParser.parse(rawSms);

    if (!parsed.success) {
      logger.info(`SMS not recognized as financial transaction: ${parsed.error}`);
      return res.status(200).json({
        success: false,
        message: 'SMS received but no valid transaction ID or amount was detected',
        reason: parsed.error,
      });
    }

    const { transactionId, amount, provider } = parsed;
    logger.info(`Parsed Forwarder SMS -> Provider: ${provider}, Txn: ${transactionId}, Amount: ${amount} ETB`);

    try {
      // 4. Check if there is a pending user transaction waiting for this transactionId
      const existingTx = await supabaseService.getTransactionById(transactionId);

      if (existingTx && existingTx.status === 'pending') {
        logger.info(`Auto-approving pending transaction for user ${existingTx.username} (Txn: ${transactionId})`);

        const approvalResult = await supabaseService.approveDepositRPC(
          transactionId,
          'SMS_FORWARDER_AUTO'
        );

        if (approvalResult && approvalResult.success) {
          const { user_id, telegram_id, new_balance } = approvalResult;

          // Sync to main game controller (bingo-sync-api)
          await bingoSyncService.notifyBalanceUpdated({
            userId: user_id,
            amount,
            newBalance: new_balance,
            transactionId,
          });

          // Notify User on Telegram immediately
          if (telegram_id && bot) {
            const userMsg =
              `🎉 <b>ክፍያዎ በራስ-ሰር ተረጋግጧል! (Auto-Approved)</b>\n\n` +
              `✅ <b>${Number(amount).toFixed(2)} ብር</b> ወደ ATD Bingo አካውንትዎ ገብቷል።\n` +
              `💳 <b>አዲሱ ባላንስዎ:</b> <code>${Number(new_balance).toFixed(2)} ብር</code>\n` +
              `🔖 <b>የግብይት ቁጥር:</b> <code>${transactionId}</code>\n\n` +
              `መልካም የጨዋታ ጊዜ ይሁንልዎት! 🎱🇪🇹`;

            try {
              await bot.telegram.sendMessage(telegram_id, userMsg, {
                parse_mode: 'HTML',
                ...amharicKeyboards.mainMenu(),
              });
            } catch (userNotifyErr) {
              logger.warn(`Could not notify user on Telegram: ${userNotifyErr.message}`);
            }
          }

          // Notify Admin on Telegram
          if (config.adminTelegramId && bot) {
            const adminAlert =
              `🤖 <b>Auto-Sync Deposit Approved via SMS Forwarder</b>\n\n` +
              `👤 <b>ተጠቃሚ:</b> <code>${existingTx.username}</code>\n` +
              `💰 <b>መጠን:</b> ${Number(amount).toFixed(2)} ብር\n` +
              `🔖 <b>Txn ID:</b> <code>${transactionId}</code>\n` +
              `💳 <b>አዲሱ ባላንስ:</b> ${Number(new_balance).toFixed(2)} ብር`;

            try {
              await bot.telegram.sendMessage(config.adminTelegramId, adminAlert, {
                parse_mode: 'HTML',
              });
            } catch (_) {}
          }

          return res.status(200).json({
            success: true,
            action: 'auto_approved',
            transaction_id: transactionId,
            amount,
            user: existingTx.username,
          });
        }
      }

      // If no pending transaction matches yet, acknowledge receipt
      return res.status(200).json({
        success: true,
        action: 'parsed_no_pending_match',
        transaction_id: transactionId,
        amount,
        provider,
        note: 'Incoming payment received and verified. Ready for user claim.',
      });
    } catch (err) {
      logger.error('Error handling SMS forwarder webhook:', err.message);
      return res.status(500).json({ error: 'Internal server error processing webhook' });
    }
  });

  return router;
};

// Render Free Tier እንዳይተኛ (Anti-Sleep Keep-Alive Pinger)
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || 'https://atd-bingo-bot.onrender.com';

setInterval(async () => {
  try {
    const response = await fetch(`${RENDER_URL}/health`);
    logger.info(`[Keep-Alive] Pinged ${RENDER_URL}/health - Status: ${response.status}`);
  } catch (err) {
    logger.error(`[Keep-Alive] Ping failed: ${err.message}`);
  }
}, 5 * 60 * 1000);

module.exports = createWebhookRouter;
