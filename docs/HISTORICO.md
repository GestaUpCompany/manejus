# Histórico de alterações (RESOLVIDO/IMPLEMENTADO)

Este arquivo registra mudanças já aplicadas no Painel Web. Um chat novo não precisa ler isto por padrão; consulte quando a pergunta for sobre "por que isso foi feito assim" ou para entender o estado anterior de uma parte do código.

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
