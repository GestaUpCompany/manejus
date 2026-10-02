// p.17 — Fluxo de Caixa (matriz de 5 linhas + resultado × saldo acumulado)
import { pageShell } from '../lib/shell.mjs';
import { divergingChart } from '../lib/svg.mjs';
import { fmt2, mesAbrev, mesNome, kickerPeriodo } from '../lib/fmt.mjs';

const cell = (v, { na = false } = {}) =>
  na || v == null ? '<td class="na">—</td>' : `<td>${fmt2(v)}</td>`;

export function render({ model, ctx }) {
  const { meta, fluxoCaixa: fx } = model;
  const crossYear = new Date(meta.ini).getUTCFullYear() !== new Date(meta.fim).getUTCFullYear();
  const mesLbl = (ym) => crossYear ? `${mesAbrev(ym)}/${ym.slice(2, 4)}` : mesAbrev(ym);
  const L = fx.linhas;
  const first = L[0], last = L[L.length - 1];

  const extraCss = `
    .kpi { border-top-color: var(--blue); }
    .kpi.g { border-top-color: var(--green); }
    .kpi.r { border-top-color: var(--red); }
    .fc-wrap { padding: 0 48px; }
    .fctable { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    .fctable th { font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); text-align: right; padding: 5px 10px; border-bottom: 1.5px solid var(--blue); }
    .fctable th:first-child { text-align: left; }
    .fctable td { padding: 7px 10px; border-bottom: 1px solid var(--line); color: var(--ink); text-align: right; font-variant-numeric: tabular-nums; }
    .fctable td:first-child { text-align: left; font-weight: 700; }
    .fctable tr.ent td:not(:first-child) { color: var(--green-dark); }
    .fctable tr.sai td:not(:first-child) { color: var(--red); }
    .fctable tr.res td:not(:first-child) { font-weight: 700; }
    .fctable tr.res td.pos { color: var(--green-dark); }
    .fctable tr.res td.neg { color: var(--red); }
    .fctable tr.sf td { font-weight: 800; color: var(--blue); background: #F4F7FA; border-top: 2px solid var(--blue); }
    .fctable td.na { color: #B7C2CC; }
    .fctable.dense { font-size: 9.5px; table-layout: fixed; }
    .fctable.dense td { padding: 3.5px 4px; }
    .fctable.dense th { font-size: 8px; padding: 3px 4px; }
    .fctable.dense td:first-child, .fctable.dense th:first-child { width: 92px; }
    .fc-note { font-size: 9.5px; color: var(--muted); font-style: italic; margin-top: 5px; padding-left: 2px; }
    .combo { padding: 10px 48px 0 48px; flex: 1; display: flex; flex-direction: column; }
    .chart-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px; }
    .legend { display: flex; gap: 14px; font-size: 11px; color: var(--ink); font-weight: 600; }
    .legend .sw { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
    .legend .sw.g { background: var(--green); }
    .legend .sw.r { background: var(--red); }
    .legend .sw.b { background: var(--blue); }
  `;

  const dense = L.length > 12;
  // períodos longos (>24 meses) não cabem numa linha de tabela: divide em blocos empilhados
  const chunks = L.length > 24
    ? [L.slice(0, Math.ceil(L.length / 2)), L.slice(Math.ceil(L.length / 2))]
    : [L];
  const fcTable = (rows) => `
    <table class="fctable${dense ? ' dense' : ''}">
      <thead><tr><th></th>${rows.map(m => `<th>${mesLbl(m.mes)}</th>`).join('')}</tr></thead>
      <tbody>
        <tr><td>Saldo Inicial</td>${rows.map(m => cell(m.saldoIni)).join('')}</tr>
        <tr class="ent"><td>Entrada</td>${rows.map(m => cell(m.entrada, { na: !m.entrada })).join('')}</tr>
        <tr class="sai"><td>Saída</td>${rows.map(m => cell(m.saida, { na: !m.saida })).join('')}</tr>
        <tr class="res"><td>Resultado</td>${rows.map(m => `<td class="${m.resultado >= 0 ? 'pos' : 'neg'}">${m.resultado < 0 ? '−' : ''}${fmt2(Math.abs(m.resultado))}</td>`).join('')}</tr>
        <tr class="sf"><td>Saldo Final</td>${rows.map(m => cell(m.saldoFim)).join('')}</tr>
      </tbody>
    </table>`;
  const body = `
  <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
    <div class="kpi"><div class="lbl">Saldo Inicial (${mesAbrev(first.mes)})</div><div class="val"><small>R$</small> ${fmt2(first.saldoIni)}</div></div>
    <div class="kpi g"><div class="lbl">Entradas</div><div class="val"><small>R$</small> ${fmt2(fx.entradas)}</div></div>
    <div class="kpi r"><div class="lbl">Saídas</div><div class="val"><small>R$</small> ${fmt2(fx.saidas)}</div></div>
    <div class="kpi"><div class="lbl">Saldo Final (${mesAbrev(last.mes)})</div><div class="val"><small>R$</small> ${fmt2(last.saldoFim)}</div></div>
  </div>

  <div class="fc-wrap">
    <div class="chart-title">Fluxo de caixa realizado</div>
    ${chunks.map(fcTable).join('<div style="height:8px"></div>')}
    <div class="fc-note">Saldo inicial de ${mesNome(first.mes)} é um parâmetro da fazenda (R$ ${fmt2(first.saldoIni)} neste relatório); os demais meses encadeiam o saldo final anterior.</div>
  </div>

  <div class="combo">
    <div class="chart-head">
      <span class="chart-title">Resultado do mês × saldo acumulado</span>
      <span class="legend"><span><span class="sw g"></span>Resultado positivo</span><span><span class="sw r"></span>Resultado negativo</span><span><span class="sw b"></span>Saldo Final</span></span>
    </div>
    ${divergingChart({ rows: L.map(m => ({ label: mesLbl(m.mes), bar: m.resultado, line: m.saldoFim })), H: chunks.length > 1 ? 140 : 240 })}
  </div>`;

  return pageShell({
    kicker: `${kickerPeriodo(meta.ini, meta.fim)} · Recebimentos e pagamentos realizados`,
    title: 'Fluxo de Caixa',
    pageNum: 17, logoSrc: ctx.logoSrc, body, extraCss,
  });
}
