# Convenções de design — Vision'Up (relatório)

Regras acumuladas durante o desenho dos mockups. Valem para todos os mockups em `mockups/` e para o composer real no app.

## Estrutura da página interna (1280×720)

- Header: kicker = período resumido (`Jan – Ago · 2026`), título em azul `#0B3D6E` 30px/800, logo Gesta'Up 62px no canto superior direito.
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
