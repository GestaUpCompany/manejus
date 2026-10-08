// =====================================================================
// FARM PLAN · Gesta'Up · tempo.js
// Cronômetro das atividades: junta os toques (início, pausa, retomada, fim)
// de cada execução e calcula o tempo trabalhado, sem contar as pausas
// (almoço, chuva, máquina, noite). A execução pode durar vários dias.
// Também lê a meta da atividade (5º M) para conferir se foi batida.
// =====================================================================
import { tc, esc } from './comum.js';

export const PAUSAS = [['Almoço', '🍽'], ['Chuva', '🌧'], ['Máquina Parada', '🔧'], ['Continua Amanhã', '🌙'], ['Outro Motivo', '⏸']];
export const META = { bateu: ['✅', 'Bateu a Meta', 'var(--s2)'], parcial: ['🟡', 'Bateu em Parte', 'var(--s5)'], nao: ['❌', 'Não Bateu', 'var(--s4)'] };
const LIMITE = 10 * 3600e3;   // um trecho sem pausa acima de 10 h: provavelmente esqueceram de pausar

// Junta os eventos por execução e calcula tudo
export function agrupar(eventos, agora = Date.now()) {
  const g = {};
  [...eventos].sort((a, b) => String(a.em).localeCompare(String(b.em))).forEach(e => (g[e.execucao_id] ||= []).push(e));
  return Object.entries(g).map(([id, ev]) => {
    let ini = null, trab = 0, pausaIni = null, pausaMot = null, revisar = false;
    const pausas = [];
    for (const e of ev) {
      const t = new Date(e.em).getTime();
      if (e.evento === 'inicio' || e.evento === 'retomada') {
        if (pausaIni != null) { pausas.push({ motivo: pausaMot, ms: t - pausaIni }); pausaIni = null; }
        if (ini == null) ini = t;
      } else if (e.evento === 'pausa' || e.evento === 'fim') {
        if (ini != null) { let d = t - ini; if (d > LIMITE) { d = LIMITE; revisar = true; } trab += Math.max(0, d); ini = null; }
        if (e.evento === 'pausa') { pausaIni = t; pausaMot = e.motivo || 'Pausa'; }
      }
    }
    const ult = ev[ev.length - 1], fim = ev.find(e => e.evento === 'fim');
    const estado = fim ? 'fim' : ult.evento === 'pausa' ? 'pausado' : 'rodando';
    if (estado === 'rodando' && ini != null) { let d = agora - ini; if (d > LIMITE) { d = LIMITE; revisar = true; } trab += Math.max(0, d); }
    const primeiro = ev.find(e => e.evento === 'inicio') || ev[0];
    const dias = new Set(ev.map(e => new Date(e.em).toDateString())).size;
    return { id, atividade_id: primeiro.atividade_id, pessoa_id: primeiro.pessoa_id, user_id: primeiro.user_id, ativ: primeiro.atividades || null,
      ano: primeiro.ano, semana: primeiro.semana, dia: primeiro.dia, estado, eventos: ev, trabalhado: trab, pausas, revisar, dias,
      inicio: primeiro.em, fim: fim?.em || null, ultimo: ult.em, motivoPausa: estado === 'pausado' ? ult.motivo : null,
      meta_status: fim?.meta_status || null, meta_feito: fim?.meta_feito ?? null, obs: fim?.obs || null };
  });
}
export function fmtDur(ms) {
  const m = Math.round((ms || 0) / 60000), h = Math.floor(m / 60), r = m % 60;
  return h ? `${h}h${r ? ' ' + String(r).padStart(2, '0') + 'min' : ''}` : `${r}min`;
}
export const hhmm = (iso) => { const d = new Date(iso); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
// Meta e tempo previsto da atividade (ficam no 5M)
export function metaDe(a) {
  const cf = a?.como_fazer || {};
  const n = (v) => v === '' || v == null || isNaN(+v) ? null : +v;
  return { txt: cf.m5 || '', qtd: n(cf.meta_qtd), unid: cf.meta_unid || '', horas: n(cf.tempo_h) };
}
export function textoMeta(m) {
  const partes = [];
  if (m.qtd != null) partes.push(`${String(m.qtd).replace('.', ',')} ${m.unid}`.trim());
  if (m.txt) partes.push(m.txt);
  if (m.horas != null) partes.push(`Tempo Previsto: ${String(m.horas).replace('.', ',')} h`);
  return partes.join(' · ');
}
// Selo curto: "✅ Meta" / "⏱ 2h 10min"
export function seloExec(x) {
  const m = x.meta_status ? META[x.meta_status] : null;
  return `<span class="tm-selo">⏱ ${fmtDur(x.trabalhado)}${m ? ' · ' + m[0] : ''}${x.revisar ? ' · ⚠' : ''}</span>`;
}
