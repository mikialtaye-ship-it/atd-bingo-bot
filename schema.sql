-- ════════════════════════════════════════════════════════════════
--  ATD BINGO BOT — SUPABASE POSTGRESQL SCHEMA
--  Run this entire file in Supabase SQL Editor (once, top-to-bottom)
-- ════════════════════════════════════════════════════════════════

-- ── Shops (Mode A — Offline Center Registry) ─────────────────────
CREATE TABLE IF NOT EXISTS shops (
  id              SERIAL PRIMARY KEY,
  shop_id         TEXT UNIQUE NOT NULL,          -- e.g. SHOP-BF24C9E7
  username        TEXT NOT NULL,                  -- ATD client username  (lowercase)
  owner_name      TEXT,
  phone           TEXT,
  region          TEXT,
  address         TEXT,
  mac_address     TEXT,
  status          TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | ACTIVE | SUSPENDED
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── Telegram <-> Shop Links ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS telegram_links (
  id                SERIAL PRIMARY KEY,
  telegram_id       BIGINT UNIQUE NOT NULL,
  telegram_username TEXT,
  phone             TEXT,
  shop_id           TEXT REFERENCES shops(shop_id),
  username          TEXT,
  linked_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ── Online Wallets (Mode B — Online Gaming Hub) ───────────────────
CREATE TABLE IF NOT EXISTS online_wallets (
  id                SERIAL PRIMARY KEY,
  telegram_id       BIGINT UNIQUE NOT NULL,
  telegram_username TEXT,
  balance           NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── Transactions (unified ledger) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id               SERIAL PRIMARY KEY,
  transaction_id   TEXT UNIQUE,                    -- SMS ref number / photo hash
  type             TEXT NOT NULL,                  -- OFFLINE_SHOP | ONLINE_WALLET
  telegram_id      BIGINT NOT NULL,
  shop_id          TEXT,
  username         TEXT,
  requested_amount NUMERIC(12,2),
  parsed_amount    NUMERIC(12,2),
  status           TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | APPROVED | REJECTED
  photo_file_id    TEXT,
  raw_sms          TEXT,
  admin_note       TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── App Settings (key/value store) ───────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed the offline app file_id row
INSERT INTO app_settings (key, value) VALUES ('offline_app_file_id', NULL)
  ON CONFLICT (key) DO NOTHING;

-- ════════════════════════════════════════════════════════════════
--  ATOMIC RPC FUNCTIONS
-- ════════════════════════════════════════════════════════════════

-- Approve offline deposit
-- (Balance lives in ATD Control Dashboard / bingo-sync-api; we only
--  mark the transaction APPROVED here and push to the dashboard via HTTP)
CREATE OR REPLACE FUNCTION approve_offline_deposit_and_sync(
  p_transaction_id TEXT,
  p_shop_id        TEXT,
  p_username       TEXT,
  p_amount         NUMERIC
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE transactions
  SET    status     = 'APPROVED',
         updated_at = NOW()
  WHERE  transaction_id = p_transaction_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found: %', p_transaction_id;
  END IF;
END;
$$;

-- Approve online deposit  (credits online_wallets.balance atomically)
CREATE OR REPLACE FUNCTION approve_online_deposit(
  p_transaction_id TEXT,
  p_telegram_id    BIGINT,
  p_amount         NUMERIC
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE transactions
  SET    status     = 'APPROVED',
         updated_at = NOW()
  WHERE  transaction_id = p_transaction_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found: %', p_transaction_id;
  END IF;

  -- Upsert online wallet and credit balance atomically
  INSERT INTO online_wallets (telegram_id, balance)
  VALUES (p_telegram_id, p_amount)
  ON CONFLICT (telegram_id) DO UPDATE
    SET balance    = online_wallets.balance + p_amount,
        updated_at = NOW();
END;
$$;

-- ── Indexes ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_transactions_telegram_id ON transactions(telegram_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status      ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_type        ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_shops_status             ON shops(status);
CREATE INDEX IF NOT EXISTS idx_telegram_links_tg_id     ON telegram_links(telegram_id);
