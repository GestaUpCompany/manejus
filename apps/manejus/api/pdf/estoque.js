// Endpoint fino do relatório de Estoque de Insumos e Formulações. Mesmo padrão
// do rodeio.js e pastagens.js: só existe aqui o que é específico deste
// relatório. Toda a infraestrutura (Chrome, template base, formatadores) vem
// do _shared/.
//
// Dois modos, conforme `tem_periodo` do payload (a RPC só preenche os campos
// de movimento quando há período):
//  - Sem período (links antigos): posição atual, "Estoque em <data>".
//  - Com período: saldo inicial, entradas, saídas, saldo final, cobertura e
//    extrato das movimentações.
//
// Estrutura:
//  - Página 1: KPIs + itens que pedem atenção (mínimo, sem custo, negativos,
//    sem custo).
//  - Posição: fluxo contínuo de linhas (cabeçalho de grupo, itens e total do
//    grupo paginados juntos, sem página quase vazia entre grupos).
//  - Curva ABC por valor em estoque (barras em CSS, sem imagem).
//  - Extrato das movimentações do período, quando houver período.
//
// A curva ABC chega calculada do cliente (`abc`: "item_tipo:nome" -> A|B|C),
// porque as regras vivem em src/features/relatorioEstoque/agregacao.ts.
// No Infográfico Mensal, dataInicio/dataFim (camelCase) valem quando
// data_inicio/data_fim (snake_case, da RPC) não vêm preenchidos.

import { escapeHtml, dateFmt, moneyFmt } from './_shared/formatters.js'
import { generatePdf } from './_shared/puppeteer.js'
import {
  renderHeader,
  page as pageSection,
  htmlDocument,
  kpi,
} from './_shared/template.js'

const MAX_ITENS = 5000
const MAX_MOVIMENTACOES = 5000
const MAX_BODY_BYTES = 8_000_000

const ATENCAO_ROWS = 7
const POSICAO_ROWS = 17
const MOVS_PER_PAGE = 17
const ABC_TOP = 12

const GRUPOS = [
  { key: 'insumo', label: 'Insumos' },
  { key: 'formulacao', label: 'Formulações' },
]

const ORIGEM_ROTULO = {
  entrada_insumos: 'Entrada de insumos',
  saida_insumos: 'Saída de insumos',
  fabrica_confinamento: 'Fábrica',
  suplementacao: 'Suplementação',
  painel_entrada: 'Painel',
  painel_ajuste: 'Painel',
  estoque_inicial: 'Saldo inicial',
}

const TIPO_ROTULO = { entrada: 'Entrada', producao: 'Produção', baixa: 'Baixa', consumo: 'Consumo', ajuste: 'Ajuste' }

function isPDFData(value) {
  if (!value || typeof value !== 'object') return false
  if (typeof value.fazendaNome !== 'string') return false
  if (!Array.isArray(value.itens)) return false
  if (value.movimentacoes != null && !Array.isArray(value.movimentacoes)) return false
  return true
}

const ESTOQUE_CSS = `
.est-table td,.est-table th{font-size:10.5px}
.est-table th.num,.est-table td.num{text-align:right}
.est-neg{color:#c94d46;font-weight:700}
.est-tag{display:inline-block;font-size:9px;font-weight:700;border-radius:4px;padding:1px 6px;margin-left:6px;vertical-align:middle}
.est-tag-min{background:#fdf3e3;color:#9a6b17;border:1px solid #eedcae}
.est-tag-neg{background:#fdf6f5;color:#c94d46;border:1px solid #efd8d6}
.est-grupo-row td{background:#e8f1ec;color:#0b6a42;font-weight:700;text-transform:uppercase;font-size:10px;letter-spacing:.04em}
.est-total-row td{background:#f0f6f2;border-top:2px solid #0b6a42;font-weight:700;color:#0b6a42}
.est-classe{display:inline-block;min-width:16px;text-align:center;font-weight:700;border-radius:3px;padding:0 4px}
.est-classe-A{background:#dff0e6;color:#0b6a42}
.est-classe-B{background:#fdf3e3;color:#9a6b17}
.est-classe-C{background:#eceff1;color:#63736a}
.est-tipo-entrada,.est-tipo-producao{color:#0b6a42;font-weight:700}
.est-tipo-baixa,.est-tipo-consumo{color:#9a6b17;font-weight:700}
.est-tipo-ajuste{color:#4a5a8a;font-weight:700}
.est-nota{font-size:10px;color:#7a8981;margin:2mm 0 0}
.abc-bar-wrap{background:#eef3f0;border-radius:3px;height:9px;width:100%}
.abc-bar{background:#0b6a42;border-radius:3px;height:9px}
`

function pl(n, singular, plural) {
  return n === 1 ? singular : plural
}

function periodoTexto(input) {
  const ini = input.data_inicio ?? input.dataInicio ?? null
  const fim = input.data_fim ?? input.dataFim ?? null
  if (ini && fim) return `${dateFmt(ini)} a ${dateFmt(fim)}`
  if (ini) return `A partir de ${dateFmt(ini)}`
  if (fim) return `Até ${dateFmt(fim)}`
  return 'Todo o histórico'
}

// Rodapé próprio: no snapshot marca a data de geração, com período marca o
// período. Mantém "Página X de Y", que o reportComposer renumera.
function footerEstoque(texto, page, totalPages) {
  return `<footer class="report-footer"><span>Gesta'Up · ${escapeHtml(texto)}</span><span>Página ${page} de ${totalPages}</span></footer>`
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

const soma = (lista, campo) => lista.reduce((s, x) => s + (Number(x[campo]) || 0), 0)
const num = (v) => (v == null ? '—' : moneyFmt(v))
const chave = (i) => `${i.item_tipo}:${i.nome}`

function textoCobertura(item) {
  if (item.cobertura_dias == null) return item.consumo_medio_dia == null ? '—' : 'Sem saldo'
  if (item.cobertura_dias <= 0) return 'Sem saldo'
  if (item.cobertura_dias >= 365) return '> 1 ano'
  return `${Math.round(item.cobertura_dias)} d`
}

function tagsItem(item) {
  return [
    item.em_alerta ? '<span class="est-tag est-tag-min">abaixo do mínimo</span>' : '',
    item.negativo ? '<span class="est-tag est-tag-neg">saldo negativo</span>' : '',
    item.sem_custo ? '<span class="est-tag est-tag-min">sem custo</span>' : '',
  ].join('')
}

function classeHtml(abc, item) {
  const c = abc[chave(item)]
  return c ? `<span class="est-classe est-classe-${c}">${c}</span>` : '—'
}

function linhaItem(item, comPeriodo, abc) {
  const saldo = comPeriodo ? (item.saldo_final ?? item.estoque_atual) : item.estoque_atual
  const saldoCls = item.negativo ? 'num est-neg' : 'num'
  const unidade = ` ${escapeHtml(item.unidade || 'kg')}`
  const nome = `<td>${escapeHtml(item.nome)}${tagsItem(item)}</td><td>${escapeHtml(item.tipo || '—')}</td><td>${classeHtml(abc, item)}</td>`
  const minimo = item.estoque_minimo > 0 ? moneyFmt(item.estoque_minimo) : '—'
  const custo = `<td class="num">${item.sem_custo ? '—' : moneyFmt(item.custo_unitario)}</td><td class="num"><strong>R$ ${moneyFmt(item.valor_estoque)}</strong></td>`
  if (!comPeriodo) {
    return `<tr>${nome}<td class="${saldoCls}">${moneyFmt(saldo)}${unidade}</td><td class="num">${minimo}</td>${custo}</tr>`
  }
  return `<tr>${nome}<td class="num">${num(item.saldo_inicial)}</td><td class="num">${num(item.entradas)}</td><td class="num">${num(item.saidas)}</td><td class="${saldoCls}"><strong>${moneyFmt(saldo)}</strong>${unidade}</td><td class="num">${minimo}</td><td class="num">${textoCobertura(item)}</td>${custo}</tr>`
}

function posicaoColunas(comPeriodo) {
  if (!comPeriodo) {
    return [
      ['Item', '34%'], ['Tipo', '12%'], ['ABC', '5%'], ['Estoque atual', '14%', 'num'],
      ['Mínimo', '9%', 'num'], ['Custo (R$/un.)', '12%', 'num'], ['Valor em estoque', '14%', 'num'],
    ]
  }
  return [
    ['Item', '22%'], ['Tipo', '8%'], ['ABC', '4%'], ['Saldo inicial', '8%', 'num'], ['Entradas', '8%', 'num'],
    ['Saídas', '8%', 'num'], ['Saldo final', '10%', 'num'], ['Mínimo', '7%', 'num'], ['Cobertura', '7%', 'num'],
    ['Custo (R$/un.)', '8%', 'num'], ['Valor em estoque', '10%', 'num'],
  ]
}

// Linhas da posição em fluxo único: cabeçalho de grupo, itens e total do grupo.
function montarLinhasPosicao(grupos, comPeriodo, abc) {
  const colspan = posicaoColunas(comPeriodo).length
  const linhas = []
  for (const g of grupos) {
    linhas.push(`<tr class="est-grupo-row"><td colspan="${colspan}">${escapeHtml(g.label)} · ${g.itens.length} ${pl(g.itens.length, 'item', 'itens')}</td></tr>`)
    g.itens.forEach((item) => linhas.push(linhaItem(item, comPeriodo, abc)))
    const vazios = '<td></td>'.repeat(colspan - 2)
    linhas.push(`<tr class="est-total-row"><td>Valor ${escapeHtml(g.label.toLowerCase())}</td>${vazios}<td class="num">R$ ${moneyFmt(soma(g.itens, 'valor_estoque'))}</td></tr>`)
  }
  return linhas
}

function posicaoTableHtml(linhas, comPeriodo, total) {
  return `<div class="table-block"><h3 class="table-title">Posição de estoque<span>${total} ${pl(total, 'item', 'itens')}</span></h3><table class="est-table">${tableHeadHtml(posicaoColunas(comPeriodo))}<tbody>${linhas.join('')}</tbody></table></div>`
}

function situacaoAtencao(item) {
  const partes = []
  if (item.negativo) partes.push('saldo negativo')
  if (item.em_alerta) partes.push('abaixo do mínimo')
  if (item.sem_custo) partes.push('sem custo')
  return partes.join(' · ')
}

function atencaoTableHtml(itens) {
  const cols = [['Item', '28%'], ['Situação', '34%'], ['Saldo', '14%', 'num'], ['Mínimo', '12%', 'num'], ['A repor', '12%', 'num']]
  const visiveis = itens.slice(0, ATENCAO_ROWS)
  const rows = visiveis.map((i) => {
    const saldo = i.saldo_final ?? i.estoque_atual
    const un = ` ${escapeHtml(i.unidade || 'kg')}`
    return `<tr><td>${escapeHtml(i.nome)}</td><td>${escapeHtml(situacaoAtencao(i))}</td><td class="${i.negativo ? 'num est-neg' : 'num'}">${moneyFmt(saldo)}${un}</td><td class="num">${i.estoque_minimo > 0 ? moneyFmt(i.estoque_minimo) : '—'}</td><td class="num">${(i.falta_para_minimo ?? 0) > 0 ? moneyFmt(i.falta_para_minimo) : '—'}</td></tr>`
  }).join('')
  const resto = itens.length - visiveis.length
  return `<div class="table-block"><h3 class="table-title">Itens que pedem atenção<span>${itens.length} ${pl(itens.length, 'item', 'itens')}</span></h3><table class="est-table">${tableHeadHtml(cols)}<tbody>${rows}</tbody></table>${resto > 0 ? `<p class="est-nota">+ ${resto} ${pl(resto, 'item', 'itens')} nas páginas de posição.</p>` : ''}</div>`
}

function abcHtml(itens, abc) {
  const comValor = itens.filter((i) => i.valor_estoque > 0).sort((a, b) => b.valor_estoque - a.valor_estoque)
  const totalValor = soma(comValor, 'valor_estoque')
  const resumo = ['A', 'B', 'C'].map((c) => {
    const lista = comValor.filter((i) => abc[chave(i)] === c)
    const valor = soma(lista, 'valor_estoque')
    const pct = totalValor > 0 ? (valor / totalValor) * 100 : 0
    return `<tr><td><span class="est-classe est-classe-${c}">${c}</span></td><td class="num">${lista.length}</td><td class="num">R$ ${moneyFmt(valor)}</td><td class="num">${moneyFmt(pct)}%</td></tr>`
  }).join('')
  const topo = comValor.slice(0, ABC_TOP)
  const maximo = topo[0]?.valor_estoque || 1
  const barras = topo.map((i) => {
    const pct = totalValor > 0 ? (i.valor_estoque / totalValor) * 100 : 0
    return `<tr><td>${escapeHtml(i.nome)}</td><td>${classeHtml(abc, i)}</td><td><div class="abc-bar-wrap"><div class="abc-bar" style="width:${Math.max(2, (i.valor_estoque / maximo) * 100).toFixed(1)}%"></div></div></td><td class="num">R$ ${moneyFmt(i.valor_estoque)}</td><td class="num">${moneyFmt(pct)}%</td></tr>`
  }).join('')
  return `
    <div class="table-block"><h3 class="table-title">Resumo por classe<span>${comValor.length} ${pl(comValor.length, 'item', 'itens')} com valor</span></h3>
      <table class="est-table">${tableHeadHtml([['Classe', '14%'], ['Itens', '20%', 'num'], ['Valor em estoque', '36%', 'num'], ['% do valor', '30%', 'num']])}<tbody>${resumo}</tbody></table></div>
    <div class="table-block" style="margin-top:4mm"><h3 class="table-title">Maiores valores em estoque<span>top ${topo.length}</span></h3>
      <table class="est-table">${tableHeadHtml([['Item', '30%'], ['ABC', '6%'], ['Participação', '34%'], ['Valor', '18%', 'num'], ['% do valor', '12%', 'num']])}<tbody>${barras}</tbody></table></div>
    <p class="est-nota">Curva ABC calculada por grupo (insumos e formulações separados): A até 80% do valor acumulado, B até 95%, C o restante. Itens sem saldo positivo ou sem custo ficam fora.</p>`
}

function detalheMov(m) {
  if (m.tipo === 'entrada') return [m.fornecedor, m.nota_fiscal ? `NF ${m.nota_fiscal}` : ''].filter(Boolean).join(' · ')
  return m.observacao || ''
}

function linhaMov(m) {
  const variacao = Number(m.variacao) || 0
  const sinal = variacao > 0 ? '+' : ''
  const varCls = variacao < 0 ? 'num est-neg' : 'num'
  const saldoCls = Number(m.saldo_apos) < 0 ? 'num est-neg' : 'num'
  return `<tr><td>${dateFmt(m.data)}</td><td>${escapeHtml(m.item)}</td><td><span class="est-tipo-${escapeHtml(m.tipo)}">${escapeHtml(TIPO_ROTULO[m.tipo] ?? m.tipo)}</span></td><td>${escapeHtml(ORIGEM_ROTULO[m.origem] ?? m.origem ?? '—')}</td><td>${escapeHtml(detalheMov(m) || '—')}</td><td class="${varCls}">${sinal}${moneyFmt(variacao)} ${escapeHtml(m.unidade || 'kg')}</td><td class="num">${m.custo_unitario == null ? '—' : moneyFmt(m.custo_unitario)}</td><td class="num">${m.valor == null ? '—' : moneyFmt(m.valor)}</td><td class="${saldoCls}">${moneyFmt(m.saldo_apos)}</td></tr>`
}

function extratoTableHtml(movs, total) {
  const cols = [
    ['Data', '8%'], ['Item', '18%'], ['Tipo', '8%'], ['Origem', '12%'], ['Detalhe', '18%'],
    ['Variação', '11%', 'num'], ['R$/un.', '7%', 'num'], ['Valor (R$)', '9%', 'num'], ['Saldo após', '9%', 'num'],
  ]
  return `<div class="table-block"><h3 class="table-title">Extrato de movimentações<span>${total} ${pl(total, 'lançamento', 'lançamentos')}</span></h3><table class="est-table">${tableHeadHtml(cols)}<tbody>${movs.map(linhaMov).join('')}</tbody></table></div>`
}

export async function renderEstoqueHtml(input) {
  const { fazendaNome, logoGestao, logoFazenda, gerado_em } = input
  const brand = { logoGestao, logoFazenda, fazendaNome }
  const titulo = 'Relatório de Estoque'
  const itens = Array.isArray(input.itens) ? input.itens : []
  const movs = Array.isArray(input.movimentacoes) ? input.movimentacoes : []
  const abc = input.abc && typeof input.abc === 'object' ? input.abc : {}
  const comPeriodo = input.tem_periodo === true
  const periodo = periodoTexto(input)
  const rodape = comPeriodo ? `Estoque de insumos · ${periodo}` : `Posição do estoque em ${dateFmt(gerado_em)}`

  const grupos = GRUPOS
    .map((g) => ({ ...g, itens: itens.filter((i) => i.item_tipo === g.key) }))
    .filter((g) => g.itens.length > 0)

  // Gravidade: saldo negativo, abaixo do mínimo, sem custo.
  const gravidade = (i) => (i.negativo ? 0 : i.em_alerta ? 1 : 2)
  const atencao = itens
    .filter((i) => i.negativo || i.em_alerta || i.sem_custo)
    .sort((a, b) => gravidade(a) - gravidade(b))
  const linhasPosicao = montarLinhasPosicao(grupos, comPeriodo, abc)
  const posicaoChunks = linhasPosicao.length ? chunkArray(linhasPosicao, POSICAO_ROWS) : []
  const temAbc = itens.some((i) => i.valor_estoque > 0)
  const movChunks = comPeriodo ? (movs.length ? chunkArray(movs, MOVS_PER_PAGE) : [[]]) : []
  const totalPages = 1 + posicaoChunks.length + (temAbc ? 1 : 0) + movChunks.length

  const valorTotal = soma(itens, 'valor_estoque')
  const semCusto = itens.filter((i) => i.sem_custo).length
  const negativos = itens.filter((i) => i.negativo)
  const abaixo = itens.filter((i) => i.em_alerta).length
  const valorNegativo = soma(negativos, 'valor_negativo')

  const kpisHtml = comPeriodo
    ? `<div class="kpi-grid">
        ${kpi(`R$ ${moneyFmt(valorTotal)}`, 'Valor em estoque', `${itens.length} ${pl(itens.length, 'item', 'itens')}`)}
        ${kpi(`R$ ${moneyFmt(soma(itens, 'entradas_valor'))}`, 'Entradas no período')}
        ${kpi(`R$ ${moneyFmt(soma(itens, 'saidas_valor'))}`, 'Saídas no período', '', 'gold')}
        ${kpi(`${itens.filter((i) => (i.saidas ?? 0) > 0).length}`, 'Itens com saída', 'consumo no período')}
      </div>`
    : `<div class="kpi-grid">
        ${kpi(`R$ ${moneyFmt(valorTotal)}`, 'Valor total em estoque')}
        ${kpi(`${itens.length}`, `${pl(itens.length, 'Item', 'Itens')} em estoque`)}
      </div>`
  const alertasHtml = `<div class="kpi-grid secondary">
      ${kpi(`${abaixo}`, 'Abaixo do mínimo', '', abaixo > 0 ? 'gold' : 'green')}
      ${kpi(`${semCusto}`, 'Sem custo', semCusto > 0 ? 'valor total subestimado' : '', semCusto > 0 ? 'gold' : 'green')}
      ${kpi(`${negativos.length}`, 'Saldos negativos', valorNegativo > 0 ? `R$ ${moneyFmt(valorNegativo)} fora do valor total` : '', negativos.length > 0 ? 'red' : 'green')}
    </div>`

  const pagesHtml = []
  let pageIndex = 1
  pagesHtml.push(
    pageSection(`
      ${renderHeader({ ...brand, reportTitle: titulo })}
      <p class="section-kicker">${comPeriodo ? 'Posição e movimentação' : 'Posição atual'}</p>
      <div class="period-badge">${comPeriodo ? escapeHtml(periodo) : `Estoque em ${dateFmt(gerado_em)}`}</div>
      ${kpisHtml}
      ${alertasHtml}
      ${atencao.length ? atencaoTableHtml(atencao) : '<p class="est-nota">Nenhum item pede atenção: sem saldo negativo, abaixo do mínimo ou sem custo.</p>'}
      ${footerEstoque(rodape, pageIndex, totalPages)}
    `),
  )

  posicaoChunks.forEach((chunk, i) => {
    pageIndex += 1
    pagesHtml.push(
      pageSection(`
        ${renderHeader({ ...brand, reportTitle: titulo })}
        <p class="section-kicker">Posição de estoque${i > 0 ? ' (continuação)' : ''}</p>
        ${posicaoTableHtml(chunk, comPeriodo, itens.length)}
        ${i === posicaoChunks.length - 1 ? `<p class="est-nota">Valor em estoque = saldo ${comPeriodo ? 'final ' : ''}× custo médio atual do item. Saldo negativo vale 0 no valor.${comPeriodo ? ' Saldos reconstruídos pelo histórico de lançamentos do período.' : ''}</p>` : ''}
        ${footerEstoque(rodape, pageIndex, totalPages)}
      `),
    )
  })

  if (temAbc) {
    pageIndex += 1
    pagesHtml.push(
      pageSection(`
        ${renderHeader({ ...brand, reportTitle: titulo })}
        <p class="section-kicker">Curva ABC</p>
        ${abcHtml(itens, abc)}
        ${footerEstoque(rodape, pageIndex, totalPages)}
      `),
    )
  }

  movChunks.forEach((chunk) => {
    pageIndex += 1
    pagesHtml.push(
      pageSection(`
        ${renderHeader({ ...brand, reportTitle: titulo })}
        <p class="section-kicker">Movimentação do período</p>
        ${chunk.length ? extratoTableHtml(chunk, movs.length) : '<p style="font-size:12px;color:#7a8981">Nenhuma movimentação no período.</p>'}
        ${input.movimentacoes_total > movs.length ? `<p class="est-nota">Exibindo ${movs.length} de ${input.movimentacoes_total} lançamentos. O extrato completo está no link público do relatório.</p>` : ''}
        ${footerEstoque(rodape, pageIndex, totalPages)}
      `),
    )
  })

  return htmlDocument({
    title: titulo,
    extraCss: ESTOQUE_CSS,
    body: pagesHtml.join(''),
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Método não permitido' })
  }
  const body = req.body
  if (!isPDFData(body) || body.itens.length > MAX_ITENS || (body.movimentacoes?.length ?? 0) > MAX_MOVIMENTACOES) {
    return res.status(400).json({ error: 'Payload de relatório inválido ou grande demais' })
  }
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) {
    return res.status(413).json({ error: 'Payload do relatório excede o limite permitido' })
  }

  try {
    console.log('[PDF Estoque] Iniciando renderização. Itens:', body.itens.length, 'Movimentações:', body.movimentacoes?.length ?? 0)
    const html = await renderEstoqueHtml(body)
    console.log('[PDF Estoque] HTML montado. Bytes:', Buffer.byteLength(html, 'utf8'))
    const pdf = await generatePdf({ html, format: 'A4', landscape: true })
    console.log('[PDF Estoque] PDF gerado. Bytes:', pdf.length)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio-estoque.pdf"')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-PDF-Renderer', 'puppeteer')
    return res.status(200).send(pdf)
  } catch (error) {
    console.error('[PDF Estoque] Erro ao gerar relatório:', error)
    console.error('[PDF Estoque] Stack:', error?.stack || 'sem stack')
    return res.status(500).json({ error: 'Não foi possível gerar o PDF', detail: String(error) })
  }
}
