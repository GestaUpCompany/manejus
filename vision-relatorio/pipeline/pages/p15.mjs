// p.15 — Relatório de Receitas (visão geral)
import { pageShell } from '../lib/shell.mjs';
import { areaChart, C } from '../lib/svg.mjs';
import { fmt2, fmtInt, fmtPct, fmtMoney, mesAbrev, mesNome, kickerPeriodo, esc } from '../lib/fmt.mjs';

export function render({ model, ctx }) {
  const { meta, receitas: r } = model;
  const crossYear = new Date(meta.ini).getUTCFullYear() !== new Date(meta.fim).getUTCFullYear();
  const mesLbl = (ym) => crossYear ? `${mesAbrev(ym)}/${ym.slice(2, 4)}` : mesAbrev(ym);

  const area = areaChart({
    labels: r.mensal.map(m => mesLbl(m.mes)),
    values: r.mensal.map(m => m.valor),
    W: 1184, H: 180, color: C.green, labelFmt: fmtMoney, labelScale: 1.3,
  });

  const cats = r.porCategoria;
  const mxCat = Math.max(...cats.map(c => c.valor), 1);
  const palette = [C.green, C.blue, C.greenLight, C.slate, C.muted];
  const sbar = `<div class="sbar">${cats.map((c, i) =>
    `<i style="width:${(c.valor / r.total * 100).toFixed(2)}%;background:${palette[i % palette.length]}"></i>`).join('')}</div>`;
  const hlist = `<div class="hlist${cats.length <= 2 ? ' few' : ''}">${cats.map((c, i) => `
    <div class="hrow">
      <span class="h-name" title="${esc(String(c.plano).replace(/_/g, ' '))}">${esc(String(c.plano).replace(/_/g, ' ').replace(' - ', ' · '))}</span>
      <span class="h-track"><i style="width:${Math.max(4, c.valor / mxCat * 100).toFixed(1)}%;background:${palette[i % palette.length]}"></i></span>
      <span class="h-num">${fmtMoney(c.valor)} <em>${fmtPct(c.valor / r.total)}</em></span>
    </div>`).join('')}</div>`;

  const iMax = r.mensal.reduce((a, m, i) => m.valor > (r.mensal[a]?.valor ?? -1) ? i : a, 0);
  const semRec = r.mensal.filter(m => !m.valor);
  const tipoTop = r.porTipo[0];

  const extraCss = `
    .kpi { border-top-color: var(--green); }
    
    .bottom-row { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; padding: 14px 48px 0 48px; flex: 1; }
    .bottom-row > div { display: flex; flex-direction: column; }
    .sbar { display: flex; height: 13px; border-radius: 7px; overflow: hidden; margin: 12px 2px 0; }
    .sbar i { display: block; height: 100%; }
    .hlist { display: flex; flex-direction: column; justify-content: center; gap: 12px; flex: 1; padding-top: 6px; }
    .hlist.few { gap: 20px; }
    .hrow { display: flex; align-items: center; gap: 12px; font-size:13.5px; }
    .hlist.few .hrow { font-size: 14.5px; }
    .h-name { width: 165px; flex-shrink: 0; text-align: right; color: var(--ink); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .h-track { flex: 1; height: 14px; background: var(--soft); border-radius: 7px; overflow: hidden; }
    .hlist.few .h-track { height: 22px; border-radius: 11px; }
    .h-track i { display: block; height: 100%; border-radius: 7px; background: var(--green); }
    .h-num { width: 172px; flex-shrink: 0; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; }
    .hlist.few .h-num { font-size: 15.5px; }
    .h-num em { font-style: normal; color: var(--muted); font-weight: 500; font-size:11.5px; }
    .mini-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-content: start; padding-top: 4px; }
    .mini { border: 1px solid var(--line); border-radius: 10px; padding: 10px 14px; }
    .mini .lbl { font-size:10px; font-weight: 700; letter-spacing: 1px; color: var(--muted); text-transform: uppercase; margin-bottom: 3px; }
    .mini .val { font-size:17.5px; font-weight: 800; color: var(--ink); }
    .mini .val small { font-size:12px; font-weight: 600; color: var(--muted); }
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
      ${sbar}
      ${hlist}
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
    kicker: kickerPeriodo(meta.ini, meta.fim),
    title: 'Relatório de Receitas',
    pageNum: 18, logoSrc: ctx.logoSrc, fazenda: ctx.fazendaNome, body, extraCss,
  });
}
