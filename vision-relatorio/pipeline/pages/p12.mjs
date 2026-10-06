// p.12 — Relatório de Desembolso · desembolso/ha mensal e custo diário × rebanho
import { pageShell } from '../lib/shell.mjs';
import { areaChart, comboChart, C } from '../lib/svg.mjs';
import { fmt2, fmtInt, mesAbrev, kickerPeriodo } from '../lib/fmt.mjs';

export function render({ model, ctx }) {
  const { meta, desembolso: d } = model;
  const crossYear = new Date(meta.ini).getUTCFullYear() !== new Date(meta.fim).getUTCFullYear();
  const mesLbl = (ym) => crossYear ? `${mesAbrev(ym)}/${ym.slice(2, 4)}` : mesAbrev(ym);

  const area = areaChart({
    labels: d.mensal.map(m => mesLbl(m.mes)),
    values: d.mensal.map(m => m.porHa),
    W: 1184, H: 185, color: C.blue, labelFmt: (v) => `R$ ${fmt2(v)}`, labelScale: 1.3,
  });

  const combo = comboChart({
    labels: d.mensal.map(m => mesLbl(m.mes)),
    W: 1184, H: 208, labelScale: 1.3,
    bars: {
      values: d.mensal.map(m => m.custoDiariaCab),
      color: C.blue, labelFmt: (v) => `R$ ${fmt2(v)}`, labelInside: true,
    },
    line: {
      values: d.mensal.map(m => m.rebMedio || null),
      color: C.green, labelFmt: (v) => fmtInt(v), labelBelow: true,
    },
  });

  const extraCss = `
    .kpi { border-top-color: var(--blue); }
    
    .chart2 { margin-top: 14px; flex: 1; }
    .chart-title { display: flex; align-items: center; justify-content: space-between; }
    .legend { display: flex; gap: 14px; font-size:12px; color: var(--ink); font-weight: 600; text-transform: none; letter-spacing: 0; }
    .legend .sw { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
    .legend .sw.b { background: var(--blue); }
    .legend .sw.g { background: var(--green); }
  `;

  const body = `
  <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
    <div class="kpi"><div class="lbl">Desembolso Total</div><div class="val"><small>R$</small> ${fmt2(d.total)}</div></div>
    <div class="kpi"><div class="lbl">Despesa Média Mensal</div><div class="val"><small>R$</small> ${fmt2(d.mediaMensal)}</div></div>
    <div class="kpi"><div class="lbl">Desembolso por ha/mês</div><div class="val"><small>R$</small> ${fmt2(d.porHaMes)}</div></div>
    <div class="kpi"><div class="lbl">Custo Diária/cab</div><div class="val"><small>R$</small> ${fmt2(d.custoDiariaCab)}</div></div>
  </div>

  <div class="chart1">
    <div class="chart-title">Desembolso por hectare por mês</div>
    ${area}
  </div>

  <div class="chart2">
    <div class="chart-title">
      Custo diário por cabeça × rebanho médio
      <span class="legend"><span><span class="sw b"></span>Custo Diária/cab</span><span><span class="sw g"></span>Rebanho Médio</span></span>
    </div>
    ${combo}
  </div>`;

  return pageShell({
    kicker: kickerPeriodo(meta.ini, meta.fim),
    title: 'Relatório de Desembolso · Custos por ha',
    pageNum: ctx.pageNum ?? 16, logoSrc: ctx.logoSrc, fazenda: ctx.fazendaNome, body, extraCss,
  });
}
