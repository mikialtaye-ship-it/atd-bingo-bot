const express = require('express');
const cron = require('node-cron');
const axios = require('axios');
const config = require('./config');
const webhookRoutes = require('./webhook');
module.exports = { bot };

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Attach Health, SMS Forwarder Webhook & Online Game Wallet REST APIs
app.use('/', webhookRoutes);

// 24/7 Render Keep-Alive Cron (Pings /health every 10 minutes so Render never sleeps)
cron.schedule('*/10 * * * *', async () => {
  const targetUrl = config.server.renderExternalUrl
    ? `${config.server.renderExternalUrl}/health`
    : `http://localhost:${config.server.port}/health`;

  try {
    await axios.get(targetUrl, { timeout: 8000 });
    console.log(`💓 [Keep-Alive] Pinged ${targetUrl} at ${new Date().toISOString()}`);
  } catch (err) {
    console.error(`⚠️ [Keep-Alive] Ping failed: ${err.message}`);
  }
});

// Start Express Server & Launch Telegram Bot
const server = app.listen(config.server.port, async () => {
  console.log(`🚀 ATD Bingo HTTP Server listening on port ${config.server.port}`);

  try {
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    console.log('🧹 Cleared old webhooks...');

    await bot.launch();
    console.log('🤖 @atd_bingo_bot is live and running (Mode A: Offline Sync + Mode B: Online Games)!');
  } catch (err) {
    console.error('❌ Failed to launch Telegram bot:', err);
  }
});

// ቦቱ በትንሽ ስህተት ምክንያት ክራሽ አድርጎ እንዳይዘጋ መከላከያ
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('⚠️ Uncaught Exception:', err);
});

// Graceful Shutdown
function shutdown(signal) {
  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
  bot.stop(signal);
  server.close(() => {
    console.log('✅ HTTP Server closed.');
    process.exit(0);
  });
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

