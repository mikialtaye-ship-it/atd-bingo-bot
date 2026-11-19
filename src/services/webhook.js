'use strict';
const env = require('../config/env');
const { parseSms } = require('../utils/smsParser');
const {
  getOnlineWallet,
  creditOnlineWallet,
  debitOnlineWallet,
} = require('./supabase');

/**
 * Register all Express routes:
 *  GET  /health                        — Render keep-alive / uptime check
 *  POST /webhook/sms-forwarder         — Android SMS Forwarder app webhook
 *  GET  /api/online-user/:telegram_id  — Read online wallet balance (game API)
 *  POST /api/online-user/bet-result    — Debit / credit online wallet (game API)
 */
function setupWebhookRoutes(app, bot) {

  // ════════════════════════════════════════════════════════════
  //  SMS FORWARDER WEBHOOK
  // ════════════════════════════════════════════════════════════
  app.post('/webhook/sms-forwarder', async (req, res) => {
    // Validate secret
    const incomingSecret = req.headers['x-webhook-secret'] || req.query.secret || '';
    if (env.SMS_WEBHOOK_SECRET && incomingSecret !== env.SMS_WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Unauthorized: invalid webhook secret' });
    }

    const { from, text } = req.body || {};
    if (!text) {
      return res.status(400).json({ error: 'Missing required field: text' });
    }

    const parsed = parseSms(text);
    console.log('[SMS_WEBHOOK] from:', from, '| parsed:', parsed);

    // Forward raw SMS + parse result to Admin
    if (env.ADMIN_TELEGRAM_ID) {
      try {
        const caption =
          `📩 <b>SMS ደረሰ (Auto-forwarder)</b>\n` +
          `From: <code>${from || 'Unknown'}</code>\n\n` +
          `<pre>${text.substring(0, 800)}</pre>\n\n` +
          (parsed
            ? `✅ Parsed → Ref: <code>${parsed.transactionId}</code> | Amount: <b>${parsed.amount ?? 'N/A'} ETB</b> | Bank: ${parsed.bank}`
            : `⚠️ SMS parse ሊሠራ አልቻለም (Telebirr/CBE/BOA format expected)`);
        await bot.telegram.sendMessage(env.ADMIN_TELEGRAM_ID, caption, { parse_mode: 'HTML' });
      } catch (alertErr) {
        console.error('[SMS_WEBHOOK] Admin alert failed:', alertErr.message);
      }
    }

    return res.json({ ok: true, parsed: parsed || null });
  });

  // ════════════════════════════════════════════════════════════
  //  ONLINE GAME WALLET API — Auth middleware
  // ════════════════════════════════════════════════════════════
  function requireGameAuth(req, res, next) {
    const authHeader = req.headers['authorization'] || '';
    const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!env.ONLINE_GAME_API_SECRET || token !== env.ONLINE_GAME_API_SECRET) {
      return res.status(401).json({ error: 'Unauthorized: invalid API secret' });
    }
    next();
  }

  // ── GET /api/online-user/:telegram_id ────────────────────────
  app.get('/api/online-user/:telegram_id', requireGameAuth, async (req, res) => {
    try {
      const telegramId = parseInt(req.params.telegram_id, 10);
      if (isNaN(telegramId)) {
        return res.status(400).json({ error: 'Invalid telegram_id: must be a number' });
      }
      const wallet = await getOnlineWallet(telegramId);
      if (!wallet) {
        return res.status(404).json({ error: 'Online wallet not found for this telegram_id' });
      }
      return res.json({
        telegram_id:  wallet.telegram_id,
        balance:      parseFloat(wallet.balance),
        updated_at:   wallet.updated_at,
      });
    } catch (err) {
      console.error('[API] GET wallet error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/online-user/bet-result ─────────────────────────
  app.post('/api/online-user/bet-result', requireGameAuth, async (req, res) => {
    try {
      const { telegram_id, amount, description } = req.body || {};
      if (telegram_id === undefined || amount === undefined) {
        return res.status(400).json({ error: 'telegram_id and amount are required' });
      }
      const telegramId = parseInt(telegram_id, 10);
      const delta      = parseFloat(amount);
      if (isNaN(telegramId) || isNaN(delta)) {
        return res.status(400).json({ error: 'Invalid telegram_id or amount' });
      }

      if (delta >= 0) {
        await creditOnlineWallet(telegramId, delta);
      } else {
        await debitOnlineWallet(telegramId, Math.abs(delta));
      }

      const wallet = await getOnlineWallet(telegramId);
      const newBalance = parseFloat(wallet?.balance ?? 0);

      console.log(`[API] bet-result tg=${telegramId} delta=${delta} new_balance=${newBalance} desc="${description}"`);
      return res.json({
        ok:          true,
        telegram_id: telegramId,
        delta,
        new_balance: newBalance,
        description: description || '',
      });
    } catch (err) {
      console.error('[API] POST bet-result error:', err.message);
      const statusCode = err.message.includes('Insufficient') ? 400 : 500;
      return res.status(statusCode).json({ error: err.message });
    }
  });
}

module.exports = { setupWebhookRoutes };
