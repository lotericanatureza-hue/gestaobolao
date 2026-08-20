/*
# Migração: Corrige erro de sintaxe - RLS policies para bolao_branch_allocations
Reaplica as policies UPDATE/DELETE que falharam por problema de parsing do FOR UPDATE.
*/

-- Tabela já foi criada na migration anterior, mas garantimos
CREATE TABLE IF NOT EXISTS public.bolao_branch_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bolao_id uuid NOT NULL REFERENCES public.boloes(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  shares_allocated int NOT NULL DEFAULT 0 CHECK (shares_allocated >= 0),
  shares_picked int NOT NULL DEFAULT 0 CHECK (shares_picked >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bolao_id, branch_id),
  CHECK (shares_picked <= shares_allocated)
);

ALTER TABLE public.bolao_branch_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_bolao_branch_allocations" ON public.bolao_branch_allocations;
CREATE POLICY "select_bolao_branch_allocations" ON public.bolao_branch_allocations
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_supervisor()
    OR branch_id = public.get_my_branch_id()
  );

DROP POLICY IF EXISTS "insert_bolao_branch_allocations" ON public.bolao_branch_allocations;
CREATE POLICY "insert_bolao_branch_allocations" ON public.bolao_branch_allocations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_supervisor());

DROP POLICY IF EXISTS "update_bolao_branch_allocations" ON public.bolao_branch_allocations;
CREATE POLICY "update_bolao_branch_allocations" ON public.bolao_branch_allocations
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_supervisor())
  WITH CHECK (public.is_admin_or_supervisor());

DROP POLICY IF EXISTS "delete_bolao_branch_allocations" ON public.bolao_branch_allocations;
CREATE POLICY "delete_bolao_branch_allocations" ON public.bolao_branch_allocations
  FOR DELETE TO authenticated
  USING (public.is_admin_or_supervisor());

-- Índices
CREATE INDEX IF NOT EXISTS idx_bolao_branch_allocations_bolao_id
  ON public.bolao_branch_allocations(bolao_id);
CREATE INDEX IF NOT EXISTS idx_bolao_branch_allocations_branch_id
  ON public.bolao_branch_allocations(branch_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.update_branch_allocation_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bolao_branch_allocations_update_updated_at ON public.bolao_branch_allocations;
CREATE TRIGGER bolao_branch_allocations_update_updated_at
  BEFORE UPDATE ON public.bolao_branch_allocations
  FOR EACH ROW EXECUTE FUNCTION public.update_branch_allocation_updated_at();

-- RLS fix for bolao_operator_allocations SELECT
DROP POLICY IF EXISTS "select_bolao_operator_allocations" ON public.bolao_operator_allocations;
CREATE POLICY "select_bolao_operator_allocations" ON public.bolao_operator_allocations
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_supervisor()
    OR operator_id = auth.uid()
  );
