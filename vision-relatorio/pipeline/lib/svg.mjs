// Primitivas SVG dos gráficos do relatório. Regras de CONVENCOES_DESIGN.md:
// - rótulos completos (nunca abreviados); texto dentro de barra usa classe .w (branco),
//   nunca atributo fill junto de classe que já define fill.
import { esc } from './fmt.mjs';

export const C = {
  blue: '#0B3D6E', green: '#17A34A', greenDark: '#0F7A38', greenLight: '#7CC98A',
  slate: '#8FA3B5', ink: '#12263A', muted: '#5B6B7B', red: '#B0443C', amber: '#B8860B',
  line: '#E3E8EE', soft: '#F4F7F9', grid: '#EDF1F5',
};

export const f = (v, d = 1) => Number(v).toFixed(d);

// Escala de faixas horizontais: centros e largura de barra.
export function xBand(n, w, { padL = 20, padR = 20, barRatio = 0.55, maxBarW = 80 } = {}) {
  const step = (w - padL - padR) / Math.max(n, 1);
  return {
    step, n,
    cx: (i) => padL + step * (i + 0.5),
    barW: Math.min(maxBarW, step * barRatio),
  };
}

// Escala linear vertical (valores → y). domain opcional.
export function yScale(values, { top = 20, bottom = 140, domain = null, niceMax = null } = {}) {
  const [lo, hi] = domain ?? [0, Math.max(...values.filter(v => v != null), 0)];
  const max = niceMax ? niceMax(hi) : hi;
  const y = (v) => bottom - ((v - lo) / (max - lo || 1)) * (bottom - top);
  return { y, lo, max, top, bottom };
}

// arredonda para cima em múltiplos de `step` (escala "bonita" do eixo)
export const ceilTo = (v, step) => Math.ceil(v / step) * step;

/**
 * Combo chart: barras + linha + eixo de rótulos.
 * spec: {
 *   labels: ['Jan',...], W, H, labelScale (escala só os rótulos de dados, ex.: 1.3),
 *   bars: { values: [n], color, labelFmt: v=>str, labelInside: bool|'auto', topPad, bottomAxis, niceMax },
 *   line: { values: [n|null], color, labelFmt, domain: [lo,hi], labelBelow: bool }
 * }
 * Regra de legibilidade: rótulo da barra em branco dentro da barra quando há altura;
 * rótulo da linha em branco quando o ponto cai sobre a barra, na cor da linha quando fora.
 */
export function comboChart(spec) {
  const { labels, W = 1184, H = 175, bars, line, labelScale = 1 } = spec;
  const topPad = 22, axisY = H - 35, labelY = H - 12;
  const xb = xBand(labels.length, W);
  const bw = xb.barW;
  const bVals = bars?.values ?? labels.map(() => 0);

  // densidade: salta rótulos só quando o slot é estreito demais para o texto,
  // calculado por série (números de barra são curtos; rótulos da linha são longos)
  const n = labels.length;
  const dense = n > 14;
  // fontes efetivas dos rótulos de dados (inline style vence a classe CSS);
  // estimativas de largura/colisão escalam junto para não rotular além do que cabe
  const fsV = f((dense ? 8 : 10.5) * labelScale, 1);
  const fsL = f((dense ? 7.5 : 10) * labelScale, 1);
  // halo e peso não escalam: halo é recurso de legibilidade, não de ênfase, e
  // halo/peso 700 em fonte maior dá aparência de negrito excessivo (CONVENCOES)
  const stl = (px, extra = '') => labelScale === 1 ? '' : ` style="font-size:${px}px${extra}"`;
  const estW = (list) => Math.max(4, ...list.map(s => String(s).length)) * (dense ? 4.8 : 5.6) * labelScale + 6;
  const barEvery = bars?.labelFmt
    ? Math.max(1, Math.ceil(estW(bVals.filter(v => v != null).map(v => bars.labelFmt(v))) / xb.step))
    : 1;
  const lineEvery = line?.labelFmt
    ? Math.max(1, Math.ceil(estW(line.values.filter(v => v != null).map(v => line.labelFmt(v))) / xb.step))
    : 1;
  // eixo truncado (bars.domain [lo,hi]): para evidenciar diferenças pequenas;
  // desenha marcador de corte à esquerda (CONVENCOES: sempre com nota na página)
  const bLo = bars?.domain?.[0] ?? 0;
  const bPeakV = Math.max(...bVals, 0);
  // passo "bonito" proporcional à magnitude: valores <10 arredondam de 1 em 1 etc.
  const niceStep = Math.pow(10, Math.max(0, Math.floor(Math.log10(bPeakV || 1)) - 1));
  const bMax = bars?.domain?.[1] ?? (ceilTo(bPeakV * 1.05, niceStep) || niceStep);
  const by = (v) => axisY - ((v - bLo) / (bMax - bLo || 1)) * (axisY - topPad);

  let out = [];
  // gridlines
  out.push(`<line x1="0" y1="${axisY}" x2="${W}" y2="${axisY}" stroke="#C9D2DB" stroke-width="1"/>`);
  if (bLo > 0) out.push(`<path d="M6,${axisY - 7} l10,14 M17,${axisY - 7} l10,14" stroke="#9AA8B5" stroke-width="1.5"/>`);
  for (const fY of [0.5, 0.83]) {
    const gy = axisY - fY * (axisY - topPad);
    out.push(`<line x1="0" y1="${f(gy)}" x2="${W}" y2="${f(gy)}" stroke="${C.grid}" stroke-width="1"/>`);
  }

  // barras
  const barTops = [];
  for (let i = 0; i < labels.length; i++) {
    const v = bVals[i], y = by(v), h = axisY - y;
    barTops.push(y);
    if (v > 0) out.push(`<rect x="${f(xb.cx(i) - bw / 2)}" y="${f(y)}" width="${f(bw)}" height="${f(h)}" rx="4" fill="${bars?.color ?? C.blue}" opacity="0.92"/>`);
  }
  // rótulos das barras — posição resolvida junto com os da linha para evitar colisão
  const bPeak = Math.max(...bVals, 0);
  const bLbl = bars ? bVals.map((v, i) => {
    if (!v || !bars.labelFmt || (i % barEvery !== 0 && v !== bPeak)) return null;
    const h = axisY - by(v);
    const txt = bars.labelFmt(v);
    // rótulo interno exige largura além de altura: texto branco mais largo que a
    // barra vaza para o fundo branco e fica invisível. Avaliado só quando a página
    // adota labelScale ≠ 1, para não mudar o layout das demais nesta etapa.
    const fitsW = labelScale === 1 || String(txt).length * (dense ? 4.4 : 5.6) * labelScale <= bw - 4;
    const inside = fitsW && (bars.labelInside === true || (bars.labelInside !== false && h >= 26 * labelScale));
    return { y: inside ? by(v) + Math.round(15 * labelScale) : by(v) - Math.round(6 * labelScale), inside, x: xb.cx(i), txt };
  }) : [];

  // linha: por padrão liga através dos meses sem dado (connectNulls);
  // line.connectNulls === false mantém segmentos quebrados
  if (line) {
    const lVals = line.values;
    const nums = lVals.filter(v => v != null);
    const lo = line.domain?.[0] ?? Math.floor((Math.min(...nums) - 0.2) * 10) / 10;
    const hi = line.domain?.[1] ?? Math.ceil((Math.max(...nums) + 0.2) * 10) / 10;
    const ly = (v) => axisY - ((v - lo) / (hi - lo || 1)) * (axisY - topPad);
    const pts = lVals.map((v, i) => v == null ? null : [xb.cx(i), ly(v)]);
    if (line.connectNulls === false) {
      let seg = [];
      for (const p of pts) {
        if (p) seg.push(p);
        else if (seg.length) { out.push(`<polyline points="${seg.map(q => q.map(f).join(',')).join(' ')}" fill="none" stroke="${line.color}" stroke-width="3" stroke-linejoin="round"/>`); seg = []; }
      }
      if (seg.length) out.push(`<polyline points="${seg.map(q => q.map(f).join(',')).join(' ')}" fill="none" stroke="${line.color}" stroke-width="3" stroke-linejoin="round"/>`);
    } else {
      const known = pts.filter(Boolean);
      if (known.length) out.push(`<polyline points="${known.map(q => q.map(f).join(',')).join(' ')}" fill="none" stroke="${line.color}" stroke-width="3" stroke-linejoin="round"/>`);
    }
    for (const p of pts) if (p) out.push(`<circle cx="${f(p[0])}" cy="${f(p[1])}" r="4.5" fill="${line.color}"/>`);
    // Identidade por posição/cor: rótulo da barra acima em azul; rótulo da linha
    // abaixo do ponto em verde (branco quando cai dentro da barra). Se o rótulo
    // da linha ficar na zona do rótulo da barra, desce mais um passo.
    const lPeak = Math.max(...nums);
    const placed = []; // {x, y, w} dos rótulos já emitidos — anti-colisão entre eles
    for (let i = 0; i < labels.length; i++) {
      const v = lVals[i]; if (v == null || !line.labelFmt || (i % lineEvery !== 0 && v !== lPeak)) continue;
      const [px, py] = pts[i];
      const bt = barTops[i];
      const txt = line.labelFmt(v);
      const lw = String(txt).length * (dense ? 4.4 : 5.2) * labelScale;
      let ty = py + Math.round(16 * labelScale + 1);
      if (ty > axisY - 8) ty = py - Math.round(10 * labelScale);
      const bl = bLbl[i];
      if (bl && Math.abs(ty - bl.y) < 12 * labelScale) ty = ty >= py ? bl.y + Math.round(16 * labelScale) : bl.y - Math.round(14 * labelScale);
      // rótulo dentro da barra fica indistinguível do valor dela: sobe acima do
      // ponto quando o lugar está livre
      if (ty > bt - 4 && ty < axisY - 4) {
        const tyUp = py - Math.round(10 * labelScale);
        const upBusy = (bl && Math.abs(tyUp - bl.y) < 12 * labelScale)
          || placed.some(p => Math.abs(p.x - px) < (p.w + lw) / 2 + 3 && Math.abs(p.y - tyUp) < 11 * labelScale);
        if (!upBusy) ty = tyUp;
      }
      // colide com outro rótulo da linha já posicionado? pula (o pico nunca pula)
      const hit = placed.some(p => Math.abs(p.x - px) < (p.w + lw) / 2 + 3 && Math.abs(p.y - ty) < 11 * labelScale);
      if (hit && v !== lPeak) continue;
      // branco só quando o rótulo cabe inteiro dentro da barra; se estreita,
      // fica na cor da linha com halo, legível sobre qualquer fundo
      const fitsBar = lw <= bw - 4;
      const cls = fitsBar && ty > bt - 4 && ty < axisY - 4 ? 'llbl w' : 'llbl';
      placed.push({ x: px, y: ty, w: lw });
      if (labelScale !== 1) {
        // mesma técnica do areaChart: halo por cópias brancas deslocadas ±1px.
        // dentro da barra, verde-claro liso (o halo ficava borrado no azul);
        // fora, verde-escuro com halo. A família verde mantém a identidade da linha
        const base = `text-anchor="middle" font-family="Archivo" font-size="${fsL}" font-weight="600"`;
        if (cls === 'llbl w') {
          out.push(`<text x="${f(px)}" y="${f(ty)}" ${base} fill="#BFDFCB">${esc(txt)}</text>`);
        } else {
          for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            out.push(`<text x="${f(px + dx)}" y="${f(ty + dy)}" ${base} fill="#fff">${esc(txt)}</text>`);
          }
          out.push(`<text x="${f(px)}" y="${f(ty)}" ${base} fill="${C.greenDark}">${esc(txt)}</text>`);
        }
        continue;
      }
      out.push(`<text class="${cls}${dense ? ' dense' : ''}" x="${f(px)}" y="${f(ty)}" text-anchor="middle">${esc(txt)}</text>`);
    }
  }

  // emite rótulos de barra (pós-resolução de colisão com a linha)
  for (const bl of bLbl) {
    if (!bl) continue;
    out.push(`<text class="${bl.inside ? 'vlbl w' : 'vlbl'}${bars?.labelCls ? ' ' + bars.labelCls : ''}${dense ? ' dense' : ''}" x="${f(bl.x)}" y="${f(bl.y)}" text-anchor="middle"${stl(fsV, ';font-weight:600')}>${esc(bl.txt)}</text>`);
  }

  // eixo x — rótulo longo demais para o slot quebra em duas linhas no separador;
  // se mesmo assim não couber (ou não houver separador), salta rótulos
  // (primeiro e último sempre visíveis)
  const fullW = Math.max(...labels.map(l => String(l).length)) * (dense ? 5 : 5.6) + 6;
  const partsAll = labels.map(l => String(l).split(/\s+[·-]\s+/));
  const axTwoLines = fullW > xb.step && partsAll.some(p => p.length > 1);
  const partW = Math.max(...partsAll.flat().map(s => s.length)) * (dense ? 5 : 5.6) + 6;
  const axEvery = Math.max(1, Math.ceil((axTwoLines ? partW : fullW) / xb.step));
  let lastAx = -Infinity;
  for (let i = 0; i < labels.length; i++) {
    if (i === labels.length - 1 && axEvery > 1) {
      // último rótulo só entra se houver espaço real desde o anterior
      if (xb.cx(i) - xb.cx(lastAx) < (axTwoLines ? partW : fullW)) break;
    } else if (axEvery > 1 && i % axEvery !== 0 && i !== 0) continue;
    lastAx = i;
    const cls = `axis${dense ? ' dense' : ''}`;
    if (axTwoLines) {
      const parts = partsAll[i];
      const l1 = parts[0], l2 = parts.slice(1).join(' ');
      out.push(`<text class="${cls}" x="${f(xb.cx(i))}" y="${labelY - (l2 ? 11 : 0)}" text-anchor="middle">${esc(l1)}${l2 ? `<tspan x="${f(xb.cx(i))}" dy="11">${esc(l2)}</tspan>` : ''}</text>`);
    } else {
      out.push(`<text class="${cls}" x="${f(xb.cx(i))}" y="${labelY}" text-anchor="middle">${esc(labels[i])}</text>`);
    }
  }
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px">${out.join('\n')}</svg>`;
}

// Área com linha + preenchimento em gradiente. Rótulos só em pontos > 0.
let __gid = 0;
export function areaChart({ labels, values, W = 1184, H = 190, color = C.green, labelFmt = (v) => v, labelScale = 1 }) {
  const topPad = 20, axisY = H - 25, labelY = H - 6;
  const n = labels.length;
  const xb = xBand(n, W);
  const max = Math.max(...values, 0) || 1;
  const vMax = ceilTo(max * 1.08, 10) || 10;
  const vy = (v) => axisY - (v / vMax) * (axisY - topPad);
  const pts = values.map((v, i) => [xb.cx(i), vy(v)]);
  const dense = n > 14;
  const gid = `ag${++__gid}`;
  const first = pts[0], last = pts[pts.length - 1];
  let out = [];
  out.push(`<line x1="0" y1="${axisY}" x2="${W}" y2="${axisY}" stroke="#C9D2DB" stroke-width="1"/>`);
  for (const fY of [0.5, 0.82]) {
    const gy = axisY - fY * (axisY - topPad);
    out.push(`<line x1="0" y1="${f(gy)}" x2="${W}" y2="${f(gy)}" stroke="${C.grid}" stroke-width="1"/>`);
  }
  out.push(`<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity="0.32"/><stop offset="1" stop-color="${color}" stop-opacity="0.02"/></linearGradient></defs>`);
  const linePts = pts.map(p => p.map(f).join(',')).join(' ');
  out.push(`<path d="M${f(first[0])},${axisY} L${linePts.replaceAll(' ', ' L')} L${f(last[0])},${axisY} Z" fill="url(#${gid})"/>`);
  out.push(`<polyline points="${linePts}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round"/>`);
  // densidade de rótulos por largura estimada; máximo sempre rotulado; anti-colisão por proximidade
  const maxV = Math.max(...values, 0);
  const fsV = f((dense ? 8 : 10.5) * labelScale, 1);
  const cw = (dense ? 4.8 : 6.4) * labelScale;
  const lblW = Math.max(...values.filter(v => v).map(v => labelFmt(v).length), 1) * cw + 10;
  const slot = n > 1 ? xb.cx(1) - xb.cx(0) : W;
  const step = Math.max(1, Math.ceil(lblW / slot));
  const placed = [];
  const tryLabel = (i) => {
    const [x, y] = pts[i];
    if (placed.some(p => Math.abs(p[0] - x) < lblW * 0.92 && Math.abs(p[1] - y) < 14 * labelScale)) return;
    placed.push([x, y]);
    const tx = Math.min(Math.max(x, lblW / 2), W - lblW / 2);
    const ty = f(y - Math.round(10 * labelScale));
    const txt = esc(labelFmt(values[i]));
    if (labelScale === 1) {
      out.push(`<text class="vlbl h${dense ? ' dense' : ''}" x="${f(tx)}" y="${ty}" text-anchor="middle">${txt}</text>`);
      return;
    }
    // halo sem stroke: cópias brancas deslocadas ±1px por trás. O stroke branco
    // da classe `.h` vaza para o miolo dos glifos na rasterização do PDF
    // (texto vazado), e cópia ampliada por scale vira "sombra" visível.
    const base = `text-anchor="middle" font-family="Archivo" font-size="${fsV}" font-weight="600"`;
    const yNum = y - Math.round(10 * labelScale);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      out.push(`<text x="${f(tx + dx)}" y="${f(yNum + dy)}" ${base} fill="#fff">${txt}</text>`);
    }
    out.push(`<text x="${f(tx)}" y="${f(yNum)}" ${base} fill="${C.blue}">${txt}</text>`);
  };
  const iMax = values.indexOf(maxV);
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (!v) continue;
    out.push(`<circle cx="${f(pts[i][0])}" cy="${f(pts[i][1])}" r="4" fill="${color}"/>`);
  }
  if (maxV > 0 && iMax >= 0) tryLabel(iMax);
  for (let i = 0; i < n; i++) {
    if (!values[i] || i === iMax || i % step !== 0) continue;
    tryLabel(i);
  }
  for (let i = 0; i < n; i++) {
    out.push(`<text class="axis${dense ? ' dense' : ''}" x="${f(xb.cx(i))}" y="${labelY}" text-anchor="middle">${esc(labels[i])}</text>`);
  }
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px">${out.join('\n')}</svg>`;
}

/**
 * Coluna 100% empilhada com 2 séries (embaixo = serie a, topo = b).
 * rows: [{ label, a, b }] — a e b em valores absolutos; normaliza a/(a+b).
 * Rótulo % dentro do segmento quando h >= 16px; meses sem CF+CV viram slot vazio.
 */
export function stackedPctChart({ rows, W = 720, H = 190, colors = [C.green, C.greenLight], labelScale = 1 }) {
  const topPad = 14, axisY = H - 26, labelY = H - 8, barH = axisY - topPad;
  const segStl = labelScale === 1 ? '' : ` style="font-size:${f(9.5 * labelScale, 1)}px"`;
  const n = rows.length;
  const xb = xBand(n, W, { padL: 18, padR: 18, barRatio: 0.42, maxBarW: 56 });
  const out = [`<line x1="0" y1="${axisY}" x2="${W}" y2="${axisY}" stroke="#C9D2DB" stroke-width="1"/>`];
  for (let i = 0; i < n; i++) {
    const { a, b } = rows[i];
    const tot = (a || 0) + (b || 0);
    if (!tot) continue;
    const pctA = a / tot;
    const hA = pctA * barH, hB = barH - hA;
    const x = f(xb.cx(i) - xb.barW / 2), w = f(xb.barW);
    out.push(`<rect x="${x}" y="${f(axisY - hA)}" width="${w}" height="${f(hA)}" fill="${colors[0]}"/>`);
    out.push(`<rect x="${x}" y="${f(topPad)}" width="${w}" height="${f(hB)}" fill="${colors[1]}"/>`);
    const cx = f(xb.cx(i));
    const fit = hA >= 16 * labelScale && xb.barW >= 28;
    const fitB = hB >= 16 * labelScale && xb.barW >= 28;
    const dyo = 3 * labelScale;
    if (fit) out.push(`<text class="seglbl" x="${cx}" y="${f(axisY - hA / 2 + dyo)}" text-anchor="middle"${segStl}>${fmtPct0(pctA)}</text>`);
    if (fitB) out.push(`<text class="seglbl" x="${cx}" y="${f(topPad + hB / 2 + dyo)}" text-anchor="middle"${segStl}>${fmtPct0(b / tot)}</text>`);
  }
  const dense = n > 14;
  const lbls = rows.map(r => r.label);
  const axW = Math.max(...lbls.map(l => Math.max(...l.split(/[\s/]+/).map(t => t.length))), 1) * (dense ? 4.6 : 6) + 8;
  const axEvery = Math.max(1, Math.ceil(axW / (n > 1 ? xb.cx(1) - xb.cx(0) : W)));
  let lastShown = -Infinity;
  for (let i = 0; i < n; i++) {
    const isEdge = i === 0 || (i === n - 1 && i - lastShown >= axEvery);
    if (i % axEvery !== 0 && !isEdge) continue;
    lastShown = i;
    out.push(`<text class="axis${dense ? ' dense' : ''}" x="${f(xb.cx(i))}" y="${labelY}" text-anchor="middle">${esc(lbls[i])}</text>`);
  }
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px">${out.join('\n')}</svg>`;
}

const fmtPct0 = (v) => `${Math.round(v * 100)}%`;

/**
 * Pareto: barras desc de valor + linha de % acumulado + corte tracejado em 80%.
 * linhas: [{valor, pct(acumulado 0..1)}]; corteIdx = índice do plano que fecha ≥80%.
 * Eixo ordinal (1º, 5º, 10º...). Rótulos de % no 1º, no corte (e anterior) e no último.
 */
export function paretoChart({ linhas, corteIdx, W = 640, H = 400, labelScale = 1 }) {
  const top = 30, axisY = H - 30, labelY = H - 8, chartH = axisY - top;
  const n = linhas.length;
  const xb = xBand(n, W, { padL: 30, padR: 30, barRatio: 0.75, maxBarW: 16 });
  const vMax = Math.max(...linhas.map(l => l.valor), 0) || 1;
  const by = (v) => axisY - (v / vMax) * chartH;
  const py = (p) => axisY - p * chartH;
  const cutY = py(0.8);
  const out = [
    `<line x1="30" y1="${axisY}" x2="${W - 10}" y2="${axisY}" stroke="#C9D2DB" stroke-width="1"/>`,
    `<line x1="30" y1="${f(py(0.5))}" x2="${W - 10}" y2="${f(py(0.5))}" stroke="${C.grid}" stroke-width="1"/>`,
    `<line x1="30" y1="${f(py(1))}" x2="${W - 10}" y2="${f(py(1))}" stroke="${C.grid}" stroke-width="1"/>`,
    `<line x1="30" y1="${f(cutY)}" x2="${W - 10}" y2="${f(cutY)}" stroke="${C.red}" stroke-width="1.5" stroke-dasharray="6 4"/>`,
    `<text x="${W - 14}" y="${f(cutY - 6)}" text-anchor="end" font-family="Archivo" font-size="10.5" font-weight="700" fill="${C.red}">80%</text>`,
  ];
  for (let i = 0; i < n; i++) {
    const v = linhas[i].valor;
    if (v <= 0) continue;
    out.push(`<rect x="${f(xb.cx(i) - xb.barW / 2)}" y="${f(by(v))}" width="${f(xb.barW)}" height="${f(axisY - by(v))}" rx="2" fill="${C.blue}" opacity="0.92"/>`);
  }
  const pts = linhas.map((l, i) => [xb.cx(i), py(l.pct)]);
  out.push(`<polyline points="${pts.map(p => p.map(f).join(',')).join(' ')}" fill="none" stroke="${C.green}" stroke-width="2.5" stroke-linejoin="round"/>`);
  const lblIdx = new Set([0, corteIdx - 1, corteIdx, n - 1].filter(i => i >= 0 && i < n));
  for (const i of lblIdx) {
    out.push(`<circle cx="${f(pts[i][0])}" cy="${f(pts[i][1])}" r="3.5" fill="${C.green}"/>`);
    const pctTxt = `${(linhas[i].pct * 100).toFixed(1).replace('.', ',').replace(',0', '')}%`;
    // Fundo branco: quando a 1ª barra domina o gráfico o rótulo verde fica
    // por cima dela e some. Usa o halo por cópias ±1px (mesma técnica dos
    // rótulos de linha acima) — stroke branco vazaria no miolo do glifo no PDF.
    const fsPct = f(10.5 * labelScale, 1);
    const ty = pts[i][1] - Math.round(9 * labelScale);
    const base = `text-anchor="middle" font-family="Archivo" font-size="${fsPct}" font-weight="700"`;
    for (const [dx, dy] of [[-1.5, 0], [1.5, 0], [0, -1.5], [0, 1.5]]) {
      out.push(`<text x="${f(pts[i][0] + dx)}" y="${f(ty + dy)}" ${base} fill="#fff">${pctTxt}</text>`);
    }
    out.push(`<text class="vlbl g" x="${f(pts[i][0])}" y="${f(ty)}" text-anchor="middle"${labelScale === 1 ? '' : ` style="font-size:${fsPct}px;font-weight:600"`}>${pctTxt}</text>`);
  }
  // eixo ordinal: marcos a cada 5 + último (se não colidir com o marco anterior)
  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1;
    if (i !== 0 && (i + 1) % 5 !== 0 && !isLast) continue;
    if (isLast && (i + 1) % 5 !== 0 && xb.cx(i) - xb.cx(i - ((i + 1) % 5)) < 26) continue;
    out.push(`<text class="axis" x="${f(xb.cx(i))}" y="${labelY}" text-anchor="middle">${i + 1}º</text>`);
  }
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px">${out.join('\n')}</svg>`;
}

/**
 * Barras divergentes (resultado ±) × linha (saldo), escala comum com linha de zero.
 * rows: [{ label, bar, line }] — bar pode ser negativa.
 */
export function divergingChart({ rows, W = 1184, H = 240 }) {
  const top = 10, bottomAxis = H - 22, labelY = H - 6;
  const n = rows.length;
  const xb = xBand(n, W);
  const lo = Math.min(0, ...rows.map(r => r.bar));
  const hi = Math.max(0, ...rows.map(r => r.bar), ...rows.map(r => r.line));
  const step = Math.pow(10, Math.max(0, Math.floor(Math.log10(hi - lo || 1)) - 1));
  const hiN = ceilTo(hi * 1.06, step) || step;
  const loN = lo < 0 ? -ceilTo(-lo * 1.06, step) : 0;
  const y = (v) => bottomAxis - ((v - loN) / (hiN - loN)) * (bottomAxis - top);
  const zeroY = y(0);
  const out = [];
  for (const gY of [top, (top + zeroY) / 2, zeroY, (zeroY + bottomAxis) / 2]) {
    out.push(`<line x1="0" y1="${f(gY)}" x2="${W}" y2="${f(gY)}" stroke="${gY === zeroY ? '#C9D2DB' : C.grid}" stroke-width="${gY === zeroY ? 1.5 : 1}"/>`);
  }
  for (let i = 0; i < n; i++) {
    const v = rows[i].bar;
    if (!v) continue;
    const yV = y(v);
    out.push(`<rect x="${f(xb.cx(i) - xb.barW / 2)}" y="${f(Math.min(yV, zeroY))}" width="${f(xb.barW)}" height="${f(Math.abs(zeroY - yV))}" rx="3" fill="${v >= 0 ? C.green : C.red}" opacity="0.9"/>`);
  }
  const pts = rows.map((r, i) => [xb.cx(i), y(r.line)]);
  out.push(`<polyline points="${pts.map(p => p.map(f).join(',')).join(' ')}" fill="none" stroke="${C.blue}" stroke-width="3" stroke-linejoin="round"/>`);
  for (const p of pts) out.push(`<circle cx="${f(p[0])}" cy="${f(p[1])}" r="4" fill="${C.blue}"/>`);
  const dense = n > 14;
  const lblW = Math.max(...rows.map(r => String(r.label).length), 1) * (dense ? 4.6 : 6) + 8;
  const axEvery = Math.max(1, Math.ceil(lblW / xb.step));
  let lastAx = -Infinity;
  for (let i = 0; i < n; i++) {
    if (i === n - 1 && axEvery > 1 && xb.cx(i) - xb.cx(lastAx) < lblW) break;
    if (i !== 0 && i % axEvery !== 0 && i !== n - 1) continue;
    lastAx = i;
    out.push(`<text class="axis${dense ? ' dense' : ''}" x="${f(xb.cx(i))}" y="${labelY}" text-anchor="middle">${esc(rows[i].label)}</text>`);
  }
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px">${out.join('\n')}</svg>`;
}

/**
 * Donut condicional (CONVENCOES): 1 categoria → anel pleno + total no centro;
 * várias → segmentos. A legenda é montada no HTML pela página.
 */
export function donut({ items, size = 150, stroke = 34, center = [], palette = [C.green, C.blue, C.greenLight, C.slate] }) {
  const r = (size - stroke) / 2, c = size / 2, circ = 2 * Math.PI * r;
  const total = items.reduce((a, x) => a + x.value, 0);
  let arcs = '';
  if (items.length <= 1) {
    arcs = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${items[0]?.color ?? palette[0]}" stroke-width="${stroke}"/>`;
  } else {
    let acc = 0;
    for (let i = 0; i < items.length; i++) {
      const frac = total ? items[i].value / total : 0;
      const len = frac * circ;
      arcs += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${items[i].color ?? palette[i % palette.length]}" stroke-width="${stroke}"
        stroke-dasharray="${f(len, 2)} ${f(circ - len, 2)}" stroke-dashoffset="${f(-acc * circ, 2)}" transform="rotate(-90 ${c} ${c})"/>`;
      acc += frac;
    }
  }
  // centro: fonte do valor cai se o texto for longo demais para o furo do anel
  const hole = size - 2 * stroke;
  const fs0 = Math.min(18.5, (hole - 12) / (String(center[0] ?? '').length * 0.58 || 1));
  const cx = center.map((t, i) => {
    const fs = i === 0 ? f(fs0, 1) : 10.5;
    const dy = c - (center.length - 1) * 8 + i * 18;
    return `<text x="${c}" y="${dy}" text-anchor="middle" font-size="${fs}" font-weight="${i === 0 ? 800 : 600}" fill="${i === 0 ? C.blue : C.muted}">${esc(t)}</text>`;
  }).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${arcs}${cx}</svg>`;
}
