/*
# Corrigir boloes marcados como encalhado antes da regra de 3 dias

1. Contexto
- A regra de encalhe foi alterada para 3 dias apos o sorteio.
- Porem, boloes ja marcados como encalhado pela regra antiga (no momento do sorteio)
  continuavam com status='encalhado' porque a funcao sync_bolao_sold_shares_internal
  preserva o status encalhado uma vez definido.
- Esta migracao reverte esses boloes de volta ao status correto (partial/pending).

2. Mudancas
- UPDATE em boloes: reverte status='encalhado' para 'partial' (se tem vendas) ou 'pending'
  (se nao tem vendas) quando draw_datetime + 3 dias ainda nao passou E encalhe_settled=false.
- Boloes com encalhe_settled=true (baixa ja dada pelo admin) NAO sao tocados.
- Sem mudancas em RLS, politicas ou funcoes.

3. Seguranca
- Sem mudancas em RLS ou politicas.
*/

UPDATE public.boloes
SET status = CASE
  WHEN sold_shares > 0 THEN 'partial'
  ELSE 'pending'
END
WHERE status = 'encalhado'
  AND encalhe_settled = false
  AND draw_datetime + interval '3 days' >= now();
