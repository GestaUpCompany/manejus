# Plano de melhorias UX/UI, Acompanhamento de Tratos

## Objetivo

Tornar a tela de Acompanhamento de Tratos mais fácil de entender, intuitiva e eficiente para identificar desvios e decidir quais lotes exigem ação.

## Escopo analisado

Arquivo principal: `src/pages/controller/AcompanhamentoTratos.tsx`.

Dependência analisada: `src/services/acompanhamentoTratosService.ts`.

A tela atualmente reúne filtros por período, lote e tipo de programação, métricas gerais, conciliação entre fábrica e distribuição, gráficos, pontualidade e resumo expansível por lote.

## Critérios de sucesso

1. O usuário deve saber se os dados foram carregados, se houve erro ou se não existem dados para o filtro.
2. O intervalo de datas inválido deve ser bloqueado antes de consultas ao banco.
3. Uma falha de rede ou serviço não pode aparecer como se fosse ausência de dados.
4. O usuário deve receber uma ação clara para tentar novamente.
5. A tela deve continuar responsiva e sem alterar a regra de negócio dos cálculos.

## Oportunidades identificadas

### Prioridade 1, estados de carregamento, erro e validação de datas

- `loadData` dispara cinco consultas em paralelo, mas não possui `try/catch/finally`.
- Erros dos serviços são convertidos em listas vazias, impedindo diferenciar falha de rede de ausência real de dados.
- Se o intervalo inicial for posterior ao final, a tela pode consultar dados com parâmetros inválidos.
- O estado vazio atual informa apenas que não há dados, sem distinguir filtros inválidos, erro ou ausência real.
- Deve existir botão de nova tentativa e feedback específico para erro.

### Prioridade 2, aplicação de filtros

- Alterações de data e seleção de lotes recarregam os dados imediatamente.
- Uma seleção múltipla pode causar vários carregamentos intermediários.
- Recomenda-se estado temporário para os filtros e botão `Aplicar filtros`.

### Prioridade 2.5, esclarecer planejado acumulado

Este item deve ser resolvido antes dos alertas operacionais, pois afeta a interpretação de todas as métricas e gráficos.

- `Planejado total` soma `linha.planejado_kg` de todas as linhas do período e de todos os lotes filtrados.
- A função `cruzarPlanejadoReal` cria uma linha por lote e dia; por isso, o valor cresce conforme mais dias entram no intervalo.
- Em dias com execução, `planejado_kg` vem de `registros_oferta_trato.kg_planejado`.
- Em dias sem execução, o valor vem da programação, usando `kg_mn_dia` de `programacao_tratos_currais`.
- O valor atual é coerente como acumulado do período, mas o rótulo `Planejado total` sugere que seja o planejamento de um único dia.

Proposta de UX:

1. Renomear os cards para `Planejado no período`, `Real executado no período` e `Desvio acumulado`.
2. Mostrar o intervalo diretamente nos cards ou em uma legenda, por exemplo `12/08 a 11/09`.
3. Adicionar uma métrica diária auxiliar, como `Média planejada por dia`, para responder rapidamente quanto deveria ser tratado em um dia típico.
4. Renomear a coluna da tabela para `Planejado no período` e o gráfico para `Planejado vs Real no período por lote`.
5. Adicionar um texto `Como é calculado?` explicando a origem do planejamento e a diferença entre valor diário e soma do período.
6. Manter a soma acumulada, porque ela é necessária para comparar o total planejado com o total realmente executado no mesmo intervalo.

Implementado em `src/pages/controller/AcompanhamentoTratos.tsx`:

- cards renomeados para indicar que os valores são do período;
- média planejada por dia adicionada;
- intervalo de datas exibido nos cards acumulados;
- `Dias com registro` passou a exibir o total de dias do período;
- explicação expansível da origem e do cálculo do planejado;
- tabela e gráfico por lote identificam o acumulado do período;
- coluna da fábrica renomeada para `Previsto por trato`, evitando confusão com o acumulado da tela.

Validação realizada com a Fazenda Gesta'Up no Chrome:

- `Planejado no período`: 9.240 kg;
- `Média planejada por dia`: 298,1 kg em 31 dias;
- `Real executado no período`: 3.074 kg;
- `Dias com registro`: 1 de 31;
- explicação expansível exibida corretamente;
- nenhum dado operacional foi alterado;
- `npx tsc --noEmit` passou sem erros.

### Prioridade 3, alertas operacionais

- As métricas mostram números, mas não destacam quais lotes exigem ação.
- Criar bloco de alertas para lotes críticos, sem execução e atrasos relevantes.

### Prioridade 4, hierarquia da tela

- A tela apresenta muitas análises no mesmo fluxo vertical.
- Avaliar abas ou seções recolhíveis: Visão geral, Execução, Fábrica e distribuição, Pontualidade.

### Prioridade 5, clareza dos indicadores

- Explicar `Real executado`, `Desvio total`, `Desvio %`, `Pior desvio` e `Dias com registro`.
- Mostrar denominador em `Dias com registro`, por exemplo `18 de 30 dias`.
- Revisar cores de desvio para deixar explícitos excesso, falta e tolerância.

### Prioridade 6, filtros

- Adicionar atalhos de período: hoje, últimos 7 dias, últimos 30 dias e mês atual.
- Mostrar filtros ativos.
- Adicionar busca, selecionar todos e desmarcar todos no dropdown de lotes.
- Fechar o dropdown ao clicar fora ou pressionar `Escape`.

### Prioridade 7, acessibilidade e mobile

- Adicionar `aria-expanded`, `aria-controls` e suporte a teclado nas linhas expansíveis.
- Avaliar cards no mobile em vez de depender somente de rolagem horizontal nas tabelas.
- Desabilitar `Expandir todos` e `Recolher todos` quando a ação não produzir efeito.

### Prioridade 8, desempenho e consistência

- `fetchPlanejadoPorLote` possui padrão N+1, consultando currais para cada programação.
- Detalhes de tratos são carregados para todos os lotes, mesmo quando o usuário filtra lotes específicos.
- Avaliar carregamento sob demanda, cache e RPC/view consolidada.
- Evitar datas geradas com `toISOString().substring(0, 10)`, pois a conversão UTC pode deslocar o dia em fusos locais.
- Evitar que respostas antigas de requisições sobrescrevam resultados de filtros mais recentes.

## Primeira implementação

Será implementada a Prioridade 1:

- validação de intervalo de datas;
- estado explícito de erro;
- tratamento seguro de carregamento com `try/catch/finally`;
- mensagem específica para erro;
- botão `Tentar novamente`;
- diferenciação entre erro, fazenda sem vínculo e ausência de dados.

A validação será feita primeiro no Chrome usando exclusivamente a fazenda de testes configurada para este projeto. Após a primeira implementação, a validação será executada no navegador e o trabalho ficará pausado até novo sinal.

## Registro de validação

- Login no ambiente local realizado com a conta controller da fazenda de testes.
- Tela validada no Chrome com dados reais da Fazenda Gesta'Up, sem alteração de dados.
- Emulação offline validada: a tela exibiu `Não foi possível carregar o acompanhamento` e o botão `Tentar novamente`.
- Recuperação validada após restabelecer a rede: os dados voltaram a ser exibidos.
- Typecheck validado com `npx tsc --noEmit`.
- Validação interativa do intervalo inválido ficou limitada pelo comportamento do preenchimento de `input[type=date]` no DevTools; a regra está coberta no código e o alerta é renderizado quando o estado recebe o intervalo inválido.

## Segunda implementação

A Prioridade 2 foi implementada:

- datas e lotes agora são editados como filtros pendentes;
- as consultas só são disparadas ao clicar em `Aplicar filtros`;
- `Limpar filtros` atualiza os filtros editados e aplicados;
- o usuário recebe aviso quando existem alterações pendentes;
- o botão de aplicação fica desabilitado durante o carregamento ou com intervalo inválido;
- o filtro de tipo continua local, sem nova consulta, pois é aplicado sobre os dados já carregados.

## Registro da segunda validação

- Fazenda de testes validada no Chrome, sem mutações em dados.
- Selecionar um lote exibiu o aviso de alterações pendentes e manteve os indicadores anteriores.
- Aplicar o filtro iniciou o carregamento e atualizou os indicadores de `9.240 kg` para `3.600 kg` planejados no lote selecionado.
- Após a aplicação, o aviso de alterações pendentes desapareceu.
- Typecheck validado com `npx tsc --noEmit`.

## Correção do planejado acumulado

A Prioridade 2.5 foi implementada e validada. A tela agora explicita que os valores são acumulados no período, mostra a média diária e informa a origem do cálculo.

## Prioridade 3, alertas operacionais

Implementado em `src/pages/controller/AcompanhamentoTratos.tsx`:

- bloco `Atenção necessária` exibido após as métricas principais;
- lotes com desvio crítico destacados em vermelho;
- lotes sem execução destacados em amarelo, com a descrição `Há planejamento sem registro de trato`;
- tratos fora da tolerância de horário destacados em laranja;
- estado positivo exibido quando nenhuma situação prioritária é encontrada;
- ação `Ver lotes` expande os lotes críticos ou sem execução e leva ao resumo por lote;
- ação `Ver pontualidade` leva diretamente à seção de pontualidade;
- alertas respeitam os filtros aplicados de período, lote e tipo;
- nenhuma ação altera dados operacionais.

## Registro da terceira validação

- Fazenda de testes validada no Chrome, sem mutações em dados.
- Tela exibiu 4 lotes com desvio crítico e 16 tratos fora da tolerância no período atual.
- `Ver lotes` levou ao resumo por lote e expandiu 4 detalhes.
- `Ver pontualidade` levou à seção correta, posicionada no topo da viewport.
- `npx tsc --noEmit` passou sem erros.

## Prioridade 4, hierarquia da tela

Implementado em `src/pages/controller/AcompanhamentoTratos.tsx`:

- navegação por seções adicionada abaixo dos alertas;
- `Visão geral` concentra os gráficos;
- `Fábrica e distribuição` concentra a conciliação da fábrica;
- `Pontualidade` concentra a análise de horários;
- `Resumo por lote` concentra a tabela expansível;
- métricas e alertas permanecem visíveis como contexto comum em todas as seções;
- botões usam `aria-pressed` para indicar a seção ativa;
- a organização não altera cálculos, filtros ou dados operacionais.

## Registro da quarta validação

- Fazenda de testes validada no Chrome, sem mutações em dados.
- Seção `Visão geral` exibiu os gráficos.
- Seção `Fábrica e distribuição` exibiu a conciliação e ocultou os gráficos.
- Seção `Pontualidade` exibiu a análise de horários e ocultou os gráficos.
- Seção `Resumo por lote` exibiu a tabela expansível e ocultou fábrica e gráficos.
- `npx tsc --noEmit` passou sem erros.

## Prioridade 5, clareza dos indicadores

Implementado em `src/pages/controller/AcompanhamentoTratos.tsx`:

- subtítulos adicionados aos desvios acumulado e percentual;
- os cards agora informam `Abaixo do planejado`, `Acima do planejado` ou `Dentro do planejado`;
- legenda aberta adicionada para verde dentro da tolerância, amarelo em alerta e vermelho crítico;
- direção do desvio ficou separada da gravidade: sinal negativo indica abaixo do planejado e positivo indica acima;
- células de diferença no resumo por lote agora usam a mesma cor do badge de status;
- explicação adicionada de que o status crítico considera a tolerância de cada análise;
- gráfico de tendência explica que mostra real menos planejado em cada dia;
- gráfico por lote explica que a comparação é acumulada no intervalo selecionado;
- diferenças da tabela foram renomeadas para `Diferença no período`;
- legenda permanece aberta por padrão e mostra os limites numéricos das tolerâncias;
- tolerâncias foram extraídas para constantes nomeadas no serviço, evitando números soltos na interface.

## Onde as tolerâncias são determinadas

Em `src/services/acompanhamentoTratosService.ts`:

- `TOLERANCIA_OK_PCT = 5`: desvio de quantidade até 5% é classificado como normal;
- `TOLERANCIA_ALERTA_PCT = 15`: desvio de quantidade até 15% é alerta; acima disso é crítico;
- `TOLERANCIA_OK_MIN = 15`: desvio de horário até 15 minutos é normal;
- `TOLERANCIA_ALERTA_MIN = 30`: desvio de horário até 30 minutos é alerta; acima disso é crítico.

A classificação de quantidade usa `classificarDesvio`; a classificação de horário usa `classificarDesvioHorario`. A tela importa as mesmas constantes para exibir cores, textos e limites coerentes com o cálculo.

## Registro da quinta validação

- Fazenda de testes validada no Chrome, sem mutações em dados.
- Os cards exibiram `Abaixo do planejado` junto dos valores negativos.
- A legenda de desvios foi exibida com as três interpretações de cor.
- As células de diferença do resumo usam a mesma classificação visual do status do lote.
- Os dois gráficos exibiram textos explicativos.
- `npx tsc --noEmit` passou sem erros.

## Prioridade 6, filtros e atalhos

Implementado em `src/pages/controller/AcompanhamentoTratos.tsx`:

- atalhos `Hoje`, `Últimos 7 dias`, `Últimos 30 dias` e `Mês atual`;
- datas dos atalhos formatadas no fuso local;
- bloco `Filtros aplicados` com período, lotes e tipo atualmente aplicados;
- busca no seletor de lotes;
- ações `Selecionar todos` e `Limpar seleção`, aplicadas a todos os lotes carregados;
- fechamento do seletor por clique fora ou tecla `Escape`;
- filtros continuam pendentes até o usuário clicar em `Aplicar filtros`.

## Registro da sexta validação

- Fazenda de testes validada no Chrome, sem mutações em dados.
- Atalhos de período ficaram visíveis no topo dos filtros.
- Filtros aplicados ficaram visíveis abaixo do formulário.
- Seletor de lotes exibiu busca e ações de seleção em massa.
- Clique fora fechou o seletor.
- `npx tsc --noEmit` passou sem erros.

## Prioridade 7, acessibilidade e responsividade mobile

Implementado em `src/pages/controller/AcompanhamentoTratos.tsx`:

- linhas expansíveis do resumo receberam `role="button"`, `tabIndex`, `aria-expanded` e `aria-controls`;
- linhas expansíveis respondem a `Enter` e `Espaço`;
- ações `Expandir todos` e `Recolher todos` ficam desabilitadas quando não produzem efeito;
- no mobile, o resumo por lote é apresentado em cards compactos;
- cards mobile preservam status, métricas principais e detalhes dos tratos;
- cards mobile também são expansíveis e acessíveis por teclado;
- a tabela completa permanece disponível no desktop;
- breakpoints de tablet revisados para evitar seis cards estreitos e filtros comprimidos;
- filtros só ficam em linha horizontal em telas largas;
- gráficos mantêm uma coluna em larguras intermediárias antes de usar duas colunas.

## Registro da sétima validação

- Fazenda de testes validada no Chrome, sem mutações em dados.
- Viewport móvel de 390x844 exibiu cards por lote em vez da tabela horizontal.
- Expansão mobile exibiu os detalhes dos tratos.
- Resumo desktop permaneceu em tabela.
- Botão `Recolher todos` apareceu desabilitado quando nada estava expandido.
- `npx tsc --noEmit` passou sem erros.

## Prioridade 8, carregamento e consistência de requisições

Primeira etapa implementada em `src/pages/controller/AcompanhamentoTratos.tsx` e `src/services/acompanhamentoTratosService.ts`:

- detalhes individuais dos tratos deixaram de ser carregados junto com o resumo inicial;
- detalhes são buscados somente quando o usuário expande um lote;
- a busca de detalhes recebe o `lote_id` selecionado;
- durante a busca, a interface informa `Carregando detalhes dos tratos...`;
- identificadores de requisição impedem que respostas antigas sobrescrevam filtros mais recentes;
- requisições antigas também deixam de controlar o estado global de carregamento;
- detalhes antigos são limpos quando um novo filtro aplicado começa a carregar;
- o Resumo por lote mantém o detalhamento original por trato.

## Condensação da fábrica e conciliação

Implementado em `src/pages/controller/AcompanhamentoTratos.tsx`:

- resumo operacional permanece sempre visível;
- totais de tratos, concluídos, parciais, saldo pendente, produzido e distribuído ficam nos cards;
- tabela detalhada é recolhida por padrão;
- quando aberta, a tabela é agrupada por dia, com uma linha diária e os registros individuais daquele dia expansíveis;
- botão `Ver detalhes por trato` abre a tabela somente quando necessário;
- botão `Ocultar detalhes por trato` retorna à visão condensada;
- filtros novos fecham novamente os detalhes para evitar uma tela longa após recarregamento.

## Registro da oitava validação

- Fazenda de testes validada no Chrome, sem mutações em dados.
- Resumo por lote carregou sem os detalhes individuais inicialmente.
- Ao expandir um lote, os detalhes foram carregados e exibidos corretamente.
- A fábrica exibiu resumo diário e permitiu expandir os registros individuais de cada data.
- Typecheck validado com `npx tsc --noEmit`.

## Pausa operacional

A primeira etapa da Prioridade 8 foi implementada e validada. O N+1 de `fetchPlanejadoPorLote`, a otimização das consultas agregadas e a revisão completa de timezone permanecem como etapas técnicas futuras.
