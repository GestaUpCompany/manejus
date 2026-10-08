# CLAUDE.md — Painel Web Gesta-Up (Cadernetas Gestão)

Monorepo pnpm do painel de gestão/admin (React 18 + TanStack Query + Vite), online, sem fila offline. **Este repo é o dono do schema do banco** Supabase (projeto `nrwljcvhwbezmoummxbl`): migrations estruturais vivem em `supabase/migrations/` e são aplicadas com `supabase db push`. Compartilha o banco com o PWA offline-first, repo separado em `C:\Users\USER\Documents\Caderneta-Digital-Gesta-Up`, que apenas consome o schema.

@AGENTS.md

## Comandos (rodar na raiz)

- Install: `pnpm install`
- Dev manejus: `pnpm dev` (equivale a `pnpm --filter manejus dev`)
- Dev vision: `pnpm dev:vision`
- Build: `pnpm build` (todos os apps) ou `pnpm --filter manejus build`
- Typecheck: `pnpm typecheck`
- Lint: `pnpm lint` (eslint, manejus tem `--max-warnings 0`)
- Test: `pnpm test` (vitest run, hoje só o manejus tem suite)

## Estrutura

- `apps/manejus` — painel principal de gestão (TanStack Query, mapas MapLibre/terra-draw, relatórios PDF/Excel)
- `apps/vision` — módulo financeiro (ver `docs/VISION_ARQUITETURA_FUTURA.md`)
- `apps/farmplan` — Farm Plan: site estático (HTML/JS vanilla + PWA, sem build) com banco Supabase próprio `tcjrztbivvosrxjnjqom` (SQLs em `apps/farmplan/supabase/`, não em `supabase/migrations/`). Vercel: projeto `farmplan` (https://farmplan-fawn.vercel.app), Root Directory `apps/farmplan`
- `packages/{supabase,shared,ui}` — cliente/tipos Supabase, código compartilhado e componentes UI (`@gestaup/*`)
- `supabase/` — `migrations/` (schema oficial), `functions/`, `config.toml`
- A raiz acumula artefatos de trabalho pontual (seeds `.sql`, backups, `tmp_*`, `smoke-*`, `__*.cjs`, planilhas `.xlsm`, relatórios `.pdf`). Não trate como código do produto; o código mora em `apps/` e `packages/`.

## Pontos críticos

- **Fazenda de testes obrigatória**: `d649c65e-16ab-4b77-a84b-df937aa41cc3`. Nenhuma mutação de dados em outra fazenda, nem em transação com ROLLBACK, sem autorização explícita.
- **Migrations estruturais**: arquivo em `supabase/migrations/<timestamp>_<nome>.sql` → `supabase db push` → commit + push. NUNCA `apply_migration` do MCP para schema (gera divergência de version que quebra `db push` futuro). Dados operacionais pontuais vão direto via MCP.
- **Commits**: mensagem direta `-m "mensagem"`, sem heredoc.
- **Deploy**: Vercel, um projeto por app com Root Directory próprio (`apps/manejus`, `apps/vision`).
- **Verificação antes de entregar**: `pnpm typecheck` + `pnpm lint` + `pnpm test`.
- **Idioma**: código, UI e comentários em pt-BR.

## Impacto cruzado com o PWA (`../Caderneta-Digital-Gesta-Up`)

Este repo controla o schema que o PWA consome; mudanças aqui quebram lá sem erro de compilação:

- **Coluna renomeada/dropada ou tipo alterado** → conferir no PWA `services/syncService.ts` (`CADERNETA_TO_SUPABASE_TABLE` e `registroToSupabase`), `frontend/src/types/supabase.ts` e `services/cadastroCache.ts`. **Peões atualizam o app devagar**: prefira mudanças retroativamente compatíveis (coluna nova em vez de renomear), porque dispositivos em campo podem continuar enviando o formato antigo por semanas.
- **RLS/policy** → a leitura do peão depende de `auth.uid()` + `usuarios`/`usuario_fazenda`. Policy restritiva demais = selects vazios no campo, sem erro.
- **Trigger em tabela escrita pelo PWA** (`registros_*`, `lote_categorias`, `movimentacoes_combustivel`, etc.) → registros chegam via sync com atraso e fora de ordem; triggers que assumem ordem cronológica ou tempo real precisam tolerar isso.
- **Tabela nova consumida pelo PWA** → exige store IndexedDB no lado de lá (bump de versão), mapeamento na `syncQueue`/`syncService` e políticas de leitura para o papel `peao`.

## Onde procurar o quê

- Queries/mutações de dados: TanStack Query hooks dentro de `apps/manejus/src`, tipos e client em `packages/supabase`.
- Schema, triggers, policies, functions SQL: `supabase/migrations/` (histórico completo) + MCP do Supabase para inspeção live.
- Decisões tomadas e débitos: `docs/HISTORICO.md` e `docs/BACKLOG.md` (consulta sob demanda, ver disparadores no AGENTS.md).
- Specs e planos aprovados: `docs/PLANO_*.md`, `docs/SPEC_*.md`, `docs/ARQUITETURA_*.md`.
