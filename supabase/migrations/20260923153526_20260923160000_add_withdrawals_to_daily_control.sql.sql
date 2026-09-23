/*
# Add withdrawals (retiradas) array to fin_daily_control

1. Modified Tables
- `fin_daily_control`: added column `withdrawals` (jsonb, default '[]')
  - Stores an array of { id, description, amount } objects
  - Each entry represents one withdrawal (retirada) with a value and observation
  - The old `valor_003` column remains for backward compatibility; the frontend
    will now use the sum of withdrawals as the total retiradas value

2. Security
- No changes to RLS policies; existing policies still apply.

3. Notes
- The new column defaults to an empty array so existing rows are not affected.
- The `valor_003` column is kept to avoid data loss; new records will store
  the sum of withdrawals in `valor_003` for backward-compatible totals.
*/

ALTER TABLE fin_daily_control
ADD COLUMN IF NOT EXISTS withdrawals jsonb DEFAULT '[]'::jsonb;
