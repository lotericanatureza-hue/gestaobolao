/*
# Migração: Meta mensal editável do grupo

## Visão Geral
A meta mensal do grupo (atualmente hardcoded em R$ 50.000) passa a ser
editável por mês, armazenada na tabela `monthly_goals`.

## 1. Nova tabela `monthly_goals`
- `month_key` (text, PK) — formato "YYYY-MM" (ex: "2026-08")
- `goal_amount` (numeric) — valor da meta para o mês
- `updated_by` (uuid) — quem alterou
- `updated_at` (timestamptz) — quando alterou

## 2. RLS
- Todos os usuários autenticados podem ler (dashboard mostra a meta).
- Apenas admin/supervisor podem inserir/atualizar.

## 3. Backfill
- Insere a meta padrão de R$ 50.000 para o mês atual caso não exista.
*/

CREATE TABLE IF NOT EXISTS public.monthly_goals (
  month_key text PRIMARY KEY,
  goal_amount numeric(12,2) NOT NULL DEFAULT 50000 CHECK (goal_amount >= 0),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.monthly_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_monthly_goals" ON public.monthly_goals;
CREATE POLICY "select_monthly_goals" ON public.monthly_goals
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "insert_monthly_goals" ON public.monthly_goals;
CREATE POLICY "insert_monthly_goals" ON public.monthly_goals
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor());

DROP POLICY IF EXISTS "update_monthly_goals" ON public.monthly_goals;
CREATE POLICY "update_monthly_goals" ON public.monthly_goals
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_supervisor())
  WITH CHECK (public.is_admin_or_supervisor());

DROP POLICY IF EXISTS "delete_monthly_goals" ON public.monthly_goals;
CREATE POLICY "delete_monthly_goals" ON public.monthly_goals
  FOR DELETE TO authenticated
  USING (public.is_admin_or_supervisor());

-- Backfill: garantir que o mês atual tenha uma meta
DO $$
DECLARE
  v_current_key text;
BEGIN
  v_current_key := to_char(now(), 'YYYY-MM');
  INSERT INTO public.monthly_goals (month_key, goal_amount)
  VALUES (v_current_key, 50000)
  ON CONFLICT (month_key) DO NOTHING;
END;
$$;
