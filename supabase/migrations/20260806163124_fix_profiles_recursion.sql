-- Fix infinite recursion in RLS policies.
-- The profiles SELECT policy queried profiles in a subquery, which re-triggered
-- the same policy → infinite recursion. Replace with SECURITY DEFINER helpers
-- that bypass RLS.

-- ============================================================
-- 1. Helper: get_my_branch_id() — returns the caller's branch_id
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_branch_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT branch_id FROM public.profiles WHERE id = auth.uid();
$$;

-- ============================================================
-- 2. Fix profiles SELECT — use get_my_branch_id() instead of subquery on profiles
-- ============================================================
DROP POLICY IF EXISTS "select_profiles" ON public.profiles;
CREATE POLICY "select_profiles" ON public.profiles FOR SELECT
  TO authenticated USING (
    public.is_admin()
    OR public.is_supervisor() AND branch_id = public.get_my_branch_id()
    OR auth.uid() = id
  );

-- ============================================================
-- 3. Fix branches SELECT — same fix
-- ============================================================
DROP POLICY IF EXISTS "select_branches" ON public.branches;
CREATE POLICY "select_branches" ON public.branches FOR SELECT
  TO authenticated USING (
    public.is_admin()
    OR id = public.get_my_branch_id()
  );

-- ============================================================
-- 4. Fix branch_products SELECT
-- ============================================================
DROP POLICY IF EXISTS "select_branch_products" ON public.branch_products;
CREATE POLICY "select_branch_products" ON public.branch_products FOR SELECT
  TO authenticated USING (
    public.is_admin()
    OR branch_id = public.get_my_branch_id()
  );

-- ============================================================
-- 5. Fix boloes SELECT / INSERT / UPDATE / DELETE
-- ============================================================
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

-- ============================================================
-- 6. Fix bolao_operator_allocations SELECT (if table exists)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bolao_operator_allocations') THEN
    DROP POLICY IF EXISTS "select_bolao_operator_allocations" ON public.bolao_operator_allocations;
    EXECUTE 'CREATE POLICY "select_bolao_operator_allocations" ON public.bolao_operator_allocations
      FOR SELECT TO authenticated USING (
        public.is_admin()
        OR EXISTS (
          SELECT 1 FROM public.boloes b
          WHERE b.id = bolao_operator_allocations.bolao_id
            AND b.branch_id = public.get_my_branch_id()
        )
      )';
  END IF;
END;
$$;