/*
# Migração: RPCs para gestão de estoque por filial
Cria as funções allocate_bolao_to_branch, pick_shares_from_branch, return_shares_to_branch.
Faz backfill das alocações existentes. Atualiza trigger de total_shares.
*/

-- ============================================================
-- 1. RPC: allocate_bolao_to_branch
-- ============================================================
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

-- ============================================================
-- 2. RPC: pick_shares_from_branch
-- ============================================================
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

-- ============================================================
-- 3. RPC: return_shares_to_branch
-- ============================================================
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

-- ============================================================
-- 4. Backfill: migrar alocações existentes para branch allocations
-- ============================================================
DO $$
DECLARE
  r RECORD;
  v_existing_id uuid;
BEGIN
  FOR r IN
    SELECT boa.bolao_id, p.branch_id, SUM(boa.shares_allocated) AS total_allocated
    FROM public.bolao_operator_allocations boa
    JOIN public.profiles p ON p.id = boa.operator_id
    WHERE p.branch_id IS NOT NULL
    GROUP BY boa.bolao_id, p.branch_id
  LOOP
    SELECT id INTO v_existing_id
    FROM public.bolao_branch_allocations
    WHERE bolao_id = r.bolao_id AND branch_id = r.branch_id;

    IF v_existing_id IS NULL THEN
      INSERT INTO public.bolao_branch_allocations (bolao_id, branch_id, shares_allocated, shares_picked)
      VALUES (r.bolao_id, r.branch_id, r.total_allocated, r.total_allocated);
    ELSE
      UPDATE public.bolao_branch_allocations
      SET shares_allocated = GREATEST(shares_allocated, r.total_allocated),
          shares_picked = GREATEST(shares_picked, r.total_allocated)
      WHERE id = v_existing_id;
    END IF;
  END LOOP;
END;
$$;

-- ============================================================
-- 5. Atualizar trigger de redução de total_shares
-- ============================================================
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
