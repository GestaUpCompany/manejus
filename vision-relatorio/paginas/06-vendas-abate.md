# Página 6 — Vendas de Animais Abate

- PDF: p.6 ("Vendas de Animais Abate", período 01/01/2026 a 31/08/2026)
- PBIX: página `bd875b25978eab2eb44f`, displayName "Vendas Animais Abate", 1280×720
- Fonte: aba **`Venda_Gado`** (tabela estruturada `Lotes36`, C9:CC260) + `dCalendário` (relacionamento por Data Venda)

**Status: reconciliado.** Cards, série mensal e combo por frigorífico conferem valor a valor.

---

## 1. O que a página exibe

- Slicers: **Tipo de Venda**, **Empresa** (= `Frigorífico/Comprador`), **Data** (01/01/2026 → 31/08/2026).
- 3 cards: **N° de Cabeças** (699), **Média R$/@** (R$ 347,98), **Média R$/kg** (R$ 12,95).
- **Combo 1** — "Reais por @ e RC% por Empresa Pagante": coluna = Média R$/@ por frigorífico, linha = Rend. Carcaça Final (%).
- **Combo 2** — "Média de R$/@ mensal": coluna = N° de Cabeças por mês, linha = Média R$/@ por mês.

## 2. Aba `Venda_Gado` — tabela `Lotes36`

Header na linha 9 (tabela começa em C9); dados a partir da linha 10. Nesta cópia: 24 vendas (linhas 10–33), 15 em 2025 e 9 em 2026. O bloco C:CC da tabela tem ~80 colunas; as relevantes aqui (letra = coluna da planilha, o offset é +2 pois a tabela começa em C):

| Col | Campo | Conteúdo |
|---|---|---|
| C | Lote | identificador do lote |
| D | Data Venda | serial — eixo do slicer/gráfico mensal |
| E | Data Pagamento | serial (via ledger, como em Compra_Gado) |
| F | Status | Pago / Em Aberto |
| G | Cód. Movimentação | chave composta (mesmo padrão de Compra_Gado) |
| H | Tipo de Venda | "Abate Machos", "Abate Fêmeas", "Comercial Vivo", "Venda Matrizes/Touros", "Transf Saída" (lista em `Cadastros`) |
| I | Quant. Cab. Vendidas | cabeças |
| J | Categoria | uma das 10 categorias |
| K | Sexo | M/F |
| N | Peso Vivo Início Total (kg) | kg |
| W | Peso Vivo Final Total (kg) | kg — denominador do R$/kg |
| AB | Peso de Abate (@) | @ por cabeça |
| AD | Rend. Carcaça Final (%) | ex. 0,5602 |
| AF | Total @ Abatidas | @ do lote — denominador do R$/@ |
| AJ | Frigorífico/Comprador | empresa pagante |
| AK | Valor Bruto Total (R$) | receita bruta |
| AL | Descontos (R$) | |
| AM | Acréscimos (R$) | |
| AN | Valor Líquido Total (R$) | bruto − descontos + acréscimos — numerador das médias |
| AO | Preço Venda Final (R$/@) | unitário por lote |
| AP | R$/Cab. | unitário por lote |
| AQ | Preço kg/PV (R$/kg) | unitário por lote |
| CD | (aux) label mês-ano | `VLOOKUP(D, Diárias_Categoria!D:Q, 14)` — "janeiro-2025" |
| CO | (aux) serial 1º dia do mês | ex. 45658 — **a chave correta para casar com `Diárias_Categoria!D`** |

Demais colunas (período de engorda, GMD, consumo, custos, resultado líquido) pertencem à análise de rentabilidade do lote — não usadas nesta página, mas relevantes para "Resumo Vendas" (p.8) e índices.

## 3. Bindings PBIX → origem e semântica

| Visual | Binding | Cálculo |
|---|---|---|
| Card N° de Cabeças | `Sum(Venda_Gado.Quant. Cab. Vendidas)` | ΣI = 699 |
| Card Média R$/@ | medida `Venda_Gado.Média R$/@` | **ΣAN ÷ ΣAF** = 5.151.805,27 ÷ 14.804,80 = **347,98** (razão de somas; a linha de totais da aba reproduz em AO6) |
| Card Média R$/kg | medida `Venda_Gado.Média R$/kg` | **ΣAN ÷ ΣW** = 5.151.805,27 ÷ 397.688,15 = **12,95** (R$ por kg de peso vivo final) |
| Combo mensal — coluna | `Sum(Quant. Cab. Vendidas)` por mês de `dCalendário.Data` | mês de D |
| Combo mensal — linha | `Avg(Preço Venda Final R$/@)` por mês | **AVG(AO) por mês** — média simples dos lotes, não ponderada |
| Combo empresa — coluna | `Avg(Preço Venda Final R$/@)` por `Frigorífico/Comprador` | AVG(AO) por AJ |
| Combo empresa — linha | `Avg(Rend. Carcaça Final %)` por AJ | AVG(AD) por AJ |
| Slicers | `H` (Tipo de Venda), `AJ` (Frigorífico), `dCalendário.Data` (D) | |

**Atenção ao `Function: 1`**: o queryRef dos gráficos diz `Sum(...)`, mas o código de agregação 1 é **Average** (confirmado pelo `nativeQueryRef` "Média R$/@" e pelo valor reconciliado). Ignorar o texto do queryRef.

**Duas semânticas na mesma página**: os cards são razão de somas (ΣAN÷ΣAF, ΣAN÷ΣW), as linhas/colunas dos gráficos são AVG por lote (AO, AD). Ex.: Agra tem AVG(AO)=344,92 no gráfico, mas sua razão ΣAN÷ΣAF seria 351,65.

## 4. Reconciliação (período 01/01–31/08/2026)

9 vendas no período, todas `Abate Machos` (linhas 25–33):

| Mês | Cabeças | AVG R$/@ | PDF |
|---|---|---|---|
| jan | 54 | 305,00 | ✓ |
| fev | 90 | 336,83 | ✓ |
| abr | 162 | 354,89 | ✓ |
| mai | 126 | 365,00 | ✓ |
| jun | 119 | 359,66 | ✓ |
| jul | 69 | 333,46 | ✓ |
| ago | 79 | 339,32 | ✓ |
| **Total** | **699** | | ✓ |

Sem vendas em março — o gráfico mostra 7 meses. (Ordem dos rótulos na extração de texto é embaralhada; posições x conferem.)

Por frigorífico (AVG de AO e AD, posições x confirmadas):

| Empresa | Lotes | Cabeças | Média R$/@ | RC% | PDF |
|---|---|---|---|---|---|
| Agra Agrondustrial de Alimentos SA | 4 | 353 | 344,92 | 56,02% | ✓ |
| Frigorífico Vale Company | 3 | 213 | 342,52 | 54,95% | ✓ |
| Frigorífico Estrela | 2 | 133 | 339,32 | 55,91% | ✓ |

Categorias vendidas: jan–abr = `25 a 36 meses - Macho` (306 cab); mai–ago = `13 a 24 meses - Macho` (393 cab). Total 699.

Cards: ΣI=699; ΣAN÷ΣAF=347,98; ΣAN÷ΣW=12,95 — todos batem.

## 5. Quirk relacionado (mesmo da p.4)

`Diárias_Categoria` busca vendas com `SUMIFS(Venda_Gado!I, Venda_Gado!CD, Diárias_Categoria!D, ...)` — CD é label texto, D é serial: não casa em Excel real. Mas em `Venda_Gado` existe `CO` = serial do 1º dia do mês (a chave correta, análoga ao `AO` de `Compra_Gado`). Confirma que a fórmula referencia a coluna errada e os caches vêm do gerador do modelo. Para recomputar: venda → bucket mês × categoria atribuída ao 1º dia do mês.

## 6. O que o Vision precisa para replicar

1. Ler `Venda_Gado` (tabela Lotes36, dados a partir da linha 10): D, H, I, J, K, W, AD, AF, AJ, AN, AO, AQ.
2. Filtrar período por `D` (Data Venda).
3. Cards: ΣI; ΣAN÷ΣAF; ΣAN÷ΣW.
4. Mensal: ΣI e AVG(AO) por mês de D.
5. Por empresa: AVG(AO) e AVG(AD) por AJ.
6. Slicers: H, AJ, D.
7. Todas as vendas desta fazenda são `Abate Machos`; as demais páginas de venda (Vivos oculta, Resumo) usam a mesma aba com outras fatias.
