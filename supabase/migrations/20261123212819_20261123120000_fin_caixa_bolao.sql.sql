/*
# Financial module: Caixa Bolão (daily bolao cash control)

1. Plain-English explanation
   - Adds a daily "Caixa Bolão" control to the financial module, mirroring the
     CONTROLE_CAIXA_BOLAO spreadsheet. Each row is one operator's day, and the
     screen aggregates rows by month.
2. New Tables
   - `fin_caixa_bolao`: one row per operator per day with the spreadsheet columns:
     - `total_done` (Total feito), `commission` (Comissão), `encalhe` (Encalhe),
     - `fee` (Taxa), `sangria` (Sangria), `marketplace` (Marketplace),
     - `premiacao` (Premiação), `separate_commission` (comissão separada),
     - `pix` (pix), `receivable` (A receber), `notes` (Observações).
     - Scoped by `branch_id` and `operator_id`; unique per (operator_id, entry_date).
3. Security
   - RLS enabled. Policies mirror `fin_bolao_closing`: admins see everything,
     supervisors see their branch, operators see/edit their own rows.
   - Grants SELECT/INSERT/UPDATE/DELETE to authenticated.
*/

CREATE TABLE IF NOT EXISTS fin_caixa_bolao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  operator_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  total_done numeric NOT NULL DEFAULT 0,
  commission numeric NOT NULL DEFAULT 0,
  encalhe numeric NOT NULL DEFAULT 0,
  fee numeric NOT NULL DEFAULT 0,
  sangria numeric NOT NULL DEFAULT 0,
  marketplace numeric NOT NULL DEFAULT 0,
  premiacao numeric NOT NULL DEFAULT 0,
  separate_commission numeric NOT NULL DEFAULT 0,
  pix numeric NOT NULL DEFAULT 0,
  receivable numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operator_id, entry_date)
);

CREATE INDEX IF NOT EXISTS fin_caixa_bolao_entry_date_idx ON fin_caixa_bolao (entry_date);
CREATE INDEX IF NOT EXISTS fin_caixa_bolao_operator_idx ON fin_caixa_bolao (operator_id);

ALTER TABLE fin_caixa_bolao ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON fin_caixa_bolao TO authenticated;

DROP POLICY IF EXISTS "fin_cb_select" ON fin_caixa_bolao;
CREATE POLICY "fin_cb_select" ON fin_caixa_bolao FOR SELECT
TO authenticated
USING (is_admin() OR (is_supervisor() AND branch_id = get_my_branch_id()) OR operator_id = auth.uid());

DROP POLICY IF EXISTS "fin_cb_insert" ON fin_caixa_bolao;
CREATE POLICY "fin_cb_insert" ON fin_caixa_bolao FOR INSERT
TO authenticated
WITH CHECK (is_admin() OR (branch_id = get_my_branch_id()));

DROP POLICY IF EXISTS "fin_cb_update" ON fin_caixa_bolao;
CREATE POLICY "fin_cb_update" ON fin_caixa_bolao FOR UPDATE
TO authenticated
USING (is_admin() OR (is_admin_or_supervisor() AND branch_id = get_my_branch_id()) OR (operator_id = auth.uid() AND branch_id = get_my_branch_id()))
WITH CHECK (is_admin() OR (is_admin_or_supervisor() AND branch_id = get_my_branch_id()) OR (operator_id = auth.uid() AND branch_id = get_my_branch_id()));

DROP POLICY IF EXISTS "fin_cb_delete" ON fin_caixa_bolao;
CREATE POLICY "fin_cb_delete" ON fin_caixa_bolao FOR DELETE
TO authenticated
USING (is_admin() OR (is_admin_or_supervisor() AND branch_id = get_my_branch_id()) OR (operator_id = auth.uid() AND branch_id = get_my_branch_id()));
