/*
# Meta mensal editável do grupo
Cria a tabela monthly_goals com RLS.
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

-- Fix boloes SELECT so operators can see branch stock
DROP POLICY IF EXISTS "select_boloes" ON public.boloes;
CREATE POLICY "select_boloes" ON public.boloes FOR SELECT
  TO authenticated USING (
    public.is_admin_or_supervisor()
    OR EXISTS (
      SELECT 1 FROM public.bolao_operator_allocations boa
      WHERE boa.bolao_id = boloes.id AND boa.operator_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.bolao_branch_allocations bba
      WHERE bba.bolao_id = boloes.id
        AND bba.branch_id = public.get_my_branch_id()
    )
  );

-- Remove all encalhe rules
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mark_encalhes_job') THEN
      PERFORM cron.unschedule('mark_encalhes_job');
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DROP FUNCTION IF EXISTS public.mark_encalhes();
DROP FUNCTION IF EXISTS public.settle_encalhe(uuid);

CREATE OR REPLACE FUNCTION public.sell_bolao_shares(
  p_bolao_id uuid,
  p_operator_id uuid,
  p_shares_sold int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_allocated int;
BEGIN
  IF p_shares_sold < 0 THEN
    RAISE EXCEPTION 'Cotas vendidas não podem ser negativas.';
  END IF;

  SELECT shares_allocated INTO v_allocated
  FROM public.bolao_operator_allocations
  WHERE bolao_id = p_bolao_id AND operator_id = p_operator_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operador não tem cotas alocadas para este bolão.';
  END IF;

  IF p_shares_sold > v_allocated THEN
    RAISE EXCEPTION 'Cotas vendidas (%) excedem as cotas alocadas (%).',
      p_shares_sold, v_allocated;
  END IF;

  UPDATE public.bolao_operator_allocations
  SET shares_sold = p_shares_sold, updated_at = now()
  WHERE bolao_id = p_bolao_id AND operator_id = p_operator_id;

  PERFORM public.sync_bolao_sold_shares_internal(p_bolao_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_bolao_sold_shares_internal(p_bolao_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_sold int;
  v_total_shares int;
  v_new_status text;
BEGIN
  SELECT COALESCE(SUM(shares_sold), 0) INTO v_total_sold
  FROM public.bolao_operator_allocations
  WHERE bolao_id = p_bolao_id;

  SELECT total_shares INTO v_total_shares
  FROM public.boloes WHERE id = p_bolao_id;

  IF NOT FOUND THEN RETURN; END IF;

  IF v_total_sold = 0 THEN
    v_new_status := 'pending';
  ELSIF v_total_sold >= v_total_shares THEN
    v_new_status := 'sold';
  ELSE
    v_new_status := 'partial';
  END IF;

  UPDATE public.boloes
  SET sold_shares = v_total_sold, status = v_new_status
  WHERE id = p_bolao_id;
END;
$$;

UPDATE public.boloes
SET status = CASE WHEN sold_shares = 0 THEN 'pending' ELSE 'partial' END,
    encalhe_settled = false
WHERE status = 'encalhado';