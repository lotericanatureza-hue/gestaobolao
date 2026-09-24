/*
# Add withdrawals columns to fin_cash_closing

1. Modified Tables
- `fin_cash_closing`: adds `withdrawals` (jsonb, default '[]') to store individual
  withdrawal items (id, description, amount) in retroactive/manual mode, and
  `total_withdrawals` (numeric, default 0) for the summed total.

2. Security
- No RLS policy changes. Existing policies on fin_cash_closing remain unchanged.

3. Notes
- Both columns default safely so existing rows are not affected.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fin_cash_closing' AND column_name = 'withdrawals'
  ) THEN
    ALTER TABLE fin_cash_closing ADD COLUMN withdrawals jsonb DEFAULT '[]'::jsonb;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fin_cash_closing' AND column_name = 'total_withdrawals'
  ) THEN
    ALTER TABLE fin_cash_closing ADD COLUMN total_withdrawals numeric DEFAULT 0;
  END IF;
END $$;
