export type UserRole = 'admin' | 'operator';
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
  default_draw_time: string; // "HH:MM:SS" — horário padrão do sorteio, usado para pré-preencher o bolão
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
  branch_id: string;
  product_id: string;
  operator_id: string | null; // opcional: admin cria o bolão sem operador definido
  contest_number: string;
  dezenas: number;
  price: number;
  service_fee: number;
  draw_date: string;
  draw_time: string; // "HH:MM:SS" — horário do sorteio
  draw_datetime: string; // gerado pelo banco (draw_date + draw_time), timestamp
  total_shares: number;
  sold_shares: number; // mantido em sincronia pelo banco = soma de shares_sold das alocações
  status: BolaoStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  product?: Product;
  branch?: Branch;
  operator?: Profile;
}

// Quantas cotas de um bolão pertencem a cada operador, e quantas ele já vendeu.
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

