# Página 18 — Índices Técnicos e Econômicos (Resumo Rebanho e Caixa)

- PDF: p.18 ("Índices Técnicos e Econômicos da Atividade", período 01/01/2026 a 31/08/2026)
- PBIX: página `6b40a8df47d648d80c94`, displayName "Resumo Rebanho e Caixa"
- Fontes: `Estoque`, `Diárias`, `Desembolsos Realizados`, `Receitas_Mensais`, `Venda_Gado`, `Cadastros!Q17` (área, usada como 561)
- Só um slicer de Data. É uma grade de 17 cards — página sem gráficos.

**Status: reconciliado** (16 de 17 medidas fechadas exatas; ver nota sobre `@ Produzida`).

---

## 1. Grade de cards e fórmulas verificadas

| Card | Valor PDF | Medida PBIX | Fórmula reconstituída |
|---|---|---|---|
| Estoque Inicial @ | 13.791 | `Estoque.Estoque Inicial @` | Total @ (K) do bloco jan-2026 da aba `Estoque` = 13.791,43 |
| Rebanho Médio | 1.421 | `Estoque.Rebanho Médio` | média diária de `Diárias!H` = 345.392/243 = 1.421,37 |
| UA/ha Média | 1,38 | `Área.UA/ha Média` | média dos UA/ha mensais (p.3) |
| Tx. de Desfrute (Cab) | 49,18% | `Estoque.Tx. de Desfrute (Cab)` | vendas ÷ rebanho médio = 699 ÷ 1.421,37 = 49,18% ✓ |
| Produção de @/ha | 11,78 | `Estoque.Produção de @/ha` | @ Produzida ÷ 561 = 6.608,55/561 = 11,78 ✓ |
| Entradas @ | 5.799 | `Estoque.Entradas @` | total @ comprado jan–ago = 5.798,60 |
| Saidas @ | 14.805 | `Venda_Gado.Saidas @` | total @ abatidas vendidas = 14.804,80 |
| Custo Diária/cab | R$ 12,57 | `Desembolsos.Custo Diária/cab` | ΣN total ÷ ΣH = 4.343.020,07/345.392 = 12,57 ✓ |
| Custeio/@ Produzida | R$ 203,20 | `Desembolsos.Custeio/@ Produzida` | (CF+CV) ÷ @ produzida **crua** = 1.342.866,84 ÷ 6.608,55 = 203,20 ✓ |
| Custeio/ha | R$ 2.393,70 | `Desembolsos.Custeio/ha` | (CF+CV) ÷ 561 = 1.342.866,84/561 ✓ |
| Desembolso R$/cab | R$ 3.055,52 | `Desembolsos.Desembolso RS/cab.` | ΣN total ÷ rebanho médio = 4.343.020,07 ÷ 1.421,37 = 3.055,52 ✓ |
| Estoque Final @ | 11.394 | `Estoque.Estoque Final @` | Total @ (AA) do bloco ago-2026 = 11.393,78 |
| @ Produzida | 6.609 | `Estoque.@ Produzida` | **SF@ + Saídas@ − Entradas@ − SI@** = 11.393,78+14.804,80−5.798,60−13.791,43 = 6.608,55 → 6.609 |
| Desembolso/ha | R$ 7.741,57 | `Desembolsos.Desembolso/ha` | ΣN ÷ 561 |
| Despesa Média Mensal | R$ 542.877,51 | `Desembolsos.Despesa Média Mensal` | ΣN ÷ 8 |
| Faturamento/ha/Período | R$ 9.183,25 | `Receitas_Mensais.Faturamento/ha/Período` | ΣP ÷ 561 |
| Faturamento Médio Mensal | R$ 643.975,66 | `Receitas_Mensais.Faturamento Médio Mensal` | ΣP ÷ 8 |

## 2. Fórmula-chave decodificada: @ Produzida

`@ Produzida = Estoque Final @ + Saídas @ − Entradas @ − Estoque Inicial @` — o clássico "o que o rebanho produziu de arrobas no período". Usa os valores **crus** (não arredondados) — confirmação: com 6.608,55 o Custeio/@ fecha em 203,20 exato; com 6.609 inteiro daria 203,19.

**Correções via TMDL** (o DAX real é mais "congelado" do que a dedução sugeria):

- `Estoque Inicial @` = `SUM(Estoque[Total @ Inicial])` com filtro fixo `Mês="Janeiro" && YEAR(Data)=2026` — ignora o slicer.
- `Estoque Final @` = `SUM(Estoque[Total @])` com `Mês="Agosto" && YEAR=2026` — **mês "Agosto" hardcoded**, ignora o slicer.
- `Entradas @` = `SUM(Compra_Gado[Total @])` — **só compras** (nascimentos e transf. entrada não entram).
- `Saidas @` = `SUM(Venda_Gado[Total @ Abatidas])` — **só vendas** (mortes e consumo @ não entram).
- `@ Produzida` envolve cada componente em `CALCULATE(..., YEAR(dCalendário[Data])=2026)` — ano 2026 pinado. Na prática, os 4 cards de @ e derivados (Custeio/@, Produção @/ha, Tx. Desfrute @) mostram sempre jan→ago/2026, qualquer que seja o slicer.

Todos os denominadores reutilizáveis já confirmados em outras páginas: rebanho médio diário 1.421,37, área 561, meses 8, animal-dias 345.392.

## 3. Checklist Vision

1. Todos os cards derivam de: `Estoque` (K jan, AA ago), `Venda_Gado` (Σ @ abatidas), `Compra_Gado` (Σ @ compra), `Receitas_Mensais` (ΣP), `Desembolsos` (ΣN e CF+CV), `Diárias!H`.
2. Renderizar na ordem do PDF (4 linhas × 4-5 cards).
3. Cuidado: "@ Produzida" usa @ cruas; exibir arredondado só na apresentação.
