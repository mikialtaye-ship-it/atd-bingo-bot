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
  BOT_TOKEN:                  required('BOT_TOKEN'),
  ADMIN_TELEGRAM_ID:          required('ADMIN_TELEGRAM_ID'),
  SUPPORT_TELEGRAM_USERNAME:  optional('SUPPORT_TELEGRAM_USERNAME', 'atd_support'),

  // ── Supabase ──────────────────────────────────────────────────
  SUPABASE_URL:               required('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY:  required('SUPABASE_SERVICE_ROLE_KEY'),

  // ── ATD Control Dashboard ─────────────────────────────────────
  SYNC_API_URL:    optional('SYNC_API_URL', 'https://bingo-sync-api.onrender.com'),
  SYNC_API_SECRET: required('SYNC_API_SECRET'),

  // ── Payment Accounts ──────────────────────────────────────────
  TELEBIRR_NUMBER: optional('TELEBIRR_NUMBER'),
  TELEBIRR_NAME:   optional('TELEBIRR_NAME', 'ATD Bingo'),
  CBE_ACCOUNT:     optional('CBE_ACCOUNT'),
  CBE_NAME:        optional('CBE_NAME', 'ATD Bingo'),
  BOA_ACCOUNT:     optional('BOA_ACCOUNT'),
  BOA_NAME:        optional('BOA_NAME', 'ATD Bingo'),

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
