'use strict';
require('dotenv').config();

const { Telegraf } = require('telegraf');
const express      = require('express');
const cron         = require('node-cron');
const axios        = require('axios');
const env          = require('./config/env');

// ── Handlers ────────────────────────────────────────────────────
const registerStart       = require('./handlers/start');
const registerDeposit     = require('./handlers/deposit');
const registerOnlineGames = require('./handlers/onlineGames');
const registerOfflineApp  = require('./handlers/offlineApp');
const registerSupport     = require('./handlers/support');

// ── Express REST routes ──────────────────────────────────────────
const { setupWebhookRoutes } = require('./services/webhook');

// ═══════════════════════════════════════════════════════════════
//  BOT INITIALISATION
// ═══════════════════════════════════════════════════════════════
const bot = new Telegraf(env.BOT_TOKEN);

// Register all handlers
registerStart(bot);
registerDeposit(bot);
registerOnlineGames(bot);
registerOfflineApp(bot);
registerSupport(bot);

// ── Admin /setapp command ────────────────────────────────────────
bot.command('setapp', async (ctx) => {
  if (String(ctx.from.id) !== String(env.ADMIN_TELEGRAM_ID)) return;
  if (!ctx.message.reply_to_message?.document) {
    return ctx.reply('↩️ ይህን ትዕዛዝ ለ .zip ፋይል reply አድርጎ ይላኩ።');
  }
  const doc = ctx.message.reply_to_message.document;
  if (!doc.file_name?.endsWith('.zip')) {
    return ctx.reply('❌ የተላከው ፋይል .zip አይደለም።');
  }
  const { supabase } = require('./services/supabase');
  await supabase
    .from('app_settings')
    .upsert({ key: 'offline_app_file_id', value: doc.file_id, updated_at: new Date().toISOString() });
  ctx.reply('✅ ኦፍላይን አፕ ፋይሉ ተቀምጧል!\nfile_id: ' + doc.file_id);
});

// ── Global error handler ─────────────────────────────────────────
bot.catch((err, ctx) => {
  console.error('[BOT ERROR]', ctx?.updateType, err);
});

// ═══════════════════════════════════════════════════════════════
//  EXPRESS SERVER
// ═══════════════════════════════════════════════════════════════
const app = express();
app.use(express.json());

// Health endpoint (also used by Render keep-alive cron)
app.get('/health', (_req, res) =>
  res.json({ status: 'ok', ts: new Date().toISOString() })
);

// SMS forwarder webhook + Online Game wallet REST API
setupWebhookRoutes(app, bot);

// ═══════════════════════════════════════════════════════════════
//  RENDER KEEP-ALIVE CRON (every 10 minutes)
// ═══════════════════════════════════════════════════════════════
if (env.RENDER_EXTERNAL_URL) {
  cron.schedule('*/10 * * * *', async () => {
    try {
      await axios.get(`${env.RENDER_EXTERNAL_URL}/health`, { timeout: 8000 });
      console.log('[CRON] Keep-alive ping OK', new Date().toISOString());
    } catch (err) {
      console.error('[CRON] Keep-alive ping failed:', err.message);
    }
  });
  console.log('[CRON] Keep-alive scheduled every 10 minutes →', env.RENDER_EXTERNAL_URL);
}

// ═══════════════════════════════════════════════════════════════
//  LAUNCH
// ═══════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`[SERVER] Express listening on port ${PORT}`);
  await bot.launch({ dropPendingUpdates: true });
  console.log('[BOT] ✅ ATD Bingo Bot is live! @atd_bingo_bot');
});

// Graceful shutdown
process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
