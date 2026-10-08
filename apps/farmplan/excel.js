// =====================================================================
// FARM PLAN · Gesta'Up · excel.js
// Gera o Excel (.xlsx) de qualquer relatório que já tem PDF.
// Lê o que está na tela: os números de destaque (cartões) vão para a aba
// "Resumo" e cada tabela vira uma aba. Números, % e R$ viram números de
// verdade no Excel (dá para somar e fazer gráfico).
// =====================================================================
const CDN = 'vendor/xlsx.full.min.js';   // guardado no próprio site (não depende de outro servidor)
function carregar() {
  if (window.XLSX) return Promise.resolve();
  return new Promise((ok, falha) => { const s = document.createElement('script'); s.src = CDN; s.onload = ok; s.onerror = () => falha(new Error('Não Foi Possível Carregar o Excel. Confira a Internet')); document.head.appendChild(s); });
}
const limpo = (t) => String(t || '').replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, ' · ').replace(/^( · )+|( · )+$/g, '').trim();
// "48%" → 0,48 · "9,20" → 9,2 · "R$ 5.000,00" → 5000 · "1.234" → 1234 · "12" → 12 · o resto fica texto
export function valor(t) {
  const s = limpo(t);
  if (!s || s === '—' || s === '-') return { v: '' };
  // "48% · 65 de 135 · Meta 80%" → o número no Excel e o resto como comentário da célula
  const p = s.split(' · ');
  if (p.length > 1) { const v0 = valor(p[0]); if (typeof v0.v === 'number') return { ...v0, nota: p.slice(1).join(' · ') }; }
  let m;
  if ((m = s.match(/^(-?\d{1,3}(?:\.\d{3})*(?:,\d+)?|-?\d+(?:,\d+)?)\s*%$/))) return { v: num(m[1]) / 100, z: '0%' };
  if ((m = s.match(/^R\$\s*(-?[\d.]+(?:,\d+)?)$/))) return { v: num(m[1]), z: '"R$" #,##0.00' };
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^-?\d+(,\d+)?$/.test(s)) { const n = num(s); return { v: n, z: s.includes(',') ? '0.00' : '#,##0' }; }
  return { v: s };
}
const num = (s) => parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
// Lê o texto da célula como aparece na tela: blocos separados por " · ",
// sem botões de ação, com o valor dos campos preenchidos
const BLOCO = /^(block|flex|grid|list-item|table|table-row)$/;
function textoCelula(td) {
  const partes = [];
  const andar = (n, acc) => {
    if (n.nodeType === 3) { acc.push(n.textContent); return; }
    if (n.nodeType !== 1) return;
    const el = n;
    if (el.classList.contains('noprint') || el.matches('script, style, .btn')) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    if (el.matches('input, textarea')) { if (el.type !== 'checkbox' && el.type !== 'hidden') acc.push(' ' + el.value + ' '); else if (el.type === 'checkbox') acc.push(el.checked ? ' Sim ' : ''); return; }
    if (el.matches('select')) { acc.push(' ' + (el.selectedOptions?.[0]?.text || '') + ' '); return; }
    if (el.tagName === 'BR') { acc.push('\n'); return; }
    const bloco = BLOCO.test(cs.display) && el !== td;
    if (bloco) acc.push('\n');
    el.childNodes.forEach(c => andar(c, acc));
    if (bloco) acc.push('\n');
    if (!el.childNodes.length && el.title && el !== td) acc.push(' ' + el.title + ' ');
  };
  andar(td, partes);
  const t = partes.join('').replace(/[ \t]+/g, ' ');
  return t.trim() === '+' ? '' : t;
}
function visivel(el) { return !!(el.offsetParent || el.getClientRects().length); }
function nomeDaTabela(t, i) {
  const card = t.closest('.card, section, .sec');
  let h = card && card.querySelector('h1, h2, h3, h4, .cardh b');
  if (!h) { let p = t.previousElementSibling; while (p && !/^H[1-4]$/.test(p.tagName)) p = p.previousElementSibling; h = p; }
  return limpo(h ? h.textContent : '') || (i ? 'Dados ' + (i + 1) : 'Dados');
}
function tabelaParaLinhas(t) {
  const linhas = [];
  t.querySelectorAll('tr').forEach(tr => {
    if (!visivel(tr) || tr.closest('.noprint')) return;
    const l = [];
    tr.querySelectorAll('th, td').forEach(td => {
      if (td.classList.contains('noprint')) return;
      l.push(td.tagName === 'TH' ? { v: limpo(textoCelula(td)), cab: true } : valor(textoCelula(td)));
      for (let k = 1; k < (td.colSpan || 1); k++) l.push({ v: '' });
    });
    if (l.some(c => c.v !== '')) linhas.push(l);
  });
  return linhas;
}
function folha(linhas) {
  const X = window.XLSX;
  const ws = X.utils.aoa_to_sheet(linhas.map(l => l.map(c => (c && typeof c === 'object' ? c.v : c))));
  linhas.forEach((l, r) => l.forEach((c, k) => { if (!c || typeof c !== 'object') return; const ref = X.utils.encode_cell({ r, c: k }); if (!ws[ref]) return;
    if (c.z) ws[ref].z = c.z; if (c.nota) { ws[ref].c = [{ a: 'Farm Plan', t: c.nota }]; ws[ref].c.hidden = true; } }));
  const larg = []; linhas.forEach(l => l.forEach((c, k) => { const v = c && typeof c === 'object' ? c.v : c; larg[k] = Math.min(60, Math.max(larg[k] || 8, String(v ?? '').length + 2)); }));
  ws['!cols'] = larg.map(w => ({ wch: w }));
  return ws;
}
/**
 * exportarExcel({ titulo, arquivo, raiz, extras })
 *  extras: [{ nome, linhas: [[...]] }] abas montadas pela própria tela (opcional)
 *  semTabelas: true para não ler as tabelas da tela
 */
export async function exportarExcel({ titulo, arquivo, raiz, extras = [], semTabelas = false } = {}) {
  await carregar();
  const X = window.XLSX, R = raiz || document.getElementById('tela') || document.body, wb = X.utils.book_new();
  const fazenda = limpo(document.getElementById('nomeFazenda')?.textContent || '');
  const hoje = new Date();
  const resumo = [[{ v: titulo || limpo(R.querySelector('h1')?.textContent) || document.title }], [{ v: 'Fazenda' }, { v: fazenda }], [{ v: 'Gerado em' }, { v: hoje.toLocaleDateString('pt-BR') + ' ' + hoje.toTimeString().slice(0, 5) }], []];
  const kpis = [...R.querySelectorAll('.kpi')].filter(visivel);
  if (kpis.length) {
    resumo.push([{ v: 'Indicador' }, { v: 'Valor' }, { v: 'Detalhe' }]);
    kpis.forEach(k => resumo.push([{ v: limpo(k.querySelector('small')?.textContent) }, valor(k.querySelector('b, .num')?.textContent), { v: limpo(k.querySelector('span')?.textContent) }]));
  }
  X.utils.book_append_sheet(wb, folha(resumo), 'Resumo');
  const usados = new Set(['Resumo']);
  const nomeAba = (n) => { let b = String(n).replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 28) || 'Aba', s = b, i = 2; while (usados.has(s)) s = b.slice(0, 26) + ' ' + i++; usados.add(s); return s; };
  extras.forEach(e => { if (e.linhas?.length) X.utils.book_append_sheet(wb, folha(e.linhas.map(l => l.map(c => (c && typeof c === 'object') ? c : (typeof c === 'number' ? { v: c } : valor(c))))), nomeAba(e.nome)); });
  if (!semTabelas) [...R.querySelectorAll('table')].filter(t => visivel(t) && !t.closest('.noprint') && !t.parentElement.closest('table')).forEach((t, i) => {
    const L = tabelaParaLinhas(t); if (L.length > 1 || (L.length && !L[0].every(c => c.cab))) X.utils.book_append_sheet(wb, folha(L), nomeAba(nomeDaTabela(t, i)));
  });
  const nome = (arquivo || titulo || 'Relatório Farm Plan').replace(/[\\/:*?"<>|]/g, '-');
  X.writeFile(wb, nome + (fazenda && !nome.includes(fazenda) ? ' - ' + fazenda : '') + '.xlsx');
}

export const carregarExcel = carregar;
