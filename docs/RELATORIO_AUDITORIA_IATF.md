# Auditoria funcional e operacional do IATF (20/10/2026)

## Estado depois das correções (20/10/2026)

Todos os 11 itens abaixo foram tratados no mesmo dia, um por vez, cada um testado no banco e pelo DevTools antes do seguinte. O detalhe, os testes e as migrations de cada item estão no `docs/HISTORICO.md` ("Auditoria do IATF, item N").

| # | Problema | Situação | Migration |
|---|---|---|---|
| 1 | Um touro por passo de IA | Corrigido: IA por grupos de fêmeas, passo fecha só no último grupo | `20261020220000` |
| 2 | Desfazer IA deixa eventos órfãos | Corrigido: `desfazer_ia_lote_protocolo`, bloqueia se há diagnóstico depois | `20261020230000` |
| 3 | Fêmea morta recebe IA; prenha entra sem aviso | Corrigido: gatilho de baixa + IA só em fêmea viva; aviso no painel | `20261020240000` |
| 4 | Datas incoerentes aceitas | Corrigido: recusa antes do D0; aviso de passos anteriores pendentes | `20261020250000` |
| 5 | Mesma fêmea em dois lotes | Corrigido: bloqueio no banco, no painel e no PWA | `20261020260000` |
| 6 | Alerta às 03:30 | Corrigido: cron em `30 11 * * *` (07:30 em Cuiabá) | `20261020270000` |
| 7 | Escrita direta aberta ao peão | Corrigido nas tabelas de IATF; `eventos_reprodutivos` segue aberta (pendência) | `20261020280000` |
| 8 | PWA sem descarte de fêmea | Corrigido: RPC + tela no PWA | `20261020290000` |
| 9 | Editar protocolo não atômico | Corrigido: `salvar_protocolo_iatf` | `20261020300000` |
| 10 | Lote offline "some" | Corrigido: aparece "aguardando envio" | (só PWA) |
| 11 | Tipos e documentação | Documentação corrigida; tipos não gerados de propósito (o projeto inteiro não usa tipos do banco) | (só docs) |

**O que continua pendente** (também no `docs/BACKLOG.md`): fechar a escrita de `eventos_reprodutivos` (exige mover a escrita do PWA para RPC); confirmar a primeira execução real do cron às 11:30 UTC; teste em aparelho físico com sinal fraco; reativar fêmea depois do passo de IA concluído não reabre o passo; o aviso de fêmea prenha ao montar lote existe só no painel; lote ainda não é editável; nada foi publicado em `staging-repo` nem commitado.

**Dados de teste**: removidos ao fim (exclusão lógica); a fazenda de testes ficou sem lote, protocolo ou notificação IATF ativos.

---

# Relatório original da auditoria (antes das correções)

Escopo: caderneta/menu IATF do PWA, tela Protocolos de IATF do painel e o banco que os une (migrations de 20/10/2026).

## Como foi testado

- **Banco, somente leitura:** existência de tabelas, RLS, triggers, RPCs (corpo e `SECURITY INVOKER/DEFINER`), cron, flag `acesso_iatf`, advisors.
- **Banco, comportamento:** blocos `DO` que chamam as RPCs reais, **só na fazenda de testes** (`d649c65e-…`, fêmeas `BR-042`, `ADOT-BR-C1`, `MAE-BR-N1`). Todo bloco termina com `RAISE EXCEPTION`, então nada foi gravado. Conferido depois: 0 protocolos/lotes `ZZ%`, 0 eventos com os touros de teste, fêmea usada continua `Vivo`.
- **Código:** leitura do PWA e do painel.
- **Testes automatizados:** painel 18/18 e PWA 26/26 passam (cobrem só funções puras, não RPCs, páginas nem sync).
- **Rodou como `postgres`:** a RLS foi ignorada nesses testes. O comportamento do peão sob RLS **não foi exercitado**.
- **Não testado:** aparelho físico offline, sincronização em duas passadas, telas renderizadas, `criar_lote_protocolo_iatf` sem a flag (exigiria outra fazenda).

## O que funcionou como esperado

| Teste | Resultado |
|---|---|
| T1 criar lote gera 3 tarefas | OK |
| T1b reenvio com mesmo `local_id` | devolveu o mesmo lote, sem duplicar |
| T2 marcar passo com data futura | recusado |
| T7 protocolo inativo | recusado |
| T8 apagar passos do protocolo depois | tarefas do lote seguem 3 (snapshot) |
| Relatório de taxa | junta o diagnóstico pela fêmea, então o diagnóstico lançado no PWA (sem elo com o lote) conta |

## Problemas confirmados, com correção e justificativa

Prioridade: **A** corrompe dado ou impede o trabalho de campo; **M** gera dado incoerente ou risco; **B** conforto ou dívida.

### 1. [A] Um único touro e uma única partida por passo de IA (T4c)
- **Evidência:** `registrar_ia_lote_protocolo` com `p_individuos=[f1]` e Touro A funciona. A chamada seguinte com `[f2]` e Touro B é recusada: "A inseminação deste lote já foi registrada". Sem subconjunto, todas as fêmeas recebem o mesmo touro.
- **Por que corrigir:** na prática cada fêmea costuma receber sêmen diferente. Hoje só dá para fazer uma de duas coisas: gravar o touro errado nas outras, ou deixar o touro em branco. A taxa de prenhez por touro e por partida, que é o principal uso do relatório, fica errada ou vazia.
- **Correção:** permitir várias chamadas por tarefa de IA enquanto existir fêmea ativa sem IA no lote. A tarefa só vira "feita" quando todas as ativas tiverem IA. A trava de duplicidade por fêmea já existe (`NOT EXISTS`). No PWA e no painel, oferecer a escolha das fêmeas (e touro por fêmea ou por grupo). A recusa de passo já feito continua valendo para o reenvio idêntico.

### 2. [A] Desfazer a IA deixa eventos órfãos e refazer ignora o dado correto (T5a, T5b)
- **Evidência:** desfazer a tarefa de IA mantém os 3 eventos de IA. Ao registrar de novo com "Touro CORRETO", entram 0 eventos novos e o touro gravado continua "Touro A".
- **Por que corrigir:** o gestor acredita que corrigiu, a tela mostra o passo pendente de novo, mas a ficha das fêmeas e o relatório seguem com o dado errado. O único jeito de corrigir hoje é excluir evento por evento na ficha de cada fêmea.
- **Correção:** ao desfazer a tarefa de IA, excluir logicamente (`deleted_at`) as inseminações geradas por ela (`protocolo_lote_id` + data da tarefa), ou recusar o desfazer com uma mensagem clara. Recomendo excluir logicamente, com confirmação no painel dizendo quantos eventos serão removidos. Um diagnóstico já lançado depois dessa IA deve bloquear o desfazer.

### 3. [A] Fêmea morta ou vendida ainda recebe IA; fêmea prenha entra no lote sem aviso (T9, T10)
- **Evidência:** com `f2` marcada `Morto` mas `Ativa` no lote, a IA em lote gerou evento para ela (eventos=2). Uma fêmea com diagnóstico "Prenha" de 20 dias atrás entrou no lote e recebeu IA sem nenhum aviso.
- **Por que corrigir:** o gatilho só valida quando a fêmea entra. Depois disso o status do animal muda e o lote não acompanha. IA em animal morto polui o histórico reprodutivo e a taxa de prenhez. IA em fêmea prenha é erro de manejo, e o sistema deveria avisar antes de gravar.
- **Correção:**
  - Em `registrar_ia_lote_protocolo`, restringir às fêmeas com `individuos.status = 'Vivo'`, e passar para `Descartada` as que saíram do rebanho.
  - Na criação do lote, avisar (não bloquear) quando a fêmea tiver diagnóstico "Prenha" vigente ou parto recente. A tela mostra o aviso e o gestor confirma.

### 4. [M] Datas incoerentes são aceitas (T2b, T3, T6)
- **Evidência:** marcar o D0 com data 30 dias antes do D0 foi aceito. IA lançada 25 dias antes do D0 foi aceita. IA registrada com D0 e D8 ainda pendentes foi aceita.
- **Por que corrigir:** o relatório e o limite de ciclo dependem da data da IA. Data antes do D0 faz a IA cair fora do ciclo e entra no relatório fora de ordem.
- **Correção:** recusar data de execução anterior ao D0 do lote (nas duas RPCs). Para IA com passo anterior pendente, não bloquear (o campo tem imprevistos), mas pedir confirmação no app.

### 5. [M] A mesma fêmea em dois lotes ativos ao mesmo tempo (T4a)
- **Evidência:** `f1` entrou em dois lotes "Em andamento" sem aviso.
- **Por que corrigir:** duas IAs na mesma fêmea contam duas tentativas no relatório e duplicam alertas. Na prática, quase sempre é engano.
- **Correção:** `criar_lote_protocolo_iatf` avisa quando a fêmea já está em lote em andamento. Decisão a tomar: bloquear ou só avisar (repasse legítimo acontece após o lote anterior concluir, então bloquear é seguro).

### 6. [M] Cron roda às 03:30 em Cuiabá
- **Evidência:** `cron.timezone = GMT` e a tarefa está em `30 7 * * *`. Cuiabá está em UTC-4, então roda às 03:30 local.
- **Por que corrigir:** o alerta "para hoje" chega de madrugada e já está lido ou esquecido quando o peão começa o dia. O BACKLOG já lista isso como pendência.
- **Correção:** trocar para `30 11 * * *` (07:30 em Cuiabá) com `cron.alter_job`. Migration de dados/agendamento, uma linha.

### 7. [M] Escrita direta aberta e função `SECURITY DEFINER` exposta
- **Evidência (leitura de policies e advisor):** todas as tabelas de IATF e `eventos_reprodutivos` têm uma policy `FOR ALL` para qualquer `authenticated` com acesso à fazenda. O advisor aponta `copiar_modelo_protocolo_iatf` como `SECURITY DEFINER` chamável por `authenticated`. Não testei como peão.
- **Por que corrigir:** o PWA só precisa das RPCs, mas hoje o peão pode editar protocolos, apagar tarefas ou lotes pela API. É um risco antes de liberar para outras fazendas (já listado no BACKLOG).
- **Correção:**
  - Trocar `copiar_modelo_protocolo_iatf` para `SECURITY INVOKER` (zera o aviso do advisor).
  - Restringir a escrita nas tabelas `protocolos_iatf*` e `lotes_protocolo_iatf*` ao papel de gestão (painel). O painel escreve direto nelas, então a policy precisa distinguir o papel. O peão fica só com as RPCs.
  - `eventos_reprodutivos` não pode ser fechada assim, porque o PWA grava reprodução direto nela. Tratar em separado.

### 8. [B] PWA sem descarte de fêmea (confirmado por busca no código)
- **Por que corrigir:** se uma fêmea sai do protocolo no campo (perdeu o implante, adoeceu), o peão não consegue tirá-la. A IA vai para ela até o gestor descartar no painel. Em conjunto com o item 1 isso força o peão a registrar IA em animal que não foi inseminado.
- **Correção:** ação "Descartar fêmea" na caderneta do PWA, por RPC, com motivo.

### 9. [B] Editar protocolo não é atômico
- **Evidência (código):** `useEditarProtocoloIatf` apaga todos os passos e reinsere, com compensação no cliente.
- **Por que corrigir:** uma queda de rede entre as duas operações deixa o protocolo sem passos.
- **Correção:** uma RPC `salvar_protocolo_iatf` que faz tudo numa transação.

### 10. [B] Lote criado no PWA só aparece depois de duas sincronizações (código, não testado em aparelho)
- **Por que corrigir:** com sinal ruim o peão acha que o lote sumiu e cria outro.
- **Correção:** mostrar na tela "Marcar passo" os lotes locais ainda não sincronizados, com o rótulo "aguardando envio".

### 11. [B] Dívidas de tipos e documentação
- Não há tipos gerados para as tabelas de IATF em `packages/supabase`; o painel faz cast manual. Rodar a geração de tipos.
- `PLANO_INDIVIDUOS_FASE4_SANIDADE_REPRODUCAO.md`, item C2, diz que relatório e alertas estão pendentes. O HISTORICO e o BACKLOG dizem que foram feitos.
- O aviso de gating no PWA diz "ainda está em teste", mas o gating atual é pela flag.

## Ordem sugerida de correção

1. Itens 1, 2 e 3: corrigem dado errado em campo. Podem ir numa só migration de funções, com rollback em `supabase/rollbacks/`.
2. Itens 4 e 5: regras de data e de duplicidade, na mesma leva.
3. Item 6: ajuste de agendamento, pequeno e independente.
4. Item 7: antes de liberar `acesso_iatf` para qualquer outra fazenda.
5. Itens 8 a 11: depois, por conforto e manutenção.

## Observações para quem for implementar

- Mudanças de função no banco afetam o PWA em campo. O PWA já envia `p_individuos: null` na IA, então o item 1 precisa manter esse formato funcionando (aceitar a chamada antiga como "todas as ativas sem IA").
- Peões atualizam o app devagar. As novas validações devem devolver erros que o `SyncErrorModal` já traduz (`23514`/`23503` com mensagem conhecida em `MENSAGENS_PROTOCOLO_IATF`), ou a mensagem nova precisa entrar na lista de `syncErrorMessages.ts`.
- Cada migration segue o fluxo do repo: arquivo + rollback, mostrar o SQL, esperar o ok, `supabase db push` uma por vez, testar na fazenda de testes.
