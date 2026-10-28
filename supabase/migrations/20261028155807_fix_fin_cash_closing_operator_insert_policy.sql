/*
# Corrigir gravação de fechamento de caixa por operador

1. Objetivo
- Corrige a violação de segurança que impedia operadores com funcionário vinculado de registrar um fechamento.
- Mantém o controle por filial para administradores e supervisores.

2. Tabela modificada
- `fin_cash_closing`
- Nenhuma coluna, dado existente ou relacionamento é removido ou alterado.

3. Segurança
- Substitui somente a política de INSERT `fin_cc_insert`.
- Administradores podem inserir fechamentos.
- Supervisores podem inserir fechamentos apenas na própria filial.
- Operadores podem inserir somente um fechamento cujo `employee_id` esteja vinculado ao usuário autenticado e cuja filial corresponda à filial do funcionário.
- A política continua limitada ao papel `authenticated`; usuários não autenticados não recebem acesso.

4. Observações
- A regra usa a associação persistida em `fin_employees.user_id`, em vez de confiar apenas no valor enviado pela tela.
- Nenhuma permissão de leitura, edição ou exclusão é ampliada.
*/

DROP POLICY IF EXISTS "fin_cc_insert" ON public.fin_cash_closing;

CREATE POLICY "fin_cc_insert" ON public.fin_cash_closing
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
  OR (
    public.is_supervisor()
    AND branch_id = public.get_my_branch_id()
  )
  OR EXISTS (
    SELECT 1
    FROM public.fin_employees employee
    WHERE employee.id = fin_cash_closing.employee_id
      AND employee.user_id = auth.uid()
      AND employee.branch_id = fin_cash_closing.branch_id
  )
);
