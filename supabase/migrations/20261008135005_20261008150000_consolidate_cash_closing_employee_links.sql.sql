/*
# Consolidar fechamentos de caixa nos funcionários reais

## Objetivo
Corrigir a separação criada quando perfis de operadores foram inseridos como linhas
artificiais em `fin_employees`. Essas linhas artificiais têm o mesmo ID do perfil,
TFL vazio e cargo "Operador". Elas não representam funcionários cadastrados e podem
ter recebido fechamentos de caixa, fazendo os registros desaparecerem da tela depois
que o cadastro passou a mostrar apenas funcionários com TFL.

## Alterações de dados
1. Identifica funcionários reais pelo mesmo nome e filial, exigindo TFL preenchido.
2. Transfere para o funcionário real o vínculo com o usuário operador.
3. Atualiza os fechamentos que apontavam para a linha artificial, preservando todos
   os valores, datas, PDFs, observações e status.
4. Marca a linha artificial como inativa, sem apagar nenhum registro.

## Segurança
1. Reescreve a leitura de `fin_cash_closing` para administradores e supervisores
   manterem seu acesso atual.
2. Permite que operadores vejam fechamentos do funcionário associado a eles, mesmo
   quando o fechamento foi lançado pelo administrador.
3. Mantém a restrição de filial e de usuário para operadores.
4. Reescreve atualização e exclusão com a mesma regra de acesso.

## Notas importantes
- Nenhuma tabela, coluna ou fechamento é apagado.
- Só são consolidadas linhas artificiais com TFL vazio que tenham exatamente um
  funcionário real correspondente na mesma filial e com o mesmo nome normalizado.
- Linhas sem correspondência permanecem preservadas para revisão posterior.
*/

WITH artificial_rows AS (
  SELECT
    artificial.id AS artificial_id,
    real_employee.id AS real_employee_id,
    artificial.branch_id,
    artificial.name
  FROM public.fin_employees artificial
  JOIN public.fin_employees real_employee
    ON real_employee.branch_id = artificial.branch_id
   AND lower(trim(real_employee.name)) = lower(trim(artificial.name))
   AND trim(real_employee.tfl) <> ''
   AND real_employee.id <> artificial.id
  WHERE trim(artificial.tfl) = ''
    AND artificial.position = 'Operador'
    AND (
      SELECT count(*)
      FROM public.fin_employees candidate
      WHERE candidate.branch_id = artificial.branch_id
        AND lower(trim(candidate.name)) = lower(trim(artificial.name))
        AND trim(candidate.tfl) <> ''
    ) = 1
), linked_real_employees AS (
  UPDATE public.fin_employees real_employee
  SET user_id = artificial_rows.artificial_id
  FROM artificial_rows
  WHERE real_employee.id = artificial_rows.real_employee_id
    AND real_employee.user_id IS NULL
  RETURNING real_employee.id
)
UPDATE public.fin_cash_closing closing
SET employee_id = artificial_rows.real_employee_id
FROM artificial_rows
WHERE closing.employee_id = artificial_rows.artificial_id;

UPDATE public.fin_employees artificial
SET active = false
WHERE trim(artificial.tfl) = ''
  AND artificial.position = 'Operador'
  AND EXISTS (
    SELECT 1
    FROM public.fin_cash_closing closing
    WHERE closing.employee_id = artificial.id
  ) = false
  AND EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.id = artificial.id
      AND profile.role = 'operator'
  );

DROP POLICY IF EXISTS "fin_cc_select" ON public.fin_cash_closing;
CREATE POLICY "fin_cc_select" ON public.fin_cash_closing FOR SELECT
  TO authenticated USING (
    is_admin()
    OR (is_supervisor() AND branch_id = get_my_branch_id())
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.fin_employees employee
      WHERE employee.id = fin_cash_closing.employee_id
        AND employee.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "fin_cc_update" ON public.fin_cash_closing;
CREATE POLICY "fin_cc_update" ON public.fin_cash_closing FOR UPDATE
  TO authenticated
  USING (
    is_admin()
    OR (is_supervisor() AND branch_id = get_my_branch_id())
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.fin_employees employee
      WHERE employee.id = fin_cash_closing.employee_id
        AND employee.user_id = auth.uid()
    )
  )
  WITH CHECK (
    is_admin()
    OR (is_supervisor() AND branch_id = get_my_branch_id())
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.fin_employees employee
      WHERE employee.id = fin_cash_closing.employee_id
        AND employee.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "fin_cc_delete" ON public.fin_cash_closing;
CREATE POLICY "fin_cc_delete" ON public.fin_cash_closing FOR DELETE
  TO authenticated USING (
    is_admin()
    OR (is_supervisor() AND branch_id = get_my_branch_id())
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.fin_employees employee
      WHERE employee.id = fin_cash_closing.employee_id
        AND employee.user_id = auth.uid()
    )
  );