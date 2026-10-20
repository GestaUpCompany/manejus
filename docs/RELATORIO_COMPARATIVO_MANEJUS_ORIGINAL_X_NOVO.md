# Relatório comparativo: Manejus original × novo Manejus

Data da análise: 2026-10-19. Somente leitura: nenhum dado foi alterado em nenhum dos dois bancos.

- **Original**: projeto Supabase `nrwljcvhwbezmoummxbl` ("Cadernetas Digitais"), banco deste repo, usado pelo painel e pelo PWA em campo.
- **Novo**: projeto Supabase `tcjrztbivvosrxjnjqom`, banco do Farm Plan (`apps/farmplan`), onde um dev criou um segundo conjunto de tabelas `manejus_*` e um módulo financeiro `vision_*`. O dev disse que pretende abandonar o original e importar tudo para o novo.

**Pergunta:** quão avançado está o novo em relação ao original, e a migração dos dados é viável do jeito que está?

## 1. Veredito

**Não é viável do jeito que está.**

1. **O PWA em campo não consegue gravar no novo.** As tabelas `manejus_*` não têm `sync_status`, `version`, `dispositivo_id` nem `deleted_at`, e só 6 têm `local_id`. O PWA grava em cerca de 33 tabelas do original com esse contrato.
2. **O modelo de dados é outro.** Só 19% das colunas de negócio das tabelas equivalentes têm o mesmo nome. Os demais campos foram renomeados, movidos para jsonb ou não existem. Não existe cópia direta.
3. **Faltam as regras de negócio do original** (recategorização, recálculo de cabeças, custo médio, GMD, peso vivo, consumo, carência, planos nutricionais com histórico). Sem elas, os números migrados não fecham.
4. **O novo tem pouquíssimo dado e uso real.** 3 fazendas contra 59, 14 lotes contra 623, 18 mil linhas no banco todo (boa parte do financeiro e do Farm Plan), 14 módulos `manejus_*` com zero registros.
5. **O original está em uso hoje.** Último registro de suplementação em 2026-10-19, 17 fazendas com suplementação e 34 com lotes. Uma migração exigiria congelar e cortar o uso, com plano de volta.

O que dá para migrar com ETL (extração, transformação e carga): cadastros-base (fazendas, pastos, insumos, dietas). O histórico operacional exige mapeamento e conversão. Indivíduos, reprodução, sanidade, snapshots de planos e `audit_log` não têm destino no novo.

## 2. Escopo e limites da análise

Fonte dos dados:
- Original: MCP do Supabase (somente leitura) e os arquivos deste repo.
- Novo: o MCP do `tcjr...` falhava com `fetch failed`. Os dados vieram de dois scripts PowerShell somente leitura, que chamam a API de gerenciamento do Supabase com o token do usuário (consultas só em catálogos e contagens).

**Não verifiquei:**
- O corpo das regras dos triggers do novo além de uma amostra (12 funções lidas).
- As migrations do novo (a consulta a `supabase_migrations` deu erro 400).
- As Edge Functions do novo ao vivo (usei os arquivos do repo em `apps/farmplan/supabase/funcoes/`).
- O tamanho do banco do novo, o Realtime dele e as configurações de Auth.
- O conteúdo das linhas, só contagens. Não sei qual banco tem dados "reais" no sentido de negócio além do volume.
- Equivalência semântica das colunas (a comparação é por nome).

**Correções de leituras anteriores (mesma sessão):**
- As contagens do `list_tables` do Manejus eram estimativas. As exatas estão neste relatório (por exemplo `fazendas` = 59, não 1).
- Afirmei que o novo não tinha tratamento de fuso de Mato Grosso. Na verdade, 5 funções usam `America/Cuiaba` (`alertas_consultor`, `avisos_do_dia`, `manejus_baixa_farmplan`, `manejus_lanc_confirmado`, `virar_semana`), só não é o tratamento amplo do original.

## 3. Infraestrutura

| Item | Original | Novo |
|---|---|---|
| Tabelas em `public` | 174 | 120 (49 vazias) |
| Funções do usuário | 380 (145 de trigger, 321 `SECURITY DEFINER`) | 142 (66 de trigger, 124 `SECURITY DEFINER`) |
| Triggers | 231 | 220 |
| Policies RLS | 432 (86 de escrita com `true`) | 384 (1 aberta, só leitura em `precos_arroba`) |
| Índices | 709 | 256 |
| Views | 15 | 1 (`vision_base_bi`) |
| Enums | 6 | 0 |
| Migrations | 1.314 | não lido |
| Extensões | btree_gist, pg_cron, pg_net, pg_stat_statements, pgcrypto, **pgrouting**, plpgsql, **postgis**, supabase_vault, **unaccent**, uuid-ossp | pg_cron, pg_net, pg_stat_statements, pgcrypto, plpgsql, supabase_vault, uuid-ossp |
| Crons | 15 | 7 |
| Edge Functions | 10 | 2 (segundo o repo) |
| Buckets | 8 (351 objetos, cerca de 96 MB) | 6 |
| Realtime | tabelas `fp_*` | não lido |
| Usuários (auth) | 124 | 20 (17 de campo) |
| Fazendas | 59 (55 ativas) | 3 |
| Tamanho do banco | 359 MB | não lido |

**Geometria:** o original usa PostGIS (`pastos.geometria`, 325 pastos com desenho; `currais` e `fazendas.bounding_box` sem dados). O novo guarda GeoJSON em `locais.geometria` (jsonb, com CHECK de tipo) e não tem PostGIS nem pgRouting. As tabelas `mapa_*` do original estão vazias, então não há perda prática, mas a conversão dos 325 desenhos (`ST_AsGeoJSON`) é necessária.

**IDs:** o novo usa `uuid` na maioria. IDs `bigint`/`integer` só em `manejus_historico` e em tabelas `vision_*` (sem relação direta com as tabelas do original).

## 4. Edge Functions

| Função | Original | Novo |
|---|---|---|
| Login do peão (`login-peao`) | Sim (JWT desligado; só deployada, **não está no repo**) | Não; o equivalente é `criar-acesso` com e-mail fictício `usuario@campo.gestaup.com` |
| `validate-farm-access` | Sim (só deployada, **não está no repo**) | Não |
| `lembrete-tratos-diario` | Sim (cron horário; só deployada, **não está no repo**) | Não |
| `chat-fazenda` (assistente de IA, 2.334 linhas) | Sim | Não |
| `cotacao-dolar` | Sim | Não |
| `impersonate-user` | Sim | Não |
| `create-user-without-confirmation`, `create-auth-user-only` | Sim | `criar-acesso` cobre parte (login de campo e consultores) |
| `rollback-user-creation`, `change-user-password` | Sim | `criar-acesso` troca senha; rollback não existe |
| Avisos por push, relatório mensal em PDF por e-mail (Resend), relatório semanal em PDF no WhatsApp (Cloud API da Meta) | Não (WhatsApp está no BACKLOG) | Sim (`enviar-avisos`, 504 linhas) |

Observações:
- 3 das 10 Edge Functions do original só existem deployadas (`validate-farm-access`, `login-peao`, `lembrete-tratos-diario`) e não têm código no repo. Isso é risco do original, independente da migração: o código-fonte delas precisa ser recuperado antes de qualquer corte.
- Os crons do novo chamam a URL correta do próprio projeto `tcjr...` (conferido nos comandos de `cron.job`). O risco de apontar para o projeto antigo, citado no README do Farm Plan, não existe hoje.

## 5. Crons

| Original (15) | Novo (7) |
|---|---|
| `atualizar_status_atividades`, `fp_rollover_semanal`, `atualizar-idade-categorias`, `update-dados-lotes`, `update-peso-vivo-daily`, `update-pesos-individuos-daily`, `verificar_ocupacoes_acima_meta`, `lembrete-tratos-diario`, `notificar_calendario_sanitario`, `notificar_individuos_incompletos_antigos`, `notificar_pendencias_reprodutivas`, `notificar_pendencias_sanitarias`, `notificar_proximidade_desmama`, `cleanup-audit-log`, `system-health-sampling` | `farmplan-virada-semanal`, `farmplan-aviso-manha`, `farmplan-aviso-tarde`, `farmplan-alerta-consultor`, `farmplan-relatorio-mensal`, `farmplan-relatorio-semanal`, `farmplan-desligar-avisos-antigos` |

Todos os 7 crons do novo são do Farm Plan. Nenhum cobre rotina de pecuária (idade das categorias, peso vivo, pesos dos indivíduos, ocupação de pastos, lembrete de tratos, sanitário, reprodução).

## 6. Triggers e funções

### 6.1 Original (231 triggers, 145 funções de trigger)

Por finalidade:
- **Auditoria (`fn_audit_trigger`):** 27 tabelas (formulações, lotes, lote_categorias, pastos, currais, planos, indivíduos, registros de abastecimento, clima, enfermaria, leitura de cocho, maternidade, morte, movimentação, oferta de trato, suplementação, sanitário, reprodução, usuários e outras).
- **`updated_at`:** cerca de 50 triggers.
- **Quantidades do lote:** `update_quant_atual_movimentacao` (7,3 mil caracteres), `update_quant_atual_morte`, `update_quant_atual_maternidade`, `trigger_movimentacao_recalc_quant_update`, `lock_quant_inicial`, mais funções `calculate_quant_atual`, `calculate_quant_em`, `recalculate_all_quant_atual`.
- **Estoque e custo:** `update_estoque_suplemento` (WAC), `trg_suplementacao_mov`, `trg_saida_insumos_itens_mov`, `trg_entrada_insumos_itens_mov`, `trg_fabrica_confinamento_insumos_mov`, `update_tanque_saldo_custo`, `validar_capacidade_tanque`, `recalcular_custo_medio_item`, `recalcular_custo_medio_tanque`, almoxarifado e cantina.
- **Consumo e formulações:** `calcular_consumo_registro_anterior`, `recalc_consumo_on_cabecas_update`, `trigger_recalc_pct_pv_on_peso_change`, `trg_consumo_confinamento_leitura/oferta`, recálculo de formulação (insumos, junção, parâmetros), snapshot de formulação, GMD (`sync_gmd_*`, `fn_set_gmd_bezerro_ao_pe`), integridade de creep.
- **Localização e histórico:** `trg_lotes_pasto_historico`, `trg_currais_lote_historico`, históricos de módulo, exclusividade lote–pasto–curral, `processar_movimentacao_pastagem` (8,9 mil caracteres), `processar_movimentacao_curral`, proteção de histórico contra update/delete.
- **Indivíduos:** 12 triggers (identificação, sexo × categoria, peso inicial, estratégia nutricional, vínculo de mãe e órfãos).
- **Maternidade:** cria o indivíduo, a categoria "bezerro ao pé", classificação da matriz.
- **OS e transferência:** número da OS, guarda, status, notificações, validação de transferência, recebimento.
- **Notificações:** morte, OS criada e embarcada, solicitação de novo lote.
- **Seeds de fazenda nova:** cerca de 10 triggers em `fazendas` (faixas, preços, notas de cocho, prioridades, config de notificações, Farm Plan).
- **RBAC e proteção:** `incrementar_rbac_versao_*`, `trg_usuarios_protege_colunas`, funções `guard_*`.
- **Mapa:** `touch_mapa_versao`.

Funções de negócio com RPC (parte relevante das 235 não-trigger): edição e exclusão de registros (`editar_registro_*`, `excluir_registro_*`), `recategorizar_lote_categoria`, `migrar_plano_nutricional`, `iniciar_plano_lote`, `encerrar_plano_nutricional`, `transferir_lote_entre_fazendas`, `fechar_os_venda`, `cancelar_os_venda`, `estornar_baixa_os`, `aprovar_solicitacao_novo_lote`, `identificar_animais_lote`, `salvar_individuo`, `baixar_individuo`, `aplicar_manejo_curral`, 18 `get_dados_relatorio_*` e `get_relatorio_*`, `get_dashboard_stats`, `get_system_health`, funções de mapa e roteamento.

### 6.2 Novo (220 triggers, 66 funções de trigger)

Por função:
- `manejus_carimbo` (51): só atualiza `atualizado_em`.
- `manejus_historico_gravar` (42): auditoria genérica antes/depois em `manejus_historico` (3.572 linhas), só grava se algo mudou.
- `fp_trg_area` (26): permissão por área do Farm Plan (`fp_area_ok` lê `acessos.permissoes`).
- `manejus_baixa_farmplan` (26): quando uma caderneta é lançada, dá baixa na atividade correspondente do Farm Plan (checa dia completo, fuso `America/Cuiaba`).
- Compras e entradas (4 funções × 3 tabelas): conferência, vínculo a pedido, recálculo, compra após entrada.
- `vision_*` (cerca de 25 triggers): histórico, regras de lançamento, aprovação, conferência, pedido, NF-e, notificações.
- Lógica de domínio própria: `manejus_mov_guarda` (**aprovação de movimentação**: o campo sempre lança Pendente, só gestor aprova ou recusa, motivo obrigatório na recusa), `manejus_lote_dieta_gatilho` e `manejus_trocar_dieta` (histórico de dietas por lote e categoria), `manejus_enfermaria_individuo` e `manejus_morte_individuo` (acham o animal por brinco ou chip; morte marca "Morto"), `manejus_curral_expandir` (cria animais a partir da lista de um manejo de curral), `manejus_recepcao_*` (recepção gera movimentação de entrada com GTA, NF e divergências), `manejus_os_*`, `manejus_romaneio_*`, `manejus_embarque_*`.

**Não encontrei no código das 142 funções** (por busca de termos): `quant_atual`, GMD, custo médio, carência, recategorização, snapshot de plano, `postgis` e rotinas de peso vivo. `manejus_saldos` e `manejus_resumo_campo` são tabelas de cache com coluna `calculado_em`, o que sugere que os saldos são calculados pelo cliente ou por outro processo fora do banco (não confirmado).

## 7. Cobertura funcional por módulo

| Módulo | Original | Novo |
|---|---|---|
| Fazendas e acesso | `fazendas`, `usuarios`, `usuario_fazenda`, `peoes`, `grupos_fazenda`, impersonação | `contas`, `fazendas`, `acessos` (papéis), `pessoas`, `consultores`, `manejus_permissoes` (liberação por caderneta e pessoa) |
| Lotes, categorias, pastos, currais | `lotes`, `lote_categorias`, `pastos`, `currais`, históricos de localização, faixas, transições | `lotes`, `lotes_categorias`, `pastos`, `locais`, `categorias_animais`, `manejus_lote_dietas`, `lotacoes` |
| Indivíduos e reprodução | `individuos`, identificações, `eventos_reprodutivos`, `estacoes_monta`, maternidade | `manejus_animais` (0 linhas), `manejus_partos` (0) |
| Sanidade | `aplicacoes_sanitarias`, `calendario_sanitario`, `tratamentos` | não encontrado |
| Nutrição | `formulacoes`, `formulacao_insumos`, `planos_nutricionais` (+ snapshots e edições), `programacao_tratos` | `nutricao_dietas`, `nutricao_insumos`, `nutricao_estrategias` (vazia), `manejus_programas_trato` |
| Cadernetas de campo | `registros_*` com sync | `manejus_*` sem sync (maioria vazia) |
| Estoque | `movimentacoes_estoque_suplementos`, almoxarifado, cantina | `manejus_estoque_movs` (vazia), `manejus_inventario_insumos`; almoxarifado e cantina não encontrados |
| Combustível | tanques, movimentações com WAC e validação de capacidade | `manejus_combustivel_entradas` (vazia); sem WAC |
| OS e transferências | `ordens_servico`, `os_recebimentos`, `transferir_lote_entre_fazendas` | `manejus_os`, `manejus_recepcoes`, `manejus_embarques`, `manejus_romaneios` (vazias) |
| Relatórios | 18 RPCs de relatório, `relatorios_publicos` (87), payloads | `manejus_links` (vazia), `resumo_mensal`, `resumo_semanal` (Farm Plan) |
| Mapas | PostGIS, pgRouting, `mapa_*` (vazias) | GeoJSON em `locais` |
| Assistente de IA e monitoramento | `chat_ia_logs`, `ia_*`, `system_health_samples` (8 mil linhas) | não encontrado |
| Financeiro | não tem (planejado em `apps/vision`) | `vision_*`, 40 funções, `vision_lancamentos` (4.312 linhas) |
| Farm Plan | `fp_*` (16 tabelas, uso baixo) | Farm Plan completo (planejamento 3.863, avaliações 3.019, contrato 416) |
| Compras | não tem | `manejus_compras` (vazia) com aprovação e vínculo ao financeiro |

## 8. Volumes (contagens exatas do original, 2026-10-19)

| Tabela | Original | Novo (equivalente) |
|---|---|---|
| `audit_log` | 65.780 | `manejus_historico` 3.572 |
| `movimentacoes_estoque_suplementos` | 3.514 | `manejus_estoque_movs` 0 |
| `notificacoes` | 2.719 | sem equivalente |
| `registros_oferta_trato` | 1.917 | `manejus_tratos` 0 |
| `registros_suplementacao` | 1.788 (40 excluídas) | `manejus_suplementacao` 291 |
| `pastos` | 1.652 | 62 |
| `registros_bebedouros` | 1.049 | 166 |
| `consumo_confinamento_dia` | 972 | sem equivalente |
| `lote_categorias` | 896 | `lotes_categorias` 15 |
| `planos_nutricionais_snapshots` | 822 | sem equivalente |
| `registros_abastecimento` | 765 | 22 |
| `registros_rodeio` | 692 | 2 |
| `individuos` | 641 | 0 |
| `planos_nutricionais` | 626 | sem equivalente direto |
| `lotes` | 623 | 14 |
| `registros_movimentacao` | 479 | 11 |
| `formulacao_insumos` | 479 | `nutricao_insumos` 10 |
| `registros_leitura_cocho` | 414 | 0 |
| `registros_maternidade` | 409 | `manejus_partos` 0 |
| `lote_pasto_historico` | 372 | sem equivalente |
| `funcionarios` | 254 | `pessoas` 32 |
| `movimentacoes_combustivel` | 243 | 0 |
| `registros_clima` | 204 | 5 |
| `insumos` | 203 | `nutricao_insumos` 10 |
| `maquinas_veiculos` | 166 | sem equivalente direto |
| `registros_pastagens` | 164 | `manejus_manejo_pastagens` 8 |
| `usuarios` | 124 | 20 (auth) |
| `currais` | 121 | `locais` 204 (inclui pastos e outras áreas) |
| `formulacoes` | 107 | `nutricao_dietas` 3 |
| `registros_morte` | 80 | 1 |
| `fazendas` | 59 | 3 |
| `peoes` | 59 | `pessoas` 32 |
| `registros_curral` | 46 | `manejus_curral` 0 |
| `registros_enfermaria` | 26 | 0 |

Totais: o novo tem 18.395 linhas em 120 tabelas. Entre as maiores, `vision_lancamentos` 4.312, `planejamento` 3.863, `manejus_historico` 3.572, `avaliacoes` 3.019. Entre as tabelas `manejus_*`, só `suplementacao` (291), `bebedouros` (166) e `abastecimentos` (22) têm volume relevante.

Tabelas `manejus_*` e correlatas com zero linhas: apartes, auditorias 5S, combustível (entradas), compras, curral, curral_animais, embarques, enfermaria, entradas_insumos, estoque_movs, fábrica, inventário, leitura de cocho, limpezas, links, manutenções (liberações e planos), operações, os, partos, pragas, problemas, recepções, romaneios, solo, solo_plano, tratos, vagão_cargas.

## 9. Compatibilidade de colunas

Comparei 21 pares (20 do domínio Manejus mais `insumos` → `nutricao_insumos`): 625 colunas no original, **129 (21%) com o mesmo nome** no novo; considerando só campos de negócio (sem colunas de controle), **85 de 442 (19%)**.

Isso mede nomes, não perda. Padrões recorrentes:
- `responsavel`, `nome_usuario` → `registrado_por` (uuid).
- `data` (timestamptz) → `data` (date) + `hora` (time).
- `lote`, `pasto` (texto) → `lote_id`, `pasto_id`.
- Detalhes antes em colunas → agora em jsonb (`itens`, `leituras`, `problemas`, `respostas`, `animais`).
- Campos calculados do original (`consumo_medio_*`, `custo_medio_reais_cab_dia`, `peso_vivo_kg`) **não existem** no novo (são derivados; precisam ser recalculados ou descartados).

Maiores diferenças (colunas de negócio sem igual):

| Par | Original | Novo | Sem igual |
|---|---|---|---|
| `registros_pastagens` → `manejus_manejo_pastagens` | 51 | 26 | 37 de 41 |
| `lotes` → `lotes` | 48 | 42 | 38 de 43 |
| `registros_suplementacao` → `manejus_suplementacao` | 43 | 28 | 29 de 33 |
| `registros_movimentacao` → `manejus_movimentacoes` | 39 | 23 | 25 de 29 |
| `ordens_servico` → `manejus_os` | 49 | 43 | 26 de 39 |
| `registros_problemas` → `manejus_problemas` | 32 | 26 | 21 de 22 |
| `fazendas` → `fazendas` | 25 | 17 | 21 de 22 |
| `registros_morte` → `manejus_mortes` | 37 | 39 | 20 de 27 |
| `registros_curral` → `manejus_curral` | 31 | 31 | 19 de 21 |

Colunas do contrato do PWA **ausentes** em todas as `manejus_*`: `sync_status`, `version`, `dispositivo_id`, `deleted_at`. `local_id` só em 6 tabelas do novo (`lotacoes`, `manejus_auditorias_5s`, `manejus_fabrica`, `manejus_limpezas`, `manejus_problemas`, `pastos`).

Campos de `fazendas` sem destino no novo: `acesso_id`, `cnpj`, `endereco`, `telefone`, `email`, `logo_url`, `planilha_id`, `ativo`, `controle_acesso_habilitado`, `tolerancia_rotina_minutos`, `timezone`, `acesso_confinamento`, `grupo_id`, `rbac_versao`, `bounding_box`, `expediente_*`, `trava_suplementacao`, `acesso_comercial`, `fp_escore_visivel_colaborador`.

## 10. Os dados do original passam nas regras do novo?

O novo tem CHECKs e UNIQUEs rígidos. Testei os dados do original contra eles:

**`lotes`**
- 563 de 623 sem `numero_cabecas`/`n_cabecas` e 623 de 623 sem `peso_entrada_kg` no nível do lote. O dado real está em `lote_categorias`. O novo exige `cabecas_entrada > 0` e `peso_entrada > 0`, então o lote precisa ser recalculado a partir das categorias.
- 14 nomes de lote repetidos dentro da mesma fazenda. O novo tem `UNIQUE (fazenda_id, codigo)`.
- 21 lotes com `sexo` fora do CHECK (`Macho`/`Fêmea`): o original tem `fêmea`, `Fêmea` e `macho`.
- `status` do novo: `Ativo`/`Inativo`. O original tem `ativo` (bool) e `deleted_at`.

**`lote_categorias` (896 linhas)**
- 101 sem peso de entrada, 114 com quantidade nula ou negativa.
- 543 com `rc_inicial` fora de 0,30–0,75: valores de 3 a 500, em outra escala (o novo espera fração). Exige conversão e revisão (valores como 500 não fazem sentido em nenhuma escala).
- 12 categorias em texto (`bezerra`, `bezerra ao pé`, `bezerro`, `bezerro ao pé`, `boi gordo`, `boi magro`, `garrote`, `novilha`, `tourinho`, `touro`, `tropa`, `vaca`) precisam virar `categoria_id` de `categorias_animais`, que é **por fazenda** e tem CHECK de `sexo` e `finalidade` (`Corte`/`Reprodução`). "Tropa" não tem sexo definido.

**Registros operacionais**
- 111 abastecimentos sem `maquina_veiculo_id`.
- 44 suplementações sem `lote_id` e 61 sem `formulacao_id`.
- 40 suplementações excluídas (soft-delete); o novo não tem esse conceito.
- `registros_abastecimento.total_abastecido` entre 0 e 5.000 L: 0 violações (o novo exige `litros > 0` e `<= 5000`).
- `registros_bebedouros.leitura_bebedouro` entre 1 e 3: 0 violações.

## 11. Clientes e storage

**PWA** (`Caderneta-Digital-Gesta-Up`, `frontend/src/services/syncService.ts`): `CADERNETA_TO_SUPABASE_TABLE` mapeia 36 stores para cerca de 33 tabelas do original. Pontos sem equivalente comprovado no novo: cantina (`registros_alimentacao`), almoxarifado (`registros_almoxarifado`), pesagem (`registros_pesagem`), sanidade (`aplicacoes_sanitarias`), reprodução (`eventos_reprodutivos`), atividades de funcionário (`atividade_*`) e `sessoes_manejo_curral`. As demais têm tabela correspondente, mas sem as colunas de sync.

**Storage:** as fotos dos registros ficam em buckets públicos do original (`fotos-registros` 219 objetos, `fotos-morte` 22, `fotos-atividades` 4, `logos` 79 com 63 MB, `relatorios-gerais` 28, `videos-os`, `documentos-os`) e as URLs completas estão gravadas nas linhas. O novo não tem esses buckets (tem `logos`, `midias`, `pops`, `vision-*`). A migração exigiria copiar os objetos e reescrever as URLs.

**Contas e login:** original com 124 usuários no auth e 59 peões com login próprio (`login-peao`). Novo: 20 usuários, 17 de campo com e-mail fictício `@campo.gestaup.com`. Levar as contas exige acesso de banco ao schema `auth` (hashes de senha) ou reset de senha em massa, e reescrever o vínculo (`usuario_fazenda` + `peoes` → `acessos` + `pessoas`).

**Painel (`apps/manejus`):** usa o schema do original (hooks TanStack Query e RPCs, como as 18 `get_dados_relatorio_*`). Apontar o painel para o novo exigiria reescrever essas consultas, não só trocar a URL.

## 12. Segurança e isolamento

| Ponto | Original | Novo |
|---|---|---|
| RLS | 432 policies; **86 de escrita com `true`** (BACKLOG, Fase B de isolamento) | 384 policies; 1 aberta (leitura em `precos_arroba`) |
| Modelo de acesso | `usuario_fazenda`, `peoes`, funções `guard_*`, `current_user_has_access` | `acessos` (usuário × fazenda × papel), `minhas_fazendas()`, `tenho_papel()`, `manejus_nivel()` (liberação por caderneta e pessoa) |
| Auditoria | `audit_log` (65 mil linhas, limpeza diária) | `manejus_historico` (antes/depois) |
| Lacunas | Policies abertas de escrita | `manejus_curral_animais`, `manejus_historico` e `manejus_lote_dietas` sem policy de DELETE |

O novo está mais fechado no RLS. O original tem o débito já documentado.

## 13. Viabilidade da migração, por parte

| Parte | Viável como está? | Observação |
|---|---|---|
| Fazendas, pastos, insumos, dietas, categorias | Com ETL e mapeamento | Campos de `fazendas` sem destino; 12 categorias em texto viram `categoria_id` por fazenda |
| Lotes e categorias | Só com recálculo e limpeza | Totais do lote vêm de `lote_categorias`; escala do `rc_inicial`; duplicidades; sexo |
| Registros operacionais | Parcial | Mapear coluna a coluna; perde controle de sync e soft-delete; recalcular derivados |
| Dietas e planos nutricionais | Parcial | O novo tem dieta por lote com histórico simples; o original tem planos com períodos, peso meta, migração automática e snapshots |
| Indivíduos, reprodução, sanidade | **Não** | Sem estrutura equivalente (indivíduos 641, eventos 18, aplicações 13, calendário 6) |
| Histórico (`audit_log`, snapshots, edições de plano, históricos de localização) | **Não** | Sem destino |
| Regras automáticas | **Não** | Reimplementar antes de confiar nos números |
| PWA em campo | **Não** | O novo não aceita o formato de sync atual |
| Painel | **Não** | Reescrever consultas e RPCs |
| Storage | Com script de cópia | Copiar objetos e reescrever URLs |
| Logins | Com acesso ao `auth` ou reset | |

## 14. Riscos

1. **Corte com o original em uso:** há registros sendo gravados hoje. Qualquer migração exige janela de congelamento, validação de contagens e plano de volta.
2. **Peões atualizam o app devagar** (CLAUDE.md): dispositivos continuariam enviando o formato antigo por semanas.
3. **Perda silenciosa:** colunas sem destino (por exemplo os 20 campos de `fazendas` e os campos calculados) seriam descartadas sem erro.
4. **Dados inválidos no novo:** CHECKs rígidos rejeitam parte do histórico; sem limpeza, a carga falha ou exige descartar linhas.
5. **Código fora do repo:** `login-peao`, `validate-farm-access` e `lembrete-tratos-diario` só existem deployadas no original.
6. **Dois sistemas de Farm Plan:** o original tem `fp_*` (16 tabelas, dados mínimos) e o novo tem o Farm Plan completo no mesmo banco. A migração precisa decidir qual é o definitivo.
7. **Fazenda de testes:** qualquer carga de teste no original deve usar `d649c65e-16ab-4b77-a84b-df937aa41cc3`. Para o novo, definir uma fazenda de testes equivalente antes de qualquer carga.

## 15. O que pedir ao dev antes de qualquer migração

1. **Contrato de sync do PWA** no novo (`local_id`, `version`, soft-delete, `dispositivo_id`) ou plano para reescrever o PWA.
2. **Mapa campo a campo**, por tabela, assinado pelo dev, incluindo conversões (escala do RC, categorias, sexo, status).
3. **Lista das regras (triggers, RPCs, crons) do original** que ele vai reimplementar, com prazo: recategorização, quantidade atual, custo médio, GMD, peso vivo, consumo, carência, planos nutricionais, ocupação de pasto, rotinas sanitárias e reprodutivas.
4. **Plano para indivíduos, reprodução, sanidade e histórico** (migrar, arquivar ou abandonar, com decisão do produto).
5. **Plano de storage e de logins** (cópia de objetos, reescrita de URLs, hashes ou reset de senha).
6. **Piloto em uma fazenda só** (a de testes), com validação de contagens e somas antes e depois, antes de qualquer fazenda real.
7. **Recuperar no repo** o código de `login-peao`, `validate-farm-access` e `lembrete-tratos-diario`, independente da migração.

## Anexo: o que o novo tem de melhor ou que o original não tem

- Aprovação de movimentação (campo lança Pendente, só gestor aprova ou recusa, com motivo).
- Permissão por caderneta e por pessoa (`manejus_permissoes`), além do papel.
- Auditoria genérica antes/depois que só grava quando algo mudou.
- RLS sem policies abertas de escrita.
- Compras com aprovação, recepção com GTA, NF e divergências, romaneio, embarque e NF-e, ligados ao financeiro (`vision_*`).
- Relatório mensal por e-mail e semanal por WhatsApp, com push de tarefas do dia (o original tem WhatsApp só no BACKLOG).
- Módulos de solo e pragas.
