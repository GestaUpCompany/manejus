# Histórico de alterações (RESOLVIDO/IMPLEMENTADO)

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
