/**
 * Clean formatted logger for ATD Bingo Bot
 */

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

const getTimestamp = () => new Date().toISOString().replace('T', ' ').substring(0, 19);

const logger = {
  info: (message, meta = '') => {
    console.log(`${colors.cyan}[INFO] [${getTimestamp()}]${colors.reset} ${message}`, meta ? meta : '');
  },
  success: (message, meta = '') => {
    console.log(`${colors.green}[SUCCESS] [${getTimestamp()}]${colors.reset} ${message}`, meta ? meta : '');
  },
  warn: (message, meta = '') => {
    console.warn(`${colors.yellow}[WARN] [${getTimestamp()}]${colors.reset} ${message}`, meta ? meta : '');
  },
  error: (message, error = '') => {
    console.error(`${colors.red}[ERROR] [${getTimestamp()}]${colors.reset} ${message}`, error ? error : '');
  },
  bot: (message, meta = '') => {
    console.log(`${colors.magenta}[BOT] [${getTimestamp()}]${colors.reset} ${message}`, meta ? meta : '');
  },
};

module.exports = logger;
