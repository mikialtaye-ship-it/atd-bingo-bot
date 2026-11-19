-- ====================================================================
-- ATD BINGO - SUPABASE DATABASE SCHEMA & RPC FUNCTIONS
-- ====================================================================
-- Run this script in the Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)

-- 1. Ensure pgcrypto extension is available for UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- --------------------------------------------------------------------
-- 2. USERS TABLE
-- Stores ATD Bingo player profiles, balances, and linked Telegram IDs
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0),
    telegram_id BIGINT UNIQUE,
    telegram_username TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexing for fast search during account linking
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON public.users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_phone ON public.users(phone);
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users(username);

-- --------------------------------------------------------------------
-- 3. TRANSACTIONS TABLE
-- Records deposits, receipts, verification state, and duplicate prevention
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    telegram_id BIGINT NOT NULL,
    username TEXT,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('TELEBIRR', 'CBE', 'BOA', 'OTHER')),
    -- Critical: UNIQUE constraint guarantees no double spending or duplicate SMS claims
    transaction_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    receipt_url TEXT,
    raw_sms TEXT,
    source TEXT NOT NULL DEFAULT 'telegram_bot' CHECK (source IN ('telegram_bot', 'sms_forwarder', 'manual_admin')),
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_transactions_tx_id ON public.transactions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transactions_telegram_id ON public.transactions(telegram_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions(created_at DESC);

-- --------------------------------------------------------------------
-- 4. APP_SETTINGS TABLE
-- Persists dynamic bot configuration including Telegram Cached File IDs
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default rows if not already present
INSERT INTO public.app_settings (key, value, description)
VALUES 
    ('offline_app_file_id', '', 'Telegram file_id of the cached ~170MB .zip offline app'),
    ('offline_app_name', 'ATD-Bingo-Offline.zip', 'Filename displayed to users'),
    ('offline_app_size', '168 MB', 'Approximate file size of the offline application'),
    ('offline_app_version', 'v2.4.0', 'Current production version of the offline application'),
    ('offline_app_download_url', '', 'Fallback direct download URL (GitHub / Google Drive / S3)')
ON CONFLICT (key) DO NOTHING;

-- --------------------------------------------------------------------
-- 5. ATOMIC RPC FUNCTION: approve_deposit_and_sync_balance
-- Safely increments user balance and marks transaction as approved
-- Uses pessimistic row locking (FOR UPDATE) to prevent race conditions
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_deposit_and_sync_balance(
    p_transaction_id TEXT,
    p_admin_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with elevated security permissions
AS $$
DECLARE
    v_txn RECORD;
    v_new_balance NUMERIC(12, 2);
BEGIN
    -- 1. Lock and fetch the pending transaction row
    SELECT * INTO v_txn
    FROM public.transactions
    WHERE transaction_id = p_transaction_id
    FOR UPDATE;

    -- 2. Verify transaction exists
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Transaction not found with ID: ' || p_transaction_id
        );
    END IF;

    -- 3. Verify status is still pending (prevent re-approval)
    IF v_txn.status <> 'pending' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Transaction is already ' || v_txn.status || ' (Processed at: ' || COALESCE(v_txn.reviewed_at::TEXT, 'N/A') || ')'
        );
    END IF;

    -- 4. Verify user exists
    IF v_txn.user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No linked user found for this transaction'
        );
    END IF;

    -- 5. Atomically update user's balance
    UPDATE public.users
    SET 
        balance = COALESCE(balance, 0.00) + v_txn.amount,
        updated_at = NOW()
    WHERE id = v_txn.user_id
    RETURNING balance INTO v_new_balance;

    -- 6. Update transaction record
    UPDATE public.transactions
    SET 
        status = 'approved',
        reviewed_by = COALESCE(p_admin_id, 'SYSTEM'),
        reviewed_at = NOW(),
        updated_at = NOW()
    WHERE id = v_txn.id;

    -- 7. Return success result with all critical parameters for webhook sync
    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_txn.transaction_id,
        'user_id', v_txn.user_id,
        'telegram_id', v_txn.telegram_id,
        'username', v_txn.username,
        'amount', v_txn.amount,
        'new_balance', v_new_balance,
        'payment_method', v_txn.payment_method
    );
EXCEPTION WHEN OTHERS THEN
    -- In case of any unhandled database error, rollback and return error details
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- --------------------------------------------------------------------
-- 6. ATOMIC RPC FUNCTION: reject_deposit
-- Safely marks a transaction as rejected with a reason
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_deposit(
    p_transaction_id TEXT,
    p_reason TEXT DEFAULT NULL,
    p_admin_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_txn RECORD;
BEGIN
    SELECT * INTO v_txn
    FROM public.transactions
    WHERE transaction_id = p_transaction_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Transaction not found with ID: ' || p_transaction_id
        );
    END IF;

    IF v_txn.status <> 'pending' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Transaction cannot be rejected because it is already ' || v_txn.status
        );
    END IF;

    UPDATE public.transactions
    SET 
        status = 'rejected',
        rejection_reason = COALESCE(p_reason, 'Invalid receipt or payment not verified'),
        reviewed_by = COALESCE(p_admin_id, 'SYSTEM'),
        reviewed_at = NOW(),
        updated_at = NOW()
    WHERE id = v_txn.id;

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_txn.transaction_id,
        'telegram_id', v_txn.telegram_id,
        'user_id', v_txn.user_id,
        'amount', v_txn.amount,
        'reason', COALESCE(p_reason, 'Invalid receipt or payment not verified')
    );
END;
$$;

-- --------------------------------------------------------------------
-- 7. HELPER RPC FUNCTION: link_telegram_account
-- Links user's Telegram ID to their ATD Bingo username or phone
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.link_telegram_account(
    p_telegram_id BIGINT,
    p_telegram_username TEXT,
    p_identifier TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cleaned_identifier TEXT;
    v_user RECORD;
BEGIN
    -- Strip whitespace and common phone formatting
    v_cleaned_identifier := TRIM(p_identifier);

    -- Find user by phone OR username (case insensitive)
    SELECT * INTO v_user
    FROM public.users
    WHERE 
        LOWER(username) = LOWER(v_cleaned_identifier)
        OR phone = v_cleaned_identifier
        OR phone = REPLACE(v_cleaned_identifier, '+251', '0')
        OR phone = REPLACE(v_cleaned_identifier, '251', '0')
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'USER_NOT_FOUND'
        );
    END IF;

    -- Update Telegram ID and username
    UPDATE public.users
    SET 
        telegram_id = p_telegram_id,
        telegram_username = COALESCE(p_telegram_username, telegram_username),
        updated_at = NOW()
    WHERE id = v_user.id;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_user.id,
        'username', v_user.username,
        'phone', v_user.phone,
        'balance', v_user.balance
    );
END;
$$;
