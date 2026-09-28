import type jsPDF from 'jspdf'
import { renderRelatorioHeader, type HeaderContext } from './relatorioHeaderPDF'

// === Paleta ===
const LIGHT_BG = '#F5F5F5'
const DARK_TEXT = '#1F2937'
const MEDIUM_TEXT = '#6B7280'
const CARD_BG = '#FFFFFF'
const SHADOW_COLOR = '#00000012'

// === Tipos ===

export interface StatusBebedouroPDF {
  nome: string
  dias: number | null
  cor: string
  meta: number | null
  ultimaLimpeza: string | null
  limpezasNoPeriodo: number
  statusLabel: string
}

export interface LimpezaDoDiaPDF {
  nome: string
  intervalo: number | null
  cor: string
  meta: number | null
  dataLimpeza: string
  dataLimpezaAnterior: string | null
  statusLabel: string
  responsavel: string | null
}

export interface LimpezaKPIsPDF {
  total: number
  emDia: number
  atrasado: number
  critico: number
  semRegistro: number
  pctEmDia: number
}

export interface LimpezaDiaKPIsPDF {
  limposNoDia: number
  dentroMeta: number
  acimaMeta: number
  muitoAcima: number
  intervaloMedio: number | null
}

export interface ChecklistItemRankingPDF {
  label: string
  pctNegativo: number
  negativos: number
  total: number
}

export interface OcorrenciaPDF {
  data: string
  bebedouro: string
  itensNegativos: string
  obsItens: string
  obsGeral: string
  responsavel: string
}

export interface DadosPDFBebedouros {
  titulo: string
  fazendaNome?: string
  fazendaLogoUrl?: string | null
  dataInicio: string
  dataFim: string
  ehDiaUnico: boolean
  diaUnico?: string
  // Seção 1 - modo normal
  limpezaKPIs?: LimpezaKPIsPDF
  maisAtrasado?: { nome: string; dias: number; meta: number } | null
  statusPorBebedouro?: StatusBebedouroPDF[]
  // Seção 1 - modo dia único
  limpezaDiaKPIs?: LimpezaDiaKPIsPDF
  limpezasDoDia?: LimpezaDoDiaPDF[]
  // Seção 2
  checklistKPIs: {
    totalRegistros: number
    comChecklist: number
    negativos: number
    pctNegativos: number
    itemMaisProblematico: { label: string; pctNegativo: number; negativos: number; total: number } | null
  }
  itensRanking: ChecklistItemRankingPDF[]
  ocorrencias: OcorrenciaPDF[]
}

// === Helpers ===

function hexToRgb(hex: string): [number, number, number] {
  let c = hex.replace('#', '')
  if (c.length === 3) c = c.split('').map((x) => x + x).join('')
  return [parseInt(c.substring(0, 2), 16), parseInt(c.substring(2, 4), 16), parseInt(c.substring(4, 6), 16)]
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
  const partes = d.split('T')[0].split('-')
  if (partes.length === 3) return `${partes[2]}/${partes[1]}/${partes[0]}`
  return d
}

// === Contexto ===

interface RenderContext {
  doc: jsPDF
  pageW: number
  pageH: number
  logoGestaoBase64: string
  logoFazendaBase64: string
  fazendaNome: string
}

function renderHeader(ctx: RenderContext, titulo: string, isContinuation: boolean) {
  const headerCtx: HeaderContext = {
    doc: ctx.doc,
    pageW: ctx.pageW,
    logoGestaoBase64: ctx.logoGestaoBase64,
    logoFazendaBase64: ctx.logoFazendaBase64,
  }
  renderRelatorioHeader(headerCtx, {
    titulo: isContinuation ? `${titulo} (continuação)` : titulo,
    subtitulo: ctx.fazendaNome || undefined,
  })
}

function renderPeriodo(ctx: RenderContext, dataInicio: string, dataFim: string, ehDiaUnico: boolean, diaUnico?: string) {
  const { doc, pageW } = ctx
  let texto: string
  if (ehDiaUnico && diaUnico) {
    texto = `Dia: ${formatarData(diaUnico)}`
  } else {
    texto = `Período: ${formatarData(dataInicio)} a ${formatarData(dataFim)}`
  }
  doc.setFontSize(9)
  setTextColor(doc, MEDIUM_TEXT)
  doc.text(texto, pageW / 2, 34, { align: 'center' })
}

// === KPIs ===

function renderKPIsLimpeza(ctx: RenderContext, y: number, kpis: LimpezaKPIsPDF): number {
  const { doc, pageW } = ctx
  const margin = 8
  const gapX = 3
  const n = 5
  const cardW = (pageW - margin * 2 - gapX * (n - 1)) / n
  const cardH = 15

  const items = [
    { label: 'Cadastrados', valor: String(kpis.total), cor: DARK_TEXT },
    { label: 'Dentro da meta', valor: `${kpis.emDia} (${kpis.pctEmDia}%)`, cor: '#22C55E' },
    { label: 'Atrasados', valor: String(kpis.atrasado), cor: '#F59E0B' },
    { label: 'Atraso crítico', valor: String(kpis.critico), cor: '#EF4444' },
    { label: 'Sem registro', valor: String(kpis.semRegistro), cor: MEDIUM_TEXT },
  ]

  for (let i = 0; i < items.length; i++) {
    const x = margin + i * (cardW + gapX)
    setFillColor(doc, CARD_BG)
    doc.roundedRect(x, y, cardW, cardH, 1.5, 1.5, 'F')

    setFillColor(doc, items[i].cor)
    doc.rect(x, y, 1.5, cardH, 'F')

    doc.setFontSize(7)
    setTextColor(doc, MEDIUM_TEXT)
    doc.setFont('helvetica', 'normal')
    doc.text(items[i].label, x + 3, y + 4.5)

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    setTextColor(doc, items[i].cor)
    doc.text(items[i].valor, x + 3, y + 10)
  }

  return y + cardH
}

function renderKPIsLimpezaDia(ctx: RenderContext, y: number, kpis: LimpezaDiaKPIsPDF): number {
  const { doc, pageW } = ctx
  const margin = 8
  const gapX = 3
  const n = 4
  const cardW = (pageW - margin * 2 - gapX * (n - 1)) / n
  const cardH = 15

  const items = [
    { label: 'Limpos no dia', valor: String(kpis.limposNoDia), cor: DARK_TEXT },
    { label: 'Dentro da meta', valor: String(kpis.dentroMeta), cor: '#22C55E' },
    { label: 'Acima da meta', valor: String(kpis.acimaMeta), cor: '#F59E0B' },
    { label: 'Muito acima', valor: String(kpis.muitoAcima), cor: '#EF4444' },
  ]

  for (let i = 0; i < items.length; i++) {
    const x = margin + i * (cardW + gapX)
    setFillColor(doc, CARD_BG)
    doc.roundedRect(x, y, cardW, cardH, 1.5, 1.5, 'F')

    setFillColor(doc, items[i].cor)
    doc.rect(x, y, 1.5, cardH, 'F')

    doc.setFontSize(7)
    setTextColor(doc, MEDIUM_TEXT)
    doc.setFont('helvetica', 'normal')
    doc.text(items[i].label, x + 3, y + 4.5)

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    setTextColor(doc, items[i].cor)
    doc.text(items[i].valor, x + 3, y + 10)
  }

  // Pills de info adicional
  let pillX = margin
  const pillY = y + cardH + 3
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')

  if (kpis.intervaloMedio !== null) {
    const txt = `Intervalo médio: ${kpis.intervaloMedio}d`
    const w = doc.getTextWidth(txt) + 6
    setFillColor(doc, '#F3F4F6')
    doc.roundedRect(pillX, pillY, w, 6, 3, 3, 'F')
    setTextColor(doc, DARK_TEXT)
    doc.text(txt, pillX + 3, pillY + 4)
    pillX += w + 3
  }

  return pillY + 8
}

function renderKPIsChecklist(ctx: RenderContext, y: number, kpis: DadosPDFBebedouros['checklistKPIs']): number {
  const { doc, pageW } = ctx
  const margin = 8
  const gapX = 3
  const n = 3
  const cardW = (pageW - margin * 2 - gapX * (n - 1)) / n
  const cardH = 15

  const items = [
    { label: 'Registros no período', valor: String(kpis.totalRegistros), cor: DARK_TEXT },
    { label: 'Registros com checklist', valor: String(kpis.comChecklist), cor: DARK_TEXT },
    { label: 'Registros com ponto de atenção', valor: `${kpis.negativos} (${kpis.pctNegativos}%)`, cor: '#EF4444' },
  ]

  for (let i = 0; i < items.length; i++) {
    const x = margin + i * (cardW + gapX)
    setFillColor(doc, CARD_BG)
    doc.roundedRect(x, y, cardW, cardH, 1.5, 1.5, 'F')

    setFillColor(doc, items[i].cor)
    doc.rect(x, y, 1.5, cardH, 'F')

    doc.setFontSize(7)
    setTextColor(doc, MEDIUM_TEXT)
    doc.setFont('helvetica', 'normal')
    doc.text(items[i].label, x + 3, y + 4.5)

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    setTextColor(doc, items[i].cor)
    doc.text(items[i].valor, x + 3, y + 10)
  }

  let nextY = y + cardH + 3

  // Alert: item mais problemático
  if (kpis.itemMaisProblematico) {
    const ipm = kpis.itemMaisProblematico
    const txt = `Item mais problemático: ${ipm.label} com ${ipm.pctNegativo}% de respostas negativas (${ipm.negativos}/${ipm.total}).`
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    const txtW = doc.getTextWidth(txt) + 8
    setFillColor(doc, '#FFFBEB')
    doc.roundedRect(margin, nextY, Math.min(txtW, pageW - margin * 2), 8, 2, 2, 'F')
    setFillColor(doc, '#FDE68A')
    doc.rect(margin, nextY, 1.5, 8, 'F')
    setTextColor(doc, DARK_TEXT)
    doc.text(txt, margin + 4, nextY + 5.5)
    nextY += 11
  }

  return nextY
}

// === Alert: maior atraso ===

function renderAlertMaiorAtraso(ctx: RenderContext, y: number, maisAtrasado: { nome: string; dias: number; meta: number }): number {
  const { doc, pageW } = ctx
  const margin = 8
  const txt = `Maior atraso: ${maisAtrasado.nome} com ${maisAtrasado.dias} dias desde a última limpeza. Meta: ${maisAtrasado.meta} dias.`
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  const txtW = doc.getTextWidth(txt) + 8
  setFillColor(doc, '#FEF2F2')
  doc.roundedRect(margin, y, Math.min(txtW, pageW - margin * 2), 8, 2, 2, 'F')
  setFillColor(doc, '#FECACA')
  doc.rect(margin, y, 1.5, 8, 'F')
  setTextColor(doc, DARK_TEXT)
  doc.text(txt, margin + 4, y + 5.5)
  return y + 11
}

// === Gráficos (Chart.js) ===

async function renderizarGraficoLimpeza(
  status: StatusBebedouroPDF[],
  width: number,
  height: number
): Promise<string | null> {
  if (status.length === 0) return null

  const canvas = document.createElement('canvas')
  const pxPerMm = 4
  canvas.width = Math.round(width * pxPerMm)
  canvas.height = Math.round(height * pxPerMm)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  const ctx2d = canvas.getContext('2d')
  if (!ctx2d) return null

  const n = status.length
  const baseFont = n > 18 ? 8 : 10

  const labels = status.map((s) => s.nome)
  const valores = status.map((s) => s.dias ?? 0)
  const cores = status.map((s) => s.cor)
  const metas = status.map((s) => s.meta)

  const maxDias = Math.max(...valores, ...metas.map((m) => m ?? 0), 1)
  const limiteX = Math.ceil(maxDias * 1.15)

  const ChartMod = await import('chart.js/auto')
  const chart = new ChartMod.default(ctx2d, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Dias desde última limpeza',
        data: valores,
        backgroundColor: cores,
        borderRadius: 4,
        borderSkipped: false,
        minBarLength: 20,
        barPercentage: 0.7,
        categoryPercentage: 0.8,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: false,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: { right: 40 } },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
      },
      scales: {
        x: {
          beginAtZero: true,
          max: limiteX,
          grid: { color: '#E5E7EB' },
          ticks: { color: '#6B7280', font: { size: baseFont } },
        },
        y: {
          grid: { display: false },
          ticks: { color: '#374151', font: { size: baseFont }, autoSkip: false },
        },
      },
    },
    plugins: [{
      id: 'labels',
      afterDatasetsDraw: (chart: any) => {
        const ctx = chart.ctx
        const dataset = chart.getDatasetMeta(0)
        ctx.save()
        ctx.font = `${baseFont}px Arial`
        ctx.fillStyle = '#6B7280'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        for (let i = 0; i < dataset.data.length; i++) {
          const bar = dataset.data[i]
          const value = valores[i]
          const label = value === 0 && status[i].dias === null ? 'sem reg.' : `${value}d`
          ctx.fillText(label, bar.x + 4, bar.y)
        }
        ctx.restore()
      },
    }, {
      id: 'metaLinha',
      afterDatasetsDraw: (chart: any) => {
        const ctx = chart.ctx
        const xScale = chart.scales.x
        const dataset = chart.getDatasetMeta(0)
        ctx.save()
        for (let i = 0; i < dataset.data.length; i++) {
          const meta = metas[i]
          if (!meta || meta <= 0) continue
          const bar = dataset.data[i]
          const barValue = valores[i]
          if (barValue <= 0) continue
          const metaX = xScale.getPixelForValue(meta)
          const yTop = bar.y - bar.height / 2 - 3
          const yBot = bar.y + bar.height / 2 + 3
          ctx.strokeStyle = '#0F6437'
          ctx.lineWidth = 1.5
          ctx.setLineDash([4, 3])
          ctx.beginPath()
          ctx.moveTo(metaX, yTop)
          ctx.lineTo(metaX, yBot)
          ctx.stroke()
        }
        ctx.setLineDash([])
        ctx.restore()
      },
    }],
  })

  const image = chart.toBase64Image()
  chart.destroy()
  return image
}

async function renderizarGraficoLimpezaDia(
  limpezas: LimpezaDoDiaPDF[],
  width: number,
  height: number
): Promise<string | null> {
  if (limpezas.length === 0) return null

  const canvas = document.createElement('canvas')
  const pxPerMm = 4
  canvas.width = Math.round(width * pxPerMm)
  canvas.height = Math.round(height * pxPerMm)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  const ctx2d = canvas.getContext('2d')
  if (!ctx2d) return null

  const labels = limpezas.map((l) => l.nome)
  const valores = limpezas.map((l) => l.intervalo ?? 0)
  const cores = limpezas.map((l) => l.cor)
  const metas = limpezas.map((l) => l.meta)

  const maxIntervalo = Math.max(...valores, ...metas.map((m) => m ?? 0), 1)
  const limiteX = Math.ceil(maxIntervalo * 1.15)

  const ChartMod = await import('chart.js/auto')
  const chart = new ChartMod.default(ctx2d, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Intervalo desde limpeza anterior (dias)',
        data: valores,
        backgroundColor: cores,
        borderRadius: 4,
        borderSkipped: false,
        barPercentage: 0.7,
        categoryPercentage: 0.8,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: false,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: { right: 40 } },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
      },
      scales: {
        x: {
          beginAtZero: true,
          max: limiteX,
          grid: { color: '#E5E7EB' },
          ticks: { color: '#6B7280', font: { size: 10 } },
        },
        y: {
          grid: { display: false },
          ticks: { color: '#374151', font: { size: 10 } },
        },
      },
    },
    plugins: [{
      id: 'labelsDia',
      afterDatasetsDraw: (chart: any) => {
        const ctx = chart.ctx
        const dataset = chart.getDatasetMeta(0)
        ctx.save()
        ctx.font = '10px Arial'
        ctx.fillStyle = '#6B7280'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        for (let i = 0; i < dataset.data.length; i++) {
          const bar = dataset.data[i]
          const value = valores[i]
          const l = limpezas[i]
          const label = l.intervalo === null ? '1ª' : `${value}d`
          ctx.fillText(label, bar.x + 4, bar.y)
        }
        ctx.restore()
      },
    }, {
      id: 'metaLinhaDia',
      afterDatasetsDraw: (chart: any) => {
        const ctx = chart.ctx
        const xScale = chart.scales.x
        const dataset = chart.getDatasetMeta(0)
        ctx.save()
        for (let i = 0; i < dataset.data.length; i++) {
          const meta = metas[i]
          if (!meta || meta <= 0) continue
          const bar = dataset.data[i]
          const barValue = valores[i]
          if (barValue <= 0) continue
          const metaX = xScale.getPixelForValue(meta)
          const yTop = bar.y - bar.height / 2 - 3
          const yBot = bar.y + bar.height / 2 + 3
          ctx.strokeStyle = '#0F6437'
          ctx.lineWidth = 1.5
          ctx.setLineDash([4, 3])
          ctx.beginPath()
          ctx.moveTo(metaX, yTop)
          ctx.lineTo(metaX, yBot)
          ctx.stroke()
        }
        ctx.setLineDash([])
        ctx.restore()
      },
    }],
  })

  const image = chart.toBase64Image()
  chart.destroy()
  return image
}

async function renderizarGraficoProblemas(
  ranking: ChecklistItemRankingPDF[],
  width: number,
  height: number
): Promise<string | null> {
  if (ranking.length === 0) return null

  const canvas = document.createElement('canvas')
  const pxPerMm = 4
  canvas.width = Math.round(width * pxPerMm)
  canvas.height = Math.round(height * pxPerMm)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  const ctx2d = canvas.getContext('2d')
  if (!ctx2d) return null

  const labels = ranking.map((r) => r.label)
  const valores = ranking.map((r) => r.pctNegativo)

  const ChartMod = await import('chart.js/auto')
  const chart = new ChartMod.default(ctx2d, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '% negativo',
        data: valores,
        backgroundColor: '#EF4444',
        borderRadius: 4,
        borderSkipped: false,
        barPercentage: 0.7,
        categoryPercentage: 0.8,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: false,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: { right: 40 } },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
      },
      scales: {
        x: {
          beginAtZero: true,
          max: 100,
          grid: { color: '#E5E7EB' },
          ticks: {
            color: '#6B7280',
            font: { size: 10 },
            callback: (v: any) => `${v}%`,
          },
        },
        y: {
          grid: { display: false },
          ticks: { color: '#374151', font: { size: 10 } },
        },
      },
    },
    plugins: [{
      id: 'labelsProblemas',
      afterDatasetsDraw: (chart: any) => {
        const ctx = chart.ctx
        const dataset = chart.getDatasetMeta(0)
        ctx.save()
        ctx.font = '10px Arial'
        ctx.fillStyle = '#6B7280'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        for (let i = 0; i < dataset.data.length; i++) {
          const bar = dataset.data[i]
          const value = valores[i]
          ctx.fillText(`${value}%`, bar.x + 4, bar.y)
        }
        ctx.restore()
      },
    }],
  })

  const image = chart.toBase64Image()
  chart.destroy()
  return image
}

// === Render de gráfico em card ===

async function renderChartCard(
  ctx: RenderContext,
  chartBase64: string | null,
  x: number,
  y: number,
  w: number,
  h: number,
  titulo: string,
  semDadosMsg: string,
  legenda?: string
) {
  const { doc, pageW } = ctx

  // Título + legenda
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  setTextColor(doc, DARK_TEXT)
  doc.text(titulo, x, y)
  doc.setFont('helvetica', 'normal')

  if (legenda) {
    doc.setFontSize(7)
    setTextColor(doc, MEDIUM_TEXT)
    const legendaW = doc.getTextWidth(legenda)
    doc.text(legenda, pageW - 8 - legendaW, y)
  }

  // Card
  const cardY = y + 2
  const cardH = h
  setFillColor(doc, SHADOW_COLOR)
  doc.roundedRect(x + 0.5, cardY + 0.5, w, cardH, 3, 3, 'F')
  setFillColor(doc, CARD_BG)
  doc.roundedRect(x, cardY, w, cardH, 3, 3, 'F')

  if (chartBase64) {
    doc.addImage(chartBase64, 'PNG', x + 2, cardY + 2, w - 4, cardH - 4)
  } else {
    doc.setFontSize(11)
    setTextColor(doc, MEDIUM_TEXT)
    doc.text(semDadosMsg, x + w / 2, cardY + cardH / 2, { align: 'center' })
  }
}

// === Geração do PDF ===

export async function gerarRelatorioBebedourosPDF(dados: DadosPDFBebedouros): Promise<Blob> {
  const jsPDFMod = await import('jspdf')
  const autoTableMod = await import('jspdf-autotable')
  const doc = new jsPDFMod.default({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })

  const pageW = 297
  const pageH = 210
  const margin = 8

  const dataHoraGeracao = new Date()
  const dataHoraFormatada = dataHoraGeracao.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  let logoGestaoBase64 = ''
  try {
    logoGestaoBase64 = await carregarLogoComoBase64('/images/manejus360.png')
  } catch {
    // sem logo
  }

  let logoFazendaBase64 = ''
  if (dados.fazendaLogoUrl) {
    try {
      logoFazendaBase64 = await carregarLogoComoBase64(dados.fazendaLogoUrl)
    } catch {
      // sem logo fazenda
    }
  }

  const ctx: RenderContext = {
    doc, pageW, pageH, logoGestaoBase64, logoFazendaBase64, fazendaNome: dados.fazendaNome || '',
  }

  // === Página 1: Seção 1 ===
  setFillColor(doc, LIGHT_BG)
  doc.rect(0, 0, pageW, pageH, 'F')

  renderHeader(ctx, dados.titulo, false)
  renderPeriodo(ctx, dados.dataInicio, dados.dataFim, dados.ehDiaUnico, dados.diaUnico)

  // Título da seção 1
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  setTextColor(doc, DARK_TEXT)
  const tituloSecao1 = dados.ehDiaUnico && dados.diaUnico
    ? `1. Bebedouros limpos em ${formatarData(dados.diaUnico)}`
    : '1. Status de limpeza dos bebedouros'
  doc.text(tituloSecao1, margin, 40)
  doc.setFont('helvetica', 'normal')

  let y = 46

  if (dados.ehDiaUnico && dados.limpezaDiaKPIs && dados.limpezasDoDia) {
    // Modo dia único
    y = renderKPIsLimpezaDia(ctx, y, dados.limpezaDiaKPIs) + 4

    const chartW = pageW - margin * 2
    const chartH = Math.max(60, Math.min(dados.limpezasDoDia.length * 12 + 10, pageH - y - 12))
    const chartBase64 = await renderizarGraficoLimpezaDia(dados.limpezasDoDia, chartW - 4, chartH - 4)
    await renderChartCard(ctx, chartBase64, margin, y, chartW, chartH, 'Intervalo desde a limpeza anterior', 'Nenhum bebedouro foi limpo neste dia.', `Marca verde tracejada = meta individual · Referência: ${dataHoraFormatada}`)
  } else if (dados.limpezaKPIs && dados.statusPorBebedouro) {
    // Modo normal
    y = renderKPIsLimpeza(ctx, y, dados.limpezaKPIs) + 4

    if (dados.maisAtrasado) {
      y = renderAlertMaiorAtraso(ctx, y, dados.maisAtrasado) + 4
    }

    const comRegistro = dados.statusPorBebedouro
      .filter((s) => s.dias !== null)
      .sort((a, b) => b.dias! - a.dias!)

    const semRegistro = dados.statusPorBebedouro
      .filter((s) => s.dias === null)
      .sort((a, b) => a.nome.localeCompare(b.nome))

    const chartW = pageW - margin * 2
    const barH = 9
    const innerPad = 10
    const minChartH = 60

    let i = 0
    let isFirstPage = true
    let ultimoPageTop = y
    let ultimoCardH = 0
    while (i < comRegistro.length) {
      const pageTop = isFirstPage ? y : 46
      const maxPerPage = Math.max(1, Math.floor((pageH - pageTop - 12 - innerPad - 4) / barH))
      const chunkSize = Math.min(comRegistro.length - i, maxPerPage)
      const chunk = comRegistro.slice(i, i + chunkSize)

      const cardH = Math.max(minChartH, chunk.length * barH + innerPad + 4)
      const chartBase64 = await renderizarGraficoLimpeza(chunk, chartW - 4, cardH - 4)
      const titulo = isFirstPage
        ? 'Dias desde a última limpeza por bebedouro'
        : 'Dias desde a última limpeza por bebedouro (continuação)'
      const legenda = isFirstPage
        ? `Marca verde tracejada = meta individual de cada bebedouro · Referência: ${dataHoraFormatada}`
        : undefined
      await renderChartCard(ctx, chartBase64, margin, pageTop, chartW, cardH, titulo, 'Nenhum bebedouro cadastrado.', legenda)

      ultimoPageTop = pageTop
      ultimoCardH = cardH
      i += chunkSize
      if (i < comRegistro.length) {
        doc.addPage()
        setFillColor(doc, LIGHT_BG)
        doc.rect(0, 0, pageW, pageH, 'F')
        renderHeader(ctx, dados.titulo, true)
        renderPeriodo(ctx, dados.dataInicio, dados.dataFim, false)
      }
      isFirstPage = false
    }

    if (semRegistro.length > 0) {
      const titulo = 'Bebedouros sem registros:'
      const nomes = semRegistro.map((s) => s.nome).join(', ')
      doc.setFontSize(9)

      doc.setFont('helvetica', 'normal')
      const linhasNomes = doc.splitTextToSize(nomes, pageW - margin * 2)
      const altura = (linhasNomes.length + 1) * 5 + 2

      let listY = ultimoPageTop + 2 + ultimoCardH + 6
      if (listY + altura > pageH - 10) {
        doc.addPage()
        setFillColor(doc, LIGHT_BG)
        doc.rect(0, 0, pageW, pageH, 'F')
        renderHeader(ctx, dados.titulo, true)
        renderPeriodo(ctx, dados.dataInicio, dados.dataFim, false)
        listY = 46
      }

      setTextColor(doc, DARK_TEXT)
      doc.setFont('helvetica', 'bold')
      doc.text(titulo, margin, listY)
      doc.setFont('helvetica', 'normal')
      for (let j = 0; j < linhasNomes.length; j++) {
        doc.text(linhasNomes[j], margin, listY + 5 + j * 5)
      }
    }
  }

  // === Página 2: Seção 2 ===
  doc.addPage()
  setFillColor(doc, LIGHT_BG)
  doc.rect(0, 0, pageW, pageH, 'F')
  renderHeader(ctx, dados.titulo, false)
  renderPeriodo(ctx, dados.dataInicio, dados.dataFim, false)

  // Título da seção 2
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  setTextColor(doc, DARK_TEXT)
  doc.text('2. Pontos de atenção nos bebedouros', margin, 40)
  doc.setFont('helvetica', 'normal')

  y = 46
  y = renderKPIsChecklist(ctx, y, dados.checklistKPIs) + 4

  // Gráfico de problemas
  const chartW = pageW - margin * 2
  const chartH = Math.max(50, Math.min(dados.itensRanking.length * 12 + 10, 80))
  const chartBase64 = await renderizarGraficoProblemas(dados.itensRanking, chartW - 4, chartH - 4)
  await renderChartCard(ctx, chartBase64, margin, y, chartW, chartH, 'Problemas mais frequentes nos checklists', 'Nenhum checklist respondido no período.')
  y += chartH + 10

  // Tabela de ocorrências negativas
  if (dados.ocorrencias.length > 0) {
    if (y > pageH - 40) {
      doc.addPage()
      setFillColor(doc, LIGHT_BG)
      doc.rect(0, 0, pageW, pageH, 'F')
      renderHeader(ctx, dados.titulo, true)
      renderPeriodo(ctx, dados.dataInicio, dados.dataFim, false)
      y = 46
    }

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    setTextColor(doc, DARK_TEXT)
    doc.text(`Ocorrências negativas (${dados.ocorrencias.length})`, margin, y)
    doc.setFont('helvetica', 'normal')
    y += 3

    autoTableMod.default(doc, {
      startY: y,
      head: [['Data', 'Bebedouro', 'Itens negativos', 'Obs. do item', 'Obs. geral', 'Responsável']],
      body: dados.ocorrencias.slice(0, 60).map((o) => [
        formatarData(o.data),
        o.bebedouro,
        o.itensNegativos,
        o.obsItens || '—',
        o.obsGeral || '—',
        o.responsavel || '—',
      ]),
      theme: 'striped',
      headStyles: { fillColor: hexToRgb('#EF4444'), textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 7, textColor: hexToRgb(DARK_TEXT), cellPadding: 2 },
      alternateRowStyles: { fillColor: [254, 242, 242] },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 40 },
        2: { cellWidth: 60 },
        3: { cellWidth: 60 },
        4: { cellWidth: 50 },
        5: { cellWidth: 35 },
      },
      margin: { left: margin, right: margin },
    })
  } else {
    doc.setFontSize(10)
    setTextColor(doc, '#22C55E')
    setFillColor(doc, '#F0FDF4')
    doc.roundedRect(margin, y, pageW - margin * 2, 12, 2, 2, 'F')
    doc.text('Nenhuma ocorrência negativa nos checklists do período.', pageW / 2, y + 7.5, { align: 'center' })
  }

  // === Footer em todas as páginas ===
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    doc.setFontSize(7)
    setTextColor(doc, MEDIUM_TEXT)
    doc.setFont('helvetica', 'normal')
    doc.text(`Relatório gerado em: ${dataHoraFormatada}`, pageW - margin, pageH - 6, { align: 'right' })
  }

  return doc.output('blob')
}
