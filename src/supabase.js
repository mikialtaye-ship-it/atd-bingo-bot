const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
  auth: { persistSession: false }
});

function normalizePhone(phone) {
  if (!phone) return null;
  let cleaned = String(phone).replace(/\s+/g, '').replace(/-/g, '');
  if (cleaned.startsWith('+251')) cleaned = '0' + cleaned.slice(4);
  if (cleaned.startsWith('251')) cleaned = '0' + cleaned.slice(3);
  return cleaned;
}

// ============================================================================
// ONLINE WALLETS (MODE B)
// ============================================================================
async function ensureOnlineWallet(telegramId, telegramUsername = '', fullName = '') {
  const { data: existing } = await supabase
    .from('online_wallets')
    .select('*')
    .eq('telegram_id', telegramId)
    .maybeSingle();

  if (existing) return existing;

  const { data, error } = await supabase
    .from('online_wallets')
    .insert({
      telegram_id: telegramId,
      telegram_username: telegramUsername || null,
      full_name: fullName || null,
      balance: 0
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getOnlineWallet(telegramId) {
  return ensureOnlineWallet(telegramId);
}

async function adjustOnlineWalletBalance(telegramId, deltaAmount, refId, type = 'ONLINE_BET') {
  const wallet = await ensureOnlineWallet(telegramId);
  const currentBalance = Number(wallet.balance || 0);
  const newBalance = currentBalance + Number(deltaAmount);

  if (newBalance < 0) {
    return { success: false, error: 'INSUFFICIENT_BALANCE', balance: currentBalance };
  }

  const { data: updated, error } = await supabase
    .from('online_wallets')
    .update({ balance: newBalance, updated_at: new Date().toISOString() })
    .eq('telegram_id', telegramId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  await supabase.from('transactions').insert({
    transaction_id: refId,
    telegram_id: telegramId,
    mode: deltaAmount < 0 ? 'ONLINE_BET' : 'ONLINE_WIN',
    amount: Math.abs(Number(deltaAmount)),
    payment_method: 'GAME_ENGINE',
    status: 'APPROVED'
  });

  return { success: true, balance: Number(updated.balance) };
}

// ============================================================================
// OFFLINE SHOPS & TELEGRAM LINKS (MODE A)
// ============================================================================
async function verifyActiveShop(shopId, username) {
  const { data, error } = await supabase
    .from('shops')
    .select('*')
    .eq('shop_id', shopId.trim().toUpperCase())
    .ilike('username', username.trim())
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function findShopByQuery(query) {
  const q = query.trim();
  const normalized = normalizePhone(q);

  // 1. Check by SHOP-XXXXXXX
  if (q.toUpperCase().startsWith('SHOP-')) {
    const { data } = await supabase
      .from('shops')
      .select('*')
      .eq('shop_id', q.toUpperCase())
      .eq('status', 'ACTIVE')
      .maybeSingle();
    if (data) return data;
  }

  // 2. Check by phone
  if (normalized && /^09\d{8}$/.test(normalized)) {
    const { data } = await supabase
      .from('shops')
      .select('*')
      .or(`phone.eq.${normalized},phone.eq.+251${normalized.slice(1)}`)
      .eq('status', 'ACTIVE')
      .maybeSingle();
    if (data) return data;
  }

  // 3. Check by username
  const { data } = await supabase
    .from('shops')
    .select('*')
    .ilike('username', q)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  return data || null;
}

async function getTelegramLink(telegramId) {
  const { data } = await supabase
    .from('telegram_links')
    .select('*, shops(*)')
    .eq('telegram_id', telegramId)
    .maybeSingle();

  return data || null;
}

async function saveTelegramLink({ telegramId, telegramUsername, phone, shopId, shopUsername }) {
  const { data, error } = await supabase
    .from('telegram_links')
    .upsert({
      telegram_id: telegramId,
      telegram_username: telegramUsername || null,
      phone: normalizePhone(phone),
      shop_id: shopId.toUpperCase(),
      shop_username: shopUsername,
      linked_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function registerNewShop({ centerName, username, phone, region, macAddress }) {
  const randomHex = Math.random().toString(16).substring(2, 10).toUpperCase();
  const shopId = `SHOP-${randomHex}`;

  const { data, error } = await supabase
    .from('shops')
    .insert({
      shop_id: shopId,
      username: username.trim(),
      center_name: centerName.trim(),
      phone: normalizePhone(phone),
      region: region.trim(),
      mac_address: macAddress.trim(),
      balance: 0,
      status: 'PENDING'
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function activateShop(shopId) {
  const { data, error } = await supabase
    .from('shops')
    .update({ status: 'ACTIVE', updated_at: new Date().toISOString() })
    .eq('shop_id', shopId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============================================================================
// TRANSACTIONS & ATOMIC APPROVALS
// ============================================================================
async function isTransactionDuplicate(transactionId) {
  const { data } = await supabase
    .from('transactions')
    .select('id, status')
    .eq('transaction_id', transactionId.trim().toUpperCase())
    .maybeSingle();

  return data || null;
}

async function createPendingTransaction(payload) {
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      transaction_id: payload.transactionId.trim().toUpperCase(),
      telegram_id: payload.telegramId,
      mode: payload.mode, // 'OFFLINE_SHOP' or 'ONLINE_GAME'
      shop_id: payload.shopId || null,
      shop_username: payload.shopUsername || null,
      amount: payload.amount,
      parsed_amount: payload.parsedAmount || null,
      payment_method: payload.paymentMethod || 'SMS_OR_PHOTO',
      proof_text: payload.proofText || null,
      proof_file_id: payload.proofFileId || null,
      status: 'PENDING'
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function approveOfflineDeposit(txUuid, adminId) {
  const { data, error } = await supabase.rpc('approve_offline_deposit_and_sync', {
    p_tx_uuid: txUuid,
    p_admin_id: adminId
  });
  if (error) throw error;
  return data;
}

async function approveOnlineDeposit(txUuid, adminId) {
  const { data, error } = await supabase.rpc('approve_online_deposit', {
    p_tx_uuid: txUuid,
    p_admin_id: adminId
  });
  if (error) throw error;
  return data;
}

async function rejectTransaction(txUuid, adminId) {
  const { data, error } = await supabase
    .from('transactions')
    .update({
      status: 'REJECTED',
      approved_by: adminId,
      updated_at: new Date().toISOString()
    })
    .eq('id', txUuid)
    .eq('status', 'PENDING')
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function updateTransactionSyncStatus(txUuid, syncStatus) {
  await supabase
    .from('transactions')
    .update({ sync_status: syncStatus, updated_at: new Date().toISOString() })
    .eq('id', txUuid);
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

async function findPendingTxByRef(refId) {
  const { data } = await supabase
    .from('transactions')
    .select('*')
    .eq('transaction_id', refId.trim().toUpperCase())
    .eq('status', 'PENDING')
    .maybeSingle();

  return data || null;
}

// ============================================================================
// APP SETTINGS (CACHED OFFLINE .ZIP FILE_ID)
// ============================================================================
async function getAppSetting(key) {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  return data ? data.value : null;
}

async function setAppSetting(key, value) {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() });

  if (error) throw error;
}

module.exports = {
  supabase,
  normalizePhone,
  ensureOnlineWallet,
  getOnlineWallet,
  adjustOnlineWalletBalance,
  verifyActiveShop,
  findShopByQuery,
  getTelegramLink,
  saveTelegramLink,
  registerNewShop,
  activateShop,
  isTransactionDuplicate,
  createPendingTransaction,
  approveOfflineDeposit,
  approveOnlineDeposit,
  rejectTransaction,
  updateTransactionSyncStatus,
  getUserTransactions,
  findPendingTxByRef,
  getAppSetting,
  setAppSetting
};
