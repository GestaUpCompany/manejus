# Backlog — pendências e specs não implementadas

Este arquivo lista trabalho pendente no Painel Web. Um chat novo deve consultar este arquivo para saber o que ainda falta fazer e o que já foi decidido mas não implementado.

## Planos nutricionais: pendências depois do limite de meta, data da meta e meta dos indivíduos (2026-10-19)

- **Backfill da data da meta**: o trigger só recalcula quando meta, GMD ou peso atual mudam. Categorias com GMD e peso evoluindo se corrigem sozinhas na próxima passada do cron (o peso muda todo dia). Ficam velhas as sem GMD: em consulta de leitura (todas as fazendas) há 8 categorias ativas com `data_meta_projetada` preenchida e GMD nulo ou zero, que pela regra "sem GMD, sem data" deveriam estar nulas. Corrigir por fazenda exige autorização escopada.
- **Indivíduos e plano por lote**: o trigger legado `atualizar_estrategia_nutricional_individuo` só enxerga planos por categoria (modelo antigo). Para planos por lote ele zera `estrategia_nutricional_*` e `gmd_kg_cab_dia` do animal; só o `peso_meta_kg` foi religado (à meta da categoria). Decidir se o GMD e a estratégia do animal devem vir do plano do lote. Os animais que já existem só recebem a meta quando a meta da categoria muda; não houve backfill (nenhum dos 496 indivíduos tinha meta).
- **Limite de meta só nas tabelas de plano**: `lote_categorias.peso_vivo_meta_kg_cab` (formulário do lote) não tem o teto de 1.500 kg.
- **Dado anômalo**: existe categoria com `peso_vivo_atual_kg_cab` de 27.719 kg (provável erro de digitação, em alguma fazenda). O recálculo da data da meta e o limite de meta dependem do peso atual; vale um limite também no peso atual.
- **Histórico de Planos agrupa por plano, não por categoria**: em lote com mais de uma categoria o card mistura rótulo e números de categorias diferentes (visto em "Teste 3", boi gordo e garrote).
- **Dados antigos**: em consulta de leitura (todas as fazendas) havia 110 de 414 personalizações vigentes com `peso_inicio_kg_cab` nulo, e planos migrados antes de 2026-10-19 podem ter personalização ativa órfã, destino sem snapshot de entrada, meta de categoria divergente e flags de notificação herdadas do plano anterior. A correção de dados exige autorização escopada por fazenda; o código novo não cria mais esses casos.
- Exibir o histórico de edições (`planos_nutricionais_edicoes`) na interface não foi pedido; hoje só há leitura por SQL.

## Contagem do lote: corte por created_at mistura data do fato com snapshot (2026-10-16)

`calculate_quant_atual`/`calculate_quant_em` usam `quant_inicial` mais um corte `data >= lote_categorias.created_at`. Hoje a data retroativa é contornada ajustando `data` para now() (`data_informada` guarda a original). Desenho mais robusto: livro-razão, com saldo inicial como lançamento e contagem por lançamentos, sem corte temporal. Invasivo (afeta `calculate_quant_em`, recategorização com `quant_base`, relatórios por período); avaliar em separado. Também pendente: ação explícita de "corrigir entrada" no painel que reponderee o peso.

## Relatório de consumo: pendências do gráfico e da leitura de cocho (2026-10-14)

- **Gráfico da página pública (Recharts) ainda sobrepõe rótulos** no pé do gráfico (CMS, %PV e leitura de cocho); a correção anti-colisão e a faixa da leitura foram feitas só no PDF (`api/pdf/consumo.js`). Aplicar a mesma ideia em `criarLabelsAntiColisao` de `RelatorioConsumoPublico.tsx`.
- **Relatório mensal geral sem o selo e sem a separação por tipo**: `features/relatorioGeral/loaders.ts` monta os lotes de consumo sem `tipoManejo` (a separação pasto/confinamento só existe em `separarPorTipoManejo`, dentro de `RelatorioConsumoPublico.tsx`). Na seção de consumo do infográfico, um lote com pontos de pasto e de confinamento no período aparece num gráfico só e sem selo. Extrair `separarPorTipoManejo` para um módulo compartilhado e usá-lo no loader.
- Remover `gerarRelatorioConsumoPDF` e o resto do jsPDF de consumo em `relatorioConsumoPDF.ts` (sem uso desde o PDF por Puppeteer); manter só os tipos e `carregarLogoComoBase64`, usados por outros relatórios.
- Opcional: nota de rodapé no confinamento ("nota lida na manhã seguinte ao trato") para evitar a comparação ingênua com o pasto.
**Disparadores**: "leitura de cocho no relatório", "rótulos do gráfico de consumo", "PDF de consumo", `consumo.js`.

## Policies de escrita abertas (`true`) em ~30 tabelas: isolamento por fazenda incompleto (achado em 2026-10-08)

**Achado (auditoria de `pg_policies`)**: qualquer usuário logado, de qualquer fazenda, pode INSERT/UPDATE/DELETE (e SELECT) nas tabelas abaixo; a RLS está ligada, mas a policy é `true`. Isso quebra o isolamento entre fazendas e faz a RLS **não ser um limite suficiente** para o canal de teste (por isso a trava em código em `packages/shared/src/guardrail`).
- **Escrita por `anon` (sem login), prioridade máxima:** `rotinas` (SELECT/INSERT/UPDATE/DELETE), `plano_categoria_personalizacao` (policy `ALL` para `public`), `currais` (INSERT), `logs_sync_errors` (INSERT, provavelmente intencional para o PWA).
- **Escrita por qualquer `authenticated`:** `funcionarios`, `fornecedores` (INSERT), `pluviometros`, `locais`, `causas_morte`, `maquinas_veiculos`, `implementos`, `currais`, `tratamentos`, `medicamentos`, `mineral`, `proteinado`, `racao`, `bebedouros`, `checklist_regras`, `frigorificos`, `setores`, `racas` (INSERT), `funcionario_setores`, `linhas_confinamento`, `vagoes`, `registros_fabrica_confinamento` e `_insumos`, `pasto_bebedouros`, `lote_categorias_transicoes`, `faixas_categorias`.
- **Leitura aberta (decidir se é intencional):** `bebedouros`, `checklist_regras`, `grupos_fazenda` (`public`), `precos_categorias` (`anon`).
- **47 funções `SECURITY DEFINER` executáveis por usuário logado sem guarda aparente** (regex em `pg_get_functiondef`): muitas são leituras de relatório, mas revisar as de escrita, em especial `vision_atualizar_payload`, `vision_atualizar_relatorio`, `vision_excluir_relatorio`, `set_audit_context`, `autenticar_peao_app`, `guard_super_admin`.
**Como corrigir**: continuar a Fase B de isolamento (lotes 2a catálogos, 2b estrutura da fazenda, 2c pessoas, 3 fábrica/históricos, 4 varredura final) no padrão `is_admin_user() OR caller_has_fazenda_access(fazenda_id)`, `TO authenticated`, `REVOKE ALL FROM anon`. Atenção ao PWA: o peão lê/escreve várias dessas tabelas por `auth.uid()`; policy restritiva demais gera selects vazios em campo sem erro (conferir `syncService.ts` e o papel `peao` antes de cada lote).
**Disparadores**: "policy true", "isolamento por fazenda", "RLS aberta", "Fase B", `rotinas`, `plano_categoria_personalizacao`.

## IATF: o que ficou faltando depois da primeira entrega (2026-10-20)

A primeira entrega (protocolos, lotes no painel e no PWA, tarefas, IA, alertas, relatório de taxa de prenhez e diagnóstico em grupo por lote de protocolo) está pronta e **liberada só para a fazenda de testes** `d649c65e-16ab-4b77-a84b-df937aa41cc3` (painel: `cadernetaVisivelNaFazenda('protocolo-iatf', ...)` na página de Protocolos e no seletor de origem do Diagnóstico em Grupo, mais o menu `menuControleIndividualVisivel`; PWA: caderneta, novo lote e as duas listas). Detalhe e testes em `docs/HISTORICO.md` (seção "Protocolo de IATF") e no HISTORICO do PWA. O que falta:

**Antes de liberar para outras fazendas (decisão do gestor)**
- **Teste em aparelho físico** com sinal fraco e instável (só foi testado com rede emulada offline no preview) e com o app staging publicado em `staging-repo`.
- **Gatilho de fazenda cruzada** não foi testado (exigiria dados de outra fazenda). Também não testado: as checagens de "passo ou medicamento de outra fazenda" em `protocolos_iatf_passos`.
- **RLS de escrita**: as tabelas `protocolos_iatf*`, `lotes_protocolo_iatf*` e `eventos_reprodutivos` deixam o peão escrever pela API (mesmo padrão de reprodução e sanidade). Avaliar restringir a escrita de protocolos e lotes a quem não é peão; o PWA só precisa das RPCs.
- **Liberar** exige tirar `protocolo-iatf` de `CADERNETAS_EM_TESTE` nos dois repos (e rever as rotas, que ainda abrem por URL direta no painel, embora as páginas se bloqueiem sozinhas).
- Alerta do `get_advisors`: `copiar_modelo_protocolo_iatf` é `SECURITY DEFINER` chamável por `authenticated` (confere o acesso por dentro, mesmo padrão das outras RPCs). Trocar para `SECURITY INVOKER` zera o aviso, se quiserem.
- **Cron `notificar_protocolos_iatf` (07:30)** roda na hora do servidor (UTC no Supabase, ou seja, 03:30 em Cuiabá). Ajustar o horário se o gestor quiser o aviso mais tarde.

**Funcionalidades fora da primeira entrega**
- **Lote de protocolo**: não dá para editar (D0, protocolo, nome) nem excluir pelo painel (só cancelar), nem acrescentar fêmeas depois de criado. O PWA cria o lote sem estação de monta e o painel também não oferece a estação. Corrigir uma IA lançada errada exige excluir os eventos na ficha de cada fêmea e registrar de novo (a RPC não duplica a IA da fêmea que já tem uma ativa no lote).
- **PWA**: o lote criado no campo só aparece na caderneta de marcar passos depois de sincronizar (precisa de internet duas vezes: enviar e depois baixar). O diagnóstico em grupo por lote de protocolo existe só no painel; a caderneta de Reprodução do PWA não tem essa origem. A tela de marcar passo mostra "Fêmeas no lote" também em passos que não são a IA (cosmético).
- **Relatório de taxa de prenhez**: sem filtro por período ou estação, sem PDF, e o inseminador e o touro são texto livre (grafias diferentes viram grupos diferentes).
- **Alertas**: só notificação no painel; sem push nem WhatsApp. Não há alerta de "fêmea sem diagnóstico depois da IA" ligado ao lote de protocolo (existe o de reprodução, geral).
- **Cache offline do PWA**: o status reprodutivo, as estações e as carências passaram a persistir logo ao buscar, mas muitas outras consultas "lazy" de `cadastroCache.ts` guardam só em memória e podem perder o dado ao recarregar offline (auditar as demais).
- **Qualidade**: o lint do painel falha por um warning antigo de `react-hooks/exhaustive-deps` em `ControllerLayout.tsx` (já existia). A imagem da caderneta é a definitiva, mas o traço é mais "desenho" que o das outras.
- **RFID (C4)**: PENDENTE, sem desenho; depende de escolher o bastão e a balança (Bluetooth ou serial).

**Disparadores**: "IATF", "protocolo de IATF", "lote de protocolo", "taxa de prenhez por protocolo", "liberar IATF".

## Sanidade dos indivíduos: o que falta (painel implementado em 2026-10-16)

**Feito no painel (16/10/2026, ver `docs/HISTORICO.md`)**: aplicações por animal e por lote, carência no catálogo, histórico unificado, aba Sanidade na ficha, página Manejo Sanitário (pendências), funções de carência, aviso `CARENCIA_ATIVA` na pesagem de OS de venda e alertas semanais. **Falta**: caderneta de sanidade no PWA, baixa de estoque de medicamento, custo por animal e indicação de carência nas listas de Lotes e Indivíduos.

**Dependência (resolvida, conferida em 19/10/2026)**: o PWA já envia `individuo_id` na Enfermaria (commit `0af960f`, 09/10, já em master e no staging-repo) e a Morte usa o vínculo desde `b03772f`. No banco, 3 de 15 registros de enfermaria têm `individuo_id` e nenhum registro de outubro com identificação ficou sem vínculo.

**Disparadores**: "sanidade", "vacina", "carência", "aplicação sanitária", `aplicacoes_sanitarias`, `CARENCIA_ATIVA`.

## Almoxarifado: débitos da auditoria de 2026-10-07

- **Pendência por nome digitado**: `quem_pegou` é texto livre; troca de nome ou grafia gera pendência órfã. Ideal: guardar `funcionario_id` no registro e agrupar por ele.
- **Ordem do recálculo de estoque**: `recalcular_estoque_almoxarifado` ordena por `created_at` (hora do sync). Um `ajuste` (define o saldo) intercalado com retirada sincronizada depois muda o resultado conforme a ordem de chegada. Sem ajustes no banco hoje; antes de usar ajustes em produção, ordenar por `data` e desempatar por `created_at`.
- **Itens legados sem `itemId`** (21 de 28 itens na fazenda de testes): nunca entram na lista de pendências; VOLTA antigo vencido fica invisível. Opcional: tela de reconciliação manual.
- **Filtro "Data fim" não inclusivo** (`registro.data <= dataFim`) ainda existe em `EntradaCombustivel`, `EntradaCantina`, `FabricaConfinamento`, `ManutencaoMaquinas` e `Problemas`; corrigir com `toFarmDateOnly` como em `Almoxarifado`.
- **Backfill de `setor`** nas fazendas fora da de testes (85 registros no total) depende de autorização explícita.
- **ESLint sem configuração** no monorepo (`pnpm lint` falha antes de analisar qualquer arquivo).

## Drop das colunas legadas de bezerros (auditoria completa, não executado)

`lotes.qtd_bezerros`, `lotes.quantidade_bezerros` e `lote_categorias.qtd_bezerros` são colunas mortas: o input que as alimentava não existe mais e toda leitura de app foi aposentada (23/09/2026, ver `docs/HISTORICO.md` — "Campo legado aposentado"). A contagem real de bezerros é a soma de `quant_atual` das categorias ao pé. `registros_suplementacao.qtd_bezerros` é coluna diferente, viva (operando do denominador `n_cabecas - qtd_bezerros`) e NÃO entra no drop.

**NÃO dropar sem reescrever funções antes** — estas três escrevem as colunas em caminhos de produção e quebrariam na hora:

- `fn_ensure_categoria_bezerro_ao_pe`: `INSERT INTO lote_categorias` inclui `qtd_bezerros` na lista de colunas (toda maternidade falharia).
- `aprovar_solicitacao_novo_lote`: `INSERT INTO lotes` com `qtd_bezerros` + `quantidade_bezerros`; `INSERT INTO lote_categorias` com `qtd_bezerros` (lê `v_cat_item->>'qtd_bezerros'` do JSON da solicitação).
- `transferir_lote_entre_fazendas`: `INSERT INTO lotes` com `qtd_bezerros`/`quantidade_bezerros` e `INSERT INTO lote_categorias` com `qtd_bezerros`.

**Migration única e atômica** (mesmo `db push`, sem janela — `fn_ensure` dispara em cada maternidade):

1. `CREATE OR REPLACE` das 3 funções removendo as colunas dos INSERTs.
2. `ALTER TABLE lote_categorias DROP COLUMN qtd_bezerros;`
3. `ALTER TABLE lotes DROP COLUMN qtd_bezerros, DROP COLUMN quantidade_bezerros;`

**Verificado como não-bloqueante** (auditoria 23/09/2026): nenhuma view, policy RLS, índice ou trigger referencia as colunas; apps leem via `select('*')`; snapshots JSON de solicitações carregam a chave mas não dependem da coluna; tabelas `backup_*` são independentes; edge functions (`chat-fazenda`, `cotacao-dolar`, `impersonate-user`) e `backend/` do PWA não tocam o campo.

**Acompanhamento de código (pode ir junto ou depois):**

- PWA: `mcp-server/index.js` (`criar_lote` insere `lotes.qtd_bezerros` — remover o arg), regenerar `types/supabase.ts`, remover `qtd_bezerlos`/`quantidade_bezerros` de `types/relatorioLote.ts`, atualizar `mcp-server/schema.sql`.
- Painel: remover os campos opcionais `qtd_bezerros?: number | null` das interfaces de `Lotes.tsx` (linhas ~62/86), `LoteCard.tsx` e `RevisarNovoLoteModal.tsx`.

Disparador: quando mencionar "dropar qtd_bezerros", "colunas legadas de bezerro", `quantidade_bezerros`, ou limpeza de schema de bezerros ao pé, ler esta seção.

## Vínculo registro ↔ lote_categoria por FK (débito técnico)

Hoje `registros_movimentacao.categoria` e `registros_morte.categoria` são snapshots de texto casados por nome em `calculate_quant_atual` e nas triggers `update_quant_atual_{movimentacao,morte,maternidade}`. Isso quebra quando `lote_categorias.categoria` é renomeada. A correção vigente (2026-09-21, ver `docs/HISTORICO.md`) congela o saldo em `lote_categorias.quant_base` na recategorização in-place, sem tocar registros; resolve o caso comum mas deixa resíduos:

- Registro offline sincronizado depois do rename com `data < data_transicao`: a trigger não resolve nome antigo e cria linha duplicada com o nome velho no destino (total certo, categoria separada).
- Saída/morte registrada com nome antigo após rename: `v_cat_exists` falha, loga `CATEGORIA_NOT_IN_LOTE` e a origem não é debitada (cabeças fantasma).
- Renames sem transição (anteriores a 31/07/2026 ou UPDATE direto) não têm rastro e seguem quebrados.
- Denominadores de mortalidade em `encerrar_plano_*`, `criar_snapshot_entrada` e `migrar_plano_nutricional` leem `quant_inicial` puro; para linha recategorizada que era placeholder (`quant_inicial` NULL, `quant_base` preenchido), `mortalidade%` sai 0. Ajustar para `COALESCE(quant_base, quant_inicial)` quando conveniente.

Solução definitiva: colunas `lote_categoria_origem_id`/`lote_categoria_destino_id` em `registros_movimentacao` (e `lote_categoria_id` em `registros_morte`), resolvidas na inserção por uma função `resolve_lote_categoria(lote_id, nome, data)` que usa `lote_categorias_transicoes` para mapear "qual linha era dona desse nome naquele instante" (bound inferior `created_at` da linha, superior `data_transicao`). Contagem passa a ser por id; `categoria` no registro vira histórico puro. Requer backfill temporal dos registros existentes e índice em `lote_categorias_transicoes(lote_categoria_destino_id)`. Cuidado: só tratar como alias transições in-place (`origem_id = destino_id`); as 15 transições não-in-place existentes já semeiam `quant_inicial` na linha nova e aliasing nelas causaria dupla contagem.

**Critério de implementação (decidido em 2026-09-21):** só vale implementar a FK se os resíduos acima virarem dor recorrente na operação. Com `quant_base` em produção, a FK deixou de ser correção de bug e virou limpeza arquitetural; o custo real está no backfill temporal dos registros existentes e na regressão do núcleo de contagem, que pede migração em duas fases (popular FKs em shadow, validar cobertura, só depois virar a contagem para id). Monitorar `logs_sync_errors` por recorrência de `CATEGORIA_NOT_IN_LOTE` e linhas duplicadas com nome antigo; se aparecerem, atacar. Se forem raros, o débito pode ficar aqui indefinidamente.

Disparador: quando mencionar "categoria zerada após recategorização", "CATEGORIA_NOT_IN_LOTE recorrente", "dupla contagem por rename de categoria" ou quiser resolver o débito de vínculo registro↔categoria, ler esta seção.

## Pastos ↔ Bebedouros: fase 2 (obrigatoriedade do bebedouro no pasto)

A fase 1 (tabela de junção `pasto_bebedouros`) está concluída (ver `docs/HISTORICO.md`). A fase 2 torna o bebedouro obrigatório no pasto.

Pontos de atenção para a fase 2:

1. Adicionar validação no `handleSubmit` do `Pastos.tsx` exigindo `selectedBebedouros.length > 0`.
2. Decidir se a obrigatoriedade será só em app-level ou também com constraint no banco. Constraint em DB é mais robusto mas exige backfill dos 1141 pastos antes de ligar.
3. Regularizar o passivo: 1141 dos 1145 pastos ativos estão sem bebedouro associado. Antes de ligar a obrigatoriedade, gerar relatório/lista dos pastos sem bebedouro para o usuário ir associando aos poucos.
4. Visão reversa opcional: `BebedourosCadastro.tsx`/`BebedourosDetalhes.tsx` ainda não mostram a qual pasto cada bebedouro pertence; agora que a junction existe, fica trivial adicionar.

Disparador: quando o usuário mencionar "bebedouro obrigatório", "fase 2 bebedouros", "tornar bebedouro obrigatório no pasto", ou retomar o assunto pasto↔bebedouro, ler esta seção.

## Notificações via WhatsApp (análise completa, não implementado)

**Estado:** análise completa, branch `feature/notificacoes-whatsapp` criada, nada implementado. Retomar quando o usuário autorizar.

**Decisões pendentes (perguntar antes de implementar):**
1. Credenciais Twilio: placeholder em Supabase secrets (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER) para configurar depois, ou o usuário já tem conta ativa.
2. Templates Twilio: cadastrar template genérico `gestaup_alerta` com corpo `{{1}}` (carrega texto completo), ou enviar sem template (só funciona em sandbox ou janela de 24h).
3. Posicionamento no menu: transformar "Notificações" em grupo com subitens ("Notificações" + "WhatsApp"), ou criar item standalone "WhatsApp" separado.

**Provedor escolhido:** Twilio (decisão do usuário, custo não é problema). Justificativa: baixo risco de longo prazo, abstrai mudanças de policy do Meta, SDK maduro, fallback para SMS, multi-tenancy via subaccounts.

**Notificações fixas identificadas (baseadas em dados existentes no banco):**
- Pasto excedeu tempo de ocupação: `lote_pasto_historico.meta_intervalo_ocupacao_dias` vs `data_hora_entrada` (já tem notif in-app via cron `verificar_ocupacoes_acima_meta` às 6h).
- Módulo excedeu tempo de ocupação: `lote_modulo_historico` (mesma função acima).
- Bebedouro atrasado para limpeza: `bebedouros.meta_intervalo_limpeza` vs `data_ultima_limpeza` (sem notif in-app ainda). **Caso de uso principal: perda de 3 vacas por sede porque peões esqueceram de olhar bebedouro.**
- Plano nutricional vencendo: `planos_nutricionais.periodo_dias` vs `data_inicio` (sem notif in-app).
- Lote atingiu peso meta (próximo abate): `lote_categorias.peso_vivo_meta_kg_cab` vs `peso_vivo_atual_kg_cab` (sem notif in-app).
- Recategorização pendente: threshold em `notificacoes_config` (já tem notif in-app).

**Notificações personalizadas (lembretes criados pelo usuário):**
- Texto livre, recorrência (único/diário/semanal/mensal), dias da semana específicos.
- Exemplos: "Limpar bebedouros" a cada 3 dias ou seg/qua/sex; "Vacinar lote X" em data específica; "Reposição de mineral" semanal.

**Arquitetura proposta:**
- Tabela `whatsapp_contatos` (fazenda_id, nome, telefone, ativo): números de telefone de cada usuário/peão por fazenda.
- Tabela `whatsapp_lembretes` (fazenda_id, titulo, mensagem, recorrencia, dias_semana, data_hora, ativo, proximo_envio): lembretes personalizados.
- Tabela `whatsapp_inscricoes` (contato_id, tipo_alerta, ativo): qual contato recebe qual tipo de alerta.
- Tabela `whatsapp_fila` (fazenda_id, contato_id, mensagem, variaveis jsonb, status, agendado_para, tentativas, enviado_em): fila de envio.
- Edge Function `enviar-whatsapp` (Deno): lê fila pendente, chama Twilio API, atualiza status.
- pg_cron job: a cada 5 min, verifica condições de alerta fixo + lembretes com `proximo_envio <= now()`, insere na fila.
- Integração com notificações in-app existentes: quando `gerar_notificacao_ocupacao` cria notif in-app, verifica inscrições WhatsApp ativas e duplica para fila WhatsApp.

**Infraestrutura existente aproveitável:**
- pg_cron já ativo com 5 jobs (incluindo `verificar_ocupacoes_acima_meta` às 6h).
- Tabela `notificacoes` e função `gerar_notificacao_ocupacao` já funcionam para in-app.
- `usuarios.telefone` existe mas a maioria está NULL; nova tabela `whatsapp_contatos` permite cadastrar peões que não são usuários do sistema.
- Sem diretório `supabase/functions` ainda; criar para a Edge Function.

**Dados da fazenda de teste que validam a necessidade:**
- Bebedouro 1: 68 dias sem limpeza (meta: 3 dias). Bebedouro 4: 85 dias sem limpeza (meta: 3 dias).
- Pasto "Lavoura 1": 41 dias ocupado (meta: 3 dias).
- 3 usuários na fazenda, apenas 1 com telefone preenchido.

Disparador: quando o usuário mencionar "WhatsApp", "notificações WhatsApp", "lembretes WhatsApp", "alertas WhatsApp", ou retomar a implementação, ler esta seção antes de começar.

## Proveniência do peso: camada 2 (mini-gráfico de evolução, não implementada)

A camada 1 (anotação textual) está implementada (ver `docs/HISTORICO.md`). A camada 2 é um mini-gráfico de evolução do peso dentro do card da categoria, usando `recharts` (já instalado). Duas linhas sobrepostas:

- Linha azul tracejada (projeção do plano): reta `peso_inicio + gmd * dias` desde `data_inicio` do plano até hoje, representando o peso esperado sem Entradas.
- Linha verde (peso real): pontos reconstruídos a partir de `peso_entrada_kg_cab` + `data_pesagem`, evoluindo pela GMD entre Entradas, com salto vertical em cada Entrada (reponderação visível). Ponto final: `(hoje, peso_vivo_atual_kg_cab)`.
- Pontos laranja anotados: cada Entrada marcada com `ReferenceDot` e tooltip mostrando data, cabeças e peso informado.

Dados necessários: todas as Entradas históricas da categoria (não só a última), já disponíveis via query em `registros_movimentacao`. Sem nova migration.

Limitação honesta: a curva real entre Entradas é aproximação linear pela GMD. Se o GMD mudou no meio (novo plano nutricional), a curva terá quinas não capturadas. Capturar isso com precisão exige logar snapshots diários de peso, que é a Camada 3 (também não implementada, fora do escopo atual).

Esforço estimado: ~60 linhas (1 query adicional no carregamento do lote + 1 função utilitária que monta os pontos + 1 componente recharts inline no card).

Disparador: quando mencionar "camada 2 do peso", "mini-gráfico de peso", "gráfico de evolução do peso no card", "proveniência visual do peso", ou retomar a implementação visual da evolução de peso, ler esta seção.

## GMD efetivo derivado do plano vigente (refactor arquitetural, não implementado)

Hoje `lote_categorias.gmd` é um valor materializado escrito por cinco caminhos com precedências inconsistentes: `iniciar_plano_lote`, `encerrar_plano_lote`, `migrar_plano_lote`, trigger `sync_gmd_lote_categorias` e edição manual na tela de lote (Lotes.tsx ~2846, override legítimo com badge "GMD alterado"). Divergências concretas já observadas em produção: a escrita stale em `lotes.formulacao_id` (2026-08-28, ver `docs/HISTORICO.md` seção "lotes.formulacao_id divergente") repropagou GMD de formulação errada, e `iniciar_plano_lote` grava o GMD cheio sem o desconto de 50% de enfermaria que só a trigger aplica (Lote 147 Marcon ficou com 0.700 em vez de 0.350 até o backfill de 2026-09-23).

Arquitetura correta a implementar quando autorizado:

1. Separar override de derivação: `lote_categorias.gmd` vira `gmd_override` (ou nova coluna), escrito apenas pela edição manual. Default NULL.
2. Centralizar a derivação numa função única `gmd_efetivo_categoria(lote_categoria_id)`: `COALESCE(gmd_override, gmd do plano vigente via formulacao_categorias_gmd, com desconto de 0.5 quando lotes.destino = 'enfermaria')`, replicando a precedência dos planos (`gmd_planejado`/`peso_inicio_kg_cab` de plano e `plano_categoria_personalizacao` quando aplicável).
3. Migrar os consumidores para a função: cron `update_dados_lotes`, card da categoria no Lotes.tsx, exportação e exibição no PWA.
4. Eliminar as escritas derivadas em `gmd` das RPCs de plano e da trigger, que passam a ser desnecessárias.
5. ~~Complemento defensivo: trigger BEFORE UPDATE em `lotes` forçando `formulacao_id` = plano vigente quando existir.~~ **Implementado em 2026-09-23** (`trg_lotes_enforce_formulacao_vigente`, migration 20260923130000): escritas divergentes são revertidas ao vigente; sem plano vigente o valor é preservado. O desconto de enfermaria também já foi corrigido nas RPCs de plano na mesma migration (ver `docs/HISTORICO.md`).

Cuidados: manter comportamento de lotes sem plano (hoje evoluem pelo gmd gravado; sem override e sem plano o `gmd_efetivo` seria NULL e a categoria pararia de projetar, o que pode ser indesejado; decidir fallback). Backfill dos overrides manuais existentes antes de virar a chave.

Disparador: quando mencionar "gmd derivado", "gmd_override", "fonte única de GMD", "desconto de enfermaria no gmd", ou retomar a arquitetura de GMD efetivo, ler esta seção.

## Tela de visualização de versões do cronograma de tratos (não implementada)

Hoje a Configuração de Tratos mostra as versões ativas apenas como chips (`data_inicio → data_fim` + badge "vigente"). Não há como ver detalhes de uma versão sem carregá-la, versões inativas ficam invisíveis na UI, e versões futuras não são carregadas no formulário (a tela só carrega a vigente da data atual), o que já causou falha de save em teste (form vazio exigindo horários).

O que a tela/seção deve cobrir:

- Listar todas as versões do tipo selecionado, incluindo inativas, com `data_inicio → data_fim`, `quantidade_tratos`, e indicação de vigente.
- Expandir uma versão para ver seus percentuais e horários (`programacao_tratos_percentuais`) em modo read-only.
- Cruzamento opcional com `registros_oferta_trato.programacao_id`: quantos dias/tratos foram lançados sob cada versão (auditoria de "como foram os tratos de cada versão").
- Botão "editar esta versão" que carrega a versão selecionada no formulário com sua `data_inicio` (salvar com mesma data já atualiza em lugar, mas hoje o form não carrega versão não-vigente). Isso resolve a limitação de edição de versão futura.
- Considerar aviso quando uma edição in-place vai sobrescrever percentuais sem deixar rastro do conteúdo anterior (edição com mesma `data_inicio` faz delete+insert nos percentuais, sem auditoria).

Fonte de dados já existe: `programacao_tratos` (sem filtro `ativo`) + `programacao_tratos_percentuais` + join opcional em `registros_oferta_trato`. Sem migration necessária.

Disparador: quando mencionar "tela de versões", "histórico de versões do cronograma", "visualizar versões de tratos", ou editar versão futura/não-vigente, ler esta seção.

## Idade das categorias: pendências (2026-10-13)
- `transferir_lote_entre_fazendas` deve copiar `idade_data_ref` junto com `idade` (hoje a cópia reinicia a data-base).
- Validar `data_pesagem` absurda (ex.: `0001-01-01`, `0026-09-29`) na origem (painel/PWA) e no trigger `trg_lote_categorias_idade_ref`.
- Cron duplicado: jobs `update-peso-vivo-daily` (04:00 UTC) e `update-dados-lotes` (03:00 UTC) chamam `update_dados_lotes()`; manter só um.

## Indivíduos: excluir parto não desfaz mãe e cria (levantado em 16/10/2026)

- Todos os gatilhos de `registros_maternidade` são AFTER INSERT; ao excluir um parto (`deleted_at`) a mãe e a cria criadas por ele seguem Vivas. Caso real: Fazenda Marcon, 28 partos excluídos em 27/08 deixaram 56 indivíduos Vivos no Lote 123 (hoje marcados como localização incerta).
- Proposta: estorno no mesmo padrão da morte (`trg_registros_morte_baixa_individuo`), só para indivíduos criados pelo próprio parto e sem outro evento; e tratar o agregado do bezerro (`update_quant_atual_maternidade` já conta o nascimento).
- Decidir com o gestor o destino dos 56 órfãos da Marcon (excluir só no cadastro, sem evento agregado, exige autorização escopada) e o das 34 vacas da Chibiu cadastradas à mão (agregado de vaca nas maternidades com `quant_inicial` 5 e 2 e sem movimentação).
- Investigar os excessos de 1 a 2 bezerros na Chibata (LOTE 11) e no Olho D'Água (Lote 5).
- **Decisão do gestor em 16/10/2026: adiar tudo isto** (conserto do gatilho, limpeza dos 56 órfãos da Marcon, análise da Chibiu, Chibata e Olho D'Água) e seguir com o plano. Os 111 animais ficam marcados como localização incerta, sem efeito no agregado, até a decisão; reversão em `backup.individuos_incerteza_20261016`. Disparador: ao retomar maternidade, partos excluídos ou divergências de conciliação, ler esta seção.
- **Atualização de 19/10/2026:** os 56 órfãos da Marcon foram excluídos do cadastro (soft-delete, backup `backup.individuos_exclusao_marcon_20261019`); Chibiu, Chibata e Olho D'Água seguem como localização incerta. Faltam o conserto do gatilho (estorno do parto excluído), a decisão sobre as vacas da Chibiu e a causa dos excessos da Chibata e do Olho D'Água. Ver HISTORICO.
- **Atualização de 19/10/2026 (2):** o gatilho de estorno da cria de parto excluído foi aplicado (migration `20261019110000`); a mãe fica fora de propósito. Resta a decisão sobre as vacas da Chibiu e a causa dos excessos da Chibata e do Olho D'Água.

## Fase 4 no PWA e candidatas de mercado (levantado em 2026-10-16)

Detalhe, fontes e ordem em `docs/PLANO_INDIVIDUOS_FASE4_SANIDADE_REPRODUCAO.md` (seção 10). Resumo: **P1** Morte, **P2** Sanidade e **P3** Reprodução no PWA estão feitas (HISTORICO; só na fazenda de testes). **C1** calendário sanitário está feito no painel (seção Calendário em Manejo Sanitário, só na fazenda de testes). **C3** tratamento/vacina na sessão de curral está feito (colunas `tratamento_*` na sessão, aplicações geradas em `aplicar_manejo_curral`; só na fazenda de testes). **C2** protocolo de IATF: primeira entrega feita em 20/10/2026 (protocolos, lote, tarefas e IA no painel e no PWA, só na fazenda de testes; ver HISTORICO). Relatório de taxa de prenhez por protocolo/touro/sêmen/inseminador feito em 20/10 (aba no painel). Alertas diários dos passos atrasados e do dia feitos em 20/10 (cron 07:30). Diagnóstico em grupo ligado ao lote de protocolo e criação do lote pelo PWA feitos em 20/10. Faltam do C2: diagnóstico ligado ao lote e criar o lote pelo PWA. Falta ainda **C4** bastão RFID (PENDENTE: definir o equipamento). Calendário, o que ficou de fora: regra por idade do animal (brucelose em bezerra; hoje a categoria faz esse papel), aplicação individual encerrar a campanha do lote, cobertura parcial reabrir a pendência, o PWA mostrar a campanha pendente do lote na caderneta de Sanidade, liberar a seção para todas as fazendas (hoje `FAZENDA_DE_TESTES_ID` em `ManejoSanitario.tsx`). Outros pontos: lista dos registros de Sanidade e Reprodução no PWA já feita em 19/10/2026 (a edição não será criada: o PWA não edita registro salvo); RLS das tabelas de reprodução/sanidade deixa o peão escrever pela API; resumo por estação ignora partos posteriores à cobertura.

**Disparadores**: "calendário sanitário", "IATF", "protocolo de IATF", "caderneta de sanidade", "caderneta de reprodução", "RFID".
