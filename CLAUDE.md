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
- `apps/farmplan` — Farm Plan: site estático (HTML/JS vanilla + PWA, sem build) com banco Supabase próprio `tcjrztbivvosrxjnjqom` (SQLs em `apps/farmplan/supabase/`, não em `supabase/migrations/`). Vercel: projeto `farmplan` (https://farmplan-fawn.vercel.app), Root Directory `apps/farmplan`. Detalhes em `apps/farmplan/README.md`
- `packages/{supabase,shared,ui}` — cliente/tipos Supabase, código compartilhado e componentes UI (`@gestaup/*`)
- `supabase/` — `migrations/` (schema oficial), `functions/`, `config.toml`
- A raiz acumula artefatos de trabalho pontual (seeds `.sql`, backups, `tmp_*`, `smoke-*`, `__*.cjs`, planilhas `.xlsm`, relatórios `.pdf`). Não trate como código do produto; o código mora em `apps/` e `packages/`.

## Pontos críticos

- **Fazenda de testes obrigatória**: `d649c65e-16ab-4b77-a84b-df937aa41cc3`. Nenhuma mutação de dados em outra fazenda, nem em transação com ROLLBACK, sem autorização explícita. Regras completas na seção "Segurança" abaixo.
- **Migrations estruturais**: arquivo em `supabase/migrations/<timestamp>_<nome>.sql` → `supabase db push` → commit + push. NUNCA `apply_migration` do MCP para schema (gera divergência de version que quebra `db push` futuro). Dados operacionais pontuais vão direto via MCP.
- **Commits**: mensagem direta `-m "mensagem"`, sem heredoc.
- **Deploy**: Vercel, um projeto por app com Root Directory próprio (`apps/manejus`, `apps/vision`).
- **Verificação antes de entregar**: `pnpm typecheck` + `pnpm lint` + `pnpm test`.
- **Análise de impacto (dependency-cruiser)**: antes de alterar, remover ou renomear módulo, função exportada, hook, tipo ou contrato compartilhado, e sempre que for preciso saber o impacto real de uma mudança, rodar o grafo em foco no arquivo, dentro de `apps/manejus`: `../../node_modules/.bin/depcruise --no-config --exclude node_modules --focus "<regex do arquivo>" --output-type mermaid src` (use `--output-type json` para listar os dependentes). Não use `npx depcruise` sem `--no-install`: ele resolve outro pacote (`depcruise@1.0.0`). O grafo é por módulo e não enxerga SQL, RPC, triggers nem tabelas do Supabase; complemente com `Grep` pelo nome da função e com a seção "Impacto cruzado" abaixo.
- **Idioma**: código, UI e comentários em pt-BR.

## Segurança: fazenda de testes e ações em produção (regras obrigatórias)

**Fazenda de testes única: `d649c65e-16ab-4b77-a84b-df937aa41cc3`.** O Claude só tem permissão para executar testes, seeds, validações e mutações de dados direcionados a esse ID. O banco `nrwljcvhwbezmoummxbl` é **o de produção**, compartilhado com o Painel e o PWA em campo: não existe ambiente de teste separado, então "teste" significa "dados dessa fazenda".

### Regras
1. **Nenhuma mutação em outra fazenda sem autorização explícita e escopada**, nem em transação com ROLLBACK, nem "só para provar que a RLS bloqueia". Para testar rejeição de fazenda alheia, use apenas dados da fazenda de testes (ex.: um usuário sem acesso a ela, sem escrever na outra).
2. **Nunca descobrir "outra fazenda" para usar como alvo.** Em SQL de mutação, não consultar `fazendas`, `usuario_fazenda` nem `grupos_fazenda` para escolher destino. Se a lógica pede uma segunda fazenda, parar e perguntar.
3. **Autorização vale só para a operação descrita** (fazenda, tabela, critério, quantidade, tipo) e expira com ela. Aprovar uma ação não aprova a seguinte.
4. **Leitura é livre; escrita é a que precisa de escopo.** Ler dados de qualquer fazenda para diagnóstico é permitido, sem alterá-los.
5. **Segredos:** não ler, não copiar nem repetir tokens/chaves (PAT `sbp_…`, `service_role`, senhas, `.env*`, `.claude/settings.local.json`). Se um segredo aparecer numa saída, avisar o usuário para revogá-lo.
6. **Não alterar as próprias permissões** (`.claude/settings*.json`, hooks, `.mcp.json`) sem o usuário pedir. Propor o diff e deixar ele aplicar.
7. **Migrations são globais por natureza.** Seguem o fluxo: arquivo + rollback em `supabase/rollbacks/`, mostrar o SQL, **esperar o ok**, `supabase db push` uma por vez, testar na fazenda de testes. Nunca `apply_migration`.

### Procedimento para mutação/exclusão autorizada em fazenda real (duas chaves)
O usuário autoriza com escopo fechado: *"Autorizo excluir, na fazenda `<nome e id>`, da tabela `<x>`, os registros que `<critério>`. Esperado: `<N>` linhas. Tipo: `<soft-delete|hard delete>`."* Então:
1. **Prévia somente leitura:** linhas afetadas (ou amostra + contagem), vínculos (FKs, `ON DELETE CASCADE`) e efeitos colaterais (triggers, auditoria, contadores: `quant_atual` só recalcula em INSERT, então apagar movimentação exige recalcular).
2. **O usuário confirma a contagem** mostrada.
3. **Preparar o SQL num único bloco** que **aborta se a contagem real diferir** da autorizada. Padrão: **soft-delete** (`deleted_at`), reversível. Exclusão física só com **tabela de backup antes** (`backup_<tema>_<data>`).
4. **Segunda chave: a autorização escopada do usuário.** Desde 09/10/2026 o MCP do Supabase tem escrita (decisão do usuário), então o Claude pode executar a operação, mas só depois do passo 2 (contagem confirmada) e só dentro do escopo autorizado: backup antes, bloco que aborta se a contagem divergir, um registro/lote por vez quando houver cascata de triggers. Sem autorização escopada, o Claude entrega o SQL pronto e o usuário o roda no SQL Editor.
5. **Verificar depois** (contagem, contadores recalculados) e **registrar em `docs/HISTORICO.md`** com os IDs, para permitir reverter.

**Proibido mesmo com autorização:** `TRUNCATE`, `DROP`, `DELETE`/`UPDATE` sem `WHERE`, e exclusão em `fazendas`, `usuarios`, `grupos_fazenda` e `usuario_fazenda` (apagar uma fazenda cascateia quase tudo). Isso o usuário faz sozinho no SQL Editor.

### Canais e controles
- **SQL/MCP:** o servidor MCP do Supabase está em **escopo de usuário, com escrita** desde 09/10/2026 (sem `--read-only`; versão fixa; token só na config do servidor, fora do repo). Em 08/10/2026 ele estava somente leitura (`CREATE TABLE` recusado com 25006); o usuário reabriu a escrita para correções operacionais de dados. `execute_sql` continua pedindo confirmação (`ask`). Escrita em fazenda real segue o procedimento de duas chaves acima; `apply_migration` segue proibido para schema. Tabelas de backup (`backup.*`) são criadas antes de qualquer exclusão.
- **CLI:** `supabase db push`, `functions deploy` e `migration repair` pedem confirmação.
- **Navegador (DevTools):** só `localhost` e só com o usuário de teste logado.
- **Scripts/testes:** os testes do vitest são unitários e não tocam o banco; qualquer script novo que fale com o banco deve abortar se o ID da fazenda diferir do de testes.
- **Escrita de dados de teste:** SÓ por `node scripts/teste-api.mjs` (login como o usuário de teste, requisições PostgREST). Toda requisição passa por `packages/shared/src/guardrail/core.mjs`, que **aborta** (GuardrailError, código de saída 3) qualquer mutação que não prove `fazenda_id = d649c65e-…` no corpo ou no filtro, qualquer RPC mutável sem `p_fazenda_id`, e qualquer escrita em `fazendas`, `usuarios`, `usuario_fazenda`, `grupos_fazenda`, `peoes`. Configuração em `.env.teste` (ignorado pelo git; o Claude não lê esse arquivo). **A RLS sozinha não é limite suficiente**: ~30 tabelas ainda têm policies `true` de escrita (ver `docs/BACKLOG.md`), por isso a trava em código é a defesa principal desse canal.

### Estado da implementação (atualizar quando mudar)
**Existem:** permissões do harness (`deny`/`ask`); MCP do Supabase com escrita (reaberta em 09/10/2026; antes somente leitura, comprovado com `CREATE TABLE` recusado em 25006); núcleo do guardrail (`packages/shared/src/guardrail/core.mjs`) com 27 testes em `core.test.ts` (rodam em `pnpm test`); CLI `scripts/teste-api.mjs`, que confere também que o usuário de teste tem **um único vínculo ativo, só a fazenda de testes, e não é admin**.
**Falta para o CLI funcionar:** o arquivo `.env.teste` na raiz, criado pelo usuário (`GESTAUP_TESTE_EMAIL`, `GESTAUP_TESTE_SENHA`, `GESTAUP_FAZENDA_TESTES_ID`).
**Ainda não existem:** hook de anotação/negação no harness (mostrar a fazenda citada, negar `TRUNCATE`/`DROP`, restringir o navegador a `localhost`); `fetch` guardado no cliente do app (`packages/supabase/src/client.ts`, ligado por variável de ambiente); correção das policies abertas (Fase B de isolamento). Sem o `.env.teste`, o canal de teste por CLI não funciona; a escrita de dados via MCP depende só da autorização escopada do usuário.

*Lição registrada (08/10/2026):* um teste de integridade inseriu uma estação de monta em outra fazenda dentro de uma transação com ROLLBACK; sem efeito persistente, mas viola a regra 1.

### Configurar o MCP do Supabase (por máquina, fora do repo)
O `.mcp.json` versionado **não** define o servidor Supabase (para não exigir token no ambiente, que os comandos do terminal herdariam). Cada pessoa o adiciona no escopo de usuário com um token pessoal próprio (`claude mcp add-json --scope user supabase ...`, comando `cmd /c npx -y @supabase/mcp-server-supabase@<versão fixa> --project-ref nrwljcvhwbezmoummxbl`, token em `env.SUPABASE_ACCESS_TOKEN`; acrescente `--read-only` para um modo só de leitura). Confirme com `claude mcp list`; não use `claude mcp get supabase` em tela compartilhada (pode mostrar o token).
Armadilhas vistas em 09/10/2026: (1) o MCP só relê a configuração ao iniciar a sessão do Claude Code; depois de trocar o token, abra uma sessão nova. (2) "Connected" no `claude mcp list` não valida o token: teste com `select 1`. (3) A variável `SUPABASE_ACCESS_TOKEN` herdada pelo terminal pode ser a antiga; confira o status (200 × 401) contra `https://api.supabase.com/v1/projects` sem exibir o valor. (4) No Git Bash, defina `MSYS_NO_PATHCONV=1` ao rodar `claude mcp add ... cmd /c ...`, senão `/c` vira `C:/` e o servidor não sobe. (5) Se o repo do PWA definir `supabase` no `.mcp.json` do projeto, o `claude mcp list` acusa "Conflicting scopes" e pode usar outra definição.

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
