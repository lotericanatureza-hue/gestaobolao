/*
# Fix infinite recursion in RLS policies
Replace subqueries on profiles with SECURITY DEFINER helper get_my_branch_id().
*/
CREATE OR REPLACE FUNCTION public.get_my_branch_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT branch_id FROM public.profiles WHERE id = auth.uid();
$$;

DROP POLICY IF EXISTS "select_profiles" ON public.profiles;
CREATE POLICY "select_profiles" ON public.profiles FOR SELECT
  TO authenticated USING (
    public.is_admin()
    OR public.is_supervisor() AND branch_id = public.get_my_branch_id()
    OR auth.uid() = id
  );

DROP POLICY IF EXISTS "select_branches" ON public.branches;
CREATE POLICY "select_branches" ON public.branches FOR SELECT
  TO authenticated USING (
    public.is_admin()
    OR id = public.get_my_branch_id()
  );

DROP POLICY IF EXISTS "select_branch_products" ON public.branch_products;
CREATE POLICY "select_branch_products" ON public.branch_products FOR SELECT
  TO authenticated USING (
    public.is_admin()
    OR branch_id = public.get_my_branch_id()
  );

DROP POLICY IF EXISTS "select_boloes" ON public.boloes;
CREATE POLICY "select_boloes" ON public.boloes FOR SELECT
  TO authenticated USING (
    public.is_admin()
    OR branch_id = public.get_my_branch_id()
  );

DROP POLICY IF EXISTS "insert_boloes" ON public.boloes;
CREATE POLICY "insert_boloes" ON public.boloes FOR INSERT
  TO authenticated WITH CHECK (
    public.is_admin()
    OR (branch_id = public.get_my_branch_id() AND operator_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_boloes" ON public.boloes;
CREATE POLICY "update_boloes" ON public.boloes FOR UPDATE
  TO authenticated USING (
    public.is_admin()
    OR branch_id = public.get_my_branch_id()
  ) WITH CHECK (
    public.is_admin()
    OR branch_id = public.get_my_branch_id()
  );

DROP POLICY IF EXISTS "delete_boloes" ON public.boloes;
CREATE POLICY "delete_boloes" ON public.boloes FOR DELETE
  TO authenticated USING (
    public.is_admin()
    OR branch_id = public.get_my_branch_id()
  );