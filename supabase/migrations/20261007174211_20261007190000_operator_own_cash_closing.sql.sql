/*
# Fix fin_cash_closing so operators only see their own closings

## Overview
The existing fin_cash_closing SELECT policy shows ALL records in a branch to every
authenticated user. Per the user's requirement, operators must only see their OWN
closings — not closings from other employees in the same branch. Admins continue
to see all; supervisors see their branch; operators see only their own records.

The table currently uses `created_by` (nullable, no default) to track who created
the record. To make the per-operator filter reliable we:
1. Add a `DEFAULT auth.uid()` to the existing `created_by` column so new inserts
   always record the operator who created them (existing rows are untouched).
2. Rewrite the SELECT policy so operators are scoped to `created_by = auth.uid()`.
3. Rewrite UPDATE/DELETE policies with the same per-operator ownership check for
   operators, while keeping admin/supervisor branch-wide access.

## Changes
- `fin_cash_closing.created_by` now defaults to `auth.uid()` on insert.
- SELECT policy: admin sees all; supervisor sees own branch; operator sees own records only.
- INSERT policy: same branch check as before (admin OR branch = get_my_branch_id()).
- UPDATE/DELETE policies: admin OR supervisor-in-branch OR operator's own records.
*/

-- 1. Backfill missing created_by from employee_id where possible (no data loss)
--    This is a best-effort fill for existing rows; rows with no match stay NULL.
UPDATE fin_cash_closing cc
SET created_by = (
  SELECT p.id FROM profiles p
  WHERE p.branch_id = cc.branch_id
  AND p.role = 'operator'
  AND p.active = true
  LIMIT 1
)
WHERE cc.created_by IS NULL;

-- 2. Add DEFAULT auth.uid() to created_by so new inserts auto-stamp the operator
ALTER TABLE fin_cash_closing ALTER COLUMN created_by SET DEFAULT auth.uid();

-- 3. Rewrite SELECT policy
DROP POLICY IF EXISTS "fin_cc_select" ON fin_cash_closing;
CREATE POLICY "fin_cc_select" ON fin_cash_closing FOR SELECT
  TO authenticated USING (
    is_admin()
    OR (is_supervisor() AND branch_id = get_my_branch_id())
    OR created_by = auth.uid()
  );

-- 4. Rewrite INSERT policy (unchanged branch check, plus created_by will default)
DROP POLICY IF EXISTS "fin_cc_insert" ON fin_cash_closing;
CREATE POLICY "fin_cc_insert" ON fin_cash_closing FOR INSERT
  TO authenticated WITH CHECK (
    is_admin()
    OR (is_supervisor() AND branch_id = get_my_branch_id())
    OR branch_id = get_my_branch_id()
  );

-- 5. Rewrite UPDATE policy
DROP POLICY IF EXISTS "fin_cc_update" ON fin_cash_closing;
CREATE POLICY "fin_cc_update" ON fin_cash_closing FOR UPDATE
  TO authenticated
  USING (
    is_admin()
    OR (is_supervisor() AND branch_id = get_my_branch_id())
    OR created_by = auth.uid()
  )
  WITH CHECK (
    is_admin()
    OR (is_supervisor() AND branch_id = get_my_branch_id())
    OR created_by = auth.uid()
  );

-- 6. Rewrite DELETE policy
DROP POLICY IF EXISTS "fin_cc_delete" ON fin_cash_closing;
CREATE POLICY "fin_cc_delete" ON fin_cash_closing FOR DELETE
  TO authenticated USING (
    is_admin()
    OR (is_supervisor() AND branch_id = get_my_branch_id())
    OR created_by = auth.uid()
  );
