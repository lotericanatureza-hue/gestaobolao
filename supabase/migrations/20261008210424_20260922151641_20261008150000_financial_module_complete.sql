/*
# Financial Module - Complete Schema (all migrations consolidated)
Creates all financial tables with all columns from subsequent migrations included.
*/

-- fin_categories
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

-- fin_subcategories
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

-- fin_payment_sources
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

-- fin_bills
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

DROP TRIGGER IF EXISTS fin_bills_update_updated_at ON fin_bills;
CREATE TRIGGER fin_bills_update_updated_at
BEFORE UPDATE ON fin_bills
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- fin_employees (before fin_cash_closing which references it)
CREATE TABLE IF NOT EXISTS fin_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  tfl text NOT NULL DEFAULT '',
  position text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE fin_employees ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_fin_emp_branch ON fin_employees(branch_id);
CREATE INDEX IF NOT EXISTS idx_fin_emp_user_id ON fin_employees(user_id);

DROP POLICY IF EXISTS "fin_emp_select" ON fin_employees;
CREATE POLICY "fin_emp_select" ON fin_employees FOR SELECT
  TO authenticated USING (is_admin() OR branch_id = get_my_branch_id());
DROP POLICY IF EXISTS "fin_emp_select_own_user" ON fin_employees;
CREATE POLICY "fin_emp_select_own_user" ON fin_employees FOR SELECT
  TO authenticated USING (user_id = auth.uid());
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

-- fin_daily_control (with all subsequent columns)
CREATE TABLE IF NOT EXISTS fin_daily_control (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  control_date date NOT NULL,
  safe_amount numeric(12,2) NOT NULL DEFAULT 0,
  balance_difference numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  worked_amount numeric(12,2) NOT NULL DEFAULT 0,
  valor_003 numeric(12,2) NOT NULL DEFAULT 0,
  valor_043 numeric DEFAULT 0,
  withdrawals jsonb DEFAULT '[]'::jsonb,
  current_safe_amount numeric DEFAULT 0
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

-- fin_cash_closing (with all subsequent columns)
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
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  employee_id uuid REFERENCES fin_employees(id) ON DELETE SET NULL,
  deposit_amount numeric NOT NULL DEFAULT 0,
  sangria_amount numeric NOT NULL DEFAULT 0,
  withdrawals jsonb DEFAULT '[]'::jsonb,
  total_withdrawals numeric DEFAULT 0
);
ALTER TABLE fin_cash_closing ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_fin_cc_branch ON fin_cash_closing(branch_id);
CREATE INDEX IF NOT EXISTS idx_fin_cc_date ON fin_cash_closing(closing_date);
CREATE INDEX IF NOT EXISTS idx_fin_cash_closing_employee ON fin_cash_closing(employee_id);

DROP POLICY IF EXISTS "fin_cc_select" ON fin_cash_closing;
CREATE POLICY "fin_cc_select" ON fin_cash_closing FOR SELECT
  TO authenticated USING (
    is_admin()
    OR (is_supervisor() AND branch_id = get_my_branch_id())
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.fin_employees employee
      WHERE employee.id = fin_cash_closing.employee_id
        AND employee.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "fin_cc_insert" ON fin_cash_closing;
CREATE POLICY "fin_cc_insert" ON fin_cash_closing FOR INSERT
  TO authenticated WITH CHECK (
    is_admin()
    OR (is_supervisor() AND branch_id = get_my_branch_id())
    OR branch_id = get_my_branch_id()
  );
DROP POLICY IF EXISTS "fin_cc_update" ON fin_cash_closing;
CREATE POLICY "fin_cc_update" ON fin_cash_closing FOR UPDATE
  TO authenticated
  USING (
    is_admin()
    OR (is_supervisor() AND branch_id = get_my_branch_id())
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.fin_employees employee
      WHERE employee.id = fin_cash_closing.employee_id
        AND employee.user_id = auth.uid()
    )
  )
  WITH CHECK (
    is_admin()
    OR (is_supervisor() AND branch_id = get_my_branch_id())
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.fin_employees employee
      WHERE employee.id = fin_cash_closing.employee_id
        AND employee.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "fin_cc_delete" ON fin_cash_closing;
CREATE POLICY "fin_cc_delete" ON fin_cash_closing FOR DELETE
  TO authenticated USING (
    is_admin()
    OR (is_supervisor() AND branch_id = get_my_branch_id())
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.fin_employees employee
      WHERE employee.id = fin_cash_closing.employee_id
        AND employee.user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS fin_cc_update_updated_at ON fin_cash_closing;
CREATE TRIGGER fin_cc_update_updated_at
BEFORE UPDATE ON fin_cash_closing
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- fin_loans
CREATE TABLE IF NOT EXISTS fin_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  to_branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  loan_date date NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  returned_amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'returned')),
  description text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE fin_loans ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_fin_loans_from_branch ON fin_loans(from_branch_id);
CREATE INDEX IF NOT EXISTS idx_fin_loans_to_branch ON fin_loans(to_branch_id);
CREATE INDEX IF NOT EXISTS idx_fin_loans_date ON fin_loans(loan_date);
CREATE INDEX IF NOT EXISTS idx_fin_loans_status ON fin_loans(status);

DROP POLICY IF EXISTS "fin_loans_select" ON fin_loans;
CREATE POLICY "fin_loans_select" ON fin_loans FOR SELECT
  TO authenticated USING (is_admin() OR from_branch_id = get_my_branch_id() OR to_branch_id = get_my_branch_id());
DROP POLICY IF EXISTS "fin_loans_insert" ON fin_loans;
CREATE POLICY "fin_loans_insert" ON fin_loans FOR INSERT
  TO authenticated WITH CHECK (is_admin() OR (is_admin_or_supervisor() AND (from_branch_id = get_my_branch_id() OR to_branch_id = get_my_branch_id())));
DROP POLICY IF EXISTS "fin_loans_update" ON fin_loans;
CREATE POLICY "fin_loans_update" ON fin_loans FOR UPDATE
  TO authenticated USING (is_admin() OR (is_admin_or_supervisor() AND (from_branch_id = get_my_branch_id() OR to_branch_id = get_my_branch_id())))
  WITH CHECK (is_admin() OR (is_admin_or_supervisor() AND (from_branch_id = get_my_branch_id() OR to_branch_id = get_my_branch_id())));
DROP POLICY IF EXISTS "fin_loans_delete" ON fin_loans;
CREATE POLICY "fin_loans_delete" ON fin_loans FOR DELETE
  TO authenticated USING (is_admin() OR (is_admin_or_supervisor() AND (from_branch_id = get_my_branch_id() OR to_branch_id = get_my_branch_id())));

DROP TRIGGER IF EXISTS fin_loans_update_updated_at ON fin_loans;
CREATE TRIGGER fin_loans_update_updated_at
BEFORE UPDATE ON fin_loans
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- fin_loan_returns
CREATE TABLE IF NOT EXISTS fin_loan_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES fin_loans(id) ON DELETE CASCADE,
  return_date date NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE fin_loan_returns ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_fin_loan_returns_loan ON fin_loan_returns(loan_id);
CREATE INDEX IF NOT EXISTS idx_fin_loan_returns_date ON fin_loan_returns(return_date);

DROP POLICY IF EXISTS "fin_loan_returns_select" ON fin_loan_returns;
CREATE POLICY "fin_loan_returns_select" ON fin_loan_returns FOR SELECT
  TO authenticated USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM fin_loans l WHERE l.id = fin_loan_returns.loan_id
      AND (l.from_branch_id = get_my_branch_id() OR l.to_branch_id = get_my_branch_id())
    )
  );
DROP POLICY IF EXISTS "fin_loan_returns_insert" ON fin_loan_returns;
CREATE POLICY "fin_loan_returns_insert" ON fin_loan_returns FOR INSERT
  TO authenticated WITH CHECK (
    is_admin() OR (is_admin_or_supervisor() AND EXISTS (
      SELECT 1 FROM fin_loans l WHERE l.id = fin_loan_returns.loan_id
      AND (l.from_branch_id = get_my_branch_id() OR l.to_branch_id = get_my_branch_id())
    ))
  );
DROP POLICY IF EXISTS "fin_loan_returns_delete" ON fin_loan_returns;
CREATE POLICY "fin_loan_returns_delete" ON fin_loan_returns FOR DELETE
  TO authenticated USING (
    is_admin() OR (is_admin_or_supervisor() AND EXISTS (
      SELECT 1 FROM fin_loans l WHERE l.id = fin_loan_returns.loan_id
      AND (l.from_branch_id = get_my_branch_id() OR l.to_branch_id = get_my_branch_id())
    ))
  );

-- fin_bolao_closing
CREATE TABLE IF NOT EXISTS fin_bolao_closing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  closing_date date NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_cotas numeric(12,2) NOT NULL DEFAULT 0,
  total_value numeric(12,2) NOT NULL DEFAULT 0,
  total_fee numeric(12,2) NOT NULL DEFAULT 0,
  pix_externals jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_pix_externals numeric(12,2) NOT NULL DEFAULT 0,
  owed_amounts jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_owed numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE fin_bolao_closing ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_fin_bolao_closing_branch ON fin_bolao_closing(branch_id);
CREATE INDEX IF NOT EXISTS idx_fin_bolao_closing_date ON fin_bolao_closing(closing_date);
CREATE INDEX IF NOT EXISTS idx_fin_bolao_closing_operator ON fin_bolao_closing(operator_id);

DROP POLICY IF EXISTS "fin_bolao_closing_select" ON fin_bolao_closing;
CREATE POLICY "fin_bolao_closing_select" ON fin_bolao_closing FOR SELECT
  TO authenticated USING (
    public.is_admin()
    OR (public.is_supervisor() AND branch_id = public.get_my_branch_id())
    OR operator_id = auth.uid()
  );
DROP POLICY IF EXISTS "fin_bolao_closing_insert" ON fin_bolao_closing;
CREATE POLICY "fin_bolao_closing_insert" ON fin_bolao_closing FOR INSERT
  TO authenticated WITH CHECK (
    public.is_admin()
    OR branch_id = public.get_my_branch_id()
  );
DROP POLICY IF EXISTS "fin_bolao_closing_update" ON fin_bolao_closing;
CREATE POLICY "fin_bolao_closing_update" ON fin_bolao_closing FOR UPDATE
  TO authenticated USING (
    public.is_admin()
    OR (is_admin_or_supervisor() AND branch_id = public.get_my_branch_id())
    OR (operator_id = auth.uid() AND branch_id = public.get_my_branch_id())
  )
  WITH CHECK (
    public.is_admin()
    OR (is_admin_or_supervisor() AND branch_id = public.get_my_branch_id())
    OR (operator_id = auth.uid() AND branch_id = public.get_my_branch_id())
  );
DROP POLICY IF EXISTS "fin_bolao_closing_delete" ON fin_bolao_closing;
CREATE POLICY "fin_bolao_closing_delete" ON fin_bolao_closing FOR DELETE
  TO authenticated USING (
    public.is_admin()
    OR (is_admin_or_supervisor() AND branch_id = public.get_my_branch_id())
    OR (operator_id = auth.uid() AND branch_id = public.get_my_branch_id())
  );

DROP TRIGGER IF EXISTS fin_bolao_closing_update_updated_at ON fin_bolao_closing;
CREATE TRIGGER fin_bolao_closing_update_updated_at
BEFORE UPDATE ON fin_bolao_closing
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Storage bucket for PDF uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('financial-pdfs', 'financial-pdfs', false)
ON CONFLICT (id) DO NOTHING;

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