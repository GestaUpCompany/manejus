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
  por_pasto?: AgregadoItem[]
  matriz_causa_categoria?: {
    causas: string[]
    categorias: string[]
    matriz: Record<string, Record<string, number>>
  }
  frequencia_diagnosticos: AgregadoItem[]
  // Campos opcionais para o PDF (calculados no frontend)
  taxa_mortalidade?: number | null
  rebanho_total?: number
  perda_estimada?: number | null
  peso_total_perdido?: number | null
  perda_por_categoria?: Record<string, { peso: number; perda: number; count: number }>
  insights?: string
  periodo_anterior?: {
    total_mortes: number
    taxa_mortalidade: number | null
    data_inicio: string
    data_fim: string
  } | null
  variacao_mortes?: number | null
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

export function formatarDataNumerica(dataStr: string | null | undefined): string {
  if (!dataStr) return '—'
  const parts = dataStr.split('-')
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
  return dataStr
}

export function formatarNumero(valor: number | null | undefined, casas = 2, padrao = '—'): string {
  if (valor === null || valor === undefined || isNaN(valor as number)) return padrao
  return (valor as number).toFixed(casas).replace('.', ',')
}

export function formatarInteiro(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || isNaN(valor as number)) return '—'
  return Math.round(valor as number).toString()
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

export function labelDiagnostico(chave: string): string {
  return DIAG_LABELS[chave] ?? chave
}

function titleCase(s: string | null | undefined): string {
  if (!s) return s ?? ''
  return s.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
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

// === Gráfico de mortes no tempo (granularidade adaptativa) ===

export async function renderizarGraficoMortesTempo(
  linhas: LinhaMorte[],
  width: number,
  height: number,
  dataInicio?: string,
  dataFim?: string
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
  if (gran === 'dia') {
    const inicio = new Date(`${dataInicio ?? linhas.map((l) => l.data).sort()[0]}T12:00:00`)
    const fim = new Date(`${dataFim ?? linhas.map((l) => l.data).sort()[linhas.length - 1]}T12:00:00`)
    for (const atual = new Date(inicio); atual <= fim; atual.setDate(atual.getDate() + 1)) {
      const chave = `${atual.getFullYear()}-${String(atual.getMonth() + 1).padStart(2, '0')}-${String(atual.getDate()).padStart(2, '0')}`
      if (!porPeriodo.has(chave)) porPeriodo.set(chave, { chave, label: `${String(atual.getDate()).padStart(2, '0')}/${String(atual.getMonth() + 1).padStart(2, '0')}`, count: 0 })
    }
  }
  const dados = Array.from(porPeriodo.values()).sort((a, b) => a.chave.localeCompare(b.chave))
  if (dados.length === 0) return null

  const canvas = document.createElement('canvas')
  const pxPerMm = 8
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
        barPercentage: 0.7,
        categoryPercentage: 0.85,
        maxBarThickness: 80,
      }],
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: { top: 18, right: 24, bottom: 38, left: 48 } },
      plugins: {
        legend: { display: false },
        title: { display: false },
        tooltip: { enabled: false },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: DARK_TEXT, font: { size: 36, weight: 'bold' }, maxRotation: 45, minRotation: 0, precision: 0, autoSkip: true, maxTicksLimit: 8 },
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Mortes',
            color: DARK_TEXT,
            font: { size: 30, weight: 'bold' },
          },
          suggestedMax: Math.max(...dados.map((d) => d.count), 1) + 1,
          ticks: { color: DARK_TEXT, font: { size: 30, weight: 'bold' }, precision: 0 },
          grid: { color: '#E5E7EB' },
        },
      },
    },
    plugins: [{
      id: 'dataLabels',
      afterDatasetsDraw(chart) {
        const { ctx } = chart
        chart.data.datasets[0].data.forEach((value, i) => {
          const meta = chart.getDatasetMeta(0)
          const bar = meta.data[i]
          if (!bar || Number(value) === 0) return
          ctx.save()
          ctx.fillStyle = DARK_TEXT
          ctx.font = 'bold 38px sans-serif'
          ctx.textAlign = 'center'
          const chartArea = chart.chartArea
          const labelY = Math.max(bar.y - 6, chartArea.top + 12)
          ctx.fillText(String(value), bar.x, labelY)
          ctx.restore()
        })
      },
    }],
  })

  const image = chart.toBase64Image()
  chart.destroy()
  return image
}

// === Gráfico de barras horizontais agregado (causa, categoria, etc.) ===

export async function renderizarGraficoBarrasHorizontais(
  itens: AgregadoItem[],
  titulo: string,
  width: number,
  height: number
): Promise<string | null> {
  if (itens.length === 0) return null
  const top = [...itens].sort((a, b) => b.valor - a.valor).slice(0, 12)
  const total = top.reduce((sum, item) => sum + item.valor, 0)

  const canvas = document.createElement('canvas')
  const pxPerMm = 8
  canvas.width = Math.round(width * pxPerMm)
  canvas.height = Math.round(height * pxPerMm)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const ChartMod = await import('chart.js/auto')
  const chart = new ChartMod.default(ctx, {
    type: 'bar',
    data: {
      labels: top.map((d) => titleCase(d.label)),
      datasets: [{
        label: titulo,
        data: top.map((d) => d.valor),
        backgroundColor: top.map((_, i) => i === 0 ? GREEN_DARK : '#A8CDB8'),
        borderRadius: 3,
        borderSkipped: false,
        barPercentage: 0.45,
        categoryPercentage: 0.6,
        maxBarThickness: 60,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: false,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: { top: 18, right: 95, bottom: 14, left: 20 } },
      plugins: {
        legend: { display: false },
        title: { display: false },
        tooltip: { enabled: false },
      },
      scales: {
        x: {
          beginAtZero: true,
          suggestedMax: Math.max(...top.map((d) => d.valor), 1) + 1,
          ticks: { color: DARK_TEXT, font: { size: 36, weight: 'bold' }, precision: 0 },
          grid: { color: '#E5E7EB' },
        },
        y: {
          grid: { display: false },
          ticks: { color: DARK_TEXT, font: { size: 36, weight: 'bold' } },
        },
      },
    },
    plugins: [{
      id: 'dataLabels',
      afterDatasetsDraw(chart) {
        const { ctx } = chart
        const chartArea = chart.chartArea
        chart.data.datasets[0].data.forEach((value, i) => {
          const meta = chart.getDatasetMeta(0)
          const bar = meta.data[i] as any
          if (!bar) return
          const pct = total > 0 ? ((Number(value) / total) * 100).toFixed(1).replace('.', ',') : '0,0'
          const label = `${value} · ${pct}%`
          // Em barras horizontais, bar.x representa o extremo da barra.
          // O rótulo fica sempre fora, evitando texto branco sobre o fundo claro.
          const x = Math.min(bar.x + 9, chartArea.right + 80)
          ctx.save()
          ctx.fillStyle = DARK_TEXT
          ctx.font = 'bold 38px sans-serif'
          ctx.textAlign = 'left'
          // bar.y já é o centro vertical do elemento no Chart.js.
          // O pequeno ajuste compensa a linha de base da fonte.
          ctx.fillText(label, x, bar.y + 5)
          ctx.restore()
        })
      },
    }],
  })

  const image = chart.toBase64Image()
  chart.destroy()
  return image
}

// === Gráfico de sexo ===

export async function renderizarGraficoSexo(
  itens: AgregadoItem[],
  width: number,
  height: number
): Promise<string | null> {
  if (itens.length === 0) return null
  const dados = [...itens].sort((a, b) => b.valor - a.valor)
  const total = dados.reduce((sum, item) => sum + item.valor, 0)
  const canvas = document.createElement('canvas')
  const pxPerMm = 8
  canvas.width = Math.round(width * pxPerMm)
  canvas.height = Math.round(height * pxPerMm)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const ChartMod = await import('chart.js/auto')
  const chart = new ChartMod.default(ctx, {
    type: 'bar',
    data: {
      labels: dados.map((item) => titleCase(item.label)),
      datasets: [{
        data: dados.map((item) => item.valor),
        backgroundColor: dados.map((_, index) => index === 0 ? GREEN_DARK : '#A8CDB8'),
        borderRadius: 5,
        borderSkipped: false,
        barPercentage: 0.45,
        categoryPercentage: 0.6,
        maxBarThickness: 60,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: false,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: { top: 18, right: 130, bottom: 16, left: 18 } },
      plugins: { legend: { display: false }, title: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { beginAtZero: true, max: Math.max(total, 1), ticks: { display: false }, grid: { display: false }, border: { display: false } },
        y: { grid: { display: false }, ticks: { color: DARK_TEXT, font: { size: 36, weight: 'bold' } }, border: { display: false } },
      },
    },
    plugins: [{
      id: 'sexoLabels',
      afterDatasetsDraw(chart) {
        const meta = chart.getDatasetMeta(0)
        const context = chart.ctx
        dados.forEach((item, index) => {
          const bar = meta.data[index] as any
          if (!bar) return
          const pct = total > 0 ? ((item.valor / total) * 100).toFixed(1).replace('.', ',') : '0,0'
          context.save()
          context.fillStyle = DARK_TEXT
          context.font = 'bold 38px sans-serif'
          context.textAlign = 'left'
          context.fillText(`${item.valor} · ${pct}%`, Math.min(bar.x + 10, chart.chartArea.right + 95), bar.y + 6)
          context.restore()
        })
      },
    }],
  })
  const image = chart.toBase64Image()
  chart.destroy()
  return image
}

// === Gráfico donut (sexo) ===

export async function renderizarGraficoDonut(
  itens: AgregadoItem[],
  titulo: string,
  width: number,
  height: number
): Promise<string | null> {
  if (itens.length === 0) return null

  const canvas = document.createElement('canvas')
  const pxPerMm = 8
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
      cutout: '60%',
      layout: { padding: { top: 35, right: 10, bottom: 10, left: 10 } },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: { color: DARK_TEXT, font: { size: 30, weight: 'bold' }, boxWidth: 20, padding: 28 },
        },
        title: {
          display: true,
          text: titulo,
          align: 'center',
          color: DARK_TEXT,
          font: { size: 36, weight: 'bold' },
          padding: { bottom: 8 },
        },
        tooltip: { enabled: false },
      },
    },
    plugins: [{
      id: 'dataLabels',
      afterDatasetsDraw(chart) {
        const { ctx, chartArea } = chart
        const total = chart.data.datasets[0].data.reduce((s, v) => s + (v as number), 0)

        // Valor e percentual em cada fatia
        chart.data.datasets[0].data.forEach((value, i) => {
          const meta = chart.getDatasetMeta(0)
          const arc = meta.data[i] as any
          if (!arc) return
          const val = value as number
          const pct = total > 0 ? ((val / total) * 100).toFixed(0) : '0'
          const pos = arc.tooltipPosition()
          ctx.save()
          ctx.fillStyle = WHITE
          ctx.font = 'bold 38px sans-serif'
          ctx.textAlign = 'center'
          ctx.fillText(String(val), pos.x, pos.y)
          ctx.font = '36px sans-serif'
          ctx.fillText(`${pct}%`, pos.x, pos.y + 30)
          ctx.restore()
        })

        // Total no centro do donut
        if (chartArea && total > 0) {
          const centerX = (chartArea.left + chartArea.right) / 2
          const centerY = (chartArea.top + chartArea.bottom) / 2
          ctx.save()
          ctx.fillStyle = DARK_TEXT
          ctx.textAlign = 'center'
          ctx.font = 'bold 38px sans-serif'
          ctx.fillText(String(total), centerX, centerY)
          ctx.font = '36px sans-serif'
          ctx.fillStyle = MEDIUM_TEXT
          ctx.fillText('mortes', centerX, centerY + 16)
          ctx.restore()
        }
      },
    }],
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

function renderPeriodo(ctx: RenderContext, dataInicio: string, dataFim: string, startY: number): number {
  const { doc, cardBg, darkText, shadowColor } = ctx
  const dataInicioFormatada = formatarDataNumerica(dataInicio)
  const dataFimFormatada = formatarDataNumerica(dataFim)
  const periodoText = `${dataInicioFormatada}  a  ${dataFimFormatada}`
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  const periodoW = doc.getTextWidth(periodoText) + 12
  const periodoX = 8
  const periodoH = 10
  setFillColor(doc, shadowColor)
  doc.roundedRect(periodoX + 0.5, startY + 0.5, periodoW, periodoH, 5, 5, 'F')
  setFillColor(doc, cardBg)
  doc.roundedRect(periodoX, startY, periodoW, periodoH, 5, 5, 'F')
  setTextColor(doc, darkText)
  doc.text(periodoText, periodoX + periodoW / 2, startY + 6.5, { align: 'center' })
  return startY + periodoH + 4
}

// === Insights (narrativa automática) ===

function renderInsights(ctx: RenderContext, insights: string, startY: number): number {
  if (!insights) return startY
  const { doc, pageW, darkText, cardBg, shadowColor } = ctx

  const textX = 18
  const rightMargin = 8
  const cardW = pageW - 16
  const textMaxW = cardW - (textX - 8) - rightMargin
  const lineH = 4.2

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  setTextColor(doc, darkText)
  const linhas = doc.splitTextToSize(insights, textMaxW) as string[]
  const boxH = linhas.length * lineH + 8

  // Card branco
  setFillColor(doc, shadowColor)
  doc.roundedRect(8.5, startY + 0.5, cardW, boxH, 3, 3, 'F')
  setFillColor(doc, cardBg)
  doc.roundedRect(8, startY, cardW, boxH, 3, 3, 'F')

  // Ícone de check (círculo verde)
  setFillColor(doc, GREEN_DARK)
  doc.circle(13, startY + 5, 1.5, 'F')
  setTextColor(doc, cardBg)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('✓', 13, startY + 6, { align: 'center' })

  // Texto
  setTextColor(doc, darkText)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  let y = startY + 6
  for (const linha of linhas) {
    doc.text(linha, textX, y)
    y += lineH
  }

  return startY + boxH + 4
}

// === KPIs ===

function renderKPIs(ctx: RenderContext, resumo: ResumoMorte, startY: number): number {
  const { doc, pageW, white, shadowColor } = ctx
  const kpiY = startY
  const kpiH = 16
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
    doc.text(k.value, x + kpiW / 2, kpiY + 7, { align: 'center', maxWidth: kpiW - 4 })
    doc.setFontSize(8)
    setTextColor(doc, white)
    doc.setFont('helvetica', 'normal')
    doc.text(k.label, x + kpiW / 2, kpiY + 12, { align: 'center' })
  })

  return kpiY + kpiH + 4
}

// === Segunda linha de KPIs: taxa de mortalidade, perda estimada, comparativo ===

function renderKPIsLinha2(ctx: RenderContext, resumo: ResumoMorte, startY: number): number {
  const { doc, pageW, white, shadowColor } = ctx
  if (resumo.taxa_mortalidade == null && resumo.perda_estimada == null && !resumo.periodo_anterior) return startY

  const kpiY = startY
  const kpiH = 16
  const kpiGap = 6
  const totalKpis = 3
  const kpiW = (pageW - 16 - (totalKpis - 1) * kpiGap) / totalKpis
  const kpiX0 = 8

  // KPI 1: Taxa de mortalidade
  if (resumo.taxa_mortalidade != null) {
    const x = kpiX0
    setFillColor(doc, shadowColor)
    doc.roundedRect(x + 0.5, kpiY + 0.5, kpiW, kpiH, 4, 4, 'F')
    setFillColor(doc, GREEN_DARK)
    doc.roundedRect(x, kpiY, kpiW, kpiH, 4, 4, 'F')
    doc.setFontSize(13)
    setTextColor(doc, white)
    doc.setFont('helvetica', 'bold')
    doc.text(`${formatarNumero(resumo.taxa_mortalidade, 2)}%`, x + kpiW / 2, kpiY + 7, { align: 'center' })
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text('Taxa de mortalidade', x + kpiW / 2, kpiY + 12, { align: 'center' })
    if (resumo.rebanho_total && resumo.rebanho_total > 0) {
      doc.setFontSize(7)
      doc.text(`Rebanho: ${formatarInteiro(resumo.rebanho_total)} cab.`, x + kpiW / 2, kpiY + 15, { align: 'center' })
    }
  }

  // KPI 2: Perda estimada (R$)
  if (resumo.perda_estimada != null && resumo.perda_estimada > 0) {
    const x = kpiX0 + kpiW + kpiGap
    setFillColor(doc, shadowColor)
    doc.roundedRect(x + 0.5, kpiY + 0.5, kpiW, kpiH, 4, 4, 'F')
    setFillColor(doc, '#EF4444')
    doc.roundedRect(x, kpiY, kpiW, kpiH, 4, 4, 'F')
    doc.setFontSize(12)
    setTextColor(doc, white)
    doc.setFont('helvetica', 'bold')
    const perdaTxt = `R$ ${resumo.perda_estimada.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    doc.text(perdaTxt, x + kpiW / 2, kpiY + 6, { align: 'center', maxWidth: kpiW - 4 })
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text('Perda estimada', x + kpiW / 2, kpiY + 12, { align: 'center' })
    if (resumo.peso_total_perdido != null && resumo.peso_total_perdido > 0) {
      doc.setFontSize(7)
      doc.text(`${formatarNumero(resumo.peso_total_perdido, 0)} kg perdidos`, x + kpiW / 2, kpiY + 15, { align: 'center' })
    }
  }

  // KPI 3: Comparativo com período anterior
  if (resumo.periodo_anterior) {
    const x = kpiX0 + 2 * (kpiW + kpiGap)
    setFillColor(doc, shadowColor)
    doc.roundedRect(x + 0.5, kpiY + 0.5, kpiW, kpiH, 4, 4, 'F')
    setFillColor(doc, GREEN_DARK)
    doc.roundedRect(x, kpiY, kpiW, kpiH, 4, 4, 'F')
    doc.setFontSize(11)
    setTextColor(doc, white)
    doc.setFont('helvetica', 'bold')
    doc.text(`${formatarInteiro(resumo.periodo_anterior.total_mortes)} mortes`, x + kpiW / 2, kpiY + 6, { align: 'center' })
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text('Período anterior', x + kpiW / 2, kpiY + 11, { align: 'center' })
    const periodoTxt = `${formatarDataNumerica(resumo.periodo_anterior.data_inicio)} a ${formatarDataNumerica(resumo.periodo_anterior.data_fim)}`
    doc.text(periodoTxt, x + kpiW / 2, kpiY + 15, { align: 'center', maxWidth: kpiW - 4 })
    if (resumo.periodo_anterior.taxa_mortalidade != null) {
      doc.setFontSize(6)
      doc.text(`Taxa: ${formatarNumero(resumo.periodo_anterior.taxa_mortalidade, 2)}%`, x + kpiW / 2, kpiY + 14.5, { align: 'center' })
    }
  }

  return kpiY + kpiH + 4
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

export function compactarDiagnosticos(diag: Record<string, DiagnosticoItem> | null): string {
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

  // === Página 1: header + período + insights + KPIs + gráficos ===
  setFillColor(doc, LIGHT_BG)
  doc.rect(0, 0, pageW, pageH, 'F')
  renderHeader(ctx, false)

  // Layout dinâmico: cada seção retorna a próxima posição Y
  let cursorY = 32
  cursorY = renderPeriodo(ctx, dataInicio, dataFim, cursorY)

  // Insights (narrativa automática)
  if (resumo.insights) {
    cursorY = renderInsights(ctx, resumo.insights, cursorY)
  }

  // KPIs linha 1
  cursorY = renderKPIs(ctx, resumo, cursorY)

  // KPIs linha 2 (taxa de mortalidade, perda estimada, comparativo)
  cursorY = renderKPIsLinha2(ctx, resumo, cursorY)

  // Layout dos gráficos: 2 colunas x 2 linhas
  const chartTopY = cursorY
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
