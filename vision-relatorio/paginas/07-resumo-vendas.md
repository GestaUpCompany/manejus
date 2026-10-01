# Página 7 — Resumo de Vendas

- PDF: p.7 ("Resumo de Vendas", período 01/01/2026 a 31/08/2026)
- PBIX: página `40cb36bfabc02a4f0b65`, displayName "Resumo Vendas", 1280×720
- Fonte: aba **`Venda_Gado`** (tabela `Lotes36`) + `dCalendário` (relacionamento por Data Venda, coluna D)
- Sem filtro de página fixo; só slicers.

**Status: reconciliado** — fórmula do "Giro de Estoque" resolvida via `pbi-tools` (ver §5).

---

## 1. O que a página exibe

- Slicers: **Tipo de Venda**, **Empresa** (`Frigorífico/Comprador`), **Data**.
- 3 cards: **N° de Cabeças** (699), **Giro de Estoque** (5,02%), **Valor Total (R$)** (R$ 5.151.805,27).
- **Matriz hierárquica**: `Tipo de Venda` → `Categoria` → `Data` (dia), medidas: N° de Cab | Frigorífico/Comprador | Total @ | Média de R$/@ | Total R$.

## 2. Bindings PBIX → origem

| Visual | Binding | Semântica |
|---|---|---|
| Card N° de Cabeças | `Sum(Venda_Gado.Quant. Cab. Vendidas)` | ΣI = 699 |
| Card Valor Total | `Sum(Venda_Gado.Valor Líquido Total (R$))` | ΣAN = 5.151.805,27 |
| Card Giro de Estoque | medida `Venda_Gado.Tx. de Venda` | `DIVIDE(Σ Quant. Cab. Vendidas, Σ 'Resumo Estoque'[Saldo Inicial])` — denominador = Σ SI mensal do **ano 2025 fixo** (ver §5) |
| Pivot N° de Cab | `Sum(Quant. Cab. Vendidas)` | ΣI |
| Pivot Frigorífico | `Min(Frigorífico/Comprador)` (agg 3) | texto — primeiro valor; cada data tem 1 lote, então é o comprador do lote |
| Pivot Total @ | `Sum(Total @ Abatidas)` | ΣAF |
| Pivot Média de R$/@ | `Avg(Preço Venda Final R$/@)` | **AVG(AO)** — média simples por lote |
| Pivot Total R$ | `Sum(Valor Líquido Total (R$))` | ΣAN |
| Linhas | `Tipo de Venda` (H) → `Categoria` (J) → `dCalendário.Data` (dia de D) | |
| Slicers | `H`, `AJ`, `dCalendário.Data` (D) | |

Mesma regra da p.6: `Function 0` = Sum, `Function 1` = Average, `Function 3` = Min/First. O queryRef pode exibir `Sum` mesmo quando a agregação real é outra.

## 3. Reconciliação (período 01/01–31/08/2026)

| Nível | N° Cab | Comprador (Min) | Total @ | Média R$/@ | Total R$ |
|---|---|---|---|---|---|
| Abate Machos | 699 | Agra… | 14.804,80 | 342,87 | 5.151.805,27 |
| ↳ 13 a 24 meses - Macho | 393 | Agra… | 8.263,35 | 349,36 | 2.916.438,55 |
| &nbsp;&nbsp;↳ 01/05 | 126 | Agra… | 2.680,02 | 365,00 | 978.212,16 |
| &nbsp;&nbsp;↳ 08/06 | 119 | Agra… | 2.540,09 | 359,66 | 913.580,85 |
| &nbsp;&nbsp;↳ 19/08 | 79 | Frig. Estrela | 1.681,91 | 339,32 | 570.702,32 |
| &nbsp;&nbsp;↳ 01/07 | 69 | Frig. Vale | 1.361,32 | 333,46 | 453.943,22 |
| ↳ 25 a 36 meses - Macho | 306 | Agra… | 6.541,45 | 337,69 | 2.235.366,72 |
| &nbsp;&nbsp;↳ 05/04 | 108 | Frig. Vale | 2.328,26 | 359,77 | 837.646,92 |
| &nbsp;&nbsp;↳ 02/04 | 54 | Agra… | 1.118,48 | 350,00 | 391.474,62 |
| &nbsp;&nbsp;↳ 27/02 | 54 | Frig. Estrela | 1.153,04 | 339,32 | 391.246,74 |
| &nbsp;&nbsp;↳ 27/01 | 54 | Agra… | 1.164,85 | 305,00 | 355.284,36 |
| &nbsp;&nbsp;↳ 26/02 | 36 | Frig. Vale | 776,81 | 334,33 | 259.714,08 |
| **Total** | **699** | Agra… | **14.804,80** | **342,87** | **5.151.805,27** |

Conferido: AVG das 9 colunas AO = 342,87; AVG das 4 de "13-24m" = 349,36; AVG das 5 de "25-36m" = 337,69 (PDF arredonda 337,68→337,69 por precisão interna); ΣAF e ΣAN exatos. As datas são o dia exato da `Data Venda` (D); cada data tem 1 lote nesta fazenda.

Obs.: a ordem das datas dentro de "25 a 36 meses" no PDF está embaralhada (05/04 antes de 02/04) — é artefato de extração/ordenação do visual; manter ordenação cronológica no Vision.

## 4. Quirk descoberto — `Diárias` projeta o futuro

`Diárias` (e, por consequência, `Diárias_Categoria`) têm linhas diárias até **dez/2029**, com Saldo Final travado em 1.599 (último saldo real de ago/2026) a partir de set/2026. Qualquer cálculo de média/período deve respeitar o filtro de data — médias "às cegas" sobre a aba inteira inflam o período (ex.: rebanho médio 2026 jan–ago = 1.421,5; jan–dez incluiria 4 meses de 1.599 projetado).

## 5. Resolvido — fórmula do "Giro de Estoque" (`Tx. de Venda`)

DAX extraído do DataModel via `pbi-tools` (edição desktop, usa o `msmdsrv.exe` do Power BI Desktop local — modelo extraído para `Relatorio Vision - Guanabara II 2026/Model/` em TMDL):

```dax
Tx. de Venda = DIVIDE(SUM('Venda_Gado'[Quant. Cab. Vendidas]), SUM('Resumo Estoque'[Saldo Inicial]))
```

A tabela **`Resumo Estoque`** é a aba `Estoque` importada com filtro hardcoded no M: `Table.SelectRows(..., each [Ano] = 2025)` — **120 linhas (12 meses × 10 categorias), ano 2025 fixo**. Ela só se relaciona com LocalDateTables automáticas (variations das colunas Data) e uma relação inativa com `dCategoria` — **não é filtrada pelo slicer `dCalendário.Data`**.

Reconciliação exata: Σ `Saldo Inicial` mensal de 2025 = 957+959+964+1.149+1.113+1.225+1.127+1.127+1.117+1.327+1.327+1.532 = **13.924** → 699 ÷ 13.924 = **5,0201% = 5,02%** ✓.

Semântica real: vendas do período ÷ soma dos saldos iniciais mensais do ano-base 2025. É um denominador congelado — em 2027 o card continuaria dividindo por 13.924, salvo reedição da query M. Para o Vision, tratar como parâmetro do relatório (ano-base configurável) ou replicar fielmente com `ano = 2025` por compatibilidade.

Hipóteses numéricas que não fechavam ficam registradas no histórico do chat; a extração TMDL do modelo resolve a classe inteira de medidas pendentes (qualquer outra medida DAX duvidosa pode ser lida em `Model/tables/*.tmdl`).

## 6. O que o Vision precisa para replicar

1. `Venda_Gado` (dados da linha 10 em diante): D, H, I, J, AJ, AF, AN, AO.
2. Filtrar período por D.
3. Pivot: agrupar H → J → dia(D); medidas ΣI, Min/first AJ, ΣAF, AVG(AO), ΣAN.
4. Cards: ΣI, ΣAN, e Tx. de Venda = ΣI ÷ Σ SI mensal do ano-base 2025 (`Resumo Estoque`, ver §5).
5. Slicers: H, AJ, D.
