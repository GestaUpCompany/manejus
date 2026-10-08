// =====================================================================
// FARM PLAN · Edge Function "enviar-avisos"
// Tudo o que o sistema manda sozinho, no horário certo (cron do Supabase):
//  • tipo 'manha'    (6h30)  aviso no celular: "Você tem X tarefas hoje"
//  • tipo 'tarde'    (17h)   aviso no celular: "Falta o relatório do dia"
//  • tipo 'consultor'(8h)    alerta ao consultor: fazendas 3+ dias sem baixa ou abaixo da meta
//                            (no celular e, se configurado, por e-mail)
//  • tipo 'mensal'   (dia 1º, 7h) Relatório Mensal em PDF por e-mail para o produtor
//  • tipo 'semanal'  (segunda, 7h) Relatório da Semana em PDF no WhatsApp do produtor
// Testes feitos pelo usuário logado (sem chave do cron):
//  • { teste: true }                → aviso de teste no próprio celular
//  • { mensal_teste: <fazenda_id> } → manda agora o relatório do mês passado (gestor/consultor)
//  • { semanal_teste: <fazenda_id> }→ manda agora o relatório da semana passada no WhatsApp
// Segredos (Edge Functions › Secrets): VAPID_PUBLICA, VAPID_PRIVADA, AVISO_CHAVE
//   e, para e-mail: RESEND_API_KEY e EMAIL_REMETENTE (ex.: Farm Plan <farmplan@farmplan.gestaup.com>)
//   e, para WhatsApp: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID (opcionais: WHATSAPP_MODELO, WHATSAPP_IDIOMA, WHATSAPP_VERSAO)
// Em Settings desta função, deixar DESLIGADO o "Verify JWT" (a função confere sozinha).
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

const SITE = Deno.env.get('SITE_URL') || 'https://farmplan-lime.vercel.app';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-aviso-chave',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const responder = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

// ---------- E-mail (Resend) ----------
async function email(para: string[], assunto: string, html: string, anexos: { filename: string; content: string }[] = []) {
  const chave = Deno.env.get('RESEND_API_KEY');
  if (!chave || !para.length) return { ok: false, motivo: chave ? 'sem destinatário' : 'e-mail não configurado' };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: 'Bearer ' + chave, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: Deno.env.get('EMAIL_REMETENTE') || 'Farm Plan <onboarding@resend.dev>', to: para, subject: assunto, html, attachments: anexos })
  });
  return { ok: r.ok, motivo: r.ok ? '' : await r.text() };
}
const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
// ---------- WhatsApp (API oficial da Meta · WhatsApp Cloud API) ----------
// Números: só dígitos, com DDI 55 (se vier só DDD + número, coloca o 55)
const listaWhats = (s: string | null) => String(s || '').split(/[,;\/]+/).map(x => x.replace(/\D/g, '')).filter(x => x.length >= 10)
  .map(x => (x.length <= 11 ? '55' + x : x));
async function whatsapp(numeros: string[], pdf: Uint8Array, arquivo: string, params: string[]) {
  const token = Deno.env.get('WHATSAPP_TOKEN'), fone = Deno.env.get('WHATSAPP_PHONE_ID');
  if (!token || !fone) return { ok: false, enviados: 0, motivo: 'WhatsApp ainda não configurado: faltam os segredos WHATSAPP_TOKEN e WHATSAPP_PHONE_ID no Supabase.' };
  const v = Deno.env.get('WHATSAPP_VERSAO') || 'v23.0', modelo = Deno.env.get('WHATSAPP_MODELO') || 'relatorio_semanal', idioma = Deno.env.get('WHATSAPP_IDIOMA') || 'pt_BR';
  const api = `https://graph.facebook.com/${v}/${fone}`;
  // 1. sobe o PDF para o WhatsApp
  const fd = new FormData();
  fd.append('messaging_product', 'whatsapp'); fd.append('type', 'application/pdf');
  fd.append('file', new Blob([pdf as BlobPart], { type: 'application/pdf' }), arquivo);
  const up = await fetch(api + '/media', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd });
  const uj = await up.json().catch(() => ({}));
  if (!up.ok || !uj.id) return { ok: false, enviados: 0, motivo: 'O WhatsApp não aceitou o PDF: ' + (uj?.error?.message || up.status) };
  // 2. manda o modelo de mensagem aprovado pela Meta, com o PDF no cabeçalho
  const txt = (t: unknown) => String(t ?? '').replace(/[\n\r\t]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, 600) || '-';
  let enviados = 0; const falhas: string[] = [];
  for (const para of numeros) {
    const r = await fetch(api + '/messages', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: para, type: 'template', template: { name: modelo, language: { code: idioma }, components: [
        { type: 'header', parameters: [{ type: 'document', document: { id: uj.id, filename: arquivo } }] },
        { type: 'body', parameters: params.map(p => ({ type: 'text', text: txt(p) })) }] } }) });
    const rj = await r.json().catch(() => ({}));
    if (r.ok) enviados++; else falhas.push(para + ': ' + (rj?.error?.error_data?.details || rj?.error?.message || r.status));
  }
  return { ok: enviados > 0, enviados, falhas, motivo: falhas.join(' · ') };
}
// Semana ISO (segunda a domingo) de uma data
const semanaIso = (d: Date) => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const dia = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dia);
  const ini = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return { ano: t.getUTCFullYear(), semana: Math.ceil(((+t - +ini) / 86400000 + 1) / 7) }; };
const listaEmails = (s: string | null) => String(s || '').split(/[,;\s]+/).map(x => x.trim().toLowerCase()).filter(x => /^[^@]+@[^@]+\.[^@]+$/.test(x));

// ---------- PDF do Relatório Mensal ----------
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const NAVY = rgb(0x11/255, 0x46/255, 0x65/255), VERDE = rgb(0x1e/255, 0x9a/255, 0x47/255), CINZA = rgb(.42,.47,.49), TINTA = rgb(.09,.14,.16), LINHA = rgb(.89,.91,.9), VERM = rgb(.79,.25,.18), AMAR = rgb(.72,.49,.06);
// pdf-lib (fonte padrão) não desenha emoji: troca por texto simples
const limpo = (s: unknown) => String(s ?? '').replace(/[^\u0000-ÿ–—•]/g, '').trim();
// Textos que mudam entre o relatório da semana e o do mês
function periodo(r: any) {
  const sem = r.periodo === 'semana';
  return sem ? { sem, Nome: 'Semana', doP: 'da semana', noP: 'na semana', neste: 'nesta semana', aoAnt: 'à semana anterior', vsAnt: 'vs semana anterior', ant: 'semana anterior',
                 titulo: 'RELATÓRIO SEMANAL DA FAZENDA', sub: `Semana ${r.semana} · ${r.inicio} a ${r.fim}`, det: 'Detalhes da Semana' }
             : { sem, Nome: 'Mês', doP: 'do mês', noP: 'no mês', neste: 'neste mês', aoAnt: 'ao mês anterior', vsAnt: 'vs mês anterior', ant: 'mês anterior',
                 titulo: 'RELATÓRIO MENSAL DA FAZENDA', sub: `${MESES[r.mes - 1]} de ${r.ano}`, det: 'Detalhes do Mês' };
}
// Destaques e Pontos de Atenção do mês, calculados a partir dos números (usado no PDF e no e-mail)
function analisar(r: any) {
  const P = periodo(r);
  const meta = Number(r.meta) || 80, pct = r.pct == null ? null : Number(r.pct), ant = r.anterior || {};
  const nbr = (v: any, c = 1) => v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
  const setores = ((r.setores || []) as any[]).filter(s => s.planejadas >= 3).map(s => ({ ...s, p: Math.round(100 * s.concluidas / s.planejadas) }));
  const bons: string[] = [], atencao: string[] = [];
  if (pct != null && ant.pct != null && pct > ant.pct) bons.push(`A execução subiu ${pct - ant.pct} pontos em relação ${P.aoAnt} (${ant.pct}% para ${pct}%).`);
  const melhor = [...setores].sort((a, b) => b.p - a.p)[0];
  if (melhor && melhor.p > 0) bons.push(`Setor com melhor execução: ${melhor.setor}, com ${melhor.p}% ${P.sem ? 'das tarefas feitas' : 'das atividades concluídas'}.`);
  if ((r.destaques || []).length) bons.push(`Melhores notas ${P.doP}: ` + (r.destaques as any[]).map(d => `${d.nome} (${nbr(d.nota, 1)})`).join(', ') + '.');
  const indOk = ((r.indicadores || []) as any[]).filter(i => i.farol === 1);
  if (indOk.length) bons.push(`Indicadores dentro da meta: ${indOk.map(i => i.nome).slice(0, 4).join(', ')}.`);
  if (pct != null && ant.pct != null && pct < ant.pct) atencao.push(`A execução caiu ${ant.pct - pct} pontos em relação ${P.aoAnt} (${ant.pct}% para ${pct}%).`);
  const fracos = setores.filter(s => s.p < meta - 20).sort((a, b) => a.p - b.p).slice(0, 3);
  if (fracos.length) atencao.push('Setores com execução baixa: ' + fracos.map(s => `${s.setor} (${s.p}%)`).join(', ') + '.');
  const mot = ((r.nao_deu || []) as any[])[0];
  if (mot) atencao.push(`Principal motivo de tarefa não feita: ${mot.motivo} (${mot.vezes} ${mot.vezes == 1 ? 'vez' : 'vezes'}).`);
  const indRuim = ((r.indicadores || []) as any[]).filter(i => i.farol === 3);
  if (indRuim.length) atencao.push(`Indicadores fora da meta: ${indRuim.map(i => i.nome).slice(0, 4).join(', ')}.`);
  if (+r.imprevistos > 0) atencao.push(`${r.imprevistos} ${+r.imprevistos == 1 ? 'imprevisto registrado' : 'imprevistos registrados'} pela equipe (detalhes na página 2).`);
  if (!bons.length) bons.push(`Sem destaques calculados ${P.neste}.`);
  if (!atencao.length) atencao.push(`Nenhum ponto de atenção ${P.noP}.`);
  return { bons, atencao };
}

async function pdfMensal(r: any, logoPng?: Uint8Array): Promise<Uint8Array> {
  const P = periodo(r);
  const doc = await PDFDocument.create();
  doc.setTitle(`Relatório ${P.sem ? 'Semanal' : 'Mensal'} ${P.sub} - ${r.fazenda}`); doc.setAuthor("Farm Plan · Gesta'Up");
  const f = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
  let logo: any = null; if (logoPng) { try { logo = await doc.embedPng(logoPng); } catch { /* sem logo */ } }
  const BRANCO = rgb(1, 1, 1), FUNDO = rgb(.965, .973, .976), VERDE_C = rgb(.9, .96, .92), AMAR_C = rgb(1, .965, .9), VERM_C = rgb(.99, .93, .92), AZUL_C = rgb(.92, .95, .97);
  const X = 42, W = 511, PW = 595, PH = 842;
  let pg: any, y = 0, npg = 0;
  const larg = (s: string, size = 10, b = false) => (b ? fb : f).widthOfTextAtSize(limpo(s), size);
  const txt = (s: unknown, x: number, yy: number, o: any = {}) => {
    const t = limpo(s); const size = o.size || 10, fonte = o.b ? fb : f;
    const xx = o.dir ? x - fonte.widthOfTextAtSize(t, size) : o.meio ? x - fonte.widthOfTextAtSize(t, size) / 2 : x;
    pg.drawText(t, { x: xx, y: yy, size, font: fonte, color: o.c || TINTA });
  };
  // quebra o texto em linhas que cabem na largura
  const linhas = (s: string, w: number, size: number, b = false) => {
    const out: string[] = []; let l = '';
    for (const p of limpo(s).split(/\s+/)) { if (l && larg(l + ' ' + p, size, b) > w) { out.push(l); l = p; } else l = l ? l + ' ' + p : p; }
    if (l) out.push(l); return out;
  };
  const para = (s: string, x: number, w: number, o: any = {}) => { const sz = o.size || 10; for (const l of linhas(s, w, sz, o.b)) { txt(l, x, y, { ...o, size: sz }); y -= sz * 1.35; } };
  const nbr = (v: any, c = 1) => v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
  const pctTxt = (c: number, p: number) => p ? Math.round(100 * c / p) + '%' : '—';
  const meta = Number(r.meta) || 80, pct = r.pct == null ? null : Number(r.pct);
  const corPct = (v: number | null) => v == null ? CINZA : v >= meta ? VERDE : v >= meta - 20 ? AMAR : VERM;

  const rodape = () => {
    pg.drawRectangle({ x: X, y: 40, width: W, height: .8, color: LINHA });
    txt("Gerado automaticamente pelo Farm Plan · Gesta'Up · Gestão 360°", X, 27, { size: 7.5, c: CINZA });
    txt('Página ' + npg, X + W, 27, { size: 7.5, c: CINZA, dir: true });
  };
  const novaPagina = (titulo?: string) => {
    if (pg) rodape();
    pg = doc.addPage([PW, PH]); npg++;
    if (!titulo) return;
    pg.drawRectangle({ x: 0, y: PH - 52, width: PW, height: 52, color: NAVY });
    txt(titulo, X, PH - 32, { size: 14, b: true, c: BRANCO });
    txt(`${r.fazenda} · ${P.sub}`, X + W, PH - 32, { size: 9, c: rgb(.78, .86, .9), dir: true });
    y = PH - 84;
  };
  const secao = (t: string, sub?: string) => {
    txt(t, X, y, { size: 12.5, b: true, c: NAVY });
    if (sub) txt(sub, X + larg(t, 12.5, true) + 8, y + 1, { size: 8.5, c: CINZA });
    y -= 8; pg.drawRectangle({ x: X, y, width: 28, height: 2.2, color: VERDE }); y -= 16;
  };
  const precisa = (h: number, titulo: string) => { if (y - h < 60) novaPagina(titulo); };
  // seta de comparação (triângulo) + texto
  const delta = (atual: number | null, ant: number | null, x: number, yy: number, o: { menorMelhor?: boolean; casas?: number; un?: string } = {}) => {
    if (atual == null || ant == null) { txt('sem comparação', x, yy, { size: 7.5, c: CINZA }); return; }
    const d = Math.round((atual - ant) * 10 ** (o.casas ?? 0)) / 10 ** (o.casas ?? 0);
    if (d === 0) { txt('= igual ' + (P.sem ? 'à semana anterior' : 'ao mês anterior'), x, yy, { size: 7.5, c: CINZA }); return; }
    const bom = o.menorMelhor ? d < 0 : d > 0, cor = bom ? VERDE : VERM;
    pg.drawSvgPath(d > 0 ? 'M0 0 L4 -7 L8 0 Z' : 'M0 -7 L4 0 L8 -7 Z', { x, y: yy + 7, color: cor });
    txt(`${d > 0 ? '+' : ''}${nbr(d, o.casas ?? 0)}${o.un || ''} ${P.vsAnt}`, x + 11, yy, { size: 7.5, b: true, c: cor });
  };

  // ================= PÁGINA 1 · RESUMO =================
  pg = doc.addPage([PW, PH]); npg = 1;
  pg.drawRectangle({ x: 0, y: PH - 118, width: PW, height: 118, color: NAVY });
  pg.drawRectangle({ x: 0, y: PH - 122, width: PW, height: 4, color: VERDE });
  if (logo) { pg.drawRectangle({ x: X, y: PH - 98, width: 92, height: 76, color: BRANCO }); const h = 58, w = logo.width * h / logo.height; pg.drawImage(logo, { x: X + 46 - w / 2, y: PH - 89, width: w, height: h }); }
  const tx = logo ? X + 110 : X;
  txt(P.titulo, tx, PH - 44, { size: 9, b: true, c: rgb(.55, .85, .66) });
  txt(r.fazenda, tx, PH - 70, { size: 22, b: true, c: BRANCO });
  txt(`${P.sub}${r.municipio ? ' · ' + r.municipio + (r.uf ? '/' + r.uf : '') : ''}`, tx, PH - 90, { size: 11, c: rgb(.8, .87, .91) });
  y = PH - 150;

  // Veredito do mês
  const vered = pct == null ? [P.Nome + ' sem tarefas planejadas', 'Não houve tarefas vencidas no período para medir a meta.', CINZA, FUNDO]
    : pct >= meta ? [P.Nome + ' dentro da meta', `A equipe fez ${pct}% das tarefas planejadas, acima da meta de ${meta}%.`, VERDE, VERDE_C]
    : pct >= meta - 20 ? [P.Nome + ' perto da meta', `A equipe fez ${pct}% das tarefas planejadas. A meta é ${meta}%: faltaram ${meta - pct} pontos.`, AMAR, AMAR_C]
    : [P.Nome + ' abaixo da meta', `A equipe fez ${pct}% das tarefas planejadas. A meta é ${meta}%: faltaram ${meta - pct} pontos.`, VERM, VERM_C];
  pg.drawRectangle({ x: X, y: y - 64, width: W, height: 70, color: vered[3] });
  pg.drawRectangle({ x: X, y: y - 64, width: 5, height: 70, color: vered[2] });
  txt(vered[0], X + 18, y - 16, { size: 16, b: true, c: vered[2] });
  txt(vered[1], X + 18, y - 33, { size: 9.5 });
  // barra da meta
  const bx = X + 18, bw = W - 36, by = y - 54;
  pg.drawRectangle({ x: bx, y: by, width: bw, height: 9, color: BRANCO, borderColor: LINHA, borderWidth: .6 });
  if (pct != null) pg.drawRectangle({ x: bx, y: by, width: Math.max(2, bw * Math.min(pct, 100) / 100), height: 9, color: vered[2] as any });
  pg.drawRectangle({ x: bx + bw * meta / 100 - 1, y: by - 4, width: 2, height: 17, color: NAVY });
  txt('meta ' + meta + '%', bx + bw * meta / 100, by - 12, { size: 7, b: true, c: NAVY, meio: true });
  y -= 92;

  // Cartões com comparação
  const ant = r.anterior || {};
  const cards: [string, string, any, (x: number, yy: number) => void, string][] = [
    [P.sem ? 'Meta da Semana' : 'Meta do Mês', pct == null ? '—' : pct + '%', corPct(pct), (x, yy) => delta(pct, ant.pct, x, yy, { un: ' pts' }), `${r.feitas} de ${r.planejadas} tarefas-dia`],
    ['Nota da Equipe', r.nota_equipe == null ? '—' : nbr(r.nota_equipe, 1), NAVY, (x, yy) => delta(r.nota_equipe == null ? null : +r.nota_equipe, ant.nota_equipe == null ? null : +ant.nota_equipe, x, yy, { casas: 1 }), 'média da avaliação semanal'],
    ['Imprevistos', String(r.imprevistos ?? 0), AMAR, (x, yy) => delta(+r.imprevistos, ant.imprevistos == null ? null : +ant.imprevistos, x, yy, { menorMelhor: true }), `${r.fora_do_plano ?? 0} serviços fora do plano`],
    ['Uso do App', String(r.dias_com_baixa ?? 0), VERDE, (x, yy) => txt(`${r.relatorios_no_grupo ?? 0} relatórios no grupo`, x, yy, { size: 7.5, c: CINZA }), P.sem ? 'dias com baixa na semana' : 'dias com baixa no mês']];
  const cw = (W - 3 * 9) / 4;
  cards.forEach((c, i) => {
    const cx = X + i * (cw + 9);
    pg.drawRectangle({ x: cx, y: y - 78, width: cw, height: 84, color: BRANCO, borderColor: LINHA, borderWidth: 1 });
    pg.drawRectangle({ x: cx, y: y + 3, width: cw, height: 3, color: c[2] });
    txt(c[0].toUpperCase(), cx + 10, y - 12, { size: 7.5, b: true, c: CINZA });
    txt(c[1], cx + 10, y - 40, { size: 24, b: true, c: c[2] });
    const ls = linhas(c[4], cw - 20, 7.5); ls.slice(0, 2).forEach((l, k) => txt(l, cx + 10, y - 53 - k * 9, { size: 7.5, c: CINZA }));
    c[3](cx + 10, y - 72);
  });
  y -= 104;

  // Gráfico: % feito por semana (relatório do mês) ou por dia (relatório da semana)
  const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const colunas = P.sem ? ((r.dias || []) as any[]).map(d => ({ rot: DIAS[d.dia], c: d.feitas, p: d.planejadas }))
                        : ((r.semanas || []) as any[]).map(s => ({ rot: 'Sem. ' + s.semana, c: s.concluidas, p: s.planejadas }));
  secao(P.sem ? 'Execução por Dia' : 'Execução por Semana', P.sem ? '% das tarefas do dia feitas' : '% das atividades da semana concluídas');
  const gh = 108, gx = X + 26, gw = W - 26;
  pg.drawRectangle({ x: X, y: y - gh - 26, width: W, height: gh + 30, color: FUNDO });
  for (const v of [0, 50, 100]) { const yy = y - gh + gh * v / 100 - 8; pg.drawRectangle({ x: gx, y: yy, width: gw - 10, height: .5, color: LINHA }); txt(v + '%', gx - 4, yy - 3, { size: 7, c: CINZA, dir: true }); }
  if (colunas.length) {
    const slot = (gw - 10) / colunas.length, bwid = Math.min(46, slot * .55);
    colunas.forEach((s, i) => {
      const p = s.p ? Math.round(100 * s.c / s.p) : 0, h = gh * p / 100, cx = gx + slot * i + slot / 2;
      pg.drawRectangle({ x: cx - bwid / 2, y: y - gh - 8, width: bwid, height: Math.max(1, h), color: corPct(p) });
      txt(p + '%', cx, y - gh - 8 + h + 4, { size: 8.5, b: true, meio: true });
      txt(s.rot, cx, y - gh - 20, { size: 7.5, c: CINZA, meio: true });
    });
  } else txt(P.sem ? 'Sem tarefas planejadas na semana.' : 'Sem atividades planejadas nas semanas do mês.', X + W / 2, y - gh / 2, { size: 9, c: CINZA, meio: true });
  const my = y - gh - 8 + gh * meta / 100;
  for (let xx = gx; xx < gx + gw - 10; xx += 8) pg.drawRectangle({ x: xx, y: my, width: 4, height: 1.2, color: NAVY });
  txt('meta ' + meta + '%', gx + gw - 12, my + 3, { size: 7, b: true, c: NAVY, dir: true });
  y -= gh + 46;

  // Destaques e Pontos de Atenção (gerados a partir dos números)
  const { bons, atencao } = analisar(r);
  const caixa = (titulo: string, itens: string[], cor: any, fundo: any, x: number, w: number, topo: number) => {
    let yy = topo - 34; const ls = itens.map(t => linhas(t, w - 34, 8.8)); const h = 40 + ls.reduce((a, l) => a + l.length * 11.5 + 5, 0);
    pg.drawRectangle({ x, y: topo - h, width: w, height: h, color: fundo }); pg.drawRectangle({ x, y: topo - h, width: 4, height: h, color: cor });
    txt(titulo, x + 14, topo - 18, { size: 11, b: true, c: cor });
    ls.forEach(l => { pg.drawCircle({ x: x + 18, y: yy + 3, size: 2.2, color: cor }); l.forEach((t, k) => txt(t, x + 26, yy - k * 11.5, { size: 8.8 })); yy -= l.length * 11.5 + 5; });
    return h;
  };
  const hw = (W - 10) / 2;
  const h1 = caixa(P.sem ? 'Destaques da Semana' : 'Destaques do Mês', bons, VERDE, VERDE_C, X, hw, y), h2 = caixa('Pontos de Atenção', atencao, AMAR, AMAR_C, X + hw + 10, hw, y);
  y -= Math.max(h1, h2) + 14;

  // ================= PÁGINA 2 · DETALHES =================
  novaPagina(P.det);

  // Indicadores com farol
  const inds = (r.indicadores || []) as any[];
  if (inds.length) {
    secao(P.sem ? 'Indicadores' : 'Indicadores do Mês', 'farol: verde dentro da meta · amarelo atenção · vermelho fora');
    const cols = [W * .46, W * .2, W * .2, W * .14];
    pg.drawRectangle({ x: X, y: y - 6, width: W, height: 18, color: NAVY });
    ['Indicador', 'Resultado', 'Meta', 'Farol'].forEach((h, i) => txt(h, X + 8 + cols.slice(0, i).reduce((a, b) => a + b, 0), y, { size: 8.5, b: true, c: BRANCO }));
    y -= 20;
    inds.forEach((d, ri) => {
      precisa(20, P.det);
      if (ri % 2) pg.drawRectangle({ x: X, y: y - 6, width: W, height: 18, color: FUNDO });
      const cx = (i: number) => X + 8 + cols.slice(0, i).reduce((a, b) => a + b, 0);
      txt(d.nome, cx(0), y, { size: 8.8 }); txt(`${nbr(d.valor, d.casas)} ${d.unidade || ''}`, cx(1), y, { size: 8.8, b: true });
      txt(d.verde == null ? '—' : (d.direcao === 'up' ? 'a partir de ' : 'até ') + nbr(d.verde, d.casas), cx(2), y, { size: 8.3, c: CINZA });
      const cor = [CINZA, VERDE, AMAR, VERM][d.farol || 0], rot = ['Sem meta', 'Na meta', 'Atenção', 'Fora'][d.farol || 0];
      pg.drawCircle({ x: cx(3) + 4, y: y + 3, size: 4.5, color: cor }); txt(rot, cx(3) + 13, y, { size: 8.3, b: true, c: cor });
      y -= 18;
    });
    y -= 16;
  }

  // barras horizontais
  const barras = (titulo: string, sub: string, itens: { rot: string; v: number; txt: string; cor: any }[], max: number) => {
    precisa(40 + itens.length * 19, P.det);
    secao(titulo, sub);
    if (!itens.length) { txt(P.sem ? 'Sem dados na semana.' : 'Sem dados no mês.', X, y, { size: 9, c: CINZA }); y -= 22; return; }
    const lw = 150, bwid = W - lw - 70;
    itens.forEach(it => {
      txt(it.rot, X, y, { size: 8.8 });
      pg.drawRectangle({ x: X + lw, y: y - 2, width: bwid, height: 10, color: FUNDO });
      pg.drawRectangle({ x: X + lw, y: y - 2, width: Math.max(1.5, bwid * Math.min(it.v, max) / (max || 1)), height: 10, color: it.cor });
      txt(it.txt, X + lw + bwid + 8, y, { size: 8.5, b: true });
      y -= 19;
    });
    y -= 12;
  };
  barras('Execução por Setor', P.sem ? 'tarefas-dia feitas ÷ planejadas' : 'atividades concluídas ÷ planejadas',
    ((r.setores || []) as any[]).map(s => { const p = s.planejadas ? Math.round(100 * s.concluidas / s.planejadas) : 0; return { rot: s.setor, v: p, txt: `${p}% (${s.concluidas}/${s.planejadas})`, cor: corPct(p) }; }).sort((a, b) => b.v - a.v), 100);
  const nd = (r.nao_deu || []) as any[], ndMax = Math.max(1, ...nd.map(m => +m.vezes));
  barras('Por Que Não Deu', 'motivos informados pela equipe no app', nd.slice(0, 8).map(m => ({ rot: m.motivo, v: +m.vezes, txt: `${m.vezes} ${m.vezes == 1 ? 'vez' : 'vezes'}`, cor: AMAR })), ndMax);

  // Imprevistos
  const imp = (r.lista_imprevistos || []) as string[];
  if (imp.length) {
    precisa(40 + imp.length * 13, P.det);
    secao('Imprevistos Registrados', `${r.imprevistos} ${P.noP}`);
    imp.forEach(s => { pg.drawCircle({ x: X + 4, y: y + 3, size: 2.2, color: AMAR }); txt(s, X + 12, y, { size: 9 }); y -= 13; });
    y -= 12;
  }

  // Próximo mês
  const prox = (r.proximo_mes || []) as any[];
  const pm = MESES[r.mes % 12];
  precisa(60 + prox.length * 15, P.det);
  secao(P.sem ? 'O Que Vem na Próxima Semana' : `O Que Vem em ${pm}`, `${r.proximo_total ?? prox.length} atividades planejadas · as principais`);
  if (!prox.length) { txt(P.sem ? 'Nenhuma atividade planejada para a próxima semana ainda.' : 'Nenhuma atividade planejada para o próximo mês ainda.', X, y, { size: 9, c: CINZA }); y -= 18; }
  prox.forEach((a, ri) => {
    if (ri % 2) pg.drawRectangle({ x: X, y: y - 5, width: W, height: 15, color: FUNDO });
    txt(a.nome, X + 8, y, { size: 8.8 }); txt(a.setor || '', X + W * .58, y, { size: 8.3, c: CINZA });
    txt((P.sem ? '' : 'Sem. ') + a.semanas, X + W - 8, y, { size: 8.3, c: CINZA, dir: true }); y -= 15;
  });
  y -= 18;
  precisa(70, P.det);
  pg.drawRectangle({ x: X, y: y - 46, width: W, height: 52, color: AZUL_C });
  txt('Quer ver mais?', X + 14, y - 12, { size: 10, b: true, c: NAVY });
  txt('O plano completo, as fotos do campo e os relatórios de cada semana estão no Farm Plan:', X + 14, y - 26, { size: 8.8 });
  txt(SITE.replace(/^https?:\/\//, ''), X + 14, y - 39, { size: 8.8, b: true, c: VERDE });
  rodape();
  return await doc.save();
}

// ---------- Corpo do e-mail do Relatório Mensal ----------
function htmlMensal(r: any): string {
  const meta = Number(r.meta) || 80, pct = r.pct == null ? null : Number(r.pct), ant = r.anterior || {};
  const mes = MESES[r.mes - 1] + ' de ' + r.ano;
  const cor = pct == null ? '#6E787C' : pct >= meta ? '#1E9A47' : pct >= meta - 20 ? '#B87D10' : '#C9402E';
  const fundo = pct == null ? '#F4F6F7' : pct >= meta ? '#E6F5EB' : pct >= meta - 20 ? '#FFF6E5' : '#FDEDEB';
  const titulo = pct == null ? 'Mês sem tarefas planejadas' : pct >= meta ? 'Mês dentro da meta' : pct >= meta - 20 ? 'Mês perto da meta' : 'Mês abaixo da meta';
  const nbr = (v: any, c = 1) => v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
  const dif = (a: number | null, b: number | null, menor = false, casas = 0, un = '') => {
    if (a == null || b == null) return '<span style="color:#6E787C">sem comparação</span>';
    const d = Math.round((a - b) * 10 ** casas) / 10 ** casas; if (!d) return '<span style="color:#6E787C">= mês anterior</span>';
    const bom = menor ? d < 0 : d > 0;
    return `<span style="color:${bom ? '#1E9A47' : '#C9402E'};font-weight:bold">${d > 0 ? '▲ +' : '▼ '}${nbr(d, casas)}${un}</span> <span style="color:#6E787C">vs mês anterior</span>`;
  };
  const card = (rot: string, val: string, c: string, sub: string) => `<td width="25%" style="padding:4px"><div style="border:1px solid #E3E8E6;border-top:3px solid ${c};border-radius:8px;padding:10px 12px;background:#fff">
    <div style="font-size:10px;color:#6E787C;font-weight:bold;text-transform:uppercase">${rot}</div><div style="font-size:24px;font-weight:bold;color:${c};margin:2px 0">${val}</div><div style="font-size:11px">${sub}</div></div></td>`;
  const { bons, atencao } = analisar(r);
  const lista = (itens: string[], c: string) => itens.slice(0, 4).map(t => `<li style="margin:0 0 6px;color:#16232A">${esc(t)}</li>`).join('');
  const largura = Math.max(2, Math.min(100, pct ?? 0));
  return `<div style="background:#F4F6F7;padding:20px 0;font-family:Arial,Helvetica,sans-serif;color:#16232A">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #E3E8E6">
    <div style="background:#114665;padding:20px 24px;border-bottom:4px solid #1E9A47">
      <div style="color:#8CD9A8;font-size:11px;font-weight:bold;letter-spacing:1px">RELATÓRIO MENSAL DA FAZENDA</div>
      <div style="color:#fff;font-size:22px;font-weight:bold;margin-top:4px">${esc(r.fazenda)}</div>
      <div style="color:#CDDDE6;font-size:13px">${esc(mes)}</div></div>
    <div style="padding:20px 24px">
      <p style="margin:0 0 14px">Bom dia! Segue o resumo de ${esc(mes.toLowerCase())}. O relatório completo, com gráficos e indicadores, está no PDF em anexo.</p>
      <div style="background:${fundo};border-left:5px solid ${cor};border-radius:6px;padding:12px 16px;margin-bottom:14px">
        <div style="font-size:17px;font-weight:bold;color:${cor}">${titulo}</div>
        <div style="font-size:13px;margin:4px 0 8px">${pct == null ? 'Sem tarefas vencidas no período.' : `A equipe fez <b>${pct}%</b> das tarefas planejadas (${r.feitas} de ${r.planejadas}). Meta: ${meta}%.`}</div>
        <div style="background:#fff;border:1px solid #E3E8E6;height:10px;border-radius:5px;overflow:hidden"><div style="width:${largura}%;background:${cor};height:10px"></div></div></div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:14px"><tr>
        ${card('Meta do Mês', pct == null ? '—' : pct + '%', cor, dif(pct, ant.pct, false, 0, ' pts'))}
        ${card('Nota da Equipe', nbr(r.nota_equipe, 1), '#114665', dif(r.nota_equipe == null ? null : +r.nota_equipe, ant.nota_equipe == null ? null : +ant.nota_equipe, false, 1))}
        ${card('Imprevistos', String(r.imprevistos ?? 0), '#B87D10', dif(+r.imprevistos, ant.imprevistos == null ? null : +ant.imprevistos, true))}
        ${card('Uso do App', String(r.dias_com_baixa ?? 0), '#1E9A47', '<span style="color:#6E787C">dias com baixa</span>')}
      </tr></table>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>
        <td width="50%" valign="top" style="padding:4px"><div style="background:#E6F5EB;border-radius:8px;padding:12px 14px"><div style="font-weight:bold;color:#1E9A47;margin-bottom:6px">Destaques</div><ul style="margin:0;padding-left:18px;font-size:12px">${lista(bons, '#1E9A47')}</ul></div></td>
        <td width="50%" valign="top" style="padding:4px"><div style="background:#FFF6E5;border-radius:8px;padding:12px 14px"><div style="font-weight:bold;color:#B87D10;margin-bottom:6px">Pontos de Atenção</div><ul style="margin:0;padding-left:18px;font-size:12px">${lista(atencao, '#B87D10')}</ul></div></td>
      </tr></table>
      <div style="text-align:center;margin:20px 0 6px"><a href="${SITE}" style="background:#1E9A47;color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px;display:inline-block">Abrir o Farm Plan</a></div>
    </div>
    <div style="background:#F4F6F7;padding:12px 24px;font-size:11px;color:#6E787C">Farm Plan · Gesta'Up · Gestão 360° · Relatório gerado automaticamente no dia 1º de cada mês.</div>
  </div></div>`;
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    let chave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!chave) { try { chave = String(Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}'))[0] || ''); } catch { chave = ''; } }
    const pub = Deno.env.get('VAPID_PUBLICA'), priv = Deno.env.get('VAPID_PRIVADA');
    if (!chave) return responder({ erro: 'Chave Secreta Não Encontrada na Função.' }, 500);
    if (pub && priv) webpush.setVapidDetails(SITE, pub, priv);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, chave, { auth: { persistSession: false } });
    const corpo = await req.json().catch(() => ({}));
    const quem = async () => { const token = (req.headers.get('Authorization') || '').replace('Bearer ', ''); const { data: { user } } = await admin.auth.getUser(token); return user; };
    const doCron = () => !!Deno.env.get('AVISO_CHAVE') && req.headers.get('x-aviso-chave') === Deno.env.get('AVISO_CHAVE');

    // Manda a notificação para todos os celulares de cada pessoa
    async function notificar(avisos: { user_id: string; titulo: string; texto: string }[], tag: string, ttl: number) {
      if (!pub || !priv) return { enviados: 0, erro: 'Faltam VAPID_PUBLICA e VAPID_PRIVADA' };
      const ids = [...new Set(avisos.map(a => a.user_id))];
      if (!ids.length) return { enviados: 0 };
      const { data: subs } = await admin.from('avisos_inscricoes').select('endpoint, user_id, p256dh, auth').in('user_id', ids);
      let enviados = 0, removidos = 0, falhas = 0;
      for (const s of subs || []) {
        const a = avisos.find(x => x.user_id === s.user_id)!;
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({ titulo: a.titulo, texto: a.texto, url: tag === 'consultor' ? './consultor.html' : './index.html', tag }), { TTL: ttl });
          enviados++;
        } catch (e) {
          const st = (e as { statusCode?: number }).statusCode;
          if (st === 404 || st === 410) { await admin.from('avisos_inscricoes').delete().eq('endpoint', s.endpoint); removidos++; } else falhas++;
        }
      }
      return { pessoas: ids.length, enviados, removidos, falhas };
    }

    // Relatório mensal de uma fazenda (mês anterior) por e-mail
    let logo: Uint8Array | undefined;
    async function relatorioMensal(fz: { id: string; nome: string; email_relatorio: string | null }, para: string[]) {
      const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Cuiaba' }));
      const ref = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      const { data: r, error } = await admin.rpc('resumo_mensal', { p_fz: fz.id, p_ano: ref.getFullYear(), p_mes: ref.getMonth() + 1 });
      if (error) return { ok: false, motivo: error.message };
      if (!logo) { try { logo = new Uint8Array(await (await fetch(SITE + '/logo.png')).arrayBuffer()); } catch { /* sem logo */ } }
      const pdf = await pdfMensal(r, logo);
      const mes = MESES[r.mes - 1] + ' de ' + r.ano;
      const html = htmlMensal(r);
      return await email(para, `Relatório Mensal ${mes} · ${r.fazenda}`, html, [{ filename: `Relatorio ${MESES[r.mes - 1]} ${r.ano} - ${r.fazenda}.pdf`, content: b64(pdf) }]);
    }
    // Relatório da semana passada (segunda a domingo) no WhatsApp
    async function relatorioSemanal(fz: { id: string; nome: string }, numeros: string[]) {
      const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Cuiaba' }));
      const { ano, semana } = semanaIso(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 7));
      const { data: r, error } = await admin.rpc('resumo_semanal', { p_fz: fz.id, p_ano: ano, p_semana: semana });
      if (error) return { ok: false, enviados: 0, motivo: /function|schema/i.test(error.message) ? 'Falta rodar o SQL 028 no Supabase.' : error.message };
      if (!logo) { try { logo = new Uint8Array(await (await fetch(SITE + '/logo.png')).arrayBuffer()); } catch { /* sem logo */ } }
      const pdf = await pdfMensal(r, logo);
      const { bons, atencao } = analisar(r);
      const arquivo = `Relatorio Semana ${r.semana} - ${r.fazenda}.pdf`;
      return await whatsapp(numeros, pdf, arquivo, [
        `${r.semana} (${r.inicio} a ${r.fim})`, r.fazenda,
        r.pct == null ? 'sem tarefas no período' : `${r.pct}% (${r.feitas} de ${r.planejadas})`, (r.meta ?? 80) + '%',
        bons[0] || 'sem destaques nesta semana', atencao[0] || 'nenhum ponto de atenção']);
    }

    // ---------- TESTES DO USUÁRIO LOGADO ----------
    if (corpo.teste) {
      const user = await quem(); if (!user) return responder({ erro: 'Faça Login de Novo.' }, 401);
      return responder({ ok: true, ...(await notificar([{ user_id: user.id, titulo: '🔔 Avisos Ligados!', texto: 'Pronto! O Farm Plan vai avisar as tarefas do dia e lembrar do relatório.' }], 'teste', 600)) });
    }
    if (corpo.mensal_teste) {
      const user = await quem(); if (!user) return responder({ erro: 'Faça Login de Novo.' }, 401);
      const { data: ac } = await admin.from('acessos').select('papel').eq('user_id', user.id).eq('fazenda_id', corpo.mensal_teste).maybeSingle();
      if (!ac || !['consultor', 'gestor'].includes(ac.papel)) return responder({ erro: 'Só Gestor ou Consultor.' }, 403);
      const { data: fz } = await admin.from('fazendas').select('id, nome, email_relatorio').eq('id', corpo.mensal_teste).single();
      if (!fz) return responder({ erro: 'Fazenda Não Encontrada.' }, 404);
      const para = listaEmails(fz.email_relatorio); if (!para.length) return responder({ erro: 'Cadastre Pelo Menos um E-mail.' }, 400);
      const r = await relatorioMensal(fz, para);
      return r.ok ? responder({ ok: true, para }) : responder({ erro: 'E-mail Não Enviado: ' + r.motivo }, 400);
    }

    if (corpo.semanal_teste) {
      const user = await quem(); if (!user) return responder({ erro: 'Faça Login de Novo.' }, 401);
      const { data: ac } = await admin.from('acessos').select('papel').eq('user_id', user.id).eq('fazenda_id', corpo.semanal_teste).maybeSingle();
      if (!ac || !['consultor', 'gestor'].includes(ac.papel)) return responder({ erro: 'Só Gestor ou Consultor.' }, 403);
      const { data: fz } = await admin.from('fazendas').select('id, nome, whatsapp_relatorio').eq('id', corpo.semanal_teste).single();
      if (!fz) return responder({ erro: 'Fazenda Não Encontrada.' }, 404);
      const para = listaWhats(fz.whatsapp_relatorio); if (!para.length) return responder({ erro: 'Cadastre Pelo Menos um WhatsApp com DDD.' }, 400);
      const r = await relatorioSemanal(fz, para);
      return r.ok ? responder({ ok: true, para, ...(r.falhas?.length ? { aviso: r.motivo } : {}) }) : responder({ erro: 'WhatsApp Não Enviado: ' + r.motivo }, 400);
    }

    // ---------- AGENDADOS (cron) ----------
    if (!doCron()) return responder({ erro: 'Sem Permissão.' }, 401);
    const tipo = String(corpo.tipo || 'manha');
    if (tipo === 'manha' || tipo === 'tarde') {
      const { data, error } = await admin.rpc('avisos_do_dia', { p_tipo: tipo });
      if (error) return responder({ erro: error.message }, 500);
      return responder({ ok: true, tipo, ...(await notificar(data || [], tipo, tipo === 'manha' ? 6 * 3600 : 3 * 3600)) });
    }
    if (tipo === 'consultor') {
      const { data, error } = await admin.rpc('alertas_consultor');
      if (error) return responder({ erro: error.message }, 500);
      const res = await notificar(data || [], 'consultor', 8 * 3600);
      let emails = 0;
      for (const a of data || []) {
        const linhas = (a.detalhe || []).map((d: any) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee"><b>${esc(d.fazenda)}</b></td><td style="padding:6px 10px;border-bottom:1px solid #eee">${d.dias_sem_baixa == null ? 'Nunca usou o app' : d.dias_sem_baixa + ' dias sem baixa'}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${d.pct == null ? '—' : d.pct + '% (meta ' + d.meta + '%)'}</td></tr>`).join('');
        const r = await email([a.email], a.titulo, `<div style="font-family:Arial,sans-serif;color:#16232A"><h3 style="color:#114665">${esc(a.titulo)}</h3><table style="border-collapse:collapse">${linhas}</table><p><a href="${SITE}/consultor.html">Abrir o Painel do Consultor</a></p></div>`);
        if (r.ok) emails++;
      }
      return responder({ ok: true, tipo, ...res, emails });
    }
    if (tipo === 'semanal') {
      const { data: fzs } = await admin.from('fazendas').select('id, nome, whatsapp_relatorio').not('whatsapp_relatorio', 'is', null);
      const res: unknown[] = [];
      for (const fz of fzs || []) { const para = listaWhats(fz.whatsapp_relatorio); if (para.length) res.push({ fazenda: fz.nome, ...(await relatorioSemanal(fz, para)) }); }
      return responder({ ok: true, tipo, fazendas: res });
    }
    if (tipo === 'mensal') {
      const { data: fzs } = await admin.from('fazendas').select('id, nome, email_relatorio').not('email_relatorio', 'is', null);
      const res: unknown[] = [];
      for (const fz of fzs || []) { const para = listaEmails(fz.email_relatorio); if (para.length) res.push({ fazenda: fz.nome, ...(await relatorioMensal(fz, para)) }); }
      return responder({ ok: true, tipo, fazendas: res });
    }
    return responder({ erro: 'Tipo Desconhecido.' }, 400);
  } catch (e) {
    return responder({ erro: String(e) }, 500);
  }
});
