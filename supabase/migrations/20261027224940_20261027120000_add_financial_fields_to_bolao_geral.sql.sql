/*
# Bolão Geral — novos campos financeiros do mês

## Visão Geral
Adiciona campos financeiros mensais à tabela `fin_bolao_geral` para registrar
o resultado completo do mês de cada filial: prejuízo, taxa/comissão, premiação,
venda de marketing, venda em dinheiro, fiado (com observação) e valor Pix.

## Tabela modificada: fin_bolao_geral
Novas colunas (todas nullable, default 0):
- `prejuizo` (numeric(12,2), default 0) — valor do prejuízo no mês
- `comissao` (numeric(12,2), default 0) — valor da comissão (renomeado conceitualmente de "tarifa")
- `premiacao` (numeric(12,2), default 0) — valor da premiação
- `venda_marketing` (numeric(12,2), default 0) — venda de marketing
- `venda_dinheiro` (numeric(12,2), default 0) — venda em dinheiro
- `fiado` (numeric(12,2), default 0) — valor do fiado
- `fiado_obs` (text, nullable) — observação do fiado
- `valor_pix` (numeric(12,2), default 0) — valor Pix

## Notas
1. As colunas existentes (bolao_value, fee_value, fee_percentage) são mantidas.
2. Todas as novas colunas são nullable com default 0 para não quebrar registros antigos.
3. Nenhuma alteração de RLS — as políticas existentes continuam válidas.
*/

ALTER TABLE public.fin_bolao_geral
  ADD COLUMN IF NOT EXISTS prejuizo numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comissao numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS premiacao numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS venda_marketing numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS venda_dinheiro numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fiado numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fiado_obs text,
  ADD COLUMN IF NOT EXISTS valor_pix numeric(12,2) NOT NULL DEFAULT 0;
