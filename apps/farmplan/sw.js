// =====================================================================
// FARM PLAN · Gesta'Up · sw.js (Service Worker)
// Guarda as telas e os arquivos do app no celular, para abrir sem internet.
// Sempre que tiver sinal, busca a versão nova e atualiza a cópia guardada.
// Os dados (tarefas, baixas, fotos) ficam no offline.js, não aqui.
// =====================================================================
const VERSAO = 'farmplan-v64';
const BASE = ['./', 'index.html', 'comum.js', 'midia.js', 'offline.js', 'tempo.js', 'ajuda.js', 'voz.js', 'pop.js', 'estilo.css', 'vendor/supabase.mjs',
  'logo.png', 'symbol.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'badge-96.png', 'manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO && k !== 'fp-pops').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Espera a rede no máximo alguns segundos (sinal fraco no campo) e usa a cópia guardada
function comPrazo(p, ms) { return new Promise((ok, falha) => { const t = setTimeout(() => falha(new Error('timeout')), ms); p.then(r => { clearTimeout(t); ok(r); }, er => { clearTimeout(t); falha(er); }); }); }

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Banco de dados (Supabase): nunca guardar aqui
  if (url.hostname.endsWith('supabase.co')) return;
  // Fontes e bibliotecas de fora: usa a cópia guardada; se não tiver, busca e guarda
  if (url.origin !== self.location.origin) {
    if (!/fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net/.test(url.hostname)) return;
    e.respondWith(caches.match(req).then(c => c || fetch(req).then(r => { const cp = r.clone(); caches.open(VERSAO).then(ca => ca.put(req, cp)); return r; })));
    return;
  }
  // Imagens e a biblioteca do banco (não mudam): abre na hora com a cópia guardada e atualiza por trás
  if (/\.(png|jpg|jpeg|svg|ico|webp)$/i.test(url.pathname) || url.pathname.endsWith('/vendor/supabase.mjs')) {
    e.respondWith(caches.open(VERSAO).then(async ca => { const c = await ca.match(req); const rede = fetch(req).then(r => { if (r.ok) ca.put(req, r.clone()); return r; }); if (c) { e.waitUntil(rede.catch(() => {})); return c; } return rede; }));
    return;
  }
  // Telas e arquivos do Farm Plan: tenta a versão nova; sem sinal, usa a guardada
  e.respondWith((async () => {
    const cache = await caches.open(VERSAO);
    const rede = fetch(req).then(r => { if (r.ok) cache.put(req, r.clone()); return r; });
    try { return await comPrazo(rede, 4000); }
    catch {
      const c = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await cache.match('index.html') : null);
      if (c) { e.waitUntil(rede.catch(() => {})); return c; }
      return rede;
    }
  })());
});

// ---------- Avisos no celular (notificações enviadas pela função enviar-avisos) ----------
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { texto: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Farm Plan', {
    body: d.texto || '', icon: 'icon-192.png', badge: 'badge-96.png', tag: d.tag || 'farmplan', renotify: true,
    vibrate: [80, 40, 80], data: { url: d.url || './index.html' }
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    const w = ws.find(x => 'focus' in x);
    return w ? w.focus() : self.clients.openWindow(e.notification.data?.url || './index.html');
  }));
});
