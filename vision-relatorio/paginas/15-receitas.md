# Página 15 — Relatório de Receitas (visão geral)

- PDF: p.15 ("Relatório de Receitas", período 01/01/2026 a 31/08/2026)
- PBIX: página `256583099c079ac5ef97`, displayName "Receitas" (primeira das duas páginas Receitas)
- Fonte: aba **`Receitas_Mensais`** + `dCalendário` + `Diárias` (denominador cab)
- Sem filtro de página.

**Status: reconciliado.**

---

## 1. O que a página exibe

- Slicers: Data, Centro de Custos, Tipo de Receita (`Descrição/Plano de Contas`), Empresa Pagante.
- Cards: **Faturamento/ha/Período** (R$ 9.183,25), **Faturamento Médio Mensal** (R$ 643.975,66), **Faturamento/cab.** (R$ 3.624,54), **Receita Total** (R$ 5.151.805,27).
- **Área** "Faturamento por Mês": jan 355.284,36 | fev 650.960,82 | **(sem março)** | abr 1.229.121,54 | mai 978.212,16 | jun 913.580,85 | jul 453.943,22 | ago 570.702,32.
- **Coluna** "Faturamento por Categoria" (`Descrição/Plano de Contas`): única barra "13 a 24 meses - Macho" = 5.151.805,27.

## 2. Aba `Receitas_Mensais`

Header na **linha 7**, dados a partir da linha 9 (a linha 8 repete os títulos dentro da tabela). Espelho de `Desembolsos Realizados`.

| Col | Campo | Uso |
|---|---|---|
| B | Data Prevista Recebimento | |
| C | **Data Recebimento** | eixo temporal |
| D | Status | "Pago" |
| E | Lançamento | "Realizado" |
| F | **Classificação de Receitas** | `Receitas_Venda_de_Gado` (eixo do gráfico "Tipo de Receita" da p.16) |
| G | **Descrição/Plano de Contas** | para receitas de gado = categoria dos animais |
| H | Centro de Custos | slicer |
| J | **Empresa Pagante** | comprador (eixo da pivot da p.16) |
| K, L | Quant., Valor Unitário | |
| M | Valor Total | bruto |
| N, O | Descontos, Acréscimos | |
| P | **` Valor Líquído`** (atenção: nome com espaço inicial no modelo) | valor agregado |
| S | Observação | nível 2 da pivot da p.16 |
| T | Cod. Movimentação | ponte com `Venda_Gado` |
| A, U, AD–AG, AJ | auxiliares (label mês-ano, serial 1º dia, ano) | |

## 3. Reconciliação (jan–ago/2026, Status=Pago)

9 lançamentos, todos `Receitas_Venda_de_Gado`, plano "13 a 24 meses - Macho", Σ Valor Líquido = **5.151.805,27** — igual ao total de vendas da p.6/7 (ΣM = ΣP neste dataset, sem descontos/acréscimos).

| Card | Fórmula | Valor |
|---|---|---|
| Receita Total | ΣP | 5.151.805,27 ✓ |
| Faturamento Médio Mensal | ΣP ÷ 8 | 643.975,66 ✓ |
| Faturamento/ha/Período | ΣP ÷ **561** | 9.183,25 ✓ |
| Faturamento/cab. | ΣP ÷ **rebanho médio diário** (Σ `Diárias!H` ÷ 243 dias = 1.421,37) | 3.624,54 ✓ |

**Refinamento do rebanho médio**: ΣH jan–ago = 345.392 animal-dias ÷ 243 dias = **1.421,366**. Essa média diária (e não a média das médias mensais, 1.421,48) é o denominador exato — 5.151.805,27 ÷ 1.421,366 = 3.624,54 ao centavo. Aplicar o mesmo em Tx. de Mortalidade/Consumo/Desfrute das páginas anteriores (valores arredondados não mudam: 13/1421,37 = 0,9146% → 0,91%; 699/1421,37 = 49,18% ✓).

**Quirk**: todas as receitas de 2026 estão classificadas em G = "13 a 24 meses - Macho", embora as vendas incluam 306 cabeças de 25-36m (p.3). O plano de contas da receita não replica a categoria real da venda — documentar, não "corrigir".

## 4. Checklist Vision

1. Ler `Receitas_Mensais` (linha 9+): C, D, F, G, H, J, M, P, S, T.
2. Filtrar período por C; valor agregado = P (líquido).
3. Cards: ΣP; ΣP÷nº meses; ΣP÷561; ΣP÷(Σ`Diárias!H`÷dias).
4. Séries: ΣP por mês de C; ΣP por G.
5. Ponte com `Venda_Gado` via T (Cod. Movimentação).
