/*
# Add file attachments to financial bills

1. Modified Tables
- `fin_bills`
  - `attachment_path` (text, nullable): storage path of the uploaded PNG or PDF
  - `attachment_name` (text, nullable): original file name shown to the user

2. New Storage
- Private bucket `fin-bill-attachments` (no public access; files are opened through signed links).
- Files are stored under `<branch_id>/<random>.<ext>`.

3. Security
- Storage policies: admin can access any branch folder; supervisor can access only their own branch folder.
- Only admin and supervisor roles can read, upload or delete attachments.
*/

ALTER TABLE fin_bills ADD COLUMN IF NOT EXISTS attachment_path text;
ALTER TABLE fin_bills ADD COLUMN IF NOT EXISTS attachment_name text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('fin-bill-attachments', 'fin-bill-attachments', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "fin_bill_attachments_select" ON storage.objects;
CREATE POLICY "fin_bill_attachments_select" ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'fin-bill-attachments'
  AND (is_admin() OR (is_admin_or_supervisor() AND (storage.foldername(name))[1] = get_my_branch_id()::text))
);

DROP POLICY IF EXISTS "fin_bill_attachments_insert" ON storage.objects;
CREATE POLICY "fin_bill_attachments_insert" ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'fin-bill-attachments'
  AND (is_admin() OR (is_admin_or_supervisor() AND (storage.foldername(name))[1] = get_my_branch_id()::text))
);

DROP POLICY IF EXISTS "fin_bill_attachments_delete" ON storage.objects;
CREATE POLICY "fin_bill_attachments_delete" ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'fin-bill-attachments'
  AND (is_admin() OR (is_admin_or_supervisor() AND (storage.foldername(name))[1] = get_my_branch_id()::text))
);
