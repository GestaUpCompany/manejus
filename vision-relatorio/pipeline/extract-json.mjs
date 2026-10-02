// Extrator XLSM -> JSON intermediario (streaming, sem Python nem SheetJS).
// Uso: node extract-json.mjs <arquivo.xlsm> [--out extract.json]
// Gera {file, sheets:{<aba>: [[v,...]]}} no formato que o painel Vision aceita.
// Datas saem como serials numéricos Excel (o modelo resolve via toDate).
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { openAsBlob } from 'node:fs';
import { NEEDED_SHEETS } from './lib/core.mjs';
import { sheetsFromXlsxBlob } from './lib/xlsx-stream.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const outIdx = args.indexOf('--out');
const out = outIdx >= 0 ? args[outIdx + 1]
  : file.replace(/\.(xlsm|xlsx)$/i, '').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase() + '.json';

if (!file) {
  console.error('Uso: node extract-json.mjs <arquivo.xlsm> [--out extract.json]');
  process.exit(1);
}

console.log(`[load] ${file}`);
const blob = await openAsBlob(path.resolve(file));
const { sheets, missing } = await sheetsFromXlsxBlob(blob, NEEDED_SHEETS);
if (missing.length) console.warn('[warn] abas ausentes:', missing.join(', '));
for (const [name, rows] of Object.entries(sheets)) {
  console.log(`[sheet] ${name}: ${rows.length} linhas`);
}
writeFileSync(path.resolve(out), JSON.stringify({ file, sheets }));
console.log(`[ok] ${out}`);
