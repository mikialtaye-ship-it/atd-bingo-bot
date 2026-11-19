'use strict';
const axios = require('axios');
const env   = require('../config/env');

const MAX_RETRIES    = 3;
const RETRY_BASE_MS  = 2000;  // 2s, 4s, 6s back-off

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/**
 * Push an approved offline deposit to the ATD Control Dashboard.
 *
 * Payload sent to bingo-sync-api.onrender.com/api/sync:
 *   { shop_id, username, amount, ref_id, status: "READY_TO_SYNC" }
 *
 * Retries up to MAX_RETRIES times with linear back-off.
 * On total failure, alerts ADMIN_TELEGRAM_ID and returns false.
 *
 * @param {{ shopId: string, username: string, amount: number, refId: string }} opts
 * @param {import('telegraf').Telegraf} [bot]  - pass bot to enable admin alert
 * @returns {Promise<boolean>}
 */
async function pushToControlDashboard({ shopId, username, amount, refId }, bot) {
  const payload = {
    shop_id:  shopId,
    username: username,
    amount:   amount,
    ref_id:   refId,
    status:   'READY_TO_SYNC',
  };

  const url = `${env.SYNC_API_URL}/api/sync`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${env.SYNC_API_SECRET}`,
          'Content-Type': 'application/json',
        },
        timeout: 12000,
      });
      console.log(`[SYNC] ✅ Dashboard sync OK (attempt ${attempt}):`, response.data);
      return true;
    } catch (err) {
      const detail = err.response?.data
        ? JSON.stringify(err.response.data)
        : err.message;
      console.error(`[SYNC] ❌ Attempt ${attempt}/${MAX_RETRIES} failed:`, detail);
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_BASE_MS * attempt);
      }
    }
  }

  // ── All retries exhausted — alert Admin ───────────────────────
  console.error('[SYNC] All retries failed for', payload);
  if (bot && env.ADMIN_TELEGRAM_ID) {
    try {
      await bot.telegram.sendMessage(
        env.ADMIN_TELEGRAM_ID,
        `🚨 <b>ATD Dashboard Sync ስህተት!</b>\n\n` +
        `🏪 Shop: <code>${shopId}</code>\n` +
        `👤 Username: <code>${username}</code>\n` +
        `💵 Amount: <b>${amount} ETB</b>\n` +
        `🔑 Ref: <code>${refId}</code>\n\n` +
        `❌ ሶስቱም ሙከራዎች አልተሳካም።\n` +
        `ቀጥለው Dashboard ላይ በቀጥታ ያስፈቅዱ ወይም ያስተናግዱ።`,
        { parse_mode: 'HTML' }
      );
    } catch (_) {
      console.error('[SYNC] Failed to send admin alert');
    }
  }
  return false;
}

module.exports = { pushToControlDashboard };
