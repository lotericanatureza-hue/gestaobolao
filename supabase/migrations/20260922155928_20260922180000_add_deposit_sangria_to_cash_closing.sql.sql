/*
# Add deposit/sangria fields to cash closing

1. Modified Tables
- `fin_cash_closing`
  - `deposit_amount` (numeric, default 0) — value of deposits made
  - `sangria_amount` (numeric, default 0) — value of sangrias (cash withdrawals)
2. Notes
- Both columns default to 0 so existing rows are unaffected.
- No security changes — existing RLS policies already cover the table.
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fin_cash_closing' AND column_name = 'deposit_amount') THEN
    ALTER TABLE fin_cash_closing ADD COLUMN deposit_amount numeric NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fin_cash_closing' AND column_name = 'sangria_amount') THEN
    ALTER TABLE fin_cash_closing ADD COLUMN sangria_amount numeric NOT NULL DEFAULT 0;
  END IF;
END $$;
