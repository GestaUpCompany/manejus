# Plano: Indivíduos Fase 4, Reprodução (Sanidade ADIADA)

Status: desenho para revisão. Nenhuma migration foi escrita. Os blocos de SQL abaixo são esboços do modelo, não arquivos executáveis.

## DECISÃO (08/10/2026)

O responsável decidiu **pular a sanidade por enquanto**. Tudo que é de sanidade neste documento (seções 4.1, 5 e 6 nas partes de sanidade, e as sub-fases S1 e S2 da seção 7) fica **preservado como desenho adiado**, sem prazo. A **Fase 4 passa a ser só Reprodução**. A pendência também está em `docs/BACKLOG.md` (seção "Sanidade dos indivíduos (desenho pronto, adiada)").

O que a sanidade adiada **não** bloqueia: reprodução não depende de nenhuma tabela de sanidade.

## 1. Ponto de partida (fatos levantados no banco em 08/10/2026)

| Tema | O que existe hoje |
|---|---|
| Catálogo | `medicamentos` (143 itens, por fazenda): `tipo` (Antibiotico, Vacina, Vermifugo, Carrapaticida, Hormonio...), `nome_comercial`, `principio_ativo`, `dose_recomendada`. **Sem carência, validade, intervalo de reaplicação nem vínculo com estoque.** Só 9 itens "Vacina", em 1 fazenda. |
| Saúde clínica | `registros_enfermaria`: 15 registros no banco todo, um animal por registro (brinco/chip em texto), `diagnosticos` e `medicamentos` em **JSON** (`medicamentoId`, `nomeComercial`, `doseAplicada`...), `tipo_registro` Curativo/Preventivo. Só 4 de 15 têm `individuo_id`. |
| Maternidade | 323 partos; só 1 registra medicamento. `individuo_id_mae`/`individuo_id_cria` já existem. |
| Reprodução | **Nada**: sem cobertura, inseminação, diagnóstico de gestação, touro/sêmen ou estação de monta. "Vaca Prenha" é uma categoria escolhida à mão. |
| Dados para reprodução | 323 partos, **201 (62%) já com mãe vinculada**, 180 mães distintas, mas só **3 mães com 2 ou mais partos** (intervalo entre partos quase não tem histórico ainda). 249 fêmeas em categorias reprodutivas em 10 fazendas (Chibiu 94, Boiadeiro 42, Sirio 41, Marcon 28). **Nenhuma fazenda tem touro cadastrado** e **ninguém usa a categoria "Vaca Prenha"** (0). |
| Estoque | `insumos` + `movimentacoes_estoque_suplementos` existem (suplementos); medicamento não baixa estoque. |
| Alertas | Padrão pronto: crons `notificar_*` + `notificacoes` (ex.: `notificar_proximidade_desmama`). |

Consequência: o volume atual é baixo, então o custo de migração é pequeno e dá para desenhar certo. Mas a **ficha sanitária só fica completa se o PWA enviar `individuo_id`** em enfermaria (item já registrado como "depois").

## 2. Referência de mercado (o que o módulo precisa cobrir)

- **Sanidade** (Herdwatch, CattleMax, GAtec, Leigado): aplicação por animal ou por lote; produto, dose, via, partida e validade; **carência** (liberação para abate); calendário sanitário com próxima dose; custo por animal; histórico na ficha.
- **Reprodução** (Leigado, CattleMax, GAtec): estação de monta; cobertura natural, IA e TE com touro/sêmen; diagnóstico de gestação (palpação/ultrassom); **previsão de parto**; intervalo entre partos; taxa de prenhez; status reprodutivo da fêmea.

## 3. Princípios do desenho

1. **Reaproveitar** `medicamentos` e `registros_enfermaria`; não duplicar dados. Histórico antigo aparece por **view**, sem backfill.
2. **Aditivo e retrocompatível** com o PWA (peões atualizam devagar): colunas anuláveis, tabelas novas, nenhum registro alterado.
3. **Painel primeiro** (online). Entrada de dados pelo PWA fica para depois, como já decidido.
4. **Derivar, não digitar**: previsão de parto, status reprodutivo e carência são calculados.
5. **Alerta antes de bloqueio** em tudo que toca OS de abate.
6. Padrão de segurança das Fases 5/B: RLS `is_admin_user() OR caller_has_fazenda_access(fazenda_id)` para `authenticated`, `REVOKE` de `anon`, funções de gatilho sem EXECUTE público, rollback em `supabase/rollbacks/`.

## 4. Modelo de dados

### 4.1 Sanidade

```sql
-- catálogo (colunas novas, anuláveis)
ALTER TABLE medicamentos
  ADD COLUMN carencia_abate_dias integer CHECK (carencia_abate_dias >= 0),
  ADD COLUMN intervalo_reaplicacao_dias integer CHECK (intervalo_reaplicacao_dias > 0);

-- evento sanitário: por animal OU por lote
CREATE TABLE aplicacoes_sanitarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES fazendas(id),
  data date NOT NULL,                              -- data na fazenda (sem fuso)
  tipo text NOT NULL CHECK (tipo IN ('Vacinação','Vermifugação','Tratamento','Preventivo','Outro')),
  individuo_id uuid REFERENCES individuos(id) ON DELETE SET NULL,
  lote_id uuid REFERENCES lotes(id) ON DELETE SET NULL,
  categoria text, numero_cabecas integer CHECK (numero_cabecas > 0),   -- quando o alvo é o lote
  medicamento_id uuid REFERENCES medicamentos(id) ON DELETE SET NULL,
  medicamento_nome text NOT NULL, principio_ativo text,                -- snapshot: o catálogo pode mudar
  dose_aplicada text, via_aplicacao text,
  lote_produto text, validade_produto date,
  carencia_abate_dias integer,                     -- snapshot do catálogo na data da aplicação
  liberacao_abate_em date,                         -- data + carência (gatilho)
  proxima_aplicacao_em date,                       -- data + intervalo (gatilho)
  diagnostico text, observacao text, responsavel text,
  origem text NOT NULL DEFAULT 'painel' CHECK (origem IN ('painel','pwa')),
  local_id text UNIQUE,                            -- idempotência para o PWA futuro
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), deleted_at timestamptz,
  CHECK (individuo_id IS NOT NULL OR lote_id IS NOT NULL)
);
```

- **`v_historico_sanitario_individuo`** (view): união de `aplicacoes_sanitarias` + `registros_enfermaria` (medicamentos expandidos do JSON) + `registros_maternidade` (medicamentos da mãe). A ficha lê só esta view.
- **Por que evento por lote com `numero_cabecas`**: nem toda fazenda individualiza o rebanho (5 fazendas têm 0 indivíduos). Vacinar 80 cabeças não pode exigir 80 cadastros. Quando houver indivíduos, o painel também gera uma linha por animal selecionado.
- **Carência**: função `animais_em_carencia(fazenda, em date)` e `lotes_em_carencia(...)`. Aplicação por lote marca o lote inteiro.

### 4.2 Reprodução

```sql
CREATE TABLE estacoes_monta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES fazendas(id),
  nome text NOT NULL, data_inicio date NOT NULL, data_fim date NOT NULL CHECK (data_fim >= data_inicio),
  observacao text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), deleted_at timestamptz
);

CREATE TABLE eventos_reprodutivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fazenda_id uuid NOT NULL REFERENCES fazendas(id),
  individuo_id uuid NOT NULL REFERENCES individuos(id),           -- a fêmea (gatilho valida sexo)
  tipo text NOT NULL CHECK (tipo IN ('Cobertura','Inseminação','Transferência de embrião',
                                      'Diagnóstico de gestação','Aborto','Descarte reprodutivo')),
  data date NOT NULL,
  estacao_id uuid REFERENCES estacoes_monta(id) ON DELETE SET NULL,
  touro_id uuid REFERENCES individuos(id), touro_nome text, semen_partida text, tecnico text,   -- cobertura/IA/TE
  metodo_diagnostico text CHECK (metodo_diagnostico IN ('Palpação','Ultrassom','Outro')),
  resultado text CHECK (resultado IN ('Prenha','Vazia','Inconclusivo')),
  idade_gestacao_dias integer CHECK (idade_gestacao_dias >= 0),
  evento_cobertura_id uuid REFERENCES eventos_reprodutivos(id), -- diagnóstico aponta a cobertura
  observacao text, responsavel text,
  local_id text UNIQUE, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), deleted_at timestamptz
);
```

- **Derivados (view `v_status_reprodutivo`)**: última cobertura, último diagnóstico, **último parto** (de `registros_maternidade.individuo_id_mae`), `previsao_parto` (cobertura + 283 dias, ou diagnóstico menos a idade da gestação), status (**Prenha, Vazia, Parida/lactante, Sem registro**), dias em aberto, intervalo entre partos.
- **Taxa de prenhez por estação**: diagnósticos positivos sobre coberturas/IA da estação.
- **Categoria "Vaca Prenha"** continua manual; a tela só **sugere** a mudança quando o status derivado diz Prenha. Nada de automação sobre `individuos.categoria` (há o sistema de recategorização por faixas).
- Duração de gestação: constante 283 dias com ajuste por fazenda em fase posterior.

## 5. Telas (painel)

- **Ficha do animal** (`IndividuoDetalhe`): novas abas **Sanidade** (histórico unificado, carência ativa em destaque, "Lançar aplicação") e **Reprodução** (linha do tempo, status, previsão de parto, "Lançar evento").
- **Manejo sanitário em lote**: escolher lote (e categoria), produto, dose, data; gera 1 evento de lote e, opcionalmente, uma linha por animal individualizado.
- **Reprodução**: cadastro de estações de monta; lançamento em sequência de diagnósticos de gestação de um grupo de fêmeas.
- **Pendências**: doses a vencer, fêmeas sem diagnóstico após X dias da cobertura, partos previstos nos próximos 30 dias, animais em carência.
- **Catálogo de medicamentos** (`Medicamentos.tsx`): campos novos de carência e intervalo.

## 6. Integrações e impactos

| Integração | Desenho | Risco |
|---|---|---|
| **OS de abate/venda** | Na pesagem em OS de saída, se o animal/lote está em carência, registrar `CARENCIA_ATIVA` em `logs_sync_errors` (mesmo padrão de `OS_ANIMAL_JA_BAIXADO`) e mostrar aviso na OS. **Não bloqueia.** | Baixo: só acrescenta log |
| **PWA** | Nenhum impacto nesta fase. Tabelas novas não são lidas pelo PWA. Depois: Enfermaria passa `individuo_id` (1 linha), Morte usa `AnimalIdentifier`, e cadernetas de reprodução exigem store IndexedDB + `syncService` + leitura para `peao`. | Nenhum agora |
| **Notificações** | Crons no padrão `notificar_*` (carência a vencer, dose a vencer, parto próximo, diagnóstico pendente). | Baixo |
| **Estoque** | Fora do escopo. `medicamento_id` fica pronto para baixa de estoque futura. | Nenhum |
| **Relatórios** | `RelatorioSaude` passa a incluir aplicações; novo relatório reprodutivo (taxa de prenhez, intervalo entre partos). | Médio (PDF/público) |

## 7. Sub-fases

### Fase 4: Reprodução (PRÓXIMA)

**4a: Eventos reprodutivos e ficha**
- **STATUS (08/10/2026): schema APLICADO** (migrations 20261008160000, 161000 e 162000, testadas). **Falta o painel** (aba Reprodução, lançar evento, estações de monta).
- Migration: `estacoes_monta`, `eventos_reprodutivos`, gatilho que valida sexo (fêmea; touro, se for animal cadastrado, macho), view `v_status_reprodutivo`, RLS no padrão das Fases 5/B, rollback.
- Painel: aba **Reprodução** na ficha da fêmea (linha do tempo, status, previsão de parto, "Lançar evento") e cadastro de estações de monta.
- **Touro**: `touro_nome` em texto livre como caminho principal (nenhuma fazenda tem touro cadastrado); `touro_id` opcional quando houver.
- Validação: vitest da previsão de parto e do status; SQL em transação com rollback (RLS, gatilho de sexo, view cruzando os partos reais de BR-042 com 19 partos); devtools na fazenda de testes; `get_advisors` sem alerta novo.

**4b: Diagnóstico de gestação em grupo e visão por estação**
- Tela para lançar o diagnóstico de várias fêmeas de uma vez (por lote ou seleção) e resumo da estação (cobertas, prenhes, vazias, taxa de prenhez).
- Validação: lançamento em lote na fazenda de testes e conferência da taxa contra consulta SQL.

**4c: Pendências, alertas e relatório**
- Pendências: fêmeas sem diagnóstico X dias após a cobertura, partos previstos nos próximos 30 dias, fêmeas vazias há muito tempo.
- Crons `notificar_*` no padrão existente; relatório reprodutivo (taxa de prenhez, intervalo entre partos, dias em aberto) e exportação.
- Validação: cron executado manualmente na fazenda de testes; relatório conferido contra SQL.

Cada migration: arquivo em `supabase/migrations/`, rollback em `supabase/rollbacks/`, mostrar o SQL e **só aplicar com o seu ok**, uma por vez, como na Fase 3. Testes de dados só na fazenda `d649c65e-16ab-4b77-a84b-df937aa41cc3`.

### Sanidade (ADIADA, sem prazo)

**S1: Sanidade individual**
- Migration: colunas de carência no catálogo, `aplicacoes_sanitarias`, gatilho de datas derivadas, view do histórico unificado, RLS.
- Painel: aba Sanidade na ficha + lançar aplicação + campos novos em Medicamentos.
- Validação: vitest da regra de carência/próxima dose; SQL em transação com rollback (RLS, gatilho, view com os 15 registros reais); devtools; `get_advisors`.

**S2: Manejo sanitário em lote e carência**
- Aplicação por lote, função de carência, aviso na OS (`CARENCIA_ATIVA`, sem bloquear).
- Validação: simulação de OS de abate com lote em carência (transação com rollback).

(Os alertas e relatórios de sanidade entram junto, no padrão da 4c.)

## 8. Decisões abertas

**Para iniciar a Reprodução (4a):**
1. **Escopo dos eventos**: incluir já "Transferência de embrião" e "Descarte reprodutivo", ou só cobertura, inseminação, diagnóstico e aborto?
2. **Duração da gestação**: 283 dias fixos agora (recomendado) ou por raça desde já?
3. **Touro**: texto livre como caminho principal (recomendado, porque não há touros cadastrados) ou exigir o animal cadastrado?
4. **Previsão de parto sem cobertura registrada**: usar só o diagnóstico (data menos a idade da gestação) ou exigir a cobertura?

**Adiadas com a sanidade:** modelo "animal ou lote" com `numero_cabecas`; carência só alerta ou bloqueia a OS de abate.

## 9. Fora de escopo desta fase

Sanidade (adiada), baixa de estoque de medicamento, custo por animal, caderneta de reprodução no PWA, importação de planilha reprodutiva, integração com sistemas oficiais de defesa sanitária.


## 10. Atualização de 16/10/2026: estado real e Fase 4 no PWA (com checagem de mercado)

### 10.1 Estado em 16/10/2026
- **Painel:** Reprodução (4a, 4b, 4c com alertas) e Sanidade (S1, S2, pendências e alertas) implementadas e na staging. Registro em `docs/HISTORICO.md`.
- **PWA:** a Enfermaria **já envia** `individuo_id` (usa `AnimalIdentifier`; `syncService.ts`), a pendência de 08/10 ficou velha. A Morte vincula o animal por texto (`individuoVivoPorIdentificacao`, brinco/chip digitados) e envia `individuoId` se achar, mas não usa o `AnimalIdentifier`.

### 10.2 Checagem de mercado (16/10/2026)
Fonte: páginas dos próprios fornecedores (material de divulgação, funcionalidades a confirmar em demonstração) e material técnico da Embrapa. Não houve comparação independente.

| Tema | O que o mercado faz | Onde estamos |
|---|---|---|
| **Calendário sanitário** | Ganadero: calendário de vacinação por animal e por lote, tipos de vacina personalizáveis e lembretes. SoftPec: protocolos por espécie/categoria e lembrete da próxima dose, alerta de vacina próxima do vencimento. MultSoft: campanhas sazonais e cronogramas de vermifugação. VSM Agro: prazo ideal de vacinação e alerta de brucelose pendente. Leigado: lembretes diários. Esteio: calendário e relatórios sanitários. | **Lacuna.** Só calculamos a próxima dose depois da primeira aplicação (intervalo do catálogo). Não há programação por categoria/data nem campanha recorrente (aftosa, brucelose em bezerras). |
| **Protocolo de IATF** | Controle IATF calcula D8, D10 e a IA a partir do D0, registra touro e diagnóstico e gera relatório de taxa de prenhez por lote. Prodap Views (segundo a Apecuária de Precisão): taxa de prenhez por sêmen, inseminador e protocolo. Embrapa (Pantanal de MS, 2006/2007): taxa de prenhez varia com touro e tipo de sêmen (sexado × convencional). Cronograma clássico D0 (implante de P4 + estradiol), D8 (retirada, prostaglandina, eCG), D10 (IA); 45 a 55% por tentativa. | **Lacuna.** Lançamos só o evento final (cobertura/inseminação). Sem protocolo (D0/D8/D10), sem lote de protocolo e sem taxa por touro, sêmen, inseminador ou protocolo (temos touro, partida do sêmen e técnico como texto, então o dado existe). |
| **Sessão de manejo no curral** | Herdwatch (leitor EID e balança Bluetooth), HerdX (processamento "express" ou detalhado), AgriEID (offline com sincronização), Cattlytics (peso e tratamento por RFID, offline), CattleMax (modelos de protocolo repetível). Mercado individual-first: a mesma passada costuma gravar peso, tratamento e vacina. | **Alinhado no offline e na sessão.** Diferente de propósito: o Manejo de Curral só identifica e designa (peso só no animal, lote vira pendência), porque o agregado é a verdade. Falta o bastão RFID e gravar tratamento/vacina na mesma passada. |

Conclusão: o núcleo está alinhado; as lacunas que pesam são **calendário sanitário** e **protocolo de IATF**.

### 10.3 Fase 4 no PWA (ordem proposta)
**P1. Morte com `AnimalIdentifier`** (pequena): trocar os campos soltos de brinco/chip pelo seletor, manter "brinco/chip ou o motivo de não ter". Sync não muda. Teste: morte com e sem animal na fazenda de testes.

**P2. Caderneta de Sanidade** (banco pronto: `aplicacoes_sanitarias`, `local_id` único, `origem = 'pwa'`):
- tela e lista; alvo animal (`AnimalIdentifier`) ou lote + categoria + cabeças; produto do catálogo ou digitado; dose, via, partida, validade e carência;
- store no IndexedDB (bump de versão), entrada no `syncService` (`'sanidade': 'aplicacoes_sanitarias'`), ordem na fila, `SyncErrorModal`;
- cache: o catálogo de medicamentos precisa trazer `carencia_abate_dias` e `intervalo_reaplicacao_dias`; para avisar carência offline, guardar as aplicações recentes ou o resultado de `animais_em_carencia`;
- botão e imagem, rota, `validation.ts`, `shareUtils.ts`, `SuccessModal`, lista de cadernetas permitidas por funcionário (PWA e painel `CADERNETAS`).
- Carência só avisa, nunca bloqueia.

**P3. Caderneta de Reprodução**:
- **Migration antes:** `eventos_reprodutivos` não tem `local_id`. Adicionar coluna e índice único completo (índice parcial dá 42P10).
- Conferir o gatilho de validação com registros fora de ordem (diagnóstico chegando antes da cobertura).
- Cache offline das fêmeas do lote com status (`v_status_reprodutivo`) e das estações de monta.
- Telas: cobertura/inseminação, diagnóstico de gestação em grupo (a mais útil no curral) e aborto; mesmos pontos de estrutura da P2.

### 10.4 Novas candidatas (a priorizar com o responsável)
**C1. Calendário sanitário (painel + alerta):**
- tabela de programação por fazenda: produto, categoria alvo, regra de data (data fixa anual, idade do animal ou intervalo), janela de aviso;
- gera pendências por lote/categoria, também para quem ainda não lançou a primeira aplicação; entra na página Manejo Sanitário e nas notificações semanais;
- vacinas obrigatórias (aftosa, brucelose em bezerras) como modelos prontos editáveis por fazenda. As regras e janelas oficiais devem ser confirmadas com o órgão estadual antes de embutir datas.

**C2. Protocolo de IATF:**
- tabela de protocolo (nome, passos com dia, produto e dose) e lote de protocolo (fêmeas, D0, responsável); os passos D8/D10 viram tarefas com data calculada;
- a IA registra um evento de `Inseminação` com touro, partida do sêmen e técnico (já existentes);
- relatório de taxa de prenhez por protocolo, touro, sêmen e inseminador, sobre `eventos_reprodutivos`;
- decidir antes: dados fixos do protocolo no código ou editáveis; quem executa os passos (veterinário externo ou peão).

**C3. Sessão de curral com tratamento/vacina:** gravar, na mesma sessão do Manejo de Curral, uma aplicação sanitária por linha ou para o grupo. Não afeta contagem nem peso do lote, então cabe na regra do agregado. Depende da P2.

**C4. Bastão RFID:** decidir qual bastão e balança vocês usam (Bluetooth ou serial) antes de qualquer desenho.

### 10.5 Pontos de atenção levantados na revisão
- A RLS de `aplicacoes_sanitarias`, `eventos_reprodutivos` e `estacoes_monta` deixa o peão escrever pela API, igual às demais tabelas; avaliar uma migration que restrinja a escrita a quem não é peão.
- O resumo por estação de monta ignora os partos posteriores à cobertura; contar o parto como prenhez confirmada.
- Carência de lote também marca animal que entrou no lote depois da aplicação (lado conservador).
