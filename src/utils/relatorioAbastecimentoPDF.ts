import type jsPDF from 'jspdf'
import type { Chart } from 'chart.js'
import { renderRelatorioHeader, type HeaderContext } from './relatorioHeaderPDF'

export interface Agregado {
  label: string
  valor: number
}

export interface DetalheMaquinaPDF {
  maquina: string
  totalLitros: number
  numAbastecimentos: number
  mediaLitros: number
  maiorAbastecimento: number
  primeiraData: string
  ultimaData: string
  combustiveis: string[]
  operadores: string[]
  placas: string[]
}

export interface FiltrosAtivos {
  dataInicio: string
  dataFim: string
  maquinas: string[]
  combustiveis: string[]
  operacoes: string[]
}

export interface DadosPDFRelatorioAbastecimento {
  titulo: string
  fazendaNome?: string
  fazendaLogoUrl?: string | null
  filtros: FiltrosAtivos
  porMaquina: Agregado[]
  porCombustivel: Agregado[]
  porOperacao: Agregado[]
  totalLitros: number
  totalRegistros: number
  detalhesPorMaquina: DetalheMaquinaPDF[]
}

// === Paleta de cores (identidade visual Manejus 360) ===
const GREEN_DARK = '#0F6437'
const GREEN_CARD = '#0F6437'
const WHITE = '#FFFFFF'
const DARK_TEXT = '#1F2937'
const MEDIUM_TEXT = '#6B7280'
const LIGHT_BG = '#F5F5F5'
const CARD_BG = '#FFFFFF'
const SHADOW_COLOR = '#00000012'
const BLUE_BAR = '#1E3A5F'

function hexToRgb(hex: string): [number, number, number] {
  let cleaned = hex.replace('#', '')
  if (cleaned.length === 3) {
    cleaned = cleaned.split('').map((c) => c + c).join('')
  }
  return [
    parseInt(cleaned.substring(0, 2), 16),
    parseInt(cleaned.substring(2, 4), 16),
    parseInt(cleaned.substring(4, 6), 16),
  ]
}

function setFillColor(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgb(hex)
  doc.setFillColor(r, g, b)
}

function setTextColor(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgb(hex)
  doc.setTextColor(r, g, b)
}

async function carregarLogoComoBase64(path: string): Promise<string> {
  const response = await fetch(path)
  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function formatarData(d: string): string {
  if (!d) return '—'
  const parts = d.split('-')
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
  return d
}

function formatarDataCurta(d: string): string {
  if (!d) return '—'
  const parts = d.split('-')
  if (parts.length === 3) return `${parts[2]}/${parts[1]}`
  return d
}

function formatarInteiro(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || isNaN(valor)) return '—'
  return Math.round(valor).toLocaleString('pt-BR')
}

// === Renderização de gráficos ===

async function renderizarGraficoBarras(
  dados: Agregado[],
  width: number,
  height: number,
  cor: string,
  horizontal: boolean
): Promise<string | null> {
  if (dados.length === 0) return null

  const canvas = document.createElement('canvas')
  const pxPerMm = 5
  canvas.width = Math.round(width * pxPerMm)
  canvas.height = Math.round(height * pxPerMm)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const labels = dados.map((d) => d.label)
  const valores = dados.map((d) => Number(d.valor))

  const { Chart, registerables } = await import('chart.js')
  Chart.register(...registerables)
  const chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.map((l) => l.length > 14 ? l.substring(0, 13) + '…' : l),
      datasets: [{
        label: 'Litros',
        data: valores,
        backgroundColor: cor,
        borderRadius: 4,
        borderSkipped: false,
        barPercentage: 0.5,
        categoryPercentage: 0.7,
      }],
    },
    options: {
      indexAxis: horizontal ? 'y' : 'x',
      responsive: false,
      animation: false,
      maintainAspectRatio: false,
      layout: {
        padding: { top: horizontal ? 18 : 26, right: horizontal ? 95 : 25, bottom: 25, left: horizontal ? 22 : 25 },
      },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
      },
      scales: {
        x: {
          ticks: {
            color: '#000000',
            font: { size: horizontal ? 10 : 11 },
            maxRotation: horizontal ? 0 : 35,
            minRotation: horizontal ? 0 : 35,
            callback(value: any, _index: number, _values: any) {
              const label = this.getLabelForValue(value)
              return label.length > 10 ? label.substring(0, 9) + '…' : label
            },
          },
          grid: { color: '#E5E7EB' },
        },
        y: {
          ticks: {
            color: '#000000',
            font: { size: horizontal ? 11 : 10 },
            callback(value: any, _index: number, _values: any) {
              const label = this.getLabelForValue(value)
              return label.length > 12 ? label.substring(0, 11) + '…' : label
            },
          },
          grid: { color: '#E5E7EB' },
          beginAtZero: true,
        },
      },
    },
    plugins: [{
      id: 'dataLabels',
      afterDatasetsDraw(chartInstance: Chart) {
        const { ctx: c } = chartInstance
        const meta = chartInstance.getDatasetMeta(0)
        const dataset = chartInstance.data.datasets[0] as any
        c.save()
        c.textAlign = 'center'
        c.font = `bold ${horizontal ? 10 : 11}px Inter, sans-serif`
        c.fillStyle = '#000000'
        meta.data.forEach((bar: any, j: number) => {
          const value = Number(dataset.data[j]).toLocaleString('pt-BR') + 'L'
          const metrics = c.measureText(value)
          if (horizontal) {
            c.textAlign = 'left'
            c.fillText(value, bar.x + 4, bar.y + 3)
          } else {
            const canvasWidth = chartInstance.width
            const minX = metrics.width / 2 + 8
            const maxX = canvasWidth - metrics.width / 2 - 8
            const labelX = Math.min(Math.max(bar.x, minX), maxX)
            c.fillText(value, labelX, bar.y - 6)
          }
        })
        c.restore()
      },
    } as any],
  })

  await new Promise((r) => setTimeout(r, 100))
  const dataUrl = canvas.toDataURL('image/png')
  chart.destroy()

  return dataUrl
}

// === Context de renderização ===

interface RenderContext {
  doc: jsPDF
  pageW: number
  pageH: number
  logoBase64: string
  logoFazendaBase64: string
  fazendaNome: string
}

// === Header (delegado para relatorioHeaderPDF) ===

function renderHeader(ctx: RenderContext, titulo: string) {
  const headerCtx: HeaderContext = {
    doc: ctx.doc,
    pageW: ctx.pageW,
    logoGestaoBase64: ctx.logoBase64,
    logoFazendaBase64: ctx.logoFazendaBase64,
  }
  renderRelatorioHeader(headerCtx, {
    titulo,
    subtitulo: ctx.fazendaNome || undefined,
  })
}

// === Pill de período ===

function renderPeriodo(ctx: RenderContext, filtros: FiltrosAtivos, detalhes: DetalheMaquinaPDF[]) {
  const { doc } = ctx
  const hasData = filtros.dataInicio || filtros.dataFim
  const dataInicioFmt = filtros.dataInicio ? formatarData(filtros.dataInicio) : 'Início'
  const dataFimFmt = filtros.dataFim ? formatarData(filtros.dataFim) : 'Hoje'
  const periodoText = hasData
    ? `${dataInicioFmt}  a  ${dataFimFmt}`
    : (() => {
        const primeira = detalhes
          .map((d) => d.primeiraData)
          .filter(Boolean)
          .sort()[0]
        const hoje = new Date()
        const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`
        if (primeira) {
          return `${formatarDataCurta(primeira)}  a  ${formatarDataCurta(hojeStr)}`
        }
        return 'Todo o período'
      })()

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  const periodoW = doc.getTextWidth(periodoText) + 12
  const periodoX = 8
  const periodoY = 32

  setFillColor(doc, SHADOW_COLOR)
  doc.roundedRect(periodoX + 0.5, periodoY + 0.5, periodoW, 10, 5, 5, 'F')
  setFillColor(doc, CARD_BG)
  doc.roundedRect(periodoX, periodoY, periodoW, 10, 5, 5, 'F')
  setTextColor(doc, DARK_TEXT)
  doc.text(periodoText, periodoX + periodoW / 2, periodoY + 6.5, { align: 'center' })
}

// === KPIs e pills de filtro ===

function renderKPIsEFiltros(
  ctx: RenderContext,
  dados: DadosPDFRelatorioAbastecimento,
): { chartX: number; chartW: number } {
  const { doc, pageW } = ctx

  // KPIs laterais (coluna esquerda)
  const kpiX = 6
  const kpiW = 36
  const kpiH = 17
  const kpiGap = 3.5
  let kpiY = 48

  const maiorConsumidor = dados.porMaquina.length > 0 ? dados.porMaquina[0].label : '—'

  const kpiCards = [
    { label: 'Total Litros', value: `${formatarInteiro(dados.totalLitros)} L` },
    { label: 'Registros', value: formatarInteiro(dados.totalRegistros) },
    { label: 'Maior Consumidor', value: maiorConsumidor.length > 12 ? maiorConsumidor.substring(0, 11) + '…' : maiorConsumidor },
    { label: 'Máquinas', value: formatarInteiro(dados.porMaquina.length) },
    { label: 'Combustíveis', value: formatarInteiro(dados.porCombustivel.length) },
    { label: 'Operações', value: formatarInteiro(dados.porOperacao.length) },
  ]

  kpiCards.forEach((k) => {
    setFillColor(doc, SHADOW_COLOR)
    doc.roundedRect(kpiX + 0.5, kpiY + 0.5, kpiW, kpiH, 4, 4, 'F')
    setFillColor(doc, GREEN_CARD)
    doc.roundedRect(kpiX, kpiY, kpiW, kpiH, 4, 4, 'F')
    doc.setFontSize(11)
    setTextColor(doc, WHITE)
    doc.setFont('helvetica', 'bold')
    doc.text(k.value, kpiX + kpiW / 2, kpiY + 7, { align: 'center' })
    doc.setFontSize(8)
    setTextColor(doc, WHITE)
    doc.setFont('helvetica', 'normal')
    doc.text(k.label, kpiX + kpiW / 2, kpiY + 13, { align: 'center' })
    kpiY += kpiH + kpiGap
  })

  // Pills de filtros ativos (linha superior, ao lado dos KPIs)
  const pillY = 48
  const pillX = kpiX + kpiW + 10
  const pillH = 17
  const pillGap = 7

  const filtros: { label: string; value: string }[] = []
  if (dados.filtros.maquinas.length > 0) {
    filtros.push({
      label: 'Máquinas',
      value: dados.filtros.maquinas.length === 1
        ? dados.filtros.maquinas[0]
        : `${dados.filtros.maquinas.length} selecionadas`,
    })
  }
  if (dados.filtros.combustiveis.length > 0) {
    filtros.push({
      label: 'Combustíveis',
      value: dados.filtros.combustiveis.length === 1
        ? dados.filtros.combustiveis[0]
        : `${dados.filtros.combustiveis.length} selecionados`,
    })
  }
  if (dados.filtros.operacoes.length > 0) {
    filtros.push({
      label: 'Operações',
      value: dados.filtros.operacoes.length === 1
        ? dados.filtros.operacoes[0]
        : `${dados.filtros.operacoes.length} selecionadas`,
    })
  }

  const chartX = pillX
  const chartW = pageW - chartX - 8

  if (filtros.length > 0) {
    const pillWidth = Math.max(
      40,
      ...filtros.map((p) => Math.max(doc.getTextWidth(p.value) + 10, doc.getTextWidth(p.label) + 16))
    )
    const totalPillsWidth = pillWidth * filtros.length + pillGap * (filtros.length - 1)
    let pillXAtual = chartX + (chartW - totalPillsWidth) / 2

    filtros.forEach((p) => {
      setFillColor(doc, SHADOW_COLOR)
      doc.roundedRect(pillXAtual + 0.5, pillY + 0.5, pillWidth, pillH, 4, 4, 'F')
      setFillColor(doc, GREEN_CARD)
      doc.roundedRect(pillXAtual, pillY, pillWidth, pillH, 4, 4, 'F')
      doc.setFontSize(10)
      setTextColor(doc, WHITE)
      doc.setFont('helvetica', 'bold')
      doc.text(p.value, pillXAtual + pillWidth / 2, pillY + 7, { align: 'center' })
      doc.setFontSize(8)
      setTextColor(doc, WHITE)
      doc.setFont('helvetica', 'normal')
      doc.text(p.label, pillXAtual + pillWidth / 2, pillY + 13, { align: 'center' })
      pillXAtual += pillWidth + pillGap
    })
  } else {
    // Pill "Sem filtros" quando não há filtros ativos
    const pillText = 'Sem filtros (todos os dados)'
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    const pillW = doc.getTextWidth(pillText) + 16
    const pillXAtual = chartX + (chartW - pillW) / 2

    setFillColor(doc, SHADOW_COLOR)
    doc.roundedRect(pillXAtual + 0.5, pillY + 0.5, pillW, pillH, 4, 4, 'F')
    setFillColor(doc, GREEN_CARD)
    doc.roundedRect(pillXAtual, pillY, pillW, pillH, 4, 4, 'F')
    doc.setFontSize(10)
    setTextColor(doc, WHITE)
    doc.setFont('helvetica', 'bold')
    doc.text(pillText, pillXAtual + pillW / 2, pillY + 11, { align: 'center' })
  }

  return { chartX, chartW }
}

// === Card de gráfico ===

async function renderChartCard(
  ctx: RenderContext,
  dados: Agregado[],
  chartX: number,
  chartY: number,
  chartW: number,
  chartH: number,
  titulo: string,
  cor: string,
  horizontal: boolean,
): Promise<void> {
  const { doc } = ctx

  // Título acima do card
  doc.setFontSize(10)
  setTextColor(doc, DARK_TEXT)
  doc.setFont('helvetica', 'bold')
  doc.text(titulo, chartX + 2, chartY - 2)

  // Card branco com sombra
  setFillColor(doc, SHADOW_COLOR)
  doc.roundedRect(chartX + 0.5, chartY + 0.5, chartW, chartH, 4, 4, 'F')
  setFillColor(doc, CARD_BG)
  doc.roundedRect(chartX, chartY, chartW, chartH, 4, 4, 'F')

  if (dados.length === 0) {
    doc.setFontSize(11)
    setTextColor(doc, MEDIUM_TEXT)
    doc.setFont('helvetica', 'italic')
    doc.text('Sem dados para os filtros selecionados', chartX + chartW / 2, chartY + chartH / 2, { align: 'center' })
    return
  }

  try {
    const graficoBase64 = await renderizarGraficoBarras(dados, chartW, chartH, cor, horizontal)
    if (graficoBase64) {
      doc.addImage(graficoBase64, 'PNG', chartX, chartY, chartW, chartH)
    }
  } catch (err) {
    console.error('Erro ao renderizar gráfico:', err)
    doc.setFontSize(10)
    setTextColor(doc, MEDIUM_TEXT)
    doc.text('Erro ao renderizar gráfico.', chartX + chartW / 2, chartY + chartH / 2, { align: 'center' })
  }
}

// === Tabela 1: Detalhamento por máquina (colunas 1-5) ===

async function renderTabelaDetalhamento(
  ctx: RenderContext,
  detalhes: DetalheMaquinaPDF[],
  totalLitros: number,
  totalRegistros: number,
  startY: number,
  margin: number,
): Promise<number> {
  const { doc } = ctx
  const autoTableMod = await import('jspdf-autotable')

  doc.setFontSize(10)
  setTextColor(doc, DARK_TEXT)
  doc.setFont('helvetica', 'bold')
  doc.text('Detalhamento por Máquina/Veículo', margin, startY - 2)

  const fmtData = (d: string) => {
    if (!d || d === '—') return '—'
    const parts = d.split('-')
    if (parts.length === 3) return `${parts[2]}/${parts[1]}`
    return d
  }

  const tabelaDados = detalhes.map((d) => {
    const pct = totalLitros > 0 ? (d.totalLitros / totalLitros) * 100 : 0
    return [
      d.maquina,
      `${d.totalLitros.toLocaleString('pt-BR')} L`,
      `${pct.toFixed(1)}%`,
      String(d.numAbastecimentos),
      d.mediaLitros.toLocaleString('pt-BR', { maximumFractionDigits: 0 }),
      d.maiorAbastecimento.toLocaleString('pt-BR', { maximumFractionDigits: 0 }),
      `${fmtData(d.primeiraData)}-${fmtData(d.ultimaData)}`,
      d.combustiveis.join(', ') || '—',
    ]
  })

  tabelaDados.push([
    'Total',
    `${totalLitros.toLocaleString('pt-BR')} L`,
    '100%',
    String(totalRegistros),
    '',
    '',
    '',
    '',
  ])

  // @ts-ignore
  autoTableMod.default(doc, {
    startY,
    head: [['Máquina/Veículo', 'Litros', '% Total', 'Nº abast.', 'Média (L)', 'Maior (L)', 'Período', 'Combustíveis']],
    body: tabelaDados,
    theme: 'grid',
    headStyles: {
      fillColor: hexToRgb(GREEN_DARK),
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: 8,
      textColor: hexToRgb(DARK_TEXT),
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 28, halign: 'right' },
      2: { cellWidth: 22, halign: 'right' },
      3: { cellWidth: 22, halign: 'right' },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 22, halign: 'right' },
      6: { cellWidth: 40, halign: 'center' },
      7: { cellWidth: 'auto' },
    },
    margin: { left: margin, right: margin },
  })

  // @ts-ignore
  return doc.lastAutoTable?.finalY ?? startY + 20
}

// === Tabela 2: Detalhamento operacional (colunas 6-9) ===

async function renderTabelaOperacional(
  ctx: RenderContext,
  detalhes: DetalheMaquinaPDF[],
  startY: number,
  margin: number,
): Promise<number> {
  const { doc } = ctx
  const autoTableMod = await import('jspdf-autotable')

  doc.setFontSize(10)
  setTextColor(doc, DARK_TEXT)
  doc.setFont('helvetica', 'bold')
  doc.text('Detalhamento Operacional', margin, startY - 2)

  const tabelaDados = detalhes.map((d) => [
    d.maquina,
    d.operadores.join(', ') || '—',
    d.placas.join(', ') || '—',
  ])

  // @ts-ignore
  autoTableMod.default(doc, {
    startY,
    head: [['Máquina/Veículo', 'Operador(es)', 'Placa(s)']],
    body: tabelaDados,
    theme: 'grid',
    headStyles: {
      fillColor: hexToRgb(GREEN_DARK),
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: 8,
      textColor: hexToRgb(DARK_TEXT),
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 35 },
      3: { cellWidth: 40 },
    },
    margin: { left: margin, right: margin },
  })

  // @ts-ignore
  return doc.lastAutoTable?.finalY ?? startY + 20
}

// === Função principal ===

export async function gerarPDFRelatorioAbastecimento(dados: DadosPDFRelatorioAbastecimento): Promise<Blob> {
  const jsPDFMod = await import('jspdf')
  const doc = new jsPDFMod.default({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })

  const pageW = 297
  const pageH = 210
  const margin = 8

  let logoBase64 = ''
  try {
    logoBase64 = await carregarLogoComoBase64('/images/manejus360.png')
  } catch {
    // Silenciosamente continua sem logo
  }

  // Carregar logo da fazenda se disponível
  let logoFazendaBase64 = ''
  if (dados.fazendaLogoUrl) {
    try {
      logoFazendaBase64 = await carregarLogoComoBase64(dados.fazendaLogoUrl)
    } catch {
      // Silenciosamente continua sem logo da fazenda
    }
  }

  const ctx: RenderContext = {
    doc, pageW, pageH, logoBase64,
    logoFazendaBase64,
    fazendaNome: dados.fazendaNome || '',
  }

  // === Página 1: Fundo + Header + Período + KPIs + Gráfico principal ===
  setFillColor(doc, LIGHT_BG)
  doc.rect(0, 0, pageW, pageH, 'F')

  const tituloPDF = 'Relatório de Abastecimento'

  renderHeader(ctx, tituloPDF)
  renderPeriodo(ctx, dados.filtros, dados.detalhesPorMaquina)
  const { chartX, chartW } = renderKPIsEFiltros(ctx, dados)

  // Gráfico principal: Litros por Máquina (ocupa largura total ao lado dos KPIs)
  const grafico1Y = 40
  const grafico1H = 72
  await renderChartCard(ctx, dados.porMaquina, chartX, grafico1Y, chartW, grafico1H, 'Litros por Máquina/Veículo', GREEN_DARK, false)

  // Gráficos 2 e 3 lado a lado (combustível e operação)
  const graficosY = grafico1Y + grafico1H + 10
  const halfW = (chartW - 6) / 2
  const grafico23H = 58

  await renderChartCard(ctx, dados.porCombustivel, chartX, graficosY, halfW, grafico23H, 'Litros por Combustível', BLUE_BAR, true)
  await renderChartCard(ctx, dados.porOperacao, chartX + halfW + 6, graficosY, halfW, grafico23H, 'Litros por Operação', GREEN_DARK, true)

  // Tabela detalhada (página 2 se não couber)
  let tabelaY = graficosY + grafico23H + 12
  const tabelaHEstimada = 20 + dados.detalhesPorMaquina.length * 7

  if (tabelaY + tabelaHEstimada > pageH - 15) {
    // Nova página
    doc.addPage()
    setFillColor(doc, LIGHT_BG)
    doc.rect(0, 0, pageW, pageH, 'F')
    renderHeader(ctx, tituloPDF)
    tabelaY = 40
  }

  // Tabela 1: Detalhamento por máquina (colunas 1-5)
  let finalY = await renderTabelaDetalhamento(ctx, dados.detalhesPorMaquina, dados.totalLitros, dados.totalRegistros, tabelaY, margin)

  // Tabela 2: Detalhamento operacional (colunas 6-9)
  let tabela2StartY = finalY + 18
  const tabela2HEstimada = 20 + dados.detalhesPorMaquina.length * 7

  if (tabela2StartY + tabela2HEstimada > pageH - 15) {
    doc.addPage()
    setFillColor(doc, LIGHT_BG)
    doc.rect(0, 0, pageW, pageH, 'F')
    renderHeader(ctx, tituloPDF)
    tabela2StartY = 40
  }

  await renderTabelaOperacional(ctx, dados.detalhesPorMaquina, tabela2StartY, margin)

  // === Footer em todas as páginas ===
  const numPaginas = doc.getNumberOfPages()
  for (let i = 1; i <= numPaginas; i++) {
    doc.setPage(i)
    setTextColor(doc, MEDIUM_TEXT)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    const dataGeracao = new Date().toLocaleString('pt-BR')
    doc.text(
      `Gerado em ${dataGeracao} · Manejus 360 · Relatório interativo`,
      margin,
      pageH - 5
    )
    doc.text(`Página ${i} de ${numPaginas}`, pageW - margin, pageH - 5, { align: 'right' })
  }

  return doc.output('blob')
}
