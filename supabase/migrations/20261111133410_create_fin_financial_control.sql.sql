/*
# Create daily financial control table (Controle Financeiro)

1. New Tables
- `fin_financial_control`: one row per branch per day with the daily cash entries
  - `branch_id` (uuid, references branches)
  - `entry_date` (date, the day the entry refers to)
  - `start_043` (numeric, 043 lottery value at start of day)
  - `end_043` (numeric, 043 lottery value at end of day)
  - `armored_car` (numeric, Carro forte amount)
  - `safe_difference` (numeric, Diferença no cofre)
  - `games_collection` (numeric, Arrecadação de jogos)
  - `notes` (text, Observação)
  - Unique (branch_id, entry_date) so each branch has at most one entry per day.

2. Security
- RLS enabled.
- Only authenticated users with role admin or supervisor can read and write rows.
- Four separate policies (select, insert, update, delete).

3. Notes
- No existing data is modified.
*/

CREATE TABLE IF NOT EXISTS fin_financial_control (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  start_043 numeric(12,2) NOT NULL DEFAULT 0,
  end_043 numeric(12,2) NOT NULL DEFAULT 0,
  armored_car numeric(12,2) NOT NULL DEFAULT 0,
  safe_difference numeric(12,2) NOT NULL DEFAULT 0,
  games_collection numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fin_financial_control_branch_date_key UNIQUE (branch_id, entry_date)
);

CREATE INDEX IF NOT EXISTS fin_financial_control_branch_date_idx ON fin_financial_control (branch_id, entry_date);

ALTER TABLE fin_financial_control ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON fin_financial_control TO authenticated;

DROP POLICY IF EXISTS "select_fin_financial_control" ON fin_financial_control;
CREATE POLICY "select_fin_financial_control" ON fin_financial_control FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'supervisor'))
);

DROP POLICY IF EXISTS "insert_fin_financial_control" ON fin_financial_control;
CREATE POLICY "insert_fin_financial_control" ON fin_financial_control FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'supervisor'))
);

DROP POLICY IF EXISTS "update_fin_financial_control" ON fin_financial_control;
CREATE POLICY "update_fin_financial_control" ON fin_financial_control FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'supervisor'))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'supervisor'))
);

DROP POLICY IF EXISTS "delete_fin_financial_control" ON fin_financial_control;
CREATE POLICY "delete_fin_financial_control" ON fin_financial_control FOR DELETE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'supervisor'))
);
