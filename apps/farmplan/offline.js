// =====================================================================
// FARM PLAN · Gesta'Up · offline.js
// O aplicativo funciona sem internet, no campo:
//   • guarda no celular a semana, as pessoas e as equipes (para abrir sem sinal);
//   • tudo o que a equipe faz (baixa, Não Deu, Fora do Plano, foto, vídeo,
//     áudio, recado, relatório) entra numa FILA dentro do celular;
//   • quando o sinal volta, a fila é enviada sozinha, na ordem em que foi feita.
// Nada se perde se o celular ficar sem internet o dia inteiro.
// =====================================================================
import { supabase } from './comum.js';

// ---------- Banco local do celular (IndexedDB) ----------
const NOME = 'farmplan-offline';
let _db = null;
function abrir() {
  return new Promise((ok, falha) => {
    const r = indexedDB.open(NOME, 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('kv'); d.createObjectStore('fila', { keyPath: 'id' }); };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => falha(r.error);
  });
}
const db = () => _db || (_db = abrir());
async function tx(store, modo, fn) {
  const d = await db();
  return new Promise((ok, falha) => {
    const t = d.transaction(store, modo), req = fn(t.objectStore(store));
    let res; if (req) req.onsuccess = () => { res = req.result; };
    t.oncomplete = () => ok(res); t.onerror = () => falha(t.error); t.onabort = () => falha(t.error);
  });
}
export const uid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
export const guardar = (k, v) => tx('kv', 'readwrite', s => s.put(v, k)).catch(() => {});
export const ler = (k) => tx('kv', 'readonly', s => s.get(k)).catch(() => null);
export const apagarGuardado = (k) => tx('kv', 'readwrite', s => s.delete(k)).catch(() => {});
export const naFila = () => tx('fila', 'readonly', s => s.getAll()).then(l => (l || []).sort((a, b) => a.ordem - b.ordem)).catch(() => []);
export const tirarDaFila = (id) => tx('fila', 'readwrite', s => s.delete(id)).catch(() => {}).then(avisar);
export async function enfileirar(op) {
  op.id = op.id || uid(); op.ordem = Date.now() + Math.random(); op.criado = new Date().toISOString();
  await tx('fila', 'readwrite', s => s.put(op));
  avisar(); agendar();
  return op;
}

// ---------- Prazo: não ficar esperando um sinal fraco para sempre ----------
export function comPrazo(promessa, ms = 9000) {
  return Promise.race([promessa, new Promise((_, falha) => setTimeout(() => falha(new Error('timeout: sem sinal')), ms))]);
}

// ---------- Estado da fila (para a faixa "Sem Sinal · 3 Aguardando Envio") ----------
export const estado = { pend: 0, erros: 0, enviando: false, semSinal: !navigator.onLine, semLogin: false, ultimoErro: '' };
const ouvintes = new Set();
export function aoMudarFila(fn) { ouvintes.add(fn); fn(estado); return () => ouvintes.delete(fn); }
async function avisar() {
  const l = await naFila();
  estado.pend = l.length; estado.erros = l.filter(o => o.erro).length;
  estado.ultimoErro = l.find(o => o.erro)?.erro || '';
  ouvintes.forEach(f => { try { f(estado); } catch {} });
}
export function marcarSemSinal(v) { estado.semSinal = v; avisar(); }

// ---------- Envio da fila ----------
const ehRede = (e) => !navigator.onLine || /fetch|network|load failed|timeout|abort|offline|JWT|sem sinal|gateway|502|503|504/i.test(String(e?.message || e || ''));
const ok23505 = (r) => { if (r.error && r.error.code !== '23505') throw new Error(r.error.message || String(r.error)); };   // 23505 = já estava lá (enviado antes)
async function executar(op) {
  const d = op.dados;
  if (op.tipo === 'baixa') {
    ok23505(await supabase.from('baixas').upsert(d, { onConflict: 'atividade_id,ano,semana,dia' }));
  } else if (op.tipo === 'desfazer') {
    const c = op.chave;
    ok23505(await supabase.from('baixas').delete().eq('atividade_id', c.atividade_id).eq('ano', c.ano).eq('semana', c.semana).eq('dia', c.dia));
  } else if (op.tipo === 'fora') {
    ok23505(await supabase.from('fora_do_plano').insert(d));
  } else if (op.tipo === 'remover_fora') {
    if (op.caminhos?.length) await supabase.storage.from('midias').remove(op.caminhos);
    ok23505(await supabase.from('fora_do_plano').delete().eq('id', op.ref));
  } else if (op.tipo === 'midia') {
    if (op.blob) {
      const up = await supabase.storage.from('midias').upload(d.caminho, op.blob, { contentType: d.mime, upsert: false });
      if (up.error && !/exist|duplicate/i.test(up.error.message)) throw new Error(up.error.message);
    }
    ok23505(await supabase.from('midias').insert(d));
  } else if (op.tipo === 'apagar_midia') {
    if (op.caminho) await supabase.storage.from('midias').remove([op.caminho]);
    ok23505(await supabase.from('midias').delete().eq('id', op.ref));
  } else if (op.tipo === 'execucao') {
    ok23505(await supabase.from('execucoes').insert(d));
  } else if (op.tipo === 'relatorio') {
    ok23505(await supabase.from('relatorios_dia').upsert(d, { onConflict: 'fazenda_id,ano,semana,dia,user_id' }));
  }
}
let rodando = false, timer = null;
function agendar() { clearTimeout(timer); timer = setTimeout(sincronizar, 400); }
export async function sincronizar() {
  if (rodando) return;
  const l = await naFila();
  if (!l.length) { estado.enviando = false; return avisar(); }
  if (!navigator.onLine) { estado.semSinal = true; return avisar(); }
  rodando = true; estado.enviando = true; avisar();
  try {
    // O login precisa estar válido (renova sozinho quando o sinal volta)
    const { data: { session } } = await comPrazo(supabase.auth.getSession(), 12000).catch(() => ({ data: { session: null } }));
    if (!session) { estado.semLogin = navigator.onLine; estado.semSinal = !navigator.onLine; return; }
    estado.semLogin = false;
    for (const op of l) {
      try {
        await comPrazo(executar(op), op.blob ? 120000 : 20000);
        await tx('fila', 'readwrite', s => s.delete(op.id));
        estado.semSinal = false;
      } catch (e) {
        if (ehRede(e)) { estado.semSinal = true; break; }
        op.erro = String(e.message || e); op.tentativas = (op.tentativas || 0) + 1;
        await tx('fila', 'readwrite', s => s.put(op));
      }
      avisar();
    }
  } finally { rodando = false; estado.enviando = false; avisar(); }
}

// ---------- Liga tudo sozinho em qualquer tela que use este arquivo ----------
addEventListener('online', () => { estado.semSinal = false; sincronizar(); });
addEventListener('offline', () => { estado.semSinal = true; avisar(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) sincronizar(); });
setInterval(sincronizar, 45000);
try { navigator.storage?.persist?.(); } catch {}   // pede para o celular não apagar os dados guardados
setTimeout(sincronizar, 1500);

// Texto da faixa de sinal (usada no aplicativo)
export function faixaSinal(e = estado) {
  if (e.semLogin) return `<div class="sinal err">🔑 Entre de Novo para Enviar o Que Está Guardado (${e.pend})</div>`;
  if (e.enviando && e.pend) return `<div class="sinal env">↻ Enviando ${e.pend} ${e.pend === 1 ? 'Item' : 'Itens'}…</div>`;
  if (e.semSinal) return `<div class="sinal off">📵 Sem Sinal${e.pend ? ` · <b>${e.pend}</b> ${e.pend > 1 ? 'Guardados no Celular, Vão' : 'Guardado no Celular, Vai'} Quando o Sinal Voltar` : ' · Pode Usar Normalmente'}</div>`;
  if (e.erros) return `<div class="sinal err" title="${String(e.ultimoErro).replace(/"/g, '')}">⚠ ${e.erros} ${e.erros === 1 ? 'Item Não Foi Aceito' : 'Itens Não Foram Aceitos'} pelo Sistema · Avise o Gestor</div>`;
  if (e.pend) return `<div class="sinal env">↻ ${e.pend} Aguardando Envio</div>`;
  return `<div class="sinal ok">✓ Tudo Enviado</div>`;
}
