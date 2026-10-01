# Página 1 — Capa (e encerramento "Atenciosamente")

- PDF: p.1 "Capa" + última página "Atenciosamente"
- PBIX: `0d6af8c4e817ea2557d3` (Capa) e `284ba9aa483bb0330941` (Atenciosamente), 1280×720
- Fonte: **nenhum dado** — páginas 100% visuais. A grande "gambiarra" do original: texto e logo da fazenda estão **queimados na imagem de fundo**, trocar de fazenda/ano exige refazer o JPG.

**Status: especificado para implementação** (não há números a reconciliar).

---

## 1. Anatomia do original

### Capa (`Capa 2026.jpg` como fundo)

Camadas na página pbix:

| Elemento | O que é | Posição |
|---|---|---|
| Fundo | JPG estático contendo: foto de nelore com recorte diagonal à direita, banda verde no topo, título "Relatório Zootécnico e Financeiro" (verde), nome da fazenda (azul `#094780` grande), pill verde com o ano "2026", logo da fazenda, ícone Instagram | full-bleed |
| Logo Gesta'Up | PNG `Gestaup_Intelligence` sobreposto | x=62, y=0, ~166×167 |
| `@gestaup.company` | textbox, bold, `#094780` | x=85, y=643 |

### Encerramento (`Final.png` como fundo)

Mesmo padrão: fundo PNG com foto de gado ao entardecer em recorte diagonal duplo + banda verde no topo + "Atenciosamente" em azul `#094780`; sobre ele, logo Gesta'Up (x≈199, y≈88) e o mesmo textbox `@gestaup.company` (x≈98, y≈643).

Paleta do sistema: verde `#27AE60`-like (banda), azul `#094780` (texto), fundo branco.

## 2. Decisão de implementação

Recompor em HTML/CSS parametrizado — o modelo de dados deixa de carregar imagem pronta e passa a compor a página. A infra já existe: `apps/manejus/api/pdf/_shared/reportComposer.js` implementa exatamente isso para o Infográfico Mensal (`renderCover({fazendaNome, logoGestao, logoFazenda, logoEmpresa, imagemCapa, periodoLabel, totalPages})` + `renderFinalPage`), com `capa-padrao.png` como fundo default e `composeReports` que numera páginas e empilha os relatórios.

Para o Vision: mesmo contrato de dados, CSS redesenhado para a identidade da capa Vision (claro, banda verde, foto em diagonal) em vez do gradiente escuro do Manejus.

## 3. Parâmetros necessários

| Campo | Origem | Fallback |
|---|---|---|
| `fazendaNome` | tabela `fazendas` | obrigatório |
| `ano` / `periodoLabel` | parâmetro do relatório | ano corrente |
| `logoFazenda` | cadastro da fazenda (`capa_logo_url` ou similar, a criar) | omitir bloco |
| `imagemCapa` / `imagemFinal` | cadastro da fazenda — **trocável pelo usuário** (`capa_foto_url`/`final_foto_url`) | `apps/vision/public/assets/capa-default.png` (foto nelore fornecida pelo usuário, já versionada no app) |
| `logoGestaup` | asset do produto | fixo |
| `handle` | fixo `@gestaup.company` | fixo |

## 4. Layout proposto (canvas 1280×720 / A4 landscape conforme pipeline)

- Faixa verde sólida no topo (~90px, levemente curva como no original — pode ser `border-radius`/clip-path SVG).
- Foto à direita em máscara diagonal (CSS `clip-path: polygon(...)`) cobrindo ~45% direito.
- Coluna esquerda: kicker verde "Relatório Zootécnico e Financeiro", `h1` azul com nome da fazenda, pill verde arredondada com o ano.
- Rodapé: ícone Instagram + `@gestaup.company` em azul; logo Gesta'Up no topo-esquerdo; logo da fazenda próximo ao nome quando houver.
- Encerramento: "Atenciosamente" central-esquerda em azul, mesma banda/foto, logos Gesta'Up + fazenda (espelha `renderFinalPage` do Manejus).

## 5. Dependências para codar

1. **Asset default resolvido**: `apps/vision/public/assets/capa-default.png` (foto de nelore ao entardecer fornecida pelo usuário). Serve para capa e encerramento (crops diferentes). Deve ser substituível por fazenda — campos `capa_foto_url`/`final_foto_url` (ou um único `capa_foto_url`) na tabela de fazendas.
2. Logo da fazenda: campo de cadastro (`logo_url` pode já existir no Manejus — verificar na implementação).
3. Pipeline: reutilizar/adaptar `reportComposer` + `puppeteer.js` (server-side PDF) — o Vision pode importar o mesmo pacote ou receber sua própria pasta `api/pdf` com a mesma estrutura. Para o PDF server-side, a imagem default resolve por URL pública do app ou por cópia bundled em `api/pdf/_shared/` (mesmo padrão do `capa-padrao.png` do Manejus).
4. Numeração de página e "Página X de Y" seguem o padrão do composer.

## 6. Personalização de imagem via UI (aprovado 2025-10)

O usuário customiza a foto da capa e do encerramento sem depender do dev.

**Campos por fazenda** (tabela `fazendas`, colunas novas — migration estrutural):

| Coluna | Tipo | Uso no CSS |
|---|---|---|
| `capa_foto_url` | text | `img src` da capa; fallback `capa-default.png` |
| `capa_foto_pos` | jsonb `{x,y}` (0-100) | `object-position: x% y%` |
| `capa_foto_flip` | bool | `transform: scaleX(-1)` |
| `final_foto_url` | text | encerramento; fallback = `capa_foto_url` |
| `final_foto_pos` | jsonb | idem |
| `final_foto_flip` | bool | idem; default `true` quando herda a foto da capa (corrige o crop no layout espelhado) |

Upload: Supabase Storage, bucket dedicado (ex.: `relatorio-assets`) ou pasta `relatorio/` no bucket `logos`.

**UI** (Vision, seção "Personalizar relatório" — duas abas: Capa / Encerramento):

1. Preview WYSIWYG em 1280×720 escalado para ~640×360 via `transform: scale()` num `iframe srcDoc` renderizando o **mesmo template HTML** que o Puppeteer usa — zero divergência preview×PDF.
2. Drag-to-pan sobre o preview: `pointerdown/move` ajusta `object-position` (delta em px convertido para % da área cropada), escrito ao vivo via `iframe.contentDocument` para feedback em tempo real.
3. Toggle "Espelhar imagem" e botão "Restaurar padrão".
4. Encerramento: opção "usar mesma foto da capa" (default → herda `capa_foto_url` com flip forçado) ou upload próprio.
5. Botão "Gerar PDF de teste" dispara o composer e baixa o PDF real das duas bordas.

**Implementação**: o markup vira módulo compartilhado (`coverTemplate.js` exportando string HTML+CSS), consumido pelo iframe do preview e pelo `reportComposer`. Mockups aprovados: `vision-relatorio/mockups/capa-v1.html` e `final-v1.html` (espelhado: foto à esquerda, texto à direita, `Atenciosamente` sem ponto final).

**Detalhe de implementação do flip**: `transform: scaleX(-1)` espelha também o `clip-path` do próprio elemento, abrindo um canto transparente no recorte. Estrutura correta: `clip-path` num wrapper pai (`.photo-clip`) e `scaleX(-1)` apenas no `img` interno — o clip fica fixo e só o conteúdo da imagem espelha. Mesma regra vale para `object-position`: aplicar no `img` (ou no wrapper de conteúdo), nunca misturar com o elemento que carrega o clip.
