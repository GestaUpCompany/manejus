# Análise da planilha fonte e do PBIX — Relatório Vision

Fontes:
- Planilha: `Vision Versão Slim - Gesta'Up 2025 - v. 09.06.25 - Modelo Novo - Faz. Guanabara.xlsm` (raiz do repo, não commitada)
- PBIX: `Relatorio Vision - Guanabara II 2026.pbix` (raiz do repo, não commitado)
- PDF de referência documentado em `vision-relatorio/ANALISE_MODELO_PDF.md`

Este arquivo é a especificação de dados do relatório: de onde sai cada número. Junto com a análise do PDF (que define a forma), alimenta a futura infra de geração de PDF do Vision a partir da planilha.

---

## 1. Planilha — passada geral

### Estatísticas

- 41 abas
- ~2.181.942 células populadas
- ~1.567.821 fórmulas (a planilha é majoritariamente um motor de cálculo, não uma tabela de dados)

Distribuição das principais funções usadas:

| Função | Ocorrências | Papel provável |
|---|---|---|
| IFERROR | 1.080.229 | blindagem de lookups e divisões |
| SUMIFS | 138.620 | agregações por critério (mês, categoria, plano de contas) |
| IF | 112.360 | lógica condicional |
| COUNTIFS | 36.520 | contagens por critério |
| YEAR | 23.726 | chave de período |
| VLOOKUP | 19.476 | lookups de cadastros |
| SUM | 10.155 | totais |
| MONTH | 2.261 | chave de período |
| EDATE | 1.319 | aritmética de meses |
| DAY / SUMIF / SUBTOTAL / IFS / HLOOKUP / PV | <1.000 cada | pontuais |

### Arquitetura da planilha em camadas

**Camada 1 — Cadastros e referências** (listas de domínio, alimentam dropdowns e lookups):

- `Cadastros`: categorias idade-sexo (0-4m, 5-12m, 13-24m, 25-36m, 37+, M/F, Touro), sexo, raças, causas de morte, doenças, touros, sistemas de produção, setores, equipe, tipos de compra, tipos de venda, meses, anos pecuários.
- `Centro de Custos`: espinha dorsal financeira. Divisão de Custos (Compra_de_Gado, Custos_Fixos_Mensais, Custos_Variáveis_Mensais, Impostos_e_Taxas, Investimentos_e_Estruturação, Transações_Financeiras, Receitas_*), plano de contas, centro de custos, bancos, formas de comprovante.
- `Compradores`, `Fornecedores`.

**Camada 2 — Fatos (lançamentos)**:

- `Compra_Gado`: data compra/pagamento, status, código de movimentação, tipo compra, nº cabeças, categoria, fornecedor, destino do gado, corretor, peso total fazenda, peso médio, rendimento de carcaça, peso médio em arrobas, R$/@, R$/cab, total R$.
- `Venda_Gado`: lote, data venda/pagamento, status, código de movimentação, tipo de venda, quantidade de cabeças, categoria, sexo, data de entrada, pesos de entrada e abate (kg e @, ponderados), rendimento, campos de receita/valor, empresa pagante.
- `Desembolsos Realizados`: o ledger financeiro. Data vencimento/pagamento, status, lançamento, tipo de desembolso (divisão), plano de contas, centro de custos, item, quantidade, valor unitário, descontos, acréscimos, valor total, fornecedor. Compras de gado também geram linhas aqui (compra, comissão e frete como lançamentos separados).
- `Receitas_Mensais`: data prevista/efetiva de recebimento, status, lançamento, classificação de receitas, descrição/plano de contas, centro de custos, descrição dos itens, empresa pagante, quantidade, valor unitário, valor total, descontos, acréscimos.
- `Contas a Receber` (previsão), `Desembolsos Previstos`, `Contas a Pagar - Decisão`, `Financiamentos`.
- Rebanho: `Nascimentos`, `Mortes_Consumos` (data, ID, categoria, sexo, sistema produtivo, raça, peso, rendimento, @, valor/@, tipo morte/consumo, causa/destino), `Tropa`, `Desmama`, `Prenhez por Touro`, `IATF`, `Inseminador`, `Diárias` (lançamentos diários de custo), `Diárias_Categoria` (agregação de custo/rebanho por categoria e dia).

**Camada 3 — Agregação do rebanho**:

- `Estoque`: auditoria mensal por categoria — saldo inicial, peso vivo, rendimento de carcaça, @ inicial, valor @, compras, vendas, mortes e demais movimentações. Tábua-mestra das páginas de rebanho do relatório.
- `Evolução_Rebanho`: transferências evolutivas entre categorias (mudança de faixa etária).
- `Estoque Mensal`, `Diárias_Categoria` (rebanho médio por categoria, base de custo diário e UA/ha).

**Camada 4 — Consolidação financeira e análises**:

- `Orçamento Mensal`, `Fechamento Mensal`, `Consolidado Mensal`, `Consolidado Mensal Resumo`
- `FC_diário` (~710 mil fórmulas, projeção dia a dia), `FC_Mensal`, `FC_Anual`
- `Pagar_Receber`, `Meta_Mensal`, `Investimentos`, `Levantamento Patrimonial`
- `Análise Plano de Contas`, `Análise Agrupamentos`, `DGR`, `Relatórios`

### Convenções úteis para o parse

- Datas nas abas de fatos estão em serial Excel; coluna A costuma trazer o label `mês-ano` calculado.
- KPIs de resumo ficam em células fixas no topo das abas (linhas ~5-6), o que permite validar número a número contra o PDF.
- As abas de fato seguem formato de tabela com cabeçalho na linha inicial e linhas de lançamento abaixo.

---

## 2. PBIX — estrutura interna

### Formato

O `.pbix` é um pacote ZIP no formato novo (PBIR, report em JSON declarativo). Conteúdo relevante:

```text
Report/definition/report.json
Report/definition/pages/pages.json          (ordem das páginas)
Report/definition/pages/<page-id>/page.json (displayName, visibilidade)
Report/definition/pages/<page-id>/visuals/<visual-id>/visual.json
DataModel                                   (blob ~1,7 MB com o modelo semântico)
DiagramLayout, SecurityBindings, StaticResources
```

Cada `visual.json` declara `visual.visualType` e `visual.query.queryState.<Role>.projections[]`, onde cada projeção carrega `field` (Column, Measure ou Aggregation), `queryRef` (`Entidade.Propriedade`), `nativeQueryRef` e `displayName`. Ou seja: os bindings dizem exatamente qual tabela e qual campo/medida alimenta cada visual — não é necessário deduzir.

### Páginas (21 no modelo)

| # | ID | Título |
|---|---|---|
| 1 | 0d6af8c4e817ea2557d3 | Capa |
| 2 | fd4f8e2c091c6e7e6afc | Auditoria Mensal |
| 3 | e0e0a302c88cb14de1ee | Auditoria Período |
| 4 | ef94e07807bf0e263fb3 | Compra Animais |
| 5 | d18b6816f2dbdf07aaae | Resumo de Compras |
| 6 | ed49a32f0871f6e90558 | Vendas Animais Vivos |
| 7 | bd875b25978eab2eb44f | Vendas Animais Abate |
| 8 | 40cb36bfabc02a4f0b65 | Resumo Vendas |
| 9 | 7dc3d855497a0e0a2de9 | Nascimentos |
| 10 | 8a8cb34ec08dd41cc176 | Desmama |
| 11 | 6c9dfd91107458524055 | Mortes |
| 12 | 805a0c692cdf8f14bce6 | Consumo e Doações |
| 13 | dc3edfc9dcebf773eed4 | Desembolso |
| 14 | cfda0bb8f3f0c35ad828 | Desembolso (2) |
| 15 | 60ebeaeea9bce58d24cd | Custeio |
| 16 | e69d3839019932a1023a | Análise de Pareto |
| 17 | 256583099c079ac5ef97 | Receitas |
| 18 | 7c0195ad6031139abe8e | Receitas (2) |
| 19 | 961510ec96b61b54dbc3 | Fluxo de Caixa |
| 20 | 6b40a8df47d648d80c94 | Resumo Rebanho e Caixa |
| 21 | 284ba9aa483bb0330941 | Atenciosamente |

**Divergência PDF (19) × PBIX (21)**: o pbix contém "Vendas Animais Vivos" e "Desmama", ausentes do PDF de agosto exportado. Provável exclusão manual na exportação ou página desativada naquele corte. Decisão pendente: o Vision gera as 21 ou replica as 19 do PDF.

### Mapa de bindings por página

Convenção: `Values:` campo/medida; `Category:`/`Rows:`/`Columns:` eixo ou agrupador; `Y`/`Y2` séries de combo.

**p2 Auditoria Mensal** (= PDF p.2 Estoque de Rebanho)
- Cards: `Soma de Valor Total R$`, `Saldo Inicial Janeiro Fixo`, `Valor @ Jan (Estoque)`, `Total @ Inicial Janeiro Fixo`, `Valor Total Inicial (R$) Janeiro Fixo`, `Valor @ (Estoque)`, `Soma de Total @`, `Soma de Saldo Final`
- Slicer: `Data Mês`
- Tabela (lado a lado saldo inicial/final): `dCategoria.Índice`, `dCategoria.Categoria`, medidas `Saldo Inicial`, `Total @ Inicial`, `Valor @ Inicial`, `Total Inicial (R$)`, `Saldo Final`, `Total @`, `Valor @`, `Valor Total R$` (últimas de `Diárias_Categoria`/`Estoque`)

**p3 Auditoria Período** (= PDF p.3 Rebanho Período)
- Cards: `Peso Vivo Médio (kg)`, `Saldo Final`, `UA/ha Média`
- Combo: categoria `Data Mês` × `UA/ha` (coluna) + `Rebanho Médio` (linha)
- Slicer: `Data`
- Tabela de movimentação: `dCategoria.Índice`, `dCategoria.Categoria` + de `Diárias_Categoria`: medida `Saldo Inicial Calculo`, colunas `Compras`, `Vendas`, `Mortes`, `Consumo`, `Nascimento`, `Transf Entrada`, `Transf Saída`, `EvoluçãoSaída`, `EvoluçãoEntrada`, medida `Saldo Final Calculo`

**p4 Compra Animais** (= PDF p.4)
- Cards: `Média de R$/kg`, `N° de Animais`, `Média de R$/Cab`, `Média de R$/@`
- Área: `Data Mês` × `Soma de N° Cabeças`; Barras: `Categoria` × `N° Cabeças`; Donut: `Tipo Compra` × `N° Cabeças`
- Slicers: `Categoria`, `Fornecedor`, `Tipo Compra`, `Data`

**p5 Resumo de Compras** (= PDF p.5)
- Cards: `Total da Compra (R$/Lote)`, `N° de Animais`
- Pivot: `Tipo Compra` > `Categoria` > `Data`; valores `N° Cabeças`, `Total (@)`, `Peso Médio (kg/cab)`, `Média de R$/@`, `Média de R$/Cab.`, `Total R$`
- Slicers: `Fornecedor`, `Tipo Compra`, `Categoria`, `Data`

**p6 Vendas Animais Vivos** (ausente no PDF)
- Cards: `Média R$/kg`, `Média R$/@`, `N° de Cabeças`
- Área: `Data Mês` × `Quant. Cab. Vendidas`; Combo: `Categoria` × `N° de Cab.` + `Média R$/@`
- Slicers: `Frigorífico/Comprador`, `Data`, `Tipo de Venda`

**p7 Vendas Animais Abate** (= PDF p.6)
- Cards: `Média R$/kg`, `Média R$/@`, `N° de Cabeças`
- Combo 1: `Data Mês` × `N° de Cab.` + `Média R$/@`
- Combo 2: `Frigorífico/Comprador` × `Média R$/@` + `Rend. Carcaça Final (%)`
- Slicers: `Tipo de Venda`, `Data`, `Frigorífico/Comprador`

**p8 Resumo Vendas** (= PDF p.7)
- Cards: `Giro de Estoque`, `Valor Total (R$)`, `N° de Cabeças`
- Pivot: `Tipo de Venda` > `Categoria` > `Data` (+ `Frigorífico/Comprador` nos valores); `N° de Cab`, `Total @`, `Média de R$/@`, `Total R$`
- Slicers: `Data`, `Tipo de Venda`, `Frigorífico/Comprador`

**p9 Nascimentos** (= PDF p.8)
- Cards: `N° Total de Nascimento`, `Peso Médio Nasc. (kg)`
- Combo: `Data Mês` × `N° de Nascimentos` + `Peso Médio ao Nascimento (kg)`; Donut: `Sexo` × `Quant.`; Barras: `Raça`/`Sexo` × `Quant.`
- Slicers: `Categoria`, `Data`, `Sexo`

**p10 Desmama** (ausente no PDF)
- Cards: `N° Total de Desmama`, `Média de Peso Vivo (kg)`
- Combo: `Data Mês` × `N° Desmama` + `Média de Peso Vivo (kg)`; Barras `Raça`/`Sexo` × contagem de categoria; Donut `Sexo`
- Slicer: `Data`

**p11 Mortes** (= PDF p.9)
- Cards: `Animais Mortos`, `Total de R$ Perdidos`, `Total de @ Perdidas`, `Tx. de Mortalidade`
- Área `Data Mês` × contagem; Coluna `Causa Morte/Consumo`; Donut `Categoria`
- Slicers: `Data`, `Causa Morte/Consumo`, `Local Fazenda (Pasto/Piquete)`, `Categoria`

**p12 Consumo e Doações** (= PDF p.10)
- Cards: `Tx. de Consumo e Doações`, `R$ Destinadas a Cons./Doação`, `Total de Animais`, `@ Destinadas a Cons./Doação`
- Barras `Causa Morte/Consumo`; Donut `Categoria`; Área `Data Mês`
- Slicers: `Raça`, `Categoria`, `Data`

**p13 Desembolso** (= PDF p.11)
- Cards: `Despesa Média Mensal`, `Desembolso Total`, `Custo Diária/cab`, `Desembolso/ha/Período`
- Área `Data Mês` × `Soma de Valor Total`; Donut `Tipo de Desembolso` × `Valor Total`
- Pivot: `Tipo de Desembolso` (colunas e linhas) > `Plano de Contas` > `Data Pagamento`; `Valor Total`
- Slicers: `Data`, `Centro de Custos`, `Tipo de Desembolso`, `Plano de Contas`

**p14 Desembolso 2** (= PDF p.12)
- Barras 100% empilhadas `Data Mês` × `Custos Fixos` + `Custos Variáveis`; Área `Data Mês` × `Desembolso/ha`
- Cards: `Despesa Média Mensal`, `Desembolso Total`, `Relação CF x CV`
- Slicers: `Data`, `Centro de Custos`, `Plano de Contas`, `Tipo de Desembolso`

**p15 Custeio** (= PDF p.13)
- Combo: `Data Mês` × `Custo Diária/cab` (coluna) + `Rebanho Médio` (linha); Área `Data Mês` × `Desembolso/ha`
- Cards: `Desembolso/ha/Período`, `Desembolso Total`, `Custo Diária/cab`, `Despesa Média Mensal`
- Slicers: `Plano de Contas`, `Data`, `Centro de Custos`, `Tipo de Desembolso`

**p16 Análise de Pareto** (= PDF p.14)
- Combo linha+coluna: `Plano de Contas` × `Desembolso Total` + `P % Pareto`
- Tabela: `Plano de Contas`, `% Pareto`, `Desembolso Total`, `Desembolso Acumulado`
- Cards: `80% Desembolso`, `% Plano de Contas`
- Slicers: `Data`, `Plano de Contas`, `Tipo de Desembolso`, `Centro de Custos`

**p17 Receitas** (= PDF p.15)
- Área `Data Mês` × `Receita Total`; Barras `Descrição/Plano de Contas` × `Receita Total`
- Cards: `Receita Total`, `Faturamento Médio Mensal`, `Faturamento/ha/Período`, `Faturamento/cab.`
- Slicers: `Data`, `Empresa Pagante`, `Descrição/Plano de Contas`, `Centro de Custos`

**p18 Receitas 2** (= PDF p.16)
- Barras `Classificação de Receitas` × `Receita Total`; Coluna `Data Mês` × `Faturamento/ha/Período`
- Pivot: `Empresa Pagante` > `Observação` > `Data`; `Valor Total`
- Cards: `Faturamento Médio Mensal`, `Faturamento/ha/Período`, `Receita Total`, `Faturamento/cab.`
- Slicers: `Empresa Pagante`, `Data`, `Descrição/Plano de Contas`, `Centro de Custos`

**p19 Fluxo de Caixa** (= PDF p.17)
- Cards: `Saídas 2026`, `Saldo Inicial`, `Saldo`, `Receita Total 2026`
- Pivot: `Transação` (linhas) × `Data Mês` (colunas); medida `FC Saldo`
- Slicer: `Data`

**p20 Resumo Rebanho e Caixa** (= PDF p.18 Índices Técnicos)
- Grade de 16 cards: `UA/ha Média`, `Entradas @`, `Faturamento/ha/Período`, `Estoque Final @`, `Custeio/ha`, `Saidas @`, `Despesa Média Mensal`, `Custo Diária/cab`, `Produção de @/ha`, `@ Produzida`, `Tx. de Desfrute (Cab)`, `Faturamento Médio Mensal`, `Desembolso/ha`, `Rebanho Médio`, `Estoque Inicial @`, `Desembolso RS/cab.`, `Custeio/@ Produzida`
- Slicer: `Data`

**p21 Atenciosamente** (= PDF p.19 contra-capa): imagem + textbox.

### Medidas DAX identificadas (parcial)

Campos com nome de medida (sem `Soma de`/agregação nativa) que o modelo define: `Saldo Inicial Calculo`, `Saldo Final Calculo`, `Rebanho Médio`, `UA/ha`, `UA/ha Média`, `Custo Diária/cab`, `Desembolso/ha`, `Custeio/ha`, `Custeio/@ Produzida`, `Produção de @/ha`, `@ Produzida`, `Entradas @`, `Saidas @`, `Estoque Inicial @`, `Estoque Final @`, `Tx. de Desfrute (Cab)`, `Tx. de Mortalidade`, `Tx. de Consumo e Doações`, `Giro de Estoque`, `Receita Total`, `Faturamento Médio Mensal`, `Faturamento/ha/Período`, `Faturamento/cab.`, `Desembolso Total`, `Despesa Média Mensal`, `Desembolso RS/cab.`, `Relação CF x CV`, `P % Pareto`, `Desembolso Acumulado`, `80% Desembolso`, `% Plano de Contas`, `FC Saldo`, `Rend. Carcaça Final (%)`, `Peso Vivo Médio (kg)`, `Média R$/@`, `Média R$/kg`, `Média R$/Cab`, `N° de Cabeças`, `Total (@)`, `Peso Médio (kg/cab)`.

As definições DAX estão dentro do blob `DataModel` (formato XPress9 comprimido). **Resolvido**: modelo extraído para TMDL via `pbi-tools` 1.2.0 desktop (`tools/pbi-tools-full/`), que usa o `msmdsrv.exe` do Power BI Desktop instalado. Saída em `Relatorio Vision - Guanabara II 2026/Model/tables/*.tmdl` — qualquer medida pode ser lida direto lá (ex.: `Tx. de Venda` em `Venda_Gado.tmdl`).

**Auditoria pós-extração** (DAX real × o que havia sido deduzido numericamente — confirmado salvo indicação):

- `Rebanho Médio` = `AVERAGE(Diárias[Saldo Diário Final])` — confirma a média diária (1.421,37).
- `Desembolso RS/cab` = Desembolso ÷ Rebanho Médio; `Custo Diária/cab` = isso ÷ `COUNTA(dCalendário[Data])` — equivale a ÷ animal-dias ✓.
- Área: entidade `Área` lê `Cadastros` e casta `Área Útil (ha)` para **Int64** → 561,4 vira 561 (resolve o mistério do divisor).
- `Custeio` = Σ de **colunas condicionais** `Custos Fixos`/`Custos Variáveis` criadas no M (após normalizar "Custos Fixos Mensais"→"Custos Fixos" etc.) — não é filtro por Tipo.
- `% Plano de Contas` = `P Qtd Pareto ÷ COUNTROWS('Plano de Contas')` — denominador = linhas da dimensão (31).
- `Desembolso Acumulado` = Σ de planos com `[Desembolso Total] >= contexto` (running total decrescente); `P Desembolso 80%` filtra `P % Pareto ≤ 0,8`.
- `Estoque Inicial/Final @`, `@ Produzida`, `Entradas @`, `Saidas @`: **YEAR=2026 pinado**, meses Janeiro/Agosto hardcoded — os cards de @ ignoram o slicer. `Entradas @` = só compras; `Saidas @` = só vendas (mortes/consumo @ não entram).
- **Não existe `Tx. de Mortalidade`**: o card da p.9 liga `Tx. de Consumo e Doações` (`COUNTA(Categoria) ÷ Rebanho Médio`) renomeada — o filtro de página é o que segrega.
- FC: `[Saldo Inicial Janeiro] = 0` hardcoded e `FC Saldo Inicial` com `Ano=2026` pinado — o seed não vem de `Cadastros`.
- Slicer `dCalendário.Data` mapeia para: `Venda_Gado.'Data Venda'`, `Compra_Gado.DataCompra`, `Desembolsos.'Data Pagamento'`, `Receitas_Mensais.'Data Recebimento'`, `Diárias.Data`, `Diárias_Categoria.Data`, `Mortes_Consumos.Data`, `Nascimentos.'Data de Nascimento'`, `Estoque.Data`, `Desmama.Data` — todos confirmados.

### Entidades do modelo vistas nos bindings

`dCategoria` (dimensão categoria), `Diárias_Categoria` (fato movimentação/custo por categoria), mais as implícitas por campo: tabelas de compras, vendas, nascimentos, desmama, mortes/consumos, desembolsos, receitas e fluxo de caixa. Nomes exatos de entidade ficam nos `queryRef` de cada projeção — a extração fina por página vai registrá-los no cruzamento.

---

## 3. Hipótese de mapeamento (a validar página a página)

| Página PDF / PBIX | Origem provável na planilha |
|---|---|
| Estoque de Rebanho / Auditoria Mensal | `Estoque` |
| Rebanho Período / Auditoria Período | `Estoque` + `Evolução_Rebanho` + `Diárias` / `Diárias_Categoria` |
| Compras | `Compra_Gado` |
| Vendas | `Venda_Gado` (+ `Receitas_Mensais` para empresa pagante) |
| Nascimentos / Desmama | `Nascimentos`, `Desmama` |
| Mortes / Consumo | `Mortes_Consumos` |
| Desembolso / Custeio / Pareto | `Desembolsos Realizados` + `Diárias*` + área (ha) |
| Receitas | `Receitas_Mensais` |
| Fluxo de Caixa | `FC_Mensal` / `Consolidado Mensal` |
| Índices Técnicos | medidas derivadas de todas as camadas |

---

## 4. Artefatos de apoio

- `tmp_pbix/` — pacote pbix extraído (JSONs de report/pages/visuals + DataModel)
- `tmp_pbix_map.txt` — inventário bruto de bindings, 253 linhas
- `tmp_pbix_extract.py` — parser de bindings (raiz do repo; rodar `python tmp_pbix_extract.py`)
- `apps/manejus/__audit_guanabara.cjs` — auditoria de abas/células/fórmulas da planilha (via workspace do manejus, que tem `xlsx`)
- `apps/manejus/__headers_guanabara.cjs` — extrator de cabeçalhos por aba

## 5. Estado do trabalho

- Passada geral da planilha: concluída
- Extração estrutural do pbix: concluída (páginas, visuais, bindings; filtros e DAX pendentes)
- Cruzamento página a página: em andamento, um painel por vez com validação do usuário entre cada um. Documentos por página em `vision-relatorio/paginas/`:
  - `01-capa.md` — p.1 "Capa" + encerramento "Atenciosamente" ✅ especificado (páginas estáticas; texto/logo queimados no JPG de fundo no original → Vision recompõe em HTML/CSS parametrizado, mesmo contrato do `renderCover`/`renderFinalPage` do Manejus)
  - `02-estoque-de-rebanho.md` — p.2 "Auditoria Mensal" ✅ reconciliado 100% (fonte: aba `Estoque`, blocos mensais; inputs manuais X/Y/AB identificados; "Janeiro Fixo" = bloco de janeiro do ano filtrado)
  - `03-rebanho-periodo.md` — p.3 "Auditoria Período" ✅ reconciliado (fonte: `Diárias_Categoria` diário + `Diárias` para rebanho médio + `Cadastros!Q17` área útil; descoberta-chave: `Diárias` ≠ soma das 10 categorias, inclui animais fora delas)
  - `04-compra-animais.md` — p.4 "Compra Animais" ✅ reconciliado (fonte: `Compra_Gado` inteira; médias são razões de somas ΣT÷ΣP/ΣL/ΣG; quirk: SUMIFS de `Diárias_Categoria` comparam label mês-ano com serial de data — caches vêm do gerador do modelo, semântica pretendida = compra atribuída ao 1º dia do mês × categoria)
  - `05-resumo-de-compras.md` — p.5 "Resumo de Compras" ✅ reconciliado (pivot Tipo Compra→Categoria→Data sobre `Compra_Gado`; **AVG por linha** de M/U/V, divergente das razões de somas da p.4 — as duas semânticas coexistem no relatório)
  - `06-vendas-abate.md` — p.6 "Vendas Animais Abate" ✅ reconciliado (fonte: `Venda_Gado`/tabela `Lotes36`; cards = razão de somas ΣAN÷ΣAF e ΣAN÷ΣW; gráficos = AVG por lote de AO e AD; confirmado que `Venda_Gado!CO` é o serial de 1º do mês — a chave correta que os SUMIFS erram ao usar `CD`)
  - `07-resumo-vendas.md` — p.7 "Resumo Vendas" ✅ reconciliado (pivot Tipo→Categoria→Data; AVG/Sum/Min conforme agg). **Giro de Estoque resolvido**: `Tx. de Venda = Σ vendas ÷ Σ 'Resumo Estoque'[Saldo Inicial]`, onde `Resumo Estoque` é a aba `Estoque` com `Ano=2025` hardcoded no M e sem relacionamento com `dCalendário` — denominador congelado em 13.924 cabeças. Quirk: `Diárias` projeta saldo 1.599 flat até dez/2029
  - `08-nascimentos.md` — p.8 "Nascimentos" ✅ reconciliado (fonte: `Nascimentos`; 2 registros no período; combo omite meses sem dados via filtro de visual)
  - `09-mortes.md` — p.9 "Mortes" ✅ reconciliado (fonte: `Mortes_Consumos` com filtro de página `Morte/Consumo='Morte'`; Tx. Mortalidade = mortes ÷ rebanho médio do período; cards de @ e R$ usam Σ ROUND por linha, não soma crua; mortes lançadas no dia 1 do mês)
  - `10-consumo-doacoes.md` — p.10 "Consumo e Doações" ✅ reconciliado (mesma aba, filtro `='Consumo'`; confirma padrão Tx.* = evento ÷ rebanho médio e arredondamento por linha nos cards de @/R$)
  - `11-desembolso.md` — p.11 "Relatório de Desembolso" ✅ reconciliado (fonte: `Desembolsos Realizados`, Data Pagamento × Valor Total; Desembolso/ha usa 561 ha arredondado; Custo Diária/cab = ΣN ÷ Σ Diárias!H do período)
  - `12-desembolso-cf-cv.md` — p.12 "Desembolso CF×CV" ✅ reconciliado (segunda página 'Desembolso' do pbix; coluna 100% CF/(CF+CV) por mês; Relação CF x CV = 52:48; Desembolso/ha mensal = ΣN_mês ÷ 561)
  - `13-custeio.md` — p.13 "Relatório de Custeio" ✅ reconciliado (= Desembolso filtrado a CF+CV, 1.342.866,84; custo diário mensal = (CF+CV)_mês ÷ animal-dias `Diárias!H` do mês; combo ordena eixo por Rebanho Médio, não cronologicamente)
  - `14-pareto.md` — p.14 "Análise de Pareto" ✅ reconciliado (base exclui Compra de Gado = 1.579.992,07; % Pareto = acumulado ÷ total; "80% Desembolso" = Σ planos com acumulado ≤80%; "% Plano de Contas" = planos no corte ÷ planos distintos totais = 4/31)
  - `15-receitas.md` — p.15 "Relatório de Receitas" ✅ reconciliado (fonte: `Receitas_Mensais`, Data Recebimento × Valor Líquido; Fat/cab = receita ÷ rebanho médio diário ΣDiárias!H÷243 = 1.421,37; quirk: todas as receitas 2026 no plano "13 a 24 meses - Macho")
  - `16-receitas-por-tipo.md` — p.16 "Receitas por tipo/empresa" ✅ reconciliado (Fat/ha mensal = ΣP_mês ÷ 561; pivot Empresa→Observação→Data; gráfico por `Classificação de Receitas`)
  - `17-fluxo-de-caixa.md` — p.17 "Fluxo de Caixa" ✅ reconciliado (grade 5×8 derivada de Receitas+Desembolsos com saldo encadeado; seed = Cadastros "Saldo de Caixa Inicial"=0; bloco AJ+ de `Diárias` está zerado e não é usado)
  - `18-indices-tecnicos.md` — p.18 "Índices Técnicos e Econômicos" ✅ reconciliado (grade de 17 cards; fórmula-chave `@ Produzida = SF@ + Saídas@ − Entradas@ − SI@` com @ cruas; todos os denominadores reutilizam medidas já mapeadas)
  - `19-vendas-animais-vivos.md` — página oculta "Vendas Animais Vivos" (`ed49a32f0871f6e90558`) ✅ estrutura mapeada e cruzada com dados reais da Fazenda Aruã (19 vendas `Comercial Vivo`, 4.195 cab, R$ 14,2M; separação Abate×Vivos depende do slicer `Tipo de Venda`, sem filtro gravado na página; cabeçalho de `Venda_Gado` deslocado +1 linha na Aruã)
- Páginas fora do escopo do PDF de referência: Desmama (pbix p10, sem dados — usuário confirmou ignorar)
