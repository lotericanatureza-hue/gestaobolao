/*
# Fechamento de Bolão — Adicionar campo valor tarifa

## Visão Geral
Adiciona o campo `bolao_tarifa` para registrar o valor da tarifa do bolão
separadamente do valor principal. O sistema passa a calcular:
- Valor bruto = bolao_value + bolao_tarifa
- A divisão entre casa e operador é feita sobre o valor da tarifa, não sobre o valor bruto.

## Tabela Modificada: fin_bolao_closing
Nova coluna (não destrutiva):
- `bolao_tarifa` (numeric(12,2), nullable, default 0) — valor da tarifa do bolão cadastrado manualmente.

## Segurança
- RLS e políticas existentes permanecem inalteradas.
- A nova coluna é protegida pelas mesmas políticas do fechamento.

## Notas
1. Nenhuma coluna ou dado existente é removido.
2. Registros antigos sem tarifa terão bolao_tarifa = 0 (default).
*/

ALTER TABLE public.fin_bolao_closing
  ADD COLUMN IF NOT EXISTS bolao_tarifa numeric(12,2) DEFAULT 0;
