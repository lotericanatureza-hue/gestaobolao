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
export type BolaoStatus = 'pending' | 'partial' | 'sold' | 'encalhado';
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
  encalhe_settled: boolean;
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
