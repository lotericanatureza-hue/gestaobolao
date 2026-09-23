/*
# Add valor_043 (Debitado em conta) to fin_daily_control

1. Modified Tables
- `fin_daily_control`: added column `valor_043` (numeric, default 0)
  - Represents "Debitado em conta (043)" — amounts debited from the bank account
  - The balance_difference formula changes to: valor_043 - (worked_amount - safe_amount)
    i.e. debitado - saldo, where saldo = trabalhado - cofre

2. Security
- No changes to RLS policies; existing policies still apply.

3. Notes
- The new column defaults to 0 so existing rows are not affected.
- The balance_difference column is still stored but the frontend now computes
  the new formula: valor_043 - (worked_amount - safe_amount).
*/

ALTER TABLE fin_daily_control
ADD COLUMN IF NOT EXISTS valor_043 numeric DEFAULT 0;
