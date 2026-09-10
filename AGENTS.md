# AGENTS.md — Painel Web Gesta-Up (Cadernetas Gestão)

## Sistemas que compartilham o mesmo banco Supabase

- **Painel Web (este repo)**: `C:\Users\USER\Documents\GestaUp-Cadernetas-Gestao` — React + TanStack Query, online, gestão/admin. Repo responsável pelo schema do banco.
- **PWA (outro repo)**: `C:\Users\USER\Documents\Caderneta-Digital-Gesta-Up` — React PWA offline-first com sync IndexedDB

Projeto Supabase: `nrwljcvhwbezmoummxbl` ("Cadernetas Digitais")

## Fazenda de testes (regra obrigatória)

Qualquer teste que envolva dados de fazenda no Supabase (RPC, inserts, updates, recategorização, snapshots, seeds) deve usar **exclusivamente** a fazenda de id `d649c65e-16ab-4b77-a84b-df937aa41cc3` (Fazenda Gesta'Up, acesso `gestaup`).

Não executar mutações contra outras fazendas do banco, nem mesmo em transações com ROLLBACK, sem autorização explícita do usuário. Migrations de schema (CREATE TABLE, ALTER, índices, policies) valem para todo o banco por natureza e seguem normalmente.

Disparador: antes de rodar qualquer SQL que toque dados de `lote_categorias`, `planos_nutricionais`, `formulacoes`, `faixas_categorias`, `lote_categorias_transicoes`, ou qualquer tabela com `fazenda_id`, filtrar por `fazenda_id = 'd649c65e-16ab-4b77-a84b-df937aa41cc3'` ou usar lotes/formulações pertencentes a essa fazenda.

## Comandos

- Dev: `npm run dev`
- Build: `npm run build` (roda `tsc && vite build`)
- Typecheck: `npx tsc --noEmit`
- Lint: `npm run lint`
- Test: `npm run test` (vitest run)

## Fluxo de migrations estruturais (obrigatório)

Migrations estruturais (CREATE/ALTER TABLE, triggers, policies, índices, functions) devem seguir este fluxo rigorosamente:

1. Escrever o arquivo local em `supabase/migrations/<timestamp>_<nome>.sql`.
2. Rodar `supabase db push` para aplicar e registrar em `schema_migrations`.
3. Commitar e pushar o arquivo.

NÃO usar `apply_migration` do MCP para migrations estruturais. O MCP aplica o SQL no banco mas registra com timestamp de execução (não o do nome do arquivo), criando divergência entre local e remoto que quebra o `db push` em execuções futuras. Se `db push` falhar com "Remote migration versions not found in local migrations directory", criar placeholder local com o version remoto e rodar `supabase migration repair --status applied <version>` para os que já estão no banco.

Migrations pontuais (dados operacionais: resets, backfills, deletes por fazenda) continuam sendo aplicadas via MCP sem arquivo local, conforme regra existente.

Disparador: antes de criar ou aplicar qualquer migration estrutural, ler esta seção.

## Regras operacionais

- SEMPRE QUE FOR TESTAR ALGO NO PWA OU PAINEL WEB, USAR A FAZENDA DE TESTES (`d649c65e-16ab-4b77-a84b-df937aa41cc3`).
- Não use heredoc para escrever mensagens de commit. Escreva a mensagem em texto direto `-m "mensagem"`.
- Migrações ESTRUTURAIS (schema: CREATE/ALTER TABLE, triggers, policies, índices) devem ser escritas em arquivo local em `supabase/migrations/`, aplicadas via `supabase db push`, e depois commitadas e pushadas.
- Migrações PONTUAIS (dados operacionais: resets, backfills, deletes por fazenda) NÃO geram arquivo nem passam por `db push`. Aplique diretamente via MCP. Critérios: (1) não é idempotente; (2) falharia em banco novo vazio; (3) poluiria a linha do tempo do histórico de schema.

## Manutenção da documentação de continuidade (obrigatório)

Este arquivo é o ponto de entrada do contexto do projeto, não um diário de bordo. Para que ele continue enxuto e útil entre chats, siga estas regras ao trabalhar no projeto:

1. **Ao resolver um item do `docs/BACKLOG.md`**: mova a entrada correspondente para `docs/HISTORICO.md` com a data e o resumo do que foi feito. Não deixe o BACKLOG acumular coisas já resolvidas; um chat novo lê o BACKLOG para saber o que falta, e itens resolvidos lá são ruído que custa tokens e confunde.
2. **Ao aplicar uma mudança nova no sistema**: adicione ao `docs/HISTORICO.md`, não ao `AGENTS.md`. O `AGENTS.md` só muda se o contexto estável do sistema mudar (novo comando, novo fluxo, nova regra operacional). Mudanças pontuais de código, correções de bug, novas funcionalidades vão para o HISTORICO.

## Documentação de continuidade

O histórico de mudanças já aplicadas e o backlog de trabalho pendente estão separados para manter este arquivo enxuto. Consulte quando relevante:

- **`docs/HISTORICO.md`** — mudanças já aplicadas (RESOLVIDO/IMPLEMENTADO). Consulte quando a pergunta for sobre "por que isso foi feito assim" ou para entender o estado anterior de uma parte do código.
- **`docs/BACKLOG.md`** — débitos técnicos pendentes e specs aprovadas não implementadas (bebedouros fase 2, notificações WhatsApp, camada 2 do peso). Consulte no início de um chat novo para saber o que ainda falta fazer.

## Disparadores para consulta seletiva

Quando mencionar qualquer um destes tópicos, ler a seção correspondente em `docs/HISTORICO.md` ou `docs/BACKLOG.md`:

- "bebedouro obrigatório", "fase 2 bebedouros" → `docs/BACKLOG.md` (Pastos ↔ Bebedouros: fase 2)
- "WhatsApp", "notificações WhatsApp", "lembretes WhatsApp" → `docs/BACKLOG.md` (Notificações via WhatsApp)
- "camada 2 do peso", "mini-gráfico de peso", "gráfico de evolução do peso no card" → `docs/BACKLOG.md` (Proveniência do peso: camada 2)
- "cronologia do rebanho", "faixas de categorias", "faixas de peso", "cronologia evolutiva" → `docs/HISTORICO.md` (Cronologia evolutiva do rebanho)
- "destino do lote", "corte vs reprodução", "finalidade do lote" → `docs/HISTORICO.md` (Destino do lote)
- "recategorização", "backfill de formulações", `recategorizar_lote_categoria` → `docs/HISTORICO.md` (Plano de implementação da cronologia + recategorização)
- "testes de recategorização", "categorias encerradas", "filtro ativo=true" → `docs/HISTORICO.md` (Plano de testes e correções pós-teste)
- "movimentações", "histórico de lote", `lote_historico`, `registros_movimentacao` → `docs/HISTORICO.md` (Unificação de movimentações)
- "transferência entre fazendas", `registros_movimentacao` com `Transferencia` → `docs/HISTORICO.md` (Transferência entre fazendas: registro em registros_movimentacao)
- `consumo_ms_percent_pv`, "renomeação de meta_consumo" → `docs/HISTORICO.md` (Renomeação de meta_consumo_ms_percent_pv)
- "notificações de recategorização", `gerar_notificacoes_recategorizacao` → `docs/HISTORICO.md` (Notificações de recategorização próxima)
- "fuso horário", "timezone", "UTC", "Cuiabá", "data adiantada", "registro no dia errado" → `docs/HISTORICO.md` (Fuso horário Mato Grosso)
- `formulacao_insumos`, "tabela de junção de insumos", "propagação de custo de insumo" → `docs/HISTORICO.md` (Normalização de insumos em formulações)
- "peso inicial por categoria", "backfill de peso_inicio", "migration Z" → `docs/HISTORICO.md` (Migration Z: peso_inicio_kg_cab)
- "relatório público", "link compartilhável", "relatório interativo", "Power BI", "slicer" → `docs/HISTORICO.md` (Relatórios públicos interativos)
- "peso_vivo_kg incorreto", "recálculo de peso", "trigger de peso vivo" → `docs/HISTORICO.md` (Trigger de recálculo de peso_vivo_kg)
- "consumo desatualizado", "recálculo de consumo", "pct_pv inconsistente" → `docs/HISTORICO.md` (Triggers de recálculo de consumo)
- "mapa KML", "georreferenciamento", "pastos no mapa", "GPS no PWA", "MapLibre", "PostGIS" → `docs/HISTORICO.md` (Mapas KML)
- "dupla contagem", "cabeças duplicadas", "quant_atual inflado", `calculate_quant_atual` → `docs/HISTORICO.md` (Fix de dupla contagem)
- "renomear acesso_id", "peão não consegue logar após renomear fazenda", `peoes.fazenda_id` stale → `docs/HISTORICO.md` (Sincronização de peoes.fazenda_id)
- "camada 1 do peso", "proveniência do peso", "anotação de peso no card" → `docs/HISTORICO.md` (Proveniência do peso: camada 1)
