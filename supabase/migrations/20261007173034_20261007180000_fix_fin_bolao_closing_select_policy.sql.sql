/*
# Fix fin_bolao_closing SELECT policy for operators

## Overview
The original SELECT policy allowed operators to see ALL closings in their branch.
Per requirements, operators should only see their OWN records. Admins see all,
supervisors see their branch, operators see only their own.

## Security Change
- SELECT: admin sees all; supervisor sees own branch; operator sees only own records (operator_id = auth.uid())
*/

DROP POLICY IF EXISTS "fin_bolao_closing_select" ON fin_bolao_closing;
CREATE POLICY "fin_bolao_closing_select" ON fin_bolao_closing FOR SELECT
  TO authenticated USING (
    public.is_admin()
    OR (public.is_supervisor() AND branch_id = public.get_my_branch_id())
    OR operator_id = auth.uid()
  );
