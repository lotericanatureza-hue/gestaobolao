/*
# Add Cobertura 003 and deposits to daily control

1. Modified Tables
- `fin_daily_control`
  - `cover_003` (numeric, default 0): amount filled in the "Cobertura 003" field
  - `cover_003_type` (text, nullable): 'deposit' when the coverage was deposited, 'bank_balance' when it is the account balance
  - `bank_balance` (numeric, nullable): account balance informed when cover_003_type is 'bank_balance'
  - `deposits` (jsonb, default empty list): one or more deposit entries { id, amount, origin } when cover_003_type is 'deposit'

2. Security
- No new tables; existing row level security and grants on fin_daily_control are unchanged.

3. Notes
- Existing rows receive cover_003 = 0 and an empty deposits list, so historical data is untouched.
- All statements are idempotent and safe to re-run.
*/

ALTER TABLE fin_daily_control
  ADD COLUMN IF NOT EXISTS cover_003 numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cover_003_type text,
  ADD COLUMN IF NOT EXISTS bank_balance numeric,
  ADD COLUMN IF NOT EXISTS deposits jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE fin_daily_control DROP CONSTRAINT IF EXISTS fin_daily_control_cover_003_type_check;
ALTER TABLE fin_daily_control ADD CONSTRAINT fin_daily_control_cover_003_type_check
  CHECK (cover_003_type IS NULL OR cover_003_type IN ('deposit', 'bank_balance'));
