// Build do relatório interativo: extract.json → HTML autossuficiente.
// Uso: node build-interativo.mjs <extract.json> --ini 2026-01-01 --fim 2026-08-31
//      [--nome "Fazenda X"] [--logo logo.png] [--capa foto.png] [--final foto.png]
//      [--saldo 0] [--giro 2025] [--ocultar p05,p11] [--publico] [--out out/farm]
// O HTML resultante embute os dados (gzip+base64) e o bundle JS — um único arquivo
// compartilhável que reconstrói o modelo e re-renderiza as 20 páginas no browser.
// --ocultar: abas removidas do relatório. --publico: sem botão "Baixar PDF".
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadExtracted, loadWorkbook } from './lib/loader.mjs';
import { extractReads } from './lib/model.mjs';
import { buildPayload, compressPayload } from './lib/payload.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

const args = process.argv.slice(2);
const file = args[0];
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
if (!file) { console.error('uso: build-interativo.mjs <extract.json|xlsm> --ini --fim [--nome --logo --out]'); process.exit(1); }

const ini = opt('ini', '2026-01-01');
const fim = opt('fim', '2026-08-31');
const outDir = path.resolve(opt('out', 'out'));
fs.mkdirSync(outDir, { recursive: true });

const resolved = path.resolve(file);
const { sheets } = resolved.endsWith('.json') ? await loadExtracted(resolved) : loadWorkbook(resolved);
const reads = extractReads(sheets);
console.log(`[reads] ${path.basename(file)} extraído`);

const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const dataUri = (p) => {
  const abs = path.resolve(p);
  const ext = abs.slice(abs.lastIndexOf('.')).toLowerCase();
  return `data:${mime[ext] ?? 'application/octet-stream'};base64,${fs.readFileSync(abs).toString('base64')}`;
};

const logoGestaup = dataUri(path.resolve(__dirname, '../../tmp_pbix/Report/StaticResources/RegisteredResources/Gestaup_Intelligence-0127124017850949067.png'));
const logoFazenda = args.includes('--logo') ? dataUri(opt('logo')) : null;
const fotoCapa = dataUri(opt('capa', path.resolve(root, 'apps/vision/public/assets/capa-default.png')));
const fotoFinal = args.includes('--final') ? dataUri(opt('final')) : null;

const ctx = {
  logoSrc: logoFazenda ?? logoGestaup,
  logoGestaup, logoFazenda,
  fazendaNome: opt('nome', 'Fazenda'),
  fotoCapa, fotoFinal: fotoFinal ?? undefined,
};

const payload = buildPayload({
  reads,
  ctx,
  defaults: {
    ini, fim,
    saldoCaixaInicial: Number(opt('saldo', '0')),
    anoBaseGiro: Number(opt('giro', '2025')),
  },
});
const b64 = await compressPayload(payload);
console.log(`[payload] ${(b64.length / 1e6).toFixed(1)}MB base64 (gzip)`);

// bundle JS (esbuild resolve da store pnpm — não é dep direta de nenhum package)
const requireRoot = createRequire(path.join(root, 'package.json'));
const pnpmDir = path.join(root, 'node_modules', '.pnpm');
const esbuildPkg = fs.readdirSync(pnpmDir).find(d => /^esbuild@/.test(d));
const esbuild = requireRoot(path.join(pnpmDir, esbuildPkg, 'node_modules', 'esbuild', 'lib', 'main.js'));
const bundle = esbuild.buildSync({
  entryPoints: [path.join(__dirname, 'web', 'app.mjs')],
  bundle: true, format: 'iife', minify: true, write: false, logLevel: 'warning',
});
const js = bundle.outputFiles[0].text;
console.log(`[bundle] ${(js.length / 1e3).toFixed(0)}KB JS`);

const reportConfig = {
  public: args.includes('--publico'),
  hiddenPages: opt('ocultar', '').split(',').map(s => s.trim()).filter(Boolean),
};

const html = `<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${ctx.fazendaNome} — Relatório Vision'Up</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>body { margin: 0; }</style>
</head><body>
<div id="app"><div style="padding:60px;text-align:center;color:#5B6B7B;font-family:sans-serif">Carregando relatório…</div></div>
<script>window.__PAYLOAD__ = "${b64}";window.__REPORT_CONFIG__ = ${JSON.stringify(reportConfig)};</script>
<script>${js}</script>
</body></html>`;

const out = path.join(outDir, 'interativo.html');
fs.writeFileSync(out, html);
console.log(`[ok] ${out} (${(html.length / 1e6).toFixed(1)}MB)`);
