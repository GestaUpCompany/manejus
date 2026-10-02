 // Loader de XLSM via SheetJS (resolve xlsx do app manejus via createRequire).
// Retorna linhas como arrays de valores crus; datas viram números seriais Excel.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');
import { NEEDED_SHEETS } from './core.mjs';

const requireFromManejus = createRequire(path.join(root, 'apps/manejus/package.json'));
const XLSX = requireFromManejus('xlsx');

export { NEEDED_SHEETS };

export function loadWorkbook(filePath) {
  // 1ª passada só de nomes (barata); 2ª parseia só as abas necessárias —
  // o workbook tem abas enormes auxiliares que estouram o heap se parseadas.
  const namesOnly = XLSX.readFile(filePath, { bookSheets: true });
  const wanted = namesOnly.SheetNames.filter(n => NEEDED_SHEETS.includes(n));
  const wb = XLSX.readFile(filePath, { sheets: wanted });
  const sheets = {};
  for (const name of wanted) {
    sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], {
      header: 1, raw: true, defval: null,
    });
  }
  return { sheets, allNames: namesOnly.SheetNames };
}

// Carrega JSON intermediario gerado por extract.py (mesma forma de sheet_to_json).
export async function loadExtracted(jsonPath) {
  const { readFile } = await import('node:fs/promises');
  const parsed = JSON.parse(await readFile(jsonPath, 'utf8'));
  return { sheets: parsed.sheets, allNames: Object.keys(parsed.sheets) };
}

export { toDate, toNum, toStr, findDataStart, inPeriod, parseISODate } from './core.mjs';
