/*
# Corrige RLS policies para bolao_branch_allocations + RPCs de estoque por filial
*/
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

CREATE INDEX IF NOT EXISTS idx_bolao_branch_allocations_bolao_id
  ON public.bolao_branch_allocations(bolao_id);
CREATE INDEX IF NOT EXISTS idx_bolao_branch_allocations_branch_id
  ON public.bolao_branch_allocations(branch_id);

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

DROP POLICY IF EXISTS "select_bolao_operator_allocations" ON public.bolao_operator_allocations;
CREATE POLICY "select_bolao_operator_allocations" ON public.bolao_operator_allocations
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_supervisor()
    OR operator_id = auth.uid()
  );

CREATE OR REPLACE FUNCTION public.allocate_bolao_to_branch(
  p_bolao_id uuid,
  p_branch_id uuid,
  p_shares int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bolao_total int;
  v_current_allocated int;
  v_picked int;
BEGIN
  IF NOT public.is_admin_or_supervisor() THEN
    RAISE EXCEPTION 'Apenas administradores ou supervisores podem alocar bolões para filiais.';
  END IF;

  IF p_shares < 0 THEN
    RAISE EXCEPTION 'Cotas não podem ser negativas.';
  END IF;

  SELECT total_shares INTO v_bolao_total FROM public.boloes WHERE id = p_bolao_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bolão não encontrado.';
  END IF;

  SELECT COALESCE(SUM(shares_allocated), 0) INTO v_current_allocated
  FROM public.bolao_branch_allocations
  WHERE bolao_id = p_bolao_id AND branch_id != p_branch_id;

  IF v_current_allocated + p_shares > v_bolao_total THEN
    RAISE EXCEPTION 'Total alocado (%) excede o total de cotas do bolão (%).',
      v_current_allocated + p_shares, v_bolao_total;
  END IF;

  IF p_shares > 0 THEN
    INSERT INTO public.bolao_branch_allocations (bolao_id, branch_id, shares_allocated, shares_picked)
    VALUES (p_bolao_id, p_branch_id, p_shares, 0)
    ON CONFLICT (bolao_id, branch_id) DO UPDATE
      SET shares_allocated = EXCLUDED.shares_allocated,
          updated_at = now();
  ELSE
    SELECT shares_picked INTO v_picked
    FROM public.bolao_branch_allocations
    WHERE bolao_id = p_bolao_id AND branch_id = p_branch_id;
    IF v_picked > 0 THEN
      RAISE EXCEPTION 'Não é possível zerar: % cotas já foram pegues por operadores desta filial.', v_picked;
    END IF;
    DELETE FROM public.bolao_branch_allocations
    WHERE bolao_id = p_bolao_id AND branch_id = p_branch_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.pick_shares_from_branch(
  p_bolao_id uuid,
  p_shares int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_operator_id uuid;
  v_branch_id uuid;
  v_branch_alloc_id uuid;
  v_available int;
  v_bolao_status text;
BEGIN
  v_operator_id := auth.uid();
  IF v_operator_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

  IF p_shares <= 0 THEN
    RAISE EXCEPTION 'Quantidade de cotas deve ser maior que zero.';
  END IF;

  SELECT status INTO v_bolao_status FROM public.boloes WHERE id = p_bolao_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bolão não encontrado.';
  END IF;
  IF v_bolao_status = 'encalhado' THEN
    RAISE EXCEPTION 'Não é possível pegar cotas de um bolão encalhado.';
  END IF;
  IF v_bolao_status = 'sold' THEN
    RAISE EXCEPTION 'Não é possível pegar cotas de um bolão já totalmente vendido.';
  END IF;

  SELECT branch_id INTO v_branch_id FROM public.profiles WHERE id = v_operator_id;
  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'Operador não está vinculado a nenhuma filial.';
  END IF;

  SELECT id, shares_allocated - shares_picked INTO v_branch_alloc_id, v_available
  FROM public.bolao_branch_allocations
  WHERE bolao_id = p_bolao_id AND branch_id = v_branch_id
  FOR UPDATE;

  IF NOT FOUND OR v_branch_alloc_id IS NULL THEN
    RAISE EXCEPTION 'Sua filial não tem estoque deste bolão.';
  END IF;

  IF v_available < p_shares THEN
    RAISE EXCEPTION 'Estoque insuficiente. Disponível: % cotas.', v_available;
  END IF;

  UPDATE public.bolao_branch_allocations
  SET shares_picked = shares_picked + p_shares, updated_at = now()
  WHERE id = v_branch_alloc_id;

  INSERT INTO public.bolao_operator_allocations (bolao_id, operator_id, shares_allocated, shares_sold)
  VALUES (p_bolao_id, v_operator_id, p_shares, 0)
  ON CONFLICT (bolao_id, operator_id) DO UPDATE
    SET shares_allocated = bolao_operator_allocations.shares_allocated + EXCLUDED.shares_allocated,
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.return_shares_to_branch(
  p_bolao_id uuid,
  p_shares int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_operator_id uuid;
  v_branch_id uuid;
  v_op_allocated int;
  v_op_sold int;
  v_available int;
BEGIN
  v_operator_id := auth.uid();
  IF v_operator_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

  IF p_shares <= 0 THEN
    RAISE EXCEPTION 'Quantidade deve ser maior que zero.';
  END IF;

  SELECT branch_id INTO v_branch_id FROM public.profiles WHERE id = v_operator_id;
  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'Operador não está vinculado a nenhuma filial.';
  END IF;

  SELECT shares_allocated, shares_sold INTO v_op_allocated, v_op_sold
  FROM public.bolao_operator_allocations
  WHERE bolao_id = p_bolao_id AND operator_id = v_operator_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operador não tem cotas alocadas para este bolão.';
  END IF;

  v_available := v_op_allocated - v_op_sold;
  IF p_shares > v_available THEN
    RAISE EXCEPTION 'Cotas a devolver (%) excedem as disponíveis (%).', p_shares, v_available;
  END IF;

  UPDATE public.bolao_operator_allocations
  SET shares_allocated = shares_allocated - p_shares, updated_at = now()
  WHERE bolao_id = p_bolao_id AND operator_id = v_operator_id;

  UPDATE public.bolao_branch_allocations
  SET shares_picked = shares_picked - p_shares, updated_at = now()
  WHERE bolao_id = p_bolao_id AND branch_id = v_branch_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_check_bolao_total_shares_reduction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_allocated_branch int;
  v_total_allocated_operator int;
  v_max_allocated int;
BEGIN
  IF NEW.total_shares < OLD.total_shares THEN
    SELECT COALESCE(SUM(shares_allocated), 0) INTO v_total_allocated_branch
    FROM public.bolao_branch_allocations
    WHERE bolao_id = NEW.id;

    SELECT COALESCE(SUM(shares_allocated), 0) INTO v_total_allocated_operator
    FROM public.bolao_operator_allocations
    WHERE bolao_id = NEW.id;

    v_max_allocated := GREATEST(v_total_allocated_branch, v_total_allocated_operator);

    IF NEW.total_shares < v_max_allocated THEN
      RAISE EXCEPTION 'Não é possível reduzir o total de cotas (%) abaixo do já alocado (%).',
        NEW.total_shares, v_max_allocated;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;