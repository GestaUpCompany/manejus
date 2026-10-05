// p.9 Mortes / p.10 Consumo e Doações — mesmo layout, acento e semântica por página
import { pageShell } from '../lib/shell.mjs';
import { areaChart, comboChart, donut, C } from '../lib/svg.mjs';
import { fmtInt, fmt2, fmtPct, mesAbrev, kickerPeriodo, esc } from '../lib/fmt.mjs';

const CFG = {
  mortes: {
    title: 'Mortes', pageNum: 12, accent: C.red, accentDark: '#8F3730', lblCls: 'r',
    cards: ['Animais Mortos', '@ Perdidas', 'R$ Perdidos', 'Tx. de Mortalidade'],
    areaTitle: 'Mortes por mês', causaTitle: 'Mortes por causa', donutTitle: 'Distribuição por categoria',
    palette: [C.red, C.blue, C.slate, C.greenLight, C.muted],
    empty: 'Sem mortes registradas no período.',
  },
  consumo: {
    title: 'Consumo e Doações', pageNum: 13, accent: C.amber, accentDark: '#8F6708', lblCls: 'a',
    cards: ['Total de Animais', '@ Destinadas', 'R$ Destinados', 'Tx. de Consumo e Doações'],
    areaTitle: 'Consumo e doações por mês', causaTitle: 'Por destino', donutTitle: 'Distribuição por categoria',
    palette: [C.amber, C.blue, C.slate, C.greenLight, C.muted],
    empty: 'Sem consumos ou doações registrados no período.',
  },
};

const catLabel = (c) => String(c).replace(' - ', ' · ').replace(/meses/g, 'm');

function makeRender(key) {
  const cfg = CFG[key];
  return function render({ model, ctx }) {
    const { meta } = model;
    const d = model[key]; // mcPage: {count, at, valor, taxa, mensal, porCausa, porCategoria}
    const crossYear = new Date(meta.ini).getUTCFullYear() !== new Date(meta.fim).getUTCFullYear();
    const mesLbl = (ym) => crossYear ? `${mesAbrev(ym)}/${ym.slice(2, 4)}` : mesAbrev(ym);

    let charts;
    if (!d.count) {
      charts = `<div class="empty">${cfg.empty}</div>`;
    } else {
      const area = areaChart({
        labels: d.mensal.map(m => mesLbl(m.mes)),
        values: d.mensal.map(m => m.count),
        W: 1184, H: 190, color: cfg.accent, labelFmt: fmtInt, labelScale: 1.3,
      });
      const barsCausa = comboChart({
        labels: d.porCausa.map(c => c.causa),
        W: 660, H: 190, labelScale: 1.3,
        bars: { values: d.porCausa.map(c => c.count), color: cfg.accent, labelFmt: fmtInt, labelCls: cfg.lblCls },
      });
      const cats = d.porCategoria;
      const dn = donut({
        items: cats.map(c => ({ value: c.count })),
        size: 168, stroke: 18, palette: cfg.palette,
        center: cats.length === 1
          ? [fmtInt(d.count), `${catLabel(cats[0].categoria)}`, '100%']
          : [fmtInt(d.count), key === 'mortes' ? 'mortes' : 'animais'],
      });
      const legenda = cats.length > 1
        ? `<div class="dlegend">${cats.map((c, i) =>
            `<span><i style="background:${cfg.palette[i % cfg.palette.length]}"></i>${esc(catLabel(c.categoria))}<em>${fmtInt(c.count)} · ${fmtPct(c.count / d.count, 0)}</em></span>`).join('')}</div>`
        : '';
      charts = `
      <div class="chart1">
        <div class="chart-title">${cfg.areaTitle}</div>
        ${area}
      </div>
      <div class="chart-row">
        <div>
          <div class="chart-title">${cfg.causaTitle}</div>
          ${barsCausa}
        </div>
        <div>
          <div class="chart-title">${cfg.donutTitle}</div>
          <div class="donut-wrap">${dn}${legenda}</div>
        </div>
      </div>`;
    }

    const extraCss = `
      .kpi { border-top-color: ${cfg.accent}; }
      .chart1 { margin-top: 2px; }
      .chart-row { display: grid; grid-template-columns: 1.35fr 1fr; gap: 24px; padding: 16px 48px 0 48px; flex: 1; }
      .vlbl.r { fill: ${cfg.accent}; }
      .vlbl.a { fill: #8F6708; }
      .donut-wrap { display: flex; align-items: center; gap: 24px; padding-top: 10px; }
      .dlegend { display: flex; flex-direction: column; gap: 7px; font-size:12.5px; font-weight: 600; color: var(--ink); }
      .dlegend i { display: inline-block; width: 11px; height: 11px; border-radius: 3px; margin-right: 6px; }
      .dlegend em { font-style: normal; color: var(--muted); font-weight: 500; margin-left: 8px; }
      .empty { display: flex; align-items: center; justify-content: center; flex: 1; color: var(--muted); font-size:16.5px; font-style: italic; }
    `;

    const body = `
    <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
      <div class="kpi"><div class="lbl">${cfg.cards[0]}</div><div class="val">${fmtInt(d.count)} <small>cab</small></div></div>
      <div class="kpi"><div class="lbl">${cfg.cards[1]}</div><div class="val">${fmtInt(d.at)} <small>@</small></div></div>
      <div class="kpi"><div class="lbl">${cfg.cards[2]}</div><div class="val"><small>R$</small> ${fmt2(d.valor)}</div></div>
      <div class="kpi"><div class="lbl">${cfg.cards[3]}</div><div class="val">${fmtPct(d.taxa, 2)}</div></div>
    </div>
    ${charts}`;

    return pageShell({
      kicker: kickerPeriodo(meta.ini, meta.fim),
      title: cfg.title, pageNum: cfg.pageNum, logoSrc: ctx.logoSrc, fazenda: ctx.fazendaNome, body, extraCss,
    });
  };
}

export const renderMortes = makeRender('mortes');
export const renderConsumo = makeRender('consumo');
