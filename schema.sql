-- Prerequisites: public.users has id UUID PRIMARY KEY and balance numeric.
-- Configure USER_IDENTIFIER_COLUMNS to match existing username/phone columns.

CREATE TABLE IF NOT EXISTS public.telegram_links (
  telegram_id text PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  telegram_id text NOT NULL,
  username text NOT NULL,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL CHECK (payment_method IN ('telebirr', 'cbe', 'abyssinia')),
  transaction_id text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  receipt_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transactions_user_created_idx
  ON public.transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transactions_pending_idx
  ON public.transactions (status, created_at) WHERE status = 'pending';

ALTER TABLE public.telegram_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_links FROM anon, authenticated;
REVOKE ALL ON public.transactions FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.approve_deposit_and_sync_balance(p_transaction_id text)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_transaction public.transactions%ROWTYPE;
  v_balance numeric;
BEGIN
  SELECT * INTO v_transaction
  FROM public.transactions
  WHERE transaction_id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;
  IF v_transaction.status <> 'pending' THEN
    RAISE EXCEPTION 'Transaction is not pending';
  END IF;

  UPDATE public.users
  SET balance = COALESCE(balance, 0) + v_transaction.amount
  WHERE id = v_transaction.user_id
  RETURNING balance INTO v_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User account not found';
  END IF;

  UPDATE public.transactions
  SET status = 'approved'
  WHERE id = v_transaction.id;

  RETURN v_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_deposit_and_sync_balance(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_deposit_and_sync_balance(text) TO service_role;