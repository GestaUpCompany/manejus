// p.8 — Nascimentos (combo mensal só com meses com registro + raça×sexo + donut)
import { pageShell } from '../lib/shell.mjs';
import { comboChart, donut, C } from '../lib/svg.mjs';
import { fmtInt, fmt1, fmtPct, mesNome, mesAbrev, kickerPeriodo, esc } from '../lib/fmt.mjs';

const SEXO = { M: 'Macho', F: 'Fêmea' };

export function render({ model, ctx }) {
  const { meta, nascimentos: nasc } = model;
  const crossYear = new Date(meta.ini).getUTCFullYear() !== new Date(meta.fim).getUTCFullYear();
  const mesLbl = (ym) => crossYear ? `${mesAbrev(ym)}/${ym.slice(2, 4)}`
    : nasc.mensal.length <= 8 ? mesNome(ym) : mesAbrev(ym);

  let charts;
  if (!nasc.mensal.length) {
    charts = `<div class="empty">Sem nascimentos registrados no período.</div>`;
  } else {
    const wide = nasc.mensal.length > 12; // série longa: combo ocupa a largura toda
    const comboMes = comboChart({
      labels: nasc.mensal.map(m => mesLbl(m.mes)),
      W: wide ? 1184 : 560, H: wide ? 230 : 300,
      bars: { values: nasc.mensal.map(m => m.quant), color: C.blue, labelFmt: fmtInt },
      line: { values: nasc.mensal.map(m => m.pesoMedio), color: C.green, labelFmt: (x) => `${fmt1(x)} kg` },
    });
    // raça×sexo: top 6 por volume, o resto consolida em "Outros"
    const rs = [...nasc.porRacaSexo].sort((a, b) => b.quant - a.quant);
    const rsTop = rs.slice(0, 6);
    const rsOutros = rs.slice(6).reduce((a, r) => a + r.quant, 0);
    if (rsOutros > 0) rsTop.push({ raca: 'Outros', sexo: '', quant: rsOutros });
    const rsLabels = rsTop.map(r => r.raca + (r.sexo ? ` · ${SEXO[r.sexo] ?? r.sexo}` : ''));
    const barRaca = comboChart({
      labels: rsLabels,
      W: wide ? 660 : 340, H: wide ? 195 : 300,
      bars: { values: rsTop.map(r => r.quant), color: C.green, labelFmt: fmtInt },
    });
    const porSexo = [...nasc.porSexo].sort((a, b) => b.quant - a.quant);
    const total = porSexo.reduce((a, s) => a + s.quant, 0);
    const donutSexo = donut({
      items: porSexo.map(s => ({ value: s.quant })),
      size: wide ? 130 : 150,
      center: porSexo.length === 1
        ? [fmtInt(total), `${SEXO[porSexo[0].sexo] ?? porSexo[0].sexo} · 100%`]
        : [fmtInt(total), 'nascimentos'],
    });
    const legenda = porSexo.length > 1
      ? `<div class="dlegend">${porSexo.map(s => `<span>${esc(SEXO[s.sexo] ?? s.sexo)} · ${fmtInt(s.quant)} · ${fmtPct(s.quant / total)}</span>`).join('')}</div>`
      : '';
    charts = wide ? `
    <div>
      <div class="chart-title">Nascimentos e peso médio por mês
        <span class="legend"><span><span class="sw bar"></span>Nascimentos</span><span><span class="sw line"></span>Peso kg</span></span></div>
      ${comboMes}
      <div class="note">Exibidos apenas meses com registros.</div>
    </div>
    <div class="charts-bottom">
      <div>
        <div class="chart-title">Por raça × sexo</div>
        ${barRaca}
      </div>
      <div>
        <div class="chart-title">Distribuição por sexo</div>
        <div class="donut-wrap">${donutSexo}${legenda}</div>
      </div>
    </div>` : `
    <div>
      <div class="chart-title">Nascimentos e peso médio por mês
        <span class="legend"><span><span class="sw bar"></span>Nascimentos</span><span><span class="sw line"></span>Peso kg</span></span></div>
      ${comboMes}
      <div class="note">Exibidos apenas meses com registros.</div>
    </div>
    <div>
      <div class="chart-title">Por raça × sexo</div>
      ${barRaca}
    </div>
    <div>
      <div class="chart-title">Distribuição por sexo</div>
      <div class="donut-wrap">${donutSexo}${legenda}</div>
    </div>`;
  }

  const extraCss = `
    .charts { display: grid; grid-template-columns: 1.3fr 0.9fr 0.8fr; gap: 28px; padding: 8px 48px 0 48px; flex: 1; }
    .charts.wide { grid-template-columns: 1fr; gap: 8px; }
    .charts-bottom { display: grid; grid-template-columns: 1.5fr 1fr; gap: 28px; flex: 1; }
    .charts-bottom .donut-wrap { padding-top: 8px; flex-direction: row; gap: 24px; align-items: center; justify-content: center; }
    .note { font-size: 10px; color: var(--muted); font-style: italic; padding: 6px 0 0 0; }
    .donut-wrap { display: flex; flex-direction: column; align-items: center; padding-top: 30px; }
    .dlegend { display: flex; flex-direction: column; gap: 4px; margin-top: 14px; font-size: 11px; font-weight: 600; color: var(--ink); }
    .empty { display: flex; align-items: center; justify-content: center; flex: 1; color: var(--muted); font-size: 15px; font-style: italic; }
  `;

  const body = `
  <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
    <div class="kpi"><div class="lbl">N° Total de Nascimentos</div><div class="val">${fmtInt(nasc.total)} <small>cab</small></div></div>
    <div class="kpi"><div class="lbl">Peso Médio ao Nascimento</div><div class="val">${fmt1(nasc.pesoMedio)} <small>kg</small></div></div>
  </div>
  <div class="charts${nasc.mensal.length > 12 ? ' wide' : ''}">${charts}</div>`;

  return pageShell({
    kicker: kickerPeriodo(meta.ini, meta.fim),
    title: 'Nascimentos',
    pageNum: 8, logoSrc: ctx.logoSrc, body, extraCss,
  });
}
