/*
# Create fin_bolao_geral_addinfo table

## Purpose
Creates a separate table for "Informações adicionais" — financial fields
(prejuízo, comissão, premiação, venda marketing, venda dinheiro, fiado,
valor pix, observações) that are registered independently of any bolão
game launch. Supports both daily and monthly entries.

## New Tables
- `fin_bolao_geral_addinfo`
  - `id` (uuid, primary key)
  - `branch_id` (uuid, references branches, not null)
  - `period` (text: 'daily' or 'monthly', not null, default 'daily')
  - `ref_date` (date, not null) — the day for daily entries, or the 1st of the month for monthly entries
  - `prejuizo` (numeric, default 0)
  - `comissao` (numeric, default 0)
  - `premiacao` (numeric, default 0)
  - `venda_marketing` (numeric, default 0)
  - `venda_dinheiro` (numeric, default 0)
  - `fiado` (numeric, default 0)
  - `fiado_obs` (text, nullable)
  - `valor_pix` (numeric, default 0)
  - `notes` (text, nullable)
  - `created_by` (uuid, references auth.users, nullable)
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

## Security
- Enable RLS on `fin_bolao_geral_addinfo`.
- Grant SELECT, INSERT, UPDATE, DELETE to `anon` and `authenticated`.
- Policies scoped to `authenticated` using `is_admin() OR (branch_id = get_my_branch_id())`,
  matching the existing `fin_bolao_geral` pattern.
*/

CREATE TABLE IF NOT EXISTS fin_bolao_geral_addinfo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  period text NOT NULL DEFAULT 'daily' CHECK (period IN ('daily', 'monthly')),
  ref_date date NOT NULL,
  prejuizo numeric NOT NULL DEFAULT 0,
  comissao numeric NOT NULL DEFAULT 0,
  premiacao numeric NOT NULL DEFAULT 0,
  venda_marketing numeric NOT NULL DEFAULT 0,
  venda_dinheiro numeric NOT NULL DEFAULT 0,
  fiado numeric NOT NULL DEFAULT 0,
  fiado_obs text,
  valor_pix numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE fin_bolao_geral_addinfo ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON fin_bolao_geral_addinfo TO anon, authenticated;

DROP POLICY IF EXISTS "fin_bolao_geral_addinfo_select" ON fin_bolao_geral_addinfo;
CREATE POLICY "fin_bolao_geral_addinfo_select"
ON fin_bolao_geral_addinfo FOR SELECT
TO authenticated
USING (is_admin() OR (branch_id = get_my_branch_id()));

DROP POLICY IF EXISTS "fin_bolao_geral_addinfo_insert" ON fin_bolao_geral_addinfo;
CREATE POLICY "fin_bolao_geral_addinfo_insert"
ON fin_bolao_geral_addinfo FOR INSERT
TO authenticated
WITH CHECK (is_admin() OR (branch_id = get_my_branch_id()));

DROP POLICY IF EXISTS "fin_bolao_geral_addinfo_update" ON fin_bolao_geral_addinfo;
CREATE POLICY "fin_bolao_geral_addinfo_update"
ON fin_bolao_geral_addinfo FOR UPDATE
TO authenticated
USING (is_admin() OR (branch_id = get_my_branch_id()))
WITH CHECK (is_admin() OR (branch_id = get_my_branch_id()));

DROP POLICY IF EXISTS "fin_bolao_geral_addinfo_delete" ON fin_bolao_geral_addinfo;
CREATE POLICY "fin_bolao_geral_addinfo_delete"
ON fin_bolao_geral_addinfo FOR DELETE
TO authenticated
USING (is_admin() OR (branch_id = get_my_branch_id()));

CREATE INDEX IF NOT EXISTS idx_fin_bolao_geral_addinfo_branch_date ON fin_bolao_geral_addinfo(branch_id, ref_date DESC);
