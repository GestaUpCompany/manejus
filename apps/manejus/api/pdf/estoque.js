// Endpoint fino do relatório de Estoque de Insumos e Formulações. Mesmo padrão
// do rodeio.js e pastagens.js: só existe aqui o que é específico deste
// relatório. Toda a infraestrutura (Chrome, template base, formatadores) vem
// do _shared/.
//
// O relatório é uma ferramenta de decisão, não um extrato: resume o que repor,
// o que está parado ou em excesso, quanto capital está em risco e onde o valor
// se concentra. Não lista lançamentos (o detalhe fica na tela de Estoque).
//
// Dois modos, conforme `tem_periodo` do payload (a RPC só preenche os campos
// de movimento quando há período):
//  - Sem período (links antigos): posição atual, "Estoque em <data>". Só vale
//    "a repor" por mínimo/saldo negativo; sem cobertura, parado ou excesso.
//  - Com período: saldo inicial/final, consumo, cobertura, giro e situação.
//
// Estrutura:
//  - Página 1: resumo executivo (KPIs, situação dos itens, leitura do período).
//  - Repor: itens com risco de ruptura e sugestão de compra.
//  - Capital parado e em excesso (só com período).
//  - Curva ABC com a explicação de como ler, concentração e consumo por origem.
//  - Posição de estoque (apêndice): fluxo contínuo de linhas por grupo.
//  - Como ler este relatório (glossário).
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

const REPOR_ROWS = 10
const IMOBILIZADO_ROWS = 13
const JUNTAS_MAX_ROWS = 4
const POSICAO_ROWS = 17
const ABC_TOP = 10

const GRUPOS = [
  { key: 'insumo', label: 'Insumos' },
  { key: 'formulacao', label: 'Formulações' },
]

const SITUACAO_ROTULO = { ruptura: 'Repor', parado: 'Parado', excesso: 'Excesso', ok: 'Ok' }

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
.est-grupo-row td{background:#e8f1ec;color:#0b6a42;font-weight:700;text-transform:uppercase;font-size:10px;letter-spacing:.04em}
.est-total-row td{background:#f0f6f2;border-top:2px solid #0b6a42;font-weight:700;color:#0b6a42}
.est-classe{display:inline-block;min-width:16px;text-align:center;font-weight:700;border-radius:3px;padding:0 4px}
.est-classe-A{background:#dff0e6;color:#0b6a42}
.est-classe-B{background:#fdf3e3;color:#9a6b17}
.est-classe-C{background:#eceff1;color:#63736a}
.est-sit{display:inline-block;font-size:9px;font-weight:700;border-radius:4px;padding:1px 6px}
.est-sit-ruptura{background:#fdf6f5;color:#c94d46;border:1px solid #efd8d6}
.est-sit-parado,.est-sit-excesso{background:#fdf3e3;color:#9a6b17;border:1px solid #eedcae}
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
  return `Cobertura de ${Math.round(item.cobertura_dias)} d (menos de ${lim.ruptura} d)`
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
      ['Item', '30%'], ['Tipo', '11%'], ['ABC', '5%'], ['Situação', '9%'], ['Estoque atual', '13%', 'num'],
      ['Mínimo', '8%', 'num'], ['Custo (R$/un.)', '10%', 'num'], ['Valor em estoque', '14%', 'num'],
    ]
  }
  return [
    ['Item', '21%'], ['Tipo', '8%'], ['ABC', '4%'], ['Situação', '8%'], ['Entradas', '8%', 'num'],
    ['Saídas', '8%', 'num'], ['Saldo final', '10%', 'num'], ['Mínimo', '7%', 'num'], ['Cobertura', '7%', 'num'],
    ['Custo (R$/un.)', '8%', 'num'], ['Valor em estoque', '11%', 'num'],
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

// ---------- Repor ----------

// O que a compra cobre: o estoque mínimo ou os dias de consumo alvo (e, no mínimo, a cobertura final).
function criterioCompra(item, sugestao, lim) {
  if (!sugestao.criterio) return ''
  if (sugestao.criterio === 'cobertura') return `para ${lim.alvo} dias de consumo`
  const apos = sugestao.coberturaApos != null ? ` · cobre ${Math.round(sugestao.coberturaApos)} d` : ''
  return `para o mínimo (${moneyFmt(item.estoque_minimo)} ${item.unidade || 'kg'})${apos}`
}

function reporTableHtml(linhas, comPeriodo, lim, totalItens, totalValor, ultima) {
  const cols = comPeriodo
    ? [['Item', '20%'], ['Motivo', '17%'], ['Saldo', '10%', 'num'], ['Consumo/dia', '9%', 'num'], ['Cobertura', '8%', 'num'], ['Esgota em', '9%'], ['Compra sugerida', '18%', 'num'], ['Valor estimado', '9%', 'num']]
    : [['Item', '26%'], ['Motivo', '22%'], ['Saldo', '13%', 'num'], ['Mínimo', '11%', 'num'], ['Compra sugerida', '17%', 'num'], ['Valor estimado', '11%', 'num']]
  const rows = linhas.map(({ item, sugestao }) => {
    const un = unidadeDe(item)
    const saldo = `<td class="${item.negativo ? 'num est-neg' : 'num'}">${moneyFmt(saldoDe(item))} ${un}</td>`
    const criterio = criterioCompra(item, sugestao, lim)
    const compra = `<td class="num"><strong>${sugestao.quantidade > 0 ? `${moneyFmt(sugestao.quantidade)} ${un}` : '—'}</strong>${criterio ? `<span class="est-sub">${escapeHtml(criterio)}</span>` : ''}</td><td class="num">${item.sem_custo || sugestao.valor <= 0 ? '—' : reais(sugestao.valor)}</td>`
    if (!comPeriodo) {
      return `<tr><td>${escapeHtml(item.nome)}</td><td>${escapeHtml(motivoRepor(item, lim))}</td>${saldo}<td class="num">${item.estoque_minimo > 0 ? moneyFmt(item.estoque_minimo) : '—'}</td>${compra}</tr>`
    }
    return `<tr><td>${escapeHtml(item.nome)}</td><td>${escapeHtml(motivoRepor(item, lim))}</td>${saldo}<td class="num">${num(item.consumo_medio_dia)}</td><td class="num">${textoCobertura(item)}</td><td>${item.data_esgotamento ? dateFmt(item.data_esgotamento) : '—'}</td>${compra}</tr>`
  }).join('')
  const vazios = '<td></td>'.repeat(cols.length - 2)
  const total = ultima ? `<tr class="est-total-row"><td>Reposição estimada (${totalItens} ${pl(totalItens, 'item', 'itens')})</td>${vazios}<td class="num">${reais(totalValor)}</td></tr>` : ''
  return `<div class="table-block"><h3 class="table-title">Itens a repor<span>${totalItens} ${pl(totalItens, 'item', 'itens')}</span></h3><table class="est-table">${tableHeadHtml(cols)}<tbody>${rows}${total}</tbody></table></div>`
}

// ---------- Capital parado e em excesso ----------

function imobilizadoTableHtml(linhas, lim, totalItens, totalValor, ultima) {
  const cols = [['Item', '24%'], ['Situação', '10%'], ['Motivo', '26%'], ['Saldo', '12%', 'num'], ['Cobertura', '9%', 'num'], ['Valor parado', '12%', 'num'], ['% do total', '7%', 'num']]
  const rows = linhas.map(({ item, situacao }) => {
    const motivo = situacao === 'parado'
      ? 'Sem nenhuma saída no período'
      : `Cobertura acima de ${lim.excesso} d`
    return `<tr><td>${escapeHtml(item.nome)}</td><td><span class="est-sit est-sit-${situacao}">${SITUACAO_ROTULO[situacao]}</span></td><td>${motivo}</td><td class="num">${moneyFmt(saldoDe(item))} ${unidadeDe(item)}</td><td class="num">${textoCobertura(item)}</td><td class="num"><strong>${reais(item.valor_estoque)}</strong></td><td class="num">${totalValor > 0 ? pct((item.valor_estoque / totalValor) * 100) : '—'}</td></tr>`
  }).join('')
  const total = ultima ? `<tr class="est-total-row"><td>Capital imobilizado (${totalItens} ${pl(totalItens, 'item', 'itens')})</td>${'<td></td>'.repeat(4)}<td class="num">${reais(totalValor)}</td><td></td></tr>` : ''
  return `<div class="table-block"><h3 class="table-title">Capital parado e em excesso<span>${totalItens} ${pl(totalItens, 'item', 'itens')}</span></h3><table class="est-table">${tableHeadHtml(cols)}<tbody>${rows}${total}</tbody></table></div>`
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
    ['A repor', `Saldo negativo, abaixo do estoque mínimo cadastrado${comPeriodo ? ` ou cobertura menor que ${lim.ruptura} dias` : ''}. O item corre risco de faltar.`],
    ...(comPeriodo ? [
      ['Parado', 'Tem saldo e valor em estoque, mas nenhuma saída no período. É dinheiro imobilizado sem giro.'],
      ['Em excesso', `Cobertura acima de ${lim.excesso} dias no ritmo do período: comprou-se mais do que o consumo pede.`],
      ['Cobertura', 'Quantos dias o saldo final do item dura no consumo médio diário do período (saldo ÷ consumo por dia). É calculada por item: não existe uma cobertura única do estoque, porque cada item gira num ritmo.'],
      ['Giro', 'Consumo do período em R$ ÷ valor médio em estoque. Quanto maior, menos tempo o dinheiro fica parado.'],
      ['Compra sugerida', `Quantidade que leva o item ao maior entre o estoque mínimo e ${lim.alvo} dias de consumo no ritmo do período. Abaixo de cada quantidade, o relatório diz qual critério a definiu e, quando é o mínimo, quantos dias a compra cobre.`],
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
  const lim = decisao.limites ?? { ruptura: 15, alvo: 30, excesso: 90 }
  const situacoes = decisao.situacoes ?? {}
  const comPeriodo = input.tem_periodo === true
  const periodo = periodoTexto(input)
  const rodape = comPeriodo ? `Estoque de insumos · ${periodo}` : `Posição do estoque em ${dateFmt(gerado_em)}`

  const porChave = new Map(itens.map((i) => [chave(i), i]))
  const grupos = GRUPOS
    .map((g) => ({ ...g, itens: itens.filter((i) => i.item_tipo === g.key) }))
    .filter((g) => g.itens.length > 0)

  const repor = (decisao.repor ?? [])
    .map((r) => ({ item: porChave.get(r.chave), sugestao: r }))
    .filter((r) => r.item)
  const imobilizado = (decisao.imobilizado ?? [])
    .map((k) => ({ item: porChave.get(k), situacao: situacoes[k] }))
    .filter((r) => r.item)
  const valorRepor = repor.reduce((s, r) => s + r.sugestao.valor, 0)
  const valorImobilizado = imobilizado.reduce((s, r) => s + r.item.valor_estoque, 0)

  const temImob = comPeriodo && imobilizado.length > 0
  // Listas curtas dividem a mesma página, para não deixar duas páginas quase vazias.
  const decisoesJuntas = repor.length > 0 && temImob && repor.length <= JUNTAS_MAX_ROWS && imobilizado.length <= JUNTAS_MAX_ROWS
  const reporChunks = repor.length ? chunkArray(repor, REPOR_ROWS) : []
  const imobChunks = temImob && !decisoesJuntas ? chunkArray(imobilizado, IMOBILIZADO_ROWS) : []
  const linhasPosicao = montarLinhasPosicao(grupos, comPeriodo, abc, situacoes)
  const posicaoChunks = linhasPosicao.length ? chunkArray(linhasPosicao, POSICAO_ROWS) : []
  const temAbc = itens.some((i) => i.valor_estoque > 0)
  const totalPages = 1 + reporChunks.length + imobChunks.length + (temAbc ? 1 : 0) + posicaoChunks.length + 1

  const { contagem, capital } = resumo
  const variacao = resumo.variacaoPct != null
    ? `${resumo.variacaoPct >= 0 ? '+' : ''}${moneyFmt(resumo.variacaoPct)}% vs início (aprox.)`
    : ''
  const kpisHtml = comPeriodo
    ? `<div class="kpi-grid">
        ${kpi(reais(resumo.valorEstoque), 'Valor em estoque', variacao)}
        ${kpi(reais(resumo.consumoValor ?? 0), 'Consumo no período', resumo.consumoDiaValor != null ? `${reais(resumo.consumoDiaValor)} por dia${resumo.giro != null ? ` · giro ${moneyFmt(resumo.giro)}×` : ''}` : '')}
        ${kpi(reais(resumo.reposicaoValor), 'Reposição estimada', `${contagem.ruptura} ${pl(contagem.ruptura, 'item a repor', 'itens a repor')}`, contagem.ruptura > 0 ? 'red' : 'green')}
        ${kpi(reais(resumo.capitalParadoExcesso), 'Parado e em excesso', `${pct(resumo.pctParadoExcesso)} do valor em estoque`, resumo.capitalParadoExcesso > 0 ? 'gold' : 'green')}
      </div>`
    : `<div class="kpi-grid">
        ${kpi(reais(resumo.valorEstoque), 'Valor total em estoque', `${itens.length} ${pl(itens.length, 'item', 'itens')}`)}
        ${kpi(`${contagem.ruptura}`, 'Itens a repor', 'abaixo do mínimo ou negativos', contagem.ruptura > 0 ? 'red' : 'green')}
        ${kpi(`${resumo.semCusto}`, 'Sem custo', resumo.semCusto > 0 ? 'valor total subestimado' : '', resumo.semCusto > 0 ? 'gold' : 'green')}
        ${kpi(`${resumo.negativos}`, 'Saldos negativos', '', resumo.negativos > 0 ? 'red' : 'green')}
      </div>`
  const situacaoHtml4 = comPeriodo
    ? `<div class="kpi-grid">
        ${kpi(`${contagem.ruptura}`, 'Itens a repor', `cobertura < ${lim.ruptura} d, abaixo do mínimo ou negativo`, contagem.ruptura > 0 ? 'red' : 'green')}
        ${kpi(`${contagem.parado}`, 'Itens parados', `${reais(capital.parado)} sem saída no período`, contagem.parado > 0 ? 'gold' : 'green')}
        ${kpi(`${contagem.excesso}`, 'Itens em excesso', `${reais(capital.excesso)} com cobertura > ${lim.excesso} d`, contagem.excesso > 0 ? 'gold' : 'green')}
        ${kpi(`${contagem.ok}`, 'Itens em ordem', `${reais(capital.ok)} em estoque`)}
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
      ${situacaoHtml4}
      ${leituraHtml}
      ${footerEstoque(rodape, pageIndex, totalPages)}
    `),
  )

  const notaRepor = `<p class="est-nota">Compra sugerida = ${comPeriodo ? `a quantidade que leva o item ao maior entre o estoque mínimo e ${lim.alvo} dias de consumo no ritmo do período; abaixo de cada quantidade está o critério que a definiu` : 'a quantidade necessária para chegar ao estoque mínimo cadastrado'}. Ordenado do mais urgente ao menos urgente.</p>`
  const notaImob = `<p class="est-nota">Parado: tem saldo e valor, mas não teve nenhuma saída no período. Em excesso: cobertura acima de ${lim.excesso} dias no ritmo do período. Ordenado pelo maior valor imobilizado.</p>`

  reporChunks.forEach((chunk, i) => {
    pageIndex += 1
    const ultima = i === reporChunks.length - 1
    const juntaImob = decisoesJuntas && ultima
    pagesHtml.push(
      pageSection(`
        ${renderHeader({ ...brand, reportTitle: titulo })}
        <p class="section-kicker">${juntaImob ? 'Decisões de compra e de capital' : `O que repor${i > 0 ? ' (continuação)' : ''}`}</p>
        ${reporTableHtml(chunk, comPeriodo, lim, repor.length, valorRepor, ultima)}
        ${ultima ? notaRepor : ''}
        ${juntaImob ? `<div style="margin-top:5mm">${imobilizadoTableHtml(imobilizado, lim, imobilizado.length, valorImobilizado, true)}${notaImob}</div>` : ''}
        ${footerEstoque(rodape, pageIndex, totalPages)}
      `),
    )
  })

  imobChunks.forEach((chunk, i) => {
    pageIndex += 1
    const ultima = i === imobChunks.length - 1
    pagesHtml.push(
      pageSection(`
        ${renderHeader({ ...brand, reportTitle: titulo })}
        <p class="section-kicker">Capital parado e em excesso${i > 0 ? ' (continuação)' : ''}</p>
        ${imobilizadoTableHtml(chunk, lim, imobilizado.length, valorImobilizado, ultima)}
        ${ultima ? notaImob : ''}
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
