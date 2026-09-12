# Arquitetura de relatórios PDF

Este documento descreve os dois caminhos de geração de PDF que convivem no
sistema e como criar um relatório novo em qualquer um deles. Serve de
referência rápida para não reinventar CSS, footer, header, chart nem
descoberta de Chrome a cada relatório.

## Dois caminhos, um alvo visual

- **Client-side com jsPDF** (`src/utils/relatorio*PDF.ts`): geração feita no
  browser, sem custo de servidor, sem Chromium. Bom para relatórios curtos e
  com layout retangular clássico (tabelas + KPIs). Compartilha o header/pill
  do `src/utils/relatorioHeaderPDF.ts`. Continua sendo o default para a maior
  parte dos relatórios.
- **Server-side com Puppeteer** (`api/pdf/*.js`): geração via Chromium headless
  renderizando HTML/CSS. Melhor quando o layout depende de coisas que jsPDF
  não dá de graça (gradientes, heatmaps, grid CSS complexo, gráficos Chart.js
  em alta qualidade, tabelas com muitas linhas paginadas naturalmente). Custa
  um invoke de serverless por PDF gerado.

O visual base do caminho Puppeteer (`api/pdf/_shared/template.js`) usa o mesmo
verde-escuro `#0b6a42` e a mesma tipografia dos relatórios jsPDF para que os
dois caminhos convivam sem parecerem sistemas diferentes.

## Estrutura do caminho Puppeteer

```
api/pdf/
├─ _shared/
│  ├─ formatters.js   ← escapeHtml, dateFmt, numFmt, intFmt, moneyFmt, titleCase
│  ├─ labels.js       ← DIAGNOSTIC_LABELS + diagLabel (fonte única, usa cliente e server)
│  ├─ chartjs.js      ← lê Chart.js UMD do node_modules e cacheia em memória
│  ├─ puppeteer.js    ← findLocalChrome (Win/macOS/Linux) + generatePdf()
│  └─ template.js     ← BASE_CSS + renderHeader/renderFooter/kpi/chartCard/page/htmlDocument
└─ <relatorio>.js     ← endpoint fino: monta HTML específico, valida body, chama generatePdf()
```

Cada endpoint (`api/pdf/morte.js`, futuramente `api/pdf/consumo.js`, etc.)
concentra apenas o que é específico daquele relatório: composição das páginas,
gráficos e CSS extra. Tudo o mais (Chrome, Chart.js, template) vem do
`_shared`.

## Payload: gráficos são desenhados no servidor

**Regra:** o client **não envia PNGs base64 de gráfico**. Enviar imagem
prerenderizada infla o body em MB e faz o endpoint estourar `MAX_BODY_BYTES`
antes de qualquer volume real de dados. Padrão atual:

1. O client envia apenas dados brutos (`resumo`, `linhas`, `dataInicio`,
   `dataFim`, `fazendaNome`, `logoGestao`, `logoFazenda`).
2. O endpoint monta o HTML com `<canvas>` vazios e injeta:
   - o UMD do Chart.js (via `getChartJsScript()`),
   - um `<script>` de inicialização que lê `window.__reportData` e desenha
     cada gráfico no seu canvas.
3. Antes de imprimir, o handler aguarda `window.__chartsReady === true`
   (via `page.waitForFunction`) para garantir que os canvases foram pintados.

Logos ainda vêm como base64 do client porque são pequenos (10-50KB) e evitam
que o server precise autenticar no storage da Supabase para buscar a logo da
fazenda.

## Paginação de tabelas longas

Tabelas de detalhamento são quebradas em N linhas por página HTML (ver
`DETAIL_ROWS_PER_PAGE` em `morte.js` = 20). Cada chunk vira uma
`<section class="page">` com header/footer próprios, e o footer mostra
`Página X de Y` com `Y` calculado dinamicamente. `overflow:hidden` do
`.page` deixa de ser um problema porque o conteúdo já foi paginado antes de
renderizar.

## Como criar um relatório Puppeteer novo

1. Criar `api/pdf/<nome>.js` copiando a espinha de `api/pdf/morte.js`.
2. Trocar o corpo de `renderMorteHtml`/`CHARTS_INIT_JS` pelos elementos
   específicos do relatório novo. Reutilizar `renderHeader`, `renderFooter`,
   `kpi`, `chartCard`, `pageSection`, `htmlDocument` do `_shared/template.js`.
3. Se houver CSS específico (grids de página, larguras de coluna, tabelas
   auxiliares), colocar em uma constante local `X_CSS` e passar em
   `extraCss` do `htmlDocument`.
4. Definir formatadores? Reutilizar `_shared/formatters.js`. Se faltar um,
   adicionar lá para todos os relatórios ganharem.
5. Definir gráficos? Escrever um `CHARTS_INIT_JS` local usando `window.Chart`
   (já injetado pelo template) e ler dados de `window.__reportData` (setado
   automaticamente por `htmlDocument({ dataJson })`).
6. Se a tabela puder ficar longa, paginar como em `morte.js` (chunks + total
   dinâmico de páginas).
7. Do lado do client, criar `src/utils/relatorio<Nome>PDFPuppeteer.ts`
   seguindo o padrão de `relatorioMortePDFPuppeteer.ts`: só carrega logos e
   POSTa o payload cru.

## Como criar um relatório jsPDF novo

Segue o padrão existente em `src/utils/relatorio*PDF.ts`. Usa o header
compartilhado `renderRelatorioHeader` do `relatorioHeaderPDF.ts` para manter
consistência com o resto.

## Descoberta de Chrome local

`api/pdf/_shared/puppeteer.js` procura o Chromium em cinco locais, nessa
ordem:

1. `PUPPETEER_EXECUTABLE_PATH` (override explícito).
2. `puppeteer.executablePath()` (binário instalado via
   `npx puppeteer browsers install chrome`).
3. Cache padrão `~/.cache/puppeteer/chrome/**` — cobre `chrome-win64`,
   `chrome-linux64` e `chrome-mac-{arm64,x64}`.
4. Cache do Playwright (Windows).
5. Chrome do sistema (Program Files no Windows, `/Applications/` no macOS,
   `/usr/bin/{google-chrome,chromium,chromium-browser}` no Linux).

Em produção (Vercel) usa `@sparticuz/chromium` direto, sem tocar nesse
caminho.

## Limites do body

Depois de tirar as imagens do payload, os limites de body foram calibrados
para o volume real do sistema: `MAX_LINES = 20000` e
`MAX_BODY_BYTES = 8_000_000`. Cada linha de morte pesa ~250 bytes em JSON, então
20 mil linhas cabem em ~5MB com folga para logos.
