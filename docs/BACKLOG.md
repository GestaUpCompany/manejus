# Backlog — pendências e specs não implementadas

Este arquivo lista trabalho pendente no Painel Web. Um chat novo deve consultar este arquivo para saber o que ainda falta fazer e o que já foi decidido mas não implementado.

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
