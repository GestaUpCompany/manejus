// p.11 — Relatório de Desembolso (visão geral)
import { pageShell } from '../lib/shell.mjs';
import { areaChart, donut, C } from '../lib/svg.mjs';
import { fmt2, fmtPct, fmtMoney, mesAbrev, kickerPeriodo, esc } from '../lib/fmt.mjs';

const TIPO_LABEL = {
  compra_de_gado: 'Compra de Gado', custos_fixos_mensais: 'Custos Fixos',
  'custos_variáveis_mensais': 'Custos Variáveis', custos_variaveis_mensais: 'Custos Variáveis',
  'investimentos_e_estruturação': 'Investimentos', investimentos_e_estruturacao: 'Investimentos',
  impostos_e_taxas: 'Impostos e Taxas',
};
const tipoLbl = (t) => TIPO_LABEL[String(t).toLowerCase()] ?? t.replace(/_/g, ' ');
const TAG = [
  [/compra/i, 'cg', 'Compra'], [/fixos/i, 'cf', 'Fixo'], [/vari/i, 'cv', 'Var.'],
  [/invest/i, 'inv', 'Inv.'], [/impost/i, 'imp', 'Imp.'], [/financeir/i, 'fin', 'Fin.'],
];
const tagOf = (t) => TAG.find(([re]) => re.test(t)) ?? ['', 'x', 'Outros'];

export function render({ model, ctx }) {
  const { meta, desembolso: d } = model;
  const crossYear = new Date(meta.ini).getUTCFullYear() !== new Date(meta.fim).getUTCFullYear();
  const mesLbl = (ym) => crossYear ? `${mesAbrev(ym)}/${ym.slice(2, 4)}` : mesAbrev(ym);

  const area = areaChart({
    labels: d.mensal.map(m => mesLbl(m.mes)),
    values: d.mensal.map(m => m.valor),
    W: 1184, H: 160, color: C.blue, labelFmt: fmtMoney, labelScale: 1.3,
  });

  const palette = [C.blue, C.green, C.greenLight, C.slate, C.muted];
  const dn = donut({
    items: d.porTipo.map(t => ({ value: t.valor })), size: 160, stroke: 17, palette,
    center: d.porTipo.length === 1
      ? [fmtMoney(d.total), `${tipoLbl(d.porTipo[0].tipo)} · 100%`]
      : [fmtMoney(d.total), 'desembolso total'],
  });
  const legenda = d.porTipo.length > 1
    ? `<div class="dlegend">${d.porTipo.map((t, i) =>
        `<span><i style="background:${palette[i % palette.length]}"></i>${esc(tipoLbl(t.tipo))}<em>${fmtPct(t.pct)}</em></span>`).join('')}</div>`
    : '';

  const top = d.rankingPlanos.slice(0, 8);
  const demais = d.rankingPlanos.slice(8).reduce((a, r) => a + r.valor, 0);
  const rankRows = top.map((r, i) => {
    const [, cls, lbl] = tagOf(r.tipo);
    return `<tr><td>${i + 1}</td><td>${esc(String(r.plano).replace(/_/g, ' '))}</td><td><span class="tag ${cls}">${lbl}</span></td><td>${fmt2(r.valor)}</td><td>${fmtPct(r.valor / d.total)}</td></tr>`;
  }).join('') + (demais > 0
    ? `<tr class="demais"><td></td><td>Demais planos de contas</td><td>—</td><td>${fmt2(demais)}</td><td>${fmtPct(demais / d.total)}</td></tr>` : '');

  const extraCss = `
    .kpi { border-top-color: var(--blue); }
    
    .chart-row { display: grid; grid-template-columns: 1fr 1.25fr; gap: 24px; padding: 14px 48px 0 48px; flex: 1; }
    .chart-row > div:first-child { display: flex; flex-direction: column; }
    .donut-wrap { display: flex; align-items: center; gap: 18px; margin-top: auto; margin-bottom: auto; }
    .dlegend { display: flex; flex-direction: column; gap: 8px; font-size:12.5px; font-weight: 600; color: var(--ink); }
    .dlegend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; }
    .dlegend em { font-style: normal; color: var(--muted); font-weight: 500; margin-left: 7px; }
    .rank-table { width: 100%; border-collapse: collapse; font-size:12.5px; }
    .rank-table th { font-size:10.5px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); text-align: right; padding: 4px 8px; border-bottom: 1.5px solid var(--blue); }
    .rank-table th:first-child, .rank-table th:nth-child(2) { text-align: left; }
    .rank-table td { padding: 3.5px 8px; border-bottom: 1px solid var(--line); color: var(--ink); }
    .rank-table td:first-child { text-align: center; color: var(--muted); font-weight: 700; width: 24px; }
    .rank-table td:nth-child(4), .rank-table td:last-child { text-align: right; }
    .tag { display: inline-block; font-size:10px; font-weight: 700; letter-spacing: 0.6px; padding: 1px 6px; border-radius: 4px; color: #fff; }
    .tag.cg { background: #0B3D6E; } .tag.cf { background: #17A34A; } .tag.cv { background: #7CC98A; }
    .tag.inv { background: #8FA3B5; } .tag.imp { background: #C9D2DB; color: #3D4F61; } .tag.fin { background: #5B6B7B; } .tag.x { background: #5B6B7B; }
    .rank-table tr.demais td { color: var(--muted); font-style: italic; }
  `;

  const body = `
  <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
    <div class="kpi"><div class="lbl">Desembolso Total</div><div class="val"><small>R$</small> ${fmt2(d.total)}</div></div>
    <div class="kpi"><div class="lbl">Despesa Média Mensal</div><div class="val"><small>R$</small> ${fmt2(d.mediaMensal)}</div></div>
    <div class="kpi"><div class="lbl">Desembolso por ha</div><div class="val"><small>R$</small> ${fmt2(d.porHa)}</div></div>
    <div class="kpi"><div class="lbl">Custo Diária/cab</div><div class="val"><small>R$</small> ${fmt2(d.custoDiariaCab)}</div></div>
  </div>

  <div class="chart1">
    <div class="chart-title">Desembolso mensal</div>
    ${area}
  </div>

  <div class="chart-row">
    <div>
      <div class="chart-title">Participação por tipo de custo</div>
      <div class="donut-wrap">${dn}${legenda}</div>
    </div>
    <div>
      <div class="chart-title">Principais planos de contas</div>
      <table class="rank-table">
        <thead><tr><th>#</th><th>Plano de Contas</th><th>Tipo</th><th>Total R$</th><th>%</th></tr></thead>
        <tbody>${rankRows}</tbody>
      </table>
    </div>
  </div>`;

  return pageShell({
    kicker: kickerPeriodo(meta.ini, meta.fim),
    title: 'Relatório de Desembolso',
    pageNum: 11, logoSrc: ctx.logoSrc, fazenda: ctx.fazendaNome, body, extraCss,
  });
}
