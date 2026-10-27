// Endpoint fino do relatório de Cantina. Mesmo padrão do estoque.js e do
// estoqueCombustivel.js: só existe aqui o que é específico deste relatório;
// Chrome, template base e formatadores vêm do _shared/.
//
// Relatório curto, feito para decidir:
//  - Página 1: KPIs (estoque, compras, consumo, custo por refeição), itens para
//    repor e refeições servidas.
//  - Posição por item numa tabela só (saldo, mínimo, cobertura, consumo, valor e
//    classe ABC), paginada.
//  - Marmitas (funcionários x empresas) e pratos feitos, quando houver.
// Não há extrato de movimentações nem avisos de qualidade de dados.
//
// No Infográfico Mensal, dataInicio/dataFim (camelCase) chegam no payload e
// valem quando data_inicio/data_fim (snake_case, da RPC) não vêm preenchidos.

import { escapeHtml, dateFmt, moneyFmt } from '../_shared/formatters.js'
import { generatePdf } from '../_shared/puppeteer.js'
import { renderHeader, page as pageSection, htmlDocument, kpi } from '../_shared/template.js'

const MAX_ITENS = 5000
const MAX_BODY_BYTES = 8_000_000

const POSICAO_ROWS = 15
const REPOR_MAX = 8
const EMPRESAS_MAX = 8

function isPDFData(value) {
  if (!value || typeof value !== 'object') return false
  if (typeof value.fazendaNome !== 'string') return false
  if (!Array.isArray(value.itens)) return false
  return true
}

const CANTINA_CSS = `
.ct-table td,.ct-table th{font-size:11px}
.ct-table th.num,.ct-table td.num{text-align:right}
.ct-duo{display:grid;gap:7mm;align-items:start}
.ct-neg{color:#c94d46;font-weight:700}
.ct-total-row td{background:#f0f6f2;border-top:2px solid #0b6a42;font-weight:700;color:#0b6a42}
.ct-nota{font-size:10px;color:#7a8981;margin:2mm 0 0}
.ct-ok{font-size:12px;color:#0b6a42;background:#f0f6f2;border:1px solid #d3e4d9;border-radius:6px;padding:3mm 4mm;margin:0}
.ct-aviso{font-size:11px;color:#9a6b17;background:#fdf3e3;border:1px solid #eedcae;border-radius:6px;padding:2mm 3mm;margin:2mm 0 0}
.ct-bar{display:inline-block;height:9px;border-radius:2px;background:#0b6a42;vertical-align:middle}
.ct-classe{display:inline-block;min-width:16px;text-align:center;font-weight:700;border-radius:4px;padding:0 4px;font-size:10px}
.ct-classe-A{background:#e3f1e9;color:#0b6a42}
.ct-classe-B{background:#fdf3e3;color:#9a6b17}
.ct-classe-C{background:#eef0f2;color:#5b6770}
`

function periodoTexto(input) {
  const ini = input.data_inicio ?? input.dataInicio ?? null
  const fim = input.data_fim ?? input.dataFim ?? null
  if (ini && fim) return `${dateFmt(ini)} a ${dateFmt(fim)}`
  if (ini) return `A partir de ${dateFmt(ini)}`
  if (fim) return `Até ${dateFmt(fim)}`
  return 'Posição atual'
}

function footerCantina(periodo, page, totalPages) {
  return `<footer class="report-footer"><span>Gesta'Up · Cantina · ${escapeHtml(periodo)}</span><span>Página ${page} de ${totalPages}</span></footer>`
}

function tableHeadHtml(cols) {
  const colgroup = `<colgroup>${cols.map(([, w]) => `<col style="width:${w}">`).join('')}</colgroup>`
  const header = `<thead><tr>${cols.map(([t, , cls]) => `<th${cls ? ` class="${cls}"` : ''}>${t}</th>`).join('')}</tr></thead>`
  return colgroup + header
}

function chunkArray(arr, size) {
  if (arr.length <= size) return [arr]
  const chunks = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

function soma(lista, campo) {
  return lista.reduce((s, x) => s + (Number(x[campo]) || 0), 0)
}

const qtd = (v) => (v == null ? '—' : moneyFmt(v))
const inteiro = (v) => (Number(v) || 0).toLocaleString('pt-BR')
const plural = (n, um, varios) => `${inteiro(n)} ${Number(n) === 1 ? um : varios}`

// Unidades contáveis (unidade, pacote...) saem sem casas decimais, a menos que o valor seja fracionário.
// Medidas contínuas (kg, L) mantêm duas casas.
const UNIDADES_CONTINUAS = new Set(['kg', 'g', 'L', 'l', 'ml', 'mL'])
const PLURAL_UNIDADE = { Unidade: 'Unidades', Pacote: 'Pacotes', Caixa: 'Caixas', Saco: 'Sacos', Lata: 'Latas', Garrafa: 'Garrafas', Fardo: 'Fardos', Rolo: 'Rolos', Frasco: 'Frascos' }

function numeroUnidade(v, unidade) {
  const n = Number(v) || 0
  const casas = UNIDADES_CONTINUAS.has(unidade) || !Number.isInteger(n) ? 2 : 0
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

function rotuloUnidade(v, unidade) {
  const u = unidade ?? ''
  if (!u || UNIDADES_CONTINUAS.has(u) || Math.abs(Number(v)) === 1) return u
  return PLURAL_UNIDADE[u] ?? (u.endsWith('s') ? u : `${u}s`)
}

function quantidadeComUnidade(v, unidade) {
  return escapeHtml(`${numeroUnidade(v, unidade)} ${rotuloUnidade(v, unidade)}`.trim())
}

function textoCobertura(item) {
  if (Number(item.saldo_final) <= 0) return 'Sem saldo'
  if (item.cobertura_dias == null) return 'Sem consumo'
  if (item.cobertura_dias >= 365) return '1 ano ou mais'
  return `${Math.round(item.cobertura_dias)} d`
}

// Sem baixas valoradas (custo zero) não há custo por refeição a mostrar.
function custoPorRefeicao(op) {
  return Number(op?.custo_baixas) > 0 ? op.custo_por_refeicao : null
}

// Saldo negativo primeiro; depois, quem acaba antes.
function itensParaRepor(itens) {
  const dias = (i) => (i.cobertura_dias == null ? Number.MAX_SAFE_INTEGER : Number(i.cobertura_dias))
  return itens
    .filter((i) => i.negativo || i.em_alerta)
    .sort((a, b) => (b.negativo ? 1 : 0) - (a.negativo ? 1 : 0) || dias(a) - dias(b))
}

function reporHtml(itens, temPeriodo) {
  const lista = itensParaRepor(itens)
  const titulo = `<h3 class="table-title">Itens para repor<span>${lista.length}</span></h3>`
  if (!lista.length) return `<div class="table-block">${titulo}<p class="ct-ok">Nenhum item abaixo do mínimo.</p></div>`
  const linhas = lista.slice(0, REPOR_MAX).map((i) => {
    const saldoCls = i.negativo ? 'num ct-neg' : 'num'
    const cobertura = temPeriodo ? `<td class="num">${textoCobertura(i)}</td>` : ''
    return `<tr><td>${escapeHtml(i.nome)}</td><td class="${saldoCls}">${quantidadeComUnidade(i.saldo_final, i.unidade)}</td><td class="num">${numeroUnidade(i.estoque_minimo, i.unidade)}</td>${cobertura}</tr>`
  }).join('')
  const cols = temPeriodo
    ? [['Item', '40%'], ['Saldo', '22%', 'num'], ['Mínimo', '18%', 'num'], ['Cobertura', '20%', 'num']]
    : [['Item', '46%'], ['Saldo', '30%', 'num'], ['Mínimo', '24%', 'num']]
  const resto = lista.length > REPOR_MAX ? `<p class="ct-nota">e mais ${plural(lista.length - REPOR_MAX, 'item', 'itens')}; veja a posição por item.</p>` : ''
  return `<div class="table-block">${titulo}<table class="ct-table">${tableHeadHtml(cols)}<tbody>${linhas}</tbody></table>${resto}</div>`
}

function refeicoesHtml(op) {
  const total = Number(op?.refeicoes_total) || 0
  if (!total) return ''
  const linhas = [['Café da manhã', op.cafe_manha], ['Lanche', op.lanches], ['Almoço', op.almocos], ['Jantar', op.jantares]]
    .filter(([, v]) => Number(v) > 0)
    .map(([nome, v]) => {
      const pct = (Number(v) / total) * 100
      return `<tr><td>${nome}</td><td class="num">${inteiro(v)}</td><td class="num">${Math.round(pct)}%</td><td><span class="ct-bar" style="width:${Math.max(2, Math.round(pct))}%"></span></td></tr>`
    }).join('')
  const cols = [['Refeição', '32%'], ['Qtd', '16%', 'num'], ['%', '14%', 'num'], ['', '38%']]
  return `<div class="table-block"><h3 class="table-title">Refeições servidas<span>${inteiro(total)}</span></h3><table class="ct-table">${tableHeadHtml(cols)}<tbody>${linhas}</tbody></table></div>`
}

function linhaItem(i, temPeriodo, abc) {
  const classe = abc?.[i.id]
  const chip = classe ? `<span class="ct-classe ct-classe-${classe}">${classe}</span>` : '—'
  const saldoCls = i.negativo ? 'num ct-neg' : 'num'
  const periodo = temPeriodo
    ? `<td class="num">${textoCobertura(i)}</td><td class="num">${Number(i.baixas) > 0 ? quantidadeComUnidade(i.baixas, i.unidade) : '—'}</td>`
    : ''
  return `<tr><td>${escapeHtml(i.nome)}</td><td>${chip}</td><td class="${saldoCls}"><strong>${quantidadeComUnidade(i.saldo_final, i.unidade)}</strong></td><td class="num">${i.estoque_minimo > 0 ? numeroUnidade(i.estoque_minimo, i.unidade) : '—'}</td>${periodo}<td class="num"><strong>R$ ${moneyFmt(i.valor_estoque)}</strong></td></tr>`
}

function posicaoTableHtml(itens, total, temPeriodo, abc, rodape) {
  const cols = temPeriodo
    ? [['Item', '33%'], ['ABC', '6%'], ['Saldo', '14%', 'num'], ['Mínimo', '9%', 'num'], ['Cobertura', '11%', 'num'], ['Consumo', '13%', 'num'], ['Valor', '14%', 'num']]
    : [['Item', '38%'], ['ABC', '7%'], ['Saldo', '17%', 'num'], ['Mínimo', '12%', 'num'], ['Valor', '26%', 'num']]
  const rows = itens.map((i) => linhaItem(i, temPeriodo, abc)).join('')
  return `<div class="table-block"><h3 class="table-title">Posição por item<span>${plural(total, 'item', 'itens')}</span></h3><table class="ct-table">${tableHeadHtml(cols)}<tbody>${rows}${rodape ?? ''}</tbody></table></div>`
}

function totalRow(itens, temPeriodo) {
  const colunasAntesDoValor = temPeriodo ? 6 : 4
  return `<tr class="ct-total-row"><td colspan="${colunasAntesDoValor}">Total em estoque</td><td class="num">R$ ${moneyFmt(soma(itens, 'valor_estoque'))}</td></tr>`
}

const ROTULOS_REFEICAO = [['cafe_manha', 'Café da manhã'], ['lanche', 'Lanche'], ['almoco', 'Almoço'], ['jantar', 'Jantar'], ['nao_informada', 'Sem refeição informada']]

// Marmitas: quem consumiu (funcionários x empresas) e quanto custou.
function marmitasHtml(m) {
  const quantidade = Number(m?.quantidade) || 0
  if (!quantidade) return ''
  const titulo = `<h3 class="table-title">Marmitas<span>${inteiro(quantidade)} · R$ ${moneyFmt(m.valor)}</span></h3>`
  const aviso = m.sem_preco
    ? `<p class="ct-aviso">${plural(m.sem_preco, 'registro', 'registros')} sem preço unitário: valor não contabilizado.</p>`
    : ''
  const tipo = m.por_tipo
  if (!tipo) return `<div class="table-block">${titulo}${aviso}</div>`

  const empresas = Array.isArray(m.por_empresa) ? m.por_empresa : []
  const principais = empresas.slice(0, EMPRESAS_MAX)
  const outras = empresas.slice(EMPRESAS_MAX)
  const linha = (nome, q, v) => `<tr><td>${nome}</td><td class="num">${inteiro(q)}</td><td class="num">R$ ${moneyFmt(v)}</td></tr>`
  const linhas = [
    Number(tipo.interna?.quantidade) > 0 ? linha('Funcionários', tipo.interna.quantidade, tipo.interna.valor) : '',
    ...principais.map((e) => linha(escapeHtml(e.empresa), e.quantidade, e.valor)),
    outras.length ? linha(`Outras (${outras.length})`, soma(outras, 'quantidade'), soma(outras, 'valor')) : '',
  ].join('')
  const cols = [['Quem consumiu', '50%'], ['Marmitas', '20%', 'num'], ['Valor', '30%', 'num']]
  const refeicoes = ROTULOS_REFEICAO
    .filter(([chave]) => Number(m.por_refeicao?.[chave]) > 0)
    .map(([chave, rotulo]) => `${rotulo} ${inteiro(m.por_refeicao[chave])}`)
  const nota = refeicoes.length ? `<p class="ct-nota">Por refeição: ${refeicoes.join(' · ')}</p>` : ''
  return `<div class="table-block">${titulo}<table class="ct-table">${tableHeadHtml(cols)}<tbody>${linhas}</tbody></table>${nota}${aviso}</div>`
}

function linhasDeMarmitas(m) {
  if (!m?.por_tipo) return 0
  const empresas = Array.isArray(m.por_empresa) ? m.por_empresa.length : 0
  return (Number(m.por_tipo.interna?.quantidade) > 0 ? 1 : 0) + Math.min(empresas, EMPRESAS_MAX) + (empresas > EMPRESAS_MAX ? 1 : 0)
}

function pratosFeitosHtml(p) {
  const quantidade = Number(p?.quantidade) || 0
  if (!quantidade) return ''
  const medio = Number(p.valor) > 0 ? `R$ ${moneyFmt(Number(p.valor) / quantidade)}` : '—'
  const aviso = p.sem_preco
    ? `<p class="ct-aviso">${plural(p.sem_preco, 'registro', 'registros')} sem preço unitário: valor não contabilizado.</p>`
    : ''
  return `<div class="table-block"><h3 class="table-title">Pratos feitos<span>${inteiro(quantidade)} · R$ ${moneyFmt(p.valor)}</span></h3><div class="kpi-grid secondary" style="margin-bottom:0">${kpi(inteiro(quantidade), 'Pratos')}${kpi(`R$ ${moneyFmt(p.valor)}`, 'Valor', null, 'gold')}${kpi(medio, 'Preço médio')}</div>${aviso}</div>`
}

export async function renderCantinaHtml(input) {
  const { fazendaNome, logoGestao, logoFazenda } = input
  const brand = { logoGestao, logoFazenda, fazendaNome }
  const itens = (Array.isArray(input.itens) ? input.itens : []).slice().sort((a, b) => (Number(b.valor_estoque) || 0) - (Number(a.valor_estoque) || 0))
  const temPeriodo = input.tem_periodo ?? !!((input.data_inicio ?? input.dataInicio) && (input.data_fim ?? input.dataFim))
  const periodo = periodoTexto(input)
  const titulo = 'Relatório de Cantina'
  const abc = input.abc ?? {}
  const op = input.operacao ?? {}

  const marmitas = marmitasHtml(input.marmitas)
  const pratos = pratosFeitosHtml(input.pratos_feitos)
  const temProntas = !!(marmitas || pratos)
  const prontas = temProntas
    ? `<div class="ct-duo" style="grid-template-columns:${marmitas && pratos ? '1.5fr 1fr' : '1fr'}">${marmitas}${pratos}</div>`
    : ''
  // Com poucos itens para repor e poucas empresas, marmitas e pratos cabem na página 1
  // e o relatório fecha em 2 páginas; senão ganham página própria.
  const naPrimeira = temProntas && Math.min(itensParaRepor(itens).length, REPOR_MAX) <= 5 && linhasDeMarmitas(input.marmitas) <= 5

  const posChunks = itens.length ? chunkArray(itens, POSICAO_ROWS) : []
  const totalPages = 1 + posChunks.length + (temProntas && !naPrimeira ? 1 : 0)

  const pages = []
  let n = 1
  const wrap = (corpo) => pageSection(`${renderHeader({ ...brand, reportTitle: titulo })}${corpo}${footerCantina(periodo, n, totalPages)}`)

  const custoRefeicao = custoPorRefeicao(op)
  const kpis = temPeriodo
    ? [
        kpi(`R$ ${moneyFmt(soma(itens, 'valor_estoque'))}`, 'Valor em estoque', plural(itens.length, 'item', 'itens')),
        kpi(`R$ ${moneyFmt(soma(itens, 'entradas_valor'))}`, 'Compras no período'),
        kpi(`R$ ${moneyFmt(soma(itens, 'baixas_valor'))}`, 'Consumo', null, 'gold'),
        kpi(custoRefeicao == null ? '—' : `R$ ${moneyFmt(custoRefeicao)}`, 'Custo por refeição', `${plural(op.refeicoes_total, 'refeição', 'refeições')}`),
      ].join('')
    : [
        kpi(`R$ ${moneyFmt(soma(itens, 'valor_estoque'))}`, 'Valor em estoque', plural(itens.length, 'item', 'itens')),
        kpi(inteiro(itensParaRepor(itens).length), 'Itens para repor', null, itensParaRepor(itens).length ? 'red' : 'green'),
      ].join('')

  const refeicoes = temPeriodo ? refeicoesHtml(op) : ''
  const centro = refeicoes
    ? `<div class="ct-duo" style="grid-template-columns:1.2fr 1fr">${reporHtml(itens, temPeriodo)}${refeicoes}</div>`
    : reporHtml(itens, temPeriodo)

  pages.push(wrap(`
    <p class="section-kicker">${temPeriodo ? 'Resumo do período' : 'Resumo'}</p>
    <div class="period-badge">${escapeHtml(periodo)}</div>
    <div class="kpi-grid"${temPeriodo ? '' : ' style="grid-template-columns:repeat(2,1fr)"'}>${kpis}</div>
    ${centro}
    ${naPrimeira ? prontas : ''}
  `))

  posChunks.forEach((chunk, idx) => {
    n += 1
    const ultimo = idx === posChunks.length - 1
    pages.push(wrap(`
      <p class="section-kicker">${idx === 0 ? 'Estoque' : 'Estoque (continuação)'}</p>
      ${posicaoTableHtml(chunk, itens.length, temPeriodo, abc, ultimo ? totalRow(itens, temPeriodo) : '')}
      ${ultimo ? '<p class="ct-nota">ABC: A = itens que somam 80% do valor em estoque; B = até 95%; C = o restante. Cobertura = dias de estoque no ritmo de consumo do período.</p>' : ''}
    `))
  })

  if (temProntas && !naPrimeira) {
    n += 1
    pages.push(wrap(`
      <p class="section-kicker">Marmitas e pratos feitos</p>
      ${prontas}
    `))
  }

  return htmlDocument({ title: titulo, extraCss: CANTINA_CSS, body: pages.join('') })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Método não permitido' })
  }
  const body = req.body
  if (!isPDFData(body) || body.itens.length > MAX_ITENS) {
    return res.status(400).json({ error: 'Payload de relatório inválido ou grande demais' })
  }
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) {
    return res.status(413).json({ error: 'Payload do relatório excede o limite permitido' })
  }

  try {
    console.log('[PDF Cantina] Iniciando renderização. Itens:', body.itens.length)
    const html = await renderCantinaHtml(body)
    const pdf = await generatePdf({ html, format: 'A4', landscape: true })
    console.log('[PDF Cantina] PDF gerado. Bytes:', pdf.length)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio-cantina.pdf"')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-PDF-Renderer', 'puppeteer')
    return res.status(200).send(pdf)
  } catch (error) {
    console.error('[PDF Cantina] Erro ao gerar relatório:', error)
    return res.status(500).json({ error: 'Não foi possível gerar o PDF', detail: String(error) })
  }
}
