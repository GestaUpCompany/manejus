# Página 10 — Consumo e Doações

- PDF: p.10 ("Consumo e Doações", período 01/01/2026 a 31/08/2026)
- PBIX: página `805a0c692cdf8f14bce6`, displayName "Consumo e Doações"
- Fonte: aba **`Mortes_Consumos`** (mesma da p.9) + `dCalendário` + `Diárias` (denominador da taxa)
- **Filtro de página**: `Mortes_Consumos.Morte/Consumo = 'Consumo'` (espelho do filtro 'Morte' da p.9)

**Status: reconciliado.**

---

## 1. O que a página exibe

- Slicers: **Data**, **Categoria**, **Raça** (a p.9 tinha Pasto em vez de Raça).
- 4 cards: **Total de Animais** (5), **@ Destinadas a Cons./Doação** (60), **R$ Destinadas a Cons./Doação** (R$ 23.903,00), **Tx. de Consumo e Doações** (0,35%).
- **Área** "Consumo/Doações no Mês": junho=4, julho=1.
- **Barra** "Consumo/Doação por Destino": `Causa Morte/Consumo` — Cantina=4, Funcionários=1 (o "destino" é a coluna Causa, rotulada de Destino).
- **Donut** "Consumo/Doação por Categoria": `13 a 24 meses - Macho` = 5 (100%).

## 2. Bindings PBIX → origem

Mesma aba `Mortes_Consumos` (mapa de colunas no doc da p.9). Layout quase idêntico à p.9.

| Visual | Binding | Semântica |
|---|---|---|
| Card Total de Animais | `Count(Categoria)` | linhas com P='Consumo' = 5 |
| Card @ Destinadas | medida `@ Destinadas a Cons./Doação` | **Σ ROUND(K,0) = 60** (ΣK crua = 57,67) |
| Card R$ Destinadas | medida `R$ Destinadas a Cons./Doação` | **Σ ROUND(M,0) = 23.903** (ΣM crua = 23.904,41) |
| Card Tx. de Consumo e Doações | medida `Tx. de Consumo e Doações` (mesmo nome que na p.9, sem alias diferente) | count ÷ rebanho médio = 5 ÷ 1.421,5 = **0,3517% → 0,35%** ✓ |
| Área mensal | `Data Mês` × `Count(Categoria)` | jun=4, jul=1 |
| Barra destino | `Causa Morte/Consumo` × `Count(Categoria)` | Cantina=4, Funcionários=1 |
| Donut categorias | `Categoria` × `Count(Categoria)` | 13-24m M = 5 (100%) |
| Slicers | `Data`(B), `Categoria`(E), `Raça`(H) | |

## 3. Dados na planilha (linhas de Consumo, 2026)

| Linha | Data | Categoria | Causa/Destino | Kg | @ (K) | R$ (M) |
|---|---|---|---|---|---|---|
| 22–25 | 01/06/2026 | 13-24m Macho | Cantina | 346 | 11,5333 | 4.985,36 (cada) |
| 35 | 01/07/2026 | 13-24m Macho | Funcionários | 346 | 11,5333 | 3.962,96 |

Reconciliação: n=5 ✓; ΣROUND(K)=5×12=60 ✓; ΣROUND(M)=4×4.985+3.963=23.903 ✓; taxa 5÷1421,5=0,35% ✓; causas e categorias ✓.

## 4. Confirmações estruturais importantes

1. **`Tx. de *` = evento ÷ rebanho médio do período** (média de `Diárias!H`): confirmado na p.9 (13→0,91%) e aqui (5→0,35%). A exceção `Tx. de Venda`/"Giro de Estoque" foi resolvida via `pbi-tools`: divide Σ vendas pelo Σ de saldos iniciais mensais da tabela `Resumo Estoque` (ano 2025 fixo), não pelo rebanho médio — ver `07-resumo-vendas.md` §5.
2. **As medidas de @ e R$ arredondam cada linha antes de somar**. Se o Vision somar as colunas cruas (K, M), vai divergir do PDF nos dois cards das duas páginas.
3. A mesma aba alimenta as duas páginas — no Vision pode ser um único dataset com filtro alternável, ou duas páginas com filtro fixo diferente.

## 5. Checklist Vision

1. Dataset `Mortes_Consumos` filtrado por `P='Consumo'` e período por B.
2. Cards: count; ΣROUND(K,0); ΣROUND(M,0); count ÷ rebanho médio.
3. Séries: count por mês; count por `Q` (rótulo "Destino"); count por `E`.
4. Slicers: B, E, H (Raça).
