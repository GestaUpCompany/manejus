// p.14 — Análise de Pareto (base exclui Compra de Gado; corte = 1º plano a fechar ≥80%)
import { pageShell } from '../lib/shell.mjs';
import { paretoChart } from '../lib/svg.mjs';
import { fmt2, fmtPct, kickerPeriodo, esc } from '../lib/fmt.mjs';

export function render({ model, ctx }) {
  const { meta, pareto: p } = model;

  const top = p.linhas.slice(0, 8);
  const demaisN = p.linhas.length - top.length;
  const demaisV = p.linhas.slice(8).reduce((a, r) => a + r.valor, 0);
  const rows = top.map((l, i) =>
    `<tr${i === p.corteIdx ? ' class="cut"' : ''}><td>${i + 1}</td><td>${esc(String(l.plano).replace(/_/g, ' '))}</td><td>${fmt2(l.valor)}</td><td>${fmt2(l.acum)}</td><td>${fmtPct(l.pct)}</td></tr>`
  ).join('') + (demaisN > 0
    ? `<tr class="demais"><td></td><td>Demais ${demaisN} planos de contas</td><td>${fmt2(demaisV)}</td><td>${fmt2(p.base)}</td><td>100,0%</td></tr>` : '');

  const extraCss = `
    .kpi { border-top-color: var(--blue); }
    .content { display: grid; grid-template-columns: 0.95fr 1.3fr; gap: 26px; padding: 4px 48px 0 48px; flex: 1; }
    .chart-title { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
    .legend { display: flex; gap: 14px; font-size: 11px; color: var(--ink); font-weight: 600; text-transform: none; letter-spacing: 0; }
    .legend .sw { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
    .legend .sw.b { background: var(--blue); }
    .legend .sw.g { background: var(--green); }
    .legend .sw.cut { background: transparent; border-top: 2px dashed var(--red); height: 0; width: 16px; border-radius: 0; }
    .vlbl.g { fill: var(--green-dark); }
    .ptable { width: 100%; border-collapse: collapse; font-size: 11.5px; }
    .ptable th { font-size: 9.5px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); text-align: right; padding: 5px 8px; border-bottom: 1.5px solid var(--blue); }
    .ptable th:first-child, .ptable th:nth-child(2) { text-align: left; }
    .ptable td { padding: 6.5px 8px; border-bottom: 1px solid var(--line); color: var(--ink); }
    .ptable td:first-child { text-align: center; color: var(--muted); font-weight: 700; width: 24px; }
    .ptable td:nth-child(3), .ptable td:nth-child(4), .ptable td:last-child { text-align: right; }
    .ptable tr.cut td { background: #FDF3F2; }
    .ptable tr.demais td { color: var(--muted); font-style: italic; }
    .cut-note { font-size: 9.5px; color: var(--muted); font-style: italic; margin-top: 6px; padding-left: 4px; }
  `;

  const body = `
  <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
    <div class="kpi"><div class="lbl">Base do Pareto (sem Compra de Gado)</div><div class="val"><small>R$</small> ${fmt2(p.base)}</div></div>
    <div class="kpi"><div class="lbl">Corte de 80% do Desembolso</div><div class="val"><small>R$</small> ${fmt2(p.val80)}</div></div>
    <div class="kpi"><div class="lbl">% Plano de Contas</div><div class="val">${fmtPct(p.pctPlanos)}</div></div>
    <div class="kpi"><div class="lbl">Planos no corte</div><div class="val">${p.corteIdx + 1}<small> de ${p.planosDistintos}</small></div></div>
  </div>

  <div class="content">
    <div>
      <div class="chart-title">Pareto por plano de contas</div>
      <table class="ptable">
        <thead><tr><th>#</th><th>Plano de Contas</th><th>Desembolso R$</th><th>Acumulado R$</th><th>% Pareto</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="cut-note">Linha destacada: plano que fecha o corte de 80% acumulado (o primeiro a passar dos 80%).</div>
    </div>
    <div>
      <div class="chart-title">
        Desembolso × % acumulado
        <span class="legend"><span><span class="sw b"></span>Desembolso</span><span><span class="sw g"></span>% Pareto</span><span><span class="sw cut"></span>Corte 80%</span></span>
      </div>
      ${paretoChart({ linhas: p.linhas, corteIdx: p.corteIdx })}
    </div>
  </div>`;

  return pageShell({
    kicker: `${kickerPeriodo(meta.ini, meta.fim)} · Exceto Compra de Gado`,
    title: 'Análise de Pareto',
    pageNum: 14, logoSrc: ctx.logoSrc, body, extraCss,
  });
}
