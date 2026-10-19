> Cópia versionada do plano de coexistência agregado × indivíduo (original fora do repo: C:\Users\USER\.claude\plans\analise-o-m-dulo-de-sorted-octopus.md). Copiada em 19/10/2026; o estado de execução fica no `docs/HISTORICO.md` (seção "PONTO DE CONTINUAÇÃO") e o que falta no `docs/BACKLOG.md`.

# Controle de indivíduos sem quebrar a operação por lote (coexistência agregado × indivíduo)

## Contexto
A operação em produção roda sobre o **agregado**: `lote_categorias` guarda quantas cabeças há por categoria em cada lote (`quant_atual` calculado por movimentações), além do peso, do GMD e do consumo. Sabemos quantas cabeças são, mas não quais. Em consulta somente leitura (15/10/2026), as maiores fazendas têm 0 indivíduos (Jacamim 13.377 cab., Mirandópolis 7.515, Marape 7.150), e as que têm alguns chegam a no máximo 6% (Marcon 62/3.642, Sirio 124/2.050).

O módulo de indivíduos atual foi desenhado como se o indivíduo fosse a fonte da verdade, e por isso já causa divergências: baixa sem movimentação, pesagem que muda o lote, cria criada duas vezes. A meta é **adicionar a camada individual por cima do agregado**, adotável por fazenda e por lote, sem alterar relatórios, consumo, trato e contagens que já funcionam.

## Princípios de desenho (regras que tudo abaixo segue)
1. **O agregado continua sendo a verdade da contagem.** `quant_atual` nunca passa a ser calculado a partir de `individuos`, nem num lote 100% identificado: o agregado é permanente e obrigatório (fazenda nova nunca começa identificada; relatórios, consumo, trato e o PWA offline operam por contagem). Decisão de 16/10/2026: foi removida a opção de um modo "individual completo" que substituísse o agregado.
2. **Existe um único caminho de escrita para o que muda contagem.** Morte, venda, abate, transferência, nascimento, entrada e recategorização sempre gravam o evento agregado de hoje (`registros_movimentacao`, `registros_morte`, `registros_maternidade`...) com `lote_categoria_id`. O indivíduo entra como **anexo opcional** ("quais animais"), por meio de `individuo_id` ou de uma tabela-ponte. Nenhuma tela altera o `individuos` de forma a mudar a contagem sem gerar o evento agregado.
3. **O indivíduo é um subconjunto do agregado.** Por categoria de lote: `identificados ≤ quant_atual` e `nao_identificados = quant_atual − identificados`. Uma divergência (identificados > quant_atual, ou animal em categoria ou lote inexistente) é **sinalizada** numa fila de pendências, nunca bloqueia a operação de campo.
4. **A adoção é gradual e o nível é calculado, não declarado.** Decisão de 16/10/2026 (substitui o modo manual da Fase 1.2): o nível de qualificação do lote deriva de `vw_lote_categoria_identificacao` (nenhum identificado = só contagem; algum = parcial; toda categoria com cabeças com `confirmados = quant_atual` = completo), e localização incerta e divergência são sinalizações separadas, não níveis. Nunca se exige informar animal para gravar um evento: falta de animal vira pendência (sugestão), não erro. Fazendas que não usam indivíduos não percebem nenhuma mudança.
5. **Todo o schema novo é compatível com versões antigas** (só colunas e tabelas novas). O PWA antigo continua enviando eventos agregados sem `individuo_id` e isso continua válido.

## Fase 0: parar de criar divergência (bugs atuais, reinterpretados)
- **Baixa e exclusão no detalhe** (`apps/manejus/src/hooks/useIndividuoDetalhe.ts:244-275`): passam a criar o evento agregado (Saída/morte na `lote_categoria` do animal) via RPC transacional `baixar_individuo(p_fazenda_id, ...)`. Assim o `quant_atual` cai como já cai hoje para qualquer morte ou venda.
- **Pesagem** (`trg_registros_pesagem_upsert_individuo`): deixa de mudar lote, categoria e raça do indivíduo silenciosamente. Se o lote informado diferir, a divergência vai para a fila de pendências.
- **Maternidade:** confirmar e garantir que a cria não é criada duas vezes (pelo PWA via `criarIndividuosIdempotente` e pelo `trg_maternidade_create_individual`). O nascimento continua incrementando o agregado como faz hoje.
- **Formulário** (`IndividuoNovo.tsx`): mudar o lote vira uma transferência agregada (com data), feita numa RPC transacional; o mapeamento de estratégia no front é removido.
- **Identificadores:** normalizar com trim e maiúsculas no banco (com prévia somente leitura das colisões antes); corrigir `maybeSingle()` em `checkDuplicateIdentification.ts:24`; escapar o `.or()` da busca no painel e no PWA.
- **Admin:** exige seletor de fazenda; nada de carregar todas as fazendas.
- **RLS:** remover as policies antigas `usuario_id = auth.uid()` e o `GRANT INSERT TO anon`.

## Fase 1: modelo de dados da coexistência
1. **`individuos.lote_categoria_id`** (FK `lote_categorias`, nullable), além de `lote_atual`. A categoria do animal passa a ser a da sua `lote_categoria`, o que elimina a lista duplicada TS/SQL. A tabela de domínio `categorias_animais` é a decisão já tomada pelo usuário; a migração exige casar os textos atuais (backfill com prévia).
2. ~~**`lotes.modo_identificacao`**~~ Implementado (migration `20261016130000`), mas SUPERADO em 16/10/2026: o nível passa a ser calculado (princípio 4); coluna, trigger e RPC ficam sem uso e serão removidos por migration própria depois de aprovada.
3. **View `vw_lote_categoria_identificacao`:** `lote_categoria_id`, `quant_atual`, `identificados`, `nao_identificados`, `divergencia`. Somente leitura, não altera nenhum cálculo existente.
4. **Ponte evento → animais:** `evento_individuos(evento_tabela, evento_id, individuo_id)`, para eventos agregados que envolvem N animais (morte de 3, venda de 40, transferência de 120). A quantidade do evento continua sendo a do agregado; a ponte só diz quais. Validação: o número de animais na ponte não pode passar da quantidade do evento.
5. **Linha do tempo:** `individuo_eventos` (ou uma view sobre a ponte e os registros) para o detalhe do animal.
6. **Triggers de propagação:** quando um evento agregado tiver animais na ponte, os indivíduos citados recebem o novo estado (status, `lote_categoria_id`, `data_saida`). Sem ponte, nada acontece com os indivíduos, como hoje.
7. **Rastreabilidade completa (decisão do usuário):** `codigo_sisbov` (15 dígitos, prefixo 076, único global), `codigo_pnib`, `dispositivo_tipo`, `data_identificacao`, `data_vacina_brucelose`, histórico em `individuo_identificacoes` (troca de brinco, provisório → definitivo) e GTA vinculada ao evento de transferência. A exportação BND/PNIB fica na Fase 4.

## Fase 2: entrada dos indivíduos (onboarding sem mexer na contagem)
- **Sessão de identificação / inventário de lote** (PWA e painel): no curral, lê ou digita brincos (com bastão RFID depois), escolhe a `lote_categoria`, registra sexo, raça e peso opcional. Cria os indivíduos vinculados **sem gerar movimentação**, porque esses animais já estão no `quant_atual`.
- **Resultado da sessão:** "contados X de `quant_atual` Y". Se X > Y, ou se o gestor confirmar que o lote está completo e X < Y, o sistema **propõe** um ajuste agregado explícito (movimentação de ajuste de inventário), que só é gravado com confirmação.
- **Importação CSV/XLSX** pelo mesmo caminho e com as mesmas regras.
- Quando os identificados chegam a 100% confirmados, o lote passa a constar como "completo" automaticamente (nível calculado).

## Fase 3: operação com indivíduos (qualquer nível de qualificação)
- **Cadernetas existentes** (morte, movimentação, venda/abate, maternidade, pesagem): ganham o campo opcional "quais animais" (multisseleção ou leitura de brinco). O campo **nunca é obrigatório** (decisão de 16/10/2026): a quantidade do evento é sempre a do agregado, os animais informados são um subconjunto, e eventos sem animal viram pendência na conciliação. Na ficha do animal, dieta e eventos do lote aparecem rotulados como "do lote", nunca como medição individual.
- **Pesagem individual:**
  - grava no animal e alimenta o agregado como **amostra**, isto é, a média atualiza o peso da `lote_categoria` pela regra atual da caderneta de pesagem, sem criar um segundo escritor;
  - o `peso_atual_kg` do indivíduo vira derivado (última pesagem + GMD), substituindo a disputa entre o cron, o trigger e o formulário.
- **Painel:**
  - lista em TanStack Query, com filtros por lote, categoria e modo;
  - painel de conciliação por lote usando a view da Fase 1;
  - fila de pendências;
  - ações em massa (mover, recategorizar, baixar), que **sempre geram o evento agregado** correspondente.
- **PWA:**
  - cache local inclui os animais criados offline e todos os identificadores, inclusive os de mortos e vendidos, para checar duplicidade;
  - busca por ID provisório;
  - caderneta de brincagem (provisório → brinco);
  - erro da 2ª cria gêmea deixa de ser engolido e a 2ª mãe adotiva passa a receber `status`;
  - cada caderneta nova exige store no IndexedDB, mapeamento no `syncService` e policy de leitura para o peão.

## Fase 4: funcionalidades que só fazem sentido com indivíduos
Reprodução (IATF, diagnóstico de gestação, intervalo entre partos), sanidade com carência bloqueando venda/abate, KPIs individuais (P205 ajustado, GMD por animal, taxa de prenhez), exportação SISBOV/PNIB e GTA por animal, seguindo `docs/PLANO_INDIVIDUOS_FASE4_SANIDADE_REPRODUCAO.md`.

## Arquivos críticos
- Painel: `apps/manejus/src/pages/controller/{Individuos,IndividuoNovo,IndividuoDetalhe}.tsx`, `apps/manejus/src/hooks/useIndividuoDetalhe.ts`, `apps/manejus/src/utils/{movimentacaoIndividuo,baixaIndividuo,checkDuplicateIdentification,individualValidation}.ts`, as telas de lotes e movimentação (para a conciliação).
- Banco: triggers de `registros_movimentacao`, `registros_morte`, `registros_maternidade` e `registros_pesagem`; `calculate_quant_atual` (**não alterar a lógica, só ler**); migrations novas com rollback em `supabase/rollbacks/`.
- PWA: `pages/cadernetas/{MaternidadePage,MortePage,PesagemPage}.tsx`, `components/AnimalIdentifier.tsx`, `services/{syncService,supabaseService,cadastroCache}.ts`.

## Verificação
- **Regressão do agregado:** antes e depois de cada migration, guardar uma captura somente leitura de `quant_atual`, `peso_vivo_kg` e consumo por `lote_categoria` de todas as fazendas e comparar. Nenhuma diferença é aceitável fora da fazenda de testes.
- **Na fazenda `d649c65e-16ab-4b77-a84b-df937aa41cc3`:**
  - inventariar um lote parcialmente e conferir que o `quant_atual` não mudou;
  - baixar um indivíduo e conferir que cai 1 cabeça;
  - fazer uma morte agregada sem ponte e conferir que os indivíduos não mudam;
  - fazer uma morte agregada com ponte e conferir que o status muda;
  - mudar o lote para o modo `individual` e conferir que fica exigido selecionar os animais.
- `pnpm typecheck` + `pnpm lint` + `pnpm test`, com testes vitest para as regras de conciliação e de normalização.
- Migrations uma por vez, mostrando o SQL e esperando o ok; registrar cada fase em `docs/HISTORICO.md` e o restante em `docs/BACKLOG.md`.
