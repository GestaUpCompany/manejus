// p.16 — Receitas por Tipo e Empresa Pagante
import { pageShell } from '../lib/shell.mjs';
import { comboChart, donut, C } from '../lib/svg.mjs';
import { fmt2, fmtPct, fmtMoney, fmtData, mesAbrev, kickerPeriodo, esc } from '../lib/fmt.mjs';

export function render({ model, ctx }) {
  const { meta, receitas: r } = model;
  const crossYear = new Date(meta.ini).getUTCFullYear() !== new Date(meta.fim).getUTCFullYear();
  const mesLbl = (ym) => crossYear ? `${mesAbrev(ym)}/${ym.slice(2, 4)}` : mesAbrev(ym);

  const bars = comboChart({
    labels: r.mensal.map(m => mesLbl(m.mes)),
    W: 640, H: 285, labelScale: 1.3,
    bars: {
      values: r.mensal.map(m => m.porHa),
      color: C.green, labelFmt: (v) => `R$ ${fmt2(v)}`, labelInside: false,
    },
  });

  // pivot empresa → data, com degradação: muitas linhas → só empresas; muitas empresas → top 12 + demais
  let emps = r.porEmpresa;
  const totalLinhas = emps.reduce((a, e) => a + 1 + e.lancamentos.length, 0);
  const detalha = totalLinhas <= 24;
  let demaisEmp = null;
  if (emps.length > 12) {
    demaisEmp = emps.slice(12);
    emps = emps.slice(0, 12);
  }
  const rows = emps.map(e =>
    `<tr class="emp"><td>${esc(e.empresa || 'Não informado')}</td><td class="num">${fmt2(e.valor)}</td><td class="num">${fmtPct(e.valor / r.total)}</td></tr>` +
    (detalha ? e.lancamentos.map(l =>
      `<tr class="rec"><td>${fmtData(l.data)}</td><td class="num">${fmt2(l.valor)}</td><td class="num">${fmtPct(l.valor / r.total)}</td></tr>`).join('') : '')
  ).join('')
    + (demaisEmp ? `<tr class="emp" style="border-left-color:var(--muted)"><td>Demais ${demaisEmp.length} empresas</td><td class="num">${fmt2(demaisEmp.reduce((a, e) => a + e.valor, 0))}</td><td class="num">${fmtPct(demaisEmp.reduce((a, e) => a + e.valor, 0) / r.total)}</td></tr>` : '')
    + `<tr class="total"><td>Total Geral</td><td class="num">${fmt2(r.total)}</td><td class="num">100%</td></tr>`;

  const palette = [C.green, C.blue, C.greenLight, C.slate, C.muted];
  const tipos = r.porTipo;
  const dn = donut({
    items: tipos.map(t => ({ value: t.valor })), size: 92, stroke: 20, palette,
    center: tipos.length === 1 ? ['100%', 'do período'] : [`${tipos.length}`, 'tipos'],
  });
  const tipoTxt = tipos.length === 1
    ? `<div class="t-name">${esc(String(tipos[0].tipo).replace(/_/g, ' ').replace(/^Receitas /i, ''))}</div>
       <div class="t-val">${fmtMoney(r.total)} · única classificação no período</div>`
    : `<div class="t-name">${tipos.length} classificações</div>
       <div class="t-val">${tipos.map(t => `${esc(String(t.tipo).replace(/_/g, ' ').replace(/^Receitas /i, ''))} ${fmtPct(t.valor / r.total)}`).join(' · ')}</div>`;

  const extraCss = `
    .kpi { border-top-color: var(--green); }
    .content { display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 30px; padding: 0 48px; flex: 1; }
    .rtable { width: 100%; border-collapse: collapse; font-size:12.5px; }
    .rtable th { font-size:10.5px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); text-align: left; padding: 5px 8px; border-bottom: 1.5px solid var(--blue); }
    .rtable th.num { text-align: right; }
    .rtable td { padding: 5.5px 8px; border-bottom: 1px solid var(--line); color: var(--ink); }
    .rtable td.num { text-align: right; font-variant-numeric: tabular-nums; }
    .rtable tr.emp td { background: #EAF6EE; font-weight: 700; color: var(--blue); border-left: 3px solid var(--green); }
    .rtable tr.rec td:first-child { padding-left: 24px; color: var(--muted); }
    .rtable tr.total td { font-weight: 800; color: var(--blue); border-top: 2px solid var(--blue); border-bottom: none; }
    .tipo-panel { margin-top: 22px; border: 1px solid var(--line); border-radius: 10px; padding: 16px 18px; display: flex; align-items: center; gap: 14px; }
    .tipo-panel .t-lbl { font-size:10.5px; font-weight: 700; letter-spacing: 1.2px; color: var(--muted); text-transform: uppercase; }
    .tipo-panel .t-name { font-size:15px; font-weight: 700; color: var(--ink); margin-top: 2px; }
    .tipo-panel .t-val { font-size:12.5px; color: var(--muted); margin-top: 1px; }
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
      <div class="tipo-panel">${dn}<div><div class="t-lbl">Faturamento por tipo de receita</div>${tipoTxt}</div></div>
    </div>
    <div>
      <div class="chart-title">Recebimentos por empresa pagante</div>
      <table class="rtable">
        <thead><tr><th>Empresa${detalha ? ' · Data' : ''}</th><th class="num">Valor R$</th><th class="num">%</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${detalha ? '' : '<div style="font-size:10.5px;color:var(--muted);font-style:italic;margin-top:6px">Detalhe por data disponível no relatório interativo.</div>'}
    </div>
  </div>`;

  return pageShell({
    kicker: kickerPeriodo(meta.ini, meta.fim),
    title: 'Receitas por Tipo e Empresa · Recebimentos Realizados',
    pageNum: 16, logoSrc: ctx.logoSrc, fazenda: ctx.fazendaNome, body, extraCss,
  });
}
