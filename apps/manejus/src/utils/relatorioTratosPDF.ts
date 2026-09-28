import type jsPDF from 'jspdf'
import { renderRelatorioHeader, type HeaderContext } from './relatorioHeaderPDF'

// === Tipos ===

export interface LinhaTrato {
  data: string // YYYY-MM-DD
  lote_id: string
  lote_nome: string
  curral_nome: string | null
  ordem_trato: number
  kg_planejado: number | null
  kg_ofertado_real: number | null
  desvio_kg: number | null
  desvio_pct: number | null
  leitura_cocho_nota: number | null
  horario_sugerido: string | null // HH:MM
  horario_real: string | null // HH:MM
  desvio_min: number | null
  tratador: string | null
  status_kg: 'ok' | 'alerta' | 'critico' | 'sem_execucao'
  status_horario: 'ok' | 'alerta' | 'critico' | 'sem_horario'
}

export interface ResumoLoteTrato {
  lote_id: string
  lote_nome: string
  planejado_total_kg: number
  real_total_kg: number
  desvio_total_kg: number
  desvio_medio_pct: number | null
  dias_com_registro: number
  n_tratos: number
  n_ok: number
  n_alerta: number
  n_critico: number
  n_sem_execucao: number
  n_horario_ok: number
  n_horario_alerta: number
  n_horario_critico: number
  desvio_medio_min: number | null
  status: 'ok' | 'alerta' | 'critico' | 'sem_execucao'
}

export interface LoteRelatorioTratos {
  resumo: ResumoLoteTrato
  linhas: LinhaTrato[]
}

export interface ParametrosRelatorioTratos {
  dataInicio: string
  dataFim: string
  fazendaNome: string
  fazendaLogoUrl?: string | null
  lotes: LoteRelatorioTratos[]
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

function formatarMinutos(min: number | null | undefined): string {
  if (min === null || min === undefined || isNaN(min as number)) return '—'
  const v = Math.round(min as number)
  const sinal = v > 0 ? '+' : ''
  return `${sinal}${v}min`
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

// === Cores por status ===

const STATUS_KG_COLORS: Record<string, string> = {
  ok: '#10B981',
  alerta: '#F59E0B',
  critico: '#EF4444',
  sem_execucao: '#9CA3AF',
}

const STATUS_HORARIO_COLORS: Record<string, string> = {
  ok: '#10B981',
  alerta: '#F59E0B',
  critico: '#EF4444',
  sem_horario: '#9CA3AF',
}

// === Granularidade adaptativa para gráficos ===
// ≤31 dias: diário | ≤84: semanal | >84: mensal

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

// === Renderização do gráfico de desvio de kg (granularidade adaptativa) ===

async function renderizarGraficoDesvioKg(
  linhas: LinhaTrato[],
  width: number,
  height: number
): Promise<string | null> {
  // Determinar granularidade
  const diasUnicos = new Set(linhas.map((l) => l.data))
  const gran = determinarGranularidade(diasUnicos.size)

  // Agregar por período
  const porPeriodo = new Map<string, { chave: string; label: string; desvio: number; planejado: number; real: number }>()
  for (const l of linhas) {
    const { chave, label } = chaveAgregacao(l.data, gran)
    const existing = porPeriodo.get(chave)
    if (existing) {
      existing.desvio += l.desvio_kg ?? 0
      existing.planejado += l.kg_planejado ?? 0
      existing.real += l.kg_ofertado_real ?? 0
    } else {
      porPeriodo.set(chave, {
        chave,
        label,
        desvio: l.desvio_kg ?? 0,
        planejado: l.kg_planejado ?? 0,
        real: l.kg_ofertado_real ?? 0,
      })
    }
  }
  const dados = Array.from(porPeriodo.values()).sort((a, b) => a.chave.localeCompare(b.chave))
  if (dados.length === 0) return null

  const labels = dados.map((d) => d.label)

  const canvas = document.createElement('canvas')
  const pxPerMm = 5
  canvas.width = Math.round(width * pxPerMm)
  canvas.height = Math.round(height * pxPerMm)

  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const darkText = '#1F2937'
  const mediumText = '#6B7280'

  const ChartMod = await import('chart.js/auto')
  const chart = new ChartMod.default(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Desvio kg',
          data: dados.map((d) => Math.round(d.desvio * 100) / 100),
          backgroundColor: dados.map((d) => {
            if (d.planejado === 0) return STATUS_KG_COLORS.sem_execucao
            const pct = Math.abs((d.desvio / d.planejado) * 100)
            if (pct <= 5) return STATUS_KG_COLORS.ok
            if (pct <= 15) return STATUS_KG_COLORS.alerta
            return STATUS_KG_COLORS.critico
          }),
          borderRadius: 4,
          borderSkipped: false,
          barPercentage: 0.6,
          categoryPercentage: 0.85,
        },
      ],
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: { top: 30, right: 15, bottom: 35, left: 45 } },
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: `Desvio de kg ${labelGranularidadeTexto(gran)}`,
          align: 'center',
          color: darkText,
          font: { size: 24, weight: 'bold' },
          padding: { bottom: 8 },
        },
        tooltip: { enabled: false },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: mediumText, font: { size: 11 }, maxRotation: 45, minRotation: 45 },
        },
        y: {
          title: {
            display: true,
            text: 'Desvio (kg)',
            color: darkText,
            font: { size: 16, weight: 'bold' },
          },
          ticks: { color: mediumText, font: { size: 11 } },
          grid: { color: '#E5E7EB' },
        },
      },
    },
  })

  const image = chart.toBase64Image()
  chart.destroy()
  return image
}

// === Renderização do gráfico de desvio de horário (granularidade adaptativa, média em minutos) ===

async function renderizarGraficoDesvioHorario(
  linhas: LinhaTrato[],
  width: number,
  height: number
): Promise<string | null> {
  const dados = linhas.filter((l) => l.desvio_min != null)
  if (dados.length === 0) return null

  // Determinar granularidade
  const diasUnicos = new Set(dados.map((l) => l.data))
  const gran = determinarGranularidade(diasUnicos.size)

  // Agregar por período (média dos desvios em minutos)
  const porPeriodo = new Map<string, { chave: string; label: string; soma: number; count: number }>()
  for (const l of dados) {
    const { chave, label } = chaveAgregacao(l.data, gran)
    const v = l.desvio_min as number
    const existing = porPeriodo.get(chave)
    if (existing) {
      existing.soma += v
      existing.count += 1
    } else {
      porPeriodo.set(chave, { chave, label, soma: v, count: 1 })
    }
  }
  const periodos = Array.from(porPeriodo.values())
    .map((d) => {
      const media = d.soma / d.count
      const abs = Math.abs(media)
      const cor = abs <= 15 ? STATUS_HORARIO_COLORS.ok : abs <= 30 ? STATUS_HORARIO_COLORS.alerta : STATUS_HORARIO_COLORS.critico
      return { chave: d.chave, label: d.label, media: Math.round(media * 10) / 10, cor }
    })
    .sort((a, b) => a.chave.localeCompare(b.chave))

  const labels = periodos.map((d) => d.label)

  const canvas = document.createElement('canvas')
  const pxPerMm = 5
  canvas.width = Math.round(width * pxPerMm)
  canvas.height = Math.round(height * pxPerMm)

  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const darkText = '#1F2937'
  const mediumText = '#6B7280'

  const ChartMod = await import('chart.js/auto')
  const chart = new ChartMod.default(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Desvio horário médio (min)',
          data: periodos.map((d) => d.media),
          backgroundColor: periodos.map((d) => d.cor),
          borderRadius: 3,
          borderSkipped: false,
          barPercentage: 0.5,
          categoryPercentage: 0.9,
        },
      ],
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: { top: 30, right: 15, bottom: 35, left: 45 } },
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: `Desvio de horário ${labelGranularidadeTexto(gran)} (média em min)`,
          align: 'center',
          color: darkText,
          font: { size: 24, weight: 'bold' },
          padding: { bottom: 8 },
        },
        tooltip: { enabled: false },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: mediumText, font: { size: 11 }, maxRotation: 45, minRotation: 45 },
        },
        y: {
          title: {
            display: true,
            text: 'Minutos (+atraso / -adianto)',
            color: darkText,
            font: { size: 14, weight: 'bold' },
          },
          ticks: { color: mediumText, font: { size: 11 } },
          grid: { color: '#E5E7EB' },
        },
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
    titulo: isContinuation ? 'Acompanhamento de Tratos (continuação)' : 'Acompanhamento de Tratos',
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

// === KPIs do lote ===

function renderKPIsLote(ctx: RenderContext, resumo: ResumoLoteTrato) {
  const { doc, greenCard, white, shadowColor } = ctx

  const kpiX = 6
  const kpiW = 42
  const kpiH = 19
  const kpiGap = 3
  let kpiY = 50

  const kpiCards = [
    { label: 'Planejado (kg)', value: formatarInteiro(resumo.planejado_total_kg) },
    { label: 'Real (kg)', value: formatarInteiro(resumo.real_total_kg) },
    { label: 'Desvio (kg)', value: formatarInteiro(resumo.desvio_total_kg) },
    { label: 'Desvio médio %', value: `${formatarNumero(resumo.desvio_medio_pct, 2)}%` },
    { label: 'Dias c/ registro', value: formatarInteiro(resumo.dias_com_registro) },
    { label: 'Desvio médio horário', value: formatarMinutos(resumo.desvio_medio_min) },
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
    doc.setFontSize(8)
    setTextColor(doc, white)
    doc.setFont('helvetica', 'normal')
    doc.text(k.label, kpiX + kpiW / 2, kpiY + 15, { align: 'center' })
    kpiY += kpiH + kpiGap
  })
}

// === Pills de contagem de status ===

function renderPillsStatus(ctx: RenderContext, resumo: ResumoLoteTrato) {
  const { doc, pageW, shadowColor, white, darkText } = ctx

  const pillY = 34
  const pillX = 54
  const pillH = 14
  const pillGap = 4

  const pills = [
    { label: 'OK kg', value: resumo.n_ok, color: STATUS_KG_COLORS.ok },
    { label: 'Alerta kg', value: resumo.n_alerta, color: STATUS_KG_COLORS.alerta },
    { label: 'Crítico kg', value: resumo.n_critico, color: STATUS_KG_COLORS.critico },
    { label: 'Sem exec.', value: resumo.n_sem_execucao, color: STATUS_KG_COLORS.sem_execucao },
    { label: 'OK horário', value: resumo.n_horario_ok, color: STATUS_HORARIO_COLORS.ok },
    { label: 'Alerta hor.', value: resumo.n_horario_alerta, color: STATUS_HORARIO_COLORS.alerta },
    { label: 'Crítico hor.', value: resumo.n_horario_critico, color: STATUS_HORARIO_COLORS.critico },
  ]

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  const pillW = Math.max(28, ...pills.map((p) => Math.max(doc.getTextWidth(`${p.value}`), doc.getTextWidth(p.label)) + 12))

  let xAtual = pillX
  for (const p of pills) {
    setFillColor(doc, shadowColor)
    doc.roundedRect(xAtual + 0.5, pillY + 0.5, pillW, pillH, 4, 4, 'F')
    setFillColor(doc, white)
    doc.roundedRect(xAtual, pillY, pillW, pillH, 4, 4, 'F')
    // Bolinha colorida
    const [r, g, b] = hexToRgb(p.color)
    doc.setFillColor(r, g, b)
    doc.circle(xAtual + 3, pillY + pillH / 2, 1.5, 'F')
    // Valor
    doc.setFontSize(10)
    setTextColor(doc, darkText)
    doc.setFont('helvetica', 'bold')
    doc.text(`${p.value}`, xAtual + pillW / 2 + 2, pillY + 6, { align: 'center' })
    // Label
    doc.setFontSize(7)
    setTextColor(doc, '#6B7280')
    doc.setFont('helvetica', 'normal')
    doc.text(p.label, xAtual + pillW / 2 + 2, pillY + 11, { align: 'center' })
    xAtual += pillW + pillGap
    if (xAtual + pillW > pageW - 8) break
  }
}

// === Tabela detalhada ===

const MAX_ROWS_PER_PAGE = 18
const COL_WIDTHS = [22, 18, 12, 22, 22, 20, 18, 20, 20, 18, 20] // soma ~210mm (A4 landscape)
const COL_HEADERS = ['Data', 'Lote', 'Trato', 'Planejado', 'Real', 'Desvio kg', 'Desvio %', 'Horário sug.', 'Horário real', 'Desvio min', 'Status']

function renderTabelaDetalhada(
  ctx: RenderContext,
  linhas: LinhaTrato[],
  startY: number
): number {
  const { doc, pageW, darkText, mediumText, shadowColor, white } = ctx
  const tableW = COL_WIDTHS.reduce((a, b) => a + b, 0)
  const tableX = (pageW - tableW) / 2
  const rowH = 7
  let y = startY

  // Header da tabela
  setFillColor(doc, shadowColor)
  doc.roundedRect(tableX + 0.5, y + 0.5, tableW, rowH, 3, 3, 'F')
  setFillColor(doc, '#0F6437')
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

  // Linhas
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  let rowCount = 0
  for (const l of linhas) {
    if (rowCount >= MAX_ROWS_PER_PAGE) {
      // Indica continuação
      setTextColor(doc, mediumText)
      doc.text('... (continua na próxima página)', tableX + tableW / 2, y + 5, { align: 'center' })
      return -1 // sinal para criar nova página
    }

    // Zebra
    if (rowCount % 2 === 0) {
      setFillColor(doc, '#F9FAFB')
      doc.rect(tableX, y, tableW, rowH, 'F')
    }

    setTextColor(doc, darkText)
    const parts = l.data.split('-')
    const dataFmt = `${parts[2]}/${parts[1]}`
    const valores = [
      dataFmt,
      l.lote_nome,
      `T${l.ordem_trato}`,
      formatarNumero(l.kg_planejado, 1),
      formatarNumero(l.kg_ofertado_real, 1),
      formatarNumero(l.desvio_kg, 1),
      l.desvio_pct != null ? `${formatarNumero(l.desvio_pct, 1)}%` : '—',
      l.horario_sugerido ?? '—',
      l.horario_real ?? '—',
      formatarMinutos(l.desvio_min),
    ]

    xCol = tableX
    for (let i = 0; i < valores.length; i++) {
      doc.text(valores[i], xCol + COL_WIDTHS[i] / 2, y + 5, { align: 'center' })
      xCol += COL_WIDTHS[i]
    }

    // Badge de status (última coluna)
    const statusColor = STATUS_KG_COLORS[l.status_kg] || '#9CA3AF'
    const badgeX = xCol + 4
    const badgeW = COL_WIDTHS[COL_WIDTHS.length - 1] - 8
    const [r, g, b] = hexToRgb(statusColor)
    doc.setFillColor(r, g, b)
    doc.roundedRect(badgeX, y + 1.5, badgeW, 4, 2, 2, 'F')
    setTextColor(doc, white)
    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'bold')
    const statusLabel = l.status_kg === 'sem_execucao' ? 'S/exec' : l.status_kg.charAt(0).toUpperCase() + l.status_kg.slice(1)
    doc.text(statusLabel, badgeX + badgeW / 2, y + 4.5, { align: 'center' })
    doc.setFont('helvetica', 'normal')

    y += rowH
    rowCount++
  }

  return y
}

// === Função principal ===

export async function gerarRelatorioTratosPDF(params: ParametrosRelatorioTratos): Promise<Blob> {
  const { dataInicio, dataFim, fazendaNome, lotes } = params

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

  let logoFazendaBase64 = ''
  if (params.fazendaLogoUrl) {
    try {
      logoFazendaBase64 = await carregarLogoComoBase64(params.fazendaLogoUrl)
    } catch {
      // Silenciosamente continua sem logo
    }
  }

  const ctx: RenderContext = {
    doc, pageW, pageH, logoGestaoBase64, logoFazendaBase64, fazendaNome,
    greenDark, greenCard, white, darkText, mediumText, lightBg, cardBg, shadowColor,
  }

  let isFirstPage = true

  for (const lote of lotes) {
    // Página 1: header + período + pills + KPIs + gráfico de desvio kg
    if (isFirstPage) {
      isFirstPage = false
    } else {
      doc.addPage()
    }

    setFillColor(doc, lightBg)
    doc.rect(0, 0, pageW, pageH, 'F')

    renderHeader(ctx, lote.resumo.lote_nome, false)
    renderPeriodo(ctx, dataInicio, dataFim)
    renderPillsStatus(ctx, lote.resumo)
    renderKPIsLote(ctx, lote.resumo)

    // Gráfico de desvio de kg (canto direito)
    const chartX = 54
    const chartW = pageW - chartX - 8
    const chartY = 50
    const chartH = 70

    setFillColor(doc, shadowColor)
    doc.roundedRect(chartX + 0.5, chartY + 0.5, chartW, chartH, 4, 4, 'F')
    setFillColor(doc, cardBg)
    doc.roundedRect(chartX, chartY, chartW, chartH, 4, 4, 'F')

    try {
      const graficoKg = await renderizarGraficoDesvioKg(lote.linhas, chartW, chartH)
      if (graficoKg) {
        doc.addImage(graficoKg, 'PNG', chartX, chartY, chartW, chartH)
      }
    } catch (err) {
      console.error('Erro ao renderizar gráfico de kg:', err)
    }

    // Gráfico de desvio de horário (abaixo)
    const chart2Y = chartY + chartH + 4
    const chart2H = pageH - chart2Y - 8

    if (chart2H > 30) {
      setFillColor(doc, shadowColor)
      doc.roundedRect(chartX + 0.5, chart2Y + 0.5, chartW, chart2H, 4, 4, 'F')
      setFillColor(doc, cardBg)
      doc.roundedRect(chartX, chart2Y, chartW, chart2H, 4, 4, 'F')

      try {
        const graficoHorario = await renderizarGraficoDesvioHorario(lote.linhas, chartW, chart2H)
        if (graficoHorario) {
          doc.addImage(graficoHorario, 'PNG', chartX, chart2Y, chartW, chart2H)
        }
      } catch (err) {
        console.error('Erro ao renderizar gráfico de horário:', err)
      }
    }

    // Página 2+: tabela detalhada
    const linhasOrdenadas = [...lote.linhas].sort((a, b) => {
      if (a.data !== b.data) return b.data.localeCompare(a.data)
      if (a.lote_nome !== b.lote_nome) return a.lote_nome.localeCompare(b.lote_nome)
      return a.ordem_trato - b.ordem_trato
    })

    const chunks: LinhaTrato[][] = []
    for (let i = 0; i < linhasOrdenadas.length; i += MAX_ROWS_PER_PAGE) {
      chunks.push(linhasOrdenadas.slice(i, i + MAX_ROWS_PER_PAGE))
    }

    for (const chunk of chunks) {
      doc.addPage()
      setFillColor(doc, lightBg)
      doc.rect(0, 0, pageW, pageH, 'F')
      renderHeader(ctx, lote.resumo.lote_nome, true)
      renderTabelaDetalhada(ctx, chunk, 40)
    }
  }

  return doc.output('blob')
}
