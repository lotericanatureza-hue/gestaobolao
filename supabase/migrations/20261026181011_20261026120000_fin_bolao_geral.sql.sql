/*
# Bolão Geral — Cadastro geral de bolões por filial

## Visão Geral
Cria uma nova tabela `fin_bolao_geral` no módulo financeiro para registrar
bolões de forma geral (não atrelada ao fechamento de caixa de um operador).
Cada registro representa um bolão com data, modalidade/concurso, valor do
bolão, percentual e valor da tarifa, vinculado a uma filial.

Permite consolidar totais por filial, por mês/dia, com total geral e total
de tarifa, além de filtros por modalidade/concurso e período.

## Nova Tabela: fin_bolao_geral
- `id` (uuid, PK)
- `branch_id` (uuid, NOT NULL, FK -> branches) — filial do bolão
- `bolao_date` (date, NOT NULL) — data do bolão (DATA)
- `modality` (text, NOT NULL) — modalidade/jogo (MOD)
- `contest` (text, NOT NULL) — número do concurso (CONCURSO)
- `bolao_value` (numeric(12,2), NOT NULL DEFAULT 0) — valor do bolão (VALOR BOLÃO)
- `fee_percentage` (numeric(5,2), NOT NULL DEFAULT 0) — percentual da tarifa (% TARIFA)
- `fee_value` (numeric(12,2), NOT NULL DEFAULT 0) — valor da tarifa (VALOR TARIFA)
- `notes` (text, nullable) — observações
- `created_by` (uuid, nullable, FK -> auth.users)
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

## Segurança
- RLS habilitado em fin_bolao_geral.
- SELECT: admin vê tudo; supervisor e operador veem apenas registros da
  sua filial (via get_my_branch_id()).
- INSERT/UPDATE/DELETE: admin pode tudo; supervisor e operador apenas na
  sua filial.
- GRANT SELECT, INSERT, UPDATE, DELETE TO authenticated.

## Notas
1. Nenhuma tabela existente é alterada.
2. Índice em (branch_id, bolao_date) para consultas por filial/periíodo.
*/

CREATE TABLE IF NOT EXISTS public.fin_bolao_geral (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  bolao_date date NOT NULL,
  modality text NOT NULL,
  contest text NOT NULL,
  bolao_value numeric(12,2) NOT NULL DEFAULT 0,
  fee_percentage numeric(5,2) NOT NULL DEFAULT 0,
  fee_value numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fin_bolao_geral_branch_date_idx
  ON public.fin_bolao_geral (branch_id, bolao_date DESC);

ALTER TABLE public.fin_bolao_geral ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_bolao_geral TO authenticated;

DROP POLICY IF EXISTS "fin_bolao_geral_select" ON public.fin_bolao_geral;
CREATE POLICY "fin_bolao_geral_select" ON public.fin_bolao_geral
  FOR SELECT TO authenticated
  USING (public.is_admin() OR (branch_id = public.get_my_branch_id()));

DROP POLICY IF EXISTS "fin_bolao_geral_insert" ON public.fin_bolao_geral;
CREATE POLICY "fin_bolao_geral_insert" ON public.fin_bolao_geral
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR (branch_id = public.get_my_branch_id()));

DROP POLICY IF EXISTS "fin_bolao_geral_update" ON public.fin_bolao_geral;
CREATE POLICY "fin_bolao_geral_update" ON public.fin_bolao_geral
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR (branch_id = public.get_my_branch_id()))
  WITH CHECK (public.is_admin() OR (branch_id = public.get_my_branch_id()));

DROP POLICY IF EXISTS "fin_bolao_geral_delete" ON public.fin_bolao_geral;
CREATE POLICY "fin_bolao_geral_delete" ON public.fin_bolao_geral
  FOR DELETE TO authenticated
  USING (public.is_admin() OR (branch_id = public.get_my_branch_id()));
