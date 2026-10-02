// p.6 — Vendas de Animais · Abate
import { pageShell } from '../lib/shell.mjs';
import { comboChart, C } from '../lib/svg.mjs';
import { fmtInt, fmt1, fmt2, fmtPct, mesAbrev, kickerPeriodo, esc } from '../lib/fmt.mjs';

export function render({ model, ctx }) {
  const { meta, vendasAbate: v } = model;

  const comboMes = comboChart({
    labels: v.mensal.map(m => mesAbrev(m.mes)),
    W: 1184, H: 195,
    bars: { values: v.mensal.map(m => m.cab), color: C.blue, labelFmt: fmtInt, labelInside: false },
    line: { values: v.mensal.map(m => m.rsAt), color: C.green, labelFmt: (x) => `R$ ${fmtInt(x)}` },
  });

  // eixo truncado quando a variação entre empresas é pequena (<25% do máximo)
  const emps = v.porEmpresa;
  const rsVals = emps.map(e => e.rsAt);
  const [mn, mx] = [Math.min(...rsVals), Math.max(...rsVals)];
  const trunc = mn > 0 && (mx - mn) / mx < 0.25;
  const domain = trunc ? [Math.floor((mn - (mx - mn)) / 10) * 10, Math.ceil(mx * 1.02 / 10) * 10] : null;
  const comboEmp = comboChart({
    labels: emps.map(e => e.empresa),
    W: 620, H: 195,
    bars: { values: rsVals, color: C.blue, labelFmt: (x) => `R$ ${fmt2(x)}`, labelInside: false, domain },
    line: { values: emps.map(e => e.rendCarc), color: C.green, labelFmt: (x) => fmtPct(x) },
  });

  const maxCab = Math.max(...emps.map(e => e.cab), 1);
  const nLotes = emps.reduce((a, e) => a + e.lotes, 0);
  const miniRows = emps.map(e => `<tr><td>${esc(e.empresa)}</td><td>${fmtInt(e.cab)}</td>` +
    `<td><span class="bar" style="width:${Math.round(e.cab / maxCab * 60)}px"></span> ${fmtInt(100 * e.cab / v.cab)}%</td>` +
    `<td>${fmt2(e.rsAt)}</td><td>${fmtPct(e.rendCarc)}</td></tr>`).join('');

  const extraCss = `
    .chart1 { padding: 2px 48px 4px 48px; }
    .chart-row { display: grid; grid-template-columns: 1.15fr 1fr; gap: 28px; padding: 6px 48px 0 48px; flex: 1; }
    .axis-note { font-size: 9.5px; color: var(--muted); font-style: italic; margin-top: -2px; }
    .mini-table { font-size: 11.5px; border-collapse: collapse; width: 100%; margin-top: 6px; }
    .mini-table th { font-size: 9.5px; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); font-weight: 700; text-align: right; padding: 4px 6px; border-bottom: 1.5px solid var(--blue); }
    .mini-table th:first-child { text-align: left; }
    .mini-table td { padding: 7px 6px; border-bottom: 1px solid var(--line); text-align: right; color: var(--ink); }
    .mini-table td:first-child { text-align: left; font-weight: 600; }
    .mini-table .bar { height: 5px; border-radius: 3px; background: var(--green); display: inline-block; vertical-align: 1px; }
  `;

  const body = `
  <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
    <div class="kpi"><div class="lbl">N° de Cabeças</div><div class="val">${fmtInt(v.cab)} <small>cab</small></div></div>
    <div class="kpi"><div class="lbl">Média R$/@</div><div class="val"><small>R$</small> ${fmt2(v.rsAt)}</div></div>
    <div class="kpi"><div class="lbl">Média R$/kg</div><div class="val"><small>R$</small> ${fmt2(v.rsKg)}</div></div>
  </div>

  <div class="chart1">
    <div class="chart-title">Cabeças vendidas e preço médio por mês
      <span class="legend"><span><span class="sw bar"></span>Cabeças</span><span><span class="sw line"></span>Média R$/@</span></span></div>
    ${comboMes}
  </div>

  <div class="chart-row">
    <div>
      <div class="chart-title">Preço e rendimento de carcaça por frigorífico
        <span class="legend"><span><span class="sw bar"></span>R$/@</span><span><span class="sw line"></span>RC%</span></span></div>
      ${comboEmp}
      ${domain ? `<div class="axis-note">Eixo R$/@ truncado em ${fmtInt(domain[0])} para evidenciar a diferença entre empresas.</div>` : ''}
    </div>
    <div>
      <div class="chart-title">Volume por empresa</div>
      <table class="mini-table">
        <thead><tr><th>Frigorífico</th><th>Cab.</th><th>%</th><th>R$/@</th><th>RC%</th></tr></thead>
        <tbody>${miniRows}</tbody>
      </table>
      <div class="axis-note" style="margin-top:10px">${fmtInt(v.cab)} cabeças em ${nLotes} lotes · RC% = rendimento de carcaça médio.</div>
    </div>
  </div>`;

  return pageShell({
    kicker: kickerPeriodo(meta.ini, meta.fim),
    title: 'Vendas de Animais · Abate',
    pageNum: 6, logoSrc: ctx.logoSrc, body, extraCss,
  });
}
