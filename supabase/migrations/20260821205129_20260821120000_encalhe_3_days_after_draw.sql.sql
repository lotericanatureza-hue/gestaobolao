/*
# Alterar regra de encalhe automatico para 3 dias apos o sorteio

1. Mudancas
- A funcao public.mark_encalhes() agora marca boloes como encalhado
  apenas 3 dias DEPOIS da data/hora do sorteio (draw_datetime + interval '3 days'),
  em vez de no momento exato em que o sorteio passa.
- Boloes totalmente vendidos (status='sold') continuam nao sendo marcados.
- O job pg_cron existente (hourly) continua chamando a mesma funcao.
- Reverte boloes marcados como encalhado incorretamente (sorteio ha menos de 3 dias)
  de volta para seu status anterior (partial se tinham vendas, pending caso contrario).
- Nenhum dado e perdido; apenas a regra de quando marcar muda.

2. Seguranca
- Sem mudancas em RLS ou politicas.
- A funcao continua SECURITY DEFINER, igual a versao anterior.
*/

CREATE OR REPLACE FUNCTION public.mark_encalhes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.boloes
  SET status = 'encalhado'
  WHERE draw_datetime + interval '3 days' < now()
    AND status IN ('pending', 'partial')
    AND sold_shares < total_shares;
END;
$$;

-- Reverter boloes marcados como encalhado cujo sorteio foi ha menos de 3 dias
UPDATE public.boloes
SET status = CASE
  WHEN sold_shares > 0 THEN 'partial'
  ELSE 'pending'
END
WHERE status = 'encalhado'
  AND encalhe_settled = false
  AND draw_datetime + interval '3 days' >= now();
