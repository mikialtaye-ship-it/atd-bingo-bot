const config = require('./config');
const logger = require('./utils/logger');
const createBot = require('./bot');
const createServer = require('./server');
const keepAliveService = require('./services/keepAlive');

async function bootstrap() {
  logger.info('====================================================');
  logger.info('      ATD BINGO TELEGRAM BOT & DEPOSIT SYSTEM       ');
  logger.info('====================================================');

  // 1. Initialize Telegram Bot
  const bot = createBot();

  // 2. Initialize and Start Express Server
  const app = createServer(bot);
  const server = app.listen(config.port, () => {
    logger.success(`Express Web Server listening on port ${config.port}`);
    logger.info(`Health check available at: http://localhost:${config.port}/health`);
    logger.info(`SMS Forwarder Webhook available at: http://localhost:${config.port}/webhook/sms-forwarder`);
  });

  // 3. Launch Bot (Polling)
  if (bot) {
    try {
      await bot.launch({
        dropPendingUpdates: true, // Prevents flood of old updates upon startup
      });
      logger.success('Telegraf Bot launched successfully in Polling mode.');
    } catch (botErr) {
      logger.error('Failed to launch Telegram Bot:', botErr.message);
    }
  } else {
    logger.warn('Bot not launched: Missing TELEGRAM_BOT_TOKEN.');
  }

  // 4. Start Render 24/7 Keep-Alive Pinger
  keepAliveService.start();

  // 5. Graceful Shutdown Handlers
  const shutdown = async (signal) => {
    logger.info(`Received ${signal}. Gracefully shutting down...`);

    keepAliveService.stop();

    if (bot) {
      try {
        bot.stop(signal);
        logger.info('Telegraf bot stopped.');
      } catch (_) {}
    }

    server.close(() => {
      logger.info('Express HTTP server closed.');
      process.exit(0);
    });

    // Force exit after 10 seconds if hanging
    setTimeout(() => {
      logger.error('Forcefully exiting after timeout.');
      process.exit(1);
    }, 10000).unref();
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  logger.error('Fatal initialization error:', err);
  process.exit(1);
});
