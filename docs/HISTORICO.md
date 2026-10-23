# Histórico de alterações (RESOLVIDO/IMPLEMENTADO)

## Maternidade: botão Excluir no painel desfaz tudo que o parto causou (2026-10-23)

- **Migrations** (cada uma com rollback em `supabase/rollbacks/`): `20261023100000_excluir_registro_maternidade` (funções `individuo_usos_do_parto`, `previa_exclusao_maternidade`, `excluir_registro_maternidade`); `20261023110000_maternidade_previa_exclusao_security_definer` (a prévia dava 403 para o usuário do painel: lógica em `previa_exclusao_maternidade_interna`, wrapper `SECURITY DEFINER` com `caller_has_fazenda_access`, helpers sem acesso direto); `20261023120000_maternidade_exclusao_ajusta_quant_inicial`; `20261023130000_maternidade_usos_do_parto_array_append` (`v := v || 'texto'` era lido como literal de array e quebrava a prévia sempre que a cria tinha outro uso).
- **O que a exclusão desfaz** (`excluir_registro_maternidade`, só admin/controller): soft-delete do parto; estorno da cria (gatilho `trg_maternidade_estorna_cria`); remoção das notificações "Indivíduo criado automaticamente"; mãe criada pelo parto excluída só se o usuário marcar o checkbox (decisão de 19/10 mantida), senão recalcula `numero_partos`/`classificacao_matriz`; `quant_atual` da categoria Bezerro/Bezerra ao Pé recalculado.
- **Bloqueios** (`motivo_bloqueio` na prévia): cria com outro uso (pesagem, sanidade, filhos, etc.); categoria criada pelo parto que já foi recategorizada (`quant_base`), ajuste manual.
- **Categoria criada pelo parto**: `fn_ensure_categoria_bezerro_ao_pe` a cria com `quant_inicial = 1` (o 1 é o parto criador) e `created_at = data + 1s`. Ao excluir o criador, `quant_inicial` := nº de partos remanescentes (mesmo lote e sexo, sem aborto/natimorto) com `data < created_at`; se der 0 e não houver outro uso, a categoria é desativada. Zerar não serve: um parto remanescente anterior ao `created_at` não é contado por `calculate_quant_atual` e é o `quant_inicial` que o segura. `lock_quant_inicial` aceita a flag de sessão `app.ajuste_quant_inicial = 'on'`, ligada só por essa função; fora dela a trava segue valendo (testado).
- **Tela**: `MaternidadeDetalhes.tsx` (botão Excluir, modal com prévia, checkbox da mãe, bloqueio com motivo).
- **Testes** (só fazenda de testes, lotes `SIM-CAT-1` a `8`): excluir parto não criador, criador com outros partos (saldo 2 para 2 reais), criador com parto anterior perdido (3 para 3), parto único (categoria desativada), categoria recategorizada (bloqueou sem alterar), trava fora da exclusão (recusou), cria com pesagem (bloqueou, também pela tela), criador pela tela com a mãe mantida (`Nulípara`, 0 partos). Registros de teste: lotes `SIM-CAT-*`, brincos `T*-M/C`, `TESTE-*`; tudo com soft-delete, exceto os lotes e a pesagem do `SIM-CAT-7`.
- **Achado separado**: parto que chega fora de ordem não entra no saldo (ver BACKLOG).
- **Reverter**: soft-delete (`deleted_at = NULL` no parto e nos indivíduos); notificações removidas não voltam; `quant_inicial` ajustado precisa de ajuste manual com a flag.

## Relatório de consumo: KPI Consumo MS (kg/cab/dia) (2026-10-22)

- Novo KPI "Consumo MS (kg/cab/dia)" na tela pública e no PDF (o Infográfico Mensal herda do PDF). Diferente do MN, usa o consumo em matéria seca já gravado: `registros_suplementacao.consumo_medio_geral_kg_ms` (pasto) e `consumo_confinamento_dia.kg_ms_cab_dia` (confinamento), sem recalcular a partir do teor da formulação atual.
- Migration `20261022100000_relatorio_consumo_kg_ms.sql` (rollback em `supabase/rollbacks/`): `get_dados_relatorio_consumo` passa a devolver `trato_kg_ms_cab_dia` em cada ponto. Campo aditivo; NULL quando não há teor de MS.
- Front: `DadoRelatorioConsumo.trato_kg_ms_cab_dia` (opcional), `consumoMsMedio` em `consumo.js` e `calcularKPIs` em `RelatorioConsumoPublico.tsx` (grid de KPIs de 8 para 9 colunas em `lg`). Descrição do card em `Relatorios.tsx`.

## Formulações: ordem de carregamento dos insumos por arrastar e soltar (2026-10-22)

- `Formulacoes.tsx`: a tabela de insumos ganhou alça (6 pontos) para arrastar as linhas (HTML5 nativo, mesmo padrão de `ProgramacaoTratos.tsx`). A ordem é gravada em `formulacao_insumos.ordem` ao salvar; sem mudança de schema.
- PWA sem alteração: `getInsumosByFormulacaoCached` já ordena por `ordem` e `FabricaConfinamentoPage` exibe nessa ordem ("Insumos na ordem de carregar").
- Validado no DevTools na fazenda de testes (Terminação Boi): arraste, gravação no banco, PWA online e PWA offline (cache) mostraram a nova ordem. Ordem original restaurada depois.

## Relatório Vision: modo "Somente financeiro" para fazendas sem dados de rebanho (2026-10-22)

- **Problema**: o Relatório Vision mistura financeiro e rebanho. Em planilhas sem as abas de animais, p02, p03 e p18 sempre renderizavam (zeradas) e os KPIs "por cabeça" saíam 0. Sem área em Cadastros Q17, os valores "por ha" saíam NaN/Infinity.
- **Feito** (motor em `vision-relatorio/pipeline/`, sem migration; `apps/vision` só repassa a flag):
  - `buildModelFromReads(reads, { modo })` (`lib/model.mjs`): em `'financeiro'` trata as abas de rebanho como vazias (estoque, diárias, compras, vendas, mortes, nascimentos). `meta.modo` vai no modelo. O padrão continua `'completo'` e o golden do Guanabara segue reconciliado.
  - Divisões por hectare passam por `porHa()`: sem área cadastrada dão 0, em qualquer modo (antes NaN/Infinity).
  - `PAGINAS_REBANHO` (`web/app.mjs`): p02–p10 e p19 (inclui p05e/p05s e p06a/p06b) ficam sempre ocultas no modo financeiro, em `mountRelatorio` e em `buildMergedHtml` (link público e PDF), com a renumeração de rodapé que já existia.
  - Páginas mantidas, sem os itens de rebanho: p11 (sem "Diária média/cab"), p12 e p13 (sem "Custo Diária/cab" nem o combo com rebanho médio; o gráfico de R$/ha ocupa o espaço), p15 (sem "Faturamento por cab."), p16 (idem, sem o combo faturamento/cab × rebanho), p18 (sem a seção "Rebanho e produção de arrobas" nem a faixa de @ produzida; indicadores econômicos sem os itens por cab/@, com "Resultado do Período" no lugar). Sem alteração: p01, p13b, p14, p17, p20.
  - Config: `relatorios_publicos.config.modo` (`'completo'` | `'financeiro'`), gravado em `vision_criar_relatorio` e `vision_atualizar_payload`; link antigo, sem a chave, continua completo. Em `RelatorioVision.tsx` há o seletor "Tipo de relatório", que já vem em "Somente financeiro" quando a planilha não tem nenhum registro de animais; no modo financeiro a conferência rápida esconde rebanho/compras/vendas e a grade de páginas trava as de rebanho.
- **Verificado**: `pnpm typecheck`, `pnpm lint` (sem avisos novos) e `pnpm test` (572 testes) passam. `run-model.mjs --golden` do Guanabara reconcilia antes e depois. O documento montado por `buildMergedHtml` tem 20 páginas no completo e 11 no financeiro (p01 p11 p12 p13 p13b p14 p15 p16 p17 p18 p20), sem NaN/Infinity/null visíveis, inclusive com a planilha sem rebanho e sem área.
- **Conferência visual (PDF real, 11 páginas, dados do Guanabara)**: p12/p13 e p16 ganharam gráficos maiores no espaço dos combos removidos; p18 ficava com o topo vazio e agora mostra os 6 indicadores e dois gráficos de área (faturamento e desembolso por mês).
- **Em aberto**: falta flag `--modo financeiro` no `build-interativo.mjs`/`compose.mjs`, golden do modo financeiro e teste vitest (o Vision não tem suíte). Com a área vazia, os KPIs "por ha" mostram 0,00 em vez de sumir.

## Marcon: 12 registros de clima duplicados excluídos (soft-delete) (2026-10-21)

- **Origem**: o relatório de Clima da Marcon dizia "maior chuva 90 mm em 04/10", mas nenhuma leitura tinha 90: eram 45 + 45 do pluviômetro 05, a mesma chuva lançada duas vezes. A soma de leituras do mesmo pluviômetro no dia (correta para medições distintas) contava a repetição em dobro. Também deixava 04/10 como "torrencial" (45 + 45 ≥ 50) quando a maior leitura real é 45 mm (forte).
- **Autorizado pelo usuário** (escopo fechado, Marcon `c4d13f1f-a785-4bcd-8e72-4ac4b28ee034`, tabela `registros_clima`, soft-delete, 12 linhas): (a) 04/10: 9 registros avulsos lançados em 05/10 entre 10:54 e 10:58 pela Karina (o registro único das 11:02, com os mesmos 9 pluviômetros e valores, foi mantido); (b) 14/05: o registro lançado em 20/05 (o de 18/05 foi mantido); (c) 16/05: os registros lançados em 18/05 às 13:21 e em 20/05 (o de 18/05 às 13:18 foi mantido). As duplicatas de maio tinham valores idênticos, hora de leitura 20:00 e sem nome de usuário (parecem importação repetida; causa não verificada).
- **IDs excluídos** (`deleted_at = now()` em 2026-10-21): `e850e029-7110-4ba5-ba6e-71a83c10507f`, `4d460085-df21-4ea0-9a0e-30f8865c3642`, `d4003637-89e6-4ab1-9db3-bfdac77f79f6`, `2c17add3-296a-457e-a9a6-596a7ca940a5`, `d7dfb45f-96c0-44dd-8141-561c4ded6e3b`, `9f46f83e-a044-480f-9989-04de2b0b9dda`, `4b57e8ff-aef3-4f42-90bd-ebf323fad0ec`, `60ca450d-5251-4176-9a91-e66452143d79`, `76ef7851-8c39-4b47-a494-e0c811afa313` (04/10); `19aad85c-87ad-479e-b18c-7047dab3b1c9` (14/05); `a775845b-4f2c-47ab-820f-ce6525fdc1d2`, `a421ceb3-bc9a-4fcd-aca4-401b36924a85` (16/05).
- **Procedimento**: prévia só de leitura (12 linhas, sem tabelas dependentes; triggers de auditoria e `updated_at`), backup em `backup.registros_clima_duplicatas_marcon_20261021` (12 linhas) e um único bloco `DO` que abortaria se a contagem fosse diferente de 12. Verificado depois: 12 excluídas, 1 registro ativo em cada um dos três dias, maior leitura de 04/10 = 45 mm, acumulado médio da fazenda de 240,3 para **194,8 mm** (9 pluviômetros).
- **Reverter**: `update public.registros_clima set deleted_at = null where id in (select id from backup.registros_clima_duplicatas_marcon_20261021) and fazenda_id = 'c4d13f1f-a785-4bcd-8e72-4ac4b28ee034';`
- **Em aberto**: o importador de clima (`ImportarClimaModal`) não avisa quando uma leitura já existe para o mesmo pluviômetro, dia e valor; se a causa for importação repetida, vale uma checagem de duplicidade lá.

## Relatório de Clima: calendário de chuva e chuva por mês no lugar das leituras detalhadas (2026-10-21)

- **Pedido**: ver em que período e se ocorrem chuvas torrenciais, em gráfico e não em tabela. Uma primeira versão (barras diárias + marcador da maior região, eixo de datas esparso) foi descartada por ficar vaga: duas escalas para cruzar, barras finas, muito espaço vazio e rótulos esbarrando nos dados.
- **Calendário de chuva** (tela pública e PDF): um calendário por mês, um quadrado por dia. O **número grande** é a média da fazenda no dia (soma do dia ÷ pluviômetros do período, bate com o acumulado do KPI); o **tom** (3 azuis de luminosidade bem diferente), a **borda mais grossa** e o **símbolo** indicam a maior chuva do dia numa única região (◆ forte, 25 a 50 mm; ▲ torrencial, ≥ 50 mm), com o valor dessa região no canto, porque a média esconde chuva localizada (um dia de 60 mm num pluviômetro e 0 nos outros marca ~7 mm). A legenda diz "em alguma região" porque a classe vem de um pluviômetro. Dia em branco = sem leitura registrada (não prova que não choveu). **Histórico**: chegou a ser enxugado para só a classe do dia (sem a média no quadrado) e, a pedido, a média voltou. Abaixo, a contagem: dias torrenciais, dias fortes e a maior chuva (valor, região, data).
- **Chuva por mês** (barras, média da fazenda por mês): mostra a distribuição ao longo do ano; meses sem leitura entram zerados e as barras somam o acumulado do KPI. Tooltip da tela traz a região que mais e a que menos choveu no mês (pluviômetro sem leitura no mês conta 0, o mesmo efeito do início da série do gráfico de evolução).
- **Período e páginas**: filtros de data do topo. A tela mostra os 12 meses mais recentes do período (avisa quando omite). **Estrutura do PDF**: (1) KPIs + chuva por mês (se o período cabe num único mês, o calendário desse mês ocupa o lugar do gráfico mensal); (2) os dois gráficos de acumulado (por pluviômetro × média e evolução com faixa) lado a lado numa página só deles, porque espremidos na página 1 junto dos KPIs não cabiam bem num período de ~3 meses; (3) calendários, 6 meses por página (3 × 2), quando há 2 meses ou mais; (4) resumo por pluviômetro. O gráfico mensal só aparece com 2 meses ou mais. Datas coladas no eixo do gráfico de evolução têm o rótulo omitido para não se sobrepor.
- **Limites** em constantes (`LIMITE_CHUVA_FORTE_MM`/`LIMITE_CHUVA_TORRENCIAL_MM` em `RelatorioClimaPublico.tsx`); não configuráveis por fazenda (exigiria campo novo no cadastro e migration). Seguem a escala usual de intensidade em 24 h, não uma norma da fazenda.
- **Leituras detalhadas**: saíram do PDF; na tela ficam num bloco recolhido "Ver leituras detalhadas". O cliente passa `diaria`, `mensal` e `limites` ao endpoint `api/pdf/clima.js`. `pnpm preview:clima` aceita `PREVIEW_MESES=N` para testar a paginação do calendário.

## Relatório de Estoque de Insumos redesenhado para decisão, sem extrato (2026-10-21)

**Problema:** o relatório (link público, PDF e Infográfico Mensal) repetia fatos: tabela larga por item e extrato com todos os lançamentos do período. O PDF não explicava a curva ABC (só o link público).

**Feito:**
- Regras novas e testadas em `features/relatorioEstoque/decisao.ts` (+ `decisao.test.ts`), tudo derivado de campos que a RPC já devolvia. Situação por item, por prioridade: **Repor** (saldo negativo, abaixo do mínimo ou cobertura < 15 d), **Programar** (cobertura de 15 a 30 d: abaixo da meta, sem risco imediato), **Parado** (com saldo e valor, sem saída no período), **Estoque alto** (cobertura > 90 d) e **Ok**. Falta pesa mais que sobra: repor e programar vêm primeiro; estoque alto é só informação (pode ser compra em lote, safra, entressafra) e parado é a única sobra tratada como atenção. Sugestão de compra = maior entre o mínimo e 30 dias de cobertura. **Formulação é produzida, não comprada**: a sugestão dela é de produção (rótulo "Compra ou produção", texto "produzir para…") e não entra nos valores em R$. Também: reposição estimada em R$ (urgente) e a programar, giro, capital parado e em estoque alto, concentração da classe A, consumo por origem e "Leitura do período" em frases. Não há "cobertura média do estoque": com itens de ritmos muito diferentes a média esconde a dispersão (ex.: 4 d no sorgo e 246 d no fós recria dariam "39 dias"). Limites fixos (`COBERTURA_RUPTURA_DIAS`, `_ALVO_`, `_ALTA_`).
- PDF (`api/pdf/estoque.js`): resumo executivo, decisões (Repor agora, Programar compra, Capital parado e Estoque alto, paginados pelo motor de fluxo `_shared/flowEngine.js`, que mede cada bloco e cada linha no Chromium e usa o mínimo de páginas; notas e totais ficam no cabeçalho/título da tabela para não ficarem órfãos), Curva ABC com a caixa "Como ler", concentração e origem do consumo, posição de estoque e glossário. Sem extrato. O cliente envia o payload `decisao` pronto (o endpoint não importa TS do front).
- Link público (`RelatorioEstoquePublico.tsx`): mesmos indicadores, abas "O que repor" (repor agora + programar compra) / "Parado e estoque alto" / "Todos os itens", filtros por situação, ABC com a mesma legenda e glossário. Extrato removido.
- Infográfico Mensal (`relatorioGeral/loaders.ts`): mesmo payload; sem extrato de estoque de insumos (o limite de 4 MB deixa de pesar neste relatório; a constante restante é da Cantina).
- Cada "Compra sugerida" informa o critério que a definiu: "para 30 dias de consumo" ou "para o mínimo (X kg) · cobre N d" (o que exigir mais), para o usuário saber o que o valor cobre.
- Sem período (links antigos) só valem "repor" por mínimo/saldo negativo e a posição; cobertura, programar, parado e estoque alto não se aplicam.
- Pendente: migration que tira `movimentacoes` (e `divergencia_l`) do retorno de `get_dados_relatorio_estoque`. A RPC ainda monta o extrato de cada item, sem uso no front.

## Estoque de insumos: saldo recalculado em ordem de data e divergência removida do relatório (2026-10-21)

**Problema:** o saldo da tela de Estoque (`insumos.estoque_atual`) não batia com o do relatório (ex.: URÉIA PECUÁRIA 1.274,1 × 1.420,00 kg). `recalcular_custo_medio_item(uuid, text, uuid)` ordenava o replay só por `created_at`; saídas com data anterior a um ajuste, lançadas depois dele, eram subtraídas do saldo ajustado. Regra de negócio: ajuste fixa o saldo absoluto a partir do seu dia, então o replay deve ser por `(data, created_at)`, como o relatório já fazia.

**Feito:**
- Migration `20261021160000_recalculo_estoque_ordem_por_data` (rollback em `supabase/rollbacks/`): `ORDER BY data ASC, created_at ASC`. Vale para os próximos lançamentos; o custo médio (WAC) também passa a seguir a ordem das datas.
- Backfill autorizado na fazenda `d3965505-74d5-4af7-9858-f773d2e8aab3`: `recalcular_custo_medio_item` nos 3 insumos abaixo. Só `estoque_atual` mudou (custo igual); `saldo_anterior`/`saldo_posterior` das movimentações foram regravados.

| Insumo | id | Saldo antes | Saldo depois |
|---|---|---|---|
| SAL BRANCO | consultar `backup.insumos_recalc_ordem_data_20261021` | 6.124,70 | 6.688,50 |
| SAL MINERAL REPRODUÇÃO MATSUDA | idem | 7.947,70 | 8.263,40 |
| URÉIA PECUÁRIA | idem | 1.274,10 | 1.420,00 |

- **Reverter:** `backup.insumos_recalc_ordem_data_20261021` (3 insumos: `estoque_atual`, `custo_unitario`) e `backup.mov_saldos_recalc_ordem_data_20261021` (101 movimentações: `saldo_anterior`, `saldo_posterior`).
- Relatório de Estoque (PDF, página pública, `agregacao.ts`): removidos tag, nota, filtro e item de atenção de "divergência". A RPC ainda devolve `divergencia_l`, sem uso.
- Pendente: o item "TESTE Ajuste Saldo" da fazenda de testes (`d649c65e-…`) segue com gravado 24.000 × histórico 14.000; não investigado.

## Farmácia (PWA): layout modernizado, textos tratados e novo teste de entrada e saída (2026-10-21)

Branch `feat/farmacia-layout-moderno` no PWA (a partir da staging; sem mudança de schema nem de painel).

- **Layout**: `FarmaciaForm` passou ao kit das cadernetas modernas (Rodeio/Enfermaria): `CadernetaSection`, `InfoCard` do medicamento (saldo, mínimo, unidade e faixa de situação: abaixo do mínimo, perto, ok, sem controle ou medicamento novo), `StepperInput` com a unidade, faixa de prévia ("Saldo passará de X para Y", vermelha se a saída deixa o saldo negativo, sem bloquear), motivo da saída em `ChoiceGrid` (gravado no começo da observação, sem coluna nova), custo total calculado, validade com `DatePicker`, ditado por voz, `FormFooter` com o que falta, rascunho recuperável (`useRascunhoForm`) e data sem dia futuro. "Cadastrar novo" virou folha sobreposta (`NovoMedicamentoModal`). "Recado" renomeado para "Observação". Regras puras em `utils/farmaciaEstoque.ts`.
- **Plural**: frasco, dose e caixa vão ao plural quando o valor é maior que 1 (saldo, mínimo, prévia, sufixo da quantidade, lista e texto compartilhado); mL, L, g, kg e un não mudam.
- **Textos tratados**: o texto do SuccessModal/Compartilhar tinha caído no caminho genérico e mostrava campos internos (`medicamentoId`, `novoMedicamento`, unidade solta). Agora há ramo próprio em `shareUtils.ts` ("ENTRADA/SAÍDA DE ESTOQUE - FARMÁCIA", medicamento, quantidade com unidade, lote, e só na entrada custo unitário, custo total, validade em dd/mm/aaaa, fornecedor e NF). A lista de registros (`config/cadernetas/farmacia.ts`) mostra "2 frascos", "R$ 120,50 (total R$ 241,00)" e validade em BR, e oculta `unidade`, `novoMedicamento` e ids.
- **Testes**: 510 testes do PWA passam (16 do helper e do texto compartilhado, sem ids); typecheck e lint limpos nos arquivos alterados. **Fluxo completo pelo formulário novo** (fazenda de testes, peão Victor Hugo): entrada de 2 frascos de Draxxin (custo R$ 120,50, lote L-LAYOUT-01, NF-LAYOUT-101, validade) sincronizou, saldo 18 → 20; saída de 1 frasco com motivo "Uso na fazenda" sincronizou, saldo 20 → 19 (custo médio R$ 115,44); o painel mostra 19 frascos e as listas do PWA exibem os registros formatados. Conferidos também o aviso de saída maior que o saldo (Exceller, 5 contra 3 doses), a restauração do rascunho após recarregar e o modal de cadastro novo (abertura e campos; o cadastro de medicamento novo de ponta a ponta continua coberto pelo teste da entrada de Ivomec e da vacina com SKU).
- **Não incluído**: foto da nota/produto (exigiria coluna e armazenamento novos).

## Farmácia: Entrada e Saída em cadernetas separadas e cadastro de medicamento novo na entrada (2026-10-21)

Branch `feat/farmacia-entrada-saida` nos dois repos (a partir da staging, depois do merge da Farmácia).

- **Organização**: a Farmácia era uma caderneta única (`farmacia`) com tipo entrada/saída; virou duas, no padrão das demais: `entrada-farmacia` (grupo "Entrada de Estoque") e `saida-farmacia` (grupo "Saída de Estoque"), ambas gravando em `movimentacoes_farmacia`. PWA: IndexedDB v41 (stores `entrada-farmacia` e `saida-farmacia`, no lugar de `farmacia`, que nunca foi publicada), formulário único `FarmaciaForm` (prop `modo`), páginas e listas por modo, rotas `/caderneta/entrada-farmacia` e `/caderneta/saida-farmacia`. Painel: `/controller/cadernetas/entrada-farmacia` (só entradas) e `/controller/cadernetas/saida-farmacia` (baixas do PWA e da Enfermaria, e estornos); os ajustes aparecem só no histórico do estoque. Na tela de Estoque da Farmácia, o botão "Registros da Farmácia" virou "Entradas" e "Saídas".
- **Medicamento novo na entrada (PWA)**: botão "Não está na lista? Cadastrar novo" (nome, tipo do enum `medicamento_tipo`, unidade e, para frasco/dose/caixa/un, conteúdo por embalagem opcional). O app gera o id (funciona offline) e o sync chama a RPC `criar_medicamento_pwa` (migration `20261021130000`, com rollback) antes de postar a movimentação, no molde de `criar_item_cantina_pwa`: idempotente por id, deduplica por nome na fazenda (devolve o existente e liga o controle de estoque se ainda não tinha lançamentos) e cria já com `controla_estoque`. O app usa o id devolvido. Só a entrada cadastra; a saída só escolhe da lista. Princípio ativo fica "Não informado" (coluna obrigatória) e pode ser completado no painel.
- **SKU opcional** (migrations `20261021140000_medicamentos_sku` e `20261021150000_criar_medicamento_pwa_dose_padrao`, com rollback): `medicamentos.sku` (código interno, ex.: MED-001), único por fazenda sem diferenciar maiúsculas, ignorando excluídos e nulos; trigger apara espaços e transforma vazio em NULL (os formulários mandam ''); medicamentos existentes ficam sem SKU. A RPC `criar_medicamento_pwa` ganhou `p_sku` (a assinatura mudou, a anterior foi removida para não haver sobrecarga ambígua): deduplica primeiro por SKU e depois por nome, e preenche o SKU de um existente que não tinha. A RPC também passou a gravar `dose_recomendada = 'Não informada'` (os editores do painel exigem a dose; sem isso o gestor não conseguia abrir um medicamento criado pelo app). Painel: campo SKU em Medicamentos e em Cadastros Auxiliares, SKU no card do estoque, busca por SKU no estoque e nas listas de Entradas/Saídas, mensagem "Já existe um medicamento com este SKU nesta fazenda." PWA: SKU opcional no "Cadastrar novo", rótulo `Nome (Tipo) · SKU` na busca de medicamento. Fora do escopo: SKU gerado automaticamente, código de barras (EAN) e SKU global entre fazendas. Testado no banco (transação desfeita: normalização, vazio, SKU repetido em outra caixa, excluído não conta) e pelo PWA (vacina nova com `VAC-TESTE-01`); na tela de Medicamentos, SKU repetido mostra a mensagem e mantém o formulário aberto, e um SKU válido (`MED-IVO-01`) salva e aparece no card.
- **Testado** (fazenda de testes, pelo PWA e pelo painel): medicamento "Ivomec Teste PWA" criado pela entrada (tipo Vermífugo, frasco, 500 mL, custo R$ 80, lote L-IVO-01): saldo 10; saída de 2: saldo 8; o painel lista cada um na tela do seu grupo. Limitação conhecida: se a RPC deduplicar e devolver outro id, registros offline posteriores que ainda usem o id local do aparelho falhariam; a tela evita criar nome repetido (seleciona o existente).

## Farmácia: estoque de medicamentos e vacinas, caderneta no PWA e baixa pela Enfermaria (2026-10-21)

Branch `feat/farmacia-estoque` nos dois repos (a partir da staging). Liberada para todas as fazendas (sem flag de acesso).

- **Schema (3 migrations, cada uma com rollback em `supabase/rollbacks/`)**: `20261021100000_farmacia_estoque` (`medicamentos` ganha `unidade`, `estoque_atual`, `estoque_minimo`, `custo_unitario` (WAC), `custo_total_estoque`, `controla_estoque`; ledger `movimentacoes_farmacia` com entrada/baixa/ajuste/estorno; `recalcular_estoque_farmacia` por trigger, ordenando por data, no molde da Cantina; RLS por `caller_has_fazenda_access` (peão grava no PWA), exclusão só admin/controller; **escrita em `medicamentos` passou a exigir admin/controller**, a leitura continua aberta, inclusive anon); `20261021110000_movimentacoes_farmacia_local_id_unique` (índice único **completo** em `local_id`: o parcial dava `42P10` no upsert do PWA, mesmo problema do combustível); `20261021120000_farmacia_baixa_enfermaria` (ver abaixo).
- **Baixa pela Enfermaria**: trigger em `registros_enfermaria` lê `medicamentos[].medicamentoId` + `doseAplicada` ("20 ml", "1,5 mg" ou "15" = ml) e grava `baixa` (origem `enfermaria`, `registro_origem_id` = id do registro), agregada por medicamento. `farmacia_dose_para_estoque`: estoque em mL/L/g/kg converte direto; em frasco/dose/caixa/un usa `conteudo_por_unidade` + `conteudo_unidade` (mL ou mg, igual à unidade da dose): 20 mL ÷ 500 mL = 0,04 frasco. Sem conversão ou sem `controla_estoque`: não baixa. Editar o registro estorna (soft delete) e regera; excluir devolve o saldo; update sem mudança não duplica. Sem backfill. Quantidade tem 3 casas: dose muito pequena frente à embalagem arredonda para 0 e não baixa. Trigger bloqueia trocar `medicamentos.unidade` depois que há lançamento.
- **Painel**: Estoque → Farmácia (`/controller/estoque-farmacia`; cards no layout da suplementação: Editar mínimo inline, Ajustar, Histórico; unidade só na ativação do controle; linha "Baixa da Enfermaria" com o conteúdo por embalagem) e Cadernetas → Entrada de Estoque → Farmácia (`/controller/cadernetas/farmacia`, lista de registros). Regras puras em `features/estoqueFarmacia/logica.ts` (14 testes). Responsividade das telas do grupo Estoque padronizada (resumo em 2 colunas, cabeçalho empilhado) e breadcrumbs acentuados (`Breadcrumbs.tsx`).
- **PWA**: caderneta Farmácia (grupo "Entrada de Estoque"; `FarmaciaPage` com tipo entrada/saída, medicamento, quantidade, lote e, na entrada, custo, validade, fornecedor e nota fiscal; `FarmaciaListaPage` com reenvio de erro de sync). IndexedDB v40 (store `farmacia`), sync para `movimentacoes_farmacia` por `local_id`, saldo otimista no cache (`updateMedicamentoSaldoCache`).
- **Testes** (fazenda de testes): entrada de 5 frascos e saída de 3 pelo formulário do PWA sincronizaram e o saldo/custo médio bateram (16 → 21 → 18, WAC 114,88); baixa da Enfermaria validada em transação desfeita (agregação, item sem id, sem conteúdo, edição, exclusão, bloqueio da troca de unidade). Dados de teste que ficaram na fazenda de testes: Draxxin (frasco, mínimo 5, conteúdo 500 mL, saldo 18) e Exceller (dose, saldo 3), com os lançamentos `teste-farm-001..004` e os dois do PWA (NF-PWA-777).
- **Não incluído**: baixa pelas `aplicacoes_sanitarias`; controle por lote/validade (FEFO); custo escondido do peão (o PWA lê `medicamentos` inteiro); `types/supabase.ts` do PWA não regenerado (o sync usa `as any`).

## Relatório de Clima: visão geral da fazenda é a média dos pluviômetros (2026-10-21)

- **Problema** (relatório da Fazenda Marcon): "Chuva acumulada" somava os mm de todos os pluviômetros. Cada pluviômetro é uma região da fazenda, então a soma superestimava a chuva da fazenda.
- **Regra**: acumulada de cada pluviômetro = soma das suas leituras no período; **chuva acumulada da fazenda = média das acumuladas dos pluviômetros com leitura no período filtrado** (pluviômetro sem leitura não entra no denominador). Respeita os filtros de data e de pluviômetro.
- **Onde**: `RelatorioClimaPublico.tsx` (`calcularKpis` com `n_pluviometros`, `serieDiaria` com `media_fazenda`, `resumirFazenda`) e `api/pdf/clima.js`. O KPI diz "média de N pluviômetros" e a tabela "Resumo por pluviômetro" ganhou a linha "Fazenda (média de N pluviômetros)". O gráfico "Chuva diária" (uma barra por pluviômetro por dia) foi **removido** por ficar ilegível com 9 pluviômetros e repetir as leituras detalhadas; no lugar entraram dois gráficos: (1) barras horizontais com o acumulado de cada pluviômetro e a linha tracejada da média da fazenda (azul = igual ou acima da média, verde-claro = abaixo); (2) evolução do acumulado da fazenda por data, com faixa do pluviômetro que menos ao que mais acumulou (o último ponto é igual ao KPI). Na página 1 do PDF ficam lado a lado. Ajustes seguintes: o gráfico 1 não depende de cor (cada valor leva "▲ +x" ou "▼ -x" de diferença para a média, em coluna alinhada à direita para a linha da média não cortar os números, sem legenda de cores, por causa da impressão em preto e branco); o rótulo "Média" da tela pública deixou de ficar cortado (margem superior); o eixo de datas do gráfico 2 é proporcional ao tempo (antes espaçava as datas por igual e distorcia a inclinação); com mais de 8 datas só o primeiro e o último ponto levam valor, para não sobrepor. Temperatura e umidade já eram médias, sem mudança. Testes em `RelatorioClimaPublico.test.ts`.
- **Ferramenta**: `pnpm preview:clima` (`apps/manejus/scripts/preview-clima.mjs`) serve o HTML do PDF de Clima com dados sintéticos e recarrega ao salvar; finalidade e limitações no `CLAUDE.md`. Também entrou o texto explicativo do gráfico de evolução (linha e faixa), na tela pública e no PDF.
- **Não incluído**: o relatório consolidado (Infográfico Mensal) não tem seção de clima; o PDF de exemplo da Marcon não pôde ser aberto aqui (sem poppler), então o ajuste vem do código e da regra descrita.

## Auditoria do IATF, itens 10 e 11: lote offline visível e documentação (2026-10-20)

- **Item 10 (PWA)**: o lote criado offline só entra na lista depois de enviado e baixado, e até lá a tela não dizia nada. A caderneta Protocolo IATF passou a mostrar o lote local ainda não sincronizado como "aguardando envio" (ou "erro no envio: veja em Lotes criados"), para o peão não achar que sumiu nem criar outro. Testado pelo DevTools com a rede emulada offline (lote criado e cartão tracejado visível acima dos lotes baixados) e ao religar (o lote subiu, o cartão sumiu e ele entrou como lote normal com 3 passos). Em desenvolvimento a tela em branco ao recarregar offline é o servidor Vite sem o pedaço de código; em produção o service worker faz o pré-cache.
- **Item 11 (tipos e documentação)**: "gerar tipos do IATF" **não foi feito de propósito**: o cliente do painel (`createClient` em `packages/supabase`) não usa tipos do banco em nenhuma tabela e o PWA acessa essas tabelas com `as any`; tipar só o IATF não ajudaria, é uma decisão do projeto inteira. Corrigidos: o item C2 do `PLANO_INDIVIDUOS_FASE4_SANIDADE_REPRODUCAO.md`, a mensagem "ainda está em teste" das telas do IATF no PWA e o BACKLOG do IATF (resolvidos saíram, restos e novas pendências entraram).
- **Dados de teste**: ao fim da auditoria, na fazenda de testes foram excluídos logicamente (`deleted_at`) os 7 lotes de protocolo, os 2 protocolos, as 8 notificações "IATF:" e as inseminações dos lotes desta sessão; todos os animais voltaram a `Vivo` e não há lote, protocolo ou notificação IATF ativos.
- Reconfirmado na interface depois da limpeza (pendência do item 3): com fêmeas "Sem registro"/"Parida" o painel cria o lote direto, sem aviso.

## Auditoria do IATF, item 9: salvar protocolo e passos numa única transação (2026-10-20)

Origem: `docs/RELATORIO_AUDITORIA_IATF.md` (item 9). O painel editava o protocolo com três chamadas separadas (atualiza, apaga os passos, reinsere) e tentava restaurar pelo cliente se a reinserção falhasse; uma queda de rede no meio deixava o protocolo sem passos.

- Migration `20261020300000_iatf_salvar_protocolo_atomico.sql` (rollback descrito em `supabase/rollbacks/`): `salvar_protocolo_iatf(p_fazenda_id, p_protocolo_id, p_nome, p_descricao, p_passos jsonb)`, `SECURITY INVOKER` (a RLS do item 7 segue valendo), cria (id nulo) ou edita e troca os passos numa transação. Valida nome, ao menos um passo, exatamente um passo de IA, dia inteiro de 0 a 30, descrição e tipo; nome repetido vira "Já existe um protocolo com esse nome nesta fazenda". Lotes já criados não mudam (retrato nas tarefas).
- Painel: `useSalvarProtocoloIatf` chama a RPC; a compensação no cliente (restaurar passos / apagar o protocolo novo) foi removida.
- Testado: banco em transação desfeita (criar com ordem e trim, editar, lote existente manteve as 3 tarefas, todas as recusas sem alterar passos, nome repetido, fazenda alheia, peão barrado pela RLS); painel pelo DevTools (criar protocolo, editar o dia da IA de D10 para D9, tentar renomear para um nome existente: aviso em português, formulário aberto e passos dos dois protocolos intactos).
- Dado de teste novo: protocolo "Teste atomico" na fazenda de testes.

## Auditoria do IATF, item 8: descartar fêmea do lote pelo PWA (2026-10-20)

Origem: `docs/RELATORIO_AUDITORIA_IATF.md` (item 8). O PWA não tinha como tirar uma fêmea do protocolo; com a escrita direta fechada ao peão (item 7) isso exigia uma RPC.

- Migration `20261020290000_iatf_descartar_femea_rpc.sql` (rollback descrito em `supabase/rollbacks/`): `descartar_femea_lote_protocolo(p_fazenda_id, p_lote_id, p_individuo_id, p_motivo)`, `SECURITY DEFINER` com checagem de acesso; só lote "Em andamento"; idempotente (fêmea já descartada não faz nada, para o reenvio da fila); motivo vazio vira "Fora do protocolo"; se era a última fêmea sem IA, conclui o passo de IA. Essa regra virou a função interna `iatf_concluir_ia_se_completa` (sem EXECUTE para a API), usada também pelo gatilho de baixa do item 3, que deixou de repeti-la.
- PWA: nova tela `ProtocoloIatfDescartePage` (`/caderneta/protocolo-iatf/descartar`, botão "Descartar fêmea do lote" na caderneta): escolhe o lote, marca uma ou mais fêmeas e o motivo (Perdeu o implante, Doente ou lesionada, Fora do protocolo, Outro). Funciona offline: cada fêmea vira um registro `protocolo-iatf` com `acao: 'descartar'` (sem store novo no IndexedDB), enviado pela RPC. O passo de IA deixa de oferecer a fêmea descartada neste aparelho antes mesmo de sincronizar. Mensagens do servidor traduzidas; lista de registros mostra "Descartar BR-xxx · lote".
- Painel: "Descartar" passou a usar a RPC (para o fechamento do passo valer); "Reativar" segue direto pela tabela (só gestão).
- Testado: banco com sessão simulada do peão real (A: descarta a última sem IA e o passo conclui; motivo em branco vira o padrão; reenvio idempotente; fêmea fora do lote, fazenda alheia e lote cancelado recusados; escrita direta barrada; função interna sem permissão; descarte antes de qualquer IA deixa o passo aberto e a IA geral usa só as restantes) e o cenário de baixa do item 3 refeito com a função interna; PWA pelo DevTools como Victor Hugo (descarte da ADOT-BR-C1 com motivo sincronizou; a IA do lote ofereceu só as 3 restantes, registrou 3 e o passo fechou); painel (Reativar e Descartar na mesma fêmea).
- Limitação conhecida: reativar uma fêmea depois que o passo de IA já foi concluído não o reabre; ela fica sem IA e o botão "Registrar IA" não aparece (a RPC aceitaria). Se aparecer na prática, reabrir o passo ao reativar.

## Auditoria do IATF, item 7: escrita direta nas tabelas de IATF só para a gestão; o peão usa só as RPCs (2026-10-20)

Origem: `docs/RELATORIO_AUDITORIA_IATF.md` (item 7). Antes, as 5 tabelas de IATF tinham uma policy `FOR ALL` para qualquer usuário com acesso à fazenda, inclusive o login de peão do PWA, que só precisa das RPCs.

- Migration `20261020280000_iatf_escrita_so_gestao_peao_so_rpc.sql` (rollback descrito em `supabase/rollbacks/`): em `protocolos_iatf`, `protocolos_iatf_passos`, `lotes_protocolo_iatf`, `_femeas` e `_tarefas`, a policy `*_tenant` foi trocada por `*_leitura` (SELECT para quem tem acesso à fazenda, como antes) e `*_escrita_gestao` (ALL só para admin ou usuário com acesso que **não** seja peão, via `caller_is_peao()`). `criar_lote_protocolo_iatf`, `marcar_tarefa_protocolo_iatf`, `registrar_ia_lote_protocolo` e `desfazer_ia_lote_protocolo` passaram a `SECURITY DEFINER` com checagem de acesso à fazenda na entrada ("Sem acesso à fazenda"; chamada sem usuário, como cron, gatilho de sistema e service role, segue permitida). Desfazer (`desfazer_ia_lote_protocolo` e `marcar` com data nula) é só da gestão ("…é feito pelo painel de gestão"). `copiar_modelo_protocolo_iatf` passou a `SECURITY INVOKER`. O filtro por fazenda entrou na busca de reenvio por `local_id` (criar_lote e registrar_ia), para a versão DEFINER não devolver dado de outra fazenda.
- **Não mudou**: `eventos_reprodutivos` continua com a policy aberta à fazenda (o PWA grava reprodução direto nela); fica como pendência de segurança à parte.
- Advisor: o aviso do `copiar_modelo_protocolo_iatf` sumiu; agora o linter lista as RPCs do IATF como `SECURITY DEFINER` executáveis por `authenticated`, o mesmo padrão aceito das dezenas de RPCs do peão no projeto, aqui com checagem de acesso dentro de cada função.
- Testado: **antes de aplicar**, o SQL inteiro foi executado numa transação desfeita com sessões simuladas (`set_config` do JWT + `SET LOCAL ROLE authenticated`) do login de peão real da fazenda de testes e do controller: peão lê, mas INSERT/UPDATE/DELETE direto é bloqueado nas 5 tabelas; as RPCs criar lote, marcar passo e registrar IA (com reenvio idempotente) funcionam; desfazer IA, desfazer passo e copiar modelo são recusados; RPC com fazenda alheia dá "Sem acesso à fazenda"; controller escreve direto, descarta fêmea, copia modelo, desfaz, registra IA; a função de alerta do cron roda sem JWT. **Depois de aplicar**, pelo DevTools: painel como controller (cancelar 2 lotes e editar protocolo, ambos escrita direta) e PWA como o funcionário Victor Hugo (criar lote, marcar D0 e registrar 5 IAs, tudo gravado com origem `pwa`).
- Atenção para quem mexer depois: toda RPC nova do IATF usada pelo PWA precisa ser DEFINER com a checagem de acesso; escrita direta do PWA nessas tabelas deixou de funcionar.

## Auditoria do IATF, item 6: alerta diário de passos do protocolo às 07:30 de Cuiabá (2026-10-20)

Origem: `docs/RELATORIO_AUDITORIA_IATF.md` (item 6). O job `notificar_protocolos_iatf` estava em `30 7 * * *`, mas `cron.timezone = GMT` e Cuiabá é UTC-4: rodava às 03:30 locais.

- Migration `20261020270000_iatf_cron_notificacoes_horario_cuiaba.sql` (rollback em `supabase/rollbacks/`): `cron.alter_job` do job (buscado pelo nome; sem o job, não faz nada) para `30 11 * * *` = 11:30 UTC = 07:30 em Cuiabá. Só o agendamento; a função já calculava "hoje" em `America/Cuiaba`. Precedente: `20260824120000_corrigir_fuso_cron_peso_vivo.sql`.
- Conferido: `cron.job` com `30 11 * * *`, ativo. O disparo em si só se confirma quando o relógio chegar a 11:30 UTC (o job ainda não tinha execuções registradas antes da troca).
- Testado a função na fazenda de testes: 4 usuários ativos recebem 2 notificações cada (atrasado: "3 passo(s)… em 1 lote(s)"; hoje: "2 passo(s)… em 2 lote(s)"), 8 no total, com `acao_url` `/controller/protocolos-iatf`; segunda execução não duplica; no painel as duas aparecem em Notificações e clicar no cartão leva à tela de IATF. Em bloco desfeito: com pendência as existentes são renovadas para o dia; sem pendência (lotes cancelados) as não lidas de dias anteriores saem. Notificação já **lida** não é reaproveitada: se a pendência continua, uma nova não lida é criada no dia seguinte (comportamento atual da função, mantido).
- Resíduo de teste: 8 notificações "IATF:" nos 4 usuários da fazenda de testes (uma delas marcada como lida no teste); soft-delete na limpeza final.

## Auditoria do IATF, item 5: a mesma fêmea não fica ativa em dois lotes em andamento (2026-10-20)

Origem: `docs/RELATORIO_AUDITORIA_IATF.md` (item 5). Antes, a mesma fêmea entrava em dois lotes "Em andamento" sem aviso, duplicando tentativas no relatório de taxa e alertas.

- Decisão: **bloquear** (não só avisar). O remédio é simples (descartar a fêmea no lote antigo ou cancelá-lo) e o repasse legítimo segue livre: lote anterior concluído ou cancelado, ou fêmea descartada nele.
- Migration `20261020260000_iatf_femea_em_um_lote_por_vez.sql` (rollback em `supabase/rollbacks/`): `criar_lote_protocolo_iatf` recusa fêmea já ativa em outro lote em andamento, listando até 5 com o lote ("Fêmea(s) já em outro lote de protocolo em andamento: … Descarte-a(s) de lá ou cancele aquele lote"); o reenvio com o mesmo `local_id` continua devolvendo o lote já criado. O gatilho `trg_lotes_protocolo_iatf_filho_validar` faz a mesma checagem na inserção direta e no "Reativar" de fêmea descartada. Dados anteriores (fêmea já repetida em dois lotes) não são alterados.
- Painel: no modal de novo lote, fêmea ativa em outro lote em andamento aparece bloqueada com o nome do lote, e "Marcar todas" não a seleciona (`femeasEmOutroLoteIatf`).
- PWA: `errosLoteProtocolo` confere contra o cache dos lotes em andamento (`femeas` do cache, item 1) e mostra a pendência antes de salvar; lote criado no próprio aparelho e ainda não enviado não está no cache, então nesse caso o servidor recusa e o erro volta pela fila (mensagem traduzida em `syncErrorMessages`).
- Testado: banco em sub-blocos desfeitos (bloqueio com a lista; lote parcial não criado; descartada, cancelada e concluída liberam; reativar bloqueado; reenvio idempotente); painel pelo DevTools (as 7 fêmeas de "Teste 2" bloqueadas com "já está no lote…", "Marcar todas" seleciona 0); PWA pelo DevTools (adicionar todas as 7 gera a pendência e desabilita o Salvar).
- Os lotes de teste "Lote teste item 1" e "Lote teste item 3" ficaram com fêmeas repetidas (criados antes da regra); serão limpos ao fim da auditoria.

## Auditoria do IATF, item 4: data de execução anterior ao D0 recusada; aviso de passos anteriores pendentes (2026-10-20)

Origem: `docs/RELATORIO_AUDITORIA_IATF.md` (item 4). Antes, o D0 marcado 30 dias antes do D0 e a IA 25 dias antes do D0 eram aceitos, e a IA saía do ciclo do protocolo no relatório de taxa.

- Migration `20261020250000_iatf_recusa_data_antes_do_d0.sql` (rollback em `supabase/rollbacks/`): `marcar_tarefa_protocolo_iatf` (com data) e `registrar_ia_lote_protocolo` recusam data anterior ao D0 do lote ("A data de execução não pode ser anterior ao D0 do lote (dd/mm/aaaa)"). Passo executado antes da data **prevista** (mas não antes do D0) continua permitido; desfazer não é afetado. Sem alteração de dados.
- Painel: a data do modal tem `min` = D0, mostra a mensagem e desabilita o Confirmar; ao registrar a IA com passos de dia anterior ainda pendentes, abre confirmação ("Passos anteriores pendentes… Registrar mesmo assim?"). Utilitário `passosAnterioresPendentes`.
- PWA: o formulário guarda `loteD0` e recusa data anterior (mensagem na pendência, Salvar desabilitado; o `DatePicker` compartilhado não tem data mínima e não foi alterado); na IA com passos anteriores pendentes mostra faixa de atenção (sem bloquear); a mensagem do servidor entra em `syncErrorMessages`.
- Efeito colateral aceito: lote criado com o D0 errado não aceita registros com a data real anterior a ele; como o lote ainda não é editável (item 7 do relatório e BACKLOG), a saída é cancelar e recriar.
- Testado: banco (antes do D0 recusado nos dois caminhos; na data do D0, D8 antes da data prevista e desfazer aceitos); painel pelo DevTools (data mínima, mensagem e Confirmar desabilitado em IA e em passo comum; confirmação de passos anteriores com Cancelar sem gravar e "mesmo assim" gravando 7 IAs); PWA pelo DevTools com o funcionário Victor Hugo (faixa de atenção listando D0 e D8; data 07/10 com D0 08/10 gera a pendência e desabilita o Salvar).

## Auditoria do IATF, item 3: fêmea baixada sai do lote; aviso de fêmea prenha/coberta (2026-10-20)

Origem: `docs/RELATORIO_AUDITORIA_IATF.md` (item 3). Antes, fêmea marcada Morto mas ainda "Ativa" no lote recebia IA (o gatilho só confere o animal ao entrar no lote), e fêmea prenha entrava no lote sem aviso.

- Migration `20261020240000_iatf_femea_baixada_sai_do_lote.sql` (rollback em `supabase/rollbacks/`): gatilho `trg_individuo_baixa_descarta_femea_iatf` em `individuos` (AFTER UPDATE OF status, deleted_at, com `WHEN`): quando o animal deixa de ser `Vivo` (Morto, Abatido, Doado, Transferido, Venda Vivo) ou é excluído, o vínculo dele em lotes "Em andamento" vira `Descartada` com o motivo; se era a última fêmea sem IA, o passo de IA é concluído com a data da última IA. Lote concluído ou cancelado não é alterado. `registrar_ia_lote_protocolo` só considera fêmea viva e não excluída (cobre vínculo legado) e não a conta como "ainda sem IA" para fechar o passo. Reativar o vínculo continua manual.
- Painel: `ModalNovoLote` avisa, com confirmação, quando há fêmea `Prenha` ou `Coberta` sem diagnóstico na seleção (`avisosReprodutivosIatf`; guarda identificação e status das fêmeas de todos os lotes consultados). O `ConfirmModal` ficou fora do `Modal` (dentro dele o clique em Cancelar subia pela árvore e fechava o formulário).
- **PWA sem aviso**: o cache do aparelho não tem o status reprodutivo; a criação de lote pelo PWA continua sem esse aviso. A recusa do servidor ("Há fêmea que não é ativa neste lote de protocolo") já é traduzida no PWA.
- Testado: banco em sub-blocos desfeitos (última fêmea sem IA morre: vínculo Descartada e passo concluído; abatida antes da IA: IA grava só nas vivas; vínculo legado Ativo de morta: IA ignora e fecha o passo; IA explícita na morta recusada; lote concluído preservado; exclusão do animal descarta com motivo); painel pelo DevTools (aviso com as 7 fêmeas "Coberta", Cancelar mantém o formulário sem criar lote, "Criar mesmo assim" cria com 7 fêmeas e 3 tarefas). Ainda a reconfirmar na interface, depois da limpeza dos dados de teste: criação direta, sem aviso, com fêmea sem alerta (coberto só por teste unitário).
- Dado de teste novo: lote "Lote teste item 3" na fazenda de testes.

## Auditoria do IATF, item 2: desfazer a IA remove as inseminações (2026-10-20)

Origem: `docs/RELATORIO_AUDITORIA_IATF.md` (item 2). Antes, desfazer o passo de IA deixava as Inseminações órfãs na ficha das fêmeas e registrar de novo com outro touro não gravava nada.

- Migration `20261020230000_desfazer_ia_lote_protocolo.sql` (rollback em `supabase/rollbacks/`): nova RPC `desfazer_ia_lote_protocolo(p_fazenda_id, p_tarefa_id, p_individuos)` exclui logicamente (`deleted_at`) as IAs do lote (todas ou só das fêmeas informadas), reabre o passo e recalcula o status do lote; **recusa** se a fêmea tem Diagnóstico de gestação a partir da data da IA ("Não é possível desfazer: há fêmea com diagnóstico de gestação lançado depois da IA"). `marcar_tarefa_protocolo_iatf` com data nula num passo de IA delega para ela. `registrar_ia_lote_protocolo` avisa "As fêmeas informadas já têm inseminação neste lote" quando a chamada não teria efeito (resíduo do item 1).
- Painel: o "Desfazer" do passo de IA abre confirmação com a contagem de inseminações que serão removidas; em "Ver fêmeas", cada fêmea com IA ganha "Desfazer IA". Hook `useDesfazerIaIatf`.
- PWA: só registro local de IA **ainda não sincronizado** conta como "fêmea já coberta" (o sincronizado vem de `inseminadas` do servidor, e some se for desfeito no painel); as duas mensagens novas entram em `syncErrorMessages`.
- Testado: banco (desfazer total e parcial, refazer com touro certo, bloqueio por diagnóstico sem apagar nada, passo não-IA inalterado); painel pelo DevTools (desfazer uma fêmea, refazer com "Touro CORRIGIDO", desfazer o passo inteiro com modal contando 8, bloqueio por diagnóstico com aviso na tela); PWA com o funcionário Victor Hugo (após desfazer a IA da "44" no painel, a caderneta voltou a oferecer só essa fêmea; registrada com outro touro, sincronizou e o passo fechou).
- Observação: a IA removida continua no banco com `deleted_at` (histórico); a unicidade de `local_id` mantém a idempotência do reenvio do PWA mesmo depois de desfeita.

## Auditoria do IATF, item 1: IA por grupos de fêmeas (2026-10-20)

Origem: `docs/RELATORIO_AUDITORIA_IATF.md` (item 1). Antes, depois da primeira IA a tarefa ficava "feita" e outra chamada (outra fêmea, outro touro) era recusada, então um lote só podia ter um touro/partida.

- Migration `20261020220000_registrar_ia_por_grupos_de_femeas.sql` (rollback em `supabase/rollbacks/`): `registrar_ia_lote_protocolo` grava só as fêmeas sem Inseminação ativa no lote; a tarefa só é marcada quando **todas** as ativas têm IA; reenvio do mesmo `p_local_id` devolve 0 (idempotência por chamada, não só da última); data futura é recusada na entrada; a recusa "A inseminação deste lote já foi registrada em …" continua quando a tarefa está feita e nada resta a gravar. A chamada atual do PWA (`p_individuos` nulo) segue valendo.
- Painel (`ProtocolosIatf.tsx`, `useProtocolosIatf.ts`, `utils/protocoloIatf.ts`): o modal "Registrar IA" lista as fêmeas ativas com caixa de seleção (as que já têm IA ficam bloqueadas, com o touro); o passo mostra "N de M inseminadas"; a consulta do lote traz `eventos_reprodutivos` ligados a ele.
- PWA (`ProtocoloIatfPage.tsx`, `utils/protocoloIatf.ts`, `supabaseService.getLotesProtocoloIatf`): mesma escolha de fêmeas; o cache do lote ganhou `femeas` e `inseminadas` (opcionais: cópia antiga do aparelho segue no comportamento anterior); o passo continua pendente enquanto sobrar fêmea sem IA, descontadas as já registradas no aparelho.
- Testado pelo DevTools na fazenda de testes: painel (3 grupos A/B/C, 2+3+3 fêmeas, passo fechou só no último, banco conferido) e PWA com o funcionário Victor Hugo (2 grupos, X e Y, sincronizou sozinho, lote seguiu "Em andamento"). Console sem erro nos dois.
- Resíduo conhecido: chamar a RPC com uma fêmea que já tem IA, com a tarefa ainda aberta, devolve 0 sem erro (não duplica; a tela não oferece essa fêmea). Será tratado na migration do item 2.
- Dados de teste deixados na fazenda de testes: protocolo "IATF clássico (D0/D8/D10)", lotes "Lote teste item 1" e "Lote PWA item 1" (com as IAs acima). Limpar por soft-delete ao fim da auditoria.

## Flag "Acesso ao IATF" por fazenda e grupo IATF nas cadernetas (2026-10-20)

- A flag vale **só para o IATF**: coluna `fazendas.acesso_iatf boolean NOT NULL DEFAULT false` (criada como `acesso_controle_individual` em `20261020200000` e renomeada em `20261020210000_fazendas_acesso_iatf.sql`, com rollbacks em `supabase/rollbacks/`; `get_fazenda_por_acesso` devolve a coluna). Só a fazenda de testes está ligada; as outras 58 ficam `false`.
- Admin: checkbox "Acesso ao IATF" em `NovaFazenda.tsx` e `EditarFazenda.tsx`, selo em `DetalhesFazenda.tsx` e o campo em `fazendasService`, no molde do confinamento.
- O que a flag libera: o grupo **IATF** do sidebar (`ControllerLayout`), o grupo **IATF** (só Protocolo IATF) em Cadernetas e no Dashboard, a caderneta no RBAC (`CadastrosAuxiliares`), o modo "Lote de protocolo" do Diagnóstico em Grupo e a rota `/controller/protocolos-iatf` (novo `IatfRoute`, molde do `ConfinamentoRoute`; sem a flag volta ao dashboard). Hook `useAcessosFazenda`. `protocolo-iatf` ganhou imagem, título e descrição em `types/images.ts` (o card não aparecia em Cadernetas).
- **Não mudou**: o menu "Controle Individual" do sidebar (Indivíduos, Identificar Lote, Conciliação, Reprodução, Diagnóstico em Grupo, Estações de Monta, Manejo Sanitário), o Calendário Sanitário e as cadernetas Reprodução, Sanidade e Manejo de Curral seguem só na fazenda de testes pela trava por ID (`FAZENDA_DE_TESTES_ID`, `CADERNETAS_EM_TESTE`, `menuControleIndividualVisivel`). As 3 cadernetas ficam num grupo próprio "Controle Individual" nas Cadernetas (antes estavam em Gado & Pastagens, escondidas).
- RBAC da fazenda de testes: as 4 cadernetas foram acrescentadas à `cadernetas_permitidas` dos 9 funcionários que têm lista (sem isso o PWA com controle de acesso não mostrava os grupos).
- Testado pela interface (controller da fazenda de testes, localhost): com a flag, sidebar com "Controle Individual" e "IATF", e Cadernetas com os dois grupos; sem a flag, o IATF some (menu, grupo e rota direta volta ao dashboard) e o Controle Individual continua. Não testado: as telas do admin (Nova/Editar/Detalhes Fazenda) pela interface, que exigem login de admin (só typecheck), e o botão do toggle gravando.

## Grupo "IATF" próprio no sidebar do painel (2026-10-20)

- "Protocolos de IATF" saiu de Controle Individual e foi para um grupo novo, **IATF** (`ControllerLayout.tsx`). A página `/controller/protocolos-iatf` concentra as três abas do IATF (Lotes de protocolo, Protocolos e Taxa de prenhez), então o grupo tem um item só.
- **Ficou em Controle Individual**: Indivíduos, Identificar Lote, Conciliação, Reprodução, Estações de Monta e Manejo Sanitário (reprodução e sanidade em geral) e o **Diagnóstico em Grupo**, que é anterior ao IATF e atende qualquer lote da fazenda; o modo "Lote de protocolo de IATF" dele é uma opção dentro da tela, não uma tela de IATF.
- O grupo IATF passou depois para a flag por fazenda `acesso_iatf` (entrada acima); o Controle Individual segue só na fazenda de testes.
- Testado pela interface (fazenda de testes): grupo IATF aparece com "Protocolos de IATF", abre a página e fica ativo na rota; Controle Individual segue com os outros sete itens.

## Tela Estoque → Cantina no painel (2026-10-20)

- Nova página `/controller/estoque-cantina` (menu Estoque → Cantina), antes o saldo da cantina só aparecia no relatório público. Mostra KPIs (itens controlados, em alerta, valor em estoque, consumo do mês), cards por item com saldo, custo médio, mínimo e valor (selos de saldo negativo, abaixo do mínimo, sem custo e sem controle), busca e filtro por classificação, entrada manual, ajuste de inventário e histórico por item com filtro de período e saldo após cada lançamento.
- Sem migration: insert direto em `movimentacoes_cantina` (entrada com `origem='painel_entrada'`, custo e fornecedor; ajuste com `origem='painel_ajuste'`, novo saldo absoluto e motivo obrigatório); o trigger `recalcular_estoque_cantina` refaz saldo e custo médio. O ajuste não mexe no custo (o recálculo sobrescreveria).
- Regras puras em `features/estoqueCantina/logica.ts` (+ `logica.test.ts`, 11 testes): alerta, sem custo, valor (saldo negativo não conta), filtro/ordenação (alertas primeiro), validação dos formulários, replay do saldo do extrato e aviso de divergência entre o saldo reconstruído por data e o gravado (ajuste retroativo).
- O valor da tela usa o saldo gravado em `itens_cantina`; o do relatório usa o saldo reconstruído por data, então podem diferir quando há divergência (Açúcar na fazenda de testes: R$ 1.797,64 na tela × R$ 1.794,22 no relatório).
- Testado na fazenda de testes pela interface: entrada no Detergente (12 un a R$ 2,50, que estava sem custo), ajuste do Tomate de −4,4 para 0 kg, histórico com filtro de período e aviso de divergência do Açúcar (−0,8 kg); saldos gravados conferidos por SQL. Esses dois lançamentos ficaram nos dados de teste.

## Relatório de Cantina (2026-10-20)

- Novo relatório `cantina` (link público `/r/:token`, PDF avulso e seção do Infográfico Mensal). A cantina do sistema é a cozinha da fazenda (catálogo `itens_cantina`, ledger `movimentacoes_cantina`, `registros_alimentacao`), não venda a peão: não existe consumo por peão no banco nem no PWA.
- Conteúdo: estoque por item com controle (saldo inicial, entradas, baixas, ajustes, saldo final, cobertura, mínimo, custo médio, valor, curva ABC), extrato, operação da cozinha (cafés, lanches, almoços, jantares e custo por refeição = baixas ÷ refeições), marmitas (quantidade e valor) e avisos de qualidade (registros sem `itens_detalhe`, itens usados sem `controla_estoque`, nomes duplicados, divergência de saldo).
- Migration `20261020190000_relatorio_cantina.sql` (rollback em `supabase/rollbacks/`): `get_dados_relatorio_cantina(p_token, p_data_inicio, p_data_fim)` (anon) e `..._fazenda(p_fazenda_id, datas)` (authenticated, token temporário). Saldo reconstruído por `(data, created_at, id)`: entrada soma, baixa e estorno subtraem, ajuste define o saldo absoluto. Datas de `registros_alimentacao` convertidas para America/Cuiaba. Valor em estoque = `max(0, saldo final) × custo médio ATUAL`; baixas usam o custo gravado no lançamento.
- Código: `features/relatorioCantina/agregacao.ts` (+ teste), `pages/public/RelatorioCantinaPublico.tsx`, `utils/relatorioCantinaPDFPuppeteer.ts`, `api/pdf/cantina.js`, registro em `RelatorioPublico.tsx`, `Relatorios.tsx`, `vite.config.ts`, `features/relatorioGeral/{catalogo,loaders}.ts` e `api/pdf/_shared/reportRegistry.js`. Custo por refeição só aparece quando há baixas valoradas (custo > 0). Cobertura sem consumo no período aparece como "Sem consumo".
- `api/pdf/geral.js`: limite de relatórios por Infográfico subiu de 8 para 10; a seleção padrão passou a ter 9 seções e seria recusada com 8.
- Dados de teste na fazenda de testes (criados por `scripts/teste-api.mjs`, 2026-10-20): 6 itens novos com controle (Feijão, Óleo de soja, Açúcar, Frango, Tomate, Detergente), 2 sem controle (Refrigerante e um "Arroz" duplicado), mínimos nos 4 itens antigos, entradas de 20/09 e 02, 10 e 15/10 com custo e fornecedor, 12 registros de saída (01 a 19/10, 717 refeições), 3 marmitas (uma sem preço), um ajuste de inventário do Feijão e um ajuste do Açúcar lançado com data retroativa (05/10). Cobre: saldo negativo (Tomate), abaixo do mínimo (Café, Frango, Detergente, Tomate), sem custo (Detergente), divergência (Açúcar, −0,8 kg), nome duplicado, item usado sem controle e marmita sem preço. Para refazer, apague/soft-delete esses registros pela mesma fazenda.
- Testado com esses dados: RPC (saldo final = `estoque_atual` em todos os itens, exceto a divergência esperada do Açúcar), página pública (abas, filtros, busca, ordenação, ABC), PDF avulso de 12 páginas (atenção, posição, operação e marmitas, curva ABC, extrato paginado em 8 páginas) e Infográfico com as 9 seções padrão (PDF de 4,2 MB, pico de 348 MB de memória local). Não coberto: botão "Mostrar todos" do extrato (só aparece com mais de 200 lançamentos) e o Infográfico num ambiente Vercel real (o corpo da requisição passou no limite de 4 MB localmente, mas o tamanho exato do payload não foi medido).

## Relatório de Estoque de Insumos: período, movimentação, cobertura e qualidade dos dados (2026-10-20)

- Mesmo tipo `estoque` (links e card atuais continuam). Antes era só um snapshot (saldo atual × custo) e no Infográfico Mensal ignorava o período. Agora tem período opcional: saldo inicial, entradas (entrada + produção), saídas (baixa + consumo), ajustes, saldo final, extrato, cobertura em dias, quanto falta para o mínimo, itens sem custo, saldo negativo com quantidade e valor, e curva ABC por grupo (A até 80% do valor, B até 95%).
- Migration `20261020180000_relatorio_estoque_periodo.sql` (rollback em `supabase/rollbacks/`): `get_dados_relatorio_estoque(p_token, p_data_inicio, p_data_fim)` e `..._fazenda(p_fazenda_id, datas)` (DROP das assinaturas antigas). Sem datas devolve a posição atual (compatível com links antigos; `tem_periodo = false`). Com datas, reconstrói o saldo pelo ledger `movimentacoes_estoque_suplementos` por `(data, created_at)`: entrada/produção somam, baixa/consumo subtraem, ajuste define o saldo absoluto (`quantidade` do ajuste é o saldo, conferido no banco). Fornecedor e NF vêm de `entrada_insumos_itens` → `registros_entrada_insumos`.
- `divergencia_l` compara o saldo reconstruído com `estoque_atual` quando o período termina hoje. Na fazenda de testes 21 de 22 itens bateram; o "TESTE Ajuste Saldo" diverge em 10.000 kg (ajuste lançado depois com data anterior) e aparece como aviso.
- Front: `features/relatorioEstoque/agregacao.ts` (ABC, filtros, ordenação, totais por grupo; testes novos em `agregacao.test.ts`), página pública com período, KPIs por aba, busca, filtros, ordenação e extrato, PDF (`api/pdf/estoque.js`) com resumo e atenção, posição em fluxo contínuo, curva ABC e extrato, e loader do Infográfico passando o período (extrato truncado em 250 lançamentos).
- Testado na fazenda de testes: RPC (com e sem datas), página pública e PDF de 6 páginas conferidos. Não testado pela interface: seção de estoque no Infográfico Mensal, links com escopo `insumos`/`formulacoes`, e o PDF depois do último ajuste de ordem da lista de atenção (conferido só por renderização do HTML com dados de exemplo).

## Relatório de Estoque de Combustível (2026-10-20)

- Novo relatório `estoque_combustivel` (link público `/r/:token`, PDF avulso e seção do Infográfico Mensal). Por tanque e período: saldo inicial, entradas, baixas, ajustes, saldo final, % da capacidade, custo médio, valor em estoque, mais o extrato das movimentações com o saldo após cada lançamento.
- Migration `20261020170000_relatorio_estoque_combustivel.sql` (rollback em `supabase/rollbacks/`): RPCs `get_dados_relatorio_estoque_combustivel(p_token, p_data_inicio, p_data_fim)` (anon) e `..._fazenda(p_fazenda_id, datas)` (authenticated, token temporário). Saldo reconstruído por `(data, created_at)`: entrada soma, baixa subtrai, ajuste define o saldo absoluto. Sem período, tudo conta como movimento do período (saldo inicial 0).
- Valor em estoque = `max(0, saldo final) × custo médio ATUAL` do tanque (aproximação em períodos passados). O replay do trigger ordena por `created_at`, não por `data`; com datas retroativas o saldo final do relatório pode divergir de `saldo_atual_l` (na fazenda de testes bateu nos 4 tanques).
- Código: `features/relatorioEstoqueCombustivel/agregacao.ts` (+ teste), `pages/public/RelatorioEstoqueCombustivelPublico.tsx`, `utils/relatorioEstoqueCombustivelPDFPuppeteer.ts`, `api/pdf/estoqueCombustivel.js`, registro em `RelatorioPublico.tsx`, `Relatorios.tsx`, `vite.config.ts`, `features/relatorioGeral/{catalogo,loaders}.ts` e `api/pdf/_shared/reportRegistry.js`.
- Testado na fazenda de testes: link gerado pelo painel, página pública e PDF (2 páginas) conferidos. Não testado: seção no Infográfico Mensal pela interface, período sem movimentações e muitos tanques/lançamentos (paginação).

## Identificar lote: importação XLSX (2026-10-20)

- `IdentificarLote.tsx` aceita `.xlsx`/`.xls` além de CSV/TXT. `utils/planilhaAnimaisParaTexto.ts` converte a 1ª aba (cabeçalho na 1ª linha) no texto `;` lido por `parseListaAnimais`, que segue como único parser e mantém a validação da RPC `identificar_animais_lote`. Valores crus: chip de 15 dígitos não vira notação científica, decimal com vírgula, data AAAA-MM-DD. Sem migration; teste em `planilhaAnimaisParaTexto.test.ts`. Não testado pela interface com arquivo real.

## PONTO DE CONTINUAÇÃO: módulo de indivíduos (atualizado em 2026-10-19)

**Para retomar exatamente daqui, leia nesta ordem:** (1) esta seção; (2) o plano de coexistência, `docs/PLANO_INDIVIDUOS_COEXISTENCIA.md` (cópia versionada; o original está fora do repo em `C:\Users\USER\.claude\plans\analise-o-m-dulo-de-sorted-octopus.md`); (3) o plano da Fase 4, `docs/PLANO_INDIVIDUOS_FASE4_SANIDADE_REPRODUCAO.md` (seção 10: ordem P1/P2/P3 e candidatas C1 a C4); (4) `docs/BACKLOG.md` (seções "Indivíduos: excluir parto..." e "Fase 4 no PWA e candidatas"); (5) as seções datadas de 2026-10-15 a 2026-10-19 deste arquivo e, no PWA (`C:\Users\USER\Documents\Caderneta-Digital-Gesta-Up\docs\HISTORICO.md`), as de 16 e 19/10.

**Princípios (não mudam):** o agregado (`lote_categorias.quant_atual`) é a verdade da contagem e é permanente; o indivíduo é um subconjunto e anexo opcional; nenhum evento exige informar animal (falta de animal vira sugestão na conciliação); o nível de qualificação do lote é calculado, não declarado; schema novo sempre retrocompatível com o PWA antigo; tudo novo fica restrito à fazenda de testes `d649c65e-16ab-4b77-a84b-df937aa41cc3` até o gestor liberar.

**Estado por fase do plano de coexistência**
- **Fase 0 (parar de criar divergência): concluída.** Feito: baixa e exclusão com evento agregado, pesagem sem mover animal, localização incerta, peso com origem, `salvar_individuo` transacional, identificadores normalizados no banco e **aparados no envio do PWA**, privilégios revogados, morte e Enfermaria enviando `individuo_id` (a Enfermaria já enviava desde 09/10), Maternidade (vínculos preservados no reenvio, gêmeos com erro tratado, 2ª mãe adotiva com status, gatilho que estorna a **cria** de parto excluído; a **mãe fica de fora** por decisão do gestor), lista de Indivíduos sempre filtrada por fazenda (não há seletor de admin: admin não acessa `/controller/*`, ver seção de 19/10).
- **Fase 1 (modelo de dados): concluída, com desvios registrados.** `categorias_animais` + aliases (não foi criada `individuos.lote_categoria_id`), `vw_lote_categoria_identificacao`, ponte `evento_individuos` (RPCs de vincular/desvincular), linha do tempo, SISBOV/PNIB e histórico de identificações. O modo manual de identificação (1.2) foi removido (nível calculado).
- **Fase 2 (entrada dos indivíduos): só no painel.** Feito: sessão "Identificar lote" (CSV/TXT, sem mexer na contagem, ajuste de inventário só com confirmação). Importação XLSX feita em 20/10 (ver abaixo). **Falta:** identificação no PWA com bastão RFID (C4, equipamento indefinido).
- **Fase 3 (operação com indivíduos): parcial.** Feito no painel: animais na movimentação (3.1), amostra de peso (3.2), animal da morte (3.3), confirmar localização em massa (3.4), conciliação e qualificação, dieta do lote na ficha. **Falta:** campo opcional "quais animais" nas cadernetas do PWA (Movimentação, Maternidade, Pesagem; exige RPC chamável pelo peão, as de vincular são só do painel), caderneta de brincagem (provisório para brinco) no PWA, cache de identificadores no PWA (criados offline, mortos e vendidos; parte já existe em `cadastroCache`/`acharConflitoComAnimalBaixado`, conferir o que falta) e busca por ID provisório, ações em massa no painel (mover, recategorizar, baixar, sempre gerando o evento agregado), `peso_atual_kg` derivado de última pesagem + GMD.
- **Fase 4 (reprodução e sanidade): P1 Morte, P2 Sanidade, P3 Reprodução, C1 calendário sanitário e C3 tratamento na sessão de curral feitos** (restritos à fazenda de testes). **KPIs:** taxa de prenhez por estação, intervalo entre partos, dias em aberto, GMD por animal e P205 já existem. **Lista de registros de Sanidade e Reprodução no PWA feita em 19/10** (edição não será criada: o PWA não edita registro salvo). C2 protocolo de IATF: primeira entrega completa em 20/10 e liberada só para a fazenda de testes (protocolos, lotes no painel e no PWA, tarefas, IA, alertas, relatório de taxa de prenhez e diagnóstico em grupo por lote de protocolo; seção "Protocolo de IATF" abaixo). O que ficou faltando (aparelho físico, RLS do peão, edição de lote, liberação para outras fazendas etc.) está no `docs/BACKLOG.md`, seção "IATF: o que ficou faltando depois da primeira entrega". **Falta:** C4 RFID (equipamento indefinido), exportação SISBOV/PNIB e GTA por animal (falta o formato), baixa de estoque de medicamento, custo por animal, indicação de carência nas listas de Lotes e Indivíduos, lista do Manejo de Curral no PWA (mesma lacuna da Sanidade, resolução pequena), itens menores do BACKLOG (RLS deixa o peão escrever pela API em reprodução e sanidade; resumo por estação ignora partos posteriores à cobertura; calendário sem regra por idade, aplicação individual não encerra a campanha, PWA não mostra a campanha pendente).

**Ordem sugerida do que falta (feita em 19/10):** faixa 0 concluída (publicar PWA, gatilho de estorno); faixa 1: item 4 (lista, feito) e 5 (KPIs, feito); **próximo é a faixa 2:** (6) caderneta de brincagem no PWA, começando por investigar como o peão pode gravar a troca de identificador (RLS ou RPC) e trazer o desenho antes de implementar, (7) "quais animais" nas cadernetas do PWA, (8) cache de identificadores e busca por provisório; faixa 3 (mexem em agregado ou estoque, mais cuidado): ações em massa, baixa de estoque, custo por animal, `peso_atual_kg` derivado; faixa 4 (dependem de decisão ou insumo externo): C2, C4, exportação SISBOV/PNIB/GTA.

**Decisões do gestor ainda abertas:** (a) vacas da Chibiu: ajustar o agregado, o cadastro ou manter como incerto (34 vacas seguem incertas); (b) causa dos excessos de 1 a 2 bezerros na Chibata (LOTE 11) e no Olho D'Água (Lote 5); (c) quando liberar o módulo e o menu "Controle Individual" para outras fazendas (hoje `menuControleIndividualVisivel`, `CADERNETAS_EM_TESTE` e a seção Calendário em `ManejoSanitario.tsx` restringem à fazenda de testes; as rotas ainda abrem por URL direta); (d) imagens definitivas das cadernetas Sanidade e Reprodução (`sanidade.png` e `reproducao.png` são cópias provisórias).

**Estado dos repositórios em 2026-10-19 (conferir de novo com `git log`):** Painel: `master` e produção estão em `b383f1d` (menu restrito, merge de 16/10); `origin/staging` está 9 commits à frente (conserto de vínculos de maternidade, estorno da cria, P205, lista de Indivíduos sempre filtrada por fazenda, docs); as **migrations estão todas aplicadas no banco** (o banco é único, então já valem para produção; a última é `20261019110000`). PWA: `master` em `8755835`; `staging-repo/main` (app staging) em `5669307` (gêmeos e aparo de identificadores); `origin/staging` em `da7a06f` (lista de Sanidade e Reprodução, **ainda não publicada no `staging-repo`**; publicar só com ok do usuário, `git push staging-repo staging:main`). O PWA tem arquivos não rastreados que não são do trabalho (`.claude/`, `.mcp.json`, `.claudeignore`, `docs/GUIA_CLAUDE_CODE.md`, `frontend/pnpm-*`): não commitar sem pedido.

**Backups e reversões criados (tabelas `backup.*`):** `individuos_incerteza_20261016` (111 animais marcados como incertos), `individuos_localizacao_20261016`, `individuos_exclusao_marcon_20261019` (56 excluídos na Marcon), `maternidade_vinculos_chibiu_20261019` e `maternidade_vinculos_99af_20261019` (vínculos restaurados), `regressao_lote_categorias_20261016`, `regressao_suplementacao_20261016` e `regressao_eventos_20261016` (foto do agregado; antes de promover, comparar `quant_atual`, `peso_vivo_atual_kg_cab` e consumos por categoria: diferenças só onde houve evento real, o cron diário de peso altera `peso_vivo` e é esperado).

**Regras de trabalho que continuam valendo** (detalhe em `CLAUDE.md`, `AGENTS.md` e na memória do projeto): testar e mutar dados só na fazenda de testes e, em fazenda real, só com autorização escopada (contagem confirmada, backup, bloco que aborta se a contagem divergir, soft-delete); migrations com arquivo + rollback em `supabase/rollbacks/`, mostrar o SQL, esperar o ok, `supabase db push --dry-run` antes, uma por vez, nunca `apply_migration`; commits com `-m` direto terminando em "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"; publicar no `staging-repo` e em produção (master) só com pedido do usuário; nunca ler `.env.teste` nem repetir segredos; painel só na porta 5173 (conferir `netstat` e encerrar o servidor antes de terminar: o `TaskStop` não mata o processo filho do Vite).

**Armadilhas técnicas:** os arquivos do painel e do PWA têm quebra de linha CRLF (preservar na edição; usar scripts Python em arquivo no scratchpad, nunca `\n` dentro de heredoc ou aspas do Bash); `execute_sql` com vários comandos só mostra o resultado do último; `calculate_quant_atual(p_lote_id, p_categoria)` é a referência para recalcular `quant_atual` (não alterar a lógica); a limpeza de dados de teste é sempre por soft-delete, com os ids no HISTORICO; no PWA o `getAll` do IndexedDB vem ordenado por id (achar o registro pelo conteúdo); `eventos_reprodutivos.local_id` precisa de índice único completo (parcial dá 42P10 no upsert).

## Protocolo de IATF (Fase 4 C2), primeira entrega (2026-10-20)

Protocolos editáveis por fazenda, lote de protocolo com tarefas de data calculada e registro da IA, no painel e no PWA. Restrito à fazenda de testes `d649c65e-16ab-4b77-a84b-df937aa41cc3` (menu `menuControleIndividualVisivel`, `CADERNETAS_EM_TESTE` nos dois apps).

**Banco** (4 migrations, cada uma com rollback em `supabase/rollbacks/`, todas aplicadas): `20261020100000_protocolos_iatf` (`protocolos_iatf`, `protocolos_iatf_passos` com dia relativo ao D0 de 0 a 30, no máximo um passo `Inseminacao` por protocolo, `copiar_modelo_protocolo_iatf` = modelo clássico D0/D8/D10 editável); `20261020110000_lotes_protocolo_iatf` (`lotes_protocolo_iatf`, `_femeas` Ativa/Descartada com gatilho de sexo/vida/fazenda, `_tarefas` = cópia do passo com `data_prevista = D0 + dia`, `local_id` único completo no lote e na tarefa, RPCs `criar_lote_protocolo_iatf` e `marcar_tarefa_protocolo_iatf`, lote conclui sozinho sem tarefa pendente); `20261020120000_fix_gatilho_filho_lotes_protocolo_iatf` (o gatilho compartilhado lia `NEW.individuo_id` na tabela de tarefas e dava 42703: expressão única sem curto-circuito no plpgsql, trocada por IFs aninhados); `20261020130000_eventos_reprodutivos_protocolo_lote` (coluna nula `protocolo_lote_id`, gatilho separado do elo, RPC `registrar_ia_lote_protocolo` que grava uma Inseminação por fêmea ativa com chave `p_local_id:individuo_id`); `20261020140000_registrar_ia_recusa_tarefa_ja_feita` (recusa a IA de passo já feito, exceto o reenvio com o mesmo `local_id`, para painel e PWA não duplicarem). RPCs são `SECURITY INVOKER` (a RLS vale para quem chama). `trg_eventos_reprodutivos_validar` não foi alterada.

**Painel:** página `ProtocolosIatf.tsx` (`/controller/protocolos-iatf`, menu Controle Individual): aba Protocolos (criar/editar/inativar/excluir, modelo clássico) e aba Lotes de protocolo (criar com fêmeas de um lote da fazenda, tarefas com situação, marcar passo, Registrar IA, descartar fêmea, cancelar). Hook `useProtocolosIatf.ts`; regras de data e validação em `utils/protocoloIatf.ts` (+ teste).

**PWA:** caderneta `protocolo-iatf` (`ProtocoloIatfPage`, lista, store IndexedDB v38, cache `getLotesProtocoloIatfCached`, sync por RPC com o id do registro como `local_id`). Detalhes no HISTORICO do PWA.

**Testes (só fazenda de testes, em transação com rollback):** criação do lote (datas D0/D8/D10 corretas), reenvio por `local_id`, macho barrado, lista vazia barrada, data futura barrada, conclusão e reabertura do lote, IA gravada com `protocolo_lote_id`, fêmea descartada fora, reenvio sem duplicar, IA de passo já feito barrada. Não testado: fêmea morta (a fazenda de testes não tem), gatilho de fazenda cruzada (exigiria outra fazenda).

**Relatório de taxa de prenhez (20/10/2026, só leitura, sem migration):** aba "Taxa de prenhez" em `/controller/protocolos-iatf` (`RelatorioIatf.tsx`, hook `useRelatorioIatf`, regra em `utils/relatorioIatf.ts` + teste). Cada Inseminação com `protocolo_lote_id` é uma tentativa; o resultado é o diagnóstico mais recente da fêmea feito a partir da data da IA e ANTES da próxima cobertura/IA dela (diagnóstico de outro ciclo não é atribuído). Agrupa por protocolo, lote de protocolo, touro, partida do sêmen ou inseminador; mostra inseminadas, prenhes, vazias, inconclusivas, sem diagnóstico, taxa sobre inseminadas e sobre diagnosticadas (inconclusivo e sem diagnóstico ficam fora da segunda) e linha Total; exporta Excel. Testado em vitest (7 casos) e pela interface do painel em 20/10 (ver abaixo).

**Alertas dos passos de protocolo (20/10/2026):** migration `20261020150000_notificar_protocolos_iatf` (rollback em `supabase/rollbacks/`): `notificar_protocolos_iatf(p_fazenda_id)` gera, por fazenda, uma notificação-resumo por usuário ativo para "IATF: passos de protocolo atrasados" (data prevista < hoje) e "IATF: passos de protocolo para hoje", só de lotes de protocolo "Em andamento"; atualiza a não lida existente em vez de duplicar e apaga (soft-delete) as não lidas de dias anteriores que deixaram de valer (`dados_jsonb.gerada_em`). Cron `notificar_protocolos_iatf` todo dia às 07:30. Testado em transação com rollback na fazenda de testes: 4 usuários x 2 tipos = 8 notificações, 2ª execução sem duplicar, limpeza ao fazer os passos.

**Teste pela interface do painel (20/10, usuário Controller, fazenda de testes, localhost:5173):** modelo clássico criado pelo botão (testa `copiar_modelo_protocolo_iatf`), lote criado com as 7 fêmeas de "Teste 2" e D0 em 12/10 (tarefas D0 atrasada, D8 hoje, D10 prevista), D0 marcado (banco: `feita_em` e `feita_por`), IA registrada pelo painel (7 Inseminações, touro e partida corretos, `origem = painel`), diagnóstico em grupo (4 prenhas, 3 vazias) e a aba Taxa de prenhez mostrou 7/4/3, 57,1% por protocolo e por touro, igual ao banco; sem erros de console. Dados de teste apagados por soft-delete (protocolo, lote, 7 IAs e 7 diagnósticos).

**Rodada de testes completa (20/10/2026, painel `localhost:5173`, PWA em preview offline, banco, fazenda de testes):** relatório por protocolo, lote, touro, partida do sêmen e inseminador (números iguais ao SQL) e Excel (`.xlsx` válido, nome com a fazenda); validação do formulário de protocolo (nome, descrição, dia 0 a 30), criar, editar, inativar (some da criação de lote) e excluir protocolo; D8 marcar/desfazer, descartar/reativar fêmea, IA com fêmea descartada fora (2 IAs), lote conclui ao marcar tudo e reabre ao desfazer, lote cancelado (sem ações; a RPC recusa marcar); fêmea morta barrada na criação do lote; notificações reais no painel (texto, "Ver protocolos" abre a página) e removidas depois; PWA: conflito (peão offline registra a IA depois do gestor) recusado pelo banco, D8 do mesmo aparelho sincroniza, IAs não duplicam.

**Defeitos achados e corrigidos nesta rodada:** (1) migration `20261020160000_registrar_ia_nao_duplica_por_lote`: desfazer a IA e registrar de novo pelo painel (sem `local_id`) duplicava as Inseminações (2 fêmeas viravam 4); agora a fêmea que já tem Inseminação ativa no lote não recebe outra; (2) painel: o botão Desfazer sumia com o lote Concluído, impedindo reabri-lo; (3) PWA: o erro "A inseminação deste lote já foi registrada..." aparecia como "Valor inválido (peso, cabeças, datas)"; `translateSyncError` agora mostra as mensagens do IATF (código 23514); (4) PWA: `getStatusReprodutivoCached`, `getEstacoesMontaCached` e `getCarenciasCached` só guardavam em memória, então o app recarregado offline perdia status, estações e carências; agora persistem logo ao buscar (conferido: a Reprodução recarregada offline mostra o status "Parida" da fêmea).

**Diagnóstico em grupo ligado ao lote de protocolo (20/10/2026):** em `/controller/reproducao/diagnostico-em-grupo` o seletor "Fêmeas de" escolhe entre "Lote da fazenda" (como antes) e "Lote de protocolo de IATF" (só as fêmeas ativas do lote, com o status derivado, hook `useFemeasDoLoteProtocolo`). No segundo modo os diagnósticos gravam `protocolo_lote_id` (o gatilho `trg_eventos_reprodutivos_protocolo` recusa fêmea fora do lote) e a referência à IA (`evento_cobertura_id`) quando a fêmea consta como coberta; sem migration. O filtro "só as cobertas" continua valendo (fêmea que já pariu depois da IA aparece como Parida e fica escondida até desmarcar). Testado pela interface (3 diagnósticos com elo, relatório de taxa inalterado, modo antigo sem elo) e no banco (fêmea fora do lote barrada); dados de teste apagados.

**Liberação restrita à fazenda de testes (20/10/2026):** todo o IATF só funciona na fazenda `d649c65e-16ab-4b77-a84b-df937aa41cc3`. Painel: `protocolo-iatf` está em `CADERNETAS_EM_TESTE` (`utils/cadernetas.ts`); o menu Controle Individual já era restrito (`menuControleIndividualVisivel`), a página `ProtocolosIatf.tsx` agora confere `cadernetaVisivelNaFazenda('protocolo-iatf', fazendaId)` e mostra "em teste" nas outras fazendas (a rota ainda abre por URL direta), e o seletor "Fêmeas de" do Diagnóstico em Grupo (e a consulta dos lotes de protocolo) só existe na fazenda de testes; nas outras, a tela fica como antes. PWA: caderneta, novo lote e as duas listas (`ProtocoloIatfListaPage`, `ProtocoloIatfLoteListaPage`, que antes abriam por URL direta) conferem a mesma regra. Testes: vitest nos dois apps (liberada na fazenda de testes; bloqueada em outra fazenda, nula e indefinida) e, no preview do PWA, com um id de fazenda inexistente configurado só no aparelho (nenhum dado lido ou gravado): as 4 páginas mostram "Esta caderneta ainda está em teste e não está liberada para esta fazenda"; configuração restaurada depois. O bloqueio das páginas do painel em outra fazenda não foi exercitado pela interface (o usuário de teste só acessa a fazenda de testes); só pelo mesmo helper testado em vitest.

**O que ficou faltando do IATF** está em `docs/BACKLOG.md` (seção "IATF: o que ficou faltando depois da primeira entrega"): teste em aparelho físico, gatilho de fazenda cruzada, RLS de escrita do peão, liberação para outras fazendas, edição/exclusão de lote, relatório sem filtros, alertas só no painel, cache offline de outras consultas, RFID (C4, pendente).

**Não testado (por limite):** gatilho de fazenda cruzada (exigiria outra fazenda, proibido) e aparelho físico.

**Fica de fora (próximos passos):** ~~relatório de taxa de prenhez~~, ~~alertas dos passos~~, ~~diagnóstico ligado ao lote~~ e ~~criar o lote pelo PWA~~ (feitos; ver o HISTORICO do PWA); imagem definitiva da caderneta (`protocolo-iatf.png` é cópia). Aviso do `get_advisors`: `copiar_modelo_protocolo_iatf` é SECURITY DEFINER chamável por `authenticated` (mesmo padrão das outras RPCs, confere o acesso por dentro).

## Relatório de Consumo: KPI Consumo MN (kg/cab/dia) (2026-10-19)

Novo card "Consumo MN (kg/cab/dia)" nos KPIs do relatório de consumo, na página pública (`RelatorioConsumoPublico.tsx`, grid de 8 colunas) e no PDF (`api/pdf/consumo.js`, que também alimenta o Infográfico Mensal). É a média de `trato_kg_cab_dia`, que já é matéria natural por cabeça (confinamento: `kg_mn_cab_dia`; pasto: kg de cocho / dias / animais). O %PV continua sobre a MS. Sem mudança de RPC nem migration.

## Formulações: contagem de cabeças por dieta ativa (2026-10-19)

- Ao abrir uma formulação (não premix) em `Formulacoes.tsx`, o formulário mostra "Cabeças nesta dieta: N em X lotes" com a quebra por lote e categorias. Só leitura, sem migration.
- Dieta ativa = `planos_nutricionais` com `ativo = true` e `data_fim IS NULL`. Plano da categoria tem precedência sobre o plano do lote; bezerro(a) ao pé não herda o plano do lote. Formulação creep conta as categorias ao pé com `lote_categorias.formulacao_id` igual a ela. `lotes.formulacao_id` não é usado (desnormalizado). Só lotes ativos e categorias ativas sem `data_fim`.
- Regra isolada em `utils/cabecasPorDieta.ts` (teste em `cabecasPorDieta.test.ts`). Fora do escopo: badge de cabeças nos cards da listagem.

## Relatório de Abastecimento: estoque atual dos tanques (2026-10-19)

- Migration `20261019160000_abastecimento_saldo_tanques` (rollback em `supabase/rollbacks/`): `get_dados_relatorio_abastecimento` passa a devolver `dados.tanques` (nome, tipo, saldo, capacidade, limite, custo médio, valor em estoque, flags `negativo`/`em_alerta`) e `dados.gerado_em`. É posição atual (snapshot), independe do período e dos filtros. Saldo no fim do período foi descartado: o custo médio ponderado não é invertível. A variante `_fazenda` (Infográfico Mensal) herda o campo.
- Painel "Estoque atual de combustível" em `RelatorioPublico.tsx`; página "Estoque atual" no PDF (`api/pdf/abastecimento.js`, só quando há tanques; ajusta `totalPages`); loader do Infográfico (`loaders.ts`) repassa os tanques.

## Fix: permission denied for function _peso_meta_maximo (2026-10-19)

- Sintoma: no modal "Gestão de Planos do Lote", "Adicionar à Fila" com peso meta falhava com `permission denied for function _peso_meta_maximo`. Causa: a migration `20261019150000` criou a função e a usou nos CHECKs `chk_planos_peso_meta_maximo` e `chk_pcp_peso_meta_maximo` sem `GRANT EXECUTE`; o CHECK roda com o papel de quem grava (`authenticated`).
- Correção: migration `20261019170000_grant_peso_meta_maximo` (rollback em `supabase/rollbacks/`) com `GRANT EXECUTE ... TO authenticated, service_role`. `anon` fica de fora de propósito. Verificado com `has_function_privilege`.
- Armadilha: o primeiro push usou `20261019160000`, que já era de `abastecimento_saldo_tanques`; o `db push` falhou com chave duplicada em `schema_migrations` (nada aplicado). Conferir os timestamps existentes antes de nomear uma migration.

## Planos nutricionais: limite de meta, data da meta e meta dos indivíduos (2026-10-19)

Migration `20261019150000_meta_limite_data_meta_individuos.sql` (rollback em `supabase/rollbacks/`).

**Limite de peso meta**: `_peso_meta_maximo()` = 1.500 kg (maior valor real em produção: 1.000 kg, nenhum acima de 1.500). CHECK em `planos_nutricionais` e `plano_categoria_personalizacao`. Mensagens nas RPCs: meta acima do máximo; meta que não é maior que o peso atual da categoria, validada só quando a meta muda (categoria que já passou da meta, pois o peso evolui sem teto, ainda pode ter o período editado); na atribuição em massa a meta efetiva (ajuste da categoria ou do plano) de cada categoria é conferida contra o peso atual. Mesmos limites no formulário do plano, no card de categoria (erro inline) e no passo 2 da atribuição em massa (`PESO_META_MAXIMO_KG` em `utils/planoMassa.ts`).

**Data da meta**: o formulário do lote calcula `data_meta_projetada = hoje + CEIL((meta - peso atual) / GMD)` e `dias_restantes_meta` (campos só de leitura na tela; o cron de 2026-08-07 que recalculava foi perdido na reescrita do cron em 2026-08-25). Agora o trigger `trg_lote_categorias_recalcular_data_meta` (BEFORE UPDATE, só quando meta, GMD ou peso atual mudam) aplica essa fórmula no banco, com data de Cuiabá, travando em hoje/0 dias se o peso já passou da meta; sem GMD (ou sem meta/peso) os dois campos ficam nulos, como decidido. Qualquer erro nele é engolido para nunca derrubar o cron diário. Sem backfill.

**Meta dos indivíduos**: nenhum dos 496 indivíduos (10 fazendas) tinha `peso_meta_kg`. O trigger `propagar_estrategia_nutricional_para_individuos` e o legado `atualizar_estrategia_nutricional_individuo` só enxergam planos por categoria; o segundo, com plano por lote, zerava tudo. Agora `trg_lote_categorias_propagar_meta_individuos` copia `lote_categorias.peso_vivo_meta_kg_cab` para `individuos.peso_meta_kg` dos animais da categoria no lote (só a meta; GMD e estratégia não), animal a animal e com falha isolada, porque os triggers BEFORE UPDATE de `individuos` (ex.: validação de sexo x categoria) podem rejeitar registro antigo e isso não pode bloquear a edição do plano. O trigger legado ganhou fallback para a meta da categoria.

Teste em 2026-10-19, só na fazenda de testes: limite (editar plano com 700720 kg, meta de categoria abaixo do peso, INSERT com 2000 kg barrado pela constraint, atribuição em massa com 2000 kg e com meta abaixo do peso); data da meta ("Teste Planilha" c9e04ff1-ba53-48df-831a-eb046b166709, peso 500, GMD 1,1, meta 650 para 600 deu 2027-01-18 e 91 dias, igual ao esperado; meta abaixo do peso travou em hoje e 0 dias; GMD nulo zerou os dois campos; restaurado a GMD 1,100 e meta 600); indivíduos ("Lote A" f1000000-0000-0000-0000-000000000001, 1 boi gordo identificado: iniciar plano 620 levou 620 ao animal sem tocar GMD/estratégia dele, editar para 640 levou 640 e recalculou a data da meta, encerrar zerou meta, GMD e datas; disparar `UPDATE OF categoria` no animal com plano ativo manteve a meta pelo fallback; o Lote A terminou sem plano, como estava). Card pela interface mostra os erros de meta sem gravar. Integridade dos lotes de teste sem inconsistências. Zootécnico mostra a data da meta nova do "Teste Planilha" (18/01/2027); Teste 2 e 3 continuam com a data antiga até o peso mudar.

## Planos nutricionais: edição com histórico e correções do alinhamento (2026-10-19)

Regra definida: os relatórios mostram o que é vigente; toda edição guarda o estado anterior à parte; edição de período/meta não aparece nos relatórios. Migration `20261019140000_historico_edicao_plano.sql` (rollback em `supabase/rollbacks/`, que mantém a tabela de histórico).

Tabela `planos_nutricionais_edicoes` (append-only, RLS só de leitura por fazenda, gravada pelas RPCs): `antes`/`depois` em jsonb, `lote_categoria_id` nulo = campos do plano, `origem` (`edicao_plano_vigente`, `edicao_plano_fila`, `edicao_categoria`), `usuario_id`. Tabela própria porque `planos_nutricionais_snapshots` tem CHECK só para `entrada`/`saida` e o Histórico de Planos trata qualquer outro tipo como saída. RPC `editar_plano_lote` (modal do lote): plano da fila muda nome, formulação, período e meta; plano vigente muda só período e meta e o novo valor vai para as categorias cuja personalização ainda era igual à do plano (as personalizadas à mão ficam). `_aplicar_personalizacao_categoria` ganhou `p_registrar_historico` (true no card e na edição do plano, false no ato de iniciar/migrar); atualiza o snapshot de entrada com o valor vigente, e o valor antigo fica no histórico. Mudar meta ou período zera `data_notificacao_meta`/`data_notificacao_periodo` da categoria. Correções do trabalho anterior: `_ativar_plano_nas_categorias` (migrar e avanço da fila) agora zera as flags de notificação como o iniciar; o progresso do snapshot de saída usa a meta da categoria (`_encerrar_plano_lote`).

Teste em 2026-10-19, só na fazenda de testes: edição do vigente em "Teste Planilha" (c9e04ff1-ba53-48df-831a-eb046b166709, categoria sem personalização: período, meta, `lote_categorias` e snapshot de entrada foram para 90d/650, progresso 76,92%) e de um plano da fila (nome e meta); herança parcial em "Teste 2" (b6896e75-1225-431f-8586-6e89b0e61f50, plano 90/700 para 120/800: boi gordo, personalizado em período e meta, ficou intacto e sem histórico; garrote herdou só o período); card pela interface em "Teste 3" (857699be-bce4-4116-8836-39a809d00f32: período 100 para 110 e meta 720 para 740, flag de período de 2026-09-04 zerada, entrada 740 com progresso 83,81%, histórico com o estado anterior); formulário de edição do vigente pela interface em "Teste Retroativo Fix" (a3152c50-9a01-4d0f-ba52-2e3e476bdef6; a automação concatenou o valor e a meta ficou 700720 por um momento, o que também provou a propagação; corrigido para 720 pela RPC, com as duas edições no histórico); migrar em massa no Teste 3 com flags marcadas à mão: flags zeradas e progresso de saída 83,81% contra a meta da categoria (740) em vez de 88,6% contra a do plano. Integridade dos lotes de teste sem inconsistências, grants da tabela de histórico só SELECT, zootécnico mostra as metas vigentes, Histórico de Planos e PDF gerados sem erros.

## Planos nutricionais: fluxo individual alinhado à atribuição em massa (2026-10-19)

Migration `20261019130000_alinhar_fluxo_individual_plano.sql` (rollback em `supabase/rollbacks/`). Motivo: o A/B entre o modal do lote e a RPC em massa mostrou três divergências (peso inicial nulo, meta da categoria só na personalização, snapshot de entrada com a meta do plano) e um defeito antigo em `migrar_plano_lote` (encerrar iniciava o próximo da fila e migrar o revertia na mão, deixando personalização ativa e snapshot de entrada órfãos, e o destino ficava sem snapshot nem peso inicial).

Agora: `_ativar_plano_nas_categorias` (formulação do lote, GMD com desconto de enfermaria, meta, consumo, personalização com `peso_inicio_kg_cab`, snapshot de entrada) e `_encerrar_plano_lote(lote, destino)` (encerra o vigente e ativa o destino ou o próximo da fila) sustentam `encerrar_plano_lote` e `migrar_plano_lote`, que mantêm assinatura e `guard_w_lote`; migrar para o plano que já é o vigente passa a dar erro. `_aplicar_personalizacao_categoria` grava período e meta na personalização, em `lote_categorias.peso_vivo_meta_kg_cab` e no snapshot de entrada; é usada pela nova RPC `salvar_personalizacao_categoria` (card "Personalização" do modal do lote, `PlanoNutricionalLoteModal.tsx`) e por `atribuir_plano_em_massa`. Helpers `_*` ficam sem EXECUTE para `authenticated`.

Teste em 2026-10-19, só na fazenda de testes: (1) cenário de fila em "Teste NL Claude" (006f9d76-0db0-48fd-be92-c37a8b19b8ae): plano "Fila V teste" de ordem maior ficou intacto na fila e o destino "W migracao fila" nasceu com personalização 75d/770, peso inicial, snapshot de entrada e meta 770; a personalização órfã do plano "Fila Y teste" (do defeito antigo) foi desativada à mão (o snapshot de entrada órfão dele permanece). (2) A/B refeito: "Teste 3" (857699be-bce4-4116-8836-39a809d00f32) pelo modal e "Teste 2" (b6896e75-1225-431f-8586-6e89b0e61f50) pela RPC ficaram iguais em plano, categorias, personalização (inclusive peso inicial), meta e snapshot. (3) "Teste Retroativo Fix" (a3152c50-9a01-4d0f-ba52-2e3e476bdef6): encerrar com próximo na fila avançou corretamente (plano "Fila Q teste"), encerrar sem próximo limpou categorias e `lotes.formulacao_id`, e o lote voltou a ter plano vigente ("Terminação Boi" 90d/700 pela RPC). (4) Relatórios conferidos: zootécnico (metas 720/350, 770, 600, 700 nos lotes de teste), Histórico de Planos e exportação em PDF (lê a meta do snapshot de entrada), `get_dados_relatorio_consumo_fazenda` (carregou na página do zootécnico) e a lógica de `getPlanoNutricionalAtivoByLoteId` do PWA simulada em SQL (nenhuma categoria ficou sem peso inicial). Integridade dos lotes de teste: sem plano vigente duplicado, `lotes.formulacao_id` divergente, personalização ativa fora do plano vigente, peso inicial nulo, ou meta divergente entre `lote_categorias`, personalização e snapshot. O cron `update_dados_lotes` não foi executado (age sobre todas as fazendas); sua leitura de `peso_inicio_kg_cab` só melhora com os valores agora preenchidos.

## Planos nutricionais: atribuir dieta em massa a vários lotes (2026-10-19)

Na tela de Lotes, o botão **Atribuir dieta** liga a seleção de lotes (checkbox no card, "Selecionar visíveis") e abre o modal `PlanoNutricionalMassaModal` em 3 passos: dieta e padrões (formulação, nome, duração, peso meta), ajuste por lote (modo, nome, período, peso meta, retroativo e, por categoria, período e peso meta) e revisão com resultado por lote. Lógica pura e validação em `utils/planoMassa.ts` (testes em `planoMassa.test.ts`).

Banco: RPC `atribuir_plano_em_massa(p_fazenda_id, p_formulacao_id, p_itens jsonb)` (migration `20261019120000`, rollback em `supabase/rollbacks/`). Por lote, num sub-bloco com EXCEPTION (uma falha não desfaz as outras): cria o plano na fila, inicia (`iniciar_plano_lote`) ou migra (`migrar_plano_lote`) conforme o modo, e só depois grava a personalização por categoria, porque `iniciar_plano_lote` sobrescreve a PCP com os valores do plano. O peso meta da categoria vai para três lugares: `plano_categoria_personalizacao` (cron, notificações, PWA), `lote_categorias.peso_vivo_meta_kg_cab` (relatório zootécnico) e o snapshot de entrada (PDF de planos). `peso_inicio_kg_cab` nulo é preenchido com o peso atual da categoria. Modo "só enfileirar" não aceita personalização por categoria (ela nasce ao iniciar o plano). Bezerro/bezerra ao pé ficam fora (creep segue no modal do lote).

Teste ponta a ponta em 2026-10-19, só na fazenda de testes `d649c65e-…`, pelo painel (devtools): 4 lotes de uma vez com a formulação Terminação Boi, 90 dias, meta 700. "Teste 2" (b6896e75-1225-431f-8586-6e89b0e61f50) e "Teste Retroativo Fix" (a3152c50-9a01-4d0f-ba52-2e3e476bdef6) migraram (plano vigente anterior encerrado em 2026-10-19), "Teste NL Claude" (006f9d76-0db0-48fd-be92-c37a8b19b8ae) iniciou e "Teste Planilha" (c9e04ff1-ba53-48df-831a-eb046b166709) só enfileirou. Personalização por categoria em "Teste 2": boi gordo 100 dias e meta 720, garrote meta 350; PCP, `lote_categorias` e snapshot de entrada ficaram com o mesmo peso meta, `peso_inicio_kg_cab` preenchido, creep preservado. Falhas da RPC (migrar sem vigente, lote inexistente, personalização ao enfileirar) retornam por lote, sem efeito colateral. Não testado: lote em enfermaria (nenhum ativo na fazenda de testes) e lote de outra fazenda (rejeitado pela RPC, não exercitado para não tocar outra fazenda).

Complemento do teste (2026-10-19, fazenda de testes): (1) enfermaria: "Teste Planilha" (c9e04ff1-ba53-48df-831a-eb046b166709) foi marcado como enfermaria por UPDATE escopado, recebeu a dieta pela RPC e o GMD saiu 0,5500 (50% de 1,100); depois voltou a `destino='corte'` e o GMD foi restaurado para 1,100 (trocar `lotes.destino` não reprocessa o GMD das categorias). Ficou um plano antigo na fila do lote, ordem 0, além do vigente. (2) A/B: o fluxo individual (modal do lote: adicionar plano, Migrar, card Categorias) foi repetido em "Teste 3" (857699be-bce4-4116-8836-39a809d00f32) e comparado com "Teste 2" (RPC). Plano, `lotes.formulacao_id`, GMD, estratégia, consumo, snapshots de saída/entrada e tipos/motivos são idênticos. Divergem três pontos, todos a favor da RPC: `peso_inicio_kg_cab` (individual deixa nulo), `lote_categorias.peso_vivo_meta_kg_cab` (individual mantém a meta do plano, 700, enquanto a personalização diz 720/350) e o peso meta/progresso no snapshot de entrada. O Teste 3 ficou com essas divergências de propósito, como evidência. A verificação de integridade dos lotes de teste não achou outras inconsistências; as achadas na fazenda são de seeds antigos (L1 Confinamento, L8 Ajuste Manual).

## PWA: lista de registros de Sanidade e Reprodução (2026-10-19)

Item "lista/edição dos registros de Sanidade e Reprodução no PWA" do BACKLOG: a **lista** foi feita (detalhe no HISTORICO do PWA: páginas de lista, botão Registros, configs de exibição e fêmeas de cada evento de reprodução); a **edição não foi criada** de propósito, porque nenhuma caderneta do PWA edita registro salvo e o sync só cria. Correção de registro já enviado continua pelo painel. Só aparece nas fazendas com as cadernetas liberadas (fazenda de testes).

## Maternidade: excluir um parto estorna a cria (2026-10-19)

Migration `20261019110000_maternidade_estorno_individuos_parto_excluido` (rollback em `supabase/rollbacks/`). Gatilho AFTER UPDATE `trg_maternidade_estorna_cria` em `registros_maternidade`: quando o parto é excluído (`deleted_at` passa de NULL para preenchido), a **cria** (`individuo_id_cria`) recebe `deleted_at` (soft-delete, reversível) se for origem `Nascimento`, estiver Vivo, tiver sido criada até 2 minutos do registro do parto e **não tiver nenhum outro uso**: nenhum evento ativo (sanidade, reprodução como fêmea ou touro, enfermaria, curral, morte, movimentação, pesagem), nenhuma ponte `evento_individuos`, pendência de designação ou histórico de lote, nenhum outro parto ativo que a cite e nenhum filho ativo. Mesmo padrão do estorno da morte. **Decisão do gestor: a mãe nunca é estornada pelo gatilho** (pode ser uma vaca real cadastrada pela primeira vez dentro de um parto lançado errado; a exclusão da mãe segue manual, como foi feito com a Marcon). Não altera o agregado (`quant_atual` não depende de `individuos`; o recálculo do `quant_atual` ao excluir parto não foi mexido). Não corrige partos excluídos no passado e reativar o parto não restaura o animal. Testado na fazenda de testes, em bloco desfeito por exceção: cria sem uso foi estornada; cria com filho ativo, cria com 1 hora de diferença e cria de origem `Cadastro Manual` foram mantidas; a mãe do parto ficou ativa.

## KPIs individuais: P205 na ficha do animal (2026-10-19)

Conferência do item "KPIs individuais (P205, GMD por animal, taxa de prenhez)": **já existiam** a taxa de prenhez por estação (`EstacoesMonta.tsx`, coluna Taxa de prenhez), o intervalo médio entre partos e os dias em aberto (`ReproducaoFazenda.tsx`) e o GMD por animal (aba Pesagens da ficha: GMD entre pesagens e GMD médio). Faltava só o **P205**. Não foi criada uma "taxa de prenhez geral da fazenda": uma taxa instantânea (prenhas sobre prenhas mais vazias hoje) enganaria ao lado da taxa por estação, que é a medida correta.

- **P205** (só front, sem migration): `pesoAjustado205` em `utils/individuoPesagens.ts` (4 testes novos): peso ao nascer + (peso da pesagem - peso ao nascer) / idade na pesagem × 205, usando a pesagem entre 120 e 300 dias de vida mais perto dos 205 dias; exige data de nascimento, peso ao nascer e peso da pesagem maior que o do nascimento. É a fórmula simples, **sem fatores de correção por sexo e idade da mãe** (não há tabela de referência cadastrada; o texto na tela avisa). Aparece na aba Pesagens da ficha (`IndividuoDetalhe.tsx`), com o GMD do nascimento à pesagem e qual pesagem foi usada.
- **Sem dados para mostrar hoje:** leitura de 19/10/2026: 10 pesagens individuais no banco, 2 animais com 2 pesagens, 0 animais com pesagem entre 150 e 260 dias de vida, 0 eventos reprodutivos. O P205 só aparece quando houver pesagem individual de bezerro na idade certa (hoje as pesagens do PWA são, em geral, de animais adultos e por lote).
- Typecheck, lint (159 avisos, o mesmo de antes) e 459 testes ok. **Não verificado na tela:** o navegador do teste estava sem login no painel (o `.env.teste` não é lido por mim) e só havia o teste unitário; o animal de teste usado para a tentativa (brinco 33) voltou a data de nascimento e peso ao nascer nulos.

## Fase 0 do plano de indivíduos, fechamento: admin sem "todas as fazendas" e identificadores aparados no PWA (2026-10-19)

- **Painel, lista de Indivíduos (`Individuos.tsx`):** o ramo `user.papel === 'admin'` carregava indivíduos, raças e o canal em tempo real (`individuos_changes_admin`) **sem filtro de fazenda**. Na prática era código morto: as rotas `/controller/*` ficam atrás de `ControllerRoute`, que redireciona qualquer papel diferente de `controller` (inclusive admin) para `/admin/dashboard`, e o acesso do admin a uma fazenda é por impersonação (sessão do controller). Por isso **não foi criado seletor de fazenda para o admin**: não haveria onde ele aparecer. O ramo foi removido: a lista, a contagem, as raças e o canal em tempo real sempre filtram pela fazenda de `getFazendaIdForUser`, e sem fazenda a tela mostra "Selecione uma fazenda" (como a Conciliação já fazia) em vez de listar tudo. Typecheck, lint (159 avisos, o mesmo de antes) e 455 testes ok; sem teste no navegador por não haver caminho de tela para o caso (admin não acessa a rota).
- **PWA, identificadores aparados no envio** (`utils/identificadores.ts`: `aparaIdentificador`, 2 testes novos; `syncService.ts`; `supabaseService.ts`): o banco guarda brinco, chip, manejo e provisório sem espaços nas pontas (migration `20261015250000`) e o trigger de pesagem compara o texto exato, então um brinco digitado com espaço ("ABC ") não casava com o animal ("ABC"). Agora o sync apara (sem mudar a caixa, de propósito) provisório, brinco, chip e manejo da cria, da mãe e da mãe adotiva na maternidade, brinco e chip em movimentação, enfermaria e morte, manejo na enfermaria e brinco/chip na pesagem; a busca de mãe/adotiva já existente em `criarIndividuosIdempotente` também apara. A comparação no aparelho já ignorava caixa e espaços (`normalizarIdentificador`, `maternidadeIds.ts`, `individuoPorIdentificacao.ts`). A checagem "cria com o brinco da mãe" já existia (`maternidadeIds.ts`). PWA: typecheck, 459 testes e lint no teto (48) ok.
- Com isso, a Fase 0 do plano está concluída, exceto o estorno de mãe e cria quando um parto é excluído (adiado por decisão do gestor, ver BACKLOG).

## Fase 0 do plano de indivíduos, Enfermaria: individuo_id já enviado pelo PWA (2026-10-19)

Item "PWA enviar `individuo_id` na Enfermaria" conferido e **já estava feito**: `EnfermariaPage.tsx` usa `AnimalIdentifier` e guarda `individuoId` (commit `0af960f`, 09/10/2026, presente em master e em `staging-repo/main`), e `syncService.ts` grava `individuo_id` em `registros_enfermaria`. Nada a implementar; a nota de dependência do BACKLOG estava desatualizada e foi corrigida. Leitura no banco: 15 registros de enfermaria ativos, 3 com `individuo_id` (o primeiro em 10/09), 0 registros de outubro com brinco, chip ou manejo e sem vínculo.

## Fase 0 do plano de indivíduos, Maternidade: vínculos preservados no reenvio, gêmeos e 2ª mãe adotiva (2026-10-19)

- **Cria duplicada: não encontrada.** O PWA atual cria a cria com id próprio e o gatilho `create_individual_from_maternidade` sai cedo quando o registro traz `individuo_id_cria`; o reenvio do parto (upsert por `local_id`) é UPDATE e não dispara os gatilhos de INSERT. Os pares repetidos achados são partos digitados duas vezes (fazenda `99af0828`, maio) e dados de teste.
- **Defeito real achado e corrigido (migration `20261019100000_maternidade_preserva_vinculos_no_reenvio`, rollback em `supabase/rollbacks/`):** versões antigas do PWA enviam `individuo_id_mae/cria/mae_adotiva` nulos e, no reenvio do mesmo parto, o upsert os sobrescrevia com NULL (auditoria dos 6 partos da Chibiu de 08/10, UPDATE de 14/10). Gatilho BEFORE UPDATE `trg_maternidade_preserva_vinculos` mantém o vínculo anterior quando o novo chega nulo; trocar por outro animal continua permitido. Testado na fazenda de testes (transação desfeita): UPDATE zerando os três campos manteve cria e mãe. Não corrige os 6 partos já afetados (Chibiu `3d89b40f-…`, partos `76c85a56…`, `e2d501df…`, `e168a684…`, `bb6f7c41…`, `be6f1445…`, `4ccbdb76…`) nem os 128 partos vivos sem cria de maio/junho da fazenda `99af0828` (histórico), a tratar à parte com autorização escopada.
- **Reparo dos vínculos (19/10, autorizado pelo gestor, só UPDATE em `registros_maternidade`):** (1) **Chibiu** (`3d89b40f-922c-49f9-95c2-e53c3a59ec17`): 6 partos de 08/10 (`76c85a56`, `be6f1445`, `e2d501df`, `4ccbdb76`, `e168a684`, `bb6f7c41`) tiveram `individuo_id_mae` e `individuo_id_cria` restaurados pelos valores do `audit_log`; backup em `backup.maternidade_vinculos_chibiu_20261019`. (2) **Fazenda `99af0828-7371-49a4-9b0d-cba0eca03a15`:** 7 partos de 06 e 09/06 ganharam `individuo_id_cria` (pares 1 para 1 por data, provisório e sexo: 4d774db1→e0cb282b, 3cf4b067→aaf51a00, 0f06eb33→6c19483b, b9414d3a→7affde89, 4de4be37→efa52b9c, 5302be2b→f6156024, 99e428be→066b9372); backup em `backup.maternidade_vinculos_99af_20261019`. Blocos únicos que abortariam se a contagem divergisse (6 e 7; ambos deram a contagem esperada) ou se o agregado da fazenda mudasse; `quant_atual` idêntico à foto de regressão nas duas (0 categorias alteradas). Reversão: `UPDATE registros_maternidade SET individuo_id_cria = NULL` (e `individuo_id_mae = NULL` na Chibiu) pelos ids do backup; o gatilho `trg_maternidade_preserva_vinculos` bloqueia zerar vínculo, então para reverter é preciso desabilitá-lo antes. Efeito colateral esperado: `update_classificacao_matriz` recalculou `numero_partos` das 6 mães da Chibiu. **Deixados de fora de propósito:** os 122 partos de 04/05 a 09/06 da `99af0828` (anteriores ao módulo de indivíduos, sem mãe nem cria; criar animais retroativos geraria divergência no agregado) e as 34 crias de junho sem parto correspondente.
- **PWA (`MaternidadePage.tsx`):** a 2ª cria gêmea tinha o erro engolido (só `console.error`) e o resultado da gravação nem era lido, então o usuário via "salvo" com a 2ª perdida. Agora o registro da 2ª é validado antes de gravar a 1ª; se a 2ª ainda falhar, mostra "A 1ª cria foi salva, mas a 2ª não" e o próximo Salvar grava só a 2ª (ref `gemeaPendenteRef`, sem repetir a 1ª). A 2ª mãe adotiva ganhou `status: 'Vivo'` como a 1ª (o banco já assumia 'Vivo' por padrão, então é só consistência). Typecheck, 457 testes e lint ok. **Testado no navegador (PWA local, fazenda de testes, lote Teste 2):** parto gemelar com a 2ª cria viva, guacho e mãe adotiva nova; com a gravação da 2ª forçada a falhar (patch no IndexedDB), a tela mostrou "A 1ª cria foi salva, mas a 2ª não" e não abriu o modal de sucesso; no segundo Salvar só a 2ª foi gravada. No servidor: 2 partos (a 1ª não repetiu), 1 cria por parto, mãe e cria ligadas, mãe adotiva ligada ao 2º parto e criada com status Vivo. Dados de teste revertidos (2 partos e 3 animais em soft-delete; `quant_atual` de bezerro/bezerra ao pé do Teste 2 recalculado para 9 e 4; partos da mãe MAE-N1 voltaram a 1).

## Órfãos de maternidade: 56 da Marcon excluídos; Chibiu, Chibata e Olho D'Água mantidos como incertos (2026-10-19)

Autorizado pelo gestor, com escopo fechado. **Prévia somente leitura** (19/10): os 111 animais marcados em 16/10 (`backup.individuos_incerteza_20261016`) não aparecem em nenhuma tabela com FK para `individuos` (Sanidade, Reprodução inclusive como touro, Enfermaria, Curral, Morte, Movimentação, Pesagem, `lote_historico`, ponte `evento_individuos`, mãe/cria/adotiva em maternidade, filiação), exceto o próprio parto que os criou (1 a 30 s depois do cadastro) e o vínculo mãe da cria; só 3 crias da Chibata têm parto ativo, uma delas até 9 dias depois.

- **Fazenda Marcon, Lote 123 (`c4d13f1f-a785-4bcd-8e72-4ac4b28ee034`): soft-delete (`deleted_at`) de 56 indivíduos** (28 vacas "Vaca Parida" + 28 crias ao pé: 13 bezerras e 15 bezerros), todos Vivos, incertos, sem referência posterior e cujos 28 partos já estavam excluídos. Bloco único que abortaria se o backup ou a atualização divergissem de 56 (ambos deram 56). Backup completo das linhas em `backup.individuos_exclusao_marcon_20261019`. Para reverter: `UPDATE individuos SET deleted_at = NULL WHERE id IN (SELECT id FROM backup.individuos_exclusao_marcon_20261019)` (e, se quiser, voltar `localizacao_incerta_desde` = 16/10/2026). Verificado depois: 56 excluídos, 0 incertos e 0 divergências na Marcon, `quant_atual` do Lote 123 idêntico à foto de regressão (vaca 9, bezerra 11, bezerro 10, novilha 12); as outras diferenças da foto na fazenda vêm do cron diário de peso (19/10 00:00) e de movimentações reais, não desta operação.
- **Chibiu (34 vacas), Chibata (4) e Olho D'Água (3):** a atualização autorizada para localização incerta já estava aplicada desde 16/10 (todos Vivos, ativos, `localizacao_incerta_desde` = 16/10/2026). Nenhuma linha alterada nesta etapa; agregado intocado. A decisão de fundo (Entrada de ajuste de vacas na Chibiu, causa dos excessos de 1 a 2 bezerros) segue em aberto no BACKLOG.
- Pendente: conserto do gatilho de estorno de parto excluído (evita novos órfãos).

## Menu "Controle Individual" no painel (2026-10-16)

As telas da camada individual saíram de "Gestão da Fazenda" e ganharam um grupo próprio no sidebar (`ControllerLayout.tsx`, seção Operação, logo abaixo de Gestão da Fazenda): **Indivíduos**, **Identificar Lote**, **Conciliação**, **Reprodução**, **Diagnóstico em Grupo**, **Estações de Monta** e **Manejo Sanitário**. "Gestão da Fazenda" ficou com Lotes, Cadastros Auxiliares, Faixas de Categorias e Mapa da Fazenda. Só mudou a organização do menu: rotas, páginas e permissões são as mesmas. A command palette (Ctrl+K) lê a mesma estrutura, então os itens aparecem lá sob "Operação · Controle Individual". `routePrefetch.ts` ganhou as rotas novas (Identificar Lote, Conciliação, Reprodução, Diagnóstico em Grupo, Estações de Monta, Manejo Sanitário). O submenu abre sozinho na rota ativa (a regra existente compara o caminho exato, então em `/controller/individuos/<id>` o grupo não abre sozinho, como já acontecia). Testado na fazenda de testes: grupo visível, destaque e as 7 rotas navegam certo.

**Só na fazenda de testes (decisão do gestor, antes do merge em produção):** o grupo Controle Individual só aparece para `FAZENDA_DE_TESTES_ID` (`menuControleIndividualVisivel` em `utils/cadernetas.ts`, com teste em `cadernetasEmTeste.test.ts`); com outra fazenda, ou enquanto a fazenda ainda é desconhecida, o grupo some e **Indivíduos, Reprodução, Estações de Monta e Manejo Sanitário também deixam de aparecer no menu** (as fazendas em produção não usam o módulo; nada volta para Gestão da Fazenda). Limite: é só o menu. As rotas (`/controller/individuos`, `/controller/reproducao`...) continuam abrindo por URL direta e a RLS filtra os dados por fazenda. Para liberar a todas: trocar `menuControleIndividualVisivel` para `true`.

## Sanidade C3: tratamento/vacina na sessão de manejo de curral (2026-10-16)

Migration `20261016350000_manejo_curral_tratamento` (rollback em `supabase/rollbacks/`). Só colunas novas (nulas ou com padrão): o PWA antigo segue válido e sem tratamento. Não altera contagem, peso nem movimentação.
- **Colunas:** `sessoes_manejo_curral.tratamento_*` (tipo, medicamento_id, produto_nome, principio_ativo, dose, via, lote_produto, validade, carencia_dias, intervalo_dias, diagnostico; produto preenchido = sessão com tratamento) e `registros_manejo_curral.sem_tratamento` (padrão false) + `aplicacao_id`.
- **`aplicar_manejo_curral`:** o resto da função é idêntico; para cada linha aplicada com animal e sem `sem_tratamento` grava **uma aplicação sanitária** (data da sessão, `origem = 'pwa'`, `local_id = 'curral:<id da linha>'`, `ON CONFLICT (local_id)`, idempotente). A decisão é no servidor porque só ele sabe qual animal cada linha é (inclusive os cadastrados na própria sessão). Falha ao gravar o tratamento não desfaz a identificação: a linha fica `aplicado` com o aviso em `erro`. O retorno ganha `tratamentos` e `tratamentos_falhas`. A carência e a próxima dose saem do gatilho de `aplicacoes_sanitarias`.
- **Painel:** detalhe da sessão (`RegistrosManejoCurralDetalhes.tsx`) mostra o bloco "Tratamento da sessão" e a coluna Tratamento (Recebeu / Não recebeu).
- **Teste (fazenda de testes, PWA no navegador):** sessão com 3 animais e vacina (dose 2 ml, carência 21, reaplicar 180), a MAE-N1 marcada "Não recebeu", salva offline e sincronizada: 3 linhas `aplicado`, 2 aplicações (carência até 06/11/2026, próxima 14/04/2027, responsável da sessão), os 2 animais em `animais_em_carencia`; reprocessar o mesmo `local_id` não duplica. Validação de validade vencida testada na tela. Tudo revertido por soft-delete (sessão `234ea391-baba-4563-aebc-1f4017d700f0`, 3 linhas, 2 aplicações).
- **Ramo de falha (testado ao vivo pelo `scripts/teste-api.mjs`):** sessão com data futura (17/10) e tratamento, uma linha de animal existente, `aplicar_manejo_curral` chamada como o usuário de teste. Retorno `aplicados: 1, tratamentos: 0, tratamentos_falhas: 1`; a linha ficou `aplicado` com `erro = 'Tratamento não registrado: A data da aplicação não pode ser futura'`, sem aplicação criada, e o animal (brinco, status Vivo) intacto. Sessão `c3c3c3c3-0000-4000-8000-000000000001` e linha `c3c3c3c3-0000-4000-8000-000000000002` revertidas por soft-delete.
- A caderneta de Manejo de Curral continua só na fazenda de testes.

## Sanidade C1: calendário sanitário (2026-10-16)

Programação de campanhas por fazenda e pendências calculadas (migrations `20261016330000_calendario_sanitario` e `20261016340000_notificar_calendario_sanitario`, rollbacks em `supabase/rollbacks/`). Só avisa: não altera aplicações, contagem, peso nem movimentação.
- **Tabela `calendario_sanitario`:** nome, tipo, produto (do catálogo ou digitado), categorias (vazio = todas), `data_base` + `periodo_meses` (12 = anual, 6 = semestral...; ocorrência = base + k períodos), `antecedencia_dias` (padrão 15, abre a janela) e `prazo_dias` (padrão 60, quanto continua atrasada após a data). RLS padrão por fazenda, nome único por fazenda, auditoria. Datas oficiais (aftosa, brucelose...) não são embutidas: cada fazenda informa a sua e confere a exigência com o órgão estadual.
- **Função `calendario_sanitario_pendencias(fazenda, em)`** (SECURITY INVOKER): pega a ocorrência vigente de cada programação ativa e lista, por lote e categoria com cabeças, quem não tem aplicação do produto **por lote** desde o início da janela (categoria vazia na aplicação vale para todas; produto por id ou por nome sem diferenciar maiúsculas). Situação `a_vencer` ou `atrasada`, dias e cabeças já aplicadas.
- **Painel:** seção Calendário em Manejo Sanitário (`components/CalendarioSanitario.tsx`, `utils/calendarioSanitario.ts` + testes, hooks em `useSanidade.ts`): campanhas pendentes agrupadas, lista de programações (editar, ativar/desativar, excluir), cadastro e cinco modelos sem data. Visível só na fazenda de testes (`FAZENDA_DE_TESTES_ID`).
- **Alerta:** `notificar_calendario_sanitario(p_fazenda_id DEFAULT NULL)`, uma notificação-resumo por fazenda e situação para cada usuário ativo (atualiza a não lida em vez de duplicar), só para fazendas com programação ativa; cron segunda 08:50; link `/controller/manejo-sanitario`.
- **Teste (fazenda de testes):** 5 programações (atrasada −15 dias, a vencer +9, encerrada, futura, semestral): só as duas primeiras e a semestral apareceram; a aplicação por lote com nome em caixa diferente encerrou a campanha do lote (Teste 2) e manteve o Teste 3. Pela tela: validações, criação (categorias normalizadas), desativar e excluir. Alerta: 4 usuários × 2 situações, sem duplicar na segunda chamada. Tudo revertido por soft-delete (5 programações, 1 aplicação, 8 notificações).
- **Limites:** só aplicação por lote encerra a campanha do lote; cobertura parcial aparece em `cabecas_aplicadas` mas não reabre a pendência; regra por idade do animal fica para depois; o PWA ainda não mostra a campanha pendente.

## Fase 4 no PWA, P3: eventos_reprodutivos aceita envio idempotente do PWA (2026-10-16)

Migration `20261016310000_eventos_reprodutivos_local_id` (rollback em `supabase/rollbacks/`): `eventos_reprodutivos.local_id text` com índice único completo (índice parcial dá 42P10 no upsert) e `origem text NOT NULL DEFAULT 'painel'` (`painel|pwa`). Só colunas novas; painel e PWA antigo seguem válidos. O gatilho `trg_eventos_reprodutivos_validar` não depende da ordem de chegada (só olha fêmea, fazenda, data, touro, estação e a cobertura referenciada; o PWA não envia `evento_cobertura_id`).
- **Painel:** caderneta `reproducao` na lista de cadernetas (`utils/cadernetas.ts`, aponta para `/controller/reproducao`), no grupo Gado, na permissão por funcionário e em `CADERNETAS_EM_TESTE` (só fazenda de testes, junto de `manejo-curral` e `sanidade`); `types/images.ts` com imagem provisória (cópia da de sanidade).
- Teste: reenvio com o mesmo `local_id` (`ON CONFLICT (local_id) DO NOTHING`) não cria linha. Detalhes da tela no HISTORICO do PWA.
- **View corrigida** (migration `20261016320000_status_reprodutivo_inconclusivo_mantem_marco`, rollback em `supabase/rollbacks/`): diagnóstico Inconclusivo sem cobertura derrubava fêmea "Parida" para "Sem registro". Agora só Prenha/Vazia decide o status; o Inconclusivo cai em Coberta (se há cobertura) ou no marco de parto/aborto. Testado na fazenda de testes (MAE-BR-N1 segue Parida; evento `f0be0099-5d3b-4d32-94ae-db1ec441920a` revertido por soft-delete).

## Entrada retroativa não contada no lote destino: correção manual (2026-10-16)

Fazenda `a53d7375-15c8-44fe-98d8-90e9f8423c65`, "Lote 4 Bez 0926". A movimentação `registros_movimentacao` `49a3415a-b1a4-48e6-b283-621ab19387ec` (Entrada, 89 Bezerro, 215 kg) foi lançada com data 25/09, anterior ao `created_at` (09/10) da `lote_categorias` `4e88cd79-b3e5-4f25-b1ce-984cdf636aaa`. Causa: `calculate_quant_atual` só soma movimentações com `data >= lote_categorias.created_at`, e o trigger `update_quant_atual_movimentacao` só dispara em INSERT (editar a data depois não recalcula, nem pondera o peso).

Correção (UPDATEs autorizados, 1 linha cada, na `lote_categorias` acima):
- `quant_atual` 100 → 189 (`calculate_quant_atual`).
- `peso_vivo_atual_kg_cab` 219,23 → 217,24 (média ponderada 100 × 219,23 + 89 × 215), `data_pesagem` e `data_ajuste_peso` 25/09 → 16/10 (reinicia o GMD).
- Antes da correção: movimentação já com `data` = 16/10 (editada pelo usuário).

Prevenção (migration `20261016220000_movimentacao_data_retroativa`, rollback em `supabase/rollbacks/`):
- Coluna `registros_movimentacao.data_informada` e trigger BEFORE INSERT `trigger_aa_movimentacao_ajusta_data`: se `data` for anterior ao maior `created_at` das categorias ativas envolvidas (origem/destino, mesma categoria), grava `data = now()` e guarda a data informada em `data_informada`. Vale também para registros vindos de sync offline.
- Trigger AFTER UPDATE `trigger_movimentacao_recalc_quant_update`: editar data, cabeças, lotes, categoria ou `deleted_at` recalcula `quant_atual` (o peso não é reponderado no UPDATE).
- Testado na fazenda de testes via `scripts/teste-api.mjs`: saída com data 01/09 gravada em 16/10 com `data_informada` preenchida, contagem 2 → 1; soft-delete devolveu 1 → 2.

## Reprodução (Fase 4b): diagnóstico de gestação em grupo e resumo por estação (16/10/2026)

Nova página **Diagnóstico em grupo** (`/controller/reproducao/diagnostico-em-grupo`, botão na página de Estações de Monta): escolhe o lote, lista as fêmeas com status e última cobertura (por padrão só as cobertas), data e método comuns, resultado por fêmea (Prenha, Vazia, Inconclusivo; idade da gestação só para prenha), atalhos "Todas prenhas/vazias/Limpar". Grava tudo num único insert (tudo ou nada), cada diagnóstico apontando para a cobertura mais recente da fêmea; só entram as fêmeas marcadas. A página de **Estações de Monta** ganhou o resumo por estação (cobertas, prenhes, vazias, sem diagnóstico e taxa de prenhez sobre as diagnosticadas), calculado no front por `resumirEstacoes` a partir dos eventos (diagnóstico mais recente depois da última cobertura da fêmea na estação; inconclusivo fica fora da taxa). Limite conhecido: o resumo não considera partos posteriores à cobertura (uma vaca que já pariu após a cobertura conta como "sem diagnóstico" se ninguém lançou o diagnóstico). Sem migration. Validado no navegador na fazenda de testes (3 cobertas, 2 diagnósticos em grupo, 1 prenhe, 1 vazia, taxa 50%); dados restaurados.

## Reprodução (Fase 4a): aba na ficha da fêmea e estações de monta no painel (16/10/2026)

O schema já existia (migrations 20261008160000/161000/162000). Faltava o painel. Nova aba **Reprodução** na ficha (só fêmeas): status derivado de `v_status_reprodutivo` (Prenha, Coberta, Vazia, Parida, Sem registro) com previsão de parto (283 dias), último parto, intervalo entre partos, última cobertura/touro e diagnóstico; pendências calculadas (sem diagnóstico há 60 dias ou mais, parto nos próximos 30 dias ou atrasado, vazia há mais de 120 dias); linha do tempo de eventos com exclusão (soft-delete); modal "Lançar evento" para Cobertura, Inseminação, Diagnóstico de gestação e Aborto, que só envia os campos que o tipo aceita (as constraints do banco recusam o resto). Nova página **Estações de Monta** (`/controller/estacoes-monta`, menu Gestão da Fazenda): criar, editar e excluir. Arquivos: `utils/reproducao.ts` (+ teste), `hooks/useReproducao.ts`, `components/ReproducaoDoAnimal.tsx`, `pages/controller/EstacoesMonta.tsx`, `IndividuoDetalhe.tsx`. Validado no navegador na fazenda de testes (cobertura leva a Coberta com previsão 283 dias; diagnóstico Prenha leva a Prenha); dados restaurados. Faltam 4b (diagnóstico em grupo e resumo por estação) e 4c (pendências em lista, alertas e relatório). Sem migration nova.

## Manejo de curral: lista de sessões no painel (16/10/2026)

Nova caderneta no painel, grupo Gado & Pastagens (`/controller/cadernetas/manejo-curral`): lista as sessões (data, responsável, nº de animais, situação com aplicados, conflitos, aguardando e trocas de lote a confirmar; filtros por texto e data) e a página de detalhes por sessão (`.../manejo-curral/:id`) com as linhas: animal (link para a ficha), identificação nova, motivo, lote de destino, peso, situação (com a mensagem de conflito) e situação da troca de lote, com atalho para a Conciliação. Substitui a entrada "só campo" da lista de RBAC (agora vem do grupo). Imagem copiada para `public/images/cadernetas/manejo-curral.png` e registrada em `types/images.ts`. Arquivos: `RegistrosManejoCurral.tsx`, `RegistrosManejoCurralDetalhes.tsx`, `utils/sessoesManejoCurral.ts` (+ teste). Validado no navegador na fazenda de testes (sessão com 1 aplicado, 1 conflito e 1 troca de lote), dados restaurados.

## Manejo de curral: fila "Designações de lote" no painel (16/10/2026)

Na Conciliação de indivíduos, nova seção lista as pendências abertas de `pendencias_designacao_lote` agrupadas por lote de origem, destino e categoria, com os animais, e dois botões por grupo: Confirmar mudança (RPC `confirmar_designacao_lote`, com confirmação do gestor, gera a movimentação Entrevero e liga os animais) e Descartar (RPC `descartar_designacao_lote`). Arquivos: `utils/designacoesLote.ts` (+ teste), `hooks/useDesignacoesLote.ts`, `pages/controller/ConciliacaoIndividuos.tsx`. A consulta com joins foi validada na fazenda de testes (pendência criada pelo `aplicar`, lida e descartada). RBAC: `manejo-curral` entra em `CADERNETAS` como caderneta só de campo. Ainda sem lista de sessões de manejo no painel.

## Manejo de curral: migration 3 e PWA ligado ponta a ponta (16/10/2026)

O envio do PWA falhou com 42P10: o `upsert onConflict=local_id` não aceita índice parcial. Migration `20261016250000_manejo_curral_local_id_unico` troca os índices por únicos simples em `local_id` (padrão de registros_morte). Reenvio testado no preview, fazenda de testes: sessão offline fica `pending` e na fila, ao voltar a rede sobe, a RPC aplica (1 aplicado, 1 pendência), brinco 22 -> PWA-T1, agregado intacto (122/55). Restaurado: pendência descartada, brinco 22 de volta, sessão excluída.

## Manejo de curral: tabelas e migration de data retroativa aplicadas (16/10/2026)

Desenho aprovado em `docs/PLANO_MANEJO_CURRAL.md` (designação de lote vira pendência; peso só no animal; offline obrigatório). `supabase db push` aplicou `20261016230000_manejo_curral_tabelas` (sessoes_manejo_curral, registros_manejo_curral, pendencias_designacao_lote; só aditiva) e, junto, `20261016220000_movimentacao_data_retroativa` (trigger que ajusta data anterior à criação da categoria e recalcula `quant_atual` em UPDATE), que estava na pasta sem commit e entrou na fila sem revisão; o gestor decidiu mantê-la. RLS do peão conferida na leitura: `caller_has_fazenda_access` cobre `peoes` por e-mail. Nota: o arquivo local da 220000 e o rollback sumiram do disco (aplicada no banco); foram recriados a partir de `supabase_migrations.schema_migrations`, sem comentários extras além do aviso no topo.

Migration 2 aplicada (`20261016240000_manejo_curral_rpcs`): `aplicar_manejo_curral` (peão pode chamar; idempotente; animal novo sem movimentação; número já usado vira `conflito`; lote diferente vira pendência; peso não é gravado), `confirmar_designacao_lote` (só painel; gera Entrevero com ponte) e `descartar_designacao_lote`. Teste na fazenda de testes via teste-api: sessão com 3 linhas deu 2 aplicadas, 1 conflito (brinco 44 de outro animal), 1 animal criado, 1 pendência; agregado intacto (Lote A 122, Teste 3 55) e histórico `id_brinco 22 -> TST-NOVO-1` gravado; a confirmação moveu 1 cabeça (121/56). Restaurado: movimentação excluída (soft-delete; o trigger da 220000 recalculou 122/55), animal com brinco 22 no Lote A, animal de teste e sessão excluídos; 22 vivos. Sobraram na fazenda de testes a pendência confirmada, as linhas da sessão e a ponte do evento excluído.

## Indivíduos: baixa manual e exclusão respeitam o agregado do lote (2026-10-15)

Branch `feat/individuos-coexistencia`. Princípio: o agregado (`lote_categorias.quant_atual`, calculado por movimentações) continua sendo a verdade da contagem; o indivíduo é um subconjunto e acompanha o evento agregado, nunca o contrário. Morte (trigger em `registros_morte`) e venda/abate/transferência (OS) já funcionavam assim; a baixa manual e a exclusão no painel eram o único caminho que só alterava `individuos`.

- **Migrations** `20261015150000_individuo_baixa_e_exclusao_com_agregado` e `20261015160000_fix_excluir_individuo_sem_delete_total` (rollbacks em `supabase/rollbacks/`). A segunda corrige a primeira: `DELETE` sem `WHERE` em tabela temporária é bloqueado pelo banco, e a exclusão falhava sempre.
- **`baixar_individuo(p_fazenda_id, p_individuo_id, p_status, p_data_saida, p_motivo_saida, p_destino_saida)`**: aceita só `Vivo` e `Doado`. Doação grava Saída agregada `Doação`; Descarte/Outro gravam `Saída` (tipo_saida NULL), marcadas com `causa_observacao 'Baixa manual: ...'` e `individuo_id`. Voltar a Vivo estorna (soft-delete) a Saída; baixar de novo estorna a anterior e grava a nova. Recusa Abatido/Venda Vivo/Transferido (só pela OS) e Morto (só pela Caderneta de Morte). Falha com erro claro se a categoria não existir ativa no lote, se estiver com 0 cabeças ou se a data for anterior à criação da categoria.
- **`excluir_individuo(p_fazenda_id, p_individuo_id)`**: soft-delete do animal e estorno das movimentações do próprio animal (`individuo_id`, 1 cabeça, sem OS) com recálculo do `quant_atual`. Bloqueia se houver morte ou OS vinculada. Animais que já estavam contados no lote sem movimentação própria continuam contados.
- **Painel:** `useIndividuoAcoes` chama as RPCs e mostra a mensagem do servidor; modal de baixa só com Vivo/Doado e motivos Doação/Descarte/Outro (`utils/baixaIndividuo.ts`); botão de baixa desabilitado para animal baixado por OS ou morte.
- **Testado** na fazenda de testes (`d649c65e-…`) com o login de controller: baixa 122→121, estorno →122, cadastro →123, exclusão →122.
- **Formulário de edição** (`IndividuoNovo.tsx`): o status ficou só leitura, com a indicação de usar a baixa da ficha. Antes permitia trocar para Abatido/Venda Vivo/Transferido sem tocar no agregado.
- **Busca e identificadores (front, sem migration):** `utils/postgrestFilter.ts` escapa curingas do LIKE e aspas/vírgula do `.or()`; a busca de `Individuos.tsx` usa isso (antes, um termo com vírgula virava outra condição ou quebrava o filtro, e `%` casava com tudo). `checkDuplicateIdentification` usa `limit(1)` em vez de `maybeSingle()` (com 2 linhas iguais ele devolvia erro e dizia "sem duplicata") e ignora diferença de maiúsculas. `IndividuoNovo` apara espaços de manejo/brinco/chip/provisório ao salvar.
- **Auditoria de schema (somente leitura):** `individuos.mae_adotiva_id` existe; `descendentes_individuo` não existe no banco. `create_individual_from_maternidade` já sai cedo quando `individuo_id_cria` vem preenchido. Não há brincos duplicados; há 5 IDs provisórios repetidos em crias de nascimento (reaproveitamento digitado no campo, provisório não é único por desenho).
- **Privilégios de `individuos`** (migration `20261015170000_individuos_revoga_privilegios_excedentes`): `REVOKE ALL` de `anon` e `REVOKE TRUNCATE, REFERENCES, TRIGGER` de `authenticated`. As policies antigas (`usuario_id = auth.uid()`) já não existiam; as 5 atuais usam `auth_id` + vínculo ativo e a RLS é forçada, então não havia acesso aberto, só privilégio excedente (TRUNCATE ignora RLS). Conferido com `has_table_privilege` e, no painel como controller, lista, ficha e um salvamento do formulário (UPDATE) na fazenda de testes. As demais tabelas seguem o padrão do Supabase e entram na Fase B do BACKLOG.
- **Editar animal já Morto** (`validateIndividuo(form, { statusOriginal })`, `IndividuoNovo.tsx`): a validação bloqueava `Morto` sempre, então um animal baixado pela Caderneta de Morte nunca mais podia ser editado. Agora bloqueia só a transição para Morto (criação ou animal que estava vivo). Testado na fazenda de testes marcando o NEW-A1 como Morto por SQL, salvando o formulário (status preservado) e restaurando para Vivo.
- **Pesagem não move o animal sem evento agregado** (migration `20261015180000_pesagem_nao_move_animal_sem_evento`, rollback em `supabase/rollbacks/`): `trg_registros_pesagem_upsert_individuo` sobrescrevia lote, categoria e raça do animal com os da pesagem, sem movimentação. Agora, no ramo sem OS de animal já cadastrado, só `compra`, `processamento`, `transf_entrada` e `apartacao` (que têm evento agregado próprio) movem o animal; nos demais tipos a pesagem atualiza peso/idade/identificação e cada divergência vira linha em `logs_sync_errors` (`PESAGEM_LOTE_DIVERGENTE`, `PESAGEM_CATEGORIA_DIVERGENTE`, `PESAGEM_RACA_DIVERGENTE`). Não existe tipo de pesagem comum: o CHECK de `tipo_manejo` tem 7 tipos, então o efeito prático é em `abate`/`venda_vivo`/`transf_saida` sem OS (o guard de OS não exige `os_id`). Corpo base conferido por md5 com o da função no banco. Decisão do usuário. Testado na fazenda de testes: `venda_vivo` sem OS manteve Garrote/Blonde/Lote B, subiu o peso e gerou os 3 logs; `apartacao` moveu o animal sem log. Dados do teste restaurados (animal, pesagens em soft-delete, logs removidos).
- **Localização incerta: indivíduo identificado × movimentação por contagem** (migrations `20261015190000_individuos_localizacao_incerta` e `20261015200000_pesagem_confirma_localizacao`, rollbacks em `supabase/rollbacks/`). Contexto: a operação é por agregado e a movimentação dominante entre lotes é a apartação parcial (235 linhas, 1 a 241 cabeças, sem dizer quais animais); lote inteiro é raro. Nada atualizava o `lote_atual` dos identificados. Coluna nova `individuos.localizacao_incerta_desde` (nula = confirmada). Gatilho `trigger_zz_movimentacao_propaga_individuos` em `registros_movimentacao`, só para `Saída`/`Entrevero` lote→lote, sem OS e sem `individuo_id`, de categoria ativa na origem: (1) a movimentação esvazia a categoria (`calculate_quant_atual = 0`) → os identificados confirmados vão para o destino; (2) parcial → os identificados confirmados da origem viram incertos (continuam na origem); (3) estorno (soft-delete) → confirmados da categoria na origem e no destino viram incertos. Os já incertos nunca são movidos automaticamente (podem ter ido para outro lote). A pesagem com lote fixa o lote do animal e limpa a incerteza (tipos que movem, ou animal incerto). RPC `confirmar_localizacao_individuos(fazenda, lote, animais[])`: só muda o lote de animais incertos; mover animal confirmado exige o evento agregado. Não altera `quant_atual` nem `calculate_quant_atual`. Fora do alcance: formato legado `motivo_movimentacao = 'Transferencia'` (categoria em texto composto) e movimentações de OS. Decisões do usuário. Testado na fazenda de testes com dados restaurados: apartação parcial → animal 22 incerto sem sair do Lote A; pesagem `apartacao` no destino → move e limpa; apartação que esvazia o bezerro ao pé do Lote C → `2026-999` acompanha; estorno → marca incerto; agregados voltaram a 122/55/1/0. A RPC só será exercida pela tela (exige sessão do painel). UI feita (ver item seguinte). Observação: o Windows grava as migrations com CRLF e o banco guarda `\r` dentro das funções (inofensivo para o plpgsql).
- **UI da localização incerta** (front, sem migration): Indivíduos ganhou o filtro "Localização incerta" e o selo "incerta desde dd/mm" ao lado do lote (lista e cards). A ficha mostra o selo no cabeçalho e o botão "Confirmar localização" (só animal Vivo e incerto), que abre um modal com o lote e chama a RPC `confirmar_localizacao_individuos` (hook `confirmarLocalizacao` em `useIndividuoAcoes`; invalida `['individuo', id]` e `['lotes']`). O card de lote mostra "Identificados: N" e "X com localização incerta" (`hooks/useIdentificadosPorLote.ts`, query paginada de 1000 em 1000 com chave `['lotes', 'identificados', fazendaId]`, invalidada junto com os lotes). Testado na fazenda de testes (apartação parcial por SQL): filtro isolou o animal 22 (22 → 1), card do Lote A mostrou "3 identificados, 1 com localização incerta", a confirmação no Teste 3 pela tela moveu o animal e limpou a incerteza (a ficha atualiza após alguns segundos). Dados restaurados (122/55). O caminho de recusa da RPC (animal confirmado para outro lote) não é alcançável pela tela, porque o botão só aparece para incertos; fica coberto só pela lógica do SQL.
- **Peso atual com origem (item 0.3)** (migration `20261015210000`): `individuos.peso_atual_origem` ('pesagem' | 'estimado' | 'manual') e `peso_atual_data`. O trigger de pesagem grava 'pesagem' + data; o formulário grava 'manual' só quando o peso é alterado; o cron `update_pesos_individuos` soma GMD só em animal Vivo e no máximo uma vez por dia, marcando 'estimado' (antes somava também em baixados e a cada execução). Removidas as funções órfãs `atualizar_pesos_em_lote` (sobrescrevia pesagens), `calcular_peso_vivo_atual_individual` (bug `dias*dias`) e `listar_individuos_para_atualizacao_peso`. Backfill só em `individuos` (autorizado pelo usuário, identificações intactas): 8 animais com pesagem = 'pesagem'; demais com peso = 'manual'. Hoje nenhum animal tem GMD>0, então o cron não alterava nada. Testado na fazenda de testes: cron duas vezes seguidas somou uma vez (38,5 → 39,0 → 39,0). Ficha mostra "Peso atual (estimado)" quando for o caso.
- **Salvar indivíduo transacional (item 0.6)** (migrations `20261015220000`, `20261015230000`, `20261015240000`; as duas últimas corrigem tipos RECORD → ROWTYPE achados no teste): RPC `salvar_individuo(p_fazenda_id, p_individuo_id, p_dados jsonb, p_data_movimentacao)` substitui as 3-5 chamadas do `IndividuoNovo` (UPDATE/INSERT, herança nutricional, Saída/Entrada). Só colunas permitidas; mudança de lote/categoria de animal Vivo gera Saída + Entrada com `individuo_id` na data informada (não futura, não anterior à criação da categoria); categoria inexistente no destino, origem sem a categoria ou com 0 cabeças abortam tudo; animal baixado não muda de lote; mover pelo formulário limpa a localização incerta; herança nutricional só na criação ou na mudança de local (antes sobrescrevia o GMD a cada edição); peso alterado grava origem 'manual'. Front: campo "Data da movimentação"; removidos `utils/movimentacaoIndividuo.ts` e seu teste. Testado na fazenda de testes pela tela: mover animal 22 Lote A → Teste 3 com data de 3 dias atrás (122→121, 55→56, Saída+Entrada em 13/10, GMD herdado), destino sem a categoria (erro claro, nada gravado), criação de TST-06 (Entrada, 121→122), exclusão pela ficha e retorno ao Lote A (122/55 restaurados). Decisão adiada para a Fase 2: cadastrar indivíduo com lote continua somando +1 no agregado (correto para compra/nascimento; para identificar animal já contado, haverá a sessão de identificação).
- **Identificadores normalizados (item 0.7, banco)** (migration `20261015250000`): trigger `trg_individuos_normaliza_identificadores` aplica btrim e vazio→NULL em brinco, chip, manejo e provisório; índices únicos por fazenda passaram a `upper(...)`. A caixa é preservada de propósito: OS de compra/venda/transferência, maternidade, reprodução e o PWA comparam o texto exato. Prévia somente leitura achou 5 pares colidentes numa fazenda real (`3d89b40f-922c-49f9-95c2-e53c3a59ec17`): 4 eram **cria gravada com o brinco da mãe + espaço** (1581 F, 928 F, 1860 F, 2305 M; o PWA não impede a cria de herdar o brinco da mãe) e 1 duplicata ("Boto F" cadastro manual vazio × "Boto f" com 3 maternidades e 1 filho). Com autorização explícita do usuário e backup em `backup.individuos_identificacao_20261015` (51 linhas, valores originais de brinco/chip/manejo): zerado o `id_brinco` das 4 crias (ids `36492246-c1f4-49a0-b98f-d59a170771af`, `524609f4-9384-45b1-83d7-963a0e46f2c9`, `0c8b1ba1-5286-483d-9336-6c0438188d58`, `6e7ebe59-3a9c-4e9c-b3b1-72b317ceb08e`; ficam só com o provisório 1581/1860/2305/928) e soft-delete do "Boto F" (`262dcbbe-2240-4f2e-9414-c62d583802d6`, sem filhos, maternidades ou movimentações; o agregado do lote não foi alterado). Bloco com abort por contagem (a 1ª tentativa abortou sem gravar por ambiguidade de `id`). Depois disso não restou espaço sobrando nem colisão em nenhuma fazenda. Testado na fazenda de testes: '  zz-norm ' grava 'zz-norm' e 'ZZ-NORM' colide. Pendente: PWA deve impedir a cria de receber o brinco da mãe e aparar os identificadores antes de comparar (o trigger de pesagem compara o texto exato).
- **Morte no PWA vinculada ao indivíduo (item 0.2)** (repo PWA, commit `b03772f` na branch `staging`, só local até o usuário pedir o push): a `MortePage` passa `individuoId` (chip tem prioridade, depois brinco; comparação sem caixa/espaços; só animal Vivo e só se houver exatamente um candidato no cache; sem cache segue só no agregado) e o `syncService` envia `individuo_id` em `registros_morte`. O banco já tratava: `trg_registros_morte_baixa_individuo` marca o animal Morto e o estorno devolve a Vivo. Helper `utils/individuoPorIdentificacao.ts` com 5 testes. Confirmado na fazenda de testes: morte com `individuo_id` → status Morto (transação desfeita). Limite: o cache de indivíduos do PWA é carregado com 100 (cache de cadastro) a 2000 (pesagem) registros; animal fora do cache não é vinculado. A checagem cria × brinco da mãe já existia no PWA (`maternidadeIds.ts`); os 4 casos corrigidos eram de 25/08, anteriores a ela.
- **Fase 1.1 e 1.3: domínio de categorias e conciliação por lote** (migrations `20261016100000` e `20261016110000`, só objetos novos, nenhum dado reescrito): `categorias_animais` (11 categorias canônicas = chave de `lote_categorias.categoria`), `categoria_aliases` ('vaca parida/vazia/prenha/descarte', 'primípara' → vaca; 'bezerro/bezerra desmama' → bezerro/bezerra; variantes sem acento) e `categoria_canonica(text)`. Decisão do usuário: aliases, sem reescrever `individuos.categoria` (Parida/Vazia são estados reprodutivos já derivados por `v_status_reprodutivo`). Desvio do plano: **não** foi criada `individuos.lote_categoria_id` (ficaria desatualizada quando o lote recategoriza/desativa a linha); o vínculo é resolvido na hora pelas views. `vw_lote_categoria_identificacao` (por lote_categoria ativa: quant_atual, identificados, incertos, nao_identificados, divergencia) e `vw_individuos_sem_categoria_resolvida` (animal Vivo com lote cuja categoria o lote não tem; 'Tropa' e afins ficam sem alias de propósito); ambas `security_invoker`, anon sem acesso. Leitura real (16/10/2026): 674 lote/categorias, 57.332 cabeças, 348 identificados, 0 incertos, **13 divergências** (identificados > quant_atual), concentradas em lotes de Maternidade (ex.: Maternidade 3 com 0 no agregado e 14 bezerros ao pé identificados; Lote 123 vaca 9 × 28; Maternidade 2 vaca 2 × 19). Provável causa: o cadastro de mães/crias cria indivíduos sem que o agregado do lote conte as cabeças. Nada foi alterado; é o primeiro uso da fila de pendências. 9 animais com lote sem a categoria correspondente. Pendente: item 1.2 (`lotes.modo_identificacao`), UI da conciliação no painel e decisão de como tratar as 13 divergências.
- **Investigação das 13 divergências de conciliação (16/10/2026)** (migration `20261016120000` + ajuste de dados): as 13 eram reais (não há linhas duplicadas de lote_categorias; as duas 'Maternidade 2' são de fazendas diferentes). Três causas: **A (4 casos, Maternidades 2 e 3 da fazenda `d1a4cf86-65f0-4f85-ad8e-a471b7649adf`)**: as cabeças saíram por apartações agregadas ('Pariu', 14/8/10/5 cabeças) e os indivíduos criados no nascimento ficaram com o lote antigo (o problema da movimentação parcial, histórico, anterior à localização incerta). **B (3 casos, vacas das Maternidades 1 e 2 da `3d89b40f-922c-49f9-95c2-e53c3a59ec17`: 5×15 e 2×19)**: sem apartação nem morte; indivíduos criados depois da categoria, agregado com menos vacas que animais cadastrados. **C (6 casos: Lote 123 da `c4d13f1f-a785-4bcd-8e72-4ac4b28ee034`, LOTE 11 da `d3965505-74d5-4af7-9858-f773d2e8aab3`, Lote 5 da `c7dbfad4-b33b-4721-b064-52bb2b57eb32`, Maternidade 1 bezerros, Lote C de teste)**: sem movimentação, agregado menor que os identificados; precisa de conferência do gestor. Ação (autorizada, só `individuos`, sem tocar identificação): os 39 animais Vivos de bezerro/bezerra ao pé dos lotes `2f96e581-5f9f-4dd3-b84b-b679ed02e8f5` e `5209b85e-92d9-42ea-b9c7-8e29e2602d91` foram marcados com `localizacao_incerta_desde` = 16/10/2026; backup em `backup.individuos_localizacao_20261016` (id, lote_atual, localizacao_incerta_desde anterior = NULL); para reverter, voltar o campo a NULL por esses ids. A view passou a comparar só os identificados **confirmados** (identificados − incertos) com o agregado e ganhou a coluna `confirmados`: divergências 13 → 9. Pendente: B e C (decisão do gestor: ajustar o agregado ou o cadastro) e investigar por que o cadastro de mães/crias cria indivíduos em lotes cujo agregado não os conta.
- **Tela de conciliação** (front, sem migration): rota `/controller/individuos/conciliacao` (botão "Conciliação" na lista de Indivíduos), `pages/controller/ConciliacaoIndividuos.tsx`, hooks `useConciliacaoLotes` / `useIndividuosSemCategoria` (chaves `['lotes', ...]`, paginação de 1000) e `utils/conciliacaoIdentificacao.ts` com 4 testes. Mostra, por lote/categoria com identificados: no lote (agregado), identificados, confirmados, incertos, sem identificação e a situação (Divergência > Localização incerta > Conciliado), com resumo e filtros; abaixo, a fila de animais cujo lote não tem a categoria deles, com link para a ficha. Somente leitura sobre as views da Fase 1. Verificada na fazenda de testes (6 categorias, 14 identificados, 1 divergência: Lote C novilha 0×1; filtros funcionam). Admin sem fazenda vinculada vê "Selecione uma fazenda" (seletor de fazenda do admin segue pendente).
- **Fase 1.2: modo de identificação do lote** (migration `20261016130000`): `lotes.modo_identificacao` ('agregado' padrão | 'parcial' | 'individual', CHECK) e RPC `definir_modo_identificacao(p_fazenda_id, p_lote_id, p_modo)`. Por ora é declarativo (nada na operação muda). Regra por trigger (vale para qualquer caminho de escrita): passar para 'individual' exige que cada categoria ativa com cabeças tenha confirmados = quant_atual, sem divergência, e nenhum animal Vivo do lote sem categoria correspondente; voltar a 'agregado'/'parcial' é livre e os indivíduos permanecem. UI: seção "Modo de identificação dos lotes" na tela de conciliação (lotes com identificados ou modo diferente de agregado). Validado na fazenda de testes: Lote A → 'individual' recusado pela tela com a mensagem das pendências (1 categoria, 2 animais sem categoria), → 'parcial' aceito, → 'agregado' aceito; ENS-L4 (sem pendência) aceito em bloco desfeito.
- **Fase 1.4: ponte evento → animais** (migration `20261016140000`): `evento_individuos(evento_id → registros_movimentacao, individuo_id)` (única por par, leitura por fazenda, escrita só por RPC) e RPCs `vincular_individuos_movimentacao(p_fazenda_id, p_movimentacao_id, p_individuo_ids, p_confirmar_restantes)` e `desvincular_individuo_movimentacao`. É a resposta direta à movimentação parcial: o gestor informa QUAIS animais foram; eles passam ao lote de destino com localização confirmada (e, opcionalmente, os demais identificados da origem ficam confirmados lá). Regras: só Saída/Entrevero entre lotes, sem OS e não estornada; animal Vivo, da fazenda, na origem (ou já no destino), com a mesma categoria canônica; total de animais <= numero_cabecas; tudo ou nada; desvincular devolve o animal a 'localização incerta'. Correção da 0.5 na mesma migration: `trg_movimentacao_propaga_individuos` comparava a categoria do animal com LOWER() sem aliases, então 'Vaca Parida/Vazia' nunca eram marcadas como incertas quando 'vaca' saía por apartação parcial; agora usa `categoria_canonica()` (vale só para movimentações novas; o histórico não foi reprocessado, e as vacas dos grupos B e C seguem como estavam). Validado na fazenda de testes, como o usuário controller, em blocos desfeitos: apartação parcial marcou 1 incerto; vincular o animal 22 moveu-o ao destino e zerou os incertos; excesso de animais, categoria errada, atomicidade (nenhuma ligação gravada quando um animal é inválido), movimentação que não é apartação e outra fazenda foram recusados com mensagem clara; desvincular devolveu a incerto. Banco restaurado (122/55, 0 incertos, 0 pontes). Sem tela ainda: o fluxo "informar quais animais" na movimentação é front, pendente.
- **Fase 1.5: linha do tempo do animal** (migration `20261016150000`, só uma view): `vw_individuo_linha_do_tempo` (security_invoker, anon sem acesso) une cadastro, pesagem, movimentação do próprio animal, movimentação em grupo (via `evento_individuos`), parto (mãe), nascimento, mãe adotiva, morte e eventos reprodutivos, sem duplicar dado (cada linha aponta para `origem_tabela`/`origem_id`; estornados não aparecem). Leitura real: 552 cadastros, 212 partos, 202 nascimentos, 10 pesagens, 4 movimentações, 3 mãe adotiva. Front: aba "Linha do tempo" na ficha (`useLinhaDoTempoIndividuo`, chave `['individuo', id, 'linha-do-tempo']`, carrega só com a aba aberta). Validado na fazenda de testes: animal 22 mostra 7 eventos (cadastro, pesagens, 4 movimentações) com selos por tipo; movimentacao_grupo e morte validadas em bloco desfeito (as de parto/nascimento/adotiva pela contagem real; reprodutivo também validado em bloco desfeito: cobertura com touro e observação, e diagnóstico de gestação 'Prenha', com as datas corretas).
- **Fase 1.7: rastreabilidade (SISBOV/PNIB) e histórico de identificações** (migration `20261016160000`): norma conferida (IN MAPA 51/2018): código SISBOV = 15 dígitos numéricos, 3 primeiros = 076 (Brasil), 12 seguintes identificam o animal, sem dígito verificador; número de manejo = dígitos 10 a 15. Novas colunas em `individuos` (nulas por padrão): `codigo_sisbov` (CHECK `^076[0-9]{12}$`, único global entre animais não excluídos — código de animal excluído pode ser reaproveitado), `codigo_pnib` (livre, só aparado: não há formato confirmado), `dispositivo_tipo` (brinco | brinco_eletronico | botton | bolus | outro — lista definida por nós), `data_identificacao`, `data_vacina_brucelose`. Trigger de normalização passa a aparar SISBOV/PNIB. Tabela `individuo_identificacoes` (campo, valor anterior/novo, quem, quando) preenchida por trigger em qualquer mudança de brinco, chip, manejo, provisório, SISBOV ou PNIB (troca de brinco, provisório → definitivo); leitura por fazenda, sem escrita direta. `vw_individuo_linha_do_tempo` ganhou o tipo 'identificacao'. `salvar_individuo` aceita os campos novos. Front: campos no card "Sisbov e Rastreabilidade" do formulário (validação `validarCodigoSisbov`, datas não futuras, mensagem amigável para SISBOV duplicado), exibição na ficha e selo 'Identificação' na linha do tempo; 3 testes novos. Validado na fazenda de testes: no banco (bloco desfeito) prefixo 105 e código curto recusados, espaços aparados, duplicado global recusado, troca de brinco e SISBOV no histórico, RPC aceita os campos e recusa dispositivo inválido; na tela, SISBOV com prefixo 105 recusado pelo formulário, 076 salvo, ficha e linha do tempo mostram os dados e as duas alterações; dados de teste do animal 22 e as linhas de histórico removidas depois. Exportação BND/PNIB e GTA ficam para a Fase 4.
- **Fase 2: sessão de identificação de lote** (migrations `20261016170000`, `20261016180000`, `20261016190000`; as duas últimas corrigem o subtipo e o texto do ajuste): RPC `identificar_animais_lote(p_fazenda_id, p_lote_id, p_categoria, p_animais jsonb, p_raca_padrao, p_confirmar, p_ajustar_excesso, p_data)` cria indivíduos de uma categoria de um lote **sem gerar movimentação** (os animais já estão no agregado; cadastrar pelo formulário somaria em dobro). Validar (padrão) não grava nada e devolve plano, erros por linha e "X de Y"; gravar é tudo ou nada (erros: identificador ausente ou repetido na lista, brinco/chip/manejo já cadastrado, SISBOV inválido ou duplicado, peso/datas inválidos). Capacidade: confirmados + novos <= quant_atual; se passar, só grava com `p_ajustar_excesso` e então registra UMA Entrada de ajuste só do excesso (subtipo NULL, pois `tipo_movimentacao_subtipo` é enum sem esse valor; a identificação é por `causa_observacao` 'Ajuste de inventário: ...'); faltantes não geram ajuste nem baixa. Criados: Vivo, origem 'Cadastro Manual', categoria com o nome do domínio, sexo da categoria quando único, raça padrão, herança nutricional como no formulário; limite de 2000 por chamada. Front: tela `/controller/individuos/identificar` (botão "Identificar lote"), hook `useIdentificarLote`, util `parseListaAnimais` (cola ou arquivo CSV/TXT; separador ; , ou tab; com ou sem cabeçalho; 5 testes). Validado na fazenda de testes: no banco (bloco desfeito) validar, erros por linha, gravar com erro recusado, gravação sem mexer na contagem (60→60, movimentações 33→33, indivíduos +3), excesso recusado sem ajuste e aceito com ajuste (novilha 0→3), categoria fora do lote e outra fazenda recusadas; na tela, erro "Linha 3: brinco já cadastrado" bloqueando o Gravar, gravação de 2 garrotes (contagem 60 e movimentações inalteradas) e excesso com caixa de confirmação (Gravar só habilita depois de confirmar; novilha 0→2 com Entrada de ajuste de 2); dados de teste removidos e contagens recalculadas. Fora do escopo desta etapa: identificação no PWA (bastão RFID; exige store IndexedDB e sync), importação XLSX e baixa automática de faltantes.
- **Fase 3.1: tela "Animais identificados" na movimentação** (só front, sem migration): na página de detalhes da movimentação (`MovimentacaoDetalhes`), as apartações por contagem entre lotes (Saída/Entrevero, sem OS, 1 categoria, mesma regra da RPC `movimentacaoAceitaAnimais`) ganham a seção que lista os animais já informados (botão Desfazer) e permite marcar mais, até o total de cabeças, com busca e a opção de confirmar os demais identificados da origem. Usa `vincular_individuos_movimentacao` e `desvincular_individuo_movimentacao`; candidatos = Vivos nos lotes de origem/destino com a mesma categoria canônica (`categoria_canonica` via RPC), ainda não ligados. Arquivos: `hooks/useMovimentacaoAnimais.ts`, `components/AnimaisDaMovimentacao.tsx`. A quantidade da movimentação não muda. Validado na fazenda de testes com apartação de 1 garrote (Lote B → Lote A): só o brinco 33 foi listado (11 e 22 filtrados por categoria), informar moveu o 33 ao Lote A com localização confirmada, Desfazer devolveu a incerto; depois movimentação estornada, 33 de volta ao Lote B, linha garrote criada no Lote A removida e contagens recalculadas (Lote A boi gordo 122, Lote B garrote 60). Ainda não existe o campo "quais animais" na morte/venda/maternidade nem a obrigatoriedade no modo individual.
- **Fase 3.2: pesagem individual sugere o peso do agregado** (só front, sem migration): o `peso_atual_kg` do animal já é atualizado pelo gatilho de `registros_pesagem` (com origem e data), e o peso do agregado continua mudando só por `corrigir_peso_categoria` (histórico em `peso_correcoes` e recálculo do consumo). Para não criar um segundo escritor, o modal "Corrigir peso" (`CorrigirPesoModal`, aberto em Lotes > Editar > categoria) ganhou o bloco "Pesagens individuais recentes": média simples dos animais Vivos do lote, com localização confirmada, `peso_atual_origem = 'pesagem'`, da mesma categoria canônica e pesados nos últimos 30 dias, com nº de animais, % do lote, intervalo de datas e aviso de amostra pequena (< 10% do lote). O botão "Usar esta média" só preenche peso, data (pesagem mais recente da amostra) e motivo; a gravação segue exigindo "Confirmar correção". Arquivos: `utils/pesoAmostraCategoria.ts` (4 testes), `hooks/useAmostraDePesoCategoria.ts`. Validado na fazenda de testes: com o animal 22 a 470 kg (14/10), a tela mostrou 470,00 kg em 1 animal (1% do lote) e preencheu os campos; cancelado sem gravar (agregado 450 kg, 0 correções) e peso do animal restaurado (450 kg, 17/09). Fora do escopo: derivar `peso_atual_kg` do animal por última pesagem + GMD (hoje o cron de peso já projeta), pesagem em massa e pesagem individual no PWA.
- **Fase 3.3: informar qual animal morreu numa morte já registrada** (migration `20261016200000`, só duas funções novas): `vincular_individuo_morte(p_fazenda_id, p_morte_id, p_individuo_id)` e `desvincular_individuo_morte(p_fazenda_id, p_morte_id)`, restritas ao painel. Servem às mortes sem `individuo_id` (PWA que ainda não atualizou, animal fora do cache, morte lançada só por contagem), que baixaram o agregado mas deixaram o animal Vivo e aparecem como "a mais" na conciliação, já que o gatilho `trg_registros_morte_baixa_individuo` só age em INSERT/estorno. Vincular: morte ativa e sem animal; animal Vivo da fazenda, da mesma categoria canônica e, havendo lote nos dois lados, no lote da morte (ou com localização incerta); grava `individuo_id` e baixa o animal (Morto, `data_saida` = data da morte, motivo 'Morte') sem tocar no agregado. Desvincular devolve o animal a Vivo, só se foi essa morte que o baixou. Front: bloco em `RegistrosMorteDetalhes` (`components/AnimalDaMorte.tsx`, `hooks/useAnimalDaMorte.ts`) com busca, escolha do animal e "Desfazer ligação"; extraído `utils/categoriasCompativeis.ts`, que passou a ser usado também pela movimentação e pela amostra de peso. Validado na fazenda de testes: no banco, como controller, em bloco desfeito (categoria errada recusada, vincular baixa sem mudar a contagem, repetir recusado, desvincular devolve a Vivo); na tela, só o brinco 22 apareceu como candidato (o 55 está em outro lote), informar baixou o animal e Desfazer o devolveu a Vivo; morte de teste estornada e contagem recalculada (Lote A boi gordo 122, 22 animais vivos). Venda: o animal já vai pela OS (`individuo_id` na pesagem), então não precisa dessa tela; maternidade fica para depois.
- **Decisão de 16/10/2026: agregado permanente, nível de qualificação calculado, nada obrigatório** (supera a Fase 1.2 e o item "obrigatório no modo individual" da Fase 3). Premissas do gestor: todas as fazendas do Manejus operam por agregado (quantidade, peso médio e consumo do `lote_categorias` são médias conhecidas, não derivadas de indivíduos); fazenda nova nunca começa identificada; a identificação é uma camada que se acrescenta aos poucos, e os dois modos coexistem. Consequências: (1) o `quant_atual` nunca será calculado pelos indivíduos, nem em lote 100% identificado (removida a opção "modo individual completo" do plano); (2) nenhum evento exige informar animais, e falta de animal vira sugestão na conciliação; (3) o modo manual `lotes.modo_identificacao` (migration `20261016130000`) ficou sem uso: coluna, trigger e RPC `definir_modo_identificacao` seguem no banco, sem consumidor (618 lotes, todos `agregado`; PWA e demais funções não o leem), a remover por migration própria depois de aprovada; (4) o nível é calculado a partir de `vw_lote_categoria_identificacao`: só contagem (nenhum identificado), parcial (algum), completo (toda categoria com cabeças com confirmados >= quant_atual e sem divergência); localização incerta e divergência são sinalizações separadas. Também ficou registrado que dieta e consumo do animal vêm do lote e devem ser rotulados "do lote", nunca como medição individual.
- **Qualificação e pendências na conciliação** (só front, sem migration): `utils/conciliacaoIdentificacao.ts` ganhou `qualificacaoPorLote` e `resumirQualificacao` (9 testes no arquivo); `utils/pendenciasSemAnimal.ts` (4 testes) seleciona mortes sem animal em lote/categoria com identificados e apartações (90 dias) que ainda deixam incertos e têm menos animais informados que cabeças; `usePendenciasSemAnimal` e `useConciliacaoLotes` (agora traz todas as categorias, não só as com identificados). A tela de conciliação perdeu o seletor de modo e passou a mostrar "X de Y cabeças identificadas (Z%)" da fazenda, a lista "Qualificação dos lotes" (nível, percentual, selos de incerteza e divergência) e "Informar quais animais" com links para a morte e a movimentação. Validado na fazenda de testes com uma morte sem animal e uma apartação parcial (Lote B → A): as duas apareceram como sugestão; o Lote C (novilha 0 × 1 identificado) apareceu "Completo + Divergência", o que levou à regra de que lote com divergência não é completo (teste adicionado). Dados de teste restaurados (Lote A 122, Lote B 60, 22 vivos, 0 incertos).
- **Ficha do animal: dieta do lote e mudanças de dieta na linha do tempo** (só front, sem migration): `hooks/useDietaDoLote.ts` lê `planos_nutricionais` do lote atual do animal (planos do lote inteiro e os da categoria dele, pela categoria canônica) e `utils/dietaDoLote.ts` (6 testes) escolhe a dieta vigente (`planoVigenteNaData`), as dietas encerradas e os eventos de início/fim de dieta. Na aba Resumo, a seção "Dieta do lote" mostra plano, formulação, desde quando, GMD planejado e peso meta, com o aviso de que é a dieta do lote e não uma medição individual; a antiga "Nutrição (herdada do lote)" virou "Nutrição registrada no cadastro". Na linha do tempo entram as mudanças de dieta com o selo "Do lote", só as ocorridas depois da última entrada conhecida do animal no lote (cadastro, movimentação ou nascimento) e até a saída ou hoje; é uma aproximação, porque o animal só guarda o lote atual. Validado na fazenda de testes com dois planos temporários na categoria do Lote A (um encerrado, um vigente): Resumo e linha do tempo corretos, incluindo o filtro por data de entrada; planos removidos.
- **Aviso de duplicação no cadastro de animal**: ao escolher um lote no formulário de Novo indivíduo, aparece o aviso de que o cadastro por ali soma 1 cabeça (uma Entrada) e o atalho para "Identificar lote", que cadastra sem mudar a contagem (`IndividuoNovo.tsx`).
- **Verificação de regressão do agregado (16/10/2026, somente leitura)**: não há captura "antes" de todas as fazendas, então foram feitos testes de consistência. (1) Escritas das camadas novas fora da fazenda de testes: 0 pontes `evento_individuos`, 0 ajustes de inventário, 0 `peso_correcoes`, 0 lotes com modo diferente de `agregado`; os 39 incertos fora dela são os autorizados na 0.7. (2) Auditoria desde 15/10 fora da fazenda de testes: as únicas escritas em `individuos` foram o backfill de `peso_atual_origem`/`peso_atual_data` (332 + 8 campos, migration `20261015210000`), os 39 incertos, as duas linhas de numero_partos pela rotina de maternidade e o ajuste autorizado da 0.7; não houve escrita das nossas rotinas em movimentação, morte ou agregado. (3) Uso real depois das migrations: uma apartação de 45 garrotes lançada em Jacamim por usuária real em 15/10 deixou o agregado consistente (quant_atual 179 e 600, iguais ao recalculado pelos eventos). (4) O teste "quant_atual guardado = `calculate_quant_atual`" NÃO vale como prova geral: acusa 43 de 770 categorias, quase todas com `quant_atual` nulo ou carga inicial (`quant_inicial`) sem eventos, com `updated_at` de maio e agosto, ou seja, anteriores ao nosso trabalho; só serve onde o lote nasce de eventos (fazenda de testes). Pendente: capturar, antes de promover, uma foto de `quant_atual`, `peso_vivo_atual_kg_cab` e consumo por categoria para comparar depois.
- **Foto do agregado e remoção do modo manual (16/10/2026)**: (1) Foto de referência para comparar antes de promover à produção, em `backup.regressao_lote_categorias_20261016` (883 categorias: quant_inicial/base/atual, peso vivo atual, data de ajuste, GMD, consumo, idade), `backup.regressao_suplementacao_20261016` (1.722 registros: n_cabecas, peso_vivo_kg e consumos) e `backup.regressao_eventos_20261016` (contagem de movimentação, morte e maternidade por fazenda); 64.449 cabeças ativas no momento. Para comparar: juntar pela `id` e checar `quant_atual`, `peso_vivo_atual_kg_cab`, `data_ajuste_peso` e os consumos; diferenças só são esperadas onde houve evento real depois da foto. Depois da migration a comparação deu 0 categorias novas e 0 alteradas. (2) Migration `20261016210000_remove_modo_identificacao_manual` (rollback em `supabase/rollbacks/`): removidos o gatilho `trg_lotes_valida_modo_identificacao` e sua função, a RPC `definir_modo_identificacao`, a constraint e a coluna `lotes.modo_identificacao`, com trava que aborta se algum lote tivesse modo diferente de `agregado` (eram 618, todos `agregado`). Nenhuma view, função ou código do painel/PWA lia a coluna. Verificado depois: coluna, funções e gatilho ausentes, 618 lotes, conciliação ("13 de 416 cabeças identificadas") e lista de lotes carregando.
- **Divergências B e C resolvidas sem mexer no agregado (16/10/2026, autorizado pelo gestor)**: as 8 linhas de produção com mais identificados confirmados que cabeças contadas (Chibiu Maternidade 1 e 2; Fazenda Marcon Lote 123; Fazenda Chibata LOTE 11; Olho D'Água Lote 5; todos lotes ativos e sem `deleted_at`, os da Marcon e da Chibata com plano nutricional ativo) tiveram os **111 animais** identificados dessas categorias marcados com `localizacao_incerta_desde` = 16/10/2026 (Chibiu 48, Marcon 56, Chibata 4, Olho D'Água 3), e sem alterar mais nada: pela auditoria, o único campo alterado nas 111 linhas foi `localizacao_incerta_desde`; identificação, lote, categoria e status intactos. Escolha do gestor entre ajustar o agregado, ajustar o cadastro ou marcar como incerto: marcar como incerto, porque não mexe em quantidade, consumo, trato nem plano. Backup: `backup.individuos_incerteza_20261016` (id, fazenda_id, lote_atual, categoria, `localizacao_incerta_desde_anterior` = NULL, lote_nome, categoria_lote). Para reverter: `UPDATE individuos SET localizacao_incerta_desde = NULL WHERE id IN (SELECT id FROM backup.individuos_incerteza_20261016)` (por fazenda). Execução: um bloco por fazenda, cada um abortando se a contagem divergisse da autorizada. Verificação: divergências fora da fazenda de testes de 8 para 0 (resta só o Lote C de teste), agregado idêntico à foto de regressão (0 categorias alteradas ou novas). Os animais voltam a "confirmados" com pesagem no lote ou pelo botão de confirmar localização na ficha. A causa de origem (cadastro de mãe e cria criando indivíduos que o agregado não conta, e cargas em bloco em 25/08 e 27/08) segue sem investigação.
- **Investigação da origem dos 111 animais a mais (16/10/2026, somente leitura)**: (1) **Marcon, Lote 123 (56 animais = 28 mães + 28 crias)**: os 28 partos (04/08 a 27/08) foram todos excluídos (`deleted_at` em 27/08) e os 56 indivíduos criados por eles seguiram Vivos; é o único caso do banco (56 indivíduos Vivos cujos partos foram todos excluídos) e o agregado do lote nunca os contou (categorias criadas em 25/09 e 02/10). Causa no código: todos os gatilhos de `registros_maternidade` são AFTER INSERT (`trg_maternidade_create_individual`, `trigger_ensure_mother_from_maternidade`, `trigger_update_quant_atual_maternidade`...); excluir um parto não desfaz os indivíduos da mãe e da cria. A morte tem estorno (`trg_registros_morte_baixa_individuo`) e a maternidade não. (2) **Chibiu, Maternidades 1 e 2 (48)**: 34 vacas cadastradas manualmente em 25/08 em ~45 min (formulário/carga), das quais poucas ligadas a partos (17 partos ativos tocam esses animais); as categorias de vaca dos lotes têm `quant_inicial` 5 e 2, sem nenhuma movimentação (0), então o agregado nunca contou essas vacas; mais 14 bezerros por partos reais (27 partos no Maternidade 1, agregado 13). Interpretação provável: vacas passam pela maternidade sem Entrada/Saída por contagem, enquanto o parto cria a mãe no lote do parto e ela nunca sai. (3) **Chibata LOTE 11 (4) e Olho D'Água Lote 5 (3)**: excessos de 1 a 2 cabeças em bezerros nascidos por parto (5 e 7 partos registrados), ainda sem causa fechada. Nada foi alterado nesta investigação.
- **Fase 3.4: confirmar localização em massa na lista de indivíduos** (só front, sem migration): a lista (`Individuos.tsx`) ganhou caixas de seleção nos animais com localização incerta (tabela e cards), "selecionar os incertos da página" no cabeçalho e uma barra "Confirmar localização" que agrupa a seleção por lote atual (`utils/confirmacaoLocalizacao.ts`, 3 testes) e chama `confirmar_localizacao_individuos` uma vez por lote (`hooks/useConfirmarLocalizacaoEmMassa.ts`). Confirma que os animais continuam no lote em que constam: tira a marca de incerteza e não altera a contagem do lote nem cria evento; serve, por exemplo, para as fazendas confirmarem de uma vez os animais que de fato estão no lote entre os 111 marcados em 16/10. A seleção vale só para a página e os filtros atuais e some ao recarregar. Validado na fazenda de testes: 2 animais marcados como incertos, selecionados pelo cabeçalho e confirmados (toast, caixas e barra sumiram, banco com incerteza nula e mesmo lote); dados de teste ficaram como estavam.
- **Pendências conhecidas:** Descarte fica com status `Doado` porque o CHECK de `individuos.status` não tem `Descartado`; o plano completo de coexistência agregado × indivíduo (modo de identificação por lote, conciliação, ponte evento→animais, SISBOV/PNIB) ainda não foi implementado.

## Relatório Zootécnico: ordem por local e colunas configuráveis; Lotes: filtro Sequestro e busca em Pasto/Curral (2026-10-15)

Só front (`apps/manejus`), sem migration.

- **Ordem do Relatório Zootécnico** (`features/relatorioZootecnico/colunas.ts`, `dividirPorManejo`): dentro de cada seção, ordem alfabética (pt-BR, numérica) pelo curral e, sem curral, pelo pasto; desempate pelo lote; sem nenhum dos dois, no fim. O PDF e o Excel usam a mesma função e herdam a ordem.
- **Colunas na tela** (`RelatorioZootecnico.tsx`, `configColunas.ts`): cada coluna tem `id` estável (os headers MN/MS/%PV se repetem). Reordenar só por arrastar o título; ocultar pelo ícone de olho riscado, Delete com o título focado, ou Shift+clique na primeira e na última coluna de um intervalo (barra no rodapé com Ocultar/Cancelar, Enter/Delete/Esc). Colunas ocultas viram chips "+ Nome" acima da tabela; "Restaurar padrão". Sempre sobra ao menos uma coluna. PDF e Excel **não** seguem essa configuração.
- **Predefinições** (`predefinicoesColunas.ts`, `components/relatorios/PredefinicoesColunasZootecnico.tsx`): salvar, aplicar, atualizar e excluir combinações de ordem + ocultas. Persistência em `localStorage` por usuário e fazenda (chaves `zootecnico-colunas:*` e `zootecnico-predefinicoes:*`), portanto não acompanham o usuário entre navegadores; levar ao banco exigiria tabela nova (migration). Ids removidos são descartados e colunas novas entram no fim da predefinição antiga.
- **Lotes:** filtro "Sequestro" (cor stone) entre Confinamento e TIP (`LoteFilters.tsx`, `Lotes.tsx`). Dropdown de Pasto/Curral do formulário virou `components/lotes/SelectPesquisavel.tsx` (busca sem acento, ↑/↓/Enter/Esc, portal). Corrigido o bug em que a lista abria no topo da tela: focar o campo antes de posicionar o portal rolava a página; agora posiciona em `useLayoutEffect` e foca com `preventScroll`.
- **Pendência conhecida:** o selo do card de lote (`LoteCard.tsx`) mostra "Confinamento" para lotes em Sequestro.

## Vercel monorepo: ignoreCommand por app (2026-10-15)

Todo push buildava `farmplan` e `vision`. Causas: (1) em `apps/manejus/vercel.json` e `apps/vision/vercel.json` o `ignoreCommand` estava dentro de `"git": {...}`, chave que a Vercel não lê para isso; `ignoreCommand` é propriedade de **nível superior** do `vercel.json`; (2) `apps/farmplan/vercel.json` não tinha `ignoreCommand`. Corrigido movendo para o nível superior e acrescentando ao farmplan (`git diff --quiet ${VERCEL_GIT_PREVIOUS_SHA:-HEAD^} HEAD -- .`). Semântica: exit 0 pula o build, exit 1 builda; se o SHA anterior não existir no clone, o `git diff` falha (≠ 0) e o build roda (falha para o lado seguro). manejus e vision também observam `../../packages`, `pnpm-lock.yaml` e `pnpm-workspace.yaml`. Simulado localmente com um commit só de manejus + docs: farmplan e vision saem 0 (pulam), manejus sai 1 (builda). Só vale para `vercel.json` do Root Directory de cada projeto; o Ignored Build Step do painel da Vercel é sobrescrito por ele. Confirmar no primeiro push em staging que os deploys de farmplan e vision aparecem como "Canceled/Ignored".

## Folha de trato: layout adaptativo e páginas equilibradas (2026-10-15)

Impressão de `pages/controller/LancamentoTratos.tsx` (`FolhaTratoImpressao`) e bloco "Folha de Trato" de `index.css`. Só front, sem migration. Motivo: a folha comportava ~10 currais por página (célula Real fixa em 13 mm) e fazendas com 40+ currais saíam em muitas folhas; o peão escreve e confere à mão, então o campo Real precisa continuar grande.

- **Orientação por nº de tratos** (`utils/folhaTratoLayout.ts`, + testes): até 2 tratos em retrato, 3 ou mais em paisagem. O `@page` é injetado pelo componente (CSS puro não o torna dinâmico); o `@page` fixo saiu do `index.css`.
- **Altura da linha adaptativa** via `--trato-linha-h`, de 13 mm (poucos currais, como antes) até 8 mm (mínimo legível). Usa a maior altura em que tudo cabe numa página.
- **Paginação equilibrada** quando nem a 8 mm cabe: 45 currais em retrato viram 23 + 22. Cabeçalho completo só na 1ª página; as demais repetem o `thead` e mostram data e "Página x/y". Linhas com `break-inside: avoid`.
- **Colunas:** informativas redimensionadas (Dieta 28 mm e Lote 26 mm para a dieta caber em 2 linhas; Prev. 12 mm para não quebrar "1.202,7"); sobra toda para as colunas Real. Cabeçalho (logos, título) mais enxuto.
- **Verificado** com a folha TIP da Fazenda Jacamim (43 currais, 3 tratos): 3 páginas de paisagem (17/17/15) em vez de 6. Primeira tentativa com colunas estreitas demais quebrava Dieta em 4 linhas e dobrava as folhas; corrigido ao alargar Lote/Dieta.
- **Limite conhecido:** a capacidade é estimada pelas constantes de `folhaTratoLayout.ts`; nomes de lote/dieta muito longos podem crescer a linha e empurrar um curral para a página seguinte.

**Revisão (2026-10-15): sempre retrato, até 50 currais por folha.** A regra de orientação por nº de tratos foi removida (`orientacaoFolhaTrato` não existe mais; `@page` é sempre `A4 portrait`, margem 5 mm, `MARGEM_FOLHA_MM`). Linha mínima caiu de 8 para 5 mm (`LINHA_MIN_MM`), o que comporta 50 currais numa página (`CURRAIS_POR_FOLHA_ALVO`); acima disso a paginação equilibrada continua (80 currais viram 40 + 40). Fonte da tabela acompanha a linha (`--trato-fonte`: 7,5/7/6,5 pt). Colunas informativas em mm com escala `--trato-k` (`escalaColunasInfo`), que só encolhe quando há muitos tratos, para o campo Real nunca ficar abaixo de 10 mm; Dieta 30 mm. Células do corpo em linha única (`nowrap` + reticências), então lote/dieta longos são cortados em vez de crescer a linha. Cabeçalho (logos 6 mm, título 12 pt) mais compacto. Trade-off assumido a pedido: com 5 mm o campo Real fica pequeno para escrita à mão. **Verificado** com a folha TIP da Fazenda Jacamim (49 currais, 3 tratos, data 15/10/2026): 1 página, conteúdo de ~272 mm dos 287 mm úteis, linha de 5 mm, campo Real de 14,6 mm. A conferência foi numa prévia em tela com as regras de `@media print`, não numa impressão física.

## Auditoria 5S: pendências, nota do setor e novo detalhe (2026-10-15)

Migration `20261015140000_auditoria_5s_pendencias_nota` em `registros_auditoria_5s`: `nao_conformidades jsonb` (`{chave: {observacao, foto_url, pendencia?: {situacao, desde}}}`), `nota_geral smallint` com CHECK 0 a 5 (nula nos registros antigos) e índice `(fazenda_id, setor_id, data desc)`. Rollback em `supabase/rollbacks/`.

- **Pendências** (`features/pendencias5s/calculo.ts`, cópia da regra do PWA em `utils/pendencias5s.ts`, mesmos testes): derivadas do histórico por setor + item, sem tabela. `N` abre, `C` fecha, `NA` ignora. Aba "Pendências" em `pages/controller/Auditoria5s.tsx` (`Auditoria5sPendencias.tsx`): KPIs, filtros por pilar/setor/prazo, XLSX, resolvidas dos últimos 30 dias.
- **Nota:** KPI "Nota média do setor" (`notaMedia` em `agregacao.ts`, a nota 0 conta), coluna na lista e no XLSX.
- **Detalhe** (`Auditoria5sDetalhes.tsx`): redesenhado em cabeçalho com indicadores, "Não conformidades" em destaque (foto, observação, selo de pendência) e cartões compactos por pilar. Botão "Ver evolução do setor".

### Auditoria 5S: visão geral e visão por setor (2026-10-15)

`pages/controller/Auditoria5s.tsx` virou orquestrador com 4 abas e estado na URL (`?aba=geral|setor|pendencias|auditorias&setor=<chave>`): **Visão geral** (macro), **Por setor** (micro), **Pendências** e **Auditorias**. Filtros de período (30 dias / 90 dias / 12 meses / tudo, padrão 12 meses) e responsável valem para geral, setor e lista; as pendências são sempre o estado atual (histórico inteiro).

- **Visão geral:** KPIs (inclui nota média e pendências abertas), cartões por setor (última nota, tendência vs anterior, sparkline, conformidade, pendências, "última auditoria há N dias", âmbar acima de 30), evolução comparada multi-setor (nota ou conformidade, por mês ou semana, chips para escolher setores, linha da média da fazenda), mapa de calor setor × pilar, ranking ordenável com XLSX, cobertura (sem auditoria / auditoria antiga), pilares e itens críticos com nº de setores afetados.
- **Por setor:** KPIs do setor (com comparação com a média da fazenda), evolução da nota e da conformidade por auditoria (clicar no ponto abre a auditoria), pilares ao longo do tempo, pilares setor × fazenda, inconformidades do setor (abertas primeiro, situação aberta/resolvida), pendências do setor (componente `Auditoria5sPendencias` em modo `compacto`) e histórico.
- **Camada de dados pura** em `features/relatorioAuditoria5s/porSetor.ts` (+ testes). A chave do setor (`chaveSetor`: `setor_id` ou nome em minúsculas) é a mesma das pendências (`setorChave` em `pendenciasPorSetor`), então cartão e pendência falam do mesmo setor; setor renomeado mantém o histórico pelo id. Nota 0 conta; auditoria antiga sem nota entra na conformidade, não na nota.
- **Carga paginada:** `hooks/useAuditorias5s.ts` + `features/relatorioAuditoria5s/paginar.ts` percorrem as páginas de 1.000 linhas do PostgREST (antes a consulta `select('*')` truncaria o histórico em silêncio); só as colunas usadas.
- **Verificado:** `tsc`, `vitest` (346 testes), lint (159 avisos, teto 161) e navegador (chrome-devtools) com 30 auditorias de teste em 6 setores na Fazenda Gesta'Up (marcador `responsavel = 'Seed E2E'`): cartões, ordenação, comparativo, mapa de calor, ranking, clique para o setor, URL com reload, estados vazios, setor com uma só auditoria, filtro de pendências por setor (contagem 19 = soma dos cartões), mobile 390 e tema escuro.

## Cadastro de lotes: Sistema de Produção antes de Pasto/Curral (2026-10-15)

No modal de `Lotes.tsx`, o campo "Sistema de Produção" passou a vir antes de "Pasto/Curral". Trocar o sistema zera `pasto_id`/`curral_id` (o campo alterna entre Pasto e Curral via `usaCurral`), então quem escolhia o pasto primeiro o perdia. Só mudou a ordem no JSX; o reset e a validação continuam iguais.

Ajuste seguinte: trocar o sistema (ou o campo de pasto/curral) deixou de zerar `pasto_id`/`curral_id` no estado do formulário. Antes, sair de Confinamento e voltar perdia o curral até reabrir o modal. O salvar já ignora o campo que não vale para o sistema escolhido (`pasto_id` vira null em Confinamento/TIP e `curralNovo` em pasto), então manter os dois valores no estado é seguro.

## Detalhes do carregamento de vagão: layout e insumos agrupados (2026-10-15)
Tela `pages/controller/FabricaConfinamentoDetalhes.tsx`. Só front, sem migration.
- Cabeçalho com data, nº do trato, tipo e usuário; status virou selo (Concluído/Em aberto). Três cartões: Previsto, Produzido e Diferença (kg e % do previsto; neutro até ±2%, âmbar abaixo, vermelho acima). Vagão, Formulação e Capacidade (com % ocupado, ou "≈ N cargas (estimativa)" quando o previsto passa da capacidade).
- **Insumo repetido = várias cargas de vagão.** Conferido em leitura na Fazenda Arizona (registro de 15/10, tipo sequestro): 40 linhas = 10 insumos × 4 pesagens; total previsto 7.382,60 kg contra vagão JF MIX 8000 de 3.000 kg. Registros de confinamento têm 10 linhas (1 carga). `registros_fabrica_confinamento_insumos.ordem` é a posição do insumo na formulação, não o nº da carga, e não existe campo que identifique a carga.
- Tabela agrupada por insumo (chave `ordem|nome`): Previsto, Produzido e Diferença somados, "· N pesagens" e detalhe recolhível "Pesagem 1..N" (a ordem das pesagens não é garantida), linha de Total. Estado vazio e aviso de falha ao buscar insumos; `loading` encerra quando não há fazenda.
- Pendente: warning `react-hooks/exhaustive-deps` em `loadRegistro` (já existia) quebra `lint --max-warnings 0`.

## POPs personalizados por fazenda: lado do painel (2026-10-14)
Os botões amarelos de POP do PWA abriam só imagens fixas de `public/docs`. Agora a fazenda sobe o próprio POP em Configurações; o PWA ainda não consome (próxima etapa).
- Migration `20261014180000_fazenda_pops` (+ rollback): bucket público `pops` (10 MB, jpeg/webp/png, escrita por pasta `{fazenda_id}/` via `user_has_fazenda_access`) e tabela `fazenda_pops` (`slug` em maternidade, pastagens, cocho, bebedouros, fezes, escore; `ordem`, `path`, `versao`, `deleted_at`). Sem linhas para o slug, o PWA mantém o padrão (retrocompatível).
- Painel: `components/pops/PopsConfig.tsx` (seção em `Configuracoes.tsx`), `services/popsService.ts` (substitui o POP inteiro: sobe as novas páginas, troca as linhas, só então apaga as antigas; "restaurar padrão" faz soft-delete), `features/pops/` (regras e testes) e `paginas.ts` (PDF via `pdfjs-dist` ou imagens JPG/PNG/WebP, retrato A4, convertidas em JPEG de 1240 px).
- Pendente no PWA: `config/pops.ts` + `usePopImages`, `PopButton`, warm cache (IndexedDB + Cache API `pop-images`) para o personalizado aparecer offline desde a primeira atualização.

## Relatório Zootécnico: visualização inline e PDF via Puppeteer (2026-10-14)
Antes só havia exportação Excel. Agora o relatório pode ser visto na tela e baixado em PDF. Sem migration.
- Tela: rota `/controller/relatorios/zootecnico` (`pages/controller/RelatorioZootecnico.tsx`, TanStack Query), tabela com cabeçalho agrupado, linha Geral em destaque, coluna Lote fixa na rolagem, campo de janela (`?dias=`), botões "Baixar PDF" e "Exportar Excel". No card de Relatórios (`Relatorios.tsx`) ficaram três botões: Visualizar, Baixar PDF e Exportar Excel.
- Colunas numa fonte única: `features/relatorioZootecnico/colunas.ts` (`colunasZootecnicas`, `formatarCelula`, `montarTabelaZootecnica`, `FORMATO_EXCEL`). Tela, PDF e Excel leem dela; o Excel só converte data para `Date` e RC para fração. Testes em `colunas.test.ts`.
- PDF: `api/pdf/zootecnico.js` (Puppeteer, A4 paisagem), registrado em `vite.config.ts`. Dois blocos de colunas por causa da largura (detalhes em `ArquiteturaRelatoriosPDF.md`). **Exige token**: o client envia `Authorization: Bearer` e `fazendaId`; o endpoint valida com `createAuthenticatedSupabase` (401 sem sessão, 403 sem acesso à fazenda), como o Infográfico.
- Verificado: typecheck, lint e testes; PDF gerado e conferido pelo usuário em teste manual.
- Ajustes seguintes (mesmo dia): coluna **Curral** (de `currais.lote_id`, 1:1 com o lote) após Pasto; lotes separados em seções "a pasto" (sem curral) e "em currais (confinamento)" (com curral) em tela, PDF e Excel, cada uma com linha de total própria (`Total a pasto`/`Total em currais`, omitida se só há uma seção); PDF com 12 linhas por página, células numéricas sem quebra e colunas de data/R$ mais largas (a data quebrava o "6" de 2026).
- Menos páginas no PDF (2026-10-15): o corte fixo em 12 linhas deixava metade de cada página em branco (Jacamim: 14 páginas). Passou a usar o motor de fluxo (`flowSection`/`flowTable`), com Geral e total no `thead` (repetem por página) e sem página forçada entre blocos e seções; coluna Estratégia nutricional mais larga. Teste local com 24 + 50 linhas: 6 páginas. O teste do HTML agora confere a marcação de fluxo (a paginação roda no Chromium).

## Relatório de consumo: local e dieta do período, selo por tipo e gráfico legível (2026-10-14)
Queixa: o Lote 08 (Fazenda Santa Cecília) mudou de local e dieta em 09/10, mas o relatório de 01 a 30/09 mostrava Baia 2 e Ração Recria Sequestro. Causa: a RPC `get_dados_relatorio_consumo` lia o estado **atual** (`lotes.pasto_id`, `currais.lote_id`, plano ativo hoje, `now()` nos dias), só os pontos de consumo respeitavam o período.
- Migration `20261014140000_relatorio_consumo_historico_periodo` (+ rollback): `local_hist` (`lote_pasto_historico` e `lote_curral_historico` que tocam o período) e `dieta_hist` (`planos_nutricionais` do lote sem categoria que tocam o período, creep segue o fallback). `pasto_nome`/`curral_nome`/`dieta` viram a lista cronológica do período (`A → B → C`); sem histórico no período, vale o local atual. O plano vigente (`pn_lote`) passa a ser o do **fim** do período (inclui encerrados; rascunho = inativo sem `data_fim` fica fora) e `dias`/`dias_total`/data prevista usam `LEAST(hoje, fim do período)`. `info` ganhou `local_label`, `local_historico`, `dieta_historico`.
- Migration `20261014150000_relatorio_consumo_historico_sem_repeticao` (+ rollback): entradas consecutivas iguais viram uma só (gaps-and-islands por local/formulação; intervalo da 1ª entrada à última saída). Motivo: Lotes 01, 02 e 04 tinham dois planos "R/S- Proteinado 0,3% PV" seguidos e apareciam repetidos. Ambas aplicadas por `db push`. Conferido em leitura (RPC com o token de consumo da Santa Cecília, 01 a 30/09): Lote 08 = P.17, `R/S- Proteinado 0,3% PV → R/S-Ração 0,7%`, 12 dias; período completo = `P.17 → Baia 2` e as três dietas.
- Front: os pills de local/dieta deixaram de truncar. O texto corre na horizontal (`P.06 → P.12 → P.13 → Baia 1`), cada etapa é inseparável (`white-space: nowrap`, seta no fim da anterior) e só quebra entre etapas quando falta largura; cada pill pede a largura do próprio texto (`flex: <largura> 1 <largura>px`, estimada por nº de caracteres), então o espaço da linha é dividido na proporção do conteúdo (`RelatorioConsumoPublico.tsx`, `api/pdf/consumo.js`). Primeira versão (uma etapa por linha, `flex: 2`) desperdiçava as laterais e foi trocada no mesmo dia. Pasto+curral no período usa `local_label` (pill "Local").
- **PDF real**: o "Exportar PDF" usa `api/pdf/consumo.js` (Puppeteer), não `gerarRelatorioConsumoPDF` de `relatorioConsumoPDF.ts` (código sem uso, só a definição). O endpoint recebe `local_label` e `tipoManejo`; cada lote leva selo "Pasto"/"Confinamento" no título (todas as páginas, inclusive continuação), o separador de dieta recomeça a cada mudança de tipo e a legenda omite "Leitura Cocho" quando o lote não tem leitura (igual à página pública). Uma faixa "Lotes a pasto/em confinamento" foi testada e retirada por redundar com o selo e gastar altura. O mesmo `renderConsumoHtml` também monta a seção de consumo do relatório mensal geral (`/api/pdf/geral`), mas `features/relatorioGeral/loaders.ts` não envia `tipoManejo`: lá não há selo e os pontos de pasto e confinamento de um lote seguem no mesmo gráfico (ver BACKLOG).
- Rótulos do gráfico do PDF (Chart.js): posições fixas colidiam (CMS, %PV e leitura no pé do gráfico, %PV caía sobre o eixo X). Agora cada rótulo testa candidatas (acima, abaixo, cada vez mais longe), evita marcadores e outros rótulos e nunca desce sobre o eixo X; CMS e %PV têm contorno branco. A Leitura de Cocho saiu da disputa: eixo oculto `y2` mapeado para uma faixa no topo (90 a 98% da altura), bolinha cinza com o número dentro. Margens internas menores (mais altura útil). Conferido gerando o HTML do PDF localmente (`renderConsumoHtml`) com os pontos reais dos Lotes 08, 04 e 02 e abrindo em localhost; um PDF real só depois do deploy.
- Leitura de cocho no confinamento: a Santa Cecília tem **0** registros em `registros_leitura_cocho` (214 em 3 outras fazendas, o PWA grava lá normalmente), e a RPC fixa `'leitura_cocho', NULL` nos pontos de confinamento, então nenhuma fazenda veria leitura ali. Decisão (2026-10-14): o ponto do dia D mostra a nota de **D+1**, a que fecha o consumo de D (a barra de CMS do confinamento já é consumo ajustado por ela). No pasto a leitura plotada é a lida na visita que ofereceu o trato (abertura do intervalo; `calcular_consumo_registro_anterior` não usa leitura, consumo = `kg_cocho ÷ dias ÷ animais`), por isso os dois gráficos não se espelham literalmente. Curral×lote é 1:1 em qualquer instante (`uq_currais_lote_unico`). Migration `20261014160000_relatorio_consumo_confinamento_leitura` (+ rollback), aplicada por `db push`: `conf_pontos.leitura_cocho` = nota de D+1 do curral que recebeu mais oferta em D (mesma escolha de `recalc_consumo_confinamento_dia`; sem leitura em D+1 fica `NULL` e o ponto não é desenhado). Conferido em leitura pela RPC completa: numa fazenda com leituras, 24 de 24 pontos de confinamento com nota (0 a 3); na Santa Cecília, 15 pontos sem nota (esperado, 0 leituras) e os 60 de pasto inalterados.
- Verificação visual (leitura) com login de controller da Santa Cecília no painel local; nenhum dado alterado (o app só registrou o último acesso do usuário no login).

## Consumo de confinamento por lote/dia (2026-10-14)
Fecha a lacuna registrada no Relatório Zootécnico: o confinamento (`registros_oferta_trato`) não tinha cálculo de consumo. Migration `20261014100000_consumo_confinamento_dia` (rollback em `supabase/rollbacks/`).
- Tabela derivada `consumo_confinamento_dia` (unique `lote_id, data`; RLS só de leitura via `usuarios.auth_id`). Granularidade por lote porque um lote pode ocupar mais de um curral no mesmo dia.
- Regra: oferta do dia D = soma de `kg_ofertado_real`. A leitura de cocho é feita antes do 1º trato da manhã, então a leitura de D+1 fecha o consumo de D. Por curral: `consumo = ofertado × LEAST(1, 1 + percentual_ajuste/100)`, com o `percentual_ajuste` de `notas_leitura_cocho_config` (sem coluna nova; valores atuais iguais nas 59 fazendas: −1:+10, 0:+5, 1:0, 2:−5, 3:−10, ou seja, 100/100/100/95/90% do ofertado). Sem leitura de D+1 o dia fica provisório (`leitura_confirmada = false`). Notas ≤ 0 marcam `consumo_piso` (o animal pode ter comido mais que o ofertado).
- Cabeças e peso do dia: `calc_cabecas_peso_lote_em` (`calculate_quant_em` por categoria, sem categorias ao pé; peso na lógica de `recalcular_peso_vivo_lote`, com fallback para peso atual/de início quando não há plano ativo). Dieta: fábrica do trato (maior volume), depois plano ativo, depois `lotes.formulacao_id`. `fora_faixa_pv` sinaliza %PV fora de 2,0–3,5 (só sinaliza, não descarta).
- Recálculo idempotente `recalc_consumo_confinamento_dia(fazenda, lote, dia)`, disparado por triggers em `registros_oferta_trato` e `registros_leitura_cocho`. A exceção do trigger vira WARNING para nunca derrubar o sync do PWA. Mudanças retroativas de cabeças/peso/formulação NÃO disparam: usar `recalc_consumo_confinamento_periodo(fazenda, ini, fim)`. Funções sem EXECUTE para `anon`/`authenticated`.
- Testado na fazenda de testes, em transação desfeita (antes e depois do push): oferta 1.200 kg → 122 cab, 9,84 kg MN/cab; leitura nota 3 → fator 0,90 (1.080 kg); nota −1 → piso; leitura excluída → volta a provisório; edição e exclusão de trato recalculam. Backfill só da fazenda de testes (12 dias, 1 confirmado); nenhuma outra fazenda foi tocada.
- Relatório de consumo ligado (migration `20261014110000_relatorio_consumo_confinamento`, rollback = reexecutar a versão de `20261013100000`): `get_dados_relatorio_consumo` une à série de suplementação os pontos de `consumo_confinamento_dia` (escopo `lote`), só dias fechados (`data < hoje`) e com %PV calculável (o front assume `consumo_percent_pv` numérico e divide pelo nº de pontos), com campos extras `origem`/`leitura_confirmada`/`consumo_piso`. `lotes_disponiveis` e `lotes_com_registros` enxergam lotes só de confinamento. Sem linhas de confinamento a saída é idêntica à anterior (comparado na fazenda de testes, em transação desfeita); com elas, só o Lote A ganhou 2 pontos. O Relatório Zootécnico e o relatório geral passam a incluir confinamento via `get_dados_relatorio_consumo_fazenda`, sem mudança no front. Não comparado em fazenda real (exigiria token em outra fazenda).
- Flag de dia incompleto (migration `20261014120000_consumo_confinamento_dia_incompleto`, rollback restaura as funções anteriores e remove as colunas): `consumo_confinamento_dia` ganhou `tratos_min_curral`, `tratos_esperados` e `dia_incompleto`. Esperado por curral = `GREATEST(maior ordem_trato do dia, programacao_tratos.quantidade_tratos` da `programacao_id` das próprias ofertas`)`; o dia é incompleto se algum curral lançou menos. `get_dados_relatorio_consumo` deixa de incluir dias incompletos (diff de 1 linha sobre a versão anterior). Motivo, medido na Jacamim em leitura: 148 de 302 lotes-dia incompletos, com %PV mediano 2,01 contra 2,41 nos completos (65% dos completos dentro de 2,0–3,5). O dia de entrada do lote com menos tratos também fica marcado (conservador). Testado em transação desfeita na fazenda de testes (lacuna, programação, completar) e reprocessada a fazenda de testes (8 de 12 linhas incompletas).
- Backfill autorizado (2026-10-14) na Fazenda Jacamim (`d8900758-1e41-4855-a55e-17f8e00fea7e`), tabela `consumo_confinamento_dia`, todo o histórico de ofertas (10/09 a 09/10/2026): `recalc_consumo_confinamento_periodo`, em bloco que abortaria se a contagem divergisse de 302. Resultado: 302 linhas, 148 incompletas, 142 no relatório (completas e com %PV); nenhuma linha em outras fazendas além das 12 da fazenda de testes. Só insert na tabela derivada, nenhuma tabela operacional alterada. Reverter: `DELETE FROM consumo_confinamento_dia WHERE fazenda_id = 'd8900758-1e41-4855-a55e-17f8e00fea7e'`. Não foi possível conferir o relatório público (a fazenda não tem link de consumo ativo; criar um token estaria fora do escopo autorizado).
- Backfill autorizado (2026-10-14) em mais duas fazendas, uma por vez, cada uma em bloco que abortaria se a contagem divergisse: **Sementes Tropical - Arizona** (`a6559695-250d-4902-b159-f52a9c1540ab`, 24/09 a 13/10/2026): 149 linhas, 0 incompletas, 9 lotes, 140 no relatório; **Fazenda Santa Cecília** (`a53d7375-15c8-44fe-98d8-90e9f8423c65`, 09/10 a 13/10/2026): 15 linhas, 0 incompletas, 3 lotes, 12 no relatório. A 1ª tentativa no Arizona abortou (esperado 150, deu 149) e foi desfeita: um lote-dia (lote `0c020ae8…`, 06/10) soma 0 kg ofertado e a função não grava dia sem kg; a contagem foi corrigida e reautorizada. As linhas de 13/10 ficam provisórias (sem leitura de D+1) e o relatório só inclui dias passados. Só insert na tabela derivada. Reverter: `DELETE FROM consumo_confinamento_dia WHERE fazenda_id = '<id>'`. Essas são as únicas fazendas, além da Jacamim e da fazenda de testes, com ofertas de trato.
- Pendente: PWA ler da tabela (hoje `calcularCmsPorJanelas` do PWA ignora a nota); o seed da fazenda de testes tem ofertas pequenas e lotes sem categorias, então %PV sai irreal ou nulo ali. Possível bug de isolamento fora do escopo: policies `lch_*` de `lote_curral_historico` comparam `usuario_id` com `auth.uid()` (as demais usam `usuarios.auth_id`).
- Relatório de consumo (público, `RelatorioConsumoPublico.tsx`): filtro "Tipo de lote" (Todos / Pasto / Confinamento) e separação em seções "Lotes a pasto" e "Lotes em confinamento". Só front, sem migration: o card é dividido pela `origem` do ponto (`'confinamento'` vem de `consumo_confinamento_dia`), então um lote com pontos dos dois tipos vira dois cards, sem misturar médias nem gráfico. Lote sem pontos vai para confinamento se tiver curral no cadastro. O gráfico de confinamento não desenha a linha "Leitura Cocho" (sem valor por ponto). O PDF exportado ainda não traz a separação por tipo (resolvido no mesmo dia com o selo por lote, ver "Relatório de consumo: local e dieta do período").
- Fazenda de testes (2026-10-14, só `d649c65e-…`): dados de suplementação zerados (backup em `backup.teste_registros_suplementacao_20261014` 64, `…_oferta_trato_…` 35, `…_leitura_cocho_…` 14, `…_consumo_confinamento_dia_…` 12; movimentações de estoque e fábrica não foram tocadas). Seed novo: 8 dias (06 a 13/10/2026), 4 tratos/dia, 3 lotes (A com 122 cab, B com 60, D com 70), leituras de cocho do dia seguinte com notas variadas; resultado: 24 linhas completas e confirmadas (%PV entre 2,07 e 2,60), todas no relatório. Ajustes de cadastro para o seed: `lote_categorias.quant_inicial/quant_atual` = 70 (Lote D, boi magro) e 60 (Lote B, garrote), e `peso_entrada_kg_cab` = 380 no Lote D. Registros do seed têm `nome_usuario = 'Seed Teste'` e `local_id` começando em `seed-`. Pendência: o teste não cobre lote com pasto e confinamento no mesmo período.

## Lote desativado/excluído libera pasto e curral (2026-10-14)

- Antes só o botão "Desativar" (`Lotes.tsx`, `handleToggleActive`, no front) limpava `lotes.pasto_id` e `currais.lote_id`. Excluir lote (soft-delete), transferência total, SQL direto e importação deixavam o vínculo preso (em 14/10: 33 lotes desativados/excluídos com pasto ou curral em 9 fazendas).
- Migration `20261014130000_lote_desativado_libera_pasto_curral` (+ rollback): trigger `trg_lote_desativado_libera_local` (AFTER UPDATE OF ativo, deleted_at em `lotes`, quando fica inativo ou excluído). Fecha `lote_pasto_historico` explicitamente (o `trg_lotes_pasto_historico` ignora execução aninhada), zera `lotes.pasto_id` e `currais.lote_id` (os triggers normais fecham `lote_curral_historico` e sincronizam indivíduos). Falha vira WARNING. Reativar não restaura o vínculo. Testado na fazenda de testes em transação desfeita: curral, pasto via `ativo=false` e via `deleted_at`.
- Fazenda de testes: 9 lotes liberados (2 pasto, 7 curral), bloco abortaria se a contagem divergisse.
- Produção, autorizado (2026-10-14), tabela `lotes`, só `pasto_id`, 16 lotes desativados/excluídos **sem cabeças ativas**, um por vez, bloco que aborta se a contagem divergir: Doce Ilusão `d54abd92-…` 9, GBJ Mirandópolis `a6640dd6-…` 2, Santa Vitória `867f70e7-…` 2, Chibata `d3965505-…` 1, Jacamim `d8900758-…` 1, LC Garcia `8995a9a4-…` 1 (lote "Lote", Baia 1). 2 históricos de pasto abertos foram fechados pelo trigger. Backups: `backup.lotes_pasto_id_20261014` (id, pasto_id anterior etc.) e `backup.lote_pasto_historico_20261014`. Reverter: `UPDATE lotes l SET pasto_id = b.pasto_id FROM backup.lotes_pasto_id_20261014 b WHERE l.id = b.id` (o histórico reabre pelo trigger; os 2 fechados vêm do backup do histórico).
- Segunda rodada, autorizada (2026-10-14): os 8 lotes desativados que ainda tinham cabeças em categorias ativas (LC Garcia `8995a9a4-…` Lote 0, 2, 3, 5, 6; Fazenda Marcon `c4d13f1f-…` lote "0"; Grupo Corrêa `075f62cd-…` G 01 e JH34). Mesmo método (um lote por vez, aborta se divergir de 8, só `pasto_id`); 5 históricos de pasto fechados pelo trigger; 0 indivíduos vinculados. Efeito esperado: esses pastos passam a aparecer vazios na ocupação (os animais, se estiverem lá, seguem sem lote ativo). Backups: `backup.lotes_pasto_id_20261014_b` e `backup.lote_pasto_historico_20261014_b`. Reverter: `UPDATE lotes l SET pasto_id = b.pasto_id FROM backup.lotes_pasto_id_20261014_b b WHERE l.id = b.id`.
- Estado final: nenhuma fazenda tem lote desativado/excluído com `pasto_id` ou `curral_id` (conferido nas 9 fazendas da prévia).

## Relatório Zootécnico dos Lotes em Excel (2026-10-13)
Réplica do "Controle de Lotes" (PDF `Relatório Zootécnico.pdf`, Fazenda Estrela Jacamim) como exportação Excel em Relatórios (card "Relatório Zootécnico dos Lotes", janela de consumo em dias, padrão 22). Sem migration.
- Código: `features/relatorioZootecnico/agregacao.ts` (linhas por categoria ativa com saldo > 0 + linha Geral ponderada por cabeças; área útil contada uma vez por pasto), `services/relatorioZootecnicoService.ts` (carga + exceljs), testes em `agregacao.test.ts`.
- Fontes: `lotes`, `lote_categorias`, `pastos.area_util_ha`, `v_lote_pasto_ocupacao_atual.taxa_lotacao_ua_ha`, `formulacoes.teor_ms_dieta` e a RPC `get_dados_relatorio_consumo_fazenda` (duas chamadas: desde a 1ª pesagem e a janela). "Valor carcaça (R$/@)" reaproveita `preco_venda_projetado_reais_arroba` (campo já existente no formulário da categoria). Valor de estoque = cab × peso atual × RC ÷ 15 × preço; capital = cab × `preco_custo_cab`; peso de entrada em @ = kg ÷ 30.
- Verificado na fazenda de testes (3 categorias de boi gordo receberam rc 52, preço 310, custo 3.500 via SQL, pois o guardrail do `teste-api.mjs` não grava em `lote_categorias`, que não tem `fazenda_id`): estoque e capital conferem com o SQL. Na Jacamim (só leitura) estrutura, 8.666 cab e contagens de preenchimento conferem.
- Validação na Jacamim (2026-10-14, só leitura): área do Geral 1.075,32 ha (19 pastos de `lotes.pasto_id`) e consumo da janela por lote conferem com o SQL (Lote 01: 26,74 kg MN, 2,80 %PV); %PV é sobre MS e a conta fecha com o peso atual. O consumo vem do RPC, que combina `registros_suplementacao` (pasto) e `consumo_confinamento_dia` (confinamento, derivado de `registros_oferta_trato`), então a Jacamim sai com consumo (45 linhas).
- Ajustes da validação: teor de MS cai para a formulação do plano ativo do lote quando a categoria não tem `formulacao_id` (29 de 74 na Jacamim); custo alimentar 0 vira vazio (insumos sem preço); séries de consumo indexadas por lote+escopo (lote/creep).
- Limitações: nenhuma fazenda de produção tem o preço da @ preenchido (decisão: manter vazio por ora), então valor carcaça/estoque saem vazios; a taxa de lotação vem de `v_lote_pasto_ocupacao_atual` (17 pastos na Jacamim) e a área de `lotes.pasto_id` (19). Avaliado e não adotado: consumo direto de `registros_oferta_trato` (cauda com dias de 2 a 3 ordens e até 166 kg/cab).

## Clima: exportação ajustada e importação por planilha-modelo (2026-10-13)
- Exportação (`CLIMA_EXPORT_CONFIG`): sem a coluna `local_id`; `Choveu` e `Esvaziou Pluviômetros` normalizadas para Sim/Não.
- Importação: botão "Importar planilha" em `RegistrosClima.tsx` (`ImportarClimaModal`, `services/climaImportacao.ts`, `utils/modeloImportacaoClima.ts`). Uma linha por leitura (data + hora), uma coluna "<pluviômetro> (mm)" por pluviômetro ativo; obrigatórias: Data, Hora, Responsável (cabeçalho vermelho com `*`).
- Duplicidade: linha ignorada se já existe registro na mesma data/hora (fuso Cuiabá); `local_id = painel-clima-<fazenda>-<data>T<hora>` (índice único `registros_clima_local_id_key`). Insert direto, sem RPC/migration (a policy da tabela permite).
- Validações no Excel e repetidas na importação: data real e não futura, hora 00:00–23:59, responsável da lista de funcionários ativos, mm 0–500 com até 2 casas, "Choveu = Não" incompatível com mm > 0, temperatura -60..60, umidade 0..100, observação ≤ 500, colunas "(mm)" desconhecidas abortam a importação.
- Não testado no Excel nem importado em fazenda real; testes unitários em `climaImportacao.test.ts`.

## Relatório de consumo: saldo de cabeças pela média do período (2026-10-13)
Lote esvaziado (Lote 2 Descarte, fazenda `f5d64d63…`, `quant_atual = 0` em todas as categorias) não gerava o relatório: a RPC `get_dados_relatorio_consumo` validava e ponderava por `lote_categorias.quant_atual` (saldo de hoje).
- Migration `20261013100000_relatorio_consumo_saldo_medio_periodo` (rollback em `supabase/rollbacks/`): nova `calculate_quant_em(lote, categoria, ate)` (mesma regra de `calculate_quant_atual`, só movimentações com `data < ate`; a original não mudou). Saldo da categoria no período = `ROUND((saldo no início + saldo no fim) / 2)`; sem filtro de datas, início/fim = primeira/última data de registro da série.
- Categorias sem saldo no período saem da ponderação (CTE `cats_pond`); erro só se o lote inteiro não tiver cabeças no período ou faltar peso em categoria com saldo.
- Pill "Nº Cab. Atual" virou "Nº Cab. (média do período)" (página pública, `relatorioConsumoPDF.ts`, `api/pdf/consumo.js`). Campo `n_cabecas_atual` mantido.
- Verificado: Lote 2 passou a retornar 53 cabeças e 38 pontos, sem erro; demais lotes sem erro. Limitação: filtro de categorias segue `ativo = true AND data_fim IS NULL`.

## Manejo de currais no PWA, Fase 4 (2026-10-10)
`PastagensPage` virou um wrapper com seletor **Pastos | Currais** (`?modo=curral`): `PastagensPastoForm` (formulário antigo, intacto) e `PastagensCurralForm` (novo). Cada modo tem rascunho próprio (`pastagens` / `curral`), então alternar não perde dados.
- Curral: saída = currais com lote (lote derivado de `currais.lote_id`, só Confinamento/TIP/Sequestro); entrada = só currais livres e ativos; contagem por categoria, escores e equipe como no pasto. Sem foto/GPS e sem checklist de avaliação geral (itens de pasto).
- IndexedDB 32→33 com store `curral`; sync `curral → registros_curral` (upsert por `local_id`); após criar, o PWA relê a linha e guarda `movimentacaoStatus/Erro` (selo "Troca aplicada/recusada" em `/caderneta/curral/lista`).
- Testado em localhost na fazenda de testes: troca ENS-C1→ENS-C2→ENS-C3 aplicada, histórico com hora, registro com `movimentacao_status = aplicada`; migração 33 confirmada; pasto sem regressão; rascunhos separados.
- Corrigido: `registros_pastagens.equipe_nomes` (mapeador lia só `equipeNomes`). Teste completo em 2026-10-10: pasto P10→P30 (contado Sim, checklist, equipe gravada) e curral D1→Curral 7 (68 de 70 cabeças, histórico com cabeças/peso). Curral cujo lote está inativo/não carrega é bloqueado com mensagem. Pendente: lote ativo de sistema fora de Confinamento/TIP/Sequestro dentro de curral não testado (não há na fazenda de testes); P20 tem 2 lotes na fazenda de testes e a tela de pasto usa só o primeiro.

## Curral × lote 1:1 imposto no banco, Fase 1 (2026-10-10)

Regra: um curral tem no máximo um lote por vez e um lote ocupa no máximo um curral por vez, em qualquer data. Antes, só havia "uma ocupação aberta por curral", e o código tolerava sobreposição pela heurística "maior `data_inicial`". Os dados legados foram limpos antes (seção abaixo, "Limpeza do histórico de ocupação de currais").

**Migrations** (`db push`, uma por vez; rollbacks em `supabase/rollbacks/`):
- `20261010100000_curral_lote_1a1_funcoes`: convenção de datas, `trg_currais_lote_historico`, nova RPC `trocar_lote_curral(p_curral_id, p_lote_id, p_data_entrada, p_kg_mn_dia_dia1)`, `alocar_lote_curral` (delega para a nova, com lock) e `aprovar_solicitacao_novo_lote` (exige curral livre; exceção: transferência total a partir do curral do próprio lote de origem).
- `20261010101000_curral_lote_1a1_constraints`: `EXCLUDE` por curral e por lote (`lch_sem_sobreposicao_curral`, `lch_sem_sobreposicao_lote`, sobre `daterange(data_inicial, data_final, '[]')`), `lch_datas_validas` (`data_final >= data_inicial`) e índice único parcial `uq_currais_lote_unico` em `currais.lote_id`. A migration confere os dados antes e aborta com mensagem clara se houver violação.
- Houve um `db push` bloqueado por `20261009150000_enfermaria_id_manejo` (aplicada no banco por outra frente, presente na `master`, ausente em `staging`): o arquivo foi trazido da `master` para a pasta local, sem commit, só para o histórico casar.

**Convenção de datas** (`data_final` inclusiva): o dia da troca pertence ao lote que ENTRA e o que sai termina em D-1. Liberar um curral sem substituto termina a ocupação em hoje. Ao ocupar, ocupações do curral ou do lote que ainda cobrem hoje cedem o dia: terminam ontem ou são removidas se começaram hoje (nunca tiveram um dia completo; os tratos e leituras ficam gravados). `p_data_entrada` retroativa é aceita se não atropelar o histórico (mensagem em português se atropelar); data futura é recusada.

**Verificado**: ensaio em transação revertida (15 testes: alocar, lote em outro curral, curral ocupado, troca no mesmo dia, retroativa, conflito, futura, mover lote, sem alteração, os 4 bloqueios de constraint e acesso negado) e, depois do push, teste rápido revertido na fazenda de testes. Banco com 110 linhas, 0 sobreposições. **Não testado**: o comportamento de `aprovar_solicitacao_novo_lote` com solicitação real (só compilou) e concorrência real entre duas sessões.

**Código do painel (feito, sem commit até 10/10)**:
- Terceira RPC, `mover_lote_curral(p_lote_id, p_curral_destino_id, p_data_entrada, p_kg_mn_dia_dia1)` (migration `20261010102000_mover_lote_curral`, aplicada em 10/10 com `db push`): move o lote exigindo curral de destino livre. Três RPCs de ocupação: `alocar_lote_curral` (curral livre e lote sem curral), `mover_lote_curral` (destino livre; o lote sai de onde estava) e `trocar_lote_curral` (substitui livremente).
- `Lotes.tsx`: a mudança de curral chama `mover_lote_curral` (antes: liberar e alocar em duas operações não atômicas); a lista de currais do formulário e a do `RevisarNovoLoteModal` mostram só currais livres (mais o do próprio lote; no modal, mais o do lote de origem, por causa da transferência total) e o cache `['currais', fazendaId]` é invalidado.
- `Currais.tsx`: trocar o lote de um curral ocupado usa `trocar_lote_curral` (antes: `UPDATE` direto); a lista de lotes desabilita os que já estão em outro curral ("(no Curral X)").
- `useCurrais` (`packages/shared`) passou a trazer `lote_id`.
- Deduplicações "maior `data_inicial`" removidas em `programacaoTratosService.getOcupacoesNaData`, `lancamentoTratosService` e `acompanhamentoTratosService`: o banco garante no máximo uma ocupação por curral por data.
- Verificado: `pnpm typecheck`, `pnpm lint` (0 erros; sem avisos novos nos arquivos alterados) e `pnpm test` (218 testes) verdes; ensaio revertido da `mover_lote_curral` (4 testes OK). Testado no navegador (localhost, usuário de teste, fazenda de testes) depois do push: Currais (lista de lotes desabilita os que já estão em outro curral ou em pasto; alocar lote em curral livre; trocar o lote de um curral ocupado) e Lotes (lista de currais só com os livres mais o do lote; mover o "Lote C - Novilhas" do Curral C1 para o ENS-C3 e de volta, com ocupação anterior encerrada em D-1 e a de um dia cedida). Efeito conhecido: mudar o curral zera o `kg_mn_dia_dia1` da nova ocupação (dia 1 reinicia por ocupação); no teste o valor do Lote C (540) foi restaurado por UPDATE e o campo Destino do lote (vazio no seed) ficou "Abate".

**PWA (`Caderneta-Digital-Gesta-Up`, bloco A, feito, sem commit até 10/10)**: criado o helper `utils/ocupacaoCurral.ts` (`ocupacaoVigentePorCurral`, com testes) e usado em `TratoConfinamentoPage`, `FabricaConfinamentoPage` e `LeituraCochoPage` (o `diasCocho` ficou determinístico); comentários de `buildLotesLocalMap`, `sw.ts` e `getOcupacoesCurralNaData` atualizados para o 1:1. **Decisão diferente do painel**: no PWA a regra "maior `data_inicial`" foi mantida, só consolidada num lugar, porque as listas de ocupação ficam em cache offline (IndexedDB) e um aparelho com cache anterior à limpeza do histórico ainda pode ter duas ocupações no mesmo curral. Verificado: `tsc`, `lint` (47 avisos, teto 48; nenhum novo), 268 testes e `build`. Efeito visível: o "Dias de cocho" da BAIA 04 da Arizona passa de ~10 para ~44 dias (a ocupação do AR-26-03 agora começa em 27/08).

**Fases 2 e 3 (aplicadas em 10/10 com `db push`, uma por vez; conferidas ao vivo: 0 sem entrada, 0 saídas inválidas, view com 112 linhas, privilégios mínimos, teste real revertido com registro aplicado). Limitação conhecida: um registro de troca datado no MESMO dia em que a ocupação atual do lote começou é recusado (`movimentacao_status = recusada`, "A data de entrada deve ser posterior à entrada da ocupação atual"), porque o histórico só tem datas por ocupação; o registro fica salvo e o motivo visível. A migration da Fase 3 também aperta os privilégios da view da Fase 2 (que herdou TRUNCATE/REFERENCES/TRIGGER por padrão)**: `20261010103000_curral_historico_metricas` (colunas `data_hora_entrada/saida`, `cabecas_*` e `peso_vivo_medio_*` em `lote_curral_historico`, backfill das horas a partir das datas, trigger BEFORE `trg_lch_metricas`, view `v_historico_ocupacao_curral` sem taxa/meta/desvio) e `20261010104000_registros_curral` (núcleo interno `_ocupar_curral` sem checagem de acesso, `trocar_lote_curral` como casca com acesso, tabela `registros_curral` com RLS por `caller_has_fazenda_access`, trigger `processar_movimentacao_curral` que nunca falha o INSERT e grava `movimentacao_status` = aplicada/recusada/ignorada + `movimentacao_erro`). Ensaio em transação revertida: 16 testes OK (backfill, entrada/saída retroativas, view, registro aplica a troca com a hora do registro, `local_id` repetido, destino ocupado, curral de saída desatualizado, retroativo que atropela o histórico, registro sem lote, privilégios, acesso). Painel: `HistoricoOcupacao.tsx` ganhou o modo "Por Curral" (testado no navegador com a view real: colunas sem taxa/meta/desvio, filtro por curral que reduz de 24 para 3 registros do ENS-C1; as visões Pasto e Módulo seguem com as colunas de antes). PWA da `PastagensPage` (Fase 4) ainda não iniciado.

**Pendente**: Novo Lote do PWA só com curral livre (`MovimentacaoPage`; depende de `getCurraisCached` trazer `lote_id`); a funcionalidade de manejo de currais na `PastagensPage` (Fases 2 a 4 do plano); testar `aprovar_solicitacao_novo_lote` com solicitação real; testar as telas no navegador depois do push. A transferência total não libera o curral do lote de origem (fica inativo e preso ao curral, como já era).

**Reverter**: rollback das constraints primeiro (`20261010101000_..._rollback.sql`), depois o das funções.

**Disparador**: quando mencionar `trocar_lote_curral`, `lch_sem_sobreposicao_*`, `uq_currais_lote_unico`, "curral 1:1", troca de lote no mesmo dia ou ocupação de curral retroativa, ler esta seção.

## Limpeza do histórico de ocupação de currais (Jacamim e Arizona), preparo para curral×lote 1:1 (2026-10-09)

Fazendas Jacamim (`d8900758-1e41-4855-a55e-17f8e00fea7e`) e Sementes Tropical - Arizona (`a6559695-250d-4902-b159-f52a9c1540ab`), produção. `lote_curral_historico` tinha ocupações sobrepostas no mesmo curral (troca de lote no mesmo dia com `data_final` inclusiva, linhas duplicadas e de duração zero, lote fechado e reaberto ao editar). Regra adotada: o dia da troca pertence ao lote que tem tratos nele. Preparo para impor 1:1 (ver plano de currais na PastagensPage do PWA).

**Procedimento**: prévia só leitura; backup em `backup.lch_limpeza_20261009` (19 linhas de histórico) e `backup.ptc_limpeza_20261009` (6 vínculos de `programacao_tratos_currais`); ensaio transacional com reversão em cada fazenda; execução em bloco que aborta se a contagem divergir. O trigger `trg_lch_sync_programacao_currais` apaga o vínculo curral→programação em qualquer DELETE de `lote_curral_historico`, então os vínculos removidos foram restaurados do backup na mesma transação (TIP 16 e TIP 18 na Jacamim, BAIA 04 na Arizona). Ensaio geral antes, na fazenda de testes (currais ENS-C1 a C3, `backup.ens_*`).

**Jacamim (4 UPDATEs, 5 DELETEs)**:
- UPDATE `data_final` 08/10 → 07/10: BAIA 02 `1017dbeb…` (Lote DM 2/2) e BAIA 03 `8082cc9c…` (Lote DM 2/4).
- UPDATE TIP 18 `d5418799…` (CF- 02): `data_inicial` 06/10 → 07/10 e `data_final` 08/10 → 07/10. O plano de 07/10 vinha dos tratos da Canastra 2 de 06/10 (1.782 kg); com o "dia 1" corrigido, a folha de 07/10, se reaberta, fica sem sugestão (`kg_mn_dia_dia1` nulo). Registros gravados não mudam.
- UPDATE TIP 19 `99fd8fa3…` (mistura de machos): `data_inicial` 06/10 → 07/10.
- DELETE: TIP 16 `98e74b2b…` (duplicata de Canastra 1), `f86b84e7…` (Canastra 02, zero dias, sem trato), `1dd54fd3…` (Canastra 2 - B, zero dias); TIP 18 `9980779d…` (duplicata de Canastra 2), `88817d1c…` (Canastra 2 - B, zero dias, repete a aberta `afb18dd4…`).

**Arizona (1 UPDATE, 2 DELETEs)**:
- UPDATE BAIA 04 `9af3676e…` (AR-26-03, aberta): `data_inicial` 30/09 → 27/08, desfazendo o reinício causado por editar o lote.
- DELETE BAIA 04 `a6d82c79…` (27/08 a 30/09) e BAIA 03 `e74c5b0f…` (30/09 a 30/09, passagem de 7 minutos do lote pela BAIA 03; sem vínculo nem tratos).
- Pendente: conferir o "dia 1" e o `kg_mn_dia_dia1` (1.200) do AR-26-03 nos próximos lançamentos.

**Fazenda de testes (`d649c65e-…`, 6 lotes em 2 currais)**: backup em `backup.tf_lch_limpeza_20261009` (12 linhas), `backup.tf_ptc_limpeza_20261009` (8 vínculos) e `backup.tf_currais_limpeza_20261009` (12 currais). Lotes A, B e D (ativos) ficam em A1, B1 e D1 (têm os tratos e leituras); A2, B2 e D2 liberados (`currais.lote_id = NULL`), ocupação até 16/09. L1 Confinamento (inativo) fica no Curral 1 (entrada passa a 01/10), Curral 7 liberado, ocupação até 30/09. L12 fica no Curral 8 (entrada 01/10), Curral 10 liberado até 30/09. L2 Semi-Seca: Curral 2 passa a entrar em 25/09 (o Curral 9 já estava fechado em 24/09). 5 liberações de curral, 5 `data_final`, 3 `data_inicial`, sem DELETE. O trigger removeu os vínculos de programação de A2, B2, D2 e Curral 7 (esperado); os vínculos de A1, B1, D1 e Curral 1 ficaram iguais ao backup. Ficam na fazenda de testes os currais e lotes de ensaio ENS (`ENS-C1..C3`, `ENS-L1..L5`, `backup.ens_*`), usados como massa de teste da Fase 1.

**Verificado**: 12 linhas alteradas nas fazendas reais (5 UPDATEs, 7 DELETEs, 4+5 e 1+2); vínculos de programação iguais ao backup (6). Banco inteiro depois da limpeza: 0 sobreposições por curral, 0 por lote, 0 lotes em mais de um curral, 0 lotes com mais de uma ocupação aberta, 0 datas invertidas. Total de linhas 112 → 105 reais (110 com as 5 de ensaio ENS).

**Reverter**: reinserir as linhas de `backup.lch_limpeza_20261009` (fechadas primeiro, aberta por último, pois o trigger usa a última inserida) e conferir os vínculos com `backup.ptc_limpeza_20261009`. Reversão ensaiada na fazenda de testes.

**Disparador**: quando mencionar sobreposição de ocupação de curral, `lote_curral_historico` duplicado, "troca de lote no mesmo dia", CF- 02, AR-26-03, ou os backups `backup.lch_limpeza_*`, `backup.ptc_limpeza_*`, ler esta seção.

## Enfermaria: ID manejo gravado e exibido (2026-10-09)

`registros_enfermaria` ganhou a coluna `id_manejo` (migration `20261009150000_enfermaria_id_manejo.sql`, aplicada com `db push`): antes só brinco e chip eram gravados e o animal identificado só por manejo ficava sem ID. O PWA passa a enviar o campo (e também `individuo_id`). No Painel: ID Manejo na lista (cartão e busca), no detalhe e na exportação. Registros antigos têm `id_manejo` nulo.

## Bebedouros: foto principal do PWA no checklist não distorce o relatório (2026-10-09)

O PWA passou a gravar a foto principal do bebedouro em `registros_bebedouros.checklist.foto_bebedouro` (`{ valor: true, observacao: '', foto_url }`), inclusive em fazenda sem checklist ativo, onde o checklist antes era `null` (`registros_bebedouros` não tem coluna `foto_url`).

**Relatório** (`features/relatorioBebedouros/calculos.ts`, `calcularChecklist`): "com checklist" agora exige ao menos uma chave de `CHECKLIST_ITEMS`. Antes qualquer chave contava, e um registro só com a foto inflava "Registros com checklist" e diluía os percentuais do ranking e do KPI de negativos (mesmo cálculo no relatório geral e no relatório público). Teste novo em `calculos.test.ts`.

**Detalhes do registro** (`BebedourosDetalhes.tsx`): a foto principal tem bloco próprio "Foto do bebedouro". Ela saiu de "Fotos dos problemas", onde aparecia com a legenda crua `foto_bebedouro`.

## Chibata: itens de Produção Fábrica que não chegaram ao banco, restaurados (2026-10-09)

Fazenda Chibata (`d3965505-74d5-4af7-9858-f773d2e8aab3`, produção). Formulações com saldo negativo (E/A Engorda TIP 1,8%, Ração 0,5% Seca REP., SAL UREADO) porque cabeçalhos de `registros_saida_insumos` chegaram ao banco sem todos os itens (`saida_insumos_itens`), e o crédito de `producao` nasce do item (`trg_saida_insumos_itens_mov`).

**Causa**: no fluxo antigo do PWA, os itens eram gravados no IndexedDB um a um depois do cabeçalho, com `idSaida` igual ao id LOCAL. Quando o cabeçalho sincronizava, só os itens já gravados recebiam o UUID do servidor; os demais eram enviados com id local, falhavam e saíam da fila sem retry (a lista do PWA, que lê o IndexedDB, continuava mostrando tudo). Somaram-se os timeouts 57014 (ver "Itens de Produção Fábrica perdidos", repo do PWA, 07/10). Uma hipótese inicial de "insumos deixados em branco pelo peão" foi descartada: os valores do aparelho (capturas de tela) somam o `total_produzido` de cada registro.

**Ações (via MCP, sem arquivo de migration)**:
- 08/10: 8 registros (4 parciais, 4 sem itens) excluídos com backup em `backup.chibata_saida_20261008_{cab,itens,movs,saldos}` (itens apagados por DELETE para o trigger reverter as movimentações; cabeçalhos com `deleted_at`).
- 09/10: restaurados 5 cabeçalhos (`deleted_at = NULL`) e inseridos 30 itens (9 do backup com os mesmos `id`/`local_id` + 21 novos) com as quantidades do aparelho do Jefferson: 25/09 Ração `47f80feb`, 28/09 Ração `f3fbbb51`, 29/09 PROTEINADO `9133f533`, 02/10 TIP `5764c4a6`, 03/10 TIP `c29dba87`. Snapshot de saldos antes: `backup.chibata_saida_20261009_saldos_pre`. Verificado: 6 itens e 12 movimentações ativas por registro, `data` das movimentações igual à `data_producao`, variação dos saldos igual à soma dos itens (TIP +7.854, Ração +6.958, PROTEINADO +2.018 kg) e `estoque_atual` das formulações igual à soma das movimentações.
- Pendentes: SAL UREADO 02/10 (`5d2978ad`, 300 kg) e PROTEINADO 28/09 (`88010c16`) e 06/10 (`754242b9`), 3.660 kg cada, do aparelho do Carlos: excluídos em 08/10, aguardam as quantidades do aparelho dele. Confirmar com o Carlos se os dois PROTEINADO foram duas produções reais.
- FARELO DE ALGODÃO ficou com saldo negativo (-3.920,6 kg) após os débitos restaurados; investigar entrada/ajuste faltante.

**Reverter**: itens e cabeçalhos originais estão nas tabelas de backup acima.

**Disparador**: quando mencionar itens de Produção Fábrica faltando, `saida_insumos_itens` parcial, saldo negativo de formulação na Chibata, ou os backups `backup.chibata_saida_*`, ler esta seção.

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

> **Atualizado em 2026-10-14:** a localização deixou de ser a atual e passou a ser o histórico do período (`local_hist`, `A → B`), e a grid de 5 colunas virou pills de largura proporcional ao texto. Ver "Relatório de consumo: local e dieta do período, selo por tipo e gráfico legível". O resto desta seção segue valendo como origem do campo.

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
- 2026-10-15: a página de detalhe da Caderneta de Trato (`TratoConfinamentoDetalhes.tsx`, rota `/controller/cadernetas/trato-confinamento/:id`) ganhou botões Editar/Excluir no padrão de `SuplementacaoDetalhes`, liberados para todas as fazendas (sem lista fixa), visíveis para `admin`/`super_admin`/`controller`. Reusam as mesmas RPCs `editar_/excluir_registro_oferta_trato` (sem migration). Efeitos: o trigger `trg_consumo_confinamento_oferta` recalcula `consumo_confinamento_dia` (OLD e NEW); estoque de insumos não é afetado (baixa ocorre na fábrica de confinamento); `leitura_cocho_nota` do trato não entra no cálculo de consumo.

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

### Lançamento de Tratos: cabeças na data da folha — adicionado em 2026-10-09

Problema: em data retroativa a folha mostrava "sem cabeças ativas" para lotes que ocupavam o curral na data mas foram esvaziados depois (ex.: fazenda d8900758, lotes DM saíram em 06/10 às 16h; `quant_atual` = 0 hoje). `quantidadeCabecas` usava o saldo atual.

Correção (só front, sem migration): `apps/manejus/src/services/saldoCabecasNaData.ts` reconstitui o saldo desfazendo, a partir do `quant_atual`, as movimentações (`registros_movimentacao`) e mortes (`registros_morte`) do início do dia em diante, com a mesma classificação de `calculate_quant_atual`. Valor usado = maior entre o saldo no início e no fim do dia, por categoria (quem saiu à tarde foi tratado de manhã). Limites: não cobre `registros_maternidade` (bezerro ao pé) e considera só categorias hoje ativas (`ativo=true`, `data_fim` nulo); se a regra do SQL mudar, ajustar o espelho. Validado: testes unitários (8) e conferência de leitura na fazenda de testes (Lote A: saldo ao fim de 25/09 = 125 pelo banco e pela reconstituição).

Complemento (2026-10-09): a dieta da folha também passou a ser o plano nutricional vigente na data (`planoVigenteNaData`: `data_inicio` até a data e `data_fim` nula com `ativo`, ou `data_fim` >= data), em vez do plano ativo de hoje. Lotes sem nenhum plano (ex.: DM 2/6 08/07 e DM 1/4- 03/06 na fazenda d8900758) continuam com o aviso "sem dieta ativa", que é dado real.

Ajuste (2026-10-09): o saldo na data passou a considerar as categorias vigentes em cada instante (`created_at`/`data_fim`), não só as ativas hoje; lotes recategorizados no próprio dia (ex.: Canastra 1 e 2, TIP 16/18, fazenda d8900758, "boi magro" encerrada em 06/10 às 16h01) voltam a mostrar as cabeças que tinham. O total é por instante (início e fim do dia), então a recategorização não conta o gado duas vezes. Substitui a limitação "só categorias hoje ativas" da entrada acima.

Avisos da folha (2026-10-09): pendências de cadastro (sem plano/sem cabeças) de lotes cuja ocupação já terminou (`lote_curral_historico.data_final` preenchida) saem do alerta amarelo e vão para um bloco recolhido, sem destaque; o alerta amarelo fica só com o que ainda é corrigível (ocupação aberta ou sem lote vinculado). Os textos informam que valem para a data selecionada e não bloqueiam o lançamento.

## Rebanho por faixa etária e sexo no Dashboard

Implementado em 2026-10-13. Seção "Rebanho por Faixa Etária" no Dashboard do controller (entre Métricas de Produção e Animais por Lote).
- RPC `get_rebanho_faixa_etaria(p_fazenda_id)` (migration `20261013110000`, rollback em `supabase/rollbacks/`), com `guard_fazenda`. Saldo = `COALESCE(quant_atual, quant_inicial, 0)` de `lote_categorias` ativas em lotes ativos.
- Faixas: 0-4, 5-12, 13-24, 25-36, 36+ meses e "sem idade". Sexo: Fêmea, Macho, Indefinido.
- Idade vem de `lote_categorias.idade` (meses, valor do cadastro, não envelhece sozinho). Na fazenda de testes, 85 de 356 cabeças estavam sem idade. Evoluir para idade calculada por data de nascimento fica como possível melhoria.
- Hook `useRebanhoFaixaEtaria` em `useDashboardQueries.ts`.

## Idade atual das categorias (cron diário) e backfill

Implementado em 2026-10-13. `lote_categorias.idade` (meses) é a idade na data-base e segue como está (PWA, relatórios e cópias). Novas colunas: `idade_data_ref` (data em que `idade` era verdadeira) e `idade_atual` (idade + meses completos desde `idade_data_ref`).
- Migrations `20261013120000_idade_atual_categorias` (colunas, `calcular_idade_atual`, trigger `trg_lote_categorias_idade_ref`, `atualizar_idade_categorias()` e job `atualizar-idade-categorias` às 07:00 UTC = 03:00 Cuiabá) e `20261013121000_rpc_rebanho_faixa_etaria_idade_atual` (dashboard usa `COALESCE(idade_atual, idade)`). Rollbacks em `supabase/rollbacks/`.
- Trigger: ao inserir com idade ou mudar `idade`, `idade_data_ref = COALESCE(data_pesagem, hoje)`; mudar só `data_pesagem` não reinicia a idade. Se o chamador informar `idade_data_ref`, é respeitada.
- Backfill (2026-10-13, autorizado, todas as fazendas): 687 categorias ativas com `idade` e sem `idade_data_ref`; `idade_data_ref = data_pesagem` se entre 2020-01-01 e hoje, senão `created_at::date`. Backup: `backup.lote_categorias_idade_20261013` (id, idade, idade_data_ref, idade_atual, data_pesagem, updated_at). Resultado: 687 preenchidas, 494 envelheceram, cron idempotente (0 linhas na segunda execução). Para reverter: `UPDATE lote_categorias SET idade_data_ref = NULL, idade_atual = NULL WHERE id IN (SELECT id FROM backup.lote_categorias_idade_20261013)`.
- Datas-base inválidas encontradas e tratadas pelo fallback: `data_pesagem` `0001-01-01` (categoria `85beb267-8194-4369-aeb0-9260897c1af3`), `0026-09-29` (`b5991115-3ab8-4093-b10d-c33f6aca0bc4`) e uma futura (2026-12-15). 23 categorias sem `data_pesagem` usaram `created_at`.
- Pendências: `transferir_lote_entre_fazendas` copia `idade` sem copiar `idade_data_ref` (a cópia reinicia a data-base); o trigger não valida `data_pesagem` absurda para novos registros.

## Reprodução 4c: pendências, visão geral, exportação e alertas semanais (16/10/2026)
- Página `/controller/reproducao` (menu Gestão da Fazenda): fêmeas por status, intervalo médio entre partos, dias em aberto, pendências (parto atrasado, parto em até 30 dias, coberta há 60+ dias sem diagnóstico, vazia há mais de 120 dias) e exportação Excel (`REPRODUCAO_EXPORT_CONFIG`). Commit `7fd3505`.
- Migration `20261016260000_notificar_pendencias_reprodutivas` (rollback em `supabase/rollbacks/`): função `notificar_pendencias_reprodutivas(p_fazenda_id DEFAULT NULL)`, uma notificação-resumo por fazenda e tipo para cada usuário ativo (atualiza a não lida em vez de duplicar); EXECUTE só para service_role; cron `notificar_pendencias_reprodutivas` às segundas 08:30. Peões não recebem.
- Testada na fazenda de testes (12 notificações geradas). Dados de teste removidos por soft-delete: 12 notificações "Reprodução: ..." e 5 eventos reprodutivos das fêmeas ADOT-BR-C1, ADOT-BR-N1 e novilha 44.
- Limitação: o resumo por estação não considera partos posteriores à cobertura.

## Sanidade S1 (banco): aplicações sanitárias e carência no catálogo (16/10/2026)
- Migration `20261016270000_sanidade_aplicacoes` (rollback em `supabase/rollbacks/`): `medicamentos.carencia_abate_dias` e `intervalo_reaplicacao_dias` (opcionais) e tabela `aplicacoes_sanitarias` (por animal ou por lote com `numero_cabecas`; snapshot de produto/carência/intervalo; `liberacao_abate_em` e `proxima_aplicacao_em` derivados por gatilho; data não futura; animal/lote/medicamento da mesma fazenda; RLS padrão e auditoria). Não altera contagem nem peso; o PWA não lê.
- Testada na fazenda de testes (carência 28 d → liberação 29/10; intervalo 180 d → próxima 30/03/2027; data futura rejeitada). Restaurado: aplicação de teste `b04c511a-f4b5-46d4-8452-c7bf6d9b311a` com soft-delete e carência/intervalo do medicamento de teste zerados.
- Falta da S1: view `v_historico_sanitario_individuo` (une enfermaria e maternidade), aba Sanidade na ficha, campos novos em Medicamentos.

## Sanidade S1 (banco): view do histórico sanitário por animal (16/10/2026)
- Migration `20261016280000_view_historico_sanitario_individuo` (rollback em `supabase/rollbacks/`): `v_historico_sanitario_individuo` (security_invoker) une aplicações sanitárias por animal, enfermaria (medicamentos do JSON, só quando array) e maternidade (medicamentos da mãe). Hoje no banco: 4 linhas de enfermaria e 1 de maternidade.
- Testada com uma aplicação na fazenda de testes (aparece com carência). Restaurado: aplicação `7c88bca5-65c5-4829-b389-f18de5472405` com soft-delete.

## Sanidade S1 (painel): aba Sanidade na ficha e carência/intervalo em Medicamentos (16/10/2026)
- `Medicamentos.tsx`: campos opcionais "Carência para abate (dias)" e "Intervalo para reaplicar (dias)" (mostrados no card).
- Ficha do animal: aba **Sanidade** (`components/SanidadeDoAnimal.tsx`, `hooks/useSanidade.ts`, `utils/sanidade.ts` com testes): carência ativa em destaque, doses a vencer (uma por produto), histórico unificado (`v_historico_sanitario_individuo`) e "Lançar aplicação" (escolhe produto do catálogo ou digita; carência/intervalo vêm do catálogo e são editáveis; exclusão por soft-delete só das aplicações). Só avisa, não bloqueia.
- Validado no navegador na fazenda de testes (animal NEW-I1: carência 14 d → "faltam 14 dias", próxima dose em 10 d). Restaurado: aplicação `f1e0fd0c-c867-4138-a002-205b9f95a538` com soft-delete.
- Pendente da sanidade: S2 (aplicação em lote, funções de carência, aviso `CARENCIA_ATIVA` na OS), página de pendências e notificações de sanidade.

## Sanidade S2 (banco): carência por animal/lote e aviso CARENCIA_ATIVA na pesagem de OS de venda (16/10/2026)
- Migration `20261016290000_sanidade_carencia_e_aviso_os` (rollback em `supabase/rollbacks/`): funções `lotes_em_carencia(fazenda, em)` e `animais_em_carencia(fazenda, em)` (SECURITY INVOKER; animal em carência por aplicação própria ou de lote, respeitando a categoria quando informada; limite: animal que entrou no lote depois da aplicação também aparece) e gatilho separado `trg_pesagem_avisa_carencia` (AFTER INSERT em `registros_pesagem`, só OS `tipo = venda`) que grava `CARENCIA_ATIVA` em `logs_sync_errors`. Não bloqueia nem altera a pesagem (erro interno é engolido).
- Testada na fazenda de testes (lote Teste 2, 13 animais): funções devolveram 13 animais/1 lote em carência e 0 após a liberação; a pesagem com `tipo_manejo = abate` na OS de venda gerou o log. Observação: esse tipo de pesagem já baixa o animal como Abatido (comportamento existente do gatilho de pesagem).
- Restaurado: pesagem `11111111-bbbb-4bbb-8bbb-000000000001` e aplicação `11111111-aaaa-4aaa-8aaa-000000000001` com soft-delete; log resolvido; animal ADOT-BR-C1 (`e0b2942d-e1fc-469c-a5c7-1306de5b8623`) voltou a Vivo, sem data/motivo/destino de saída e sem peso atual; lote com 13 vivos e nenhuma movimentação criada.
- Falta da S2: tela de aplicação em lote e indicação de carência no painel (lote/lista), pendências e notificações de sanidade.

## Sanidade S2 (painel): página Manejo Sanitário em lote (16/10/2026)
- Página `/controller/manejo-sanitario` (menu Gestão da Fazenda > Manejo Sanitário; `pages/controller/ManejoSanitario.tsx`): lança aplicação em um lote (e categoria opcional) com número de cabeças (sugere a contagem atual), produto do catálogo ou digitado, dose, via, carência, intervalo, partida e validade; lista "Lotes em carência" (função `lotes_em_carencia`) e as aplicações em lote recentes, com exclusão por soft-delete. Não altera a contagem do lote.
- Utilitários `formVazioAplicacaoLote`/`validarAplicacaoLote`/`montarAplicacaoLoteParaGravar` em `utils/sanidade.ts` (com testes) e hooks em `hooks/useSanidade.ts`.
- Validado no navegador na fazenda de testes (lote Teste 2, 13 cabeças, carência 7 d → libera em 23/10). Restaurado: aplicação de teste "TESTE UI Lote Aftosa" com soft-delete (id `4c4a346d-3b18-4fc0-9b5b-ab17fd1d9c37`).
- Pendente da sanidade: página de pendências (doses a vencer, animais em carência) e notificações semanais (migration própria).

## Sanidade: pendências na página e alertas semanais (16/10/2026)
- Migration `20261016300000_notificar_pendencias_sanitarias` (rollback em `supabase/rollbacks/`): `notificar_pendencias_sanitarias(p_fazenda_id DEFAULT NULL)` gera uma notificação-resumo por fazenda e tipo (doses atrasadas; doses nos próximos 15 dias; carência terminando em 7 dias) para cada usuário ativo, atualizando a não lida em vez de duplicar; vale a aplicação mais recente de cada produto por alvo (animal, ou lote + categoria); EXECUTE só para service_role; cron `notificar_pendencias_sanitarias` às segundas 08:40; link `/controller/manejo-sanitario`. Peões não recebem.
- Página Manejo Sanitário: seção "Pendências sanitárias" (doses atrasadas/próximas 15 dias e animais em carência, com identificação brinco/chip/manejo/provisório), via `dosesPendentesDaFazenda` (`utils/sanidade.ts`, com testes) e hooks `useDosesPendentes`/`useAnimaisEmCarencia`.
- Testado na fazenda de testes (3 aplicações: dose atrasada de lote, dose próxima de animal e carência de lote): 12 notificações geradas (3 tipos × 4 usuários) e a página listou 2 doses e os 13 animais em carência. Restaurado: aplicações `41d870ae-c141-4f5b-9c1b-5829feb9b1f8`, `d373d33e-ee4e-4fd4-99e6-bb0bdff58c53` e `ebb86400-3b61-4ffc-b2e0-0b541543077d` e as 12 notificações "Sanidade: ..." com soft-delete.
- Sanidade fica completa no painel (S1 + S2 + pendências/alertas). Fora do escopo: baixa de estoque de medicamento, custo por animal, caderneta de sanidade no PWA, indicação de carência na lista de Lotes/Indivíduos.

## Vercel: ignoreCommand não falha mais quando o SHA anterior não está no clone (16/10/2026)
- Sintoma: deploy do manejus falhou com `Command failed with exit code 128: git diff --quiet ${VERCEL_GIT_PREVIOUS_SHA...}` e `fatal: bad object 958a4c6e...`. O clone da Vercel é raso e não tinha o commit do deploy anterior; o `git diff` sai com 128, e a Vercel só aceita 0 (pula) ou 1 (builda): qualquer outro código derruba o deploy. A nota de 2026-10 que dizia "o diff falha e o build roda" estava errada para esse caso.
- Correção: `|| exit 1` no fim do `ignoreCommand` de `apps/manejus`, `apps/vision` e `apps/farmplan` (qualquer erro do git vira "builda"). Simulado: SHA inexistente → 1; sem mudanças → 0; com mudanças em manejus → 1.

## Sanidade na lista de cadernetas do painel (16/10/2026)
- `utils/cadernetas.ts` e `types/images.ts`: entrada `sanidade` (grupo Gado & Pastagens, abre `/controller/manejo-sanitario`) para liberar a caderneta de Sanidade do PWA por funcionário. Imagem `public/images/cadernetas/sanidade.png` é cópia provisória da Enfermaria.
- Como no manejo de curral: só funcionários reais ganham essa permissão depois que o painel novo estiver no ar.

## Cadernetas novas só na fazenda de testes (painel) (16/10/2026)
- `utils/cadernetas.ts`: `CADERNETAS_EM_TESTE` (`manejo-curral`, `sanidade`), `FAZENDA_DE_TESTES_ID`, `cadernetaVisivelNaFazenda`, `cadernetasDaFazenda` e `gruposDaFazenda` (teste em `cadernetasEmTeste.test.ts`). Aplicado na página Cadernetas, nos grupos do Dashboard e na lista de permissões por funcionário em Cadastros Auxiliares (inclui o "Selecionar todas" e o texto "todas"). Enquanto a fazenda ainda não é conhecida, as cadernetas em teste ficam ocultas. Espelha a regra do PWA (`utils/constants.ts`).
- Fora do alcance: a página Manejo Sanitário e a de sessões de manejo de curral continuam acessíveis por URL direta (não vazam dados de outra fazenda: a RLS filtra). Para liberar para todas: esvaziar `CADERNETAS_EM_TESTE` nos dois repositórios.

## Baixas de farmácia valorizadas pelo ledger (22/10/2026)

Migration `20261022120000_farmacia_baixa_valorizada.sql` (rollback em `supabase/rollbacks/`). `recalcular_estoque_farmacia` grava em cada baixa/estorno o custo médio vigente no momento e o valor (quantidade × custo). Entrada retroativa revaloriza as baixas posteriores; entradas valorizadas − baixas valorizadas = `custo_total_estoque`. `update_estoque_farmacia` não recalcula de novo enquanto `gestaup.recalc_farmacia` estiver 'on' (gravação interna). Backfill feito nas baixas existentes (saldos e custos médios inalterados). Listas Entradas/Saídas ganham "Custo un." e "Valor" (`valorDoMovimento`).

## Exclusão de categoria "vaca" e apartações revertidas (23/10/2026)

Operação pontual em produção, fazenda d3965505-74d5-4af7-9858-f773d2e8aab3, lote 858e16ef-38ec-4349-8fba-852923e4678c ("Lote paridas mês 10"), autorizada com escopo fechado. Categoria excluída: `a0ea2c63-3675-4793-bbbf-4cd1cd624ffb` (vaca, quant_inicial 132, quant_atual 264 por contagem em dobro). Dependentes removidos: 5 snapshots de planos nutricionais e 3 personalizações (CASCADE). Movimentações revertidas por soft-delete (`deleted_at`): c3c66ac1-1c01-452e-b220-f078ecb5d79d, 9c664fcd-ed26-41da-8bb5-30496c9547bf, 0fa00ac3-9db7-4e2b-8596-44dd222cfa9e, cf4363fb-ff40-468e-9509-9e590e0566df, ee2f72ae-57b1-4466-b974-680be02489cd, b66a566b-12ef-43a3-aa4a-84922f8dbf0a (6 apartações, 132 cabeças). Efeito nas origens (quant_atual): LOTE 6 107→126, LOTE 15 91→132, LOTE 5 67→83, LOTE 4 89→94, LOTE 13 90→135, LOTE 12 73→79. Backup em `backup.*_20261023` (lote_categorias_a0ea2c63, registros_movimentacao_132vacas, planos_nutricionais_snapshots_a0ea2c63, plano_categoria_personalizacao_a0ea2c63). Para reverter: `update registros_movimentacao set deleted_at = null` nos 6 IDs; a categoria pode ser reinserida a partir do backup.
