# Página 17 — Fluxo de Caixa

- PDF: p.17 ("Fluxo de Caixa", período 01/01/2026 a 31/08/2026)
- PBIX: página `961510ec96b61b54dbc3`, displayName "Fluxo de Caixa"
- Fontes: `Receitas_Mensais` (entradas), `Desembolsos Realizados` (saídas), `dMascaraFluxo` (dimensão com os 5 rótulos de linha), `dCalendário`, seed de `Cadastros` (saldo de caixa inicial)
- Sem filtro de página; slicer de Data apenas.

**Status: reconciliado.**

---

## 1. O que a página exibe

- 4 cards no topo: **Saldo Inicial** (R$ 0,00 — medida `Diárias_Categoria.Saldo Inicial Janeiro`, display "Saldo Inicial"), **Receita Total 2026** (R$ 5.151.805,27), **Saídas 2026** (R$ 4.343.020,07), **Saldo** (R$ 808.785,20).
- **Matriz** "Fluxo de Caixa Realizado": linhas `dMascaraFluxo.Transação` × colunas mês, medida `FC Saldo`.

## 2. Grade reconciliada (R$)

| Transação | jan | fev | mar | abr | mai | jun | jul | ago |
|---|---|---|---|---|---|---|---|---|
| Saldo Inicial | 0,00 | 150.425,45 | 693.823,49 | 335.026,05 | 921.486,73 | 855.168,64 | 1.288.300,49 | 1.232.818,60 |
| Entrada | 355.284,36 | 650.960,82 | (vazio) | 1.229.121,54 | 978.212,16 | 913.580,85 | 453.943,22 | 570.702,32 |
| Saída | 204.858,91 | 107.562,78 | 358.797,44 | 642.660,86 | 1.044.530,25 | 480.449,00 | 509.425,11 | 994.735,72 |
| Resultado Período | 150.425,45 | 543.398,04 | −358.797,44 | 586.460,68 | −66.318,09 | 433.131,85 | −55.481,89 | −424.033,40 |
| Saldo Final | 150.425,45 | 693.823,49 | 335.026,05 | 921.486,73 | 855.168,64 | 1.288.300,49 | 1.232.818,60 | 808.785,20 |

## 3. Semânticas (todas verificadas)

- **Entrada** = Σ `Receitas_Mensais.P` (Valor Líquido) no mês da Data Recebimento (C). Março = vazio (sem recebimento — mostra célula vazia, não zero).
- **Saída** = Σ `Desembolsos Realizados.N` no mês da Data Pagamento (C).
- **Resultado Período** = Entrada − Saída (março = −358.797,44: entrada vazia conta como 0).
- **Saldo Inicial** = Saldo Final do mês anterior; janeiro = saldo de caixa inicial = **0**. **Correção via TMDL**: o valor NÃO vem de `Cadastros` — a medida `Diárias_Categoria.Saldo Inicial Janeiro` é a constante **0** hardcoded, e `FC Saldo Inicial` tem o ano 2026 pinado (`IF(Mes=1 && Ano=2026, [Saldo Inicial Janeiro], ... + FC acumulado de datas < mínimo com YEAR>=2026)`). Em outra fazenda o seed precisaria ser input/parâmetro, pois o modelo não o lê da planilha.
- **Saldo Final** = SI + Resultado.
- Card "Saldo" = Saldo Final do último mês do período = 808.785,20.

## 4. Notas para o Vision

1. O bloco de caixa diário da aba `Diárias` (colunas AJ+) está **zerado** nesta cópia — o relatório não depende dele; o FC é derivado de Receitas + Desembolsos com saldo encadeado.
2. `dMascaraFluxo.Transação` é uma dimensão de rótulos (5 linhas fixas) — no Vision, basta uma tabela com essas 5 linhas na ordem: Saldo Inicial, Entrada, Saída, Resultado Período, Saldo Final.
3. `FC Saldo` é uma medida SWITCH por tipo de linha; em código: por mês, computar entrada, saída, resultado, e encadear saldos.
4. A aba `FC_Mensal` da planilha existe mas é uma visão **diária de um único mês selecionável** (não a grade anual) — não é a fonte desta página.
5. Seed: no pbix é a constante `[Saldo Inicial Janeiro] = 0` com ano 2026 pinado no DAX. No Vision, tratar como parâmetro/input por fazenda (o modelo original não lê `Cadastros`).
