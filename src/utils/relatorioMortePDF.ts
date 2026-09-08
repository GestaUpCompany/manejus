import type jsPDF from 'jspdf'
import { renderRelatorioHeader, type HeaderContext } from './relatorioHeaderPDF'

// === Tipos ===

export interface DiagnosticoItem {
  chave: string
  valor: string // 'S' | 'N'
  observacao: string
}

export interface LinhaMorte {
  id: string
  data: string // YYYY-MM-DD
  data_hora: string // YYYY-MM-DD HH:MM
  lote_id: string | null
  lote_nome: string | null
  pasto: string | null
  sexo: string | null
  raca: string | null
  idade: string | null
  peso_vivo: number | null
  causa_morte: string | null
  categoria: string | null
  categoria_outros: string | null
  brinco: string | null
  chip: string | null
  escore: number | null
  nutricao_atual: string | null
  nutricao_anterior: string | null
  diagnosticos: Record<string, DiagnosticoItem> | null
  observacao_identificacao: string | null
  nome_usuario: string | null
}

export interface AgregadoItem {
  label: string
  valor: number
}

export interface ResumoMorte {
  total_mortes: number
  media_por_dia: number | null
  peso_medio: number | null
  causa_mais_frequente: string | null
  causa_mais_frequente_count: number | null
  por_causa: AgregadoItem[]
  por_categoria: AgregadoItem[]
  por_sexo: AgregadoItem[]
  frequencia_diagnosticos: AgregadoItem[]
}

export interface ParametrosRelatorioMorte {
  dataInicio: string
  dataFim: string
  fazendaNome: string
  fazendaLogoUrl?: string | null
  linhas: LinhaMorte[]
  resumo: ResumoMorte
}

// === Helpers ===

function formatarDataNumerica(dataStr: string | null | undefined): string {
  if (!dataStr) return '—'
  const parts = dataStr.split('-')
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
  return dataStr
}

function formatarNumero(valor: number | null | undefined, casas = 2, padrao = '—'): string {
  if (valor === null || valor === undefined || isNaN(valor as number)) return padrao
  return (valor as number).toFixed(casas).replace('.', ',')
}

function formatarInteiro(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || isNaN(valor as number)) return '—'
  return Math.round(valor as number).toString()
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

// === Paleta ===

const GREEN_DARK = '#0F6437'
const WHITE = '#FFFFFF'
const DARK_TEXT = '#1F2937'
const MEDIUM_TEXT = '#6B7280'
const LIGHT_BG = '#F5F5F5'
const CARD_BG = '#FFFFFF'
const SHADOW_COLOR = '#00000012'
const CHART_COLORS = ['#0F6437', '#1E3A5F', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316']

// === Rótulos amigáveis para diagnósticos ===

const DIAG_LABELS: Record<string, string> = {
  inchaco: 'Inchaço',
  fraturas: 'Fraturas',
  medicado: 'Foi medicado',
  morteSubita: 'Morte súbita',
  decomposicao: 'Decomposição',
  animalInchado: 'Animal inchado',
  animalSozinho: 'Animal sozinho',
  animalBicheira: 'Bicheira',
  apatiaFraqueza: 'Apatia/fragilidade',
  doencasPrevias: 'Doenças prévias',
  encontradoVivo: 'Encontrado vivo',
  carrapatosMoscas: 'Carrapatos/moscas',
  secrecaoOrificios: 'Secreção orifícios',
  sinaisIntoxicacao: 'Sinais intoxicação',
  sintomasPneumonia: 'Sintomas pneumonia',
  salivacaoExcessiva: 'Salivação excessiva',
  desordensDigestivas: 'Desordens digestivas',
  medicamentosRecentes: 'Medicamentos recentes',
  incoordenacaoTremores: 'Incoordenação/tremores',
}

function labelDiagnostico(chave: string): string {
  return DIAG_LABELS[chave] ?? chave
}

// === Granularidade adaptativa ===

type Granularidade = 'dia' | 'semana' | 'mes'

function determinarGranularidade(numDias: number): Granularidade {
  if (numDias <= 31) return 'dia'
  if (numDias <= 84) return 'semana'
  return 'mes'
}

function chaveAgregacao(data: string, gran: Granularidade): { chave: string; label: string } {
  const [ano, mes, dia] = data.split('-').map(Number)
  if (gran === 'dia') {
    return { chave: data, label: `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}` }
  }
  if (gran === 'mes') {
    const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
    return { chave: `${ano}-${String(mes).padStart(2, '0')}`, label: `${nomes[mes - 1]}/${String(ano).slice(2)}` }
  }
  const d = new Date(ano, mes - 1, dia)
  const dayOfWeek = d.getDay()
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(ano, mes - 1, dia + diff)
  return {
    chave: `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`,
    label: `${String(monday.getDate()).padStart(2, '0')}/${String(monday.getMonth() + 1).padStart(2, '0')}`,
  }
}

function labelGranularidadeTexto(gran: Granularidade): string {
  if (gran === 'dia') return 'por dia'
  if (gran === 'semana') return 'por semana'
  return 'por mês'
}

// === Gráfico de mortes no tempo (granularidade adaptativa) ===

async function renderizarGraficoMortesTempo(
  linhas: LinhaMorte[],
  width: number,
  height: number
): Promise<string | null> {
  if (linhas.length === 0) return null
  const diasUnicos = new Set(linhas.map((l) => l.data))
  const gran = determinarGranularidade(diasUnicos.size)

  const porPeriodo = new Map<string, { chave: string; label: string; count: number }>()
  for (const l of linhas) {
    const { chave, label } = chaveAgregacao(l.data, gran)
    const existing = porPeriodo.get(chave)
    if (existing) existing.count += 1
    else porPeriodo.set(chave, { chave, label, count: 1 })
  }
  const dados = Array.from(porPeriodo.values()).sort((a, b) => a.chave.localeCompare(b.chave))
  if (dados.length === 0) return null

  const canvas = document.createElement('canvas')
  const pxPerMm = 5
  canvas.width = Math.round(width * pxPerMm)
  canvas.height = Math.round(height * pxPerMm)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const ChartMod = await import('chart.js/auto')
  const chart = new ChartMod.default(ctx, {
    type: 'bar',
    data: {
      labels: dados.map((d) => d.label),
      datasets: [{
        label: 'Mortes',
        data: dados.map((d) => d.count),
        backgroundColor: GREEN_DARK,
        borderRadius: 4,
        borderSkipped: false,
        barPercentage: 0.6,
        categoryPercentage: 0.85,
      }],
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: { top: 30, right: 15, bottom: 35, left: 40 } },
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: `Mortes ${labelGranularidadeTexto(gran)}`,
          align: 'center',
          color: DARK_TEXT,
          font: { size: 22, weight: 'bold' },
          padding: { bottom: 8 },
        },
        tooltip: { enabled: false },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: MEDIUM_TEXT, font: { size: 11 }, maxRotation: 45, minRotation: 45, precision: 0 },
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Mortes',
            color: DARK_TEXT,
            font: { size: 14, weight: 'bold' },
          },
          ticks: { color: MEDIUM_TEXT, font: { size: 11 }, precision: 0 },
          grid: { color: '#E5E7EB' },
        },
      },
    },
  })

  const image = chart.toBase64Image()
  chart.destroy()
  return image
}

// === Gráfico de barras horizontais agregado (causa, categoria, etc.) ===

async function renderizarGraficoBarrasHorizontais(
  itens: AgregadoItem[],
  titulo: string,
  width: number,
  height: number
): Promise<string | null> {
  if (itens.length === 0) return null
  // Top 12 para não poluir
  const top = itens.slice(0, 12)

  const canvas = document.createElement('canvas')
  const pxPerMm = 5
  canvas.width = Math.round(width * pxPerMm)
  canvas.height = Math.round(height * pxPerMm)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const ChartMod = await import('chart.js/auto')
  const chart = new ChartMod.default(ctx, {
    type: 'bar',
    data: {
      labels: top.map((d) => d.label),
      datasets: [{
        label: titulo,
        data: top.map((d) => d.valor),
        backgroundColor: top.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
        borderRadius: 3,
        borderSkipped: false,
        barPercentage: 0.7,
        categoryPercentage: 0.9,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: false,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: { top: 30, right: 20, bottom: 10, left: 10 } },
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: titulo,
          align: 'center',
          color: DARK_TEXT,
          font: { size: 20, weight: 'bold' },
          padding: { bottom: 8 },
        },
        tooltip: { enabled: false },
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { color: MEDIUM_TEXT, font: { size: 11 }, precision: 0 },
          grid: { color: '#E5E7EB' },
        },
        y: {
          grid: { display: false },
          ticks: { color: DARK_TEXT, font: { size: 11 } },
        },
      },
    },
  })

  const image = chart.toBase64Image()
  chart.destroy()
  return image
}

// === Gráfico donut (sexo) ===

async function renderizarGraficoDonut(
  itens: AgregadoItem[],
  titulo: string,
  width: number,
  height: number
): Promise<string | null> {
  if (itens.length === 0) return null

  const canvas = document.createElement('canvas')
  const pxPerMm = 5
  canvas.width = Math.round(width * pxPerMm)
  canvas.height = Math.round(height * pxPerMm)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const ChartMod = await import('chart.js/auto')
  const chart = new ChartMod.default(ctx, {
    type: 'doughnut',
    data: {
      labels: itens.map((d) => d.label),
      datasets: [{
        data: itens.map((d) => d.valor),
        backgroundColor: itens.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
        borderWidth: 2,
        borderColor: WHITE,
      }],
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: { top: 30, right: 10, bottom: 10, left: 10 } },
      plugins: {
        legend: {
          display: true,
          position: 'right',
          labels: { color: DARK_TEXT, font: { size: 12 }, boxWidth: 14 },
        },
        title: {
          display: true,
          text: titulo,
          align: 'center',
          color: DARK_TEXT,
          font: { size: 20, weight: 'bold' },
          padding: { bottom: 8 },
        },
        tooltip: { enabled: false },
      },
    },
  })

  const image = chart.toBase64Image()
  chart.destroy()
  return image
}

// === Context de renderização ===

interface RenderContext {
  doc: jsPDF
  pageW: number
  pageH: number
  logoGestaoBase64: string
  logoFazendaBase64: string
  fazendaNome: string
  greenDark: string
  white: string
  darkText: string
  mediumText: string
  lightBg: string
  cardBg: string
  shadowColor: string
}

function renderHeader(ctx: RenderContext, isContinuation: boolean) {
  const headerCtx: HeaderContext = {
    doc: ctx.doc,
    pageW: ctx.pageW,
    logoGestaoBase64: ctx.logoGestaoBase64,
    logoFazendaBase64: ctx.logoFazendaBase64,
  }
  renderRelatorioHeader(headerCtx, {
    titulo: isContinuation ? 'Mortalidade (continuação)' : 'Mortalidade',
    subtitulo: ctx.fazendaNome || undefined,
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

// === KPIs ===

function renderKPIs(ctx: RenderContext, resumo: ResumoMorte) {
  const { doc, pageW, white, shadowColor } = ctx
  const kpiY = 50
  const kpiH = 22
  const kpiGap = 6
  const totalKpis = 4
  const kpiW = (pageW - 16 - (totalKpis - 1) * kpiGap) / totalKpis
  const kpiX0 = 8

  const causaTxt = resumo.causa_mais_frequente
    ? `${resumo.causa_mais_frequente} (${resumo.causa_mais_frequente_count ?? 0})`
    : '—'

  const kpis = [
    { label: 'Total de mortes', value: formatarInteiro(resumo.total_mortes) },
    { label: 'Mortes/dia (média)', value: formatarNumero(resumo.media_por_dia, 2) },
    { label: 'Peso médio (kg)', value: formatarNumero(resumo.peso_medio, 1) },
    { label: 'Causa mais frequente', value: causaTxt, small: true },
  ]

  kpis.forEach((k, i) => {
    const x = kpiX0 + i * (kpiW + kpiGap)
    setFillColor(doc, shadowColor)
    doc.roundedRect(x + 0.5, kpiY + 0.5, kpiW, kpiH, 4, 4, 'F')
    setFillColor(doc, GREEN_DARK)
    doc.roundedRect(x, kpiY, kpiW, kpiH, 4, 4, 'F')
    doc.setFontSize(k.small ? 9 : 13)
    setTextColor(doc, white)
    doc.setFont('helvetica', 'bold')
    doc.text(k.value, x + kpiW / 2, kpiY + 9, { align: 'center', maxWidth: kpiW - 4 })
    doc.setFontSize(8)
    setTextColor(doc, white)
    doc.setFont('helvetica', 'normal')
    doc.text(k.label, x + kpiW / 2, kpiY + 17, { align: 'center' })
  })
}

// === Tabela de frequência de diagnósticos ===

function renderTabelaDiagnosticos(ctx: RenderContext, itens: AgregadoItem[], startY: number): number {
  const { doc, pageW, white, darkText, mediumText, shadowColor } = ctx
  if (itens.length === 0) return startY

  const tableW = pageW - 16
  const tableX = 8
  const rowH = 7

  // Título
  setTextColor(doc, darkText)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Frequência de diagnósticos', tableX, startY + 5)
  let y = startY + 8

  // Header
  setFillColor(doc, shadowColor)
  doc.roundedRect(tableX + 0.5, y + 0.5, tableW, rowH, 3, 3, 'F')
  setFillColor(doc, GREEN_DARK)
  doc.roundedRect(tableX, y, tableW, rowH, 3, 3, 'F')
  doc.setFontSize(8)
  setTextColor(doc, white)
  doc.setFont('helvetica', 'bold')

  const colLabelW = tableW * 0.6
  const colCountW = tableW * 0.25
  const colPctW = tableW * 0.15
  doc.text('Diagnóstico', tableX + 4, y + 5)
  doc.text('Mortes', tableX + colLabelW + colCountW / 2, y + 5, { align: 'center' })
  doc.text('%', tableX + colLabelW + colCountW + colPctW / 2, y + 5, { align: 'center' })
  y += rowH

  const total = itens.reduce((s, i) => s + i.valor, 0)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')

  itens.forEach((item, idx) => {
    if (idx % 2 === 0) {
      setFillColor(doc, '#F9FAFB')
      doc.rect(tableX, y, tableW, rowH, 'F')
    }
    setTextColor(doc, darkText)
    doc.text(labelDiagnostico(item.label), tableX + 4, y + 5)
    setTextColor(doc, darkText)
    doc.text(`${item.valor}`, tableX + colLabelW + colCountW / 2, y + 5, { align: 'center' })
    const pct = total > 0 ? (item.valor / total) * 100 : 0
    setTextColor(doc, mediumText)
    doc.text(`${pct.toFixed(1).replace('.', ',')}%`, tableX + colLabelW + colCountW + colPctW / 2, y + 5, { align: 'center' })
    y += rowH
  })

  return y + 4
}

// === Tabela detalhada ===

const MAX_ROWS_PER_PAGE = 18
const COL_WIDTHS = [24, 20, 18, 18, 18, 22, 22, 22, 28] // soma ~210mm (A4 landscape)
const COL_HEADERS = ['Data', 'Lote', 'Pasto', 'Sexo', 'Idade', 'Peso (kg)', 'Categoria', 'Causa', 'Diagnósticos']

function compactarDiagnosticos(diag: Record<string, DiagnosticoItem> | null): string {
  if (!diag) return '—'
  const chaves = Object.keys(diag).filter((k) => diag[k]?.valor === 'S')
  if (chaves.length === 0) return '—'
  const labels = chaves.map((k) => labelDiagnostico(k))
  return labels.length > 3 ? `${labels.slice(0, 3).join(', ')}...` : labels.join(', ')
}

function renderTabelaDetalhada(ctx: RenderContext, linhas: LinhaMorte[], startY: number): number {
  const { doc, pageW, darkText, mediumText, shadowColor, white } = ctx
  const tableW = COL_WIDTHS.reduce((a, b) => a + b, 0)
  const tableX = (pageW - tableW) / 2
  const rowH = 7
  let y = startY

  setFillColor(doc, shadowColor)
  doc.roundedRect(tableX + 0.5, y + 0.5, tableW, rowH, 3, 3, 'F')
  setFillColor(doc, GREEN_DARK)
  doc.roundedRect(tableX, y, tableW, rowH, 3, 3, 'F')
  doc.setFontSize(8)
  setTextColor(doc, white)
  doc.setFont('helvetica', 'bold')
  let xCol = tableX
  for (let i = 0; i < COL_HEADERS.length; i++) {
    doc.text(COL_HEADERS[i], xCol + COL_WIDTHS[i] / 2, y + 5, { align: 'center' })
    xCol += COL_WIDTHS[i]
  }
  y += rowH

  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  let rowCount = 0
  for (const l of linhas) {
    if (rowCount >= MAX_ROWS_PER_PAGE) {
      setTextColor(doc, mediumText)
      doc.text('... (continua na próxima página)', tableX + tableW / 2, y + 5, { align: 'center' })
      return -1
    }
    if (rowCount % 2 === 0) {
      setFillColor(doc, '#F9FAFB')
      doc.rect(tableX, y, tableW, rowH, 'F')
    }
    setTextColor(doc, darkText)
    const dataFmt = formatarDataNumerica(l.data)
    const valores = [
      dataFmt,
      l.lote_nome ?? '—',
      l.pasto ?? '—',
      l.sexo ?? '—',
      l.idade ?? '—',
      formatarNumero(l.peso_vivo, 0),
      l.categoria ?? '—',
      l.causa_morte ?? '—',
      compactarDiagnosticos(l.diagnosticos),
    ]
    xCol = tableX
    for (let i = 0; i < valores.length; i++) {
      doc.text(valores[i], xCol + COL_WIDTHS[i] / 2, y + 5, { align: 'center', maxWidth: COL_WIDTHS[i] - 2 })
      xCol += COL_WIDTHS[i]
    }
    y += rowH
    rowCount++
  }

  return y
}

// === Função principal ===

export async function gerarRelatorioMortePDF(params: ParametrosRelatorioMorte): Promise<Blob> {
  const { dataInicio, dataFim, fazendaNome, linhas, resumo } = params

  const jsPDFMod = await import('jspdf')
  const doc = new jsPDFMod.default({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })

  const pageW = 297
  const pageH = 210

  let logoGestaoBase64 = ''
  try {
    logoGestaoBase64 = await carregarLogoComoBase64('/images/manejus360.png')
  } catch {
    // silencioso
  }

  let logoFazendaBase64 = ''
  if (params.fazendaLogoUrl) {
    try {
      logoFazendaBase64 = await carregarLogoComoBase64(params.fazendaLogoUrl)
    } catch {
      // silencioso
    }
  }

  const ctx: RenderContext = {
    doc, pageW, pageH, logoGestaoBase64, logoFazendaBase64, fazendaNome,
    greenDark: GREEN_DARK, white: WHITE, darkText: DARK_TEXT, mediumText: MEDIUM_TEXT,
    lightBg: LIGHT_BG, cardBg: CARD_BG, shadowColor: SHADOW_COLOR,
  }

  // === Página 1: header + período + KPIs + 4 gráficos ===
  setFillColor(doc, LIGHT_BG)
  doc.rect(0, 0, pageW, pageH, 'F')
  renderHeader(ctx, false)
  renderPeriodo(ctx, dataInicio, dataFim)
  renderKPIs(ctx, resumo)

  // Layout dos gráficos: 2 colunas x 2 linhas
  const chartTopY = 78
  const chartGap = 4
  const chartLeftX = 8
  const chartRightX = pageW / 2 + 2
  const chartW = pageW / 2 - 10
  const chartH = (pageH - chartTopY - 8 - chartGap) / 2

  const drawChartCard = (x: number, y: number, w: number, h: number) => {
    setFillColor(doc, SHADOW_COLOR)
    doc.roundedRect(x + 0.5, y + 0.5, w, h, 4, 4, 'F')
    setFillColor(doc, CARD_BG)
    doc.roundedRect(x, y, w, h, 4, 4, 'F')
  }

  // Gráfico 1: mortes no tempo (top-left)
  drawChartCard(chartLeftX, chartTopY, chartW, chartH)
  try {
    const img = await renderizarGraficoMortesTempo(linhas, chartW, chartH)
    if (img) doc.addImage(img, 'PNG', chartLeftX, chartTopY, chartW, chartH)
  } catch (err) {
    console.error('Erro ao renderizar gráfico mortes/tempo:', err)
  }

  // Gráfico 2: por causa (top-right)
  drawChartCard(chartRightX, chartTopY, chartW, chartH)
  try {
    const img = await renderizarGraficoBarrasHorizontais(resumo.por_causa, 'Mortes por causa', chartW, chartH)
    if (img) doc.addImage(img, 'PNG', chartRightX, chartTopY, chartW, chartH)
  } catch (err) {
    console.error('Erro ao renderizar gráfico por causa:', err)
  }

  // Gráfico 3: por categoria (bottom-left)
  const chartBottomY = chartTopY + chartH + chartGap
  drawChartCard(chartLeftX, chartBottomY, chartW, chartH)
  try {
    const img = await renderizarGraficoBarrasHorizontais(resumo.por_categoria, 'Mortes por categoria', chartW, chartH)
    if (img) doc.addImage(img, 'PNG', chartLeftX, chartBottomY, chartW, chartH)
  } catch (err) {
    console.error('Erro ao renderizar gráfico por categoria:', err)
  }

  // Gráfico 4: por sexo (bottom-right, donut)
  drawChartCard(chartRightX, chartBottomY, chartW, chartH)
  try {
    const img = await renderizarGraficoDonut(resumo.por_sexo, 'Mortes por sexo', chartW, chartH)
    if (img) doc.addImage(img, 'PNG', chartRightX, chartBottomY, chartW, chartH)
  } catch (err) {
    console.error('Erro ao renderizar gráfico por sexo:', err)
  }

  // === Página 2: tabela de frequência de diagnósticos ===
  if (resumo.frequencia_diagnosticos.length > 0) {
    doc.addPage()
    setFillColor(doc, LIGHT_BG)
    doc.rect(0, 0, pageW, pageH, 'F')
    renderHeader(ctx, true)
    renderTabelaDiagnosticos(ctx, resumo.frequencia_diagnosticos, 40)
  }

  // === Páginas 3+: tabela detalhada ===
  const linhasOrdenadas = [...linhas].sort((a, b) => {
    if (a.data !== b.data) return b.data.localeCompare(a.data)
    return (a.lote_nome ?? '').localeCompare(b.lote_nome ?? '')
  })

  const chunks: LinhaMorte[][] = []
  for (let i = 0; i < linhasOrdenadas.length; i += MAX_ROWS_PER_PAGE) {
    chunks.push(linhasOrdenadas.slice(i, i + MAX_ROWS_PER_PAGE))
  }

  for (const chunk of chunks) {
    doc.addPage()
    setFillColor(doc, LIGHT_BG)
    doc.rect(0, 0, pageW, pageH, 'F')
    renderHeader(ctx, true)
    renderTabelaDetalhada(ctx, chunk, 40)
  }

  return doc.output('blob')
}
