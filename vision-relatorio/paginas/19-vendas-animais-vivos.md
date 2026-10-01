# Página oculta — Vendas Animais Vivos

- PDF: não aparece no PDF de referência (página oculta no relatório)
- PBIX: página `ed49a32f0871f6e90558`, displayName "Vendas Animais Vivos", 1280×720, `visibility: HiddenInViewMode`, fundo "Venda Vivo.jpg"
- Fonte: mesma aba **`Venda_Gado`** (tabela `Lotes36`) + `dCalendário`
- Filtro que a define: `Tipo de Venda = 'Comercial Vivo'` via slicer — **a página não carrega filtro gravado** (`page.json` sem `filterConfig`, visuais sem `filters`). A separação Abate × Vivos depende exclusivamente da seleção do slicer `Tipo de Venda` (modo Dropdown). Na Guanabara a página renderiza vazia (todas as vendas são `Abate Machos`).

**Status: estrutura mapeada e cruzada com dados reais da Fazenda Aruã** (19 vendas `Comercial Vivo`). Sem PDF para reconciliação valor a valor.

---

## 1. O que a página exibe

Espelho quase exato da p.6 (Abate), com trocas pontuais:

| Visual | Binding | Equivalente na p.6 |
|---|---|---|
| Card N° de Cabeças | `Sum(Venda_Gado.Quant. Cab. Vendidas)` | idêntico |
| Card Média R$/@ | medida `Venda_Gado.Média R$/@` | idêntico (ΣAN ÷ ΣAF) |
| Card Média R$/kg | medida `Venda_Gado.Média R$/kg` | idêntico (ΣAN ÷ ΣW) |
| **Area chart** mensal | `Sum(Quant. Cab. Vendidas)` por mês | era combo coluna+linha na p.6 |
| Combo por **Categoria** | coluna `Sum(Quant)` + linha `Preço Venda Final (R$/@)` (display "Média R$/@", provável AVG — mesmo padrão do queryRef mentiroso da p.6) | era por Frigorífico na p.6 |
| Slicers | `dCalendário.Data`, `Venda_Gado.Tipo de Venda`, `Venda_Gado.Frigorífico/Comprador` | idênticos |

A troca dos combos faz sentido de domínio: em venda a pé o que interessa é categoria vendida e comprador (fazenda/pessoa física), não rendimento de carcaça — embora as colunas de abate (AD/AF) sigam preenchidas no modelo mesmo para vivos.

## 2. Cruzamento com a Fazenda Aruã

Fonte: `Vision Versão Slim - Gesta'Up 2025 - v. 09.06.25 - Faz Aruã.xlsm`, aba `Venda_Gado`. Mesmo mapa de colunas da Guanabara (D=Data Venda, H=Tipo, I=Cab, J=Categoria, AJ=Comprador, AN=Valor Líquido, AO=R$/@), **deslocado +1 linha**: cabeçalho na linha 10, dados da 11 — parser deve localizar o header dinamicamente, não fixar linha.

`Tipo de Venda` na Aruã: **Abate Fêmeas 25, Abate Machos 1, Comercial Vivo 19** — primeiro valor novo observado. Confirma que a coluna aceita mais do que os tipos presentes na Guanabara.

### Dados "Comercial Vivo" (19 lotes, 2024–2026)

| Ano | Lotes | Cabeças | Categorias |
|---|---|---|---|
| 2024 | 8 | 1.777 | 5-12m F/M, >36m F |
| 2025 | 8 | 1.564 | 5-12m F/M |
| 2026 | 3 | 854 | 0-4m F/M |
| **Total** | **19** | **4.195** | |

Consolidado do período todo: ΣAN = **R$ 14.217.145,55**, ΣAF = 37.332,2 @ → **R$/@ = 380,83** (razão de somas), ΣW = 1.119.965 kg → **R$/kg PV = 12,69**.

Compradores por cabeças: Pecuária Locks LTDA 970, "Pecuária Locks" 704 (duplicidade de grafia — o modelo **não normaliza** o comprador; Vision precisa de cadastro ou tratamento de alias), Fazenda 4R 544, Agropecuária João Correa 549, Novapec 513, Faz. Primavera 450, Leopoldo Nigro 141, Agropecuaria Crestani 107, Guilherme Corral 50, Odilon Fernando Waltrick 17, "Odilon Fernando" 150 (outra duplicidade).

Achados de domínio:

- Compradores de vivo são **fazendas e pessoas físicas**, não frigoríficos — a coluna `AJ` é polissêmica (nome "Frigorífico/Comprador"). No slicer da página ela aparece como "Empresa".
- Vendas de vivo concentram-se nas categorias jovens (0-4m e 5-12m), com preço R$/@ muito acima do abate (380 vs 348 na Guanabara) — boi magro vale mais por @ que boi gordo.
- Preço R$/@ por lote varia de 188 (fêmea >36m, descarte) a 511 (bezerros 0-4m) — a faixa de preço é muito mais ampla que no abate, e a categoria é o principal driver. É exatamente o que o combo por Categoria da página quer mostrar.

## 3. O que o Vision precisa para replicar

1. Mesma leitura da p.6 (Lotes36, localizar header dinamicamente).
2. Filtro fixo `Tipo de Venda = 'Comercial Vivo'` (o produto não replica a dependência de slicer solto; a página é dedicada).
3. Cards: ΣI; ΣAN ÷ ΣAF; ΣAN ÷ ΣW.
4. Série mensal: ΣI por mês de `D`.
5. Combo: ΣI por `J` (Categoria) + AVG(AO) por `J`.
6. Tratar duplicidade de nomes de comprador (`AJ`) na agregação/slicer.
