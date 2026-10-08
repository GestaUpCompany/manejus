// =====================================================================
// FARM PLAN · Gesta'Up · pop.js
// POP (Procedimento Operacional Padrão) em PDF anexado à atividade.
// Fica no armazenamento "pops" (privado, por fazenda) e o endereço vai
// em atividades.como_fazer.pop = { caminho, nome, bytes }.
// O aplicativo guarda uma cópia no celular para abrir mesmo sem sinal.
// =====================================================================
import { supabase } from './comum.js';

const BALDE = 'pops', CACHE = 'fp-pops', LIMITE = 20 * 1024 * 1024;
const chave = (caminho) => new URL('/__pop/' + caminho, location.origin).href;

export const temPop = (a) => !!(a?.como_fazer?.pop?.caminho);

// Envia o PDF escolhido (antes de salvar a atividade). Devolve { caminho, nome, bytes }.
export async function enviarPop(fz, file) {
  if (!file) throw new Error('Nenhum Arquivo');
  if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) throw new Error('Escolha um Arquivo PDF');
  if (file.size > LIMITE) throw new Error('PDF Maior que 20 MB');
  const id = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const caminho = `${fz}/${id}.pdf`;
  const { error } = await supabase.storage.from(BALDE).upload(caminho, file, { contentType: 'application/pdf', upsert: false });
  if (error) throw new Error(error.message);
  guardar(caminho, file).catch(() => {});
  return { caminho, nome: file.name.replace(/\.pdf$/i, ''), bytes: file.size };
}

async function guardar(caminho, blob) {
  if (!('caches' in window)) return;
  const c = await caches.open(CACHE);
  await c.put(chave(caminho), new Response(blob, { headers: { 'Content-Type': 'application/pdf' } }));
}
async function daCopia(caminho) {
  if (!('caches' in window)) return null;
  const r = await (await caches.open(CACHE)).match(chave(caminho));
  return r ? r.blob() : null;
}
async function baixar(caminho) {
  const { data, error } = await supabase.storage.from(BALDE).download(caminho);
  if (error || !data) throw new Error(error?.message || 'Sem Conexão');
  const blob = data.type === 'application/pdf' ? data : new Blob([data], { type: 'application/pdf' });
  guardar(caminho, blob).catch(() => {});
  return blob;
}

// Abre o PDF numa nova aba (a janela é aberta já no clique para o navegador não bloquear)
export async function abrirPop(pop, aviso = () => {}) {
  if (!pop?.caminho) return;
  const w = window.open('', '_blank');
  if (w) try { w.document.title = 'POP · ' + (pop.nome || ''); w.document.body.innerHTML = '<p style="font:16px system-ui;padding:24px;color:#0E3A55">Abrindo o POP…</p>'; } catch {}
  try {
    let blob = await daCopia(pop.caminho);
    if (!blob || navigator.onLine) { try { blob = await baixar(pop.caminho); } catch (e) { if (!blob) throw e; } }
    const url = URL.createObjectURL(blob);
    if (w) w.location.href = url; else location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  } catch (e) {
    if (w) w.close();
    aviso(navigator.onLine ? 'Não Foi Possível Abrir o POP: ' + e.message : 'Sem Sinal: Abra o POP uma Vez com Internet para Ele Ficar Guardado no Celular');
  }
}

// Guarda no celular os POPs das tarefas da semana (para abrir no campo, sem sinal)
export async function guardarPops(atividades) {
  if (!navigator.onLine || !('caches' in window)) return;
  const c = await caches.open(CACHE);
  const lista = [...new Set(atividades.map(a => a?.como_fazer?.pop?.caminho).filter(Boolean))];
  for (const cam of lista) { try { if (!(await c.match(chave(cam)))) await baixar(cam); } catch {} }
}
