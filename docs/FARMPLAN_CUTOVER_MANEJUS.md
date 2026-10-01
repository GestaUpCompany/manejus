# Cutover Manejus → Farm Plan (módulo de atividades)

Mapa do que sai, muda ou permanece no Manejus quando o Farm Plan assumir o
planejamento e a execução de atividades. Escrito em 2026-10-02 a partir do
inventário do código na branch `feat/farmplan-fase0`.

Premissa já aprovada: o Farm Plan substitui **completamente** o módulo de
planejamento de atividades, monitoramento e baixas do Manejus. O Manejus fica
com gestão operacional/zootécnica; o campo continua no PWA existente, que passa
a ler e escrever nas tabelas `fp_*`.

A ordem de retirada é a última seção: nada sai do ar antes do PWA integrado,
dos dados migrados e da validação operacional com a fazenda.

## 1. Sai do Manejus (painel web)

### Rotas e páginas

| Arquivo | Rota | O que é |
|---|---|---|
| `apps/manejus/src/pages/controller/Atividades.tsx` (~1690 linhas) | `/controller/atividades` | Cadastro/planejamento legado de atividades: prioridades, templates, executores, locais (pasto/curral/infra/máquina), gate de expediente |
| `apps/manejus/src/pages/controller/MonitoramentoAtividades.tsx` (~1365 linhas) | `/controller/monitoramento-atividades` | Monitoramento de execução (baixas por atividade/funcionário, imprevistos) |

Remoções que acompanham as páginas:

- `apps/manejus/src/App.tsx` — as duas `<Route>` e os imports lazy.
- `apps/manejus/src/utils/routePrefetch.ts` — entradas `/controller/atividades` e `/controller/monitoramento-atividades`.
- `apps/manejus/src/components/layout/ControllerLayout.tsx` — itens de menu "Atividades" e "Monitoramento" (linhas ~183-184).

### Serviços, componentes e relatório

| Arquivo | Destino |
|---|---|
| `apps/manejus/src/services/atividadesService.ts` (~768 linhas) | Remover inteiro — é o CRUD das tabelas legadas |
| `apps/manejus/src/components/atividades/AtividadeCard.tsx` | Remover |
| `apps/manejus/src/pages/public/RelatorioAtividadesPublico.tsx` | Remover (lê `atividades` + `atividade_imprevistos`) |
| `apps/manejus/src/utils/relatorioAtividadesPDF.ts` (~539 linhas) | Remover — só o relatório público usa |
| `apps/manejus/src/pages/public/RelatorioPublico.tsx` | Retirar o ramo `tipo === 'atividades'` (linha ~252 e ~615) |
| `apps/manejus/src/pages/controller/Relatorios.tsx` | Retirar o item `tipo: 'atividades'` de `RELATORIOS_DISPONIVEIS` (linha ~47) |

Atenção com relatórios públicos já compartilhados: links de tipo `atividades`
ativos quebram quando a página pública sair. Antes do cutover, listar os links
ativos e avisar os gestores (ou manter uma resposta "relatório migrado para o
Farm Plan").

## 2. Muda no Manejus

- **Dashboard do controller** (`pages/controller/Dashboard.tsx`): a seção
  "Atividades Recentes" usa a RPC `get_recent_activities` (telemetria das
  cadernetas — Maternidade/Enfermaria/Rodeio), **não** o módulo de atividades.
  Permanece. Se surgir demanda de "atividades do plano" no dashboard, apontar
  para o Farm Plan, não recriar aqui.
- **Controle de expediente** (`getControleAcessoHabilitado` em
  `atividadesService.ts`, tabelas de expediente): hoje bloqueia baixas fora do
  horário. O Farm Plan ainda não tem equivalente — decidir se migra como
  configuração de plano ou se morre com o módulo.
- **Funcionários/setores/locais/máquinas**: continuam compartilhados. O Farm
  Plan já lê `funcionarios`, `setores`, `equipes`. As FKs das tabelas legadas
  para essas tabelas não bloqueiam nada, mas impedem remover colunas enquanto
  as tabelas legadas existirem.

## 3. Permanece (não confundir pelo nome)

- `apps/manejus/src/pages/admin/RelatorioAtividades.tsx` +
  `services/registrosAtividadesService.ts` + RPC `get_registros_atividades`:
  telemetria de uso das cadernetas (registros por dia/semana/mês por fazenda).
  Ferramenta de admin, nada a ver com o módulo de atividades. **Manter.**
- `pages/admin/FarmMetrics.tsx`, `SystemHealth.tsx`, `DetalhesFazenda.tsx`:
  métricas de uso da fazenda. "Atividade" ali significa "uso do sistema".
  **Manter.**

## 4. PWA (`Caderneta-Digital-Gesta-Up`, outro repo)

O módulo de atividades do peão sai inteiro e vira o módulo Farm Plan:

| Arquivo | Mudança |
|---|---|
| `frontend/src/pages/AtividadesPage.tsx` | Reescrita para ler `fp_atividade_semanas` + `fp_atividades` (executor = usuário logado ou equipes dele) e gravar em `fp_atividade_baixas` |
| `frontend/src/App.tsx` | Rota `/atividades` aponta para a página nova (mesma rota, mesma experiência) |
| `frontend/src/services/atividadesService.ts` | Trocar pelos services `fp_*` |
| `frontend/src/services/syncService.ts` | Filas de `atividades`, `atividade_funcionarios`, `atividade_sessoes`, `atividade_imprevistos` viram filas de `fp_atividade_baixas` (com `local_id`), `fp_baixa_sessoes`, `fp_extras` |
| `frontend/src/services/indexedDB.ts` | Store `atividades` substituída pelas stores `fp_*` |
| `frontend/src/pages/Home.tsx` | Entrada "Atividades" mantém o nome/ícone |
| `frontend/src/components/SyncErrorModal.tsx` | Atualizar labels das tabelas |
| `frontend/src/types/supabase.ts` | Tipos `fp_*` (regenerar) |

Funcionalidades do legado a preservar no módulo novo: check-off por dia,
detalhe com 5M, observação da execução, cronômetro (`atividade_sessoes` →
`fp_baixa_sessoes`, quando `exige_sessao`), foto da execução, imprevistos
(`atividade_imprevistos` → `fp_imprevisto_*` ou extras), lançamento fora do
plano (`fp_extras`).

## 5. Banco (schema legado)

Tabelas que saem de uso quando o cutover completar — **não dropar** na hora;
congelar escrita, migrar dados, manter como histórico/arquivo:

- `atividades`
- `atividade_funcionarios`
- `atividade_sessoes`
- `atividade_imprevistos`
- `atividade_imprevisto_categorias`
- `atividade_templates`
- `atividade_template_funcionarios`
- `prioridades_atividades`

Verificar junto: policies RLS dessas tabelas, views/RPCs que as referenciam
(`v_funcionarios_com_setores` é usada pelo service legado e pode ser
reaproveitada), realtime publication (as `fp_*` já estão publicadas; as
legadas podem sair da publicação), e triggers de auditoria.

A migração de dados legado → `fp_*` está detalhada na seção "Migração de
dados" do `PLANO_IMPLEMENTACAO_FARMPLAN.md`.

## 6. Ordem de retirada

1. PWA passa a ler/escrever `fp_*` (módulo novo convive com o legado por
   fazenda, conforme exista `fp_planos` ativo).
2. Backfill das atividades legadas para `fp_*` na fazenda (com backup antes).
3. Período de validação operacional (semanas correndo nos dois mundos, com o
   legado read-only para a fazenda migrada).
4. Esconder entradas de menu do Manejus por feature flag ou remoção direta.
5. Remover páginas/serviços legados do Manejus e do PWA.
6. Manter as tabelas legadas congeladas por um ciclo completo (ex.: até fechar
   o ano do plano) antes de qualquer drop — relatórios históricos e auditoria
   dependem delas.
