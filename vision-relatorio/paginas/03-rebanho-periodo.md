# Página 3 — Relatório de Rebanho Período

- PDF: p.3 ("Relatório de Rebanho Período", período 01/01/2026 a 31/08/2026)
- PBIX: página `e0e0a302c88cb14de1ee`, displayName "Auditoria Período", 1280×720
- Fontes: aba **`Diárias_Categoria`** (matriz de movimentação), aba **`Diárias`** (rebanho médio), aba **`Estoque`** (peso médio de referência), `Cadastros!Q17` (área útil = 561,4 ha), `dCalendário`/`dCategoria`

**Status: reconciliado.** Matriz e totais batem exatamente; Rebanho Médio e UA/ha confirmados por reconstituição dos cálculos.

---

## 1. O que a página exibe

- Slicer de **Data** (intervalo 01/01/2026 → 31/08/2026).
- 3 cards à esquerda: **Saldo Final** (1.599), **Peso Vivo Médio (kg)** (332,20), **UA/ha Média** (1,38).
- **Matriz de movimentação** por categoria: Saldo Inicial | Compras | Vendas | Mortes | Consumo | Nascimento | Transf. Entrada | Transf. Saída | Evol. Saída | Evol. Entrada | Saldo Final. Linha Total.
- **Combo chart**: Rebanho Médio (barras, eixo esq.) × UA/ha (linha, eixo dir.) por mês jan–ago.

## 2. Bindings PBIX → origem

| Visual | Binding | Origem na planilha |
|---|---|---|
| Tabela — linhas | `dCategoria.Índice`, `dCategoria.Categoria` | 10 categorias de `Cadastros!B8:B17` (índices 0–9 no PDF) |
| Tabela — Saldo Inicial | `Diárias_Categoria.Saldo Inicial Calculo` (medida) | coluna **F** no **primeiro dia** do período filtrado |
| Tabela — eventos | `Sum(Diárias_Categoria.{Compras,Vendas,Mortes,Consumo,Nascimento,Transf Entrada,Transf Saída,EvoluçãoSaída,EvoluçãoEntrada})` | colunas G,H,I,J,K,L,M,N,O somadas no período |
| Tabela — Saldo Final | `Diárias_Categoria.Saldo Final Calculo` (medida) | coluna **P** no **último dia** do período |
| Card Saldo Final | `Diárias_Categoria.Saldo Final Calculo` | idem (31/08/2026 → 1.599) |
| Card Peso Vivo Médio | `Sum(Estoque.Peso Vivo (kg))` | média simples dos pesos de referência das 10 categorias da aba Estoque (coluna X): (78+80+173+210+266+346+399+596+474+700)/10 = **332,20**. NOTA: não é o peso médio ponderado real do rebanho (que seria ~241,9 kg) — é a média dos pesos de referência, um quirk do modelo. |
| Card UA/ha Média | `Área.UA/ha Média` (medida) | média das UA/ha mensais = 1,38 |
| Combo — Rebanho Médio | `Estoque.Rebanho Médio` (medida) | **média diária de `Diárias!H` (Saldo Diário Final)** por mês — não é a soma das 10 categorias de `Diárias_Categoria`! A aba `Diárias` conta o rebanho total da fazenda (inclui animais fora das 10 categorias, ex. touros) |
| Combo — UA/ha | `Área.UA/ha` (medida) | rebanho médio em UA ÷ área útil. UA = kg vivos ÷ 450 |

## 3. Aba `Diárias_Categoria` (o fato diário por categoria)

Grade diária: **10 linhas por dia** (uma por categoria), dados a partir da linha 8, primeiro dia = `Cadastros!B29` (01/01/2025). ~18.267 linhas ≈ 1.826 dias. Header na linha 7; linha 6 tem `SUBTOTAL` de cada coluna (para quando o usuário filtra na planilha).

### Colunas e fórmulas (linha 8 = primeiro dia; padrão repete)

| Col | Campo | Fórmula / origem |
|---|---|---|
| B | Mês | `VLOOKUP(MONTH(D), Cadastros!S8:T19, 2)` → nome por extenso |
| C | Ano | `YEAR(D)` |
| D | Data | dia do lançamento (serial); primeiro dia `Cadastros!B29` |
| E | Categoria | texto fixo, cicla as 10 categorias |
| F | Saldo Inicial | 1º dia: `Cadastros!T23:T32`; demais dias: `P` do dia anterior (mesma categoria, ex. F18=P8) |
| G | Compras | `SUMIFS(Compra_Gado!G [nº cab], Compra_Gado!AD [data], Compra_Gado!H [cat]) − L` |
| H | Vendas | `SUMIFS(Venda_Gado!I, Venda_Gado!CD [data], Venda_Gado!J [cat]) − M` |
| I | Mortes | `COUNTIFS(Mortes_Consumos!A=data, E=cat, P="Morte")` |
| J | Consumo | `COUNTIFS(Mortes_Consumos!A=data, E=cat, P="Consumo")` |
| K | Nascimento | `SUMIFS(Nascimentos!C [quant], A=data, G=cat)` |
| L | Transf Entrada | `SUMIFS(Compra_Gado!G, A=data, H=cat, F=$L$7)` — compras do tipo "Transf Entrada" (filtro em L7) |
| M | Transf Saída | `SUMIFS(Venda_Gado!I, CO=data, J=cat, H=$M$7)` — vendas do tipo "Transf Saída" |
| N | Evolução Saída | `SUMIFS(Evolução_Rebanho!C [quant], A=data, D=cat)` — sai da categoria D |
| O | Evolução Entrada | `SUMIFS(Evolução_Rebanho!C, A=data, F=cat)` — entra na categoria F |
| P | Saldo Final | `F+G−H−I−J+K+L−M−N+O` |
| Q | label mês-ano | `B&"-"&C` |

### Regras de negócio embutidas

- **Compras excluem transferências**: compras do tipo "Transf Entrada" ficam em `Compra_Gado` mas são subtraídas de G e exibidas na coluna própria L. Idem vendas/transf saída (H/M).
- **Evolução** = mudança de faixa etária registrada em `Evolução_Rebanho` (quantidade, data, categoria origem D, categoria destino F). No PDF: 5-12m M evoluiu 80 para 13-24m M; 13-24m M evoluiu 285 para 25-36m M. Total saída = entrada = 365.
- **Saldo é diário e encadeado**: cada dia começa com o P do dia anterior; dia 1 semeia de `Cadastros!T23:T32`.

## 4. Aba `Diárias` (rebanho total diário)

Header linha 6: B=Data, C=Saldo Diário Inicial, D=Entrada, E=Saída, F=Morte/Consumo, G=Nascimentos, H=Saldo Diário Final, I=Sistema de Produção, J=Período, K–P=médias mensais, Q=Total de Diárias Mensal, R=Média Diária Mensal. Colunas AJ+ = controle de caixa diário (Contas a Pagar, Compra de Gado, Investimentos, Empréstimos, Contas a Receber, Abate de Gado, Saldo Fim do Dia) — usado pelo Fluxo de Caixa (p.19).

**Diferença crucial vs `Diárias_Categoria`**: `Diárias` agrega o rebanho inteiro sem categoria. Os valores divergem da soma das 10 categorias (jan/2026: média diária Diárias=1.522 vs ΣDiárias_Categoria=1.477; ago: 1.503 vs 1.599) — provavelmente porque `Diárias` inclui touros/outros animais fora das 10 faixas. Para o gráfico Rebanho Médio usar **`Diárias!H`**, nunca a soma de `Diárias_Categoria`.

## 5. Reconciliação (período 01/01–31/08/2026)

Matriz (somando jan–ago 2026 em `Diárias_Categoria`, SI do 1º dia, SF do último):

| Categoria | SI | Comp | Vend | Mort | Cons | Nasc | TE | TS | EvS | EvE | SF | PDF |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0-4m Fêmea | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | ✓ |
| 0-4m Macho | 37 | 0 | 0 | 4 | 0 | 2 | 0 | 0 | 0 | 0 | 35 | ✓ |
| 5-12m Fêmea | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | ✓ |
| 5-12m Macho | 835 | 744 | 0 | 6 | 0 | 0 | 0 | 0 | 80 | 0 | 1.493 | ✓ |
| 13-24m Fêmea | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4 | ✓ |
| 13-24m Macho | 625 | 39 | 393 | 3 | 5 | 0 | 0 | 0 | 285 | 80 | 58 | ✓ |
| 25-36m Fêmea | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | ✓ |
| 25-36m Macho | 21 | 0 | 306 | 0 | 0 | 0 | 0 | 0 | 0 | 285 | 0 | ✓ |
| >36m Fêmea | 9 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 9 | ✓ |
| >36m Macho | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | ✓ |
| **Total** | **1.531** | **783** | **699** | **13** | **5** | **2** | **0** | **0** | **365** | **365** | **1.599** | ✓ |

Gráfico: Rebanho Médio mensal = média de `Diárias!H` → {jan 1522, fev 1469, mar 1415, abr 1365, mai 1311, jun 1361, jul 1426, ago 1503} — mesmo multiset do PDF (1522/1503/1311/1415/1426/1469/1365/1361; a ordem na extração de texto do PDF não é confiável, os 8 valores conferem).

UA/ha mensal: reconstituída como `(rebanho médio em UA) ÷ 561,4`, onde UA = kg de peso vivo ÷ 450 usando os pesos de referência por categoria (78…700). Multiset calculado {1,6; 1,4; 1,5; 1,3; 1,4; 1,3; 1,3; 1,4} bate com o PDF; média 1,383 → card "1,38" ✓. **Refinamento via TMDL**: a medida real é `UA/ha = SUM('Estoque'[Total UA Categoria]) ÷ 561` (denominador = área com cast Int64; `Total UA Categoria` = `Saldo Final × Peso Vivo (kg) ÷ 450`, coluna criada no M) e `UA/ha Média = UA/ha ÷ DISTINCTCOUNT(dCalendário[NúmeroMês])`. Na precisão de 1 casa exibida, ambas as reconstruções convergem; para implementação usar a forma do DAX.

## 6. O que o Vision precisa para replicar

1. **`Diárias_Categoria`**: ler linhas 8→fim; filtrar datas no período; por categoria: SI = F do primeiro dia, SF = P do último dia, eventos = soma de G–O. 10 linhas na ordem de `Cadastros!B8:B17`.
2. **`Diárias`**: rebanho médio mensal = média de H por mês no período.
3. **`Estoque`**: pesos de referência (X) por categoria para UA/ha e para o card de peso médio (média simples dos 10 pesos).
4. **Área útil**: `Cadastros!Q17` (561,4 ha nesta fazenda).
5. UA/ha mensal = (rebanho médio do mês × peso vivo médio do mês ÷ 450) ÷ área; UA/ha média = média dos meses.
6. Totais da tabela: soma simples; SF total = 1.599.

**Atenção**: nesta página a fonte dos eventos é `Diárias_Categoria` (granularidade dia), não `Estoque` (mês). Os totais do período são consistentes entre as duas, mas `Estoque` não tem Transf. Entrada/Saída nem Evolução E/S com sinais separados por dia — e não serve para rebanho médio.
