/*
# Adicionar papel "supervisor" ao sistema

## Visão Geral
Adiciona o role "supervisor" ao sistema de usuários. O supervisor tem o mesmo acesso
do administrador (Dashboard, Produtos, Alocação de Produtos, Criar Bolão, Alocação de
Bolões), exceto pelas telas de Filiais e Usuários, que permanecem exclusivas do admin.
A diferença principal é que o supervisor DEVE ter uma filial vinculada e só vê dados
da sua própria filial.

## 1. Modificações na tabela `profiles`
- O constraint CHECK da coluna `role` agora aceita 'admin', 'supervisor' e 'operator'.

## 2. Função helper `is_supervisor()`
- Nova função SECURITY DEFINER que retorna true se o usuário autenticado é supervisor.

## 3. Políticas RLS atualizadas
- `profiles`: supervisores podem ver perfis da própria filial (para ver os operadores
  que gerenciam), mas não podem editar/criar/excluir perfis.
- `branches`: supervisores veem apenas a própria filial (SELECT).
- `branch_products`: supervisores veem apenas alocações da própria filial (SELECT).
- `boloes`: supervisores veem e gerenciam apenas bolões da própria filial (SELECT,
  INSERT, UPDATE, DELETE).
- `products`: já é público para SELECT; sem mudança.
- `bolao_operator_allocations`: supervisores veem apenas alocações de bolões da
  própria filial.

## Notas
- Supervisores não podem criar/editar/excluir filiais, produtos, perfis ou alocações
  de produtos — apenas visualizam e gerenciam bolões da sua filial.
- O frontend oculta as telas de Filiais e Usuários para supervisores.
*/

-- ============================================================
-- 1. Atualizar constraint CHECK da coluna role em profiles
-- ============================================================
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'supervisor', 'operator'));

-- ============================================================
-- 2. Função helper: is_supervisor()
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_supervisor()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'supervisor'
  );
$$;

-- ============================================================
-- 3. RLS: profiles — supervisores veem perfis da própria filial
-- ============================================================
DROP POLICY IF EXISTS "select_profiles" ON public.profiles;
CREATE POLICY "select_profiles" ON public.profiles FOR SELECT
  TO authenticated USING (
    public.is_admin()
    OR public.is_supervisor() AND branch_id IN (
      SELECT p.branch_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    OR auth.uid() = id
  );

-- Insert/Update/Delete: apenas admin (sem mudança, já é is_admin only)
DROP POLICY IF EXISTS "insert_profiles" ON public.profiles;
CREATE POLICY "insert_profiles" ON public.profiles FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "update_profiles" ON public.profiles;
CREATE POLICY "update_profiles" ON public.profiles FOR UPDATE
  TO authenticated USING (public.is_admin() OR auth.uid() = id)
  WITH CHECK (public.is_admin() OR auth.uid() = id);

DROP POLICY IF EXISTS "delete_profiles" ON public.profiles;
CREATE POLICY "delete_profiles" ON public.profiles FOR DELETE
  TO authenticated USING (public.is_admin());

-- ============================================================
-- 4. RLS: branches — supervisores veem apenas a própria filial
-- ============================================================
DROP POLICY IF EXISTS "select_branches" ON public.branches;
CREATE POLICY "select_branches" ON public.branches FOR SELECT
  TO authenticated USING (
    public.is_admin()
    OR id IN (SELECT branch_id FROM public.profiles WHERE id = auth.uid())
  );

-- Insert/Update/Delete: apenas admin (sem mudança)
DROP POLICY IF EXISTS "insert_branches" ON public.branches;
CREATE POLICY "insert_branches" ON public.branches FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "update_branches" ON public.branches;
CREATE POLICY "update_branches" ON public.branches FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "delete_branches" ON public.branches;
CREATE POLICY "delete_branches" ON public.branches FOR DELETE
  TO authenticated USING (public.is_admin());

-- ============================================================
-- 5. RLS: branch_products — supervisores veem apenas da própria filial
-- ============================================================
DROP POLICY IF EXISTS "select_branch_products" ON public.branch_products;
CREATE POLICY "select_branch_products" ON public.branch_products FOR SELECT
  TO authenticated USING (
    public.is_admin()
    OR branch_id IN (SELECT branch_id FROM public.profiles WHERE id = auth.uid())
  );

-- Insert/Update/Delete: apenas admin (sem mudança)
DROP POLICY IF EXISTS "insert_branch_products" ON public.branch_products;
CREATE POLICY "insert_branch_products" ON public.branch_products FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "update_branch_products" ON public.branch_products;
CREATE POLICY "update_branch_products" ON public.branch_products FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "delete_branch_products" ON public.branch_products;
CREATE POLICY "delete_branch_products" ON public.branch_products FOR DELETE
  TO authenticated USING (public.is_admin());

-- ============================================================
-- 6. RLS: boloes — supervisores veem e gerenciam apenas da própria filial
-- ============================================================
DROP POLICY IF EXISTS "select_boloes" ON public.boloes;
CREATE POLICY "select_boloes" ON public.boloes FOR SELECT
  TO authenticated USING (
    public.is_admin()
    OR branch_id IN (SELECT branch_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_boloes" ON public.boloes;
CREATE POLICY "insert_boloes" ON public.boloes FOR INSERT
  TO authenticated WITH CHECK (
    public.is_admin()
    OR (branch_id IN (SELECT branch_id FROM public.profiles WHERE id = auth.uid())
        AND operator_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_boloes" ON public.boloes;
CREATE POLICY "update_boloes" ON public.boloes FOR UPDATE
  TO authenticated USING (
    public.is_admin()
    OR branch_id IN (SELECT branch_id FROM public.profiles WHERE id = auth.uid())
  ) WITH CHECK (
    public.is_admin()
    OR branch_id IN (SELECT branch_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_boloes" ON public.boloes;
CREATE POLICY "delete_boloes" ON public.boloes FOR DELETE
  TO authenticated USING (
    public.is_admin()
    OR branch_id IN (SELECT branch_id FROM public.profiles WHERE id = auth.uid())
  );

-- ============================================================
-- 7. RLS: bolao_operator_allocations — se a tabela existir
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bolao_operator_allocations') THEN
    -- DROP existing policies and recreate with supervisor support
    DROP POLICY IF EXISTS "select_bolao_operator_allocations" ON public.bolao_operator_allocations;

    EXECUTE 'CREATE POLICY "select_bolao_operator_allocations" ON public.bolao_operator_allocations
      FOR SELECT TO authenticated USING (
        public.is_admin()
        OR EXISTS (
          SELECT 1 FROM public.boloes b
          JOIN public.profiles p ON p.id = auth.uid()
          WHERE b.id = bolao_operator_allocations.bolao_id
            AND b.branch_id = p.branch_id
        )
      )';
  END IF;
END;
$$;