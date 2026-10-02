// Payload do relatório interativo: montagem, compressão e revive de datas.
// Compartilhado entre Node (build-interativo) e browser (app Vision) — só APIs
// universais: CompressionStream/DecompressionStream existem nos dois ambientes.

const DATE_FIELDS = ['diarias', 'diariasCat', 'comprasAll', 'vendasAll', 'mortesAll', 'nascAll', 'desembAll', 'receitasAll'];

// Nota: Date.prototype.toJSON roda antes de qualquer replacer, então as datas
// serializam como ISO completo ('2026-03-15T00:00:00.000Z'). O revive cobre isso.

// Range do slicer: datas de eventos + blocos de estoque (diárias projetadas ficam fora).
export function computeRange(reads) {
  let min = '9999-12-31', max = '0000-01-01';
  const bump = (s) => { if (s) { if (s < min) min = s; if (s > max) max = s; } };
  for (const k of ['comprasAll', 'vendasAll', 'mortesAll', 'nascAll', 'desembAll', 'receitasAll']) {
    for (const r of reads[k] ?? []) {
      const d = r.data instanceof Date ? r.data.toISOString().slice(0, 10) : r.data;
      bump(d);
    }
  }
  for (const k of Object.keys(reads.estoque ?? {})) bump(`${k}-01`);
  return { min, max };
}

export function buildPayload({ reads, ctx, defaults }) {
  return { reads, ctx, defaults, range: computeRange(reads) };
}

function bytesToBase64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(s);
}

function base64ToBytes(b64) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function compressPayload(payload) {
  const json = JSON.stringify(payload);
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
  return bytesToBase64(new Uint8Array(await new Response(stream).arrayBuffer()));
}

// Reidrata os campos de data usados pelos read*s. JSON.stringify serializa Date
// via toJSON (ISO completo) antes do replacer, então no fio sempre chega string
// ISO — new Date() cobre tanto 'YYYY-MM-DD' (UTC) quanto o ISO com hora.
export function revivePayload(payload) {
  for (const k of DATE_FIELDS) {
    for (const r of payload.reads[k] ?? []) {
      if (r.data && !(r.data instanceof Date)) r.data = new Date(r.data);
    }
  }
  return payload;
}

export async function decompressPayload(b64) {
  const stream = new Blob([base64ToBytes(b64)]).stream().pipeThrough(new DecompressionStream('gzip'));
  return revivePayload(JSON.parse(await new Response(stream).text()));
}
