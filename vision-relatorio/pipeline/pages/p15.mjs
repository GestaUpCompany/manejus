// p.15 — Relatório de Receitas (visão geral)
import { pageShell } from '../lib/shell.mjs';
import { areaChart, donut, C } from '../lib/svg.mjs';
import { fmt2, fmtInt, fmtPct, fmtMoney, mesAbrev, mesNome, kickerPeriodo, esc } from '../lib/fmt.mjs';

export function render({ model, ctx }) {
  const { meta, receitas: r } = model;
  const crossYear = new Date(meta.ini).getUTCFullYear() !== new Date(meta.fim).getUTCFullYear();
  const mesLbl = (ym) => crossYear ? `${mesAbrev(ym)}/${ym.slice(2, 4)}` : mesAbrev(ym);

  const area = areaChart({
    labels: r.mensal.map(m => mesLbl(m.mes)),
    values: r.mensal.map(m => m.valor),
    W: 1184, H: 180, color: C.green, labelFmt: fmtMoney,
  });

  const cats = r.porCategoria;
  const palette = [C.green, C.blue, C.greenLight, C.slate, C.muted];
  const dn = donut({
    items: cats.map(c => ({ value: c.valor })), size: 170, stroke: 18, palette,
    center: cats.length === 1
      ? [fmtMoney(r.total), `${String(cats[0].plano).replace(' - ', ' · ')} · 100%`]
      : [fmtMoney(r.total), 'receita total'],
  });
  const legenda = cats.length > 1
    ? `<div class="dlegend">${cats.map((c, i) =>
        `<span><i style="background:${palette[i % palette.length]}"></i>${esc(String(c.plano).replace(/_/g, ' '))}<em>${fmtPct(c.valor / r.total)}</em></span>`).join('')}</div>`
    : `<div><div style="font-size:13px;font-weight:700;color:var(--ink)">${esc(String(cats[0].plano).replace(/_/g, ' ').replace(' - ', ' · '))}</div>
       <div style="font-size:12px;color:var(--muted);margin-top:2px">${fmtMoney(r.total)} · 100% do faturamento</div></div>`;

  const iMax = r.mensal.reduce((a, m, i) => m.valor > (r.mensal[a]?.valor ?? -1) ? i : a, 0);
  const semRec = r.mensal.filter(m => !m.valor);
  const tipoTop = r.porTipo[0];

  const extraCss = `
    .kpi { border-top-color: var(--green); }
    .chart1 { padding: 0 48px 4px 48px; }
    .bottom-row { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; padding: 4px 48px 0 48px; flex: 1; align-items: center; }
    .ring-wrap { display: flex; align-items: center; gap: 14px; }
    .dlegend { display: flex; flex-direction: column; gap: 8px; font-size: 11.5px; font-weight: 600; color: var(--ink); }
    .dlegend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; }
    .dlegend em { font-style: normal; color: var(--muted); font-weight: 500; margin-left: 7px; }
    .mini-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-content: start; padding-top: 4px; }
    .mini { border: 1px solid var(--line); border-radius: 10px; padding: 10px 14px; }
    .mini .lbl { font-size: 9px; font-weight: 700; letter-spacing: 1px; color: var(--muted); text-transform: uppercase; margin-bottom: 3px; }
    .mini .val { font-size: 16px; font-weight: 800; color: var(--ink); }
    .mini .val small { font-size: 11px; font-weight: 600; color: var(--muted); }
  `;

  const body = `
  <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
    <div class="kpi"><div class="lbl">Receita Total</div><div class="val"><small>R$</small> ${fmt2(r.total)}</div></div>
    <div class="kpi"><div class="lbl">Faturamento Médio Mensal</div><div class="val"><small>R$</small> ${fmt2(r.mediaMensal)}</div></div>
    <div class="kpi"><div class="lbl">Faturamento por ha</div><div class="val"><small>R$</small> ${fmt2(r.porHa)}</div></div>
    <div class="kpi"><div class="lbl">Faturamento por cab.</div><div class="val"><small>R$</small> ${fmt2(r.porCab)}</div></div>
  </div>

  <div class="chart1">
    <div class="chart-title">Faturamento por mês</div>
    ${area}
  </div>

  <div class="bottom-row">
    <div>
      <div class="chart-title">Faturamento por categoria</div>
      <div class="ring-wrap">${dn}${legenda}</div>
    </div>
    <div>
      <div class="chart-title">Leitura do período</div>
      <div class="mini-stats">
        <div class="mini"><div class="lbl">Recebimentos</div><div class="val">${fmtInt(r.lancamentos)} <small>lançamentos</small></div></div>
        <div class="mini"><div class="lbl">Tipo predominante</div><div class="val">${fmtPct(tipoTop ? tipoTop.valor / r.total : 0)} <small>${esc(String(tipoTop?.tipo ?? '—').replace(/_/g, ' ').replace(/^Receitas /i, ''))}</small></div></div>
        <div class="mini"><div class="lbl">Maior mês</div><div class="val">${mesNome(r.mensal[iMax]?.mes)} <small>${fmtMoney(r.mensal[iMax]?.valor ?? 0)}</small></div></div>
        <div class="mini"><div class="lbl">Meses sem receita</div><div class="val">${semRec.length} <small>${semRec.slice(0, 3).map(m => mesNome(m.mes).toLowerCase()).join(', ')}${semRec.length > 3 ? '…' : ''}</small></div></div>
      </div>
    </div>
  </div>`;

  return pageShell({
    kicker: `${kickerPeriodo(meta.ini, meta.fim)} · Recebimentos realizados`,
    title: 'Relatório de Receitas',
    pageNum: 15, logoSrc: ctx.logoSrc, body, extraCss,
  });
}
