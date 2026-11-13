/*
# Reload API schema cache for financial bills attachments

1. Modified Tables
- `fin_bills`
  - `attachment_path` (text, nullable): ensured to exist (idempotent, no data change)
  - `attachment_name` (text, nullable): ensured to exist (idempotent, no data change)

2. Behavior
- The API layer caches table column definitions. The columns already exist in the
  database, but the cache did not know about them, so saving a bill failed with
  "Could not find the 'attachment_name' column ... in the schema cache".
- This migration re-adds the columns only if missing and asks the API to reload its schema cache.

3. Security
- No policy, grant, or RLS changes.

4. Notes
- Safe to re-run. No existing rows are modified.
*/

ALTER TABLE fin_bills ADD COLUMN IF NOT EXISTS attachment_path text;
ALTER TABLE fin_bills ADD COLUMN IF NOT EXISTS attachment_name text;

NOTIFY pgrst, 'reload schema';
