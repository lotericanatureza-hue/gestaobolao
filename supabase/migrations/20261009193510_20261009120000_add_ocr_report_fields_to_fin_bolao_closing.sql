/*
# Add report extraction metadata to bolão closing

## Overview
Adds non-destructive metadata so each bolão closing can record that its lines
came from a photographed Caixa report and retain the text produced by OCR for
review and audit. Existing closing rows and their JSON items are preserved.

## Modified Table: fin_bolao_closing
- `source_report_name` (text, nullable) — original file name shown to the operator.
- `ocr_text` (text, nullable) — raw text extracted from the photographed report.

## Item data
The existing `items` jsonb column remains backward compatible. New application
writes may include `draw_date` on each item, while older items without that key
remain valid and editable.

## Security
- RLS and all existing policies remain unchanged.
- The new fields are protected by the same row policies as the closing itself.

## Important Notes
1. No rows, columns, or existing values are deleted or renamed.
2. OCR is treated as a draft: operators can correct every extracted line before saving.
*/

ALTER TABLE public.fin_bolao_closing
  ADD COLUMN IF NOT EXISTS source_report_name text,
  ADD COLUMN IF NOT EXISTS ocr_text text;
