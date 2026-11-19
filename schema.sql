-- ============================================================
-- ATD Bingo Bot — Supabase PostgreSQL Schema
-- ============================================================

-- ============================================================
-- 1. updated_at trigger function (reusable)
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 2. shops table
-- ============================================================
CREATE TABLE IF NOT EXISTS shops (
  id BIGSERIAL PRIMARY KEY,
  shop_id TEXT UNIQUE NOT NULL,
  center_name TEXT NOT NULL,
  username TEXT NOT NULL,
  phone TEXT,
  region TEXT,
  mac_address TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_by_telegram_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT shops_status_check CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED'))
);
CREATE UNIQUE INDEX IF NOT EXISTS shops_shop_id_username_idx ON shops(shop_id, username);
CREATE TRIGGER shops_updated_at BEFORE UPDATE ON shops FOR EACH ROW EXECUTE FUNCTION set_updated_at();
COMMENT ON TABLE shops IS 'ATD Bingo offline shop/center registry';
COMMENT ON COLUMN shops.shop_id IS 'Unique shop identifier, format: SHOP-XXXXXXXX';
COMMENT ON COLUMN shops.status IS 'ACTIVE | INACTIVE | SUSPENDED';

-- ============================================================
-- 3. telegram_links table
-- ============================================================
CREATE TABLE IF NOT EXISTS telegram_links (
  id BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  shop_id TEXT NOT NULL REFERENCES shops(shop_id) ON DELETE RESTRICT,
  username TEXT NOT NULL,
  linked_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS telegram_links_shop_id_idx ON telegram_links(shop_id);
COMMENT ON TABLE telegram_links IS 'Links Telegram users to their offline shop accounts';

-- ============================================================
-- 4. online_wallets table
-- ============================================================
CREATE TABLE IF NOT EXISTS online_wallets (
  id BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  balance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT online_wallets_balance_check CHECK (balance >= 0)
);
CREATE TRIGGER online_wallets_updated_at BEFORE UPDATE ON online_wallets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
COMMENT ON TABLE online_wallets IS 'Online gaming wallet for each Telegram user';

-- ============================================================
-- 5. transactions table
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
  id BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  shop_id TEXT,
  username TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  transaction_id TEXT,
  proof_photo_file_id TEXT,
  game TEXT,
  ref_id TEXT,
  admin_telegram_id BIGINT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT transactions_type_check CHECK (type IN ('OFFLINE_DEPOSIT', 'ONLINE_DEPOSIT', 'GAME_BET', 'GAME_WIN', 'REGISTRATION')),
  CONSTRAINT transactions_status_check CHECK (status IN ('PENDING_OFFLINE', 'PENDING_ONLINE', 'APPROVED', 'REJECTED', 'SYNCED', 'PENDING'))
);
CREATE INDEX IF NOT EXISTS transactions_telegram_id_idx ON transactions(telegram_id);
CREATE INDEX IF NOT EXISTS transactions_status_idx ON transactions(status);
CREATE INDEX IF NOT EXISTS transactions_type_idx ON transactions(type);
CREATE UNIQUE INDEX IF NOT EXISTS transactions_transaction_id_unique_idx ON transactions(transaction_id) WHERE transaction_id IS NOT NULL;
CREATE TRIGGER transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
COMMENT ON TABLE transactions IS 'Central ledger for all deposits and game transactions';
COMMENT ON COLUMN transactions.type IS 'OFFLINE_DEPOSIT | ONLINE_DEPOSIT | GAME_BET | GAME_WIN | REGISTRATION';
COMMENT ON COLUMN transactions.status IS 'PENDING_OFFLINE | PENDING_ONLINE | APPROVED | REJECTED | SYNCED';
COMMENT ON COLUMN transactions.transaction_id IS 'External payment reference (Telebirr, CBE FT..., BOA ref). Unique when not null.';
COMMENT ON COLUMN transactions.notes IS 'JSON string for structured data (e.g., registration details)';

-- ============================================================
-- 6. app_settings table
-- ============================================================
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE app_settings IS 'Key-value store for bot settings (e.g., offline_app_file_id)';
-- Seed default
INSERT INTO app_settings (key, value) VALUES ('offline_app_file_id', '') ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 7. RPC: approve_offline_deposit_and_sync
-- ============================================================
CREATE OR REPLACE FUNCTION approve_offline_deposit_and_sync(p_transaction_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transaction transactions%ROWTYPE;
BEGIN
  SELECT * INTO v_transaction FROM transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction not found');
  END IF;
  IF v_transaction.status != 'PENDING_OFFLINE' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction not in PENDING_OFFLINE status', 'current_status', v_transaction.status);
  END IF;
  UPDATE transactions 
    SET status = 'SYNCED', admin_telegram_id = NULL, updated_at = NOW() 
    WHERE id = p_transaction_id;
  RETURN jsonb_build_object(
    'success', true,
    'transaction_db_id', v_transaction.id,
    'telegram_id', v_transaction.telegram_id,
    'shop_id', v_transaction.shop_id,
    'username', v_transaction.username,
    'amount', v_transaction.amount,
    'transaction_id', v_transaction.transaction_id
  );
END;
$$;
COMMENT ON FUNCTION approve_offline_deposit_and_sync IS 'Atomically marks an offline deposit as SYNCED. Balance transfer is handled externally via bingo-sync-api.onrender.com.';

-- ============================================================
-- 8. RPC: approve_online_deposit
-- ============================================================
CREATE OR REPLACE FUNCTION approve_online_deposit(p_transaction_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_transaction transactions%ROWTYPE;
  v_new_balance NUMERIC(12,2);
BEGIN
  SELECT * INTO v_transaction FROM transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction not found');
  END IF;
  IF v_transaction.status != 'PENDING_ONLINE' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transaction not in PENDING_ONLINE status', 'current_status', v_transaction.status);
  END IF;
  UPDATE transactions 
    SET status = 'APPROVED', updated_at = NOW() 
    WHERE id = p_transaction_id;
  INSERT INTO online_wallets (telegram_id, balance)
    VALUES (v_transaction.telegram_id, v_transaction.amount)
    ON CONFLICT (telegram_id)
    DO UPDATE SET 
      balance = online_wallets.balance + EXCLUDED.balance,
      updated_at = NOW()
    RETURNING balance INTO v_new_balance;
  RETURN jsonb_build_object(
    'success', true,
    'telegram_id', v_transaction.telegram_id,
    'amount_added', v_transaction.amount,
    'new_balance', v_new_balance
  );
END;
$$;
COMMENT ON FUNCTION approve_online_deposit IS 'Atomically marks an online deposit as APPROVED and credits the online_wallets balance.';

-- ============================================================
-- 9. Row Level Security
-- ============================================================
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE online_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Service role bypass (the bot uses service_role key, so it bypasses RLS)
-- These policies allow full access via service_role
CREATE POLICY "Service role full access" ON shops TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON telegram_links TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON online_wallets TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON transactions TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON app_settings TO service_role USING (true) WITH CHECK (true);
