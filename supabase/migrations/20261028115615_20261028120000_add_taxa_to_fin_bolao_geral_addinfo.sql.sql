/*
# Bolão Geral — adicionar campo Taxa às informações adicionais

## Visão Geral
Adiciona uma coluna `taxa` à tabela `fin_bolao_geral_addinfo` para registrar
um valor de taxa que deve ser subtraído do resultado, ao lado da premiação.

## Tabela modificada: fin_bolao_geral_addinfo
Nova coluna:
- `taxa` (numeric(12,2), default 0) — valor da taxa a ser subtraído do resultado

## Notas
1. A coluna é nullable com default 0 para não quebrar registros antigos.
2. Nenhuma alteração de RLS — as políticas existentes continuam válidas.
*/

ALTER TABLE public.fin_bolao_geral_addinfo
  ADD COLUMN IF NOT EXISTS taxa numeric(12,2) NOT NULL DEFAULT 0;