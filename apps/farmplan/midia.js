// =====================================================================
// FARM PLAN · Gesta'Up · midia.js
// Fotos, vídeos (até 30 s) e áudios do aplicativo:
//   • abrirAnexos(): janela para ver e enviar o que está ligado a uma
//     tarefa, a um Fora do Plano/Imprevisto ou a um recado.
//   • abrirVisor(): mostra a foto/vídeo/áudio em tela cheia.
//   • abrirResumoWhatsApp(): monta o resumo do dia e compartilha.
// Os arquivos ficam na pasta privada "midias" do Supabase (SQL 021).
// =====================================================================
import { supabase, tc, esc, DIAS_LONGO, ddmm, diaDaSemana } from './comum.js';
import { enfileirar, naFila, tirarDaFila, uid } from './offline.js';
import { comMic } from './voz.js';

export const LIMITE_VIDEO = 30;     // segundos
export const LIMITE_AUDIO = 120;    // segundos
const MAX_BYTES = 25 * 1024 * 1024;
const FOTO_LADO = 1600;             // a foto é reduzida para no máximo 1600 px (fica com ~300 KB)
export const ROTULO = { foto: 'Foto', video: 'Vídeo', audio: 'Áudio', texto: 'Recado' };
export const EMOJI = { foto: '📷', video: '🎥', audio: '🎤', texto: '💬' };

// ---------- Visual (fica aqui para não mexer no estilo.css) ----------
const CSS = `
.mx-scrim{position:fixed;inset:0;background:rgba(10,25,32,.45);z-index:80}
.mx-sheet{position:fixed;left:50%;bottom:0;transform:translateX(-50%);width:min(560px,100%);max-height:92vh;background:var(--bg);border-radius:16px 16px 0 0;z-index:81;display:flex;flex-direction:column;box-shadow:0 -10px 40px rgba(0,0,0,.25)}
@media (min-width:860px){.mx-sheet{bottom:auto;top:50%;transform:translate(-50%,-50%);border-radius:14px}}
.mx-h{display:flex;gap:10px;align-items:flex-start;padding:14px 16px;border-bottom:1px solid var(--line);background:var(--surface);border-radius:16px 16px 0 0}
.mx-h b{display:block;font-size:16px}.mx-h small{display:block;color:var(--muted);font-size:12px}
.mx-x{margin-left:auto;border:0;background:var(--surface2);border-radius:50%;width:32px;height:32px;font-size:16px;cursor:pointer;color:var(--ink)}
.mx-b{overflow:auto;padding:14px 16px 18px;display:grid;gap:12px}
.mx-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px}
.mx-th{position:relative;aspect-ratio:1;border-radius:10px;overflow:hidden;background:var(--navy-soft);border:1px solid var(--line);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:2px;font-size:12px;color:var(--ink2);padding:0}
.mx-th img,.mx-th video{width:100%;height:100%;object-fit:cover;display:block}
.mx-th .mx-k{position:absolute;left:5px;bottom:5px;background:rgba(0,0,0,.6);color:#fff;border-radius:6px;padding:1px 6px;font-size:11px;font-weight:700}
.mx-th .mx-del{position:absolute;right:4px;top:4px;width:24px;height:24px;border-radius:50%;border:0;background:rgba(0,0,0,.6);color:#fff;font-size:13px;cursor:pointer}
.mx-th.tx{font-size:11.5px;line-height:1.3;padding:8px;text-align:left;align-items:flex-start;justify-content:flex-start;background:var(--s3-soft);overflow:hidden}
.mx-th em{font-style:normal;font-size:26px}
.mx-acts{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.mx-acts button{display:flex;flex-direction:column;align-items:center;gap:4px;padding:14px 6px;border-radius:12px;border:1px solid var(--line);background:var(--surface);font:inherit;font-weight:700;font-size:13.5px;color:var(--ink);cursor:pointer}
.mx-acts button span{font-size:28px;line-height:1}
.mx-acts button small{font-weight:500;font-size:11px;color:var(--muted)}
.mx-acts button:disabled{opacity:.5}
.mx-gal{display:flex;gap:14px;justify-content:center;font-size:12.5px}
.mx-gal button{border:0;background:none;color:var(--s3);font:inherit;font-weight:600;cursor:pointer;text-decoration:underline}
.mx-st{font-size:13px;color:var(--muted);text-align:center;min-height:18px}
.mx-st.erro{color:var(--s4);font-weight:600}
.mx-rec{position:fixed;inset:0;background:#0b1418;z-index:90;display:flex;flex-direction:column;color:#fff}
.mx-rec .mx-v{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;position:relative}
.mx-rec video{max-width:100%;max-height:100%;background:#000}
.mx-rec .mx-mic{width:150px;height:150px;border-radius:50%;background:#1d3a46;display:flex;align-items:center;justify-content:center;font-size:64px}
.mx-rec .mx-mic.on{animation:mxp 1.2s infinite}
@keyframes mxp{0%{box-shadow:0 0 0 0 rgba(220,70,60,.6)}100%{box-shadow:0 0 0 40px rgba(220,70,60,0)}}
.mx-rec .mx-t{position:absolute;top:14px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.55);border-radius:20px;padding:4px 14px;font-weight:700;font-size:16px}
.mx-rec .mx-t.on{background:#c0392b}
.mx-rec .mx-c{display:flex;gap:14px;align-items:center;justify-content:center;padding:18px 16px calc(18px + env(safe-area-inset-bottom))}
.mx-rec .mx-c button{border:0;border-radius:24px;padding:12px 18px;font:inherit;font-weight:700;font-size:15px;cursor:pointer;background:#2a3d45;color:#fff}
.mx-rec .mx-c .mx-go{width:76px;height:76px;border-radius:50%;padding:0;background:#fff;border:5px solid #c0392b;position:relative}
.mx-rec .mx-c .mx-go i{position:absolute;inset:8px;border-radius:50%;background:#c0392b;transition:.2s}
.mx-rec .mx-c .mx-go.on i{inset:22px;border-radius:6px}
.mx-rec .mx-c .mx-ok{background:var(--s2,#2e9d55)}
.mx-rec audio{width:min(420px,90%)}
.mx-vis{position:fixed;inset:0;background:rgba(5,12,15,.94);z-index:95;display:flex;flex-direction:column;color:#fff}
.mx-vis .mx-vb{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:10px;position:relative}
.mx-vis img,.mx-vis video{max-width:100%;max-height:100%;border-radius:6px}
.mx-vis .mx-tx{max-width:520px;background:#fff;color:#111;border-radius:12px;padding:18px;font-size:16px;line-height:1.5;white-space:pre-wrap}
.mx-vis .mx-vf{padding:12px 16px calc(14px + env(safe-area-inset-bottom));font-size:13.5px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.mx-vis .mx-vf b{font-size:15px}
.mx-vis .mx-nav{position:absolute;top:50%;transform:translateY(-50%);border:0;background:rgba(255,255,255,.15);color:#fff;width:44px;height:44px;border-radius:50%;font-size:22px;cursor:pointer}
.mx-vis .mx-close{position:absolute;right:12px;top:12px;z-index:2;border:0;background:rgba(255,255,255,.18);color:#fff;width:40px;height:40px;border-radius:50%;font-size:18px;cursor:pointer}
.mx-vis a{color:#9fd3ff}
.mx-badge{display:inline-flex;gap:3px;align-items:center;font-size:11px;font-weight:700;color:var(--s3);background:var(--s3-soft);border-radius:6px;padding:0 6px;margin-left:4px;vertical-align:middle;white-space:nowrap}
.mx-anx{border:1px solid var(--line);background:var(--surface);border-radius:8px;padding:5px 8px;font-size:15px;line-height:1;cursor:pointer;color:var(--ink)}
.mx-anx b{font-size:11px;margin-left:2px}
.mx-strip{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px}
.mx-strip .mx-th{width:84px;min-width:84px;height:84px}
.mx-wa textarea{width:100%;min-height:220px;font:inherit;font-size:13px;line-height:1.45;border:1px solid var(--line);border-radius:10px;padding:10px;background:var(--surface);color:var(--ink)}
.mx-wa .mx-sel .mx-th.off{opacity:.35}
.mx-wa .mx-sel .mx-th .mx-ck{position:absolute;right:5px;top:5px;width:22px;height:22px;border-radius:50%;background:var(--s2,#2e9d55);color:#fff;font-size:13px;display:flex;align-items:center;justify-content:center}
.mx-wa .mx-sel .mx-th.off .mx-ck{background:rgba(0,0,0,.45)}
.mx-wbt{display:grid;gap:8px}
.mx-wbt .btn{justify-content:center}
`;
function css() { if (!document.getElementById('mx-css')) { const s = document.createElement('style'); s.id = 'mx-css'; s.textContent = CSS; document.head.appendChild(s); } }
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }
const fmtSeg = (s) => { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const hora = (iso) => { const d = new Date(iso); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

// ---------- Banco ----------
// Busca as mídias de uma semana (ou de um dia), já com o endereço temporário de cada arquivo
export async function buscarMidias(fz, ano, semana, filtro = {}) {
  let q = supabase.from('midias').select('*').eq('fazenda_id', fz).eq('ano', ano).eq('semana', semana);
  if (filtro.dia != null) q = q.eq('dia', filtro.dia);
  if (filtro.atividade_id) q = q.eq('atividade_id', filtro.atividade_id);
  if (filtro.fora_id) q = q.eq('fora_id', filtro.fora_id);
  if (filtro.origem) q = q.eq('origem', filtro.origem);
  const { data, error } = await q.order('registrado_em');
  if (error) return null;    // tabela ainda não existe (falta o SQL 021)
  return data || [];
}
// Endereço temporário (1 hora) para ver cada arquivo privado
export async function comEnderecos(rows) {
  const comArq = rows.filter(r => r.caminho && !r.url && !r.pendente);
  if (!comArq.length || !navigator.onLine) return rows;
  try {
    const { data } = await supabase.storage.from('midias').createSignedUrls(comArq.map(r => r.caminho), 3600);
    (data || []).forEach((d, i) => { if (d?.signedUrl) comArq[i].url = d.signedUrl; });
  } catch {}   // sem sinal: mostra só o ícone
  return rows;
}
// Contagem para os ícones: { '📷': 2, '🎥': 1 }
export function selos(rows) {
  const c = {}; rows.forEach(r => c[r.tipo] = (c[r.tipo] || 0) + 1);
  return ['foto', 'video', 'audio', 'texto'].filter(t => c[t]).map(t => `<span class="mx-badge">${EMOJI[t]}${c[t] > 1 ? c[t] : ''}</span>`).join('');
}
export function prepararVisual() { css(); }

// Tudo vai para a FILA do celular (offline.js) e sobe sozinho quando tiver sinal
async function enviarArquivo(ctx, tipo, blob, extra = {}) {
  const mime = (blob.type || (tipo === 'foto' ? 'image/jpeg' : tipo === 'video' ? 'video/mp4' : 'audio/mp4')).split(';')[0];
  if (blob.size > MAX_BYTES) throw new Error('Arquivo Grande Demais (Máximo 25 MB).');
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'audio/mp4': 'm4a', 'audio/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/aac': 'aac', 'audio/x-m4a': 'm4a' }[mime] || mime.split('/')[1] || 'bin';
  const id = uid();
  const reg = { id, fazenda_id: ctx.fz, ano: ctx.ano, semana: ctx.semana, dia: ctx.dia, origem: ctx.origem, tipo,
    atividade_id: ctx.atividade_id || null, fora_id: ctx.fora_id || null, pessoa_id: ctx.pessoa_id || null,
    caminho: `${ctx.fz}/${ctx.ano}/${ctx.semana}/${id}.${ext}`, mime, bytes: blob.size, segundos: extra.segundos || null, texto: extra.texto || null,
    registrado_por: ctx.userId, registrado_em: new Date().toISOString() };
  await enfileirar({ tipo: 'midia', dados: reg, blob });
  return { ...reg, url: URL.createObjectURL(blob), pendente: true };
}
async function enviarTexto(ctx, texto) {
  const reg = { id: uid(), fazenda_id: ctx.fz, ano: ctx.ano, semana: ctx.semana, dia: ctx.dia, origem: ctx.origem, tipo: 'texto',
    atividade_id: ctx.atividade_id || null, fora_id: ctx.fora_id || null, pessoa_id: ctx.pessoa_id || null, texto,
    registrado_por: ctx.userId, registrado_em: new Date().toISOString() };
  await enfileirar({ tipo: 'midia', dados: reg });
  return { ...reg, pendente: true };
}
export async function apagarMidia(r) {
  if (r.pendente) {   // ainda não subiu: só tira da fila
    const op = (await naFila()).find(o => o.tipo === 'midia' && o.dados?.id === r.id);
    if (op) return tirarDaFila(op.id);
  }
  await enfileirar({ tipo: 'apagar_midia', ref: r.id, caminho: r.caminho || null });
}

// ---------- Foto: reduz para ~1600 px em JPEG ----------
function reduzirFoto(file) {
  return new Promise((ok) => {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, FOTO_LADO / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => { URL.revokeObjectURL(u); ok(b && b.size < file.size ? b : file); }, 'image/jpeg', 0.8);
    };
    img.onerror = () => { URL.revokeObjectURL(u); ok(file); };    // formato que o navegador não abre: envia como está
    img.src = u;
  });
}
function escolherArquivo(accept, capture) {
  return new Promise((ok) => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept; if (capture) i.setAttribute('capture', capture);
    i.style.display = 'none'; document.body.appendChild(i);
    i.onchange = () => { ok(i.files[0] || null); i.remove(); };
    i.click();
  });
}
function duracaoDe(file) {
  return new Promise((ok) => {
    const v = document.createElement(file.type.startsWith('audio') ? 'audio' : 'video'); v.preload = 'metadata';
    const u = URL.createObjectURL(file);
    v.onloadedmetadata = () => { const d = v.duration; URL.revokeObjectURL(u); ok(isFinite(d) ? d : null); };
    v.onerror = () => { URL.revokeObjectURL(u); ok(null); };
    v.src = u;
  });
}

// ---------- Gravador de vídeo e áudio (dentro do app) ----------
const podeGravar = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
function formatoGravacao(tipo) {
  const op = tipo === 'video'
    ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  return op.find(m => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } }) || '';
}
// Abre a tela preta de gravação; devolve { blob, segundos } ou null se cancelar
function gravar(tipo) {
  css();
  return new Promise(async (resolve) => {
    const lim = tipo === 'video' ? LIMITE_VIDEO : LIMITE_AUDIO;
    let stream, rec, partes = [], t0 = 0, timer = null, blob = null, seg = 0, frente = false;
    const el = document.createElement('div'); el.className = 'mx-rec';
    el.innerHTML = `<div class="mx-v">${tipo === 'video' ? '<video playsinline muted autoplay></video>' : '<div class="mx-mic">🎤</div>'}<div class="mx-t">${fmtSeg(0)} / ${fmtSeg(lim)}</div></div>
      <div class="mx-c"><button data-c="sair">Cancelar</button><button class="mx-go" data-c="go" aria-label="Gravar"><i></i></button>${tipo === 'video' ? '<button data-c="vira">🔄 Virar</button>' : '<span style="width:96px"></span>'}</div>`;
    document.body.appendChild(el);
    const tv = el.querySelector('.mx-t'), go = el.querySelector('.mx-go'), v = el.querySelector('video'), mic = el.querySelector('.mx-mic');
    const parar = () => { stream?.getTracks().forEach(t => t.stop()); clearInterval(timer); };
    const fim = (r) => { parar(); el.remove(); resolve(r); };
    async function abrirCamera() {
      stream?.getTracks().forEach(t => t.stop());
      try {
        stream = await navigator.mediaDevices.getUserMedia(tipo === 'video'
          ? { video: { facingMode: frente ? 'user' : 'environment', width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 24, max: 30 } }, audio: true }
          : { audio: { echoCancellation: true, noiseSuppression: true } });
        if (v) { v.srcObject = stream; v.play().catch(() => {}); }
      } catch (e) {
        toast(tipo === 'video' ? 'Libere a Câmera e o Microfone para o Farm Plan' : 'Libere o Microfone para o Farm Plan');
        fim(null);
      }
    }
    function revisar() {
      const u = URL.createObjectURL(blob);
      el.querySelector('.mx-v').innerHTML = (tipo === 'video' ? `<video src="${u}" controls playsinline></video>` : `<audio src="${u}" controls></audio>`) + `<div class="mx-t">${fmtSeg(seg)}</div>`;
      el.querySelector('.mx-c').innerHTML = `<button data-c="sair">Cancelar</button><button data-c="de-novo">↺ Gravar de Novo</button><button class="mx-ok" data-c="usar">✓ Enviar</button>`;
    }
    el.onclick = async (e) => {
      const c = e.target.closest('[data-c]')?.dataset.c; if (!c) return;
      if (c === 'sair') return fim(null);
      if (c === 'usar') return fim({ blob, segundos: seg });
      if (c === 'de-novo') { el.remove(); parar(); return resolve(await gravar(tipo)); }
      if (c === 'vira') { if (rec?.state === 'recording') return; frente = !frente; return abrirCamera(); }
      if (c === 'go') {
        if (rec?.state === 'recording') return rec.stop();
        const mime = formatoGravacao(tipo);
        try {
          rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), ...(tipo === 'video' ? { videoBitsPerSecond: 900000, audioBitsPerSecond: 64000 } : { audioBitsPerSecond: 64000 }) });
        } catch { rec = new MediaRecorder(stream); }
        partes = [];
        rec.ondataavailable = (ev) => { if (ev.data?.size) partes.push(ev.data); };
        rec.onstop = () => {
          clearInterval(timer); seg = Math.min(lim, (Date.now() - t0) / 1000);
          blob = new Blob(partes, { type: (rec.mimeType || mime || (tipo === 'video' ? 'video/mp4' : 'audio/mp4')).split(';')[0] });
          stream.getTracks().forEach(t => t.stop());
          revisar();
        };
        rec.start(1000); t0 = Date.now(); go.classList.add('on'); tv.classList.add('on'); mic?.classList.add('on');
        el.querySelector('[data-c=vira]')?.setAttribute('disabled', '');
        timer = setInterval(() => { const s = (Date.now() - t0) / 1000; tv.textContent = `● ${fmtSeg(s)} / ${fmtSeg(lim)}`; if (s >= lim && rec.state === 'recording') rec.stop(); }, 250);
      }
    };
    await abrirCamera();
  });
}

// ---------- Janela de anexos ----------
// ctx = { fz, ano, semana, dia, origem: 'baixa'|'fora'|'recado', atividade_id, fora_id, pessoa_id, userId,
//         titulo, sub, podeEnviar, podeApagar(r), aoMudar(lista), nomeDe(r) }
export async function abrirAnexos(ctx) {
  css();
  const recado = ctx.origem === 'recado';
  // A lista vem da tela (já com o que está guardado no celular); senão, busca no banco
  let lista = ctx.lista ? [...ctx.lista] : null;
  if (!lista) {
    lista = recado ? (await buscarMidias(ctx.fz, ctx.ano, ctx.semana, { dia: ctx.dia, origem: 'recado' }) || []).filter(r => r.registrado_por === ctx.userId)
      : (await buscarMidias(ctx.fz, ctx.ano, ctx.semana, { dia: ctx.dia, atividade_id: ctx.atividade_id, fora_id: ctx.fora_id, origem: ctx.origem })) || [];
  }
  await comEnderecos(lista);
  const m = document.createElement('div');
  m.innerHTML = `<div class="mx-scrim" data-x="1"></div><div class="mx-sheet"><div class="mx-h"><div><b>${esc(ctx.titulo)}</b><small>${esc(ctx.sub || '')}</small></div><button class="mx-x" data-x="1" aria-label="Fechar">✕</button></div><div class="mx-b"></div></div>`;
  document.body.appendChild(m);
  const corpo = m.querySelector('.mx-b');
  let ocupado = false, st = '', stErro = false, legenda = '';
  const fechar = () => { m.remove(); ctx.aoMudar?.(lista); };
  function desenhar() {
    legenda = corpo.querySelector('[name=leg]')?.value ?? legenda;
    corpo.innerHTML = `
      ${lista.length ? `<div class="mx-grid">${lista.map((r, i) => miniatura(r, i, ctx.podeApagar?.(r))).join('')}</div>` : `<div class="sub" style="text-align:center;font-size:13px">${recado ? 'Mande uma Foto, um Vídeo, um Áudio ou Escreva um Recado para o Gestor.' : 'Nada Enviado Ainda.'}</div>`}
      ${ctx.podeEnviar ? `
        ${comMic(`<input class="in" name="leg" maxlength="500" placeholder="${recado ? 'Escreva ou Fale 🎤 o Recado' : 'Legenda (Opcional): Ex.: Bebedouro do D.12 Limpo'}" value="${esc(legenda)}">`, '.mx-sheet [name=leg]')}
        <div class="mx-acts">
          <button data-a="foto" ${ocupado ? 'disabled' : ''}><span>📷</span>Foto<small>Tirar Agora</small></button>
          <button data-a="video" ${ocupado ? 'disabled' : ''}><span>🎥</span>Vídeo<small>Até ${LIMITE_VIDEO} Segundos</small></button>
          <button data-a="audio" ${ocupado ? 'disabled' : ''}><span>🎤</span>Áudio<small>Até ${LIMITE_AUDIO / 60} Minutos</small></button>
        </div>
        <div class="mx-gal"><button data-a="galfoto">Escolher Foto da Galeria</button><button data-a="galvideo">Escolher Vídeo da Galeria</button></div>
        ${recado ? `<button class="btn pri" data-a="texto" ${ocupado ? 'disabled' : ''} style="justify-content:center">💬 Enviar Só o Texto</button>` : ''}` : ''}
      <div class="mx-st ${stErro ? 'erro' : ''}">${esc(st)}</div>`;
  }
  async function enviar(fn, msgOk) {
    ocupado = true; st = 'Enviando… Não Feche Esta Tela.'; stErro = false; desenhar();
    try {
      const leg = (corpo.querySelector('[name=leg]')?.value || '').trim();
      const r = await fn(leg);
      if (r) { lista.push(r); legenda = ''; corpo.querySelector('[name=leg]') && (corpo.querySelector('[name=leg]').value = ''); st = navigator.onLine ? msgOk : msgOk.replace('Enviad', 'Guardad') + ' no Celular: Sobe Sozinho Quando o Sinal Voltar'; toast(navigator.onLine ? msgOk : 'Guardado no Celular'); }
      else st = '';
    } catch (e) {
      stErro = true; st = /fetch|network|Failed/i.test(e.message) ? 'Sem Internet: Nada Foi Perdido, Tente de Novo Quando o Sinal Voltar.' : 'Não Foi Possível Enviar: ' + e.message;
    }
    ocupado = false; desenhar();
  }
  m.addEventListener('click', async (e) => {
    if (e.target.closest('[data-x]')) return fechar();
    const del = e.target.closest('[data-del]');
    if (del) {
      e.stopPropagation();
      const r = lista[+del.dataset.del];
      if (!confirm('Apagar Este ' + ROTULO[r.tipo] + '?')) return;
      try { await apagarMidia(r); lista.splice(+del.dataset.del, 1); toast('Apagado'); desenhar(); } catch (er) { toast('Erro: ' + er.message); }
      return;
    }
    const th = e.target.closest('[data-vi]'); if (th) return abrirVisor(lista, +th.dataset.vi, ctx.nomeDe);
    const a = e.target.closest('[data-a]')?.dataset.a; if (!a || ocupado) return;
    if (a === 'foto' || a === 'galfoto') {
      const f = await escolherArquivo('image/*', a === 'foto' ? 'environment' : null); if (!f) return;
      return enviar(async (leg) => enviarArquivo(ctx, 'foto', await reduzirFoto(f), { texto: leg || null }), 'Foto Enviada');
    }
    if (a === 'galvideo') {
      const f = await escolherArquivo('video/*', null); if (!f) return;
      const d = await duracaoDe(f);
      if (d && d > LIMITE_VIDEO + 1) { st = `Esse Vídeo Tem ${Math.round(d)} Segundos. O Máximo É ${LIMITE_VIDEO}: Grave pelo Botão 🎥.`; stErro = true; return desenhar(); }
      if (f.size > MAX_BYTES) { st = 'Vídeo Grande Demais (Máximo 25 MB). Grave pelo Botão 🎥, Que Já Sai Menor.'; stErro = true; return desenhar(); }
      return enviar((leg) => enviarArquivo(ctx, 'video', f, { segundos: d, texto: leg || null }), 'Vídeo Enviado');
    }
    if (a === 'video' || a === 'audio') {
      let g;
      if (podeGravar()) g = await gravar(a);
      else {   // celular antigo: usa a câmera/gravador do próprio aparelho
        const f = await escolherArquivo(a === 'video' ? 'video/*' : 'audio/*', a === 'video' ? 'environment' : 'user'); if (!f) return;
        const d = await duracaoDe(f);
        if (a === 'video' && d && d > LIMITE_VIDEO + 1) { st = `O Vídeo Passou de ${LIMITE_VIDEO} Segundos. Grave de Novo, Mais Curto.`; stErro = true; return desenhar(); }
        g = { blob: f, segundos: d };
      }
      if (!g) return;
      return enviar((leg) => enviarArquivo(ctx, a, g.blob, { segundos: g.segundos, texto: leg || null }), a === 'video' ? 'Vídeo Enviado' : 'Áudio Enviado');
    }
    if (a === 'texto') {
      const leg = (corpo.querySelector('[name=leg]')?.value || '').trim();
      if (!leg) { st = 'Escreva o Recado Antes de Enviar.'; stErro = true; return desenhar(); }
      return enviar(() => enviarTexto(ctx, leg), 'Recado Enviado');
    }
  });
  desenhar();
}

// Quadradinho de cada mídia
export function miniatura(r, i, podeApagar) {
  const del = podeApagar ? `<button class="mx-del" data-del="${i}" aria-label="Apagar">✕</button>` : '';
  if (r.tipo === 'foto') return `<div role="button" tabindex="0" class="mx-th" data-vi="${i}">${r.url ? `<img src="${esc(r.url)}" alt="" loading="lazy">` : '<em>📷</em>'}${del}</div>`;
  if (r.tipo === 'video') return `<div role="button" tabindex="0" class="mx-th" data-vi="${i}">${r.url ? `<video src="${esc(r.url)}#t=0.5" preload="metadata" muted playsinline></video>` : ''}<span class="mx-k">▶ ${fmtSeg(r.segundos)}</span>${del}</div>`;
  if (r.tipo === 'audio') return `<div role="button" tabindex="0" class="mx-th" data-vi="${i}"><em>🎤</em>Áudio ${fmtSeg(r.segundos)}${del}</div>`;
  return `<div role="button" tabindex="0" class="mx-th tx" data-vi="${i}">💬 ${esc((r.texto || '').slice(0, 90))}${del}</div>`;
}

// ---------- Visor em tela cheia ----------
export function abrirVisor(lista, i, nomeDe) {
  css();
  const el = document.createElement('div'); el.className = 'mx-vis';
  document.body.appendChild(el);
  const ir = (k) => {
    i = (k + lista.length) % lista.length; const r = lista[i];
    const quando = `${DIAS_LONGO[r.dia]}, ${ddmm(diaDaSemana(r.semana, r.dia))}${r.registrado_em ? ' às ' + hora(r.registrado_em) : ''}`;
    const midia = r.tipo === 'foto' ? `<img src="${esc(r.url || '')}" alt="">`
      : r.tipo === 'video' ? `<video src="${esc(r.url || '')}" controls autoplay playsinline></video>`
      : r.tipo === 'audio' ? `<div style="text-align:center"><div style="font-size:70px">🎤</div><audio src="${esc(r.url || '')}" controls autoplay style="width:min(420px,86vw)"></audio></div>`
      : `<div class="mx-tx">${esc(r.texto || '')}</div>`;
    el.innerHTML = `<button class="mx-close" data-v="x" aria-label="Fechar">✕</button><div class="mx-vb">${midia}
        ${lista.length > 1 ? '<button class="mx-nav" data-v="ant" style="left:10px">‹</button><button class="mx-nav" data-v="prox" style="right:10px">›</button>' : ''}</div>
      <div class="mx-vf"><div style="flex:1;min-width:200px"><b>${esc(nomeDe ? nomeDe(r) : ROTULO[r.tipo])}</b><div style="opacity:.8">${EMOJI[r.tipo]} ${ROTULO[r.tipo]} · ${quando}</div>${r.texto && r.tipo !== 'texto' ? `<div style="margin-top:4px">${esc(r.texto)}</div>` : ''}</div>
        ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">Abrir Original ↗</a>` : ''}<span style="opacity:.7">${i + 1} de ${lista.length}</span></div>`;
  };
  el.onclick = (e) => { const v = e.target.closest('[data-v]')?.dataset.v; if (v === 'x' || e.target === el) el.remove(); else if (v === 'ant') ir(i - 1); else if (v === 'prox') ir(i + 1); };
  const tecla = (e) => { if (!document.body.contains(el)) return removeEventListener('keydown', tecla); if (e.key === 'Escape') el.remove(); if (e.key === 'ArrowLeft') ir(i - 1); if (e.key === 'ArrowRight') ir(i + 1); };
  addEventListener('keydown', tecla);
  ir(i);
}

// ---------- Resumo do Dia para o WhatsApp ----------
// dados = { fazenda, data (Date), semana, meta, tarefas:[{nome, quem, feito, motivo}], fora:[{nome, quem, imp, obs}], midias:[...], nomeDe(r), site }
export function textoResumo(dd) {
  const T = dd.tarefas, fe = T.filter(t => t.feito), nd = T.filter(t => !t.feito && t.motivo), sb = T.filter(t => !t.feito && !t.motivo);
  const pc = T.length ? Math.round(fe.length / T.length * 100) : 0;
  const porQuem = (arr) => { const g = {}; arr.forEach(t => (g[t.quem] ||= []).push(t.nome)); return Object.entries(g).sort((a, b) => b[1].length - a[1].length).map(([q, ns]) => `• *${q}:* ${ns.join(', ')}`).join('\n'); };
  const d = dd.data, cont = {}; (dd.midias || []).forEach(r => cont[r.tipo] = (cont[r.tipo] || 0) + 1);
  const L = [];
  if (dd.quem) {   // relatório do próprio colaborador / líder
    L.push(`*📋 Relatório do Dia · ${dd.quem}*`);
    L.push(`${dd.fazenda} · ${DIAS_LONGO[(d.getDay() + 6) % 7]}, ${ddmm(d)}`);
  } else {
    L.push(`*${dd.fazenda} · Relatório do Dia*`);
    L.push(`${DIAS_LONGO[(d.getDay() + 6) % 7]}, ${ddmm(d)} · Semana ${dd.semana}`);
  }
  L.push('');
  L.push(`${pc >= (dd.meta || 80) ? '✅' : pc >= 50 ? '🟡' : '🔴'} *${fe.length} de ${T.length} Tarefas Feitas (${pc}%)* · Meta ${dd.meta || 80}%`);
  if (fe.length) { L.push(''); L.push('*✔ Feitas*'); L.push(porQuem(fe)); }
  if (nd.length) { L.push(''); L.push('*✖ Não Deu*'); nd.forEach(t => L.push(`• ${t.nome} (${t.quem}): ${t.motivo}`)); }
  if (sb.length) { L.push(''); L.push('*⏳ Ficaram sem Baixa*'); L.push(porQuem(sb)); }
  const imp = (dd.fora || []).filter(x => x.imp), fp = (dd.fora || []).filter(x => !x.imp);
  if (imp.length) { L.push(''); L.push('*⚠ Imprevistos*'); imp.forEach(x => L.push(`• ${x.nome}${x.quem ? ' · ' + x.quem : ''}${x.obs ? ' · ' + x.obs : ''}`)); }
  if (fp.length) { L.push(''); L.push('*➕ Feito Fora do Plano*'); fp.forEach(x => L.push(`• ${x.nome}${x.quem ? ' · ' + x.quem : ''}${x.obs ? ' · ' + x.obs : ''}`)); }
  const rec = (dd.midias || []).filter(r => r.origem === 'recado' && r.texto);
  if (rec.length) { L.push(''); L.push('*💬 Recados*'); rec.forEach(r => L.push(`• ${dd.nomeDe ? dd.nomeDe(r) : ''}: ${r.texto}`)); }
  const tot = Object.values(cont).reduce((a, b) => a + b, 0) - (cont.texto || 0);
  if (tot) { L.push(''); L.push(`${['foto', 'video', 'audio'].filter(t => cont[t]).map(t => `${EMOJI[t]} ${cont[t]} ${ROTULO[t]}${cont[t] > 1 ? (t === 'foto' ? 's' : t === 'video' ? 's' : 's') : ''}`).join(' · ')} no Farm Plan`); }
  if (dd.site) L.push(dd.site);
  return L.join('\n');
}
// Anota que a pessoa mandou o Relatório do Dia no grupo (SQL 022)
export async function anotarRelatorio(r) {
  const dados = { fazenda_id: r.fz, ano: r.ano, semana: r.semana, dia: r.dia, pessoa_id: r.pessoa_id || null,
    user_id: r.userId, feitas: r.feitas, total: r.total, canal: r.canal, enviado_em: new Date().toISOString() };
  await enfileirar({ tipo: 'relatorio', dados });
  return dados;
}
export async function abrirResumoWhatsApp(dd) {
  css();
  const fotos = (dd.midias || []).filter(r => r.tipo === 'foto');
  await comEnderecos(fotos);
  const marcadas = new Set(fotos.slice(0, 10).map(r => r.id));
  const temShare = !!navigator.share;
  const m = document.createElement('div');
  m.innerHTML = `<div class="mx-scrim" data-x="1"></div><div class="mx-sheet mx-wa"><div class="mx-h"><div><b>📲 ${dd.quem ? 'Meu Relatório do Dia' : 'Resumo do Dia para o WhatsApp'}</b><small>Confira, Ajuste o Texto se Quiser e Mande no Grupo da Fazenda</small></div><button class="mx-x" data-x="1">✕</button></div>
    <div class="mx-b"><textarea id="mxTxt">${esc(textoResumo(dd))}</textarea>
      ${fotos.length ? `<div><b style="font-size:13px">Fotos para Mandar Junto</b> <span class="sub" style="font-size:12px">Toque para Tirar ou Pôr · Máximo 10</span><div class="mx-strip mx-sel" style="margin-top:6px">${fotos.map((r, i) => `<button class="mx-th ${marcadas.has(r.id) ? '' : 'off'}" data-fs="${i}"><img src="${esc(r.url || '')}" alt=""><span class="mx-ck">✓</span></button>`).join('')}</div></div>` : ''}
      <div class="mx-wbt">
        ${temShare ? `<button class="btn pri" data-w="share">📲 Compartilhar no WhatsApp${fotos.length ? ' (Texto + Fotos)' : ''}</button>` : ''}
        <button class="btn ${temShare ? '' : 'pri'}" data-w="wa">💬 Abrir o WhatsApp (Só o Texto)</button>
        <button class="btn" data-w="copiar">📋 Copiar o Texto</button>
      </div>
      <div class="mx-st" id="mxSt">${temShare ? 'No Celular, Escolha o WhatsApp e Depois o Grupo da Fazenda.' : 'Para Mandar as Fotos Junto, Use Esta Tela pelo Celular.'}</div></div></div>`;
  document.body.appendChild(m);
  const st = (t) => m.querySelector('#mxSt').textContent = t;
  m.addEventListener('click', async (e) => {
    if (e.target.closest('[data-x]')) return m.remove();
    const fs = e.target.closest('[data-fs]');
    if (fs) { const r = fotos[+fs.dataset.fs]; if (marcadas.has(r.id)) marcadas.delete(r.id); else if (marcadas.size < 10) marcadas.add(r.id); fs.classList.toggle('off', !marcadas.has(r.id)); return; }
    const w = e.target.closest('[data-w]')?.dataset.w; if (!w) return;
    const txt = m.querySelector('#mxTxt').value;
    if (w === 'copiar') { try { await navigator.clipboard.writeText(txt); st('Texto Copiado. Cole no Grupo do WhatsApp.'); dd.aoEnviar?.('copiar'); } catch { m.querySelector('#mxTxt').select(); st('Selecione e Copie o Texto Acima.'); } return; }
    if (w === 'wa') {   // no celular abre o WhatsApp direto (funciona sem sinal: ele envia quando o sinal voltar)
      const cel = /Android|iPhone|iPad/i.test(navigator.userAgent);
      if (cel) location.href = 'whatsapp://send?text=' + encodeURIComponent(txt); else window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank');
      dd.aoEnviar?.('whatsapp'); return; }
    if (w === 'share') {
      try {
        let files = [];
        const sel = fotos.filter(r => marcadas.has(r.id));
        if (sel.length) {
          st('Preparando as Fotos…');
          // Fotos guardadas no celular vão mesmo sem sinal; as que já subiram precisam de internet para baixar
          files = (await Promise.all(sel.map(async (r, i) => { try { const b = await (await fetch(r.url)).blob(); return new File([b], `foto-${i + 1}.jpg`, { type: b.type || 'image/jpeg' }); } catch { return null; } }))).filter(Boolean);
        }
        if (files.length && navigator.canShare && !navigator.canShare({ files })) { st('Este Aparelho Não Manda Fotos por Aqui: Vai Só o Texto.'); files = []; }
        // Alguns celulares mandam só as fotos e esquecem o texto: deixa o texto copiado para colar
        if (files.length) { try { await navigator.clipboard.writeText(txt); } catch {} }
        await navigator.share(files.length ? { text: txt, files } : { text: txt });
        dd.aoEnviar?.('compartilhar');
        st(files.length ? 'Pronto! Se o Texto Não Apareceu no Grupo, Ele Já Está Copiado: É Só Colar.' : 'Pronto! Confira no Grupo do WhatsApp.');
      } catch (er) { if (er.name !== 'AbortError') st('Não Deu para Compartilhar: Use "Abrir o WhatsApp" ou "Copiar o Texto".'); else st(''); }
    }
  });
}
