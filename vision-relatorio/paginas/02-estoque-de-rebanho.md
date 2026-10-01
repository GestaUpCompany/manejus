# Página 2 — Relatório de Estoque de Rebanho

- PDF: p.2 ("Relatório de Estoque de Rebanho", filtro de mês = agosto)
- PBIX: página `fd4f8e2c091c6e7e6afc`, displayName "Auditoria Mensal", 1280×720
- Fonte de dados: aba **`Estoque`** da planilha (entidade `Estoque` no modelo) + `dCalendário` (filtro) + `dCategoria` (ordenação/rótulos)

**Status: reconciliado número a número.** Todos os valores impressos no PDF batem exatamente com os valores calculados da aba `Estoque` (janeiro-2026 para o painel esquerdo, agosto-2026 para o direito).

---

## 1. O que a página exibe

Filtro de página fixo: **Ano = 2026** (`dCalendário`, filterConfig do page.json). Slicer único de **Mês** (agosto no PDF).

Uma tabela única (tableEx) com duas metades lado a lado, mais uma fileira de 8 cards KPI na base:

| Metade | Colunas | Significado |
|---|---|---|
| Esquerda ("Saldo Inicial") | Descrição, Saldo Inicial, Total @ Inicial, Valor @ Inicial, Total Inicial (R$) | Estoque de **janeiro do ano filtrado** (sempre fixo, não muda com o slicer de mês) |
| Direita ("Saldo Final") | Descrição, Saldo Final, Total @, Valor @, Valor Total R$ | Estoque do **mês selecionado** no slicer |

Cards na base (8): Saldo Inicial (1531), Total @ Inicial (13.791), Valor @ Inicial, Total Inicial R$ (5.622.564,89) | Saldo Final (1.599), Total @ (11.394), Valor @ (461,43), Valor Total R$ (5.257.414,84).

A tabela repete a coluna `Estoque.Descrição` entre os dois grupos (por isso "Descrição" aparece 2× nos bindings) e usa `Sum(dCategoria.Índice)` como primeira coluna oculta de ordenação (os índices 209–218 aparecem sutilmente no PDF).

## 2. Bindings do PBIX → colunas da planilha

| Binding PBIX | Coluna planilha `Estoque` | Agregação |
|---|---|---|
| `dCategoria.Índice` ("i") | ordem das categorias (Cadastros!B8:B17) | Sum (oculto, ordena) |
| `Estoque.Descrição` | F — Descrição | — |
| `Estoque.Saldo Inicial Janeiro Fixo` | G filtrado em Mês=janeiro | medida do modelo (não existe na planilha) |
| `Estoque.Total @ Inicial Janeiro Fixo` | K filtrado em janeiro | idem |
| `Estoque.Valor @ Inicial Janeiro Fixo` | L filtrado em janeiro | idem |
| `Estoque.Valor Total Inicial (R$) Janeiro Fixo` | M filtrado em janeiro | idem |
| `Sum(Estoque.Saldo Final)` | W | soma (o mês filtrado tem 1 linha por categoria) |
| `Sum(Estoque.Total @)` | AA | soma |
| `Sum(Estoque.Valor @)` | AB | soma* |
| `Sum(Estoque.Valor Total R$)` | AC | soma |

*Valor @ é somado direto nas linhas de categoria (cada categoria tem 1 linha/mês, então soma = valor); no total o PBIX exibe a média ponderada naturalmente porque soma sobre o grupo... verificar: o PDF mostra no rodapé R$ 461,43 que é o Valor @ médio ponderado da linha "Total do Rebanho" (coluna AB), não a soma dos Valor @ das 10 categorias. Ou seja, o total da tabela do PBIX usa a linha Total do Rebanho da própria tabela ou a medida divide Total R$ / Total @. A confirmar na implementação: usar SUM(Valor Total R$)/SUM(Total @), que dá 5.257.414,84/11.393,78 = 461,43 ✓ (e não SUM(Valor @)).

O mesmo para Valor @ Inicial no total: PDF mostra R$ 407,69 → 5.622.564,89 / 13.791,43 = 407,69 ✓. O valor da planilha na linha Total (col L, 412,93) **não** é o que o PBIX mostra — o PBIX recalcula como razão de somas.

## 3. Estrutura da aba `Estoque` na planilha

Grade mensal: blocos de **11 linhas** (10 categorias + linha "Total do Rebanho"), cabeçalho na linha 8, primeiro bloco jan/2025 nas linhas 9–19. Mês N começa na linha `9 + 11×(N-1)`:

- jan/2025 → linhas 9–19 · jan/2026 → 141–151 · ago/2026 → 218–228

Categorias (ordem fixa, vem de `Cadastros!B8:B17`):
0-4m Fêmea, 0-4m Macho, 5-12m Fêmea, 5-12m Macho, 13-24m Fêmea, 13-24m Macho, 25-36m Fêmea, 25-36m Macho, >36m Fêmea, >36m Macho. **Touro não aparece nesta aba.**

### Colunas (A=1 … AC=29)

| Col | Header | Conteúdo / fórmula |
|---|---|---|
| A | Data | último dia do mês (serial); `EDATE(mês ant.,1)-1` |
| B | Mês | nome do mês (`VLOOKUP(MONTH(A), Cadastros!S8:T19)`) |
| C | Ano | `YEAR(A)` |
| E | — | label "mês-ano" (`B&"-"&C`) |
| F | Descrição | categoria (`Cadastros!B8…B17`, fixo por posição no bloco) |
| G | Saldo Inicial | jan/2025: `Cadastros!T23:T32` (estoq. inicial cadastrado); demais meses: `W` do bloco anterior |
| H | Peso Vivo Inicial (kg) | jan/2025: `Cadastros!V23:V32`; demais: `X` anterior |
| I | Rend. Carc. Inicial (%) | jan/2025: `Cadastros!X23:X32`; demais: `Y` anterior |
| J | Peso Vivo Inicial (@) | `H*I/15` |
| K | Total @ Inicial | `J*G` |
| L | Valor @ Inicial | jan/2025: digitado; demais: `AB` anterior |
| M | Valor Total Inicial (R$) | `L*K` |
| N | Compras | `SUMIFS(Diárias_Categoria!G, mês, ano, categoria)` |
| O | Vendas | `SUMIFS(Diárias_Categoria!H, …)` |
| P | Mortes | `SUMIFS(Diárias_Categoria!I, …)` |
| Q | Consumo | `SUMIFS(Diárias_Categoria!J, …)` |
| R | Nascimento | `SUMIFS(Diárias_Categoria!K, …)` |
| S | Transf. Entrada | `SUMIFS(Diárias_Categoria!L, …)` |
| T | Transf. Saída | `SUMIFS(Diárias_Categoria!M, …)` |
| U | Evolução Saída | `SUMIFS(Diárias_Categoria!N, …)` |
| V | Evolução Entrada | `SUMIFS(Diárias_Categoria!O, …)` |
| W | Saldo Final | `IF(A>TODAY(), 0, G+N-O-P-Q+R+S-T-U+V)` |
| X | Peso Vivo (kg) | **input manual** por categoria (78, 80, 173, 210, 266, 346, 399, 596, 474, 700) |
| Y | Rend. Carc. (%) | **input manual** (0,50 / 0,51 / 0,55) |
| Z | Peso Vivo (@) | `X*Y/15` |
| AA | Total @ | `Z*W` |
| AB | Valor @ | **input manual por mês** (preço da arroba do mês; ex. ago/2026 = 420,56…461,43) |
| AC | Valor Total R$ | `AB*AA` |

Linha "Total do Rebanho": somas em G,K,M,N–V,W,AA,AC; médias ponderadas (SUMPRODUCT/cabeças) em H,I,J,L,X,Y,Z; AB do total = SUMPRODUCT(AA,AB)/AA (ponderado por @).

### Pontos de atenção para o Vision

1. **Cadeia de saldo**: `Saldo Inicial` do mês = `Saldo Final` do mês anterior; jan/2025 é a semente vinda de `Cadastros`. Para reproduzir, basta computar os eventos (N–V) por mês×categoria e encadear.
2. **Inputs manuais**: X (peso vivo ref.), Y (rendimento carcaça) e AB (preço @ do mês) são digitados na planilha. No Vision, precisam ser parâmetros da fazenda (tabela de preço @ mensal + tabela de peso/rendimento por categoria), ou inputs na tela de geração do relatório.
3. **Movimentações** (N–V) não são lançadas na aba Estoque — são SUMIFS sobre `Diárias_Categoria` (colunas B=mês, C=ano, E=categoria, G–O=eventos). A fonte real do dado é `Diárias_Categoria`.
4. **`Valor @` no total** é razão de somas (ΣValor R$/ΣTotal @), não média das colunas.
5. **Datas futuras** zeram o saldo (guard `A>TODAY()`). No Vision, tratar como "mês sem dados = 0" ou esconder.
6. Formato PDF: @ inteiras (round), R$ pt-BR, mês por extenso.

## 4. Reconciliação (agosto/2026, página filtrada)

| Métrica | PDF | Planilha (bloco ago-2026, linha 228) | Status |
|---|---|---|---|
| Saldo Inicial Jan total | 1.531 | jan-2026 G-total = 1.531 | ✓ |
| Total @ Inicial Jan | 13.791 | K-total = 13.791,43 | ✓ |
| Valor @ Inicial Jan total | R$ 407,69 | ΣM/ΣK = 5.622.564,89/13.791,43 = 407,69 | ✓ |
| Total Inicial R$ Jan | R$ 5.622.564,89 | M-total | ✓ |
| Saldo Final ago | 1.599 | W-total = 1.599 | ✓ |
| Total @ ago | 11.394 | AA-total = 11.393,78 | ✓ |
| Valor @ ago | R$ 461,43 | ΣAC/ΣAA | ✓ |
| Valor Total ago | R$ 5.257.414,84 | AC-total | ✓ |

Todas as 10 linhas de categoria conferem valor a valor (ex.: 5-12m Macho: inicial 835 cab / 5.845 @ / R$ 428,06 / R$ 2.501.985,65; final 1.493 cab / 10.451 @ / R$ 468,65 / R$ 4.897.905,94).

## 5. O que o Vision precisa para replicar

1. Ler aba `Estoque` inteira (ou recomputar): linhas 9→fim, ignorando linhas de "Total do Rebanho" (F="Total do Rebanho") — ou usá-las como linha de total.
2. Filtros: ano (fixo do relatório) + mês selecionado.
3. Saldo inicial: sempre o bloco de janeiro do ano; saldo final: bloco do mês filtrado.
4. Campos por linha: Descrição | Saldo Inicial (G) | Total @ Ini (K) | Valor @ Ini (L) | Total Ini R$ (M) | Saldo Final (W) | Total @ (AA) | Valor @ (AB) | Valor Total R$ (AC).
5. Totais: soma em cabeças, @ e R$; Valor @ = ΣR$/Σ@.
6. Ordem das linhas: fixa (as 10 categorias na ordem de Cadastros; índice dCategoria 209–218 no modelo, equivalente à ordem 1–10).

**Alternativa estrutural**: em vez de ler a aba Estoque pronta, o Vision pode recomputar a grade a partir de `Diárias_Categoria` (eventos) + `Cadastros` (semente jan + pesos/rendimentos) + tabela de preço @ mensal. Recomendado para o futuro backend: a aba Estoque é derivada, a fonte de verdade são os eventos.
