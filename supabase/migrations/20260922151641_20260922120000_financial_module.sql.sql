/*
# Financial Module - Complete Schema

## Overview
Creates the full financial management module (área Financeira) with branch-scoped data isolation.
The financial area is accessed by admin users (same login as bolão admin).
All data is scoped by branch_id, with a consolidated dashboard view across branches.

## New Tables

1. fin_categories - Expense/income categories per branch
   - id, branch_id, name, type ('expense'|'income'), active, created_at

2. fin_subcategories - Subcategories linked to categories
   - id, category_id, branch_id, name, active, created_at

3. fin_payment_sources - Payment sources (fontes pagadoras) per branch
   - id, branch_id, name, active, created_at

4. fin_bills - Bills to pay and income entries with monthly/annual control
   - id, branch_id, description, type ('expense'|'income'), category_id, subcategory_id,
     amount, origin, payment_source_id, due_date, payment_date, status ('pending'|'paid'),
     month_ref (1-12), year_ref, recurring (bool), notes, created_by, created_at, updated_at

5. fin_daily_control - Daily cash control (worked, safe/cofre, balance difference)
   - id, branch_id, control_date, worked (bool), safe_amount, balance_difference, notes,
     created_by, created_at

6. fin_cash_closing - Cash closing with PDF upload, pix externals, surpluses/shortages
   - id, branch_id, closing_date, total_sales, total_income, pix_externals (jsonb),
     total_pix_externals, surplus, shortage, safe_amount, cash_drawer, pdf_path, notes,
     status ('open'|'closed'), created_by, created_at, updated_at

7. fin_employees - Employee registration associated with cash register (TFL)
   - id, branch_id, name, tfl, position, active, created_at

## Storage
- Creates 'financial-pdfs' bucket for cash closing PDF uploads
- Policies: admin full access, others branch-scoped access

## Security
- RLS enabled on all tables
- Admin: full CRUD on all rows (is_admin())
- Supervisor: full CRUD on own branch rows (is_admin_or_supervisor() + branch match)
- Operator: read/write on own branch rows
- All tables use existing helper functions is_admin(), is_admin_or_supervisor(), get_my_branch_id()
*/

-- ============================================================================
-- 1. fin_categories
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'expense' CHECK (type IN ('expense', 'income')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE fin_categories ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_fin_categories_branch ON fin_categories(branch_id);

DROP POLICY IF EXISTS "fin_cat_select" ON fin_categories;
CREATE POLICY "fin_cat_select" ON fin_categories FOR SELECT
  TO authenticated USING (is_admin() OR branch_id = get_my_branch_id());

DROP POLICY IF EXISTS "fin_cat_insert" ON fin_categories;
CREATE POLICY "fin_cat_insert" ON fin_categories FOR INSERT
  TO authenticated WITH CHECK (is_admin() OR (is_admin_or_supervisor() AND branch_id = get_my_branch_id()));

DROP POLICY IF EXISTS "fin_cat_update" ON fin_categories;
CREATE POLICY "fin_cat_update" ON fin_categories FOR UPDATE
  TO authenticated USING (is_admin() OR (is_admin_or_supervisor() AND branch_id = get_my_branch_id()))
  WITH CHECK (is_admin() OR (is_admin_or_supervisor() AND branch_id = get_my_branch_id()));

DROP POLICY IF EXISTS "fin_cat_delete" ON fin_categories;
CREATE POLICY "fin_cat_delete" ON fin_categories FOR DELETE
  TO authenticated USING (is_admin() OR (is_admin_or_supervisor() AND branch_id = get_my_branch_id()));

-- ============================================================================
-- 2. fin_subcategories
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin_subcategories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES fin_categories(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE fin_subcategories ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_fin_subcategories_category ON fin_subcategories(category_id);
CREATE INDEX IF NOT EXISTS idx_fin_subcategories_branch ON fin_subcategories(branch_id);

DROP POLICY IF EXISTS "fin_sub_select" ON fin_subcategories;
CREATE POLICY "fin_sub_select" ON fin_subcategories FOR SELECT
  TO authenticated USING (is_admin() OR branch_id = get_my_branch_id());

DROP POLICY IF EXISTS "fin_sub_insert" ON fin_subcategories;
CREATE POLICY "fin_sub_insert" ON fin_subcategories FOR INSERT
  TO authenticated WITH CHECK (is_admin() OR (is_admin_or_supervisor() AND branch_id = get_my_branch_id()));

DROP POLICY IF EXISTS "fin_sub_update" ON fin_subcategories;
CREATE POLICY "fin_sub_update" ON fin_subcategories FOR UPDATE
  TO authenticated USING (is_admin() OR (is_admin_or_supervisor() AND branch_id = get_my_branch_id()))
  WITH CHECK (is_admin() OR (is_admin_or_supervisor() AND branch_id = get_my_branch_id()));

DROP POLICY IF EXISTS "fin_sub_delete" ON fin_subcategories;
CREATE POLICY "fin_sub_delete" ON fin_subcategories FOR DELETE
  TO authenticated USING (is_admin() OR (is_admin_or_supervisor() AND branch_id = get_my_branch_id()));

-- ============================================================================
-- 3. fin_payment_sources
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin_payment_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE fin_payment_sources ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_fin_psources_branch ON fin_payment_sources(branch_id);

DROP POLICY IF EXISTS "fin_ps_select" ON fin_payment_sources;
CREATE POLICY "fin_ps_select" ON fin_payment_sources FOR SELECT
  TO authenticated USING (is_admin() OR branch_id = get_my_branch_id());

DROP POLICY IF EXISTS "fin_ps_insert" ON fin_payment_sources;
CREATE POLICY "fin_ps_insert" ON fin_payment_sources FOR INSERT
  TO authenticated WITH CHECK (is_admin() OR (is_admin_or_supervisor() AND branch_id = get_my_branch_id()));

DROP POLICY IF EXISTS "fin_ps_update" ON fin_payment_sources;
CREATE POLICY "fin_ps_update" ON fin_payment_sources FOR UPDATE
  TO authenticated USING (is_admin() OR (is_admin_or_supervisor() AND branch_id = get_my_branch_id()))
  WITH CHECK (is_admin() OR (is_admin_or_supervisor() AND branch_id = get_my_branch_id()));

DROP POLICY IF EXISTS "fin_ps_delete" ON fin_payment_sources;
CREATE POLICY "fin_ps_delete" ON fin_payment_sources FOR DELETE
  TO authenticated USING (is_admin() OR (is_admin_or_supervisor() AND branch_id = get_my_branch_id()));

-- ============================================================================
-- 4. fin_bills
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  description text NOT NULL,
  type text NOT NULL DEFAULT 'expense' CHECK (type IN ('expense', 'income')),
  category_id uuid REFERENCES fin_categories(id) ON DELETE SET NULL,
  subcategory_id uuid REFERENCES fin_subcategories(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  origin text,
  payment_source_id uuid REFERENCES fin_payment_sources(id) ON DELETE SET NULL,
  due_date date,
  payment_date date,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  month_ref integer NOT NULL CHECK (month_ref >= 1 AND month_ref <= 12),
  year_ref integer NOT NULL,
  recurring boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE fin_bills ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_fin_bills_branch ON fin_bills(branch_id);
CREATE INDEX IF NOT EXISTS idx_fin_bills_period ON fin_bills(year_ref, month_ref);
CREATE INDEX IF NOT EXISTS idx_fin_bills_category ON fin_bills(category_id);
CREATE INDEX IF NOT EXISTS idx_fin_bills_status ON fin_bills(status);
CREATE INDEX IF NOT EXISTS idx_fin_bills_type ON fin_bills(type);

DROP POLICY IF EXISTS "fin_bills_select" ON fin_bills;
CREATE POLICY "fin_bills_select" ON fin_bills FOR SELECT
  TO authenticated USING (is_admin() OR branch_id = get_my_branch_id());

DROP POLICY IF EXISTS "fin_bills_insert" ON fin_bills;
CREATE POLICY "fin_bills_insert" ON fin_bills FOR INSERT
  TO authenticated WITH CHECK (is_admin() OR branch_id = get_my_branch_id());

DROP POLICY IF EXISTS "fin_bills_update" ON fin_bills;
CREATE POLICY "fin_bills_update" ON fin_bills FOR UPDATE
  TO authenticated USING (is_admin() OR branch_id = get_my_branch_id())
  WITH CHECK (is_admin() OR branch_id = get_my_branch_id());

DROP POLICY IF EXISTS "fin_bills_delete" ON fin_bills;
CREATE POLICY "fin_bills_delete" ON fin_bills FOR DELETE
  TO authenticated USING (is_admin() OR branch_id = get_my_branch_id());

-- Auto-update updated_at
CREATE OR REPLACE TRIGGER fin_bills_update_updated_at
BEFORE UPDATE ON fin_bills
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 5. fin_daily_control
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin_daily_control (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  control_date date NOT NULL,
  worked boolean NOT NULL DEFAULT false,
  safe_amount numeric(12,2) NOT NULL DEFAULT 0,
  balance_difference numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE fin_daily_control ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_fin_daily_branch ON fin_daily_control(branch_id);
CREATE INDEX IF NOT EXISTS idx_fin_daily_date ON fin_daily_control(control_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_daily_branch_date ON fin_daily_control(branch_id, control_date);

DROP POLICY IF EXISTS "fin_daily_select" ON fin_daily_control;
CREATE POLICY "fin_daily_select" ON fin_daily_control FOR SELECT
  TO authenticated USING (is_admin() OR branch_id = get_my_branch_id());

DROP POLICY IF EXISTS "fin_daily_insert" ON fin_daily_control;
CREATE POLICY "fin_daily_insert" ON fin_daily_control FOR INSERT
  TO authenticated WITH CHECK (is_admin() OR branch_id = get_my_branch_id());

DROP POLICY IF EXISTS "fin_daily_update" ON fin_daily_control;
CREATE POLICY "fin_daily_update" ON fin_daily_control FOR UPDATE
  TO authenticated USING (is_admin() OR branch_id = get_my_branch_id())
  WITH CHECK (is_admin() OR branch_id = get_my_branch_id());

DROP POLICY IF EXISTS "fin_daily_delete" ON fin_daily_control;
CREATE POLICY "fin_daily_delete" ON fin_daily_control FOR DELETE
  TO authenticated USING (is_admin() OR branch_id = get_my_branch_id());

-- ============================================================================
-- 6. fin_cash_closing
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin_cash_closing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  closing_date date NOT NULL,
  total_sales numeric(12,2) NOT NULL DEFAULT 0,
  total_income numeric(12,2) NOT NULL DEFAULT 0,
  pix_externals jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_pix_externals numeric(12,2) NOT NULL DEFAULT 0,
  surplus numeric(12,2) NOT NULL DEFAULT 0,
  shortage numeric(12,2) NOT NULL DEFAULT 0,
  safe_amount numeric(12,2) NOT NULL DEFAULT 0,
  cash_drawer numeric(12,2) NOT NULL DEFAULT 0,
  pdf_path text,
  notes text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE fin_cash_closing ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_fin_cc_branch ON fin_cash_closing(branch_id);
CREATE INDEX IF NOT EXISTS idx_fin_cc_date ON fin_cash_closing(closing_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fin_cc_branch_date ON fin_cash_closing(branch_id, closing_date);

DROP POLICY IF EXISTS "fin_cc_select" ON fin_cash_closing;
CREATE POLICY "fin_cc_select" ON fin_cash_closing FOR SELECT
  TO authenticated USING (is_admin() OR branch_id = get_my_branch_id());

DROP POLICY IF EXISTS "fin_cc_insert" ON fin_cash_closing;
CREATE POLICY "fin_cc_insert" ON fin_cash_closing FOR INSERT
  TO authenticated WITH CHECK (is_admin() OR branch_id = get_my_branch_id());

DROP POLICY IF EXISTS "fin_cc_update" ON fin_cash_closing;
CREATE POLICY "fin_cc_update" ON fin_cash_closing FOR UPDATE
  TO authenticated USING (is_admin() OR branch_id = get_my_branch_id())
  WITH CHECK (is_admin() OR branch_id = get_my_branch_id());

DROP POLICY IF EXISTS "fin_cc_delete" ON fin_cash_closing;
CREATE POLICY "fin_cc_delete" ON fin_cash_closing FOR DELETE
  TO authenticated USING (is_admin() OR branch_id = get_my_branch_id());

CREATE OR REPLACE TRIGGER fin_cc_update_updated_at
BEFORE UPDATE ON fin_cash_closing
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 7. fin_employees
-- ============================================================================
CREATE TABLE IF NOT EXISTS fin_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  tfl text NOT NULL,
  position text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE fin_employees ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_fin_emp_branch ON fin_employees(branch_id);

DROP POLICY IF EXISTS "fin_emp_select" ON fin_employees;
CREATE POLICY "fin_emp_select" ON fin_employees FOR SELECT
  TO authenticated USING (is_admin() OR branch_id = get_my_branch_id());

DROP POLICY IF EXISTS "fin_emp_insert" ON fin_employees;
CREATE POLICY "fin_emp_insert" ON fin_employees FOR INSERT
  TO authenticated WITH CHECK (is_admin() OR (is_admin_or_supervisor() AND branch_id = get_my_branch_id()));

DROP POLICY IF EXISTS "fin_emp_update" ON fin_employees;
CREATE POLICY "fin_emp_update" ON fin_employees FOR UPDATE
  TO authenticated USING (is_admin() OR (is_admin_or_supervisor() AND branch_id = get_my_branch_id()))
  WITH CHECK (is_admin() OR (is_admin_or_supervisor() AND branch_id = get_my_branch_id()));

DROP POLICY IF EXISTS "fin_emp_delete" ON fin_employees;
CREATE POLICY "fin_emp_delete" ON fin_employees FOR DELETE
  TO authenticated USING (is_admin() OR (is_admin_or_supervisor() AND branch_id = get_my_branch_id()));

-- ============================================================================
-- 8. Storage bucket for PDF uploads
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('financial-pdfs', 'financial-pdfs', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for financial-pdfs bucket
DROP POLICY IF EXISTS "fin_pdfs_read" ON storage.objects;
CREATE POLICY "fin_pdfs_read" ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'financial-pdfs' AND is_admin());

DROP POLICY IF EXISTS "fin_pdfs_insert" ON storage.objects;
CREATE POLICY "fin_pdfs_insert" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'financial-pdfs' AND is_admin());

DROP POLICY IF EXISTS "fin_pdfs_update" ON storage.objects;
CREATE POLICY "fin_pdfs_update" ON storage.objects FOR UPDATE
  TO authenticated USING (bucket_id = 'financial-pdfs' AND is_admin())
  WITH CHECK (bucket_id = 'financial-pdfs' AND is_admin());

DROP POLICY IF EXISTS "fin_pdfs_delete" ON storage.objects;
CREATE POLICY "fin_pdfs_delete" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'financial-pdfs' AND is_admin());
