// Leitor XLSX/XLSM em streaming, sem deps de Node/DOM (fflate é puro JS).
// Pensado para os workbooks Vision (40-110MB cujo XML descompactado passa de
// 1GB): só as abas em `needed` são infladas, e cada uma para após EMPTY_STOP
// linhas totalmente vazias seguidas — os dados reais ficam no topo e o resto é
// célula vazia estilizada (o que o SheetJS parseava inteiro, estourando heap).
// Semântica idêntica ao extract.py: max_col=60, EMPTY_STOP=200, datas como
// serials numéricos (o toDate do core resolve), linhas vazias preservadas.
import { Unzip, UnzipInflate, strFromU8 } from 'fflate';

const EMPTY_STOP = 200;
const MAX_COL = 60;
const META = new Set(['xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/sharedStrings.xml']);

const BOUNDARY = new Set([' ', '\t', '\r', '\n', '>', '/']);

function unescapeXml(s) {
  return s.replace(/&(amp|lt|gt|quot|apos|#x?[0-9a-fA-F]+);/g, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return String.fromCodePoint(cp);
    }
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e];
  });
}

function colIdx(ref) {
  let n = 0;
  for (const ch of ref) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// --- sharedStrings.xml: concatena todos os <t> dentro de cada <si> ---
export function parseSharedStrings(xml) {
  const out = [];
  const re = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = re.exec(xml))) {
    const texts = [...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((t) => unescapeXml(t[1]));
    out.push(texts.join(''));
  }
  return out;
}

// --- workbook.xml + rels → { nomeDaAba: 'xl/worksheets/sheetN.xml' } ---
export function mapSheetTargets(workbookXml, relsXml) {
  const rels = new Map();
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[0])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(m[0])?.[1];
    if (id && target) rels.set(id, target.replace(/^\//, '').replace(/^((?!xl\/).)/, 'xl/$1'));
  }
  const map = new Map();
  for (const m of workbookXml.matchAll(/<sheet\b[^>]*>/g)) {
    const name = unescapeXml(/\bname="([^"]*)"/.exec(m[0])?.[1] ?? '');
    const rid = /\br:id="([^"]+)"/.exec(m[0])?.[1];
    if (name && rid && rels.has(rid)) map.set(name, rels.get(rid));
  }
  return map;
}

function cellValue(t, body, sst) {
  const vm = /<v[^>]*>([\s\S]*?)<\/v>/.exec(body);
  switch (t) {
    case 's': {
      const i = vm ? Number(vm[1]) : NaN;
      return Number.isInteger(i) ? sst[i] ?? null : null;
    }
    case 'inlineStr': {
      const texts = [...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((x) => x[1]);
      return texts.length ? unescapeXml(texts.join('')) : null;
    }
    case 'b':
      return vm ? vm[1] === '1' : null;
    case 'e':
    case 'str':
    case 'd':
      return vm ? unescapeXml(vm[1]) : null;
    default: {
      if (!vm || vm[1] === '') return null;
      const n = Number(vm[1]);
      return Number.isNaN(n) ? unescapeXml(vm[1]) : n;
    }
  }
}

function parseCells(inner, sst) {
  const cells = [];
  let colCursor = 0;
  let i = 0;
  for (;;) {
    const c = inner.indexOf('<c', i);
    if (c === -1) break;
    const nxt = inner[c + 2];
    if (nxt === undefined || !BOUNDARY.has(nxt)) { i = c + 2; continue; }
    const gt = inner.indexOf('>', c);
    if (gt === -1) break;
    const tag = inner.slice(c, gt + 1);
    const rm = /\br="([A-Z]+)\d+"/.exec(tag);
    const ci = rm ? colIdx(rm[1]) : colCursor;
    colCursor = ci + 1;
    let val = null;
    if (tag.endsWith('/>')) {
      i = gt + 1;
    } else {
      const ce = inner.indexOf('</c>', gt);
      if (ce === -1) break;
      const t = /\bt="([^"]+)"/.exec(tag)?.[1];
      val = cellValue(t, inner.slice(gt + 1, ce), sst);
      i = ce + 4;
    }
    if (ci < MAX_COL) cells[ci] = val;
  }
  return cells;
}

// Parser incremental de <row> dentro de sheetN.xml.
function createSheetParser(sst, onRow) {
  let buf = '';
  let emptyRun = 0;
  let aborted = false;
  let earlyStop = false;
  let dimLastRow = 0;
  let lastRowNum = 0;
  const td = new TextDecoder('utf-8');

  return {
    get aborted() { return aborted; },
    get earlyStop() { return earlyStop; },
    get dimLastRow() { return dimLastRow; },
    get lastRowNum() { return lastRowNum; },
    feed(u8, final) {
      if (aborted) return;
      buf += td.decode(u8, { stream: !final });
      if (final) buf += td.decode();
      if (!dimLastRow) {
        const dm = /<dimension[^>]*ref="[^"]*?[A-Z]+(\d+)"/.exec(buf.slice(0, 2000));
        if (dm) dimLastRow = Number(dm[1]);
      }
      for (;;) {
        const i = buf.indexOf('<row');
        if (i === -1) { buf = buf.slice(-8); return; }
        const nxt = buf[i + 4];
        if (nxt === undefined) { buf = buf.slice(i); return; }
        if (!BOUNDARY.has(nxt)) { buf = buf.slice(i + 1); continue; }
        const gt = buf.indexOf('>', i);
        if (gt === -1) { buf = buf.slice(i); return; }
        // nº real da linha no Excel (atributo r do <row>) — a auditoria usa
        // para apontar a linha exata mesmo se o XML omitir linhas vazias.
        const rowNum = Number(/\br="(\d+)"/.exec(buf.slice(i, gt + 1))?.[1]) || undefined;
        let row;
        if (buf[gt - 1] === '/') {
          row = [];
          buf = buf.slice(gt + 1);
        } else {
          const close = buf.indexOf('</row>', gt + 1);
          if (close === -1) { buf = buf.slice(i); return; }
          row = parseCells(buf.slice(gt + 1, close), sst);
          buf = buf.slice(close + 6);
        }
        if (rowNum) { row._r = rowNum; lastRowNum = rowNum; }
        const empty = row.every((v) => v == null);
        emptyRun = empty ? emptyRun + 1 : 0;
        onRow(row);
        if (emptyRun >= EMPTY_STOP) {
          aborted = true;
          earlyStop = !final;
          return;
        }
      }
    },
  };
}

async function* blobChunks(blob) {
  const reader = blob.stream().getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    yield value;
  }
}

// Itera entradas do zip uma a uma; `onFile(name)` retorna {onData(u8,final), start:true}
// ou null para pular a entrada sem inflar.
async function unzipEach(blob, onFile) {
  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  let done;
  const finished = new Promise((res, rej) => {
    done = { res, rej };
  });
  unzip.onfile = (file) => {
    const handler = onFile(file.name);
    if (!handler) return; // não chama start() → entrada pulada sem descompressão
    file.ondata = (err, chunk, final) => {
      if (err) { handler.onError?.(err); return; }
      handler.onData?.(chunk, final);
    };
    file.start();
  };
  // Unzip não tem callback de fim; detectamos pelo end da entrada esperada.
  const pump = (async () => {
    try {
      for await (const chunk of blobChunks(blob)) unzip.push(chunk, false);
      unzip.push(new Uint8Array(0), true);
      done.res();
    } catch (e) { done.rej(e); }
  })();
  await Promise.all([pump, finished]);
}

/**
 * Lê as abas `needed` de um File/Blob .xlsm/.xlsx em streaming.
 * Retorna { sheets: Record<string, any[][]>, missing: string[] }.
 */
export async function sheetsFromXlsxBlob(blob, needed) {
  // Pass 1: metadados (pequenos) — mapa de abas e tabela de strings.
  const meta = {};
  await unzipEach(blob, (name) => {
    if (!META.has(name)) return null;
    const parts = [];
    return {
      onData: (u8, final) => { parts.push(u8); if (final) meta[name] = concatU8(parts); },
    };
  });
  if (!meta['xl/workbook.xml'] || !meta['xl/_rels/workbook.xml.rels']) {
    throw new Error('Arquivo não é um workbook XLSX válido (workbook.xml ausente).');
  }
  const targetMap = mapSheetTargets(strFromU8(meta['xl/workbook.xml']), strFromU8(meta['xl/_rels/workbook.xml.rels']));
  const sst = meta['xl/sharedStrings.xml'] ? parseSharedStrings(strFromU8(meta['xl/sharedStrings.xml'])) : [];

  const wanted = needed.filter((n) => targetMap.has(n));
  const missing = needed.filter((n) => !targetMap.has(n));
  const byTarget = new Map(wanted.map((n) => [targetMap.get(n), n]));

  // Pass 2: só as abas necessárias são infladas; cada parser para cedo.
  const sheets = {};
  await unzipEach(blob, (name) => {
    const sheetName = byTarget.get(name);
    if (!sheetName) return null;
    const rows = [];
    sheets[sheetName] = rows;
    const parser = createSheetParser(sst, (r) => rows.push(r));
    return {
      onData: (u8, final) => {
        if (!parser.aborted) parser.feed(u8, final);
        // Parou cedo e a planilha declara linhas além do ponto de parada:
        // pode haver dados reais abaixo de um trecho de 200+ linhas vazias.
        if (final && parser.earlyStop && parser.dimLastRow > parser.lastRowNum) {
          rows._truncado = { ultimaLida: parser.lastRowNum, declarada: parser.dimLastRow };
        }
      },
    };
  });
  return { sheets, missing };
}

function concatU8(parts) {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
