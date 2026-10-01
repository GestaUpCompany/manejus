# Página 8 — Nascimentos

- PDF: p.8 ("Nascimentos", período 01/01/2026 a 31/08/2026)
- PBIX: página `7dc3d855497a0e0a2de9`, displayName "Nascimentos", 1280×720
- Fonte: aba **`Nascimentos`** + `dCalendário` (relacionamento por Data de Nascimento, coluna B)

**Status: reconciliado.** Página mais simples do relatório: 2 registros no período.

---

## 1. O que a página exibe

- Slicers: **Sexo**, **Categoria**, **Data**.
- 2 cards: **N° Total de Nascimento** (2), **Peso Médio Nasc. (kg)** (40,00).
- **Combo mensal**: N° de Nascimentos (coluna) × Peso Médio ao Nascimento kg (linha) — só junho e julho aparecem.
- **Gráfico de colunas** "Sexo/Raça": eixo Raça × Sexo, Y = Quant. → M/Nelore = 2.
- **Donut Sexo**: M = 2 (100%).

## 2. Aba `Nascimentos`

Header na **linha 8**, dados a partir da linha 9 (nesta cópia: 3 linhas, rows 10–12; 1 em 2025 com quant 6, 2 em 2026).

| Col | Campo | Conteúdo |
|---|---|---|
| B | Data de Nascimento | serial — eixo temporal |
| C | Quant. | nº de bezerros do registro |
| D | Peso de Nascimento (kg) | kg/cab |
| E | Peso de Entrada (@) | |
| F | Total @ | |
| G | Categoria | sempre "0 a 4 meses" nos dados — a categoria de nascimento |
| H | Sexo | M / F |
| I | Raça | Nelore etc. |
| J–O | Carimbo, Idade, Local/Setor, IDs Matriz/Bezerro | rastreabilidade — não usados na página |

## 3. Bindings PBIX → origem

| Visual | Binding | Cálculo |
|---|---|---|
| Card total | `Sum(Nascimentos.Quant.)` | ΣC = 2 |
| Card peso médio | `Avg(Nascimentos.Peso de Nascimento (kg))` | AVG(D) = 40,00 |
| Combo mensal | mês de `dCalendário.Data` × `Sum(Quant.)` + `Avg(Peso Nasc.)` | jun=1/jul=1, 40,00 |
| Colunas Sexo/Raça | `Raça` (eixo 1) × `Sexo` (eixo 2) × `Sum(Quant.)` | M/Nelore = 2 |
| Donut | `Sexo` × `Sum(Quant.)` | M = 2 (100%) |
| Slicers | `Sexo` (H), `Categoria` (G), `dCalendário.Data` (B) | |

O combo tem **filtros de visual tipo "Advanced"** sobre `Sum(Quant.)` e `Avg(Peso)` — na prática omitem meses sem nascimento (o gráfico mostra só jun/jul, não jan–ago inteiro). Reproduzir como "exibir apenas meses com dados".

## 4. Reconciliação

| Item | Planilha | PDF |
|---|---|---|
| Total nascimentos jan–ago | 2 | 2 ✓ |
| Peso médio nascimento | AVG(40, 40) = 40,00 | 40,00 ✓ |
| Por mês | jun=1, jul=1 | ✓ |
| Sexo | M = 2 (100%) | ✓ |
| Raça | Nelore = 2 | ✓ |
| Categoria | "0 a 4 meses - Macho" | (slicer em Todos) |

Consistente com `Diárias_Categoria` (p.3): Nascimentos jan–ago = 2 na matriz de movimentação ✓.

## 5. O que o Vision precisa para replicar

1. Ler `Nascimentos` (dados da linha 9+): B, C, D, G, H, I.
2. Filtrar por B no período.
3. ΣC (card/donut/coluna), AVG(D) — média simples por registro, não ponderada pela Quant. (neste caso idêntico; registre a semântica como AVG por linha).
4. Mensal: ΣC e AVG(D) por mês de B, exibindo só meses com dados.
5. Slicers: G, H, B.
