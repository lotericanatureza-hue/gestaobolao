/*
# Fechamento de Bolão

## Visão Geral
Cria a tabela `fin_bolao_closing` que permite ao operador fazer seu próprio
fechamento de bolão no dia, escolhendo produtos, cotas, valores e taxas.
Administradores e supervisores podem visualizar, editar e excluir de todos os
operadores. Cada operador visualiza, edita e exclui seus próprios registros.

## Nova Tabela: fin_bolao_closing
- id (uuid, PK)
- operator_id (uuid, FK -> profiles, não nulo) — operador que fez o fechamento
- branch_id (uuid, FK -> branches, não nulo) — filial do operador
- closing_date (date, não nulo) — data do fechamento
- items (jsonb) — lista de produtos/jogos: [{ product_id, product_name, slug, shares, price_per_share, fee_per_share, total }]
- total_cotas (numeric) — soma total de cotas
- total_value (numeric) — soma total (price + fee) × cotas
- total_fee (numeric) — soma total da taxa
- pix_externals (jsonb) — [{ description, amount }]
- total_pix_externals (numeric) — soma dos pix externos
- owed_amounts (jsonb) — [{ description, amount }] — valores devidos linha a linha
- total_owed (numeric) — soma dos valores devidos
- notes (text)
- status (text, 'open'|'closed', default 'open')
- created_by (uuid, FK -> auth.users)
- created_at, updated_at (timestamptz)

## Segurança (RLS)
- SELECT: admin vê todos; supervisor e operator vêem apenas registros da própria filial
- INSERT: admin, supervisor, e operator podem inserir (operator só na própria filial)
- UPDATE: admin vê/edi todos; supervisor e operator apenas da própria filial; operator apenas seus próprios registros
- DELETE: admin vê/exclui todos; supervisor apenas da própria filial; operator apenas seus próprios registros

## Notas
- Usa funções helper existentes: is_admin(), is_admin_or_supervisor(), get_my_branch_id()
- operator_id tem DEFAULT auth.uid() para facilitar inserts
- Um fechamento pode conter vários produtos (jogos) no mesmo dia
*/

CREATE TABLE IF NOT EXISTS fin_bolao_closing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  closing_date date NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_cotas numeric(12,2) NOT NULL DEFAULT 0,
  total_value numeric(12,2) NOT NULL DEFAULT 0,
  total_fee numeric(12,2) NOT NULL DEFAULT 0,
  pix_externals jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_pix_externals numeric(12,2) NOT NULL DEFAULT 0,
  owed_amounts jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_owed numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE fin_bolao_closing ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_fin_bolao_closing_branch ON fin_bolao_closing(branch_id);
CREATE INDEX IF NOT EXISTS idx_fin_bolao_closing_date ON fin_bolao_closing(closing_date);
CREATE INDEX IF NOT EXISTS idx_fin_bolao_closing_operator ON fin_bolao_closing(operator_id);

DROP POLICY IF EXISTS "fin_bolao_closing_select" ON fin_bolao_closing;
CREATE POLICY "fin_bolao_closing_select" ON fin_bolao_closing FOR SELECT
  TO authenticated USING (
    public.is_admin()
    OR branch_id = public.get_my_branch_id()
  );

DROP POLICY IF EXISTS "fin_bolao_closing_insert" ON fin_bolao_closing;
CREATE POLICY "fin_bolao_closing_insert" ON fin_bolao_closing FOR INSERT
  TO authenticated WITH CHECK (
    public.is_admin()
    OR branch_id = public.get_my_branch_id()
  );

DROP POLICY IF EXISTS "fin_bolao_closing_update" ON fin_bolao_closing;
CREATE POLICY "fin_bolao_closing_update" ON fin_bolao_closing FOR UPDATE
  TO authenticated USING (
    public.is_admin()
    OR (is_admin_or_supervisor() AND branch_id = public.get_my_branch_id())
    OR (operator_id = auth.uid() AND branch_id = public.get_my_branch_id())
  )
  WITH CHECK (
    public.is_admin()
    OR (is_admin_or_supervisor() AND branch_id = public.get_my_branch_id())
    OR (operator_id = auth.uid() AND branch_id = public.get_my_branch_id())
  );

DROP POLICY IF EXISTS "fin_bolao_closing_delete" ON fin_bolao_closing;
CREATE POLICY "fin_bolao_closing_delete" ON fin_bolao_closing FOR DELETE
  TO authenticated USING (
    public.is_admin()
    OR (is_admin_or_supervisor() AND branch_id = public.get_my_branch_id())
    OR (operator_id = auth.uid() AND branch_id = public.get_my_branch_id())
  );

CREATE OR REPLACE TRIGGER fin_bolao_closing_update_updated_at
BEFORE UPDATE ON fin_bolao_closing
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
