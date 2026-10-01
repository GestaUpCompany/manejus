# Página 5 — Resumo de Compras

- PDF: p.5 ("Resumo de Compras", período 01/01/2026 a 31/08/2026)
- PBIX: página `d18b6816f2dbdf07aaae`, displayName "Resumo de Compras", 1280×720
- Fonte: aba **`Compra_Gado`** + `dCalendário` (nível de linha `Data` na pivot = o mesmo relacionamento por `B`, Data Compra)
- Sem filtro de página fixo; só os slicers (Data + Categoria + Fornecedor + Tipo Compra).

**Status: reconciliado.** Pivot inteira confere valor a valor, incluindo os níveis de subtotal.

---

## 1. O que a página exibe

- Slicers: **Categoria**, **Fornecedor**, **Tipo de Compra** ("Todos" no PDF), **Data** (01/01/2026 → 31/08/2026).
- 2 cards: **N° de Animais** (783) e **Total da Compra (R$/Lote)** (R$ 2.763.028,00).
- **Matriz hierárquica** (pivotTable): `Tipo Compra` → `Categoria` → `Data`, com 6 medidas:
  N° Cabeças | Total (@) | Peso Médio (kg/cab) | Média de R$/@ | Média de R$/Cab. | Total R$.

## 2. Bindings PBIX → origem

| Visual | Binding | Semântica |
|---|---|---|
| Card N° de Animais | `Sum(Compra_Gado.N° Cabeças)` | ΣG = 783 |
| Card Total da Compra | `Sum(Compra_Gado.Total da Compra (R$/Lote))` | ΣT = R$ 2.763.028,00 |
| Pivot — N° Cabeças | `Sum(N° Cabeças)` | ΣG por grupo |
| Pivot — Total (@) | `Sum(Total (@))` | ΣP por grupo |
| Pivot — Peso Médio (kg/cab) | `Avg(Peso Médio (kg/cab))` | **AVG de M** (coluna calculada da planilha) |
| Pivot — Média de R$/@ | `Avg(R$/@)` | **AVG de V** (coluna calculada) |
| Pivot — Média de R$/Cab. | `Avg(R$/Cab.)` | **AVG de U** (coluna calculada) |
| Pivot — Total R$ | `Sum(Total da Compra (R$/Lote))` | ΣT por grupo |
| Nível Data | `dCalendário.Data` | dia exato de `B` (Data Compra) |

### Divergência deliberada com a p.4 — ler antes de implementar

Na p.4 os cards usam medidas de **divisão** (ΣT ÷ denominador). Aqui na pivot os mesmos indicadores são **médias aritméticas das colunas unitárias** (`Avg(U)`, `Avg(V)`, `Avg(M)`). No nível de lote individual são iguais; em qualquer agregação divergem:

| Indicador | p.4 (razão de somas) | p.5 (AVG por linha) |
|---|---|---|
| R$/@ | 476,50 | 503,40 |
| R$/cab | 3.528,77 | 3.423,69 |
| Peso médio kg/cab | — | 207,97 (ponderado seria 222,2) |

Os dois valores são "certos" dentro do relatório; o Vision precisa reproduzir **as duas semânticas** conforme o visual.

## 3. Validação da semântica AVG (não ponderada)

Conferido contra a planilha, linha a linha (11 compras de 2026):

- Total geral `Média de R$/@` = AVG das 11 colunas V = 5537,41 ÷ 11 = **503,40** ✓ (ΣT÷ΣP daria 476,50)
- Total `Média de R$/Cab.` = AVG das 11 colunas U = 37.660,64 ÷ 11 = **3.423,69** ✓
- Total `Peso Médio` = AVG das 11 colunas M = 2.287,65 ÷ 11 = **207,97** ✓
- Linha 10/04/2026 agrupa **duas compras** (100 + 21 cabeças): AVG(M)=(200+200)/2=200,00; AVG(U)=(3.690+3.250)/2=3.470,00; AVG(V)=(553,50+487,50)/2=520,50; somas 121 cab / 806,67 @ / R$ 437.250 — tudo confere no PDF.
- Subtotal `5 a 12 meses - Macho`: AVG das 10 linhas = 207,36; subtotal `Comercial` e `Total` = AVG das 11 = 207,97 (idênticos porque só há um tipo e duas categorias, ambas aninhadas sob Comercial).

## 4. Dados da pivot no PDF (reproduzidos)

| Nível | N° Cab | Total @ | Peso Médio | R$/@ | R$/Cab | Total R$ |
|---|---|---|---|---|---|---|
| Comercial | 783 | 5.798,60 | 207,97 | 503,40 | 3.423,69 | 2.763.028,00 |
| ↳ 13 a 24 meses - Macho | 39 | 278,20 | 214,00 | 499,07 | 3.560,00 | 138.840,00 |
| &nbsp;&nbsp;↳ 10/03/2026 | 39 | 278,20 | 214,00 | 499,07 | 3.560,00 | 138.840,00 |
| ↳ 5 a 12 meses - Macho | 744 | 5.520,40 | 207,36 | 503,83 | 3.410,06 | 2.624.188,00 |
| &nbsp;&nbsp;↳ 10/04/2026 | 121 | 806,67 | 200,00 | 520,50 | 3.470,00 | 437.250,00 |
| &nbsp;&nbsp;↳ 14/05/2026 | 36 | 240,00 | 200,00 | 539,35 | 3.595,64 | 129.443,00 |
| &nbsp;&nbsp;↳ 26/05/2026 | 160 | 1.847,07 | 346,33 | 377,68 | 4.360,00 | 697.600,00 |
| &nbsp;&nbsp;↳ 29/06/2026 | 82 | 556,67 | 203,66 | 459,74 | 3.120,00 | 255.840,00 |
| &nbsp;&nbsp;↳ 06/07/2026 | 107 | 642,00 | 180,00 | 516,67 | 3.100,00 | 331.700,00 |
| &nbsp;&nbsp;↳ 19/08/2026 | 118 | 708,00 | 180,00 | 572,08 | 3.432,50 | 412.355,00 |
| &nbsp;&nbsp;↳ 20/08/2026 | 120 | 720,00 | 180,00 | 500,00 | 3.000,00 | 360.000,00 |
| **Total** | **783** | **5.798,60** | **207,97** | **503,40** | **3.423,69** | **2.763.028,00** |

Datas que agrupam 2 linhas de compra: 10/04 (r22+r23), 29/06 (r26+r27), 19/08 (r29+r30).

## 5. O que o Vision precisa para replicar

1. Mesma leitura de `Compra_Gado` da p.4 (linhas 7→fim; precisa também das colunas **U, V, M** — valores em cache ou recomputados: M=L÷G, O=M×N÷15, P=O×G, T=Q+R+S, U=T÷G, V=U÷O, W=U÷M).
2. Agrupar: `F` (tipo) → `H` (categoria) → dia de `B`.
3. Por grupo: SUM de G/P/T; **AVG de M/U/V** (média simples por linha de compra, não ponderada por cabeças nem por @).
4. Cards: ΣG e ΣT.
5. Slicers: I (Fornecedor), F (Tipo Compra), H (Categoria), B (Data).
6. Não confundir com os cards da p.4: lá é ΣT÷Σdenominador, aqui é AVG(linha a linha).
