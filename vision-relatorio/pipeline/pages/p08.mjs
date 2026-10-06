// p.8 — Nascimentos (combo mensal só com meses com registro + listas horizontais)
import { pageShell } from '../lib/shell.mjs';
import { comboChart, C } from '../lib/svg.mjs';
import { fmtInt, fmt1, fmtPct, mesNome, mesAbrev, kickerPeriodo, esc } from '../lib/fmt.mjs';

const SEXO = { M: 'Macho', F: 'Fêmea' };
const SEXO_COLOR = { F: C.green, M: C.blue };
const topN = (list, n = 6) => {
  const s = [...list].sort((a, b) => b.quant - a.quant);
  const out = s.slice(0, n);
  const resto = s.slice(n).reduce((a, r) => a + r.quant, 0);
  if (resto > 0) out.push({ quant: resto, _outros: true });
  return out;
};

// lista de barras horizontais: nome · trilha · quant + %
const hlist = (rows, color) => {
  const total = rows.reduce((a, r) => a + r.quant, 0);
  const mx = Math.max(...rows.map(r => r.quant), 1);
  return `<div class="hlist">${rows.map(r => `
    <div class="hrow">
      <span class="h-name" title="${esc(r.label)}">${esc(r.label)}</span>
      <span class="h-track"><i style="width:${Math.max(4, r.quant / mx * 100).toFixed(1)}%;background:${color}"></i></span>
      <span class="h-num">${fmtInt(r.quant)} <em>${fmtPct(r.quant / total)}</em></span>
    </div>`).join('')}</div>`;
};

export function render({ model, ctx }) {
  const { meta, nascimentos: nasc } = model;
  const crossYear = new Date(meta.ini).getUTCFullYear() !== new Date(meta.fim).getUTCFullYear();
  const mesLbl = (ym) => crossYear ? `${mesAbrev(ym)}/${ym.slice(2, 4)}`
    : nasc.mensal.length <= 8 ? mesNome(ym) : mesAbrev(ym);

  let charts;
  if (!nasc.mensal.length) {
    charts = `<div class="empty">Sem nascimentos registrados no período.</div>`;
  } else {
    const comboMes = comboChart({
      labels: nasc.mensal.map(m => mesLbl(m.mes)),
      W: 1184, H: 205, labelScale: 1.3,
      bars: { values: nasc.mensal.map(m => m.quant), color: C.blue, labelFmt: fmtInt },
      line: { values: nasc.mensal.map(m => m.pesoMedio), color: C.green, labelFmt: (x) => `${fmt1(x)} kg` },
    });

    const bottom = [];

    const rsTop = topN(nasc.porRacaSexo);
    if (rsTop.length) {
      const rows = rsTop.map(r => ({
        quant: r.quant,
        label: r._outros ? 'Outros'
          : r.raca ? r.raca + (r.sexo ? ` · ${SEXO[r.sexo] ?? r.sexo}` : '')
          : (SEXO[r.sexo] ?? 'Não informada'),
      }));
      bottom.push(`<div><div class="chart-title">Por raça × sexo</div>${hlist(rows, C.green)}</div>`);
    }

    const catTop = topN(nasc.porCategoria ?? []);
    if (catTop.length > 1) {
      const rows = catTop.map(r => ({
        quant: r.quant,
        label: r._outros ? 'Outras' : String(r.categoria).replace(' - ', ' · '),
      }));
      bottom.push(`<div><div class="chart-title">Por categoria</div>${hlist(rows, C.blue)}</div>`);
    }

    const porSexo = [...nasc.porSexo].sort((a, b) => b.quant - a.quant);
    const total = porSexo.reduce((a, s) => a + s.quant, 0);
    if (porSexo.length) {
      const seg = porSexo.map(s =>
        `<span style="width:${(100 * s.quant / total).toFixed(2)}%;background:${SEXO_COLOR[s.sexo] ?? C.slate}"></span>`).join('');
      const leg = porSexo.map(s =>
        `<span><i style="background:${SEXO_COLOR[s.sexo] ?? C.slate}"></i>${esc(SEXO[s.sexo] ?? s.sexo)} <em>${fmtInt(s.quant)} · ${fmtPct(s.quant / total)}</em></span>`).join('');
      bottom.push(`<div><div class="chart-title">Distribuição por sexo</div>
        <div class="sexo-wrap"><div class="sexo-bar">${seg}</div><div class="sexo-leg">${leg}</div></div></div>`);
    }

    const cols = bottom.length === 3 ? '1.1fr 1.1fr 0.9fr'
      : bottom.length === 2 ? '1.35fr 0.85fr' : '1fr';
    charts = `
    <div>
      <div class="chart-title">Nascimentos e peso médio por mês
        <span class="legend"><span><span class="sw bar"></span>Nascimentos</span><span><span class="sw line"></span>Peso kg</span></span></div>
      ${comboMes}
      <div class="note">Exibidos apenas meses com registros.</div>
    </div>
    <div class="charts-bottom" style="grid-template-columns:${cols}">${bottom.join('')}</div>`;
  }

  const extraCss = `
    .charts { display: flex; flex-direction: column; gap: 14px; padding: 8px 48px 0 48px; flex: 1; }
    .charts > div:not(.charts-bottom) { display: flex; flex-direction: column; }
    .charts > div:not(.charts-bottom) > svg { margin-top: auto; }
    .charts-bottom { display: grid; gap: 24px; flex: 1; }
    .charts-bottom > div { display: flex; flex-direction: column; }
    .note { font-size:11px; color: var(--muted); font-style: italic; padding-top: 6px; margin-bottom: auto; }
    .hlist { display: flex; flex-direction: column; justify-content: center; gap: 14px; flex: 1; padding-top: 6px; }
    .hrow { display: flex; align-items: center; gap: 12px; font-size:13.5px; }
    .h-name { width: 150px; flex-shrink: 0; text-align: right; color: var(--ink); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .h-track { flex: 1; height: 14px; background: var(--soft); border-radius: 7px; overflow: hidden; }
    .h-track i { display: block; height: 100%; border-radius: 7px; }
    .h-num { width: 86px; flex-shrink: 0; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; }
    .h-num em { font-style: normal; color: var(--muted); font-weight: 500; font-size:11.5px; }
    .sexo-wrap { display: flex; flex-direction: column; justify-content: center; flex: 1; gap: 16px; }
    .sexo-bar { display: flex; height: 18px; border-radius: 7px; overflow: hidden; }
    .sexo-bar span { display: block; height: 100%; }
    .sexo-leg { display: flex; flex-direction: column; gap: 8px; font-size:13.5px; font-weight: 600; color: var(--ink); }
    .sexo-leg i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 7px; vertical-align: -1px; }
    .sexo-leg em { font-style: normal; color: var(--muted); font-weight: 500; }
    .empty { display: flex; align-items: center; justify-content: center; flex: 1; color: var(--muted); font-size:16.5px; font-style: italic; }
  `;

  const body = `
  <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
    <div class="kpi"><div class="lbl">N° Total de Nascimentos</div><div class="val">${fmtInt(nasc.total)} <small>cab</small></div></div>
    <div class="kpi"><div class="lbl">Peso Médio ao Nascimento</div><div class="val">${fmt1(nasc.pesoMedio)} <small>kg</small></div></div>
  </div>
  <div class="charts">${charts}</div>`;

  return pageShell({
    kicker: kickerPeriodo(meta.ini, meta.fim),
    title: 'Nascimentos',
    pageNum: ctx.pageNum ?? 12, logoSrc: ctx.logoSrc, fazenda: ctx.fazendaNome, body, extraCss,
  });
}
