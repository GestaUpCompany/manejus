// Relatório interativo Vision'Up — motor de renderização.
// Dois usos:
//  1) standalone: build-interativo.mjs embute window.__PAYLOAD__ (+ opcional
//     window.__REPORT_CONFIG__) e este módulo se auto-inicializa;
//  2) app Vision: mountRelatorio(el, payload, config) monta dentro de um
//     elemento React (rota pública /r/:token ou impressão no painel).
// config: { public?: boolean (sem botão PDF), hiddenPages?: string[] ('p05'),
//           autoPrint?: boolean, titulo?: string }
import { buildModelFromReads } from '../lib/model.mjs';
import { parseISODate } from '../lib/core.mjs';
import { decompressPayload } from '../lib/payload.mjs';
import { esc } from '../lib/fmt.mjs';
import { scopeCss } from '../lib/scope.mjs';

import { renderCapa, renderFinal } from '../pages/p01.mjs';
import { render as p02 } from '../pages/p02.mjs';
import { render as p03 } from '../pages/p03.mjs';
import { render as p04 } from '../pages/p04.mjs';
import { render as p05 } from '../pages/p05.mjs';
import { render as p06 } from '../pages/p06.mjs';
import { render as p07 } from '../pages/p07.mjs';
import { render as p08 } from '../pages/p08.mjs';
import { renderMortes as p09, renderConsumo as p10 } from '../pages/p0910.mjs';
import { render as p11 } from '../pages/p11.mjs';
import { render as p12 } from '../pages/p12.mjs';
import { render as p13 } from '../pages/p13.mjs';
import { render as p14 } from '../pages/p14.mjs';
import { render as p15 } from '../pages/p15.mjs';
import { render as p16 } from '../pages/p16.mjs';
import { render as p17 } from '../pages/p17.mjs';
import { render as p18 } from '../pages/p18.mjs';
import { render as p19 } from '../pages/p19.mjs';

const registry = {
  p01: renderCapa, p02, p03, p04, p05, p06, p07, p08, p09, p10,
  p11, p12, p13, p14, p15, p16, p17, p18, p19, p20: renderFinal,
};
const PAGE_ORDER = Object.keys(registry).sort(); // p01..p20

export const PAGE_TITLES = {
  p01: 'Capa', p02: 'Estoque de Rebanho', p03: 'Rebanho no Período', p04: 'Compra de Animais',
  p05: 'Resumo de Compras', p06: 'Vendas — Abate', p07: 'Resumo de Vendas', p08: 'Nascimentos',
  p09: 'Mortes', p10: 'Consumo e Doações', p11: 'Desembolso', p12: 'Desembolso CF × CV',
  p13: 'Custeio', p14: 'Pareto de Desembolsos', p15: 'Receitas', p16: 'Receitas por Tipo',
  p17: 'Fluxo de Caixa', p18: 'Índices Técnicos', p19: 'Vendas Animais Vivos', p20: 'Encerramento',
};

export const SHELL_CSS = `
* { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --blue: #0B3D6E; --green: #17A34A; --green-dark: #0F7A38; --green-light: #7CC98A;
  --ink: #12263A; --muted: #5B6B7B; --line: #E3E8EE; --soft: #F4F7F9;
  --red: #B0443C; --amber: #B8860B; --slate: #8FA3B5;
}
:host { display: block; }
.vr-root { font-family: 'Archivo', 'Segoe UI', sans-serif; background: #EEF2F6; color: var(--ink); min-height: 100%; }
.top {
  position: sticky; top: 0; z-index: 50; display: flex; align-items: center; gap: 20px;
  background: #fff; border-bottom: 1px solid var(--line); padding: 10px 24px;
  box-shadow: 0 2px 8px rgba(11,61,110,.06); flex-wrap: wrap;
}
.top-logo { height: 34px; }
.top-title { display: flex; flex-direction: column; }
.top-title b { color: var(--blue); font-size: 15px; }
.top-title span { color: var(--muted); font-size: 11.5px; }
.filters { margin-left: auto; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.filters label { font-size: 12px; font-weight: 600; color: var(--muted); display: flex; align-items: center; gap: 6px; }
.filters input[type="date"], .filters select {
  font: 600 12.5px 'Archivo'; color: var(--ink); padding: 6px 8px;
  border: 1px solid var(--line); border-radius: 8px; background: #fff;
}
.filters button {
  font: 700 12px 'Archivo'; padding: 7px 14px; border-radius: 8px; cursor: pointer;
  border: 1px solid var(--line); background: #fff; color: var(--blue);
}
.filters button:hover { border-color: var(--green); color: var(--green-dark); }
.filters #print { background: var(--blue); color: #fff; border-color: var(--blue); }
.filters #print:hover { background: #082F56; }
nav {
  position: sticky; top: 55px; z-index: 40; display: flex; gap: 4px; overflow-x: auto;
  background: rgba(238,242,246,.92); backdrop-filter: blur(4px); padding: 8px 24px;
}
nav a {
  display: flex; align-items: center; gap: 6px; white-space: nowrap; text-decoration: none;
  font: 600 11.5px 'Archivo'; color: var(--muted); padding: 5px 10px; border-radius: 999px;
}
nav a:hover { background: #fff; color: var(--blue); }
nav a i { font-style: normal; font-weight: 800; font-size: 9.5px; color: #fff; background: var(--blue); border-radius: 4px; padding: 1px 5px; }
main { max-width: 1330px; margin: 0 auto; padding: 18px 24px 60px; }
.page-block { margin-bottom: 26px; }
.pg-cap { font: 700 11px 'Archivo'; color: var(--muted); letter-spacing: .6px; text-transform: uppercase; margin-bottom: 6px; }
.pg-num { color: var(--green-dark); }
.pg-host { background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 14px rgba(11,61,110,.10); }
.vr-loading { padding: 60px; text-align: center; color: var(--muted); }
@media print {
  @page { size: 1280px 720px; margin: 0; }
  .top, nav, .pg-cap { display: none !important; }
  .vr-root { background: #fff; }
  main { padding: 0; max-width: none; }
  .page-block { margin: 0; break-after: page; }
  .pg-host { box-shadow: none; border-radius: 0; height: auto !important; }
}
`;

const FONT_HREF = "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=Inter:wght@400;500;600&display=swap";
let fontLoaded = false;
function ensureFont() {
  if (fontLoaded || typeof document === 'undefined') return;
  fontLoaded = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = FONT_HREF;
  document.head.appendChild(link);
}

const iso = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
const fmtPt = (ymd) => { const [y, m, d] = ymd.split('-'); return `${d}/${m}/${y}`; };

export function mountRelatorio(el, payload, config = {}) {
  ensureFont();
  const { reads, ctx, defaults, range } = payload;
  const hidden = new Set(config.hiddenPages ?? []);
  const pageOrder = PAGE_ORDER.filter((id) => !hidden.has(id));
  const isPublic = !!config.public;
  if (config.titulo) document.title = config.titulo;

  const qs = new URLSearchParams(location.search);
  let ini = qs.get('ini') || defaults.ini;
  let fim = qs.get('fim') || defaults.fim;

  const sr = el.attachShadow({ mode: 'open' });
  sr.innerHTML = `<style>${SHELL_CSS}</style><div class="vr-root">
    <header class="top">
      <img class="top-logo" src="${esc(ctx.logoGestaup)}" alt="Gesta'Up">
      <div class="top-title"><b>${esc(ctx.fazendaNome)}</b><span id="range-lbl"></span></div>
      <div class="filters">
        <label>De <input type="date" id="ini"></label>
        <label>Até <input type="date" id="fim"></label>
        <select id="preset"></select>
        <button id="clear" title="Voltar ao período completo">Limpar</button>
        ${isPublic ? '' : `<button id="print" title="Imprime o relatório (use 'Salvar como PDF' no diálogo)">Baixar PDF</button>`}
      </div>
    </header>
    <nav id="nav"></nav>
    <main id="pages"></main>
  </div>`;

  const iniEl = sr.getElementById('ini');
  const fimEl = sr.getElementById('fim');
  const presetEl = sr.getElementById('preset');
  const rangeLbl = sr.getElementById('range-lbl');
  const pagesEl = sr.getElementById('pages');

  iniEl.min = fimEl.min = range.min;
  iniEl.max = fimEl.max = range.max;
  iniEl.value = ini; fimEl.value = fim;

  {
    const anos = [];
    for (let y = Number(range.min.slice(0, 4)); y <= Number(range.max.slice(0, 4)); y++) anos.push(y);
    presetEl.innerHTML = `<option value="">Período completo</option>` + anos.map((a) => `<option value="${a}">${a}</option>`).join('');
  }

  function syncUrl() {
    const q = new URLSearchParams();
    if (ini !== defaults.ini || fim !== defaults.fim) { q.set('ini', ini); q.set('fim', fim); }
    history.replaceState(null, '', location.pathname + (q.size ? '?' + q : ''));
  }

  const hosts = new Map();

  function ensureHost(id) {
    if (hosts.has(id)) return hosts.get(id);
    const wrap = document.createElement('section');
    wrap.className = 'page-block'; wrap.id = `pg-${id}`;
    const cap = document.createElement('div'); cap.className = 'pg-cap';
    cap.innerHTML = `<span class="pg-num">${id.slice(1)}</span> ${esc(PAGE_TITLES[id])}`;
    const host = document.createElement('div'); host.className = 'pg-host';
    const psr = host.attachShadow({ mode: 'open' });
    wrap.append(cap, host); pagesEl.append(wrap);
    const rec = { wrap, host, sr: psr };
    hosts.set(id, rec); return rec;
  }

  function setPageContent(rec, htmlDoc) {
    // :root não existe dentro de shadow root — as variáveis de cor das páginas
    // (--blue, --green…) precisam ir para :host, senão var(--*) fica vazio e
    // bandas, pills e KPIs perdem a cor.
    const styles = [...htmlDoc.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
      .map((m) => m[1].replace(/:root\b/g, ':host'))
      .join('\n');
    const body = htmlDoc.match(/<body[^>]*>([\s\S]*?)<\/body>/)?.[1] ?? htmlDoc;
    rec.sr.innerHTML = `<style>
      :host { display: block; font-family: 'Archivo', 'Segoe UI', sans-serif; line-height: normal; letter-spacing: normal; word-spacing: normal; }
      .zoomwrap { transform-origin: top left; }
      @media print { .zoomwrap { transform: none !important; } }
      ${styles}
    </style><div class="zoomwrap">${body}</div>`;
    fitZoom(rec);
  }

  function fitZoom(rec) {
    const w = rec.host.clientWidth || pagesEl.clientWidth;
    const k = Math.min(1, w / 1280);
    rec.sr.querySelector('.zoomwrap').style.transform = `scale(${k})`;
    rec.host.style.height = `${720 * k}px`;
  }

  function renderAll() {
    const t0 = performance.now();
    const model = buildModelFromReads(reads, {
      ini: parseISODate(ini), fim: parseISODate(fim),
      saldoCaixaInicial: defaults.saldoCaixaInicial ?? 0,
      anoBaseGiro: defaults.anoBaseGiro,
    });
    for (const id of pageOrder) {
      const rec = ensureHost(id);
      setPageContent(rec, registry[id]({ model, ctx }));
      rec.wrap.dataset.meses = JSON.stringify(model.meta.meses);
    }
    rangeLbl.textContent = ` · ${fmtPt(ini)} a ${fmtPt(fim)}`;
    console.debug(`[render] ${pageOrder.length} páginas em ${(performance.now() - t0).toFixed(0)}ms`);
  }

  function apply(nIni, nFim) {
    if (nIni) ini = nIni;
    if (nFim) fim = nFim;
    if (ini > fim) [ini, fim] = [fim, ini];
    iniEl.value = ini; fimEl.value = fim; syncUrl(); renderAll();
  }

  iniEl.addEventListener('change', () => iniEl.value && apply(iniEl.value, null));
  fimEl.addEventListener('change', () => fimEl.value && apply(null, fimEl.value));
  presetEl.addEventListener('change', () => {
    const y = presetEl.value;
    if (!y) apply(defaults.ini, defaults.fim);
    else apply(`${y}-01-01`, `${y}-12-31`);
  });
  sr.getElementById('clear').addEventListener('click', () => apply(defaults.ini, defaults.fim));
  if (!isPublic) sr.getElementById('print').addEventListener('click', () => config.onPdf ? config.onPdf() : window.print());

  // cross-filter: clique num rótulo de mês do eixo filtra o relatório para aquele mês
  const ABREV = { Jan: 1, Fev: 2, Mar: 3, Abr: 4, Mai: 5, Jun: 6, Jul: 7, Ago: 8, Set: 9, Out: 10, Nov: 11, Dez: 12 };
  pagesEl.addEventListener('click', (e) => {
    const path = e.composedPath ? e.composedPath() : [];
    const t = path.find((n) => n instanceof SVGTextContentElement);
    const wrap = path.find((n) => n.classList?.contains?.('page-block'));
    if (!t || !wrap) return;
    const txt = (t.textContent || '').trim();
    const m = txt.match(/^([A-Za-z]{3})\/?(\d{2})?$/);
    if (!m || !ABREV[m[1]]) return;
    let ym = null;
    if (m[2]) {
      ym = `20${m[2]}-${String(ABREV[m[1]]).padStart(2, '0')}`;
    } else {
      // rótulo sem ano ("Jan"): resolve pela posição entre os rótulos do eixo no mesmo shadow root
      const psr = t.getRootNode();
      const all = [...psr.querySelectorAll('text, tspan')].filter((x) => /^[A-Za-z]{3}$/.test((x.textContent || '').trim()));
      ym = JSON.parse(wrap.dataset.meses || '[]')[all.indexOf(t)] ?? null;
    }
    if (!ym) return;
    const [y, mo] = ym.split('-').map(Number);
    const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    apply(`${ym}-01`, `${ym}-${String(last).padStart(2, '0')}`);
  });

  const navEl = sr.getElementById('nav');
  navEl.innerHTML = pageOrder.map((id) =>
    `<a href="#pg-${id}" data-pg="${id}"><i>${id.slice(1)}</i>${esc(PAGE_TITLES[id])}</a>`).join('');
  // Âncoras de fragmento não atravessam o shadow root: rola manualmente.
  navEl.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[data-pg]');
    if (!a) return;
    e.preventDefault();
    hosts.get(a.dataset.pg)?.wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  new ResizeObserver(() => { for (const rec of hosts.values()) fitZoom(rec); }).observe(pagesEl);

  renderAll();
  if (config.autoPrint && config.onPdf) setTimeout(() => config.onPdf(), 600);
  else if (config.autoPrint) setTimeout(() => window.print(), 600);

  return { apply, getRange: () => [ini, fim] };
}

// Monta o documento único de impressão (mesma estratégia do merge do
// compose.mjs): estilos escopados por página (.pg-<id>, via scopeCss) + os
// .page concatenados, cada um virando uma lâmina 1280x720 no PDF via
// @page + break-after. O escopo é obrigatório: nomes de classe se repetem
// entre páginas e, sem ele, o último <style> vence para todas.
export function buildMergedHtml(payload, config = {}) {
  const { reads, ctx, defaults } = payload;
  const ini = config.ini ?? defaults.ini;
  const fim = config.fim ?? defaults.fim;
  const hidden = new Set(config.hiddenPages ?? []);
  const model = buildModelFromReads(reads, {
    ini: parseISODate(ini), fim: parseISODate(fim),
    saldoCaixaInicial: defaults.saldoCaixaInicial ?? 0,
    anoBaseGiro: defaults.anoBaseGiro,
  });
  const styles = [], pages = [];
  for (const id of PAGE_ORDER) {
    if (hidden.has(id)) continue;
    const html = registry[id]({ model, ctx });
    const scope = `.pg-${id}`;
    for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) styles.push(scopeCss(m[1], scope));
    const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/)?.[1] ?? '';
    pages.push(`<div class="pgwrap ${scope.slice(1)}">${body}</div>`);
  }
  // <base> resolve os src relativos (ex.: /assets/logo.png) contra a origem
  // do app: o Chrome do Puppeteer, que roda fora da SPA, consegue carregá-los.
  const base = typeof location !== 'undefined' ? `<base href="${location.origin}/">` : '';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">${base}
<link href="${FONT_HREF}" rel="stylesheet">
<style>body { margin: 0; }\n${styles.join('\n')}\n.pgwrap { break-after: page; } .pgwrap:last-of-type { break-after: auto; }</style>
</head><body>${pages.join('\n')}</body></html>`;
}

// ---------- boot standalone (interativo.html gerado pelo pipeline) ----------

async function boot() {
  const app = document.getElementById('app');
  try {
    const payload = await decompressPayload(window.__PAYLOAD__);
    mountRelatorio(app, payload, window.__REPORT_CONFIG__ ?? {});
  } catch (e) {
    app.innerHTML = `<div style="padding:40px;font-family:sans-serif;color:#B0443C">Falha ao carregar o relatório: ${esc(e.message)}</div>`;
    console.error(e);
  }
}

if (typeof window !== 'undefined' && window.__PAYLOAD__) boot();
