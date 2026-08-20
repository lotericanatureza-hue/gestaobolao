/*
# Corrige política SELECT de bolões para operadores verem estoque da filial

## Problema
A política `select_boloes` atual só permite que operadores vejam bolões se já
têm uma alocação direta (`bolao_operator_allocations`). Mas o fluxo correto é:
1. Admin aloja cotas para a filial (`bolao_branch_allocations`)
2. Operador vê o bolão no estoque da filial
3. Operador pega cotas → só então a alocação do operador é criada

Como a política não verifica `bolao_branch_allocations`, o bolão é invisível
para o operador na hora de ver o estoque, e a tela aparece vazia.

## Solução
Adicionar uma condição OR na política `select_boloes` que permite operadores
verem bolões que têm alocação para a sua filial (`branch_id = get_my_branch_id()`).

## Segurança
- Apenas a política SELECT é alterada.
- Operadores continuam só podendo ver bolões da sua filial ou onde têm alocação.
- Admins e supervisores continuam vendo tudo.
*/

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
