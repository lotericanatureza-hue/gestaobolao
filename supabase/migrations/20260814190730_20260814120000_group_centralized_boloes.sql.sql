/*
# Migração: Centralização de Bolões em Grupo + Metas + Baixa de Encalhe

## Visão Geral
Transforma o sistema de bolões multi-filial em um modelo centralizado em grupo ("Mega Bolão Brasil").
Os bolões deixam de ser criados por filial e passam a ser criados de forma centralizada pelo grupo.
Admins e supervisores alocam cotas para operadores de qualquer filial.

## 1. Modificações na tabela `boloes`
- `branch_id` agora é NULLABLE (o bolão não pertence mais a uma filial específica).
- `operator_id` já é nullable (permanece nullable — admin cria sem operador).
- Novo campo `jogos` (int, default 1) — quantidade de jogos do bolão.
- Novo campo `draw_time` (time, default '20:00:00') — horário do sorteio.
- Novo campo `draw_datetime` (timestamptz, gerado) — draw_date + draw_time.
- Novo campo `encalhe_settled` (boolean, default false) — true quando o admin deu baixa.
- Constraint de status agora inclui 'encalhado'.

## 2. Nova tabela `bolao_operator_allocations`
Distribui cotas de um bolão entre operadores.
- UNIQUE (bolao_id, operator_id)

## 3. Nova tabela `bolao_share_transfers`
Histórico de repasses de cotas entre operadores.

## 4. Novo campo `default_draw_time` em `products`

## 5. Funções RPC
- allocate_bolao_shares, sell_bolao_shares, transfer_bolao_shares, settle_encalhe
- sync_bolao_sold_shares_internal (interna)

## 6. Triggers
- sync_bolao_sold_shares após mudanças em alocações
- updated_at em alocações
- Impedir reduzir total_shares abaixo do alocado

## 7. RLS atualizada
- boloes: admins/supervisores veem todos; operadores veem onde têm alocação
- bolao_operator_allocations: admins/supervisores veem todas; operadores veem as suas
- bolao_share_transfers: admins/supervisores veem todas; operadores veem origem/destino

## Notas
- O encalhe automático (via pg_cron) marca status='encalhado' quando draw_datetime passa.
- Encalhes só viram prejuízo quando admin marca encalhe_settled=true.
- A comissão do operador é calculada por tier sobre a TAXA DE SERVIÇO:
  10% até R$10k, 20% de R$10k-R$20k, 30% acima de R$20k.
*/

-- ============================================================
-- 1. Modificar tabela boloes: branch_id nullable, novos campos
-- ============================================================

ALTER TABLE public.boloes ALTER COLUMN branch_id DROP NOT NULL;
ALTER TABLE public.boloes ALTER COLUMN operator_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='boloes' AND column_name='jogos') THEN
    ALTER TABLE public.boloes ADD COLUMN jogos int NOT NULL DEFAULT 1;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='boloes' AND column_name='draw_time') THEN
    ALTER TABLE public.boloes ADD COLUMN draw_time time NOT NULL DEFAULT '20:00:00';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='boloes' AND column_name='draw_datetime') THEN
    ALTER TABLE public.boloes ADD COLUMN draw_datetime timestamptz
      GENERATED ALWAYS AS (draw_date + draw_time) STORED;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='boloes' AND column_name='encalhe_settled') THEN
    ALTER TABLE public.boloes ADD COLUMN encalhe_settled boolean NOT NULL DEFAULT false;
  END IF;
END $$;

ALTER TABLE public.boloes DROP CONSTRAINT IF EXISTS boloes_status_check;
ALTER TABLE public.boloes ADD CONSTRAINT boloes_status_check
  CHECK (status IN ('pending', 'partial', 'sold', 'encalhado'));

-- ============================================================
-- 2. Novo campo default_draw_time em products
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema='public' AND table_name='products' AND column_name='default_draw_time') THEN
    ALTER TABLE public.products ADD COLUMN default_draw_time time NOT NULL DEFAULT '20:00:00';
  END IF;
END $$;

UPDATE public.products SET default_draw_time = '20:00:00' WHERE default_draw_time IS NULL;

-- ============================================================
-- 3. Tabela: bolao_operator_allocations
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bolao_operator_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bolao_id uuid NOT NULL REFERENCES public.boloes(id) ON DELETE CASCADE,
  operator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shares_allocated int NOT NULL DEFAULT 0 CHECK (shares_allocated >= 0),
  shares_sold int NOT NULL DEFAULT 0 CHECK (shares_sold >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bolao_id, operator_id)
);

ALTER TABLE public.bolao_operator_allocations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. Tabela: bolao_share_transfers
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bolao_share_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bolao_id uuid NOT NULL REFERENCES public.boloes(id) ON DELETE CASCADE,
  from_operator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_operator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shares int NOT NULL CHECK (shares > 0),
  transferred_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bolao_share_transfers ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. Helper: is_admin_or_supervisor()
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'supervisor')
  );
$$;

-- ============================================================
-- 6. RLS: boloes — centralizado em grupo
-- ============================================================
DROP POLICY IF EXISTS "select_boloes" ON public.boloes;
CREATE POLICY "select_boloes" ON public.boloes FOR SELECT
  TO authenticated USING (
    public.is_admin_or_supervisor()
    OR EXISTS (
      SELECT 1 FROM public.bolao_operator_allocations boa
      WHERE boa.bolao_id = boloes.id AND boa.operator_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_boloes" ON public.boloes;
CREATE POLICY "insert_boloes" ON public.boloes FOR INSERT
  TO authenticated WITH CHECK (public.is_admin_or_supervisor());

DROP POLICY IF EXISTS "update_boloes" ON public.boloes;
CREATE POLICY "update_boloes" ON public.boloes FOR UPDATE
  TO authenticated USING (public.is_admin_or_supervisor())
  WITH CHECK (public.is_admin_or_supervisor());

DROP POLICY IF EXISTS "delete_boloes" ON public.boloes;
CREATE POLICY "delete_boloes" ON public.boloes FOR DELETE
  TO authenticated USING (public.is_admin_or_supervisor());

-- ============================================================
-- 7. RLS: bolao_operator_allocations
-- ============================================================
DROP POLICY IF EXISTS "select_bolao_operator_allocations" ON public.bolao_operator_allocations;
CREATE POLICY "select_bolao_operator_allocations" ON public.bolao_operator_allocations FOR SELECT
  TO authenticated USING (
    public.is_admin_or_supervisor() OR operator_id = auth.uid()
  );

DROP POLICY IF EXISTS "insert_bolao_operator_allocations" ON public.bolao_operator_allocations;
CREATE POLICY "insert_bolao_operator_allocations" ON public.bolao_operator_allocations FOR INSERT
  TO authenticated WITH CHECK (public.is_admin_or_supervisor());

DROP POLICY IF EXISTS "update_bolao_operator_allocations" ON public.bolao_operator_allocations;
CREATE POLICY "update_bolao_operator_allocations" ON public.bolao_operator_allocations FOR UPDATE
  TO authenticated USING (public.is_admin_or_supervisor() OR operator_id = auth.uid())
  WITH CHECK (public.is_admin_or_supervisor());

DROP POLICY IF EXISTS "delete_bolao_operator_allocations" ON public.bolao_operator_allocations;
CREATE POLICY "delete_bolao_operator_allocations" ON public.bolao_operator_allocations FOR DELETE
  TO authenticated USING (public.is_admin_or_supervisor());

-- ============================================================
-- 8. RLS: bolao_share_transfers
-- ============================================================
DROP POLICY IF EXISTS "select_bolao_share_transfers" ON public.bolao_share_transfers;
CREATE POLICY "select_bolao_share_transfers" ON public.bolao_share_transfers FOR SELECT
  TO authenticated USING (
    public.is_admin_or_supervisor()
    OR from_operator_id = auth.uid()
    OR to_operator_id = auth.uid()
  );

DROP POLICY IF EXISTS "insert_bolao_share_transfers" ON public.bolao_share_transfers;
CREATE POLICY "insert_bolao_share_transfers" ON public.bolao_share_transfers FOR INSERT
  TO authenticated WITH CHECK (
    public.is_admin_or_supervisor() OR from_operator_id = auth.uid()
  );

-- ============================================================
-- 9. RLS: profiles — admin/supervisor veem todos (global)
-- ============================================================
DROP POLICY IF EXISTS "select_profiles" ON public.profiles;
CREATE POLICY "select_profiles" ON public.profiles FOR SELECT
  TO authenticated USING (
    public.is_admin_or_supervisor() OR auth.uid() = id
  );

-- ============================================================
-- 10. Índices
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_bolao_operator_allocations_bolao_id 
  ON public.bolao_operator_allocations(bolao_id);
CREATE INDEX IF NOT EXISTS idx_bolao_operator_allocations_operator_id 
  ON public.bolao_operator_allocations(operator_id);
CREATE INDEX IF NOT EXISTS idx_bolao_share_transfers_bolao_id 
  ON public.bolao_share_transfers(bolao_id);
CREATE INDEX IF NOT EXISTS idx_boloes_draw_datetime 
  ON public.boloes(draw_datetime);
CREATE INDEX IF NOT EXISTS idx_boloes_encalhe_settled 
  ON public.boloes(encalhe_settled);

-- ============================================================
-- 11. Função interna: sync_bolao_sold_shares_internal
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_bolao_sold_shares_internal(p_bolao_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_sold int;
  v_total_shares int;
  v_current_status text;
  v_new_status text;
BEGIN
  SELECT COALESCE(SUM(shares_sold), 0) INTO v_total_sold
  FROM public.bolao_operator_allocations
  WHERE bolao_id = p_bolao_id;

  SELECT total_shares, status INTO v_total_shares, v_current_status
  FROM public.boloes WHERE id = p_bolao_id;

  IF NOT FOUND THEN RETURN; END IF;

  IF v_current_status = 'encalhado' THEN
    v_new_status := 'encalhado';
  ELSIF v_total_sold = 0 THEN
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

-- ============================================================
-- 12. RPC: allocate_bolao_shares
-- ============================================================
CREATE OR REPLACE FUNCTION public.allocate_bolao_shares(
  p_bolao_id uuid,
  p_operator_id uuid,
  p_shares int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bolao_total int;
  v_current_allocated int;
BEGIN
  IF p_shares < 0 THEN
    RAISE EXCEPTION 'Cotas não podem ser negativas.';
  END IF;

  SELECT total_shares INTO v_bolao_total FROM public.boloes WHERE id = p_bolao_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bolão não encontrado.';
  END IF;

  SELECT COALESCE(SUM(shares_allocated), 0) INTO v_current_allocated
  FROM public.bolao_operator_allocations
  WHERE bolao_id = p_bolao_id AND operator_id != p_operator_id;

  IF v_current_allocated + p_shares > v_bolao_total THEN
    RAISE EXCEPTION 'Total alocado (%) excede o total de cotas do bolão (%).',
      v_current_allocated + p_shares, v_bolao_total;
  END IF;

  INSERT INTO public.bolao_operator_allocations (bolao_id, operator_id, shares_allocated, shares_sold)
  VALUES (p_bolao_id, p_operator_id, p_shares, 0)
  ON CONFLICT (bolao_id, operator_id) DO UPDATE
    SET shares_allocated = EXCLUDED.shares_allocated,
        updated_at = now();
END;
$$;

-- ============================================================
-- 13. RPC: sell_bolao_shares
-- ============================================================
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
  v_bolao_status text;
BEGIN
  IF p_shares_sold < 0 THEN
    RAISE EXCEPTION 'Cotas vendidas não podem ser negativas.';
  END IF;

  SELECT status INTO v_bolao_status FROM public.boloes WHERE id = p_bolao_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bolão não encontrado.';
  END IF;

  IF v_bolao_status = 'encalhado' THEN
    RAISE EXCEPTION 'Não é possível vender cotas de um bolão encalhado.';
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

-- ============================================================
-- 14. RPC: transfer_bolao_shares
-- ============================================================
CREATE OR REPLACE FUNCTION public.transfer_bolao_shares(
  p_bolao_id uuid,
  p_from_operator_id uuid,
  p_to_operator_id uuid,
  p_shares int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_from_allocated int;
  v_from_sold int;
  v_available int;
  v_to_allocated int;
  v_bolao_total int;
  v_total_allocated int;
BEGIN
  IF p_shares <= 0 THEN
    RAISE EXCEPTION 'Quantidade de cotas deve ser maior que zero.';
  END IF;

  IF p_from_operator_id = p_to_operator_id THEN
    RAISE EXCEPTION 'Não é possível repassar cotas para o mesmo operador.';
  END IF;

  SELECT shares_allocated, shares_sold INTO v_from_allocated, v_from_sold
  FROM public.bolao_operator_allocations
  WHERE bolao_id = p_bolao_id AND operator_id = p_from_operator_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operador de origem não tem cotas alocadas para este bolão.';
  END IF;

  v_available := v_from_allocated - v_from_sold;
  IF p_shares > v_available THEN
    RAISE EXCEPTION 'Cotas a repassar (%) excedem as cotas disponíveis (%).',
      p_shares, v_available;
  END IF;

  SELECT total_shares INTO v_bolao_total FROM public.boloes WHERE id = p_bolao_id;

  SELECT COALESCE(SUM(shares_allocated), 0) INTO v_total_allocated
  FROM public.bolao_operator_allocations
  WHERE bolao_id = p_bolao_id 
    AND operator_id != p_from_operator_id 
    AND operator_id != p_to_operator_id;

  SELECT shares_allocated INTO v_to_allocated
  FROM public.bolao_operator_allocations
  WHERE bolao_id = p_bolao_id AND operator_id = p_to_operator_id;

  IF v_total_allocated + COALESCE(v_to_allocated, 0) + p_shares > v_bolao_total THEN
    RAISE EXCEPTION 'Total alocado excederia o total de cotas do bolão.';
  END IF;

  UPDATE public.bolao_operator_allocations
  SET shares_allocated = shares_allocated - p_shares, updated_at = now()
  WHERE bolao_id = p_bolao_id AND operator_id = p_from_operator_id;

  INSERT INTO public.bolao_operator_allocations (bolao_id, operator_id, shares_allocated, shares_sold)
  VALUES (p_bolao_id, p_to_operator_id, p_shares, 0)
  ON CONFLICT (bolao_id, operator_id) DO UPDATE
    SET shares_allocated = bolao_operator_allocations.shares_allocated + EXCLUDED.shares_allocated,
        updated_at = now();

  INSERT INTO public.bolao_share_transfers (bolao_id, from_operator_id, to_operator_id, shares, transferred_by)
  VALUES (p_bolao_id, p_from_operator_id, p_to_operator_id, p_shares, auth.uid());
END;
$$;

-- ============================================================
-- 15. Trigger: sync_bolao_sold_shares após mudanças em alocações
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_bolao_sold_shares_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bolao_id uuid;
BEGIN
  v_bolao_id := COALESCE(NEW.bolao_id, OLD.bolao_id);
  PERFORM public.sync_bolao_sold_shares_internal(v_bolao_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS bolao_allocations_sync_insert ON public.bolao_operator_allocations;
CREATE TRIGGER bolao_allocations_sync_insert
  AFTER INSERT ON public.bolao_operator_allocations
  FOR EACH ROW EXECUTE FUNCTION public.sync_bolao_sold_shares_trigger();

DROP TRIGGER IF EXISTS bolao_allocations_sync_update ON public.bolao_operator_allocations;
CREATE TRIGGER bolao_allocations_sync_update
  AFTER UPDATE ON public.bolao_operator_allocations
  FOR EACH ROW EXECUTE FUNCTION public.sync_bolao_sold_shares_trigger();

DROP TRIGGER IF EXISTS bolao_allocations_sync_delete ON public.bolao_operator_allocations;
CREATE TRIGGER bolao_allocations_sync_delete
  AFTER DELETE ON public.bolao_operator_allocations
  FOR EACH ROW EXECUTE FUNCTION public.sync_bolao_sold_shares_trigger();

-- ============================================================
-- 16. Trigger: updated_at em bolao_operator_allocations
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_allocation_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bolao_allocations_update_updated_at ON public.bolao_operator_allocations;
CREATE TRIGGER bolao_allocations_update_updated_at
  BEFORE UPDATE ON public.bolao_operator_allocations
  FOR EACH ROW EXECUTE FUNCTION public.update_allocation_updated_at();

-- ============================================================
-- 17. Trigger: impedir reduzir total_shares abaixo do alocado
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_check_bolao_total_shares_reduction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_allocated int;
BEGIN
  IF NEW.total_shares < OLD.total_shares THEN
    SELECT COALESCE(SUM(shares_allocated), 0) INTO v_total_allocated
    FROM public.bolao_operator_allocations
    WHERE bolao_id = NEW.id;

    IF NEW.total_shares < v_total_allocated THEN
      RAISE EXCEPTION 'Não é possível reduzir o total de cotas (%) abaixo do já alocado (%).',
        NEW.total_shares, v_total_allocated;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boloes_check_total_shares_reduction ON public.boloes;
CREATE TRIGGER boloes_check_total_shares_reduction
  BEFORE UPDATE ON public.boloes
  FOR EACH ROW EXECUTE FUNCTION public.trg_check_bolao_total_shares_reduction();

-- ============================================================
-- 18. RPC: settle_encalhe (dar baixa em encalhe)
-- ============================================================
CREATE OR REPLACE FUNCTION public.settle_encalhe(p_bolao_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem dar baixa em encalhes.';
  END IF;

  SELECT status INTO v_status FROM public.boloes WHERE id = p_bolao_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bolão não encontrado.';
  END IF;

  IF v_status != 'encalhado' THEN
    RAISE EXCEPTION 'Apenas bolões encalhados podem ter baixa.';
  END IF;

  UPDATE public.boloes SET encalhe_settled = true WHERE id = p_bolao_id;
END;
$$;

-- ============================================================
-- 19. Função: get_operator_monthly_sales
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_operator_monthly_sales(
  p_operator_id uuid,
  p_year int,
  p_month int
)
RETURNS TABLE (
  total_service_fee numeric,
  total_shares_sold int,
  total_value numeric
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    COALESCE(SUM(b.service_fee * boa.shares_sold), 0) AS total_service_fee,
    COALESCE(SUM(boa.shares_sold), 0) AS total_shares_sold,
    COALESCE(SUM((b.price + b.service_fee) * boa.shares_sold), 0) AS total_value
  FROM public.bolao_operator_allocations boa
  JOIN public.boloes b ON b.id = boa.bolao_id
  WHERE boa.operator_id = p_operator_id
    AND boa.shares_sold > 0
    AND EXTRACT(YEAR FROM b.created_at) = p_year
    AND EXTRACT(MONTH FROM b.created_at) = p_month;
$$;

-- ============================================================
-- 20. Job pg_cron: marcar encalhes automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_encalhes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.boloes
  SET status = 'encalhado'
  WHERE draw_datetime < now()
    AND status IN ('pending', 'partial')
    AND sold_shares < total_shares;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mark_encalhes_job') THEN
      PERFORM cron.schedule('mark_encalhes_job', '0 * * * *', 'SELECT public.mark_encalhes()');
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
