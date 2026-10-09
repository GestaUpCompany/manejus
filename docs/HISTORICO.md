# Histórico de alterações (RESOLVIDO/IMPLEMENTADO)

## Bebedouros: foto principal do PWA no checklist não distorce o relatório (2026-10-09)

O PWA passou a gravar a foto principal do bebedouro em `registros_bebedouros.checklist.foto_bebedouro` (`{ valor: true, observacao: '', foto_url }`), inclusive em fazenda sem checklist ativo, onde o checklist antes era `null` (`registros_bebedouros` não tem coluna `foto_url`).

**Relatório** (`features/relatorioBebedouros/calculos.ts`, `calcularChecklist`): "com checklist" agora exige ao menos uma chave de `CHECKLIST_ITEMS`. Antes qualquer chave contava, e um registro só com a foto inflava "Registros com checklist" e diluía os percentuais do ranking e do KPI de negativos (mesmo cálculo no relatório geral e no relatório público). Teste novo em `calculos.test.ts`.

**Detalhes do registro** (`BebedourosDetalhes.tsx`): a foto principal tem bloco próprio "Foto do bebedouro". Ela saiu de "Fotos dos problemas", onde aparecia com a legenda crua `foto_bebedouro`.

## Editar e excluir saída de cantina, com estoque corrigido pelo trigger (2026-10-09)

Telas renomeadas: `RegistrosAlimentacao` virou `SaidaCantina` (lista, título "Caderneta de Saída da Cantina", card "Saída Cantina") e `RegistrosAlimentacaoDetalhes` virou `RegistrosSaidaCantinaDetalhes`. A rota continua `/controller/cadernetas/alimentacao`. A lista ainda mostra também os registros `modo='entrada'` (que têm tela própria em Entrada Cantina).

**Migration** `20261009120000_editar_excluir_saida_cantina` (rollback em `supabase/rollbacks/`): RPCs `editar_registro_saida_cantina(p_id, p_fazenda_id, p_campos)` e `excluir_registro_saida_cantina(p_id, p_fazenda_id)`. `SECURITY DEFINER`, chamador por `auth.uid()`, papel admin/controller, `anon` sem execução. Só aceitam `modo` cantina/marmita. A edição tem whitelist por modo (cantina: `data`, `observacao`, `itens_detalhe`; marmita: `data`, `observacao`, `fornecedor`, `quantidade_marmitas`, `preco_unitario`, `destinatario`), valida item da fazenda, quantidade > 0 e item repetido, e reconstrói `itens` a partir de `itens_detalhe`. Devolvem `saldos_negativos` e a tela mostra um aviso (saldo negativo é permitido).

**Estoque**: as RPCs não tocam em `movimentacoes_cantina`. O estorno e as novas baixas vêm do `trg_alimentacao_mov` existente (UPDATE de `itens_detalhe` ou `deleted_at`), e o saldo vem de `recalcular_estoque_cantina`. Registros antigos sem `itens_detalhe` nunca geraram baixa; editar com itens passa a gerar.

**Testado na fazenda de testes** (painel, usuário controller): lista vazia e quantidade 0 recusadas; incluir itens (Café 3→2, Ovos 5→3); editar quantidade (Ovos →1); trocar item com saldo negativo (Carne 2,5→-0,5, aviso exibido); excluir (tudo voltou a Café 3, Carne 2,5, Ovos 5); marmita (6 marmitas, R$ 177,00, sem movimentação) e restaurada para 5; entrada sem botões. O registro `19756ece-760b-4dec-a581-e809d79dd6af` (cantina de 04/09/2026) ficou **excluído por soft-delete** e a marmita `a366bd5c-3d42-41bf-a395-d0e1eeb31e67` voltou ao valor original.

**Risco conhecido**: um UPDATE pendente na fila offline do PWA (upsert por `local_id`) pode sobrescrever ou ressuscitar um registro editado ou excluído pelo painel.

## Reprodução dos indivíduos, Fase 4a: schema de eventos reprodutivos e status derivado (2026-10-08)

Plano em `docs/PLANO_INDIVIDUOS_FASE4_SANIDADE_REPRODUCAO.md` (sanidade ADIADA, ver `docs/BACKLOG.md`). Decisões aceitas: só 4 tipos de evento (Cobertura, Inseminação, Diagnóstico de gestação, Aborto), gestação fixa em 283 dias (`gestacao_dias_padrao()`), touro em texto livre como caminho principal (`touro_id` opcional; nenhuma fazenda tem touro cadastrado), diagnóstico sozinho basta para a previsão de parto.

**Migrations** (rollbacks em `supabase/rollbacks/`): `20261008160000` cria `estacoes_monta`, `eventos_reprodutivos` (CHECKs de coerência tipo/resultado/método/touro/sêmen), gatilho `trg_eventos_reprodutivos_validar` (fêmea ativa da mesma fazenda, data não futura, touro macho da fazenda, estação da fazenda, cobertura referenciada da mesma fêmea e anterior; soft-delete nunca falha), RLS por fazenda (`is_admin_user() OR caller_has_fazenda_access`), auditoria e a view `v_status_reprodutivo` (`security_invoker`); `20261008161000` fixa o `search_path` de `gestacao_dias_padrao()` (apontado pelo advisor); `20261008162000` troca a contagem de partos da view para **datas distintas**.

**Regras do status** (marco = último parto sem aborto ou último aborto; só conta o que vem depois do marco): Prenha (último diagnóstico Prenha e sem cobertura mais nova), Coberta (cobertura/IA sem diagnóstico definitivo mais novo; Inconclusivo com cobertura também), Vazia (último diagnóstico Vazia ou último marco foi aborto), Parida (último marco foi parto e nada depois), Sem registro. Previsão de parto = cobertura + 283, ou diagnóstico menos a idade da gestação. Intervalo entre partos e dias desde o parto vêm de `registros_maternidade.individuo_id_mae`.

**Defeito achado ao testar**: partos gemelares (duas crias no mesmo dia) contavam como dois partos e o intervalo da BR-042 dava 0; a `20261008162000` usa datas distintas (agora 18 dias, 06/10 menos 18/09).

**Testes** (fazenda de testes, transações com rollback, zero resíduo): 14 cenários de status (sem eventos, só cobertura, cobertura+prenha, prenha só com diagnóstico com e sem idade, vazia e nova cobertura, aborto depois da prenha, prenha e nova cobertura, inconclusivo com e sem cobertura, cobertura mais recente com touro cadastrado, evento excluído ignorado, macho e fêmea Doado fora da view); regra do marco com a BR-042 (19 partos): evento antes do último parto ignorado, depois vira Coberta com previsão correta; 16 validações de integridade; RLS (gestor vê e escreve só a própria fazenda, usuário de outra fazenda não vê/insere/edita/exclui, `anon` bloqueado); auditoria grava; `get_advisors` sem alerta novo (`search_path` mutável do banco foi de 51 para 50).

**Falha de processo registrada**: num teste de integridade inseri uma estação de monta de teste numa fazenda que não era a de testes (dentro de transação com rollback, sem efeito persistente, confirmado). A regra da fazenda de testes vale também para rollback; o teste de isolamento foi refeito só com dados da fazenda de testes, usando apenas a identidade de um usuário de outra fazenda.

**Falta da Fase 4a**: painel (aba Reprodução na ficha da fêmea, lançar evento, cadastro de estações de monta). 4b (diagnóstico em grupo, resumo por estação) e 4c (pendências, alertas, relatório) seguem no plano.

**Disparadores**: "reprodução", "cobertura", "inseminação", "diagnóstico de gestação", "estação de monta", `eventos_reprodutivos`, `v_status_reprodutivo`, "previsão de parto".

## Módulo Indivíduos: correções, página de detalhe, baixa e 5 migrations (2026-10-08)

Commits `40f501c`, `c3d66ea`, `5e500c5`, `d1be515`, `f34aaa0`, `41e646e`. Auditoria completa do módulo (`Individuos.tsx` + `IndividuoNovo.tsx`) e conexão com a Pesagem do PWA.

**Conexão com o PWA**: a `PesagemPage` não escreve em `individuos`. Ela grava `registros_pesagem` e o gatilho `trg_registros_pesagem_upsert_individuo` faz o upsert do indivíduo por chip (prioridade) ou brinco; em OS de saída só marca o status. O painel enxerga o resultado como indivíduos `automatico_incompleto`.

**Painel (sem schema)**: enums de status/categoria/origem centralizados em `utils/individualValidation.ts` (19 categorias do banco; "Vendido" não existe no CHECK e foi removido do select; Morto só pela Caderneta de Morte); filtros da lista recarregam na página 1 e descartam resposta antiga; contador mostra o total filtrado; data de nascimento da lista usava `new Date()` (UTC) e mostrava um dia antes, agora `formatDate`; validação de pesos aceita o texto pt-BR do `NumericInput` ("32,500"), que antes dava NaN e impedia salvar; `confirmLoteChange` usava closure velha.

**Página de detalhe** `IndividuoDetalhe.tsx` (`/controller/individuos/:id`; edição continua em `/novo?edit=`): abas Resumo, Pesagens (gráfico SVG + GMD entre pesagens, `utils/individuoPesagens.ts`), Movimentações, Genealogia (descendentes por `pai`/`mae`; a função `descendentes_individuo` citada nas migrations antigas NÃO existe no banco) e Maternidade; ações Editar, Dar baixa/alterar status (data, motivo e destino) e Excluir (soft-delete).

**Contador de cabeças do lote (`quant_atual`)**: a RPC `update_quant_atual_with_data` falhava sempre com 42P10 (ON CONFLICT sem o predicado do índice parcial `unique_lote_categoria_ativa`) e a tela ignorava o erro. Corrigi-la NÃO era a solução: ela calcula `quant_atual` como contagem de indivíduos cadastrados, enquanto o contador real vem das movimentações (`calculate_quant_atual`, via trigger `update_quant_atual_movimentacao`). O painel passou a gravar as movimentações na convenção do sistema (`utils/movimentacaoIndividuo.ts`): em Entrada, `lote_origem_id` é o lote que RECEBE e `lote_destino_id` fica nulo; em Saída, `lote_origem_id` é o lote de onde sai; o cliente nunca escreve `quant_atual`. Uma Entrada com peso nulo anularia o peso médio da categoria (o trigger pondera), por isso usa-se o peso médio atual quando o animal não tem peso. Limitação conhecida: o trigger só pondera peso na Entrada, então a Saída não reverte a média do lote de origem.

**Migrations** (rollbacks em `supabase/rollbacks/`): `20261008100000` colunas `data_saida`/`motivo_saida`/`destino_saida` em `individuos` (anuláveis); `20261008110000` `individuo_id` em `registros_morte` e `registros_enfermaria` + gatilho `trg_registros_morte_baixa_individuo` (marca Morto só quando a morte vem com `individuo_id`; estorna ao excluir a morte); `20261008120000` endurece `trg_registros_pesagem_upsert_individuo` (chip de um animal + brinco de outro abortava a pesagem inteira e o PWA reenviava para sempre; agora a pesagem é aceita, mantém a identificação do animal e registra `PESAGEM_ID_CONFLITO` em `logs_sync_errors`) e `ensure_mother_from_maternidade` (ignora excluídos); `20261008130000` remove `update_quant_atual_with_data` e `update_quant_atual`. `20261008150000` faz a OS de venda/abate/transferência preencher `data_saida` (da OS, ou da pesagem se a OS não tem), `motivo_saida` (Abate/Venda/Transferência) e `destino_saida` (comprador ou fazenda de destino) em `trg_registros_pesagem_upsert_individuo`, só quando o animal estava Vivo (não sobrescreve baixa anterior), e `estornar_baixa_os` limpa os três campos quando o status anterior era Vivo. Testado em transação com rollback (abate, transferência, animal já baixado, estorno) e de novo contra as funções instaladas. Defeito achado ao testar: `ORDER BY (condição) DESC` coloca NULL primeiro no Postgres, então um animal SEM chip passava na frente do animal com o chip da pesagem; trocado por `CASE`.

**Pendências deliberadas**: `id_provisorio_cria` NÃO ganhou índice único (já há 6 grupos duplicados em 287; um gatilho que rejeitasse faria o PWA falhar em campo); sem backfill de `individuo_id` nas 65 mortes e 15 registros de enfermaria (exige autorização por tocar outras fazendas); o PWA ainda não envia `individuo_id` em morte/enfermaria (`syncService`, outro repo). PWA (decidido deixar para depois): Enfermaria precisa só de `individuo_id: registro.individuoId || null` no `syncService.ts` (o formulário já carrega `individuoId` via `AnimalIdentifier`); Morte precisa trocar os campos de texto por `AnimalIdentifier`, levar `individuoId` ao payload e ao `syncService`.

**Operações de dados autorizadas (08/10/2026)**: (1) soft-delete de 22 indivíduos órfãos da Fazenda Sirio (`deleted_at` preenchido, reversível com `UPDATE individuos SET deleted_at = NULL WHERE id IN (...)`): 16 cópias de `id_provisorio_cria = '0521'` (1 só registro de maternidade para 17 indivíduos, todos Macho/Bezerro ao Pé de 24/06, `automatico_incompleto`), 3 de `123teste`, 1 de `1023` e 2 de `1101`; critério: sem maternidade, pesagem, movimentação, morte, enfermaria nem filhos vinculados. Sirio foi de 146 para 124 ativos; sobrou só o grupo legítimo `0949` (2 crias de registros distintos). `id_provisorio_cria` NÃO é único na prática (gêmeos dividem o mesmo; `Boto ` da Chibiu tem 3 registros no mesmo dia), então a unicidade não será imposta. (2) Vínculo de 3 registros de `registros_enfermaria` da fazenda de testes (`BR-042`/`CHIP-042`) ao indivíduo correspondente. Backfill nas demais fazendas descartado: dos 65 registros de morte só 1 casa por brinco/chip e esse é um falso positivo (sexo, categoria e lote divergem, e o animal foi cadastrado depois da morte); 22 não têm identificação e 42 não têm animal cadastrado. Enfermaria: 4 de 15 casam.

**Disparadores**: "dar baixa", `data_saida`, `motivo_saida`, `trg_registros_morte_baixa_individuo`, `PESAGEM_ID_CONFLITO`, "contador do lote errado depois de cadastrar indivíduo".

## Infográfico Mensal: paginação em fluxo, sem páginas vazias (2026-10-08)

Sem migration. O Infográfico Mensal (`api/pdf/geral.js` + `_shared/reportComposer.js`) deixou de usar limites fixos de linhas e "uma tabela por página". Novo motor `api/pdf/_shared/flowEngine.js`: o relatório declara blocos (KPIs, gráficos, tabelas divisíveis) dentro de `<section class="flow">`; no Chromium, antes de os gráficos serem desenhados, o motor mede a altura real de cada bloco e de cada linha de tabela, empacota em páginas (`packFlow`, testada em `flow.test.ts`) e divide tabelas só quando necessário (título e cabeçalho repetem, nunca página só com cabeçalho, introduções não ficam sozinhas no fim da página). A numeração "Página X de Y" passa a ser aplicada no DOM final (`__numberPages`). Migrados: Pastagens, Rodeio, Bebedouros e Boletim de Rebanho; Mortalidade, Abastecimento, Consumo e Estoque seguem como antes (o motor está disponível para eles). Seção sem registros no período **não gera mais página** no composer. Outras mudanças: kicker + selo do período na mesma linha, gráficos sem dados colapsam (ou viram nota de uma linha, ex.: checklists sem nenhuma resposta negativa), subtítulo de `chart-card` não é mais cortado, corrigido o bug da página só com cabeçalho no Rodeio (`chunkArray([])` devolvia `[[]]`). Verificação: `node scripts/paginacao-pdf.mjs <pasta> tudo [shots]` gera o PDF composto com volumes sintéticos (zero, um, poucos, médios, muitos, seções vazias, dia único) e falha se houver página estourando, tabela sem linhas ou numeração incoerente.

## Relatório de Bebedouros: cronograma com última e próxima limpeza, PDF legível em preto e branco (2026-10-08)

Sem migration. O relatório (página pública `RelatorioBebedourosPublico`, PDF `api/pdf/bebedouros.js` e Infográfico Mensal em `features/relatorioGeral/loaders.ts`) passou a mostrar, por bebedouro, a **data da última limpeza e da próxima** (`próxima = última + meta_intervalo_limpeza`), o prazo ("em X dias" / "vencida há X dias"), status, responsável da última limpeza e limpezas no período. Sem meta = "Sem meta"; sem limpeza registrada = "Pendente". A lógica de cálculo foi extraída para `features/relatorioBebedouros/calculos.ts` (testada, `calculos.test.ts`) e `paraPdf.ts`, eliminando a duplicação entre a página pública e o `loaders.ts`. No PDF a tabela de cronograma é a peça principal (paginada, vencidas primeiro) e o gráfico virou apoio. O PDF segue o layout padrão dos outros relatórios (clima, morte, consumo: `kpi()`, cabeçalhos verdes, zebra) e é colorido, mas legível se impresso em preto e branco: status sempre em texto + símbolo (● ▲ ■ ○ –), atrasos em negrito e legenda impressa. O gráfico de "dias desde a última limpeza" foi removido do PDF (a tabela de cronograma o substitui); só resta o gráfico de problemas do checklist. Ocorrências de checklist agora pareiam item e observação, sem clamp de 3 linhas (limite de 500 caracteres por campo) e há resumo de ocorrências por bebedouro e alerta de limpezas previstas nos próximos 7 dias. Campos novos do payload são opcionais (o servidor recalcula próxima/prazo se o cliente for antigo).

## Farm Plan incorporado ao monorepo e publicado na Vercel (2026-10-07)

Sem migration no banco do painel. O `apps/farmplan` antigo (restos não versionados) foi substituído por um snapshot do repo `weltoncabralgestaup/farmplan` (site estático, sem build). Banco próprio: Supabase `tcjrztbivvosrxjnjqom` ("FarmPlan", mesma organização do painel), cujo `comum.js` já apontava para ele; Edge Functions `criar-acesso` e `enviar-avisos` já estavam ativas. Criado o secret `SITE_URL=https://farmplan-fawn.vercel.app` (antes caía no fallback `farmplan-lime.vercel.app`). Projeto Vercel `farmplan` criado no mesmo time do painel, deploy via CLI. Documentação em `apps/farmplan/README.md`. Pendência: conferir os jobs `pg_cron` no projeto novo (ver README).

## Entrada Cantina no layout novo do PWA: tiles de tipo, itens com stepper e item novo por voz (2026-10-07)

Sem migration. A `EntradaCantinaPage` mantém o payload (`itens` por "Nome (un)", `itens_detalhe`, observação, criação de item novo pelo sync via RPC e atualização do saldo em cache) e muda a interface: tipo (classificação) em tiles, lista dos itens com controle de estoque com saldo ("tem X un") e −/quantidade/+ (inteiro para Unidade/Pacote, decimal para kg/g/L/mL), item novo com nome digitado ou por voz (sem foto), faixa "Chegando agora" com todos os tipos e "Recebido por {usuário} às HH:MM (automático)" (grava `quem_recebeu` com o usuário logado). Sem foto de nota, sem seção de conferência e sem abas (decisão do usuário). Texto compartilhável agrupado por classificação com "RECEBIDO POR".

## Carregamento Vagão no layout novo do PWA: pesagem por leitura acumulada da balança (2026-10-07)

Migration `20261007190000_fabrica_confinamento_foto_url.sql` (db push): coluna aditiva `registros_fabrica_confinamento.foto_url` (foto opcional da balança no fechamento, enviada pelo caminho genérico de fotos do `syncService`, também no update de trato em aberto). A `FabricaConfinamentoPage` mantém a lógica de dados (programação de tratos, currais da dieta, trato parcial, ENCERRAR TRATO, rascunho, offline) e muda a forma de digitar as quantidades: o operador informa o número acumulado que a balança marcou depois de cada insumo, na ordem da dieta; `kg_produzido` de cada insumo é a diferença entre leituras e o total produzido é a última leitura (payload do master e dos insumos inalterado). Mostra alvo da balança, falta/passou, diferença por insumo ao concluir (ok até 3%, informativo) e bloqueia leitura menor que a do insumo anterior. Rascunho agora guarda as leituras acumuladas (rascunhos antigos são descartados). Texto compartilhável ganhou a lista de insumos previsto x carregado.

## Leitura de Cocho no layout novo do PWA: um curral por vez, sugestão de trato e foto (2026-10-07)

Migration `20261007180000_leitura_cocho_foto_url.sql` (db push): coluna aditiva `registros_leitura_cocho.foto_url` (foto opcional do cocho, enviada pelo caminho genérico de fotos do `syncService`, bucket `fotos-registros`). A `LeituraCochoPage` mantém toda a lógica de dados (carga em lote, cache/offline, rascunho por data, bloqueio e anti-duplicidade, payload do registro) e muda a camada visual e o fluxo:

- Card do curral (`InfoCard`) com cabeças, peso médio, dias de cocho (dias desde `data_inicial` da ocupação do curral), categoria, trato ontem e kg por cabeça.
- "Nota do cocho" com escala rotulada (-1 Lambido, 0 Limpo, 1 Ideal, 2 Sobra, 3 Muita sobra; a escala é fixa), chips "Antes" dos 3 dias exatos anteriores à data, faixa com a sugestão do nutricionista (`tratoAnterior × (1 + percentual_ajuste/100)`, com "N-ésimo dia seguido" contando dias consecutivos iguais) e chip POP COCHO.
- Consumo do curral: ontem e média de 10 dias em destaque (matéria seca por peso vivo), 2d/3d/geral em linha secundária.
- Rodapé com progresso da linha e o botão "Salvar e ir para {próximo curral}"; o salvamento de todos os pendentes da linha continua disponível como link quando há 2+ rascunhos.
- Painel: a tela de detalhes da leitura mostra a foto do cocho.
- Texto compartilhável: "Nota: 0 - Limpo".

## Auditoria do estoque de almoxarifado: pendências sem estoque, segurança e painel (2026-10-07)

Migrations `20261007150000_almoxarifado_pendencias_sem_estoque.sql` e `20261007160000_almoxarifado_seguranca.sql` (db push).

- **Pendência de devolução fechava só para item com `controla_estoque=true`** (60 de 62 itens não controlam). `get_itens_pendentes_devolucao` agora abate itens não controlados pelas devoluções dos próprios `registros_almoxarifado` (vinculadas por `retiradaId/retiradaItemIndex` ou agregadas por pessoa+item), sem criar movimentação; itens controlados seguem pelas movimentações aprovadas. Validado: retirada de 5 Botinas (VOLTA) + devolução de 2 deixa 3 pendentes; devolução de 3 sobre 2 fecha.
- **Segurança**: a RPC passou a exigir `user_has_fazenda_access` (antes devolvia pendências de qualquer fazenda) e perdeu EXECUTE de PUBLIC/anon; `saldo_devolvivel_agregado`, `saldo_devolvivel_vinculo`, `reprocessar_devolucoes_almoxarifado` e `recalcular_estoque_almoxarifado` perderam EXECUTE de todos os papéis de API (só os triggers as chamam). `registros_almoxarifado`: a policy ALL do vínculo da fazenda virou INSERT/UPDATE (o sync do PWA faz upsert) e DELETE só admin/controller; `anon` perdeu todos os privilégios da tabela e TRUNCATE saiu de `authenticated`/`anon` nas 4 relações do almoxarifado.
- **View `itens_almoxarifado_pwa`** (`20261007170000_itens_almoxarifado_pwa_filtra_fazenda.sql`): rodava como dono sem filtro de fazenda e devolvia o catálogo/saldo de todas as fazendas a qualquer usuário autenticado (58 de 62 linhas eram de outras fazendas). Agora filtra por `user_has_fazenda_access(fazenda_id)`; o PWA continua carregando o catálogo da própria fazenda.
- Observação sobre o DELETE de `registros_almoxarifado`: hoje só existem os papéis `admin` (3) e `controller` (117) em `usuario_fazenda`, e as contas dos peões do PWA têm papel `controller`. A restrição bloqueia `anon` e vínculos inativos, mas não impede um peão logado de apagar; só um papel dedicado de peão fecharia isso.
- **Setor**: a coluna `registros_almoxarifado.setor` estava vazia (85/85). O PWA agora envia o setor único do registro (e, em registros antigos, o do primeiro item). Backfill pontual via MCP só na fazenda de testes; as demais fazendas aguardam autorização.
- **PWA** (`AlmoxarifadoPage`): tela no layout novo, stepper por item respeitando unidade (inteira para un/par/cx/pct/kit), carrinho entre classificações, VOLTA/FICA, setor único; respostas fora de ordem da lista de itens não sobrescrevem a aba atual; devolução atualiza o saldo local.
- **Painel**: filtro "Data fim" inclusivo e no fuso da fazenda (`Almoxarifado` e `EntradaAlmoxarifado`), paginação por 1000 linhas, itens por nome na lista, detalhe legível (nome, quantidade+unidade, VOLTA/FICA, tipo e setor), export com nome do item e coluna Tipo, histórico do estoque com sinal e quantidade aprovada, rótulos de origem `pwa_devolucao`/`pwa_entrada`, alerta para saldo negativo e tag "Sem controle de estoque", e nova tela **Pendências de devolução** (`/controller/pendencias-almoxarifado`, menu Estoque) com vencidos em destaque e export.
- Fora desta rodada (ver BACKLOG): pendência por nome digitado da pessoa, ordenação do recálculo por `created_at`, itens legados sem `itemId`, mesmo filtro de data fim em outras listas.

## Maternidade no layout novo do PWA: foto do brinco da mãe (2026-10-07)

Migration `20261007140000_maternidade_foto_brinco_mae.sql` (db push): coluna aditiva `registros_maternidade.foto_brinco_mae_url` (foto opcional do brinco da mãe, enviada só no 1º registro do parto; a foto da cria/mãe segue em `foto_url`). A tela foi reescrita no layout novo (parto em escolha única Normal/Precisou ajudar/Cesárea, "Quantos bezerros? 1/2", problemas em marcação múltipla, peso com stepper, cuidados em tiles, guacho SIM/NÃO, rascunho) **sem alterar o estado nem o payload** de `salvarRegistro('maternidade')`: validado contra baseline da UI antiga (normal+auxiliado; cesárea+gêmeos+natimorta+distócico; guacho com mãe adotiva nova) e nos casos aborto, natimorto, placenta presa, gêmeos vivos, gêmeos+aborto, gêmeos+guacho com adotiva existente e medicamento, mãe nova com fotos. Inputs de identificação (manejo/brinco/chip), escore com meias e ID provisório digitado foram mantidos. O texto compartilhável ganhou rótulos de escore/docilidade e a seção MEDICAMENTOS. O painel ainda não exibe a foto do brinco da mãe.

## Fix: cria viva em lote sem categoria "Bezerro/Bezerra ao Pé" falhava no sync (2026-10-07)

Migration `20261007130000_fix_fn_ensure_categoria_bezerro_ao_pe_valores.sql`: o INSERT em `lote_categorias` de `fn_ensure_categoria_bezerro_ao_pe` (trigger de `registros_maternidade`) tinha 51 colunas e só 49 valores (erro `42601 INSERT has more target columns than expressions`), então o registro de qualquer cria viva num lote que ainda não tinha a categoria ficava preso no aparelho com sync em erro. Descoberto no baseline de testes da Maternidade (bezerra fêmea em lote só com "bezerro ao pé"). Correção: dois `NULL` para `custo_total_entrada_reais_cab/lote`; resto da função igual. O registro preso foi reenviado e sincronizou. A versão anterior (migration 20260922100000, "cria morta não conta cabeça") reintroduziu o descompasso.

## Enfermaria no layout novo do PWA: foto do brinco, dose com stepper e áudio (2026-10-07)

Migration `20261007120000_enfermaria_foto_brinco.sql` (db push): coluna aditiva `registros_enfermaria.foto_brinco_url`. No PWA: foto opcional do brinco na identificação (bucket `fotos-registros`, `enfermaria/<id>/brinco`), dose aplicada com stepper e chips ml/mg (continua gravada como texto, ex.: "20 ml", "1,5 mg", então `medicamentos` e o texto compartilhado não mudam), bloco "Foto ou recado" com ditado por voz na observação do tratamento, rascunho e rodapé com pendência. Os inputs de ID manejo/brinco/chip foram mantidos. O painel ainda não exibe a foto do brinco.

## Morte no layout novo do PWA: fotos de brinco e cabeça (2026-10-07)

Migration `20261007110000_morte_fotos_brinco_cabeca.sql` (db push): colunas aditivas `registros_morte.foto_brinco_url` e `foto_cabeca_url`. A foto do animal segue em `foto_url` (com `latitude/longitude/gps_accuracy`, GPS obrigatório). No PWA a foto do animal passou a ser obrigatória; brinco e cabeça são opcionais e sobem para o bucket `fotos-morte` (`<fazenda>/<id>/brinco|cabeca`). Categorias vêm do lote (que varia por destino); sem categorias cadastradas, o fallback usa a lista por destino do lote (a mesma da Movimentação, agora em `utils/categorias.ts`) e a opção "Outros" de categoria foi removida. Os 19 itens SIM/NÃO mantêm a semântica (observação só na resposta de problema; `animalSozinho`/`morteSubita` invertidos) e ganharam ditado por voz; a observação de identificação também. O painel ainda não exibe as novas fotos (candidato a backlog).

## Manejo Pastagens no layout novo do PWA: fotos dos pastos com GPS (2026-10-07)

Migration `20261007100000_pastagens_fotos_gps.sql` (db push): em `registros_pastagens`, colunas aditivas `foto_saida_url`, `foto_saida_latitude`, `foto_saida_longitude`, `foto_saida_gps_accuracy`, `foto_saida_em` e o equivalente `foto_entrada_*`. O PWA exige uma foto por pasto (saída e entrada), marcada com GPS (opcional se indisponível) e hora, enviada ao bucket `fotos-registros` (`pastagens/<id>/saida|entrada`). Avaliação geral passou ao padrão do Rodeio (afirmações negativas, foto e voz por item; `avaliacao_geral` mantém `{valor, observacao}` e ganha `foto_url` por item). Escore corporal agora só inteiros 1–5 e equipe aceita 6+. O painel ainda não exibe as fotos/GPS (candidato a backlog).

## Doação desconta cabeças do lote (2026-10-06)

Migration `20261006230000_calculate_quant_atual_doacao.sql`: `calculate_quant_atual` passa a incluir `'Doação'` entre as saídas (junto de Consumo/Saída). No PWA a Doação deixou de ser um registro vazio (0 cabeças, que na prática nem salvava por conta da validação de destino): agora exige lote de origem e cabeças por categoria, grava um registro por categoria com `destino` nulo e `motivo_movimentacao = 'Doação'`. Não havia Doações reais anteriores com cabeças (só o teste de hoje).

## Movimentação no layout novo do PWA: foto do registro (2026-10-06)

Migration `20261006220000_movimentacao_foto_url.sql` (db push): coluna aditiva `registros_movimentacao.foto_url text` (nullable). O PWA (`MovimentacaoPage` no layout novo) anexa foto opcional ao primeiro registro de cada salvamento (Saída/Consumo/Entrevero/Doação/Entrada/Novo Lote; Transferência não usa) e envia ao bucket `fotos-registros`. Ditado por voz grava em `observacao` (já existia). PWAs antigos não enviam a coluna. O painel ainda não exibe `foto_url` (candidato a backlog).

## Rodeio no layout novo do PWA: contagem por categoria, foto/voz nos problemas (2026-10-06)

Migration `20261006210000_rodeio_categorias_detalhes_observacao.sql`: `registros_rodeio.categorias_detalhes jsonb` (`[{nome, quant_atual, quant_informada}]`, mesmo formato de `registros_pastagens`) e `observacao text` (observação do lote, digitada ou ditada). Colunas fixas (`vaca`, `boi`, `garrote`...) continuam preenchidas por normalização da categoria, então relatórios e painel seguem lendo `total_cabecas`/`diagnosticos`. `diagnosticos.<item>.foto_url` passa a existir quando o peão fotografa o problema (upload no PWA, bucket `fotos-registros`). Tudo aditivo: PWAs antigos continuam compatíveis. Painel ainda não exibe `categorias_detalhes`/fotos em `RodeioDetalhes`.

## Isolamento de tenant: RLS por fazenda em fazendas, usuario_fazenda, pastos, lotes e peoes (2026-10-06)

Incidente real (Serrinha 5, Fazenda Marcon): controller vinculado a outra fazenda alterou geometria de pasto e `lotes.pasto_id` de registros da Marcon. Causa raiz: policies `qual=true`/`check=true` nas tabelas de cadastro (item S3 da auditoria), incluindo `pastos_update_public` aberta para o role `public`, e auto-vínculo livre em `usuario_fazenda` (escalação de privilégio). O audit também revelou que `app.current_user_*` é session-scoped e pode vazar entre requisições pooled, ou seja, o nome gravado no `audit_log` não é prova confiável de autoria.

Migration `20261006180000_isolamento_tenant_lotes_pastos_fazendas.sql` (db push):

- **Helper novo** `user_has_fazenda_role(p_fazenda_id, p_papeis text[])`: papel do usuário autenticado em uma fazenda, `SECURITY DEFINER` (evita recursão em policies de `usuario_fazenda`).
- **`fazendas`**: removidas as policies abertas de `anon`/`authenticated` (INSERT/UPDATE/DELETE `qual=true`) e os dois SELECTs públicos. Novas: SELECT por `caller_has_fazenda_access(id)` OU mesmo `grupo_id` (necessário para transferência entre fazendas do grupo) OU `is_admin_user()`; INSERT/DELETE só `is_admin_user()`; UPDATE admin da fazenda com papel `admin`/`controller`.
- **`usuario_fazenda`**: removidas `Authenticated insert/update/delete` (`qual=true`) e `Users can insert their farm associations` (auto-vínculo com papel livre). Gestão de vínculos só via `is_admin_user()` ou admin da própria fazenda. Mantidas leituras escopadas e auto-exclusão do próprio vínculo.
- **`pastos`**: removidas as 7 policies permissivas, incluindo `pastos_update_public` (UPDATE aberto para `public`, sem login). Todas as operações via `caller_has_fazenda_access(fazenda_id)`, que cobre tanto usuário do painel (`usuario_fazenda` via `auth.uid()`) quanto peão do PWA (`auth.jwt()->>'email'` -> `peoes` -> `fazendas.acesso_id`).
- **`lotes`**: idem pastos; `deleted_at IS NULL` preservado em SELECT/UPDATE/DELETE.
- **`peoes`**: removidas `Auth insert/update/delete` (`qual=true`); qualquer autenticado podia trocar senha de peão de outra fazenda. Gestão só por admin/controller da fazenda (join `fazendas.acesso_id = peoes.fazenda_id`). Policies de `service_role` (edge function `login-peao`) mantidas.
- **`sincronizar_historico_pasto_lote_edit`** (RPC do `Lotes.tsx` ao editar pasto do lote, `SECURITY DEFINER` sem verificação): agora resolve o `fazenda_id` do lote e exige `caller_has_fazenda_access` antes de escrever; falha com `insufficient_privilege`.

Testado na fazenda de testes (`d649c65e`) com `request.jwt.claims` simulado: JWT do controller Marcon passou a ver 0 linhas em `pastos`/`lotes` da Gesta'Up e a falhar com erro RLS ao tentar auto-vínculo em `usuario_fazenda` (baseline anterior: UPDATE em pasto retornava a linha); controller e peão da Gesta'Up seguem lendo e escrevendo na própria fazenda; a RPC nega chamador cross-farm e executa para usuário da fazenda.

Fix imediato (`20261006190000_fix_fazendas_select_recursion.sql`): a cláusula de "mesmo grupo" na policy de SELECT de `fazendas` fazia EXISTS sobre a própria tabela, gerando `42P17 infinite recursion` (estourou no login, em `hasActiveFazenda` do `authService`). O check foi movido para a função `SECURITY DEFINER` `caller_mesmo_grupo_fazenda`. Verificado end-to-end no Painel: login com controller Gesta'Up, página de Lotes carrega só dados da fazenda, seletor de grupo mostra só a Gesta'Up Teste.

Segundo fix (`20261006200000_rpc_get_fazenda_por_acesso.sql` + ajuste no PWA): o client `anon` do PWA (`checkFarmActiveStatus`, guarda do app inteiro) perdeu leitura de `fazendas` e mostrava "Fazenda desativada" para fazenda ativa. Criada RPC `SECURITY DEFINER` `get_fazenda_por_acesso(acesso_id)` com subconjunto operacional (sem cnpj/endereco/telefone/email/planilha_id/bounding_box), executável por `anon` e `authenticated`. No PWA, `farmStatusService` passou a usar a RPC e `getFazendaByAcessoId` ganhou fallback para ela quando o token de peão está ausente (janela de re-auth). Verificado no PWA: boot passa a guarda, warm cache completo com JWT de peão (pastos, lotes e ~50 cadastros), SearchableModal da Movimentação mostra lote+pasto, login por PIN funciona.

Pendente para fechar o item S3 da auditoria do PWA: as demais ~18 tabelas de cadastro (currais, insumos, funcionarios, setores, racas, fornecedores, frigorificos, implementos, itens_almoxarifado, locais, maquinas_veiculos, medicamentos, mineral, proteinado, racao, tratamentos, causas_morte, bebedouros), `usuarios` (S4), `lote_historico` (S7) e as RPCs `SECURITY DEFINER` restantes sem check de vínculo (`transferir_lote_entre_fazendas`, `aprovar_solicitacao_novo_lote`, `get_*` com `p_fazenda_id`).

Disparador: quando mencionar "controller alterou outra fazenda", "isolamento de tenant", "RLS por fazenda", `user_has_fazenda_role`, `caller_has_fazenda_access`, S1/S2/S3, ler esta seção.

## Edição da data de entrada da ocupação na folha de trato (2026-10-06)

A folha de lançamento (`carregarLancamentoTratos`) lista um curral apenas quando a ocupação cobre a data selecionada (`lote_curral_historico.data_inicial <= data`), e não quando a programação foi criada. Lote alocado ao curral com registro atrasado ficava impossível de lançar retroativamente: o sistema não tem bloqueio de data passada, mas a folha ficava vazia para datas anteriores à `data_inicial` (caso real: Lote 05 da Jacamim alocado em 29/09 com início efetivo em 23/09; corrigido via update pontual na `data_inicial`).

- **UI**: a coluna "Entrada" da tabela "Currais em trato" em `ProgramacaoTratos.tsx` virou edição inline (clique na data abre `input[type=date]`, blur/Enter salva, Esc cancela) usando `setOcupacaoDataInicial`, que já existia no service mas não era chamada por tela nenhuma. Após salvar, só a ocupação é atualizada no estado local para não perder os drafts de kg.
- **Semântica**: a `data_inicial` define o "dia 1" da ocupação (âncora de `totalUltimoDiaDaOcupacao` e do previsto `kg_mn_dia_dia1`), então retrocedê-la habilita lançamentos para o intervalo antes sem curral.
- O banner de erro do card foi generalizado ("Erro ao salvar") pois passou a cobrir também a edição de entrada.

Disparador: quando mencionar "lote não aparece na folha de tratos", "lançamento retroativo", "data de entrada do lote no curral", `data_inicial` de `lote_curral_historico`, `setOcupacaoDataInicial`, ler esta seção.

## Ordem manual dos currais na folha de trato (2026-10-06)

A seção "Currais em trato" de `ProgramacaoTratos.tsx` (previsto MN dia 1) ganhou reordenação por arrastar, persistida em `currais.ordem_folha_trato` (migration `20261006170000_currais_ordem_folha_trato.sql`, db push, com backfill alfabético por fazenda). A ordem é respeitada em três pontos: a própria tabela de configuração, a folha de lançamento do painel (`lancamentoTratosService.ts`, tela e PDF) e a barra inferior de currais do PWA (`TratoConfinamentoPage.tsx`).

- **Drag**: padrão nativo HTML5 já usado em `PlanoNutricionalModal` (dataTransfer + dragOverIndex), sem lib nova. A linha `<tr>` só fica `draggable` após `onMouseDown` no grip de 6 pontos, para não roubar o drag dos inputs de kg.
- **Persistência**: `salvarOrdemCurraisTrato` grava posições 1..n nos `curral_id` visíveis via `Promise.all` de updates; erro reverte o estado local. Currais fora da lista (outro tipo de programação ou sem ocupação) mantêm o valor.
- **Semântica**: ordenação é do curral, não da ocupação (lote novo no mesmo curral herda a posição). NULL cai no fim com desempate por nome. Ordem única por fazenda, não por tipo; cada visão filtra por `lote_sistema` e preserva a ordem relativa.
- **PWA**: `getCurrais` usa `select('*')`, então a coluna chega ao cache sem tocar no sync; o sort em `carregarDados` usa `curraisPorId` + `ordem_folha_trato`, propagando para `curraisDaLinha` e "SALVAR E IR PARA X".

Disparador: quando mencionar "ordenar currais", "ordem da folha de trato", `ordem_folha_trato`, `salvarOrdemCurraisTrato`, ler esta seção.

## Edição/exclusão de registros de clima (2026-10-06)

`RegistrosClimaDetalhes.tsx` ganhou ações "Editar" e "Excluir" (papel admin/controller/super_admin) seguindo o padrão de `SuplementacaoDetalhes`: botões no `DetailLayout`, `Modal` de edição e `ConfirmModal` de exclusão.

- **RPCs** (migration `20261006130000_editar_excluir_registro_clima.sql`, db push): `editar_registro_clima` e `excluir_registro_clima`, no padrão hardenado de `editar_registro_leitura_cocho` (caller resolvido via `auth.uid()`, `p_usuario_*` ignorados para autorização, papel admin/controller em `usuario_fazenda`, whitelist em `p_campos`, soft delete).
- **Campos editáveis**: `data` (timestamptz, editada como data+hora de parede convertidas para o fuso da fazenda via `farmDateTimeToIso`/`FARM_TIMEZONE`), `responsavel`, `medicoes`, `temperatura_media`, `umidade_relativa`, `tempo_atual` (8 valores válidos), `esvaziou_pluviometros`, `choveu`, `observacao`. Não editáveis: identidade/autoria (`id`, `fazenda_id`, `dispositivo_id`, `nome_usuario`, que é fallback de auditoria) e metadados de sync (`local_id` com unique constraint, `sync_status`, `version`).
- **Medições**: o editor permite alterar medicao/temperatura/horario por linha, remover linha e adicionar pluviômetro da fazenda (snapshot de nome/localização, igual ao PWA). `temperatura_media` é recalculada como média das temperaturas das medições (mesma derivação do PWA): o front calcula e trava o input quando há temperaturas; a RPC re-deriva quando `medicoes` é enviado e pelo menos uma temperatura existe, senão preserva o valor enviado (protege registros antigos sem temperatura por medição).
- **Auditoria**: a migration também cria `trg_audit_registros_clima` (`fn_audit_trigger`), que faltava nessa tabela; todas as demais cadernetas editáveis já a tinham.

Testado na fazenda de testes via MCP com `request.jwt.claim.sub` simulado: edição de `data` aplicou e reverteu, exclusão fez soft-delete, `audit_log` recebeu as linhas com `usuario_email` correto.

Disparador: quando mencionar "editar/excluir clima", `editar_registro_clima`, `excluir_registro_clima`, ou "data errada em registro de clima", ler esta seção.

## Redução de writes no caminho de sync para resolver timeouts 57014 (2026-10-06)

Sintoma: inserts do PWA em `registros_suplementacao` e `saida_insumos` falhavam com 57014 (`statement_timeout=8s` da role `authenticated`), repetidos no horário de trato. Investigação: cada insert dispara uma cascata de triggers que transforma 1 write em centenas — `trg_suplementacao_mov` cria movimentação em `movimentacoes_estoque_suplementos`, cujo trigger `update_estoque_suplemento` chama `recalcular_custo_medio_item`, que fazia replay do histórico inteiro do item com UPDATE incondicional por linha (~105 writes para a formulação mais usada da fazenda afetada); em paralelo `trigger_recalc_peso_on_insert` varre todo o histórico do lote e cada UPDATE de peso gera insert em `audit_log` (214 MB) mais recalc de consumo. Com checkpoints de 23-65s no mesmo período (I/O saturado) e locks nas mesmas linhas do replay, a statement estourava 8s.

Correção na migration `20261006150000_reduzir_writes_sync_estoque.sql` (db push, commit `3551a1c`):

1. `recalcular_custo_medio_item(uuid,text,uuid)`: o UPDATE por linha do replay ganhou guarda `IS DISTINCT FROM` (só reescreve quando o saldo diverge; a outra sobrecarga já tinha) e o UPDATE final em `insumos`/`formulacoes` só roda quando `estoque_atual`/`custo_unitario` mudam. Em estado estacionário o replay passa de ~N writes por insert para ~0, e a pegada de lock na linha da formulação encolhe. Valores calculados e gravados são idênticos; única mudança observável é `updated_at` deixar de ser tocado em rewrites no-op (nenhum consumidor lê esse campo).
2. `fn_audit_trigger`: `dados_antigos`/`dados_novos` passam a NULL — eram duplicatas byte a byte de `valor_anterior`/`valor_novo`. A RPC `get_audit_log` só lê `valor_*` e `alteracoes`; linhas antigas mantêm os dados e expiram pela retenção de 90 dias.

Pendente se o problema voltar: mover recalc de peso/estoque para processamento assíncrono (marcar dirty + job), elevar `statement_timeout` via função `SECURITY DEFINER`, ou investigar saturação de I/O da instância (checkpoints lentos na janela do erro).

Disparador: quando mencionar "timeout de sync", "57014", "canceling statement due to statement timeout", `recalcular_custo_medio_item`, `fn_audit_trigger`, `recalcular_peso_vivo_lote`, "replay de estoque", ler esta seção.

## Importação de lotes + categorias por planilha-modelo (2026-10-05)

A tela de Lotes ganhou "Importar Planilha" (botão em `LoteFilters`), abrindo `components/lotes/ImportarLotesModal.tsx` com dois passos: baixar a planilha-modelo e enviar o arquivo preenchido.

- **Modelo** (`utils/modeloImportacaoLotes.ts`): gerado na hora via exceljs com a aba "Importação" (uma linha por categoria, 13 colunas) e a aba oculta "Listas" populada com pastos, currais e raças da fazenda. Dropdowns usam `dataValidation` de range + defined names (`ListaPastos` etc.) para funcionar em Excel antigo e LibreOffice; o d.ts do exceljs não expõe `dataValidations`, usado via cast. A leitura do arquivo enviado usa `xlsx` com `cellDates`.
- **Service** (`services/lotesImportacao.ts`): `parseLinhasPlanilha` localiza o cabeçalho por nome normalizado (caixa/acento/pontuação tolerados); `validarLinhas` agrupa por nome de lote normalizado, aplica as mesmas regras do formulário (sistema define pasto-vs-curral via `usaCurral`, quantidade inteira > 0, categoria da lista canônica de 12, destino com alias "abate"→"corte"), detecta divergência de atributos entre linhas do mesmo lote e rejeita o grupo inteiro quando qualquer linha falha (evita lote parcial). `importarLotesValidos` grava `lotes` (o trigger `trg_lotes_pasto_historico` abre o histórico sozinho), chama `alocar_lote_curral` para confinamento e faz batch insert em `lote_categorias` com `quant_atual = quant_inicial`; falha pós-insert do lote faz soft-delete para liberar o nome. `n_cabecas` = soma das categorias.
- Duplicidade: nomes já cadastrados são pulados e reportados por linha (mesmo padrão da importação de pastos/bebedouros); o trigger `trg_lote_nome_unico_fazenda` é a última linha de defesa.

Verificado na fazenda de testes: insert equivalente criou lote com 2 categorias e `lote_pasto_historico` aberto via trigger; dados removidos após. Typecheck, build e 16 testes novos verdes (parse, validação, round-trip do xlsx com validações/defined names).

Disparador: quando mencionar "importar lotes", "planilha de lotes", "importação de lote", `ImportarLotesModal`, `lotesImportacao`, `modeloImportacaoLotes`, ler esta seção.

## Exclusão de entrada de insumos com estorno de estoque (2026-10-02)

`EntradaInsumosDetalhes.tsx` ganhou ação "Excluir" (admin/controller/super_admin) com `ConfirmModal`. Chama a RPC `excluir_registro_entrada_insumos` (migration `20261003120000`, db push): valida papel, injeta contexto de auditoria, soft-deleta o cabeçalho e deleta fisicamente os itens (`entrada_insumos_itens` não tem `deleted_at`). O DELETE do item dispara `trg_entrada_insumos_itens_mov`, que soft-deleta a movimentação espelhada e recalcula saldo e custo médio do insumo/formulação.

Na mesma migration, `trg_entrada_insumos_itens_mov` ganhou guard `r.deleted_at IS NULL` no lookup do cabeçalho (o branch de DELETE foi movido para antes do lookup, pois não depende do pai). Sem o guard, um re-sync tardio do PWA (upsert por `local_id`) recriaria item e movimentação de uma entrada já excluída. O mesmo guard ainda não existe em `trg_saida_insumos_itens_mov` e `trg_fabrica_confinamento_insumos_mov` — aplicar quando a exclusão dessas telas for implementada.

Testado na fazenda de testes: entrada com 2 itens subiu `estoque_atual` (500 e 200) e criou 2 movimentações; exclusão pela UI zerou os saldos, removeu os itens e estornou as movimentações; re-insert de item em pai excluído não gerou movimentação; segunda exclusão falha com "Registro não encontrado ou já excluído".

Disparador: quando mencionar "excluir entrada de insumos", "estorno de estoque de insumos", `excluir_registro_entrada_insumos`, ler esta seção.

## Fix: aprovação de solicitação de novo lote falhava com erro de INSERT (2026-10-03)

Caso real: na Fazenda Marcon, a solicitação `fe382a1d-f7d0-42a9-a29c-0eb3989dec59` (lote "198" a partir do "Lote 175", 60 novilhas, enviada pela Karina via PWA em 02/10) não pôde ser aprovada; o usuário acabou rejeitando. O erro era Postgres 42601 "INSERT has more target columns than expressions".

Causa-raiz: na migration `20260925100000_lote_curral_historico_ocupacao.sql` (reescrita da RPC `aprovar_solicitacao_novo_lote` para suportar curral), a lista de colunas do INSERT em `lote_categorias` ficou com 49 campos mas o VALUES com 48 expressões: faltava `NULLIF(v_cat_item->>'custo_total_entrada_reais_lote', '')::numeric` entre `custo_total_entrada_reais_cab` e `preco_entrada_reais_kg`. A versão anterior (`20260921150000`) tinha a linha. Como a função roda em transação única sem exception handler, a falha aborta tudo sem dados parciais.

Correção na migration `20261003110000_fix_aprovar_novo_lote_custo_total_lote.sql` (db push): `CREATE OR REPLACE FUNCTION` idêntica, apenas recolocando a expressão faltante. Nenhum dado da Marcon foi tocado pela migration. Depois, a pedido do usuário, a solicitação foi reaberta via update pontual no MCP (status → 'pendente', `rejeitada_at`/`rejeitada_by`/`motivo_rejeicao` → null, `updated_at` restaurado ao valor original), voltando exatamente ao estado anterior à rejeição para nova aprovação.

Comportamento ainda pendente de decisão: a data gravada em `registros_movimentacao.data` é `created_at do lote + 1s`, ignorando `dados_movimentacao.data` do PWA; se a data da movimentação deve honrar a data solicitada/editada, é ajuste separado.

Disparador: quando mencionar "aprovar novo lote", "solicitação de novo lote", `aprovar_solicitacao_novo_lote`, erro "INSERT has more target columns than expressions" ou `custo_total_entrada_reais_lote`, ler esta seção.

## Exclusão de abastecimento com estorno de estoque (2026-10-03)

`RegistrosAbastecimentoDetalhes.tsx` ganhou ação "Excluir" (admin/controller/super_admin) com `ConfirmModal`, seguindo o padrão de `SuplementacaoDetalhes`. A exclusão chama a RPC `excluir_registro_abastecimento` (migration `20261003100000_excluir_registro_abastecimento.sql`, db push), que valida papel controller/admin em `usuario_fazenda`, injeta contexto de auditoria e faz soft-delete.

O ajuste de estoque não é feito na RPC: a trigger `trg_sync_baixa_abastecimento` (AFTER UPDATE, migration `20260917150000`) detecta a transição `deleted_at` null→set, remove a `movimentacoes_combustivel` de baixa vinculada e a trigger de saldo recalcula o tanque. O modal de confirmação informa o estorno quando `baixa_estoque_id` existe. Também exibe o campo Tanque (`tanque_nome`) nos detalhes.

Edge cases cobertos pela trigger existente: edição de `total_abastecido` ajusta a baixa; troca de `tanque_id` estorna no antigo e baixa no novo; restore recria a baixa; registro sem tanque ou sem baixa só faz soft-delete. Edge residual conhecido: o estorno usa `GREATEST(0, saldo + delta)` sem teto de capacidade, então devolver litros a um tanque que recebeu entradas posteriores pode deixar o saldo acima de `capacidade_maxima_l`.

Disparador: quando mencionar "excluir abastecimento", "estorno de combustível", `excluir_registro_abastecimento`, ler esta seção.

## Inputs numéricos pt-BR sem ambiguidade de ponto (2026-10-01)

Origem: uma entrada de insumo na Fazenda Chibata foi lançada no PWA como "9.540" (o operador pretendia 9.540 kg, com ponto de milhar). O campo era `type="number"` (convenção americana: ponto = decimal) e o sync mandava a string crua para o Postgres, que gravou `numeric` 9,54 kg. Fator de erro de 1000 silencioso.

Correção sistematizada nos dois repos: campos de valor numérico agora aceitam somente dígitos e vírgula (decimal pt-BR). O ponto nunca entra como dígito; aparece apenas como separador de milhar na exibição enquanto o usuário digita ("9540" → "9.540").

- **`packages/ui/src/NumericInput.tsx`**: reescrito com agrupamento de milhar visual e remoção de todos os pontos antes de interpretar. Mantido o contrato com os callers existentes: `onChange` emite string de dígitos com vírgula decimal, sem milhar ("9540,5"), e `value` aceita número ou string canônica. Vale para todos os consumidores do pacote (Lotes, IndividuoNovo, planos nutricionais etc.), que fazem `parseFloat(v.replace(',', '.'))` ou equivalente.
- **`EstoqueSuplementacao.tsx`**: inputs "Quantidade", "Custo Unitário", "Novo Saldo/Levantamento bruto", "Custo unitário do ajuste" trocados de `Input type="number"` para `NumericInput`; todos os `parseFloat` do arquivo viraram `parseValorBR` (já existente em `@gestaup/shared`, com heurística pt-BR: ponto com 3 dígitos após = milhar, vírgula = decimal). O input inline de estoque mínimo (HTML nativo) virou `type="text"` sanitizado com `[^\d,]` + `parseValorBR` no save.
- **PWA**: `NumericInput` mascarado novo em `components/ui`, aplicado na Entrada de Insumos, e o mapping de sync de `entrada-insumos-itens` convertido para número antes do upsert. Detalhes no HISTORICO do repo do PWA.
- Débito conhecido: outras telas do PWA (saída de insumos, movimentação, comunicados, pesagem, clima, pastagens, rodeio) ainda usam `type="number"` e têm a mesma exposição; o componente novo está pronto para o rollout.

Disparador: quando mencionar "input numérico", "ponto de milhar", "vírgula decimal", `NumericInput`, `parseValorBR`, ou erro de 1000x em quantidade/custo, ler esta seção.

## Relatório de Estoque: link público, PDF e seção no Infográfico Mensal (2026-10-01)

Snapshot de estoque de insumos e formulações (sem filtro de período), seguindo o padrão dos demais relatórios: RPC pública por token, página pública, PDF Puppeteer e seção opcional no infográfico.

- **`relatorios_publicos.config jsonb`** (migration `20261001140000_relatorio_estoque.sql`, db push): coluna nova e genérica; o relatório de estoque a usa para persistir `{"escopo": "insumos"|"formulacoes"|"todos"}` escolhido na geração do link. Escopo é restrição de exposição, não filtro de UI: a RPC devolve só os grupos autorizados, então um link "só insumos" não vaza dados de formulações no payload.
- **RPCs**: `get_dados_relatorio_estoque(p_token)` valida token ativo/tipo/não expirado e retorna `escopo`, `gerado_em`, `itens` (item_tipo, nome, tipo, unidade, estoque_atual, estoque_minimo, custo_unitario, valor_estoque, em_alerta, negativo) e `totais`. `get_dados_relatorio_estoque_fazenda(p_fazenda_id)` valida `user_has_fazenda_access`, cria token efêmero e delega (sempre escopo "todos", para o infográfico). Valor segue a regra da tela de estoque: insumo `estoque_atual × custo_unitario`; formulação usa `custo_unitario` ou fallback `custo_mn_tonelada/1000`; `GREATEST(estoque_atual,0)` no valor, com flag `negativo` separada.
- **Hub** (`Relatorios.tsx`): tipo `'estoque'` no catálogo e seletor de escopo de 3 opções no modal de gerar link.
- **Página pública** `RelatorioEstoquePublico.tsx`: KPIs (valor total, itens, abaixo do mínimo, saldos negativos) + tabela; abas Insumos/Formulações só aparecem quando o escopo cobre os dois.
- **PDF**: `api/pdf/estoque.js` (`renderEstoqueHtml` exportada), client `relatorioEstoquePDFPuppeteer.ts`, rota em `vite.config.ts`. Tabela paginada por grupo; o "Total do grupo" só renderiza no último chunk (correção: antes vazava nas continuações intermediárias e era cortado na página 1).
- **Infográfico**: `estoque` em `RELATORIOS_GERAIS`, `carregarEstoque` nos loaders (ignora dataInicio/dataFim, é snapshot), `REPORT_REGISTRY`, rotulado "posição em <data>" para deixar claro que não é fechamento de período.

Validado na fazenda de testes: RPC com 22 itens (15 insumos + 7 formulações, R$ 245.188,66), escopo 'insumos' filtrando no servidor, PDF de 3 páginas revisado por screenshot. Typecheck limpo, 91 testes verdes.

Disparador: quando mencionar "relatório de estoque", "posição de estoque", `get_dados_relatorio_estoque`, `config.escopo`, `renderEstoqueHtml`, ler esta seção.

## Zeramento do histórico de estoque da Fazenda Guanabara (2026-10-01)

A Guanabara (`f8be22c5-12e9-4bda-a813-fae8cb3d47ec`) passou a controlar estoque de insumos/formulações efetivamente em 01/10/2026. Como suplementações já descontavam do estoque antes de haver saldo cadastrado (permitido por conveniência), o histórico anterior gerava saldos negativos grandes e sem sentido.

Operação pontual via MCP: soft-delete (`deleted_at`) das 70 movimentações de `consumo` com `data <= 2026-09-29`, todas em formulações. Os 10 ajustes de insumo de 29/09 foram **preservados como saldo de abertura** (decisão do usuário), e as movimentações de 30/09 (7 baixas de insumo, 7 produções de formulação) ficaram ativas. Registros de suplementação e fabricação intactos; só o livro de movimentações foi ajustado. O trigger `update_estoque_suplemento` recalculou os saldos: formulações saíram de negativos (ex.: TIP SECA 2,2% -23.068 → 942; Bezerros 1,5% -16.468 → 3.504) para refletir só as produções de 30/09.

Backup em `backup.guanabara_reset_20261001_movs` (70 linhas) e `backup.guanabara_reset_20261001_itens` (saldo/custo dos 17 itens). Restauração = `deleted_at = NULL` nas linhas do backup.

Disparador: quando mencionar "Guanabara estoque", "saldo negativo Guanabara", "abertura de estoque Guanabara", ler esta seção.

## Remoção do tipo 'estorno' do estoque de suplementação (2026-10-01)

O tipo `estorno` foi removido de `movimentacoes_estoque_suplementos` porque era fruto de bug, não conceito de domínio. Causa-raiz: o PWA sincroniza itens com `.upsert(onConflict: 'local_id')`, e um retry de upsert numa linha já existente resolve como UPDATE no Postgres; as triggers de origem tratavam qualquer UPDATE como edição e gravavam um estorno que, no WAC, sempre subtraía saldo (sinal invertido para baixa/consumo). Caso real: SAL BRANCO na Fazenda Chibata ficou 222 kg abaixo do real por um estorno gerado em retry de sync, sem edição do usuário.

Novo modelo na migration `20261001120000_remover_estorno_espelho_movimentacoes.sql`: a movimentação espelha a linha de origem. INSERT cria, UPDATE atualiza a mesma linha de movimentação (guarda `IS NOT DISTINCT FROM` faz retry virar no-op), DELETE/soft-delete marca `deleted_at`; movimentação soft-deletada é reavivada se o alvo voltar (contorna a chave única `uq_mov_estoque_supl_origem`). Reescritas `trg_entrada_insumos_itens_mov`, `trg_saida_insumos_itens_mov`, `trg_fabrica_confinamento_insumos_mov` (mantém expansão de premix) e `trg_suplementacao_mov` (soft-delete do trato agora remove o consumo, antes não revertia nada). 'estorno' saiu de `recalcular_custo_medio_item`, `update_estoque_suplemento`, `trg_mov_supl_auditoria` e do CHECK de `tipo_movimentacao`. Painel: removido label e subtração de estorno do consumo diário em `EstoqueSuplementacao.tsx` (o label em `EstoqueAlmoxarifado.tsx` é outro subsistema, intacto).

Reconciliação pontual via MCP com backup em `backup.estorno_20260930_movs` e `backup.estorno_20260930_itens`: 9 estornos removidos; SAL BRANCO (Chibata) voltou de 5.377,5 para 5.599,5 kg com custo R$ 0,88/kg; 8 pares consumo+estorno órfãos de tratos deletados na fazenda de testes foram removidos (registros de origem já não existiam). Teste na fazenda de testes validou: upsert idêntico não gera movimentação nova, UPDATE de quantidade espelha a mesma linha, DELETE remove as movimentações.

O mesmo padrão de estorno por UPDATE existe nos estoques de combustível, cantina, almoxarifado e módulo comercial/OS (tabelas próprias), fora deste escopo e candidato a auditoria futura.

Disparador: quando mencionar "estorno", "movimentação fantasma", "saldo errado depois do sync", "upsert gerou desconto", ler esta seção.

## Relatório de Manejo de Pastagens + fix das views de ocupação (2026-09-29)

Novo relatório sobre `registros_pastagens` enriquecido com o histórico de ocupação (`lote_pasto_historico` + `pastos` + `modulos_pastos` + `lotes`), seguindo o padrão do rodeio: link público por token, PDF Puppeteer e seção no Infográfico Mensal. `registros_pastagens` sozinha só registra o evento de troca de pasto; a análise de ocupação (dias, UA/ha, desvio vs meta) sai das tabelas relacionadas, por isso a RPC retorna os dois conjuntos.

- **Bug corrigido nas views de ocupação**: `v_historico_ocupacao_pasto` e `v_lote_pasto_ocupacao_atual` tinham `LEFT JOIN modulos_pastos m ON h.modulo_id = p.modulo_id` sem referenciar `m` no join, gerando produto cartesiano e linhas duplicadas na tela Histórico de Ocupação. A migration `20260929170000_rpc_relatorio_pastagens.sql` recria as duas views com o join correto (`m.id = h.modulo_id`). `v_historico_ocupacao_modulo` estava correta e não foi tocada.
- **RPCs** (`get_dados_relatorio_pastagens` + wrapper `_fazenda`): retornam `registros` normalizados (coalesce id→texto legado, `modulo_saida`/`modulo_entrada` resolvidos via pastos, `avaliacao_geral` JSON intacto), `ocupacoes` calculadas direto de `lote_pasto_historico` (sem depender das views: dias, desvio_percent e taxa_lotacao_ua_ha computados na CTE, incluindo ocupações abertas com contagem parcial e UA/ha ao vivo a partir de `cabecas_entrada` × `peso_medio_entrada`), `pastos_info` (área, espécie, degradação, meta por pasto) e dimensões para slicers (pastos, lotes, responsáveis, módulos). Ocupação cruza com o período por interseção de intervalos, não por data pontual.
- **Agregações compartilhadas** `src/features/relatorioPastagens/agregacao.ts`: KPIs (movimentações, animais, ocupação média, UA/ha média, ocupações acima da meta), resumo por pasto e por lote, série diária, fluxo entre pastos e alertas de `avaliacao_geral` reutilizando `alertasDoRegistro`/`DiagnosticosRodeio` do rodeio (mesmas 7 chaves e semântica S/N).
- **Página pública** `RelatorioPastagensPublico.tsx`: slicers de data + pasto/lote/manejador/módulo (pasto e módulo casam com qualquer lado da movimentação), 4 gráficos recharts (movimentações/dia, avaliação saída vs entrada, UA/ha por pasto, frequência de alertas), tabelas de resumo por pasto e por lote, histórico de ocupação com status em andamento/encerrada, detalhamento das movimentações e exportar PDF. Tipo `'pastagens'` registrado no dispatch de `RelatorioPublico.tsx` e no catálogo `RELATORIOS_DISPONIVEIS` (ícone 🌾).
- **PDF**: `api/pdf/pastagens.js` (Chart.js injetado, `renderPastagensHtml` exportada para o consolidado) + client `utils/relatorioPastagensPDFPuppeteer.ts` + registro `/api/pdf/pastagens` no `vite.config.ts` (dev server registra handlers manualmente; esquecer essa linha foi exatamente o bug do PDF do rodeio). Página 1 KPIs + gráficos, página 2 UA/ha por pasto + alertas, depois resumo por pasto, histórico de ocupação e detalhamento paginados.
- **Infográfico**: `pastagens` no `REPORT_REGISTRY`, `RELATORIOS_GERAIS` (posição 6), `LOADERS` (`carregarPastagens` via RPC `_fazenda`) e o limite de seções do `geral.js` subiu de 6 para 7. `catalogo.test.ts` atualizado.
- **Crivo de qualidade do PDF** (revisão visual com dados reais da Jacamim, 10→12 páginas): o wrap do gráfico de UA/ha usava `flex:1` e colapsava para ~0 quando a tabela de alertas consumia a página, sobrepondo o gráfico à tabela; virou altura fixa (55mm). Alertas passaram a paginar (14 na página 2, 22 por continuação). Alertas do detalhamento viraram bloco por item com observação própria (antes saíam colados em linha). Labels de diagnóstico quebram depois de "/" (`<wbr>`/ZWSP) em vez de cortar no meio da palavra. Colunas 100% vazias são omitidas por tabela (módulo, meta, desvio, ocup./vedação). Dias negativos (saída antes da entrada) saem em vermelho com nota "saída < entrada". `total_animais` null/0 cai para soma das categorias. Status "EM ANDAMENTO" virou "ABERTA" (coluna estreita quebrava em 3 linhas e cortava a última linha da página). UA/ha 0 renderiza "—". Detalhamento em 9 linhas/página. `Chart.defaults.devicePixelRatio = 3` no init dos gráficos: o canvas rasterizava na resolução CSS (~96dpi) e pixelava no zoom do PDF. Aplicado em todos os endpoints (`pastagens`, `rodeio`, `morte`, `consumo`, `clima`, `bebedouros`, `abastecimento`); o infográfico (`geral.js`) herda via scripts de init compostos pelo `reportComposer`.

**Disparador**: quando mencionar relatório de manejo de pastagens, `registros_pastagens` no relatório, `get_dados_relatorio_pastagens`, `renderPastagensHtml`, histórico de ocupação no relatório, ou duplicidade nas views de ocupação (`v_historico_ocupacao_pasto`, `v_lote_pasto_ocupacao_atual`), ler esta seção.

## Relatório de Rodeio: link público, PDF e seção no Infográfico Mensal (2026-09-29)

Novo relatório sobre `registros_rodeio`, seguindo o padrão dos demais relatórios operacionais (clima, morte, abastecimento). O usuário pediu "igual aos demais em `apps/vision/Relatorios.tsx`", mas aquela página do Vision é só placeholders; o sistema real de relatórios vive no manejus, então o relatório foi implementado lá.

- **Migration `20260929160000_rpc_relatorio_rodeio.sql`** (db push): `get_dados_relatorio_rodeio(p_token, p_data_inicio, p_data_fim)` valida token em `relatorios_publicos` com `tipo = 'rodeio'`, converte `data` (timestamptz) pelo timezone da fazenda e retorna registros + dimensões distintas (`pastos_disponiveis`, `lotes_disponiveis`, `usuarios_disponiveis`) sem filtro de data para os slicers. Nome de pasto/lote resolve via join em `pasto_id`/`lote_id` com fallback para as colunas de texto legadas. Wrapper `get_dados_relatorio_rodeio_fazenda` (authenticated, `user_has_fazenda_access`, token temporário) alimenta o consolidado.
- **Agregações compartilhadas**: `src/features/relatorioRodeio/agregacao.ts` concentra tipos e cálculo puro (`calcularResumoRodeio`, `serieDiariaRodeio`, `alertasDoRegistro`), usado tanto pela página pública quanto pelo loader do infográfico, evitando divergência de números entre os dois caminhos.
- **Classificação de diagnósticos**: replica `RODEIO_DIAGNOSTICOS` do PWA (`pdfUtils.ts`). Itens "OK?" (`bebedourosCochos`, `pastagensTaxaLotacao`, `cercasCochosPorteiras`) alertam quando `valor = 'N'`; itens sanitários (`animalMorto`, `carrapatosMoscas`, `animaisEntreverados`, `animaisMachucadosDoentesBichados`) alertam quando `valor = 'S'`. Mesma tabela em `api/pdf/_shared/labels.js` para o renderer do PDF.
- **Página pública** `RelatorioRodeioPublico.tsx`: KPIs (rodeios, cabeças contadas, média/rodeio, escore médio do gado e de fezes, alertas sanitários/infra), slicers de data (server-side) + pasto/lote/usuário (cross-filter multi-select), gráficos recharts (barras empilhadas de cabeças por categoria/dia, linha de escores, barras de frequência de alertas), resumo por lote e por pasto, detalhamento por registro. Registrada no dispatch de `RelatorioPublico.tsx` e no `RELATORIOS_DISPONIVEIS` de `controller/Relatorios.tsx`.
- **PDF próprio**: `utils/relatorioRodeioPDFPuppeteer.ts` POSTa para `api/pdf/rodeio.js` (Puppeteer + Chart.js injetado, template `_shared/`). Página 1 com KPIs + gráficos, página 2 com frequência de alertas + resumos por lote/pasto, páginas seguintes com detalhamento paginado (12 linhas/página). Sem fotos (`foto_url` ignorado a pedido do usuário).
- **Infográfico Mensal**: `rodeio` entrou no `REPORT_REGISTRY` (`hasData` = registros > 0), no catálogo `RELATORIOS_GERAIS` (posição 5, antes do boletim), no `LOADERS` de `loaders.ts` (`carregarRodeio` chama a RPC `_fazenda` e computa o resumo via `calcularResumoRodeio`) e o limite de seções do `geral.js` subiu de 5 para 6. `catalogo.test.ts` atualizado para a nova ordem.

- **Meta de intervalo entre rodeios** (migration `20260929180000_rpc_rodeio_meta_intervalo.sql`): a RPC passa a trazer `meta_intervalo_dias` (de `lotes.meta_intervalo_rodeio_dias`) e `dias_desde_anterior` (gap desde o rodeio anterior do mesmo lote, buscado em todo o histórico, não só no período). `agregacao.ts` classifica cada registro (`situacaoMetaRodeio`: dentro/fora/sem_meta/sem_anterior) e agrega `rodeios_com_meta`, `dentro_meta`, `fora_meta` no resumo e por lote. PDF e página pública ganham KPI "Aderência à meta de intervalo" (4º card, condicional a existir meta), coluna "Meta intervalo" no resumo por lote e marcador "fora da meta (Nd > Md)" no detalhamento. Insight cita dentro/fora. Tudo condicional: fazendas sem meta não veem a seção.
- **Ajustes pós-crivo**: título renomeado para "Relatório de Rodeio de Gado" (headers do PDF, `reportRegistry`, card em `Relatorios.tsx`, catálogo do infográfico, nome do arquivo baixado e fallback do pill da página pública). KPI "Contagens de cabeças" removido do PDF e da página pública (grid 4→3), e a frase "com N cabeças contadas" saiu do texto do insight; a contagem segue disponível no gráfico por dia, na composição e nas colunas de "Última contagem"/"Média cabeças" do resumo por lote.

**Disparador**: quando mencionar relatório de rodeio, link público de rodeio, `get_dados_relatorio_rodeio`, `renderRodeioHtml`, seção de rodeio no infográfico, ou diagnósticos de rodeio (`diagnosticos` S/N), ler esta seção.

## Badge de sistema da formulação mostrava "Pasto" para qualquer valor não-Confinamento (2026-09-29)

Em `Formulacoes.tsx`, o badge "Sistema:" do card usava condição binária (`=== 'Confinamento' ? 'Confinamento' : 'Pasto'`), então `Recria`, `Engorda`, `Cria` (fases legadas aceitas pelo check `dietas_sistema_producao_check`) e `null` (Ambos) eram rotulados ou filtrados como Pasto. Correções:

- Badge sempre renderiza e mostra o valor real: `Confinamento` (âmbar), `Pasto` (verde), `null` exibe "Ambos" (neutro), valores legados (`Cria`/`Recria`/`Engorda`) exibem o literal em neutro, sem reler como Pasto.
- Filtro/aba "Confinamento" passou a incluir `sistema_producao IS NULL` (Ambos serve os dois sistemas), no contador e no filtro da grid. Aba "Pasto" já incluía não-Confinamento, mantida.
- O select do formulário continua com só Ambos/Pasto/Confinamento; ao editar formulação com valor legado (ex.: `Recria`), o estado é preservado no save porque `formData.sistema_producao` mantém o valor original.
- **Backfill pontual via MCP** (mesmo dia, a pedido do usuário): `Cria`/`Recria`/`Engorda`/`TIP`/`RIP`/`Sequestro` → `Pasto`, qualquer outro valor não-nulo fora de `Pasto`/`Confinamento` → `Confinamento`, `null` mantido (Ambos). Resultado: 71 Pasto, 5 Confinamento, 19 null. Não sobram valores legados; o check `dietas_sistema_producao_check` ainda os aceita caso queira apertar depois.

**Disparador**: quando mencionar badge/sistema/destino Pasto-Ambos-Confinamento no card de formulação, `sistema_producao` de `formulacoes` com valor legado, ou filtro Pasto/Confinamento da página, ler esta seção.

## Projeção de estoque nos cards de suplementação (2026-09-29)

Em `EstoqueSuplementacao.tsx`, a barra dos cards de insumo/produto final indicava saldo vs estoque mínimo, mas `pctSaude` era truncado com `Math.min(100, ...)` antes da escolha da cor, então qualquer saldo ≥ mínimo renderizava barra cheia amarela com a legenda fixa "Estoque no limite mínimo" (o verde >150% era código morto). Após duas iterações com o usuário, a barra virou um bloco de **Projeção** ("Projeção · últimos 30 dias") no rodapé do card:

- **Cálculo**: consumo médio diário por item na janela de 30 dias em `movimentacoes_estoque_suplementos` (`tipo_movimentacao` `baixa`/`consumo` somam, `estorno` subtrai). O divisor é o número de dias desde o primeiro consumo dentro da janela (cap 30), para não diluir a taxa quando o histórico é mais curto que 30 dias. Estado `consumoDiarioPorItem`.
- **Linhas**: "Consumo médio ~X kg/dia", "Autonomia ~N dias · esgota DD/MM" (cor do semáforo) e "Abaixo do mínimo em ~M dias (DD/MM)" ou "Já abaixo" quando `saldo <= estoque_minimo` com mínimo >0.
- **Barra removida**: uma versão intermediária tinha barra de autonomia (dias/30) com marcador do cruzamento do estoque mínimo, mas exigia legenda explicando a janela e o traço, gerando confusão. O desenho final tem apenas as três linhas de texto.
- Saldo ≤0 com consumo ativo mostra "Esgotado"; itens sem consumo na janela mostram "Sem consumo registrado nos últimos 30 dias" sem barra.
- A query de `movimentacoes_estoque_suplementos` em `loadAll` passou a selecionar `tipo_movimentacao, quantidade, data` (antes só `item_id`) para alimentar o cálculo; continua uma query só.

**Disparador**: quando mencionar barra nos cards de insumo, autonomia em dias, projeção de estoque, "abaixo do mínimo em N dias", "esgota DD/MM", `consumoDiarioPorItem`, `diasAteMinimo`, ou a antiga legenda "Estoque no limite mínimo", ler esta seção.

## Limpeza de saídas legadas do estoque de suplementação (2026-09-29)

Migração pontual via MCP (sem arquivo): soft-delete (`deleted_at = now()`) de todas as saídas (`tipo_movimentacao` `baixa`/`consumo`/`estorno`) de `movimentacoes_estoque_suplementos` com `data <= '2026-09-19'`, em todas as fazendas. Motivo: essas saídas foram registradas quando a lógica de estoque ainda não estava pronta. Total: 110 movimentações em 11 fazendas (6 `baixa` insumo Chibata, 4 Gesta'Up; restante `consumo`/`suplementacao` de formulações). O trigger `update_estoque_suplemento` detecta a mudança de `deleted_at` e reprocessa cada item via `recalcular_custo_medio_item`, então saldos, WAC e cadeia `saldo_anterior/posterior` foram reconstruídos automaticamente. Resultado na Chibata: produtos finais de -28.030,8 kg para -130,8 kg. Restaram formulações negativas causadas por consumos **posteriores** a 19/09 sem produção/entrada registrada (ex.: Guanabara, Doce Ilusão, Marcon), o caminho correto é ajuste por levantamento ou registro da produção faltante.

Na mesma sessão, os KPIs do topo de `EstoqueSuplementacao.tsx` mudaram de semântica: "Saldo Insumos"/"Saldo Produtos Finais" (e os "Valor" correspondentes) passaram a somar **apenas saldos positivos** (`Math.max(0, estoque_atual)`), porque a soma líquida mascarava anomalias (-3.654 kg em um produto aparecia como -130 kg agregado). Saldos negativos viram um subtítulo vermelho dentro do card do KPI ("N com saldo negativo (X kg)") e um alerta âmbar no topo listando os nomes, separado do alerta vermelho de estoque baixo.

Ainda nessa tela: "Valor Produtos Finais" mostrava R$ 0,00 porque `formulacoes.custo_unitario` (WAC) nunca saía de zero: toda `producao` entrava com `custo_unitario` NULL (`trg_saida_insumos_itens_mov` não passava custo) e `recalcular_custo_medio_item` preserva WAC nesse caso. Corrigido de forma sistêmica:

- **Migration `20260929130000_producao_custo_insumo.sql`** (db push): `trg_saida_insumos_itens_mov` passa `NULLIF(insumos.custo_unitario, 0)` como custo da `producao`. Como a quantidade da producao é a participação do insumo na mistura (kg), a média ponderada das produções resulta no custo/kg real do produto final. NULL preserva o comportamento de não diluir quando o insumo não tem custo.
- **Migration `20260929140000_wac_saldo_negativo.sql`** (db push): `v_saldo <= 0` (antes `= 0`) reinicia o custo médio com o preço da entrada, tanto em `recalcular_custo_medio_item` quanto no caminho incremental de `update_estoque_suplemento`. Sem isso, entrada/producao com custo sobre saldo negativo explodia o denominador (Ração 0,5% chegou a R$ 30.826/kg).
- **Backfill pontual via MCP**: `UPDATE` nas `producao` existentes resolvendo `registro_origem_id → saida_insumos_itens.insumo_id → insumos.custo_unitario`, seguido de reprocessamento de todos os itens via `recalcular_custo_medio_item` (o backfill em si já dispara o recalc por linha).
- **Painel**: produtos finais preferem `custo_unitario` (WAC real, label "Custo médio") com fallback para `custo_mn_tonelada / 1000` (custo de catálogo da composição, label "Custo da composição") quando zero.

**Disparador**: quando mencionar saldo negativo de formulação, saídas legadas do estoque, soft-delete de movimentações antigas, corte de 19/09/2026, pill/KPI de saldo somando negativos, "Valor Produtos Finais" zerado, custo de produto final, WAC explodindo com saldo negativo, ou custo em movimentação `producao`, ler esta seção.

## Pill de localização (pasto/curral) no relatório de consumo (2026-09-29)

O relatório de consumo passou a exibir a localização atual do lote como primeiro pill (à esquerda de "Nº Cab. Atual"), com label dinâmico: "Curral" quando o lote está confinado, "Pasto" quando está em pasto, e "Pasto/Curral" com `—` quando sem alocação.

- **Migration `20260929120000_relatorio_consumo_pasto_curral.sql`** (db push): `get_dados_relatorio_consumo` ganhou a CTE `localizacao_por_lote` e retorna `pasto_nome`/`curral_nome` dentro de `info`. As fontes são mutuamente exclusivas por trigger (`lotes.pasto_id → pastos.nome`, `currais.lote_id → currais.nome` com `ativo/deleted_at` filtrados). Vale para os dois escopos ('lote' e 'creep' mostram a mesma localização) e não é bloqueada por `cce.erros`. O wrapper `get_dados_relatorio_consumo_fazenda` (painel/infográfico) herda automaticamente.
- **Renderers**: pill adicionado em `api/pdf/consumo.js` (`pillsHtml`, cobre PDF individual e a seção de consumo do infográfico via `composeReports`), em `relatorioConsumoPDF.ts` (jsPDF legado + interface `InfoLote`), no payload de `relatorioConsumoPDFPuppeteer.ts` e na grid de pills da página pública `RelatorioConsumoPublico.tsx` (`sm:grid-cols-4` → `sm:grid-cols-5`).
- **Reparo de histórico**: o remoto tinha `20260928140000_problemas_evidencia` aplicada fora do fluxo (provavelmente via MCP) sem arquivo local; criado placeholder e marcada applied via `supabase migration repair` para destravar o `db push`.

**Disparador**: quando mencionar pill de pasto/curral no relatório de consumo, `pasto_nome`/`curral_nome` no `info` do relatório, ou `localizacao_por_lote`, ler esta seção.

## tempo_ocupacao / tempo_vedacao recriados como text em registros_pastagens (2026-09-28)

O texto do PWA sempre mostrava "Tempo de ocupação/vedação: —" porque as colunas tinham sido criadas como `integer` e dropadas no mesmo dia (`20260508194751`/`20260508195134`), e o PWA nunca persistia os campos. Migration **`20260928190000_pastagens_tempo_ocupacao_vedacao_text.sql`** (db push) recria como `text` — o PWA grava string formatada ("17 dias/410 horas", "Primeiro uso"), snapshot calculado no aparelho no momento do manejo, não valor derivado no banco. Painel: `PastagensDetalhes` exibe os dois campos e `PASTAGENS_EXPORT_CONFIG` ganhou as colunas na planilha. Detalhes do lado PWA no HISTORICO do repo PWA.

**Disparador**: quando mencionar tempo de ocupação/vedação em pastagens, ou colunas de pastagens ausentes, ler esta seção.

## Base adulta para consumo e peso de suplementação (2026-09-28)

Divergência reportada na Fazenda Brilhante: o "CMS Geral (%PV)" do texto do PWA (0,958%) não batia com a média da coluna "Consumo (%PV)" da planilha exportada (~1,65%). A investigação mostrou que eram métricas diferentes sob nomes iguais:

- A coluna exportada lê `consumo_medio_geral_percent_pv` de `registros_suplementacao`, que **não guarda média geral**: `calcular_consumo_registro_anterior` (trigger) e `recalc_consumo_series` gravam o **consumo do intervalo** de cada trato (`kg_cocho ÷ dias ÷ (n_cabecas − qtd_bezerros)`, convertido a MS e dividido pelo `peso_vivo_kg` do registro).
- O PWA calcula a média da série ao vivo em `calcularMetricasSuplementacao`, com denominador `n_cabecas` bruto e peso médio das categorias.
- As bases estavam inconsistentes nos dois lados: no banco o numerador era por adulto (n_cabecas − qtd_bezerros) mas o peso era a média ponderada incluindo bezerros ao pé (~354 kg vs 457 kg adulto), inflando o %PV; e linhas antigas tinham `qtd_bezerros` null (campo passou a ser enviado pelo PWA na feature creep de 23/09), caindo para denominador total.

**Decisão do usuário**: a fórmula correta é kg por cabeça adulta ÷ peso adulto (caso Brilhante Lote 05: 288 kg ÷ 35 vacas = 8,23 kg MN = 7,29 kg MS ÷ 457,15 kg = **1,595% PV**, contra meta 1,5%). Bezerros ao pé não entram em nenhum denominador do escopo 'lote'.

Mudanças:

- **Migration `20260928120000_peso_vivo_lote_sempre_sem_ao_pe.sql`** (db push): `recalcular_peso_vivo_lote` exclui categorias ao pé do `peso_vivo_kg` de linhas escopo 'lote' incondicionalmente — a exceção "legado sem creep" de `20260923190000` foi removida. Escopo 'creep' inalterado (média só das categorias ao pé). Sem backfill nesta migration: o cron `update_dados_lotes` e novos inserts/edits regravam `peso_vivo_kg` via triggers e `trigger_recalc_pct_pv_on_peso_change` recalcula o %PV em cascata; ou seja, registros existentes convergem para a base nova na próxima passagem do cron.
- **PWA** (detalhes no HISTORICO do repo PWA): denominador por intervalo virou `n_cabecas − qtd_bezerros` e o share/resumo calculam por escopo, com categorias filtradas (adulto exclui ao pé, creep só ao pé).

Efeito colateral aceito: a coluna "Peso Vivo (kg)" da exportação/detalhe passa a mostrar o peso médio adulto em lotes com ao pé (antes era a média de todas as cabeças).

**Disparador**: quando mencionar divergência de CMS/%PV entre texto do PWA e planilha, "consumo por intervalo vs média geral", `qtd_bezerros` no denominador de consumo, ou `peso_vivo_kg` incluindo bezerros, ler esta seção.

## Auditoria do módulo comercial (2026-09-28)

Revisão completa de venda, compra e transferência nas três camadas (PWA, painel, banco). Bugs confirmados foram reproduzidos nas fazendas de teste antes do fix. Migration **`20260928100000_auditoria_modulo_comercial_os.sql`** (db push) concentra as correções de banco:

- **Estoque — entrada em categoria nova**: a categoria nascia com `quant_inicial = N` e `created_at` no dia seguinte; entradas posteriores na mesma data (fêmeas + machos da mesma categoria, duas cargas no mesmo dia) ficavam fora do cutoff e não somavam, e o estorno não zerava a categoria. `update_quant_atual_movimentacao` agora cria a categoria com `quant_base = 0` e `created_at` igual à data da entrada.
- **Peão escalava privilégio**: peões do PWA são `usuario_fazenda` com papel `controller`, então passavam em `user_has_fazenda_access`: podiam fechar/estornar/cancelar/conferir via API e até reabrir OS fechada com UPDATE direto. RPCs agora recusam peão (`caller_is_peao`) e o trigger `trg_os_protege_campos` protege os campos de controle da OS contra escrita direta.
- **Transferência fechava sem embarque**: laudo registrado antes do embarque sincronizar já marcava `recebida`, creditando destino sem débito na origem. Fechamento exige embarque e ao menos uma carga conferida; laudo de transferência só entra com OS `embarcada`/`recebida` (`trg_os_recebimento_guard`), e a transição para `recebida` continua em `trg_os_recebimento_status` (o trigger da migration 27160000 foi substituído).
- **Conferência travada para sempre**: categoria repetida em duas linhas do laudo colidia no `local_id` sintético e a carga nunca conferia. `conferir_recebimento_transferencia` agrega por categoria+sexo, trava a linha `FOR UPDATE`, valida lote de destino e exige acesso à fazenda destino.
- **Laudo conferido editável**: laudo conferido/processado podia ser editado ou excluído pelo PWA, e laudo/movimentação/pesagem podiam apontar para OS de outra fazenda — coberto por guards de `os_fazenda_pertence` e proteção de laudo conferido.
- **Storage aberto**: `documentos-os` e `videos-os` tinham policies bucket-wide para qualquer autenticado. Agora `storage_os_object_access` resolve a OS pelo path (`fazenda_id/os_id/...`) e só libera quem tem acesso a origem ou destino.
- **Retry de sync**: upsert por `local_id` redisparava triggers `BEFORE INSERT` — pesagem remarcava indivíduo estornado como vendido, movimentação de OS fechada falhava para sempre, cada reenvio de comunicado queimava um número de OS.
- **Schema**: CHECK `ordens_servico_destino_so_transferencia` (`fazenda_destino_id` só em transferência) e coluna `os_recebimentos.observacao` (o PWA coletava e o sync descartava por falta de coluna).

Painel (`OrdemServicoDetalhes.tsx`, `FarmSwitcher.tsx`, `fazendaContext.ts`, `osDocumentosService.ts`, novo `utils/parseValorBR.ts` + teste):

- **`parseValorBR`**: o acerto era parseado com `Number(v.replace(',','.'))`, então "157.500" virava 157.5. O parser novo trata milhar BR, "R$", vírgula decimal e decimal com ponto.
- **Botões condizentes com as RPCs**: transferência só mostra "Fechar OS" quando `recebida` com todas as cargas conferidas; "Conferir recebimento" só para quem está no contexto da fazenda destino; "Cancelar" só em `aberta` (com embarque/recebimento o caminho é estornar).
- **FarmSwitcher entre abas**: a troca substitui a sessão compartilhada do Supabase; as outras abas abertas continuavam na fazenda anterior com a sessão nova. Listener de `storage` recarrega as demais abas quando `selectedFazendaId` muda.
- **Exclusão de documento**: soft-delete da linha antes de remover o objeto do storage, com erro explícito quando a RLS não casa nenhuma linha — antes o arquivo podia sumir deixando a GTA "anexada" órfã.

PWA (detalhes no HISTORICO do repo): laudo agrega contagens por categoria (colisão de `local_id`), `getFazendasDoMesmoGrupoCached` com fallback IndexedDB + timeout (menu de transferência sumia offline), retry de embarque faz upsert da movimentação em vez de recriar (débito dobrado por `sessao_id` duplicado), OS estornada volta a aceitar embarque (comparação por `updated_at`), sync só envia `fazenda_destino_id` em transferência e passa a persistir `observacao` do laudo, `validateOrdensServico` rejeita tipo desconhecido, types regenerados.

**Disparador**: quando mencionar auditoria do módulo comercial, `parseValorBR`, `caller_is_peao`, `storage_os_object_access`, `trg_os_protege_campos`, `ordens_servico_destino_so_transferencia`, `os_recebimentos.observacao`, retry de sync queimando número de OS, ou débito dobrado no embarque, ler esta seção.

## Módulo de transferência entre fazendas do grupo (2026-09-27)

Terceiro tipo de ordem de serviço (`tipo='transferencia'`), completando o módulo comercial junto de venda e compra. Uma única OS é compartilhada entre as duas pontas: `ordens_servico.fazenda_id` é a origem e a nova coluna `fazenda_destino_id` é o destino. Trigger `os_transferencia_validar_grupo` exige no banco que destino ≠ origem e que ambas pertençam ao mesmo `grupo_id`; comunicados do PWA sem `fazenda_destino_id` são rejeitados também no `validateOrdensServico` do sync.

Fluxo validado E2E: comunicado no PWA (origem escolhe a fazenda destino) → OS `aberta` → pesagem da origem vinculada à OS gera `Saída/Transferência` com `fazenda_destino_id`, marca indivíduos como `Transferido` e leva a OS a `embarcada` → peão do destino registra laudos de recebimento por carga (mesma caderneta da compra, status `embarcada`/`recebida`, N cargas permitidas), que **não creditam estoque no sync** → controller confere cada carga no painel via RPC `conferir_recebimento_transferencia`, que insere `Entrada/Transferência` no `lote_destino_id` e marca `os_recebimentos.conferido/at/por` → OS `recebida` (trigger `trg_os_recebimento_status`, migration 27160000) → fechamento exige GTA anexada e zero cargas pendentes, grava só `closed_by/at` (sem `valor_acerto`/`data_credito`).

Migrations aplicadas (todas via `db push`):

- **`20260927140000_modulo_transferencia_os.sql`**: `fazenda_destino_id`, validação de grupo, RLS de leitura para a fazenda destino, guarda de sessão única só na saída da origem, `quantidade_embarcada` contando só movimentações da origem, indivíduo `Transferido`, acesso por origem-ou-destino em `fechar`/`cancelar`/`estornar`, fechamento sem acerto com GTA obrigatória e cargas conferidas, notificação estendida ao destino.
- **`20260927150000_transferencia_rls_compartilhada.sql`**: policies que dão a cada ponta visão dos laudos/movimentações/documentos gravados pela outra (`os_recebimentos`, `registros_movimentacao`, `os_documentos` resolvem a OS e checam acesso a `fazenda_id` OU `fazenda_destino_id`).
- **`20260927160000_transferencia_os_status_recebida.sql`**: trigger em `os_recebimentos` que transiciona transferência `embarcada` → `recebida` (o trigger de movimentação não cobre porque a entrada não nasce no sync).
- **`20260927170000_transferencia_fix_conferencia_entrada.sql`**: a RPC de conferência passou a gravar a entrada no padrão da compra (`motivo='Entrada'`, `lote_origem_id` = lote receptor, `tipo_entrada='Transferência'`), porque `trigger_update_quant_atual_movimentacao` sai cedo quando `lote_origem_id` é nulo. Primeira versão com `lote_destino_id` gravava a movimentação mas não atualizava `lote_categorias`.

Painel: `OrdensServico.tsx` lista OS onde a fazenda é origem OU destino (`or(fazenda_id.eq,fazenda_destino_id.eq)`), badge "Transferência" e contraparte "origem → destino". `OrdemServicoDetalhes.tsx` mostra as duas fazendas, separa movimentações "Saída (origem)"/"Entrada (destino)", badge por carga "Pendente de conferência"/"Conferida", modal "Conferir recebimento", tipos de documento GTA/Laudo/Outro, seção de fechamento sem acerto e textos de cancelamento/estorno próprios.

E2E validado (`TRA-2026-00001`, Fazenda Gesta'Up → Gesta'Up Teste, 20 previstas / 3 embarcadas / 2 recebidas + 1 morte): saldos conferidos (origem Lote A boi gordo 125→122, destino L1 199→201 após conferência), OS `fechada` com `closed_by` e `valor_acerto`/`data_credito` nulos. Ressalva conhecida: do lado destino o campo "Responsável" do fechamento renderiza "-" porque o embed `usuarios!closed_by` é barrado por RLS para usuários sem vínculo com a fazenda do responsável.

**Disparador**: quando mencionar transferência entre fazendas, `fazenda_destino_id`, `conferir_recebimento_transferencia`, carga pendente de conferência, `TRA-`, ou fechamento sem acerto, ler esta seção.

## Próxima limpeza no detalhe de bebedouro (2026-09-27)

`BebedourosDetalhes.tsx` agora cruza o payload do PWA com o cadastro do bebedouro para exibir dados de limpeza na seção "Bebedouro". O payload só traz `numero_bebedouro` como texto (sem FK), então o join é `bebedouros.nome = registros_bebedouros.numero_bebedouro` na mesma fazenda (ativo, não deletado) — join frágil a renomeações, herdado de decisão anterior.

- **`loadLimpeza`**: busca `bebedouros` pelo nome, depois `max(historico_limpezas_bebedouros.data_limpeza)`; a última limpeza efetiva é `max(histórico, bebedouros.data_ultima_limpeza)` (a coluna manual do cadastro serve de seed para bebedouros sem histórico).
- **Campos novos**: "Meta de Limpeza" (a cada X dias), "Última Limpeza" (ou "Sem registro"), "Próxima Limpeza" (`ultima + meta`, com sufixo de status: "(hoje)", "(em N dias)" ou "(atrasada há N dias)"). Omitidos quando o bebedouro não é encontrado pelo nome, quando a meta não está configurada ou quando não há ponto de partida para projetar.

**Disparador**: quando mencionar próxima limpeza de bebedouro, meta de limpeza, `meta_intervalo_limpeza`, `historico_limpezas_bebedouros`, ou limpeza atrasada no detalhe do registro, ler esta seção.

## Relatório público + PDF de Clima (2026-09-25)

Novo tipo de relatório público (`tipo='clima'`) sobre `registros_clima`, seguindo a arquitetura dos demais relatórios compartilháveis (token em `relatorios_publicos` → rota `/r/:token` → RPC própria + componente próprio + endpoint PDF Puppeteer).

- **Migration `20260927120000_rpc_relatorio_clima.sql`** (db push): `get_dados_relatorio_clima(p_token, p_data_inicio, p_data_fim)` SECURITY DEFINER no padrão `get_dados_relatorio_tratos`. Retorna `registros` **achatados** via `jsonb_array_elements(medicoes)`: uma linha por medição de pluviômetro (`data` no timezone da fazenda, `horario` com fallback para o horário do registro, `pluviometro_id/nome/localizacao`, `medicao_mm`, `temperatura`, `temperatura_media`, `umidade_relativa`, `responsavel`, `nome_usuario`, `observacao`). `pluviometros_disponiveis` é derivado das medições (não da tabela `pluviometros`) para cobrir pluviômetros inativos/excluídos no histórico. GRANT anon + authenticated.
- **Semântica confirmada pelo usuário**: cada `medicao` é a leitura do pluviômetro desde o último esvaziamento (mm de chuva do período), então somar leituras do mesmo dia/pluviômetro é correto. `observacao` e `responsavel` podem aparecer no relatório público.
- **`RelatorioClimaPublico.tsx`**: página pública com slicers (data início/fim → RPC, pluviômetro multi-select → filtro client), 7 KPIs (mm acumulado, leituras, dias com chuva, temp média/mín/máx, umidade média), ComposedChart recharts (barras mm/dia agrupadas por pluviômetro + linha temperatura média em eixo secundário), tabela resumo por pluviômetro e tabela cronológica de leituras. Helpers de agregação (`calcularKpis`, `resumirPorPluviometro`, `serieDiaria`) exportados e reutilizados pelo payload do PDF.
- **Registro do tipo**: `RelatorioPublico.tsx` (early-return + dispatch) e `RELATORIOS_DISPONIVEIS` em `Relatorios.tsx` (título "Clima", ícone 🌧️).
- **PDF**: `relatorioClimaPDFPuppeteer.ts` (client envia kpis + série diária + resumo + leituras filtradas) → `api/pdf/clima.js`. Página 1: KPIs + gráfico composto Chart.js (barras por pluviômetro no eixo esquerdo + linha temp média no direito, rótulos de mm sobre as barras). Página 2: "Resumo por pluviômetro" + primeiro bloco de "Leituras detalhadas" (orçamento vertical compartilhado, ~9mm/linha). Páginas 3+: continuação das leituras a 15 linhas/página.
- **Teste**: link `9caea29b-e4b9-460c-9b5e-0cf3138e3907` criado na fazenda de testes; RPC retornou 30 linhas achatadas (15 registros × 2 pluviômetros); PDF local gerou 5 páginas/252KB com 40 leituras sintéticas exercitando paginação.

**Disparador**: quando mencionar relatório de clima, pluviômetro no relatório público, `get_dados_relatorio_clima`, `RelatorioClimaPublico`, `api/pdf/clima`, ou "relatório de chuva/pluviometria", ler esta seção.

## Comunicados de compra e venda simplificados (2026-09-27)

Os comunicados (criados no PWA) viraram mensagens curtas para a equipe de gado. Na compra o formulário caiu de ~30 campos para 8: comprador (quem negociou pela fazenda, coluna `comprador`), empresa (quem vendeu, coluna `fornecedor`), quantidade, sexo, era, data de embarque (`data_saida`) e data de chegada na fazenda (`data_prevista_embarque`), mais observação opcional. Na venda só o label COMPRADOR virou EMPRESA. As colunas removidas permanecem no schema, nullable como antes, e `compra_detalhes` deixa de ser preenchido.

No painel (`CompraDetalhesView` em `OrdemServicoDetalhes.tsx`), a seção do comunicado de compra passou a mostrar Comprador e Empresa e tornou condicionais os campos legados (origem/município, bloco Preço e Pagamento inteiro, transporte, corretagem), então OS antigas seguem exibindo tudo que foi preenchido e as novas saem limpas.

**Disparador**: quando mencionar comunicado simplificado, campos removidos da compra, EMPRESA no lugar de fornecedor no detalhe da OS, ler esta seção.

## Badge "Creep Feeding" no PDF de consumo (2026-09-25)

O relatório público de consumo marcava lotes creep com um badge âmbar na web, mas no PDF a distinção existia apenas como sufixo de texto no nome do lote ("Lote X — Creep Feeding"). Agora o escopo viaja como campo de dados até o endpoint e vira um badge visual de verdade.

- **`RelatorioConsumoPublico.tsx`**: `exportarPDF` deixou de concatenar o sufixo ao `lote_nome`; passa `escopo: l.escopo` dentro de `info`.
- **`relatorioConsumoPDFPuppeteer.ts`**: `escopo` incluído no payload enviado ao `/api/pdf/consumo`.
- **`api/pdf/_shared/template.js`**: `renderHeader` ganhou parâmetro opcional `sectionBadge` e o `BASE_CSS` ganhou `.header-badge` (chip âmbar `#fbbf24`/`#78350f`, alinhado à direita sob o nome da seção). Qualquer relatório Puppeteer pode usar.
- **`api/pdf/consumo.js`**: passa `sectionBadge: 'Creep Feeding'` quando `info.escopo === 'creep'`; aparece também nas páginas de continuação do lote.

**Disparador**: quando mencionar badge de creep no PDF, `sectionBadge`, `header-badge`, ou diferenciação adulto/creep em relatório PDF, ler esta seção.

## Módulo de Compra: OS de compra + recebimento por carga (2026-09-27)

Implementada a segunda operação comercial sobre a arquitetura de OS criada para a venda: o PWA emite o comunicado de compra, cada caminhão gera um laudo de recebimento próprio (uma GTA por veículo, exigência legal), e o painel acompanha recebimentos, divergências e fechamento.

- **Migrations** (`supabase/migrations/`): `20260925120000_modulo_compra_os.sql` (status `recebida` no CHECK de `ordens_servico`, colunas comerciais de compra — `fornecedor`, `origem_fazenda`, `origem_municipio_uf`, `modo_preco`, `valor_total_previsto`, `forma_pagamento`, `data_saida`, `valor_frete`, `mortes_transporte`, `divergencia_obs`, `compra_detalhes` jsonb —, tabela `os_recebimentos` para um laudo por caminhão/GTA, `os_recebimento_id` em `os_documentos`/`registros_movimentacao`, triggers de status e guardas por tipo, RPCs `fechar_os_venda`/`cancelar_os_venda`/`estornar_baixa_os` estendidas para compra — fechamento exige GTA anexada, estorno reverte entradas e laudos), `20260926170000_bucket_videos_os.sql` (bucket `videos-os` 500 MB para o vídeo de descarregamento, já que `documentos-os` só aceita imagem/PDF até 15 MB; coluna `os_documentos.bucket` registra a origem para signed URL), `20260926171000_os_recebimentos_lote_destino.sql` (`lote_destino_id`/`lote_destino` no recebimento).
- **Convenção de schema confirmada em teste**: para `registros_movimentacao` com `motivo='Entrada'`, o lote receptor vai em `lote_origem_id` (não `lote_destino_id`); `calculate_quant_atual` soma entradas por `lote_origem_id`. O PWA e o estorno seguem essa convenção.
- **Painel** (`OrdensServico.tsx`, `OrdemServicoDetalhes.tsx`): lista ganhou status `recebida`, busca por fornecedor/origem e labels tipo-aware ("Comprador/Fornecedor", "proc./prev."). Detalhe mostra o comunicado de compra completo (origem, animais, preço por KG/UA, pagamento, transporte, corretagem, nutrição e despesas via `compra_detalhes`), os laudos de recebimento por carga (GTA, NF, placas, contagens F/M por categoria, balanço médio, checklist diagnóstico expansível, vídeo embutido via signed URL do bucket correto), o bloco Divergência (previsto vs recebido, mortes, quebra de transporte peso origem vs chegada), upload de GTA/NF/laudo e as mesmas ações de fechar/cancelar/estornar com textos de compra.
- **RBAC**: `comunicado-compra` e `recebimento-compra` adicionadas à lista de cadernetas (`src/utils/cadernetas.ts`) para liberação por peão.

**Disparador**: quando mencionar compra de gado, recebimento de carga, laudo de chegada, GTA, `os_recebimentos`, `recebida`, `videos-os`, `compra_detalhes`, divergência de recebimento ou quebra de transporte, ler esta seção.

## Importação KML/KMZ com match de pastos + tela de revisão (2026-09-25)

Problema: arquivos KML/KMZ de fazendas trazem centenas de geometrias e o fluxo exigia clicar uma a uma para associar ao pasto cadastrado, inviável para imports grandes (Bom Jesus: 923 placemarks). Implementado pipeline import → parse enriquecido → match automático por nome → tela de revisão obrigatória → apply em lote, sem nenhuma escrita antes da confirmação.

- **`importKml.ts`**: parse centralizado (KMZ via `fflate`, KML direto, sanitização de namespaces `xsi:`) com três enriquecimentos que o `togeojson` não dá: nome do `<Folder>` de origem por placemark (mapeado pela ordem DOM↔features, com fallback quando os tamanhos divergem), `nomeLimpo` (nome sem sufixo de medida tipo "  66,02 ha"; nomes puramente numéricos viram null) e flatten de `GeometryCollection`/`Multi*` em geometrias simples com `__importId` estável nas properties. Identidade do clique passa a ser `__importId` (antes: match por tipo+nome+coordenada, que quebrava em GeometryCollection e duplicatas).
- **`nomeMatch.ts`**: `normalizarNome` (uppercase, sem diacríticos, dígitos zero-padded, só `[A-Z0-9]`; resolve `"1. TIP 01"`↔`"1TIP01"`, `"MI-17/B"`↔`"MI-17 B"`) e `sugerirMatches` em 3 tiers: canonical exato → `auto`; contenção única (includes, len>=3) → `sugestao`; Levenshtein >=0,85 em strings >=5 chars → `sugestao`/`ambiguo`. Pasto que já tem geometria nunca vira `auto` (mostra "(substitui geometria)"). `linhasEmConflito` marca 2+ linhas ativas no mesmo pasto e bloqueia o apply.
- **`ImportFiltroModal.tsx`**: etapa de seleção de pastas logo após o parse (antes de qualquer feature entrar no mapa): checkbox por pasta com contagem por tipo de geometria, marcar/desmarcar todas; só as pastas escolhidas viram `itensImportados` e alimentam o match — as demais nem pesam a camada nem o DOM. Arquivo com uma única pasta pula direto para a revisão. `handleFileImport` no hook virou parse puro; `aplicarItensImportados` commita a camada e enquadra o mapa.
- **`ImportRevisaoModal.tsx`**: revisão agrupada por pasta, todas colapsadas por padrão (cabeçalho mostra "N itens · X exatos · Y aprox. · Z ambíguos" para localizar matches sem expandir), contadores gerais, ação "Ignorar pasta" para descarte em massa (APP, Reserva Legal), select por linha com optgroup "Sugeridos" + todos os pastos, ignore por linha, conflitos destacados bloqueando o botão, apply sequencial com progresso e retry marcado nas linhas que falharem.
- **`MapaFazenda.tsx`/`useMapGeolocalizacao.ts`**: `handleFileImport` retorna os itens e dispara match+modal só para polígonos; `handleAplicarRevisao` chama `salvar_geometria_pasto` por linha confirmada, remove itens aplicados da camada e recarrega dados; pontos importados agora rodam `encontrar_pasto_por_ponto` no clique (antes era dead-end, sempre caía em "ponto fora de qualquer pasto"); `fitBounds` cobre qualquer tipo de geometria via `extrairCoordenadas`. LineStrings e pontos seguem o fluxo manual de clique existente.
- **Teste na Mirandópolis** (fazenda real com os 106 pastos do arquivo, autorizada pelo usuário com escopo limitado ao mapa): `Grupo Bom Jesus.kmz` produziu 90 exatos / 13 aproximados / 5 ambíguos / 14 linhas em conflito (SL-13 A/B/C → SL-13 e duplicata `MI-27-B` no arquivo). Após ignorar conflitos e 3 matches incertos (`MI-XX TESTE`), aplicadas 86 associações com sucesso; verificado no banco que as áreas gravadas batem com os nomes do arquivo (ex: `1. TIP 10` = 25,51 ha). Reimportação subsequente mostrou corretamente os pastos aplicados como "(substitui geometria)".
- **Unit tests**: `nomeMatch.test.ts` com 17 casos (normalização, extração de nome útil, tiers de match, conflitos).

**Disparador**: quando mencionar import KML/KMZ, match de pastos por nome, tela de revisão de importação, `nomeMatch`, `importKml`, `ImportRevisaoModal`, `__importId`, ou associação em lote de geometrias, ler esta seção.

## Melhorias de UX e recursos na importação KML/KMZ (2026-09-25)

Três melhorias implementadas sobre o pipeline de importação (lista completa em `MELHORIAS_IMPORTACAO_KML.md`, itens 1 a 3):

- **"Ver no mapa" na revisão**: cada linha da `ImportRevisaoModal` ganhou botão de pin que dispara `onFocarItem` → `handleFocarItemImportado` na página: `fitBounds` na geometria + destaque ciano via source `import-highlight` dedicada em `MapaCamadas` (fill+line para polígonos, linha grossa para LineString, anel para Point). Limpa em `limparImportacao` e quando o item destacado é aplicado. É o mecanismo de conferência visual "esse polígono é mesmo o MI-09 A?" antes de aplicar.
- **Apply paralelo em lotes**: `handleAplicarRevisao` processa `Promise.all` em chunks de 8 RPCs `salvar_geometria_pasto` em vez de sequencial, mantendo progresso por lote e `applyErro` por linha para retry. 89 saves caíram para ~6s no teste real.
- **Nomes úteis no seletor de pastas**: `ImportFiltroModal` conta itens com `nomeLimpo` por pasta ("sem nomes úteis" em âmbar) e inicia desmarcadas as pastas com zero — heurística genérica, sem hardcode de nomes, que resolve o caso "quero só pecuária" num clique.
- **Bug corrigido no teste**: o `useState` da seleção rodava no mount com `itens=[]` (a modal fica montada fechada), então toda pasta abria desmarcada. Seleção inicial agora é recalculada num `useEffect` que dispara quando a modal abre com itens novos.
- **Adições pós-teste**: o pin "ver no mapa" agora também minimiza a modal de revisão (`setShowRevisao(false)`; reabre por "Revisar Associações" com estado preservado). E a revisão ganhou botão-toggle "Ignorar N com geometria" (`onIgnorarComGeometria`): ignora/restaura em massa linhas cujo pasto selecionado já tem geometria, cobrindo o fluxo de reimportação incremental "adicionar só pastos novos". Testado: "Ignorar 89 com geometria" reduziu o apply de 103 para 14 linhas.
- **Segunda rodada de melhorias** (itens 4-7 do documento): busca textual na revisão (filtra por nome do item, pasta ou pasto selecionado; grupos com resultado auto-expandem); `PastoCombobox.tsx` substitui o `<select>` das linhas (dropdown em portal com busca normalizada, seções Sugeridos/Todos); botão-toggle "Ignorar N sem match" para pastas sem nenhum candidato; e desempate de partes multi-geometria via `grupoPlacemark` + `desempatarPartes` (só a maior parte fica pré-selecionada).
- **Item 8 implementado**: migration `20260925150000_salvar_geometrias_pastos.sql` (db push) cria `salvar_geometrias_pastos(p_itens jsonb)`, versão em lote de `salvar_geometria_pasto` com subtransação por item e retorno `{pasto_id, ok, erro}`. `handleAplicarRevisao` usa a RPC única com fallback para os chunks paralelos de 8 se a chamada falhar. Medido na Mirandópolis: 90 geometrias em ~1,9s (vs ~6s em chunks).
- **Navegação de conflitos**: o contador "N em conflito" do topo virou botão que expande todas as pastas com conflitos, e cada cabeçalho de pasta mostra "· N em conflito" em vermelho. Antes os conflitos ficavam invisíveis dentro das pastas colapsadas e o botão Aplicar parecia quebrado (está desabilitado por design enquanto houver conflito).

**Teste ao vivo na Mirandópolis** (geometrias resetadas antes, autorizado): seletor abriu com Lavoura/Pecuaria Atual/Pecuaria Permanente/Soja marcadas (192 itens) e as 10 pastas ambientais/infra desmarcadas; pin do `SL-15` voou até a geometria com contorno ciano; apply de 89 associações em ~6s persistiu corretamente (áreas conferidas: `SL-15` = 79,43 ha, `MI-09 A` = 66,02 ha).

**Disparador**: quando mencionar highlight de importação, "ver no mapa" da revisão, apply paralelo, nomes úteis no seletor de pastas, `importHighlight`, `import-highlight`, ler esta seção.

## Importação KML: geometrias sem associação viram objetos do mapa (2026-09-26)

A importação deixou de descartar geometrias sem match de pasto. Itens de pastas marcadas para "salvar sem associação" persistem como objetos genéricos do mapa, com exclusão por pasta e por linha.

- **Migration `20260926120000_mapa_areas.sql`** (db push): nova tabela `public.mapa_areas` (fazenda_id, nome, tipo = pasta do KML, `extensions.geometry(Polygon,4326)`, ativo, RLS tenant no padrão de mapa_estradas) + RPC `salvar_geometrias_mapa(p_fazenda_id, p_itens jsonb)` que roteia por tipo: `area`→mapa_areas, `estrada`→mapa_estradas, `ponto`→mapa_pontos (subtransação por item, retorna `{idx, ok, erro}`; valida com Force2D/SetSRID/MakeValid e rejeita tipo de geometria incompatível) + `remover_area(p_area_id)` com check `caller_has_fazenda_access` (delete físico, mesmo padrão de `remover_estrada`). Detalhe: a coluna geometry precisa ser `extensions.geometry` porque o PostGIS vive no schema extensions fora do search_path do DDL.
- **Migration `20260926130000_mapa_areas_grants.sql`** (db push): `GRANT SELECT/INSERT/UPDATE/DELETE` para authenticated e anon + `GRANT EXECUTE` nas duas RPCs. A migration original não tinha grants; o PostgREST respondia 403 no SELECT e a camada de áreas carregava vazia (sintoma: fonte `areas-source` existia mas com 0 features e o clique caía na estrada por baixo).
- **`ImportFiltroModal`**: checkbox "salvar sem associação" por pasta, marcado por padrão nas pastas selecionadas (opt-out, já que o pedido era salvar por padrão); desmarcar exclui todos os itens não associados daquela pasta. `onConfirm` agora devolve também o `Set` de pastas optadas.
- **`ImportRevisaoModal`**: recebe `pastasSalvarSemAssoc`; linhas sem pasto de pastas optadas mostram chip de destino "→ área" / "→ estrada" / "→ ponto" conforme o tipo de geometria; "Ignorar" por linha e "Ignorar pasta" excluem do save; footer conta os saves genéricos junto com as associações.
- **`useMapaData`/`types.ts`/`MapaCamadas`**: `AreaMapa` + fetch de `mapa_areas` + `areasGeoJSON`; nova camada `areas-source` (fill/line/labels) com toggle "Áreas" em `visCamadas` e clique que abre popup com nome, pasta e "Remover do mapa" (confirmAction `removerArea` → RPC `remover_area` → reload).
- **`MapaFazenda.handleAplicarRevisao`**: alvos = linhas não ignoradas com `pastoSelecionado` OU em pasta optada; associadas vão para `salvar_geometrias_pastos`, não associadas para `salvar_geometrias_mapa` com `{tipo, nome, categoria: pasta, geojson}`; sucesso remove da camada, falha fica na linha com `applyErro`.
- **Teste ao vivo na Bom Jesus** (produção, autorizado): filtro com Cocho(17 linhas)/Estrada(41)/Sede(1 ponto)/Servidão(3 polígonos), "salvar sem associação" desmarcado só em Cocho; revisão mostrou 45 itens "como geometrias do mapa"; ignorei 1 polígono de Servidão; apply gravou 2 áreas + 41 estradas + 1 ponto e o clique na área abriu popup e removeu (2→1 no banco).
- **Dedupe `20260926140000_salvar_geometrias_mapa_dedupe.sql`** (db push): `salvar_geometrias_mapa` recriada com retorno `{idx, ok, duplicada, erro}`; antes de inserir checa `EXISTS` na tabela de destino com `geometria && v_geom AND ST_Equals(...)` para a mesma fazenda ativa — cobre reimportação do mesmo arquivo, arquivos sobrepostos e duplicatas dentro do próprio lote. Duplicata retorna ok=true + duplicada=true (linha sai da camada, nada é inserido) e a mensagem do apply mostra "N já existia(m) (ignorada(s))". Na revisão, linhas sem pasto cuja geometria coincide com uma já salva ganham chip "já no mapa" (assinatura por coordenadas serializadas, via `geometriasExistentes` em MapaFazenda). Testado: reimportar Estrada Atual e aplicar as 41 linhas deixou o banco em exatamente 41 estradas. Pastos não precisam de dedupe (o save é UPDATE idempotente).

**Disparador**: quando mencionar `mapa_areas`, "salvar sem associação", geometrias importadas sem pasto, áreas genéricas do mapa, `salvar_geometrias_mapa`, `remover_area`, ou a camada "Áreas", ler esta seção.

## Estorno manual de movimentação ENFERMARIA → LOTE 13 na Chibata (2026-09-24)

A pedido do usuário, a movimentação `616ff98e-d0b5-422b-900a-551241d6f09a` (03/09/2026, ENFERMARIA → LOTE 13, 1 vaca, subtipo "Apartação", responsável Carlos) foi soft-deletada e os saldos revertidos via MCP, seguindo o padrão de `estornar_baixa_os` (a RPC só cobre movimentações com `os_id`; esta era avulsa). `deleted_at` setado + `quant_atual` recalculado com `calculate_quant_atual` nos dois pares (lote, categoria): ENFERMARIA/vaca 0→1, LOTE 13/vaca 136→135. Simulado antes com BEGIN/ROLLBACK. Atenção para estornos futuros: o trigger `trigger_update_quant_atual_movimentacao` só dispara em INSERT, então UPDATE de `deleted_at` não reverte `quant_atual` sozinho — o recálculo manual dos pares afetados é obrigatório.

**Disparador**: quando mencionar estorno/exclusão de movimentação, reverter entrada/saída de lote, `quant_atual` divergente após deletar movimentação, ou a movimentação da vaca na Chibata, ler esta seção.

## Tratos: participação por ocupação lote-curral + feed target do dia 1 por ocupação (2026-09-24)

Redesenho do módulo de tratos seguindo o padrão de mercado (Performance Beef, feedIT, TGC): o curral entra na folha pela ocupação física de um lote do sistema correspondente, e a programação vira só cronograma (tratos, percentuais, horários). Substitui o modelo anterior em que `programacao_tratos_currais` era um snapshot por vigência que acoplaba "quem participa" ao cronograma, origem dos bugs da Jacamim. Implementado nas branches `feat/tratos-ocupacao` dos dois repos.

- **Schema** (`20260925100000_lote_curral_historico_ocupacao.sql`): nova `lote_curral_historico` (fazenda, lote, curral, `data_inicial`, `data_final`, `kg_mn_dia_dia1`) com RLS escopada por `usuario_fazenda`, índice único parcial de uma ocupação aberta por curral (trocas no mesmo dia se sobrepõem legitimamente no limite; a resolução por data usa a maior `data_inicial`). Trigger `trg_currais_lote_historico` em `currais.lote_id` fecha a ocupação aberta ao trocar/limpar e abre uma nova ao setar, com `data_inicial` no fuso da fazenda. Trigger de compatibilidade `trg_lch_sync_programacao_currais` espelha ocupações abertas em `programacao_tratos_currais` das vigências presentes/futuras, para PWAs antigos até a janela de transição (remover depois). RPC `alocar_lote_curral` faz alocação atômica com validações (sistema Confinamento/TIP/Sequestro, curral livre, mesma fazenda, acesso) + data de entrada e feed target opcionais. `aprovar_solicitacao_novo_lote` passou a vincular curral também para TIP e Sequestro.
- **Backfill** (pontual, MCP): 24 ocupações abertas criadas a partir de `currais.lote_id`, com `data_inicial` inferida do primeiro registro de trato do curral e `kg_mn_dia_dia1` do snapshot mais recente (7 com kg). Ensaiado em transação com ROLLBACK na fazenda de testes antes do commit.
- **`programacaoTratosService`**: `saveProgramacaoTratos` deixou de aceitar currais; a vigência é versionamento de cronograma (match por `data_inicio`; `data_fim` derivada da próxima versão ou `9999-12-31`, sobrepostas resolvidas). Novas funções `getOcupacoesEmTrato`, `getOcupacoesNaData`, `setOcupacaoKgDia1`, `setOcupacaoDataInicial`. `ProgramacaoCurral` removido.
- **`lancamentoTratosService`**: a folha lista ocupações cobrindo a data filtradas por `sistema_producao` do tipo; dia 1 é por ocupação (`totalUltimoDiaDaOcupacao` só conta registros desde a entrada do lote atual, então lote novo reinicia o baseline); `kgMnDia` é nullable e ocupação sem alvo mostra "a definir" em vez de planejar zero.
- **`acompanhamentoTratosService`**: `fetchPlanejadoPorLote` e o planejamento da fábrica derivam a janela `[data_inicial, data_final]` de cada ocupação; dias com execução usam o `kg_planejado` gravado no registro.
- **UI painel**: `ProgramacaoTratos.tsx` separado em "Cronograma de tratos" (sem data de fim, "aplicar a partir de", chips de versões) + "Currais em trato" (ocupações abertas com entrada read-only e alvo MN dia 1 editável, save próprio) + leitura de cocho intacta. `Currais.tsx` ganhou campo opcional de alvo dia 1 e aloca via RPC quando o curral está vazio (troca/remoção segue pelo trigger). `Lotes.tsx` só mexe na ocupação quando o curral realmente muda (edição comum não reinicia o dia 1) e usa a RPC nas novas alocações. `usaCurral` inclui Sequestro.
- **PWA** (repo `Caderneta-Digital-Gesta-Up`, mesma branch): `getOcupacoesCurralNaData` + cache offline `getOcupacoesCurralNaDataCached`; `TratoConfinamentoPage` lista por ocupação com aba TIP nova, dia 1 por ocupação e "a definir" para alvo ausente; `FabricaConfinamentoPage` filtra dietas pelo sistema do tipo e planeja por ocupação com `kgBaseDia` nullable; `MovimentacaoPage` exige curral para Confinamento/TIP/Sequestro; warm-up de cache passa a usar datas no fuso da fazenda (antes UTC: entre 20h e 23h59 locais as chaves não batiam e a folha offline ficava vazia).
- **Compatibilidade**: `programacao_tratos_currais` continua existindo como espelho para clientes antigos; o único consumidor interno restante é `clonarVigencia` (copia o espelho ao dividir vigência). Limitação conhecida: vigência futura nova só recebe espelho no próximo evento de ocupação.

**Disparador**: quando mencionar ocupação de curral, `lote_curral_historico`, feed target, dia 1 do trato, "a definir" na folha, `alocar_lote_curral`, ou participação de curral na folha de tratos, ler esta seção.

## Programação de tratos: currais filtrados por sistema do lote + vigências sem sobreposição (2026-09-24)

Dois bugs reportados na Fazenda Jacamim, mesma raiz parcial: o modelo de vigências de `programacao_tratos` não tinha ciclo de vida.

- **Currais de outro sistema na aba errada**: `getCurraisFazenda` (`programacaoTratosService.ts`) não trazia o `sistema_producao` do lote e `ProgramacaoTratos.tsx` exibia qualquer curral com `lote_id`. Agora o serviço retorna `lote_sistema`, a página filtra por `SISTEMA_POR_TIPO` (confinamento→Confinamento, sequestro→Sequestro, tip→TIP) e currais salvos com lote de sistema divergente continuam visíveis com badge vermelho do sistema real, para permitir limpeza.
- **Vigências sobrepostas**: `saveProgramacaoTratos` só atualizava vigência idêntica e, caso contrário, inseria uma nova ativa com `data_fim` infinito sem fechar a anterior. A resolução "maior `data_inicio <= data` vence" (igual no PWA, `getProgramacaoTratosCompleta`) fazia a vigência nova sombrear a antiga com lista de currais parcial: foi o que fez o Lote 03 (TIP 33) sumir da folha a partir de 16/09. Agora o save resolve sobreposições antes de inserir: trunca `data_fim` das anteriores, adia `data_inicio` das posteriores, desativa as contidas e divide (clonando percentuais/currais) as que contêm o intervalo novo.
- **UI**: a página lista as vigências ativas do tipo com badge "vigente"/"em edição" e avisa quando as datas vão criar vigência nova com ajuste automático das sobrepostas.
- **Constraint** (`20260924150000_programacao_tratos_sem_sobreposicao.sql`): exclusion constraint `programacao_tratos_sem_sobreposicao` em `(fazenda_id, tipo, daterange(data_inicio, data_fim, '[]')) WHERE ativo`, via `btree_gist`. Garantia no banco de que vigências ativas do mesmo tipo nunca se sobrepõem.
- **Dados Jacamim** (pontual, via MCP): confinamento tinha 4 vigências idênticas e sem currais (mantida só a de 10/09, demais desativadas); TIP remontado em cadeia contínua: 10–15/09 e 16–18/09 com TIP 41+42, 19/09→∞ com TIP 33/41/42 (Lote 03 entrou em 19/09). Detalhe encontrado: os lançamentos reais de 10–18/09 apontavam para programações de tipo confinamento com currais TIP, resquício do primeiro bug.
- **Resíduos corrigidos na mesma sessão**: (a) `fetchPlanejadoPorLote` não filtrava `ativo`, então vigências desativadas continuavam gerando linhas "planejado/sem execução" no acompanhamento; (b) `carregarLancamentoTratos` usava `programacao_tratos_currais.lote_id` (snapshot do save) para cálculo e gravação enquanto exibia o lote atual do curral — divergência quando o lote do curral mudava; agora o lote efetivo é `currais.lote_id` e linhas cujo lote atual tem `sistema_producao` divergente do tipo são puladas; (c) `hojeISO`/`dataHojeISO` e os filtros de dia sobre `registros_oferta_trato` usavam meia-noite UTC — entre 20h e 23h59 de Cuiabá "hoje" resolvia para o dia seguinte; corrigido com `toFarmDateOnly` e o novo `getDayBoundsInTimezone` em `formatDate.ts`, aplicado em `fetchRealPorLoteDia`, `fetchDetalheTratosPorLote`, `fetchHorariosTratos` e `fetchFabricaAcompanhamento`.

**Disparador**: quando mencionar vigência de tratos, programação sobreposta, curral sumindo da folha de trato, `programacao_tratos_sem_sobreposicao` ou "lote não aparece no lançamento", ler esta seção.

## Soft-delete passa a gravar ativo=false + guarda de nome duplicado em pastos (2026-09-24)

Bug reportado no PWA: "Pasto não encontrado" na caderneta de pastagens da Santa Vitória. Causa raiz: o delete deste repo setava só `deleted_at`, mantendo `ativo=true`; o PWA filtrava só `ativo` e ignorava `deleted_at`, então entidades excluídas aqui continuavam vivas lá, e o lookup por nome (`.single()`) estourava com duplicata.

- `Pastos.tsx`: `handleDeleteConfirm` grava `ativo: false` junto com `deleted_at`; `handleSubmit` bloqueia criar/renomear para nome já existente na fazenda (case-insensitive, via estado `pastos`); feedback via `useToast`. A importação Excel também foi corrigida: `existingNames` só era montado a partir do banco e nunca recebia os nomes aceitos durante o loop, então uma planilha com o mesmo nome em duas linhas inseria as duas — agora cada nome aceito entra no set.
- Mesma correção em `Lotes.tsx` (delete de lote), `Racas.tsx`, `Currais.tsx` (linha de confinamento e curral) e `services/atividadesService.ts` (`deleteAtividade`). `ModulosPastos.tsx`, `Formulacoes.tsx`, `CadastrosAuxiliares.tsx`, `EstoqueCombustivel.tsx`, `Medicamentos.tsx` e afins já gravavam os dois campos. `notificacoes` e `os_documentos` não têm coluna `ativo` e permanecem só com `deleted_at`.
- Limpeza de dados via MCP: `ativo=false` nas 39 linhas com `deleted_at` preenchido e `ativo=true` remanescentes (3 pastos, 6 bebedouros, 30 atividades) + soft-delete do Pasto 5 duplicado da Santa Vitória.
- Índice único parcial aplicado em 24/09/2026 via `supabase/migrations/20260924090000_pastos_unique_index_nome_fazenda.sql` (`ux_pastos_fazenda_nome_ativo` em `(fazenda_id, lower(nome)) WHERE deleted_at IS NULL`). Os duplicados vivos que bloqueavam foram resolvidos mantendo o registro mais recente de cada par (decisão do usuário): mantidos `b521620a` ("111", 4.00 ha) e `a5ed9523` ("Lajeado 1B", 8.31 ha); soft-deletados `acda7322` e `954ed89d`.
- Lado do PWA: ver entrada correspondente no repo `Caderneta-Digital-Gesta-Up` (filtro `deleted_at` nas leituras + lookups tolerantes a duplicata).

**Disparador**: quando mencionar divergência `ativo`/`deleted_at`, soft-delete de pasto/lote/raça/curral/atividade, "pasto não encontrado" ou duplicata de cadastro, ler esta seção.

## Creep feeding: formulações exclusivas + suplementação por escopo (2026-09-23)

Bezerro(a) ao pé passou a ter dieta e suplementação próprias, separadas das categorias adultas do mesmo lote. O usuário pode suplementar só o lote, só o creep, ou ambos no mesmo lançamento; cada alvo gera uma linha própria em `registros_suplementacao` e aparece separado no relatório público de consumo.

- **Schema** (`20260923140000_creep_feeding.sql`): `formulacoes.e_creep` marca formulações exclusivas para creep; `registros_suplementacao.escopo` ('lote'/'creep', default 'lote') particiona a série e `grupo_operacao` (text) liga as duas linhas de um lançamento combinado. `lote_categorias.formulacao_id` passa a carregar a dieta creep da categoria ao pé (as RPCs de plano já excluíam essas categorias dos updates, então a coluna estava livre).
- **Guards**: `fn_valida_creep_categoria_gmd` (fcg creep só aceita bezerro/bezerra ao pé, e formulação normal nunca aceita ao pé), `fn_valida_plano_nao_creep` (creep não entra em `planos_nutricionais`), `fn_lote_categoria_creep_integrity` (BEFORE INSERT/UPDATE em `lote_categorias`: ao pé com formulação não-creep limpa o vínculo, não-ao-pé com creep reponta para a formulação do lote, vínculo creep materializa GMD da fcg + `estrategia_nutricional`).
- **GMD**: `repropagar_gmd_para_lotes` ganhou ramo que propaga GMD de fcg via `lote_categorias.formulacao_id` direto (creep não passa por plano), sem desconto de enfermaria (política Z7). `20260923160000` corrige `fn_set_gmd_bezerro_ao_pe` para só aplicar o default 0.600/0.500 quando `gmd IS NULL` (o trigger disparava depois do de integridade em INSERT e sobrescrevia o GMD da creep).
- **Cálculos escopo-aware**: `calcular_consumo_registro_anterior`, `recalc_consumo_on_cabecas_update`, `recalc_consumo_series` (`20260923170000`, escopo derivado do `e_creep` da formulação), `recalcular_peso_vivo_lote` e `recalcular_pesos_suplementacao_historico` — escopo 'lote' exclui categorias ao pé; escopo 'creep' usa só as ao pé com o GMD próprio delas.
- **Unique index**: `20260923150000` recriou o índice de `registros_suplementacao` incluindo `escopo`, permitindo lote + creep no mesmo dia mesmo com nomes de formulação iguais.
- **Relatório público**: `get_dados_relatorio_consumo` emite uma entrada por `(lote_id, escopo)` — o card creep resolve dieta via `lote_categorias.formulacao_id`, com início = primeiro registro creep, pesos/cabeças/categorias/consumo independentes.
- **Dieta única por lote**: quando o lote tem bezerro **e** bezerra ao pé, ambos recebem a mesma dieta creep. A configuração mora no `PlanoNutricionalLoteModal` (seção "Creep Feeding — Bezerro(a) ao pé" no fim da aba Planos): select único das formulações `e_creep` + opção "Sem creep", gravando `formulacao_id`/`estrategia_nutricional` direto em todas as `lote_categorias` ao pé — sem plano, sem fila, sem tocar a lógica adulta. `Lotes.tsx` mostra a dieta vigente só como info no card da categoria (sem select). A migration `20260923180000_propaga_creep_ao_pe.sql` mantém o invariante em qualquer caminho de escrita: UPDATE numa categoria ao pé propaga `formulacao_id` para as irmãs e INSERT de categoria ao pé nova herda a dieta vigente do lote.
- **Painel**: `Formulacoes.tsx` (toggle creep, categorias restritas, badge+filtro), modais de plano filtrando `e_creep`, `Suplementacao.tsx`/`SuplementacaoDetalhes.tsx`/`exportConfigs.ts` com escopo, `RelatorioConsumoPublico.tsx`/`relatorioConsumoPDF.ts` com card creep.
- **PWA**: ver entrada correspondente no repo `Caderneta-Digital-Gesta-Up` (formulário dual na `SuplementacaoPage` + fan-out no sync por `local_id` derivado `<id>:creep`).
- **Nota de exclusão**: excluir um registro no painel apaga só a linha daquele escopo (a perna pareada do `grupo_operacao` permanece, pois as duas aparecem como registros separados na lista).
- **Fazendas sem creep**: `20260923190000_peso_lote_legado_sem_creep.sql` faz `recalcular_peso_vivo_lote` só excluir categorias ao pé da média do escopo 'lote' quando o lote tem dieta creep vinculada (ao pé ativo + `formulacao_id` para `e_creep`); sem dieta, itera todas as categorias como a versão pré-creep, preservando a série de `peso_vivo_kg` de fazendas com ao pé que não usam creep. No PWA, o payload sem dieta mantém `n_cabecas` total e categorias completas, gravando `qtd_bezerros` com as cabeças reais ao pé (o denominador `n - qtd` isola adultos).
- **Campo legado aposentado**: `lotes.qtd_bezerros` e `lote_categorias.qtd_bezerros` eram alimentados por um input que não existe mais — deixaram de ser considerados. `LoteCard` exibe "Bezerros ao pé" derivado do `quant_atual` das categorias ao pé (antes lia a coluna legada); `Lotes.tsx` não carrega nem grava mais os campos (form, payload de lote e de categoria, snapshot) e a coluna "Qtd. bezerros" saiu do export XLSX.

**Disparador**: quando mencionar creep feeding, bezerro ao pé com dieta própria, `e_creep`, `escopo`, `grupo_operacao`, cocho do bezerro, ou card creep no relatório, ler esta seção.

## Acabamentos do módulo de OS no painel (2026-09-23)

Itens de borda pendentes do plano do módulo de venda:

- `src/utils/cadernetas.ts` passa a listar `comunicado-venda` ("Comunicado de Venda"), liberando a caderneta no RBAC de funcionários.
- `MovimentacaoDetalhes.tsx` faz join `ordens_servico!os_id(numero_os)` e mostra o número da OS como link para o detalhe da OS quando a movimentação está vinculada.
- `routePrefetch.ts` ganhou prefetch de `/controller/ordens-servico`.
- `Breadcrumbs.tsx` mapeia `ordens-servico` → "Ordens de Serviço" e segmentos UUID → "Detalhes" (o detalhe da OS mostrava o UUID cru no breadcrumb).

## Fechamento de OS exige dados do acerto (2026-09-22)

O teste E2E de venda abate mostrou que a OS podia ser fechada sem `valor_acerto`/`data_credito`: a UI enviava `null` e o RPC aceitava. Corrigido nas duas pontas: `OrdemServicoDetalhes.tsx` valida valor > 0 e data antes de chamar o RPC, e a migration `20260923000002_fechar_os_exige_acerto.sql` recria `fechar_os_venda` rejeitando fechamento sem os dois campos (defesa em profundidade).

**Disparador**: quando mencionar fechamento de OS sem acerto, `fechar_os_venda` ou validação do modal "Fechar OS", ler esta seção.

## Módulo de Venda via Ordem de Serviço (OS) — banco + painel (2026-09-22)

Módulo novo que cobre o fluxo de venda (e já nasce genérico para compra e transferência): o comunicado de venda criado no PWA vira uma OS (`VEN-ano-00000`), a pesagem vinculada à OS gera movimentações de saída que descontam cabeças dos lotes, e o fechamento é manual no painel depois que o acerto cai na conta.

- **Migration `20260922260000_modulo_venda_os.sql`**: tabelas `ordens_servico` (tipo venda/compra/transferencia, status aberta→embarcada→fechada/cancelada, campos do comunicado e do acerto), `os_contadores` (sequencial por fazenda/tipo/ano com `INSERT ... ON CONFLICT` que serializa a numeração) e `os_documentos` (romaneio/acerto/outro). `registros_pesagem` ganhou `os_id` + `individuo_status_anterior`; `registros_movimentacao` ganhou `os_id` + `sessao_id` com CHECK que exige `sessao_id` quando `os_id` está presente.
- **Triggers**: `gerar_numero_os` (VEN/COM/TRA por tipo); `trg_registros_pesagem_upsert_individuo` alterado — com `os_id` nunca cria indivíduo, marca o existente como `Abatido`/`Venda Vivo` conforme `tipo_venda` e guarda o status anterior para o estorno; sem cadastro loga `OS_ANIMAL_SEM_CADASTRO` em `logs_sync_errors`; `trg_movimentacao_os_guard` (BEFORE INSERT) rejeita movimentação em OS fechada/cancelada e rejeita segunda sessão de pesagem na mesma OS (duplo embarque offline); `trg_movimentacao_os_status` (AFTER INSERT/UPDATE OF deleted_at) recalcula `quantidade_embarcada` e transiciona aberta↔embarcada.
- **RPCs `SECURITY DEFINER`**: `fechar_os_venda` (exige embarque, grava `valor_acerto`/`data_credito`/`closed_by`), `cancelar_os_venda` (só OS aberta, com motivo) e `estornar_baixa_os` (soft-delete das movimentações da OS, reverte `individuos` ao status anterior, recalcula `quant_atual` dos pares lote+categoria). As três validam `user_has_fazenda_access`.
- **Storage**: bucket privado `documentos-os` (JPEG/PNG/WebP/PDF, limite 15 MB) com policies `authenticated` por bucket. Caminho dos arquivos: `{fazenda_id}/{os_id}/{timestamp}-{nome}`; leitura via signed URL de 1h.
- **Notificações**: `notify_os_criada` e `notify_os_embarcada` avisam controllers/admins da fazenda (mesmo padrão de `solicitacoes_novo_lote`), com `acao_url` apontando para `/controller/ordens-servico/:id`.
- **Painel**: páginas `OrdensServico.tsx` (lista com filtro por tipo/status/busca, badges de status) e `OrdemServicoDetalhes.tsx` (seções Informações Gerais, Comunicado, Embarque com movimentações e contagem de animais pesados, Documentos com upload, Acerto/Fechamento). Ações por status: cancelar (aberta, com motivo), estornar baixa e fechar (embarcada/aguardando_pagamento). Rotas `/controller/ordens-servico[/:id]` e novo grupo "Comercial" no menu do `ControllerLayout`.
- **Compressão de documentos**: `src/utils/comprimirDocumento.ts` comprime imagens via canvas (máx. 1920px, JPEG q0.8, fundo branco para PNG/WebP com transparência) antes do upload; PDF sobe direto. `osDocumentosService.ts` faz upload + insert em `os_documentos` e remove o arquivo do bucket se o insert falhar.

**Disparador**: quando mencionar OS, ordem de serviço, comunicado de venda, romaneio, acerto, embarque, `ordens_servico`, `os_documentos`, `fechar_os_venda`, `estornar_baixa_os` ou `documentos-os`, ler esta seção.

## Classificação de sistema do lote unificada + filtro TIP na lista (2026-09-22)

O badge do `LoteCard` e o `RevisarNovoLoteModal` usavam `sistema_producao === 'Confinamento'` literal, enquanto o filtro, o formulário e a validação de `Lotes.tsx` já usavam a regra ampla (Confinamento ou TIP usam curral). Resultado: lote TIP em curral aparecia no filtro Confinamento mas com badge "Pasto", e a aprovação de solicitação de lote TIP exigia pasto em vez de curral.

- **`src/utils/lotes.ts`**: novo util com `usaCurral(sistema)` (`'Confinamento' || 'TIP'`), fonte única da regra, importado por `Lotes.tsx`, `LoteCard.tsx` e `RevisarNovoLoteModal.tsx`.
- **`LoteFilters.tsx` + `Lotes.tsx`**: novo filtro "TIP" ao lado de Confinamento. O filtro "Confinamento" foi estreitado para `sistema = 'Confinamento'` (antes agrupava TIP via `usaCurral`), então Todos/Pasto/Confinamento/TIP particionam a lista sem sobreposição.
- **`LoteCard.tsx`**: badge passa a exibir o rótulo específico (TIP/Confinamento/Pasto) com cores distintas: âmbar = Confinamento, sky = TIP, verde = Pasto.
- **Dados (migração pontual via MCP, sem arquivo)**: na fazenda Jacamim, 34 lotes TIP em pasto viraram `Recria` e 2 lotes com "rip" no nome viraram `RIP`; Lote 01 e Lote 02 permanecem TIP nos currais TIP 41/42.

**Disparador**: quando mencionar badge do card de lote, filtro TIP, `usaCurral` ou sistema de produção do lote, ler esta seção.

## Rename do tipo de programação 'engorda' → 'confinamento' (2026-09-22)

Migration `20260922250000_rename_tipo_engorda_confinamento.sql`. O tipo de programação de tratos `'engorda'` foi renomeado para `'confinamento'`, alinhando o vocabulário ao tipo de lote já usado no sistema. O rename foi aplicado em todas as pontas porque o valor é compartilhado entre painel, PWA e edge function.

- **Banco**: `programacao_tratos_tipo_check` recriada com `('confinamento','sequestro','tip')` — o UPDATE de backfill roda entre o DROP e o ADD do CHECK porque o ADD valida as linhas existentes. DEFAULT da coluna passou a `'confinamento'`. `registros_fabrica_confinamento.tipo` (snapshot do mesmo domínio, sem CHECK) também foi backfilled e teve o DEFAULT alterado, mantendo o filtro de tipo do Acompanhamento consistente com o histórico.
- **Painel**: `TipoProgramacao`, `ProgramacaoTratos.tsx`, `LancamentoTratos.tsx` e `AcompanhamentoTratos.tsx` (filtro de tipo) atualizados.
- **PWA**: `TratoConfinamentoPage`, `FabricaConfinamentoPage`, `ProgramacaoHojePage` (prioridade), `cadastroCache` (fallback) e `syncService` (fallback de `registros_fabrica_confinamento.tipo`) atualizados. Listas de tipos em cache com 'engorda' se autocorrigem: o valor desconhecido é filtrado por `TIPOS_PROGRAMACAO` e cai no fallback.
- **Edge function** `lembrete-tratos-diario`: prioriza `'confinamento'` (com fallback para qualquer tipo ativo) — redeploy feito via `supabase functions deploy`.
- **Ressaca**: PWAs não atualizados continuam consultando `tipo='engorda'` e não encontram programação até atualizar o app; registros `fabrica-confinamento` pendentes no IndexedDB com `tipo='engorda'` ainda sincronizam (a coluna não tem CHECK) mas ficam com o valor antigo — re-rodar o UPDATE se necessário.

**Disparador**: quando mencionar tipo de programação, rename engorda/confinamento, `programacao_tratos.tipo` ou `registros_fabrica_confinamento.tipo`, ler esta seção.

## Filtro de currais na tabela de MN Dia 1 em Configuração de Tratos (2026-09-22)

A tabela "Quantidade total de MN (kg) por curral, Dia 1" em `ProgramacaoTratos.tsx` listava todos os currais ativos da fazenda, incluindo os vazios.

- **`ProgramacaoTratos.tsx`**: novo memo `curraisExibidos` filtra a exibição para currais com `lote_id` ocupado OU com kg de MN salvo (`valor_salvo`, flag congelada no `loadData` via `kgPorCurral[c.id] !== undefined`). Linhas, total geral e estado vazio usam a lista filtrada.
- `valor_salvo` é congelado no carregamento (não deriva do campo editável), então a linha de um curral sem lote não some ao limpar o input; ela desaparece só no próximo carregamento após salvar vazio.
- O `handleSalvar` continua persistindo apenas linhas com `kg_mn_dia > 0`, então limpar um valor órfão e salvar remove o registro do banco.

## Fusão dinâmica das tabelas de detalhamento nos relatórios de Abastecimento e Mortalidade (2026-09-22)

No infográfico mensal (e no relatório avulso), o Detalhamento Operacional sempre abria página própria mesmo quando a última página do Detalhamento por Máquina/Veículo ficava quase vazia, deixando as duas tabelas visualmente distantes.

- **`api/pdf/abastecimento.js`**: portado o mesmo mecanismo de fusão do `morte.js` (`mergeDetail`) e do `bebedouros.js` (`semRegistroNaUltimaPagina`). Estimativas de altura em mm (novas constantes `TABLE_CONTENT_H`, `TABLE_TITLE_H`, `TABLE_HEAD_H`, `TABLE_GAP_H`, `DETAIL_ROW_H`, `OPER_MERGE_MIN_ROWS`): calcula-se quantas linhas operacionais cabem após a última página da tabela 1 e elas são fundidas nela; o restante segue em páginas próprias com a faixa "exibindo X–Y" correta. Fusão só acontece quando cabem ao menos 3 linhas.
- `detailTable2Html` passou a ser invocada pelo helper `operTableBlock(chunk, startRow)`, compartilhado entre a página fundida e as dedicadas.
- **`api/pdf/morte.js`**: o `mergeDetail` existente só disparava com `diagPageCount === 1`; com 13–24 diagnósticos (duas páginas) a segunda ficava quase vazia e o detalhamento abria página nova. A estimativa passou a usar o tamanho do último chunk de diagnósticos (`lastDiagLen`) e a fusão acontece na última página de diagnósticos qualquer que seja o número de páginas.
- Auditoria dos demais relatórios: `relatorioAtividadesPDF`/`relatorioPlanosPDF` (jsPDF) já fluem com cursor y + `addPage` condicional; `relatorioTratosPDF` enche a página 1 com dois gráficos; `consumo.js`/`boletimRebanho.js` são uma página por lote/local por design; os geradores jsPDF legados de abastecimento/morte/consumo/bebedouros não têm chamadores (só tipos e `carregarLogoComoBase64` são importados).
- Comportamento verificado com payloads sintéticos: abastecimento com 5 máquinas → 3 páginas (antes 4), tabelas na mesma folha; 20/30 máquinas → fusão parcial com ranges corretos; morte com 13 diagnósticos + 20 registros → 5 páginas (antes 6) com "exibindo 1–15" fundido e continuação "16–20".

**Disparador**: quando mencionar tabelas de detalhamento do abastecimento, fusão de páginas no PDF, "detalhamento operacional longe da tabela de máquinas", `operMergedCount` ou `mergeDetail`, ler esta seção.

## Logo da fazenda ampliada nos relatórios PDF (2026-09-22)

A logo da fazenda no cabeçalho dos relatórios ficava visualmente menor que a da GestaUp (`.brand-logo`, 60×60 fixo): `.farm-logo` limitava a 120×60px, então logos retangulares encolhiam na altura.

- **`api/pdf/_shared/template.js`** (`BASE_CSS`): `.farm-logo` passou a `max-width:150px; max-height:75px` (levemente maior que a da gestão, como pedido; `object-fit:contain` preserva proporção). Vale para todas as páginas de todos os relatórios e para a página "Sem registros" do infográfico, que usa as mesmas classes.
- **`api/pdf/_shared/reportComposer.js`**: boxes da logo da fazenda na capa e na página final igualados ao da empresa (32mm → 36mm).

## Coluna "Real (kg)" na aba Pontualidade do Acompanhamento de Tratos (2026-09-22)

A tabela "Detalhamento por trato" da aba Pontualidade (`AcompanhamentoTratos.tsx`) mostrava horários e desvio mas não a quantidade efetivamente tratada.

- **`acompanhamentoTratosService.ts`**: `fetchHorariosTratos` passou a selecionar `kg_ofertado_real` e `LinhaHorario` ganhou o campo `kg_real`.
- **`AcompanhamentoTratos.tsx`**: nova coluna "Real (kg)" entre "Trato" e "Horário sugerido", alinhada à direita.

## Apresentação de formulação (granel/sacaria) e suplementação em sacos (2026-09-22)

Migrations `20260922220000_formulacao_apresentacao_sacaria.sql` e `20260922230000_rename_apresentacao_forma_fornecimento.sql` (rename de `apresentacao` para `forma_fornecimento`). Formulações passam a declarar a forma de fornecimento do produto para que a suplementação no PWA possa ser lançada em número de sacos em vez de kg.

- **`formulacoes`**: novas colunas `forma_fornecimento` (`'granel'`/`'sacaria'`, NOT NULL default `'granel'`) e `kg_por_saco` (numeric). CHECKs: `forma_fornecimento` restrita aos dois valores e `kg_por_saco` obrigatório e positivo quando `sacaria`.
- **`registros_suplementacao`**: novas colunas `forma_fornecimento` e `qtd_sacos` (ambas nullable, snapshot do lançamento). `kg_cocho` continua gravando kg convertido (sacos × kg_por_saco).
- **Painel** (`Formulacoes.tsx`): form ganhou select "Forma de Fornecimento" (A granel/Sacaria) e campo "Kg por saco" obrigatório quando sacaria; card da formulação exibe "Sacaria (N kg/saco)".
- **PWA** (`SuplementacaoPage`): quando a formulação do plano ativo é sacaria, o input "Total Suplementado no Cocho (kg)" vira "Quantidade de Sacos" com faixa de conversão ("Sacaria de X kg = Y kg no cocho"); o payload grava `kgCocho` convertido + `formaFornecimento` + `qtdSacos`, e `syncService` mapeia `forma_fornecimento`/`qtd_sacos`. Share text e card da lista exibem "SACOS"/"N° SACOS". Formulações a granel não mudam nada; sacaria sem `kg_por_saco` cai no fluxo de kg (defesa).
- Rollout: migration aplicada antes do código (colunas aditivas, retrocompatível); PWA antigo ignora as colunas novas.

**Disparador**: quando mencionar sacaria, apresentação de formulação, kg por saco, suplementação em sacos ou `qtd_sacos`, ler esta seção.

## CHECK de classificação de itens + criação de itens pelo PWA (2026-09-22)

Migrations `20260922210000_classificacao_check_e_criar_item_pwa.sql` e `20260922240000_criar_item_pwa_dedupe_controla_estoque.sql`.

- **`itens_almoxarifado.classificacao`**: CHECK com 19 valores (a lista que o painel já usava em CadastrosAuxiliares: Ferramentas, Peças, Hidráulica, Elétrica, Insumos, Fertilizantes, Corretivos, Defensivos, Herbicidas, Fungicidas, Inseticidas, Adjuvantes, Sementes, Medicamentos, Equipamentos, Combustíveis, Lubrificantes, EPI, Materiais de Construção).
- **`itens_cantina.classificacao`**: CHECK com os 6 valores do painel (Perecíveis, Não Perecíveis, Bebidas, Limpeza/Higiene, Hortifruti, Carnes). Dados existentes (incluindo soft-deletados) já estavam conformes nas duas tabelas.
- **RPCs `criar_item_almoxarifado_pwa` / `criar_item_cantina_pwa`** (`SECURITY DEFINER`): o peão não tem INSERT em `itens_*` (RLS admin/controller), então a criação passa por RPC que valida vínculo `usuarios.auth_id = auth.uid()` + `usuario_fazenda.ativo`, valida classificação/unidade, é idempotente por `p_id` e deduplica por `lower(btrim(nome))` na fazenda. No dedupe, se o item existente tinha `controla_estoque=false`, o flag é ligado (senão o trigger de entrada ignoraria o item sem gerar movimentação).
- **Atenção**: classificação nova exige migration de CHECK + update nas constantes do PWA (`CLASSIFICACOES_*` em `constants.ts`) + opções em CadastrosAuxiliares — três pontas.

**Disparador**: quando mencionar CHECK de classificação, `criar_item_*_pwa`, item criado pelo PWA ou lista de classificações, ler esta seção.

## Entrada de estoque no PWA: almoxarifado e cantina (2026-09-22)

Migrations `20260922180000_entrada_almoxarifado.sql` e `20260922190000_estoque_cantina.sql`. Duas cadernetas novas no PWA (`entrada-almoxarifado`, `entrada-cantina`), visíveis só na fazenda de testes (`d649c65e-16ab-4b77-a84b-df937aa41cc3`) via `CADERNETAS_EXCLUSIVAS`, dão entrada ao estoque sob o grupo "Entrada de Estoque". As telas de saída existentes não mudaram de rota nem de semântica.

- **Almoxarifado**: `registros_almoxarifado.tipo` passa a aceitar `'entrada'` e ganhou `quem_recebeu`. O trigger `trg_retirada_almoxarifado_mov` ganhou branch que insere `movimentacoes_almoxarifado` com `tipo_movimentacao='entrada'`, `origem='pwa_entrada'`, `custo_unitario` NULL (o recálculo preserva o WAC vigente). Entradas não reprocessam pendências de devolução.
- **Cantina ganhou estoque**: `itens_cantina` recebeu `estoque_atual`, `estoque_minimo`, `custo_unitario`, `custo_total_estoque`, `controla_estoque` (default false). Novo ledger `movimentacoes_cantina` (espelho do almoxarifado, com snapshot de unidade, `local_id` único, RLS admin/controller) + `recalcular_estoque_cantina` (WAC) + `update_estoque_cantina`. View `itens_cantina_pwa` expõe o catálogo sem custo para o PWA; as policies da tabela ficaram restritas a admin/controller (mesma correção do almoxarifado).
- **`registros_alimentacao`** ganhou `quem_recebeu` e `itens_detalhe` (jsonb array com `itemId`/`quantidade`); `modo` passa a aceitar `'entrada'`. Trigger `trg_alimentacao_mov`: `modo='cantina'` gera `baixa`, `modo='entrada'` gera `entrada`, `marmita` não movimenta. A coluna `itens` (mapa nome→qtd) continua gravada para exibição. Registros antigos sem `itens_detalhe` não geram movimentação retroativa.
- **Painel**: `utils/cadernetas.ts` recebeu os dois ids (RBAC por funcionário); `Almoxarifado.tsx` ganhou filtro/badge "Entrada" e exibe `quem_recebeu`; `RegistrosCantina.tsx`/Detalhes exibem badge "Entrada", `quem_recebeu` e `itens_detalhe`; cadastro de `itens-cantina` em CadastrosAuxiliares ganhou `controla_estoque` (select Sim/Não) e `estoque_minimo`.
- **PWA** (`Caderneta-Digital-Gesta-Up`): páginas `EntradaAlmoxarifadoPage`/`EntradaCantinaPage` (+ listas), stores IndexedDB novas (versão 30), conversores em `syncService`, validadores, display configs, labels, share e `updateItemCantinaSaldoCache` em `cadastroCache`. `CantinaPage` passa a enviar `itensDetalhe` (item_id por item) para o modo cantina baixar estoque; `supabaseService` agora lê `itens_cantina_pwa`. Seletores de entrada só listam itens com `controla_estoque=true`.
- **Pendência operacional**: itens da cantina nascem com `controla_estoque=false`; sem marcar no painel, o seletor da entrada de cantina fica vazio. Versões antigas do PWA postam cantina sem `itens_detalhe` e não baixam estoque; o saldo da cantina só é confiável a partir da atualização do app.

**Disparador**: quando mencionar entrada de estoque, `movimentacoes_cantina`, `itens_detalhe`, `controla_estoque` na cantina, ou `itens_cantina_pwa`, ler esta seção.

## RegistrosTratosLeituras: paginação e busca server-side + fixes de console (2026-09-22)

Revisão de frontend da tela `/controller/registros-tratos-leituras`:

- **Paginação server-side**: a tela puxava até 1000 linhas e paginava/filtrava no cliente. Agora usa `count: 'exact'` + `.range()` (25 por página) nas duas abas, e a busca textual virou filtro `or(...)` no PostgREST — nomes de lote/curral são resolvidos para ids com as listas já carregadas e entram como `lote_id.in.(...)`/`curral_id.in.(...)` junto aos `ilike` em colunas de texto (evita join `!inner`, que excluiria tratos sem lote). `SearchInput` usa `debounceMs={400}` e a mudança de qualquer filtro reseta para a página 1 via `lastFiltrosRef` (a mudança de `page` dispara o mesmo `loadData`).
- **`Select` com label acessível**: o `<label>` não estava associado ao controle (warning de acessibilidade); agora usa `useId` + `htmlFor`/`id` no botão.
- **Future flags do React Router**: `BrowserRouter` recebeu `future={{ v7_startTransition: true, v7_relativeSplatPath: true }}` (router 6.30.x), silenciando os warnings de v7. O `path="*"` usa link absoluto, sem impacto.
- Verificado no Chrome na fazenda de testes: tabela das duas abas, busca "curral b1" filtra server-side (4 tratos; 1 leitura), console sem warnings de router nem acessibilidade.

**Disparador**: quando mencionar paginação da tela de tratos/leituras, busca que não acha registro fora da página, ou warnings de React Router/label no painel, ler esta seção.

## curral_id em registros_leitura_cocho e unicidade por curral/dia (2026-09-22)

Migration `20260922170000_leitura_cocho_curral_id.sql`. A leitura de cocho identificava o local só por `pasto_curral` (texto livre), então "uma leitura por curral por dia" existia só no app e dois dispositivos offline podiam duplicar leitura no sync (local_id distinto).

- Nova coluna `registros_leitura_cocho.curral_id` (FK `currais`) + índice único parcial `registros_leitura_cocho_curral_dia_uk` em `(fazenda_id, curral_id, (data AT TIME ZONE 'America/Cuiaba')::date) WHERE deleted_at IS NULL AND curral_id IS NOT NULL`. Leituras de pasto (sem curral) e linhas excluídas não participam; uma linha excluída não bloqueia nova leitura no mesmo curral/dia.
- `editar_registro_leitura_cocho` aceita `curral_id` na whitelist: valida pertencimento à fazenda e, quando informado, sincroniza `pasto_curral` com o nome do curral e zera `pasto_id`. A tela Registros de Tratos e Leituras ganhou select "Curral (confinamento)" no modal de edição de leitura (o campo texto livre só aparece quando nenhum curral está selecionado), tradução de 23505 ("Já existe uma leitura para este curral nesta data") e o filtro de curral passa a valer para a aba Leituras.
- PWA: `LeituraCochoPage` envia `curralId` no registro e `syncService` mapeia `curral_id`; leituras novas já nascem protegidas pelo índice (duplicata vira erro de sync em vez de linha extra).
- Backfill é operação de dados (fora da migration): `UPDATE ... FROM currais` casando `lower(trim(nome)) = lower(trim(pasto_curral))` por fazenda. Fazenda de testes: 7/7 linhas (100%), incluindo excluídas. Jacamim (`d8900758-1e41-4855-a55e-17f8e00fea7e`, única em produção com confinamento): 2/2 linhas, ambas TIP 41 em dias distintos, sem conflito. Demais fazendas não têm leituras ou não usam confinamento; linhas sem casamento ficam com `curral_id` NULL e fora do índice.
- Verificado: insert duplicado ativo no mesmo curral/dia falha com 23505; insert no mesmo curral/dia de uma linha excluída passa; edição via RPC com `curral_id` sincroniza `pasto_curral`.

**Disparador**: quando mencionar `curral_id` em leitura, unicidade de leitura de cocho, duplicata de leitura no sync, ou backfill de `curral_id`, ler esta seção.

## Hardening das RPCs administrativas e auditoria do confinamento (2026-09-22)

Migration `20260922150000_hardening_rpcs_confinamento_auditoria.sql`. Revisão de segurança/integridade do módulo de confinamento após a tela de edição/exclusão:

- **Spoofing de usuário nas RPCs**: as seis funções (`editar_/excluir_registro_leitura_cocho`, `editar_/excluir_registro_oferta_trato`, `editar_/excluir_registro_suplementacao`) confiavam em `p_usuario_id`/`p_usuario_email` para autorização e auditoria — qualquer autenticado podia declarar o id de um controller e o log registrava o e-mail forjado. Agora todas resolvem o chamador real via `auth.uid()` → `usuarios.auth_id`, usam esse usuário para o check de papel e setam `app.current_user_id/email/nome` com os dados reais. Os parâmetros `p_usuario_*` permanecem na assinatura por compatibilidade, mas são ignorados. `editar_registro_suplementacao` também ganhou o check de papel `admin/controller` que não tinha.
- **`lancar_tratos_folha` reativa registros excluídos**: o resolve de registro lógico filtrava `deleted_at IS NULL`; um relançamento cuja linha original estava excluída colidia com o `id` dela no `ON CONFLICT` e atualizava uma linha que continuava invisível. O resolve agora considera linhas excluídas (preferindo a ativa) e o `DO UPDATE` seta `deleted_at = NULL` explicitamente — relançar a folha restaura a mesma identidade em vez de criar um registro novo ou falhar em silêncio. A função também passa a setar contexto de auditoria (`app.current_user_*`, `source_app='painel'`).
- **`fn_audit_trigger` com fallback de identidade**: quando não há contexto de sessão (`app.current_user_nome` vazio), o trigger passa a usar `nome_usuario` da própria linha. Cobre os writes diretos do PWA, cuja conta compartilhada `peao.*` não identifica o funcionário — antes entravam no `audit_log` sem nenhum nome. Aplicado a todas as tabelas auditadas.
- **`editar_registro_leitura_cocho` re-resolve `nota_config_id`**: ao mudar `leitura_cocho`, o link para `notas_leitura_cocho_config` é recalculado para a nota nova (antes ficava apontando para o percentual da nota antiga). O `audit_log` registra as duas mudanças em `alteracoes`.
- **Constraint redundante removida**: `registros_oferta_trato_curral_id_data_ordem_trato_key` (unique por timestamptz exato) foi dropada — substituída por `registros_oferta_trato_dia_operacional_uk` (curral, dia operacional em `America/Cuiaba`, ordem, só ativos), que é mais restrita. Nada usava essa constraint como alvo de `ON CONFLICT` (PWA usa `local_id`, a RPC usa `id`).
- Verificado na fazenda de testes com JWT simulado (`request.jwt.claims`): usuário sem papel é rejeitado mesmo declarando `p_usuario_id` de controller; edição com `p_usuario_id` spoofado grava o e-mail real no `audit_log`; relançar trato excluído o reativa com auditoria; update sem contexto grava `usuario_nome` do `nome_usuario` da linha.
- Limitações que ficam: writes diretos do PWA ainda passam por RLS (a conta `peao.*` pode atualizar/apagar linhas da fazenda, inclusive sobre registros excluídos — a fronteira real é o RLS, não a RPC); a unicidade de leitura de cocho por curral/dia segue só no app, pois `pasto_curral` é texto livre sem `curral_id`.

**Disparador**: quando mencionar spoofing de `p_usuario_id`, `auth.uid()` em RPCs, reativação de trato excluído, `nota_config_id` inconsistente, ou auditoria de writes do PWA, ler esta seção.

## Tela de edição/exclusão de tratos e leituras de cocho (2026-09-21)

Nova rota `/controller/registros-tratos-leituras` ("Registros de Tratos e Leituras", menu Confinamento e TIP, atrás de `ConfinamentoRoute`) para administrar registros operacionais que antes só podiam ser consultados. Duas abas (Tratos / Leituras de cocho) com filtro de período, lote, curral (tratos) e busca textual; edição via modal e exclusão com confirmação.

- Migration `20260921190000_editar_excluir_tratos_leituras.sql` (aplicada com `db push --include-all`, pois o remoto já tinha migrations com timestamp posterior). Cria quatro RPCs `SECURITY DEFINER` no padrão de `editar_/excluir_registro_suplementacao`: `editar_registro_leitura_cocho`, `excluir_registro_leitura_cocho`, `editar_registro_oferta_trato`, `excluir_registro_oferta_trato`. Todas setam `app.current_user_id`/`app.current_user_email`, exigem `usuario_fazenda.papel IN ('admin','controller')` (diferente de `editar_registro_suplementacao`, que não checa papel na edição), filtram `p_campos` por whitelist e fazem soft delete via `deleted_at`.
- Whitelists: leitura aceita `data`, `responsavel`, `pasto_curral`, `pasto_id`, `lote`, `lote_id`, `leitura_cocho` (validada -1..3); trato aceita `data`, `ordem_trato`, `kg_planejado`, `kg_ofertado_real`, `leitura_cocho_nota`, `lote_id`, `curral_id`. Ambas validam que lote/curral/pasto pertencem à mesma fazenda. Editar data/ordem/curral de um trato pode colidir com `registros_oferta_trato_dia_operacional_uk` (23505) — a UI traduz para "Já existe um trato para este curral nesta data e ordem".
- `registros_oferta_trato` ganhou `trg_audit_registros_oferta_trato` (INSERT/UPDATE/DELETE → `fn_audit_trigger`), que não existia; `registros_leitura_cocho` já tinha o seu. Exclusões aparecem no `audit_log` como UPDATE de `deleted_at`.
- UI em `src/pages/controller/RegistrosTratosLeituras.tsx`: datas exibidas e editadas no fuso da fazenda (`America/Cuiaba` via `toFarmDateOnly`/`formatDateTime`); ao salvar, a hora original do registro é preservada (inputs separados de data e hora). Ações visíveis apenas para `papel admin/controller`.
- Verificado via SQL na fazenda de testes: edição de nota de leitura (2→3) e de kg de trato (235→240) gravam `alteracoes` corretas no `audit_log` com `usuario_email`; exclusões marcam `deleted_at`; chamada com usuário sem papel é rejeitada ("Permissão negada").
- Ressalva conhecida: um UPDATE pendente na fila de sync do PWA para um registro excluído pode recriar/atualizar a linha (upsert por `local_id`), mesmo comportamento já aceito em `registros_suplementacao`.

**Disparador**: quando mencionar "editar/excluir trato", "editar/excluir leitura de cocho", `editar_registro_oferta_trato`, `editar_registro_leitura_cocho`, ou "registros de tratos e leituras", ler esta seção.

## Relatório de mortalidade: rebanho_total por lote_categorias e detalhamento sob diagnósticos (2026-09-21)

Dois ajustes no relatório de mortalidade após feedback com o PDF da Fazenda Brilhante:

- **Taxa de mortalidade não aparecia**: o `rebanho_total` da RPC `get_dados_relatorio_morte` era somado de `lotes.n_cabecas`/`numero_cabecas`, colunas NULL em fazendas de produção (efetivo vive em `lote_categorias`). A migration `20260911161139` já tinha corrigido isso para `SUM(lote_categorias.quant_atual) WHERE ativo`, mas as recriações completas da função a partir de `20260916120000` regrediram o denominador. A migration `20260921160000_fix_rebanho_total_lote_categorias_relatorio_morte.sql` restaura a soma por categorias ativas. Brilhante: rebanho 0 → 312, taxa passa a 1,28% (4 mortes).
- **Detalhamento logo abaixo dos diagnósticos**: quando a tabela "Diagnósticos mais frequentes" cabe em uma página só, a tabela "Registros detalhados" passa a começar na mesma folha, logo abaixo, com quantas linhas couberem (estimativa de altura por linha); o restante segue em páginas próprias de 12 registros. Fusão só ocorre se couberem pelo menos 3 linhas. Smoke na fazenda de testes (12 mortes, 4 diagnósticos, mapa): 4 páginas totais.

## Relatório de mortalidade: compressão máxima de páginas (2026-09-21)

O PDF de mortalidade (`api/pdf/morte.js`, usado pelo relatório individual do link público e pela seção de mortes do Infográfico Mensal) tinha muitas páginas com espaço vazio. A estrutura foi recompactada sem remover nenhum gráfico:

- **Página 1** passou a incluir, abaixo do resumo executivo, os gráficos "Mortes por lote" e "Mortes por causa" (cards de 50mm, `.page1-charts`).
- **Página 2** virou uma grade 2×2 (`.page2-grid`, cards de 58mm) com categoria, sexo, pasto e o heatmap causa × categoria (que saiu da antiga página 4), seguida da "Leitura executiva". O rótulo de canto do heatmap foi encurtado para "Causa" para não colidir com a primeira coluna.
- **Diagnósticos** ganharam página dedicada com até 12 linhas por página (antes cabiam 4 na página mista); limite total de exibição segue em 24 categorias.
- **Detalhamento** passou de 7 para 12 registros por página (`DETAIL_ROWS_PER_PAGE = 12`), com fonte/padding menores e diagnósticos com clamp de 2 linhas (`morte-clamp`).
- A página de mapa continua separada e só é emitida quando há mortes georreferenciadas.
- `totalPages` agora é calculado como `2 + páginas de diagnóstico + (mapa ? 1 : 0) + páginas de detalhe`.
- Smoke test na fazenda de testes (12 mortes, com mapa e 4 diagnósticos): caiu de 7 para 5 páginas. O ganho cresce com o volume, pois o detalhamento comporta 70% mais registros por folha.
- O teste `reportComposer.test.ts` foi ajustado: a composição consumo + morte passou de 8 para 6 páginas totais.

## Relatório de mortalidade: taxa acumulada e novos KPIs na página 1 (2026-09-21)

A primeira página do relatório de mortalidade (PDF individual do link público e seção de mortes do Infográfico Mensal, ambos renderizados por `api/pdf/morte.js`, e os cards web de `RelatorioMortePublico.tsx`) foi repensada: os cards "Mortes por dia" e "Período anterior" foram removidos (usuários quase nunca filtram período longo o suficiente para haver comparação), e a taxa de mortalidade passou a ser acumulada sobre todo o histórico, estável mesmo com filtros de data curtos.

- Migration `20260921140000_add_taxa_mortalidade_geral_relatorio_morte.sql`: a RPC `get_dados_relatorio_morte` passa a retornar `total_mortes_geral` e `taxa_mortalidade_geral` em `dados` (contagem sem filtro de data ÷ rebanho atual). O `periodo_anterior` continua sendo calculado e retornado, apenas não é mais exibido.
- Novos KPIs escolhidos pelo usuário: **Lote mais afetado** (linha 1, com contagem e % do período; agrega `lote_nome` das linhas) e **Categoria mais afetada** (linha 2, com contagem e % do total).
- O texto de análise ("insights") não menciona mais período anterior nem variação; a frase de abertura virou "A taxa de mortalidade acumulada é de X% (N mortes registradas em um rebanho de M cabeças)" e ganhou uma sentença de lote mais afetado quando há mais de um lote.
- Em `loaders.ts` (`carregarMortes`, caminho do infográfico) e na página pública, `resumo.taxa_mortalidade` passa a carregar a taxa geral; `periodo_anterior`/`variacao_mortes` deixaram de ser propagados para o PDF (campos opcionais do tipo `ResumoMorte` permanecem para os renders legados jsPDF/react-pdf, sem call sites ativos).
- Validado na fazenda de testes: sem filtro, 19 mortes / taxa 3,18%; com filtro 01–21/set, período cai para 12 mortes e a taxa geral permanece 3,18%. Smoke test gerou `smoke-morte.pdf` com a página 1 conferida visualmente.

## Recategorização in-place zerava quant_atual (2026-09-21)

Caso original: apartações LOTE 08P → TIP LOTE 27/28/29 (140 garrote cada) na fazenda Bom Jesus (`a6640dd6`). A categoria "garrote" foi criada corretamente no destino e recebeu as cabeças, mas controllers recategorizaram manualmente garrote → boi magro (e no 27 depois boi magro → boi gordo) via `recategorizar_lote_categoria`. A RPC só renomeava a linha de `lote_categorias`; como `calculate_quant_atual` casa `registros_movimentacao.categoria` por nome, os registros que continuavam dizendo "garrote" deixaram de contar e o cron noturno zerou o `quant_atual`.

- **Primeira tentativa (rewrite, revertida)**: migration `20260921120000_recategorizar_propaga_categoria_registros.sql` fazia a RPC reescrever `categoria` em `registros_movimentacao`/`registros_morte` com o nome novo. Mostrou-se estruturalmente incorreta: um registro com `lote_destino_id` é compartilhado por dois lotes, e renomear o campo só pode estar certo para um deles quando os nomes divergem. No caso observado, a saída de LOTE 08P deixou de casar com a linha 'garrote' dele, e o recálculo inflaria a origem de 260 para 680 (420 cabeças fantasma). Os 3 registros corrigidos foram revertidos ao valor original e a RPC foi restaurada por `20260921121000_revert_recategorizar_sem_rewrite.sql`.
- **Solução adotada (quant_base)**: migration `20260921130000_recategorizar_quant_base.sql`. Nova coluna `lote_categorias.quant_base`; `calculate_quant_atual` usa `COALESCE(quant_base, quant_inicial)` como base. Na recategorização in-place, nenhum registro é tocado: a RPC congela `quant_base = quant_atual - resid`, onde `resid` é o que o nome novo ainda contaria na janela de contagem (medido com `quant_base=0` temporário, que ativa o cutoff `created_at`). Invariante: o recálculo pós-transição devolve exatamente o saldo anterior. Histórico por nome fica 100% preservado e a origem nunca é afetada. `quant_base` pode ser negativo por construção (não colocar CHECK).
- Correção pontual na fazenda a6640dd6: as linhas 'boi magro' de TIP 28/29 (placeholders, `quant_inicial` NULL) receberam `quant_base=140` via `quant_atual - calculate_quant_atual(...)`. TIP 27 não precisou (`quant_inicial=140` já sustentava o saldo). Estado verificado: LOTE 08P garrote 260/260, TIP 27 boi gordo 140/140, TIP 28/29 boi magro 140/140 (stored vs calc).
- Limitações residuais aceitas: registro offline tardio com nome antigo e `data < data_transicao` cai numa linha separada no destino (total certo, categoria separada); saída/morte com nome antigo após o rename segue falhando `v_cat_exists` (`CATEGORIA_NOT_IN_LOTE`). Denominadores de mortalidade em `encerrar_plano_*`/`criar_snapshot_entrada`/`migrar_plano_nutricional` leem `quant_inicial` puro e não consideram `quant_base` (artefato cosmético). A solução definitiva por FK + resolução temporal continua no `docs/BACKLOG.md`.

## Boletim de rebanho: consolidado zerado quando o último bloco repete nome de local (2026-09-18)

O painel "resumo consolidado" do boletim de rebanho saía zerado para a planilha "Boletim Mensal Rebanho.xlsm" (Fazenda Brilhante). A estrutura era igual às demais, mas a célula `'Resumo Geral'!B11` (rótulo do bloco consolidado, último bloco de cada aba) continha `FAZENDA BRILHANTE`, mesmo nome do primeiro local; nas planilhas que funcionam, `B11` traz o nome do grupo (ex.: `GRUPO AGRO GENTILIN`).

- `src/features/relatorioGeral/boletimRebanho.ts`: `extrairRegistrosDaAba` passou a escolher o consolidado pelo último bloco com dados da aba (posicional), renomeando apenas os registros daquele bloco. Antes escolhia o último nome único de local; quando o rótulo do consolidado colidia com um local já listado, o alvo da renomeação caía no bloco anterior (aqui `FAZENDA 2`, todo zerado). A preferência por um bloco explicitamente nomeado `Consolidado` foi mantida.
- Teste de regressão `workbookComConsolidadoNomeRepetido` reproduz a forma do arquivo (bloco consolidado repetindo o nome do primeiro local, com mini-bloco órfão de total entre eles).
- Verificado com a planilha real: `geral` passou a ter 10 registros com dados (consolidado 372 cabeças no saldo) e `FAZENDA BRILHANTE` segue listada como local.

## Pill Período Dieta Atual e novo Período Total no relatório de consumo (2026-09-18)

O pill "Período" do relatório de consumo (página pública, PDF individual e seção do infográfico mensal) media apenas o tempo na dieta atual, o que era ambíguo para lotes com várias dietas. O pill existente foi renomeado para "Período Dieta Atual" e um novo pill "Período Total" mede o tempo desde a primeira dieta do lote.

- Migration `20260918250000_relatorio_consumo_periodo_total.sql`: a RPC `get_dados_relatorio_consumo` passa a retornar `dias_total` no objeto `info`, calculado como os dias desde o menor `data_inicio` entre todos os `planos_nutricionais` do lote (vinculados ao lote ou a `lote_categorias` do lote, ativos ou encerrados). A nova CTE `primeira_dieta_por_lote` faz essa agregação; `dias` permanece inalterado. A mudança cobre automaticamente o infográfico mensal, que consome a mesma RPC via `get_dados_relatorio_consumo_fazenda`.
- Renders atualizados nos três pontos: `RelatorioConsumoPublico.tsx` (grid de KPIs passou a 7 colunas), `api/pdf/consumo.js` (coluna de KPIs, altura flexível) e `relatorioConsumoPDF.ts` (cards reduzidos de 19mm para 17mm para os 7 cards caberem na página A4). `InfoLote` ganhou `dias_total` e o payload do Puppeteer em `relatorioConsumoPDFPuppeteer.ts` passa a enviá-lo.
- Lotes sem nenhum plano iniciado exibem `—` no Período Total; lotes com dados faltantes (`erro`) seguem mostrando o bloco de aviso em vez dos KPIs, como antes.
- Verificação na fazenda de testes via MCP: `dias` e `dias_total` retornaram corretos para lote com plano único (109/109), e `null` para lotes sem plano ou com erro de dados.

## Medicamentos em registros de maternidade (2026-09-18)

O PWA passou a registrar medicamentos aplicados em cada cria de maternidade (1ª cria e, em gêmeos, 2ª cria viva), reutilizando a lógica da Enfermaria. Mudanças neste repo:

- Migration `20260918230000_add_medicamentos_maternidade.sql`: coluna `medicamentos jsonb` em `public.registros_maternidade`, mesmo shape da coluna de `registros_enfermaria` (array de `{medicamentoId, tipo, nomeComercial, principioAtivo, doseRecomendada, doseAplicada}`). Cada cria gera um registro separado com sua própria lista.
- Migration `20260918240000_add_foto_url_maternidade.sql`: coluna `foto_url text` em `registros_maternidade`; o PWA passou a capturar foto (secção "5. FOTO") e a sincronizá-la para o bucket `fotos-registros`, como a Enfermaria.
- `src/pages/controller/MaternidadeDetalhes.tsx`: campo `medicamentos` na interface do registro e seção "Medicamentos" nos detalhes (nome, tipo, dose aplicada, dose recomendada), exibida apenas quando a lista não está vazia.
- `src/utils/exportConfigs.ts`: coluna "Medicamentos" no `MATERNIDADE_EXPORT_CONFIG` do XLSX, serializada como `Nome (Tipo) Dose | Nome (Tipo) Dose`.

No PWA a implementação extraiu o componente compartilhado `MedicamentosSection` (usado por Maternidade e Enfermaria); detalhes no `docs/HISTORICO.md` do repo do PWA.

## Currais TIP criados na Fazenda Jacamim (2026-09-17)

- Os 43 pastos nomeados `TIP 01` a `TIP 43` da Fazenda Jacamim (`d8900758-1e41-4855-a55e-17f8e00fea7e`) foram replicados como currais na linha de confinamento `TIPS` (`bd07aaeb-fa0c-4083-b134-3f8a6894196b`), via migração pontual por MCP (sem arquivo de migration).
- A linha já tinha 9 currais parciais (TIP 01–07, 41, 42); foram inseridos os 34 faltantes. Todos com `lote_id` nulo, por decisão do usuário: o trigger `check_lote_nao_em_pasto_ao_vincular_curral` impede o mesmo lote em pasto e curral ao mesmo tempo, e vincular exigiria zerar `lotes.pasto_id` (movendo os 33 lotes e limpando `individuos.pasto_atual`), o que não foi autorizado.
- Os pastos TIP continuam ativos e ocupados; a ocupação por lote nessa fazenda é controlada por `lotes.pasto_id` (não há registros abertos em `lote_pasto_historico` para esses lotes). O vínculo lote↔curral será feito depois pela operação normal do app.
- O pasto `Piquete Leiteiras` (tipo='TIP', nome fora do padrão) foi excluído da cópia a pedido do usuário.

## RLS por fazenda nas tabelas de programação de tratos (2026-09-17)

As três tabelas de programação de tratos ainda usavam policies permissivas (`USING true` / `WITH CHECK true`), permitindo a qualquer autenticado ler, alterar e apagar a programação de qualquer fazenda. A migration `20260917140000_rls_programacao_tratos` aplicou o mesmo padrão de `registros_oferta_trato`:

- **`programacao_tratos`**: as quatro policies usam `user_has_fazenda_access(fazenda_id)`.
- **`programacao_tratos_percentuais` e `programacao_tratos_currais`**: não possuem `fazenda_id`; o novo helper `user_has_programacao_access(programacao_id)` (SECURITY DEFINER) resolve a fazenda via `programacao_id` e delega a `user_has_fazenda_access`. UPDATE carrega o predicado em `USING` e `WITH CHECK`, impedindo mover uma linha para uma programação de fazenda inacessível. `EXECUTE` do helper foi revogado de `anon`/`PUBLIC`.
- O PWA só lê essas tabelas (`getProgramacaoTratosCompleta`, `getTiposProgramacaoTratos`); as escritas acontecem apenas na tela Configuração de Tratos do painel. Ambos os perfis possuem vínculo em `usuario_fazenda`, então nenhum fluxo quebra.
- A mesma correção expôs que o CHECK `programacao_tratos_tipo_check` só aceitava `'engorda'` e `'sequestro'`, enquanto o painel oferece TIP como tipo selecionável. A migration `20260917170000_programacao_tratos_tipo_tip` recriou a constraint incluindo `'tip'`; INSERT/DELETE de uma programação `tipo='tip'` foi testado com sucesso na fazenda de testes.

Verificação na fazenda de testes via devtools, usando o client autenticado da própria aplicação: o painel carregou o lançamento e a configuração com os 4 currais e percentuais; o PWA exibiu "4/4 tratos" normalmente. Na bateria de negação: INSERT em `programacao_tratos` de fazenda alheia foi rejeitado (42501), UPDATE em fazenda alheia afetou 0 linhas, INSERT de percentual/curral sob `programacao_id` inacessível foi rejeitado (42501) e UPDATE movendo percentual para programação inacessível também foi rejeitado (42501). Na bateria positiva, um ciclo completo INSERT/UPDATE/DELETE em programação própria funcionou e o banco ficou com o total original de registros.

## Endurecimento de segurança do lançamento de tratos (2026-09-17)

A auditoria da tela de lançamento de tratos identificou que `registros_oferta_trato` estava com policies permissivas (`USING true` / `WITH CHECK true`), que a gravação não era transacional e que a unicidade por `(curral_id, data, ordem_trato)` usava o instante exato (timestamptz), permitindo duplicatas entre painel (meio-dia fixo) e PWA (horário real). A migration `20260917100000_seguranca_lancamento_tratos` corrigiu os quatro pontos:

- **RLS por fazenda**: as quatro policies foram recriadas com `user_has_fazenda_access(fazenda_id)`, mesmo padrão já usado em `registros_leitura_cocho`. Os 48 peões ativos possuem vínculo em `usuario_fazenda`, então o sync do PWA continua autorizado; impersonação também não quebra porque troca a sessão para o usuário alvo. Acesso `anon` foi removido das policies.
- **Integridade**: CHECK constraints `kg_planejado >= 0` e `kg_ofertado_real >= 0` (já existia `ordem_trato > 0`). Nenhum registro negativo existia no banco.
- **Unicidade por dia operacional**: índice único `(curral_id, (data AT TIME ZONE 'America/Cuiaba')::date, ordem_trato) WHERE deleted_at IS NULL`. Um segundo registro do mesmo curral/trato/dia agora falha em vez de duplicar, inclusive em corrida entre painel e PWA.
- **Origem**: coluna `origem text NOT NULL DEFAULT 'pwa'` (`'pwa'`/`'painel'`). O painel grava `origem='painel'` e `local_id` determinístico `painel-{curral}-{data}-{ordem}`.
- **RPC `lancar_tratos_folha(jsonb)`**: gravação atômica e validada no servidor (mesma fazenda, vínculo do usuário, curral/lote/programação pertencentes à fazenda, kg não negativo, ordem dentro da programação). Resolve o registro lógico por curral+dia+ordem antes de inserir, então um trato já gravado pelo PWA é atualizado em vez de duplicado; `data`, `origem` e `local_id` originais são preservados no update.

Painel: `salvarLancamentosTratos` passou a chamar a RPC, `data` usa meio-dia fixo em `-04:00` (Cuiabá, sem horário de verão), `validarLancamentosTratos` bloqueia valores negativos e trato preenchido sem lote, campo com valor negativo fica vermelho, e banner âmbar lista currais sem lote/dieta/cabeças. Erros da RPC aparecem com a mensagem do banco.

Verificação na fazenda de testes via devtools: RPC rejeitou curral de outra fazenda; lançamento de 4 tratos gravou com `origem='painel'`, `sync_status='synced'` e `local_id` correto; salvamento repetido atualizou em vez de duplicar. Ponto de atenção de teste: `fill`/`fill_form` do chrome-devtools não disparam `onChange` do React em input `type=date` nem no `fill_form` com vários campos; para testar troca de data é preciso setar o valor via `HTMLInputElement.prototype` + `dispatchEvent(new Event('input'))` e preencher os campos Real um a um com `fill`.

Observação: as tabelas `programacao_tratos`, `programacao_tratos_percentuais` e `programacao_tratos_currais` também usavam policies permissivas (`USING true`) nesta data; foram corrigidas na migration `20260917140000_rls_programacao_tratos` (ver seção "RLS por fazenda nas tabelas de programação de tratos").

## Lançamento de tratos e planilha de campo no Painel Web (2026-09-17)

- O módulo de confinamento ganhou a rota protegida `/controller/lancamento-tratos`, disponível no menu Confinamento e TIP para os tipos Engorda, Sequestro e TIP.
- A tela opera por curral, exibe lote, dieta, cabeças, trato anterior, leitura de cocho, previsto diário e pares dinâmicos Previsto/Real conforme a quantidade de tratos configurada.
- Depois de salvar com sucesso, os campos Real são limpos sem perder os IDs dos registros, permitindo um novo lançamento ou correção sem manter valores antigos na tela.
- O cálculo reproduz a regra do PWA para o primeiro dia, ajuste pela leitura de cocho anterior e compensação do último trato.
- A leitura de cocho do próprio dia do trato é considerada no painel; a compensação do último trato só é aplicada depois que já existem Reais anteriores no mesmo dia.
- Os lançamentos são inseridos ou atualizados diretamente em `registros_oferta_trato`, mantendo o mesmo destino usado pelo PWA.
- Foi adicionado o exportador ExcelJS da folha de campo, com título, data, cabeçalhos agrupados por trato, colunas Real vazias, orientação paisagem e ajuste para uma página de largura.
- Foram adicionados testes unitários para a distribuição inicial, ajuste de leitura e compensação do último trato.
- Verificação: `npx tsc --noEmit`, `npm run test` com 58 testes aprovados e `npm run build` aprovados. O lint do repositório continua indisponível porque não há configuração ESLint encontrada na raiz.

## Gráfico de saldo final por local no Boletim de Rebanho (2026-09-16)

- A página do consolidado anual passou a exibir um card de saldo final geral e um gráfico horizontal estilizado com o saldo final de cada local da aba `GERAL`.
- Os locais são ordenados do maior para o menor saldo e usam as abreviações `CONF`, `SEDE`, `CALIF`, `SERRA`, `NOVA`, `SJOÃO` e `MEIO`, mantendo a leitura visual da referência do Power BI.
- O gráfico foi incluído apenas na página geral; as páginas mensais por local continuam exibindo somente suas tabelas.


## Boletim de Rebanho por planilha no infográfico mensal (2026-09-16)

- O infográfico mensal passou a aceitar o `Boletim de Rebanho` como seção selecionável e reordenável.
- A planilha anual `.xlsx`, `.xlsm` ou `.xls` é persistida por fazenda e ano no bucket privado `relatorios-gerais`, com substituição pelo upload mais recente.
- O parser incorporado segue o core do projeto `BoletimGestaup`: reconhece abas mensais, blocos por local, categorias e campos de movimentação, separa o consolidado da aba `GERAL` dos locais do mês escolhido e preserva células vazias como `null`.
- O modal permite informar o ano, carregar/substituir a planilha e selecionar um único mês disponível. Quando somente o boletim é selecionado, o intervalo operacional deixa de ser obrigatório; relatórios operacionais continuam limitados a 31 dias. O ano e o upload ficam liberados somente quando o boletim está selecionado, e avisos internos da normalização não são exibidos ao usuário quando o arquivo é aceito.
- O renderizador Puppeteer gera tabelas estilizadas com a identidade visual do infográfico, uma página de resumo anual e uma página para cada local do mês selecionado. Valores vazios são apresentados como `-`.
- A migration `20260916000011_boletim_rebanho_storage` ampliou os MIME types aceitos pelo bucket existente. A migration `20260916180000_boletim_rebanho_octet_stream` adicionou `application/octet-stream` como fallback, e o frontend passou a enviar um `Blob` com MIME normalizado pela extensão. A migration `20260916190000_boletim_rebanho_normalize_mime` alinhou o MIME do XLSM para a forma minúscula normalizada pelo Storage.
- Validação com a planilha Maringá3: 1.040 registros normalizados, 10 registros no consolidado anual, 7 locais no mês de julho, 8 páginas na seção e 10 páginas no infográfico completo com capa e encerramento.


## Colisão de CSS `.detail-table` no infográfico mensal (2026-09-16)

- **Sintoma**: na tabela "Detalhamento por Máquina/Veículo" do relatório geral, o cabeçalho "Litros" aparecia deslocado para a esquerda, sobreposto a "Máquina/Veículo".
- **Causa raiz**: `morte.js` e `abastecimento.js` usavam a mesma classe `.detail-table` com larguras/fontes divergentes (9 colunas vs 10). O `composeReports` concatena o `<style>` de todos os relatórios num único documento, então o último CSS carregado vencia globalmente: a tabela de abastecimento herdava as larguras do morte (coluna 1 caía de 18% para 11%, fonte subia para 13px) e "Máquina/Veículo" estourava para dentro da coluna "Litros". A colisão era bidirecional e também podia corromper a tabela do morte.
- **Correção**: classes namespaced por relatório, `.abast-detail-table` em `api/pdf/abastecimento.js` e `.morte-detail-table` em `api/pdf/morte.js`, isolando as regras independente da ordem de composição. Coluna "Litros" (`th`/`td` `nth-child(2)`) centralizada conforme solicitado.
- **Convenção**: classes de tabela de relatórios Puppeteer devem levar prefixo do relatório, pois o CSS compartilha um único namespace global no documento composto.
- **Verificação**: `_tmp_smoke/abastecimento/verify_colisao_css.mjs` compõe abastecimento + morte (ordem que reproduzia o bug) e mede o layout real no Chromium: coluna 1 voltou a 18%, "Litros" a 8% centralizado, sem overflow de "Máquina/Veículo"; tabela do morte mantém 11%/25%.

## Revisão completa do fluxo de devolução do almoxarifado (2026-09-16)

Revisão de ponta a ponta do fluxo retirada/devolução com foco em offline-first (eventos duráveis, ordem arbitrária de sincronização, idempotência, servidor autoritativo). Quatro migrations novas no schema, todas aplicadas via `db push` e testadas na fazenda `d649c65e`.

`20260916220000_revisao_fluxo_devolucao_almoxarifado.sql`:
- Índice único de movimentação passa a incluir `retirada_id`/`retirada_item_index` e a trigger agrega itens duplicados do mesmo registro por `(item, retirada, índice)`, somando quantidades. Antes, um registro com o mesmo item duas vezes violava o índice e o sync inteiro falhava.
- Caminho vinculado passa a respeitar também o saldo agregado da pessoa (`min(pendente da retirada, pendente agregado)`): devolver 2 sem vínculo e depois tentar 1 vinculada à mesma retirada agora aprova 0, não 1.
- Nova função `reprocessar_devolucoes_almoxarifado` reavalia devoluções retidas quando retiradas chegam, mudam ou somem: cobre sync fora de ordem e edição/exclusão de retirada. Devolução que perde lastro tem `quantidade_aprovada` reduzida e volta à fila.
- `movimentacoes_almoxarifado.aprovacao_manual` preserva a decisão do controller ("Incorporar ao estoque") entre reprocessamentos e re-sincronizações.
- Advisory lock por `(fazenda, item, pessoa)` serializa aprovações concorrentes.
- Policies de `movimentacoes_almoxarifado` restritas a `admin`/`controller`: a tabela carrega `custo_unitario` (WAC) e peões com vínculo de fazenda conseguiam lê-la direto, furando a proteção de preço feita na view `itens_almoxarifado_pwa`.
- Coluna `registros_almoxarifado.tipo` recriada de forma defensiva (existia no remoto mas nenhum arquivo de migration a criava).

`20260916230000_fix_advisory_lock_hashtext.sql`: o Postgres do projeto não tem `hashtextextended(text)` de um argumento; o lock passou a usar a forma de dois inteiros com `hashtext`.

`20260916240000_drop_fk_retirada_id.sql`: removida a FK `movimentacoes_almoxarifado.retirada_id -> registros_almoxarifado`. Com a FK, uma devolução que sincronizava antes da retirada correspondente falhava no insert e o evento nem chegava ao banco. O vínculo virou campo informativo e o reprocessamento resolve quando a retirada chega. Efeito colateral observado: o PostgREST manteve a FK dropada no cache de schema e passou a responder 300 (relacionamento ambíguo) no embed `registros_almoxarifado(...)`; a query da fila de revisão no Painel usa agora hint explícito `!registro_origem_id`.

`20260916250000_unidade_almoxarifado_imutavel.sql`: `movimentacoes_almoxarifado.unidade` guarda snapshot da unidade no lançamento (backfill incluído) e trigger bloqueia troca de `unidade` em item com estoque ou movimentação ativa. Antes, mudar m para un reescrevia o sentido de todo o histórico sem aviso. O formulário de itens no Painel desabilita o campo nesse caso e explica o motivo; o histórico de movimentações passa a exibir a unidade do snapshot.

Painel: fila de revisão mostra quem devolveu (join com o registro de origem) e o botão incorporar marca `aprovacao_manual`. PWA: labels corretos em modo devolução ("Quantidade devolvida", sem campos de retirada), aviso âmbar quando a quantidade excede o pendente informando que o excedente ficará retido, e o catálogo não exibe mais "saldo" no modo devolução.

Testes executados: agregação de item duplicado (1+1 virou baixa de 2), devolução antes da retirada (retida com aprovada 0 e liberada sozinha ao chegar a retirada), cap agregado no caminho vinculado, propagação de exclusão de retirada (devolução aprovada 2 voltou para 0 com revisão), idempotência por `local_id` (23505 no retry), trava de unidade (bloqueada na Mangueira com estoque, permitida no Alicate sem histórico). Registros de teste removidos por soft-delete direto.

Limitação real que permanece por desenho: `quem_pegou` é texto livre, então grafias diferentes da mesma pessoa criam débitos separados no agregado; e nenhum sistema offline-first consegue exibir saldo global verdadeiro em dispositivos desconectados, o que o servidor resolve na reconciliação, não na tela.

Disparador: quando mencionar "devolução fora de ordem", "reprocessamento de devolução", `aprovacao_manual`, "troca de unidade de item", "unidade travada no cadastro", advisory lock de almoxarifado, ou FK de `retirada_id`, ler esta seção.

## Fix da devolução agregada do almoxarifado (2026-09-16)

O teste end-to-end da fase 2 do estoque de almoxarifado expôs um bug de integridade na trigger `trg_retirada_almoxarifado_mov`. No caminho sem vínculo de retirada (fallback do catálogo no PWA), o saldo devolvível era calculado como `total de retiradas - devoluções com retirada_id IS NULL`, ou seja, devoluções vinculadas já aprovadas não eram descontadas do agregado. Resultado observado: com 2 furadeiras retiradas e 1 já devolvida via vínculo, uma devolução não vinculada de 5 unidades foi aprovada em 2 quando o pendente real era 1.

A migration `20260916210000_fix_devolucao_pendente_agregado.sql` corrige a trigger para subtrair todas as devoluções aprovadas do item e da pessoa, independente de vínculo, e remove o filtro `necessitaDevolucao='S'` do cálculo de integridade do fallback: qualquer item retirado e ainda não devolvido pode retornar (sobra de consumível volta à prateleira). O flag continua governando apenas a lista de pendências exibida pela RPC `get_itens_pendentes_devolucao`, que passou a abater devoluções aprovadas sem vínculo das pendências por alocação em ordem de retirada (mais antiga primeiro). A comparação de `itemId` no JSONB passou a ser feita como texto (`= v_item_id::text`) para não quebrar em registros legados com valor inválido.

Validado na fazenda de testes (`d649c65e`): devolução não vinculada de furadeira sem pendente foi integralmente retida (`quantidade_aprovada = 0`, `requer_revisao = true`, estoque inalterado); devolução de 3 m de mangueira (consumível com `necessitaDevolucao='N'`, saldo devolvível de 5 m) foi aprovada integralmente. A movimentação errada criada durante o teste foi corrigida pontualmente (`quantidade_aprovada` 2 → 1, estoque recalculado pela trigger).

A branch precisou receber os arquivos de migration `20260916000011`, `20260916180000`, `20260916190000` e `20260916200000` do `master` (boletim de rebanho e capas) porque já estavam aplicados no remoto e o `db push` exige arquivo local para toda versão aplicada. Como são arquivos idênticos aos do `master`, o merge futuro não gera conflito.

Disparador: quando mencionar "devolução aprovada a mais", "pendente agregado errado", `retirada_id IS NULL` na trigger do almoxarifado, ou "devolução de consumível retida", ler esta seção.

## Correção do shift de datas no XLSX de suplementação (2026-09-16)

- As colunas "Data Anterior" e "Trato Seguinte" do export de `Suplementacao.tsx` saíam um dia antes do real (ex.: trato de 16/09 com anterior real em 15/09 exibia 14/09, com intervalo correto de 1 dia). Causa: o código gerava `new Date("YYYY-MM-DD").toISOString()` (meia-noite UTC) e o `formatDate` convertia o instante para `America/Cuiaba` (UTC-4), caindo em 20h do dia anterior. Os intervalos saíam certos porque eram calculados numericamente, sem conversão.
- `data_anterior`/`data_proximo` agora são emitidos como date-only `YYYY-MM-DD` no fuso da fazenda via novo helper `toFarmDateOnly` em `formatDate.ts`, que o `formatDate` renderiza sem conversão (branch de strings date-only).
- A série por lote passou a ser ordenada pelo timestamp completo (`data`, tiebreak `created_at`) em vez de só pelo dia: antes, registros do mesmo dia ficavam na ordem reversa de criação, e o "anterior" podia apontar para um trato do mesmo dia registrado depois dele.
- O intervalo passou a contar dias de calendário no fuso local (consistente com a coluna "Data Atual"), e não mais dias UTC.

Disparador: quando mencionar "data anterior errada", "trato seguinte errado", "xlsx de suplementação com data errada", "shift de -1 dia no export", `toFarmDateOnly`, ler esta seção.

## Redesign do sidebar: hierarquia visual, acessibilidade e command palette (2026-09-15)

- O sidebar do `ControllerLayout` foi reorganizado em 4 seções semânticas (Principal, Operação, Insumos & Estoque, Sistema) com headers e divisores visuais, eliminando a lista plana de 12 itens sem hierarquia.
- Estado ativo refinado: `bg-primary/15` + barra esquerda 3px no pai, `bg-primary/20` no filho, corrigindo a inversão de peso onde o filho ficava mais escuro que o pai.
- Ícones resolvidos: "Estoque" ganhou ícone distinto de "Insumos" (caixa/archive vs cubo 3D); "Assistente de IA" convertido de `fill` para `stroke` outline, unificando o set visual.
- Submenu com hierarquia real: conector visual `border-l`, indentação `ml-3`, chevron-right 14px no lugar do bullet, densidade calibrada (`py-2` no nível 1, `py-1.5` no nível 2).
- Colapso funcional com flyout: no modo `w-20`, grupos expansíveis exibem popover à direita no hover (CSS puro via `group-hover`), restaurando acesso aos ~20 destinos de submenu.
- Auto-scroll ao item ativo no mount e ao trocar de rota via `scrollIntoView({ block: 'nearest' })`.
- Command palette (Ctrl+K): busca fuzzy por nome em todos os 25 destinos, navegação por teclado (↑↓ Enter Escape), acessibilidade com `role="listbox"`/`role="option"`/`aria-selected`.
- Acessibilidade completa: `role="navigation"` no aside, `aria-current="page"`, `aria-expanded`/`aria-haspopup` nos grupos, `role="group"` nos submenus, `focus-visible:ring-2` em todos os botões, `aria-hidden` em SVGs decorativos.
- Unificação parcial: `Sidebar.tsx` atualizado com as mesmas melhorias de acessibilidade e estado ativo; `AdminLayout` e `SuperAdminLayout` corrigidos (troca de `window.location.href` por `useNavigate`, acessibilidade no drawer mobile e botões). **Débito técnico**: a unificação estrutural completa (extrair um componente único de sidebar do `ControllerLayout` e migrar os três layouts para usá-lo) permanece pendente, pois exigiria estender a interface `SidebarItem` para suportar seções, grupos, flyout e command palette.

## Página final de encerramento no relatório geral (2026-09-15)

- O relatório geral passou a terminar com uma página profissional contendo `Atenciosamente,`, `Gesta'Up`, a identidade Manej'Us 360 e os logos institucionais sobre o fundo verde padrão. A página não usa a imagem de fundo da capa nem exibe o rótulo `Encerramento`.
- Os logos da capa e da página final passaram a usar uma única faixa institucional translúcida, sem cartões brancos individuais; o logo da fazenda recebe tratamento de mistura para reduzir visualmente o fundo branco original.
- A nova página entra na paginação global e não altera os PDFs individuais.

## Proteção do rodapé nos PDFs Puppeteer (2026-09-15)

- A área inferior reservada para o rodapé dos PDFs Puppeteer foi ampliada para impedir que tabelas encostem ou invadam a paginação.
- As tabelas de Abastecimento, Mortes e Ocorrências de Bebedouros passaram a usar chunks menores por página, mantendo a continuação na página seguinte antes da faixa do rodapé.
- O rodapé ganhou fundo branco e camada própria para preservar legibilidade quando o conteúdo chega próximo da área inferior.
- O compositor e os testes de regressão continuam usando paginação global e validam a reserva de espaço do rodapé.

Este arquivo registra mudanças já aplicadas no Painel Web. Um chat novo não precisa ler isto por padrão; consulte quando a pergunta for sobre "por que isso foi feito assim" ou para entender o estado anterior de uma parte do código.

## Relatório mensal geral com composição Puppeteer (2026-09-15)

- A página de Relatórios do controller ganhou o configurador `Relatório Mensal Completo`, que reúne Abastecimento, Consumo, Bebedouros e Mortes em um único PDF.
- O intervalo é obrigatório, inclusivo e limitado a 31 dias. Os quatro relatórios começam selecionados, podem ser reordenados por controles acessíveis e recebem exatamente as mesmas datas, sem filtros internos adicionais.
- `api/pdf/geral.js` autentica o usuário, valida o vínculo com a fazenda e compõe capa e seções em uma única execução do Chromium. A paginação é global, e relatórios selecionados sem dados recebem uma página explícita.
- A capa A4 paisagem contém Manej'Us 360, GestaUp Company, logo e nome da fazenda, título `Relatórios Mensais`, subtítulo `Registros Operacionais` e mês/ano inteligente. O fundo pode usar uma imagem da biblioteca privada ou o gradiente institucional.
- O bucket privado `relatorios-gerais` armazena a logo institucional em `system/gestaupcompany.png` e fundos em `<fazenda_id>/capas/`. Não há tabela de metadados nem persistência dos PDFs gerados.
- A migration `20260916000010_relatorio_geral_storage_e_acesso` criou o bucket, policies por fazenda e wrappers autenticados das quatro fontes de dados, preservando as RPCs públicas existentes.
- O payload é limitado preventivamente a 4 MB, mantém uma única cópia de cada logo, a capa é lida diretamente do Storage e a resposta do PDF é enviada em blocos.
- Teste funcional na fazenda `d649c65e-16ab-4b77-a84b-df937aa41cc3`: Abastecimento + Bebedouros gerou 8 páginas; os quatro relatórios geraram 15 páginas para o período inclusivo de 29 dias entre 18/08/2026 e 15/09/2026. Capa, gráficos, ordem, datas e paginação global foram conferidos no Chrome.

## Auto-instanciação de itens no estoque de suplementos (2026-09-15)

**O que foi feito**: eliminação do passo manual "Instanciar Item" no `EstoqueSuplementacao.tsx`. Todos os insumos e formulações passam a ter `controla_estoque = true` por padrão desde a criação. Itens existentes foram backfillados para `controla_estoque = true` via migration `20260916000008_auto_instantiate_estoque_suplementos`.

**Mudanças técnicas**:
- Migration estrutural `20260916000008` altera o `DEFAULT` de `controla_estoque` para `true` nas tabelas `insumos` e `formulacoes` e faz UPDATE em registros existentes.
- `EstoqueSuplementacao.tsx` reescrito: removido modal de "Instanciar", opções de itens não instanciados e estado `instanciarForm`.
- Adicionado filtro "Mostrar apenas itens com movimentação" (default ativado) para reduzir ruído de itens sem entradas/saídas registradas.
- Adicionada edição inline de `estoque_minimo` em cada card: clique no valor, digite e confirma; salva direto no banco e recarrega a lista.
- Dashboard agrega saldos e alertas a partir de todos os itens ativos, não apenas os com `controla_estoque = true`.

**Motivação**: o passo de "Instanciar" criava atrito e um modo de falha silencioso (suplementações não descontavam estoque se o usuário esquecesse de instanciar). O gate `controla_estoque` não fazia sentido no domínio, pois todo insumo/formulação consumido na suplementação é um produto físico. A edição inline de estoque mínimo substitui a configuração que antes era feita no modal de instanciar.

**Teste** (fazenda `d649c65e-16ab-4b77-a84b-df937aa41cc3`): após `supabase db push`, a página de Estoque de Suplementação exibiu todos os 12 insumos e 4 produtos finais ativos sem precisar de instanciar. O filtro ocultou/exibiu itens com movimentação corretamente. A edição inline de estoque mínimo salvou o valor e o alerta disparou quando o saldo ficou abaixo do mínimo. Valor de teste revertido via MCP.

**Disparador**: quando mencionar "estoque de suplementos", "instanciar item", `controla_estoque`, "estoque mínimo" ou "itens sem movimentação", lembrar que o controle de estoque é automático desde a criação e o estoque mínimo é editável inline no dashboard.
## Estoque de suplementos: promoção do schema da branch para produção (2026-09-15)

**O que foi feito**: 7 migrations estruturais (20260916000000 a 20260916000006) aplicadas em produção via `supabase db push`, promovendo o schema que estava em desenvolvimento na branch `estoque-suplementos`. Branch deletada após promoção.

**Migrations aplicadas**:
- **A** (`20260916000000`): campos de estoque em `formulacoes` (`estoque_atual`, `estoque_minimo`, `custo_unitario`, `custo_total_estoque`, `controla_estoque`) + `controla_estoque` e `estoque_minimo` em `insumos`.
- **B** (`20260916000001`): tabela `movimentacoes_estoque_suplementos` com RLS, índices, constraint única `(registro_origem_id, item_tipo, item_id, tipo_movimentacao)` para idempotência do sync.
- **C** (`20260916000002`): funções WAC (`recalcular_custo_medio_item`, `update_estoque_suplemento`) + trigger `trg_update_estoque_suplemento` na tabela de movimentações. Custo médio ponderado móvel mantido automaticamente.
- **D** (`20260916000003`): `formulacao_id` em `registros_saida_insumos` e `registros_suplementacao` + backfill por nome (`dieta_produzida`/`formulacao` → `formulacoes.nome`).
- **E** (`20260916000004`): triggers nas tabelas de itens (`entrada_insumos_itens`, `saida_insumos_itens`, `registros_fabrica_confinamento_insumos`, `registros_suplementacao`) que chamam `inserir_movimentacao_estoque`. Inclui `expandir_premix_componentes` para expansão recursiva de premix (limite 3 níveis) na baixa de fábrica.
- **F** (`20260916000005`): `formulacao_id`, `lote`, `validade` em `entrada_insumos_itens` + constraint XOR `chk_item_alvo` + `local_id` em `saida_insumos_itens`.
- **G** (`20260916000006`): **dropa triggers e funções legados** (`atualizar_estoque_entrada`, `atualizar_estoque_saida`, `atualizar_estoque_item_entrada`, etc.) que causavam dupla contagem. Tabela `movimentacao_estoque` marcada como DEPRECATED, mantida para auditoria histórica.

**Arquitetura do fluxo**: PWA grava entrada/saída de insumos → trigger nos itens → `inserir_movimentacao_estoque` → `movimentacoes_estoque_suplementos` → trigger WAC → atualiza `insumos.estoque_atual`/`formulacoes.estoque_atual` + `custo_unitario`. Painel Web lê saldos em `EstoqueSuplementacao.tsx` e gerencia instanciação, entradas manuais, ajustes e histórico. PWA lê saldos via `cadastroCache.ts` (`getSaldoInsumosCached`, `getSaldoFormulacoesCached`).

**Transição**: `estoque_atual` existente em `insumos` é preservado. Novos triggers assumem o controle a partir dos valores atuais. `custo_unitario` começa em 0 para insumos não instanciados; o controller precisa instanciar via "Instanciar Item" no EstoqueSuplementacao para definir custo inicial e ativar o controle.

**Disparador**: quando mencionar "estoque de suplementos", "movimentacoes_estoque_suplementos", "WAC de suplementos", `controla_estoque`, "triggers legados de estoque", "dupla contagem de estoque", ou "branch estoque-suplementos", lembrar que o schema foi promovido em 2026-09-15 e os triggers legados foram removidos.

## Sincronização de histórico de pasto ao editar lote (2026-09-14)

**Problema**: ao editar o pasto de um lote no formulário de Lotes (`Lotes.tsx`), o `lotes.pasto_id` era atualizado diretamente sem criar `registros_pastagens` nem fechar/abrir `lote_pasto_historico` e `lote_modulo_historico`. O trigger `trg_registros_pastagens_mover_lote` só dispara via `registros_pastagens`, então a edição direta deixava o histórico stale. No PWA, o `PastagensPage` consultava `registros_pastagens` via `getUltimoStatusPastoCached` e bloqueava pastos como "ocupados" quando não tinham lote ativo.

**Correção aplicada**:
1. RPC `sincronizar_historico_pasto_lote_edit(p_lote_id, p_pasto_id_anterior, p_pasto_id_novo)` criada (migrations `20260914160100` e `20260914160200`). Fecha o `lote_pasto_historico` aberto, abre um novo, atualiza `individuos.pasto_atual`, e gerencia `lote_modulo_historico` (fechar antigo, abrir novo se mudou de módulo). Usa `set_config('app.skip_sync_lote_modulo', 'true', true)` para evitar duplicação via trigger `trg_sync_lote_modulo_historico`, mesmo padrão do `processar_movimentacao_pastagem`.
2. `Lotes.tsx`: após o UPDATE do lote, se o `pasto_id` mudou e não é confinamento, chama a RPC via `supabase.rpc('sincronizar_historico_pasto_lote_edit', ...)`. Erro na sincronização não bloqueia o salvamento do lote, mas exibe toast de aviso.

**Teste** (fazenda `d649c65e-16ab-4b77-a84b-df937aa41cc3`): lote "Teste 2" movido de P20 (Módulo 2) para P30 (Módulo 1) via RPC. Históricos sincronizados corretamente. Teste revertido.

**Disparador**: quando mencionar "editar pasto do lote", "sincronizar histórico de pasto", `sincronizar_historico_pasto_lote_edit`, ou "pasto ocupado sem lote no PWA", lembrar que a edição administrativa agora sincroniza o histórico via RPC.

## Upload de logo da fazenda pelo controller (2026-09-14)

- O controller agora pode atualizar o logo da própria fazenda sem depender do admin. Antes, o upload de logo só existia nas telas de admin (`NovaFazenda.tsx` e `EditarFazenda.tsx`).
- Criada a página `Configuracoes.tsx` em `src/pages/controller/`, acessível pela rota `/controller/configuracoes`, com seção "Logo da Fazenda": preview da logo atual, seleção de nova imagem, e botão "Salvar Logo" que deleta a logo antiga do bucket `logos`, faz upload da nova via `uploadLogo`, e grava a URL em `fazendas.logo_url` via `updateFazenda`.
- A opção "Configurações" no menu do usuário (avatar no Header) foi descomentada e ligada à nova rota via `useNavigate`. A intenção é que essa tela cresça como hub de configurações do controller, sem poluir o sidebar.
- Escopo restrito a `logo_url`: nenhum outro campo da fazenda (`ativo`, `acesso_confinamento`, `grupo_id`, `acesso_id`) é exposto ao controller, pois esses são decisões administrativas.
- Nenhuma migration necessária: a policy de update da tabela `fazendas` (`user_has_fazenda_access`) e a policy de upload do bucket `logos` já permitiam as duas operações para o controller.

## Relatório público de consumo com fallback para plano do lote (2026-09-14)

- A RPC `get_dados_relatorio_consumo` só considerava plano nutricional vinculado à categoria (`lote_categoria_id`) e os campos `lote_categorias.formulacao_id`/`data_meta_projetada`. Lotes com plano ativo no nível do lote (`planos_nutricionais.lote_id`, `lote_categoria_id NULL`) ficavam com pills vazios, e o Lote 13 perdia dieta, período e data prevista após a edição do lote sobrescrever os campos da categoria com NULL.
- CTE `cats_por_lote` agora traz também o plano ativo do lote via `LATERAL` e a personalização em `plano_categoria_personalizacao`. `dieta`, `dias` e `data_prevista_final` usam `COALESCE` preferindo plano da categoria, depois plano do lote, depois `lotes.formulacao_id`. `data_prevista_final` ganha fallback `data_inicio + periodo_dias` quando `data_meta_projetada` está ausente.
- `Lotes.tsx` passa a anexar o plano vigente do lote às categorias sem plano próprio (exceto bezerro/bezerra ao pé) ao carregar o formulário, e o save de edição do lote não sobrescreve `formulacao_id`, `estrategia_nutricional`, `peso_vivo_meta_kg_cab` e `consumo_meta_porcentagem_pesovivo` quando a categoria tem plano vigente, evitando desvinculação ao renomear/editar o lote.
- Backfill pontual da categoria bezerro do Lote 13 (fazenda f8be22c5) reaplicou os campos do plano ativo `Recria 1,5%` com backup prévio em `backup_lote_categorias_20260914`.
- Backfill sistêmico em outras fazendas (Guanabara, Marcon, Santa Cecília, GBJ Mirandópolis e fazenda de testes): 20 categorias ativas sob plano de lote com campos divergentes ou nulos foram alinhadas ao plano/formulação ativos (`formulacao_id`, `estrategia_nutricional`, `peso_vivo_meta_kg_cab`, `consumo_meta_porcentagem_pesovivo`, `gmd`, `data_meta_projetada`), excluindo bezerro/bezerra ao pé. Backup prévio em `backup_lote_categorias_20260914_sistemico`. Após o backfill, zero divergências em 72 categorias sob plano de lote.
- Auditoria dos fluxos de escrita em `Lotes.tsx`: o save do lote não envia mais `formulacao_id` (gerenciado pelos fluxos de plano); o save de categorias com plano vigente não sobrescreve `gmd`, `data_meta_projetada` e `dias_restantes_meta` além dos campos já protegidos; o save não cria planos de categoria duplicados quando o lote já tem plano ativo por lote; a exclusão de lote encerra também planos de categoria legados; a exportação XLSX passa a incluir planos vigentes no nível do lote.

## Ajuste no tamanho da logo da fazenda em PDFs (2026-09-14)

- A logo da fazenda no cabeçalho dos relatórios Puppeteer passou a respeitar a altura máxima de 60px sem ser forçada a um quadrado de 60x60, permitindo que logos com proporção diferente de 1:1 ocupem mais espaço visual e fiquem proporcionais à logo do sistema.
- CSS ajustado em `api/pdf/_shared/template.js`: `.farm-logo` agora usa `max-width:120px; max-height:60px; width:auto; height:auto; object-fit:contain`.

## Relatório de bebedouros com Puppeteer (implementado em 2026-09-12)

- Migrado de jsPDF client-side para Puppeteer server-side, seguindo o mesmo padrão de `morte.js`, `consumo.js` e `abastecimento.js`.
- Criado `api/pdf/bebedouros.js` (endpoint fino) e `src/utils/relatorioBebedourosPDFPuppeteer.ts` (wrapper client).
- KPIs preservaram o estilo com barra lateral colorida por status (verde/ambar/vermelho/cinza) via componente local `kpiStatus()`, não o `kpi()` padrão do template, porque a cor carrega semântica de status.
- Dois modos mutuamente exclusivos na Seção 1: "dia único" (KPIs de limpezas do dia + gráfico de intervalo) e "período" (KPIs de status + alerta de maior atraso + gráfico de dias desde última limpeza).
- Gráfico de período paginado por espaço vertical disponível (pre-chunk dinâmico: primeira página cabe menos por causa dos KPIs/alerta, continuação cabe mais), não por N fixo como os outros relatórios.
- Linha tracejada de meta individual por bebedouro portada via plugin Chart.js `metaLinha`/`metaLinhaDia`.
- Tabela de ocorrências com texto livre paginada em 15 linhas por página (antes cortava silenciosamente em 60 sem aviso).
- Footer padronizado com `renderFooter` (período + Página X de Y); "gerado em {data/hora}" removido pelo mesmo motivo dos outros três.
- Rota `/api/pdf/bebedouros` registrada no `vite.config.ts` para desenvolvimento local.
- Implementação jsPDF legada preservada em `src/utils/relatorioBebedourosPDF.ts`.

## Relatório de abastecimento com Puppeteer (implementado em 2026-09-11)

- Migrado de jsPDF client-side para Puppeteer server-side, seguindo o mesmo padrão de `morte.js` e `consumo.js`.
- Criado `api/pdf/abastecimento.js` (endpoint fino) e `src/utils/relatorioAbastecimentoPDFPuppeteer.ts` (wrapper client).
- RPC `get_dados_relatorio_abastecimento` atualizado com `LEFT JOIN` em `maquinas_veiculos` para retornar `marca` (nome) e `modelo` separados, preservando o campo legado `maquina` como fallback.
- Abreviação de marcas no endpoint e no frontend: John Deere → JD, Volkswagen → VW, Massey Ferguson → MF, New Holland → NH, etc. Marcas desconhecidas mantêm o nome original.
- Layout: página 1 com KPIs laterais e gráfico de litros por máquina; página 2 com gráficos de combustível e operação lado a lado; páginas seguintes com tabelas de detalhamento por máquina e operacional, ambas paginadas.
- Tabelas com bordas verticais entre colunas e zebra striping, padrão aplicado também ao relatório de morte.
- Logo da fazenda padronizada em 60x60px no template compartilhado, mesma dimensão da logo do sistema.
- Rota `/api/pdf/abastecimento` registrada no `vite.config.ts` para desenvolvimento local.
- Implementação jsPDF legada preservada em `src/utils/relatorioAbastecimentoPDF.ts`.

## Relatório de mortalidade com Puppeteer (implementado em 2026-09-11)

- Adicionada a Serverless Function `api/pdf/morte.ts`, usando `puppeteer-core` e `@sparticuz/chromium` para gerar o PDF no runtime Node.js da Vercel.
- O cliente prepara logos e gráficos como base64 e envia o payload para a function; o limite aplicado é de 10.000 registros e aproximadamente 4 MB por requisição.
- O relatório público oferece botões separados para gerar com Puppeteer no servidor ou com React PDF localmente; uma falha do Puppeteer não é mais mascarada por fallback automático.
- A implantação não exige configuração adicional no painel da Vercel; a rota em `api/` é detectada automaticamente. Para execução local, pode-se definir `PUPPETEER_EXECUTABLE_PATH` apontando para um Chrome instalado.

## Relatório de mortalidade em React PDF (implementado em 2026-09-10)

- O PDF público de mortalidade passou a usar `@react-pdf/renderer` com layout declarativo em React, mantendo o gerador jsPDF legado durante a validação.
- O layout foi refinado para uso com cliente final: identidade visual mais leve, KPIs com bordas e destaque superior, rodapé fixo com período e paginação, páginas separadas para análises e tabelas, e tabelas com quebra por linha.
- Os gráficos passaram a ser gerados em resolução maior, com espaço reservado para rótulos e melhor tratamento de valores nas barras horizontais.

## Pastos ↔ Bebedouros: fase 1 (concluída em 2026-07-23)

- Relação migrada de JSONB (`pastos.bebedouros`) para tabela de junção `pasto_bebedouros(pasto_id, bebedouro_id)` com FK e RLS.
- Coluna JSONB `pastos.bebedouros` mantida no banco por segurança (não é mais escrita pelo app), mas pode ser dropada depois de confirmar estabilidade.
- UI do `Pastos.tsx` mostra o MultiSelect de bebedouros sempre (não mais condicionado a `fonte_agua_principal === 'Bebedouro'`).
- Associação está **opcional** nesta fase. A fase 2 (obrigatoriedade) está pendente (ver `docs/BACKLOG.md`).

Disparador: quando o usuário mencionar "bebedouro obrigatório", "fase 2 bebedouros", "tornar bebedouro obrigatório no pasto", ou retomar o assunto pasto↔bebedouro, lembrar estes pontos.

## Cronologia evolutiva do rebanho (faixas de categorias por peso)

Plano aprovado em 2026-07-24, implementação concluída em 2026-07-27.

Tabela de faixas padrão:
- Bezerro ao pé: 30-180 kg
- Bezerra ao pé: 30-170 kg
- Bezerro: 180-300 kg
- Bezerra: 170-280 kg
- Novilha: 280-420 kg
- Garrote: 300-420 kg
- Boi Magro: 420-500 kg
- Boi Gordo: acima de 500 kg
- Vaca: acima de 420 kg
- Touro: acima de 650 kg

Decisões tomadas:
1. **Posicionamento**: página standalone sob "Gestão da Fazenda" (`/controller/faixas-categorias`), quarto item do submenu (Lotes, Indivíduos, Cadastros Auxiliares, Faixas de Categorias).
2. **Escopo da tela**: edição de faixas + visualização da cronologia evolutiva como fluxo/linha do tempo, separado por sexo (machos: bezerro ao pé → bezerro → garrote → boi magro → boi gordo; fêmeas: bezerra ao pé → bezerra → novilha → vaca; touro isolado). Tudo numa página só.
3. **Modelo de dados**: tabela nova `faixas_categorias` com `fazenda_id, nome, sexo, peso_min, peso_max, ordem, ativo, cor`, unique em `(fazenda_id, nome)`. Defaults seedados para toda fazenda. A tabela `categorias` existente (3 registros vestigiais, sem faixas, sem consumidores) não é tocada.
4. **Hardcoded**: o array `categoriasOpcoes` no `Lotes.tsx` (linha 181) permanece intacto por enquanto. Substituição pela leitura da nova tabela acontece depois de o usuário validar a tela, numa fase posterior.
5. **Tropa**: desconsiderada nesta tela. Fica no hardcoded do Lotes.tsx e será removida ou tratada separadamente depois.
6. **Validação de continuidade**: a UI deve validar que não há gap nem sobreposição entre categorias consecutivas da mesma cadeia de sexo.

Disparador: quando o usuário mencionar "cronologia do rebanho", "faixas de categorias", "faixas de peso", "cronologia evolutiva", ou pedir para implementar a tela de categorias por peso, lembrar este plano.

### Destino do lote (corte vs reprodução) — adicionado em 2026-07-24

Pesquisa web (Embrapa, DeHeus, Rehagro, Canal Rural) confirmou que sistema_producao e destino são eixos ortogonais:
- **sistema_producao** determina onde o lote entra/sai na cronologia (trecho do fluxo).
- **destino** determina o terminal (boi gordo para abate, touro para reprodução).

Decisões:
1. **Campo novo `destino` no lotes** (valores: "corte"/"reprodução"), independente de sistema_producao. Não substitui nem reutiliza sistema_producao.
2. **Obrigatório em novos/edições**. Lotes existentes ficam sem destino até serem editados (não bloqueia, cronologia não aparece até preencher).
3. **Fêmeas têm cronologia única** (bezerra ao pé → bezerra → novilha → vaca), sem bifurcar por destino.
4. **Machos bifurcam**: corte termina em boi gordo (→ abate), reprodução termina em touro.
5. **Default inteligente por sistema**: Engorda/TIP/Confinamento-terminação → corte; Cria → reprodução; Recria/RIP/Sequestro → sem default (usuário decide). Default é sugerido, não travado.

Tabela combinatória machos (sistema × destino → entrada/saída na cronologia):
- Cria + qualquer destino: bezerro ao pé → bezerro (venda desmama)
- Recria + corte: bezerro → boi magro
- Recria + reprodução: bezerro → garrote (→ touro)
- Engorda + corte (obrigatório): boi magro → boi gordo
- Confinamento + corte: boi magro → boi gordo
- Confinamento + reprodução: novilha (cobrição)
- RIP + corte: bezerro → boi magro (acelerado)
- RIP + reprodução: bezerro → garrote (acelerado → touro)
- Sequestro + corte: bezerro → boi magro
- Sequestro + reprodução: bezerro → garrote
- TIP + corte (obrigatório): boi magro → boi gordo

Tabela fêmeas (cronologia única, sistema define entrada/saída):
- Cria: bezerra ao pé → bezerra (venda) ou vaca (matriz)
- Recria: bezerra → novilha
- Engorda/TIP/Confinamento: novilha → vaca (descarte)

Disparador: quando o usuário mencionar "destino do lote", "corte vs reprodução", "finalidade do lote", ou retomar a discussão de cronologia, lembrar estas decisões.

### Plano de implementação da cronologia + recategorização — adicionado em 2026-07-27

Implementação concluída em 2026-07-27. Resumo do que foi feito:

1. **Migration Parte A**: `lote_categorias` ganhou `data_fim` e `categoria_origem_id`; criada `lote_categorias_transicoes` com RLS, índices e snapshot jsonb.
2. **Migration Parte B**: `formulacoes` ganhou `categoria_inferida_automaticamente` (bool) e `categoria_inferida_observacao` (text); 36 formulações ativas sem categoria foram backfilled com inferência por peso/nome/sistema; 10 marcadas com observação de revisão prioritária.
3. **Cron `update_dados_lotes`**: reescrito com `AND lc.data_fim IS NULL` no cursor e no UPDATE, para não corromper snapshots. Testado em produção sem erros.
4. **UI do backfill**: `Formulacoes.tsx` mostra caixa amarela acima do select de categoria quando a flag está true; `Dashboard.tsx` mostra seção de avisos listando formulações da fazenda com categoria a confirmar, com links `?edit=<id>`. Hook `useFormulacoesBackfillAlert` em `useDashboardQueries.ts`. Ao salvar, flag é zerada e aviso desaparece.
5. **UI da cronologia + recategorização**: nova página `/controller/faixas-categorias` (componente `FaixasCategorias.tsx`), item "Faixas de Categorias" no menu "Gestão da Fazenda" do `ControllerLayout`. Página tem: edição de faixas por sexo (M/F), visualização da cronologia de cada lote como linha do tempo com cores, histórico de transições, botão "Recategorizar" que abre modal com Opção 2 (continuar com formulação atual vs trocar, seletor em soft mode com separador, aviso não-bloqueante se peso fora da faixa). RPC `recategorizar_lote_categoria(uuid, text, boolean, uuid, uuid, text)` executa a transação: encerra origem, encerra plano via `encerrar_plano_nutricional`, cria nova `lote_categoria`, cria novo plano nutricional, registra auditoria em `lote_categorias_transicoes` com snapshot.
6. **Seed de `faixas_categorias`**: tabela criada com defaults para todas as fazendas existentes e trigger `trg_seed_faixas_categorias` para novas fazendas. Defaults: Bezerro ao Pé (0-120), Bezerro/Bezerra (120-210), Garrote (210-360), Novilha (210-330), Boi Magro (360-450), Boi Gordo (450-520), Touro (450-700), Vaca (330-600).

Aprovação original: "Pode começar" em 2026-07-27. Typecheck e build passaram.

**Princípio de simplificação:** inteligência fica na visualização (camada 1), não na automação (camada 3). Recategorização é sempre manual, com clique explícito do usuário. Camada 2 (sugestão de "X animais acima de Y kg") está fora porque nem toda fazenda identifica indivíduos.

**Passo 1 — Migration Parte A (auditoria e snapshot):**
- `lote_categorias`: adicionar `data_fim` (timestamptz, nullable) e `categoria_origem_id` (uuid, FK para `lote_categorias.id`, nullable).
- Tabela nova `lote_categorias_transicoes` com `id, fazenda_id, lote_id, lote_categoria_origem_id, lote_categoria_destino_id, categoria_origem, categoria_destino, peso_na_transicao_kg, data_transicao, motivo ('manual'|'sugestao'), usuario_id, snapshot_jsonb`.
- Passivo: `lote_categorias` existentes ficam com `data_fim=NULL` e `categoria_origem_id=NULL`.

**Passo 2 — Migration Parte B (backfill de formulações):**
- `formulacoes`: adicionar `categoria_inferida_automaticamente` (bool, default false) e `categoria_inferida_observacao` (text, nullable).
- Backfill das 36 formulações ativas sem categoria, com inferência por `peso_vivo_medio` + `nome` + `sistema_producao`. Tabela de inferências completa registrada (bezerro/garrote/boi magro/vaca conforme o caso; 5 de confiança baixa/média marcadas com `categoria_inferida_observacao`).
- Novas formulações cadastradas pelo usuário sempre nascem com `categoria_inferida_automaticamente=false`.

**Passo 3 — Ajuste do cron `update_dados_lotes`:**
- Adicionar `AND lc.data_fim IS NULL` no WHERE do cursor que itera sobre `lote_categorias`.
- Ponto mais sensível: sem isso o cron corrompe o snapshot silenciosamente. Merece teste explícito.
- Função atual localizada: é `SECURITY DEFINER`, plpgsql, itera sobre categorias com plano nutricional ativo e projeta peso. Já tem lógica que respeita `data_ajuste_peso` e migra planos por peso.

**Passo 4 — UI do backfill:**
- `Formulacoes.tsx`: caixa amarela acima do select de categoria quando `categoria_inferida_automaticamente=true`, mostrando `categoria_inferida_observacao` se houver. Ao salvar, setar flag=false junto com a categoria informada.
- `Dashboard.tsx` (controller): seção de avisos no topo listando "N formulações com categoria a confirmar", filtrado por `fazenda_id` do usuário, com nomes clicáveis que levam à edição da formulação. Consulta: `SELECT id, nome FROM formulacoes WHERE fazenda_id=? AND ativo=true AND categoria_inferida_automaticamente=true`.
- Aviso desaparece quando a flag é zerada (única fonte de verdade).

**Passo 5 — UI da cronologia + recategorização (Opção 2):**
- Tela `/controller/faixas-categorias` em "Gestão da Fazenda": edição das faixas + visualização da cronologia como fluxo (sexo + sistema_producao + destino).
- Botão "Recategorizar" na cronologia do lote. Modal mostra origem, destino, peso, data, e rádio "Continuar com formulação atual" (default) vs "Trocar formulação".
- Se "Trocar": seletor de formulações em soft mode (categoria destino primeiro, separador, depois outras).
- Aviso não-bloqueante se peso atual estiver fora da faixa da categoria destino.
- Execução em transação: encerra `lote_categoria` antiga (`data_fim=now()`), encerra plano nutricional ativo via RPC `encerrar_plano_nutricional`, insere nova `lote_categorias` copiando dados operacionais com `categoria_origem_id` e `peso_entrada_kg_cab = peso_vivo_atual_kg_cab` da origem, `data_ajuste_peso=NULL`, insere novo `planos_nutricionais` (copiando do anterior ou com nova formulacao_id), insere auditoria em `lote_categorias_transicoes` com snapshot jsonb.

Disparador: quando for retomar a implementação da cronologia, recategorização ou backfill de formulações, ler este plano antes de começar.

### Plano de testes e correções pós-teste — adicionado em 2026-07-28

Plano de testes executado em `docs/PLANO_TESTES_RECATEGORIZACAO.md` (5 fases). Todas as fases concluídas na fazenda de testes. Correções aplicadas durante os testes:

1. **Filtro `ativo=true` em queries de `lote_categorias`**: várias partes do frontend e banco somavam categorias encerradas junto com ativas, inflando cabeças e pesos. Corrigido em: `Lotes.tsx` (lista, salvamento, detalhe), `IndividuoNovo.tsx` (3 queries), `Currais.tsx`, `RelatorioGado.tsx`, `useDashboardQueries.ts`, funções DB `calcular_peso_medio_lote` e `calculate_quant_atual`, views `v_lote_pasto_ocupacao_atual`, `v_lote_modulo_ocupacao_atual`, `v_historico_ocupacao_pasto`, `v_historico_ocupacao_modulo`.
2. **Bug de perda de dados no salvamento de lotes**: `Lotes.tsx` buscava todas as categorias (ativas e encerradas), processava só as ativas do form, e deletava as que não estavam no form. Categorias encerradas eram deletadas silenciosamente. Corrigido filtrando `existingCategorias` por `.eq('ativo', true)`.
3. **Constraint `unique_lote_categoria` corrigida**: era `UNIQUE(lote_id, categoria)` sem filtro, impedindo que um lote voltasse a uma categoria anterior (ex: boi gordo → boi magro → boi gordo). Alterada para partial unique index `unique_lote_categoria_ativa ON lote_categorias (lote_id, categoria) WHERE ativo = true`.
4. **Snapshot completo do lote na RPC**: `recategorizar_lote_categoria` agora inclui `to_jsonb(lote_origem)` no `snapshot_jsonb`, capturando 47 campos do lote, 57 da categoria, 14 do plano, 10 de performance estruturada (`performance_plano_nutricional`) e 14 métricas derivadas (`metricas_plano_nutricional`) = 142 campos/transição. As métricas de performance são lidas de volta de `planos_nutricionais_snapshots` após `encerrar_plano_nutricional` executar, sem duplicar lógica de cálculo. Transições antigas (pré-RPC update) não têm `lote_origem`, `performance_plano_nutricional` nem `metricas_plano_nutricional`. **Bugfix 2026-07-29**: quando `p_manter_formulacao=true` e `lote_categorias.formulacao_id IS NULL` (caso comum: a formulação fica no plano, não na categoria), a RPC agora busca `formulacao_id` do plano ativo original via `COALESCE(v_origem.formulacao_id, v_plano_origem.formulacao_id)`. Antes do fix, a nova categoria nascia sem formulação e sem plano nutricional, interrompendo a cronologia nutricional do lote.
5. **Export XLSX multi-sheet**: `exportXLSX.ts` refatorado com `exportToXLSXMultiSheet`. `FaixasCategorias.tsx` gera 2 abas: "Transições" (35 colunas) e "Lote (auditoria)" (30 colunas, só transições com `lote_origem`).
6. **Campo `destino` no formulário de lotes**: adicionado select "Destino" (Abate/Reprodução) em `Lotes.tsx`, obrigatório, com valores `corte`/`reprodução` no banco.
7. **Edição de planos vigentes**: `PlanoNutricionalModal.tsx` permite editar planos com `data_fim IS NULL` (vigentes). Planos encerrados (`data_fim` preenchida) não têm botão "Editar".

Disparador: quando mencionar testes de recategorização, auditoria de lotes, ou problemas com categorias encerradas, ler esta seção.

### Unificação de movimentações (lote_historico → registros_movimentacao) — adicionado em 2026-07-29

Problema: o PWA escrevia movimentações em `registros_movimentacao` e o painel web em `lote_historico`, sem sincronização. 7 de 8 fazendas com movimentações no PWA apareciam com histórico vazio no painel. Adicionalmente, 3 dos 4 registros da Guanabara tinham `lote_origem_id = null` porque foram criados por uma versão anterior do app que permitia digitação livre no campo de lote.

Correções aplicadas:

1. **H7: `lote_historico` ganhou `fazenda_id`**: coluna adicionada (nullable), backfill via JOIN com `lotes`, trigger `trg_lote_historico_set_fazenda_id` auto-popula em novos inserts. Policy RLS não foi alterada (mantida permissiva, alinhada com S3/S7 do AGENTS.md do PWA que exige coordenação).
2. **H1+H5: `Lotes.tsx` consulta `registros_movimentacao`**: a query do histórico agora filtra por `lote_origem_id = lote.id OR lote_destino_id = lote.id`, com fallback por nome (`ilike` em `lote_origem`) para registros antigos sem ID. A query de `lote_historico` foi removida.
3. **H2: Unificação em `registros_movimentacao`**: os 7 registros de `lote_historico` foram migrados para `registros_movimentacao` preservando IDs. `IndividuoNovo.tsx` agora escreve em `registros_movimentacao` em vez de `lote_historico` (3 pontos: saída por realocação, entrada por realocação, entrada de novo indivíduo). `lote_historico` não é mais escrita pelo painel, mas é mantida no banco por segurança.
4. **H6: UI distingue saída (laranja) de entrada (verde)**: a timeline do `Lotes.tsx` usa cores diferentes para saída e entrada, e mostra badge "(PWA)" ou "(painel)" conforme `individuo_id` está presente.
5. **Trigger `update_quant_atual_movimentacao` corrigido**: referenciava colunas renomeadas na migration da cronologia (`peso_entrada` → `peso_entrada_kg_cab`, `peso_vivo_kg` → `peso_vivo_atual_kg_cab`, `peso_vivo_meta_kg` → `peso_vivo_meta_kg_cab`, e removidas `data_meta`, `preco_animal_kg`, `preco_animal_cab`, `custo_operacional`). Também adicionado filtro `ativo = true` nas queries de `lote_categorias`.
6. **H3: Texto livre sem ID (registros antigos)**: 5 registros em `lote_origem` com `lote_origem_id = null` não têm backfill viável (0% de match exato). Aceito como perda histórica. O app atual usa `SearchableModal` que restringe à lista de lotes cadastrados, impedindo novos casos.
7. **H4: Lotes inativados referenciados**: 8 registros apontam para lotes inativados. A query por ID funciona mesmo para lotes inativos (JOIN por ID não depende de `ativo = true`). Não requer correção.

Disparador: quando mencionar movimentações, histórico de lote, `lote_historico`, `registros_movimentacao`, ou integração PWA ↔ painel web, ler esta seção.

### Transferência entre fazendas: registro em registros_movimentacao — adicionado em 2026-08-10

Problema: a RPC `transferir_lote_entre_fazendas` criava o lote destino, atualizava o lote origem e enviava notificações, mas não inseria nada em `registros_movimentacao`. Resultado: transferências entre fazendas não apareciam na lista de movimentações do painel web nem na planilha XLSX exportada. O PWA salvava um registro local no IndexedDB com `motivo='Saída'` + `subtipo='Transferência'`, mas esse valor de subtipo não existia no enum do banco.

Correções aplicadas:

1. **Enums estendidos**: `tipo_movimentacao_motivo` ganhou `'Transferencia'`; `tipo_movimentacao_subtipo` ganhou `'Saida'` e `'Entrada'` (sem acento, conforme decisão do usuário). Hierarquia: `motivo=Transferencia` + `subtipo=Saida` para a fazenda origem, `motivo=Transferencia` + `subtipo=Entrada` para a fazenda destino.
2. **Coluna `fazenda_destino_id` em `registros_movimentacao`**: uuid FK para `fazendas(id)`, nullable, com índice parcial. Permite rastrear para onde os animais foram. RLS existente não muda (filtra por `fazenda_id`, que é a fazenda dona do registro; `fazenda_destino_id` é informativo).
3. **RPC atualizada**: `transferir_lote_entre_fazendas` agora insere 2 registros em `registros_movimentacao`: um na fazenda origem (`motivo=Transferencia`, `subtipo=Saida`) e um na fazenda destino (`motivo=Transferencia`, `subtipo=Entrada`). Ambos com `fazenda_destino_id`, `lote_origem_id`, `lote_destino_id`, `categoria` (nomes e cabeças), `causa_observacao` descritiva, `responsavel` (nome do usuário), `sync_status='synced'`.
4. **PWA alinhado**: `MovimentacaoPage.tsx` agora salva o registro local com `motivoMovimentacao='Transferencia'` + `subtipo='Saida'` (em vez de `'Saída'` + `'Transferência'`), batendo com o que a RPC insere no Supabase. O registro local continua com `syncStatus='synced'` para não duplicar via sync engine. Não há risco de duplicação na lista do PWA porque `ListaRegistros` lê apenas do IndexedDB, nunca do Supabase.
5. **Painel web atualizado**: `Movimentacao.tsx` faz join `fazenda_destino_nome:fazendas!fazenda_destino_id(nome)`, mostra coluna "Fazenda Destino" na tabela desktop e no card mobile, e inclui `subtipo` e `fazenda_destino_nome` no filtro de busca. `MovimentacaoDetalhes.tsx` mostra subtipo e fazenda destino na seção "Motivação". `MOVIMENTACAO_EXPORT_CONFIG` ganhou coluna "Fazenda Destino" no XLSX.

Disparador: quando mencionar transferência entre fazendas, registro de movimentação de transferência, ou planilha de movimentação com transferência, ler esta seção.

### Renomeação de meta_consumo_ms_percent_pv para consumo_ms_percent_pv (adicionado em 2026-08-04)

Migration `20260803100000_renomear_meta_consumo_ms_percent_pv.sql` aplicada. A coluna `meta_consumo_ms_percent_pv` em `formulacoes` foi renomeada para `consumo_ms_percent_pv` (a coluna nova já existia no banco mas estava NULL; copiamos os dados da antiga e dropamos a antiga). A RPC `migrar_plano_nutricional` foi atualizada para usar `f.consumo_ms_percent_pv`. Todos os 4 arquivos frontend que referenciavam o nome antigo foram atualizados: `Lotes.tsx`, `Formulacoes.tsx`, `PlanoNutricionalModal.tsx`, `PlanoNutricionalDraftModal.tsx`. O `FaixasCategorias.tsx` foi atualizado para consultar o consumo da formulação via `formulacoesMap` em vez de ler do campo stale `lote_categorias.consumo_meta_porcentagem_pesovivo`. O card do plano nutricional em `Lotes.tsx` agora lê o consumo diretamente da formulação (`formulacao?.consumo_meta`), ignorando o campo da lote_categoria. Testado na fazenda de testes: RPCs `migrar_plano_nutricional`, `encerrar_plano_nutricional`, `recategorizar_lote_categoria` todas funcionando com o novo nome da coluna.

### Notificações de recategorização próxima — adicionado em 2026-07-30

Sistema de alertas in-app que avisa o produtor quando um lote está próximo de precisar recategorização. Aproveita a infraestrutura existente de `notificacoes` (tabela, sino no header, dropdown, mark as read, polling 30s).

Implementação:

1. **`notificacoes.dados_jsonb` (jsonb)**: coluna adicionada para armazenar dados estruturados do alerta (`lote_categoria_id`, `lote_id`, `lote_nome`, `categoria`, `peso_atual`, `limite_sup`, `percentual`, `dias_restantes`, `tipo_alerta='recategorizacao'`). Índice GIN parcial em `dados_jsonb->>'lote_categoria_id'`.
2. **RPC `gerar_notificacoes_recategorizacao(p_fazenda_id, p_usuario_id)`**: encontra `lote_categorias` ativas onde `peso_vivo_atual_kg_cab >= 95% * faixa.peso_max`, calcula `dias_restantes = (peso_max - peso_atual) / GMD` (fallback `plano_nutricional.gmd_planejado` → `lote_categorias.gmd`), insere notificação `tipo='warning'` com `acao_url='/controller/faixas-categorias'`. Dedup por `lote_categoria_id`: se já existe notificação não-lida para aquele lote_categoria, não insere outra. Retorna contagem de inserções.
3. **`recategorizar_lote_categoria` atualizada**: após encerrar a categoria origem e criar a nova, faz `UPDATE notificacoes SET deleted_at = now() WHERE dados_jsonb->>'lote_categoria_id' = origem_id AND tipo_alerta = 'recategorizacao'`. Assim, quando o produtor recategoriza, o alerta some do sino automaticamente.
4. **`Notifications.tsx`**: chama `supabase.rpc('gerar_notificacoes_recategorizacao', ...)` antes de carregar as notificações no `loadNotifications()`. O polling de 30s chama a RPC a cada ciclo; a dedup garante que não há duplicatas.

Threshold fixo de 95% no código da RPC. Se diferentes fazendas precisarem de thresholds diferentes no futuro, adicionar campo configurável em `fazendas` e parameterizar.

Disparador: quando mencionar notificações de recategorização, alertas de recategorização, sino de notificações, ou `gerar_notificacoes_recategorizacao`, ler esta seção.

### Fuso horário Mato Grosso (UTC-4) vs Supabase (UTC) — adicionado em 2026-07-31

**Diagnóstico confirmado:**
- Mato Grosso (Cuiabá) está em UTC-4 fixo (America/Cuiaba), sem horário de verão desde 2019.
- Supabase roda em UTC. Colunas `data` são `timestamptz`, armazenadas em UTC.
- Registros feitos no PWA a partir das 20h horário de Cuiabá ficavam com `data` no dia seguinte em UTC. Ex: registro às 20:17 de 27/07 → armazenado como `2026-07-28 00:17:00+00`. Qualquer `data::date` em UTC retornava 28/07 em vez de 27/07. **Corrigido em 2026-08-06** (ver detalhes abaixo).

**Fluxo atual do PWA (Caderneta-Digital-Gesta-Up):**
1. `SuplementacaoPage.tsx:128` — `data: todayBR()` gera `"27/07/2026"` via `new Date().getDate()` (fuso do dispositivo).
2. `api.ts:58-61` — concatena hora atual no fuso da fazenda: `"27/07/2026 20:17"`.
3. `syncService.ts:399` — `brWithTimeToIso("27/07/2026 20:17")` converte para `"2026-07-27T20:17:00-04:00"` (com offset America/Cuiaba).
4. PostgreSQL recebe com offset -04:00, armazena como UTC: `2026-07-28 00:17:00+00`.
5. Extrações `data::date`, `DATE(data)`, `EXTRACT(DAY FROM data)` operavam em UTC → retornavam 28/07 (errado). **Corrigido**: com `ALTER DATABASE SET timezone TO 'America/Cuiaba'` e `SET timezone` nas funções SECURITY DEFINER, agora retornam 27/07 (correto).

**Correção implementada em 2026-08-06 (migration `20260806130000_corrigir_timezone_banco.sql`):**

Abordagem de 3 camadas ("belt-and-suspenders"), mudando o banco e não o PWA. O PWA continua enviando `timestamptz` com offset `-04:00` correto; o instante real armazenado (ex: `2026-07-28T00:17:00+00` = 20:17 Cuiabá) é canônico e não é tocado.

1. **Camada 1 (ALTER DATABASE)**: `ALTER DATABASE postgres SET timezone TO 'America/Cuiaba'`. Faz `data::date`, `CURRENT_DATE`, `to_char(data, ...)` operarem em Cuiabá para todas as novas sessões. Após a mudança, `SELECT data` exibe `2026-07-27 20:17:00-04` em vez de `2026-07-28 00:17:00+00`.
2. **Camada 2 (SET timezone nas funções SECURITY DEFINER)**: `ALTER FUNCTION ... SET timezone TO 'America/Cuiaba'` em todas as 73 funções SECURITY DEFINER do schema public. Necessário porque o Supavisor (pooler em transaction mode) pode resetar a sessão entre chamadas, ignorando o default do banco. Para funções sem `search_path`, também adicionou `SET search_path TO 'public'`.
3. **Camada 3 (AT TIME ZONE explícito)**: nas 5 funções críticas que extraem data de `timestamptz`, todas as extrações foram trocadas por `(data AT TIME ZONE 'America/Cuiaba')::date` e `to_char(data AT TIME ZONE 'America/Cuiaba', ...)`. Redundância intencional para integridade máxima mesmo se as camadas 1 e 2 falhem. Funções: `calcular_consumo_registro_anterior`, `recalcular_peso_vivo_lote` (2 overloads), `get_dados_relatorio_consumo`, `recalcular_metricas_suplementacao`.

**Por que não mudar o PWA (abordagem anterior descartada):**
A proposta de strip do offset em `brWithTimeToIso` (retornar `"2026-07-27T20:17:00"` sem sufixo) corromperia o instante real: o PostgreSQL interpretaria como UTC e armazenaria `2026-07-27T20:17:00+00`, que são 16:17 Cuiabá, não 20:17. O horário exibido no frontend ficaria errado em 4 horas. A abordagem correta é manter o offset no PWA e mudar o banco.

**Passivo retroativo (registros já calculados com data UTC errada):**
A mudança de timezone não recalcula automaticamente os valores já armazenados de `consumo_medio_geral_kg_mn`, `consumo_medio_geral_percent_pv`, `custo_medio_reais_cab_dia` e `peso_vivo_kg`. Para a Guanabara, executado em 2026-08-06:
- `SELECT * FROM recalcular_metricas_suplementacao('f8be22c5-12e9-4bda-a813-fae8cb3d47ec')` — recalculou consumo de todos os lotes.
- `PERFORM recalcular_peso_vivo_lote(lote_id, false)` para cada lote_distinto — recalculou peso vivo.
- Backup pré-recálculo em `backups/backup_consumo_guanabara_timezone_2026-08-06.json`.
- Exemplo de correção: registro f1543c70 (Farmacia, 27/07 20:17 Cuiabá) tinha `consumo_medio_geral_kg_mn=45.666667` (548 kg / 1 dia / 12 animais, data UTC 28/07). Após recálculo: `22.833333` (548 kg / 2 dias / 12 animais, data Cuiabá 27/07). Intervalo correto é 2 dias (27/07 → 29/07).

**Outras fazendas com divergência (35 registros totais):** Sirio (25), Guanabara (9, corrigidos), Grupo Corrêa (1). Verificado em 2026-08-06: os 26 registros da Sirio e Grupo Corrêa não têm `lote_id` (lote digitado livremente como texto, sem vínculo com o cadastro de lotes) nem consumo/peso calculados. A divergência era apenas na exibição da data, já corrigida pela mudança de timezone do banco (`data::date` agora retorna a data Cuiabá correta). Não há cálculos retroativos a refazer para essas fazendas. Backup em `backups/backup_sirio_correa_timezone_2026-08-06.json`.

**Cron `update_dados_lotes`:** tabela `cron.job` (singular) acessível via SQL. Jobid 7, schedule `0 0 * * *` (meia-noite UTC = 20:00 Cuiabá), nome `update-peso-vivo-daily`, ativo, status `succeeded` em todas as execuções recentes. O schedule é adequado: às 20:00 Cuiabá o cron atualiza os pesos projetando até o dia Cuiabá atual (que às 20h ainda é o dia que está terminando). Com `SET timezone TO 'America/Cuiaba'` na função, `CURRENT_DATE` retorna o dia Cuiabá correto. Não precisa reagendar. Outros crons ativos: `verificar_ocupacoes_acima_meta` (jobid 4, `0 6 * * *` = 02:00 Cuiabá), `notificar_individuos_incompletos_antigos` (jobid 5, `0 8 * 1` = 04:00 Cuiabá segunda), `notificar_proximidade_desmama` (jobid 6, `0 8 1 * *` = 04:00 Cuiabá dia 1), `update_pesos_individuos` (jobid 8, `0 1 * * *` = 21:00 Cuiabá), `lembrete-tratos-diario` (jobid 9, horário, chama Edge Function).

**Impacto em cálculos (resolvido):**
- `recalcular_metricas_suplementacao` agora usa `(data AT TIME ZONE 'America/Cuiaba')::date` para intervalo entre registros. Registro das 21h de segunda e outro das 06h de terça agora aparecem como 1 dia (mesmo dia Cuiabá se for o caso), não 2.
- `recalcular_peso_vivo_lote` usa `(rs.data AT TIME ZONE 'America/Cuiaba')::date` para projeção de peso na data do registro.
- `get_dados_relatorio_consumo` usa `AT TIME ZONE` em filtros de data, labels `to_char` e cálculo de dias desde `data_inicio` do plano.

Disparador: quando mencionar fuso horário, timezone, UTC, Cuiabá, Mato Grosso, data adiantada, registro no dia errado, ou for corrigir o passivo de datas, ler esta seção.

### Normalização de insumos em formulações (Opção C) — adicionado em 2026-08-23

**Problema**: o JSONB `formulacoes.insumos` guardava `teor_ms` e `preco_ton_mn` de cada insumo como snapshot denormalizado no momento do salvamento. Editar um insumo atômico ou um premix não propagava para as formulações consumidoras, deixando custos e teores stale silenciosamente. O trigger `trigger_recalc_consumo_formulacao` só recalculava `registros_suplementacao`, não formulações consumidoras.

**Solução implementada** (migration `20260823000000_formulacao_insumos_tabela_juncao.sql`):

1. **Tabela `formulacao_insumos`**: tabela de junção normalizada `(formulacao_id, insumo_id, formula_teor_ms, ordem)` com PK composta, FKs com `ON DELETE CASCADE`, índice em `insumo_id` e RLS por fazenda. Substitui o JSONB `formulacoes.insumos` como fonte de verdade da composição. `teor_ms` e `preco_ton_mn` sempre lidos da tabela `insumos` via JOIN, nunca mais snapshot.

2. **Backfill**: 300 linhas extraídas do JSONB existente usando `jsonb_array_elements() WITH ORDINALITY`, preservando `insumo_id`, `formula_teor_ms` (com fallback para `formula_ms_percent` de schemas antigos) e `ordem`.

3. **Função `recalcular_formulacao(p_formulacao_id)`**: porta a lógica de `calcularFormulacao` do frontend para plpgsql. Usa loops em vez de temp table. Recalcula 7 campos derivados: `teor_ms_dieta`, `custo_total`, `custo_mn_tonelada`, `custo_ms_tonelada`, `consumo_ms_kg_cab_dia`, `consumo_mn_kg_cab_dia`, `custo_dieta_reais_cab_dia`. Para premix (`e_premix=true`), zera consumo/custo por cab/dia.

4. **Triggers automáticos**:
   - `trg_formulacao_insumos_recalc` (AFTER INSERT/UPDATE/DELETE em `formulacao_insumos`): recalcula a formulação afetada.
   - `trigger_recalc_formulacoes_on_insumo` (AFTER UPDATE de `teor_ms`/`preco_ton_mn` em `insumos`): recalcula todas as formulações que usam o insumo. Resolve a cascata premix→TMR e insumo atômico→formulações.
   - `trigger_recalc_formulacao_on_param` (AFTER UPDATE de `consumo_ms_percent_pv`/`peso_vivo_medio`/`e_premix` em `formulacoes`): recalcula a formulação quando parâmetros de entrada mudam sem mudar insumos.

5. **Frontend `Formulacoes.tsx`**: `handleSubmit` parou de escrever `insumos` (JSONB) e campos derivados na linha de `formulacoes`. Agora escreve apenas campos de entrada em `formulacoes` e a relação de insumos em `formulacao_insumos` (DELETE + INSERT). O trigger recalcula os derivados. `handleEdit` busca insumos da tabela de junção com JOIN em `insumos`. `loadFormulacoes` busca contagem de insumos da tabela de junção.

6. **Colunas físicas derivadas em `formulacoes` mantidas**: o PWA faz `select('*')` e lê `teor_ms_dieta`, `custo_mn_tonelada`, `custo_dieta_reais_cab_dia`, `consumo_ms_percent_pv` diretamente. Sem mudança no PWA.

7. **Coluna JSONB `insumos` preservada**: não dropada por segurança. Não é mais escrita pelo app. Pode ser dropada depois de confirmar estabilidade.

**Testado na fazenda de testes** (`d649c65e-16ab-4b77-a84b-df937aa41cc3`): formulação "Novilha" com 1 insumo "Farelo de Soja" (teor_ms=89%, preco=1450). Mudança de preco_ton_mn de 1450→1500 propagou custo_total de 1450→1500 automaticamente. Mudança de teor_ms de 89→90 propagou teor_ms_dieta de 89→90 automaticamente. Ambos revertidos com sucesso.

Disparador: quando mencionar "formulacao_insumos", "tabela de junção de insumos", "propagação de custo de insumo", "insumo stale em formulação", ou retomar a discussão de consistência de formulações, ler esta seção.

### Migration Z: peso_inicio_kg_cab por categoria em plano_categoria_personalizacao — adicionado em 2026-08-25

**Contexto**: após o refactor de plano por lote, o plano nutricional passou a pertencer ao lote (não mais à categoria). O campo único `planos_nutricionais.peso_inicio_kg_cab` deixou de fazer sentido porque um lote pode conter categorias com pesos muito diferentes (ex: vaca 400kg vs bezerra 170kg). Cada categoria precisa ter seu próprio peso inicial capturado no momento em que o plano é iniciado, para que o cron evolua o peso de cada categoria independentemente a partir desse valor.

**Migration**: `20260825240000_migration_z_pcp_peso_inicio.sql`

**Mudança de schema**:
- Adicionada coluna `peso_inicio_kg_cab numeric` em `public.plano_categoria_personalizacao` (nullable, sem default).

**Backfill em 3 etapas** (para planos já vigentes no momento da migration):

1. **Etapa 1 — peso_entrada_kg_cab como estimativa**: para toda `plano_categoria_personalizacao` com `peso_inicio_kg_cab IS NULL`, copia `lote_categorias.peso_entrada_kg_cab` da categoria correspondente. É a melhor estimativa quando o plano foi iniciado logo após a entrada da categoria no lote, sem evolução significativa.

2. **Etapa 2 — reconstrução reversa**: para as que ainda ficaram NULL, reconstrói o peso inicial subtraindo `GMD × dias` do `peso_vivo_atual_kg_cab` atual. Fórmula: `peso_reconstruido = peso_vivo_atual_kg_cab - (NULLIF(gmd,'')::numeric × GREATEST(CURRENT_DATE - data_inicio::date, 0))`. Usa `NULLIF(lc.gmd, '')` para ignorar categorias sem GMD. Só aplica quando `peso_vivo_atual_kg_cab IS NOT NULL`, `data_inicio IS NOT NULL` e `gmd IS NOT NULL`.

3. **Etapa 3 — fallback final**: para qualquer caso ainda NULL, usa `peso_vivo_atual_kg_cab` direto como peso inicial. É o menos preciso (assume que o peso atual é o peso inicial), mas evita deixar o campo NULL quebrando o cron.

**Ordem de precedência do backfill**: peso_entrada → reconstrução reversa → peso_vivo_atual. Cada etapa só preenche o que a anterior não cobriu (todas filtram `peso_inicio_kg_cab IS NULL`).

**Dependências**: esta migration deve rodar antes da Z2 (cron) e da Z3 (iniciar_plano_lote), pois ambas assumem que a coluna já existe. A Z2 reescreve o cron para usar `COALESCE(pcp.peso_inicio_kg_cab, lc.peso_entrada_kg_cab)` em vez de `COALESCE(pn.peso_inicio_kg_cab, lc.peso_entrada_kg_cab)`. A Z3 faz a RPC `iniciar_plano_lote` capturar `peso_vivo_atual_kg_cab` de cada categoria no momento da iniciação e gravar em `pcp.peso_inicio_kg_cab`.

**Campos legados mantidos**: `planos_nutricionais.peso_inicio_kg_cab` permanece no schema para compatibilidade/histórico, mas não é mais usado como fonte ativa pelo cron. O PWA também foi corrigido para não usá-lo (commit `d0ce61d` no repo do PWA, função `getPlanoNutricionalAtivoByLoteId` reescrita).

**Disparador**: quando mencionar "peso inicial por categoria", "backfill de peso_inicio", "migration Z", ou problemas com peso inicial de plano vigente após o refactor de lote, lembrar que o backfill foi feito em 3 etapas com precisão decrescente e que planos iniciados pós-migration capturam o peso real automaticamente via `iniciar_plano_lote`.

### Expediente (horário de atividade) + override por funcionário — adicionado em 2026-09-10

**Contexto**: o PWA já tinha RBAC por funcionário (PIN, cadernetas permitidas, controle de acesso). Faltava restringir o acesso ao app fora do horário de atividade da fazenda, com suporte a override por funcionário para turnos diferenciados (ex: vigilância noturna).

**Migration**: `20260910210000_add_expediente.sql`

**Mudança de schema**:
- `fazendas.expediente_habilitado` boolean (default false)
- `fazendas.expediente_timezone` text (default `America/Cuiaba`)
- `fazendas.expediente_dias` JSONB (estrutura `{ "0": { ativo, inicio, fim }, ... }` com chave 0=domingo até 6=sábado)
- `funcionarios.expediente_override` JSONB nullable (mesma estrutura, quando nulo o funcionário herda o expediente da fazenda)
- Trigger de RBAC versioning estendida para incrementar `rbac_versao` quando qualquer campo de expediente mudar

**Painel Web** (`CadastrosAuxiliares.tsx`, aba Funcionários):
- Card colapsável "Horário de expediente" com toggle on/off, fuso horário, e 7 dias da semana com checkbox + horário início/fim
- Resumo em texto natural acima dos controles (ex: "Seg, Ter, Qua, Qui, Sex 06:00-18:00 | Sáb 06:00-12:00")
- Toast de confirmação ao ativar/desativar expediente
- No formulário do funcionário, toggle "Horário personalizado" com os mesmos 7 dias e resumo
- Cards de funcionários mostram badges: "Acessa o app", "PIN" (verde) ou "Sem PIN" (vermelho), "Horário próprio" (roxo) quando override ativo
- Lista de cadernetas resumida: "todas (21)" quando tem todas, ou lista parcial quando tem subset
- Cargo mostrado no card quando funcionário não tem acesso ao app
- Busca sticky no topo da lista, com contador de funcionários
- Padrão desativar > excluir (igual a Lotes.tsx): só libera botão Excluir após Desativar; ConfirmModal agora diz "excluído permanentemente"
- `loadItems` filtra `deleted_at IS NULL` para funcionários

**PWA** (`Home.tsx`, `useExpediente.ts`, `useAppLock.ts`, `configSlice.ts`, `funcionarioAuthService.ts`):
- `configSlice` armazena `expedienteHabilitado`, `expedienteTimezone`, `expedienteDias`
- `useExpediente` hook avalia se o horário atual está dentro do expediente, considerando override do funcionário logado (quando nulo, herda fazenda)
- Suporte a turnos overnight (quando `fim < inicio`, considera ativo se `currentTime >= start OR currentTime <= end`)
- Tela de bloqueio "Fora do expediente" só aparece quando o funcionário está logado (não antes do login), para permitir que o override individual seja avaliado
- Revalidação periódica: 30s quando bloqueado por expediente, 10min caso contrário
- Revalidação em visibilitychange e mensagens do service worker
- Cache de expediente no IndexedDB, refresh no sync manual e automático
- Sem logout automático quando expediente acaba: o funcionário permanece logado e o app desbloqueia sozinho quando o horário permite novamente

**Disparador**: quando mencionar "expediente", "horário de atividade", "fora do horário", "bloqueio por horário", "override de expediente", "turno noturno", ou problemas com acesso ao app fora do horário, ler esta seção.

### Nome do arquivo XLSX com fazenda e caderneta — adicionado em 2026-09-10

**Contexto**: a exportação XLSX de cada caderneta gerava arquivos com nome técnico da tabela (ex: `registros_maternidade_2026-09-10.xlsx`), dificultando a identificação quando o gestor baixa várias cadernetas de fazendas diferentes.

**Mudança**: `downloadWorkbook` em `utils/exportXLSX.ts` agora aceita um `label` opcional que substitui o `tableName` no nome do arquivo. `exportToXLSX` e `exportToXLSXMultiSheet` recebem `fazendaNome` como parâmetro e montam o label como `${fazendaNome} - ${sheetName}` (individual) ou `${fazendaNome} - Cadernetas` (todas).

**Nova função em `utils/fazendaContext.ts`**: `getFazendaNome(fazendaId)` busca o nome da fazenda no Supabase.

**Padrão do nome do arquivo**:
- Individual: `Fazenda Gesta'Up - Maternidade - 2026-09-10.xlsx`
- Todas: `Fazenda Gesta'Up - Cadernetas - 2026-09-10.xlsx`

Aplicado em 17 páginas de cadernetas individuais + `exportAllCadernetas.ts`.

**Disparador**: quando mencionar "nome do arquivo xlsx", "exportação xlsx", "nome do arquivo exportado", ou problemas com identificação de arquivos exportados de cadernetas, ler esta seção.


### Relatórios públicos interativos (links compartilháveis) — adicionado em 2026-08-05

Implementado sistema de relatórios interativos com links públicos, estilo Power BI, onde o visitante não precisa login e pode filtrar dados em tempo real via slicers (data, máquina, combustível, operação).

Infraestrutura:
1. **Tabela `relatorios_publicos`**: `id (uuid = token), fazenda_id, tipo, titulo, criado_por, criado_em, expira_em (nullable), ativo`. RLS: SELECT público para registros ativos/não expirados; INSERT/UPDATE/DELETE só para usuários da fazenda.
2. **RPC `get_dados_relatorio_abastecimento(p_token uuid, p_data_inicio date, p_data_fim date)`**: `SECURITY DEFINER`, valida o token, filtra por `fazenda_id` e intervalo de data, retorna JSON com agregações (por máquina, por combustível, por operação) + listas de filtros disponíveis + totais. Permissão `EXECUTE` concedida a `anon` e `authenticated`.
3. **Rota `/r/:token`**: rota pública sem auth no `App.tsx`, renderiza `RelatorioPublico.tsx`.
4. **Página `/controller/relatorios`**: item "Relatórios" no sidebar do `ControllerLayout`. Lista relatórios disponíveis (abastecimento, gado, saúde), permite gerar link público (modal com título + copiar link) e gerenciar links ativos (copiar, desativar).

Fluxo de uso: usuário vai em Relatórios → clica em "Gerar link público" no card do relatório → digita título → recebe link `https://app.gestup.com/r/{uuid}` → copia e compartilha. Visitante abre o link, vê 3 painéis (bar chart por máquina, pie chart por combustível, bar chart horizontal por operação) + tabela detalhada, com slicers de data e dropdowns que filtram em tempo real.

Para adicionar novos relatórios públicos: criar nova RPC `get_dados_relatorio_{tipo}(...)`, adicionar card em `RELATORIOS_DISPONIVEIS` no `Relatorios.tsx`, e criar componente de visualização em `src/pages/public/` (ou reusar `RelatorioPublico.tsx` com switch por tipo).

**Relatório de consumo (suplementação) — adicionado em 2026-08-05:**
- RPC `get_dados_relatorio_consumo(p_token uuid, p_data_inicio date, p_data_fim date)`: `SECURITY DEFINER`, valida token, retorna por lote: info (peso, categoria, raça, dieta, KPIs) + registros calculados (trato kg/cab/dia, consumo %PV, leitura cocho, custo R$/cab/dia) via `LAG` window function. Permissão `EXECUTE` para `anon` e `authenticated`.
- Componente `RelatorioConsumoPublico.tsx`: layout fiel ao PDF (header verde, KPIs verdes, pills, gráfico ComposedChart com Bar+Line+Scatter). Filtros: data e lote. Switch no `RelatorioPublico.tsx` por `tipo === 'consumo'`.
- Botão de PDF removido do `Suplementacao.tsx`; o relatório agora é gerado exclusivamente via fluxo de links públicos em `Relatorios.tsx`.

Disparador: quando mencionar "relatório público", "link compartilhável", "relatório interativo", "Power BI", "slicer", ou for adicionar novo tipo de relatório público, ler esta seção.

### Trigger de recálculo de peso_vivo_kg em registros_suplementacao — adicionado em 2026-08-06

Problema: o PWA grava `peso_vivo_kg` em `registros_suplementacao` lendo `lote_categorias.peso_vivo_atual_kg_cab` no momento da sincronização. Quando parâmetros do plano nutricional (`data_inicio`, `gmd_planejado`, `peso_inicio_kg_cab`, `data_ajuste_peso`, `peso_vivo_atual_kg_cab`, `peso_entrada_kg_cab`) eram editados retroativamente, os registros antigos ficavam com pesos desatualizados. Correção histórica de 23 registros da fazenda Guanabara foi aplicada manualmente em 2026-08-06 (backup em `backups/backup_peso_vivo_guanabara_todos_lotes_2026-08-06.json`).

Solução implementada (migration `20260806100000_trigger_recalc_peso_vivo_registros.sql`):

1. **Função `recalcular_peso_vivo_lote(p_lote_id uuid, p_ajuste_manual boolean DEFAULT false)`**: recalcula `peso_vivo_kg` de todos os registros ativos do lote usando os parâmetros atuais do plano. Usa `IS DISTINCT FROM` para evitar writes desnecessários (no-op quando o valor já está correto).
2. **Trigger em `planos_nutricionais`** (`AFTER INSERT OR UPDATE OF data_inicio, gmd_planejado, peso_inicio_kg_cab, formulacao_id`): dispara recálculo quando parâmetros do plano mudam. INSERT cobre caso de plano novo com `data_inicio` retroativo.
3. **Trigger em `lote_categorias`** (`AFTER UPDATE OF data_ajuste_peso, peso_vivo_atual_kg_cab, peso_entrada_kg_cab`): dispara recálculo. Se `data_ajuste_peso` mudou, usa fórmula manual (`peso_atual + gmd * (D - data_ajuste)`); senão usa fórmula cron (`peso_atual + gmd * (D - CURRENT_DATE)`).
4. **Trigger em `formulacoes`** (`AFTER UPDATE OF gmd`): só afeta lotes cujo plano ativo tem `gmd_planejado IS NULL` (caso contrário `COALESCE` usa `gmd_planejado`).

**Semântica de `peso_vivo_atual_kg_cab`**: ambígua. Logo após ajuste manual é o peso na `data_ajuste_peso`; após o cron rodar é o peso projetado para hoje. A função distingue via `p_ajuste_manual`: quando `true`, `peso_atual` é base na `data_ajuste`; quando `false`, `peso_atual` é projeção de hoje. Ambas produzem o mesmo resultado quando o cron tem corrido, porque `peso_atual(hoje) = peso_no_ajuste + gmd * (hoje - data_ajuste)`.

**Interação com o cron `update_dados_lotes`**: o cron atualiza `peso_vivo_atual_kg_cab` diariamente, disparando a trigger. Como a fórmula `CURRENT_DATE` compensa o incremento diário, o recálculo produz os mesmos valores (no-op com `IS DISTINCT FROM`), sem recursão nem writes desnecessários.

**Prompt do PWA** (`docs/PROMPT_CORRECAO_PESO_VIVO_PWA.md`): atualizado com a fórmula correta para o cliente. A fórmula `data_ajuste_peso` no PWA usa `peso_atual + gmd * (D - hoje)` (não `D - data_ajuste`), porque `peso_vivo_atual_kg_cab` lido pelo PWA já é o peso de hoje após o cron. A trigger do banco corrige qualquer defasagem.

Disparador: quando mencionar "peso_vivo_kg incorreto", "recálculo de peso", "trigger de peso vivo", "projeção de peso retroativa", ou problemas com `peso_vivo_kg` em `registros_suplementacao`, ler esta seção.

### Triggers de recálculo de consumo (migration `20260806110000_trigger_recalc_consumo_registros.sql`)

Problema: o trigger `calcular_consumo_registro_anterior` (que calcula `consumo_kg_mn`, `consumo_kg_ms`, `consumo_pct_pv` e `custo_medio` do registro anterior quando um novo registro é inserido) só dispara em INSERT. Quando `teor_ms_dieta` ou `custo_mn_tonelada` da formulação eram editados depois, os registros antigos ficavam com `consumo_kg_ms` e `custo_medio` desatualizados. Quando `peso_vivo_kg` era corrigido pela trigger de peso, `consumo_pct_pv` não era recalculado. Correção histórica de 41 registros da fazenda Guanabara foi aplicada manualmente em 2026-08-06 (backup em `backups/backup_consumo_guanabara_2026-08-06.json`).

Solução implementada:

1. **Função `recalcular_consumo_por_formulacao(p_fazenda_id uuid, p_formulacao_nome text)`**: recalcula `consumo_kg_ms`, `consumo_pct_pv` (geral e 30dias) e `custo_medio` de todos os registros com `consumo_kg_mn` não-nulo que usam a formulação informada.
2. **Trigger em `formulacoes`** (`AFTER UPDATE OF teor_ms_dieta, custo_mn_tonelada`): dispara `recalcular_consumo_por_formulacao` quando parâmetros da formulação mudam. Só dispara se os valores realmente mudaram (`IS DISTINCT FROM`).
3. **Trigger em `registros_suplementacao`** (`BEFORE UPDATE OF peso_vivo_kg`): recalcula `consumo_pct_pv` (geral e 30dias) do próprio registro quando `peso_vivo_kg` muda. É BEFORE para que o recalculo aconteça no mesmo UPDATE, sem segundo write. Dispara em cascata quando `recalcular_peso_vivo_lote` atualiza pesos.

Cascata completa: `planos_nutricionais` UPDATE → `trigger_recalc_peso_plano` → `recalcular_peso_vivo_lote` → UPDATE `peso_vivo_kg` → `trigger_recalc_pct_pv_on_peso_change` recalcula `pct_pv`. Testada na fazenda de testes (`d649c65e`) com sucesso.

Disparador: quando mencionar "consumo desatualizado", "recálculo de consumo", "teor_ms_dieta mudou", "custo_mn_tonelada mudou", "pct_pv inconsistente", ou problemas com `consumo_kg_ms`/`consumo_pct_pv`/`custo_medio` em `registros_suplementacao`, ler esta seção.

### Mapas KML, georreferenciamento e GPS offline — adicionado em 2026-08-12

Arquitetura aprovada para o MVP de mapas com KML, edição de pastos no Painel Web e visualização offline com GPS no PWA. Documento completo em `docs/ARQUITETURA_MAPA_KML.md`.

**Resumo das decisões:**

1. **Biblioteca de mapa**: MapLibre GL JS + `vis.gl/react-map-gl` + `@mapbox/mapbox-gl-draw`. Sobre Leaflet (raster-first, tiles offline pesados) e Mapbox GL (custo recorrente, vendor lock-in). MapLibre é fork open-source do Mapbox GL, mesma engine, sem token, sem custo, caminho para PMTiles offline no futuro sem reescrita.

2. **Tiles de fundo**: ESRI World Imagery online (gratuito, sem token) no Painel Web e no PWA. No PWA, fallback gracioso offline: quando o MapLibre não carrega tiles, mostra fundo verde acinzentado com aviso discreto "Sem conexão: mostrando delimitações e sua posição". Polígonos, GPS e distância continuam funcionando offline (dados locais + compute local). Satélite offline via PMTiles fica para o futuro (fonte a definir: ortomosaicos próprios do setor de projetos ideal, Mapbox pago como fallback). ESRI offline é violação de termos ("uso apenas dentro do ArcGIS").

3. **Formato**: KML+KMZ como entrada (`fflate` para deszipar KMZ + `@tmcw/togeojson` para KML→GeoJSON), GeoJSON como intercâmbio, PostGIS `geometry(*,4326)` como armazenamento. PostGIS já ativo no Supabase desde 12/08/2026.

4. **Modelo de dados**: colunas novas em tabelas existentes (`pastos.geometria geometry(Polygon,4326)`, `bebedouros.geometria geometry(Point,4326)`, `fazendas.bounding_box geometry(Polygon,4326)`), todas nullable. Tabelas novas `mapa_estradas (LineString)` e `mapa_pontos (Point, tipo text)` para o que não tem casa. Índices GIST em todas. RLS seguindo o padrão `fazenda_id IN (SELECT ... FROM usuario_fazenda ...)`. Não usar tabela `mapa_elementos` genérica (quebra vínculo 1:1, perde validação de tipo de geometria, complica RLS).

5. **GPS no PWA**: `@capacitor/geolocation` para `watchPosition` (nativo, mais preciso que Web Geolocation API).

6. **Distância até pasto-alvo**: `turf.js` (`turf.distance` para centroide, `turf.pointToPolygonDistance` para borda), rodando no celular sem rede.

7. **Offline no PWA**: GeoJSON dos pastos/bebedouros/estradas cacheado no IndexedDB via `cadastroCache.ts` (mesmo padrão existente). Uma query por fazenda, payload pequeno (200-500KB para 100 pastos). Sem multi-tenancy: peão loga com `acesso_id` da fazenda dele, baixa só os dados dela.

8. **Fora do MVP (futuro aditivo, sem reescrita)**: satélite offline via PMTiles, routing pelas estradas (`ngraph.path` ou `turf.shortestPath`), edição de geometrias no PWA, terrain 3D, import de Shapefile.

**Pontos de atenção para a implementação:**
- Separar camadas no MapLibre: source de satélite separado dos sources de GeoJSON, para trocar online por PMTiles offline sem refactor.
- Validar geometrias importadas com `ST_IsValid` antes de salvar; usar `ST_MakeValid` se inválido.
- SRID 4326 consistente (WGS84, padrão GPS e KML).
- Um polígono por pasto no MVP; MultiPolygon fica para depois.
- Query de cache filtrar `geometria IS NOT NULL` para não trazer pastos sem geometria (maioria dos 1294 atuais).
- Incrementar versão do `cadastroCache` para forçar refresh quando o schema mudar.

Disparador: quando mencionar "mapa KML", "georreferenciamento", "pastos no mapa", "GPS no PWA", "MapLibre", "PostGIS", "geometria de pasto", "distância até pasto", ou retomar a implementação de mapas, ler esta seção e o `docs/ARQUITETURA_MAPA_KML.md`.

### Fix de dupla contagem em `calculate_quant_atual` — adicionado em 2026-08-13

Problema: o LOTE 15P GAR 6A (GBJ Mirandópolis) aparecia com 456 cabeças em vez de 228. O cron `update_dados_lotes` recalcula `quant_atual` chamando `calculate_quant_atual(lote_id, categoria)`, que soma `quant_inicial + SUM(movimentações)`. Quando uma `lote_categorias` é criada para receber animais de uma apartação, o `quant_inicial` já reflete esses animais, mas a movimentação de origem (com `lote_destino_id = lote_novo`) também é somada, contando os mesmos animais 2x. Bug simétrico: saídas anteriores à criação da categoria também eram subtraídas indevidamente (ex: TIP LOTE 12/vaca: 48 → 99, Lote 29/garrote: 35 → 132).

Causa raiz: a função não filtrava movimentações por data. Movimentações anteriores ao `created_at` da categoria já estão refletidas no `quant_inicial` e não deveriam ser re-somadas/re-subtraídas. A cláusula fallback `(tipo_entrada IS NULL AND lote_destino_id IS NOT NULL)` em `v_sum_transf_entrada` capturava registros de `motivo='Saída'` (apartação) como entrada do destino mesmo quando a categoria nasceu dessa movimentação.

Fix implementado (migration `20260813150000_fix_dupla_contagem_calculate_quant_atual.sql`):
1. Capturar `created_at` da `lote_categorias` ativa junto com `quant_inicial`.
2. Filtrar TODAS as queries de `registros_movimentacao`, `registros_morte` e `registros_maternidade` por `data >= v_created_at` (movimentações anteriores já estão no `quant_inicial`).
3. Exceção: quando `quant_inicial IS NULL`, desativar o filtro de data (`v_date_cutoff = '1900-01-01'`). Categorias de bezerro/bezerra ao pé frequentemente têm `quant_inicial=NULL` e a contagem vem das maternidades; filtrar por data zeraria o estoque.

Impacto aplicado (cron rodado em 2026-08-13, 9 categorias com plano ativo corrigidas):
- Dupla contagem de entradas corrigida (6 lotes): LOTE 15P GAR 6A (456→228), LOTE 16P GAR 6B (228→7), L1/boi magro (147→48), Lote 21/garrote (163→80), L5/Novilha (96→69), Lote 30/garrote (127→113).
- Subtração indevida de saídas corrigida (3 lotes): TIP LOTE 23/touro (9→10), TIP LOTE 12/vaca (48→99), Lote 29/garrote (35→132).
- Zero divergências restantes entre `quant_atual` gravado e `calculate_quant_atual` para categorias com plano ativo.

Categorias sem plano nutricional ativo não são atualizadas pelo cron e mantêm o `quant_atual` gravado até serem editadas no frontend. O frontend já chama `calculate_quant_atual` ao salvar (indiretamente via cron na próxima execução).

Disparador: quando mencionar "dupla contagem", "cabeças duplicadas", "quant_atual inflado", "calculate_quant_atual", "apartação duplicada", ou problemas com contagem de cabeças após transferência, ler esta seção.

### Sincronização de `peoes.fazenda_id` ao renomear `acesso_id` da fazenda — adicionado em 2026-08-13

Problema: a tabela `peoes` guarda o `acesso_id` da fazenda em texto na coluna `fazenda_id` (não o UUID). O fluxo de login do peão no PWA (`authService.ts:20` e Edge Function `login-peao`) faz `peoes?fazenda_id=ilike.<acesso_id_digitado>` para encontrar o peão, e depois `getFazendaByAcessoId(acesso_id)` para carregar a fazenda. Quando o `acesso_id` da fazenda era renomeado no Painel Web, `peoes.fazenda_id` não era atualizado, quebrando o login do peão nos dois sentidos: digitando o novo `acesso_id` o peão não era encontrado; digitando o antigo a fazenda não era encontrada.

Caso real (Fazenda Estrela, 13/08/2026): fazenda originalmente "Transcal" (`acesso_id = 'transcal'`) foi renomeada para "Fazenda Estrela" (`acesso_id = 'estrela'`). O `peoes.fazenda_id` ficou stale em `'transcal'`, quebrando o login do peão. O vínculo em `usuarios`/`usuario_fazenda` (backfill de 06/08) continuou correto porque aponta para o UUID da fazenda, que não mudou. Fix manual aplicado: `UPDATE peoes SET fazenda_id = 'estrela' WHERE id = '9c69309f-5d20-4f15-81bc-47d0f90bb6b3'`.

Correção estrutural aplicada (migration `sync_peoes_fazenda_id_on_acesso_id_update`): trigger `trg_sync_peoes_fazenda_id_on_acesso_id_update` AFTER UPDATE OF acesso_id ON fazendas, executa `sync_peoes_fazenda_id_on_acesso_id_update()` (SECURITY DEFINER, plpgsql). Quando `NEW.acesso_id IS DISTINCT FROM OLD.acesso_id`, faz `UPDATE peoes SET fazenda_id = NEW.acesso_id WHERE fazenda_id = OLD.acesso_id`. Testada na fazenda de testes (`d649c65e`): rename `gestaup` → `gestauptesttrigger` propagou para `peoes.fazenda_id`, e o rename reverso propagou de volta.

Disparador: quando mencionar "renomear acesso_id", "peão não consegue logar após renomear fazenda", "peoes.fazenda_id stale", "login do peão quebrado", ou problemas com login do peão após mudança de `acesso_id`, ler esta seção.

### Proveniência do peso: camada 1 (implementada em 2026-09-04)

Contexto: o peso vivo atual de uma categoria pode mudar por dois motivos distintos: (1) Entrada de animais (reponderação) ou (2) evolução diária pelo GMD do plano nutricional. Sem anotação, o usuário vê o número mas não sabe por que mudou.

**Camada 1 (implementada em 2026-09-04):** anotação textual abaixo do peso vivo atual no card da categoria, em `Lotes.tsx`. Mostra duas linhas:
- Entrada em DD/MM/AAAA: +N cab a X kg (última Entrada da categoria, buscada em `registros_movimentacao` filtrando `motivo_movimentacao='Entrada'` e `lote_origem_id=lote.id`, ordenado por `data DESC`).
- GMD X kg/dia x N dias = +Y kg (quando há plano ativo e `data_ajuste_peso` preenchido; `N = floor((hoje - data_ajuste_peso) / 86400000)`).

Bug de dados corrigido junto com a camada 1 (migration `20260904120000_entrada_reset_data_ajuste_peso.sql`): a trigger `update_quant_atual_movimentacao` não resetava `data_ajuste_peso` nem `data_pesagem` na Entrada. O cron diário somava GMD sobre o peso já reponderado, superestimando o peso vivo. Agora ambos os campos são setados para a data da entrada em categoria nova e existente.

A camada 2 (mini-gráfico de evolução do peso) está pendente (ver `docs/BACKLOG.md`).

Disparador: quando mencionar "camada 1 do peso", "proveniência do peso", "anotação de peso no card", ou retomar a implementação visual da evolução de peso, ler esta seção.

## Controle de expediente (implementado em 2026-09-10)

Sistema de bloqueio do PWA por horário de expediente, integrado ao RBAC existente. Quando controle_acesso_habilitado = true e expediente_habilitado = true, o PWA bloqueia acesso fora do horário configurado.

**Migration:** 20260910210000_add_expediente.sql adiciona expediente_habilitado, expediente_timezone, expediente_dias (JSONB) na tabela fazendas e expediente_override (JSONB) na tabela funcionarios. Estende o trigger incrementar_rbac_versao_on_toggle para disparar quando campos de expediente mudarem.

**Painel Web:** UI de configuração de expediente na aba Funcionários de CadastrosAuxiliares.tsx, abaixo do toggle de RBAC. Permite definir horário por dia da semana (0=dom..6=sab) com timezone, e override opcional por funcionásrio. Turno noturno (fim < inicio) - tratado automaticamente.

**PWA:** Hook useExpediente valida horário no timezone da fazenda usando Intl.DateTimeFormat. Tela de bloqueio distinta da tela de PIN. Expediente da fazenda persistido via 
edux-persist (localStorage); override por funcionário no cache IndexedDB. Revalidação em sync manual, sync automático (SW), interval de 10min, e visibilitychange.

Disparador: quando mencionar "expediente", "horário de atividade", "bloqueio por horário", expediente_habilitado, expediente_dias, expediente_override, useExpediente, ler esta seção.

### Equipe em registros_movimentacao — adicionado em 2026-09-12

Migration `20260912120000_add_equipe_movimentacao.sql`. Adiciona colunas `equipe integer` e `equipe_nomes jsonb` em `registros_movimentacao`, seguindo o mesmo padrão já existente em `registros_rodeio`. Permite registrar quantos peões participaram do manejo de movimentação e seus nomes.

Disparador: quando mencionar "equipe em movimentação", "equipe_nomes em registros_movimentacao", ou problemas com registro de equipe em movimentação, ler esta seção.

### Itens cantina (substitui itens_supermercado) — adicionado em 2026-09-13

Migrations `20260913120000_create_itens_cantina_table.sql` e `20260913130000_drop_itens_supermercado.sql`.

1. **Tabela `itens_cantina`**: catálogo de alimentos da cantina com `classificacao` (Perecíveis, Não Perecíveis, Bebidas, Limpeza/Higiene, Hortifruti, Carnes) e `unidade_medida` (kg, g, L, mL, Unidade, Pacote). Substitui `itens_supermercado` que não tinha classificação nem unidade. RLS no padrão das demais tabelas de cadastro (authenticated full access).
2. **Drop `itens_supermercado`**: 23 itens migrados para `itens_cantina` via backfill prévio validado. Tabela dropada com CASCADE. Página `ItensSupermercado.tsx` removida do `App.tsx` e do `CadastrosAuxiliares.tsx`.

Disparador: quando mencionar "itens cantina", "itens supermercado", "catálogo da cantina", ou problemas com cadastro de itens de cantina, ler esta seção.

### Sugestões de espécies de capim no cadastro de pastos — adicionado em 2026-09-13

Commit `22d84a6`. `Pastos.tsx` passou a oferecer sugestões de espécies de capim (datalist) no campo de espécie, facilitando o cadastro e padronizando nomes. Mudança apenas de UI, sem migration.

Disparador: quando mencionar "espécies de capim", "sugestões de capim", "datalist de capim", ou problemas com o campo de espécie no cadastro de pastos, ler esta seção.

### Controle de estoque de combustível — adicionado em 2026-09-13

Sistema de controle de múltiplos tanques de combustível por fazenda, com movimentações de entrada/baixa/ajuste, cálculo automático de saldo e custo médio ponderado (WAC).

**Migrations** (5 arquivos, todas aplicadas via `db push`):
- `20260915120000_create_estoque_combustivel.sql`: cria `tanques_combustivel` (id, fazenda_id, nome, tipo_combustivel, capacidade_maxima_l, saldo_atual_l, limite_alerta_l, ativo, deleted_at) e `movimentacoes_combustivel` (id, fazenda_id, tanque_id, tipo_movimentacao, quantidade_l, preco_por_litro, data, origem, registro_abastecimento_id, fornecedor, observacao). Unique partial index `(fazenda_id, tipo_combustivel) WHERE deleted_at IS NULL`. RLS authenticated. Adiciona `baixa_estoque_id` em `registros_abastecimento` linkando a baixa no tanque. Trigger `update_tanque_saldo` recalcula saldo a cada INSERT/UPDATE/DELETE.
- `20260915130000_add_local_id_movimentacoes_combustivel.sql`: adiciona `local_id TEXT` + índice único parcial para sync idempotente do PWA.
- `20260915140000_precision_wac_combustivel.sql`: ajusta precisão numérica (`numeric(12,3)` litros, `numeric(12,4)` preços/custo médio, `numeric(12,2)` valores monetários), adiciona `valor_total` em movimentações (obrigatório em entradas, nulo em baixas/ajustes via constraint `chk_movimentacao_valor_total`), adiciona `custo_medio_l` em tanques. Cria função `recalcular_custo_medio_tanque` (WAC movel) e substitui o trigger por `update_tanque_saldo_custo` que atualiza saldo e custo médio. Em UPDATE, recalcula do zero (WAC não é invertível sem histórico).
- `20260915150000_add_tanque_to_registros_abastecimento.sql`: adiciona `tanque_id` (FK) e `tanque_nome` em `registros_abastecimento`. Linkagem passiva: o operador no PWA indica qual tanque usou, a baixa continua manual no Painel Web.
- `20260915160000_add_estoque_inicial_origem.sql`: adiciona `'estoque_inicial'` na constraint de `origem` de movimentacoes, permitindo registrar o saldo inicial do tanque como movimentação de auditoria.

**Painel Web** (`EstoqueCombustivel.tsx`, grupo "Estoque" no sidebar com item "Combustível"):
- KPIs no topo: saldo total, consumo do mês, custo total, alertas.
- Cards de tanques com % de ocupação, cor de alerta quando abaixo do `limite_alerta_l`.
- Timeline de histórico por tanque (entradas, baixas, ajustes).
- Lista de abastecimentos pendentes de baixa com botão individual e "Dar baixa em todos".

**Tipos de combustível suportados**: Álcool, Gasolina, Diesel S10, Diesel Comum.

Disparador: quando mencionar "combustível", "tanque de combustível", "estoque de combustível", "WAC combustível", "custo médio por litro", "baixa de combustível", "movimentacoes_combustivel", "tanques_combustivel", ou retomar o assunto de controle de combustível, ler esta seção.

### Remoção do unique constraint de tanque por tipo — adicionado em 2026-09-14

Removido o unique partial index `idx_tanques_combustivel_unique_tipo_fazenda` que impedia múltiplos tanques ativos do mesmo tipo de combustível por fazenda. O sistema agora permite dois ou mais tanques do mesmo tipo (ex: dois tanques de Diesel S10). Migration `20260915170000_drop_unique_tanque_tipo_fazenda.sql`. O frontend (PWA e Painel Web) já tratava o caso de múltiplos tanques do mesmo tipo (seleção manual quando `tanquesFiltrados.length > 1`), então nenhuma mudança de UI foi necessária.

### Baixa automática de estoque via trigger + odômetro numeric + relatório com horas/km trabalhadas — adicionado em 2026-09-15

Três mudanças coordenadas no fluxo de abastecimento, compartilhando o mesmo banco Supabase entre PWA e Painel Web.

**1. Baixa automática de estoque via trigger (migration `20260915180000_baixa_automatica_abastecimento.sql`)**

A baixa de combustível era manual: o PWA criava o `registros_abastecimento`, o Painel Web listava pendentes e o gerente clicava "Dar Baixa". Agora a inserção do abastecimento cria a baixa atomicamente no banco, com trava de saldo server-side.

Trigger `trg_baixa_automatica_abastecimento` AFTER INSERT ON `registros_abastecimento`:
- Locka o tanque com `SELECT ... FOR UPDATE`.
- Rejeita saldo insuficiente com `RAISE EXCEPTION`.
- Insere `movimentacoes_combustivel` com `tipo_movimentacao='baixa'`, `origem='auto_baixa'`, `preco_por_litro = custo_medio_l do tanque`, `registro_abastecimento_id = NEW.id`.
- Atualiza `baixa_estoque_id` do abastecimento com o ID da movimentação criada.
- A trigger existente `update_tanque_saldo_custo` recalcula saldo e custo médio em cascata.

A UI de baixa manual foi removida do `EstoqueCombustivel.tsx`: seção "Abastecimentos Pendentes de Baixa", modal de baixa individual, modal "Dar Baixa em Todos", handlers `abrirModalBaixa`/`salvarBaixa`/`baixarTodos`, interface `AbastecimentoPendente`, state `abastecimentosPendentes`/`modalBaixa`/`modalBaixaTodos`/`baixaForm`. O `origemLabel` do histórico atualizado: `auto_baixa: 'Baixa Automática'`, removidos `painel_baixa` e `pwa_baixa`.

O PWA passou a exigir seleção de tanque obrigatória e valida saldo contra cache local antes de salvar (botão SALVAR disabled + aviso vermelho quando `totalAbastecido > tanque.saldo_atual_l`). A trigger do banco permanece a proteção autoritativa contra concorrência e cache stale.

**2. Odômetro/horímetro numeric + toggle "sem horímetro" (migration `20260915190000_odometro_horimetro_numeric.sql`)**

Coluna `registros_abastecimento.odometro_horimetro` migrada de `text` para `numeric(12,3)` nullable. Backfill de 18 valores inválidos: strings numéricas brasileiras ("4.721.6" → 4721.6, "2326,2" → 2326.2) convertidas, textos não-numéricos ("Não marca") e valor absurdo em notação científica convertidos para NULL. Resultado: 410 non-null, 6 null de 416 total.

PWA: campo odômetro/horímetro permanece required por padrão, com botão toggle "Clique aqui se essa máquina/veículo não possui horímetro/odômetro". Quando ativo: input fica disabled/read-only, placeholder muda para "Sem horímetro/odômetro", validation passa sem leitura, e o valor salvo é `NULL` (não string vazia). Bug corrigido em `validation.ts`: a função `validateAbastecimento` checava `odometro` como obrigatório hardcoded; agora lê `data.semHorimetro` para pular a validação. O flag `semHorimetro` é removido do payload antes de persistir no IndexedDB e nunca chega ao Supabase.

`syncService.ts` atualizado para enviar `odometro_horimetro` como `Number(normalizarNumeroString(...))` ou `null`, nunca como string. Interfaces do Painel Web (`RegistrosAbastecimento.tsx`, `RegistrosAbastecimentoDetalhes.tsx`) atualizadas de `string` para `number | null`.

**3. Relatório de abastecimento com horas/km trabalhadas (migration `20260915200000_rpc_abastecimento_trabalho_periodo.sql`)**

RPC `get_dados_relatorio_abastecimento` reescrita com CTE + `LAG` window function para calcular trabalho entre abastecimentos consecutivos da mesma máquina/veículo.

Particionamento: `PARTITION BY COALESCE(maquina_veiculo_id::text, maquina_veiculo)` (fallback por nome quando não há ID). Ordenação: `data, created_at`. O `LAG` é calculado sobre TODOS os registros da fazenda (sem filtro de data) para que o primeiro abastecimento dentro de um período filtrado ainda tenha a leitura anterior.

Campos novos no JSON de cada registro:
- `odometro_anterior`: leitura do abastecimento anterior (NULL para o primeiro).
- `trabalho_periodo`: diferença positiva entre leitura atual e anterior (NULL se não há anterior, se diferença ≤ 0, ou se leitura é NULL).
- `unidade_trabalho`: `'h'` para máquinas, `'km'` para veículos, `NULL` se tipo desconhecido (derivado de `maquinas_veiculos.tipo` via LEFT JOIN).
- `consumo_por_unidade`: `ROUND(total_abastecido / diferenca, 3)` quando calculável, `NULL` caso contrário.

Painel Web: `RelatorioPublico.tsx` adicionou 2 colunas na tabela de detalhamento por máquina: "Trabalho no período" (ex: "200.141 h" ou "12 km") e "Consumo médio" (ex: "0.952 L/h" ou "4.667 L/km"), ambas com "—" quando indisponível. Agregação por máquina soma `trabalho_periodo` de todos os registros e calcula consumo médio = totalLitros / totalTrabalho. `DetalheMaquina` ganhou campos `unidadeTrabalho`, `totalTrabalho`, `consumoMedio`.

PDF (`api/pdf/abastecimento.js`): tabela 1 "Detalhamento por Máquina" ganhou 2 colunas (Trabalho, Consumo) com as mesmas regras de exibição. CSS ajustado de 8 para 10 colunas.

Validado na fazenda de testes: Liugong 835 H (máquina) mostrou 83h, 92h, 287h, 68h trabalhadas entre abastecimentos consecutivos com consumo L/h correto. Jactor Uniport 2500 (veículo) mostrou 12 km com 4.667 L/km. Primeiros abastecimentos de cada máquina mostram "—" como esperado.

Disparador: quando mencionar "baixa automática", "trigger de baixa", "auto_baixa", "odômetro numeric", "horímetro numeric", "toggle sem horímetro", "horas trabalhadas", "km percorridos", "consumo L/h", "consumo L/km", "trabalho no período", "LAG abastecimento", ou retomar o fluxo de baixa de combustível, ler esta seção.

### Correção de dados: odômetros com ponto interpretado como decimal — adicionado em 2026-09-15

Após validar o relatório público da Fazenda Marcon contra o banco, identificamos dois padrões de erro de digitação em `registros_abastecimento.odometro_horimetro` que inflacionavam as horas/km trabalhadas calculadas pela RPC com `LAG`:

1. **Ponto como separador de milhar interpretado como decimal**: operador digitava `4.824` (quatro mil oitocentos e vinte e quatro), a função `normalizarNumero` em `frontend/src/utils/formatNumber.ts` interpretava como `4.824` (quatro e oitocentos e vinte e quatro milésimos). 11 registros afetados (Case W20E, JCB, JCB Retroescavadeira, John Deere 6100, Liugong 835 H, Massey MF 4410, SDLG L936H, Stihl Motosserra MS 170).

2. **Dígito extra (valor 10x maior)**: operador digitava um dígito a mais, produzindo valores como `62416` em vez de `6241.6`. 12 registros afetados (Case W20E, Liugong 835 H, Mercedes 1113, Valtra BH180, Valtra BM 125, Valtra 750, Volkswagen Amarok, Volkswagem VW Amarok, John Deere Gator 1).

3. **Leituras ambíguas (4000 em vez de 4860/4873)**: 2 registros do Liugong 835 H com `4000.000` que não encaixam em nenhum padrão claro. Setados como `NULL` (a RPC já pula o cálculo de `trabalho_periodo` quando a leitura é `NULL`).

Correção pontual aplicada via MCP (25 registros no total, sem migration, pois dependem de dados existentes e não são idempotentes).

**Mudança defensiva em `normalizarNumero`** (`frontend/src/utils/formatNumber.ts`): adicionada regra para um ponto com exatamente 3 dígitos após, tratando como separador de milhar (pt-BR): `"4.824" → 4824`. Caso contrário, continua tratando como decimal: `"4.8" → 4.8`, `"4.8245" → 4.8245`. A mudança é segura porque:
- Campos `type="number"` já normalizam via navegador (não enviam `N.NNN`).
- `setDecimalInput` em `AbastecimentoPage.tsx` já remove pontos (`replace(/[^\d,]/g, '')`).
- A regra só afeta strings com padrão `N.NNN` que chegam de fontes legacy (importação, sync antigo).

Validado no relatório público da Fazenda Marcon: Liugong 835 H passou de 62.912 h para 627,5 h (2,507 L/h), Volkswagen Amarok de 103.699 km para 212,5 km (1,388 L/km), Mercedes 1113 de 14.077 km para 41,9 km (8,897 L/km), John Deere Gator 1 de 155.945 km para 115,4 km (1,353 L/km).

Disparador: quando mencionar "odômetro com ponto", "horímetro inflado", "horas trabalhadas absurdas", "consumo L/h irreal", "normalizarNumero", "ponto como milhar", ou problemas com valores de odômetro/horímetro 10x ou 1000x maiores que o esperado, ler esta seção.

### Tanque opcional no abastecimento para fazendas sem tanques cadastrados — adicionado em 2026-09-14

O PWA exigia seleção de tanque obrigatória sempre que um combustível era selecionado no formulário de abastecimento. Isso bloqueava fazendas que ainda não cadastraram tanques no Painel Web, impedindo o registro de abastecimentos mesmo sem controle de estoque.

Mudança no PWA (`AbastecimentoPage.tsx`): `tanqueId` só é obrigatório quando `tanquesFiltrados.length > 0`. Quando não há tanques cadastrados para o combustível selecionado, o formulário exibe um aviso âmbar informativo ("Nenhum tanque de {combustível} cadastrado. O abastecimento será registrado sem controle de estoque.") em vez de bloquear o salvamento.

A trigger `trg_baixa_automatica_abastecimento` no banco já tem guard `IF NEW.tanque_id IS NULL THEN RETURN NEW`, então abastecimentos sem tanque vinculado passam sem gerar baixa. O `syncService.ts` já converte `tanqueId` vazio para `null` antes de enviar ao Supabase. Nenhuma mudança de banco foi necessária.

Cenários resultantes:
- Fazenda sem tanques: abastecimento salva com `tanque_id = NULL`, trigger skipa, sem controle de estoque.
- Fazenda com tanques de Diesel S10 mas não de Gasolina: Diesel S10 exige tanque e faz baixa automática; Gasolina permite salvar sem tanque.
- Onboarding: a fazenda cadastra tanques com saldo inicial no Painel Web, o PWA sincroniza via cache, e os abastecimentos passam a ter baixa automática.

Validado na fazenda de testes: abastecimento de Álcool (sem tanques de Álcool cadastrados) salvou com sucesso, `tanque_id = NULL` no banco, zero movimentações de baixa geradas.

Disparador: quando mencionar "tanque opcional", "abastecimento sem tanque", "fazenda sem tanque", "onboarding combustível", "bloqueio de abastecimento", ou problemas com fazendas que não conseguem lançar abastecimentos por falta de tanque cadastrado, ler esta seção.

### Saldo negativo + ajuste de inventário + correções de UX em combustível — adicionado em 2026-09-15

Cinco correções coordenadas no módulo de combustível, resolvendo problemas identificados em auditoria do módulo.

**1. Saldo negativo permitido (migration `20260916000007_allow_negative_saldo_combustivel.sql`)**

A trigger `baixa_automatica_abastecimento` rejeitava abastecimentos com saldo insuficiente via `RAISE EXCEPTION`, fazendo rollback do INSERT inteiro de `registros_abastecimento`. O registro de consumo físico era perdido quando o cache do PWA estava stale. Agora o saldo pode ficar negativo: a baixa é registrada, o abastecimento é preservado, e o saldo negativo sinaliza necessidade de entrada de reconciliação.

Mudanças no banco: removido o `CHECK (saldo_atual_l >= 0)` de `tanques_combustivel`; removido `RAISE EXCEPTION` de saldo insuficiente da trigger; removido `GREATEST(0, ...)` das funções `update_tanque_saldo_custo` e `recalcular_custo_medio_tanque`; WAC ajustado para tratar `saldo <= 0` como reset de custo médio na próxima entrada (saldo negativo = estoque consumido antes de entrada, custo anterior não representa mais o estoque físico).

PWA (`AbastecimentoPage.tsx`): o aviso de saldo insuficiente deixou de bloquear o save e passou a ser informativo (âmbar em vez de vermelho). Removido o early return em `handleSalvar` e `!!saldoInsuficiente` do disabled do botão SALVAR.

**2. `origemLabel` corrigido no histórico do Painel Web**

O `origemLabel` em `EstoqueCombustivel.tsx` tinha `painel_baixa: 'Baixa Manual'` (origem que não existe mais) e faltava `auto_baixa`. Como toda baixa agora vem da trigger com `origem='auto_baixa'`, o histórico exibia a string crua "auto_baixa" para 100% das saídas. Corrigido: `auto_baixa: 'Baixa Automática'` no mapa, `painel_baixa` removido.

**3. UI de ajuste de saldo no Painel Web**

Adicionado botão "Ajustar" nos cards de tanque e modal de ajuste em `EstoqueCombustivel.tsx`. O ajuste insere `movimentacoes_combustivel` com `tipo_movimentacao='ajuste'`, `origem='painel_ajuste'`, definindo saldo absoluto (inventário físico) sem alterar custo médio. A trigger `update_tanque_saldo_custo` já tratava `ajuste` (define `saldo_atual_l = NEW.quantidade_l`); faltava apenas a UI.

**4. Update otimista do cache de tanques no PWA**

Após salvar entrada de combustível ou abastecimento offline, o cache de tanques não era atualizado localmente, causando validação stale no próximo registro. Adicionada função `updateTanqueSaldoCache(fazendaId, tanqueId, delta)` em `cadastroCache.ts` que incrementa/decrementa o saldo do tanque no cache em memória e persiste no IndexedDB. Chamada em `EntradaCombustivelPage.tsx` (delta +litros) e `AbastecimentoPage.tsx` (delta -totalAbastecido) após save bem-sucedido, com atualização do state local `tanquesDisponiveis`.

**5. Saldo inicial sem preço**

`salvarTanque` em `EstoqueCombustivel.tsx` exigia `precoInicial > 0` para registrar saldo inicial, bloqueando fazendas que têm combustível no tanque mas não sabem o custo de aquisição. Agora: com preço, cria `entrada` (WAC normal); sem preço, cria `ajuste` (saldo absoluto, custo médio fica R$ 0 até a primeira entrada real). A constraint `chk_movimentacao_valor_total` exige `valor_total > 0` em entradas, por isso o caminho sem preço usa `ajuste` (`valor_total IS NULL`).

Disparador: quando mencionar "saldo negativo", "abastecimento perdido", "RAISE EXCEPTION saldo", "ajuste de inventário", "ajuste de saldo", "cache stale tanque", "update otimista tanque", "saldo inicial sem preço", "origemLabel auto_baixa", ou retomar correções do módulo de combustível, ler esta seção.

### Correção de peso real por categoria do lote — adicionado em 2026-09-14

Migration `20260914210000_correcao_peso_categoria.sql`. Substitui o fluxo inline de ajuste de peso (que só permitia aumentar e não guardava histórico) por um recurso dedicado de correção de peso real medido na balança.

**Problema do fluxo anterior:** o `peso_vivo_atual_kg_cab` em `lote_categorias` é uma estimativa projetada pelo cron `update_dados_lotes` a partir da GMD do plano. Quando o usuário pesa os animais na balança, o peso real pode ser maior ou menor que a projeção (GMD superestimado ou subestimado). O fluxo inline em `Lotes.tsx` bloqueava correções para baixo (`pesoAtual < pesoOriginal`), não guardava o valor anterior nem quem/motivo, e sempre setava `data_ajuste_peso = today` em vez da data real da pesagem.

**Solução implementada:**

1. **Tabela `peso_correcoes`** (auditoria): `fazenda_id, lote_id, lote_categoria_id, peso_anterior_kg_cab, peso_novo_kg_cab, data_pesagem, motivo, usuario_id, created_at`. RLS por `fazenda_id` (mesmo padrão de `lote_categorias`).
2. **RPC `corrigir_peso_categoria(p_lote_categoria_id, p_peso_novo_kg_cab, p_data_pesagem, p_motivo, p_usuario_id)`**: valida peso positivo e data não futura, busca o peso anterior, insere na auditoria, atualiza `peso_vivo_atual_kg_cab = p_peso_novo_kg_cab` e `data_ajuste_peso = p_data_pesagem`. A trigger existente `trigger_recalc_peso_lote_cat` dispara automaticamente (AFTER UPDATE OF data_ajuste_peso, peso_vivo_atual_kg_cab) com `p_ajuste_manual=true`, recalculando `peso_vivo_kg` em `registros_suplementacao` e em cascata `consumo_pct_pv`.
3. **Modal `CorrigirPesoModal.tsx`**: UI dedicada com peso projetado atual (read-only), peso real medido (obrigatório), data da pesagem (obrigatório, default hoje, max hoje), motivo (opcional), e info box explicando o impacto. Mostra a diferença em kg e % entre projetado e real.
4. **Botão "Corrigir peso"** no card de categoria em `Lotes.tsx`, abaixo do campo "Peso Vivo Atual". Só aparece se a categoria já está salva (`cat.id`) e tem peso definido. Após confirmar, recarrega as categorias do lote via `atualizarCategoriasNoForm` e `loadLotes`.

**Interação com sistemas existentes:**
- Cron `update_dados_lotes`: após a correção, projeta incrementalmente a partir de `data_ajuste_peso = data_pesagem` (`peso_vivo_atual_kg_cab + gmd * (CURRENT_DATE - data_ajuste_peso)`). Sem dupla contagem.
- Trigger `recalcular_peso_vivo_lote`: recalcula `peso_vivo_kg` em `registros_suplementacao` projetando a partir do peso real na data da pesagem. Em cascata, `trigger_recalc_pct_pv_on_peso_change` recalcula `consumo_pct_pv`.
- Snapshots (`criar_snapshot_entrada`, `recategorizar_lote_categoria`): capturam o peso corrigido via `to_jsonb(lc.*)`. Recategorização copia `peso_entrada_kg_cab = peso_vivo_atual_kg_cab` (corrigido) e `data_ajuste_peso=NULL` para a nova categoria.
- Export XLSX: já inclui `data_ajuste_peso` e `peso_vivo_atual_kg_cab`.

**Validação inline preservada:** a trava que bloqueia `pesoAtual < pesoOriginal` no formulário inline permanece para prevenir diminuições acidentais por typo. Correções intencionais (incluindo diminuições) passam pelo modal dedicado via RPC, que não passa por essa validação.

Validado na fazenda de testes (`d649c65e`): correção de 450 → 445 kg (para baixo) com data 2026-09-14 atualizou peso, data_ajuste_peso e registrou auditoria. Validações de peso negativo e data futura rejeitaram corretamente. Restauração para 450 kg com data 2026-09-12 funcionou.

Disparador: quando mencionar "correção de peso", "peso real medido", "peso_correcoes", "corrigir_peso_categoria", "CorrigirPesoModal", "ajuste de peso real", ou problemas com peso projetado vs peso real, ler esta seção.

### Ajuste de densidade do gráfico de consumo no PDF — adicionado em 2026-09-14

Alterado `MAX_DATA_POINTS_PER_PAGE` em `api/pdf/consumo.js` de `20` para `12`.

**Problema:** o gráfico de "Consumo Médio %PV" do relatório de consumo (Puppeteer) aguardava acumular 20 dias/barras para quebrar em uma página de continuação. Com 20 pontos, as barras e rótulos ficavam muito densos e ilegíveis em A4 landscape antes da quebra.

**Solução:** reduzir o limite para 12 pontos de dados por página. A partir de 13 barras, o lote é dividido em páginas de continuação, mantendo a legibilidade dos rótulos de CMS, %PV e leitura de cocho. A lógica de `chunkDados` e paginação já existente continua valendo; apenas o tamanho do chunk mudou.

Disparador: quando mencionar "gráfico denso", "limite de barras", "continuação do gráfico de consumo", `MAX_DATA_POINTS_PER_PAGE` no PDF de consumo, ou problemas de legibilidade das barras do relatório de consumo, ler esta seção.

### Estoque de almoxarifado e devoluções no PWA (2026-09-16)

Implementado o estoque de itens do almoxarifado nos dois repositórios, com entradas e ajustes no Painel Web, baixa automática das retiradas do PWA, saldo e custo médio ponderado por item.

A fase 2 adicionou o tipo `devolucao` ao registro do PWA. O app busca pendências via `get_itens_pendentes_devolucao`, mantém o resultado em cache e permite fallback pelo catálogo quando não há pendência disponível. Itens escolhidos pela lista carregam `retiradaId` e `retiradaItemIndex` para rastreabilidade.

A integridade é decidida no banco: a trigger calcula o saldo devolvível por retirada, incorpora apenas a quantidade aprovada ao estoque e marca o excedente em `requer_revisao`. O Painel exibe a fila de devoluções retidas e permite ao controller incorporá-las após conferência física.

Preços foram isolados do PWA. O catálogo do app usa a view `itens_almoxarifado_pwa`, sem `custo_unitario` ou `custo_total_estoque`; políticas da tabela principal restringem acesso direto a usuários `admin` e `controller`.

Migrations: `20260916150000_create_estoque_almoxarifado.sql`, `20260916160000_devolucao_almoxarifado.sql` e `20260916170000_impl_devolucao_almoxarifado.sql`, aplicadas via `supabase db push`. Branch compartilhada: `feat/estoque-almoxarifado`.

### Auditoria do estoque de combustível: RLS por fazenda, sync da baixa e hardening (2026-09-17)

Auditoria completa do módulo antes do uso com dados reais. O saldo negativo continua aceito operacionalmente; as correções fecham os gaps de segurança, sincronização e fuso que restavam.

**1. RLS por fazenda (migration `20260917130000_rls_estoque_combustivel.sql`)**

`tanques_combustivel` e `movimentacoes_combustivel` tinham policies `USING (true)`/`WITH CHECK (true)` para authenticated: qualquer usuário podia ler, alterar e apagar dados de qualquer fazenda via API. Substituídas pelas 8 policies padrão `user_has_fazenda_access(fazenda_id)`, mesmo modelo de `registros_oferta_trato`. A trigger de baixa é SECURITY DEFINER e não foi afetada; peões do PWA passam porque possuem `usuario_fazenda`.

**2. Sync da baixa com o ciclo de vida do abastecimento (migrations `20260917150000_combustivel_sync_baixa_update.sql` e `20260917160000_fix_sync_baixa_sem_tanque.sql`)**

A baixa automática era AFTER INSERT apenas: editar `total_abastecido`, trocar `tanque_id` ou soft-deletar o abastecimento deixava a movimentação órfã e o saldo divergente para sempre. Agora uma trigger AFTER UPDATE cobre os três casos: mudança de total atualiza `quantidade_l` da baixa vinculada (WAC recalcula pela trigger existente); troca de tanque remove a baixa do antigo e cria no novo; soft-delete remove a baixa, devolve o saldo e limpa `baixa_estoque_id`; restore recria a baixa e desconta novamente. Abastecimento sem `tanque_id` não gera movimentação.

**3. Idempotência da entrada de combustível no PWA (`syncService.ts`)**

O sync fazia `.insert()` puro em `movimentacoes_combustivel`: após falha de rede, o retry dependia do índice único e o "Reenviar" caía num branch `update` sem case para a tabela (retornava sucesso sem fazer nada). Trocado para `.upsert(data, { onConflict: 'local_id' })` no create e adicionado o case `movimentacoes_combustivel` no branch update com o mesmo upsert.

**4. Fuso horário na coluna `data` (date)**

Painel gravava `new Date().toISOString().split('T')[0]` (data UTC) e o PWA enviava `brWithTimeToIso` com offset; movimentações após 20h em Cuiabá caíam no dia seguinte, deslocando o KPI "Consumo do Mês" e o histórico. Painel passou a usar data local do navegador; PWA envia `brToIso` da parte de dia do `registro.data`; trigger grava `(NEW.data AT TIME ZONE 'America/Cuiaba')::date`.

**5. Hardening do Painel (`EstoqueCombustivel.tsx`)**

`salvarTanque` agora compensa o tanque órfão se a movimentação de saldo inicial falhar. Quantidades e preços rejeitam valores negativos na UI; saldo de ajuste (inventário absoluto) não aceita negativo, pois saldo negativo só deve surgir de baixas. KPI "Valor em Estoque" usa `max(0, saldo)` e saldo negativo ganha badge de reconciliação pendente em vez de R$ negativo. Modal de ajuste ganhou campo opcional "custo médio (R$/L)" que atualiza `custo_medio_l` junto com o ajuste, cobrindo o caso de saídas a R$ 0 após saldo inicial sem preço. A função `validar_capacidade_tanque` foi corrigida para descontar a movimentação antiga em UPDATE (bug latente).

**Validação:** ciclo testado na fazenda de testes (`d649c65e`): abastecimento 50 L gerou baixa 50 L e saldo 950; edição para 60 L atualizou a baixa (saldo 940); soft-delete removeu a baixa e restaurou saldo 1000 com `baixa_estoque_id` nulo; restore recriou a baixa (saldo 940); reversão ao total original deixou saldo 950.

Disparador: quando mencionar "RLS combustível", "baixa órfã", "estorno de baixa", "restaurar abastecimento", "upsert movimentacoes_combustivel", "sync combustível", "data UTC combustível", "ajuste custo médio", "validar_capacidade_tanque UPDATE", ou retomar a auditoria do módulo de combustível, ler esta seção.

### Redesign da página Faixas de Categorias (2026-09-18)

A página `/controller/faixas-categorias` (`FaixasCategorias.tsx`) foi reestruturada por clareza. O problema central: a "linha do tempo" de chips numerados era montada a partir das linhas de `lote_categorias`, que após a Migration G são atualizadas in-place na recategorização. Os chips mostravam categorias simultâneas do lote, não etapas sequenciais, e não tinham datas.

Nova estrutura em três seções:

1. **Recategorizações pendentes**: lista explícita de lotes com ao menos uma categoria ativa fora da faixa de peso. Cada pendência mostra categoria, peso atual, faixa (min-max) e quanto passou/faltou ("+62,5 kg acima" / "x kg abaixo"), com botão Recategorizar por categoria. Correção embutida: antes só a PRIMEIRA categoria ativa do lote era avaliada (`find`), então uma segunda categoria ativa fora da faixa não gerava pendência; agora todas são avaliadas.
2. **Cronologia do lote**: timeline real construída a partir de `lote_categorias_transicoes` (nó inicial com data/peso de entrada, um nó por transição com data e peso, nó final "hoje" com peso vivo atual), mais barra de progresso do peso dentro da faixa (verde dentro, vermelho fora). A cadeia é montada caminhando para trás pelos links `lote_categoria_destino_id` -> `lote_categoria_origem_id` (`buildCadeia`), o que cobre os dois formatos de transição: in-place pós-Migration G (origem_id = destino_id) e criação de linha nova pré-G. Cada categoria ativa do lote tem sua própria cadeia e botão Recategorizar. O histórico de transições com snapshot e export XLSX foi mantido.
3. **Configuração das faixas de peso**: o editor de faixas desceu para o fim da página, com subtítulo explicando que os limites disparam as pendências.

Decisões de produto (perguntadas ao usuário): cronologia visível apenas para lotes pendentes, com o filtro agora explícito nos subtítulos. Query de transições passou a selecionar `lote_categoria_origem_id`/`lote_categoria_destino_id`. Helper `destinoLabel` centraliza o mapeamento corte/reprodução/enfermaria.

**Teste funcional na fazenda de testes (2026-09-18):** ciclo completo executado em `Lote A - Bois Gordos` (boi gordo, 452,5 kg, faixa 501-9999). Recategorização Boi Gordo -> Boi Magro pela UI confirmou: toast de sucesso, pendência sumiu (peso dentro de 421-500), `lote_categorias.categoria` atualizado in-place com `gmd` NULL (formulação "Terminação Boi" não cobre boi magro, comportamento esperado), transição gravada com `motivo='manual'` e `origem_id = destino_id`. Reversão via RPC restaurou `boi gordo`/`gmd=1.100` e a timeline passou a exibir a cadeia completa Boi Gordo (desde 11/09, 400 kg) -> Boi Magro -> Boi Gordo (hoje), validando `buildCadeia` com múltiplas transições. Duas correções aplicadas durante o teste: label de progresso da faixa exibia "-1% da faixa" para peso abaixo do mínimo (agora mostra "x kg abaixo do mínimo" / "x kg acima do máximo") e o texto do ConfirmModal dizia "encerra a categoria atual, cria uma nova", desatualizado desde a Migration G (agora "a categoria ativa do lote será atualizada e a transição registrada"). Lacuna conhecida: após recategorizar para categoria dentro da faixa, o lote sai da página (design "só pendentes"), então não há como desfazer nem consultar histórico de lotes saudáveis por essa tela.

**Dedup do nó "hoje" (2026-09-18):** quando a última transição da cadeia aconteceu no dia corrente, o nó "(hoje)" era renderizado separado e repetia categoria, data e peso do nó anterior (visual de duplicata). Agora a última transição do dia recebe ela mesma o destaque "(hoje)" com peso vivo e cabeças atuais, e o nó separado só é renderizado quando a última transição é de um dia anterior.

**Régua de posição do peso (2026-09-18):** a barra de progresso "% da faixa" foi substituída por uma régua de posição, porque o sentinela `peso_max = 9999` ("sem teto", usado em Vaca, Boi Gordo e Touro) tornava qualquer percentual irrelevante e pesos abaixo do mínimo geravam preenchimento negativo zerado (barra invisível). Agora a régua mostra a região abaixo do mínimo em vermelho suave, a zona da faixa em verde (indo até o fim quando sem teto, com escala calculada a partir de peso/mínimo para manter o marcador visível) e um traço vertical na posição do peso (verde dentro, vermelho fora). Labels de min/max ficam posicionados nas bordas da zona; "sem teto" substitui o 9999 bruto, e o formato "501+ kg" foi aplicado no card de pendências, no select de categoria do modal e no aviso de fora da faixa.

**A11y e segunda rodada de testes (2026-09-18):** corrigidos os campos de formulário sem id/name (selects de lote, nova categoria e nova formulação ganharam id/name/htmlFor; radios de formulação ganharam name compartilhado "opcao-formulacao"; inputs de cor ganharam name/aria-label). Label do máximo da régua passou a ser ancorado à direita (estava cortado na borda para faixas limitadas). Testes: multiplas pendências simultâneas, "Ver cronologia" (seleciona lote + rola), aviso âmbar de destino fora da faixa, viewport mobile 390px (timeline com scroll horizontal ok).

**BUG encontrado na RPC `recategorizar_lote_categoria`:** os parâmetros `p_manter_formulacao` e `p_nova_formulacao_id` são ignorados no corpo da função (migration G). Ela sempre usa `lotes.formulacao_id` para buscar o GMD e nunca atualiza a formulação do lote. Demonstrado na fazenda de testes: recategorização com "Trocar formulação" -> "Terminação Novilha" deixou `lotes.formulacao_id` inalterado (Recria Garrote), `gmd` NULL e o snapshot sem `nova_formulacao_id`/`manter_formulacao`. A opção "Trocar formulação" da UI não tem efeito. Correção pendente: honrar `p_nova_formulacao_id` no lookup de GMD, atualizar `lotes.formulacao_id` e gravar ambos no snapshot.

**Correção aplicada (migration `20260918220000_fix_recategorizar_trocar_formulacao.sql`):** a RPC agora resolve a formulação efetiva: se `p_manter_formulacao=false` e `p_nova_formulacao_id` informado, valida que a formulação existe/está ativa/pertence à mesma fazenda (exception caso contrário), usa-a no lookup de GMD e atualiza `lotes.formulacao_id`. Snapshot registra `manter_formulacao`, `nova_formulacao_id` e `formulacao_anterior_id`. Testado na fazenda de testes: (1) SQL garrote->boi gordo trocando para "Terminação Boi" resultou gmd=1.1 e formulacao trocada; (2) UI boi gordo->boi magro trocando para "Terminação Novilha" trocou a formulacao e manteve gmd NULL (sem cobertura, correto); (3) formulação inativa rejeitada com exception; (4) fixture do Lote B restaurado.

**Aviso de cobertura por lote na troca de formulacao (2026-09-18):** "Trocar formulacao" deixou de ser escondido para lotes multi-categoria. O modal agora busca as outras categorias ativas do lote e a cobertura (`formulacao_categorias_gmd`) da formulacao selecionada, exibindo aviso ambar quando ela nao contempla o destino ou outras categorias ativas (que ficariam sem GMD na proxima recategorizacao). Botao "Editar formulacao" navega para `/controller/formulacoes?edit=<id>` (deep-link ja existente) e o aviso vermelho da formulacao vigente ganhou link "edite a formulação atual". Testado na fazenda de testes com Lote C (2 categorias ativas): ambos os avisos exibidos e o deep-link abriu o modal de edicao da formulacao correta.

### Ajuste de saldo no estoque de suplementação: dois modos e acesso por card (2026-09-22)

Contexto: saldo negativo em `insumos`/`formulacoes` é aceito por design (fazendas sem inventário inicial registravam só saídas). Para o levantamento de estoque, o modal "Ajuste" de `EstoqueSuplementacao.tsx` ganhou dois modos: "Saldo contado" (absoluto, comportamento anterior: grava `quantidade` como saldo final) e "Saldo bruto / inicial" (delta: o painel calcula `estoque_atual + valor` e grava o mesmo `tipo_movimentacao='ajuste'` com o resultado; a observação registra o detalhe "bruto X + saldo Y = Z"). Nenhuma mudança de schema: a trigger WAC continua tratando `ajuste` como saldo absoluto, sem alterar custo médio.

Cada card de insumo/produto final ganhou botão "Ajustar" que abre o modal com item e saldo pré-preenchidos, e o modal exibe o saldo atual do item selecionado (vermelho quando negativo) e, no modo delta, prévia do saldo resultante.

Nota de comportamento para suporte: ajuste absoluto substitui o saldo (-17.000 ajustado para 20.000 vira 20.000); modo delta soma (-17.000 + bruto 30.000 = 13.000). O cálculo do delta usa o saldo carregado na tela; se uma saída sincronizar entre a abertura da página e o salvamento, o resultado reflete o saldo lido, não o mais recente.

Disparador: quando mencionar "ajuste de saldo", "editar saldo do estoque", "saldo negativo insumo", "correção de inventário", "estoque inicial", ler esta seção.

### Auditoria de movimentações de estoque de suplementos (2026-09-22)

Migration `20260923000000_auditoria_movimentacoes_suplementos.sql` (db push). `movimentacoes_estoque_suplementos` ganhou `usuario_id` (uuid sem FK, preenchido por trigger BEFORE INSERT com `auth.uid()` ou pelo insert do painel), `saldo_anterior` e `saldo_posterior`, preenchidos por `trg_mov_supl_auditoria` (BEFORE INSERT). `recalcular_custo_medio_item` agora regrava a cadeia de saldos em cada movimentação durante o replay, e `update_estoque_suplemento` retorna cedo em UPDATEs que só tocam colunas de auditoria (guarda anti-recursão). Backfill incluído na própria migration reprocessou todos os itens.

Sem FK em `usuario_id` de propósito: inserts de triggers com autores ausentes em `usuarios` não podem falhar; o painel resolve o nome via segundo fetch (`usuarios.id -> nome`).

Histórico do item (`EstoqueSuplementacao.tsx`) agora mostra por movimentação: data + hora, origem, "por {nome}" quando há autor, "Saldo: X → Y kg" e a observação. Movimentações antigas têm `usuario_id` NULL (sem "por").

Verificado na fazenda de testes: insumo com baixas simuladas (-17.000) teve ajustes absoluto e delta via UI; a cadeia persistida ficou 0 → -10.000 → -17.000 → 20.000 → -17.000 → 13.000 → 15.000, e o ajuste delta feito pelo painel registrou `por Controller GestaUp`.

Disparador: quando mencionar "auditoria de estoque", "quem fez o ajuste", "saldo anterior/posterior", "rastreabilidade de movimentação", `saldo_anterior`, `saldo_posterior`, `usuario_id` em movimentacoes, ler esta seção.

### Custo unitário em ajuste de estoque + bloqueio de scroll em inputs numéricos (2026-09-23)

Contexto: um ajuste de estoque na Fazenda Chibata foi digitado errado porque a roda do mouse alterou o valor do input focado durante o scroll da página. E todos os ajustes de inventário feitos gravavam custo NULL, deixando "Valor em estoque" zerado.

- **`src/main.tsx`**: listener global de `wheel` faz `blur()` quando o alvo é `input[type=number]`. Com o foco removido, o browser não executa o step nativo e o scroll segue na página. Cobre todos os inputs numéricos do painel (85+ ocorrências); `NumericInput` usa `type=text` e não era afetado.
- **Migration `20260923000001_ajuste_com_custo.sql`** (db push): `ajuste` com `custo_unitario` informado redefine o custo médio do item para o valor informado, tanto no caminho incremental (INSERT) quanto no replay (`recalcular_custo_medio_item`). Sem custo (NULL), comportamento anterior: custo médio não muda. Como a guarda anti-recursão do UPDATE já observa `custo_unitario`, um `UPDATE custo_unitario` em ajuste antigo revaloriza o estoque automaticamente via replay.
- **`EstoqueSuplementacao.tsx`**: modal de ajuste ganhou campo "Custo unitário (R$/kg)" opcional, preenchido com o custo atual do item quando > 0, com prévia "Valor em estoque resultante". Em branco, mantém o custo atual.
- **Backfill Chibata (migração pontual via MCP)**: custo_unitario preenchido nos 6 ajustes de inventário (Farelo 0,85; Capulho 0,28; Milho 0,75; Sorgo 0,675; Uréia 5,98; Fós Recria 4,06 R$/kg) com nota na observação "custo R$/kg incluído retroativamente".

Disparador: quando mencionar "custo no ajuste", "valor em estoque zerado", "scroll muda valor do input", "editar custo de ajuste antigo", ler esta seção.

### lotes.formulacao_id divergente do plano vigente (2026-09-23)

Bug reportado na Fazenda Doce Ilusao (Lote 1 - Thiago Menor): ao abrir Editar Lote, o card "Formulacao do lote" mostrava ENGORDA TIP 1,8% enquanto o plano vigente era PROTEINADO 0,3%. Causa: em 28/08, antes do commit 1273497, o salvar do form de lote ainda enviava formulacao_id e sobrescreveu o valor correto 7s apos iniciar_plano_lote. O commit de 02/09 removeu formulacao_id do payload e passou a recarregar o plano vigente ao fechar Gerenciar Planos, mas a abertura do form continuava lendo a coluna desnormalizada.

Correcao (commit 7d24f41, Lotes.tsx handleEdit): formulacao_lote_id passa a ser derivado do plano vigente (ativo e sem data_fim, maior data_inicio), mesma regra de atualizarFormulacaoVigenteNoForm e da exportacao. planosData/planosLoteData ganharam formulacao_id no select.

Efeito colateral descoberto: a escrita stale disparou sync_gmd_lote_categorias e repropagou GMD da formulacao errada para a categoria (garrote do Lote 1 ficou com gmd 1.450 em vez de 0.400 do PROTEINADO, inflando a projecao de peso em ~1,05 kg/dia desde 28/08). Alem disso, ~40 lotes em varias fazendas tinham lotes.formulacao_id divergente do vigente: com valor stale ou NULL, eles nao recebem atualizacoes de GMD da formulacao vigente (repropagar_gmd_para_lotes filtra por l.formulacao_id) e uma mudanca de destino zeraria o GMD das categorias.

Trigger nova (migration 20260923120000_sync_lote_formulacao_vigente.sql, db push): trg_planos_sync_lote_formulacao em planos_nutricionais (AFTER INSERT/UPDATE/DELETE) recalcula o vigente do lote afetado e ajusta lotes.formulacao_id apenas quando diverge (IS DISTINCT FROM, evitando writes/audit/GMD-propagacao gratuitos). Validada em transacao na fazenda de testes: insert de plano ativo flippou a coluna.

Backfill executado em 2026-09-23 (migracao pontual via MCP, autorizada pelo usuario): UPDATE em 37 lotes alinhando lotes.formulacao_id ao plano vigente, com sync_gmd_lote_categorias recorrigindo o gmd das categorias no mesmo UPDATE. Efeitos reais: Lote 1 (Doce Ilusao) garrote 1.450 → 0.400 e Lote 147 (Marcon, destino enfermaria) novilha/vaca 0.700 → 0.350 (o iniciar_plano_lote grava gmd cheio sem o desconto de 50% de enfermaria que so a trigger aplica; divergencia pre-existente de outra origem, corrigida pelo mesmo backfill). Peso nao precisou de recalculo manual: todas as categorias afetadas tem data_ajuste_peso NULL, entao update_dados_lotes refaz peso_inicio + gmd × dias na proxima rodada. Excecao a pedido do usuario: LOTE 14 (Chibata) ficou de fora do UPDATE, mantendo formulacao_id divergente (PROTEINADO 0,1% vs vigente 0,3%) e touro projetando a gmd 0.350, categoria que a vigente nao cobre.

Disparador: quando mencionar "formulacao do lote errada", "formulacao_id stale", "divergencia plano vigente", "GMD errado na categoria", trg_planos_sync_lote_formulacao, ler esta secao.

### Hardening pos-incidente: desconto de enfermaria nas RPCs + trigger defensiva em lotes (2026-09-23)

Migration 20260923130000_enfermaria_gmd_desconto_e_enforce_formulacao.sql (db push). Duas frentes:

1. Desconto de enfermaria (gmd * 0.5) aplicado nas RPCs que gravam gmd derivado em lote_categorias sem o desconto: iniciar_plano_lote, encerrar_plano_lote (bloco do proximo plano), migrar_plano_lote, recategorizar_lote_categoria e migrar_plano_nutricional (nivel categoria, que grava formulacoes.gmd cheio). Antes, a cadeia de triggers ate corrigia o valor, mas o loop das RPCs rodava depois do UPDATE em planos_nutricionais e sobrescrevia com o GMD cheio. encerrar_plano_nutricional nao precisou (so zera gmd).
2. Trigger defensiva trg_lotes_enforce_formulacao_vigente (BEFORE UPDATE em lotes, WHEN formulacao_id muda): se existe plano vigente, forca NEW.formulacao_id = vigente, revertendo qualquer escrita direta divergente (SQL manual, dashboard, codigo futuro). Sem plano vigente, o valor escrito e preservado. Efeito colateral intencional: recategorizar_lote_categoria trocando formulacao com plano vigente ativo tem a escrita no lote revertida ao vigente (a categoria continua recebendo a formulacao escolhida).

Validacao transacional na fazenda de testes (rollback): escrita divergente revertida ao vigente; iniciar_plano_lote em lote enfermaria gravou gmd 0.5500 (fcg 1.100 x 0.5).

### Isolamento de tenant no módulo de mapas (2026-09-24)

Problema reportado: no PWA, logins de outras fazendas no mesmo dispositivo exibiam as geometrias da fazenda de testes. A auditoria encontrou três camadas de falha:

1. **Cache local do PWA sem escopo por fazenda** (repo PWA, `mapaCache.ts`): `loadMapaFazenda()` usava chave única `mapa_fazenda` no IndexedDB e `MapaFazendaPage` renderizava o cache sem conferir o `fazendaId` da sessão. Corrigido: chave namespacada `mapa_fazenda_<fazendaId>`, sanity check em `data.fazendaId` no load, purga da chave legada uma vez por sessão, e `mapaPrecisaAtualizar` passa a tratar cache de outra fazenda como "precisa sincronizar" quando há versão no servidor (antes, fazenda sem linha em `mapa_versao` retornava `false` e servia o cache errado mesmo online).

2. **RPCs SECURITY DEFINER sem check de vínculo** (migration `20260924160000_isolamento_tenant_mapa.sql`, db push): as 21 funções de mapa + 5 de routing confiavam no parâmetro `p_fazenda_id` ou no id do objeto, sem verificar se o chamador tinha acesso à fazenda. Qualquer autenticado podia ler e alterar geometrias alheias. Criado helper `caller_has_fazenda_access(uuid)`: `user_has_fazenda_access` (usuarios/usuario_fazenda) OU peão autenticado via `auth.jwt()->>'email'` contra `peoes`+`fazendas.acesso_id` (mesmo padrão de `current_user_has_access`). Funções LANGUAGE sql ganharam o predicado no WHERE; as plpgsql ganharam `RAISE EXCEPTION` no início do BEGIN. Verificado no banco: os 51 peões ativos têm `usuarios.auth_id` + `usuario_fazenda` ativo para a própria fazenda, então o helper cobre painel e PWA sem regressão.

3. **RLS/policies**: `mapa_versao` tinha `USING(true)` para anon e authenticated (fix anterior abriu porque o join com usuario_fazenda "podia falhar no PWA"); agora `caller_has_fazenda_access(fazenda_id)` só para authenticated. SELECT de `mapa_estradas`/`mapa_pontos` migrado para o helper (mesmo efeito, cobre peões). `mapa_estradas_vertices_pgr` (topologia pgRouting) tinha RLS desabilitado com grants para anon/auth: RLS habilitado sem policies (deny all direto) + REVOKE; só as funções SECURITY DEFINER acessam.

Bug colateral corrigido na mesma migration: `get_detalhes_curral_mapa` estava quebrada desde que `currais.formulacao_id` foi dropada (migration 20260822210000); `formulacao_nome` agora vem de `lotes.formulacao_id` (formulação vigente do lote do curral).

Observações conhecidas fora do escopo: a topologia de routing (`mapa_estradas_vertices_pgr`, `source`/`target` em `mapa_estradas`) é global entre fazendas por design e o rebuild de uma fazenda reconstrói a de todas. Policies `qual=true` em `pastos`/`bebedouros`/`currais`/`fazendas` (ex: `pastos_update_public`, read public em bebedouros/fazendas) seguem abertas e fazem parte da auditoria maior do BACKLOG; apertá-las exige mapear antes quais fluxos do PWA rodam com role `anon`.

Disparador: quando mencionar "isolamento de tenant", "mapa de outra fazenda", "geometria vazando", `caller_has_fazenda_access`, "mapa_versao policy", "vertices_pgr", ler esta seção.

### Redesenho dos gráficos do relatório de Manejo de Pastagens (2026-09-29)

Os gráficos anteriores ("movimentações por dia" e "avaliação saída vs entrada" diária) foram substituídos por visualizações orientadas às perguntas do rotativo (descanso, sobreuso, condição pós-manejo), na página pública e no PDF:

1. **Mapa de ocupação (Gantt por pasto)**: uma linha por pasto com cada janela entrada→saída; lacunas = descanso, barra azul = encerrada, dourada = em andamento (até dataFim). Ocupações com saída < entrada são comprimidas num ponto de um dia. `mapaOcupacaoPorPasto()` no `agregacao.ts` (página, componente HTML custom) e duplicata `mapaOcupacao()` no `pastagens.js` (PDF, barras flutuantes Chart.js com eixo x linear em epoch-day e ticks dd/mm via `fmtDia`; os pontos usam o formato `{x:[min,max], y:categoria}`).
2. **Condição após o manejo (delta por pasto)**: `degradacaoPorPasto()` compara avaliação média registrada como "saída" no pasto de origem vs "entrada" no pasto de destino por pasto; delta negativo (vermelho) = o gado deixa o pasto pior do que encontrou. Substitui as linhas diárias de avaliação, que misturavam pastos diferentes.
3. **Descanso entre ocupações**: `descansoPorPasto()` mede dias sem gado entre ocupações consecutivas do mesmo pasto (sobreposições e saída<entrada ignoradas), ordenado do mais apertado. Em Jacamim fica vazio (quase todo pasto tem uma ocupação só no período) e o card cai no placeholder "sem dados".

`degradacao` e `descanso` entram em `ResumoPastagens`/`calcularResumoPastagens`, então chegam de graça ao PDF via payload `resumo`. Layout do PDF: página 1 passou a ter o Gantt full-width em área flex; página 2 virou `.past-trio` (3 cards de 45mm) + tabela de alertas paginada (ALERTAS_ROWS_P2 14→16, cabendo mais linhas no espaço liberado). `serie_diaria` e `avaliacao_*_media` continuam no resumo mas não têm mais gráfico próprio. Validado com PDF real da Jacamim (12 páginas, Gantt com 14 linhas, delta todo negativo, UA/ha preservado). Typecheck e 90 testes verdes.

Disparador: quando mencionar "gráfico de pastagens", "mapa de ocupação", "Gantt de pasto", "descanso do pasto", "degradação do pasto", ler esta seção.

### Ajustes no detalhamento do relatório de Rodeio de Gado (2026-09-30)

A pedido do usuário: coluna "Composição" removida dos registros detalhados (página pública e PDF; `composicaoRodeio`/`composicaoHtml` ficaram sem uso no detalhamento e foram desconectadas) e o marcador de meta na coluna Lote passou de "fora da meta (13d > 7d)" para "Atraso de N dias", com N = dias_desde_anterior − meta_intervalo_dias. Typecheck limpo.

### Guarda contra período invertido nos relatórios públicos (2026-09-30)

PDF da Jacamim saiu zerado porque a tela aceitou intervalo invertido (início 23/09 > fim 16/09): as movimentações zeram por construção lógica e só o histórico de ocupação sobrevive à interseção, produzindo relatório meio-vazio. Correção sistematizada: novo helper `ordenarPeriodo()` em `features/relatorioGeral/periodo.ts` troca início/fim silenciosamente, aplicado nos inputs de data das 9 páginas públicas (pastagens, rodeio, abastecimento/RelatorioPublico, consumo, tratos, morte, clima, atividades, bebedouros) e no payload do PDF de pastagens. 4 casos de teste adicionados em `periodo.test.ts`. Typecheck limpo, 91 testes verdes.

Disparador: quando mencionar "período invertido", "relatório zerado", "relatório vazio", "data início maior que fim", ler esta seção.

### Escalabilidade dos gráficos do PDF de pastagens (2026-09-30)

Com intervalo maior (01/09→15/09, 22 pastos) os gráficos quebravam: Gantt com 14 linhas tinha rótulos sobrepostos (~8px/linha vs fonte 9px), os 12 itens do trio de 45mm truncavam nomes no meio e os valores de delta colidiam nas barras. Ajustes em `api/pdf/pastagens.js`:

- `mapaOcupacao` caiu para `maxPastos = 10` e o subtítulo mantém "+N pasto(s) não exibido(s)".
- Trio (degradação, descanso, UA/ha) limitado a 8 itens, com subtítulo "top 8 de N" quando há omissão.
- Novo `truncNome(label, max)` preserva o sufixo do pasto na truncagem ("Belito de C… 2A"), porque o identificador mora no final; aplicado nos ticks dos 4 gráficos.
- Labels de delta: `grace: '8%'` no eixo x + fallback que desenha o valor em branco dentro da barra quando a ponta encosta na borda do plot (antes colidia com o rótulo do eixo).

Página pública não precisou de mudança: o Gantt dela já é scrollável e os BarChart do Recharts usam altura fixa com eixo estável. Validado regenerando o PDF real da Jacamim no mesmo intervalo. Typecheck limpo.

Disparador: quando mencionar "gráfico ilegível", "rótulo sobreposto", "gráfico de pastagens não escala", ler esta seção.
### Pacote de qualidade analítica do relatório de Pastagens (2026-10-01)

Revisão crítica dos gráficos (pedido do usuário) aplicada em página pública + PDF:

- **Descanso com contexto histórico**: a RPC `get_dados_relatorio_pastagens` ganhou `ocupacoes_contexto` (migration `20261001100000_rpc_pastagens_ocupacoes_contexto.sql`, db push): para cada pasto, a última ocupação encerrada ANTES do período, em array separado para não poluir as tabelas. `calcularResumoPastagens` recebe o 4º arg `ocupacoesContexto` e calcula `descansoPorPasto([...ocupacoes, ...ocupacoesContexto])`, então a primeira ocupação do período compara com o ciclo anterior real. Em Jacamim segue vazio (histórico começa em 28/08, sem ciclo anterior) — correto, não bug. A página pública filtra `ocupacoes_contexto` pelos mesmos slicers (pasto/lote/módulo) antes de agregar; o loader do infográfico repassa o campo.
- **Condição: delta virou entrada × saída**: o gráfico de delta era estruturalmente negativo (saída avaliada depois do pastejo, entrada depois do descanso) e medía efeito do pastejo, não qualidade do pasto. Novo card "Condição na entrada e na saída" mostra as duas médias lado a lado por pasto (entrada verde-acinzentada, saída verde/vermelha vs referência 3), ordenado pelo pior na saída, sem pretensão de métrica longitudinal. PDF: `drawCondicao` substitui `drawDelta`; pública: BarChart com duas séries + `ReferenceLine` em 3.
- **UA/ha**: ordenado por valor decrescente e com linha tracejada na média da fazenda (`ReferenceLine` no Recharts; plugin `uaLabels` desenha a linha + rótulo "média N,NN" no Chart.js).
- **Gantt**: ordenação por dias ocupados no período (era "atividade recente"); sigla do lote desenhada dentro da barra quando largura ≥ 40px (plugin `ganttLote`, com clamp contra a borda direita do plot); nota "N pasto(s) sem ocupação no período" na legenda (pública) e rodapé do card (PDF), via novo campo `resumo.pastos_sem_uso` (pastos cadastrados em `pastos_info` sem nenhuma ocupação na janela — comparação normalizada por trim+lowercase).
- **Rotas de rotação no PDF**: novo card full-width "Rotas de rotação" (`drawFluxo`, barras horizontais "origem → destino" com "Nx"), top 6, só renderizado quando `fluxo.length > 1`. Quando presente, `alertasRowsP2` cai de 16 para 8 para caber na página 2. Na página pública o fluxo já existia como chips.
- **Alertas**: mantida a decisão de não duplicar — a faixa "Alertas do período" da pág. 1 segue como leitura executiva e a tabela paginada responde o detalhe; não entrou gráfico de frequência no PDF.

Validado com PDF real da Jacamim (01/09→15/09, 9 páginas): Gantt com lotes legíveis, fluxo com 6 rotas sem sobreposição, condição com top 8 de 22. Typecheck limpo.

Disparador: quando mencionar "entrada vs saída do pasto", "rotas de rotação", "pastos sem uso", "descanso com histórico", `ocupacoes_contexto`, `pastos_sem_uso`, ler esta seção.

### Página dedicada para os gráficos de análise do relatório de Pastagens (2026-09-30)

A página 2 do PDF era densa demais: trio de cards de 45mm + card de rotas + tabela de alertas na mesma página, com rótulos espremidos. Reestruturação em `api/pdf/pastagens.js`:

- **Página 2 virou grid 2×2 full-page** (`.past-quad`, `flex:1` dentro da `.page` flex): Condição entrada×saída (top 10), Descanso (top 12), Taxa de lotação (top 12, barras verticais) e Rotas de rotação (top 10). Quando não há fluxo suficiente (`fluxo.length <= 1`), a Taxa de lotação expande para a linha inteira via `.past-span2`.
- **Alertas ganharam página(s) próprias** (22 linhas/página, `ALERTAS_ROWS_PAGE`; a constante `ALERTAS_ROWS_P2` e a lógica de dividir a página 2 com gráficos sumiram).
- Limites por gráfico subiram de 6-8 para 10-12 itens, já que cada card agora tem ~4x mais área.
- Rótulo "média N,NN" da linha de referência do UA/ha movido para o canto superior direito do plot (antes ficava colado na linha e colidia com os valores das barras).

Validado com PDF real da Jacamim (01/09→15/09, 9 páginas): os 4 gráficos legíveis com rótulos completos, alertas inteiros na página 3. Typecheck limpo.

Disparador: quando mencionar "gráficos densos", "página de análise", "quad de gráficos", "rotas de rotação no PDF", ler esta seção.

### Layout em L da página de análise do relatório de Pastagens (2026-09-30)

A pedido do usuário, o grid 2×2 virou layout em L em `api/pdf/pastagens.js`: "Condição na entrada e na saída" ocupa a coluna esquerda inteira (`.past-tall{grid-row:1/-1}`, top 18 pastos), e a coluna direita divide a altura entre Taxa de lotação (em cima, top 12) e Descanso entre ocupações (embaixo, top 12). O gráfico "Rotas de rotação" foi removido do PDF (`drawFluxo` e kind 'fluxo' deletados); os dados de `resumo.fluxo` continuam na página pública como chips. Validado com PDF real da Jacamim (9 páginas).

Disparador: quando mencionar "layout do relatório de pastagens", "gráfico de rotas", "página de análise de pastagens", ler esta seção.

### Gantt de ocupação legível em impressão P&B (2026-09-30)

Dois problemas no mapa de ocupação: leitura fraca e dependência de cor (encerrada azul / em andamento dourado) que se perde em impressão preto-e-branco. Solução por redundância de codificação — cor + padrão:

- **Barras encerradas viram hachura diagonal dourada** (`CanvasPattern` de tile 8×8 + borda `borderColor` no PDF; `repeating-linear-gradient` na página pública). Em andamento é barra sólida azul (codificação final escolhida pelo usuário: sólido = em curso, hachura = encerrada). Em P&B lê-se "cheio vs listrado".
- **Fundo zebrado por linha** (`beforeDatasetsDraw` pinta bandas alternadas sobre o chartArea; `bg-gray-50/70` nas linhas pares da página pública) para guiar o olho do rótulo do pasto até a barra sem grade horizontal.
- **Sigla do lote** branca sobre o azul sólido e escura sobre a hachura.
- Legenda atualizada: o quadradinho "Em andamento" mostra a hachura (CSS `gantt-hatch` / gradiente inline).
- De quebra: `taxa_lotacao_media_ua_ha` e a média por pasto passaram a ignorar UA/ha = 0 (ocupação sem área/cabeças não é lotação zero, é dado faltante). Na Jacamim a referência subiu de 1,17 para 2,80.

Validado com PDF real da Jacamim. Typecheck limpo.

Disparador: quando mencionar "Gantt P&B", "impressão do mapa de ocupação", "hachura", "cor do relatório", ler esta seção.

### Condição entrada×saída vira tabela na página de análise (2026-09-30)

O gráfico de barras "Condição na entrada e na saída" do PDF de pastagens virou tabela (`condicaoTableHtml` em `api/pdf/pastagens.js`): com muitos pastos, barras lado a lado eram menos legíveis que colunas numéricas. Layout da página 2 mantido em L: a coluna esquerda exibe a tabela (Pasto, Aval. entrada, Aval. saída, Variação colorida verde/vermelho; saída <3 em vermelho) com limite fixo de 20 linhas (CONDICAO_ROWS_P2), o excedente pagina em páginas de continuação dedicadas (CONDICAO_ROWS_PAGE=22); coluna direita segue com Taxa de lotação em cima e Descanso embaixo. `drawCondicao`, kind 'condicao', canvasDelta removidos; `.past-condicao-table` compartilha o estilo das demais tabelas, sem compactação de padding (decisão do usuário: limite fixo + paginação, em vez de espremer linhas). A página pública mantém o gráfico Recharts (interativo, com tooltip). Validado com PDF real da Jacamim (22 pastos → 20 na coluna + 2 na página de continuação, 10 páginas).

Disparador: quando mencionar "tabela de condição", "gráfico de condição no PDF", ler esta seção.

### Auditoria do relatório de pastagens: pacote de correções (2026-09-30)

Seis itens da auditoria crítica implementados:

1. **Média de ocupação saneada**: `dias < 0` (saída antes da entrada, erro de fonte) deixou de contaminar `ocupacao_media_dias` e a média por pasto. Segue sinalizado em vermelho na listagem do histórico. Na Jacamim o KPI subiu de 2,7 para 3,0.
2. **% de área utilizada**: novos campos `area_utilizada_ha/total_ha/pct` no resumo; frase no insight ("Dos X ha cadastrados, Y ha (Z%) tiveram uso") e nota na legenda do Gantt do PDF e da página pública.
3. **Descanso vazio colapsa**: sem dados de descanso, o card some e Taxa de lotação ocupa a coluna direita inteira da página 2.
4. **Alertas: 24 linhas/página** (era 22): a página final com 1 linha sozinha deixa de acontecer na prática comum.
5. **Coluna "Avaliações"** na tabela de condição: n de leituras por pasto, distingue média confiável de ruído de amostra única.
6. **Plural real + normalização de nomes**: helper `plural()`/`pl()` elimina todos os "(s)"/"(ões)" nas duas superfícies; `normalizarNomesPasto()` resolve grafias divergentes de pasto e lote para a forma cadastral (aplicado na página pública e no loader do infográfico — "PV - 01"/"PV- 01" viram "PV-01"). "em andamento no momento" virou "com ocupação em aberto ao fim do período". Cabeçalho "Aval. S/E" virou "Aval. saída/entrada".

Validado com PDF real da Jacamim (25/08→30/09, 13 páginas). Typecheck limpo, 92 testes verdes.

Disparador: quando mencionar "auditoria do relatório", "pluralização", "área utilizada", ler esta seção.

### Relatório público interativo do Vision (pipeline + rota /r/:token) (2026-10-02)

Pipeline `vision-relatorio/` gera as 20 páginas do relatório financeiro a partir do XLSM Vision (ou extrato JSON). O mesmo motor roda no browser: `pipeline/web/app.mjs` exporta `mountRelatorio(el, payload, config)` que reconstrói o modelo canônico a partir das linhas detalhadas (`lib/model.mjs::buildModelFromReads`), com filtro de data início/fim em granularidade de dia/mês/ano via querystring `?ini=&fim=` e cross-filter por clique nos eixos. `lib/payload.mjs` serializa {reads, ctx, defaults, range} em gzip+base64. `build-interativo.mjs` gera `interativo.html` autossuficiente (protótipo local, aceita `--ocultar p05,p06`).

App Vision (`apps/vision`):

- **Acesso por flag**: `usuarios.acesso_vision` (migration `20261002140000_vision_relatorios.sql`). Gate em `App.tsx::ProtectedRoute` — usuário autenticado sem a flag vê tela "Acesso restrito". No MVP só `controller.gestaup@gmail.com` tem `acesso_vision=true`.
- **`/relatorios/vision`** (`pages/RelatorioVision.tsx`): seletor de qualquer fazenda ativa, upload do XLSM/extrato JSON (parse no browser com SheetJS), período ini/fim + saldo de caixa inicial + ano-base do giro, checklist de páginas a ocultar (`PAGE_TITLES`, p01–p20), botões "Gerar link público" e "Baixar PDF", e lista de links com copiar/ativar/excluir.
- **`/r/:token`** (`pages/RelatorioPublicoVision.tsx`): rota pública fora do layout autenticado; lê metadados de `relatorios_publicos` (policy pública existente), baixa o payload via RPC `vision_relatorio_payload(token)` e monta o relatório com `public: true` (sem botão de PDF — o botão de imprimir só existe no modo autenticado).
- **`/relatorios/imprimir`** (`pages/RelatorioImpressao.tsx`): recebe o job via `sessionStorage('vision-print-job')`, monta o relatório com `autoPrint` e as mesmas páginas ocultas; `window.print()` com `@page 1280×720` gera o PDF pelo navegador.

RPCs SECURITY DEFINER gateadas por `vision_tem_acesso()` (flag + ativo): `vision_criar_relatorio` (insere em `relatorios_publicos` tipo='vision' + blob em `relatorio_publico_payloads`, valida fazenda ativa), `vision_listar_relatorios`, `vision_atualizar_relatorio`, `vision_excluir_relatorio`. A leitura pública é `vision_relatorio_payload`, que exige token ativo e não expirado. `relatorio_publico_payloads` tem RLS sem policies: só a RPC alcança o blob. `config.paginas_ocultas` (jsonb) guarda os IDs de página ocultos.

Validado ponta a ponta com link de teste na fazenda Gesta'Up (id b1000000-0000-4000-8000-000000000001, payload Guanabara): 17 páginas renderizadas com p14/p15/p16 ocultas, sem botão de PDF, filtro de data recalculando o modelo, RPC pública OK e `vision_criar_relatorio` negando anon. Typecheck e build do Vision limpos.

Disparador: quando mencionar "relatório Vision", "link público Vision", "abas ocultas", "gerar PDF no Vision", "acesso Vision", ler esta seção.

Parse de XLSM de qualquer tamanho direto no browser: `pipeline/lib/xlsx-stream.mjs` é um leitor XLSX streaming próprio (fflate Unzip + scanner incremental de `<row>`, sem deps de Node/DOM). Os XLSMs Vision descompactam para >1GB de XML mas os dados úteis ficam no topo das abas; o parser infla só as abas em NEEDED_SHEETS e para após 200 linhas vazias seguidas (semântica do extract.py: max_col=60, serials numéricos para datas). Medido na Semente (111MB): 3,6s e ~240MB de RAM, `extractReads` byte-a-byte idêntico ao do extract.py nas 3 fazendas. SheetJS removido do app (bundle -320KB). `extract-json.mjs` virou wrapper do mesmo parser (sem Python). `_test-stream.cjs` é o harness de comparação contra o golden.

### Auditoria da planilha Vision no upload (2026-01)

`pipeline/lib/audit.mjs` expõe `auditSheets(sheets)` que roda sobre as abas brutas do extrator (não sobre `reads`, que já descarta linhas inválidas). Detecta problemas de fonte e devolve issues `{ sev, aba, coluna, campo, linhas[], msg, impacto }` com o número real da linha do Excel (o parser `xlsx-stream.mjs` agora grava o atributo `r` do `<row>` em `row._r`, com fallback índice+1 em extratos JSON). Cada issue aponta aba, coluna (letra + header), faixas de linhas comprimidas por `fmtLinhas`, o que está errado e a consequência concreta no relatório (ex.: comprador vazio em `Venda_Gado!AJ` vira fornecedor sem nome na p.06/p.19). Checagens por aba: Venda_Gado (comprador, valor líquido, RC%, categoria, linhas sem data/cab ignoradas), Compra_Gado (fornecedor, total zerado, categoria, linhas ignoradas), Diárias_Categoria (categoria ausente ou fora do cadastro), Estoque (continuidade saldoFim×saldoIni e meses ausentes), Desembolsos/Receitas (plano de contas, tipo CF/CV, empresa), Mortes_Consumos, Nascimentos, Cadastros (área útil zerada) e abas obrigatórias ausentes.

Em `RelatorioVision.tsx` o upload roda a auditoria no mesmo ciclo do `extractReads`; bloco "Problemas encontrados na planilha" abaixo do resumo de conferência lista os issues com severidade (erro vermelho / aviso âmbar), badge com contagem no título do passo 1, e linhas do Excel expansíveis por issue. Não bloqueia geração nem publicação, só informa.

Segundo bloco de checagens: status fora de {Pago, Em Aberto} em Venda/Compra/Desembolsos/Receitas (outro valor entra como recebido/pago no fluxo de caixa), tipo de venda fora de Abate/Vivo (cai fora da p.06 e p.19), categoria divergente do cadastro em Venda/Compra/Mortes/Nascimentos, grafia divergente na mesma coluna (mesmo texto com caixa/acento diferente vira categoria fantasma no pareto), datas fora da faixa do conjunto, possíveis lançamentos duplicados (mesmo código+lote+data+quantidade), bloco de estoque com categorias faltando e truncamento do parser após 200 linhas vazias (xlsx-stream grava rows._truncado comparando o atributo dimension do XML com a última linha lida). Terceiro bloco: status vazio em Venda/Compra/Desembolsos/Receitas (entra como pago/recebido silenciosamente), tipo de venda vazio (cai fora da p.06 e p.19), coerência de datas (pagamento >31 dias antes de venda/compra, entrada posterior à venda) e categoria ausente em Mortes/Nascimentos. A UI separa os issues em dois grupos: erros (vermelho, distorcem cálculo) primeiro e avisos (âmbar, dado faltando) depois, com badges de contagem separadas no título do passo 1.

Validado na Santa Cecília (detecta os 25 lotes de abate sem comprador em AJ, linhas 10–32 e 34–35, e o fornecedor/total zerados em Compra_Gado) e na Guanabara (sem falsos positivos). Typecheck limpo.

Disparador: quando mencionar "auditoria da planilha", "problemas na planilha", "validação do Vision no upload", ler esta seção.

### Cadernetas do PWA expostas no Manejus (2026-10-02)

O PWA tinha 29 cadernetas registradas em `frontend/src/utils/constants.ts` e o painel só 16 no grid de cadernetas. As 13 que faltavam foram adicionadas como telas próprias no controller, todas com listagem + detalhe, filtro por fazenda, busca, intervalo de datas e export XLSX:

- **Entrada de estoque**: `EntradaCombustivel` (`movimentacoes_combustivel` filtrado `tipo_movimentacao='entrada' AND origem='pwa_entrada'`), `EntradaAlmoxarifado` (`registros_almoxarifado` `tipo='entrada'`), `EntradaCantina` (`registros_alimentacao` `modo='entrada'`), `EntradaInsumos` (`registros_entrada_insumos` + itens `entrada_insumos_itens`).
- **Confinamento**: `RegistrosLeituraCocho` (`registros_leitura_cocho`, com `LEITURA_COCHO_DESCRICOES` fixas -1..3 e join `notas_leitura_cocho_config`), `TratoConfinamento` (`registros_oferta_trato`), `FabricaConfinamento` (`registros_fabrica_confinamento` + `registros_fabrica_confinamento_insumos`, join `vagoes`/`formulacoes`).
- **Gado**: `RegistrosPesagem` (`registros_pesagem`, join `lotes` e `ordens_servico`).
- **Comercial**: `OrdensServico` virou componente parametrizável (`tipoFixo`, `titulo`) e os wrappers `ComunicadoVenda`/`ComunicadoCompra`/`ComunicadoTransferencia` filtram `tipo` fixo; `RecebimentoCompra` lista `os_recebimentos` com join na OS e o clique abre `OrdemServicoDetalhes`.
- **Saída de insumos**: `SaidaInsumos` (`registros_saida_insumos` + `saida_insumos_itens`, label "Produção Fábrica").

Wiring: 26 rotas novas em `App.tsx` sob `/controller/cadernetas/<id>`; `utils/cadernetas.ts` ganhou `entrada-combustivel`, `fabrica-confinamento`, `comunicado-transferencia`; `types/images.ts` tem os 13 ids novos com ícones copiados do PWA para `public/images/cadernetas/`; grid de `Cadernetas.tsx` e cards do `Dashboard.tsx` exibem todos. `exportAllCadernetas` ganhou suporte a `orderBy`/`filters`/embeds e inclui as cadernetas novas (entrada-almoxarifado e entrada-cantina ficam fora do export-all porque já saem nas abas Almoxarifado/Alimentação). Export configs novos em `exportConfigs.ts`, inclusive `ORDENS_SERVICO_EXPORT_CONFIG`.

Migration `20261002190000_dashboard_stats_novas_cadernetas.sql` (aplicada via `db push`): `get_dashboard_stats` passa a retornar as 13 contagens novas em `cadernetaStats`, e a view `v_registros_unificado` do rastreio ganhou `registros_fabrica_confinamento`, `registros_pesagem`, `movimentacoes_combustivel` (sem `nome_usuario`/`deleted_at`: NULLs), `ordens_servico` e `os_recebimentos`. `rastreioService.CADERNETA_LABELS` atualizado.

Atenção: `movimentacoes_combustivel` não tem `deleted_at` nem `nome_usuario` — não filtrar por essas colunas. Arquivos `LeituraCocho.tsx`/`RegistrosCantina*.tsx` pré-existentes continuam não roteados (a caderneta nova usa `RegistrosLeituraCocho`).

Disparador: quando mencionar "telas do PWA no painel", "cadernetas novas", "comunicado de transferência", "carregamento vagão", "entrada de insumos", ler esta seção.
