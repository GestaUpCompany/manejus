# Plano de Implementação — Farm Plan

Spec aprovada (2026-09-30), ainda não implementada. Fonte do desenho: protótipo `FarmPlan_RioJuruena_6.html` (single-file, gerado na planilha "Farm Plan - Faz. Rio Juruena - GestaUp 2026, v. 22.10.2025"). O protótipo sincroniza via `window.claude.use('db')` (banco de artefatos, estilo Firestore) e precisa ser reescrito sobre Supabase.

## O que o produto é

Sistema de gestão de execução e gente por fazenda, substituindo todo o módulo atual de atividades/rotinas/monitoramento. Modelo do protótipo:

- **Atividades** (`acts`): nome, coordenador, executor (pessoa ou equipe), setor, urgência 1-3, tipo (Rotina/Estratégica/Gestão/Estruturação/Projeto), dias da semana, mapa de 53 semanas com status (Planejado/Concluído/Em andamento/Atrasado/Pausado), campos 5M (Metodologia, Máquinas, Materiais, Meta), observação por semana, rollover automático (não baixado vira Atrasado e carrega para a semana seguinte).
- **Pessoas** (`people`): nome curto, nome completo, cargo, setor, superior (organograma), contrato de resultados = tarefas (`t`) + comportamentos (`c`, de catálogo de ~29 critérios), cada item avaliado semanalmente com nota 0-10 ou NSA.
- **Extras** (`extras`): lançamentos "fora do plano" por dia (substitui a aba Plano_Diário).
- **Config** (`config`): fazenda, gestor, setores com dono, equipes do app, indicadores mensais, recado da semana.

Telas do protótipo: Painel, Plano anual (grade 53 semanas com pincel de status), Mês, Semana (por pessoa/por setor/lista 5M), Hoje (baixa diária + imprevistos), Equipe (lista + organograma + ficha com escore), Avaliação semanal, Indicadores (12 KPIs mensais com meta e farol; 2 auto-calculados), Relatórios, Cadastros, Aplicativo (simulação do app do colaborador). PDFs semanal/mensal para WhatsApp via jsPDF+autoTable.

## Decisões de arquitetura (aprovadas)

1. **Terceiro app**: `apps/farmplan` no monorepo existente (pnpm workspace + Vercel com Root Directory próprio). Não é "fazer monorepo de novo"; a infra já existe. Domínio diferente do manejus (gestão de pessoas/execução vs. operação zootécnica), usuário primário diferente (gestor/líder vs. controller), shell e identidade próprios.
2. **Baixa de campo fica no PWA** (`Caderneta-Digital-Gesta-Up`), que já é offline-first com IndexedDB. Não duplicar infra offline. O FarmPlan web é a ferramenta do gestor; o PWA consome o schema novo e escreve baixas via `syncService` existente.
3. **Migração total do schema atual** de atividades para o modelo novo, com backup antes (convenção `backup.sql` + tabelas `backup_*`).
4. **Pessoas: extensão de `funcionarios`**, não cadastro paralelo. Ver detalhe abaixo.

## Pessoas: decisão detalhada

`funcionarios` é tabela compartilhada consumida por manejus (atividades, `equipe_nomes` em movimentações, cantina, templates) e PWA. Não se "move" tabela entre apps no mesmo banco; o que muda é onde mora a tela de CRUD e quem é dono dos campos novos.

Extensões necessárias sobre o schema atual:

- `funcionarios.apelido` (nome curto de exibição, ex.: "Saylon") e `funcionarios.superior_id` (self-FK, organograma).
- Contrato de resultados: tabela nova de itens (`tarefa`/`comportamento`) por funcionário + tabela de avaliações semanais por item.
- Catálogo de critérios de comportamento (por fazenda, seed com os ~29 do protótipo).
- Equipes N:N: o protótipo precisa N:N. **A tabela legada `equipes` não existe no banco remoto** (migrations `criar_equipes` divergentes; "equipe" hoje é texto livre em `registros_*.equipe_nomes`). FarmPlan cria par próprio `fp_equipes` + `fp_equipe_membros`, sem depender do legado.
- `setores.responsavel_id` → `funcionarios(id)` ("dono do setor").
- **Identidade no PWA já resolvida**: o RBAC por PIN em `funcionarios` (`acessa_app`, `pin_hash`, `cadernetas_permitidas`) já identifica a pessoa no app; `AtividadesPage` já chama `get_atividades_funcionario(p_fazenda_id, p_funcionario_id)`. Não há gap de vínculo pessoa↔login; baixas novas gravam `feita_por` = `funcionario_id` logado. `peoes` é login legado por fazenda, não precisa de `funcionario_id`.

UI: FarmPlan ganha a ficha rica de pessoa (contrato, organograma, escore histórico) e vira o lugar canônico de gestão de gente. O cadastro básico do manejus coexiste durante a transição (mesma tabela) e é aposentado no cutover.

## Schema proposto (public, prefixo `fp_`)

Manter convenção do banco: schema `public`, RLS com `user_has_fazenda_access` / `get_peao_fazenda_id`, `deleted_at` soft-delete, trigger `update_updated_at_column`, grants a `authenticated`.

- `fp_planos` (id, fazenda_id, ano, semana1_inicio date, ativo) — um plano anual por fazenda/ano. Âncora do protótipo: semana 1 = seg 29/12/2025.
- `fp_atividades` (id, plano_id, fazenda_id, nome, local, coordenador_id→funcionarios, executor_funcionario_id NULL, executor_equipe_id NULL, setor_id, tipo smallint, urgencia smallint, dias_semana smallint[] (0-6), metodologia, maquinas, materiais, meta, ativo, deleted_at).
- `fp_atividade_semanas` (id, atividade_id, semana smallint 1-53, status smallint, observacao, carry_from smallint NULL, UNIQUE(atividade_id, semana)).
- `fp_atividade_baixas` (id, atividade_id, semana, dia smallint 0-6, feita bool, observacao, foto_url, feita_por uuid NULL, feita_at, tempo_gasto_segundos int derivado, local_id text NULL para idempotência offline, UNIQUE(atividade_id, semana, dia)).
- `fp_baixa_sessoes` (id, baixa_id→fp_atividade_baixas, inicio_at, fim_at, duracao_segundos, trabalhada bool, motivo_pausa, imprevisto_categoria_id NULL, impacto_minutos int NULL) — absorve `atividade_sessoes` e `atividade_imprevistos` (imprevisto = sessão não trabalhada com categoria/impacto). Cronômetro **opcional**: baixa sem sessão sempre permitida; cobertura medida como indicador de qualidade; flag `fp_atividades.exige_sessao` default false para cliente que quiser enforcement pontual.
- `fp_imprevisto_categorias` (fazenda_id, nome, ativo) — migra `atividade_imprevisto_categorias` (mesmo padrão de seed por trigger em `fazendas` insert).
- `fp_atividade_templates` (espelha `fp_atividades` sem semanas + campos de recorrência `rep_de`, `rep_ate`, `rep_a_cada` + executor/equipe padrão) — **tabela dedicada decidida**: a biblioteca do protótipo já é template (auto-preenche defaults ao escolher nome), e recorrência não cabe em distinct-de-nomes. Aplicar materializa `fp_atividades` + `fp_atividade_semanas`. Migra `atividade_templates`.
- `fp_extras` (id, fazenda_id, semana, dia, nome, funcionario_id, setor_id, observacao, created_by).
- `fp_criterios` (id, fazenda_id NULL = global da metodologia / preenchido = customização local, nome, ordem, ativo) — **híbrido decidido**: seed global com os ~29 do protótipo, fazendas podem adicionar próprios.
- `fp_contrato_itens` (id, funcionario_id, tipo ('tarefa'|'comportamento'), descricao, ordem, ativo).
- `fp_avaliacoes` (id, contrato_item_id, semana, ano, nota numeric(3,1) NULL, nsa bool, avaliador_id, avaliado_at, UNIQUE(contrato_item_id, ano, semana)).
- `fp_indicadores` (id, fazenda_id, nome, unidade, direcao ('up'|'down'), meta_valor, atencao_valor, meta_label, casas_decimais, origem text, ordem, ativo) — instância por fazenda (metas são locais). `origem`: `'manual'`, `'escore'` (média das avaliações) ou `'atividades'` (% concluídas no mês), calculadas pelo próprio FarmPlan. Seed por fazenda com os indicadores de gente/execução do protótipo (escore, % atividades, faltas); **KPIs de rebanho/financeiro (GMD, lotação, custo, mortalidade, eficiência, processamento, manutenção) ficam fora do produto**, decisão do usuário 2026-09-30.
- `fp_indicador_valores` (id, indicador_id, ano, mes smallint, valor numeric, UNIQUE(indicador_id, ano, mes)).
- `fp_recados` (id, plano_id, semana, texto) — recado da semana com histórico.
- `fp_equipes` (fazenda_id, nome, ativo) + `fp_equipe_membros` (equipe_id, funcionario_id, fazenda_id, UNIQUE) — equipes próprias do FarmPlan, N:N. Sem migração de `funcionarios.equipe_id` (coluna não existe no remoto).

Regras derivadas:

- **Status da semana** recomputado por trigger ao inserir/atualizar `fp_atividade_baixas` (todos os dias planejados feitos → Concluído; algum feito → Em andamento). Precedente: triggers de `atividade_funcionarios`.
- **Rollover** semanal via pg_cron (seg 00:00 America/Cuiaba, precedente de fuso no HISTORICO) chamando RPC `fp_rollover()`: semanas passadas com status Planejado/Em andamento → Atrasado + marca `carry_from` na semana seguinte se vazia.
- Undo: manter padrão do protótipo (snapshot stack client-side, 30 níveis) — suficiente para MVP; auditoria de baixas fica nos campos `feita_por`/`feita_at`.

## Migração de dados (schema atual → novo)

Backup antes de qualquer passo: `supabase db dump` + `CREATE TABLE backup_* AS SELECT`.

| Origem | Destino | Observação |
|---|---|---|
| `atividades` | `fp_atividades` + `fp_atividade_semanas` | `data_inicio..data_fim` → semanas ocupadas; status pendente→1, concluído→2, em_andamento→3, atrasada→4, pausada→5 |
| `atividade_funcionarios` | executor + `fp_atividade_baixas` | modelo muda de status-por-pessoa para baixa-por-dia; `concluida` → baixas nos dias planejados do período; `tempo_gasto_segundos` só sobrevive se decidirmos manter campo na baixa |
| `atividade_sessoes` / `atividade_imprevistos` (+categorias) | `fp_baixa_sessoes` + `fp_imprevisto_categorias` | sessões e imprevistos preservados como filhos da baixa; imprevisto = sessão `trabalhada=false` + categoria + `impacto_minutos` |
| `atividade_templates` (+`atividade_template_funcionarios`) | `fp_atividade_templates` | tabela dedicada, decisão tomada |
| `rotinas`, `execucoes_rotina`, `execucoes_rotina_historico` | absorvido por recorrência (`fp_atividade_semanas`) + baixas | histórico de execuções migra para baixas/extras |
| — | `fp_equipes` / `fp_equipe_membros` | sem origem: `equipes`/`funcionarios.equipe_id` não existem no remoto; cadastro novo no FarmPlan |

## Fases

**Fase 0 — Spec e schema (este documento + migrations)**
Escrever migrations estruturais em `supabase/migrations/` do painel, `supabase db push`, commit. Backup antes da migração de dados. Seed de critérios e indicadores por fazenda via migração pontual (MCP).

**Fase 1 — `apps/farmplan`**
Vite + React + TS + TanStack Query (mesmo stack do manejus), `packages/supabase` para client/auth, fazenda-scoped. Portar as 11 telas como componentes. Realtime via `supabase.channel` postgres_changes (substitui `window.claude.use('db')`). PDFs com jsPDF+autoTable (já usado no manejus) ou serverless `api/pdf/` se fizer sentido compartilhar.

**Fase 2 — PWA**
`peoes.funcionario_id` + tela de vínculo no admin. `AtividadesPage`/`ProgramacaoHojePage` passam a ler `fp_atividade_semanas`/`fp_atividade_baixas` filtrando por funcionário ∪ equipes. Baixas offline via fila do `syncService` com `local_id` idempotente. Foto → storage bucket dedicado.

**Fase 3 — Cutover**
Remover do manejus: `Atividades`, `MonitoramentoAtividades`, `Rotinas`, `AuditoriaRotinas`, `RelatorioAtividades`, `RelatorioAtividadesPublico` + services (`atividadesService`, `rotinasService`, `registrosAtividadesService`, `auditoriaRotinasService`) + itens de menu. Janela de validação com dados migrados; depois renomear tabelas antigas para `legacy_*` ou dropar (backup retido).

## Decisões tomadas (2026-09-30, segunda rodada)

- **Critérios**: catálogo híbrido em `fp_criterios` — `fazenda_id NULL` para os ~29 globais da metodologia, linhas com `fazenda_id` para customizações locais.
- **Indicadores**: instância por fazenda (meta é sempre local), seed dos 12; `origem` nomeia a fonte de cálculo (manual/auto por RPC). `FarmMetrics` descartado como overlap (é métrica SaaS de super-admin). Overlap real é com dados operacionais do banco; cada indicador auto vira RPC mensal.
- **Cronômetro**: mantido no schema (`fp_baixa_sessoes`), **opcional** — não obrigatório. Baixa sem sessão sempre permitida; cobertura medida como indicador; `exige_sessao` por atividade para enforcement pontual. Justificativa: obrigatório quebra baixa retroativa do gestor e lançamento de extras, e produz timer abandonado.
- **Templates**: tabela dedicada `fp_atividade_templates` com defaults + recorrência.
- **RBAC**: web abre para `admin` + `controller` inicialmente; papel `gestor` novo só se surgir necessidade real. No PWA, `funcionarios.farmplan_papel` (`colaborador`/`lider`/`gestor`) faz o gating: colaborador vê próprias tarefas e perfil; líder/gestor habilita a aba "Equipe" do protótipo.
- **Quem avalia**: o **superior direto** (`funcionarios.superior_id`), não o dono do setor. O seed do protótipo mostra que as duas estruturas divergem (Saylon é dono do setor Gado mas os líderes de gado respondem a Odirlei; Pedro Lopes é Operacional/Agnaldo mas responde a Odirlei). Gestor/admin tem override. Quem não tem superior não entra na fila de avaliação (ou é avaliado pela diretoria). `fp_avaliacoes.avaliador_id` validado contra `superior_id` ou papel gestor/admin.
- **Escore visível ao colaborador**: config por fazenda (`fp_escore_visivel_colaborador bool default true`).
- **Indicadores**: FarmPlan só carrega indicadores de gente e execução (escore, % atividades, faltas + os que a fazenda criar). KPIs de rebanho/financeiro saíram do produto — decisão do usuário: não ler dados operacionais de lotes/registros/Vision para esse painel.
