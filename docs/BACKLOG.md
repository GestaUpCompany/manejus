# Backlog — pendências e specs não implementadas

Este arquivo lista trabalho pendente no Painel Web. Um chat novo deve consultar este arquivo para saber o que ainda falta fazer e o que já foi decidido mas não implementado.

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
