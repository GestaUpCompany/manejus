// Endpoint fino do relatório de Almoxarifado. Mesmo padrão do cantina.js e do estoque.js: só existe
// aqui o que é específico deste relatório; Chrome, template base e formatadores vêm do _shared/.
//
// Relatório curto, feito para decidir:
//  - Página 1: KPIs (estoque, entradas, consumo líquido, itens para repor), itens para repor e
//    retiradas por responsável.
//  - Posição por item numa tabela só (saldo, mínimo, cobertura, consumo, valor e classe ABC), paginada.
//  - Retiradas por setor e avisos de dados (devoluções em revisão, divergência de saldo), quando houver.
// Não há extrato de movimentações no PDF; o link público traz o extrato completo.
//
// Consumo = retiradas - devoluções aprovadas do período (a RPC já devolve líquido em baixas/baixas_valor).
// No Infográfico Mensal, dataInicio/dataFim (camelCase) chegam no payload e valem quando
// data_inicio/data_fim (snake_case, da RPC) não vêm preenchidos.

import { escapeHtml, dateFmt, moneyFmt } from '../_shared/formatters.js'
import { generatePdf } from '../_shared/puppeteer.js'
import { renderHeader, page as pageSection, htmlDocument, kpi } from '../_shared/template.js'

const MAX_ITENS = 5000
const MAX_BODY_BYTES = 8_000_000

const POSICAO_ROWS = 15
const REPOR_MAX = 8
const GRUPO_MAX = 8

function isPDFData(value) {
  if (!value || typeof value !== 'object') return false
  if (typeof value.fazendaNome !== 'string') return false
  if (!Array.isArray(value.itens)) return false
  return true
}

const ALMOX_CSS = `
.ct-table td,.ct-table th{font-size:11px}
.ct-table th.num,.ct-table td.num{text-align:right}
.ct-duo{display:grid;gap:7mm;align-items:start}
.ct-neg{color:#c94d46;font-weight:700}
.ct-total-row td{background:#f0f6f2;border-top:2px solid #0b6a42;font-weight:700;color:#0b6a42}
.ct-nota{font-size:10px;color:#7a8981;margin:2mm 0 0}
.ct-sub{display:block;font-size:9px;color:#7a8981}
.ct-ok{font-size:12px;color:#0b6a42;background:#f0f6f2;border:1px solid #d3e4d9;border-radius:6px;padding:3mm 4mm;margin:0}
.ct-aviso{font-size:11px;color:#9a6b17;background:#fdf3e3;border:1px solid #eedcae;border-radius:6px;padding:2mm 3mm;margin:2mm 0 0}
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

function footerAlmox(periodo, page, totalPages) {
  return `<footer class="report-footer"><span>Gesta'Up · Almoxarifado · ${escapeHtml(periodo)}</span><span>Página ${page} de ${totalPages}</span></footer>`
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

const inteiro = (v) => (Number(v) || 0).toLocaleString('pt-BR')
const plural = (n, um, varios) => `${inteiro(n)} ${Number(n) === 1 ? um : varios}`

// Unidades contáveis (un, pacote...) saem sem casas decimais, a menos que o valor seja fracionário.
// Medidas contínuas (kg, L) mantêm duas casas. Espelha quantidadeComUnidade() de relatorioCantina/agregacao.ts.
const UNIDADES_CONTINUAS = new Set(['kg', 'g', 'L', 'l', 'ml', 'mL'])
const PLURAL_UNIDADE = { Unidade: 'Unidades', Pacote: 'Pacotes', Caixa: 'Caixas', Saco: 'Sacos', Lata: 'Latas', Garrafa: 'Garrafas', Fardo: 'Fardos', Rolo: 'Rolos', Frasco: 'Frascos' }

const PLURAL_ABREVIADA = { par: 'pares', kit: 'kits' }

function numeroUnidade(v, unidade) {
  const n = Number(v) || 0
  const casas = UNIDADES_CONTINUAS.has(unidade) || !Number.isInteger(n) ? 2 : 0
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

function rotuloUnidade(v, unidade) {
  const u = unidade ?? ''
  // Abreviações (un, m, cx, pct) ficam como estão; "par" e "kit" ganham plural, assim como unidades por extenso.
  if (!u || UNIDADES_CONTINUAS.has(u) || Math.abs(Number(v)) === 1) return u
  if (PLURAL_ABREVIADA[u]) return PLURAL_ABREVIADA[u]
  if (u.length <= 3) return u
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

// Retiradas agrupadas (por responsável ou por setor): quanto saiu, quanto voltou e o líquido.
function retiradasHtml(titulo, grupos, rotuloColuna) {
  const lista = Array.isArray(grupos) ? grupos : []
  const tituloHtml = `<h3 class="table-title">${titulo}<span>${lista.length}</span></h3>`
  if (!lista.length) return `<div class="table-block">${tituloHtml}<p class="ct-ok">Nenhuma retirada no período.</p></div>`
  const linhas = lista.slice(0, GRUPO_MAX).map((g) => {
    const liquidoCls = Number(g.valor_liquido) < 0 ? 'num ct-neg' : 'num'
    return `<tr><td>${escapeHtml(g.nome)}</td><td class="num">${inteiro(g.retiradas)}</td><td class="num">R$ ${moneyFmt(g.valor_retirado)}</td><td class="num">R$ ${moneyFmt(g.valor_devolvido)}</td><td class="${liquidoCls}"><strong>R$ ${moneyFmt(g.valor_liquido)}</strong></td></tr>`
  }).join('')
  const cols = [[rotuloColuna, '32%'], ['Retiradas', '14%', 'num'], ['Retirado', '18%', 'num'], ['Devolvido', '18%', 'num'], ['Líquido', '18%', 'num']]
  const resto = lista.length > GRUPO_MAX ? `<p class="ct-nota">e mais ${plural(lista.length - GRUPO_MAX, 'registro', 'registros')}; veja o link público.</p>` : ''
  return `<div class="table-block">${tituloHtml}<table class="ct-table">${tableHeadHtml(cols)}<tbody>${linhas}</tbody></table>${resto}</div>`
}

function linhaItem(i, temPeriodo, abc) {
  const classe = abc?.[i.id]
  const chip = classe ? `<span class="ct-classe ct-classe-${classe}">${classe}</span>` : '—'
  const saldoCls = i.negativo ? 'num ct-neg' : 'num'
  const periodo = temPeriodo
    ? `<td class="num">${textoCobertura(i)}</td><td class="num">${Number(i.baixas) > 0 ? quantidadeComUnidade(i.baixas, i.unidade) : '—'}</td>`
    : ''
  const categoria = i.classificacao ? `<span class="ct-sub">${escapeHtml(i.classificacao)}</span>` : ''
  return `<tr><td>${escapeHtml(i.nome)}${categoria}</td><td>${chip}</td><td class="${saldoCls}"><strong>${quantidadeComUnidade(i.saldo_final, i.unidade)}</strong></td><td class="num">${i.estoque_minimo > 0 ? numeroUnidade(i.estoque_minimo, i.unidade) : '—'}</td>${periodo}<td class="num"><strong>R$ ${moneyFmt(i.valor_estoque)}</strong></td></tr>`
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

// Avisos de dados que mudam a leitura do relatório (só aparecem quando há o que avisar).
function avisosHtml(input, itens) {
  const q = input.qualidade ?? {}
  const divergencias = itens.filter((i) => i.divergencia != null).length
  const avisos = []
  if (Number(q.devolucoes_em_revisao) > 0) avisos.push(`${plural(q.devolucoes_em_revisao, 'devolução aguarda', 'devoluções aguardam')} revisão: só a quantidade aprovada volta ao estoque.`)
  if (divergencias > 0) avisos.push(`${plural(divergencias, 'item com saldo', 'itens com saldo')} diferente do saldo gravado no cadastro.`)
  const semCusto = itens.filter((i) => i.sem_custo).length
  if (semCusto > 0) avisos.push(`${plural(semCusto, 'item sem', 'itens sem')} custo cadastrado: valor em estoque e consumo ficam subestimados.`)
  if (Number(q.itens_sem_controle) > 0) avisos.push(`${plural(q.itens_sem_controle, 'item movimentado sem', 'itens movimentados sem')} controle de estoque: fora deste relatório.`)
  return avisos.map((a) => `<p class="ct-aviso">${escapeHtml(a)}</p>`).join('')
}

export async function renderAlmoxarifadoHtml(input) {
  const { fazendaNome, logoGestao, logoFazenda } = input
  const brand = { logoGestao, logoFazenda, fazendaNome }
  const itens = (Array.isArray(input.itens) ? input.itens : []).slice().sort((a, b) => (Number(b.valor_estoque) || 0) - (Number(a.valor_estoque) || 0))
  const temPeriodo = input.tem_periodo ?? !!((input.data_inicio ?? input.dataInicio) && (input.data_fim ?? input.dataFim))
  const periodo = periodoTexto(input)
  const titulo = 'Relatório de Almoxarifado'
  const abc = input.abc ?? {}
  const avisos = avisosHtml(input, itens)
  const setores = Array.isArray(input.por_setor) ? input.por_setor : []
  const temExtra = (temPeriodo && setores.length > 0) || !!avisos
  const repor = itensParaRepor(itens).length
  const nResponsaveis = temPeriodo ? Math.min((input.por_responsavel ?? []).length, GRUPO_MAX) : 0
  const nAvisos = (avisos.match(/ct-aviso/g) ?? []).length
  // Com poucas linhas nas tabelas da página 1, setor e avisos sobem para ela e o relatório perde uma página.
  // Orçamento de altura da página 1 (linhas de tabela ~24px, aviso ~32px); acima disso setor e avisos ganham página própria.
  const linhasDuo = Math.max(Math.min(repor, REPOR_MAX), nResponsaveis)
  const extraNaPrimeira = temExtra && 24 * (linhasDuo + Math.min(setores.length, GRUPO_MAX)) + 32 * nAvisos <= 280
  const extraCorpo = `${temPeriodo && setores.length > 0 ? retiradasHtml('Retiradas por setor', setores, 'Setor') : ''}${avisos}`

  const posChunks = itens.length ? chunkArray(itens, POSICAO_ROWS) : []
  const totalPages = 1 + posChunks.length + (temExtra && !extraNaPrimeira ? 1 : 0)

  const pages = []
  let n = 1
  const wrap = (corpo) => pageSection(`${renderHeader({ ...brand, reportTitle: titulo })}${corpo}${footerAlmox(periodo, n, totalPages)}`)

  const consumo = soma(itens, 'baixas_valor')
  const kpis = temPeriodo
    ? [
        kpi(`R$ ${moneyFmt(soma(itens, 'valor_estoque'))}`, 'Valor em estoque', plural(itens.length, 'item', 'itens')),
        kpi(`R$ ${moneyFmt(soma(itens, 'entradas_valor'))}`, 'Entradas no período'),
        kpi(`R$ ${moneyFmt(consumo)}`, 'Consumo', `retiradas R$ ${moneyFmt(soma(itens, 'retiradas_valor'))} · devoluções R$ ${moneyFmt(soma(itens, 'devolucoes_valor'))}`, 'gold'),
        kpi(inteiro(repor), 'Itens para repor', null, repor ? 'red' : 'green'),
      ].join('')
    : [
        kpi(`R$ ${moneyFmt(soma(itens, 'valor_estoque'))}`, 'Valor em estoque', plural(itens.length, 'item', 'itens')),
        kpi(inteiro(repor), 'Itens para repor', null, repor ? 'red' : 'green'),
      ].join('')

  const responsaveis = temPeriodo ? retiradasHtml('Retiradas por responsável', input.por_responsavel, 'Responsável') : ''
  const centro = responsaveis
    ? `<div class="ct-duo" style="grid-template-columns:1fr 1.3fr">${reporHtml(itens, temPeriodo)}${responsaveis}</div>`
    : reporHtml(itens, temPeriodo)

  pages.push(wrap(`
    <p class="section-kicker">${temPeriodo ? 'Resumo do período' : 'Resumo'}</p>
    <div class="period-badge">${escapeHtml(periodo)}</div>
    <div class="kpi-grid"${temPeriodo ? '' : ' style="grid-template-columns:repeat(2,1fr)"'}>${kpis}</div>
    ${centro}
    ${extraNaPrimeira ? extraCorpo : ''}
  `))

  posChunks.forEach((chunk, idx) => {
    n += 1
    const ultimo = idx === posChunks.length - 1
    pages.push(wrap(`
      <p class="section-kicker">${idx === 0 ? 'Estoque' : 'Estoque (continuação)'}</p>
      ${posicaoTableHtml(chunk, itens.length, temPeriodo, abc, ultimo ? totalRow(itens, temPeriodo) : '')}
      ${ultimo ? '<p class="ct-nota">ABC: A = itens que somam 80% do valor em estoque; B = até 95%; C = o restante. Consumo = retiradas menos devoluções aprovadas. Cobertura = dias de estoque no ritmo de consumo do período.</p>' : ''}
    `))
  })

  if (temExtra && !extraNaPrimeira) {
    n += 1
    pages.push(wrap(`
      <p class="section-kicker">Retiradas por setor e avisos</p>
      ${extraCorpo}
    `))
  }

  return htmlDocument({ title: titulo, extraCss: ALMOX_CSS, body: pages.join('') })
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
    console.log('[PDF Almoxarifado] Iniciando renderização. Itens:', body.itens.length)
    const html = await renderAlmoxarifadoHtml(body)
    const pdf = await generatePdf({ html, format: 'A4', landscape: true })
    console.log('[PDF Almoxarifado] PDF gerado. Bytes:', pdf.length)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio-almoxarifado.pdf"')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-PDF-Renderer', 'puppeteer')
    return res.status(200).send(pdf)
  } catch (error) {
    console.error('[PDF Almoxarifado] Erro ao gerar relatório:', error)
    return res.status(500).json({ error: 'Não foi possível gerar o PDF', detail: String(error) })
  }
}
