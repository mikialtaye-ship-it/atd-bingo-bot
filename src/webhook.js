const express = require('express');
const config = require('./config');
const db = require('./supabase');
const { parsePaymentSms, pushToControlDashboard } = require('./payments');
const { bot, notifyAdmins } = require('./bot');

const router = express.Router();

// ============================================================================
// 1. RENDER HEALTH CHECK
// ============================================================================
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'ATD Bingo Bot (@atd_bingo_bot)',
    timestamp: new Date().toISOString()
  });
});

// ============================================================================
// 2. ANDROID SMS FORWARDER WEBHOOK (AUTO-VERIFY MATCHING PENDING DEPOSITS)
// ============================================================================
router.post('/webhook/sms-forwarder', async (req, res) => {
  const secret = req.headers['x-webhook-secret'] || req.body?.secret;
  if (secret !== config.smsWebhookSecret) {
    return res.status(401).json({ success: false, error: 'Unauthorized webhook secret' });
  }

  const smsText = req.body?.message || req.body?.text || req.body?.sms || '';
  const parsed = parsePaymentSms(smsText);

  if (!parsed.isValid) {
    return res.status(200).json({ success: true, ignored: true, reason: 'Unrecognized SMS format' });
  }

  try {
    const pendingTx = await db.findPendingTxByRef(parsed.transactionId);
    if (!pendingTx) {
      return res.status(200).json({
        success: true,
        matched: false,
        transactionId: parsed.transactionId
      });
    }

    if (parsed.amount < Number(pendingTx.amount)) {
      return res.status(200).json({
        success: false,
        matched: true,
        reason: 'SMS amount is less than requested amount'
      });
    }

    // Auto-approve matching pending transaction
    if (pendingTx.mode === 'OFFLINE_SHOP') {
      const rpc = await db.approveOfflineDeposit(pendingTx.id, 0);
      if (rpc.success) {
        const syncRes = await pushToControlDashboard(
          {
            shop_id: rpc.shop_id,
            username: rpc.username,
            amount: rpc.amount,
            ref_id: rpc.ref_id
          },
          notifyAdmins
        );
        await db.updateTransactionSyncStatus(pendingTx.id, syncRes.success ? 'SYNCED' : 'FAILED');

        await bot.telegram.sendMessage(
          rpc.telegram_id,
          `✅ ክፍያዎ በራስ-ሰር (Auto-SMS) ተረጋግጧል! *${rpc.amount} ብር* ወደ *${rpc.username}* (Shop ID: \`${rpc.shop_id}\`) ተልኳል።\n\n` +
            `⚠️ *ማሳሰቢያ፦* ባላንሱን ወደ አፕሊኬሽንዎ ለማስገባት መጀመሪያ ኮምፒውተርዎን/መሳሪያዎን ከዋይፋይ (ኢንተርኔት) ጋር ያገናኙ (Online ያድርጉ)፤ ከዚያም ATD Bingo አፕ ውስጥ ገብተው *"Sync Balance"* የሚለውን ይንኩ!`,
          { parse_mode: 'Markdown' }
        );
      }
    } else {
      const rpc = await db.approveOnlineDeposit(pendingTx.id, 0);
      if (rpc.success) {
        await bot.telegram.sendMessage(
          rpc.telegram_id,
          `✅ *የኦንላይን ጨዋታ ዋሌት ክፍያዎ በራስ-ሰር ተረጋግጧል!*\n💰 +${rpc.amount} ETB | አዲስ ባላንስ: *${Number(rpc.new_balance).toFixed(2)} ETB*`,
          { parse_mode: 'Markdown' }
        );
      }
    }

    return res.status(200).json({ success: true, autoApproved: true, ref: parsed.transactionId });
  } catch (err) {
    console.error('SMS Webhook error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 3. MODE B: REALTIME ONLINE GAME WALLET REST API (BINGO, KENO, AVIATOR)
// ============================================================================
function verifyOnlineGameApiSecret(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : req.headers['x-api-secret'];

  if (!token || token !== config.onlineGames.apiSecret) {
    return res.status(401).json({ success: false, error: 'Invalid ONLINE_GAME_API_SECRET' });
  }
  next();
}

// GET /api/online-user/:telegram_id -> Read player's online_wallets.balance
router.get('/api/online-user/:telegram_id', verifyOnlineGameApiSecret, async (req, res) => {
  const telegramId = Number(req.params.telegram_id);
  if (!telegramId) {
    return res.status(400).json({ success: false, error: 'Invalid telegram_id' });
  }

  try {
    const wallet = await db.getOnlineWallet(telegramId);
    return res.status(200).json({
      success: true,
      telegram_id: wallet.telegram_id,
      username: wallet.telegram_username,
      balance: Number(wallet.balance)
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/online-user/bet-result -> Debit bet or Credit win in real time
router.post('/api/online-user/bet-result', verifyOnlineGameApiSecret, async (req, res) => {
  const { telegram_id, game, action, amount, round_id } = req.body || {};
  const tgId = Number(telegram_id);
  const numAmount = Math.abs(Number(amount));

  if (!tgId || !numAmount || !['BET', 'WIN'].includes(String(action).toUpperCase())) {
    return res.status(400).json({
      success: false,
      error: 'Required: telegram_id, action ("BET" | "WIN"), positive amount, round_id'
    });
  }

  const normalizedAction = String(action).toUpperCase();
  const delta = normalizedAction === 'BET' ? -numAmount : numAmount;
  const refId = `${(game || 'GAME').toUpperCase()}-${normalizedAction}-${round_id || Date.now()}`;

  try {
    const result = await db.adjustOnlineWalletBalance(
      tgId,
      delta,
      refId,
      normalizedAction === 'BET' ? 'ONLINE_BET' : 'ONLINE_WIN'
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json({
      success: true,
      telegram_id: tgId,
      action: normalizedAction,
      amount: numAmount,
      balance: result.balance,
      ref_id: refId
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
