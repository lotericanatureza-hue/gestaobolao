/*
# Remover todas as regras de encalhe

## Objetivo
O sistema não deve mais bloquear alocação ou venda de cotas após a data do sorteio.
Todas as regras de encalhe (marcação automática, bloqueio de venda, baixa de encalhe)
são removidas. Bolões que estavam marcados como 'encalhado' voltam para 'pending' ou
'partial' conforme suas cotas vendidas.

## Mudanças
1. Remover o job do pg_cron que marca bolões como encalhado (mark_encalhes_job)
2. Remover a função public.mark_encalhes()
3. Remover a função public.settle_encalhe()
4. Reescrever public.sell_bolao_shares() sem o bloqueio de status 'encalhado'
5. Reescrever public.sync_bolao_sold_shares_internal() sem o caso especial de 'encalhado'
6. Reverter bolões com status='encalhado' para 'pending' (se 0 vendidas) ou 'partial' (se >0 vendidas)
7. Marcar encalhe_settled=false em todos os bolões (campo permanece mas sem uso ativo)
*/

-- 1. Remover o job do pg_cron
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

-- 2. Remover função mark_encalhes
DROP FUNCTION IF EXISTS public.mark_encalhes();

-- 3. Remover função settle_encalhe
DROP FUNCTION IF EXISTS public.settle_encalhe();

-- 4. Reescrever sell_bolao_shares sem bloqueio de encalhado
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

-- 5. Reescrever sync_bolao_sold_shares_internal sem caso especial de encalhado
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

-- 6. Reverter bolões encalhados para pending/partial
UPDATE public.boloes
SET status = CASE WHEN sold_shares = 0 THEN 'pending' ELSE 'partial' END,
    encalhe_settled = false
WHERE status = 'encalhado';
