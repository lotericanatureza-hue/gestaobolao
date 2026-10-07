/*
# Fix cash closing employee relationship and per-employee uniqueness

## Overview
This migration fixes the database error that prevented a cash closing from being saved.
The screen identifies an operator by the authenticated profile ID, while
`fin_cash_closing.employee_id` references `fin_employees.id`. When an operator did not
have a matching financial employee row, PostgreSQL rejected the insert with a foreign
key violation.

## 1. Financial employee records
- Creates a `fin_employees` row for each active operator profile that has a branch.
- Reuses the operator profile ID as `fin_employees.id`, so existing application inserts
  using the operator ID satisfy the foreign key.
- Uses the profile name, branch, and operator role for the generated employee record.
- Existing financial employee rows are preserved. Rows are inserted only when the ID is
  not already present.

## 2. Cash closing uniqueness
- Removes the old unique index on `(branch_id, closing_date)`.
- The old rule allowed only one closing per branch per day, which conflicts with the
  current design where each employee has an independent closing.
- Existing closing rows are not deleted or modified.
- The existing foreign key from `fin_cash_closing.employee_id` to `fin_employees.id`
  remains in place for referential integrity.

## 3. Security
- No RLS policies are added or weakened.
- The generated employee rows are subject to the existing `fin_employees` RLS policies.
- The migration does not change authentication, roles, or permissions.

## 4. Important notes
1. This migration is safe to re-run: generated employee rows use conflict protection and
   the old index is dropped only if it exists.
2. Existing financial employees and cash closings are preserved.
3. Future operator cash closings can be saved because their profile IDs now exist in
   `fin_employees`.
*/

INSERT INTO public.fin_employees (
  id,
  branch_id,
  name,
  tfl,
  position,
  active
)
SELECT
  p.id,
  p.branch_id,
  COALESCE(NULLIF(p.name, ''), 'Operador'),
  '',
  'Operador',
  COALESCE(p.active, true)
FROM public.profiles AS p
WHERE p.role = 'operator'
  AND p.branch_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.fin_employees AS fe
    WHERE fe.id = p.id
  );

DROP INDEX IF EXISTS public.idx_fin_cc_branch_date;
