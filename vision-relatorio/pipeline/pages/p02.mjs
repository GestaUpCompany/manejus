// p.2 — Auditoria Mensal de Estoque (jan do ano × mês de referência final)
import { pageShell } from '../lib/shell.mjs';
import { fmtInt, fmt2, mesAbrev, mesNome, esc } from '../lib/fmt.mjs';

const catLabel = (c) => c.replace(' - ', ' · ');

export function render({ model, ctx }) {
  const { meta, estoque } = model;
  const iniByCat = new Map(estoque.inicial.map(l => [l.descricao, l]));
  const fimByCat = new Map(estoque.final.map(l => [l.descricao, l]));
  const cats = [...iniByCat.keys()];
  for (const k of fimByCat.keys()) if (!iniByCat.has(k)) cats.push(k);

  const cell = (v, money = false) => (money && !v) ? '<td>—</td>' : `<td>${fmt2(v)}</td>`;
  const rows = cats.map(c => {
    const vi = iniByCat.get(c) || { cab: 0, at: 0, valorAt: 0, valor: 0 };
    const vf = fimByCat.get(c) || { cab: 0, at: 0, valorAt: 0, valor: 0 };
    const zero = !vi.cab && !vf.cab;
    return `<tr${zero ? ' class="zero"' : ''}><td class="cat">${esc(catLabel(c))}</td>` +
      `<td>${fmtInt(vi.cab)}</td><td>${fmtInt(vi.at)}</td><td>${fmt2(vi.valorAt)}</td>${cell(vi.valor, true)}` +
      `<td class="sep">${fmtInt(vf.cab)}</td><td>${fmtInt(vf.at)}</td><td>${fmt2(vf.valorAt)}</td>${cell(vf.valor, true)}</tr>`;
  }).join('\n');

  const t = estoque.totais;
  const totalRow = `<tr class="total"><td class="cat">Total do Rebanho</td>` +
    `<td>${fmtInt(t.inicial.cab)}</td><td>${fmtInt(t.inicial.at)}</td><td>${fmt2(t.inicial.valorAt)}</td><td>${fmt2(t.inicial.valor)}</td>` +
    `<td class="sep">${fmtInt(t.final.cab)}</td><td>${fmtInt(t.final.at)}</td><td>${fmt2(t.final.valorAt)}</td><td>${fmt2(t.final.valor)}</td></tr>`;

  const extraCss = `
    thead .grp th { text-align: center; }
    thead .grp th.ini { color: #fff; background: var(--blue); border-radius: 8px 0 0 0; }
    thead .grp th.fim { color: #fff; background: var(--green-dark); border-radius: 0 8px 0 0; }
    thead .grp th.blank { background: transparent; }
    td.sep, th.sep { border-left: 2px solid var(--line); }
    tbody td.sep, tbody td.sep ~ td { background: #F7FBF8; }
    tbody tr.total td.sep ~ td { background: #EAF4EE; }
    thead .cols th.sep ~ th { background: #F7FBF8; }
    .table-wrap { flex: 1; }
    .kpis.k8 { grid-template-columns: repeat(8, 1fr); gap: 10px; padding-top: 0; }
    .kpis.k8 .kpi { padding: 10px 12px 9px 12px; }
    .kpis.k8 .kpi .val { font-size: 19px; }
  `;

  const body = `
  <div class="table-wrap">
    <table>
      <thead>
        <tr class="grp">
          <th class="blank"></th>
          <th class="ini" colspan="4">Saldo Inicial · ${esc(mesNome(estoque.mesIni))}</th>
          <th class="fim" colspan="4">Saldo Final · ${esc(mesNome(estoque.mesFim))}</th>
        </tr>
        <tr class="cols">
          <th>Categoria</th>
          <th>Cabeças</th><th>Total @</th><th>Valor @</th><th>Total R$</th>
          <th class="sep">Cabeças</th><th>Total @</th><th>Valor @</th><th>Total R$</th>
        </tr>
      </thead>
      <tbody>${rows}${totalRow}</tbody>
    </table>
  </div>

  <div class="kpis k8">
    <div class="kpi"><div class="lbl">Saldo Inicial</div><div class="val">${fmtInt(t.inicial.cab)} <small>cab</small></div></div>
    <div class="kpi"><div class="lbl">Total @ Inicial</div><div class="val">${fmtInt(t.inicial.at)} <small>@</small></div></div>
    <div class="kpi"><div class="lbl">Valor @ Inicial</div><div class="val"><small>R$</small> ${fmt2(t.inicial.valorAt)}</div></div>
    <div class="kpi"><div class="lbl">Valor Inicial R$</div><div class="val"><small>R$</small> ${fmt2(t.inicial.valor / 1e6)} <small>mi</small></div></div>
    <div class="kpi blue-top"><div class="lbl">Saldo Final</div><div class="val">${fmtInt(t.final.cab)} <small>cab</small></div></div>
    <div class="kpi blue-top"><div class="lbl">Total @</div><div class="val">${fmtInt(t.final.at)} <small>@</small></div></div>
    <div class="kpi blue-top"><div class="lbl">Valor @</div><div class="val"><small>R$</small> ${fmt2(t.final.valorAt)}</div></div>
    <div class="kpi blue-top"><div class="lbl">Valor Final R$</div><div class="val"><small>R$</small> ${fmt2(t.final.valor / 1e6)} <small>mi</small></div></div>
  </div>`;

  return pageShell({
    kicker: `${mesAbrev(estoque.mesFim)} · ${estoque.mesFim.slice(0, 4)}`,
    title: 'Auditoria Mensal de Estoque',
    pageNum: 2, logoSrc: ctx.logoSrc, body, extraCss,
  });
}
