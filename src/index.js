const express = require('express');
const cron = require('node-cron');
const axios = require('axios');
const config = require('./config');
const { bot } = require('./bot');
const webhookRoutes = require('./webhook');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/', webhookRoutes);

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

async function startBotWithRetry(retries = 5) {
  for (let i = 1; i <= retries; i++) {
    try {
      await bot.telegram.deleteWebhook({ drop_pending_updates: true });
      await bot.launch();
      console.log('🤖 @atd_bingo_bot is live and running!');
      return;
    } catch (err) {
      console.error(`⚠️ Attempt ${i} failed to launch bot: ${err.message}`);
      if (i < retries) {
        console.log('⏳ Waiting 4 seconds for old Render instance to close...');
        await new Promise((res) => setTimeout(res, 4000));
      }
    }
  }
}

const server = app.listen(config.server.port, async () => {
  console.log(`🚀 ATD Bingo HTTP Server listening on port ${config.server.port}`);
  await startBotWithRetry();
});

process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('⚠️ Uncaught Exception:', err);
});

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
