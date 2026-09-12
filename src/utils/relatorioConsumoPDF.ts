import type jsPDF from 'jspdf'
import type Chart from 'chart.js/auto'
import { renderRelatorioHeader, type HeaderContext } from './relatorioHeaderPDF'

export interface DadoRelatorioConsumo {
  data: string
  data_label: string
  trato_kg_cab_dia: number
  consumo_percent_pv: number
  leitura_cocho: number | null
  custo_reais_cab_dia: number | null
}

export interface InfoLote {
  lote_id: string
  lote_nome: string
  fazenda_id: string
  fazenda_nome?: string
  fazenda_logo_url?: string | null
  peso_entrada_kg: number | null
  peso_atual_kg: number | null
  dias: number | null
  data_prevista_final: string | null
  n_cabecas_atual: number | null
  raca: string | null
  categoria: string | null
  dieta: string | null
  data_inicio_plano: string | null
  erro?: { categoria: string; dados_faltantes: string[] }[] | null
}

export interface ParametrosRelatorioConsumo {
  dataInicio: string
  dataFim: string
  lotes: LoteRelatorio[]
}

export interface LoteRelatorio {
  info: InfoLote
  dados: DadoRelatorioConsumo[]
}

const MAX_DATA_POINTS_PER_PAGE = 20

function formatarDataNumerica(dataStr: string | null | undefined): string {
  if (!dataStr) return '—'
  const d = new Date(dataStr)
  if (isNaN(d.getTime())) return '—'
  const dia = d.getUTCDate().toString().padStart(2, '0')
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0')
  const ano = d.getUTCFullYear()
  return `${dia}/${mes}/${ano}`
}

function formatarNumero(
  valor: number | null | undefined,
  casas = 2,
  padrao = '—'
): string {
  if (valor === null || valor === undefined || isNaN(valor)) return padrao
  return valor.toFixed(casas).replace('.', ',')
}

function formatarInteiro(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || isNaN(valor)) return '—'
  return Math.round(valor).toString()
}

export async function carregarLogoComoBase64(path: string): Promise<string> {
  const response = await fetch(path)
  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function hexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace('#', '')
  const r = parseInt(cleaned.substring(0, 2), 16)
  const g = parseInt(cleaned.substring(2, 4), 16)
  const b = parseInt(cleaned.substring(4, 6), 16)
  return [r, g, b]
}

function setFillColor(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgb(hex)
  doc.setFillColor(r, g, b)
}

function setTextColor(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgb(hex)
  doc.setTextColor(r, g, b)
}

async function renderizarGraficoConsumo(dados: DadoRelatorioConsumo[], width: number, height: number): Promise<string | null> {
  const canvas = document.createElement('canvas')
  const pxPerMm = 5
  canvas.width = Math.round(width * pxPerMm)
  canvas.height = Math.round(height * pxPerMm)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não foi possível criar contexto 2D')

  ctx.fillStyle = '#F9FAFB'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const blueBar = '#1E3A5F'
  const greenLine = '#10B981'
  const white = '#FFFFFF'
  const leituraColor = '#6B7280'
  const darkText = '#1F2937'
  const mediumText = '#6B7280'

  const ChartMod = await import('chart.js/auto')
  const chart = new ChartMod.default(ctx, {
    type: 'bar',
    data: {
      labels: dados.map((d) => d.data_label),
      datasets: [
        {
          label: 'CMS (kg/cab/dia)',
          data: dados.map((d) => d.trato_kg_cab_dia),
          backgroundColor: blueBar,
          borderRadius: 4,
          borderSkipped: false,
          yAxisID: 'y',
          order: 1,
          barPercentage: 0.55,
          categoryPercentage: 0.8,
        },
        {
          type: 'line' as any,
          label: 'Consumo %PV',
          data: dados.map((d) => d.consumo_percent_pv),
          borderColor: greenLine,
          backgroundColor: greenLine,
          borderWidth: 3,
          pointRadius: 6,
          pointBackgroundColor: greenLine,
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 2,
          yAxisID: 'y1',
          order: 0,
          tension: 0.3,
          datalabels: {
            align: 'top',
            anchor: 'end',
          } as any,
        },
        {
          type: 'line' as any,
          label: 'Leitura de Cocho',
          data: dados.map((d) => (d.leitura_cocho != null ? Number(d.leitura_cocho) : NaN)),
          borderColor: leituraColor,
          backgroundColor: leituraColor,
          borderWidth: 0,
          showLine: false,
          pointRadius: 4,
          pointBackgroundColor: leituraColor,
          pointBorderColor: white,
          pointBorderWidth: 1.5,
          yAxisID: 'y2',
          order: 2,
          tension: 0.2,
        },
      ],
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      animation: false,
      layout: {
        padding: { top: 35, right: 20, bottom: 42, left: 45 },
      },
      plugins: {
        legend: {
          position: 'top',
          align: 'center',
          labels: {
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 16,
            color: darkText,
            font: { size: 12, weight: 'bold' },
          },
        },
        title: {
          display: true,
          text: 'Consumo Médio %PV',
          align: 'center',
          color: darkText,
          font: { size: 28, weight: 'bold' },
          padding: { bottom: 10 },
        },
        tooltip: { enabled: false },
        datalabels: { display: false } as any,
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: mediumText,
            font: { size: 12 },
          },
          title: {
            display: true,
            text: 'Dias',
            color: mediumText,
            font: { size: 20, weight: 'bold' },
            padding: { top: 15 },
          },
        },
        y: {
          position: 'left',
          title: {
            display: true,
            text: 'CMS (kg/cab/dia)',
            color: darkText,
            font: { size: 20, weight: 'bold' },
          },
          ticks: {
            color: mediumText,
            font: { size: 12 },
          },
          grid: {
            color: '#E5E7EB',
            drawBorder: false,
          },
          beginAtZero: true,
          suggestedMax: Math.max(...dados.map((d) => d.trato_kg_cab_dia)) * 1.15,
        },
        y1: {
          position: 'right',
          title: {
            display: true,
            text: '% PV',
            color: greenLine,
            font: { size: 20, weight: 'bold' },
          },
          ticks: {
            color: greenLine,
            font: { size: 12 },
            callback: (val: number | string) => `${Number(val).toFixed(1)}%`,
          },
          grid: { display: false },
          beginAtZero: true,
          suggestedMax: Math.max(...dados.map((d) => d.consumo_percent_pv)) * 1.25,
        },
        y2: {
          display: false,
          min: -1,
          max: 25,
        },
      },
    },
    plugins: [{
      id: 'customLabels',
      afterDatasetsDraw(chart: Chart) {
        const { ctx } = chart
        ctx.save()
        ctx.textAlign = 'center'

        const tratoMeta = chart.getDatasetMeta(0)
        const consumoMeta = chart.getDatasetMeta(1)
        const leituraMeta = chart.getDatasetMeta(2)
        const tratoDataset = chart.data.datasets[0] as any
        const consumoDataset = chart.data.datasets[1] as any
        const leituraDataset = chart.data.datasets[2] as any

        // 1. Rótulos do CMS (barras)
        ctx.font = 'bold 16px Inter, sans-serif'
        ctx.fillStyle = darkText
        tratoMeta.data.forEach((bar: any, j: number) => {
          const value = Number(tratoDataset.data[j]).toFixed(2)
          ctx.fillText(value, bar.x, bar.y - 14)
        })

        // 2. Linha e rótulos da Leitura de Cocho
        const validLeitura = leituraMeta.data.filter((pt: any) => !pt.skip)
        if (validLeitura.length > 1) {
          ctx.beginPath()
          ctx.strokeStyle = leituraColor
          ctx.lineWidth = 2.5
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.moveTo(validLeitura[0].x, validLeitura[0].y)
          for (let k = 1; k < validLeitura.length; k++) {
            ctx.lineTo(validLeitura[k].x, validLeitura[k].y)
          }
          ctx.stroke()
        }

        validLeitura.forEach((pt: any) => {
          ctx.beginPath()
          ctx.arc(pt.x, pt.y, 4, 0, 2 * Math.PI)
          ctx.fillStyle = leituraColor
          ctx.fill()
          ctx.lineWidth = 1.5
          ctx.strokeStyle = white
          ctx.stroke()
        })

        // Pré-calcula posições Y do Consumo %PV para detecção de colisão
        const consumoYByIndex = new Map<number, number>()
        consumoMeta.data.forEach((pt: any, j: number) => {
          if (!pt.skip) consumoYByIndex.set(j, pt.y)
        })

        ctx.font = 'bold 11px Inter, sans-serif'
        leituraMeta.data.forEach((pt: any, j: number) => {
          if (pt.skip) return
          const value = leituraDataset.data[j]?.toString() ?? ''
          // Colisão com ponto do Consumo %PV: move o label para baixo do ponto,
          // mesmo comportamento do Consumo %PV quando colide com a barra de CMS.
          const consumoY = consumoYByIndex.get(j)
          const COLLISION_THRESHOLD = 24
          const colideComConsumo = consumoY != null && Math.abs(pt.y - consumoY) < COLLISION_THRESHOLD
          const labelY = colideComConsumo ? pt.y + 20 : pt.y - 10
          ctx.lineWidth = 2
          ctx.strokeStyle = darkText
          ctx.strokeText(value, pt.x, labelY)
          ctx.fillStyle = white
          ctx.fillText(value, pt.x, labelY)
        })

        // 3. Rótulos do Consumo %PV (desenhados por último, com posição dinâmica)
        // Prevenção de colisão baseada exclusivamente em posição gráfica (pixels):
        // mede a distância entre o ponto da linha e o topo da barra; se inferior
        // ao threshold, reposiciona o label para baixo do ponto (lado oposto).
        ctx.font = 'bold 16px Inter, sans-serif'
        ctx.fillStyle = greenLine
        consumoMeta.data.forEach((pt: any, j: number) => {
          const value = `${Number(consumoDataset.data[j]).toFixed(2)}%`
          const bar = tratoMeta.data[j]
          const OFFSET_DEFAULT = 18
          const OFFSET_COLLISION = 20
          const COLLISION_THRESHOLD = 18
          const barraTopo = bar ? bar.y : null
          const colide = barraTopo != null && Math.abs(pt.y - barraTopo) < COLLISION_THRESHOLD
          const labelY = colide ? pt.y + OFFSET_COLLISION : pt.y - OFFSET_DEFAULT
          ctx.fillText(value, pt.x, labelY)
        })

        ctx.restore()
      },
    } as any],
  })

  const image = chart.toBase64Image()
  chart.destroy()
  return image
}

interface RenderContext {
  doc: jsPDF
  pageW: number
  pageH: number
  logoGestaoBase64: string
  logoFazendaBase64: string
  fazendaNome: string
  greenDark: string
  greenCard: string
  white: string
  darkText: string
  mediumText: string
  lightBg: string
  cardBg: string
  shadowColor: string
}

function renderHeader(ctx: RenderContext, loteNome: string, isContinuation: boolean) {
  const headerCtx: HeaderContext = {
    doc: ctx.doc,
    pageW: ctx.pageW,
    logoGestaoBase64: ctx.logoGestaoBase64,
    logoFazendaBase64: ctx.logoFazendaBase64,
  }
  renderRelatorioHeader(headerCtx, {
    titulo: isContinuation ? 'Análise de Consumo (continuação)' : 'Análise de Consumo',
    subtitulo: ctx.fazendaNome || undefined,
    pillLabel: loteNome,
  })
}

function renderPeriodo(ctx: RenderContext, dataInicio: string, dataFim: string) {
  const { doc, cardBg, darkText, shadowColor } = ctx
  const dataInicioFormatada = formatarDataNumerica(dataInicio)
  const dataFimFormatada = formatarDataNumerica(dataFim)
  const periodoText = `${dataInicioFormatada}  a  ${dataFimFormatada}`
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  const periodoW = doc.getTextWidth(periodoText) + 12
  const periodoX = 8
  const periodoY = 34
  setFillColor(doc, shadowColor)
  doc.roundedRect(periodoX + 0.5, periodoY + 0.5, periodoW, 10, 5, 5, 'F')
  setFillColor(doc, cardBg)
  doc.roundedRect(periodoX, periodoY, periodoW, 10, 5, 5, 'F')
  setTextColor(doc, darkText)
  doc.text(periodoText, periodoX + periodoW / 2, periodoY + 6.5, { align: 'center' })
}

function renderKPIsAndPills(ctx: RenderContext, info: InfoLote, dados: DadoRelatorioConsumo[], dataInicio: string, dataFim: string) {
  const { doc, pageW, greenCard, white, shadowColor } = ctx

  // KPIs laterais (coluna esquerda)
  const kpiX = 6
  const kpiW = 36
  const kpiH = 19
  const kpiGap = 3.5
  let kpiY = 64.25

  const consumoMedio = dados.length
    ? dados.reduce((s, d) => s + d.consumo_percent_pv, 0) / dados.length
    : null

  const custoMedio =
    dados.length && dados.some((d) => d.custo_reais_cab_dia != null)
      ? dados.reduce((s, d) => s + (d.custo_reais_cab_dia || 0), 0) /
        dados.filter((d) => d.custo_reais_cab_dia != null).length
      : null

  const kpiCards = [
    { label: 'Peso Entrada (kg)', value: formatarInteiro(info.peso_entrada_kg) },
    { label: 'Consumo %PV', value: `${formatarNumero(consumoMedio, 2)}%` },
    { label: 'R$/cab/dia', value: `R$ ${formatarNumero(custoMedio, 2)}` },
    { label: 'Peso Atual (kg)', value: formatarNumero(info.peso_atual_kg, 2) },
    { label: 'Período (dias)', value: formatarInteiro(info.dias) },
    { label: 'Data Prevista Final', value: formatarDataNumerica(info.data_prevista_final) },
  ]

  kpiCards.forEach((k) => {
    setFillColor(doc, shadowColor)
    doc.roundedRect(kpiX + 0.5, kpiY + 0.5, kpiW, kpiH, 4, 4, 'F')
    setFillColor(doc, greenCard)
    doc.roundedRect(kpiX, kpiY, kpiW, kpiH, 4, 4, 'F')
    doc.setFontSize(11)
    setTextColor(doc, white)
    doc.setFont('helvetica', 'bold')
    doc.text(k.value, kpiX + kpiW / 2, kpiY + 7.5, { align: 'center' })
    doc.setFontSize(9)
    setTextColor(doc, white)
    doc.setFont('helvetica', 'normal')
    doc.text(k.label, kpiX + kpiW / 2, kpiY + 15, { align: 'center' })
    kpiY += kpiH + kpiGap
  })

  // Pills superiores (mede o período para não sobrepor a data à esquerda)
  const pillY = 34
  const pillGap = 7
  const pillPadding = 8
  const minPillWidth = 40
  const rightMargin = 8
  const pills = [
    { label: 'Nº Cab. Atual', value: formatarInteiro(info.n_cabecas_atual) },
    { label: 'Raça', value: info.raca || '—' },
    { label: 'Categoria', value: (info.categoria ? info.categoria.split(/,\s*/).map((c) => c.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')).join(', ') : '—') },
    { label: 'Dieta', value: info.dieta || '—' },
  ]

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  const periodoText = `${formatarDataNumerica(dataInicio)}  a  ${formatarDataNumerica(dataFim)}`
  const periodoW = doc.getTextWidth(periodoText) + 12
  const minPillStart = 8 + periodoW + 4

  const nPills = pills.length
  const maxPillWidth = Math.min(
    85,
    (pageW - rightMargin - minPillStart - pillGap * (nPills - 1)) / nPills
  )

  const valueLineH = 4
  const labelLineH = 3.5
  const valueLabelGap = 7.5

  const measuredPills = pills.map((p) => {
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    const valueLines = doc.splitTextToSize(p.value, maxPillWidth - pillPadding * 2) as string[]
    const valueLineW = Math.max(...valueLines.map((line) => doc.getTextWidth(line)))
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    const labelLines = doc.splitTextToSize(p.label, maxPillWidth - pillPadding * 2) as string[]
    const labelLineW = Math.max(...labelLines.map((line) => doc.getTextWidth(line)))
    const width = Math.max(minPillWidth, Math.max(valueLineW, labelLineW) + pillPadding * 2)
    const valueStartY = pillY + 7.5
    const labelStartY = valueStartY + (valueLines.length - 1) * valueLineH + valueLabelGap
    const height = labelStartY - pillY + (labelLines.length - 1) * labelLineH + 2
    return { ...p, width, valueLines, labelLines, height }
  })

  // Mantém o alinhamento do gráfico independente dos pills
  const chartX = kpiX + kpiW + 10
  const chartW = pageW - chartX - 8

  // Alinha a altura de todos os pills à altura do maior
  const pillRowH = Math.max(...measuredPills.map((p) => p.height))

  // Desenha cada pill com sua própria largura, a partir da data
  let pillXAtual = minPillStart
  measuredPills.forEach((p) => {
    const valueStartY = pillY + 7.5
    const labelStartY = valueStartY + (p.valueLines.length - 1) * valueLineH + valueLabelGap

    setFillColor(doc, shadowColor)
    doc.roundedRect(pillXAtual + 0.5, pillY + 0.5, p.width, pillRowH, 4, 4, 'F')
    setFillColor(doc, greenCard)
    doc.roundedRect(pillXAtual, pillY, p.width, pillRowH, 4, 4, 'F')

    doc.setFontSize(11)
    setTextColor(doc, white)
    doc.setFont('helvetica', 'bold')
    p.valueLines.forEach((line, i) => {
      doc.text(line, pillXAtual + p.width / 2, valueStartY + i * valueLineH, { align: 'center' })
    })

    doc.setFontSize(9)
    setTextColor(doc, white)
    doc.setFont('helvetica', 'normal')
    p.labelLines.forEach((line, i) => {
      doc.text(line, pillXAtual + p.width / 2, labelStartY + i * labelLineH, { align: 'center' })
    })

    pillXAtual += p.width + pillGap
  })

  return { chartX, chartW }
}

async function renderChartOnPage(ctx: RenderContext, dados: DadoRelatorioConsumo[], chartX: number, chartW: number, chartY: number, chartH: number) {
  const { doc, cardBg, mediumText, shadowColor } = ctx

  if (dados.length === 0) {
    doc.setFontSize(14)
    setTextColor(doc, mediumText)
    doc.text('Nenhum dado de suplementação encontrado no período.', ctx.pageW / 2, ctx.pageH / 2, { align: 'center' })
    return
  }

  // Card branco do gráfico
  setFillColor(doc, shadowColor)
  doc.roundedRect(chartX + 0.5, chartY + 0.5, chartW, chartH, 4, 4, 'F')
  setFillColor(doc, cardBg)
  doc.roundedRect(chartX, chartY, chartW, chartH, 4, 4, 'F')

  try {
    const graficoBase64 = await renderizarGraficoConsumo(dados, chartW, chartH)
    if (graficoBase64) {
      doc.addImage(graficoBase64, 'PNG', chartX, chartY, chartW, chartH)
    } else {
      doc.setFontSize(12)
      setTextColor(doc, mediumText)
      doc.text('Erro ao renderizar gráfico.', chartX + chartW / 2, chartY + chartH / 2, { align: 'center' })
    }
  } catch (err) {
    console.error('Erro ao renderizar gráfico:', err)
    doc.setFontSize(12)
    setTextColor(doc, mediumText)
    doc.text('Erro ao renderizar gráfico.', chartX + chartW / 2, chartY + chartH / 2, { align: 'center' })
  }
}

function chunkDados(dados: DadoRelatorioConsumo[], maxPerPage: number): DadoRelatorioConsumo[][] {
  if (dados.length <= maxPerPage) return [dados]
  const chunks: DadoRelatorioConsumo[][] = []
  for (let i = 0; i < dados.length; i += maxPerPage) {
    chunks.push(dados.slice(i, i + maxPerPage))
  }
  return chunks
}

export async function gerarRelatorioConsumoPDF(params: ParametrosRelatorioConsumo): Promise<Blob> {
  const { dataInicio, dataFim, lotes } = params

  const jsPDFMod = await import('jspdf')
  const doc = new jsPDFMod.default({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })

  const pageW = 297
  const pageH = 210

  const greenDark = '#0F6437'
  const greenCard = '#0F6437'
  const white = '#FFFFFF'
  const darkText = '#1F2937'
  const mediumText = '#6B7280'
  const lightBg = '#F5F5F5'
  const cardBg = '#FFFFFF'
  const shadowColor = '#00000012'

  let logoGestaoBase64 = ''
  try {
    logoGestaoBase64 = await carregarLogoComoBase64('/images/manejus360.png')
  } catch {
    // Silenciosamente continua sem logo
  }

  // Carregar logo da fazenda do primeiro lote (assumindo mesma fazenda)
  let logoFazendaBase64 = ''
  const primeiroInfo = lotes[0]?.info
  if (primeiroInfo?.fazenda_logo_url) {
    try {
      logoFazendaBase64 = await carregarLogoComoBase64(primeiroInfo.fazenda_logo_url)
    } catch {
      // Silenciosamente continua sem logo
    }
  }

  const fazendaNome = lotes[0]?.info?.fazenda_nome || ''

  const ctx: RenderContext = {
    doc, pageW, pageH, logoGestaoBase64, logoFazendaBase64, fazendaNome,
    greenDark, greenCard, white, darkText, mediumText, lightBg, cardBg, shadowColor,
  }

  let isFirstPage = true
  let dietaAnterior: string | null = null

  for (const lote of lotes) {
    const chunks = chunkDados(lote.dados, MAX_DATA_POINTS_PER_PAGE)
    const dietaAtual = lote.info.dieta || 'Sem dieta'
    const mudouDieta = dietaAnterior !== null && dietaAnterior !== dietaAtual

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci]
      const isContinuation = ci > 0

      if (isFirstPage) {
        isFirstPage = false
      } else {
        doc.addPage()
      }

      // Fundo cinza claro
      setFillColor(doc, lightBg)
      doc.rect(0, 0, pageW, pageH, 'F')

      // Header
      renderHeader(ctx, lote.info.lote_nome, isContinuation)

      if (!isContinuation) {
        // Página principal: período + KPIs + pills + gráfico
        renderPeriodo(ctx, dataInicio, dataFim)
        const { chartX, chartW } = renderKPIsAndPills(ctx, lote.info, lote.dados, dataInicio, dataFim)

        // Separador visual de dieta posicionado entre os pills e o gráfico
        if (dietaAnterior === null || mudouDieta) {
          const sepY = 56
          const sepText = `DIETA: ${dietaAtual.toUpperCase()}`
          doc.setFontSize(10)
          doc.setFont('helvetica', 'bold')
          setTextColor(doc, greenDark)
          const sepTextW = doc.getTextWidth(sepText)
          const sepTextX = pageW / 2 - sepTextW / 2
          // Linhas à esquerda e à direita
          doc.setDrawColor(180, 180, 180)
          doc.setLineWidth(0.3)
          doc.line(8, sepY, sepTextX - 4, sepY)
          doc.line(sepTextX + sepTextW + 4, sepY, pageW - 8, sepY)
          doc.text(sepText, pageW / 2, sepY + 1, { align: 'center' })
        }

        const chartY = 62
        const chartH = pageH - chartY - 8
        await renderChartOnPage(ctx, chunk, chartX, chartW, chartY, chartH)
      } else {
        // Página de continuação: header + gráfico ocupando mais espaço
        const chartX = 8
        const chartW = pageW - 16
        const chartY = 34
        const chartH = pageH - chartY - 8
        await renderChartOnPage(ctx, chunk, chartX, chartW, chartY, chartH)
      }
    }

    dietaAnterior = dietaAtual
  }

  return doc.output('blob')
}
