# Página 12 — Relatório de Desembolso (CF × CV e por hectare)

- PDF: p.12 ("Relatório de Desembolso", período 01/01/2026 a 31/08/2026)
- PBIX: página `cfda0bb8f3f0c35ad828`, displayName "Desembolso" (segunda página com esse nome)
- Fonte: **`Desembolsos Realizados`** + `dCalendário` + `Cadastros` (área útil)
- Sem filtro de página.

**Status: reconciliado.**

---

## 1. O que a página exibe

- Slicers: **Data**, **Centro de Custos**, **Tipo de Custo**, **Plano de Contas** (mesmos da p.11).
- **Área** "Desembolso/ha/Mês": jan 365,17 | fev 191,73 | mar 639,57 | abr 1.145,56 | mai 1.861,91 | jun 856,42 | jul 908,07 | ago 1.773,15.
- **Coluna 100% empilhada** "Custos Fixos × Custos Variáveis" por mês: jan 66/34 | fev 95/5 | mar 89/11 | abr 59/41 | mai 56/44 | jun 26/74 | jul 37/63 | ago 21/79 (% CF / % CV).
- Cards: **Despesa Média Mensal** (R$ 542.877,51), **Desembolso Total** (R$ 4.343.020,07), **Relação CF x CV** ("52 : 48").

## 2. Bindings e semânticas

| Visual | Binding | Semântica |
|---|---|---|
| Área mensal | `dCalendário.Data` (mês) × medida `Desembolso/ha` | ΣN do mês ÷ **561** (ex.: jan 204.858,91/561 = 365,17 ✓) |
| Coluna 100% | mês × medidas `Custos Fixos` e `Custos Variáveis` | share de cada um sobre **(CF+CV) do mês** — outros tipos não entram |
| Card Relação CF x CV | medida `Relação CF x CV` | CF÷(CF+CV) : CV÷(CF+CV) do período → 51,51% : 48,49% → exibido "52 : 48" |
| Cards Total e Média | `Desembolso Total`, `Despesa Média Mensal` | idem p.11 |

## 3. Reconciliação (jan–ago/2026)

CF mensal: jan 94.217,49 | fev 77.171,25 | mar 134.006,95 | abr 113.430,43 | mai 119.527,95 | jun 56.114,37 | jul 56.337,33 | ago 40.935,41 — ΣCF = 691.741,18 ✓

CV mensal: jan 47.900,18 | fev 4.078,53 | mar 15.982,75 | abr 80.358,76 | mai 93.794,74 | jun 156.948,32 | jul 94.494,68 | ago 157.567,70 — ΣCV = 651.125,66 ✓

Shares mensais batem com os rótulos do PDF em todos os 8 meses. Relação do período: 691.741,18 ÷ 1.342.866,84 = 51,51% → "52 : 48" ✓.

Desembolso/ha mensal: série acima bate exato com ΣN_mês ÷ 561,0 (divisor igual ao do card da p.11 — **não** é 561,4).

## 4. Notas para o Vision

1. `Custos Fixos` = ΣN com `Tipo de Desembolso='Custos_Fixos_Mensais'`; `Custos Variáveis` idem `'Custos_Variáveis_Mensais'`. Compra de Gado, Investimentos e Impostos ficam fora do gráfico CF×CV mas entram no Desembolso Total.
2. O gráfico é 100% empilhado: normalizar CF/(CF+CV) por mês, não sobre o total geral.
3. Área útil = 561 — confirmado via TMDL: entidade `Área` lê `Cadastros` e casta `Área Útil (ha)` para Int64 (561,4→561).
4. Os dois cards compartilham as mesmas medidas da p.11 — no Vision dá para reutilizar o mesmo dataset.
