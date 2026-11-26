// Helpers puros compartilhados entre Node (pipeline) e browser (relatório interativo).
// Nenhuma dependência de Node aqui — este módulo é bundlado para o cliente.

// Abas do workbook Vision necessárias ao modelo. O loader (Node) e o upload do
// painel (browser, SheetJS) usam a mesma lista.
export const NEEDED_SHEETS = [
  'Cadastros', 'Estoque', 'Diárias', 'Diárias_Categoria', 'Compra_Gado',
  'Venda_Gado', 'Mortes_Consumos', 'Nascimentos', 'Desembolsos Realizados',
  'Receitas_Mensais',
];

// Converte valor de célula para Date (serial Excel ou Date/number/string).
export function toDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null; // fora de faixa de data plausível
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
  }
  if (typeof v === 'string') {
    // Data em texto no formato brasileiro (dd/mm/aaaa, opcionalmente com hora).
    // new Date() não entende esse formato e devolvia Invalid Date: a linha sumia.
    const br = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s|$)/);
    if (br) {
      const d = new Date(Date.UTC(Number(br[3]), Number(br[2]) - 1, Number(br[1])));
      // rejeita 31/02 (senão o Date rola para março)
      return isNaN(d) || d.getUTCDate() !== Number(br[1]) ? null : d;
    }
    const d = new Date(v);
    return isNaN(d) ? null : d;
  }
  return null;
}

export function toNum(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const s = String(v).trim().replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

export function toStr(v) {
  return v == null ? '' : String(v).trim();
}

// Localiza a linha de header procurando um rótulo conhecido numa coluna.
// Retorna o índice 0-based da primeira linha de dados.
export function findDataStart(rows, colIdx, labelRe) {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const v = rows[i]?.[colIdx];
    if (typeof v === 'string' && labelRe.test(v)) return i + 1;
  }
  return -1;
}

export function inPeriod(d, ini, fim) {
  return d && d >= ini && d <= fim;
}

// "2026-01-01" -> Date UTC
export function parseISODate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
