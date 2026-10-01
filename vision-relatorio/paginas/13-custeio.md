# Página 13 — Relatório de Custeio

- PDF: p.13 ("Relatório de Custeio", período 01/01/2026 a 31/08/2026)
- PBIX: página `60ebeaeea9bce58d24cd`, displayName "Custeio"
- Fonte: **`Desembolsos Realizados`** + `dCalendário` + `Diárias` + área útil
- Sem filtro de página no pbix — **mas o slicer "Tipo de Custo" aparece no PDF como "Seleções múltiplas"**: o relatório foi exportado com apenas `Custos Fixos` + `Custos Variáveis` selecionados. É o que diferencia o "Custeio" do "Desembolso" da p.11: aqui entram **somente CF+CV** (Compra de Gado, Investimentos e Impostos ficam de fora).

**Status: reconciliado.**

---

## 1. O que a página exibe

- Slicers: Data, Centro de Custos, Tipo de Custo (com CF+CV pré-selecionados), Plano de Contas.
- Cards: **Desembolso/ha/Período** (R$ 2.393,70), **Despesa Média Mensal** (R$ 167.858,36), **Custo Diária/cab** (R$ 3,89), **Desembolso Total** (R$ 1.342.866,84).
- **Área** "Custeio/ha/Mês": jan 253,33 | fev 144,83 | mar 267,36 | abr 345,44 | mai 380,25 | jun 379,79 | jul 268,86 | ago 353,84.
- **Combo** "Custo Diária/cab × Rebanho Médio": colunas = custo diário mensal, linha = rebanho médio. **O eixo está ordenado por Rebanho Médio crescente** (maio, junho, abril, março, julho, fevereiro, agosto, janeiro) — não cronologicamente.

## 2. Semânticas (todas verificadas ao centavo)

| Elemento | Fórmula | Conferência |
|---|---|---|
| Desembolso Total | ΣN com Tipo ∈ {Fixos, Variáveis} | 691.741,18 + 651.125,66 = **1.342.866,84** ✓ |
| Despesa Média Mensal | ΣN ÷ 8 meses | 167.858,36 ✓ |
| Desembolso/ha/Período | ΣN ÷ **561** | 2.393,70 ✓ (área = `Área` do modelo: `Cadastros` com cast Int64 → 561,4 vira 561) |

**Correção de mecanismo via TMDL**: `Custeio` não é "filtro por Tipo" — são **colunas condicionais criadas no M**: `[Custos Fixos] = if Tipo="Custos Fixos" then Valor Total` e idem CV, depois de normalizar labels ("Custos Fixos Mensais"→"Custos Fixos", `_`→espaço). `Custeio = Σ CF + Σ CV`. Resultado idêntico ao filtro, mas o Vision deve replicar a normalização dos labels (a aba usa `Custos_Variáveis_Mensais` com underscore).
| Custo Diária/cab | ΣN ÷ Σ `Diárias!H` do período | 1.342.866,84 ÷ 345.392 = 3,888 → 3,89 ✓ |
| Custeio/ha mensal | (CF+CV) do mês ÷ 561 | ex.: jan 142.117,67/561 = 253,33 ✓ |
| Custo diário mensal | (CF+CV) do mês ÷ Σ `Diárias!H` do mês | jan 142.117,67/47.191 = **3,01**; fev 1,97; mar 3,42; abr 4,73; mai 5,25; jun 5,22; jul 3,41; ago 4,26 ✓ todos exatos |
| Rebanho médio mensal | média de `Diárias!H` no mês | jan 1.522; fev 1.469; mar 1.415; abr 1.365; mai 1.311; jun 1.361; jul 1.426; ago 1.503 ✓ |

Σ `Diárias!H` por mês (animal-dias): jan 47.191 | fev 41.140 | mar 43.855 | abr 40.947 | mai 40.637 | jun 40.825 | jul 44.200 | ago 46.597 — total 345.392.

## 3. Notas para o Vision

1. **"Custeio" ≠ "Desembolso"**: é o mesmo dataset com filtro fixo `Tipo de Desembolso ∈ {Custos_Fixos_Mensais, Custos_Variáveis_Mensais}`. No Vision pode ser uma página própria com filtro embutido, não um estado de slicer.
2. O combo chart ordena o eixo por Rebanho Médio (não por data) — reproduzir essa ordenação se a meta for paridade visual com o PDF.
3. Custo diário é por **animal-dia** (ΣH do mês), não por "rebanho médio × 30" — a diferença aparece em meses de 28/31 dias.
4. As 4 medidas de card são as mesmas das páginas 11/12 — reutilizáveis.
