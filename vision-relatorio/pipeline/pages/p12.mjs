// p.12 — Relatório de Desembolso · CF × CV e desembolso/ha mensal
import { pageShell } from '../lib/shell.mjs';
import { areaChart, stackedPctChart, C } from '../lib/svg.mjs';
import { fmt2, fmtPct, mesAbrev, kickerPeriodo, esc } from '../lib/fmt.mjs';

export function render({ model, ctx }) {
  const { meta, desembolso: d } = model;
  const crossYear = new Date(meta.ini).getUTCFullYear() !== new Date(meta.fim).getUTCFullYear();
  const mesLbl = (ym) => crossYear ? `${mesAbrev(ym)}/${ym.slice(2, 4)}` : mesAbrev(ym);

  const area = areaChart({
    labels: d.mensal.map(m => mesLbl(m.mes)),
    values: d.mensal.map(m => m.porHa),
    W: 1184, H: 185, color: C.blue, labelFmt: (v) => `R$ ${fmt2(v)}`, labelScale: 1.3,
  });

  const stack = stackedPctChart({
    rows: d.mensalCfCv.map(m => ({ label: mesLbl(m.mes), a: m.cf, b: m.cv })),
    W: 720, H: 190, labelScale: 1.3,
  });

  const [pctCf, pctCv] = d.cf.relacao;

  const extraCss = `
    .kpi { border-top-color: var(--blue); }
    .chart1 { padding: 0 48px 10px 48px; }
    .chart-row { display: grid; grid-template-columns: 1.5fr 1fr; gap: 26px; padding: 14px 48px 0 48px; flex: 1; }
    .chart-title { display: flex; align-items: center; justify-content: space-between; }
    .legend { display: flex; gap: 14px; font-size:12px; color: var(--ink); font-weight: 600; text-transform: none; letter-spacing: 0; }
    .legend .sw { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
    .legend .sw.g { background: ${C.green}; }
    .legend .sw.gl { background: ${C.greenLight}; }
    .seglbl { font-family: 'Archivo'; font-size:10.5px; font-weight: 700; fill: #fff; }
    .comp-row { display: flex; align-items: center; gap: 10px; margin: 14px 6px 0 6px; font-size:12.5px; }
    .comp-bar { flex: 1; height: 26px; border-radius: 6px; overflow: hidden; display: flex; }
    .comp-bar .cf { background: ${C.green}; }
    .comp-bar .cv { background: ${C.greenLight}; }
    .comp-totals { display: flex; justify-content: space-between; margin: 8px 6px 0 6px; font-size:12.5px; color: var(--ink); }
    .comp-totals .cf-t, .comp-totals .cv-t { font-weight: 700; }
    .comp-note { font-size:10.5px; color: var(--muted); font-style: italic; margin: 8px 6px 0 6px; }
  `;

  const body = `
  <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
    <div class="kpi"><div class="lbl">Desembolso Total</div><div class="val"><small>R$</small> ${fmt2(d.total)}</div></div>
    <div class="kpi"><div class="lbl">Despesa Média Mensal</div><div class="val"><small>R$</small> ${fmt2(d.mediaMensal)}</div></div>
    <div class="kpi"><div class="lbl">Relação CF × CV</div><div class="val">${Math.round(pctCf * 100)} <small>:</small> ${Math.round(pctCv * 100)}</div></div>
    <div class="kpi"><div class="lbl">CF + CV no período</div><div class="val"><small>R$</small> ${fmt2(d.cf.cfcvTotal)}</div></div>
  </div>

  <div class="chart1">
    <div class="chart-title">Desembolso por hectare por mês</div>
    ${area}
  </div>

  <div class="chart-row">
    <div>
      <div class="chart-title">
        Custos Fixos × Custos Variáveis por mês
        <span class="legend"><span><span class="sw g"></span>Custos Fixos</span><span><span class="sw gl"></span>Custos Variáveis</span></span>
      </div>
      ${stack}
    </div>
    <div>
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
    </div>
  </div>`;

  return pageShell({
    kicker: kickerPeriodo(meta.ini, meta.fim),
    title: 'Relatório de Desembolso · Custos por ha',
    pageNum: 12, logoSrc: ctx.logoSrc, fazenda: ctx.fazendaNome, body, extraCss,
  });
}
