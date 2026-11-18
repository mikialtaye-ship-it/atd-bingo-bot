import 'dotenv/config';

const required = [
  'TELEGRAM_BOT_TOKEN',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ADMIN_TELEGRAM_ID',
  'TELEBIRR_NUMBER',
  'CBE_ACCOUNT',
  'ABYSSINIA_ACCOUNT',
];

for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
}

const verificationMode = (process.env.VERIFICATION_MODE || 'admin').toLowerCase();
if (!['admin', 'auto'].includes(verificationMode)) {
  throw new Error('VERIFICATION_MODE must be either admin or auto');
}
if (verificationMode === 'auto' && !process.env.SMS_FORWARDER_TOKEN) {
  throw new Error('SMS_FORWARDER_TOKEN is required when VERIFICATION_MODE=auto');
}

const identifierColumns = (process.env.USER_IDENTIFIER_COLUMNS || 'username,phone')
  .split(',')
  .map((column) => column.trim())
  .filter(Boolean);
if (!identifierColumns.length || identifierColumns.some((column) => !['username', 'phone'].includes(column))) {
  throw new Error('USER_IDENTIFIER_COLUMNS may contain only username and/or phone');
}

export const config = {
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  adminTelegramId: process.env.ADMIN_TELEGRAM_ID,
  supportTelegramId: process.env.SUPPORT_TELEGRAM_ID || process.env.ADMIN_TELEGRAM_ID,
  telebirrNumber: process.env.TELEBIRR_NUMBER,
  cbeAccount: process.env.CBE_ACCOUNT,
  abyssiniaAccount: process.env.ABYSSINIA_ACCOUNT,
  identifierColumns,
  verificationMode,
  smsForwarderToken: process.env.SMS_FORWARDER_TOKEN || '',
  port: Number.parseInt(process.env.PORT || '3000', 10),
};