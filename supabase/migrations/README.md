# Migration: create_boloes_system

This migration has been applied to the Supabase database via the `mcp__supabase__apply_migration` tool.

## Schema Overview

### Tables

1. **branches** — Lojas filiais (name, code, address, city, state, phone, active)
2. **profiles** — Extends `auth.users` (name, email, role: admin|operator, branch_id, active)
3. **products** — Produtos de loteria (name, slug, min/max_dezenas, base_price, service_fee, draw_frequency, active)
4. **branch_products** — Alocação N:N entre filiais e produtos (custom_price, custom_service_fee, active)
5. **boloes** — Bolões criados pelos operadores (contest_number, dezenas, price, service_fee, draw_date, total_shares, sold_shares, status: pending|partial|sold, notes)

### Security (RLS)

- **profiles**: admins veem todos; operadores veem apenas o próprio perfil
- **branches**: admins gerenciam todos; operadores veem apenas a própria filial
- **products**: todos autenticados podem ler; apenas admins gerenciam
- **branch_products**: admins gerenciam; operadores leem apenas da própria filial
- **boloes**: admins veem todos; operadores gerenciam apenas os da própria filial

### Helper Functions

- `is_admin()` — verifica se o usuário autenticado tem role 'admin'
- `handle_new_user()` — trigger que cria profile automaticamente no signup
- `update_updated_at()` — trigger que atualiza updated_at em bolões

### Seed Data

10 produtos da Caixa pré-cadastrados: Mega-Sena, Lotofácil, Quina, +Milionária, Lotomania, Timemania, Dupla Sena, Loteca, Dia de Sorte, Super Sete.

## SQL

The full SQL is applied directly via the Supabase MCP `apply_migration` tool. See the migration record in Supabase for the complete SQL.
