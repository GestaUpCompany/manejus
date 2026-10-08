// =====================================================================
// FARM PLAN · Gesta'Up · ajuda.js
// Pequeno manual dentro do aplicativo (botão ❓ Ajuda). Funciona sem
// internet: o texto fica dentro do próprio app.
// =====================================================================
const CSS = `
.aj-scrim{position:fixed;inset:0;background:rgba(10,25,32,.45);z-index:84}
.aj{position:fixed;left:50%;bottom:0;transform:translateX(-50%);width:min(560px,100%);max-height:94vh;background:var(--bg);border-radius:16px 16px 0 0;z-index:85;display:flex;flex-direction:column;box-shadow:0 -10px 40px rgba(0,0,0,.25)}
.aj-h{display:flex;gap:10px;align-items:center;padding:14px 16px;border-bottom:1px solid var(--line);background:var(--navy);color:#fff;border-radius:16px 16px 0 0}
.aj-h b{font-size:17px;flex:1}
.aj-h button{border:0;background:rgba(255,255,255,.18);color:#fff;border-radius:50%;width:34px;height:34px;font-size:16px;cursor:pointer}
.aj-b{flex:1;min-height:0;overflow-y:auto;padding:12px 14px 22px}
.aj-b>*{margin-bottom:8px}
.aj-ouro{background:var(--s2-soft);border:1px solid var(--s2);border-radius:12px;padding:12px 14px;font-size:14px;line-height:1.5}
.aj-ouro b{color:var(--s2)}
.aj details{display:block;background:var(--surface);border:1px solid var(--line);border-radius:12px}
.aj summary{list-style:none;cursor:pointer;padding:13px 14px;font-weight:700;font-size:15px;display:flex;gap:10px;align-items:center}
.aj summary::-webkit-details-marker{display:none}
.aj summary:after{content:'›';margin-left:auto;font-size:20px;color:var(--muted);transition:.2s}
.aj details[open] summary:after{transform:rotate(90deg)}
.aj summary span{font-size:20px;width:26px;text-align:center}
.aj ol{margin:0;padding:0 16px 14px 36px;font-size:14px;line-height:1.55}
.aj ol li{margin-bottom:5px}
.aj .aj-dica{margin:0 14px 14px;background:var(--s5-soft);border-radius:8px;padding:8px 10px;font-size:13px}
.aj-pdf{display:block;margin-top:6px;text-align:center;padding:12px;border:1px dashed var(--line);border-radius:12px;font-weight:700;color:var(--s3);text-decoration:none}
`;
const TOPICOS = [
  ['✓', 'Marcar Feito ou Não Deu', [
    'Fez a tarefa: toque no botão verde <b>✓ Feito</b>. O cartão fica verde.',
    'Não deu: toque em <b>✗ Não Deu</b> e escolha o desenho do motivo (🌧 Chuva, 🔧 Máquina, 👥 Faltou Gente…).',
    'Marcou errado: toque em <b>↩ Desfazer</b>.',
    'Tarefa de equipe: quem dá baixa é o <b>líder</b> 👷.'], 'Toda tarefa precisa de uma resposta no mesmo dia.'],
  ['🔊', 'Ouvir e Letra Grande', [
    'Toque no <b>🔊</b> do cartão: o celular fala a tarefa, o local e a meta.',
    'Toque em <b>🔊 Ouvir as Tarefas</b> lá em cima: ele fala o que falta fazer no dia.',
    'Letra pequena? Toque em <b>A+</b> no topo. Cada toque aumenta; no terceiro volta ao normal.',
    'O círculo verde lá em cima mostra quantas tarefas já foram feitas.']],
  ['☑', 'Lista de Conferência', [
    'Algumas tarefas (vacinação, embarque, revisão) têm uma <b>lista</b>.',
    'Toque em <b>☑ Conferir e Dar Feito</b>.',
    'Marque <b>item por item</b> o que foi conferido.',
    'Com tudo marcado, toque em <b>✓ Tudo Conferido · Feito</b>.'], 'Se algum item não deu para fazer, marque Não Deu e explique o motivo.'],
  ['🎤', 'Falar em Vez de Escrever', [
    'Onde aparece o <b>🎤</b> ao lado de um campo, toque nele e fale.',
    'O celular escreve o que você falou. Confira e corrija se precisar.',
    'Toque de novo no 🎤 para parar.'], 'O ditado precisa de internet na maioria dos celulares. Sem sinal, grave um áudio pelo 📷 Foto ou 💬 Recado.'],
  ['📋', 'Como Fazer (5M)', [
    'Toque no <b>nome da tarefa</b>.',
    'Aparecem quem coordena, o passo a passo, as máquinas, os materiais e a <b>meta</b>.',
    'Toque de novo no nome para fechar.']],
  ['⏱', 'Cronômetro', [
    'Começou o serviço: toque em <b>▶ Começar</b>.',
    'Vai parar: <b>⏸ Pausar</b> e escolha o motivo: 🍽 Almoço, 🌧 Chuva, 🔧 Máquina, 🌙 Continua Amanhã.',
    'Voltou: <b>▶ Retomar</b>.',
    'Acabou: <b>■ Terminar</b>.'], 'O tempo das pausas não conta. Não esqueça o cronômetro ligado no almoço ou à noite.'],
  ['🎯', 'Meta', [
    'Ao tocar em ■ Terminar, aparece a meta (exemplo: 10 Bebedouros).',
    'Em <b>Quanto Foi Feito?</b> digite o número.',
    'O app marca: ✅ Bateu, 🟡 Bateu em Parte ou ❌ Não Bateu.',
    'Se não bateu, escreva o porquê e toque em <b>✓ Terminar e Dar Baixa</b>.']],
  ['📎', 'Foto, Vídeo e Áudio', [
    'Toque em <b>📷 Foto</b> no cartão da tarefa (ou no 📎 do problema).',
    '📷 Foto na hora · 🎥 Vídeo até 30 segundos · 🎤 Áudio até 2 minutos.',
    'Gravar: toque na bolinha vermelha; toque de novo para parar; depois <b>✓ Enviar</b>.',
    'Na primeira vez, toque em <b>Permitir</b> câmera e microfone.']],
  ['⚠', 'Imprevisto e Fora do Plano', [
    '<b>⚠️ Problema</b> (barra de baixo): máquina quebrou, animal doente, cerca arrebentada…',
    '<b>➕ Fiz Outro</b> (barra de baixo): serviço que não estava na lista.',
    'Complete o que aconteceu e onde, e toque em <b>Salvar</b>.',
    'Depois, o app oferece tirar uma foto.']],
  ['💬', 'Recado para o Gestor', [
    'Toque em <b>💬 Recado</b>, na barra de baixo.',
    'Escreva, e se quiser mande foto, vídeo ou áudio junto.',
    'Só você e o gestor veem.']],
  ['📲', 'Relatório do Dia no Grupo', [
    'No fim do dia, toque no botão verde <b>📲 Relatório</b>, na barra de baixo.',
    'Confira o texto e as fotos.',
    'Toque em <b>Compartilhar</b>, escolha o <b>WhatsApp</b> e o <b>grupo da fazenda</b>.',
    'Se o texto não for junto das fotos, ele já está copiado: é só colar.']],
  ['🔔', 'Avisos no Celular', [
    'Toque em <b>🔔 Ligar</b> no aviso azul do app e depois em <b>Permitir</b>.',
    'De manhã chega um aviso com as <b>tarefas do dia</b>.',
    'Às 17h, se faltar, chega o lembrete do <b>relatório no grupo</b>.',
    'Tocou no aviso: o app abre.',
    '<button data-avisos="1" style="margin-top:6px;width:100%;min-height:3em;border:0;border-radius:14px;background:#1F9D55;color:#fff;font-weight:800;font-size:1em">🔔 Ligar e Mandar um Aviso de Teste</button>'], 'No iPhone, os avisos só funcionam com o app instalado na tela do celular.'],
  ['📵', 'Sem Internet', [
    'Pode usar tudo normalmente: o celular guarda.',
    'A faixa no topo mostra quantos itens estão <b>guardados</b>.',
    'Quando pegar sinal, envia sozinho e mostra <b>✓ Tudo Enviado</b>.',
    'Abra o app uma vez por dia onde tem sinal (na sede) para baixar as tarefas.'], 'Não apague os dados do navegador nem desinstale o app com itens guardados.'],
  ['❓', 'Dúvidas Comuns', [
    '<b>Não aparece tarefa:</b> pode não ter tarefa sua hoje. Abra o app onde tem sinal; se continuar, avise o gestor.',
    '<b>Sem o botão ✓ Feito:</b> a tarefa é da equipe (aparece 👷, quem marca é o líder) ou o dia ainda não chegou (📅).',
    '<b>Esqueci a senha:</b> peça ao gestor uma senha nova.',
    '<b>Esqueci o cronômetro ligado:</b> avise o gestor, ele corrige.']]
];
export function abrirAjuda(primeiraVez = false) {
  if (!document.getElementById('aj-css')) { const s = document.createElement('style'); s.id = 'aj-css'; s.textContent = CSS; document.head.appendChild(s); }
  const el = document.createElement('div');
  el.innerHTML = `<div class="aj-scrim" data-ajx="1"></div><div class="aj"><div class="aj-h"><b>❓ Como Usar o Farm Plan</b><button data-ajx="1" aria-label="Fechar">✕</button></div>
    <div class="aj-b">
      ${primeiraVez ? '<div style="font-size:14px">Bem-vindo! Leia rapidinho como funciona. Esta ajuda fica sempre no botão <b>❓</b> lá em cima.</div>' : ''}
      <div class="aj-ouro"><b>As 3 Regras de Ouro</b><br>1. Toda tarefa recebe ✓ Feito ou ✗ Não Deu no mesmo dia.<br>2. Sem internet pode usar: o celular guarda e envia depois.<br>3. No fim do dia, toque em 📲 Relatório e mande no grupo.</div>
      ${TOPICOS.map(([e, tit, passos, dica]) => `<details><summary><span>${e}</span>${tit}</summary><ol>${passos.map(p => `<li>${p}</li>`).join('')}</ol>${dica ? `<div class="aj-dica">💡 ${dica}</div>` : ''}</details>`).join('')}
      <a class="aj-pdf" href="manual-do-aplicativo.pdf" target="_blank" rel="noopener">📄 Abrir o Manual Completo com Fotos (Precisa de Internet)</a>
    </div></div>`;
  document.body.appendChild(el);
  el.addEventListener('click', (e) => { if (e.target.closest('[data-ajx]')) el.remove(); });
  // abre um tópico por vez
  el.querySelectorAll('details').forEach(d => d.addEventListener('toggle', () => { if (d.open) el.querySelectorAll('details').forEach(o => { if (o !== d) o.open = false; }); }));
}
