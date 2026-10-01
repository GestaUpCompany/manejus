# Página 11 — Relatório de Desembolso (visão geral)

- PDF: p.11 ("Relatório de Desembolso", período 01/01/2026 a 31/08/2026)
- PBIX: página `dc3edfc9dcebf773eed4`, displayName "Desembolso" — **atenção: existem duas páginas "Desembolso"**; esta é a que tem pivot + donut por tipo (a outra, `cfda0bb8f3f0c35ad828`, é a p.12 do PDF com CF×CV e desembolso/ha mensal)
- Fonte: aba **`Desembolsos Realizados`** + `dCalendário` + `Diárias` (denominador do custo diário)
- Sem filtro de página.

**Status: reconciliado.**

---

## 1. O que a página exibe

- Slicers: **Data**, **Centro de Custos**, **Tipo de Custo** (`Tipo de Desembolso`), **Plano de Contas**.
- Cards: **Desembolso/ha/Período** (R$ 7.741,57), **Despesa Média Mensal** (R$ 542.877,51), **Custo Diária/cab** (R$ 12,57), **Desembolso Total** (R$ 4.343.020,07).
- **Área** "Desembolso Mensal R$": jan 204.858,91 | fev 107.562,78 | mar 358.797,44 | abr 642.660,86 | mai 1.044.530,25 | jun 480.449,00 | jul 509.425,11 | ago 994.735,72.
- **Matriz**: linhas `Tipo de Desembolso → Plano de Contas → Data Pagamento`, coluna `Tipo de Desembolso`, valor Σ `Valor Total`.
- **Donut** "% por Tipo de Custos": Compra de Gado 63,62% | Custos Fixos 15,93% | Custos Variáveis 14,99% | Investimentos 5,46% | Impostos ~0% (164,31, sem rótulo visível).

## 2. Aba `Desembolsos Realizados`

Tabela estruturada `Tabela1`, header na **linha 7**, dados a partir da linha 8 (824 linhas com tipo nesta cópia).

| Col | Campo | Uso |
|---|---|---|
| A | (aux) | label "mês-ano" do Data Pagamento (VLOOKUP em `Diárias_Categoria`) |
| B | Data Vencimento | serial — idêntica a C em todos os registros desta fazenda |
| C | **Data Pagamento** | eixo temporal (nível fino da pivot + vínculo com dCalendário) |
| D | Status | "Pago" em todos os registros do período |
| E | Lançamento | "Realizado" |
| F | **Tipo de Desembolso** | `Compra_de_Gado`, `Custos_Fixos_Mensais`, `Custos_Variáveis_Mensais`, `Impostos_e_Taxas`, `Investimentos_e_Estruturação` |
| G | **Plano de Contas** | nível 2 da pivot |
| H | Centro de Custos | slicer (só "Faz. Nova Guanabara" nesta fazenda) |
| I | Item | descrição |
| J, K | Quant., Valor Unitário | |
| L, M | Descontos, Acréscimos | |
| N | **Valor Total** | valor agregado em todos os visuais |
| O, P, Q, R, S | Fornecedor, Parcela, N° Comprovante, Cód. Movimentação, Banco | R é a chave que liga a `Compra_Gado`/`Venda_Gado` |
| T | (aux) | label "mês-ano" do Data Vencimento |
| AC–AE | (aux) | seq., código MMYYYY, data auxiliar |

## 3. Bindings e reconciliação

| Visual | Binding | Semântica | Valor |
|---|---|---|---|
| Card Desembolso Total | medida `Desembolso Total` | ΣN no período (Status=Pago) | 4.343.020,07 ✓ (560 linhas) |
| Card Despesa Média Mensal | medida `Despesa Média Mensal` | ΣN ÷ meses do período = ÷8 | 542.877,51 ✓ |
| Card Desembolso/ha/Período | medida `Desembolso/ha` | ΣN ÷ **561 ha** | 7.741,57 ✓ |
| Card Custo Diária/cab | medida `Custo Diária/cab` | ΣN ÷ **Σ `Diárias!H` (animal-dias)** = ÷345.392 | 12,5742 → 12,57 ✓ |
| Área mensal | `dCalendário.Data` (mês) × `Sum(Valor Total)` | ΣN por mês de Data Pagamento | série exata ✓ |
| Donut | `Tipo de Desembolso` × `Sum(Valor Total)` | share do total | 63,62/15,93/14,99/5,46% ✓ |
| Pivot | Tipo → Plano de Contas → Data Pagamento | ΣN | totais por tipo batem ✓ |

**Nota sobre a área — resolvida via TMDL**: `Cadastros!Q17` = 561,4 ha, mas a entidade `Área` do modelo lê `Cadastros` (skip 14, promove, mantém só a coluna "Área Útil (ha)", remove linhas finais) e aplica **`TransformColumnTypes(..., Int64.Type)`** — o cast trunca 561,4 → **561**. Todas as medidas `/ha` (`Desembolso/ha`, `Custeio/ha`, `Faturamento/ha`, `Produção de @/ha`, `UA/ha`) dividem por `SUM('Área'[Área Útil (ha)])` = 561. Reproduzir com o cast a inteiro, não com o valor decimal.

**Detalhe de granularidade**: o mês do gráfico vem do mês da Data Pagamento — confirmado pela label auxiliar `A` (VLOOKUP de C), que reproduz a série do PDF com precisão de centavo.

## 4. Totais por Tipo e Plano de Contas (jan–ago/2026, Status=Pago)

| Tipo | Total |
|---|---|
| Compra_de_Gado | 2.763.028,00 |
| Custos_Fixos_Mensais | 691.741,18 |
| Custos_Variáveis_Mensais | 651.125,66 |
| Investimentos_e_Estruturação | 236.960,92 |
| Impostos_e_Taxas | 164,31 |
| **Total** | **4.343.020,07** |

Principais planos de contas: CF — Manut. Máquinas 264.056,06; Terceirizados 165.644,33; Mão de Obra 139.292,59; Consultoria 31.025,00. CV — Insumos Nutrição 578.360,35; Medicamentos/Vacinas 26.194,00; Fretes 14.895,08; Combustíveis 13.691,87. Investimentos — Benfeitorias Sede 138.715,89; Cercas 63.875,03; Implementos 30.000,00.

## 5. Regra de apresentação (decisão do usuário)

**Não abreviar valores monetários nos rótulos de dados** — usar sempre o valor completo em pt-BR (`R$ 204.858,91`, `R$ 1.044.530,25`), nunca "R$ 205 mil" ou "R$ 1,04 mi". Vale para esta página e para todas as demais do relatório.

## 6. Checklist Vision

1. Ler `Desembolsos Realizados` (linhas 8+): C, D, F, G, H, N, R.
2. Filtrar período por C (Data Pagamento); status 'Pago' (verificar se modelo filtra ou se a fonte só traz realizados).
3. Cards: ΣN; ΣN÷nº de meses; ΣN÷561; ΣN÷Σ`Diárias!H` do período.
4. Séries: ΣN por mês; share por F; pivot F → G → C.
5. Relação com `Compra_Gado`/`Venda_Gado` via `Cod. Movimentação` (col R) para drill futuro.
