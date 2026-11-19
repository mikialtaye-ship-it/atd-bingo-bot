const axios = require('axios');
const cron = require('node-cron');
const config = require('../config');
const logger = require('../utils/logger');

class KeepAliveService {
  constructor() {
    this.cronTask = null;
    this.intervalId = null;
  }

  /**
   * Start keep-alive ping loop
   */
  start() {
    const url = config.renderExternalUrl;

    if (!url) {
      logger.info(
        'RENDER_EXTERNAL_URL not set. Keep-alive pinger running in local mode (pinger idle).'
      );
      return;
    }

    const healthUrl = `${url}/health`;
    logger.info(`Starting Render 24/7 Keep-Alive Pinger targeting: ${healthUrl} (every 10 minutes)`);

    // Ping function
    const ping = async () => {
      const startTime = Date.now();
      try {
        const response = await axios.get(healthUrl, {
          timeout: 10000,
          headers: { 'User-Agent': 'ATD-Bingo-KeepAlive-Pinger/1.0' },
        });
        const duration = Date.now() - startTime;
        logger.info(`[Keep-Alive] Pinged ${healthUrl} -> HTTP ${response.status} (${duration}ms)`);
      } catch (err) {
        logger.warn(`[Keep-Alive] Ping failed for ${healthUrl}: ${err.message}`);
      }
    };

    // Run first ping after 1 minute to let server initialize
    setTimeout(ping, 60 * 1000);

    // Schedule every 10 minutes via node-cron (e.g. at minute 0, 10, 20, 30, 40, 50)
    try {
      this.cronTask = cron.schedule('*/10 * * * *', ping);
      logger.success('Keep-alive cron scheduled: */10 * * * *');
    } catch (err) {
      // Fallback to setInterval if cron fails
      logger.warn(`Cron schedule failed (${err.message}). Using setInterval fallback.`);
      this.intervalId = setInterval(ping, 10 * 60 * 1000);
    }
  }

  stop() {
    if (this.cronTask) {
      this.cronTask.stop();
    }
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    logger.info('Keep-alive service stopped.');
  }
}

module.exports = new KeepAliveService();
