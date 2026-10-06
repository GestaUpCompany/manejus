// p.7 — Resumo de Vendas (pivot Tipo → Categoria → Data; AVG R$/@ por lote)
import { pageShell } from '../lib/shell.mjs';
import { fmtInt, fmt2, fmtPct, fmtData, ymOf, mesAbrev, kickerPeriodo, esc } from '../lib/fmt.mjs';

const catLabel = (c) => c.replace(' - ', ' · ');
const compradorLabel = (g) => {
  const nomes = new Set(g.map(x => x.comprador).filter(Boolean));
  return nomes.size > 1 ? 'Vários' : ([...nomes][0] || '—');
};
const tds = (r, comp) =>
  `<td class="comp">${esc(comp)}</td><td>${fmtInt(r.cab)}</td><td>${r.at ? fmt2(r.at) : '—'}</td>` +
  `<td>${r.rsAt ? fmt2(r.rsAt) : '—'}</td><td>${fmt2(r.total)}</td>`;

// Agrega lotes por mês (fallback quando a pivot estoura a página)
const lotesPorMes = (cat) => {
  const byMes = new Map();
  for (const l of cat.lotes) {
    const k = ymOf(l.data);
    if (!byMes.has(k)) byMes.set(k, []);
    byMes.get(k).push(l);
  }
  return [...byMes.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, g]) => {
    const prec = g.filter(x => x.rsAt > 0);
    return {
    label: `${mesAbrev(k)}/${k.slice(2, 4)}`,
    comprador: compradorLabel(g),
    cab: g.reduce((a, x) => a + x.cab, 0), at: g.reduce((a, x) => a + x.at, 0),
    rsAt: prec.length ? prec.reduce((a, x) => a + x.rsAt, 0) / prec.length : 0,
    total: g.reduce((a, x) => a + x.total, 0),
    };
  });
};

export function render({ model, ctx }) {
  const { meta, vendas } = model;
  const v = vendas; // {cab, valor, giroEstoque, pivot}

  // orçamento de linhas, mesma regra da p.5
  const nLoteRows = v.pivot.reduce((a, tp) => a + 1 + tp.categorias.reduce((b, c) => b + 1 + c.lotes.length, 0), 0);
  const nMesRows = v.pivot.reduce((a, tp) => a + 1 + tp.categorias.reduce((b, c) => b + 1 + lotesPorMes(c).length, 0), 0);
  const detail = nLoteRows <= 12 ? 'dia' : nMesRows <= 15 ? 'mes' : 'nenhum';
  const dense = detail !== 'dia' || nLoteRows > 10;

  const rows = v.pivot.map(tp => {
    const catRows = tp.categorias.map(cat => {
      const detalhe = detail === 'mes'
        ? lotesPorMes(cat).map(l => `<tr class="lot"><td>${esc(l.label)}</td>${tds(l, l.comprador)}</tr>`).join('')
        : detail === 'dia'
          ? cat.lotes.map(l => `<tr class="lot"><td>${fmtData(l.data)}</td>${tds(l, l.comprador)}</tr>`).join('')
          : '';
      return `<tr class="cat"><td>${esc(catLabel(cat.categoria))}</td>${tds(cat, compradorLabel(cat.lotes))}</tr>${detalhe}`;
    }).join('');
    return `<tr class="tipo"><td><span class="twist">▾</span>${esc(tp.tipo)}</td>${tds(tp, compradorLabel(tp.categorias.flatMap(c => c.lotes)))}</tr>${catRows}`;
  }).join('');

  const extraCss = `
    thead .cols th { font-size:10.5px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: #fff; background: var(--blue); padding: 7px 10px; border-bottom: none; }
    thead th:first-child { border-radius: 6px 0 0 6px; }
    thead th:last-child { border-radius: 0 6px 6px 0; }
    thead th:nth-child(2) { text-align: left; }
    tbody td { text-align: right; }
    tbody td:first-child, tbody td.comp { text-align: left; }
    tbody td.comp { color: var(--muted); font-size:12.5px; font-weight: 500; }
    tr.tipo td { font-weight: 700; color: var(--ink); }
    tr.tipo td.comp { color: var(--muted); }
    tr.tipo .twist { display: inline-block; margin-right: 8px; font-size:11px; color: var(--blue); }
    tr.cat td { font-weight: 500; }
    tr.cat td.comp { color: var(--muted); font-weight: 400; }
    tr.cat td:first-child { padding-left: 26px; }
    tr.cat td:first-child::before { content: ''; display: inline-block; width: 10px; height: 2px; background: var(--green); margin-right: 8px; vertical-align: 3px; }
    tr.lot td { color: var(--muted); font-weight: 400; }
    tr.lot td:first-child { padding-left: 52px; }
    tr.spacer td { padding: 3px; border: none; }
    .table-wrap { flex: 1; padding: 0 48px; display: flex; flex-direction: column; justify-content: center; }
    table.dense { font-size:12px; }
    table.dense tbody td { padding: 4px 8px; }
    table.dense thead th { padding: 5px 8px 7px 8px; }
    .footnote { padding: 6px 48px 0 48px; font-size:11px; color: var(--muted); font-style: italic; }
  `;

  const allLotes = v.pivot.flatMap(t => t.categorias.flatMap(c => c.lotes));
  const totRow = {
    cab: v.cab, at: allLotes.reduce((a, l) => a + l.at, 0),
    rsAt: allLotes.length ? allLotes.reduce((a, l) => a + l.rsAt, 0) / allLotes.length : null,
    total: v.valor,
  };

  const notaDetalhe = detail === 'nenhum'
    ? 'Volume alto de vendas no período: a tabela foi resumida até o nível de categoria; o detalhe por mês e lote está no relatório interativo. '
    : detail === 'mes'
      ? 'Lotes agregados por mês, médias ponderadas pelo n° de lotes; o detalhe dia a dia está no relatório interativo. '
      : '';

  const body = `
  <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
    <div class="kpi"><div class="lbl">N° de Cabeças</div><div class="val">${fmtInt(v.cab)} <small>cab</small></div></div>
    <div class="kpi"><div class="lbl">Giro de Estoque</div><div class="val">${fmtPct(v.giroEstoque)}</div></div>
    <div class="kpi"><div class="lbl">Valor Total Líquido</div><div class="val"><small>R$</small> ${fmt2(v.valor)}</div></div>
  </div>

  <div class="table-wrap">
    <table${dense ? ' class="dense"' : ''}>
      <thead>
        <tr class="cols"><th>Tipo · Categoria${detail === 'mes' ? ' · Mês' : detail === 'dia' ? ' · Data' : ''}</th><th>Frigorífico / Comprador</th><th>N° Cabeças</th><th>Total @</th><th>Média R$/@</th><th>Total R$</th></tr>
      </thead>
      <tbody>${rows}<tr class="spacer"><td colspan="6"></td></tr><tr class="total"><td class="cat">Total Geral</td>${tds(totRow, 'Vários')}</tr></tbody>
    </table>
  </div>

  <div class="footnote">${notaDetalhe}Giro de Estoque = cabeças vendidas ÷ soma dos saldos iniciais mensais do ano-base. Média R$/@ é aritmética por lote.</div>`;

  return pageShell({
    kicker: kickerPeriodo(meta.ini, meta.fim),
    title: 'Resumo de Vendas',
    pageNum: ctx.pageNum ?? 11, logoSrc: ctx.logoSrc, fazenda: ctx.fazendaNome, body, extraCss,
  });
}
