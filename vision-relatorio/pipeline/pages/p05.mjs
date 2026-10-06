// p.5 — Resumo de Compras (pivot Tipo → Categoria → Data; médias aritméticas por lote)
import { pageShell } from '../lib/shell.mjs';
import { fmtInt, fmt2, fmtData, ymOf, mesAbrev, kickerPeriodo, esc } from '../lib/fmt.mjs';

const catLabel = (c) => c.replace(' - ', ' · ');
const money = (v) => v ? fmt2(v) : '—';
const tds = (r) =>
  `<td>${fmtInt(r.cab)}</td><td>${fmt2(r.at)}</td><td>${fmt2(r.pesoMedio)}</td>` +
  `<td>${money(r.rsAt)}</td><td>${money(r.rsCab)}</td><td>${money(r.total)}</td>`;

// Agrega lotes por mês (fallback quando a pivot estoura a página)
const lotesPorMes = (cat) => {
  const byMes = new Map();
  for (const l of cat.lotes) {
    const k = ymOf(l.data);
    if (!byMes.has(k)) byMes.set(k, []);
    byMes.get(k).push(l);
  }
  return [...byMes.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, g]) => {
    const n = g.reduce((a, x) => a + x.nLotes, 0);
    const wavg = (f) => g.reduce((a, x) => a + f(x) * x.nLotes, 0) / n;
    return {
      label: `${mesAbrev(k)}/${k.slice(2, 4)}`,
      cab: g.reduce((a, x) => a + x.cab, 0), at: g.reduce((a, x) => a + x.at, 0),
      total: g.reduce((a, x) => a + x.total, 0),
      pesoMedio: wavg(x => x.pesoMedio), rsCab: wavg(x => x.rsCab), rsAt: wavg(x => x.rsAt),
    };
  });
};

export function render({ model, ctx }) {
  const { meta, compras } = model;

  // orçamento de linhas: normal até ~18; denso até ~22; acima colapsa lotes→mês;
  // se mesmo agregado por mês estourar, o nível de detalhe some (só tipo→categoria)
  const nLoteRows = compras.pivot.reduce((a, tp) => a + 1 + tp.categorias.reduce((b, c) => b + 1 + c.lotes.length, 0), 0);
  const nMesRows = compras.pivot.reduce((a, tp) => a + 1 + tp.categorias.reduce((b, c) => b + 1 + lotesPorMes(c).length, 0), 0);
  const detail = nLoteRows <= 12 ? 'dia' : nMesRows <= 15 ? 'mes' : 'nenhum';
  const dense = detail !== 'dia' || nLoteRows > 10;

  const rows = compras.pivot.map(tp => {
    const catRows = tp.categorias.map(cat => {
      const detalhe = detail === 'mes'
        ? lotesPorMes(cat).map(l => `<tr class="lot"><td>${esc(l.label)}</td>${tds(l)}</tr>`).join('')
        : detail === 'dia'
          ? cat.lotes.map(l => `<tr class="lot"><td>${fmtData(l.data)}</td>${tds(l)}</tr>`).join('')
          : '';
      return `<tr class="cat"><td>${esc(catLabel(cat.categoria))}</td>${tds(cat)}</tr>${detalhe}`;
    }).join('');
    return `<tr class="tipo"><td><span class="twist">▾</span>${esc(tp.tipo)}</td>${tds(tp)}</tr>${catRows}`;
  }).join('');

  const extraCss = `
    thead .cols th { font-size:10.5px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: #fff; background: var(--blue); padding: 7px 10px; border-bottom: none; }
    thead th:first-child { border-radius: 6px 0 0 6px; }
    thead th:last-child { border-radius: 0 6px 6px 0; }
    tbody td:first-child { text-align: left; }
    tr.tipo td { font-weight: 700; color: var(--ink); }
    tr.tipo .twist { display: inline-block; margin-right: 8px; font-size:11px; color: var(--blue); }
    tr.cat td { font-weight: 500; }
    tr.cat td.cat, tr.cat td:first-child { padding-left: 26px; }
    tr.cat td:first-child::before { content: ''; display: inline-block; width: 10px; height: 2px; background: var(--green); margin-right: 8px; vertical-align: 3px; }
    tr.lot td { color: var(--muted); font-weight: 400; }
    tr.lot td:first-child { padding-left: 52px; }
    tr.spacer td { padding: 3px; border: none; }
    .table-wrap { flex: 1; display: flex; flex-direction: column; justify-content: center; }
    table.dense { font-size:12.5px; }
    table.dense tbody td { padding: 4px 8px; }
    table.dense thead th { padding: 4px 8px 6px 8px; }
    .footnote { padding: 6px 48px 0 48px; font-size:11px; color: var(--muted); font-style: italic; }
  `;

  const t = compras.pivotTotal;
  const body = `
  <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
    <div class="kpi"><div class="lbl">N° de Animais</div><div class="val">${fmtInt(compras.cab)} <small>cab</small></div></div>
    <div class="kpi"><div class="lbl">Total da Compra</div><div class="val"><small>R$</small> ${fmt2(compras.total)}</div></div>
  </div>

  <div class="table-wrap">
    <table${dense ? ' class="dense"' : ''}>
      <thead>
        <tr class="cols"><th>Tipo · Categoria${detail === 'mes' ? ' · Mês' : detail === 'dia' ? ' · Data' : ''}</th><th>N° Cabeças</th><th>Total @</th><th>Peso Médio kg/cab</th><th>Média R$/@</th><th>Média R$/cab</th><th>Total R$</th></tr>
      </thead>
      <tbody>${rows}<tr class="spacer"><td colspan="7"></td></tr><tr class="total"><td class="cat">Total Geral</td>${tds(t)}</tr></tbody>
    </table>
  </div>

  <div class="footnote">${detail === 'nenhum'
    ? 'Volume alto de compras no período: a tabela foi resumida até o nível de categoria. O detalhe por mês e por lote está disponível no relatório interativo.'
    : detail === 'mes'
      ? 'Lotes agregados por mês para caber na página; médias ponderadas pelo n° de lotes. O detalhe dia a dia está disponível no relatório interativo.'
      : 'Peso médio, R$/@ e R$/cab são médias aritméticas por lote de compra; para os indicadores ponderados por volume, ver Compra de Animais.'}</div>`;

  return pageShell({
    kicker: kickerPeriodo(meta.ini, meta.fim),
    title: 'Resumo de Compras',
    pageNum: ctx.pageNum ?? 5, logoSrc: ctx.logoSrc, fazenda: ctx.fazendaNome, body, extraCss,
  });
}
