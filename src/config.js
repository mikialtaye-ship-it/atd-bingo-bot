require('dotenv').config();

const requiredVars = [
  'BOT_TOKEN',
  'ADMIN_TELEGRAM_ID',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SYNC_API_SECRET'
];

for (const key of requiredVars) {
  if (!process.env[key]) {
    console.warn(`⚠️ [CONFIG WARNING] Missing environment variable: ${key}`);
  }
}

const config = {
  botToken: process.env.BOT_TOKEN,
  adminIds: (process.env.ADMIN_TELEGRAM_ID || '')
    .split(',')
    .map((id) => Number(id.trim()))
    .filter(Boolean),

  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
  },

  accounts: {
    telebirrNumber: process.env.TELEBIRR_NUMBER || '0962025699',
    telebirrName: process.env.TELEBIRR_NAME || 'ADDIS ALTAYE ALEMU,
    cbeAccount: process.env.CBE_ACCOUNT || '1000230528156',
    cbeName: process.env.CBE_NAME || 'ADDIS ALTAYE ALEMU',
    boaAccount: process.env.BOA_ACCOUNT || '48110479',
    boaName: process.env.BOA_NAME || 'ADDIS ALTAYE ALEMU'
  },

  syncApi: {
    url: process.env.SYNC_API_URL || 'https://bingo-sync-api.onrender.com/api/sync-deposit',
    secret: process.env.SYNC_API_SECRET
  },

  offlineApp: {
    downloadUrl: process.env.OFFLINE_APP_DOWNLOAD_URL || ''
  },

  onlineGames: {
    bingoUrl: (process.env.ONLINE_BINGO_URL || '').trim(),
    kenoUrl: (process.env.ONLINE_KENO_URL || '').trim(),
    aviatorUrl: (process.env.ONLINE_AVIATOR_URL || '').trim(),
    apiSecret: process.env.ONLINE_GAME_API_SECRET || 'changeme_online_secret'
  },

  smsWebhookSecret: process.env.SMS_WEBHOOK_SECRET || 'changeme_sms_secret',

  support: {
    phone1: process.env.SUPPORT_PHONE_1 || '0962025699',
    phone2: process.env.SUPPORT_PHONE_2 || '0969920066',
    telegramUsername: (process.env.SUPPORT_TELEGRAM_USERNAME || 'atd_bingo_support').replace('@', '')
  },

  server: {
    port: Number(process.env.PORT) || 3000,
    renderExternalUrl: (process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '')
  }
};

module.exports = config;
