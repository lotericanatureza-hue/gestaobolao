/*
# Add current_safe_amount column to fin_daily_control

1. Modified Tables
- `fin_daily_control`: adds `current_safe_amount` (numeric, default 0) to store the
  "Valor atual no Cofre" (current safe amount) as a separate field from `safe_amount`
  (which is now labeled "Carro Forte" in the UI).

2. Security
- No RLS policy changes. Existing policies on fin_daily_control remain unchanged.

3. Notes
- The `valor_043` column is NOT dropped (data safety). It is simply no longer used
  in the UI. Existing data is preserved.
- `current_safe_amount` defaults to 0 so existing rows are not affected.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fin_daily_control' AND column_name = 'current_safe_amount'
  ) THEN
    ALTER TABLE fin_daily_control ADD COLUMN current_safe_amount numeric DEFAULT 0;
  END IF;
END $$;
