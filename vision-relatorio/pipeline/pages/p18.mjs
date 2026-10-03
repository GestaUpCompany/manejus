// p.18 — Índices Técnicos e Econômicos (grade de cards + fórmula @ Produzida)
import { pageShell } from '../lib/shell.mjs';
import { fmt1, fmt2, fmtInt, fmtPct, kickerPeriodo } from '../lib/fmt.mjs';

export function render({ model, ctx }) {
  const { meta, indices: x } = model;

  const kpi = (lbl, val, unit = '', cls = '') =>
    `<div class="kpi ${cls}"><div class="lbl">${lbl}</div><div class="val">${val}${unit ? ` <small>${unit}</small>` : ''}</div></div>`;
  const rs = (v) => `<small>R$</small> ${fmt2(v)}`;

  const extraCss = `
    .body { flex: 1; display: flex; flex-direction: column; justify-content: space-evenly; padding-bottom: 14px; }
    .section { padding: 0 48px; }
    .section-title { font-size:12.5px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: var(--muted); margin-bottom: 12px; }
    .grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
    .kpi { padding: 18px 16px 15px 16px; }
    .kpi .val { font-size: 27px; }
    .kpi .lbl { margin-bottom: 5px; }
    .kpi.g { border-top-color: var(--green); }
    .prod-strip { margin: 0 48px; border: 1px solid var(--line); border-left: 4px solid var(--green); border-radius: 12px; padding: 20px 24px; display: flex; align-items: center; gap: 34px; background: #fff; box-shadow: 0 1px 2px rgba(18,38,58,.03), 0 2px 8px rgba(18,38,58,.04); }
    .prod-strip .p-main .lbl { font-size:10.5px; font-weight: 700; letter-spacing: 1.2px; color: var(--muted); text-transform: uppercase; }
    .prod-strip .p-main .val { font-size:34px; font-weight: 800; color: var(--green-dark); }
    .prod-strip .p-main .val small { font-size:16px; font-weight: 600; color: var(--muted); }
    .prod-strip .p-formula { display: flex; align-items: center; gap: 18px; flex-wrap: nowrap; }
    .prod-strip .term { text-align: center; }
    .prod-strip .term .t-val { font-size:17.5px; font-weight: 800; color: var(--ink); font-variant-numeric: tabular-nums; }
    .prod-strip .term .t-lbl { font-size:9.5px; font-weight: 700; letter-spacing: 0.6px; color: var(--muted); text-transform: uppercase; margin-top: 2px; }
    .prod-strip .op { font-size:19px; font-weight: 700; color: var(--muted); }
    .prod-strip .op.plus { color: var(--green-dark); }
    .prod-strip .op.minus { color: var(--red); }
  `;

  const body = `
  <div class="body">
  <div class="section">
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
    <div class="p-main">
      <div class="lbl">@ Produzida no período</div>
      <div class="val">${fmt2(x.atProduzida)} <small>@</small></div>
    </div>
    <div class="p-formula">
      <div class="term"><div class="t-val">${fmt2(x.estoqueFinalAt)}</div><div class="t-lbl">Estoque Final</div></div>
      <div class="op plus">+</div>
      <div class="term"><div class="t-val">${fmt2(x.saidasAt)}</div><div class="t-lbl">Saídas</div></div>
      <div class="op minus">−</div>
      <div class="term"><div class="t-val">${fmt2(x.entradasAt)}</div><div class="t-lbl">Entradas</div></div>
      <div class="op minus">−</div>
      <div class="term"><div class="t-val">${fmt2(x.estoqueInicialAt)}</div><div class="t-lbl">Estoque Inicial</div></div>
      <div class="op">=</div>
      <div class="term"><div class="t-val" style="color: var(--green-dark);">${fmt2(x.atProduzida)}</div><div class="t-lbl">@ Produzida</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Indicadores econômicos</div>
    <div class="grid4">
      ${kpi('Desembolso por ha', rs(x.desembolsoHa))}
      ${kpi('Desembolso por cab.', rs(x.desembolsoCab))}
      ${kpi('Despesa Média Mensal', rs(x.despesaMediaMensal))}
      ${kpi('Custo Diária/cab', rs(x.custoDiariaCab))}
      ${kpi('Custeio por ha', rs(x.custeioHa))}
      ${kpi('Custeio por @ Produzida', rs(x.custeioPorAt))}
      ${kpi('Faturamento por ha', rs(x.faturamentoHa), '', 'g')}
      ${kpi('Faturamento Médio Mensal', rs(x.faturamentoMedioMensal), '', 'g')}
    </div>
  </div>
  </div>`;

  return pageShell({
    kicker: kickerPeriodo(meta.ini, meta.fim),
    title: 'Índices Técnicos e Econômicos',
    pageNum: 18, logoSrc: ctx.logoSrc, fazenda: ctx.fazendaNome, body, extraCss,
  });
}
