// Endpoint fino do relatório de Estoque de Insumos e Formulações. Mesmo padrão
// do rodeio.js e pastagens.js: só existe aqui o que é específico deste
// relatório. Toda a infraestrutura (Chrome, template base, formatadores) vem
// do _shared/.
//
// O relatório é uma ferramenta de decisão, não um extrato: resume o que repor
// agora, o que programar, o que está parado, onde há estoque alto e onde o
// valor se concentra. Não lista lançamentos (o detalhe fica na tela de Estoque).
//
// Falta pesa mais que sobra: repor e programar vêm primeiro; estoque alto é só
// informação (pode ser compra em lote, safra, entressafra); parado é a única
// sobra tratada como atenção. Formulação é produzida, não comprada: a sugestão
// dela é de produção e não entra nos valores em R$.
//
// Dois modos, conforme `tem_periodo` do payload (a RPC só preenche os campos
// de movimento quando há período):
//  - Sem período (links antigos): posição atual, "Estoque em <data>". Só vale
//    "repor" por mínimo/saldo negativo; sem cobertura, programar, parado ou alto.
//  - Com período: saldo final, consumo, cobertura, giro e situação.
//
// Estrutura:
//  - Página 1: resumo executivo (KPIs, situação dos itens, leitura do período).
//  - Decisões: repor agora, programar compra, capital parado e estoque alto,
//    em blocos que dividem a página quando são curtos.
//  - Curva ABC com a explicação de como ler, concentração e consumo por origem.
//  - Posição de estoque (apêndice): fluxo contínuo de linhas por grupo.
//  - Glossário.
//
// As regras (situação, sugestão, ABC, leitura) chegam calculadas do cliente em
// `decisao` e `abc`, porque vivem em src/features/relatorioEstoque/. Este
// arquivo só renderiza. No Infográfico Mensal, dataInicio/dataFim (camelCase)
// valem quando data_inicio/data_fim (snake_case, da RPC) não vêm preenchidos.

import { escapeHtml, dateFmt, moneyFmt } from './_shared/formatters.js'
import { generatePdf } from './_shared/puppeteer.js'
import {
  renderHeader,
  page as pageSection,
  htmlDocument,
  kpi,
} from './_shared/template.js'

const MAX_ITENS = 5000
const MAX_BODY_BYTES = 8_000_000

const POSICAO_ROWS = 17
const ABC_TOP = 10

// Paginação dos blocos de decisão, em px (medidos no A4 paisagem renderizado):
// área útil de ~582 px com folga; cada bloco gasta título + cabeçalho + margens,
// a última fatia ainda leva total e nota. A linha de compra/produção tem duas
// linhas de texto (quantidade + critério), por isso é mais alta.
const PAGINA_CAPACIDADE = 550
const CUSTO_TITULO = 90
const CUSTO_TOTAL_E_NOTA = 55
const PESO_LINHA_COMPRA = 35
const PESO_LINHA_SIMPLES = 25

const GRUPOS = [
  { key: 'insumo', label: 'Insumos' },
  { key: 'formulacao', label: 'Formulações' },
]

const SITUACAO_ROTULO = { ruptura: 'Repor', programar: 'Programar', parado: 'Parado', alto: 'Estoque alto', ok: 'Ok' }

function isPDFData(value) {
  if (!value || typeof value !== 'object') return false
  if (typeof value.fazendaNome !== 'string') return false
  if (!Array.isArray(value.itens)) return false
  if (!value.decisao || typeof value.decisao !== 'object' || !value.decisao.resumo) return false
  return true
}

const ESTOQUE_CSS = `
.est-table td,.est-table th{font-size:10.5px}
.est-table th.num,.est-table td.num{text-align:right}
.est-neg{color:#c94d46;font-weight:700}
.est-tag{display:inline-block;font-size:9px;font-weight:700;border-radius:4px;padding:1px 6px;margin-left:6px;vertical-align:middle}
.est-tag-min{background:#fdf3e3;color:#9a6b17;border:1px solid #eedcae}
.est-tag-neg{background:#fdf6f5;color:#c94d46;border:1px solid #efd8d6}
.est-tag-info{background:#eef2fa;color:#4a5a8a;border:1px solid #d5ddef}
.est-grupo-row td{background:#e8f1ec;color:#0b6a42;font-weight:700;text-transform:uppercase;font-size:10px;letter-spacing:.04em}
.est-total-row td{background:#f0f6f2;border-top:2px solid #0b6a42;font-weight:700;color:#0b6a42}
.est-classe{display:inline-block;min-width:16px;text-align:center;font-weight:700;border-radius:3px;padding:0 4px}
.est-classe-A{background:#dff0e6;color:#0b6a42}
.est-classe-B{background:#fdf3e3;color:#9a6b17}
.est-classe-C{background:#eceff1;color:#63736a}
.est-sit{display:inline-block;font-size:9px;font-weight:700;border-radius:4px;padding:1px 6px;white-space:nowrap}
.est-sit-ruptura{background:#fdf6f5;color:#c94d46;border:1px solid #efd8d6}
.est-sit-programar,.est-sit-parado{background:#fdf3e3;color:#9a6b17;border:1px solid #eedcae}
.est-sit-alto{background:#eceff1;color:#52635a;border:1px solid #d9dfdc}
.est-sit-ok{background:#eef6f1;color:#0b6a42;border:1px solid #d3e4d9}
.est-sub{display:block;font-size:9px;font-weight:400;color:#7a8981;margin-top:1px}
.est-nota{font-size:10px;color:#7a8981;margin:2mm 0 0}
.est-leitura{margin:0;padding-left:16px}
.est-leitura li{margin-bottom:2px;font-size:12px}
.est-cols{display:grid;grid-template-columns:1fr 1.25fr;gap:6mm;align-items:start}
.est-como{border-left:3px solid #c28a27;background:#fdf8ec;border-radius:0 5px 5px 0;padding:7px 10px;line-height:1.45;color:#52635a;font-size:10.5px}
.est-como strong{color:#9a6b17}
.est-gloss{display:grid;grid-template-columns:1fr 1fr;gap:4mm 8mm}
.est-gloss div{font-size:11px;line-height:1.45;color:#52635a}
.est-gloss strong{display:block;color:#0b6a42;font-size:11.5px;margin-bottom:1px}
.est-kpi5{grid-template-columns:repeat(5,1fr)}
.kpi-card.tone-gray{border-top-color:#9aa6a0}
.abc-bar-wrap{background:#eef3f0;border-radius:3px;height:9px;width:100%}
.abc-bar{background:#0b6a42;border-radius:3px;height:9px}
.abc-bar-o{background:#c28a27}
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
const reais = (v) => `R$ ${moneyFmt(v)}`
const pct = (v) => `${moneyFmt(v)}%`
const chave = (i) => `${i.item_tipo}:${i.nome}`
const saldoDe = (i) => i.saldo_final ?? i.estoque_atual
const unidadeDe = (i) => escapeHtml(i.unidade || 'kg')

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

function situacaoHtml(situacoes, item) {
  const s = situacoes[chave(item)] ?? 'ok'
  return `<span class="est-sit est-sit-${s}">${SITUACAO_ROTULO[s] ?? s}</span>`
}

function motivoRepor(item, lim) {
  if (item.negativo) return 'Saldo negativo'
  if (item.em_alerta) return 'Abaixo do mínimo'
  return `Cobertura de ${Math.round(item.cobertura_dias)} d (meta de ${lim.alvo} d)`
}

// ---------- Posição (apêndice) ----------

function linhaItem(item, comPeriodo, abc, situacoes) {
  const saldo = comPeriodo ? saldoDe(item) : item.estoque_atual
  const saldoCls = item.negativo ? 'num est-neg' : 'num'
  const nome = `<td>${escapeHtml(item.nome)}${tagsItem(item)}</td><td>${escapeHtml(item.tipo || '—')}</td><td>${classeHtml(abc, item)}</td><td>${situacaoHtml(situacoes, item)}</td>`
  const minimo = item.estoque_minimo > 0 ? moneyFmt(item.estoque_minimo) : '—'
  const custo = `<td class="num">${item.sem_custo ? '—' : moneyFmt(item.custo_unitario)}</td><td class="num"><strong>${reais(item.valor_estoque)}</strong></td>`
  if (!comPeriodo) {
    return `<tr>${nome}<td class="${saldoCls}">${moneyFmt(saldo)} ${unidadeDe(item)}</td><td class="num">${minimo}</td>${custo}</tr>`
  }
  return `<tr>${nome}<td class="num">${num(item.entradas)}</td><td class="num">${num(item.saidas)}</td><td class="${saldoCls}"><strong>${moneyFmt(saldo)}</strong> ${unidadeDe(item)}</td><td class="num">${minimo}</td><td class="num">${textoCobertura(item)}</td>${custo}</tr>`
}

function posicaoColunas(comPeriodo) {
  if (!comPeriodo) {
    return [
      ['Item', '28%'], ['Tipo', '11%'], ['ABC', '5%'], ['Situação', '11%'], ['Estoque atual', '13%', 'num'],
      ['Mínimo', '8%', 'num'], ['Custo (R$/un.)', '10%', 'num'], ['Valor em estoque', '14%', 'num'],
    ]
  }
  return [
    ['Item', '20%'], ['Tipo', '8%'], ['ABC', '4%'], ['Situação', '10%'], ['Entradas', '8%', 'num'],
    ['Saídas', '8%', 'num'], ['Saldo final', '10%', 'num'], ['Mínimo', '7%', 'num'], ['Cobertura', '7%', 'num'],
    ['Custo (R$/un.)', '8%', 'num'], ['Valor em estoque', '10%', 'num'],
  ]
}

// Linhas da posição em fluxo único: cabeçalho de grupo, itens e total do grupo.
function montarLinhasPosicao(grupos, comPeriodo, abc, situacoes) {
  const colspan = posicaoColunas(comPeriodo).length
  const linhas = []
  for (const g of grupos) {
    linhas.push(`<tr class="est-grupo-row"><td colspan="${colspan}">${escapeHtml(g.label)} · ${g.itens.length} ${pl(g.itens.length, 'item', 'itens')}</td></tr>`)
    g.itens.forEach((item) => linhas.push(linhaItem(item, comPeriodo, abc, situacoes)))
    const vazios = '<td></td>'.repeat(colspan - 2)
    linhas.push(`<tr class="est-total-row"><td>Valor ${escapeHtml(g.label.toLowerCase())}</td>${vazios}<td class="num">${reais(soma(g.itens, 'valor_estoque'))}</td></tr>`)
  }
  return linhas
}

function posicaoTableHtml(linhas, comPeriodo, total) {
  return `<div class="table-block"><h3 class="table-title">Posição de estoque<span>${total} ${pl(total, 'item', 'itens')}</span></h3><table class="est-table">${tableHeadHtml(posicaoColunas(comPeriodo))}<tbody>${linhas.join('')}</tbody></table></div>`
}

// ---------- Blocos de decisão ----------

// O que a compra (ou a produção) cobre: o estoque mínimo ou os dias de consumo alvo.
function criterioCompra(item, sugestao, lim) {
  if (!sugestao.criterio) return ''
  const verbo = sugestao.acao === 'producao' ? 'produzir ' : ''
  if (sugestao.criterio === 'cobertura') return `${verbo}para ${lim.alvo} dias de consumo`
  const apos = sugestao.coberturaApos != null ? ` · cobre ${Math.round(sugestao.coberturaApos)} d` : ''
  return `${verbo}para o mínimo (${moneyFmt(item.estoque_minimo)} ${item.unidade || 'kg'})${apos}`
}

function nomeComTipo(item) {
  return `${escapeHtml(item.nome)}${item.item_tipo === 'formulacao' ? '<span class="est-tag est-tag-info">formulação</span>' : ''}`
}

// Tabela de "repor agora" e "programar compra": mesma forma, só muda o título.
function sugestaoTableHtml({ titulo, linhas, ultima, comPeriodo, lim, totalItens, totalValor }) {
  const temProducao = linhas.some((l) => l.sugestao.acao === 'producao')
  const colCompra = temProducao ? 'Compra ou produção' : 'Compra sugerida'
  const cols = comPeriodo
    ? [['Item', '20%'], ['Motivo', '17%'], ['Saldo', '10%', 'num'], ['Consumo/dia', '9%', 'num'], ['Cobertura', '8%', 'num'], ['Esgota em', '9%'], [colCompra, '18%', 'num'], ['Valor estimado', '9%', 'num']]
    : [['Item', '26%'], ['Motivo', '22%'], ['Saldo', '13%', 'num'], ['Mínimo', '11%', 'num'], [colCompra, '17%', 'num'], ['Valor estimado', '11%', 'num']]
  const rows = linhas.map(({ item, sugestao }) => {
    const un = unidadeDe(item)
    const saldo = `<td class="${item.negativo ? 'num est-neg' : 'num'}">${moneyFmt(saldoDe(item))} ${un}</td>`
    const criterio = criterioCompra(item, sugestao, lim)
    const compra = `<td class="num"><strong>${sugestao.quantidade > 0 ? `${moneyFmt(sugestao.quantidade)} ${un}` : '—'}</strong>${criterio ? `<span class="est-sub">${escapeHtml(criterio)}</span>` : ''}</td><td class="num">${item.sem_custo || sugestao.valor <= 0 ? '—' : reais(sugestao.valor)}</td>`
    if (!comPeriodo) {
      return `<tr><td>${nomeComTipo(item)}</td><td>${escapeHtml(motivoRepor(item, lim))}</td>${saldo}<td class="num">${item.estoque_minimo > 0 ? moneyFmt(item.estoque_minimo) : '—'}</td>${compra}</tr>`
    }
    return `<tr><td>${nomeComTipo(item)}</td><td>${escapeHtml(motivoRepor(item, lim))}</td>${saldo}<td class="num">${num(item.consumo_medio_dia)}</td><td class="num">${textoCobertura(item)}</td><td>${item.data_esgotamento ? dateFmt(item.data_esgotamento) : '—'}</td>${compra}</tr>`
  }).join('')
  const vazios = '<td></td>'.repeat(cols.length - 2)
  const total = ultima ? `<tr class="est-total-row"><td>Compra estimada de insumos</td>${vazios}<td class="num">${reais(totalValor)}</td></tr>` : ''
  return `<div class="table-block"><h3 class="table-title">${escapeHtml(titulo)}<span>${totalItens} ${pl(totalItens, 'item', 'itens')}</span></h3><table class="est-table">${tableHeadHtml(cols)}<tbody>${rows}${total}</tbody></table></div>`
}

// Tabela de capital parado e de estoque alto: mesma forma, só muda o título.
function capitalTableHtml({ titulo, linhas, ultima, totalItens, totalValor, valorEstoque, situacoes }) {
  const cols = [['Item', '28%'], ['Situação', '12%'], ['Saldo', '15%', 'num'], ['Cobertura', '12%', 'num'], ['Valor em estoque', '17%', 'num'], ['% do estoque total', '16%', 'num']]
  const rows = linhas.map((item) => `<tr><td>${nomeComTipo(item)}</td><td>${situacaoHtml(situacoes, item)}</td><td class="num">${moneyFmt(saldoDe(item))} ${unidadeDe(item)}</td><td class="num">${textoCobertura(item)}</td><td class="num"><strong>${reais(item.valor_estoque)}</strong></td><td class="num">${valorEstoque > 0 ? pct((item.valor_estoque / valorEstoque) * 100) : '—'}</td></tr>`).join('')
  const total = ultima ? `<tr class="est-total-row"><td>Total (${totalItens} ${pl(totalItens, 'item', 'itens')})</td>${'<td></td>'.repeat(3)}<td class="num">${reais(totalValor)}</td><td class="num">${valorEstoque > 0 ? pct((totalValor / valorEstoque) * 100) : '—'}</td></tr>` : ''
  return `<div class="table-block"><h3 class="table-title">${escapeHtml(titulo)}<span>${totalItens} ${pl(totalItens, 'item', 'itens')}</span></h3><table class="est-table">${tableHeadHtml(cols)}<tbody>${rows}${total}</tbody></table></div>`
}

// Distribui os blocos em páginas por "peso": blocos curtos dividem a página,
// blocos longos continuam na seguinte. Cada fatia leva título; só a última leva total e nota.
function paginarBlocos(blocos) {
  const paginas = [[]]
  let sobra = PAGINA_CAPACIDADE
  for (const bloco of blocos) {
    let i = 0
    let parte = 0
    while (i < bloco.linhas.length) {
      const minimo = CUSTO_TITULO + bloco.peso * 2
      if (sobra < minimo && paginas[paginas.length - 1].length > 0) {
        paginas.push([])
        sobra = PAGINA_CAPACIDADE
      }
      const maxLinhas = Math.max(1, Math.floor((sobra - CUSTO_TITULO) / bloco.peso))
      let fatia = bloco.linhas.slice(i, i + maxLinhas)
      // Se a última fatia não comporta total e nota, vira a página seguinte sem perder linhas.
      let ultima = i + fatia.length >= bloco.linhas.length
      if (ultima && CUSTO_TITULO + fatia.length * bloco.peso + CUSTO_TOTAL_E_NOTA > sobra && fatia.length > 1) {
        fatia = fatia.slice(0, fatia.length - 1)
        ultima = false
      }
      paginas[paginas.length - 1].push({ bloco, fatia, ultima, continuacao: parte > 0 })
      sobra -= CUSTO_TITULO + fatia.length * bloco.peso + (ultima ? CUSTO_TOTAL_E_NOTA : 0)
      i += fatia.length
      parte += 1
      if (i < bloco.linhas.length) {
        paginas.push([])
        sobra = PAGINA_CAPACIDADE
      }
    }
  }
  return paginas.filter((p) => p.length > 0)
}

// ---------- Curva ABC ----------

function abcHtml(itens, abc, decisao, comPeriodo) {
  const comValor = itens.filter((i) => i.valor_estoque > 0).sort((a, b) => b.valor_estoque - a.valor_estoque)
  const totalValor = soma(comValor, 'valor_estoque')
  const resumo = ['A', 'B', 'C'].map((c) => {
    const lista = comValor.filter((i) => abc[chave(i)] === c)
    const valor = soma(lista, 'valor_estoque')
    const p = totalValor > 0 ? (valor / totalValor) * 100 : 0
    return `<tr><td><span class="est-classe est-classe-${c}">${c}</span></td><td class="num">${lista.length}</td><td class="num">${reais(valor)}</td><td class="num">${pct(p)}</td></tr>`
  }).join('')
  const topo = comValor.slice(0, ABC_TOP)
  const maximo = topo[0]?.valor_estoque || 1
  const barras = topo.map((i) => {
    const p = totalValor > 0 ? (i.valor_estoque / totalValor) * 100 : 0
    return `<tr><td>${escapeHtml(i.nome)}</td><td>${classeHtml(abc, i)}</td><td><div class="abc-bar-wrap"><div class="abc-bar" style="width:${Math.max(2, (i.valor_estoque / maximo) * 100).toFixed(1)}%"></div></div></td><td class="num">${reais(i.valor_estoque)}</td><td class="num">${pct(p)}</td></tr>`
  }).join('')
  const conc = decisao.concentracao
  const concTexto = conc.itensComValor > 0
    ? `<p class="est-nota" style="margin-top:3mm;font-size:11px;color:#30463a"><strong>${conc.itensA} de ${conc.itensComValor} ${pl(conc.itensComValor, 'item', 'itens')} (${pct(conc.pctItensA)})</strong> formam a classe A e concentram <strong>${pct(conc.pctValorA)}</strong> do valor em estoque: é onde vale concentrar o controle e a negociação.</p>`
    : ''
  // Com uma única origem a divisão não informa nada: só mostra a partir de duas.
  const todasOrigens = comPeriodo ? (decisao.resumo.consumoPorOrigem ?? []) : []
  const origens = todasOrigens.length > 1 ? todasOrigens : []
  const totalOrigem = origens.reduce((s, o) => s + o.valor, 0)
  const maxOrigem = origens[0]?.valor || 1
  const origemHtml = origens.length
    ? `<div class="table-block" style="margin-top:4mm"><h3 class="table-title">Para onde foi o consumo do período<span>${reais(totalOrigem)}</span></h3>
        <table class="est-table">${tableHeadHtml([['Origem', '28%'], ['Participação', '40%'], ['Valor', '18%', 'num'], ['% do consumo', '14%', 'num']])}<tbody>${origens.slice(0, 5).map((o) => `<tr><td>${escapeHtml(o.rotulo)}</td><td><div class="abc-bar-wrap"><div class="abc-bar abc-bar-o" style="width:${Math.max(2, (o.valor / maxOrigem) * 100).toFixed(1)}%"></div></div></td><td class="num">${reais(o.valor)}</td><td class="num">${totalOrigem > 0 ? pct((o.valor / totalOrigem) * 100) : '—'}</td></tr>`).join('')}</tbody></table></div>`
    : ''
  return `
    <div class="est-cols">
      <div>
        <div class="table-block"><h3 class="table-title">Resumo por classe<span>${comValor.length} ${pl(comValor.length, 'item', 'itens')} com valor</span></h3>
          <table class="est-table">${tableHeadHtml([['Classe', '14%'], ['Itens', '18%', 'num'], ['Valor em estoque', '40%', 'num'], ['% do valor', '28%', 'num']])}<tbody>${resumo}</tbody></table></div>
        <div class="est-como"><strong>Como ler a curva ABC.</strong> Ordena os itens do maior para o menor valor em estoque e soma o valor acumulado. <strong>A</strong>: os itens que somam até 80% do valor (poucos itens, muito dinheiro: controle de perto). <strong>B</strong>: de 80% a 95%. <strong>C</strong>: os 5% finais (muitos itens, pouco valor: controle simples). Calculada separadamente para insumos e formulações; itens sem saldo positivo ou sem custo ficam fora.</div>
        ${concTexto}
      </div>
      <div class="table-block"><h3 class="table-title">Maiores valores em estoque<span>top ${topo.length}</span></h3>
        <table class="est-table">${tableHeadHtml([['Item', '31%'], ['ABC', '7%'], ['Participação', '30%'], ['Valor', '20%', 'num'], ['% do valor', '12%', 'num']])}<tbody>${barras}</tbody></table></div>
    </div>
    ${origemHtml}`
}

// ---------- Glossário ----------

function glossarioHtml(comPeriodo, lim) {
  const itens = [
    ['Repor', `Saldo negativo, abaixo do estoque mínimo cadastrado${comPeriodo ? ` ou cobertura menor que ${lim.ruptura} dias` : ''}. O item corre risco de faltar.`],
    ...(comPeriodo ? [
      ['Programar', `Cobertura entre ${lim.ruptura} e ${lim.alvo} dias: ainda sem risco imediato, mas abaixo da meta de ${lim.alvo} dias. Entra na próxima compra, considerando o prazo de entrega.`],
      ['Parado', 'Tem saldo e valor em estoque, mas nenhuma saída no período. É dinheiro sem giro e vale conferir o motivo.'],
      ['Estoque alto', `Cobertura acima de ${lim.alta} dias no ritmo do período. Informação, não alarme: compra em lote, safra e entressafra justificam estoque maior. Serve para conferir se é intencional.`],
      ['Cobertura', 'Quantos dias o saldo final do item dura no consumo médio diário do período (saldo ÷ consumo por dia). É calculada por item: não existe uma cobertura única do estoque, porque cada item gira num ritmo.'],
      ['Giro', 'Consumo do período em R$ ÷ valor médio em estoque. Quanto maior, menos tempo o dinheiro fica parado.'],
      ['Compra sugerida', `Quantidade que leva o item ao maior entre o estoque mínimo e ${lim.alvo} dias de consumo no ritmo do período. Abaixo de cada quantidade, o relatório diz qual critério a definiu e, quando é o mínimo, quantos dias a compra cobre.`],
      ['Produção (formulações)', 'Formulação é produzida na fábrica, não comprada. A quantidade é de produção e não entra nos valores em R$ de compra.'],
      ['Variação do valor', 'Compara o valor atual com o do início do período, que é aproximado: saldo inicial × custo médio atual.'],
    ] : [
      ['Compra sugerida', 'Quantidade necessária para chegar ao estoque mínimo cadastrado.'],
    ]),
    ['Curva ABC', 'Classifica os itens pelo valor em estoque acumulado: A até 80%, B até 95%, C o restante. Itens sem saldo positivo ou sem custo ficam fora.'],
    ['Valor em estoque', `Saldo ${comPeriodo ? 'final ' : ''}× custo médio atual do item. Saldo negativo vale 0 e item sem custo vale 0, o que subestima o total.`],
  ]
  return `<div class="table-block"><h3 class="table-title">Como ler este relatório</h3><div class="est-gloss">${itens.map(([t, d]) => `<div><strong>${escapeHtml(t)}</strong>${escapeHtml(d)}</div>`).join('')}</div></div>`
}

export async function renderEstoqueHtml(input) {
  const { fazendaNome, logoGestao, logoFazenda, gerado_em } = input
  const brand = { logoGestao, logoFazenda, fazendaNome }
  const titulo = 'Relatório de Estoque'
  const itens = Array.isArray(input.itens) ? input.itens : []
  const abc = input.abc && typeof input.abc === 'object' ? input.abc : {}
  const decisao = input.decisao
  const resumo = decisao.resumo
  const lim = decisao.limites ?? { ruptura: 15, alvo: 30, alta: 90 }
  const situacoes = decisao.situacoes ?? {}
  const comPeriodo = input.tem_periodo === true
  const periodo = periodoTexto(input)
  const rodape = comPeriodo ? `Estoque de insumos · ${periodo}` : `Posição do estoque em ${dateFmt(gerado_em)}`

  const porChave = new Map(itens.map((i) => [chave(i), i]))
  const grupos = GRUPOS
    .map((g) => ({ ...g, itens: itens.filter((i) => i.item_tipo === g.key) }))
    .filter((g) => g.itens.length > 0)

  const comItem = (lista) => (lista ?? [])
    .map((r) => ({ item: porChave.get(r.chave), sugestao: r }))
    .filter((r) => r.item)
  const repor = comItem(decisao.repor)
  const programar = comItem(decisao.programar)
  const parados = (decisao.parados ?? []).map((k) => porChave.get(k)).filter(Boolean)
  const altos = (decisao.altos ?? []).map((k) => porChave.get(k)).filter(Boolean)
  const valorDe = (lista) => lista.reduce((s, r) => s + r.sugestao.valor, 0)

  const notaCompra = (comPeriodo, temProducao) => `Compra sugerida = ${comPeriodo ? `a quantidade que leva o item ao maior entre o estoque mínimo e ${lim.alvo} dias de consumo no ritmo do período; abaixo de cada quantidade está o critério que a definiu` : 'a quantidade necessária para chegar ao estoque mínimo cadastrado'}.${temProducao ? ' Formulações são produzidas: a quantidade é de produção e não entra nos valores em R$.' : ''} Ordenado do mais urgente ao menos urgente.`
  const blocos = [
    repor.length > 0 && {
      chave: 'repor', titulo: 'Repor agora', linhas: repor, peso: PESO_LINHA_COMPRA,
      render: (b) => sugestaoTableHtml({ titulo: b.continuacao ? 'Repor agora (continuação)' : 'Repor agora', linhas: b.fatia, ultima: b.ultima, comPeriodo, lim, totalItens: repor.length, totalValor: valorDe(repor) }),
      nota: notaCompra(comPeriodo, repor.some((r) => r.sugestao.acao === 'producao')),
    },
    comPeriodo && programar.length > 0 && {
      chave: 'programar', titulo: 'Programar compra', linhas: programar, peso: PESO_LINHA_COMPRA,
      render: (b) => sugestaoTableHtml({ titulo: b.continuacao ? 'Programar compra (continuação)' : 'Programar compra', linhas: b.fatia, ultima: b.ultima, comPeriodo, lim, totalItens: programar.length, totalValor: valorDe(programar) }),
      nota: `Itens com cobertura entre ${lim.ruptura} e ${lim.alvo} dias: ainda sem risco imediato, mas abaixo da meta de ${lim.alvo} dias. Programe a compra considerando o prazo de entrega do fornecedor.`,
    },
    comPeriodo && parados.length > 0 && {
      chave: 'parados', titulo: 'Capital parado', linhas: parados, peso: PESO_LINHA_SIMPLES,
      render: (b) => capitalTableHtml({ titulo: b.continuacao ? 'Capital parado (continuação)' : 'Capital parado', linhas: b.fatia, ultima: b.ultima, totalItens: parados.length, totalValor: soma(parados, 'valor_estoque'), valorEstoque: resumo.valorEstoque, situacoes }),
      nota: 'Parado: tem saldo e valor, mas não teve nenhuma saída no período. Vale conferir o motivo: item abandonado, comprado a mais ou sazonal.',
    },
    comPeriodo && altos.length > 0 && {
      chave: 'altos', titulo: 'Estoque alto', linhas: altos, peso: PESO_LINHA_SIMPLES,
      render: (b) => capitalTableHtml({ titulo: b.continuacao ? 'Estoque alto, informativo (continuação)' : 'Estoque alto (informativo)', linhas: b.fatia, ultima: b.ultima, totalItens: altos.length, totalValor: soma(altos, 'valor_estoque'), valorEstoque: resumo.valorEstoque, situacoes }),
      nota: `Cobertura acima de ${lim.alta} dias. Não é necessariamente um problema: compra em lote, safra e entressafra justificam estoque maior. Serve para conferir se é intencional.`,
    },
  ].filter(Boolean)
  const paginasDecisao = paginarBlocos(blocos)

  const linhasPosicao = montarLinhasPosicao(grupos, comPeriodo, abc, situacoes)
  const posicaoChunks = linhasPosicao.length ? chunkArray(linhasPosicao, POSICAO_ROWS) : []
  const temAbc = itens.some((i) => i.valor_estoque > 0)
  const totalPages = 1 + paginasDecisao.length + (temAbc ? 1 : 0) + posicaoChunks.length + 1

  const { contagem, capital } = resumo
  const variacao = resumo.variacaoPct != null
    ? `${resumo.variacaoPct >= 0 ? '+' : ''}${moneyFmt(resumo.variacaoPct)}% vs início (aprox.)`
    : ''
  const subReposicao = `${contagem.ruptura} ${pl(contagem.ruptura, 'item a repor', 'itens a repor')}${resumo.programarValor > 0 ? ` · +${reais(resumo.programarValor)} a programar` : ''}`
  const kpisHtml = comPeriodo
    ? `<div class="kpi-grid">
        ${kpi(reais(resumo.valorEstoque), 'Valor em estoque', variacao)}
        ${kpi(reais(resumo.consumoValor ?? 0), 'Consumo no período', resumo.consumoDiaValor != null ? `${reais(resumo.consumoDiaValor)} por dia${resumo.giro != null ? ` · giro ${moneyFmt(resumo.giro)}×` : ''}` : '')}
        ${kpi(reais(resumo.reposicaoValor), 'Reposição estimada', subReposicao, contagem.ruptura > 0 ? 'red' : 'green')}
        ${kpi(reais(capital.parado), 'Capital parado', `${pct(resumo.pctParado)} do valor em estoque`, capital.parado > 0 ? 'gold' : 'green')}
      </div>`
    : `<div class="kpi-grid">
        ${kpi(reais(resumo.valorEstoque), 'Valor total em estoque', `${itens.length} ${pl(itens.length, 'item', 'itens')}`)}
        ${kpi(`${contagem.ruptura}`, 'Itens a repor', 'abaixo do mínimo ou negativos', contagem.ruptura > 0 ? 'red' : 'green')}
        ${kpi(`${resumo.semCusto}`, 'Sem custo', resumo.semCusto > 0 ? 'valor total subestimado' : '', resumo.semCusto > 0 ? 'gold' : 'green')}
        ${kpi(`${resumo.negativos}`, 'Saldos negativos', '', resumo.negativos > 0 ? 'red' : 'green')}
      </div>`
  const situacaoCards = comPeriodo
    ? `<div class="kpi-grid est-kpi5">
        ${kpi(`${contagem.ruptura}`, 'Repor', `cobertura < ${lim.ruptura} d, abaixo do mínimo ou negativo`, contagem.ruptura > 0 ? 'red' : 'green')}
        ${kpi(`${contagem.programar}`, 'Programar', `cobertura de ${lim.ruptura} a ${lim.alvo} d`, contagem.programar > 0 ? 'gold' : 'green')}
        ${kpi(`${contagem.parado}`, 'Parados', `${reais(capital.parado)} sem saída no período`, contagem.parado > 0 ? 'gold' : 'green')}
        ${kpi(`${contagem.alto}`, 'Estoque alto', `${reais(capital.alto)} · cobertura > ${lim.alta} d (informativo)`, 'gray')}
        ${kpi(`${contagem.ok}`, 'Em ordem', `${reais(capital.ok)} em estoque`)}
      </div>`
    : ''
  const qualidade = [
    resumo.semCusto > 0 && comPeriodo ? `${resumo.semCusto} ${pl(resumo.semCusto, 'item sem custo cadastrado', 'itens sem custo cadastrado')} (o valor total está subestimado)` : '',
    resumo.negativos > 0 && comPeriodo ? `${resumo.negativos} ${pl(resumo.negativos, 'saldo negativo', 'saldos negativos')} (falta lançar entrada ou ajuste)` : '',
    resumo.comAjuste > 0 ? `${resumo.comAjuste} ${pl(resumo.comAjuste, 'item teve', 'itens tiveram')} ajuste manual de saldo no período` : '',
  ].filter(Boolean)
  const leituraHtml = `<div class="insight-box"><span class="insight-label">${comPeriodo ? 'Leitura do período' : 'Leitura da posição'}</span><ul class="est-leitura">${(decisao.leitura ?? []).map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>${qualidade.length ? `<p class="est-nota" style="margin-top:3mm">Qualidade dos dados: ${escapeHtml(qualidade.join(' · '))}.</p>` : ''}</div>`

  const pagesHtml = []
  let pageIndex = 1
  pagesHtml.push(
    pageSection(`
      ${renderHeader({ ...brand, reportTitle: titulo })}
      <p class="section-kicker">${comPeriodo ? 'Resumo executivo' : 'Posição atual'}</p>
      <div class="period-badge">${comPeriodo ? escapeHtml(periodo) : `Estoque em ${dateFmt(gerado_em)}`}</div>
      ${kpisHtml}
      ${situacaoCards}
      ${leituraHtml}
      ${footerEstoque(rodape, pageIndex, totalPages)}
    `),
  )

  paginasDecisao.forEach((pagina, idx) => {
    pageIndex += 1
    const kicker = idx === 0 ? 'Decisões: o que fazer com cada item' : 'Decisões (continuação)'
    const corpo = pagina.map((parte) => `<div style="margin-bottom:4mm">${parte.bloco.render({ fatia: parte.fatia, ultima: parte.ultima, continuacao: parte.continuacao })}${parte.ultima ? `<p class="est-nota">${escapeHtml(parte.bloco.nota)}</p>` : ''}</div>`).join('')
    pagesHtml.push(
      pageSection(`
        ${renderHeader({ ...brand, reportTitle: titulo })}
        <p class="section-kicker">${kicker}</p>
        ${corpo}
        ${footerEstoque(rodape, pageIndex, totalPages)}
      `),
    )
  })

  if (temAbc) {
    pageIndex += 1
    pagesHtml.push(
      pageSection(`
        ${renderHeader({ ...brand, reportTitle: titulo })}
        <p class="section-kicker">Curva ABC e concentração do valor</p>
        ${abcHtml(itens, abc, decisao, comPeriodo)}
        ${footerEstoque(rodape, pageIndex, totalPages)}
      `),
    )
  }

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

  pageIndex += 1
  pagesHtml.push(
    pageSection(`
      ${renderHeader({ ...brand, reportTitle: titulo })}
      <p class="section-kicker">Glossário</p>
      ${glossarioHtml(comPeriodo, lim)}
      ${footerEstoque(rodape, pageIndex, totalPages)}
    `),
  )

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
  if (!isPDFData(body) || body.itens.length > MAX_ITENS) {
    return res.status(400).json({ error: 'Payload de relatório inválido ou grande demais' })
  }
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) {
    return res.status(413).json({ error: 'Payload do relatório excede o limite permitido' })
  }

  try {
    console.log('[PDF Estoque] Iniciando renderização. Itens:', body.itens.length)
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
