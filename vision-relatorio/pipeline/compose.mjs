// Compositor: model.json → páginas HTML → PDF + PNG.
// Uso: node compose.mjs model.json --pages p03[,p04...] [--logo caminho.png] [--out out/]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const requireManejus = createRequire(path.join(root, 'apps/manejus/package.json'));

const args = process.argv.slice(2);
const modelPath = path.resolve(args[0]);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const pagesArg = opt('pages', 'p03').split(',');
const outDir = path.resolve(opt('out', 'out'));
const logoGestaup = path.resolve(__dirname, '../../tmp_pbix/Report/StaticResources/RegisteredResources/Gestaup_Intelligence-0127124017850949067.png');
const logoExplicit = args.includes('--logo');
const logoSrc = path.resolve(opt('logo', logoGestaup));

const model = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
const ctx = {
  logoSrc,
  logoGestaup,
  logoFazenda: logoExplicit ? logoSrc : null,
  fazendaNome: opt('nome', 'Fazenda'),
  fotoCapa: opt('capa', path.resolve(root, 'apps/vision/public/assets/capa-default.png')),
  fotoFinal: opt('final', null) ?? undefined,
  capaPos: opt('capa-pos', undefined),
  finalPos: opt('final-pos', undefined),
  capaFlip: args.includes('--capa-flip'),
  finalFlip: args.includes('--final-flip') ? true : (args.includes('--no-final-flip') ? false : undefined),
};
fs.mkdirSync(outDir, { recursive: true });

const registry = {
  p01: (await import('./pages/p01.mjs')).renderCapa,
  p20: (await import('./pages/p01.mjs')).renderFinal,
  p02: (await import('./pages/p02.mjs')).render,
  p04: (await import('./pages/p04.mjs')).render,
  p05: (await import('./pages/p05.mjs')).render,
  p06: (await import('./pages/p06.mjs')).render,
  p07: (await import('./pages/p07.mjs')).render,
  p08: (await import('./pages/p08.mjs')).render,
  p09: (await import('./pages/p0910.mjs')).renderMortes,
  p10: (await import('./pages/p0910.mjs')).renderConsumo,
  p11: (await import('./pages/p11.mjs')).render,
  p12: (await import('./pages/p12.mjs')).render,
  p13: (await import('./pages/p13.mjs')).render,
  p14: (await import('./pages/p14.mjs')).render,
  p15: (await import('./pages/p15.mjs')).render,
  p16: (await import('./pages/p16.mjs')).render,
  p17: (await import('./pages/p17.mjs')).render,
  p18: (await import('./pages/p18.mjs')).render,
  p19: (await import('./pages/p19.mjs')).render,
  p03: (await import('./pages/p03.mjs')).render,
};

const htmlFiles = [];
for (const p of pagesArg) {
  const render = registry[p];
  if (!render) { console.warn(`[warn] página ${p} sem template`); continue; }
  const html = render({ model, ctx });
  const f = path.join(outDir, `${p}.html`);
  fs.writeFileSync(f, html);
  htmlFiles.push(f);
  console.log(`[html] ${f}`);
}

// render PDF+PNG por página (reutiliza helpers do manejus)
const { generatePdf, findLocalChrome } = await import(pathToFileURL(path.join(root, 'apps/manejus/api/pdf/_shared/puppeteer.js')).href);
const { default: puppeteer } = await import(pathToFileURL(requireManejus.resolve('puppeteer-core')).href);

const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const inlineImages = (html, inPath) => html.replace(/src=["'](?!https?:|data:)([^"']+)["']/g, (m, rel) => {
  try {
    const abs = path.resolve(inPath, '..', decodeURIComponent(rel));
    const ext = abs.slice(abs.lastIndexOf('.')).toLowerCase();
    return `src="data:${mime[ext] ?? 'application/octet-stream'};base64,${fs.readFileSync(abs).toString('base64')}"`;
  } catch { return m }
});

const executablePath = await findLocalChrome(puppeteer);
const launch = () => puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
let browser = await launch();
try {
  for (const f of htmlFiles) {
    const base = f.replace(/\.html$/, '');
    const html = inlineImages(fs.readFileSync(f, 'utf8'), f);
    const pdf = await generatePdf({ html, format: 'A4', landscape: true });
    fs.writeFileSync(base + '.pdf', pdf);
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
        await page.setContent(html, { waitUntil: 'networkidle0' });
        await page.screenshot({ path: base + '.png' });
        await page.close();
        break;
      } catch (e) {
        if (tentativa === 3) throw e;
        try { browser = await launch(); } catch {}
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    console.log(`[render] ${base}.pdf + .png`);
  }
  // PDF consolidado: concatena estilos + .page de cada HTML num único documento
  if (htmlFiles.length > 1) {
    const styles = [], pages = [];
    for (const f of htmlFiles) {
      const html = inlineImages(fs.readFileSync(f, 'utf8'), f);
      styles.push(...[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]));
      pages.push(html.match(/<body[^>]*>([\s\S]*?)<\/body>/)?.[1] ?? '');
    }
    const merged = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>${styles.join('\n')}\n.page { break-after: page; } .page:last-of-type { break-after: auto; }</style>
</head><body>${pages.join('\n')}</body></html>`;
    const out = path.join(outDir, 'relatorio.pdf');
    fs.writeFileSync(out, await generatePdf({ html: merged, format: 'A4', landscape: true }));
    console.log(`[merge] ${out} (${htmlFiles.length} páginas)`);
  }
} finally { await browser.close(); }
