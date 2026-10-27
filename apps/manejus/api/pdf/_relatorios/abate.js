// Endpoint fino do Relatório de Abate. O cliente envia os lotes já montados (src/features/relatorioAbate/agregacao.ts);
// aqui só se desenha. Cada lote começa em página nova: indicadores, a "faixa da vida" (categorias proporcionais ao
// tempo, com as saídas e mortes marcadas), categorias, linha do tempo, pastos, dietas, mortes e consumo.
// A paginação é do motor de fluxo (_shared/flowEngine.js): tabelas longas se dividem repetindo o cabeçalho.

import { escapeHtml, dateFmt, numFmt, intFmt, moneyFmt } from '../_shared/formatters.js'
import { generatePdf } from '../_shared/puppeteer.js'
import { createAuthenticatedSupabase } from '../_shared/supabaseAuth.js'
import { renderHeader, htmlDocument, kpi } from '../_shared/template.js'
import { flowBlock, flowIntro, flowSection, flowTable } from '../_shared/flowEngine.js'

const MAX_LOTES = 150
const MAX_EVENTOS = 20_000
const MAX_BODY_BYTES = 8_000_000
const PALETA_CATEGORIAS = 5

const ABATE_CSS = `
.ab-table th,.ab-table td{font-size:10px;padding:3px 5px;line-height:1.25}
.ab-table td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.ab-table th.num{text-align:right}
.ab-table tr.ev-saida td{background:#fdf6e7;color:#6b4a0f;font-weight:700}
.ab-table tr.ev-morte td{color:#a53c36}
.ab-table tr.ev-criacao td{color:#0b6a42;font-weight:700}
.lote-titulo{display:flex;align-items:baseline;gap:10px;margin:0 0 1mm}
.lote-titulo h2{margin:0;color:#0b6a42;font-size:20px;line-height:1.15}
.lote-sub{color:#63736a;font-size:12px;margin:0 0 3mm}
.selo{display:inline-block;border-radius:4px;padding:2px 7px;font-size:10px;font-weight:700;letter-spacing:.6px;text-transform:uppercase}
.selo.desativado{background:#fdf6e7;color:#8a5d10;border:1px solid #e7d3a4}
.selo.ativo{background:#f0f6f2;color:#0b6a42;border:1px solid #d3e4d9}
.vida{border:1px solid #dce5df;border-radius:6px;padding:9px 12px 8px;background:#fff}
.vida-titulo{color:#30463a;font-size:13px;font-weight:700;margin:0 0 6px}
.vida-eixo{display:flex;justify-content:space-between;color:#63736a;font-size:10px;margin-bottom:9px}
.vida-quadro{position:relative;display:flex;flex-direction:column;gap:1.5mm;margin:0 0 2mm}
.vida-linha{display:flex;align-items:center}
.vida-rotulo{flex:none;width:30mm;padding-right:3mm;color:#30463a;font-size:10px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vida-rotulo-morte{color:#a53c36}
.vida-trilho{position:relative;flex:1;height:5.5mm;border-radius:3px;background:#eef3f0}
.vida-seg{position:absolute;top:0;bottom:0;display:flex;align-items:center;justify-content:center;border-radius:3px;color:#fff;font-size:9px;font-weight:700;white-space:nowrap;overflow:hidden}
.vida-seg.c0{background:#0b6a42}.vida-seg.c1{background:#3f8f6b}.vida-seg.c2{background:#7bb596;color:#16402c}.vida-seg.c3{background:#a9cdb9;color:#16402c}.vida-seg.c4{background:#d6e7dc;color:#16402c}
.vida-guia{position:absolute;top:-1.4mm;bottom:-1.4mm;left:30mm;right:0;pointer-events:none}
.vida-marca{position:absolute;top:0;bottom:0;width:2px;margin-left:-1px;background:#c28a27}
.vida-marca::before{content:"";position:absolute;top:-2px;left:-3px;width:8px;height:8px;background:#c28a27;transform:rotate(45deg)}
.vida-morte{position:absolute;top:0;bottom:0;width:2px;margin-left:-1px;background:#c94d46}
.vida-legenda{display:flex;flex-wrap:wrap;gap:3px 14px;color:#4f5f56;font-size:10px;padding-top:2mm}
.vida-legenda b{color:#8a5d10}
.peso{border:1px solid #dce5df;border-radius:6px;padding:9px 12px 8px;background:#fff}
.peso-svg{display:block;width:100%;height:auto}
.peso-svg text{font-family:Arial,Helvetica,sans-serif;fill:#63736a;font-size:13px}
.peso-svg .peso-rotulo{fill:#30463a;font-weight:700}
.peso-legenda{display:flex;flex-wrap:wrap;gap:3px 14px;color:#4f5f56;font-size:10px;padding-top:1.5mm}
.peso-legenda i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:4px;vertical-align:-1px}
`

function isPDFData(v) {
  if (!v || typeof v !== 'object') return false
  if (typeof v.fazendaNome !== 'string' || typeof v.fazendaId !== 'string' || !v.fazendaId) return false
  if (!Array.isArray(v.lotes) || v.lotes.length === 0 || v.lotes.length > MAX_LOTES) return false
  if (!v.resumo || typeof v.resumo !== 'object') return false
  let eventos = 0
  for (const l of v.lotes) {
    if (!l || typeof l.nome !== 'string' || !l.indicadores || typeof l.inicio !== 'string' || typeof l.fim !== 'string') return false
    if (![l.eventos, l.categorias, l.ocupacao, l.dietas, l.versoesDieta, l.mortesPorCausa, l.consumo, l.saidas, l.evolucaoPeso].every(Array.isArray)) return false
    eventos += l.eventos.length + l.evolucaoPeso.reduce((t, x) => t + (Array.isArray(x?.pontos) ? x.pontos.length : MAX_EVENTOS), 0)
  }
  return eventos <= MAX_EVENTOS
}

const diasEntre = (a, b) => Math.max(0, Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000))
const mesFmt = (m) => `${m.slice(5, 7)}/${m.slice(0, 4)}`
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`
const milFmt = (v) => (v == null || Number.isNaN(v) ? '—' : Math.round(Number(v)).toLocaleString('pt-BR'))

function tabela(titulo, colunas, linhas, extra = '') {
  const colgroup = `<colgroup>${colunas.map((c) => `<col style="width:${c.w}">`).join('')}</colgroup>`
  const head = `<tr>${colunas.map((c) => `<th${c.num ? ' class="num"' : ''}>${escapeHtml(c.h)}</th>`).join('')}</tr>`
  const corpo = linhas
    .map((l) => `<tr${l.classe ? ` class="${l.classe}"` : ''}>${l.celulas.map((v, i) => `<td${colunas[i].num ? ' class="num"' : ''}>${escapeHtml(v)}</td>`).join('')}</tr>`)
    .join('')
  return `<div class="table-block"><h3 class="table-title">${escapeHtml(titulo)}<span>${escapeHtml(extra || plural(linhas.length, 'linha', 'linhas'))}</span></h3><table class="ab-table">${colgroup}<thead>${head}</thead><tbody>${corpo}</tbody></table></div>`
}

// Faixa proporcional ao tempo: uma linha por categoria (categorias paralelas não se cobrem), uma linha de mortes e
// marcas douradas atravessando tudo nos dias de abate/venda
function faixaDaVida(lote) {
  const total = Math.max(1, diasEntre(lote.inicio, lote.fim))
  const pos = (d) => Math.min(100, Math.max(0, (diasEntre(lote.inicio, d) / total) * 100))
  const linhas = lote.categorias
    .map((c, idx) => {
      const de = pos(c.inicio)
      const ate = pos(c.fim ?? lote.fim)
      const largura = Math.max(0.6, ate - de)
      const dias = diasEntre(c.inicio, c.fim ?? lote.fim)
      return `<div class="vida-linha"><span class="vida-rotulo">${escapeHtml(c.categoria)}</span><div class="vida-trilho"><div class="vida-seg c${idx % PALETA_CATEGORIAS}" style="left:${de.toFixed(2)}%;width:${largura.toFixed(2)}%">${largura >= 14 ? plural(dias, 'dia', 'dias') : ''}</div></div></div>`
    })
    .join('')
  const mortes = [...new Set(lote.eventos.filter((e) => e.tipo === 'morte').map((e) => pos(e.data).toFixed(2)))]
  const linhaMortes = mortes.length
    ? `<div class="vida-linha"><span class="vida-rotulo vida-rotulo-morte">Mortes</span><div class="vida-trilho">${mortes.map((p) => `<i class="vida-morte" style="left:${p}%"></i>`).join('')}</div></div>`
    : ''
  const marcas = [...new Set(lote.saidas.map((s) => pos(s.data).toFixed(2)))].map((p) => `<i class="vida-marca" style="left:${p}%"></i>`).join('')
  const legenda = lote.saidas
    .map((s) => `<span><b>◆ ${escapeHtml(s.tipo)}</b> ${dateFmt(s.data)} · ${intFmt(s.cabecas)} cab${s.categoria ? ` · ${escapeHtml(s.categoria)}` : ''}</span>`)
    .join('')
  return `<div class="vida"><p class="vida-titulo">Faixa da vida do lote</p><div class="vida-eixo"><span>${dateFmt(lote.inicio)}</span><span>${plural(diasEntre(lote.inicio, lote.fim), 'dia', 'dias')}</span><span>${dateFmt(lote.fim)}${lote.ativo ? ' (hoje)' : ''}</span></div><div class="vida-quadro">${linhas}${linhaMortes}<div class="vida-guia">${marcas}</div></div><div class="vida-legenda">${legenda}</div></div>`
}

const CORES_SERIE = ['#0b6a42', '#2f6f9f', '#7b5ea7', '#c94d46', '#5a7d2a']

const somaDias = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

// Peso médio por categoria ao longo do ciclo (entrada, pesagens e saída), com as saídas de abate/venda marcadas
function graficoPeso(lote) {
  const series = lote.evolucaoPeso.filter((s) => s.pontos.length > 0)
  const todos = series.flatMap((s) => s.pontos)
  if (!todos.length) return ''
  const W = 1000
  const H = 170
  const ml = 54
  const mr = 24
  const mt = 16
  const mb = 28
  const totalDias = Math.max(1, diasEntre(lote.inicio, lote.fim))
  const x = (d) => ml + (Math.min(totalDias, diasEntre(lote.inicio, d)) / totalDias) * (W - ml - mr)
  let min = Math.min(...todos.map((p) => p.pesoKg))
  let max = Math.max(...todos.map((p) => p.pesoKg))
  const folga = Math.max(5, (max - min) * 0.15)
  min = Math.floor((min - folga) / 10) * 10
  max = Math.ceil((max + folga) / 10) * 10
  if (max <= min) max = min + 10
  const y = (v) => mt + (1 - (v - min) / (max - min)) * (H - mt - mb)

  const grade = [0, 1, 2, 3, 4]
    .map((i) => {
      const v = min + ((max - min) * i) / 4
      return `<line x1="${ml}" y1="${y(v).toFixed(1)}" x2="${W - mr}" y2="${y(v).toFixed(1)}" stroke="#e5ebe7" stroke-width="1"/><text x="${ml - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${Math.round(v)}</text>`
    })
    .join('')
  const eixoX = [0, 1, 2, 3, 4]
    .map((i) => {
      const d = somaDias(lote.inicio, Math.round((totalDias * i) / 4))
      const anchor = i === 0 ? 'start' : i === 4 ? 'end' : 'middle'
      return `<text x="${x(d).toFixed(1)}" y="${H - 8}" text-anchor="${anchor}">${dateFmt(d).slice(0, 5)}</text>`
    })
    .join('')
  const saidas = [...new Set(lote.saidas.map((s) => x(s.data).toFixed(1)))]
    .map((px) => `<line x1="${px}" y1="${mt - 4}" x2="${px}" y2="${H - mb}" stroke="#c28a27" stroke-width="2"/><rect x="${(Number(px) - 4).toFixed(1)}" y="${mt - 9}" width="8" height="8" fill="#c28a27" transform="rotate(45 ${px} ${mt - 5})"/>`)
    .join('')
  const rotulados = []
  const rotulo = (p, anchor, dx) => {
    const px = x(p.data)
    const py = y(p.pesoKg)
    if (rotulados.some((r) => Math.abs(r.px - px) < 2 && Math.abs(r.py - py) < 2)) return ''
    // se já há rótulo logo acima deste ponto, este vai abaixo
    const colide = rotulados.some((r) => Math.abs(r.px - px) < 50 && Math.abs(r.py - py) < 16)
    rotulados.push({ px, py })
    const ty = colide ? py + 19 : py - 9
    return `<text class="peso-rotulo" x="${(px + dx).toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="${anchor}">${numFmt(p.pesoKg, 0)}</text>`
  }
  const linhas = series
    .map((s, idx) => {
      const cor = CORES_SERIE[idx % CORES_SERIE.length]
      const pts = s.pontos.map((p) => `${x(p.data).toFixed(1)},${y(p.pesoKg).toFixed(1)}`).join(' ')
      const marcadores = s.pontos
        .map((p) => {
          const cx = x(p.data).toFixed(1)
          const cy = y(p.pesoKg).toFixed(1)
          if (p.origem === 'Entrada') return `<circle cx="${cx}" cy="${cy}" r="5" fill="#fff" stroke="${cor}" stroke-width="2.5"/>`
          if (p.origem === 'Pesagem') return `<circle cx="${cx}" cy="${cy}" r="3" fill="${cor}"/>`
          return `<circle cx="${cx}" cy="${cy}" r="5" fill="${cor}"/>`
        })
        .join('')
      const primeiro = s.pontos[0]
      const ultimo = s.pontos[s.pontos.length - 1]
      const rotulos = s.pontos.length > 1 ? rotulo(primeiro, 'start', 2) + rotulo(ultimo, 'end', -2) : rotulo(primeiro, 'middle', 0)
      return `<polyline points="${pts}" fill="none" stroke="${cor}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${marcadores}${rotulos}`
    })
    .join('')
  const legenda = series.map((s, idx) => `<span><i style="background:${CORES_SERIE[idx % CORES_SERIE.length]}"></i>${escapeHtml(s.categoria)}</span>`).join('')
  return `<div class="peso"><p class="vida-titulo">Evolução do peso por categoria (kg/cab)</p><svg class="peso-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolução do peso por categoria">${grade}${eixoX}${saidas}${linhas}</svg><div class="peso-legenda">${legenda}<span>○ entrada</span><span>● pesagem (média do dia)</span><span>◆ saída</span></div></div>`
}

function blocosDoLote(lote, marca) {
  const i = lote.indicadores
  const fimTxt = (f) => (f ? dateFmt(f) : lote.ativo ? 'em curso' : 'até a saída')
  const opts = { sec: lote.nome, lbl: 'Lote' }
  const sub = [lote.sistemaProducao, `${dateFmt(lote.inicio)} a ${dateFmt(lote.fim)}`, lote.ativo ? 'saída parcial: lote segue ativo' : 'lote desativado'].filter(Boolean).join(' · ')
  const abertura = flowBlock(
    `<div class="lote-titulo"><h2>${escapeHtml(lote.nome)}</h2><span class="selo ${lote.ativo ? 'ativo' : 'desativado'}">${lote.ativo ? 'Ativo' : 'Desativado'}</span></div><p class="lote-sub">${escapeHtml(sub)}</p>` +
      `<div class="kpi-grid">${kpi(`${intFmt(i.cabecasSaidas)} cab`, 'Saíram do lote', `${intFmt(i.cabecasAbate)} abate · ${intFmt(i.cabecasVenda)} venda`, 'gold')}${kpi(`${intFmt(i.diasCiclo)} dias`, 'Ciclo do lote', lote.ativo ? 'da criação até hoje' : 'da criação à última saída')}${kpi(i.gmdKgDia != null ? `${numFmt(i.gmdKgDia, 3)} kg` : '—', 'GMD médio do ciclo', i.pesoEntradaKg != null && i.pesoFinalKg != null ? `${numFmt(i.pesoEntradaKg, 1)} → ${numFmt(i.pesoFinalKg, 1)} kg/cab` : 'sem pesos suficientes')}${kpi(intFmt(i.totalMortes), 'Mortes no ciclo', i.custoMedioCabDia != null ? `custo médio R$ ${moneyFmt(i.custoMedioCabDia)}/cab/dia` : '', i.totalMortes > 0 ? 'red' : 'green')}</div>`,
    { ...opts, breakBefore: marca, keepNext: true },
  )
  const faixa = flowBlock(faixaDaVida(lote), opts)
  const categorias = flowTable(
    tabela(
      'Histórico de categorias',
      [
        { h: 'Categoria', w: '22%' },
        { h: 'Início', w: '11%' },
        { h: 'Fim', w: '11%' },
        { h: 'Cab. início', w: '10%', num: true },
        { h: 'Cab. fim', w: '10%', num: true },
        { h: 'Peso entrada (kg)', w: '12%', num: true },
        { h: 'Peso saída (kg)', w: '12%', num: true },
        { h: 'GMD (kg/dia)', w: '12%', num: true },
      ],
      lote.categorias.map((c) => ({
        celulas: [c.categoria, dateFmt(c.inicio), c.fim ? dateFmt(c.fim) : 'em curso', intFmt(c.cabecasInicio), intFmt(c.cabecasFim), numFmt(c.pesoEntradaKg, 1), numFmt(c.pesoSaidaKg, 1), numFmt(c.gmdKgDia, 3)],
      })),
    ),
    { ...opts, minRows: 2 },
  )
  const linhaDoTempo = flowTable(
    tabela(
      'Linha do tempo do lote',
      [
        { h: 'Data', w: '11%' },
        { h: 'Evento', w: '39%' },
        { h: 'Detalhe', w: '50%' },
      ],
      lote.eventos.map((e) => ({
        classe: e.tipo === 'abate' || e.tipo === 'venda' ? 'ev-saida' : e.tipo === 'morte' ? 'ev-morte' : e.tipo === 'criacao' ? 'ev-criacao' : '',
        celulas: [dateFmt(e.data), e.titulo, e.detalhe || '—'],
      })),
      plural(lote.eventos.length, 'evento', 'eventos'),
    ),
    { ...opts, minRows: 4 },
  )
  const pesoGmd = flowTable(
    tabela(
      'Pesagens e GMD por período',
      [
        { h: 'Categoria', w: '20%' },
        { h: 'Data', w: '11%' },
        { h: 'Origem', w: '11%' },
        { h: 'Peso médio (kg)', w: '13%', num: true },
        { h: 'Animais', w: '9%', num: true },
        { h: 'Dias desde o anterior', w: '10%', num: true },
        { h: 'GMD do período', w: '13%', num: true },
        { h: 'GMD acumulado', w: '13%', num: true },
      ],
      lote.evolucaoPeso.flatMap((s) =>
        s.pontos.map((p) => ({
          classe: p.origem === 'Pesagem' ? '' : 'ev-criacao',
          celulas: [p.categoria, dateFmt(p.data), p.origem, numFmt(p.pesoKg, 1), intFmt(p.animais), intFmt(p.dias), numFmt(p.gmdPeriodo, 3), numFmt(p.gmdAcumulado, 3)],
        })),
      ),
      lote.indicadores.totalPesagens > 0 ? plural(lote.indicadores.totalPesagens, 'pesagem individual', 'pesagens individuais') : 'sem pesagens: só entrada e saída das categorias',
    ),
    { ...opts, minRows: 3 },
  )
  const ocupacao = flowTable(
    tabela(
      'Ocupação: pastos, currais e módulos',
      [
        { h: 'Tipo', w: '9%' },
        { h: 'Local', w: '25%' },
        { h: 'Entrada', w: '11%' },
        { h: 'Saída', w: '11%' },
        { h: 'Dias', w: '7%', num: true },
        { h: 'Cab. entrada', w: '9%', num: true },
        { h: 'Cab. saída', w: '9%', num: true },
        { h: 'Peso entrada (kg)', w: '10%', num: true },
        { h: 'Peso saída (kg)', w: '9%', num: true },
      ],
      lote.ocupacao.map((o) => ({
        celulas: [o.tipo, o.local, dateFmt(o.entrada), fimTxt(o.saida), intFmt(o.dias), intFmt(o.cabecasEntrada), intFmt(o.cabecasSaida), numFmt(o.pesoEntradaKg, 1), numFmt(o.pesoSaidaKg, 1)],
      })),
    ),
    { ...opts, minRows: 2 },
  )
  // Com versões gravadas, mostra cada versão da dieta no período do lote; sem elas, o plano nutricional
  const dietas = flowTable(
    lote.versoesDieta.length
      ? tabela(
          'Dietas do lote por versão',
          [
            { h: 'Dieta', w: '22%' },
            { h: 'Versão', w: '7%', num: true },
            { h: 'Vigente desde', w: '11%' },
            { h: 'Vigente até', w: '11%' },
            { h: 'Origem', w: '14%' },
            { h: 'Motivo', w: '15%' },
            { h: 'Insumos', w: '20%' },
          ],
          lote.versoesDieta.map((v) => ({
            celulas: [v.dieta, intFmt(v.versao), dateFmt(v.inicio), fimTxt(v.fim), v.origem, v.motivo ?? '—', v.insumos.length ? v.insumos.join(', ') : '—'],
          })),
        )
      : tabela(
          'Dietas do lote',
          [
            { h: 'Dieta', w: '60%' },
            { h: 'Início', w: '20%' },
            { h: 'Fim', w: '20%' },
          ],
          lote.dietas.map((d) => ({ celulas: [d.nome, dateFmt(d.inicio), fimTxt(d.fim)] })),
        ),
    { ...opts, minRows: 2 },
  )
  const mortes = flowTable(
    tabela(
      'Mortes por causa',
      [
        { h: 'Causa', w: '80%' },
        { h: 'Animais', w: '20%', num: true },
      ],
      lote.mortesPorCausa.map((m) => ({ celulas: [m.causa, intFmt(m.total)] })),
    ),
    { ...opts, minRows: 2 },
  )
  const consumo = flowTable(
    tabela(
      'Consumo e custo por mês (média dos dias e registros)',
      [
        { h: 'Mês', w: '10%' },
        { h: 'Origem', w: '15%' },
        { h: 'Registros', w: '10%', num: true },
        { h: 'Consumo (% PV)', w: '12%', num: true },
        { h: 'Consumo (kg MS/cab)', w: '14%', num: true },
        { h: 'Custo (R$/cab/dia)', w: '14%', num: true },
        { h: 'Ofertado (kg MN)', w: '12%', num: true },
        { h: 'Consumido (kg MN)', w: '13%', num: true },
      ],
      lote.consumo.map((c) => ({
        celulas: [mesFmt(c.mes), c.origem, intFmt(c.registros), numFmt(c.percentPv, 2), numFmt(c.kgMs, 2), c.custoCabDia != null ? moneyFmt(c.custoCabDia) : '—', milFmt(c.kgOfertadoMn), milFmt(c.kgConsumidoMn)],
      })),
    ),
    { ...opts, minRows: 2 },
  )
  const avisos = lote.avisos?.length
    ? flowBlock(`<div class="insight-box"><span class="insight-label">Atenção</span>${lote.avisos.map((a) => escapeHtml(a)).join('<br>')}</div>`, opts)
    : ''
  const grafico = graficoPeso(lote)
  return [abertura, avisos, faixa, grafico ? flowBlock(grafico, opts) : '', categorias, pesoGmd, linhaDoTempo, ocupacao, dietas, mortes, consumo]
}

export async function renderAbateHtml(input) {
  const { fazendaNome, logoGestao, logoFazenda, periodo, tipos, resumo, lotes, falhas = [] } = input
  const brand = { logoGestao, logoFazenda, fazendaNome }
  const escopo = periodo ? `Saídas de ${dateFmt(periodo.inicio)} a ${dateFmt(periodo.fim)}` : 'Todo o histórico'
  const tiposTxt = (tipos ?? []).length === 2 ? 'Abate e venda' : (tipos ?? []).join('')
  const opts = { sec: 'Resumo', lbl: 'Seção' }

  const kpis = flowBlock(
    `<div class="kpi-grid">${kpi(intFmt(resumo.lotes), 'Lotes no relatório', tiposTxt)}${kpi(intFmt(resumo.cabecasSaidas), 'Cabeças que saíram', 'abate + venda', 'gold')}${kpi(intFmt(resumo.cabecasAbate), 'Cabeças abatidas')}${kpi(resumo.cicloMedioDias != null ? `${resumo.cicloMedioDias} dias` : '—', 'Ciclo médio', 'da criação à última saída (ou hoje, se ativo)')}</div>`,
    opts,
  )
  const falhasHtml = falhas.length
    ? flowBlock(`<div class="insight-box"><span class="insight-label">Lotes que não puderam ser carregados</span>${falhas.map((f) => escapeHtml(f.nome)).join(', ')}</div>`, opts)
    : ''
  const quadro = flowTable(
    tabela(
      'Lotes do relatório',
      [
        { h: 'Lote', w: '24%' },
        { h: 'Situação', w: '11%' },
        { h: 'Início', w: '10%' },
        { h: 'Última saída', w: '11%' },
        { h: 'Ciclo (dias)', w: '9%', num: true },
        { h: 'Abate (cab)', w: '9%', num: true },
        { h: 'Venda (cab)', w: '9%', num: true },
        { h: 'GMD (kg/dia)', w: '9%', num: true },
        { h: 'Mortes', w: '8%', num: true },
      ],
      lotes.map((l) => ({
        celulas: [l.nome, l.ativo ? 'Ativo' : 'Desativado', dateFmt(l.inicio), dateFmt(l.ultimaSaida), intFmt(l.indicadores.diasCiclo), intFmt(l.indicadores.cabecasAbate), intFmt(l.indicadores.cabecasVenda), numFmt(l.indicadores.gmdKgDia, 3), intFmt(l.indicadores.totalMortes)],
      })),
    ),
    { ...opts, minRows: 3 },
  )

  const body = flowSection({
    headerHtml: renderHeader({ ...brand, reportTitle: 'Relatório de Abate', section: '__SEC__', sectionLabel: '__LBL__' }),
    footerHtml: `<footer class="report-footer"><span>Gesta'Up · ${escapeHtml(escopo)}</span><span>Página 1 de 1</span></footer>`,
    blocks: [flowBlock(flowIntro('Saída dos lotes por abate e venda', `<div class="period-badge">${escapeHtml(escopo)}</div>`), { ...opts, keepNext: true }), kpis, falhasHtml, quadro, ...lotes.flatMap((l) => blocosDoLote(l, true))],
  })
  return htmlDocument({ title: 'Relatório de Abate', extraCss: ABATE_CSS, body })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Método não permitido' })
  }
  const body = req.body
  if (!isPDFData(body)) {
    return res.status(400).json({ error: 'Payload de relatório inválido ou grande demais' })
  }
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) {
    return res.status(413).json({ error: 'Payload do relatório excede o limite permitido' })
  }

  try {
    await createAuthenticatedSupabase(req, body.fazendaId)
    const html = await renderAbateHtml(body)
    const pdf = await generatePdf({ html, format: 'A4', landscape: true })
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio-abate.pdf"')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-PDF-Renderer', 'puppeteer')
    return res.status(200).send(pdf)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    if (detail === 'Sessão não informada' || detail === 'Sessão inválida') return res.status(401).json({ error: detail })
    if (detail === 'Usuário sem acesso à fazenda') return res.status(403).json({ error: detail })
    console.error('[PDF Abate] Erro ao gerar relatório:', error)
    return res.status(500).json({ error: 'Não foi possível gerar o PDF', detail: String(error) })
  }
}
