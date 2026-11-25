# Project memory

## Product intent & audience

- Sistema de gestão financeira (módulo financeiro) com seção de pagamentos > contas a pagar.
- Público-alvo: usuários responsáveis por gestão de contas e despesas (provável contexto brasileiro/pt-BR).

## Brand personality & voice

- Comunicação direta e objetiva em português (pt-BR).
- Foco em clareza sobre regras de negócio e impacto das alterações para o usuário.

## Visual design & UX direction

- Tela de contas a pagar utiliza cartões/KPIs para resumir valores: "Despesas pagas", "Despesas Geral", "Saídas Excepcionais".
- Filtros globais aplicados na tela afetam todos os cartões e KPIs simultaneamente.
- Estrutura baseada em Vite + React.

## Decisions, constraints & rationale

- "Despesas pagas" deve desconsiderar a categoria "Saídas Excepcionais"; soma apenas contas pagas das demais categorias.
- "Despesas Geral" mantém o cálculo completo, incluindo "Saídas Excepcionais".
- KPI de "Saídas Excepcionais" permanece funcionando independentemente.
- Todos os valores respeitam os filtros aplicados na tela.

## Open questions & assumptions

- Assume-se que "Saídas Excepcionais" é uma categoria identificável por nome/flag no modelo de dados.
- Não confirmado se a mesma exclusão deve se aplicar a outros relatórios ou módulos além de contas a pagar.
- Não detalhado se há subcategorias dentro de "Saídas Excepcionais" que também devem ser excluídas.