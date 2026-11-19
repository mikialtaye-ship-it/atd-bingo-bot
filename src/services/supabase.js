'use strict';
const { createClient } = require('@supabase/supabase-js');
const env = require('../config/env');

// Singleton Supabase client (service-role key bypasses RLS)
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// ── App Settings Cache ────────────────────────────────────────────
let _offlineFileIdCache = null;

// ════════════════════════════════════════════════════════════════
//  SHOPS
// ════════════════════════════════════════════════════════════════

/**
 * Verify that a (shop_id + username) pair exists and is ACTIVE.
 * @returns {Object|null} shop row or null
 */
async function verifyShop(shopId, username) {
  const { data, error } = await supabase
    .from('shops')
    .select('*')
    .eq('shop_id', shopId.trim().toUpperCase())
    .eq('username', username.trim().toLowerCase())
    .eq('status', 'ACTIVE')
    .single();
  if (error || !data) return null;
  return data;
}

/**
 * Get a shop by shop_id only (for display/linking, any status).
 */
async function getShopById(shopId) {
  const { data } = await supabase
    .from('shops')
    .select('*')
    .eq('shop_id', shopId.trim().toUpperCase())
    .single();
  return data || null;
}

/**
 * Register a new shop (status = PENDING, shop_id auto-generated).
 */
async function registerShop({ ownerName, username, phone, region, address, macAddress }) {
  const shopId = 'SHOP-' + Math.random().toString(16).substr(2, 8).toUpperCase();
  const { data, error } = await supabase
    .from('shops')
    .insert({
      shop_id:     shopId,
      username:    username.trim().toLowerCase(),
      owner_name:  ownerName,
      phone,
      region,
      address,
      mac_address: macAddress,
      status:      'PENDING',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Activate a shop by shop_id (Admin approval).
 */
async function activateShop(shopId) {
  const { error } = await supabase
    .from('shops')
    .update({ status: 'ACTIVE' })
    .eq('shop_id', shopId.trim().toUpperCase());
  if (error) throw error;
}

// ════════════════════════════════════════════════════════════════
//  TELEGRAM LINKS
// ════════════════════════════════════════════════════════════════

async function getTelegramLink(telegramId) {
  const { data } = await supabase
    .from('telegram_links')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();
  return data || null;
}

async function upsertTelegramLink({ telegramId, telegramUsername, phone, shopId, username }) {
  const { error } = await supabase
    .from('telegram_links')
    .upsert({
      telegram_id:       telegramId,
      telegram_username: telegramUsername,
      phone:             phone || null,
      shop_id:           shopId || null,
      username:          username || null,
      linked_at:         new Date().toISOString(),
    }, { onConflict: 'telegram_id' });
  if (error) throw error;
}

/**
 * Try to link a Telegram user by their phone number.
 * Looks for an ACTIVE shop with that phone number.
 */
async function linkByPhone(phone, telegramId, telegramUsername) {
  const { data: shop } = await supabase
    .from('shops')
    .select('*')
    .eq('phone', phone)
    .eq('status', 'ACTIVE')
    .single();

  if (shop) {
    await upsertTelegramLink({
      telegramId, telegramUsername, phone,
      shopId: shop.shop_id, username: shop.username,
    });
    return shop;
  }

  // Save phone even without a shop match
  await upsertTelegramLink({ telegramId, telegramUsername, phone });
  return null;
}

// ════════════════════════════════════════════════════════════════
//  ONLINE WALLETS
// ════════════════════════════════════════════════════════════════

async function ensureOnlineWallet(telegramId, telegramUsername) {
  // Insert if not exists
  const { error } = await supabase
    .from('online_wallets')
    .upsert(
      { telegram_id: telegramId, telegram_username: telegramUsername },
      { onConflict: 'telegram_id', ignoreDuplicates: true }
    );
  if (error && error.code !== '23505') {
    console.error('[SUPABASE] ensureOnlineWallet:', error.message);
  }
  return getOnlineWallet(telegramId);
}

async function getOnlineWallet(telegramId) {
  const { data } = await supabase
    .from('online_wallets')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();
  return data || null;
}

/**
 * Credit (add) amount to online wallet.
 * NOTE: for atomic crediting, use the approve_online_deposit RPC instead.
 */
async function creditOnlineWallet(telegramId, amount) {
  const wallet = await getOnlineWallet(telegramId);
  if (!wallet) throw new Error('Online wallet not found for telegram_id: ' + telegramId);
  const newBalance = parseFloat(wallet.balance) + parseFloat(amount);
  const { error } = await supabase
    .from('online_wallets')
    .update({ balance: newBalance, updated_at: new Date().toISOString() })
    .eq('telegram_id', telegramId);
  if (error) throw error;
}

/**
 * Debit (subtract) amount from online wallet.
 */
async function debitOnlineWallet(telegramId, amount) {
  const wallet = await getOnlineWallet(telegramId);
  if (!wallet) throw new Error('Online wallet not found');
  const current = parseFloat(wallet.balance);
  const debit   = parseFloat(amount);
  if (current < debit) throw new Error('Insufficient online wallet balance');
  const { error } = await supabase
    .from('online_wallets')
    .update({ balance: current - debit, updated_at: new Date().toISOString() })
    .eq('telegram_id', telegramId);
  if (error) throw error;
}

// ════════════════════════════════════════════════════════════════
//  TRANSACTIONS
// ════════════════════════════════════════════════════════════════

/**
 * Returns true if this transaction_id already exists (duplicate prevention).
 */
async function isDuplicateTransaction(transactionId) {
  if (!transactionId) return false;
  const { data } = await supabase
    .from('transactions')
    .select('id')
    .eq('transaction_id', transactionId)
    .single();
  return !!data;
}

async function createTransaction(payload) {
  const { data, error } = await supabase
    .from('transactions')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateTransactionStatus(transactionId, status, adminNote = '') {
  const { error } = await supabase
    .from('transactions')
    .update({ status, admin_note: adminNote, updated_at: new Date().toISOString() })
    .eq('transaction_id', transactionId);
  if (error) throw error;
}

async function getUserTransactions(telegramId, limit = 10) {
  const { data } = await supabase
    .from('transactions')
    .select('*')
    .eq('telegram_id', telegramId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

// ════════════════════════════════════════════════════════════════
//  ATOMIC RPC CALLS
// ════════════════════════════════════════════════════════════════

async function approveOfflineDepositRpc(transactionId, shopId, username, amount) {
  const { error } = await supabase.rpc('approve_offline_deposit_and_sync', {
    p_transaction_id: transactionId,
    p_shop_id:        shopId,
    p_username:       username,
    p_amount:         amount,
  });
  if (error) throw error;
}

async function approveOnlineDepositRpc(transactionId, telegramId, amount) {
  const { error } = await supabase.rpc('approve_online_deposit', {
    p_transaction_id: transactionId,
    p_telegram_id:    telegramId,
    p_amount:         amount,
  });
  if (error) throw error;
}

// ════════════════════════════════════════════════════════════════
//  APP SETTINGS
// ════════════════════════════════════════════════════════════════

async function getOfflineAppFileId() {
  if (_offlineFileIdCache) return _offlineFileIdCache;
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'offline_app_file_id')
    .single();
  if (data?.value) _offlineFileIdCache = data.value;
  return data?.value || null;
}

async function setOfflineAppFileId(fileId) {
  _offlineFileIdCache = fileId;
  await supabase
    .from('app_settings')
    .upsert({ key: 'offline_app_file_id', value: fileId, updated_at: new Date().toISOString() });
}

module.exports = {
  supabase,
  // Shops
  verifyShop, getShopById, registerShop, activateShop,
  // Links
  getTelegramLink, upsertTelegramLink, linkByPhone,
  // Online wallets
  ensureOnlineWallet, getOnlineWallet, creditOnlineWallet, debitOnlineWallet,
  // Transactions
  isDuplicateTransaction, createTransaction, updateTransactionStatus, getUserTransactions,
  // Atomic RPCs
  approveOfflineDepositRpc, approveOnlineDepositRpc,
  // App settings
  getOfflineAppFileId, setOfflineAppFileId,
};
