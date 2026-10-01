# Página 4 — Compra Animais

- PDF: p.4 ("Compra Animais", período 01/01/2026 a 31/08/2026)
- PBIX: página `ef94e07807bf0e263fb3`, displayName "Compra Animais", 1280×720
- Fonte: aba **`Compra_Gado`** (inteira) + `dCalendário` (slicer de data / eixo mês) + slicers de `Categoria`, `Fornecedor`, `Tipo Compra`

**Status: reconciliado.** Todos os KPIs, a distribuição mensal, categorias e tipos batem exatamente com a aba `Compra_Gado` filtrada ao período.

---

## 1. O que a página exibe

- Slicer de **Data** (dCalendário, intervalo 01/01/2026 → 31/08/2026).
- Slicers **Categoria**, **Fornecedor**, **Tipo Compra** (todos em "Todos" no PDF).
- 4 cards KPI: **N° de Animais** (783), **Média de R$/@** (R$ 476,50), **Média de R$/kg** (R$ 15,88), **Média de R$/Cab** (R$ 3.528,77).
- **Gráfico de área**: N° Cabeças por mês (mar→ago).
- **Gráfico de colunas**: N° Cabeças por categoria.
- **Donut**: N° Cabeças por Tipo Compra (Comercial 100%).

## 2. Bindings PBIX → origem

| Visual | Binding | Origem / cálculo |
|---|---|---|
| Card N° de Animais | `Sum(Compra_Gado.N° Cabeças)` | soma de `G` nas linhas do período → 783 |
| Card Média de R$/@ | `Compra_Gado.Total da Compra ÷ Total (@)` (quick measure) | **ΣT ÷ ΣP** = 2.763.028,00 ÷ 5.798,60 = 476,50 |
| Card Média de R$/kg | `Compra_Gado.Total da Compra ÷ Peso Total Fazenda (kg/Lote)` | **ΣT ÷ ΣL** = 2.763.028,00 ÷ 173.958 = 15,88 |
| Card Média de R$/Cab | `Compra_Gado.Total da Compra ÷ N° Cabeças` | **ΣT ÷ ΣG** = 2.763.028,00 ÷ 783 = 3.528,77 |
| Área mensal | `dCalendário.Data.Mês` × `Sum(N° Cabeças)` | mês derivado de `B` (Data Compra) via relacionamento com dCalendário |
| Coluna por categoria | `Compra_Gado.Categoria` × `Sum(N° Cabeças)` | grupo por `H` |
| Donut por tipo | `Compra_Gado.Tipo Compra` × `Sum(N° Cabeças)` | grupo por `F` |
| Slicers | `Categoria` (H), `Fornecedor` (I), `Tipo Compra` (F), `dCalendário.Data` (B) | colunas diretas da aba |

**Ponto crítico**: as três médias são **razões de somas** (ΣT ÷ denominador somado), não médias das colunas unitárias U/V/W. Igual ao quirk do "Valor @" da p.2. Se o Vision calcular `AVG(V)`, `AVG(W)`, `AVG(U)`, os valores divergem.

## 3. Aba `Compra_Gado` (mapa completo)

Tabela com header na **linha 6** e dados a partir da **linha 7**. Nesta cópia: 25 linhas com data (linhas 7–31); 2026 = linhas 21–31 (11 compras). Fórmulas compartilhadas cobrem até a linha ~70.

### Colunas do relatório

| Col | Campo | Tipo | Fórmula / origem |
|---|---|---|---|
| A | (aux) | calc | `VLOOKUP(B, Diárias_Categoria!D:Q, 14)` → label "mês-ano" (ex. "março-2026") |
| B | Data Compra | manual | serial Excel |
| C | Data de Pagamento | calc | `XLOOKUP(E, 'Desembolsos Realizados'!R:R, 'Desembolsos Realizados'!C:C)` — data de pagto buscada no ledger pelo Cod. Movimentação |
| D | Status | calc | `IF(C="","Em Aberto","Pago")` |
| E | Cod. Movimentação | calc | `MONTH(B)&YEAR(B)&MID(F,1,2)&MID(G,1,2)&MID(H,1,1)&MID(I,1,2)&MID(L,1,3)` — ex. `32026Co391CL834` |
| F | Tipo Compra | manual | Comercial, Boitel, Parceria, Matriz PO, Receptora, Transf Entrada (lista em `Cadastros`) |
| G | N° Cabeças | manual | inteiro |
| H | Categoria | manual | uma das 10 categorias de `Cadastros!B8:B17` |
| I | Fornecedor | manual | texto (10 fornecedores em 2026, ex. CLAUDEMIR MARTINS, RICARDO PEREIRA DE BRITO) |
| J | Destino do Gado | manual | texto |
| K | Corretor | manual | texto |
| L | Peso Total Fazenda (kg/Lote) | manual | kg |
| M | Peso Médio (kg/cab) | calc | `L ÷ G` |
| N | Rend. Carcaça (%) | manual | ex. 0,50 |
| O | Peso Médio (@) | calc | `(M × N) ÷ 15` |
| P | Total (@) | calc | `O × G` |
| Q | Valor Total do Gado (R$/Lote) | calc | `SUMIFS('Desembolsos Realizados'!N:N, F="Compra_de_Gado", G=H[categoria], R=E[cod mov])` |
| R | Valor Total Frete (R$) | calc | `SUMIFS('Desembolsos Realizados'!N:N, F="Custos_Variáveis_Mensais", G="Frete de Transporte de Gado", R=E)` |
| S | Valor Total Comissão (R$) | calc | `SUMIFS('Desembolsos Realizados'!N:N, F="Custos_Variáveis_Mensais", G="Comissões de Comercialização", R=E)` |
| T | Total da Compra (R$/Lote) | calc | `Q + R + S` |
| U | R$/Cab. | calc | `T ÷ G` |
| V | R$/@ | calc | `U ÷ O` |
| W | R$/Kg | calc | `U ÷ M` |
| X | R$ @ Boi Gordo | manual | preço de referência da arroba do boi gordo (ex. 215,54) — input |
| Y | Ágio | calc | `(V − X) ÷ X` — quanto a compra pagou acima do boi gordo |
| Z, AA, AB | (headers: GTA / Nota Fiscal / Observações) | calc | nesta cópia contêm a **mesma fórmula de label mês-ano de A** (VLOOKUP em `Diárias_Categoria`); headers e conteúdo divergem |
| AD | (aux) | calc | mesma fórmula de label mês-ano de A |
| AM–AP | (aux) | calc | `Diárias!AB{r}`, `AC{r}`, `AD{r}`, `AE{r}` — puxam da tabela-auxiliar de compras na aba `Diárias` |
| AR | (aux) | calc | `YEAR(C)` |

### Pontos de atenção na aba

1. **O valor do gado não é digitado**: `Q`, `R`, `S` são SUMIFS sobre `Desembolsos Realizados` (coluna N = valor total do desembolso) casados pelo `Cod. Movimentação` (E ↔ ledger coluna R). A compra de gado é lançada no ledger financeiro como desembolso da divisão `Compra_de_Gado`, e frete/comissão como `Custos_Variáveis_Mensais`. Ou seja: **o caixa e o estoque amarram pelo Cod. Movimentação**.
2. **Data de Pagamento (C) e Status (D) vêm do ledger**, não de input na própria aba. Se o desembolso não existir, C fica vazio e D = "Em Aberto".
3. **Compras "Transf Entrada" moram aqui**: lançamentos desse tipo entram em `Compra_Gado` como qualquer compra, mas `Diárias_Categoria` os segrega (ver quirk abaixo). No período há 0 — todas as 11 compras são "Comercial".

## 4. Quirk: a chave de data dos SUMIFS de `Diárias_Categoria` não funciona em Excel

`Diárias_Categoria!G` (Compras do dia) faz:

```
SUMIFS(Compra_Gado!G:G, Compra_Gado!AD:AD, Diárias_Categoria!D, Compra_Gado!H:H, Diárias_Categoria!E) - L
```

Mas `Compra_Gado!AD` é o label texto "março-2026" e `Diárias_Categoria!D` é o serial do dia (ex. 46082). **Texto ≠ serial: o SUMIFS não casaria em Excel real.** O mesmo ocorre nas vendas (`Venda_Gado!CD`, também label) e na Transf Entrada (`Compra_Gado!A`, label).

Os valores em cache existem e reconciliam com o PDF porque foram escritos pela ferramenta que gera o modelo da pasta (ou ficaram stale de uma versão anterior), e o Excel não recalculou essas células ao salvar. A semântica pretendida é visível pela coluna auxiliar `AO = Diárias!AD{linha}` (serial do **primeiro dia do mês** da compra): a compra de 10/mar (B=46091) é atribuída ao dia 01/mar (46082) em `Diárias_Categoria` — cada compra cai no dia 1 do seu mês, por categoria. `Diárias!AB:AE` é a tabela-auxiliar por linha de compra: (id categoria?, código MMYYYY ex. 32026, serial do 1º dia do mês, nº de dias do mês).

**Implicação para o Vision**: a fase 1 (ler abas prontas) não é afetada — os caches estão corretos. Se um dia recomputarmos `Diárias_Categoria`, implementar a semântica pretendida (compra → bucket mês × categoria, atribuída ao 1º dia do mês), nunca a fórmula literal. Confirmação adicional: em `Venda_Gado` existe a coluna `CO` com o serial do 1º dia do mês (a chave correta, análoga a `AO` aqui), mas o SUMIFS de vendas usa `CD` (label) — mesmo deslize de coluna nos dois lados.

## 5. Reconciliação (período 01/01–31/08/2026)

11 compras no período (linhas 21–31):

| Mês | Cabeças (planilha) | PDF |
|---|---|---|
| março | 39 | 39 ✓ |
| abril | 121 | 121 ✓ |
| maio | 196 | 196 ✓ |
| junho | 82 | 82 ✓ |
| julho | 107 | 107 ✓ |
| agosto | 238 | 238 ✓ |
| **Total** | **783** | **783** ✓ |

(A extração de texto do PDF lista os rótulos fora de ordem; ordenando pela posição x no gráfico, os valores são exatamente os acima.)

| Indicador | Planilha | PDF |
|---|---|---|
| Σ N° Cabeças (G) | 783 | 783 ✓ |
| Σ Total da Compra (T) | R$ 2.763.028,00 | — |
| Σ Total @ (P) | 5.798,60 @ | — |
| Σ Peso Fazenda (L) | 173.958 kg | — |
| R$/Cab (ΣT÷ΣG) | 3.528,77 | R$ 3.528,77 ✓ |
| R$/@ (ΣT÷ΣP) | 476,50 | R$ 476,50 ✓ |
| R$/kg (ΣT÷ΣL) | 15,88 | R$ 15,88 ✓ |

Categorias: `5 a 12 meses - Macho` = 744; `13 a 24 meses - Macho` = 39. Tipo: `Comercial` = 783 (100%).

## 6. O que o Vision precisa para replicar

1. Ler `Compra_Gado` linhas 7→fim, colunas B, F, G, H, I, L, M, N, O, P, T (valores em cache das calculadas; recalcular M/O/P/T se necessário é trivial: M=L÷G, O=M×N÷15, P=O×G, T=Q+R+S).
2. Filtrar pelo período em `B` (Data Compra).
3. KPIs: ΣG, ΣT÷ΣG, ΣT÷ΣP, ΣT÷ΣL — sempre razão de somas.
4. Série mensal: agrupar por mês de `B`.
5. Grupos: `H` (categoria), `F` (tipo compra), `I` (fornecedor para o slicer).
6. Não precisa tocar `Diárias_Categoria`, `Desembolsos Realizados` ou as colunas auxiliares — a página é 100% `Compra_Gado`.
