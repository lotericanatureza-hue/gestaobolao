/*
# Add Valor 003 to Daily Control + Create Loans (Empréstimos) Table

## Overview
Two changes:
1. Adds a new monetary field "valor_003" to fin_daily_control — an extra value column the user wants to track.
2. Creates a new fin_loans table to record money lent between branches (Filial A → Filial B) with partial or full returns.

## Modified Tables
- `fin_daily_control`
  - `valor_003` (numeric(12,2), default 0) — additional value field for daily control

## New Tables
- `fin_loans` — inter-branch loans
  - id (uuid, PK)
  - from_branch_id (uuid, FK → branches) — branch lending the money
  - to_branch_id (uuid, FK → branches) — branch receiving the money
  - loan_date (date) — date the loan was made
  - amount (numeric(12,2)) — original loan amount
  - returned_amount (numeric(12,2), default 0) — cumulative amount returned
  - status (text: 'active' | 'returned') — whether fully returned
  - description (text, nullable) — optional notes about the loan
  - created_by (uuid, FK → auth.users)
  - created_at (timestamptz)
  - updated_at (timestamptz)

- `fin_loan_returns` — individual return payments against a loan
  - id (uuid, PK)
  - loan_id (uuid, FK → fin_loans ON DELETE CASCADE)
  - return_date (date) — date the return was made
  - amount (numeric(12,2)) — amount returned
  - created_by (uuid, FK → auth.users)
  - created_at (timestamptz)

## Security
- RLS enabled on fin_loans and fin_loan_returns
- Admin: full CRUD (is_admin())
- Supervisor/Operator: read all, write own branch-related rows
- Uses existing helper functions is_admin(), is_admin_or_supervisor(), get_my_branch_id()
*/

-- ============================================================================
-- 1. Add valor_003 to fin_daily_control
-- ============================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fin_daily_control' AND column_name = 'valor_003') THEN
    ALTER TABLE fin_daily_control ADD COLUMN valor_003 numeric(12,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

-- ============================================================================
-- 2. fin_loans
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  to_branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  loan_date date NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  returned_amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'returned')),
  description text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE fin_loans ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_fin_loans_from_branch ON fin_loans(from_branch_id);
CREATE INDEX IF NOT EXISTS idx_fin_loans_to_branch ON fin_loans(to_branch_id);
CREATE INDEX IF NOT EXISTS idx_fin_loans_date ON fin_loans(loan_date);
CREATE INDEX IF NOT EXISTS idx_fin_loans_status ON fin_loans(status);

DROP POLICY IF EXISTS "fin_loans_select" ON fin_loans;
CREATE POLICY "fin_loans_select" ON fin_loans FOR SELECT
  TO authenticated USING (is_admin() OR from_branch_id = get_my_branch_id() OR to_branch_id = get_my_branch_id());

DROP POLICY IF EXISTS "fin_loans_insert" ON fin_loans;
CREATE POLICY "fin_loans_insert" ON fin_loans FOR INSERT
  TO authenticated WITH CHECK (is_admin() OR (is_admin_or_supervisor() AND (from_branch_id = get_my_branch_id() OR to_branch_id = get_my_branch_id())));

DROP POLICY IF EXISTS "fin_loans_update" ON fin_loans;
CREATE POLICY "fin_loans_update" ON fin_loans FOR UPDATE
  TO authenticated USING (is_admin() OR (is_admin_or_supervisor() AND (from_branch_id = get_my_branch_id() OR to_branch_id = get_my_branch_id())))
  WITH CHECK (is_admin() OR (is_admin_or_supervisor() AND (from_branch_id = get_my_branch_id() OR to_branch_id = get_my_branch_id())));

DROP POLICY IF EXISTS "fin_loans_delete" ON fin_loans;
CREATE POLICY "fin_loans_delete" ON fin_loans FOR DELETE
  TO authenticated USING (is_admin() OR (is_admin_or_supervisor() AND (from_branch_id = get_my_branch_id() OR to_branch_id = get_my_branch_id())));

CREATE OR REPLACE TRIGGER fin_loans_update_updated_at
BEFORE UPDATE ON fin_loans
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 3. fin_loan_returns
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin_loan_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES fin_loans(id) ON DELETE CASCADE,
  return_date date NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE fin_loan_returns ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_fin_loan_returns_loan ON fin_loan_returns(loan_id);
CREATE INDEX IF NOT EXISTS idx_fin_loan_returns_date ON fin_loan_returns(return_date);

DROP POLICY IF EXISTS "fin_loan_returns_select" ON fin_loan_returns;
CREATE POLICY "fin_loan_returns_select" ON fin_loan_returns FOR SELECT
  TO authenticated USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM fin_loans l WHERE l.id = fin_loan_returns.loan_id
      AND (l.from_branch_id = get_my_branch_id() OR l.to_branch_id = get_my_branch_id())
    )
  );

DROP POLICY IF EXISTS "fin_loan_returns_insert" ON fin_loan_returns;
CREATE POLICY "fin_loan_returns_insert" ON fin_loan_returns FOR INSERT
  TO authenticated WITH CHECK (
    is_admin() OR (is_admin_or_supervisor() AND EXISTS (
      SELECT 1 FROM fin_loans l WHERE l.id = fin_loan_returns.loan_id
      AND (l.from_branch_id = get_my_branch_id() OR l.to_branch_id = get_my_branch_id())
    ))
  );

DROP POLICY IF EXISTS "fin_loan_returns_delete" ON fin_loan_returns;
CREATE POLICY "fin_loan_returns_delete" ON fin_loan_returns FOR DELETE
  TO authenticated USING (
    is_admin() OR (is_admin_or_supervisor() AND EXISTS (
      SELECT 1 FROM fin_loans l WHERE l.id = fin_loan_returns.loan_id
      AND (l.from_branch_id = get_my_branch_id() OR l.to_branch_id = get_my_branch_id())
    ))
  );
