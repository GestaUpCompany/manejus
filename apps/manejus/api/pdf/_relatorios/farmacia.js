// Endpoint fino do relatório de Farmácia. Mesmo padrão de maternidade.js: só existe aqui o que é específico
// deste relatório; Chrome, template base e formatadores vêm do _shared/.
//
// O cliente envia o `resumo` já calculado (src/features/relatorioFarmacia/agregacao.ts, fonte única das
// regras); o endpoint só monta o HTML. Duas páginas:
//  - Página 1: KPIs (valor em estoque, itens a repor, entradas, baixas), por tipo, baixas por origem, itens a repor.
//  - Página 2: validade por lote, maiores consumos e posição por item (saldo inicial a final, curva ABC).
// No Infográfico Mensal, dataInicio/dataFim (camelCase) valem quando data_inicio/data_fim não vêm preenchidos.

import { escapeHtml, dateFmt } from '../_shared/formatters.js'
import { generatePdf } from '../_shared/puppeteer.js'
import { renderHeader, page as pageSection, htmlDocument, kpi } from '../_shared/template.js'

const MAX_BODY_BYTES = 8_000_000
const LINHAS_DIST = 8

function isPDFData(value) {
  if (!value || typeof value !== 'object') return false
  if (typeof value.fazendaNome !== 'string') return false
  if (!value.resumo || typeof value.resumo !== 'object') return false
  return true
}

const FARMACIA_CSS = `
.fm-table td,.fm-table th{font-size:10.5px}
.fm-table th.num,.fm-table td.num{text-align:right}
.fm-duo{display:grid;gap:7mm;align-items:start;grid-template-columns:1fr 1fr}
.fm-uno{display:block}
.fm-bar{display:flex;align-items:center;gap:6px;font-size:11px;margin:1.4mm 0}
.fm-bar-label{flex:0 0 34%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#25332b}
.fm-bar-track{flex:1;height:9px;background:#eef3f0;border-radius:5px;overflow:hidden}
.fm-bar-fill{height:100%;background:#0b6a42;border-radius:5px}
.fm-bar-fill.gold{background:#c28a27}
.fm-bar-val{flex:0 0 auto;min-width:44px;text-align:right;font-weight:700;color:#0b6a42}
.fm-vazio{font-size:11px;color:#7a8981;margin:0}
.fm-nota{font-size:10px;color:#7a8981;margin:2mm 0 0}
.fm-aviso{font-size:11px;color:#9a6b17;background:#fdf3e3;border:1px solid #eedcae;border-radius:6px;padding:2mm 3mm;margin:2mm 0 0}
.fm-neg{color:#c94d46;font-weight:700}
`

const inteiro = (v) => (Number(v) || 0).toLocaleString('pt-BR')
const plural = (n, um, varios) => `${inteiro(n)} ${Number(n) === 1 ? um : varios}`
const decimal = (v, casas = 1) => (v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }))
const moeda = (v) => (v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const qtd = (v) => decimal(v, Number.isInteger(Number(v)) ? 0 : 1)

function periodoTexto(input) {
  const ini = input.data_inicio ?? input.dataInicio ?? null
  const fim = input.data_fim ?? input.dataFim ?? null
  if (ini && fim) return `${dateFmt(ini)} a ${dateFmt(fim)}`
  if (ini) return `A partir de ${dateFmt(ini)}`
  if (fim) return `Até ${dateFmt(fim)}`
  return 'Todo o período'
}

function footerFarmacia(periodo, page, totalPages) {
  return `<footer class="report-footer"><span>Gesta'Up · Farmácia · ${escapeHtml(periodo)}</span><span>Página ${page} de ${totalPages}</span></footer>`
}

function barrasHtml(titulo, itens, { tom = '', max = LINHAS_DIST, formato = moeda } = {}) {
  const lista = Array.isArray(itens) ? itens : []
  const cab = `<h3 class="table-title">${escapeHtml(titulo)}<span>${lista.length}</span></h3>`
  if (!lista.length) return `<div class="table-block">${cab}<p class="fm-vazio">Sem registros no período.</p></div>`
  const topo = Math.max(...lista.map((i) => Number(i.valor) || 0), 1)
  const linhas = lista.slice(0, max).map((i) => {
    const pct = Math.max(2, Math.round(((Number(i.valor) || 0) / topo) * 100))
    return `<div class="fm-bar"><span class="fm-bar-label" title="${escapeHtml(i.label)}">${escapeHtml(i.label)}</span><span class="fm-bar-track"><span class="fm-bar-fill ${tom}" style="display:block;width:${pct}%"></span></span><span class="fm-bar-val">${formato(i.valor)}</span></div>`
  }).join('')
  const resto = lista.length > max ? `<p class="fm-nota">e mais ${plural(lista.length - max, 'item', 'itens')}.</p>` : ''
  return `<div class="table-block">${cab}${linhas}${resto}</div>`
}

function tabelaHtml(titulo, colunas, linhas, vazio) {
  const cab = `<h3 class="table-title">${escapeHtml(titulo)}<span>${linhas.length}</span></h3>`
  if (!linhas.length) return `<div class="table-block">${cab}<p class="fm-vazio">${escapeHtml(vazio)}</p></div>`
  const colgroup = `<colgroup>${colunas.map(([, w]) => `<col style="width:${w}">`).join('')}</colgroup>`
  const head = `<thead><tr>${colunas.map(([t, , c]) => `<th${c ? ` class="${c}"` : ''}>${t}</th>`).join('')}</tr></thead>`
  return `<div class="table-block">${cab}<table class="fm-table">${colgroup}${head}<tbody>${linhas.join('')}</tbody></table></div>`
}

// Blocos sem dados somem; os que sobram dividem a linha (1 = largura total, 2 = lado a lado).
function grade(blocos) {
  const presentes = blocos.filter(Boolean)
  if (!presentes.length) return ''
  return `<div class="${presentes.length > 1 ? 'fm-duo' : 'fm-uno'}">${presentes.join('')}</div>`
}

function reporHtml(lista) {
  const linhas = (lista ?? []).map((i) => {
    const neg = Number(i.saldo_final) < 0 ? 'num fm-neg' : 'num'
    return `<tr><td>${escapeHtml(i.nome)}</td><td class="${neg}">${qtd(i.saldo_final)}</td><td class="num">${qtd(i.estoque_minimo)}</td><td class="num fm-neg">${qtd(i.falta_para_minimo)}</td><td class="num">${i.cobertura_dias == null ? '—' : `${decimal(i.cobertura_dias, 0)} d`}</td></tr>`
  })
  return tabelaHtml('Itens a repor', [['Item', '40%'], ['Saldo', '15%', 'num'], ['Mínimo', '15%', 'num'], ['Falta', '15%', 'num'], ['Cobertura', '15%', 'num']], linhas, 'Nenhum item abaixo do mínimo.')
}

function validadeHtml(lista) {
  const linhas = (lista ?? []).map((l) => {
    const vencido = l.situacao === 'vencido'
    const dias = l.dias == null ? '—' : vencido ? `vencido há ${inteiro(Math.abs(l.dias))} d` : `${inteiro(l.dias)} d`
    return `<tr><td>${escapeHtml(l.item)}</td><td>${escapeHtml(l.lote ?? '—')}</td><td>${l.validade ? dateFmt(l.validade) : '—'}</td><td class="num">${qtd(l.saldo)}</td><td class="num${vencido ? ' fm-neg' : ''}">${dias}</td></tr>`
  })
  return tabelaHtml('Validade dos lotes', [['Item', '32%'], ['Lote', '18%'], ['Validade', '16%'], ['Saldo', '12%', 'num'], ['Prazo', '22%', 'num']], linhas, 'Nenhum lote vencido ou perto de vencer.')
}

function consumosHtml(lista) {
  return barrasHtml('Maiores consumos (valor)', (lista ?? []).map((i) => ({ label: i.nome, valor: i.baixas_valor })), { tom: 'gold', max: 10 })
}

function posicaoHtml(itens, { titulo = 'Posição por item', total } = {}) {
  const linhas = itens.map((i) => `<tr><td>${escapeHtml(i.nome)}</td><td class="num">${qtd(i.saldo_inicial)}</td><td class="num">${qtd(i.entradas)}</td><td class="num">${qtd(i.baixas)}</td><td class="num${i.em_alerta ? ' fm-neg' : ''}">${qtd(i.saldo_final)}</td><td class="num">${i.sem_custo ? 'sem custo' : moeda(i.valor_estoque)}</td><td class="num">${i.curva ?? '—'}</td></tr>`)
  const colunas = [['Item', '30%'], ['Saldo inicial', '12%', 'num'], ['Entradas', '11%', 'num'], ['Baixas', '11%', 'num'], ['Saldo final', '12%', 'num'], ['Valor', '16%', 'num'], ['ABC', '8%', 'num']]
  const colgroup = `<colgroup>${colunas.map(([, w]) => `<col style="width:${w}">`).join('')}</colgroup>`
  const head = `<thead><tr>${colunas.map(([t, , c]) => `<th${c ? ` class="${c}"` : ''}>${t}</th>`).join('')}</tr></thead>`
  return `<div class="table-block"><h3 class="table-title">${escapeHtml(titulo)}<span>${total}</span></h3><table class="fm-table">${colgroup}${head}<tbody>${linhas.join('')}</tbody></table></div>`
}

function avisosHtml(resumo) {
  const avisos = []
  const total = Number(resumo.total_itens) || 0
  const semCusto = Number(resumo.sem_custo) || 0
  if (total > 0 && Number(resumo.valor_total) === 0 && semCusto > 0) {
    avisos.push(`Nenhum item tem custo cadastrado: valor em estoque, entradas e consumo ficam em R$ 0,00. Informe o custo nas entradas para valorizar o estoque.`)
  } else if (semCusto > 0) {
    avisos.push(`${plural(semCusto, 'item com saldo ou movimento e sem custo', 'itens com saldo ou movimento e sem custo')} (de ${inteiro(total)} controlados): o valor em estoque sai subestimado.`)
  }
  return avisos.map((a) => `<p class="fm-aviso">${escapeHtml(a)}</p>`).join('')
}

const LINHAS_PAGINA_RESUMO = 22
const LINHAS_PAGINA_DETALHE = 14
const LINHAS_PAGINA_CONTINUACAO = 24

export async function renderFarmaciaHtml(input) {
  const { fazendaNome, logoGestao, logoFazenda } = input
  const brand = { logoGestao, logoFazenda, fazendaNome }
  const resumo = input.resumo
  const periodo = periodoTexto(input)
  const titulo = 'Relatório de Farmácia'
  const itens = Array.isArray(resumo.itens) ? resumo.itens : []

  const temRepor = (resumo.itens_repor?.length ?? 0) > 0
  const temValidade = (resumo.validade?.length ?? 0) > 0
  const temConsumo = (resumo.maiores_consumos?.length ?? 0) > 0
  const detalhe = temValidade || temConsumo

  // Divide a posição por item em páginas: a primeira divide espaço com validade/consumo, o resto é só tabela.
  const primeira = detalhe ? LINHAS_PAGINA_DETALHE : LINHAS_PAGINA_RESUMO
  const blocos = [itens.slice(0, primeira)]
  for (let i = primeira; i < itens.length; i += LINHAS_PAGINA_CONTINUACAO) blocos.push(itens.slice(i, i + LINHAS_PAGINA_CONTINUACAO))
  const totalPages = 1 + blocos.length

  let n = 1
  const wrap = (corpo) => pageSection(`${renderHeader({ ...brand, reportTitle: titulo })}${corpo}${footerFarmacia(periodo, n, totalPages)}`)

  const kpis = [
    kpi(moeda(resumo.valor_total), 'Valor em estoque', `${plural(resumo.total_itens, 'item controlado', 'itens controlados')}`),
    kpi(inteiro(resumo.a_repor), 'Itens a repor', `${plural(resumo.em_alerta, 'item em alerta', 'itens em alerta')}`, Number(resumo.a_repor) > 0 ? 'red' : 'green'),
    kpi(moeda(resumo.valor_entradas), 'Entradas no período', null, 'green'),
    kpi(moeda(resumo.valor_baixas), 'Consumo no período', `${plural(resumo.lotes_vencidos + resumo.lotes_a_vencer, 'lote vencido ou a vencer', 'lotes vencidos ou a vencer')}`, 'gold'),
  ].join('')

  const pagina1 = wrap(`
    <p class="section-kicker">Resumo do período</p>
    <div class="period-badge">${escapeHtml(periodo)}</div>
    <div class="kpi-grid">${kpis}</div>
    ${grade([
      resumo.por_tipo?.length ? barrasHtml('Valor em estoque por tipo', resumo.por_tipo) : '',
      resumo.baixas_por_origem?.length ? barrasHtml('Baixas por origem (valor)', resumo.baixas_por_origem, { tom: 'gold' }) : '',
    ])}
    ${temRepor ? reporHtml(resumo.itens_repor) : '<p class="fm-nota">Nenhum item abaixo do estoque mínimo (itens sem mínimo cadastrado não entram nesta conta).</p>'}
    ${avisosHtml(resumo)}
  `)

  const paginas = [pagina1]
  blocos.forEach((bloco, idx) => {
    n = idx + 2
    const ultima = idx === blocos.length - 1
    const topo = idx === 0
      ? `<p class="section-kicker">Validade e consumo</p>${detalhe ? grade([temValidade ? validadeHtml(resumo.validade) : '', temConsumo ? consumosHtml(resumo.maiores_consumos) : '']) : '<p class="fm-nota">Nenhum lote vencido ou perto de vencer e nenhum consumo no período.</p>'}`
      : `<p class="section-kicker">Posição por item (continuação)</p>`
    const nota = ultima
      ? `<p class="fm-nota">Saldo e lotes reconstruídos pelo histórico de lançamentos (saída pelo vencimento mais próximo). Consumo = baixas − estornos. Valor em estoque = saldo × custo médio atual. Curva ABC pelo valor em estoque: A até 80%, B até 95%. Alerta de validade: ${inteiro(resumo.dias_alerta_validade)} dias.</p>`
      : ''
    paginas.push(wrap(`${topo}${posicaoHtml(bloco, { titulo: 'Posição por item', total: itens.length })}${nota}`))
  })

  if (!itens.length) {
    n = 2
    paginas.splice(1, paginas.length - 1, wrap(`<p class="section-kicker">Posição por item</p><p class="fm-vazio">Nenhum medicamento com controle de estoque.</p>`))
  }

  return htmlDocument({ title: titulo, extraCss: FARMACIA_CSS, body: paginas.join('') })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Método não permitido' })
  }
  const body = req.body
  if (!isPDFData(body)) {
    return res.status(400).json({ error: 'Payload de relatório inválido' })
  }
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) {
    return res.status(413).json({ error: 'Payload do relatório excede o limite permitido' })
  }

  try {
    console.log('[PDF Farmácia] Iniciando renderização. Itens:', body.resumo.total_itens)
    const html = await renderFarmaciaHtml(body)
    const pdf = await generatePdf({ html, format: 'A4', landscape: true })
    console.log('[PDF Farmácia] PDF gerado. Bytes:', pdf.length)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio-farmacia.pdf"')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-PDF-Renderer', 'puppeteer')
    return res.status(200).send(pdf)
  } catch (error) {
    console.error('[PDF Farmácia] Erro ao gerar relatório:', error)
    return res.status(500).json({ error: 'Não foi possível gerar o PDF', detail: String(error) })
  }
}
