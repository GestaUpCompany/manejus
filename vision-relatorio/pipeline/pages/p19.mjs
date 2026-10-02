// p.19 — Vendas de Animais Vivos (Tipo = Comercial Vivo)
import { pageShell } from '../lib/shell.mjs';
import { areaChart, comboChart, C } from '../lib/svg.mjs';
import { fmt2, fmtInt, fmtPct, mesAbrev, kickerPeriodo, esc } from '../lib/fmt.mjs';

// normaliza sufixos societários para unir aliases ("Pecuária Locks LTDA" ≡ "Pecuária Locks")
const normComprador = (s) => String(s ?? '')
  .replace(/\b(ltda\.?|s\.?\s?a\.?|eireli|me\b|epp\b|sa\b)/gi, '')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  .replace(/\s+/g, ' ').trim().toLowerCase();

export function render({ model, ctx }) {
  const { meta, vivos: v } = model;
  const mesLbl = (ym) => `${mesAbrev(ym)}/${ym.slice(2, 4)}`;

  const empty = `
    <div style="flex:1;display:flex;align-items:center;justify-content:center">
      <div style="text-align:center;color:var(--muted)">
        <div style="font-size:15px;font-weight:700;color:var(--blue)">Sem vendas de animais vivos no período</div>
        <div style="font-size:11.5px;margin-top:4px">A página considera apenas lotes do tipo "Comercial Vivo".</div>
      </div>
    </div>`;

  const extraCss = `
    .kpi { border-top-color: var(--green); }
    .chart1 { padding: 0 48px 4px 48px; }
    .chart-title { display: flex; align-items: center; justify-content: space-between; }
    .legend { display: flex; gap: 14px; font-size: 11px; color: var(--ink); font-weight: 600; text-transform: none; letter-spacing: 0; }
    .legend .sw { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
    .legend .sw.b { background: var(--blue); }
    .legend .sw.g { background: var(--green); }
    .bottom-row { display: grid; grid-template-columns: 1fr 0.95fr; gap: 30px; padding: 4px 48px 0 48px; flex: 1; }
    .btable { width: 100%; border-collapse: collapse; font-size: 11.5px; margin-top: 2px; }
    .btable th { font-size: 9.5px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); text-align: left; padding: 4px 8px; border-bottom: 1.5px solid var(--blue); }
    .btable th.num { text-align: right; }
    .btable td { padding: 4.8px 8px; border-bottom: 1px solid var(--line); color: var(--ink); }
    .btable td.num { text-align: right; font-variant-numeric: tabular-nums; }
    .btable td.pct { color: var(--muted); }
    .btable tr.total td { font-weight: 800; color: var(--blue); border-top: 2px solid var(--blue); border-bottom: none; }
    .b-note { font-size: 9.5px; color: var(--muted); font-style: italic; margin-top: 6px; padding-left: 2px; }
  `;

  let body = empty;
  if (v.cab > 0) {
    const area = areaChart({
      labels: v.mensal.map(m => mesLbl(m.mes)),
      values: v.mensal.map(m => m.cab),
      W: 1184, H: 185, color: C.green, labelFmt: (x) => fmtInt(x),
    });

    const combo = comboChart({
      labels: v.porCategoria.map(c => c.categoria),
      W: 560, H: 235,
      bars: { values: v.porCategoria.map(c => c.cab), color: C.blue, labelFmt: (x) => fmtInt(x) },
      line: { values: v.porCategoria.map(c => c.rsAt), color: C.green, labelFmt: (x) => `R$ ${fmtInt(x)}` },
    });

    // agrega compradores por alias normalizado, exibe o nome mais frequente/completo
    const grupos = new Map();
    for (const c of v.porComprador) {
      const k = normComprador(c.comprador);
      if (!grupos.has(k)) grupos.set(k, { nome: c.comprador, cab: 0, valor: 0 });
      const g = grupos.get(k);
      if (String(c.comprador).length > String(g.nome).length) g.nome = c.comprador;
      g.cab += c.cab; g.valor += c.valor;
    }
    const compradores = [...grupos.values()].sort((a, b) => b.cab - a.cab);
    const top = compradores.slice(0, 12);
    const demais = compradores.slice(12);
    const tRows = top.map(c =>
      `<tr><td>${esc(c.nome)}</td><td class="num">${fmtInt(c.cab)}</td><td class="num">${fmt2(c.valor)}</td><td class="num pct">${fmtPct(c.valor / v.valor)}</td></tr>`
    ).join('')
      + (demais.length ? `<tr><td style="color:var(--muted);font-style:italic">Demais ${demais.length} compradores</td><td class="num">${fmtInt(demais.reduce((a, x) => a + x.cab, 0))}</td><td class="num">${fmt2(demais.reduce((a, x) => a + x.valor, 0))}</td><td class="num pct">${fmtPct(demais.reduce((a, x) => a + x.valor, 0) / v.valor)}</td></tr>` : '')
      + `<tr class="total"><td>Total</td><td class="num">${fmtInt(v.cab)}</td><td class="num">${fmt2(v.valor)}</td><td class="num">100%</td></tr>`;

    body = `
  <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
    <div class="kpi"><div class="lbl">Nº de Cabeças</div><div class="val">${fmtInt(v.cab)}</div></div>
    <div class="kpi"><div class="lbl">Valor Líquido</div><div class="val"><small>R$</small> ${fmt2(v.valor)}</div></div>
    <div class="kpi"><div class="lbl">Média R$/@</div><div class="val"><small>R$</small> ${fmt2(v.rsAt)}</div></div>
    <div class="kpi"><div class="lbl">Média R$/kg PV</div><div class="val"><small>R$</small> ${fmt2(v.rsKg)}</div></div>
  </div>

  <div class="chart1">
    <div class="chart-title">Cabeças vendidas por mês de venda</div>
    ${area}
  </div>

  <div class="bottom-row">
    <div>
      <div class="chart-title">
        Cabeças × preço médio por categoria
        <span class="legend"><span><span class="sw b"></span>Cabeças</span><span><span class="sw g"></span>Média R$/@</span></span>
      </div>
      ${combo}
    </div>
    <div>
      <div class="chart-title">Compradores por cabeças</div>
      <table class="btable">
        <thead><tr><th>Comprador</th><th class="num">Cab.</th><th class="num">Valor Líquido R$</th><th class="num">%</th></tr></thead>
        <tbody>${tRows}</tbody>
      </table>
      <div class="b-note">Compradores consolidados por alias (sufixos societários ignorados) — a planilha não normaliza nomes.</div>
    </div>
  </div>`;
  }

  return pageShell({
    kicker: `${kickerPeriodo(meta.ini, meta.fim)} · Tipo: Comercial Vivo`,
    title: 'Vendas de Animais Vivos',
    pageNum: 19, logoSrc: ctx.logoSrc, body, extraCss,
  });
}
