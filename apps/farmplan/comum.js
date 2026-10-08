// =====================================================================
// FARM PLAN · Gesta'Up · comum.js
// Peças usadas por todas as telas: conexão com o banco, regra de texto,
// semanas do ano e nomes de status/papéis.
// =====================================================================
import { createClient } from './vendor/supabase.mjs';   // cópia local: o app abre mesmo sem internet

// Guarda o aplicativo no celular para abrir sem sinal (sw.js)
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});

// Ao passar o mouse (ou tocar) num link do menu, já busca a próxima tela antes do clique: a troca fica mais rápida
try { if (typeof document !== 'undefined' && HTMLScriptElement.supports?.('speculationrules')) { const sr = document.createElement('script'); sr.type = 'speculationrules';
  sr.textContent = JSON.stringify({ prefetch: [{ where: { and: [{ href_matches: '/*.html' }, { not: { href_matches: '/*\\?*' } }] }, eagerness: 'moderate' }] }); document.head.append(sr); } } catch {}

export const supabase = createClient(
  'https://tcjrztbivvosrxjnjqom.supabase.co',
  'sb_publishable_iiouvEMpAZDHmE3zojz0Eg_4_okU8aC'
);

// Ano do plano: o escolhido no menu (Ano ▾) ou o ano da semana de hoje
const segundaDaSemana1 = (ano) => { const j4 = new Date(ano, 0, 4); return new Date(ano, 0, 4 - (j4.getDay() + 6) % 7); };   // semana 1 = a que tem 4 de janeiro
const anoDaSemana = (dt) => { const d = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()); d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7); return d.getFullYear(); };
export const ANO_HOJE = anoDaSemana(new Date());
// Só as telas de planejar e de resultados trocam de ano; as do dia a dia (Painel, Tarefas, Reunião...) ficam sempre no ano de hoje
const PAGINA = (typeof location !== 'undefined' ? location.pathname.split('/').pop() : '') || 'index.html';
export const TELA_COM_ANO = ['plano.html', 'mes.html', 'avaliacao.html', 'contrato.html', 'equipe.html', 'imprevistos.html', 'indicadores.html', 'relatorio.html','relatorios.html','galeria.html'].includes(PAGINA);
let _ano = ANO_HOJE; try { const a = +localStorage.getItem('fp-ano'); if (TELA_COM_ANO && a >= 2024 && a <= 2100) _ano = a; } catch {}
export const ANO = _ano;
export const SEMANAS_NO_ANO = Math.round((segundaDaSemana1(ANO + 1) - segundaDaSemana1(ANO)) / 604800000);   // 52 ou 53
export function trocarAno(a) { try { +a === ANO_HOJE ? localStorage.removeItem('fp-ano') : localStorage.setItem('fp-ano', a); } catch {} location.reload(); }
export const STATUS = { 1:'Planejado', 2:'Concluído', 3:'Em Andamento', 4:'Atrasado', 5:'Pausado' };
export const PAPEL = { consultor:'Consultor', gestor:'Gestor', administrativo:'Administrativo', lider:'Líder', colaborador:'Colaborador' };
export const DIAS_CURTO = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
export const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
export const TIPOS = ['1 - Rotina','2 - Estratégica','3 - Gestão','4 - Estruturação','5 - Projeto'];

// Regra de texto do Farm Plan: Primeira Letra Maiúscula (menos preposições e siglas)
const MINUSCULAS = ['a','o','as','os','e','de','da','do','das','dos','em','na','no','nas','nos','para','por','pela','pelo','com','sem','ao','à','às'];
export function tc(texto) {
  if (!texto) return '';
  return String(texto).split(' ').map((p, i) => {
    if (p.length > 1 && p === p.toUpperCase() && /[A-ZÀ-Ú]/.test(p)) return p;
    const min = p.toLowerCase();
    if (i > 0 && MINUSCULAS.includes(min)) return min;
    return min.replace(/[a-zà-ú]/, c => c.toUpperCase()).replace(/\/([a-zà-ú])/g, (_, c) => '/' + c.toUpperCase());   // também depois de /   // 1ª letra, mesmo depois de ( ou "
  }).join(' ');
}

// Semanas do ano escolhido (em 2026, a semana 1 começa na segunda-feira 29/12/2025)
const INICIO = segundaDaSemana1(ANO);
export const semanaDe = (data) => Math.floor((data - INICIO) / 604800000) + 1;
export const inicioDaSemana = (w) => new Date(INICIO.getTime() + (w - 1) * 604800000);

// Evita que um nome com < > quebre a tela
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));

// Quem está logado, em qual fazenda e com qual papel
export async function quemSouEu() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const user = session.user;
  const { data: acessos } = await supabase.from('acessos').select('papel, fazendas(id, nome, uf)').eq('user_id', user.id);
  if (!acessos || !acessos.length) return { user, fazenda: null };
  // Várias fazendas (consultor): usa a última escolhida no menu
  _minhas = acessos.filter(a => a.fazendas).sort((a, b) => a.fazendas.nome.localeCompare(b.fazendas.nome, 'pt'));
  let escolhida = null; try { escolhida = localStorage.getItem('fp-fazenda'); } catch {}
  const a = _minhas.find(x => x.fazendas.id === escolhida) || _minhas[0];
  _papel = a.papel;
  return { user, fazenda: a.fazendas, papel: a.papel, fazendas: _minhas.map(x => ({ ...x.fazendas, papel: x.papel })) };
}
let _minhas = [], _papel = '';
export function trocarFazenda(id) { try { localStorage.setItem('fp-fazenda', id); } catch {} location.reload(); }

// Busca TODAS as linhas de uma consulta (o banco entrega de 1000 em 1000)
// ---------- ATUALIZAÇÃO AUTOMÁTICA ----------
// O que a equipe registra no aplicativo aparece sozinho no site: escuta o banco (Realtime, SQL 029)
// e, por garantia, confere de novo a cada minuto. Não atualiza com uma janela aberta ou com alguém digitando.
// Guarda e devolve a rolagem da página e das tabelas, para a tela não "pular" ao atualizar
function posicoes() {
  const lista = []; const vistos = {};
  document.querySelectorAll('body *').forEach(el => {
    if (!(el.scrollTop || el.scrollLeft) && !el.id && !el.className) return;
    const k = el.id ? '#' + el.id : (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : el.tagName);
    const i = vistos[k] = (vistos[k] ?? -1) + 1;
    if (el.scrollTop || el.scrollLeft) lista.push([k, i, el.scrollTop, el.scrollLeft]);
  });
  return { x: scrollX, y: scrollY, lista };
}
function voltarPosicoes(p) {
  p.lista.forEach(([k, i, t, l]) => { try { const el = document.querySelectorAll(k.startsWith('#') || k.startsWith('.') ? k : k.toLowerCase())[i]; if (el) { el.scrollTop = t; el.scrollLeft = l; } } catch { /* seletor inválido */ } });
  scrollTo(p.x, p.y);
}
export function aoMudar(fz, tabelas, atualizar, segundos = 60) {
  let espera = null, rodando = false;
  const ocupado = () => { const a = document.activeElement; return !!document.querySelector('.scrim, .mx, .drawer, dialog[open]') || !!(a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)); };
  const rodar = (atraso = 1500) => { clearTimeout(espera); espera = setTimeout(async () => {
    if (document.visibilityState !== 'visible' || !navigator.onLine) return;
    if (ocupado()) return rodar(10000);
    if (rodando) return; rodando = true;
    const pos = posicoes();
    try { await atualizar(); } catch { /* tenta de novo na próxima */ } finally { rodando = false; }
    requestAnimationFrame(() => voltarPosicoes(pos));
  }, atraso); };
  try {
    if (typeof supabase.channel === 'function') {
      const canal = supabase.channel('fp-' + fz + '-' + Math.random().toString(36).slice(2, 8));
      tabelas.forEach(tb => canal.on('postgres_changes', { event: '*', schema: 'public', table: tb, filter: 'fazenda_id=eq.' + fz }, () => rodar()));
      canal.subscribe();
    }
  } catch { /* sem Realtime: fica só a conferência a cada minuto */ }
  setInterval(() => rodar(0), segundos * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') rodar(300); });
}

export async function buscarTudo(montarConsulta) {
  let todas = [], de = 0;
  while (true) {
    const { data, error } = await montarConsulta().range(de, de + 999);
    if (error) throw error;
    todas = todas.concat(data);
    if (data.length < 1000) return todas;
    de += 1000;
  }
}

// Datas por extenso
export const MESES_LONGO = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// Frequência da avaliação de desempenho (o produtor escolhe em Cadastros › Geral ou na própria tela)
export const PERIODOS_AVAL = { semanal: 'Semanal', mensal: 'Mensal', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual' };
export const DIAS_LONGO = ['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];
export const diaDaSemana = (w, d) => new Date(inicioDaSemana(w).getTime() + d * 864e5);   // d: 0 = segunda
export const ddmm = (dt) => String(dt.getDate()).padStart(2, '0') + '/' + String(dt.getMonth() + 1).padStart(2, '0');
export function periodoDaSemana(w) {
  const a = inicioDaSemana(w), b = new Date(a.getTime() + 6 * 864e5);
  return a.getMonth() === b.getMonth() ? `${a.getDate()} a ${b.getDate()} de ${MESES_LONGO[b.getMonth()]}`
    : `${a.getDate()} de ${MESES_LONGO[a.getMonth()]} a ${b.getDate()} de ${MESES_LONGO[b.getMonth()]}`;
}

// Menu azul da esquerda (igual em todas as telas do gestor)
const IC = {
  week:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="7" cy="18" r="1.6"/>',
  cal:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  month:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h6"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .7 3.2 2.5 3.6 5.2"/>',
  gauge:'<path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4-6"/>',
  chart:'<path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
  upload:'<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
  alert:'<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
  chat:'<path d="M4 5h16v11H9l-5 4z"/>',
  home:'<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  doc:'<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  phone:'<rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M11 18.5h2"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  camera:'<path d="M3 8h4l2-3h6l2 3h4v11H3z"/><circle cx="12" cy="13" r="3.5"/>',
  star:'<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'
};
export const ic = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${IC[n]}</svg>`;
// Menu na ordem do raciocínio: planejar do maior para o menor (ano → mês → semana),
// executar o dia, medir os resultados (mês → semana) e, por último, configurar.
const MENU = [['#','Planejar'],['plano.html','Plano Anual','cal'],['mes.html','Plano do Mês','month'],['index.html','Tarefas da Semana','week'],
              ['#','Dia a Dia'],['reuniao.html','Reunião de 10 Min','chat'],['painel.html','Painel do Dia','home'],['aplicativo.html','Aplicativo','phone'],['galeria.html','Fotos e Vídeos','camera'],
              ['#','Resultados'],['indicadores.html','Indicadores do Mês','gauge'],['relatorios.html','Relatórios','chart'],['equipe.html','Equipe do Mês','users'],['avaliacao.html','Avaliação de Desempenho','star'],['execucao.html','Tempo e Meta','clock'],['imprevistos.html','Imprevistos','alert'],
              ['#','Configurar'],['contrato.html','Contrato de Resultados','doc'],['cadastros.html','Cadastros','gear']];
export function montarMenu(ativa) {
  const m = document.getElementById('menu');
  const itens = _papel === 'consultor' ? [...MENU, ['#', 'Consultor'], ['consultor.html', 'Painel do Consultor', 'chart'], ['nova-fazenda.html', 'Nova Fazenda', 'plus'], ['importar.html', 'Importar Planilha', 'upload']] : MENU;
  if (m) m.innerHTML = itens.map(([href, nome, i]) => href === '#' ? `<div class="navg">${nome}</div>`
    : href ? `<a href="${href}" class="${href === ativa ? 'on' : ''}">${ic(i)}${nome}</a>`
    : `<a class="breve">${ic(i)}${nome}<em>Em Breve</em></a>`).join('');
  const s = document.getElementById('mnav');
  if (s) s.onchange = (e) => location.href = e.target.value;
  // Troca de fazenda (quem tem acesso a mais de uma)
  const farm = document.querySelector('.side .farm');
  if (farm && _minhas.length > 1 && !document.getElementById('fazSel')) {
    const sel = document.createElement('select'); sel.id = 'fazSel'; sel.className = 'farmsel'; sel.title = 'Trocar de Fazenda';
    let atual = null; try { atual = localStorage.getItem('fp-fazenda'); } catch {}
    const idAtual = (_minhas.find(x => x.fazendas.id === atual) || _minhas[0]).fazendas.id;
    sel.innerHTML = _minhas.map(x => `<option value="${x.fazendas.id}" ${x.fazendas.id === idAtual ? 'selected' : ''}>${tc(x.fazendas.nome).replace(/^Fazenda /, '')}</option>`).join('');
    sel.onchange = (e) => trocarFazenda(e.target.value);
    farm.insertBefore(sel, document.getElementById('anoSel'));
  }
  // Ano do plano (ano passado, este e o próximo)
  const side = document.querySelector('.side .farm');
  if (side && TELA_COM_ANO && !document.getElementById('anoSel')) {
    const s2 = document.createElement('select'); s2.id = 'anoSel'; s2.className = 'farmsel'; s2.title = 'Ano do Plano';
    s2.innerHTML = [ANO_HOJE - 1, ANO_HOJE, ANO_HOJE + 1].map(a => `<option value="${a}" ${a === ANO ? 'selected' : ''}>Plano ${a}${a === ANO_HOJE ? ' (Atual)' : ''}</option>`).join('');
    s2.onchange = (e) => trocarAno(+e.target.value);
    side.appendChild(s2);
  }
  const main = document.querySelector('.main');
  if (main && ANO !== ANO_HOJE && !document.getElementById('faixaAno')) {
    const f = document.createElement('div'); f.id = 'faixaAno'; f.className = 'faixa-ano';
    f.innerHTML = `📅 Você Está Vendo o <b>Plano de ${ANO}</b>${ANO > ANO_HOJE ? ' (Planejamento do Próximo Ano)' : ' (Ano Passado)'}. <button type="button">Voltar para ${ANO_HOJE}</button>`;
    f.querySelector('button').onclick = () => trocarAno(ANO_HOJE);
    main.prepend(f);
  }
}

// Entrar: quem digita só o usuário (sem @) é da equipe de campo
export const emailDoLogin = (texto) => { const t = String(texto).trim().toLowerCase(); return t.includes('@') ? t : t + '@campo.gestaup.com'; };

// Notas: número com vírgula e cor do escore (verde ≥ 9,3 · amarelo ≥ 8,5 · vermelho abaixo)
export const nf = (v, d = 2) => v == null || isNaN(v) ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
export const corEscore = (v) => v == null ? '' : v >= 9.3 ? 'sc-g' : v >= 8.5 ? 'sc-a' : 'sc-b';
export const media = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

// Catálogo de indicadores da Gesta'Up (os marcados com p: 1 entram sozinhos em toda fazenda nova)
// [nome, unidade, grupo, direção (up = maior é melhor), verde, vermelho, casas, como calcular, automático, padrão]
export const INDICADORES_CATALOGO = [
  ['Taxa de Lotação da Fazenda', 'UA/ha', 'Pastagem', 'up', 1.01, 1, 2, 'UA Médias do Mês ÷ Área de Pastagem (ha)', null, 1],
  ['Escore de Desempenho da Equipe', 'Nota 0 a 10', 'Equipe', 'up', 9.3, 8.5, 2, 'Calculado pelo Sistema: Média das Notas da Avaliação de Desempenho no Mês', 'escore', 1],
  ['Atividades Concluídas', '% no Mês', 'Equipe', 'up', 80, 60, 0, 'Calculado pelo Sistema: Semanas Concluídas ÷ Semanas Planejadas no Mês', 'atividades', 1],
  ['Custo Operacional', 'R$/Cab/Dia', 'Financeiro', 'down', 2.19, 2.2, 2, 'Custo Operacional do Mês ÷ Cabeças Médias ÷ Dias do Mês', null, 1],
  ['GMD Peso Vivo · Recria', 'kg/Cab/Dia', 'Rebanho', 'up', 0.401, 0.4, 3, 'Ganho de Peso dos Lotes de Recria ÷ Cabeças ÷ Dias', null, 1],
  ['GMD Peso Vivo · Cria', 'kg/Cab/Dia', 'Rebanho', 'up', 0.201, 0.2, 3, 'Ganho de Peso dos Bezerros ÷ Cabeças ÷ Dias', null, 1],
  ['Eficiência Biológica na Engorda', 'kg MS/@', 'Confinamento', 'down', 159, 160, 0, 'kg de Matéria Seca Consumida ÷ @ Produzidas', null, 1],
  ['Espera para Processamento do Gado', 'Dias', 'Manejo', 'down', 6, 7, 0, 'Dias Entre a Chegada do Gado e o Processamento', null, 1],
  ['Tempo de Processamento', 'Min/Cab', 'Manejo', 'down', 9, 10, 0, 'Minutos do Manejo ÷ Cabeças Processadas', null, 1],
  ['Manutenção de Máquinas', '% sobre o Valor', 'Máquinas', 'down', 0.49, 0.5, 2, 'Gasto com Manutenção no Mês ÷ Valor das Máquinas × 100', null, 1],
  ['Faltas de Colaboradores', 'no Mês', 'Equipe', 'down', 5, 10, 0, 'Número de Faltas no Mês', null, 1],
  ['Mortalidade', 'Cab/Mês', 'Rebanho', 'down', 5, 7, 0, 'Cabeças Mortas no Mês', null, 1],
  ['GMD Peso Vivo · Engorda', 'kg/Cab/Dia', 'Rebanho', 'up', 0.8, 0.7, 3, 'Ganho de Peso dos Lotes de Engorda ÷ Cabeças ÷ Dias', null, 0],
  ['Taxa de Mortalidade', '% no Ano', 'Rebanho', 'down', 1.5, 2.5, 1, 'Cabeças Mortas no Ano ÷ Rebanho Médio × 100', null, 0],
  ['Taxa de Desfrute', '% ao Ano', 'Rebanho', 'up', 30, 20, 0, 'Cabeças Vendidas ÷ Rebanho Médio × 100', null, 0],
  ['Produção de Arrobas por Hectare', '@/ha/Ano', 'Rebanho', 'up', 12, 8, 1, '@ Produzidas no Ano ÷ Área de Pastagem (ha)', null, 0],
  ['Taxa de Prenhez', '%', 'Reprodução', 'up', 85, 75, 0, 'Vacas Prenhes ÷ Vacas Expostas à Reprodução × 100', null, 0],
  ['Taxa de Desmama', '%', 'Reprodução', 'up', 80, 70, 0, 'Bezerros Desmamados ÷ Vacas Expostas × 100', null, 0],
  ['Peso à Desmama', 'kg', 'Reprodução', 'up', 210, 190, 0, 'Peso Médio dos Bezerros na Desmama', null, 0],
  ['Leitura de Cocho Correta', '% dos Tratos', 'Confinamento', 'up', 95, 90, 0, 'Tratos com Leitura Feita ÷ Tratos do Mês × 100', null, 0],
  ['Sobra de Cocho', '%', 'Confinamento', 'down', 3, 5, 1, 'kg de Sobra ÷ kg Fornecidos × 100', null, 0],
  ['Custo da Arroba Produzida', 'R$/@', 'Financeiro', 'down', 250, 300, 2, 'Custo Total do Período ÷ @ Produzidas', null, 0],
  ['Preço Médio de Venda', 'R$/@', 'Financeiro', 'up', 320, 300, 2, 'Receita das Vendas ÷ @ Vendidas', null, 0],
  ['Margem Operacional', '%', 'Financeiro', 'up', 20, 10, 1, '(Receita − Custo Operacional) ÷ Receita × 100', null, 0],
  ['Consumo de Diesel', 'L/Hora', 'Máquinas', 'down', 12, 15, 1, 'Litros Consumidos ÷ Horas Trabalhadas', null, 0],
  ['Máquinas Paradas', 'Dias no Mês', 'Máquinas', 'down', 2, 5, 0, 'Dias com Máquina Parada por Quebra', null, 0],
  ['Acidentes de Trabalho', 'no Mês', 'Equipe', 'down', 0, 1, 0, 'Número de Acidentes no Mês', null, 0],
  ['Desligamentos', 'no Mês', 'Equipe', 'down', 0, 2, 0, 'Colaboradores Que Saíram no Mês', null, 0],
  ['Área de Pasto Reformada', 'ha no Mês', 'Pastagem', 'up', 50, 20, 0, 'Hectares Reformados ou Recuperados no Mês', null, 0]
].map(([nome, unidade, grupo, direcao, verde, vermelho, casas, descricao, auto, padrao]) => ({ nome, unidade, grupo, direcao, verde, vermelho, casas, descricao, auto, padrao: !!padrao }));

// Gráfico de barras por período com as situações empilhadas (Concluída, Em Andamento, Atrasada, Pausada, Planejada).
// itens: [{ rot, t, c: {1,2,3,4,5}, on, attr, tip }] · attr = atributo do botão (ex.: 'data-gm="3"')
export function graficoStatus(itens, { titulo, sub, dica = 'Passe o Mouse para Ver os Números' } = {}) {
  const mx = Math.max(1, ...itens.map(x => x.t));
  const COR = [[1, 'Planejada'], [5, 'Pausada'], [4, 'Atrasada'], [3, 'Em Andamento'], [2, 'Concluída']];
  return `<div class="card gs"><div class="gs-h"><h3>${titulo}</h3><small>${sub || ''}</small><span class="legend">${[...COR].reverse().map(([k, l]) => `<span><i style="background:var(--s${k})"></i>${l}</span>`).join('')}</span><small class="gs-d">${dica}</small></div>
    <div class="months" style="grid-template-columns:repeat(${itens.length},minmax(0,1fr))${itens.length < 12 ? `;max-width:calc(${itens.length} * (100% / 12) + 28px)` : ''}">${itens.map(x => {
      const c = x.c || {}, tip = x.tip || `${x.rot}: ${x.t} no Total · ${c[2] || 0} Concluídas · ${c[3] || 0} Em Andamento · ${c[4] || 0} Atrasadas${c[5] ? ' · ' + c[5] + ' Pausadas' : ''} · ${c[1] || 0} Planejadas`;
      return `<button ${x.attr || ''} class="${x.on ? 'on' : ''}" title="${tip}"><span class="mb">${COR.filter(([k]) => c[k]).map(([k]) => `<i style="height:${c[k] / mx * 100}%;background:var(--s${k})"></i>`).join('')}</span><span class="gs-r"><b>${x.rot}</b> ${x.t}</span></button>`; }).join('')}</div></div>`;
}

// Congela o topo da tela (números e gráfico): só a tabela rola, ocupando o resto da altura da tela (no computador)
export function congelar(el, min = 260) {
  if (!el) return;
  const f = () => {
    if (!el.isConnected) return;
    if (innerWidth <= 700) { el.style.maxHeight = ''; el.classList.remove('cong'); return; }
    el.classList.add('cong'); document.body.classList.add('congelado'); el.style.maxHeight = 'none';
    const r = el.getBoundingClientRect(), topo = r.top + scrollY, abaixo = Math.max(0, document.documentElement.scrollHeight - (r.bottom + scrollY));
    el.style.maxHeight = Math.max(min, innerHeight - topo - abaixo - 2) + 'px';
  };
  f(); requestAnimationFrame(f); setTimeout(f, 400);
  if (!window.__cong) { window.__cong = []; addEventListener('resize', recongelar); }
  window.__cong = window.__cong.filter(g => g.el !== el && g.el.isConnected); f.el = el; window.__cong.push(f);
}
export function recongelar() { (window.__cong || []).forEach(g => g()); }

// Cabeçalho "YHWH" e rodapé "Obrigado Senhor!" em todas as telas (volta sozinho se a tela for redesenhada)
function marcaFe() {
  if (typeof document === 'undefined') return;
  const alvos = [...document.querySelectorAll('.main, .appw')]; if (!alvos.length && document.body) alvos.push(document.body);
  const garantir = (alvo) => {
    let t = alvo.querySelector(':scope > .fe-topo'), r = alvo.querySelector(':scope > .fe-rodape');
    if (!t) { t = document.createElement('div'); t.className = 'fe-topo'; t.textContent = 'YHWH'; const m = alvo.querySelector(':scope > .mtop'); if (m) m.after(t); else alvo.prepend(t); }
    if (!r) { r = document.createElement('div'); r.className = 'fe-rodape'; r.textContent = 'Obrigado Senhor!'; alvo.append(r); }
    else if (alvo.lastElementChild !== r) alvo.append(r);
  };
  alvos.forEach(a => { garantir(a); new MutationObserver(() => garantir(a)).observe(a, { childList: true }); });
}
if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', marcaFe); else marcaFe(); }

// Faixa com a logomarca do Farm Plan no topo de todo PDF gerado pela tela (só aparece na impressão)
function faixaPdf() {
  if (typeof document === 'undefined') return;
  const alvo = document.querySelector('.main'); if (!alvo || alvo.querySelector(':scope > .fp-print')) return;
  const d = document.createElement('div'); d.className = 'fp-print';
  d.innerHTML = '<img class="gu" src="logo.png" alt="Gesta\'Up"><img class="fp" src="icon-192.png" alt="Farm Plan">';
  alvo.prepend(d);
}
if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', faixaPdf); else faixaPdf(); }

// Balões no estilo minimalista (opção E): número grande em cima, nome embaixo com um pontinho de cor
function baloesE() {
  if (typeof document === 'undefined') return;
  const tira = (s) => s.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F1E6}-\u{1F1FF}]/gu, '').replace(/\s+/g, ' ').trim();
  document.querySelectorAll('.resumo .rc:not([data-e])').forEach(el => {
    const barra = el.querySelector('.mbx'); if (barra) barra.remove();
    let num, rot;
    const txt = tira(el.textContent);
    if (el.classList.contains('ra') && txt.includes('·')) { const i = txt.indexOf('·'); num = txt.slice(0, i).trim(); rot = txt.slice(i + 1).trim(); }
    else { const b = el.querySelector('b'); num = b ? tira(b.textContent) : ''; rot = tira(txt.replace(num, '')); }
    el.textContent = '';
    const nb = document.createElement('b'); nb.textContent = num || '—'; if (num.length > 9) nb.className = 'lg';
    const sp = document.createElement('span'); sp.textContent = rot.replace(/^·\s*/, '');
    el.append(nb, sp); if (barra) el.append(barra);
    el.dataset.e = '1';
  });
}
if (typeof document !== 'undefined') {
  const ini = () => { baloesE(); new MutationObserver(baloesE).observe(document.body, { childList: true, subtree: true }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ini); else ini();
}
