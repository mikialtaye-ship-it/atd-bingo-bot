require('dotenv').config();

const config = {
  // Telegram Bot
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  adminTelegramId: process.env.ADMIN_TELEGRAM_ID ? process.env.ADMIN_TELEGRAM_ID.toString().trim() : '',

  // Supabase
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',

  // Server & Render
  port: parseInt(process.env.PORT, 10) || 3000,
  renderExternalUrl: process.env.RENDER_EXTERNAL_URL ? process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, '') : '',

  // Payment Accounts (Ethiopia)
  telebirr: {
    number: process.env.TELEBIRR_NUMBER || '0969920066',
    name: process.env.TELEBIRR_NAME || 'ATD Bingo',
  },
  cbe: {
    account: process.env.CBE_ACCOUNT || '1000123456789',
    name: process.env.CBE_NAME || 'ATD BINGO ENTERTAINMENT',
  },
  boa: {
    account: process.env.BOA_ACCOUNT || '87654321',
    name: process.env.BOA_NAME || 'ATD BINGO ENTERTAINMENT',
  },

  // Verification & Webhook
  verificationMode: (process.env.VERIFICATION_MODE || 'ADMIN').toUpperCase(), // ADMIN or AUTO
  smsWebhookSecret: process.env.SMS_WEBHOOK_SECRET || 'atd_bingo_sms_secret_2026',

  // Bingo Game Controller Sync
  bingoSyncApiUrl: process.env.BINGO_SYNC_API_URL ? process.env.BINGO_SYNC_API_URL.replace(/\/+$/, '') : '',

  // Offline App (.zip) Distribution
  offlineApp: {
    fileId: process.env.OFFLINE_APP_FILE_ID || '',
    downloadUrl: process.env.OFFLINE_APP_DOWNLOAD_URL || '',
    version: process.env.OFFLINE_APP_VERSION || 'v2.4.0',
    approxSize: '168 MB',
    name: 'ATD-Bingo-Offline.zip',
  },

  // Customer Support
  supportPhone: process.env.SUPPORT_PHONE || '0969920066',
  supportTelegramUsername: (process.env.SUPPORT_TELEGRAM_USERNAME || 'atd_bingo_support').replace(/^@/, ''),
};

// Validate mandatory environment variables
const validateConfig = () => {
  const missing = [];
  if (!config.telegramBotToken) missing.push('TELEGRAM_BOT_TOKEN');
  if (!config.supabaseUrl) missing.push('SUPABASE_URL');
  if (!config.supabaseServiceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');

  if (missing.length > 0) {
    console.warn(`\x1b[33m[CONFIG WARNING] Missing recommended environment variables: ${missing.join(', ')}\x1b[0m`);
    console.warn('\x1b[33mEnsure you copy .env.example to .env and configure all credentials.\x1b[0m');
  }
};

validateConfig();

module.exports = config;
