// p.13b — Relatório de Custeio · Composição Custos Fixos × Variáveis
import { pageShell } from '../lib/shell.mjs';
import { stackedPctChart, C } from '../lib/svg.mjs';
import { fmt2, fmtPct, mesAbrev, kickerPeriodo } from '../lib/fmt.mjs';

export function render({ model, ctx }) {
  const { meta, desembolso: d } = model;
  const crossYear = new Date(meta.ini).getUTCFullYear() !== new Date(meta.fim).getUTCFullYear();
  const mesLbl = (ym) => crossYear ? `${mesAbrev(ym)}/${ym.slice(2, 4)}` : mesAbrev(ym);
  const c = d.custeio;

  const stack = stackedPctChart({
    rows: d.mensalCfCv.map(m => ({ label: mesLbl(m.mes), a: m.cf, b: m.cv })),
    W: 1184, H: 290, labelScale: 1.3,
  });

  const [pctCf, pctCv] = d.cf.relacao;

  const extraCss = `
    .kpi { border-top-color: var(--green); }
    
    .chart2 { margin-top: 14px; }
    .chart-title { display: flex; align-items: center; justify-content: space-between; }
    .legend { display: flex; gap: 14px; font-size:12px; color: var(--ink); font-weight: 600; text-transform: none; letter-spacing: 0; }
    .legend .sw { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
    .legend .sw.g { background: ${C.green}; }
    .legend .sw.gl { background: ${C.greenLight}; }
    .seglbl { font-family: 'Archivo'; font-size:10.5px; font-weight: 700; fill: #fff; }
    .comp-card { margin: 14px 48px 10px 48px; padding: 12px 18px 14px 18px; background: #fff; border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 1px 2px rgba(18,38,58,.03), 0 2px 8px rgba(18,38,58,.04); }
    .comp-row { display: flex; align-items: center; gap: 10px; margin: 14px 6px 0 6px; font-size:12.5px; }
    .comp-bar { flex: 1; height: 30px; border-radius: 6px; overflow: hidden; display: flex; }
    .comp-bar .cf { background: ${C.green}; }
    .comp-bar .cv { background: ${C.greenLight}; }
    .comp-totals { display: flex; justify-content: space-between; margin: 10px 6px 0 6px; font-size:13.5px; color: var(--ink); }
    .comp-totals .cf-t, .comp-totals .cv-t { font-weight: 700; }
    .comp-note { font-size:10.5px; color: var(--muted); font-style: italic; margin: 8px 6px 0 6px; }
  `;

  const body = `
  <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
    <div class="kpi"><div class="lbl">CF + CV no período</div><div class="val"><small>R$</small> ${fmt2(d.cf.cfcvTotal)}</div></div>
    <div class="kpi"><div class="lbl">Custos Fixos</div><div class="val"><small>R$</small> ${fmt2(d.cf.total)}</div></div>
    <div class="kpi"><div class="lbl">Custos Variáveis</div><div class="val"><small>R$</small> ${fmt2(d.cf.cvTotal)}</div></div>
    <div class="kpi"><div class="lbl">Relação CF × CV</div><div class="val">${Math.round(pctCf * 100)} <small>:</small> ${Math.round(pctCv * 100)}</div></div>
  </div>

  <div class="chart2">
    <div class="chart-title">
      Custos Fixos × Custos Variáveis por mês
      <span class="legend"><span><span class="sw g"></span>Custos Fixos</span><span><span class="sw gl"></span>Custos Variáveis</span></span>
    </div>
    ${stack}
  </div>

  <div class="comp-card">
    <div class="chart-title">Composição do período</div>
    <div class="comp-row">
      <div class="comp-bar">
        <div class="cf" style="width:${(pctCf * 100).toFixed(1)}%"></div>
        <div class="cv" style="width:${(pctCv * 100).toFixed(1)}%"></div>
      </div>
    </div>
    <div class="comp-totals">
      <span class="cf-t">CF · R$ ${fmt2(d.cf.total)} · ${fmtPct(pctCf)}</span>
      <span class="cv-t">CV · R$ ${fmt2(d.cf.cvTotal)} · ${fmtPct(pctCv)}</span>
    </div>
    <div class="comp-note">
      A proporção considera somente Custos Fixos e Variáveis. Compra de Gado, Investimentos e demais tipos entram no Desembolso Total mas não neste gráfico.
    </div>
  </div>`;

  return pageShell({
    kicker: kickerPeriodo(meta.ini, meta.fim),
    title: 'Relatório de Custeio · Composição Fixos × Variáveis',
    pageNum: ctx.pageNum ?? 18, logoSrc: ctx.logoSrc, fazenda: ctx.fazendaNome, body, extraCss,
  });
}
