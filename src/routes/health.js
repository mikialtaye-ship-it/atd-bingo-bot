const express = require('express');
const router = express.Router();

/**
 * Health check endpoint for Render keep-alive and uptime monitoring
 */
router.get('/', (req, res) => {
  res.status(200).json({
    status: 'alive',
    service: 'atd-bingo-telegram-bot',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())}s`,
  });
});

module.exports = router;
