# Roteiro: morte vinculada no PWA (app staging)

Fazenda de testes `d649c65e-16ab-4b77-a84b-df937aa41cc3` (acesso `gestaup`). Commit do PWA: `b03772f`.

## Parte A: verificação no banco (executada em 16/10/2026)
Transação com rollback, nada gravado.

| Passo | Resultado |
|---|---|
| Inserir morte com `individuo_id` do brinco 22 (lote A, "boi gordo") | `quant_atual` 122 → 121 |
| Status do brinco 22 depois da morte | Morto |
| Estornar a morte (`deleted_at`) | brinco 22 volta a Vivo |

## Parte B: teste manual no app staging (peão, com internet)
1. Entrar no app staging com o usuário da fazenda de testes.
2. Caderneta de Morte → Lote A - Bois Gordos → categoria Boi Gordo.
3. Informar o brinco **22**. O app deve reconhecer o animal.
4. Salvar e aguardar a sincronização.
5. Conferir no painel (Indivíduos): brinco 22 **Morto**, motivo Morte; lote A com 121 cabeças.
6. Repetir com o celular **offline**: registrar a morte, religar a rede e esperar o sync. Mesmo resultado, sem duplicar.
7. Morte **sem** brinco: o lote cai 1 e nenhum indivíduo muda (comportamento antigo).

## Restaurar depois do teste
Excluir a morte pelo painel (estorno) devolve o brinco 22 a Vivo. Depois, conferir se o lote A voltou a 122 (o estorno exige recalcular `quant_atual`).

## Critério para promover à produção
Passos 5 a 7 corretos.

## Parte C: resultado do teste manual (16/10/2026)
Executado no preview local do PWA (build do commit `b03772f`), com o usuário da fazenda de testes.

| Passo | Resultado |
|---|---|
| 1. Online, brinco 22 (Lote A) | Aprovado: morte com `individuo_id`, brinco Morto, lote 122 → 121 |
| 2. Offline, brinco 55 (Teste 3), depois religando a rede | Aprovado: 1 pendente offline, 1 registro único após o sync, brinco Morto |
| 3. Sem brinco (Lote A) | Aprovado: lote cai 1, `individuo_id` nulo, nenhum animal mudou |
| 4. Restauração | 4 mortes de teste excluídas (soft-delete), brincos 22 e 55 Vivos, Lote A 122, Teste 3 boi gordo 55, 22 vivos |

Observação: a primeira tentativa rodou uma versão antiga do app, presa no cache do service worker (versão `716727d`), e gravou a morte sem `individuo_id`. Em campo, o peão só ganha a morte vinculada depois de atualizar o app ("Nova versão disponível").
