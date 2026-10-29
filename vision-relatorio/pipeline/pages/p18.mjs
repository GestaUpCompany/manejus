// p.21 — Índices Técnicos e Econômicos (grade de cards + fórmula @ Produzida)
import { pageShell } from '../lib/shell.mjs';
import { divergingChart, areaChart, C } from '../lib/svg.mjs';
import { fmt1, fmt2, fmtInt, fmtPct, mesAno, mesAbrev, kickerPeriodo } from '../lib/fmt.mjs';

export function render({ model, ctx }) {
  const { meta, indices: x } = model;
  const fin = meta.modo === 'financeiro';

  const kpi = (lbl, val, unit = '', cls = '') =>
    `<div class="kpi ${cls}"><div class="lbl">${lbl}</div><div class="val">${val}${unit ? ` <small>${unit}</small>` : ''}</div></div>`;
  const rs = (v) => `<small>R$</small> ${fmt2(v)}`;

  const atMes = fin ? [] : (x.atPorMes ?? []);
  const chartAt = atMes.length ? divergingChart({
    rows: atMes.map(m => ({ label: mesAno(m.mes), bar: m.at, line: m.at })),
    W: 620, H: 108,
  }) : '';

  // Modo financeiro: no lugar da faixa de @ produzida, faturamento × desembolso por mês.
  const crossYear = new Date(meta.ini).getUTCFullYear() !== new Date(meta.fim).getUTCFullYear();
  const mesLbl = (ym) => crossYear ? `${mesAbrev(ym)}/${ym.slice(2, 4)}` : mesAbrev(ym);
  const linhasFluxo = model.fluxoCaixa?.linhas ?? [];
  const mil = (v) => `R$ ${fmtInt(v / 1000)} mil`;
  const areaFin = (key, color) => areaChart({
    labels: linhasFluxo.map(m => mesLbl(m.mes)),
    values: linhasFluxo.map(m => m[key]),
    W: 576, H: 230, color, labelFmt: mil, labelScale: 1.2,
  });
  const chartFin = fin && linhasFluxo.length
    ? `<div class="fin-pair"><div><div class="ct2">Faturamento por mês</div>${areaFin('entrada', C.green)}</div><div><div class="ct2">Desembolso por mês</div>${areaFin('saida', C.blue)}</div></div>`
    : '';

  const extraCss = `
    .chart-fin { margin: 0 48px; background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 12px 16px 6px; box-shadow: 0 1px 2px rgba(18,38,58,.03), 0 2px 8px rgba(18,38,58,.04); }
    .chart-fin .ct { display: flex; justify-content: space-between; align-items: center; font-size:11.5px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: var(--muted); margin-bottom: 4px; }
    .fin-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .ct2 { font-size:10.5px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); margin: 2px 0 0 4px; }
    .chart-fin .lg { display: flex; gap: 14px; font-size:12px; color: var(--ink); font-weight: 600; text-transform: none; letter-spacing: 0; }
    .chart-fin .sw { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
    .body.fin { justify-content: flex-start; gap: 22px; padding-top: 6px; }
    .body { flex: 1; display: flex; flex-direction: column; justify-content: space-evenly; padding-bottom: 14px; }
    .section { padding: 0 48px; }
    .section-title { font-size:11.5px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: var(--muted); margin-bottom: 9px; display: flex; align-items: baseline; gap: 14px; }
    .res-badge { font-size:11px; font-weight: 700; letter-spacing: 0.4px; text-transform: none; color: var(--green-dark); }
    .res-badge.neg { color: var(--red); }
    .grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
    .grid4 .kpi { width: auto; min-width: 0; }
    .kpi.g { border-top-color: var(--green); }
    .prod-strip { margin: 0 48px; border: 1px solid var(--line); border-left: 4px solid var(--green); border-radius: 12px; padding: 14px 20px; display: flex; align-items: center; gap: 26px; background: #fff; box-shadow: 0 1px 2px rgba(18,38,58,.03), 0 2px 8px rgba(18,38,58,.04); }
    .p-main .lbl { font-size:10.5px; font-weight: 700; letter-spacing: 1.2px; color: var(--muted); text-transform: uppercase; }
    .p-main .val { font-size:30px; font-weight: 800; color: var(--green-dark); white-space: nowrap; }
    .p-main .val small { font-size:15px; font-weight: 600; color: var(--muted); }
    .p-formula { display: flex; align-items: center; gap: 13px; flex-wrap: nowrap; }
    .term .t-val { font-size:15px; font-weight: 800; color: var(--ink); font-variant-numeric: tabular-nums; white-space: nowrap; }
    .term .t-lbl { font-size:8.5px; font-weight: 700; letter-spacing: 0.5px; color: var(--muted); text-transform: uppercase; margin-top: 2px; }
    .op { font-size:17px; font-weight: 700; color: var(--muted); }
    .op.plus { color: var(--green-dark); }
    .op.minus { color: var(--red); }
    .p-chart { flex: 1; min-width: 0; border-left: 1px solid var(--line); padding-left: 22px; }
    .p-chart .lbl { font-size:10px; font-weight: 700; letter-spacing: 1px; color: var(--muted); text-transform: uppercase; margin-bottom: 2px; }
  `;

  const body = `
  <div class="body${fin ? ' fin' : ''}">
  ${fin ? '' : `  <div class="section">
    <div class="section-title">Rebanho e produção de arrobas</div>
    <div class="grid4">
      ${kpi('Estoque Inicial', fmtInt(x.estoqueInicialAt), '@')}
      ${kpi('Estoque Final', fmtInt(x.estoqueFinalAt), '@')}
      ${kpi('Entradas (compras)', fmtInt(x.entradasAt), '@', 'g')}
      ${kpi('Saídas (vendas)', fmtInt(x.saidasAt), '@')}
      ${kpi('Rebanho Médio', fmtInt(x.rebanhoMedio), 'cab')}
      ${kpi('UA/ha Média', fmt2(x.uahaMedia), 'UA/ha')}
      ${kpi('Taxa de Desfrute', fmtPct(x.txDesfrute))}
      ${kpi('Produção por ha', fmt2(x.producaoAtHa), '@/ha')}
    </div>
  </div>

  <div class="prod-strip">
    <div class="p-formula">
      <div class="term"><div class="t-val">${fmt2(x.estoqueFinalAt)}</div><div class="t-lbl">Estoque Final</div></div>
      <div class="op plus">+</div>
      <div class="term"><div class="t-val">${fmt2(x.saidasAt)}</div><div class="t-lbl">Saídas</div></div>
      <div class="op minus">−</div>
      <div class="term"><div class="t-val">${fmt2(x.entradasAt)}</div><div class="t-lbl">Entradas</div></div>
      <div class="op minus">−</div>
      <div class="term"><div class="t-val">${fmt2(x.estoqueInicialAt)}</div><div class="t-lbl">Estoque Inicial</div></div>
      <div class="op">=</div>
    </div>
    <div class="p-main">
      <div class="lbl">@ Produzida no período</div>
      <div class="val">${fmt2(x.atProduzida)} <small>@</small></div>
    </div>
    <div class="p-chart">
      <div class="lbl">@ produzida por mês</div>
      ${chartAt}
    </div>
  </div>`}

  <div class="section">
    <div class="section-title">Indicadores econômicos
      <span class="res-badge ${x.resultado < 0 ? 'neg' : ''}">Resultado do período: R$ ${fmt2(x.resultado)} · margem ${fmtPct(x.margem)}</span>
    </div>
    <div class="grid4"${fin ? ' style="grid-template-columns:repeat(3,1fr)"' : ''}>
      ${kpi('Desembolso por ha', rs(x.desembolsoHa))}
      ${kpi('Despesa Média Mensal', rs(x.despesaMediaMensal))}
      ${kpi('Custeio por ha', rs(x.custeioHa))}
      ${fin ? '' : kpi('Custeio por @ Produzida', rs(x.custeioPorAt))}
      ${kpi('Faturamento por ha', rs(x.faturamentoHa), '', 'g')}
      ${kpi('Faturamento Médio Mensal', rs(x.faturamentoMedioMensal), '', 'g')}
      ${fin ? kpi('Resultado do Período', rs(x.resultado), '', x.resultado < 0 ? '' : 'g') : ''}
    </div>
  </div>

  ${fin && chartFin ? `<div class="chart-fin">
    ${chartFin}
  </div>` : ''}

  </div>`;

  return pageShell({
    kicker: kickerPeriodo(meta.ini, meta.fim),
    title: 'Índices Técnicos e Econômicos',
    pageNum: ctx.pageNum ?? 23, logoSrc: ctx.logoSrc, fazenda: ctx.fazendaNome, body, extraCss,
  });
}
