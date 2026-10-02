// Escopador de CSS para o documento merged (relatorio.pdf / buildMergedHtml).
// Num documento flat, os <style> de todas as páginas se aplicam globalmente:
// nomes de classe se repetem entre páginas (.kpi, .legend, .chart1…) e a
// última definição vence para todas — ex.: `.page { flex-direction: unset }`
// da capa/encerramento quebrava o layout em coluna das páginas internas.
// Aqui cada seletor passa a exigir o wrapper .pg-<id> da própria página.
// At-rules de página (@page, @font-face, @keyframes) ficam globais;
// @media/@supports têm o conteúdo escopado recursivamente.
export function scopeCss(css, scope) {
  return scopeBlock(css.replace(/\/\*[\s\S]*?\*\//g, ''), scope);
}

function scopeBlock(css, scope) {
  let out = '';
  let i = 0;
  const n = css.length;
  while (i < n) {
    let j = i;
    while (j < n && css[j] !== '{') j++;
    if (j >= n) break;
    const sel = css.slice(i, j).trim();
    let d = 1, k = j + 1;
    while (k < n && d > 0) {
      if (css[k] === '{') d++;
      else if (css[k] === '}') d--;
      k++;
    }
    const inner = css.slice(j + 1, k - 1);
    if (sel.startsWith('@media') || sel.startsWith('@supports') || sel.startsWith('@layer')) {
      out += `${sel}{${scopeBlock(inner, scope)}}`;
    } else if (sel.startsWith('@') || !sel) {
      out += `${sel}{${inner}}`;
    } else {
      out += `${sel.split(',').map((s) => scopeSel(s.trim(), scope)).join(',')}{${inner}}`;
    }
    i = k;
  }
  return out;
}

function scopeSel(sel, scope) {
  // body/:root definem fonte e variáveis que herdam para o conteúdo da
  // página; no merged viram o próprio wrapper. `*` vira ".pg-XX *" para o
  // reset de margin/padding continuar valendo dentro da página.
  if (!sel || sel === 'body' || sel === 'html' || sel === ':root' || sel === 'html body') return scope;
  if (sel.startsWith('body ')) return `${scope} ${sel.slice(5)}`;
  if (sel.startsWith('html ')) return `${scope} ${sel.slice(5)}`;
  return `${scope} ${sel}`;
}
