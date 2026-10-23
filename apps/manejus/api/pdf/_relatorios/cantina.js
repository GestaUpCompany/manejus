// Endpoint fino do relatório de Cantina. Mesmo padrão do estoque.js e do
// estoqueCombustivel.js: só existe aqui o que é específico deste relatório;
// Chrome, template base e formatadores vêm do _shared/.
//
// Estrutura:
//  - Página 1: período, KPIs (valor em estoque, entradas, baixas, refeições e
//    custo por refeição) e "Itens que pedem atenção".
//  - Posição por item (saldo inicial, entradas, baixas, ajustes, saldo final,
//    cobertura, custo médio e valor), paginada.
//  - Operação da cozinha e marmitas.
//  - Curva ABC por valor em estoque.
//  - Extrato das movimentações do período, paginado.
//
// No Infográfico Mensal, dataInicio/dataFim (camelCase) chegam no payload e
// valem quando data_inicio/data_fim (snake_case, da RPC) não vêm preenchidos.

import { escapeHtml, dateFmt, moneyFmt } from '../_shared/formatters.js'
import { generatePdf } from '../_shared/puppeteer.js'
import { renderHeader, page as pageSection, htmlDocument, kpi } from '../_shared/template.js'

const MAX_ITENS = 5000
const MAX_MOVIMENTACOES = 5000
const MAX_BODY_BYTES = 8_000_000

const POSICAO_ROWS = 17
const ATENCAO_MAX = 6
const MOVS_PER_PAGE = 17
const MARMITAS_MAX = 12

const TIPO_ROTULO = { entrada: 'Entrada', baixa: 'Baixa', ajuste: 'Ajuste', estorno: 'Estorno' }
const ORIGEM_ROTULO = { pwa_entrada: 'Entrada (app)', pwa_cantina: 'Saída (app)' }

function isPDFData(value) {
  if (!value || typeof value !== 'object') return false
  if (typeof value.fazendaNome !== 'string') return false
  if (!Array.isArray(value.itens)) return false
  if (value.movimentacoes != null && !Array.isArray(value.movimentacoes)) return false
  return true
}

const CANTINA_CSS = `
.ct-table td,.ct-table th{font-size:11px}
.ct-table th.num,.ct-table td.num{text-align:right}
.ct-neg{color:#c94d46;font-weight:700}
.ct-tag{display:inline-block;font-size:9px;font-weight:700;border-radius:4px;padding:1px 6px;margin-left:6px;vertical-align:middle}
.ct-tag-min{background:#fdf3e3;color:#9a6b17;border:1px solid #eedcae}
.ct-tag-neg{background:#fdf6f5;color:#c94d46;border:1px solid #efd8d6}
.ct-tag-info{background:#eef2fa;color:#4a5a8a;border:1px solid #d3dcf0}
.ct-tipo-entrada{color:#0b6a42;font-weight:700}
.ct-tipo-baixa,.ct-tipo-estorno{color:#9a6b17;font-weight:700}
.ct-tipo-ajuste{color:#4a5a8a;font-weight:700}
.ct-total-row td{background:#f0f6f2;border-top:2px solid #0b6a42;font-weight:700;color:#0b6a42}
.ct-nota{font-size:10px;color:#7a8981;margin:2mm 0 0}
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

function textoCobertura(item) {
  if (Number(item.saldo_final) <= 0) return 'Sem saldo'
  if (item.cobertura_dias == null) return 'Sem consumo'
  if (item.cobertura_dias >= 365) return 'mais de 1 ano'
  return `${Math.round(item.cobertura_dias)} d`
}

function gravidade(i) {
  if (i.negativo) return 0
  if (i.em_alerta) return 1
  if (i.divergencia != null) return 2
  return 3
}

function itensDeAtencao(itens) {
  return itens
    .filter((i) => i.negativo || i.em_alerta || i.sem_custo || i.divergencia != null)
    .sort((a, b) => gravidade(a) - gravidade(b))
}

function motivosAtencao(i) {
  const m = []
  if (i.negativo) m.push('saldo negativo')
  if (i.em_alerta && !i.negativo) m.push(`abaixo do mínimo (${qtd(i.estoque_minimo)} ${escapeHtml(i.unidade ?? '')})`)
  if (i.divergencia != null) m.push(`divergência de ${qtd(i.divergencia)} ${escapeHtml(i.unidade ?? '')} em relação ao saldo gravado`)
  if (i.sem_custo) m.push('sem custo cadastrado')
  return m.join(' · ')
}

function atencaoHtml(itens) {
  const lista = itensDeAtencao(itens)
  if (!lista.length) return ''
  const linhas = lista.slice(0, ATENCAO_MAX)
    .map((i) => `<tr><td>${escapeHtml(i.nome)}</td><td>${motivosAtencao(i)}</td></tr>`)
    .join('')
  const resto = lista.length > ATENCAO_MAX ? `<p class="ct-nota">e mais ${lista.length - ATENCAO_MAX} ${lista.length - ATENCAO_MAX === 1 ? 'item' : 'itens'}; veja a posição por item.</p>` : ''
  const cols = [['Item', '30%'], ['Motivo', '70%']]
  return `<div class="table-block"><h3 class="table-title">Itens que pedem atenção<span>${lista.length}</span></h3><table class="ct-table">${tableHeadHtml(cols)}<tbody>${linhas}</tbody></table>${resto}</div>`
}

function linhaItem(i, temPeriodo) {
  const tags = [
    i.em_alerta && !i.negativo ? '<span class="ct-tag ct-tag-min">abaixo do mínimo</span>' : '',
    i.negativo ? '<span class="ct-tag ct-tag-neg">saldo negativo</span>' : '',
    i.sem_custo ? '<span class="ct-tag ct-tag-info">sem custo</span>' : '',
  ].join('')
  const saldoCls = i.negativo ? 'num ct-neg' : 'num'
  const unidade = escapeHtml(i.unidade ?? '')
  const periodo = temPeriodo
    ? `<td class="num">${qtd(i.saldo_inicial)}</td><td class="num">${qtd(i.entradas)}</td><td class="num">${qtd(i.baixas)}</td><td class="num">${qtd(i.ajustes)}</td>`
    : ''
  const cobertura = temPeriodo ? `<td class="num">${textoCobertura(i)}</td>` : ''
  return `<tr><td>${escapeHtml(i.nome)}${tags}</td><td>${escapeHtml(i.classificacao ?? '—')}</td>${periodo}<td class="${saldoCls}"><strong>${qtd(i.saldo_final)}</strong> ${unidade}</td>${cobertura}<td class="num">${i.estoque_minimo > 0 ? qtd(i.estoque_minimo) : '—'}</td><td class="num">${moneyFmt(i.custo_unitario)}</td><td class="num"><strong>R$ ${moneyFmt(i.valor_estoque)}</strong></td></tr>`
}

function posicaoTableHtml(itens, total, temPeriodo, rodape) {
  const cols = temPeriodo
    ? [['Item', '17%'], ['Classificação', '10%'], ['Saldo inicial', '8%', 'num'], ['Entradas', '8%', 'num'], ['Baixas', '8%', 'num'], ['Ajustes', '7%', 'num'], ['Saldo final', '10%', 'num'], ['Cobertura', '8%', 'num'], ['Mínimo', '7%', 'num'], ['Custo médio', '8%', 'num'], ['Valor', '9%', 'num']]
    : [['Item', '25%'], ['Classificação', '15%'], ['Saldo atual', '14%', 'num'], ['Mínimo', '12%', 'num'], ['Custo médio', '14%', 'num'], ['Valor em estoque', '20%', 'num']]
  const rows = itens.map((i) => linhaItem(i, temPeriodo)).join('')
  return `<div class="table-block"><h3 class="table-title">Posição por item<span>${total} ${total === 1 ? 'item' : 'itens'}</span></h3><table class="ct-table">${tableHeadHtml(cols)}<tbody>${rows}${rodape ?? ''}</tbody></table></div>`
}

function totalRow(itens, temPeriodo) {
  const colunasAntesDoValor = temPeriodo ? 10 : 5
  return `<tr class="ct-total-row"><td colspan="${colunasAntesDoValor}">Total em estoque</td><td class="num">R$ ${moneyFmt(soma(itens, 'valor_estoque'))}</td></tr>`
}

// Sem baixas valoradas (custo zero) não há custo por refeição a mostrar.
function custoPorRefeicao(op) {
  return Number(op?.custo_baixas) > 0 ? op.custo_por_refeicao : null
}

function operacaoHtml(operacao, marmitas) {
  const op = operacao ?? {}
  const refeicoes = Number(op.refeicoes_total) || 0
  const kpis = `<div class="kpi-grid">
    ${kpi(inteiro(op.cafe_manha), 'Cafés da manhã')}
    ${kpi(inteiro(op.lanches), 'Lanches')}
    ${kpi(inteiro(op.almocos), 'Almoços')}
    ${kpi(inteiro(op.jantares), 'Jantares')}
  </div>`
  const custo = custoPorRefeicao(op) == null
    ? 'Sem baixas valoradas no período para calcular o custo por refeição.'
    : `Custo por refeição = baixas do período (R$ ${moneyFmt(op.custo_baixas)}) ÷ ${inteiro(refeicoes)} refeições = <strong>R$ ${moneyFmt(op.custo_por_refeicao)}</strong>.`
  const m = marmitas ?? { registros: 0, quantidade: 0, valor: 0, sem_preco: 0, lista: [] }
  const lista = Array.isArray(m.lista) ? m.lista : []
  const marmitaRows = lista.slice(0, MARMITAS_MAX).map((x) =>
    `<tr><td>${dateFmt(x.data)}</td><td>${escapeHtml(x.fornecedor ?? '—')}</td><td>${escapeHtml(x.destinatario ?? '—')}</td><td class="num">${inteiro(x.quantidade)}</td><td class="num">${x.preco_unitario == null ? '—' : moneyFmt(x.preco_unitario)}</td><td class="num">${moneyFmt(x.valor)}</td></tr>`,
  ).join('')
  const cols = [['Data', '12%'], ['Fornecedor', '28%'], ['Destinatário', '28%'], ['Marmitas', '10%', 'num'], ['R$/marmita', '10%', 'num'], ['Valor (R$)', '12%', 'num']]
  const marmitaTabela = lista.length
    ? `<div class="table-block"><h3 class="table-title">Marmitas<span>${inteiro(m.quantidade)} marmitas · R$ ${moneyFmt(m.valor)}</span></h3><table class="ct-table">${tableHeadHtml(cols)}<tbody>${marmitaRows}</tbody></table>${lista.length > MARMITAS_MAX ? `<p class="ct-nota">Mostrando ${MARMITAS_MAX} de ${lista.length} registros; o link público tem a lista completa.</p>` : ''}${m.sem_preco ? `<p class="ct-aviso">${m.sem_preco} ${m.sem_preco === 1 ? 'registro' : 'registros'} de marmita sem preço unitário (valor R$ 0,00).</p>` : ''}</div>`
    : '<p style="font-size:12px;color:#7a8981">Nenhuma marmita no período.</p>'
  return `<p class="section-kicker">Operação da cozinha</p>${kpis}<p class="ct-nota">${inteiro(op.registros)} ${Number(op.registros) === 1 ? 'registro' : 'registros'} de saída no período · ${inteiro(refeicoes)} refeições. ${custo}</p>${marmitaTabela}`
}

function abcHtml(itens, abc) {
  const comValor = itens.filter((i) => i.valor_estoque > 0).sort((a, b) => b.valor_estoque - a.valor_estoque)
  if (!comValor.length) return ''
  const total = soma(comValor, 'valor_estoque')
  const contagem = { A: 0, B: 0, C: 0 }
  const valor = { A: 0, B: 0, C: 0 }
  for (const i of comValor) {
    const c = abc?.[i.id]
    if (c && contagem[c] != null) { contagem[c] += 1; valor[c] += i.valor_estoque }
  }
  const resumo = ['A', 'B', 'C'].map((c) => `<span class="ct-classe ct-classe-${c}">${c}</span> ${contagem[c]} ${contagem[c] === 1 ? 'item' : 'itens'} · R$ ${moneyFmt(valor[c])} (${total > 0 ? moneyFmt((valor[c] / total) * 100) : '0,00'}%)`).join(' &nbsp; ')
  const max = comValor[0].valor_estoque
  const rows = comValor.slice(0, 12).map((i) => {
    const c = abc?.[i.id] ?? 'C'
    const largura = Math.max(2, Math.round((i.valor_estoque / max) * 100))
    return `<tr><td>${escapeHtml(i.nome)}</td><td><span class="ct-classe ct-classe-${c}">${c}</span></td><td class="num">${moneyFmt((i.valor_estoque / total) * 100)}%</td><td><span class="ct-bar" style="width:${largura}%"></span></td><td class="num">R$ ${moneyFmt(i.valor_estoque)}</td></tr>`
  }).join('')
  const cols = [['Item', '32%'], ['Classe', '8%'], ['% do valor', '10%', 'num'], ['', '34%'], ['Valor', '16%', 'num']]
  return `<p class="section-kicker">Curva ABC</p><p class="ct-nota" style="margin:0 0 3mm">${resumo}</p><div class="table-block"><h3 class="table-title">Maiores valores em estoque<span>top ${Math.min(12, comValor.length)} de ${comValor.length}</span></h3><table class="ct-table">${tableHeadHtml(cols)}<tbody>${rows}</tbody></table></div><p class="ct-nota">A: até 80% do valor acumulado; B: até 95%; C: o restante. Itens sem saldo ou sem custo ficam fora da curva.</p>`
}

function linhaMov(m) {
  const variacao = Number(m.variacao) || 0
  const sinal = variacao > 0 ? '+' : ''
  const varCls = variacao < 0 ? 'num ct-neg' : 'num'
  const saldoCls = Number(m.saldo_apos) < 0 ? 'num ct-neg' : 'num'
  const detalhe = [m.fornecedor, m.observacao].filter(Boolean).join(' · ')
  return `<tr><td>${dateFmt(m.data)}</td><td>${escapeHtml(m.item)}</td><td><span class="ct-tipo-${escapeHtml(m.tipo)}">${escapeHtml(TIPO_ROTULO[m.tipo] ?? m.tipo)}</span></td><td>${escapeHtml(ORIGEM_ROTULO[m.origem] ?? m.origem ?? '—')}</td><td>${escapeHtml(detalhe || '—')}</td><td class="${varCls}">${sinal}${qtd(variacao)} ${escapeHtml(m.unidade ?? '')}</td><td class="num">${m.custo_unitario == null ? '—' : moneyFmt(m.custo_unitario)}</td><td class="num">${m.valor == null ? '—' : moneyFmt(m.valor)}</td><td class="${saldoCls}">${qtd(m.saldo_apos)}</td></tr>`
}

function extratoHtml(movs, total) {
  const cols = [['Data', '8%'], ['Item', '18%'], ['Tipo', '8%'], ['Origem', '10%'], ['Detalhe', '20%'], ['Variação', '11%', 'num'], ['Custo un.', '8%', 'num'], ['Valor (R$)', '9%', 'num'], ['Saldo após', '8%', 'num']]
  return `<div class="table-block"><h3 class="table-title">Extrato de movimentações<span>${total} ${total === 1 ? 'lançamento' : 'lançamentos'}</span></h3><table class="ct-table">${tableHeadHtml(cols)}<tbody>${movs.map(linhaMov).join('')}</tbody></table></div>`
}

function qualidadeHtml(q) {
  if (!q) return ''
  const avisos = []
  if (q.registros_sem_itens > 0) avisos.push(`${q.registros_sem_itens} ${q.registros_sem_itens === 1 ? 'registro' : 'registros'} de saída/entrada sem itens detalhados (não movimentaram o estoque)`)
  if (q.itens_sem_controle > 0) avisos.push(`${q.itens_sem_controle} ${q.itens_sem_controle === 1 ? 'item usado' : 'itens usados'} em registros sem controle de estoque ativado`)
  if (q.nomes_duplicados > 0) avisos.push(`${q.nomes_duplicados} ${q.nomes_duplicados === 1 ? 'nome duplicado' : 'nomes duplicados'} no catálogo`)
  return avisos.length ? `<p class="ct-aviso"><strong>Qualidade dos dados:</strong> ${avisos.join('; ')}.</p>` : ''
}

export async function renderCantinaHtml(input) {
  const { fazendaNome, logoGestao, logoFazenda } = input
  const brand = { logoGestao, logoFazenda, fazendaNome }
  const itens = Array.isArray(input.itens) ? input.itens : []
  const movs = Array.isArray(input.movimentacoes) ? input.movimentacoes : []
  const movsTotal = Number(input.movimentacoes_total) || movs.length
  const temPeriodo = input.tem_periodo ?? !!((input.data_inicio ?? input.dataInicio) && (input.data_fim ?? input.dataFim))
  const periodo = periodoTexto(input)
  const titulo = 'Relatório de Cantina'
  const abc = input.abc ?? {}

  const posChunks = itens.length ? chunkArray(itens, POSICAO_ROWS) : []
  const movChunks = movs.length ? chunkArray(movs, MOVS_PER_PAGE) : []
  const temAbc = itens.some((i) => i.valor_estoque > 0)
  const totalPages = 1 + posChunks.length + 1 + (temAbc ? 1 : 0) + (temPeriodo ? Math.max(movChunks.length, 1) : 0)

  const valorTotal = soma(itens, 'valor_estoque')
  const op = input.operacao ?? {}
  const pages = []
  let n = 1
  const wrap = (corpo) => pageSection(`${renderHeader({ ...brand, reportTitle: titulo })}${corpo}${footerCantina(periodo, n, totalPages)}`)

  pages.push(wrap(`
    <p class="section-kicker">${temPeriodo ? 'Estoque e consumo do período' : 'Posição atual'}</p>
    <div class="period-badge">${escapeHtml(periodo)}</div>
    <div class="kpi-grid">
      ${kpi(`R$ ${moneyFmt(valorTotal)}`, 'Valor em estoque', `${itens.length} ${itens.length === 1 ? 'item' : 'itens'} com controle`)}
      ${kpi(`R$ ${moneyFmt(soma(itens, 'entradas_valor'))}`, 'Entradas no período')}
      ${kpi(`R$ ${moneyFmt(soma(itens, 'baixas_valor'))}`, 'Baixas (consumo)', null, 'gold')}
      ${kpi(inteiro(op.refeicoes_total), 'Refeições', custoPorRefeicao(op) == null ? null : `R$ ${moneyFmt(op.custo_por_refeicao)} por refeição`)}
    </div>
    ${atencaoHtml(itens)}
    ${qualidadeHtml(input.qualidade)}
    <p class="ct-nota">Valor em estoque = saldo final × custo médio atual do item. Saldos reconstruídos pelo histórico de lançamentos.</p>
  `))

  posChunks.forEach((chunk, idx) => {
    n += 1
    const ultimo = idx === posChunks.length - 1
    pages.push(wrap(`
      <p class="section-kicker">${idx === 0 ? 'Posição por item' : 'Posição por item (continuação)'}</p>
      ${posicaoTableHtml(chunk, itens.length, temPeriodo, ultimo ? totalRow(itens, temPeriodo) : '')}
    `))
  })

  n += 1
  pages.push(wrap(operacaoHtml(input.operacao, input.marmitas)))

  if (temAbc) {
    n += 1
    pages.push(wrap(abcHtml(itens, abc)))
  }

  if (temPeriodo) {
    if (!movs.length) {
      n += 1
      pages.push(wrap('<p class="section-kicker">Movimentação do período</p><p style="font-size:12px;color:#7a8981">Nenhuma movimentação no período.</p>'))
    } else {
      movChunks.forEach((chunk, idx) => {
        n += 1
        const aviso = idx === movChunks.length - 1 && movsTotal > movs.length
          ? `<p class="ct-aviso">Extrato truncado: ${movs.length} de ${movsTotal} lançamentos. O link público do relatório tem o extrato completo.</p>`
          : ''
        pages.push(wrap(`<p class="section-kicker">Movimentação do período</p>${extratoHtml(chunk, movsTotal)}${aviso}`))
      })
    }
  }

  return htmlDocument({ title: titulo, extraCss: CANTINA_CSS, body: pages.join('') })
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
