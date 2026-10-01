# Análise do modelo de PDF — Relatório Vision (Power BI)

Fonte: `Relatorio Vision - Guanabara II 2026 (agosto).pdf`
Fazenda no exemplo: Fazenda Nova Guanabara | Período: 01/01/2026 a 31/08/2026
Documento analisado em 01/10/2026 — 19 páginas, formato 1920×1095 (página Power BI landscape).

Este arquivo é a especificação visual do relatório que o Vision vai gerar via upload de planilha + Puppeteer. Serve de referência página a página para a implementação do template HTML/CSS.

---

## 1. Identidade visual e layout comum

### Moldura de cada página

- **Barra superior**: fundo cinza claro (`#D9D9D9` aprox.), com:
  - Logo Gesta'Up Company à esquerda
  - Título do painel em faixa azul-marinho escuro (`#1F3B52` aprox.) com cantos arredondados, centralizado, texto branco em negrito
  - Logo da fazenda à direita (ex: "FAZ. NOVA GUANABARA" com ilustração de cabeça de gado)
- **Fundo**: branco com marca d'água sutil de losangos na base inferior
- **Canto inferior direito**: fita/dobras geométricas em verde e azul-marinho (elemento decorativo fixo)
- **Filtros no topo esquerdo** (abaixo da barra de título): período renderizado como dois cartões de data ("01/01/2026" e "31/08/2026") com ícone de calendário. Páginas financeiras exibem ainda slicers verticais no lado esquerdo com cabeçalho azul-marinho: Centro de Custos, Tipo de Custo / Tipo de Receita, Plano de Contas / Empresa Pagante — cada um com dropdown mostrando o valor filtrado ("Todos" no exemplo).

### Paleta

- Azul-marinho escuro: `#1F3B52` (títulos, barras de gráfico, cabeçalhos de slicer e tabela)
- Verde médio: `#3D9B46`/`#45B73C` (linhas, barras positivas, marcadores)
- Verde claro translúcido: preenchimento de áreas (`rgba` verde claro)
- Cinza neutro para fundos de card e marca d'água
- Texto de valores: azul-marinho em negrito nos cards; preto nas tabelas

### Componentes recorrentes

- **Card KPI**: cartão branco com borda sutil e sombra leve, valor grande azul-marinho em negrito, rótulo abaixo em cinza-escuro. Em páginas financeiras, os KPIs ficam empilhados na coluna esquerda abaixo dos slicers.
- **Cartão de gráfico**: container branco com borda arredondada e sombra leve; título centralizado em cima (ex: "Custeio/ha/Mês"); rótulos de dados exibidos sobre cada ponto/barra.
- **Tabela**: cabeçalho azul-marinho, texto branco; linhas zebradas claras; linha "Total" em negrito com fundo cinza claro. Matrizes expandíveis mostram hierarquia com recuo (ex: Tipo de Compra > Categoria > data).
- **Moeda**: formato pt-BR `R$ 1.234.567,89`; arroba como `@`; percentuais `49,18%`.
- **Meses no eixo X**: nomes por extenso minúsculos (janeiro…agosto).

---

## 2. Página a página

### p.1 — Capa

- Fundo branco; logo Gesta'Up Intelligence central-esquerda.
- Título grande azul-marinho: "Relatório Zootécnico e Financeiro".
- Logo da fazenda + ano "2026".
- Foto de gado em moldura pologonal verde ocupando metade direita.

### p.2 — Relatório de Estoque de Rebanho

- Filtro de mês destacado ("agosto").
- Duas tabelas lado a lado: **Saldo Inicial** e **Saldo Final**.
- Linhas por categoria idade/sexo: 0 a 12 meses Macho/Fêmea, 13 a 24 M/F, 25 a 36 M/F, 37+ M/F, Touro.
- Colunas: Cabeças, Total @, Valor @ (R$), Valor Total (R$). Linha Total ao final.

### p.3 — Relatório de Rebanho Período

- KPIs à esquerda: Saldo Final (1.599 cab), Peso Vivo Médio (332,20 kg), UA/ha Média (1,38).
- **Matriz de movimentação** por categoria (linhas = categorias; colunas = Saldo Inicial, Compras, Vendas, Mortes, Consumo, Nascimento, Transf. Entrada, Transf. Saída, Evol. Saída, Evol. Entrada, Saldo Final).
- Gráfico combo: "Rebanho Médio" (linha verde com marcadores e rótulos) × "UA/ha" (barras azul-marinho), por mês.

### p.4 — Relatório de Compras de Animais

- Slicers: Categoria, Fornecedor, Tipo de Compra.
- KPIs: N° de animais (783), Média R$/@ (476,50), R$/kg (15,88), R$/cab (3.528,77).
- Área "N° Cabeças por Mês"; barras por Categoria; donut por Tipo de Compra.

### p.5 — Resumo de Compras

- Matriz hierárquica Tipo de Compra > Categoria > Data da compra.
- Colunas: N° Cabeças, Total @, Peso Médio (kg/cab), Média R$/@, Média R$/Cab., Total R$.
- Subtotais por nível e Total geral.

### p.6 — Vendas de Animais (Abate)

- KPIs: N° cabeças (699), Média R$/@ (347,98), R$/kg (12,95).
- Combo: "Média R$/@" (linha) × "N° cab" (barras) por mês.
- Barras "Reais por @" × linha "RC%" por Empresa Pagante (frigoríficos).

### p.7 — Resumo de Vendas

- Matriz Tipo de Venda > Categoria > Data > Frigorífico/Comprador.
- Colunas: Total @, Média R$/@, Total R$ (e cabeças).
- KPIs: cabeças vendidas, Giro de Estoque (5,02%), Total (R$ 5.151.805,27).

### p.8 — Nascimentos

- KPIs: nascimentos (2), peso médio (40 kg).
- Nascimentos por mês; barra por Sexo/Raça; donut por sexo.

### p.9 — Mortes

- KPIs: animais mortos (13), Tx. Mortalidade (0,91%), @ perdidas (90), valor perdido (R$ 37.398).
- Área "Mortes no Mês"; barra por Causa; donut por Categoria.

### p.10 — Consumo e Doações

- KPIs: animais (5), % (0,35%), @ (60), valor (R$ 23.903).
- Área por mês; barra por Destino (Cantina, Funcionários); donut por Categoria.

### p.11 — Relatório de Desembolso

- Slicers: Centro de Custos, Tipo de Custo, Plano de Contas.
- KPIs: Desembolso/ha/Período, Despesa Média Mensal, Custo Diária/cab, Desembolso Total (R$ 4.343.020,07).
- Área "Desembolso Mensal R$"; tabela por Tipo de Desembolso (Compra de Gado, Custos Fixos, Custos Variáveis, Impostos e Taxas, Investimentos e Estruturação); donut "% por Tipo de Custo".

### p.12 — Relatório de Desembolso (2)

- Área "Desembolso/ha/Mês".
- Barras empilhadas % Custos Fixos × Custos Variáveis por mês (relação 52:48).
- KPIs: despesa média, desembolso total, relação CF×CV.

### p.13 — Relatório de Custeio

- Área "Custeio/ha/Mês" com rótulos R$.
- Combo: "Custo Diária/cab" (barras azul-marinho com R$) × "Rebanho Médio" (linha verde) por mês.
- KPIs: Desembolso/ha/Período (R$ 2.393,70), Despesa Média Mensal (R$ 167.858,36), Custo Diária/cab (R$ 3,89), Desembolso Total (R$ 1.342.866,84).

### p.14 — Análise de Pareto

- Tabela: Plano de Contas | % Pareto | Desembolso Total | Desembolso Acumulado (ordem decrescente).
- Gráfico de Pareto: barras verdes (Desembolso Total, itens ≥80% em cinza após o corte) + linha azul-marinho "% Pareto".
- KPIs: "% Plano de Contas" (12,90%) e "80% Desembolso" (R$ 1.147.353,33).

### p.15 — Relatório de Receitas

- Slicers: Centro de Custos, Tipo de Receita, Empresa Pagante.
- KPIs: Faturamento/ha/Período (R$ 9.183,25), Faturamento Médio Mensal (R$ 643.975,66), Faturamento/cab (R$ 3.624,54), Receita Total (R$ 5.151.805,27).
- Área "Faturamento por Mês"; barra "Faturamento por Categoria" (13 a 24 meses - Macho).

### p.16 — Relatório de Receitas (2)

- Barras "Faturamento/ha/Mês" (verde).
- Tabela "Empresa Pagante" com Total (Agra Agroindustrial, Frigorífico Estrela, Frigorífico Vale Company).
- Barra "Faturamento por Tipo de Receita" (Venda de Gado).

### p.17 — Fluxo de Caixa

- 4 cards azul-marinho com ícone: Saldo Inicial (R$ 0,00), Receita Total 2026 (R$ 5.151.805,27), Saídas 2026 (R$ 4.343.020,07), Saldo (R$ 808.785,20).
- Tabela "Fluxo de Caixa Realizado": linhas = Saldo Inicial, Entrada, Saída, Resultado Período, Saldo Final; colunas = janeiro a agosto. Negativos com sinal (ex: `-R$ 358.797,44`).

### p.18 — Índices Técnicos e Econômicos da Atividade

- Grade 4×4 de cards KPI: Estoque Inicial @ (13.791), Entradas @ (5.799), Saídas @ (14.805), Estoque Final @ (11.394), @ Produzida (6.609), Rebanho Médio (1.421), UA/ha Média (1,38), Tx. Desfrute/Cab (49,18%), Produção @/ha (11,78), Custo Diária/cab (R$ 12,57), Custeio/@ Produzida (R$ 203,20), Custeio/ha (R$ 2.393,70), Desembolso R$/cab (R$ 3.055,52), Desembolso/ha (R$ 7.741,57), Despesa Média Mensal (R$ 542.877,51), Faturamento/ha/Período (R$ 9.183,25), Faturamento Médio Mensal (R$ 643.975,66).

### p.19 — Contra-capa

- Logo Gesta'Up Intelligence, "Atenciosamente", @gestaup.company, foto de gado na moldura pologonal.

---

## 3. Mapa de dados (origem presumida — validar com a planilha)

| Domínio | Páginas | Dados necessários |
|---|---|---|
| Rebanho (Manejus) | 2, 3 | estoque por categoria idade/sexo, movimentações, peso médio, UA/ha, área útil (ha) |
| Compras de animais | 4, 5 | lançamentos: data, fornecedor, tipo de compra, categoria, n° cab, @, R$ |
| Vendas de animais | 6, 7 | data, comprador/frigorífico, tipo, categoria, cab, @, R$/@, R$, RC% |
| Nasc./Mortes/Consumo | 8, 9, 10 | eventos com data, categoria, causa/destino, sexo/raça, peso/@, valor estimado |
| Desembolsos (Vision) | 11–14 | lançamentos: data, centro de custo, tipo de custo (fixo/variável), plano de contas, R$ |
| Receitas (Vision) | 15, 16 | receitas: data, empresa pagante, tipo de receita, categoria, R$ |
| Fluxo de caixa | 17 | consolidação entradas/saídas mensais + saldo inicial |
| Índices | 18 | derivados cruzando rebanho × financeiro × área |

## 4. Observações para implementação

- Os slicers viram **parâmetros fixos do PDF** (período, fazenda, filtros) — no documento eles aparecem como selo do filtro aplicado, não são interativos.
- Gráficos precisam de rótulos de dados em todos os pontos/barras (padrão do modelo).
- A tabela de fluxo de caixa usa saldo encadeado entre meses (saldo final de jan = inicial de fev).
- Números sempre pt-BR; `@`, `R$`, `%`, `cab`, `ha`, `kg` como unidades canônicas.
- A capa e contra-capa são estáticas, parametrizadas por nome da fazenda, logo e ano.
