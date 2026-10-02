# Convenções de design — Vision'Up (relatório)

Regras acumuladas durante o desenho dos mockups. Valem para todos os mockups em `mockups/` e para o composer real no app.

## Estrutura da página interna (1280×720)

- Header: `<h1>` com o título da página em azul `#0B3D6E` 33px/800; quando a página tem descrição de escopo, ela vai ao lado do título separada por `·` (ex.: `Relatório de Custeio · Somente Custos Fixos e Variáveis`, padrão da p.12). Abaixo do título, o kicker verde maiúsculo (`12px/700`, letter-spacing 3px) carrega a linha padronizada `MesIni – MesFim · Ano · Nome da Fazenda` (`kickerPeriodo` em `fmt.mjs`; cross-year: `Jan/24 – Dez/26`), montada no `pageShell` via `fazenda: ctx.fazendaNome`. Logo Gesta'Up 62px no canto superior direito.
- **Fontes escaladas ×1.1** em todas as páginas internas (p.02–p.19): textos e números sobem proporcionalmente (tabela 13.5px→14px equivalente no corpo; ver `BASE_CSS`). Exceção: tabela densa da p.17 (`.fctable.dense`) mantém a fonte original porque já opera no limite de largura com 18 colunas. Capa e encerramento (p.01) não escalam.
- Respiro entre gráfico superior e conteúdo inferior: `.chart1` usa `padding-bottom` ≥ 10px e a linha inferior (`.chart-row`/`.bottom-row`/`.chart2`) `padding-top` ~14px; na p.06 a coluna da tabela tem `gap` de 48px em relação ao gráfico ao lado.
- Cards KPI: grid de 4 colunas (mesmo quando há menos cards — a grade mantém a régua visual), borda superior de 3px na cor temática da página.
- Rodapé: `Vision'Up · Gesta'Up Intelligence` à esquerda, `@gestaup.company` ao centro, número de página à direita; régua dupla azul (4px) + verde (2px) no bottom absoluto.
- Margem lateral padrão: 48px.

## Cores temáticas por página

- Paleta base: azul `#0B3D6E`, verde `#17A34A`, verde-escuro `#0F7A38`, verde-claro `#7FB98E`, cinza-azulado `#9FB3C8`.
- Acento temático varia por página para dar identidade de seção: verde (compras/movimentação), azul (financeiro/desembolso), vermelho-tijolo `#B0443C` (mortes/perdas), âmbar `#B8860B` (consumo/doações).
- Donut multissegmentado usa a paleta na ordem: azul, verde, verde-claro, cinza-azulado, cinza `#5B6B7B`.

## Rótulos de dados

- **Valores monetários sempre completos** em pt-BR (`R$ 204.858,91`, `R$ 1.044.530,25`). Nunca abreviar ("205 mil", "1,04 mi"). Decisão do usuário na p.11.
- **Cor do rótulo via classe, nunca via atributo `fill` junto de `.vlbl`.** A regra CSS `.vlbl { fill: ... }` tem precedência sobre o atributo `fill="#fff"` do SVG — usar a classe `.vlbl.w` para texto branco dentro de barras. Bug corrigido nas páginas 6, 8 e 13.
- Regra de contraste: rótulo sobre barra preenchida = branco; rótulo fora da barra = cor da série.
- **Combo barras+linha (gerado): identidade por posição fixa.** Rótulo da barra sempre acima da barra, na cor da série. Rótulo da linha sempre abaixo do ponto, na cor da linha, ou branco quando cai dentro da barra **e cabe na largura dela** — se a barra é estreita demais para o texto, o rótulo fica na cor da linha com halo (legível sobre qualquer fundo). Nunca usar rótulo vertical/rotacionado. Nunca dois brancos disputando o mesmo espaço dentro da barra — decisão da p.3 após teste com 36 meses (Aruã), refinada na p.6.
- Densidade de rótulos não é por contagem fixa de pontos: calcula-se a largura do maior rótulo **por série** (barras têm números curtos, linha tem "R$ xxx" longo) e só se salta rótulo quando ela não cabe no slot entre centros de barra. O pico de cada série é sempre rotulado, mesmo quando os vizinhos são suprimidos. Fonte reduz a 7.5px em modo denso, mesmo peso do normal.
- Rótulo de linha fora de barra carrega halo branco fino (`paint-order: stroke`, ~1.5px) para atravessar a própria polilinha, barras e gridlines; rótulo dentro de barra vai sem halo (halo em glifo = aparência de negrito). Gráficos de área usam o mesmo halo (`.vlbl.h`) — sem ele, o rótulo "some" quando a polilinha passa por cima (caso real: Aruã p.4, "227" na subida do pico).
- Rótulo de linha nunca invade a zona do eixo: se a posição abaixo do ponto cairia na linha de base ou nos rótulos de mês, ele sobe para acima do ponto. A resolução de colisão contra o rótulo da barra é direcional — label abaixo do ponto é empurrado para baixo do rótulo da barra, label acima é empurrado para cima (caso real: Aruã p.19, "R$ 188" da fêmea >36m).
- **`labelScale` (p.13 em diante): escala só a fonte dos rótulos de dados** (`comboChart`/`areaChart`/`stackedPctChart`/`paretoChart`), emitida via `style` inline ou atributos porque classe CSS vence atributo SVG. Peso NÃO escala: `.vlbl` cai de 700 para 600 — fonte maior com peso/halo escalados dá aparência de negrito excessivo no PDF. **Halo vira cópias brancas deslocadas ±1px por trás do glifo** (4 direções, só `fill`): o stroke da classe `.h`/`.llbl` vaza para o miolo dos glifos na rasterização do PDF (texto vazado/outline), e cópia ampliada por `scale` vira "sombra" visível deslocada do glifo. As estimativas de largura/colisão escalam junto, então o motor salta mais rótulos em vez de sobrepor. Com escala, rótulo interno de barra também exige largura (`<= bw - 4`): texto branco mais largo que a barra vaza para o fundo e fica invisível (defeito já existia no modo denso da Aruã).

## Gráficos

- **Eixo mensal: depende da natureza da medida.** Série contínua do rebanho (p.3, rebanho médio/UA) cobre o período completo, incluindo meses zerados. Série de eventos (vendas p.6/p.19, nascimentos) mostra **só meses com dado** — mês ausente no eixo significa sem movimento, e o eixo termina no último mês com dado mesmo quando o período do relatório continua.
- Donut condicional: 1 fatia dominante única = anel pleno com `N · Nome · 100%` no centro; 2+ fatias = anel segmentado + legenda lateral `nome · valor · %`.
- Eixo truncado só quando necessário para evidenciar diferenças pequenas (ex.: R$/@ por frigorífico) e sempre com marcador de corte + nota `Eixo truncado em ...`.
- Linha do combo liga através dos meses sem dado por padrão (`connectNulls`); segmentos quebrados só quando a descontinuidade é a informação (opt-out explícito).

## Tabelas

- Hierarquia visual de 3 níveis para pivots: tipo (faixa azul sólida) → categoria (fundo verde claro + traço verde) → item/dia (texto normal indentado).
- Linhas zeradas nos dois extremos (inicial e final) ficam cinza `#9AA8B5` com `—` no lugar de valores monetários.
- Linha de total: régua azul superior 2px, texto azul 800.
- Nunca usar `Min()`/`First()` textual em nível agregado (ex.: "Agra…" no original); exibir "Vários" quando o grupo mistura valores.

## Ordenação

- Sempre cronológica no eixo dos gráficos mensais, mesmo quando o original ordena por outro critério (ex.: p.13 ordenava por rebanho médio — divergência documentada e intencional).

## CSS SVG — armadilhas conhecidas

- `transform: scaleX(-1)` num elemento que também tem `clip-path` espelha o recorte. Estrutura correta: `clip-path` no elemento pai, `transform` só no `<img>`/`svg` interno (ver spec da p.1, encerramento).
- Atributo de apresentação SVG (`fill`, `stroke`) perde para qualquer regra CSS de classe. Cor de texto SVG que precisa variar deve ser classe dedicada (`.w`, `.b`, `.g`, `.r`).
