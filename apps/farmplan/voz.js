// =====================================================================
// FARM PLAN · Gesta'Up · voz.js
// Ditar em vez de escrever: o botão 🎤 ao lado de um campo transforma a
// fala em texto (português). Usa o reconhecimento de voz do próprio
// celular (Chrome no Android, Safari no iPhone). Na maioria dos celulares
// precisa de internet; sem sinal, o colaborador grava um áudio (📎).
// =====================================================================
const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
export const temVoz = !!SR;
if (temVoz) document.documentElement.classList.add('tem-voz');

const CSS = `.mic{display:none;flex:none;width:52px;min-height:48px;border-radius:14px;border:1.5px solid var(--line);background:var(--surface);font-size:22px;place-items:center;padding:0;cursor:pointer}
.tem-voz .mic{display:inline-grid}
.mic.on{background:#C9402E;border-color:#C9402E;animation:micp 1s infinite}
@keyframes micp{50%{box-shadow:0 0 0 8px rgba(201,64,46,.18)}}
.mic-l{display:flex;gap:8px;align-items:stretch}
.mic-l>.in{flex:1;min-width:0}`;
if (typeof document !== 'undefined' && !document.getElementById('voz-css')) { const s = document.createElement('style'); s.id = 'voz-css'; s.textContent = CSS; document.head.appendChild(s); }

// Botão 🎤 que escreve no campo indicado (seletor CSS)
export const botaoMic = (alvo) => `<button type="button" class="mic" data-mic="${alvo}" aria-label="Falar em Vez de Escrever" title="Falar em Vez de Escrever">🎤</button>`;
// Campo + 🎤 lado a lado
export const comMic = (htmlCampo, alvo) => `<div class="mic-l">${htmlCampo}${botaoMic(alvo)}</div>`;

let atual = null;
function avisar(m) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 3200);
}
function ditar(b) {
  if (atual) { atual.stop(); return; }
  const alvo = document.querySelector(b.dataset.mic);
  if (!alvo) return;
  if (!navigator.onLine) return avisar('Sem Sinal: o Ditado Precisa de Internet. Grave um Áudio 🎤 no Lugar.');
  const r = new SR(); r.lang = 'pt-BR'; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
  const antes = alvo.value ? alvo.value.trim() + ' ' : '';
  r.onresult = (ev) => {
    let t = ''; for (const x of ev.results) t += x[0].transcript;
    t = t.trim(); if (!t) return;
    alvo.value = antes + (antes ? t : t.charAt(0).toUpperCase() + t.slice(1));
    alvo.dispatchEvent(new Event('input', { bubbles: true }));
  };
  r.onerror = (ev) => {
    if (ev.error === 'aborted' || ev.error === 'no-speech') return avisar('Não Ouvi Nada. Toque no 🎤 e Fale Perto do Celular.');
    avisar(ev.error === 'network' ? 'O Ditado Precisa de Internet. Grave um Áudio no Lugar.' : ev.error === 'not-allowed' || ev.error === 'service-not-allowed' ? 'Libere o Microfone para o Farm Plan nas Configurações.' : 'Não Entendi. Tente de Novo.');
  };
  r.onend = () => { b.classList.remove('on'); atual = null; alvo.focus?.({ preventScroll: true }); };
  b.classList.add('on'); atual = r;
  try { r.start(); } catch { b.classList.remove('on'); atual = null; }
}
if (typeof document !== 'undefined') document.addEventListener('click', (e) => { const b = e.target.closest('[data-mic]'); if (!b) return; e.preventDefault(); e.stopPropagation(); ditar(b); }, true);
