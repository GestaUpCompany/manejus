# Página 14 — Análise de Pareto

- PDF: p.14 ("Análise de Pareto", período 01/01/2026 a 31/08/2026)
- PBIX: página `e69d3839019932a1023a`, displayName "Análise de Pareto"
- Fonte: **`Desembolsos Realizados`** (plano de contas G × valor N)
- Sem filtro de página, mas o slicer "Tipo de Custo" sai como **"Seleções múltiplas"**: a base exclui `Compra_de_Gado`. A soma dos valores confirma: base = CF+CV+Investimentos+Impostos = **R$ 1.579.992,07** (= 4.343.020,07 − 2.763.028,00).

**Status: reconciliado.**

---

## 1. O que a página exibe

- Slicers: Data, Centro de Custos, Tipo de Custo (múltipla: sem Compra de Gado), Plano de Contas.
- **Tabela** ordenada por desembolso decrescente: Plano de Contas | % Pareto | Desembolso Total | Desembolso Acumulado. O PDF mostra as 6 primeiras linhas (tabela com scroll).
- **Cards**: `% Plano de Contas` = **12,90%**; `80% Desembolso` = **R$ 1.147.353,33**.
- **Combo chart** (parte inferior): colunas = Desembolso Total por Plano de Contas (ordem decrescente), linha = % Pareto acumulado até 100%. Marcadores de eixo em 50% e 100%.

## 2. Tabela Pareto reconciliada (base = 1.579.992,07)

| # | Plano de Contas | Desembolso | Acumulado | % Pareto |
|---|---|---|---|---|
| 1 | Insumos Nutrição Animal | 578.360,35 | 578.360,35 | 36,61% |
| 2 | Manut. Máquinas/Implementos/Veículos | 264.056,06 | 842.416,41 | 53,32% |
| 3 | Terceirizados - Serviços | 165.644,33 | 1.008.060,74 | 63,80% |
| 4 | Mão de Obra (Salário) | 139.292,59 | 1.147.353,33 | 72,62% |
| 5 | Instalações e Benfeitorias - Sede/Moradias | 138.715,89 | 1.286.069,22 | 81,40% |
| 6 | Cercas e Porteiras | 63.875,03 | 1.349.944,25 | 85,44% |

(continua por 26 planos com desembolso no período, até Impostos Veículos 70,00 → 100%)

## 3. Semânticas das medidas (decodificadas)

| Medida | Fórmula | Valor PDF |
|---|---|---|
| `Desembolso Total` (por plano) | ΣN do plano | — |
| `Desembolso Acumulado` | running total ordenado por ΣN desc | — |
| `P % Pareto` | acumulado ÷ total do período filtrado | 36,61 → 100% |
| `80% Desembolso` | **Σ dos planos cujo acumulado ≤ 80%** (os 4 primeiros aqui: 72,62% — o 5º cruzaria para 81,40% e fica fora) | R$ 1.147.353,33 ✓ |
| `% Plano de Contas` | **nº de planos dentro do corte de 80% ÷ nº total de planos de contas distintos no dataset** (excl. Compra de Gado): 4 ÷ 31 = **12,90%** ✓ | 12,90% |

Nota: o denominador 31 conta planos distintos da aba inteira (não só do período: no período há 26). O "corte de 80%" são os planos cujo acumulado permanece ≤80% — os 4 primeiros (não inclui o plano que cruza a marca).

## 4. Checklist Vision

1. Dataset `Desembolsos Realizados` no período, filtrado para `Tipo ≠ Compra_de_Gado` (no PDF é slicer; no Vision pode ser filtro fixo da página de Pareto).
2. Ordenar planos por ΣN desc; acumulado e % sobre o total filtrado.
3. Cards: contagem de planos com acumulado ≤80% ÷ planos distintos totais; e a soma desses planos.
4. Combo: barras ΣN + linha % acumulado, categorias em ordem desc.
