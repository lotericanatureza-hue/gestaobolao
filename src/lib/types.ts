export type UserRole = 'admin' | 'supervisor' | 'operator';
export interface Profile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  branch_id: string | null;
  active: boolean;
  created_at: string;
}
export interface Branch {
  id: string;
  name: string;
  code: string;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  active: boolean;
  created_at: string;
}
export interface Product {
  id: string;
  name: string;
  slug: string;
  min_dezenas: number;
  max_dezenas: number;
  base_price: number;
  service_fee: number;
  draw_frequency: string | null;
  default_draw_time: string;
  active: boolean;
  created_at: string;
}
export interface BranchProduct {
  id: string;
  branch_id: string;
  product_id: string;
  custom_price: number | null;
  custom_service_fee: number | null;
  active: boolean;
  created_at: string;
  product?: Product;
  branch?: Branch;
}
export type BolaoStatus = 'pending' | 'partial' | 'sold';
export interface Bolao {
  id: string;
  branch_id: string | null;
  product_id: string;
  operator_id: string | null;
  contest_number: string;
  dezenas: number;
  jogos: number;
  price: number;
  service_fee: number;
  draw_date: string;
  draw_time: string;
  draw_datetime: string;
  total_shares: number;
  sold_shares: number;
  status: BolaoStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  product?: Product;
  branch?: Branch;
  operator?: Profile;
}

export interface BolaoBranchAllocation {
  id: string;
  bolao_id: string;
  branch_id: string;
  shares_allocated: number;
  shares_picked: number;
  created_at: string;
  updated_at: string;
  bolao?: Bolao;
  branch?: Branch;
}

export interface BolaoOperatorAllocation {
  id: string;
  bolao_id: string;
  operator_id: string;
  shares_allocated: number;
  shares_sold: number;
  created_at: string;
  updated_at: string;
  bolao?: Bolao;
  operator?: Profile;
}

export interface BolaoShareTransfer {
  id: string;
  bolao_id: string;
  from_operator_id: string;
  to_operator_id: string;
  shares: number;
  transferred_by: string | null;
  created_at: string;
  bolao?: Bolao;
  from_operator?: Profile;
  to_operator?: Profile;
}

export interface MonthlyGoal {
  month_key: string;
  goal_amount: number;
  updated_by: string | null;
  updated_at: string;
}

// ===== Financial Module Types =====

export interface FinCategory {
  id: string;
  branch_id: string;
  name: string;
  type: 'expense' | 'income';
  active: boolean;
  created_at: string;
}

export interface FinSubcategory {
  id: string;
  category_id: string;
  branch_id: string;
  name: string;
  active: boolean;
  created_at: string;
}

export interface FinPaymentSource {
  id: string;
  branch_id: string;
  name: string;
  active: boolean;
  created_at: string;
}

export interface FinBill {
  id: string;
  branch_id: string;
  description: string;
  type: 'expense' | 'income';
  category_id: string | null;
  subcategory_id: string | null;
  amount: number;
  origin: string | null;
  payment_source_id: string | null;
  due_date: string | null;
  payment_date: string | null;
  status: 'pending' | 'paid';
  month_ref: number;
  year_ref: number;
  recurring: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  category?: FinCategory;
  subcategory?: FinSubcategory;
  payment_source?: FinPaymentSource;
  branch?: Branch;
}

export interface FinDailyControl {
  id: string;
  branch_id: string;
  control_date: string;
  worked_amount: number;
  valor_003: number;
  valor_043: number;
  safe_amount: number;
  current_safe_amount: number;
  balance_difference: number;
  withdrawals: DailyWithdrawal[];
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface DailyWithdrawal {
  id: string;
  description: string;
  amount: number;
}

export interface PixExternal {
  id: string;
  description: string;
  amount: number;
}

export interface FinCashClosing {
  id: string;
  branch_id: string;
  employee_id: string | null;
  closing_date: string;
  total_sales: number;
  total_income: number;
  pix_externals: PixExternal[];
  total_pix_externals: number;
  surplus: number;
  shortage: number;
  safe_amount: number;
  cash_drawer: number;
  deposit_amount: number;
  pdf_path: string | null;
  notes: string | null;
  status: 'open' | 'closed';
  created_by: string | null;
  created_at: string;
  updated_at: string;
  branch?: Branch;
  employee?: FinEmployee;
}

export interface FinEmployee {
  id: string;
  branch_id: string;
  name: string;
  tfl: string;
  position: string | null;
  active: boolean;
  created_at: string;
  branch?: Branch;
}

export interface FinLoanReturn {
  id: string;
  loan_id: string;
  return_date: string;
  amount: number;
  created_by: string | null;
  created_at: string;
}

export interface FinLoan {
  id: string;
  from_branch_id: string;
  to_branch_id: string;
  loan_date: string;
  amount: number;
  returned_amount: number;
  status: 'active' | 'returned';
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  from_branch?: Branch;
  to_branch?: Branch;
  returns?: FinLoanReturn[];
}
