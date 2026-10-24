/*
# Fechamento de Bolão — Cadastro manual + percentuais casa/operador

## Visão Geral
Adiciona a possibilidade de cadastrar o bolão manualmente no fechamento (com
data, jogo, concurso e valor) e permite que o administrador defina o percentual
da casa e do operador sobre o total. O sistema calcula automaticamente o total
e mostra a porcentagem da casa e do operador.

## Tabela Modificada: fin_bolao_closing
Novas colunas (não destrutivas — defaults garantem compatibilidade com registros antigos):
- `bolao_date` (date, nullable) — data do jogo/sorteio do bolão cadastrado
- `bolao_game` (text, nullable) — nome do jogo/produto (ex: Mega-Sena, Lotofácil)
- `bolao_contest` (text, nullable) — número do concurso
- `bolao_value` (numeric, nullable, default 0) — valor informado do bolão
- `house_percentage` (numeric(5,2), nullable) — percentual da casa sobre o total
- `operator_percentage` (numeric(5,2), nullable) — percentual do operador sobre o total
- `house_amount` (numeric(12,2), default 0) — valor calculado para a casa
- `operator_amount` (numeric(12,2), default 0) — valor calculado para o operador

## Nova Tabela: fin_bolao_closing_config
Armazena a configuração global de percentuais definida pelo administrador.
- `id` (uuid, PK)
- `house_percentage` (numeric(5,2), default 50.00) — percentual da casa
- `operator_percentage` (numeric(5,2), default 50.00) — percentual do operador
- `updated_by` (uuid, FK -> auth.users, nullable)
- `updated_at` (timestamptz)

RLS: somente admin pode ler e atualizar. Insert/delete não são expostos
(uma única linha de configuração).

## Segurança
- RLS já habilitado em fin_bolao_closing — políticas existentes continuam válidas
  para as novas colunas.
- Nova tabela fin_bolao_closing_config com RLS habilitado.
- Apenas admin pode SELECT e UPDATE em fin_bolao_closing_config.

## Notas
1. Nenhuma coluna ou dado existente é removido ou renomeado.
2. Os percentuais são opcionais por fechamento, mas quando definidos o sistema
   calcula house_amount e operator_amount automaticamente.
3. A configuração global serve como valor padrão para novos fechamentos.
*/

ALTER TABLE public.fin_bolao_closing
  ADD COLUMN IF NOT EXISTS bolao_date date,
  ADD COLUMN IF NOT EXISTS bolao_game text,
  ADD COLUMN IF NOT EXISTS bolao_contest text,
  ADD COLUMN IF NOT EXISTS bolao_value numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS house_percentage numeric(5,2),
  ADD COLUMN IF NOT EXISTS operator_percentage numeric(5,2),
  ADD COLUMN IF NOT EXISTS house_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS operator_amount numeric(12,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.fin_bolao_closing_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  house_percentage numeric(5,2) NOT NULL DEFAULT 50.00,
  operator_percentage numeric(5,2) NOT NULL DEFAULT 50.00,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.fin_bolao_closing_config ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.fin_bolao_closing_config TO authenticated;

DROP POLICY IF EXISTS "fin_bolao_closing_config_select" ON public.fin_bolao_closing_config;
CREATE POLICY "fin_bolao_closing_config_select" ON public.fin_bolao_closing_config
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "fin_bolao_closing_config_update" ON public.fin_bolao_closing_config;
CREATE POLICY "fin_bolao_closing_config_update" ON public.fin_bolao_closing_config
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Seed a default config row if none exists
INSERT INTO public.fin_bolao_closing_config (house_percentage, operator_percentage)
SELECT 50.00, 50.00
WHERE NOT EXISTS (SELECT 1 FROM public.fin_bolao_closing_config);
