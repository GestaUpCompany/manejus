// Formatação pt-BR e helpers de rótulo do relatório.
const nfInt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtInt = (v) => nfInt.format(Math.round(v ?? 0));
export const fmt1 = (v) => nf1.format(v ?? 0);
export const fmt2 = (v) => nf2.format(v ?? 0);
export const fmtMoney = (v) => `R$ ${nf2.format(v ?? 0)}`;
export const fmtPct = (v, dec = 1) =>
  `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format((v ?? 0) * 100)}%`;

const MES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MES_NOME = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// 'YYYY-MM' -> rótulo
export const mesAbrev = (ym) => MES_ABREV[Number(ym.slice(5, 7)) - 1];
export const mesNome = (ym) => MES_NOME[Number(ym.slice(5, 7)) - 1];
export const mesAno = (ym) => `${mesAbrev(ym)}/${ym.slice(0, 4)}`;
// 'YYYY-MM-DD' (string ou Date) -> 'DD/MM/YYYY'
export const fmtData = (d) => { const s = (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10); return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`; };
// string ISO ou Date -> 'YYYY-MM'
export const ymOf = (d) => (d instanceof Date ? d.toISOString() : String(d)).slice(0, 7);

// kicker de período: 'Jan – Ago · 2026' ou 'Jan/25 – Dez/26' quando cruza ano
export function kickerPeriodo(ini, fim) {
  const a = new Date(ini), b = new Date(fim);
  const ya = a.getUTCFullYear(), yb = b.getUTCFullYear();
  if (ya === yb) return `${MES_ABREV[a.getUTCMonth()]} – ${MES_ABREV[b.getUTCMonth()]} · ${yb}`;
  return `${MES_ABREV[a.getUTCMonth()]}/${String(ya).slice(2)} – ${MES_ABREV[b.getUTCMonth()]}/${String(yb).slice(2)}`;
}

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
