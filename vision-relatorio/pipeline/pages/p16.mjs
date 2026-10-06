// p.16 — Receitas por Tipo · faturamento por cabeça × rebanho médio
import { pageShell } from '../lib/shell.mjs';
import { comboChart, C } from '../lib/svg.mjs';
import { fmt2, fmtPct, fmtMoney, fmtInt, mesAbrev, kickerPeriodo, esc } from '../lib/fmt.mjs';

export function render({ model, ctx }) {
  const { meta, receitas: r } = model;
  const crossYear = new Date(meta.ini).getUTCFullYear() !== new Date(meta.fim).getUTCFullYear();
  const mesLbl = (ym) => crossYear ? `${mesAbrev(ym)}/${ym.slice(2, 4)}` : mesAbrev(ym);

  const bars = comboChart({
    labels: r.mensal.map(m => mesLbl(m.mes)),
    W: 640, H: 215, labelScale: 1.3,
    bars: {
      values: r.mensal.map(m => m.porHa),
      color: C.green, labelFmt: (v) => `R$ ${fmt2(v)}`, labelInside: false,
    },
  });

  const combo = comboChart({
    labels: r.mensal.map(m => mesLbl(m.mes)),
    W: 1184, H: 185, labelScale: 1.3,
    bars: {
      values: r.mensal.map(m => m.rebMedio ? m.valor / m.rebMedio : 0),
      color: C.blue, labelFmt: (v) => `R$ ${fmt2(v)}`, labelInside: true,
    },
    line: {
      values: r.mensal.map(m => m.rebMedio || null),
      color: C.green, labelFmt: (v) => fmtInt(v), labelBelow: true,
    },
  });

  const palette = [C.green, C.blue, C.greenLight, C.slate, C.muted];
  const tipos = r.porTipo;
  const tipoLbl = (t) => esc(String(t.tipo).replace(/_/g, ' ').replace(/^Receitas /i, ''));
  const tbar = `<div class="tbar">${tipos.map((t, i) =>
    `<span style="width:${(100 * t.valor / r.total).toFixed(2)}%;background:${palette[i % palette.length]}"></span>`).join('')}</div>`;
  const trows = tipos.map((t, i) =>
    `<div class="trow"><i style="background:${palette[i % palette.length]}"></i>` +
    `<span class="t-name">${tipoLbl(t)}</span><span class="t-val">${fmtMoney(t.valor)} · ${fmtPct(t.valor / r.total)}</span></div>`).join('');

  const extraCss = `
    .kpi { border-top-color: var(--green); }
    .content { display: grid; grid-template-columns: 1.35fr 1fr; gap: 26px; padding: 0 48px; }
    .content > div { display: flex; flex-direction: column; }
    .chart2 { margin-top: 14px; flex: 1; }
    .chart-title { justify-content: space-between; }
    .legend { display: flex; gap: 14px; font-size:12px; color: var(--ink); font-weight: 600; text-transform: none; letter-spacing: 0; }
    .legend .sw { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
    .legend .sw.b { background: var(--blue); }
    .legend .sw.g { background: var(--green); }
    .tipo-panel .t-lbl { font-size:10.5px; font-weight: 700; letter-spacing: 1.2px; color: var(--muted); text-transform: uppercase; margin-bottom: 12px; }
    .tbar { display: flex; height: 14px; border-radius: 5px; overflow: hidden; }
    .tbar span { display: block; height: 100%; }
    .trow { display: flex; align-items: center; gap: 8px; margin-top: 9px; font-size:12.5px; }
    .trow i { width: 9px; height: 9px; border-radius: 3px; flex-shrink: 0; }
    .trow .t-name { font-weight: 600; color: var(--ink); }
    .trow .t-val { margin-left: auto; color: var(--muted); font-variant-numeric: tabular-nums; }
  `;

  const body = `
  <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
    <div class="kpi"><div class="lbl">Receita Total</div><div class="val"><small>R$</small> ${fmt2(r.total)}</div></div>
    <div class="kpi"><div class="lbl">Faturamento Médio Mensal</div><div class="val"><small>R$</small> ${fmt2(r.mediaMensal)}</div></div>
    <div class="kpi"><div class="lbl">Faturamento por ha</div><div class="val"><small>R$</small> ${fmt2(r.porHa)}</div></div>
    <div class="kpi"><div class="lbl">Faturamento por cab.</div><div class="val"><small>R$</small> ${fmt2(r.porCab)}</div></div>
  </div>

  <div class="content">
    <div>
      <div class="chart-title">Faturamento por hectare por mês</div>
      ${bars}
    </div>
    <div class="tipo-panel"><div class="t-lbl">Faturamento por tipo de receita</div>${tbar}${trows}</div>
  </div>

  <div class="chart2">
    <div class="chart-title">
      Faturamento por cabeça × rebanho médio
      <span class="legend"><span><span class="sw b"></span>Faturamento/cab</span><span><span class="sw g"></span>Rebanho Médio</span></span>
    </div>
    ${combo}
  </div>`;

  return pageShell({
    kicker: kickerPeriodo(meta.ini, meta.fim),
    title: 'Receitas por Tipo',
    pageNum: ctx.pageNum ?? 21, logoSrc: ctx.logoSrc, fazenda: ctx.fazendaNome, body, extraCss,
  });
}
