// p.12 — Relatório de Desembolso · desembolso/ha mensal
import { pageShell } from '../lib/shell.mjs';
import { areaChart, C } from '../lib/svg.mjs';
import { fmt2, mesAbrev, kickerPeriodo } from '../lib/fmt.mjs';

export function render({ model, ctx }) {
  const { meta, desembolso: d } = model;
  const fin = meta.modo === 'financeiro';
  const crossYear = new Date(meta.ini).getUTCFullYear() !== new Date(meta.fim).getUTCFullYear();
  const mesLbl = (ym) => crossYear ? `${mesAbrev(ym)}/${ym.slice(2, 4)}` : mesAbrev(ym);

  const area = areaChart({
    labels: d.mensal.map(m => mesLbl(m.mes)),
    values: d.mensal.map(m => m.porHa),
    W: 1184, H: fin ? 440 : 185, color: C.blue, labelFmt: (v) => `R$ ${fmt2(v)}`, labelScale: 1.3,
  });

  const extraCss = `
    .kpi { border-top-color: var(--blue); }
    .chart-title { display: flex; align-items: center; justify-content: space-between; }
  `;

  const body = `
  <div class="kpis" style="grid-template-columns:repeat(3,1fr)">
    <div class="kpi"><div class="lbl">Desembolso Total</div><div class="val"><small>R$</small> ${fmt2(d.total)}</div></div>
    <div class="kpi"><div class="lbl">Despesa Média Mensal</div><div class="val"><small>R$</small> ${fmt2(d.mediaMensal)}</div></div>
    <div class="kpi"><div class="lbl">Desembolso por ha/mês</div><div class="val"><small>R$</small> ${fmt2(d.porHaMes)}</div></div>
  </div>

  <div class="chart1">
    <div class="chart-title">Desembolso por hectare por mês</div>
    ${area}
  </div>`;

  return pageShell({
    kicker: kickerPeriodo(meta.ini, meta.fim),
    title: 'Relatório de Desembolso · Custos por ha',
    pageNum: ctx.pageNum ?? 16, logoSrc: ctx.logoSrc, fazenda: ctx.fazendaNome, body, extraCss,
  });
}
