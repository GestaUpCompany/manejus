// p.1 — Capa + p.20 — Encerramento (100% visuais, sem dados de modelo)
import { esc } from '../lib/fmt.mjs';

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function periodoLabel(ini, fim) {
  const toIso = (d) => (d instanceof Date ? d.toISOString() : String(d));
  const [ai, mi] = toIso(ini).slice(0, 7).split('-').map(Number);
  const [af, mf] = toIso(fim).slice(0, 7).split('-').map(Number);
  if (ai === af) return { pill: String(ai), periodo: `${MESES[mi - 1]} a ${MESES[mf - 1]}` };
  return { pill: `${ai}–${af}`, periodo: `${MESES[mi - 1]}/${ai} a ${MESES[mf - 1]}/${af}` };
}

const css = `
.page { flex-direction: unset; }
.band { position: absolute; top: -165px; left: -5%; width: 115%; height: 215px; border-radius: 0 0 50% 50% / 0 0 100% 100%; }
.band.capa { background: linear-gradient(90deg, var(--green-dark) 0%, var(--green) 60%, #2FBF63 100%); }
.band.final { background: linear-gradient(90deg, #2FBF63 0%, var(--green) 40%, var(--green-dark) 100%); }
.photo-wrap-blue { position: absolute; top: 0; background: var(--blue); }
.photo-wrap { position: absolute; top: 0; background: var(--green); }
.capa .photo-wrap-blue, .capa .photo-wrap, .capa .photo { right: 0; clip-path: polygon(22% 0, 100% 0, 100% 100%, 0 100%); }
.capa .photo-wrap-blue { width: 592px; height: 728px; }
.capa .photo-wrap { width: 580px; height: 728px; }
.capa .photo { position: absolute; top: 0; width: 560px; height: 720px; object-fit: cover; }
.final .photo-wrap-blue { left: 0; width: 592px; height: 728px; clip-path: polygon(0 0, 78% 0, 100% 100%, 0 100%); }
.final .photo-wrap { left: 0; width: 580px; height: 728px; clip-path: polygon(0 0, 78% 0, 100% 100%, 0 100%); }
.final .photo-clip { position: absolute; top: 0; left: 0; width: 560px; height: 720px; clip-path: polygon(0 0, 78% 0, 100% 100%, 0 100%); }
.final .photo { width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }
.brands { position: absolute; top: 56px; display: flex; align-items: center; gap: 26px; }
.capa .brands { left: 72px; }
.final .brands { right: 72px; }
.brands .gestaup { height: 148px; }
.brands .divider { width: 1.5px; height: 104px; background: #D5DCE3; }
.brands .fazenda { height: 100px; }
.capa .content { position: absolute; left: 72px; top: 296px; width: 620px; }
.capa .kicker { font-size: 21px; font-weight: 700; letter-spacing: 5px; color: var(--green-dark); text-transform: uppercase; margin-bottom: 34px; display: flex; align-items: center; gap: 16px; }
.capa .kicker::before { content: ''; width: 56px; height: 3px; background: var(--green); }
.capa h1 { font-size: 74px; line-height: 1.02; font-weight: 800; color: var(--blue); letter-spacing: -2px; margin-bottom: 36px; }
.capa .meta { display: flex; align-items: center; gap: 18px; }
.capa .pill { background: var(--green); color: #fff; font-weight: 700; font-size: 26px; border-radius: 999px; padding: 11px 40px; letter-spacing: 1px; box-shadow: 0 6px 18px rgba(23,163,74,.30); }
.capa .period { font-size: 19px; color: var(--muted); font-weight: 500; }
.final .content { position: absolute; right: 72px; top: 300px; width: 620px; text-align: right; }
.final h1 { font-size: 80px; line-height: 1.0; font-weight: 800; color: var(--blue); letter-spacing: -2px; }
.cfoot { position: absolute; bottom: 40px; display: flex; align-items: center; justify-content: space-between; }
.capa .cfoot { left: 72px; right: 600px; }
.final .cfoot { left: 660px; right: 72px; }
.social { display: flex; align-items: center; gap: 10px; color: var(--blue); font-weight: 700; font-size: 18px; }
.social svg { width: 22px; height: 22px; }
.product { font-size: 16px; color: var(--muted); font-weight: 500; }
.product b { color: var(--blue); font-weight: 800; }
.bottom-rule { position: absolute; bottom: 0; left: 0; right: 0; height: 5px; background: var(--blue); }
.bottom-rule::after { content:''; position:absolute; bottom:5px; left:0; right:0; height:3px; background: var(--green); }
`;

const insta = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="17.6" cy="6.4" r="1.3" fill="currentColor" stroke="none"/></svg>`;

const doc = (body) => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
@page { size: 1280px 720px; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
:root { --blue: #0B3D6E; --blue-deep: #082F56; --green: #17A34A; --green-dark: #0F7A38; --ink: #12263A; --muted: #5B6B7B; --line: #E3E8EE; }
body { font-family: 'Archivo', 'Segoe UI', sans-serif; }
.page { width: 1280px; height: 720px; position: relative; overflow: hidden; background: #fff; }
${css}
</style></head><body>${body}</body></html>`;

export function renderCapa({ model, ctx }) {
  const { meta } = model;
  const { pill, periodo } = periodoLabel(meta.ini, meta.fim);
  return doc(`
<div class="page capa">
  <div class="band capa"></div>
  <div class="photo-wrap-blue"></div>
  <div class="photo-wrap"><img class="photo" src="${esc(ctx.fotoCapa)}" style="object-position:${ctx.capaPos ?? '50% 50%'};${ctx.capaFlip ? 'transform:scaleX(-1)' : ''}" alt=""></div>
  <div class="brands">
    <img class="gestaup" src="${esc(ctx.logoGestaup)}" alt="Gesta'Up Intelligence">
    ${ctx.logoFazenda ? `<div class="divider"></div><img class="fazenda" src="${esc(ctx.logoFazenda)}" alt="${esc(ctx.fazendaNome)}">` : ''}
  </div>
  <div class="content">
    <div class="kicker">Relatório Zootécnico e Financeiro</div>
    <h1>${esc(ctx.fazendaNome)}</h1>
    <div class="meta"><div class="pill">${pill}</div><div class="period">${periodo}</div></div>
  </div>
  <div class="cfoot">
    <div class="social">${insta} @gestaup.company</div>
    <div class="product"><b>Vision'Up</b></div>
  </div>
  <div class="bottom-rule"></div>
</div>`);
}

export function renderFinal({ model, ctx }) {
  return doc(`
<div class="page final">
  <div class="band final"></div>
  <div class="photo-wrap-blue"></div>
  <div class="photo-wrap"></div>
  <div class="photo-clip"><img class="photo" src="${esc(ctx.fotoFinal ?? ctx.fotoCapa)}" style="object-position:${ctx.finalPos ?? '50% 50%'}${ctx.finalFlip === false ? ';transform:none' : ''}" alt=""></div>
  <div class="brands">
    ${ctx.logoFazenda ? `<img class="fazenda" src="${esc(ctx.logoFazenda)}" alt="${esc(ctx.fazendaNome)}"><div class="divider"></div>` : ''}
    <img class="gestaup" src="${esc(ctx.logoGestaup)}" alt="Gesta'Up Intelligence">
  </div>
  <div class="content"><h1>Atenciosamente</h1></div>
  <div class="cfoot">
    <div class="product"><b>Vision'Up</b></div>
    <div class="social">${insta} @gestaup.company</div>
  </div>
  <div class="bottom-rule"></div>
</div>`);
}
