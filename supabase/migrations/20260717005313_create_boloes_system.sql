/*
# Sistema de Gestão de Bolões de Loterias

## Visão Geral
Cria o schema completo para gestão de bolões da Caixa Econômica Federal, com controle
de usuários (administrador e operador), filiais, produtos de loteria, alocação de
produtos por filial e bolões gerados/vendidos/encalhados.

## 1. Tabela `profiles`
Estende `auth.users` com dados adicionais do usuário.
- `id` (uuid, PK, referência a auth.users) — identidade do usuário
- `name` (text) — nome completo
- `email` (text) — email (espelho de auth.users para consultas)
- `role` (text) — papel: 'admin' ou 'operator'
- `branch_id` (uuid, FK para branches) — filial alocada (null para admins globais)
- `active` (boolean, default true)
- `created_at` (timestamptz)

## 2. Tabela `branches`
Cadastro de lojas filiais.
- `id` (uuid, PK)
- `name` (text) — nome da filial
- `code` (text, unique) — código único da filial
- `address` (text) — endereço
- `city` (text) — cidade
- `state` (text) — UF
- `phone` (text) — telefone
- `active` (boolean, default true)
- `created_at` (timestamptz)

## 3. Tabela `products`
Cadastro dos produtos de loteria (mega-sena, lotofácil, etc.).
- `id` (uuid, PK)
- `name` (text) — nome do produto
- `slug` (text, unique) — identificador único
- `min_dezenas` (int) — quantidade mínima de dezenas
- `max_dezenas` (int) — quantidade máxima de dezenas
- `base_price` (numeric) — preço base por aposta
- `service_fee` (numeric) — taxa de serviço padrão
- `draw_frequency` (text) — frequência do sorteio
- `active` (boolean, default true)
- `created_at` (timestamptz)

## 4. Tabela `branch_products`
Alocação de produtos para filiais (N:N).
- `id` (uuid, PK)
- `branch_id` (uuid, FK)
- `product_id` (uuid, FK)
- `custom_price` (numeric, null) — preço sobrescrito
- `custom_service_fee` (numeric, null) — taxa sobrescrita
- `active` (boolean, default true)
- `created_at` (timestamptz)
- UNIQUE (branch_id, product_id)

## 5. Tabela `boloes`
Bolões criados pelos operadores de cada filial.
- `id` (uuid, PK)
- `branch_id` (uuid, FK) — filial que criou o bolão
- `product_id` (uuid, FK) — produto da loteria
- `operator_id` (uuid, FK para profiles) — operador que criou
- `contest_number` (text) — número do concurso
- `dezenas` (int) — quantidade de dezenas
- `price` (numeric) — preço total do bolão
- `service_fee` (numeric) — taxa de serviço
- `draw_date` (date) — data do sorteio
- `total_shares` (int) — total de cotas
- `sold_shares` (int, default 0) — cotas vendidas
- `status` (text, default 'pending') — 'pending', 'partial', 'sold'
- `notes` (text) — observações
- `created_at` / `updated_at` (timestamptz)

## Segurança
- RLS habilitado em todas as tabelas.
- Profiles: admins veem todos; operadores veem apenas o próprio.
- Branches: admins veem/editam todos; operadores veem apenas a própria.
- Products: admins gerenciam; operadores leem todos.
- Branch_products: admins gerenciam; operadores leem apenas da própria filial.
- Boloes: admins veem todos; operadores veem e gerenciam apenas os da própria filial.
- Políticas separadas por verbo CRUD.
- Função helper `is_admin()` para verificar role do usuário autenticado.
- Trigger cria profile automaticamente no signup.
*/

-- ============================================================
-- TABELAS (criadas antes das funções/policies que as referenciam)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE NOT NULL,
  address text,
  city text,
  state text,
  phone text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'operator' CHECK (role IN ('admin', 'operator')),
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  min_dezenas int NOT NULL DEFAULT 6,
  max_dezenas int NOT NULL DEFAULT 20,
  base_price numeric(10,2) NOT NULL DEFAULT 0,
  service_fee numeric(10,2) NOT NULL DEFAULT 0,
  draw_frequency text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.branch_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  custom_price numeric(10,2),
  custom_service_fee numeric(10,2),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.boloes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  operator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  contest_number text NOT NULL,
  dezenas int NOT NULL,
  price numeric(10,2) NOT NULL DEFAULT 0,
  service_fee numeric(10,2) NOT NULL DEFAULT 0,
  draw_date date NOT NULL,
  total_shares int NOT NULL DEFAULT 1,
  sold_shares int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'sold')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- FUNÇÃO HELPER: is_admin()
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ============================================================
-- RLS: profiles
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_profiles" ON public.profiles;
CREATE POLICY "select_profiles" ON public.profiles FOR SELECT
  TO authenticated USING (public.is_admin() OR auth.uid() = id);

DROP POLICY IF EXISTS "insert_profiles" ON public.profiles;
CREATE POLICY "insert_profiles" ON public.profiles FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "update_profiles" ON public.profiles;
CREATE POLICY "update_profiles" ON public.profiles FOR UPDATE
  TO authenticated USING (public.is_admin() OR auth.uid() = id)
  WITH CHECK (public.is_admin() OR auth.uid() = id);

DROP POLICY IF EXISTS "delete_profiles" ON public.profiles;
CREATE POLICY "delete_profiles" ON public.profiles FOR DELETE
  TO authenticated USING (public.is_admin());

-- ============================================================
-- RLS: branches
-- ============================================================
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_branches" ON public.branches;
CREATE POLICY "select_branches" ON public.branches FOR SELECT
  TO authenticated USING (
    public.is_admin()
    OR id IN (SELECT branch_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_branches" ON public.branches;
CREATE POLICY "insert_branches" ON public.branches FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "update_branches" ON public.branches;
CREATE POLICY "update_branches" ON public.branches FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "delete_branches" ON public.branches;
CREATE POLICY "delete_branches" ON public.branches FOR DELETE
  TO authenticated USING (public.is_admin());

-- ============================================================
-- RLS: products
-- ============================================================
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_products" ON public.products;
CREATE POLICY "select_products" ON public.products FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_products" ON public.products;
CREATE POLICY "insert_products" ON public.products FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "update_products" ON public.products;
CREATE POLICY "update_products" ON public.products FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "delete_products" ON public.products;
CREATE POLICY "delete_products" ON public.products FOR DELETE
  TO authenticated USING (public.is_admin());

-- ============================================================
-- RLS: branch_products
-- ============================================================
ALTER TABLE public.branch_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_branch_products" ON public.branch_products;
CREATE POLICY "select_branch_products" ON public.branch_products FOR SELECT
  TO authenticated USING (
    public.is_admin()
    OR branch_id IN (SELECT branch_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_branch_products" ON public.branch_products;
CREATE POLICY "insert_branch_products" ON public.branch_products FOR INSERT
  TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "update_branch_products" ON public.branch_products;
CREATE POLICY "update_branch_products" ON public.branch_products FOR UPDATE
  TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "delete_branch_products" ON public.branch_products;
CREATE POLICY "delete_branch_products" ON public.branch_products FOR DELETE
  TO authenticated USING (public.is_admin());

-- ============================================================
-- RLS: boloes
-- ============================================================
ALTER TABLE public.boloes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_boloes" ON public.boloes;
CREATE POLICY "select_boloes" ON public.boloes FOR SELECT
  TO authenticated USING (
    public.is_admin()
    OR branch_id IN (SELECT branch_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_boloes" ON public.boloes;
CREATE POLICY "insert_boloes" ON public.boloes FOR INSERT
  TO authenticated WITH CHECK (
    public.is_admin()
    OR (branch_id IN (SELECT branch_id FROM public.profiles WHERE id = auth.uid())
        AND operator_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_boloes" ON public.boloes;
CREATE POLICY "update_boloes" ON public.boloes FOR UPDATE
  TO authenticated USING (
    public.is_admin()
    OR branch_id IN (SELECT branch_id FROM public.profiles WHERE id = auth.uid())
  ) WITH CHECK (
    public.is_admin()
    OR branch_id IN (SELECT branch_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_boloes" ON public.boloes;
CREATE POLICY "delete_boloes" ON public.boloes FOR DELETE
  TO authenticated USING (
    public.is_admin()
    OR branch_id IN (SELECT branch_id FROM public.profiles WHERE id = auth.uid())
  );

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_profiles_branch_id ON public.profiles(branch_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_branch_products_branch_id ON public.branch_products(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_products_product_id ON public.branch_products(product_id);
CREATE INDEX IF NOT EXISTS idx_boloes_branch_id ON public.boloes(branch_id);
CREATE INDEX IF NOT EXISTS idx_boloes_product_id ON public.boloes(product_id);
CREATE INDEX IF NOT EXISTS idx_boloes_operator_id ON public.boloes(operator_id);
CREATE INDEX IF NOT EXISTS idx_boloes_status ON public.boloes(status);
CREATE INDEX IF NOT EXISTS idx_boloes_draw_date ON public.boloes(draw_date);

-- ============================================================
-- TRIGGER: criar profile automaticamente no signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'operator')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- TRIGGER: atualizar updated_at em boloes
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boloes_update_updated_at ON public.boloes;
CREATE TRIGGER boloes_update_updated_at
  BEFORE UPDATE ON public.boloes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- DADOS INICIAIS: produtos da Caixa
-- ============================================================
INSERT INTO public.products (name, slug, min_dezenas, max_dezenas, base_price, service_fee, draw_frequency)
VALUES
  ('Mega-Sena', 'mega-sena', 6, 20, 5.00, 2.00, 'quarta/sábado'),
  ('Lotofácil', 'lotofacil', 15, 20, 3.00, 2.00, 'segunda/quarta/sexta'),
  ('Quina', 'quina', 5, 15, 2.00, 2.00, 'segunda/quarta/sexta'),
  ('+Milionária', 'mais-milionaria', 6, 10, 6.00, 2.00, 'sábado'),
  ('Lotomania', 'lotomania', 50, 50, 3.00, 2.00, 'segunda/quarta/sexta'),
  ('Timemania', 'timemania', 10, 10, 3.00, 2.00, 'terça/quarta/sábado'),
  ('Dupla Sena', 'dupla-sena', 6, 15, 2.00, 2.00, 'terça/quinta/sábado'),
  ('Loteca', 'loteca', 14, 14, 3.00, 2.00, 'segunda'),
  ('Dia de Sorte', 'dia-de-sorte', 7, 15, 2.00, 2.00, 'terça/quinta/sábado'),
  ('Super Sete', 'super-sete', 7, 7, 2.00, 2.00, 'segunda/quarta/sexta')
ON CONFLICT (slug) DO NOTHING;