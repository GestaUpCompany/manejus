# Vision — Arquitetura futura (documento de referência)
### Documento criado às 20h10min do dia 06/08/2026

> **Status:** possível implementação futura. Nada aqui deve ser tratado como decisão tomada ou trabalho em andamento. Este documento existe apenas para registrar a arquitetura recomendada caso o projeto avance.
>
> **Atualização 28/09/2026:** adicionada auditoria da planilha fonte (seção "Auditoria da planilha Vision"). A auditoria reforça a recomendação de monorepo e redefine o escopo: cerca de 1/3 das abas é manejo e não deve ser reconstruído.

## Contexto

O Manejus 360 nasceu da sistematização de uma planilha de manejo. Existe uma segunda planilha, chamada Vision, exclusivamente financeira, que futuramente pode ser sistematizada como produto digital. O Vision usará o mesmo projeto Supabase do Manejus (mesmo banco, mesmo Auth, mesmo PWA).

A pergunta arquitetural é se o Vision deve ser integrado no mesmo app do Manejus ou ser um produto separado.

## Decisão arquitetural recomendada

**Monorepo com dois apps independentes e pacotes compartilhados.**

Não integrar no mesmo app React, mas também não criar dois repositórios isolados. Os dois apps compartilham o mesmo Supabase, a mesma base de tipos e componentes, mas têm build, deploy e domínio próprios.

### Por que não integrar no mesmo app

- Domínios diferentes (manejo operacional vs financeiro) crescem melhor separados; misturar cria um produto que tenta ser duas coisas e cada feature nova polui a navegação do outro.
- Perfis de usuário podem ser diferentes: o produtor usa o Manejus no curral, o contador/administrador usa o Vision no escritório. Separar facilita controle de acesso e experiência.
- Estratégia de produto: se Vision for um módulo cobrado à parte, apps separados facilitam empacotamento e pricing.
- Em 12 meses com 30 telas financeiras, a separação vai ser vista como acerto.

### Por que não dois repositórios isolados

- O dado é compartilhado no Supabase; tipos TypeScript, client Supabase e helpers de formatação seriam duplicados.
- Manter dois repositórios sincronizados em mudanças de schema é fricção desnecessária.
- Monorepo permite refatorar pacotes compartilhados uma vez e ambos os apps herdam.

## Estrutura de diretórios

```
gestaup-monorepo/
├── package.json                 # workspace root (pnpm ou npm workspaces)
├── pnpm-workspace.yaml          # declara packages/* e apps/*
├── tsconfig.base.json           # config TypeScript compartilhada
├── .env                         # variáveis de ambiente compartilhadas (Supabase URL/KEY)
│
├── packages/
│   ├── supabase/                # @gestaup/supabase
│   │   ├── src/
│   │   │   ├── client.ts        # cliente Supabase singleton
│   │   │   ├── types/           # tipos gerados do banco (supabase gen types)
│   │   │   │   ├── database.ts
│   │   │   │   └── index.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── ui/                      # @gestaup/ui
│   │   ├── src/
│   │   │   ├── components/      # Button, Card, Input, Modal, Table, etc.
│   │   │   ├── hooks/           # useAuth, useFazenda, useDebounce, etc.
│   │   │   ├── utils/           # formatDate, formatCurrency, formatKg, etc.
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   └── shared/                  # @gestaup/shared
│       ├── src/
│       │   ├── services/        # serviços que ambos os apps usam
│       │   │   ├── fazendasService.ts
│       │   │   ├── usuariosService.ts
│       │   │   └── authService.ts
│       │   ├── contexts/        # AuthContext, FazendaContext
│       │   └── index.ts
│       └── package.json
│
├── apps/
│   ├── manejus/                 # app de manejo (atual GestaUp-Cadernetas-Gestao)
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   │   ├── controller/  # AcompanhamentoTratos, Lotes, Currais, etc.
│   │   │   │   ├── admin/       # NovaFazenda, EditarFazenda, DetalhesFazenda, etc.
│   │   │   │   └── public/      # relatórios públicos
│   │   │   ├── services/        # serviços específicos do manejo
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   └── vision/                  # app financeiro (futuro)
│       ├── src/
│       │   ├── pages/
│       │   │   ├── dashboard/       # fluxo de caixa, DRE, indicadores
│       │   │   ├── contas/          # contas a pagar/receber
│       │   │   ├── lancamentos/     # lançamentos financeiros
│       │   │   ├── custos/          # custo por arroba, por lote, por fazenda
│       │   │   ├── relatorios/      # relatórios financeiros
│       │   │   └── configuracao/    # centros de custo, categorias, planos
│       │   ├── services/            # serviços específicos do financeiro
│       │   ├── App.tsx
│       │   └── main.tsx
│       ├── index.html
│       ├── vite.config.ts
│       └── package.json
│
└── supabase/                   # migrations e schema (compartilhado)
    ├── migrations/
    └── functions/              # edge functions
```

## Pacotes compartilhados

### `@gestaup/supabase`

Cliente Supabase singleton e tipos gerados do banco. Ambos os apps importam de aqui, garantindo que mudanças de schema propaguem automaticamente via `supabase gen types`.

```ts
// packages/supabase/src/client.ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types/database'

export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)
```

### `@gestaup/ui`

Componentes de UI reutilizáveis (Button, Card, Input, Modal, Table, Skeleton, etc.) e hooks utilitários. Hoje esses componentes estão em `src/components/ui/` do Manejus; na migração para monorepo, mover para este pacote.

### `@gestaup/shared`

Serviços e contextos que ambos os apps usam: `AuthContext`, `FazendaContext`, `fazendasService`, `usuariosService`, funções de formatação comuns (`formatDate`, `formatCurrency`). O Vision precisa saber em qual fazenda o usuário está, precisa de auth, e precisa ler dados de lotes e registros para calcular custos; tudo isso já existe no Manejus e seria extraído para este pacote.

## Apps independentes

### Manejus (apps/manejus)

O app de manejo atual, migrado de repositório standalone para workspace do monorepo. Mantém todas as páginas de controller, admin e relatórios públicos. Importa de `@gestaup/supabase`, `@gestaup/ui` e `@gestaup/shared`. Serviços específicos de manejo (acompanhamentoTratosService, programacaoTratosService, etc.) ficam dentro do app.

### Vision (apps/vision)

App financeiro novo. Estrutura inicial de páginas:

| Área | Páginas | Descrição |
|---|---|---|
| Dashboard | Fluxo de caixa, DRE, Indicadores | Visão geral financeira da fazenda |
| Contas | Contas a pagar, Contas a receber | Gestão de compromissos financeiros |
| Lançamentos | Novo lançamento, Listagem, Conciliação | Registro de receitas e despesas |
| Custos | Custo por arroba, Custo por lote, Custo por fazenda | Cross-referencing com dados de manejo do Manejus |
| Relatórios | Relatório financeiro, Relatório de custos | Relatórios exportáveis (PDF/XLSX) |
| Configuração | Centros de custo, Categorias, Plano de contas | Configuração da estrutura financeira |

O Vision lê do mesmo Supabase: tabelas de `fazendas`, `lotes`, `registros_suplementacao`, `usuarios`, e novas tabelas financeiras que seriam criadas (ex: `lancamentos_financeiros`, `contas_pagar`, `contas_receber`, `centros_custo`, `categorias_financeiras`).

## Auditoria da planilha Vision (28/09/2026)

Auditoria do arquivo `Vision Versão Slim - Gesta'Up 2025 - v. 09.06.25 - Agrop. Marca.xlsm` (~40 MB), executada via `__audit_vision.cjs` na raiz do repo (SheetJS; reexecutável em qualquer cópia da planilha).

### Números

- **41 abas, ~2,2 milhões de células, ~1,57 milhão de fórmulas, 654 nomes definidos.**
- Funções dominantes: IFERROR (1,08M), SUMIFS (139k), IF (112k), COUNTIFS (37k), VLOOKUP (19k), YEAR/EDATE/MONTH. Perfil clássico de agregação condicional por período e categoria: em sistema, isso vira SQL (views, RPCs, materialized views), não lógica de tela.
- Maiores concentrações de fórmulas: `FC_diário` (711k), `Diárias_Categoria` (292k), `Desembolsos Previstos` (158k), `Desembolsos Realizados` (160k). `Contas a Pagar`, `Desembolsos` e `Financiamentos` usam ranges de 1M de linhas: são ledgers de lançamentos.

### Achado central: ~1/3 das abas é manejo, não financeiro

A planilha replica rastreamento de rebanho porque cada fazenda é um arquivo isolado que não pode consultar o sistema de manejo. No Vision sistematizado, **essas abas não devem ser reconstruídas**: viram leituras do banco compartilhado. É a maior economia de escopo do projeto.

| Grupo | Abas | Destino no sistema |
|---|---|---|
| Manejo replicado | Nascimentos, Mortes_Consumos, Evolução_Rebanho, Estoque (auditoria do rebanho), Tropa, Desmama, Prenhez por Touro, IATF, Inseminador, Compra_Gado, Venda_Gado | Queries sobre `lotes`, `registros_*`, `lote_categorias` etc. Zero tela/tabela nova |
| Ponte manejo-financeiro | Diárias, Diárias_Categoria | Engine de custo: cruza cabeças-dia (manejo) com desembolsos (financeiro). Vira view/RPC, não planilha de entrada |
| Domínio financeiro novo | Cadastros, Centro de Custos, Compradores, Fornecedores, Contas a Receber, Receitas_Mensais, Contas a Pagar - Decisão, Financiamentos, Desembolsos Realizados, Desembolsos Previstos, Estoque Mensal (insumos), Orçamento Mensal, Fechamento Mensal, Consolidado Mensal (+Resumo), Investimentos, Levantamento Patrimonial, Análise Plano de Contas, Análise Agrupamentos, DGR, FC_diário, FC_Mensal, FC_Anual, Pagar_Receber, Meta_Mensal, Relatórios, Menu | Produto financeiro completo (~25-30 telas): ledgers, plano de contas hierárquico, 3 engines de cálculo (fluxo de caixa projetado, diárias/custo por cabeça, DRE/orçamento consolidado) |

### Consequência para a decisão módulo vs monorepo

A escala medida (~28 abas de domínio financeiro, três engines de cálculo, ledgers de lançamento) confirma que o Vision é um segundo produto, não uma feature. Como módulo dentro do painel, absorveria um ERP-lite inteiro na navegação e no bundle de um app já grande, além de acoplar os ciclos de release. Monorepo mantém-se como decisão recomendada.

### Phasing recomendado (não portar 1:1)

1. **Núcleo financeiro**: plano de contas + agrupamentos, centros de custo, fornecedores/compradores, lançamentos (desembolsos realizados/previstos), contas a pagar/receber, fluxo de caixa realizado.
2. **Consolidação**: DRE/DGR, orçamento vs realizado, consolidado mensal/anual, metas, fluxo de caixa projetado.
3. **Integração profunda**: diárias/custo por cabeça (cruzando manejo), financiamentos, investimentos, patrimônio.

### Hotspots técnicos (spikes antes de fixar schema)

- **FC_diário**: projeção diária com saldo acumulado por conta/categoria. Vira RPC/tabela-função ou rotina de materialização; é o item mais caro do projeto e deve ser prototipado antes de fechar o modelo de dados financeiro.
- **Diárias/custo por cabeça**: precisa de cabeças-dia por categoria (já derivável de `lote_categorias`) cruzado com lançamentos por centro de custo. Definir granularidade de centro de custo na fase 1 para não refazer depois.
- **Modelagem de ledgers**: Desembolsos Realizados vs Previstos pode ser uma tabela `fin_lancamentos` com status (`previsto`/`realizado`), que simplifica contas a pagar/receber e fluxo de caixa sobre a mesma base.



Quando o projeto avançar, a migração seria:

1. Criar estrutura de monorepo (root `package.json` com workspaces, `packages/`, `apps/`).
2. Mover `src/components/ui/` para `packages/ui/`.
3. Mover `src/services/supabaseClient.ts` e tipos para `packages/supabase/`.
4. Mover `src/contexts/`, `src/utils/` e serviços compartilhados para `packages/shared/`.
5. Mover o resto de `src/` para `apps/manejus/src/`.
6. Ajustar imports em todo o app Manejus para usar `@gestaup/*`.
7. Criar `apps/vision/` com estrutura inicial.
8. Configurar builds independentes (cada app com seu próprio `vite.config.ts` e `index.html`).

## Deploy

Cada app faz deploy independente:

- `apps/manejus` -> domínio do Manejus (ex: `manejus360.com.br`)
- `apps/vision` -> domínio do Vision (ex: `vision.manjus360.com.br` ou domínio próprio)

Ambos apontam para o mesmo projeto Supabase. A sessão de auth pode ser compartilhada entre domínios via configuração de cookies do Supabase Auth, permitindo navegação entre os dois apps sem relogin.

## Considerações de banco de dados

Novas tabelas financeiras do Vision seriam criadas no mesmo projeto Supabase, com `fazenda_id` e RLS seguindo o mesmo padrão do Manejus. Tabelas existentes de manejo (`lotes`, `registros_suplementacao`, `lote_categorias`, etc.) são lidas pelo Vision para cálculo de custos, sem necessidade de duplicação.

Migrations continuam em `supabase/migrations/` na raiz do monorepo, compartilhadas entre ambos os apps.
