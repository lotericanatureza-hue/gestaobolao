/*
# Associar funcionários a usuários do sistema

## Motivo
Permitir que um funcionário cadastrado no módulo financeiro seja vinculado a um usuário do sistema (perfis).
Isso consolida os registros: o operador logado passa a ver seus próprios fechamentos de caixa
diretamente através do vínculo, e o administrador visualiza as informações de forma mais clara e precisa.

## Mudanças
1. Adiciona a coluna `user_id` (uuid, nullable) na tabela `fin_employees`.
   - Faz referência a `auth.users(id)` com `ON DELETE SET NULL` (se o usuário for excluído, o funcionário permanece).
2. Cria um índice em `fin_employees(user_id)` para consultas rápidas.
3. Adiciona uma política SELECT para que operadores possam ver seu próprio registro de funcionário
   através do vínculo `user_id = auth.uid()`.

## Notas
- A coluna é opcional (nullable): funcionários não precisam ter um usuário associado.
- O frontend exibirá um seletor de usuários (perfis) no cadastro de funcionários.
- No fechamento de caixa, operadores cujo `user_id` corresponde ao seu `auth.uid()` verão os
  fechamentos associados ao funcionário vinculado, consolidando as informações.
*/

-- 1. Adiciona a coluna user_id
ALTER TABLE fin_employees
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Índice para busca por user_id
CREATE INDEX IF NOT EXISTS idx_fin_emp_user_id ON fin_employees(user_id);

-- 3. Política: operadores podem ver seu próprio registro de funcionário
DROP POLICY IF EXISTS "fin_emp_select_own_user" ON fin_employees;
CREATE POLICY "fin_emp_select_own_user"
  ON fin_employees FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());