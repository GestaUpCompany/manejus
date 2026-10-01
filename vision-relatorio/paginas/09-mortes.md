# Página 9 — Mortes

- PDF: p.9 ("Mortes", período 01/01/2026 a 31/08/2026)
- PBIX: página `6c9dfd91107458524055`, displayName "Mortes", 1280×720
- Fonte: aba **`Mortes_Consumos`** + `dCalendário` (por `B`, Data) + `Diárias` (denominador da taxa)
- **Filtro de página**: `Mortes_Consumos.Morte/Consumo = 'Morte'` (a mesma aba serve às duas páginas — consumo/doações na p.10 usa o valor 'Consumo')

**Status: reconciliado.**

---

## 1. O que a página exibe

- Slicers: **Data**, **Categoria**, **Causa Morte** (`Causa Morte/Consumo`), **Pasto** (`Local Fazenda (Pasto/Piquete)`).
- 4 cards: **Animais Mortos** (13 — binding `Min(Mortes_Consumos.Categoria)` com display "Animais Mortos"; a agregação real conta linhas), **Total de @ Perdidas** (90), **Total de R$ Perdidos** (R$ 37.398,00), **Tx. de Mortalidade** (0,91%).

> **Correção via TMDL**: não existe medida `Tx. de Mortalidade` no modelo — o card liga a medida `Mortes_Consumos.Tx. de Consumo e Doações` = `DIVIDE(COUNTA(Mortes_Consumos[Categoria]), [Rebanho Médio])` com display renomeado. O COUNTA conta linhas (eventos), e o filtro de página `Morte/Consumo='Morte'` é o que segrega. A mesma medida serve às duas páginas.
- **Área** "Mortes no Mês": contagem por mês — só jun(9)/jul(2)/ago(2) aparecem.
- **Coluna** "Mortes por Causa": Desconhecida=10, Acidente Ofídico=2, Infecção=1.
- **Donut** "Mortes por Categoria": 5-12m M=6 (46,15%), 0-4m M=4 (30,77%), 13-24m M=3 (23,08%).

## 2. Aba `Mortes_Consumos`

Header na **linha 6**, dados a partir da linha 7. 31 linhas no arquivo (13 mortes em 2026 + 5 consumos em 2026 + 13 em 2025).

| Col | Campo | Uso |
|---|---|---|
| A | (aux) | serial — a data usada pelos COUNTIFS de `Diárias_Categoria` |
| B | Data | serial — eixo temporal do pbix (dCalendário) |
| C, D | Nº ID 1, Nº ID 2 | identificação do animal |
| E | Categoria | donut e slicer |
| F | Sexo | M/F |
| G | Sistema de Produção | |
| H | Raça | |
| I | Peso Morte (kg) | kg |
| J | Rendimento Carcaça (%) | ex. 0,5 |
| K | Peso Morte (@) | **card "Total de @ Perdidas" = ΣK = 90** |
| L | Valor (@) | R$/@ de referência |
| M | Valor Animal Morto (R$/cab) | **card "Total de R$ Perdidos" = ΣM = 37.398,00** |
| N, O | Nutrição Anterior/Atual | |
| P | Morte/Consumo | **chave do filtro de página** ("Morte" aqui, "Consumo" na p.10) |
| Q | Causa Morte/Consumo | eixo do gráfico de causas |
| R | Local Fazenda (Pasto/Piquete) | slicer "Pasto" |
| S, T, U | Origem, Lote, Observação | |
| AE–AH | (aux) | mesmo padrão de `Compra_Gado`: seq, código MMYYYY, serial 1º dia do mês, dias no mês |

Nota de dados: todas as mortes/consumos de 2026 estão datadas no **dia 1 do mês** (01/06, 01/07, 01/08) — lançamento mensal agregado, coerente com a atribuição por mês em `Diárias_Categoria`.

## 3. Bindings PBIX → origem

| Visual | Binding | Semântica |
|---|---|---|
| Card Animais Mortos | `Count(Mortes_Consumos.Categoria)` (agg 5) | contagem de linhas com P='Morte' = 13 |
| Card @ Perdidas | `Sum(Peso Morte (@))` | **soma com arredondamento por linha**: Σ ROUND(K,0) = 90 (ΣK crua = 87,27 ≠ PDF) |
| Card R$ Perdidos | `Sum(Valor Animal Morto (R$/cab))` | idem: Σ ROUND(M,0) = 37.398 (ΣM crua = 37.396,77 ≠ PDF) |
| Card Tx. de Mortalidade | medida `Tx. de Consumo e Doações` (nome interno; display "Tx. de Mortalidade") | **mortes ÷ rebanho médio do período** = 13 ÷ 1.421,5 = **0,91%** ✓ |
| Área mensal | mês de `dCalendário.Data` × `Count(Categoria)` | jun=9, jul=2, ago=2 |
| Coluna causas | `Causa Morte/Consumo` × `Count(Categoria)` | Desc.=10, Acid. Ofídico=2, Infecção=1 |
| Donut categorias | `Categoria` × `Count(Categoria)` | 5-12m M=6, 0-4m M=4, 13-24m M=3 |
| Slicers | `Data`(B), `Categoria`(E), `Causa`(Q), `Local`(R) | |

Todos os visuais herdam o filtro de página `P='Morte'`. Os cards de @ e R$ têm ainda filtro "Advanced" próprio (provavelmente "não é branco").

## 4. Reconciliação

| Item | Planilha | PDF |
|---|---|---|
| Mortes jan–ago | 13 linhas | 13 ✓ |
| Por mês | jun=9, jul=2, ago=2 | ✓ |
| Por causa | Desc.=10, Ofídico=2, Infecção=1 | ✓ |
| Por categoria | 5-12m=6, 0-4m=4, 13-24m=3 | ✓ |
| @ perdidas | Σ ROUND(K,0) = 90 (ΣK crua = 87,27) | 90 ✓ |
| R$ perdidos | Σ ROUND(M,0) = 37.398,00 (ΣM crua = 37.396,77) | R$ 37.398,00 ✓ |
| Tx. mortalidade | 13 ÷ 1421,5 = 0,9145% | 0,91% ✓ |

Consistente com `Diárias_Categoria` (p.3): Mortes jan–ago = 13 (5-12m:6, 0-4m:4, 13-24m:3) ✓.

**Achado bônus**: a taxa usa `rebanho médio = média de Diárias!H` (1.421,5) — o mesmo denominador da p.3. Isso sugere que a família `Tx. de *` do modelo divide o evento pelo rebanho médio do período. O "Giro de Estoque" da p.7 (5,02%) **não** segue esse padrão (vendas÷rebanho médio daria 49,17% — que é a "Tx. de Desfrute"); fórmula real extraída via pbi-tools: `Σ vendas ÷ Σ 'Resumo Estoque'[Saldo Inicial]` (Σ SI mensal de 2025, fixo), ver `07-resumo-vendas.md` §5.

## 5. O que o Vision precisa para replicar

1. Ler `Mortes_Consumos` (dados linha 7+): B, E, K, M, P, Q, R.
2. Filtrar `P='Morte'` e período por B.
3. Cards: contagem, **Σ de ROUND(K,0)** e **Σ de ROUND(M,0)** — arredondar cada linha antes de somar, senão diverge do PDF (87,27 → 90; 37.396,77 → 37.398); e count ÷ rebanho médio (média de `Diárias!H` no período — mesma medida da p.3).
4. Séries: count por mês de B; count por Q; count por E.
5. Slicers: B, E, Q, R.
