# Melhorias pendentes — Importação KML/KMZ com match de pastos

Lista de melhorias de UX/UI e de economia de recursos levantadas após a primeira versão do pipeline de importação (import → seletor de pastas → revisão → apply). Ver `docs/HISTORICO.md` (seção "Importação KML/KMZ com match de pastos") para o que já está implementado.

Legenda: ✅ implementado · ⬜ pendente

## ✅ 1. Highlight no mapa ao interagir com a linha da revisão

Clicar numa linha da `ImportRevisaoModal` voa até a geometria (`fitBounds` das coordenadas) e a desenha com contorno destacado na camada de importação. É o que permite ao usuário conferir visualmente "esse polígono é mesmo o MI-09 A?" antes de aplicar — o principal mecanismo de correção de matches errados.

Implementação: botão "localizar" por linha → `onFocarItem(item)` na página → estado `importHighlight` (feature GeoJSON) → source/layer dedicada em `MapaCamadas` (contorno ciano por tipo de geometria). Clicar no pin também minimiza a modal de revisão (`setShowRevisao(false)`) para o mapa ficar visível; reabre pelo botão "Revisar Associações" com o estado das linhas preservado. Limpa no `limparImportacao` e quando o item destacado é aplicado.

## ✅ 2. Apply paralelo em lotes

O apply sequencial fazia N round-trips um após o outro (86 RPCs no teste real). Agora `handleAplicarRevisao` processa `Promise.all` em chunks de 8, mantendo progresso (`atual/total`) e marcação de erro por linha para retry.

## ✅ 3. "Nomes úteis" no seletor de pastas

`ImportFiltroModal` mostra por pasta a contagem de itens com `nomeLimpo` (candidatos a match) e inicia desmarcadas as pastas com zero nomes úteis — o caso "quero só pecuária" sai num clique sem hardcode de nomes de pasta (resiliente para outras fazendas). Usuário pode re-marcar qualquer pasta antes de confirmar.

## ✅ 3b. "Ignorar com geometria" em massa na revisão

Botão-toggle na `ImportRevisaoModal` que ignora (ou restaura) todas as linhas cujo pasto selecionado já tem geometria salva. Resolve o fluxo de reimportação incremental: quem reimporta o arquivo para adicionar só pastos novos descarta os já mapeados num clique, sem perder a opção de atualizar limites linha a linha. Testado na Mirandópolis: reimportação mostrou "Ignorar 89 com geometria" e o apply caiu de 103 para 14 (todos conflitos residuais de placemarks duplicados).

## ✅ 4. Busca na revisão

Campo "Buscar por nome ou pasto..." no topo da `ImportRevisaoModal` filtra linhas por nome original/limpo do item, pasta ou pasto selecionado (match normalizado). Durante a busca os grupos com resultado abrem sozinhos e os sem resultado somem.

## ✅ 5. Select pesquisável nas linhas

`PastoCombobox.tsx` (novo): trigger estilo select + dropdown em portal com campo de busca que filtra por nome normalizado, seções "Sugeridos" e "Todos os pastos", opção "— não associar —". Substitui o `<select>` nativo nas linhas da revisão.

## ✅ 6. "Ignorar sem match" em massa

Botão-toggle na revisão que ignora/restaura todas as linhas de pastas onde nenhuma linha tem candidato nem seleção — um clique a menos do que repetir "Ignorar pasta" por grupo. Só aparece quando existe pasta qualificada.

## ✅ 7. Partes de MultiGeometry

`importKml.ts` ganhou `grupoPlacemark` (índice do placemark de origem). Pós-pass `desempatarPartes` no `sugerirMatches`: quando 2+ partes do mesmo placemark casam no mesmo pasto, só a maior (anel externo) fica pré-selecionada; as demais ficam sem seleção em vez de virar conflito. Placemarks distintos com mesmo nome seguem conflitando normalmente.

## ✅ 8. RPC em lote

`salvar_geometrias_pastos(p_itens jsonb)` (migration `20260925150000`): recebe `[{pasto_id, geojson}]`, aplica cada item em subtransação própria e retorna `{pasto_id, ok, erro}` por linha — uma falha não aborta o lote. Mesma lógica de `salvar_geometria_pasto` (acesso, SRID, Force2D, MakeValid, Polygon). `handleAplicarRevisao` chama a RPC única e mantém os chunks paralelos de 8 como fallback se a chamada falhar no nível RPC. Resultado real: 90 saves em ~1,9s (antes ~6s em 11 lotes).
