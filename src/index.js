import { app } from './webhook.js';
import { bot } from './bot.js';
import { config } from './config.js';

const server = app.listen(config.port, () => console.log(`Health and SMS webhook listening on port ${config.port}`));

try {
  await bot.launch();
  console.log('ATD Bingo Telegram bot started');
} catch (error) {
  server.close();
  console.error('Bot startup failed:', error);
  process.exitCode = 1;
}

const shutdown = (signal) => {
  console.log(`${signal} received, shutting down`);
  bot.stop(signal);
  server.close(() => process.exit(0));
};
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));