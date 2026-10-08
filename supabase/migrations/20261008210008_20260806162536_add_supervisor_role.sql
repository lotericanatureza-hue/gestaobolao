/*
# Adicionar papel "supervisor" ao sistema
Adiciona o role "supervisor" e a função helper is_supervisor().
Atualiza policies de profiles, branches, branch_products e boloes para incluir supervisores.
*/
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'supervisor', 'operator'));

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

DROP POLICY IF EXISTS "select_profiles" ON public.profiles;
CREATE POLICY "select_profiles" ON public.profiles FOR SELECT
  TO authenticated USING (
    public.is_admin()
    OR public.is_supervisor() AND branch_id IN (
      SELECT p.branch_id FROM public.profiles p WHERE p.id = auth.uid()
    )
    OR auth.uid() = id
  );

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

DROP POLICY IF EXISTS "select_branches" ON public.branches;
CREATE POLICY "select_branches" ON public.branches FOR SELECT
  TO authenticated USING (
    public.is_admin()
    OR id IN (SELECT branch_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_branches" ON public.branches;
CREATE POLICY "insert_branches" ON public.branches FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "update_branches" ON public.branches;
CREATE POLICY "update_branches" ON public.branches FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "delete_branches" ON public.branches;
CREATE POLICY "delete_branches" ON public.branches FOR DELETE
  TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "select_branch_products" ON public.branch_products;
CREATE POLICY "select_branch_products" ON public.branch_products FOR SELECT
  TO authenticated USING (
    public.is_admin()
    OR branch_id IN (SELECT branch_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_branch_products" ON public.branch_products;
CREATE POLICY "insert_branch_products" ON public.branch_products FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "update_branch_products" ON public.branch_products;
CREATE POLICY "update_branch_products" ON public.branch_products FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "delete_branch_products" ON public.branch_products;
CREATE POLICY "delete_branch_products" ON public.branch_products FOR DELETE
  TO authenticated USING (public.is_admin());

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