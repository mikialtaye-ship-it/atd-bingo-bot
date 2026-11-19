const express = require('express');
const healthRoutes = require('./routes/health');
const createWebhookRouter = require('./routes/webhook');
const logger = require('./utils/logger');
const config = require('./config');

/**
 * Initializes and configures the Express server
 * @param {import('telegraf').Telegraf} bot
 */
const createServer = (bot) => {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Basic request logger
  app.use((req, res, next) => {
    if (req.path !== '/health') {
      logger.info(`HTTP ${req.method} ${req.path}`);
    }
    next();
  });

  // Health check endpoint for Render keep-alive
  app.use('/health', healthRoutes);

  // Webhook endpoint for Android SMS Forwarder
  app.use('/webhook', createWebhookRouter(bot));

  // Root endpoint
  app.get('/', (req, res) => {
    res.send({
      message: 'ATD Bingo Telegram Bot API & Keep-Alive Service',
      version: '1.0.0',
      status: 'running',
    });
  });

  return app;
};

module.exports = createServer;
