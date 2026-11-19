'use strict';
require('dotenv').config();

/**
 * Throws if a required env variable is missing.
 */
function required(name) {
  const val = process.env[name];
  if (!val || val.trim() === '') {
    throw new Error(`[CONFIG] Missing required environment variable: ${name}`);
  }
  return val.trim();
}

/**
 * Returns the env variable or a fallback (never throws).
 */
function optional(name, fallback = '') {
  return (process.env[name] || fallback).trim();
}

module.exports = {
  // ── Telegram ──────────────────────────────────────────────────
  BOT_TOKEN:                  required('8942847715:AAFI3qd_bsirGjt4GtTUzx8jTLwCKBnYny8'),
  ADMIN_TELEGRAM_ID:          required('8802165407'),
  SUPPORT_TELEGRAM_USERNAME:  optional('@atdbingo', 'atd_support'),

  // ── Supabase ──────────────────────────────────────────────────
  SUPABASE_URL:               required('https://zriwaxchecfffaiblchi.supabase.co'),
  SUPABASE_SERVICE_ROLE_KEY:  required('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyaXdheGNoZWNmZmZhaWJsY2hpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ2NDk5NjgsImV4cCI6MjExMDIyNTk2OH0.fZz6nIxtoM9faLVu1Msb4wAwEvRTiZvfpvcFLuB2qP8'),

  // ── ATD Control Dashboard ─────────────────────────────────────
  SYNC_API_URL:    optional('SYNC_API_URL', 'https://bingo-sync-api.onrender.com'),
  SYNC_API_SECRET: required('atd_bingo_2026_secret'),

  // ── Payment Accounts ──────────────────────────────────────────
  TELEBIRR_NUMBER: optional('0969920066'),
  TELEBIRR_NAME:   optional('ADDIS ALTAYE ALEMU', 'ATD Bingo'),
  CBE_ACCOUNT:     optional('1000230528156'),
  CBE_NAME:        optional('ADDIS ALTAYE ALEMU', 'ATD Bingo'),
  BOA_ACCOUNT:     optional('48110479'),
  BOA_NAME:        optional('ADDIS ALTAYE ALEMU', 'ATD Bingo'),

  // ── Support ───────────────────────────────────────────────────
  SUPPORT_PHONE_1: optional('SUPPORT_PHONE_1', '0962025699'),
  SUPPORT_PHONE_2: optional('SUPPORT_PHONE_2', '0969920066'),

  // ── Offline App ───────────────────────────────────────────────
  OFFLINE_APP_DOWNLOAD_URL: optional('OFFLINE_APP_DOWNLOAD_URL'),

  // ── SMS Webhook ───────────────────────────────────────────────
  SMS_WEBHOOK_SECRET: optional('SMS_WEBHOOK_SECRET'),

  // ── Online Games ──────────────────────────────────────────────
  ONLINE_BINGO_URL:       optional('ONLINE_BINGO_URL'),
  ONLINE_KENO_URL:        optional('ONLINE_KENO_URL'),
  ONLINE_AVIATOR_URL:     optional('ONLINE_AVIATOR_URL'),
  ONLINE_GAME_API_SECRET: optional('ONLINE_GAME_API_SECRET'),

  // ── Render ────────────────────────────────────────────────────
  RENDER_EXTERNAL_URL: optional('RENDER_EXTERNAL_URL'),
};
