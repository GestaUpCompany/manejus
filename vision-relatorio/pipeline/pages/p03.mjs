// p.3 — Movimentação do Rebanho no Período (Auditoria Período)
import { pageShell } from '../lib/shell.mjs';
import { comboChart, C } from '../lib/svg.mjs';
import { fmtInt, fmt1, fmt2, mesAbrev, kickerPeriodo, esc } from '../lib/fmt.mjs';

const catLabel = (c) => c.replace(' - ', ' · ');

export function render({ model, ctx }) {
  const { meta, rebanho } = model;
  const cols = ['si', 'compras', 'nasc', 'transfE', 'evolE', 'vendas', 'mortes', 'consumo', 'transfS', 'evolS', 'sf'];
  const isIn = (k) => ['compras', 'nasc', 'transfE', 'evolE'].includes(k);
  const isOut = (k) => ['vendas', 'mortes', 'consumo', 'transfS', 'evolS'].includes(k);

  const rows = rebanho.matriz.map(r => {
    const zero = cols.every(k => !r[k]);
    const tds = [
      `<td class="cat">${esc(catLabel(r.categoria))}</td>`,
      `<td>${fmtInt(r.si)}</td>`,
      ...['compras', 'nasc', 'transfE', 'evolE'].map(k => `<td class="in">${fmtInt(r[k])}</td>`),
      ...['vendas', 'mortes', 'consumo', 'transfS', 'evolS'].map((k, i) => `<td class="out${i === 0 ? ' sep' : ''}">${fmtInt(r[k])}</td>`),
      `<td class="strong">${fmtInt(r.sf)}</td>`,
    ];
    return `<tr${zero ? ' class="zero"' : ''}>${tds.join('')}</tr>`;
  }).join('\n');

  const tot = (k) => rebanho.matriz.reduce((a, x) => a + x[k], 0);
  const totalRow = `<tr class="total"><td class="cat">Total do Rebanho</td><td>${fmtInt(tot('si'))}</td>${
    ['compras', 'nasc', 'transfE', 'evolE'].map(k => `<td class="in">${fmtInt(tot(k))}</td>`).join('')
  }${['vendas', 'mortes', 'consumo', 'transfS', 'evolS'].map((k, i) => `<td class="out${i === 0 ? ' sep' : ''}">${fmtInt(tot(k))}</td>`).join('')
  }<td>${fmtInt(tot('sf'))}</td></tr>`;

  const labels = rebanho.serieMensal.map(s => mesAbrev(s.mes));
  const svg = comboChart({
    labels, W: 1184, H: 126, labelScale: 1.3,
    bars: { values: rebanho.serieMensal.map(s => Math.round(s.rebanhoMedio)), color: C.blue, labelFmt: fmtInt, labelInside: false },
    line: { values: rebanho.serieMensal.map(s => s.uaha), color: C.green, labelFmt: (v) => fmt2(v) },
  });

  const extraCss = `.chart-wrap { padding-bottom: 6px; display: flex; flex-direction: column; justify-content: flex-end; }
    tbody td { padding: 5px 8px; }
    thead .grp th.ent { color: #fff; background: var(--green-dark); border-radius: 8px 0 0 0; }
    thead .grp th.sai { color: #fff; background: var(--red); border-radius: 0 8px 0 0; }
    td.sep, th.sep { border-left: 2px solid var(--line); }
    tbody td.in { background: #EFF7F2; }
    tbody td.out { background: #FBF1F0; }
    tbody tr.total td.in { background: #E0EFE6; }
    tbody tr.total td.out { background: #F4E1DF; }`;

  const body = `
  <div class="kpis" style="grid-template-columns:repeat(3,1fr)">
    <div class="kpi"><div class="lbl">Saldo Final do Período</div><div class="val">${fmtInt(rebanho.saldoFinal)} <small>cab</small></div></div>
    <div class="kpi"><div class="lbl">Peso Vivo Médio (referência)</div><div class="val">${fmt1(rebanho.pesoVivoMedio)} <small>kg/cab</small></div></div>
    <div class="kpi"><div class="lbl">UA/ha Média</div><div class="val">${fmt2(rebanho.uahaMedia)} <small>UA/ha</small></div></div>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr class="grp"><th></th><th></th><th class="ent" colspan="4">Entradas</th><th class="sai" colspan="5">Saídas</th><th></th></tr>
        <tr class="cols">
          <th>Categoria</th><th>Saldo Ini.</th>
          <th>Compras</th><th>Nascim.</th><th>Transf. E</th><th>Evol. E</th>
          <th class="sep">Vendas</th><th>Mortes</th><th>Consumo</th><th>Transf. S</th><th>Evol. S</th>
          <th>Saldo Final</th>
        </tr>
      </thead>
      <tbody>${rows}${totalRow}</tbody>
    </table>
  </div>

  <div class="chart-wrap">
    <div class="chart-title">
      Rebanho Médio × UA/ha por mês
      <span class="legend"><span><span class="sw bar"></span>Rebanho Médio (cab)</span><span><span class="sw line"></span>UA/ha</span></span>
    </div>
    ${svg}
  </div>`;

  return pageShell({
    kicker: kickerPeriodo(meta.ini, meta.fim),
    title: 'Movimentação do Rebanho no Período',
    pageNum: 3, logoSrc: ctx.logoSrc, fazenda: ctx.fazendaNome, body, extraCss,
  });
}
