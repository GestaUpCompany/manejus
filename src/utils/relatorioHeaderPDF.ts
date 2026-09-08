import type jsPDF from 'jspdf'

// === Paleta de cores compartilhada ===
const GREEN_DARK = '#0F6437'
const WHITE = '#FFFFFF'
const DARK_TEXT = '#1F2937'
const MEDIUM_TEXT = '#6B7280'
const CARD_BG = '#FFFFFF'
const SHADOW_COLOR = '#00000012'
const YELLOW = '#FACC15'

// === Helpers de cor ===

function setFillColor(doc: jsPDF, hex: string) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  doc.setFillColor(r, g, b)
}

function setTextColor(doc: jsPDF, hex: string) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  doc.setTextColor(r, g, b)
}

// === Contexto do header ===

export interface HeaderContext {
  doc: jsPDF
  pageW: number
  logoGestaoBase64: string
  logoFazendaBase64: string
}

export interface HeaderOptions {
  /** Título exibido no card branco central (ex: "Análise de Consumo") */
  titulo: string
  /** Subtítulo opcional abaixo do título (ex: nome da fazenda) */
  subtitulo?: string
  /** Texto exibido na pill do canto direito (ex: "L1"). Omitir para não renderizar. */
  pillLabel?: string
  /** Rótulo pequeno acima do valor da pill (ex: "Lote"). Default: "Lote". */
  pillTitulo?: string
}

// === Header compartilhado (padrão Manejus 360) ===
//
// Estrutura: barra verde full-width, logo GestaUp + nome do sistema à esquerda,
// título central em card branco, logo da fazenda (e pill opcional) à direita.

export function renderRelatorioHeader(ctx: HeaderContext, opts: HeaderOptions) {
  const { doc, pageW, logoGestaoBase64, logoFazendaBase64 } = ctx
  const { titulo, subtitulo, pillLabel, pillTitulo = 'Lote' } = opts

  // Barra verde
  setFillColor(doc, GREEN_DARK)
  doc.rect(0, 0, pageW, 28, 'F')

  // === Lado esquerdo: logo GestaUp + nome do sistema ===
  const logoSize = 16
  const logoX = 10
  const logoY = 6
  const logoMargin = 0.6
  let nextX = logoX + logoSize + 6

  if (logoGestaoBase64) {
    const formato = logoGestaoBase64.toLowerCase().includes('data:image/png') ? 'PNG' : 'JPEG'
    setFillColor(doc, CARD_BG)
    doc.roundedRect(logoX, logoY, logoSize, logoSize, 2, 2, 'F')
    doc.addImage(logoGestaoBase64, formato, logoX + logoMargin, logoY + logoMargin, logoSize - logoMargin * 2, logoSize - logoMargin * 2)
  }

  // Nome do sistema "Manej'Us 360" (360 em amarelo)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  setTextColor(doc, WHITE)
  doc.text("Manej'Us ", nextX, logoY + 11)
  const manejUsW = doc.getTextWidth("Manej'Us ")
  setTextColor(doc, YELLOW)
  doc.text('360', nextX + manejUsW, logoY + 11)
  const manejusTotalW = manejUsW + doc.getTextWidth('360')
  const leftEnd = nextX + manejusTotalW + 8

  // === Lado direito: pill opcional + logo da fazenda ===
  const pillW = 50
  const pillH = 14
  const pillY = 7
  let rightStart = pageW - 10

  // Logo da fazenda no canto direito
  let fazendaW = 0
  let fazendaH = 0
  if (logoFazendaBase64) {
    const formato = logoFazendaBase64.toLowerCase().includes('data:image/png') ? 'PNG' : 'JPEG'
    try {
      const props = doc.getImageProperties(logoFazendaBase64)
      const maxFazendaH = 16
      const maxFazendaW = 40
      fazendaH = Math.min(maxFazendaH, (maxFazendaW * props.height) / props.width)
      fazendaW = (fazendaH * props.width) / props.height
      const fazendaX = pageW - fazendaW - 10
      const fazendaYPos = logoY + (logoSize - fazendaH) / 2
      const radius = Math.min(2, Math.min(fazendaW, fazendaH) / 4)

      setFillColor(doc, CARD_BG)
      doc.roundedRect(fazendaX, fazendaYPos, fazendaW, fazendaH, radius, radius, 'F')
      doc.addImage(logoFazendaBase64, formato, fazendaX + logoMargin, fazendaYPos + logoMargin, fazendaW - logoMargin * 2, fazendaH - logoMargin * 2)
      rightStart = fazendaX - 6
    } catch {
      // Ignora se não conseguir carregar
    }
  }

  // Pill à esquerda da logo da fazenda (opcional)
  if (pillLabel) {
    const pillX = rightStart - pillW
    setFillColor(doc, SHADOW_COLOR)
    doc.roundedRect(pillX + 0.5, pillY + 0.5, pillW, pillH, 7, 7, 'F')
    setFillColor(doc, CARD_BG)
    doc.roundedRect(pillX, pillY, pillW, pillH, 7, 7, 'F')
    doc.setFontSize(8)
    setTextColor(doc, MEDIUM_TEXT)
    doc.setFont('helvetica', 'normal')
    doc.text(pillTitulo, pillX + pillW / 2, pillY + 5, { align: 'center' })
    doc.setFontSize(10)
    setTextColor(doc, DARK_TEXT)
    doc.setFont('helvetica', 'bold')
    doc.text(pillLabel, pillX + pillW / 2, pillY + 11, { align: 'center' })
    rightStart = pillX - 6
  }

  // === Centro: título em card branco, centralizado na página ===
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  const availableTitleW = Math.max(80, rightStart - leftEnd)
  const titleW = Math.min(availableTitleW, Math.max(doc.getTextWidth(titulo), subtitulo ? doc.getTextWidth(subtitulo) : 0) + 24)
  const titleCardX = pageW / 2 - titleW / 2
  const titleCardY = 7
  const titleCardH = subtitulo ? 17 : 14

  setFillColor(doc, SHADOW_COLOR)
  doc.roundedRect(titleCardX + 0.5, titleCardY + 0.5, titleW, titleCardH, 7, 7, 'F')
  setFillColor(doc, CARD_BG)
  doc.roundedRect(titleCardX, titleCardY, titleW, titleCardH, 7, 7, 'F')
  doc.setFontSize(12)
  setTextColor(doc, GREEN_DARK)
  doc.text(titulo, titleCardX + titleW / 2, titleCardY + 8, { align: 'center' })
  if (subtitulo) {
    doc.setFontSize(9)
    setTextColor(doc, MEDIUM_TEXT)
    doc.setFont('helvetica', 'normal')
    doc.text(subtitulo, titleCardX + titleW / 2, titleCardY + 14, { align: 'center' })
  }
}
