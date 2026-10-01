# Página 16 — Relatório de Receitas (por tipo e empresa)

- PDF: p.16 ("Relatório de Receitas", período 01/01/2026 a 31/08/2026)
- PBIX: página `7c0195ad6031139abe8e`, displayName "Receitas" (segunda página)
- Fonte: **`Receitas_Mensais`** + `dCalendário`
- Sem filtro de página.

**Status: reconciliado.**

---

## 1. O que a página exibe

- Slicers: Data, Centro de Custos, Tipo de Receita, Empresa Pagante (mesmos da p.15).
- **Coluna** "Faturamento/ha/Mês": jan 633,31 | fev 1.160,36 | abr 2.190,95 | mai 1.743,69 | jun 1.628,49 | jul 809,17 | ago 1.017,29 (sem março — mês sem receita some do eixo).
- **Tabela/pivot**: `Empresa Pagante → Observação → Data`, valor = Σ ` Valor Líquido`: Agra 2.638.551,99 | Frigorífico Estrela 961.949,06 | Frigorífico Vale Company 1.551.304,22 | Total 5.151.805,27.
- **Coluna** "Faturamento por Tipo de Receita" (`Classificação de Receitas`, col F): única barra `Receitas_Venda_de_Gado` = 5.151.805,27.
- Mesmos 4 cards da p.15: 9.183,25 / 643.975,66 / 3.624,54 / 5.151.805,27.

## 2. Bindings PBIX

| Visual | Binding | Semântica |
|---|---|---|
| Coluna mensal | `dCalendário.Data` (mês) × medida `Faturamento/ha/Período` | ΣP do mês ÷ 561 — verificado: jan 355.284,36/561 = 633,31; abr 1.229.121,54/561 = 2.190,95; ago 570.702,32/561 = 1.017,29 ✓ |
| Pivot | `Empresa Pagante → Observação → Data` × `Sum( Valor Líquido)` | totais por comprador ✓ (Observação está vazia nas 9 linhas de 2026 — o nível colapsa) |
| Coluna tipo | `Classificação de Receitas` × `Receita Total` | F = `Receitas_Venda_de_Gado`, 100% |
| Cards | `Receita Total`, `Faturamento Médio Mensal`, `Faturamento/ha/Período`, `Faturamento/cab.` | idem p.15 |

## 3. Checklist Vision

1. Mesmo dataset da p.15; Fat/ha mensal = ΣP_mês ÷ 561.
2. Pivot 3 níveis: J (empresa) → S (observação) → C (data). Quando S é vazio, o nível fica vazio/colapsa — tratar.
3. Gráfico de tipo usa F (`Classificação de Receitas`), não G — F é a classificação macro ("Receitas_Venda_de_Gado"), G é o plano/categoria.
