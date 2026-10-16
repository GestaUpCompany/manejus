# Plano: caderneta "Manejo de curral" (proposta, aguardando aprovação)

Status: desenho. Nenhuma migration, nenhum código. Decisões do gestor em 16/10/2026: (1) a designação ao lote de destino gera **pendência**, nunca movimentação automática; (2) o peso fica **só no animal**, sem alimentar `lote_categorias`; (3) funciona **100% offline**.

## Problema
No manejo de curral vários animais passam pela balança/tronco: são identificados (provisório → brinco/chip definitivo, ou troca de brinco) e designados a um lote de destino. Hoje não há registro disso. A `PesagemPage` serve de esqueleto (sessão offline, rascunho, revisão, upsert por `local_id`), mas grava em `registros_pesagem`, cujo trigger atualiza o peso do lote, e cria animal ao pesar. Por isso a caderneta é nova, só reaproveita o esqueleto.

## Princípios
1. Nada que a sessão grave altera `quant_atual`, `peso_vivo_kg` ou consumo de `lote_categorias`.
2. Nada é obrigatório: linha sem peso, sem lote ou sem identificação nova é válida.
3. Idempotente: reenviar a mesma sessão ou linha não duplica (chave `local_id`).
4. Só colunas/tabelas novas (PWA antigo segue válido).

## Modelo de dados (migration 1, a aprovar)
`sessoes_manejo_curral` (uma por sessão): `id`, `local_id` (unique por fazenda), `fazenda_id`, `data`, `responsavel`, `observacao`, `iniciada_em`, `finalizada_em`, `created_at`.

`registros_manejo_curral` (uma linha por animal): `id`, `local_id` (unique por fazenda), `fazenda_id`, `sessao_id`, `individuo_id` (nullable: animal novo), `ordem`, `identificador_lido` (o que foi digitado/lido), `id_provisorio_anterior`, `id_brinco_novo`, `id_chip_novo`, `id_manejo_novo`, `peso_kg` (opcional, só informativo), `lote_destino_id` (nullable), `lote_categoria_destino_id` (nullable), `sexo`, `categoria`, `raca`, `observacao`, `status_processamento` (`pendente` | `aplicado` | `conflito`), `erro`, `created_at`.

`pendencias_designacao_lote`: `id`, `fazenda_id`, `registro_manejo_id`, `individuo_id`, `lote_origem_id`, `lote_destino_id`, `status` (`aberta` | `confirmada` | `descartada`), `resolvida_por`, `resolvida_em`, `evento_movimentacao_id` (preenchido na confirmação).

Reaproveita `individuo_identificacoes` (já existe: `campo`, `valor_anterior`, `valor_novo`, `alterado_por`) para o histórico de troca de brinco/chip/provisório.
RLS: leitura e escrita pela fazenda do usuário (`user_has_fazenda_access`), peão incluído. Peão grava, não resolve pendência.

## RPCs (migration 2, a aprovar), padrão SECURITY DEFINER, `p_fazenda_id`, retorno `{success,error}`
- `aplicar_manejo_curral(p_fazenda_id, p_sessao_id)`: percorre as linhas `pendente`. Por linha: acha o animal; se o brinco/chip novo já pertence a outro animal (inclusive baixado), marca `conflito` com a mensagem e segue (primeiro que sincroniza vence); senão atualiza `id_brinco`/`id_chip`/`id_manejo` (o histórico sai pelo trigger existente de `individuo_identificacoes`) e, se houver lote destino diferente do atual, cria a pendência de designação. Animal novo (sem `individuo_id`) é criado **sem** gerar movimentação (a cabeça já está no agregado, mesmo regra da `identificar_animais_lote`). Não toca `lote_categorias`.
- `confirmar_designacao_lote(p_fazenda_id, p_pendencia_id)`: só controller/admin. Gera o evento agregado de movimentação entre lotes (caminho único de escrita) com o animal na ponte `evento_individuos`; descarta com `descartar_designacao_lote`.
Rollbacks em `supabase/rollbacks/`.

## PWA (offline-first)
- IndexedDB: bump de versão (34 → 35), stores `manejoCurral` (sessões e linhas) e entrada na `syncQueue`; mapeamento no `syncService` (`CADERNETA_TO_SUPABASE_TABLE`), ordem de sincronismo depois de `individuos`/maternidade. Sincroniza sessão, depois as linhas, depois chama `aplicar_manejo_curral`.
- Tela `ManejoCurralPage` copiada da estrutura da `PesagemPage`: fase de sessão, lista de linhas com rascunho persistido a cada linha, revisão e finalizar. A linha usa `AnimalIdentifier` (busca por provisório, brinco, chip, manejo; aviso de número já usado) e campos de brinco/chip novo, lote de destino (select dos lotes em cache), peso opcional.
- Modo troca de brinco: o mesmo campo, com motivo (definitivo, perdido, trocado).
- Leitor RFID por Bluetooth: etapa posterior; a linha já aceita o ID como texto.
- Conflito local: se o número novo já existe no cache (vivo ou baixado), avisa antes de salvar; salvar continua permitido (vira `conflito` no servidor se de fato colidir).

## Painel
- Fila "Designações de lote" na Conciliação (junto de morte e apartação): lista pendências abertas, confirma em massa agrupando por lote origem/destino (reutiliza o padrão da confirmação de localização).
- Ficha do animal: histórico de identificações (já existe) mais a sessão de origem.
- Lista de sessões de manejo com contagem de linhas, conflitos e pendências.

## Fases de entrega
1. Migration 1 e 2 + testes SQL na fazenda de testes (sessão com animal existente, animal novo, brinco duplicado, lote destino igual e diferente).
2. PWA: stores, sync, tela, testes vitest, teste no preview offline.
3. Painel: fila de designações e lista de sessões.
4. Publicar no app staging e teste real com o peão; regressão do agregado (`backup.regressao_*`).

## Riscos
- Peões atualizam o app devagar: tudo é aditivo, nada muda no que já existe.
- Duas sessões com o mesmo animal ao mesmo tempo: a última a sincronizar gera `conflito` apenas se o identificador novo colidir; designações duplicadas viram duas pendências, e a confirmação da segunda avisa que o animal já mudou de lote.
- Animal criado na sessão e também em maternidade offline: resolvido pela busca por identificador/provisório já existente e pela unicidade normalizada.

## Pontos em aberto
- Nome da caderneta no menu do PWA.
- Se o peso da linha deve aparecer na ficha do animal como "peso no manejo" (sugestão: sim, só leitura).
- Se criar animal novo na sessão é permitido ao peão ou só ao controller (sugestão: permitido, como na maternidade).
