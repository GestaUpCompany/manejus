// p.4 — Compra de Animais
import { pageShell } from '../lib/shell.mjs';
import { areaChart, comboChart, donut, C } from '../lib/svg.mjs';
import { fmtInt, fmt1, fmt2, mesAbrev, kickerPeriodo, esc } from '../lib/fmt.mjs';

const catLabel = (c) => c.replace(' - ', ' · ');
const DONUT_COLORS = [C.green, C.blue, C.greenLight, C.slate, '#5B6B7B'];

export function render({ model, ctx }) {
  const { meta, compras } = model;

  const area = areaChart({
    labels: compras.mensal.map(m => mesAbrev(m.mes)),
    values: compras.mensal.map(m => m.cab),
    W: 1184, H: 190, color: C.green, labelFmt: fmtInt,
  });

  const cats = compras.porCategoria;
  const bars = comboChart({
    labels: cats.map(c => catLabel(c.categoria)),
    W: 690, H: 190,
    bars: { values: cats.map(c => c.cab), color: C.blue, labelFmt: fmtInt, labelInside: false },
  });

  const tipos = compras.porTipo.filter(t => t.cab > 0);
  const donutSvg = donut({
    items: tipos.map((t, i) => ({ value: t.cab, color: DONUT_COLORS[i % DONUT_COLORS.length] })),
    size: 190, stroke: 30,
    center: tipos.length === 1
      ? [fmtInt(compras.cab), `${tipos[0].tipo} · 100%`]
      : [fmtInt(compras.cab), `${tipos.length} tipos`],
  });
  const donutLegend = tipos.length > 1
    ? `<div class="dlegend">${tipos.map((t, i) =>
        `<div class="ditem"><span class="dot" style="background:${DONUT_COLORS[i % DONUT_COLORS.length]}"></span>${esc(t.tipo)}<b>${fmtInt(t.cab)} · ${fmt1(100 * t.cab / compras.cab)}%</b></div>`).join('')}</div>`
    : '';
  const donutBlock = `<div class="donut-wrap">${donutSvg}${donutLegend}</div>`;

  const extraCss = `
    .chart1 { padding: 2px 48px 4px 48px; }
    .chart-row { display: grid; grid-template-columns: 1.35fr 1fr; gap: 24px; padding: 6px 48px 0 48px; flex: 1; }
    .donut-wrap { display: flex; align-items: center; justify-content: center; gap: 18px; }
    .dlegend { display: flex; flex-direction: column; gap: 6px; }
    .ditem { font-size: 11.5px; color: var(--ink); font-weight: 600; }
    .ditem .dot { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 7px; }
    .ditem b { color: var(--blue); margin-left: 6px; }
  `;

  const body = `
  <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
    <div class="kpi"><div class="lbl">N° de Animais</div><div class="val">${fmtInt(compras.cab)} <small>cab</small></div></div>
    <div class="kpi"><div class="lbl">Média R$/@</div><div class="val"><small>R$</small> ${fmt2(compras.rsAt)}</div></div>
    <div class="kpi"><div class="lbl">Média R$/kg</div><div class="val"><small>R$</small> ${fmt2(compras.rsKg)}</div></div>
    <div class="kpi"><div class="lbl">Média R$/cab</div><div class="val"><small>R$</small> ${fmt2(compras.rsCab)}</div></div>
  </div>

  <div class="chart1">
    <div class="chart-title">N° de cabeças compradas por mês<span class="legend"><span><span class="sw line" style="background:${C.green}"></span>Cabeças</span></span></div>
    ${area}
  </div>

  <div class="chart-row">
    <div>
      <div class="chart-title">Cabeças por categoria<span class="legend"><span><span class="sw bar"></span>Cabeças</span></span></div>
      ${bars}
    </div>
    <div>
      <div class="chart-title">Distribuição por tipo de compra</div>
      ${donutBlock}
    </div>
  </div>`;

  return pageShell({
    kicker: kickerPeriodo(meta.ini, meta.fim),
    title: 'Compra de Animais',
    pageNum: 4, logoSrc: ctx.logoSrc, body, extraCss,
  });
}
