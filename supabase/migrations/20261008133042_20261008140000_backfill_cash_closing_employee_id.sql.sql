/*
# Backfill: consolidar fechamentos de caixa antigos com funcionários vinculados

## Motivo
Após adicionar a coluna `user_id` em `fin_employees`, os fechamentos de caixa antigos
que foram criados por operadores (com `employee_id = null`) não aparecem mais na lista
do administrador nem na do operador, pois agora filtramos por `employee_id`.

## Mudança
Atualiza `fin_cash_closing` preenchendo `employee_id` para registros antigos onde
`employee_id IS NULL`, baseando-se no `created_by` (que é o ID do usuário que criou o
registro). Se o `created_by` corresponder ao `user_id` de um funcionário, o
`employee_id` é preenchido com o ID desse funcionário.

## Notas
- Apenas registros com `employee_id IS NULL` são afetados.
- Registros onde `created_by` não corresponde a nenhum funcionário permanecem inalterados.
- Não há perda de dados — apenas preenchimento de uma coluna que estava vazia.
*/

UPDATE fin_cash_closing
SET employee_id = fe.id
FROM fin_employees fe
WHERE fin_cash_closing.employee_id IS NULL
  AND fin_cash_closing.created_by IS NOT NULL
  AND fe.user_id = fin_cash_closing.created_by;