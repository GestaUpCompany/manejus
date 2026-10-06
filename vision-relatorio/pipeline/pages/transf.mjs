// p.6/7 — Transferência de Animais · Entrada / Saída
import { pageShell } from '../lib/shell.mjs';
import { comboChart, C } from '../lib/svg.mjs';
import { fmtInt, fmt1, fmtPct, fmtData, mesAbrev, kickerPeriodo, esc } from '../lib/fmt.mjs';

const catLabel = (c) => c.replace(' - ', ' · ');

function renderTransf({ model, ctx, v, sufixo, pageNum, corBarra }) {
  const { meta } = model;

  const extraCss = `
    .chart1 { margin-top: 2px; }
    .chart-row { display: grid; grid-template-columns: 1.15fr 1fr; gap: 48px; padding: 14px 48px 0 48px; flex: 1; }
    .chart-row > div { display: flex; flex-direction: column; }
    .hlist { display: flex; flex-direction: column; justify-content: center; gap: 12px; flex: 1; padding-top: 6px; }
    .hlist.few { gap: 20px; }
    .hrow { display: flex; align-items: center; gap: 12px; font-size:13.5px; }
    .hlist.few .hrow { font-size: 14.5px; }
    .h-name { width: 165px; flex-shrink: 0; text-align: right; color: var(--ink); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .h-track { flex: 1; height: 14px; background: var(--soft); border-radius: 7px; overflow: hidden; }
    .hlist.few .h-track { height: 22px; border-radius: 11px; }
    .h-track i { display: block; height: 100%; border-radius: 7px; }
    .h-num { width: 150px; flex-shrink: 0; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; }
    .hlist.few .h-num { font-size: 15.5px; }
    .h-num em { font-style: normal; color: var(--muted); font-weight: 500; font-size:11.5px; }
    .sbar { display: flex; height: 13px; border-radius: 7px; overflow: hidden; margin: 12px 2px 0; }
    .sbar i { display: block; height: 100%; }
    .dlegend { display: flex; gap: 18px; margin: 8px 2px 16px; }
    .ditem { font-size:12px; color: var(--ink); font-weight: 600; }
    .ditem .dot { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; }
    .ditem b { color: var(--blue); margin-left: 4px; }
    .mini-table { font-size:12px; border-collapse: collapse; width: 100%; }
    .mini-table th { font-size:10px; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); font-weight: 700; text-align: right; padding: 4px 6px; border-bottom: 1.5px solid var(--blue); }
    .mini-table th:nth-child(-n+2) { text-align: left; }
    .mini-table td { padding: 6px; border-bottom: 1px solid var(--line); text-align: right; color: var(--ink); }
    .mini-table td:nth-child(-n+2) { text-align: left; }
    .axis-note { font-size:10.5px; color: var(--muted); font-style: italic; margin-top: 10px; }
    .empty-note { flex: 1; display: flex; align-items: center; justify-content: center; text-align: center; font-size:14px; color: var(--muted); font-style: italic; padding: 40px; }
  `;

  const kpis = `
  <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
    <div class="kpi"><div class="lbl">N° de Cabeças</div><div class="val">${fmtInt(v.cab)} <small>cab</small></div></div>
    <div class="kpi"><div class="lbl">Movimentações</div><div class="val">${fmtInt(v.lotes)} <small>lotes</small></div></div>
    <div class="kpi"><div class="lbl">Peso Médio</div><div class="val">${fmt1(v.pesoMedio)} <small>kg/cab</small></div></div>
  </div>`;

  if (!v.cab) {
    return pageShell({
      kicker: kickerPeriodo(meta.ini, meta.fim),
      title: `Transferência de Animais · ${sufixo}`,
      pageNum: ctx.pageNum ?? pageNum, logoSrc: ctx.logoSrc, fazenda: ctx.fazendaNome, extraCss,
      body: `${kpis}<div class="chart1"><div class="empty-note">Nenhuma transferência de ${sufixo.toLowerCase()} registrada no período.</div></div>`,
    });
  }

  const comboMes = comboChart({
    labels: v.mensal.map(m => mesAbrev(m.mes)),
    W: 1184, H: 195, labelScale: 1.3,
    bars: { values: v.mensal.map(m => m.cab), color: corBarra, labelFmt: fmtInt, labelInside: false },
    line: { values: v.mensal.map(m => m.pesoMedio), color: C.blue, labelFmt: (x) => `${fmtInt(x)} kg` },
  });

  const cats = v.porCategoria;
  const mxCat = Math.max(...cats.map(c => c.cab), 1);
  const hlist = `<div class="hlist${cats.length <= 2 ? ' few' : ''}">${cats.map(c => `
    <div class="hrow">
      <span class="h-name" title="${esc(catLabel(c.categoria))}">${esc(catLabel(c.categoria))}</span>
      <span class="h-track"><i style="width:${Math.max(4, c.cab / mxCat * 100).toFixed(1)}%;background:${corBarra}"></i></span>
      <span class="h-num">${fmtInt(c.cab)} <em>${fmtPct(c.cab / v.cab)} · ${fmtInt(c.pesoMedio)} kg</em></span>
    </div>`).join('')}</div>`;

  const SEXO_COLORS = { 'Macho': C.blue, 'Fêmea': C.greenLight, 'Não informado': C.slate };
  const sexos = v.porSexo.filter(s => s.cab > 0);
  const sbar = `<div class="sbar">${sexos.map(s =>
    `<i style="width:${(s.cab / v.cab * 100).toFixed(2)}%;background:${SEXO_COLORS[s.sexo] ?? C.slate}"></i>`).join('')}</div>`;
  const slegend = `<div class="dlegend">${sexos.map(s =>
    `<div class="ditem"><span class="dot" style="background:${SEXO_COLORS[s.sexo] ?? C.slate}"></span>${esc(s.sexo)}<b>${fmtInt(s.cab)} · ${fmtPct(s.cab / v.cab)}</b></div>`).join('')}</div>`;

  const lotes = v.lista.slice(0, 8);
  const miniRows = lotes.map(l =>
    `<tr><td>${fmtData(l.data)}</td><td>${esc(catLabel(l.categoria))}</td><td>${fmtInt(l.cab)}</td><td>${fmtInt(l.pesoMedio)}</td></tr>`).join('');

  const body = `${kpis}

  <div class="chart1">
    <div class="chart-title">Cabeças transferidas e peso médio por mês
      <span class="legend"><span><span class="sw bar"></span>Cabeças</span><span><span class="sw line" style="background:${C.blue}"></span>Peso médio (kg/cab)</span></span></div>
    ${comboMes}
  </div>

  <div class="chart-row">
    <div>
      <div class="chart-title">Cabeças por categoria</div>
      ${hlist}
    </div>
    <div>
      <div class="chart-title">Distribuição por sexo e movimentações</div>
      ${sbar}${slegend}
      <table class="mini-table">
        <thead><tr><th>Data</th><th>Categoria</th><th>Cab.</th><th>kg/cab</th></tr></thead>
        <tbody>${miniRows}</tbody>
      </table>
      <div class="axis-note">${fmtInt(v.cab)} cabeças em ${fmtInt(v.lotes)} ${v.lotes === 1 ? 'movimentação' : 'movimentações'}${v.lista.length > lotes.length ? ` · exibindo as ${lotes.length} primeiras` : ''}.</div>
    </div>
  </div>`;

  return pageShell({
    kicker: kickerPeriodo(meta.ini, meta.fim),
    title: `Transferência de Animais · ${sufixo}`,
    pageNum: ctx.pageNum ?? pageNum, logoSrc: ctx.logoSrc, fazenda: ctx.fazendaNome, body, extraCss,
  });
}

export function renderEntrada({ model, ctx }) {
  return renderTransf({ model, ctx, v: model.transfE, sufixo: 'Entrada', pageNum: 6, corBarra: C.green });
}

export function renderSaida({ model, ctx }) {
  return renderTransf({ model, ctx, v: model.transfS, sufixo: 'Saída', pageNum: 7, corBarra: C.red });
}
