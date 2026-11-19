-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. SHOPS TABLE (Physical Offline Bingo/Keno Centers)
CREATE TABLE IF NOT EXISTS shops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id TEXT UNIQUE NOT NULL,         -- e.g., SHOP-BF24C9E7
  username TEXT NOT NULL,               -- e.g., adis, eyu
  center_name TEXT,
  phone TEXT,
  region TEXT,
  mac_address TEXT,
  balance NUMERIC(14, 2) DEFAULT 0.00,
  status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PENDING', 'SUSPENDED')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(shop_id, username)
);

-- 2. TELEGRAM LINKS TABLE (Connects Telegram Users to Offline Shops)
CREATE TABLE IF NOT EXISTS telegram_links (
  telegram_id BIGINT PRIMARY KEY,
  telegram_username TEXT,
  phone TEXT,
  shop_id TEXT REFERENCES shops(shop_id) ON UPDATE CASCADE,
  shop_username TEXT,
  linked_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ONLINE WALLETS TABLE (Mode B: Online Bingo, Keno, Aviator)
CREATE TABLE IF NOT EXISTS online_wallets (
  telegram_id BIGINT PRIMARY KEY,
  telegram_username TEXT,
  full_name TEXT,
  balance NUMERIC(14, 2) DEFAULT 0.00 CHECK (balance >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TRANSACTIONS TABLE (Unified Ledger + Strict Duplicate Prevention)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id TEXT UNIQUE NOT NULL,  -- Telebirr / CBE / BOA Ref ID or Photo Ref
  telegram_id BIGINT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('OFFLINE_SHOP', 'ONLINE_GAME', 'ONLINE_BET', 'ONLINE_WIN')),
  shop_id TEXT,
  shop_username TEXT,
  amount NUMERIC(14, 2) NOT NULL,
  parsed_amount NUMERIC(14, 2),
  payment_method TEXT,                  -- TELEBIRR, CBE, BOA, SCREENSHOT, GAME_ENGINE
  proof_text TEXT,
  proof_file_id TEXT,
  status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  sync_status TEXT DEFAULT 'N/A',       -- N/A, READY_TO_SYNC, SYNCED, FAILED
  approved_by BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. APP SETTINGS TABLE (Stores cached Telegram file_id for 147MB-170MB .zip)
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- ATOMIC RPC 1: APPROVE OFFLINE SHOP DEPOSIT & PREPARE SYNC
-- ============================================================================
CREATE OR REPLACE FUNCTION approve_offline_deposit_and_sync(
  p_tx_uuid UUID,
  p_admin_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_tx RECORD;
  v_new_balance NUMERIC;
BEGIN
  SELECT * INTO v_tx FROM transactions WHERE id = p_tx_uuid FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction not found');
  END IF;

  IF v_tx.status <> 'PENDING' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction already processed: ' || v_tx.status);
  END IF;

  UPDATE shops
  SET balance = balance + v_tx.amount,
      updated_at = NOW()
  WHERE shop_id = v_tx.shop_id
    AND LOWER(username) = LOWER(v_tx.shop_username)
    AND status = 'ACTIVE'
  RETURNING balance INTO v_new_balance;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Active shop/username not found');
  END IF;

  UPDATE transactions
  SET status = 'APPROVED',
      sync_status = 'READY_TO_SYNC',
      approved_by = p_admin_id,
      updated_at = NOW()
  WHERE id = p_tx_uuid;

  RETURN jsonb_build_object(
    'success', true,
    'shop_id', v_tx.shop_id,
    'username', v_tx.shop_username,
    'amount', v_tx.amount,
    'ref_id', v_tx.transaction_id,
    'telegram_id', v_tx.telegram_id,
    'new_balance', v_new_balance
  );
END;
$$;

-- ============================================================================
-- ATOMIC RPC 2: APPROVE ONLINE GAME WALLET DEPOSIT
-- ============================================================================
CREATE OR REPLACE FUNCTION approve_online_deposit(
  p_tx_uuid UUID,
  p_admin_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_tx RECORD;
  v_new_balance NUMERIC;
BEGIN
  SELECT * INTO v_tx FROM transactions WHERE id = p_tx_uuid FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction not found');
  END IF;

  IF v_tx.status <> 'PENDING' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction already processed: ' || v_tx.status);
  END IF;

  INSERT INTO online_wallets (telegram_id, balance)
  VALUES (v_tx.telegram_id, v_tx.amount)
  ON CONFLICT (telegram_id)
  DO UPDATE SET
    balance = online_wallets.balance + v_tx.amount,
    updated_at = NOW()
  RETURNING balance INTO v_new_balance;

  UPDATE transactions
  SET status = 'APPROVED',
      approved_by = p_admin_id,
      updated_at = NOW()
  WHERE id = p_tx_uuid;

  RETURN jsonb_build_object(
    'success', true,
    'telegram_id', v_tx.telegram_id,
    'amount', v_tx.amount,
    'ref_id', v_tx.transaction_id,
    'new_balance', v_new_balance
  );
END;
$$;
