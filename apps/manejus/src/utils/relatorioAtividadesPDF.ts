import type jsPDF from 'jspdf'
import { renderRelatorioHeader, type HeaderContext } from './relatorioHeaderPDF'

// === Paleta ===
const GREEN_DARK = '#0F6437'
const LIGHT_BG = '#F5F5F5'
const DARK_TEXT = '#1F2937'
const MEDIUM_TEXT = '#6B7280'

const STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em Andamento',
  concluido: 'Concluído',
  concluida: 'Concluído',
}

interface MetricaFuncPDF {
  nome: string
  atribuidas: number
  concluidas: number
  emAndamento: number
  pendentes: number
  naoPrevistas: number
  tempoProdutivo: number
}

interface MetricaSetorPDF {
  setor: string
  total: number
  concluidas: number
  pendentes: number
  atrasadas: number
  tempoProdutivo: number
  taxaConclusao: number
}

interface DistItemPDF {
  name: string
  value: number
  color: string
}

interface NaoPrevistaPDF {
  id: string
  titulo: string
  data_inicio: string
  data_fim: string
  status: string
  funcionarios: { funcionario_nome: string; tempo_gasto_segundos: number | null }[]
}

interface ImprevistoPDF {
  id: string
  tipo: string
  descricao: string | null
  ocorrido_at: string
  impacto_minutos: number | null
  atividade_titulo: string
  funcionario_nome: string
}

interface AtividadePDF {
  id: string
  titulo: string
  data_inicio: string
  data_fim: string
  status: string
  atrasada: boolean
  nao_prevista: boolean
  funcionarios: { funcionario_nome: string; tempo_gasto_segundos: number | null }[]
}

interface KPIsPDF {
  total: number
  concluidas: number
  taxaConclusao: number
  atrasadas: number
  taxaAtraso: number
  tempoTotal: number
  tempoMedio: number
  naoPrevistas: number
  imprevistosCount: number
}

interface VariacoesPDF {
  total: number | null
  taxaConclusao: number | null
  tempoProdutivo: number | null
}

export interface DadosPDFRelatorioAtividades {
  titulo: string
  fazendaNome?: string
  fazendaLogoUrl?: string | null
  dataInicio: string
  dataFim: string
  setor?: string
  kpis: KPIsPDF
  metricasFunc: MetricaFuncPDF[]
  metricasSetor: MetricaSetorPDF[]
  distStatus: DistItemPDF[]
  distPrioridade: DistItemPDF[]
  naoPrevistasLista: NaoPrevistaPDF[]
  imprevistos: ImprevistoPDF[]
  atividades: AtividadePDF[]
  variacoes: VariacoesPDF
}

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

function formatarTempo(segundos: number): string {
  if (segundos <= 0) return '0min'
  const h = Math.floor(segundos / 3600)
  const m = Math.floor((segundos % 3600) / 60)
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}min`
  if (m > 0) return `${m}min`
  return `${segundos}s`
}

function formatarData(d: string): string {
  if (!d) return '—'
  const parts = d.split('-')
  if (parts.length === 3) return `${parts[2]}/${parts[1]}`
  return d
}

function formatarDataHora(iso: string | null): string {
  if (!iso) return ''
  const dt = new Date(iso)
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' +
    dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

interface RenderContext {
  doc: jsPDF
  pageW: number
  pageH: number
  logoBase64: string
  logoFazendaBase64: string
  fazendaNome: string
}

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

function renderPeriodo(ctx: RenderContext, dataInicio: string, dataFim: string, setor?: string) {
  const { doc, pageW } = ctx
  const periodoTexto = dataInicio || dataFim
    ? `${formatarData(dataInicio || '—')} a ${formatarData(dataFim || '—')}`
    : 'Últimos 30 dias'
  const setorTexto = setor ? ` · Setor: ${setor}` : ''
  doc.setFontSize(9)
  setTextColor(doc, MEDIUM_TEXT)
  doc.text(`Período: ${periodoTexto}${setorTexto}`, pageW / 2, 34, { align: 'center' })
}

function renderKPIs(ctx: RenderContext, kpis: KPIsPDF, variacoes: VariacoesPDF): number {
  const { doc, pageW } = ctx
  const margin = 8
  const gapX = 3
  const cardW = (pageW - margin * 2 - gapX * 3) / 4
  const cardH = 12
  const y = 38

  const items = [
    { label: 'Total', valor: String(kpis.total), cor: DARK_TEXT, var: variacoes.total, suffix: '%' },
    { label: 'Taxa conclusão', valor: `${kpis.taxaConclusao}%`, cor: '#22C55E', var: variacoes.taxaConclusao, suffix: 'p.p.' },
    { label: 'Taxa de atraso', valor: `${kpis.taxaAtraso}%`, cor: '#EF4444', var: null, suffix: '' },
    { label: 'Tempo produtivo', valor: formatarTempo(kpis.tempoTotal), cor: '#3B82F6', var: variacoes.tempoProdutivo, suffix: '%' },
    { label: 'Tempo médio', valor: kpis.concluidas > 0 ? formatarTempo(kpis.tempoMedio) : '-', cor: '#3B82F6', var: null, suffix: '' },
    { label: 'Não previstas', valor: String(kpis.naoPrevistas), cor: '#8B5CF6', var: null, suffix: '' },
    { label: 'Imprevistos', valor: String(kpis.imprevistosCount), cor: '#EF4444', var: null, suffix: '' },
  ]

  let maxY = y
  for (let i = 0; i < items.length; i++) {
    const col = i % 4
    const row = Math.floor(i / 4)
    const x = margin + col * (cardW + gapX)
    const cy = y + row * (cardH + gapX)
    maxY = Math.max(maxY, cy + cardH)

    setFillColor(doc, '#FFFFFF')
    doc.roundedRect(x, cy, cardW, cardH, 1, 1, 'F')

    doc.setFontSize(6)
    setTextColor(doc, MEDIUM_TEXT)
    doc.text(items[i].label, x + 2, cy + 3.5)

    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    setTextColor(doc, items[i].cor)
    doc.text(items[i].valor, x + 2, cy + 8)
    doc.setFont('helvetica', 'normal')

    if (items[i].var !== null && items[i].var !== undefined) {
      const v = items[i].var as number
      const varLabel = items[i].suffix === 'p.p.' ? `${v > 0 ? '+' : ''}${v} p.p.` : `${v > 0 ? '+' : ''}${v}%`
      const varCor = v > 0 ? '#22C55E' : v < 0 ? '#EF4444' : MEDIUM_TEXT
      doc.setFontSize(6)
      setTextColor(doc, varCor)
      doc.text(varLabel, x + 2, cy + 11)
    }
  }

  return maxY
}

export async function gerarRelatorioAtividadesPDF(dados: DadosPDFRelatorioAtividades): Promise<Blob> {
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

  let logoBase64 = ''
  try {
    logoBase64 = await carregarLogoComoBase64('/images/manejus360.png')
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
    doc, pageW, pageH, logoBase64, logoFazendaBase64, fazendaNome: dados.fazendaNome || '',
  }

  // === Página 1 ===
  setFillColor(doc, LIGHT_BG)
  doc.rect(0, 0, pageW, pageH, 'F')

  renderHeader(ctx, dados.titulo)
  renderPeriodo(ctx, dados.dataInicio, dados.dataFim, dados.setor)
  let y = renderKPIs(ctx, dados.kpis, dados.variacoes) + 10

  // Tabela de produtividade por funcionário
  if (dados.metricasFunc.length > 0) {
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    setTextColor(doc, DARK_TEXT)
    doc.text('Produtividade por Funcionário', margin, y)
    doc.setFont('helvetica', 'normal')
    y += 2

    autoTableMod.default(doc, {
      startY: y,
      head: [['Funcionário', 'Atrib.', 'Concl.', 'Andam.', 'Pend.', 'Não prev.', 'Tempo prod.', 'Taxa']],
      body: dados.metricasFunc.map((m) => {
        const taxa = m.atribuidas > 0 ? Math.round((m.concluidas / m.atribuidas) * 100) : 0
        return [
          m.nome,
          String(m.atribuidas),
          String(m.concluidas),
          String(m.emAndamento),
          String(m.pendentes),
          String(m.naoPrevistas || 0),
          formatarTempo(m.tempoProdutivo),
          `${taxa}%`,
        ]
      }),
      theme: 'striped',
      headStyles: { fillColor: hexToRgb(GREEN_DARK), textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: hexToRgb(DARK_TEXT) },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin, right: margin },
    })

    // @ts-expect-error - autoTable adiciona finalY ao doc
    y = doc.lastAutoTable.finalY + 5
  }

  // Tabela de análise por setor
  if (dados.metricasSetor.length > 0) {
    if (y > pageH - 40) {
      doc.addPage()
      setFillColor(doc, LIGHT_BG)
      doc.rect(0, 0, pageW, pageH, 'F')
      renderHeader(ctx, dados.titulo)
      y = 35
    }

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    setTextColor(doc, DARK_TEXT)
    doc.text('Análise por Setor', margin, y)
    doc.setFont('helvetica', 'normal')
    y += 2

    autoTableMod.default(doc, {
      startY: y,
      head: [['Setor', 'Total', 'Concl.', 'Pend.', 'Atrasadas', 'Tempo prod.', 'Taxa conclusão']],
      body: dados.metricasSetor.map((s) => [
        s.setor,
        String(s.total),
        String(s.concluidas),
        String(s.pendentes),
        String(s.atrasadas || 0),
        formatarTempo(s.tempoProdutivo),
        `${s.taxaConclusao}%`,
      ]),
      theme: 'striped',
      headStyles: { fillColor: hexToRgb(GREEN_DARK), textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: hexToRgb(DARK_TEXT) },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin, right: margin },
    })

    // @ts-expect-error - autoTable adiciona finalY ao doc
    y = doc.lastAutoTable.finalY + 5
  }

  // Distribuição por status e prioridade lado a lado em uma única tabela
  if (dados.distStatus.length > 0 || dados.distPrioridade.length > 0) {
    if (y > pageH - 25) {
      doc.addPage()
      setFillColor(doc, LIGHT_BG)
      doc.rect(0, 0, pageW, pageH, 'F')
      renderHeader(ctx, dados.titulo)
      y = 35
    }

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    setTextColor(doc, DARK_TEXT)
    doc.text('Distribuição por Status e Prioridade', margin, y)
    doc.setFont('helvetica', 'normal')
    y += 2

    const maxStatus = dados.distStatus.length
    const maxPrio = dados.distPrioridade.length
    const maxRows = Math.max(maxStatus, maxPrio)
    const distBody: (string | number | null)[][] = []
    for (let i = 0; i < maxRows; i++) {
      distBody.push([
        dados.distStatus[i]?.name || '',
        dados.distStatus[i] ? String(dados.distStatus[i].value) : '',
        dados.distPrioridade[i]?.name || '',
        dados.distPrioridade[i] ? String(dados.distPrioridade[i].value) : '',
      ])
    }

    autoTableMod.default(doc, {
      startY: y,
      head: [['Status', 'Qtd.', 'Prioridade', 'Qtd.']],
      body: distBody,
      theme: 'striped',
      headStyles: { fillColor: hexToRgb(GREEN_DARK), textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: pageW / 4 - 10 },
        1: { cellWidth: pageW / 4 - 10, halign: 'center' },
        2: { cellWidth: pageW / 4 - 10 },
        3: { cellWidth: pageW / 4 - 10, halign: 'center' },
      },
      margin: { left: margin, right: margin },
    })

    // @ts-expect-error - autoTable adiciona finalY ao doc
    y = doc.lastAutoTable.finalY + 5
  }

  // === Tabelas detalhadas (na mesma página se couber, senão nova página) ===
  const espacoRestante = pageH - y
  const precisaNovaPagina = espacoRestante < 25 &&
    (dados.naoPrevistasLista.length > 0 || dados.imprevistos.length > 0 || dados.atividades.length > 0)
  if (precisaNovaPagina) {
    doc.addPage()
    setFillColor(doc, LIGHT_BG)
    doc.rect(0, 0, pageW, pageH, 'F')
    renderHeader(ctx, dados.titulo)
    y = 32
  }

  // Atividades não previstas
  if (dados.naoPrevistasLista.length > 0) {
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    setTextColor(doc, DARK_TEXT)
    doc.text(`Atividades Não Previstas (${dados.naoPrevistasLista.length})`, margin, y)
    doc.setFont('helvetica', 'normal')
    y += 2

    autoTableMod.default(doc, {
      startY: y,
      head: [['Título', 'Responsável', 'Data', 'Status', 'Tempo']],
      body: dados.naoPrevistasLista.slice(0, 30).map((a) => {
        const func = a.funcionarios[0]
        const tempo = func?.tempo_gasto_segundos || 0
        const isConcluida = a.status === 'concluido' || a.status === 'concluida'
        return [
          a.titulo,
          func?.funcionario_nome || '-',
          formatarData(a.data_inicio),
          STATUS_LABELS[a.status] || a.status,
          isConcluida && tempo > 0 ? formatarTempo(tempo) : '-',
        ]
      }),
      theme: 'striped',
      headStyles: { fillColor: hexToRgb('#8B5CF6'), textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: hexToRgb(DARK_TEXT) },
      alternateRowStyles: { fillColor: [250, 245, 255] },
      margin: { left: margin, right: margin },
    })

    // @ts-expect-error - autoTable adiciona finalY ao doc
    y = doc.lastAutoTable.finalY + 5
  }

  // Imprevistos
  if (dados.imprevistos.length > 0) {
    if (y > pageH - 15) {
      doc.addPage()
      setFillColor(doc, LIGHT_BG)
      doc.rect(0, 0, pageW, pageH, 'F')
      renderHeader(ctx, dados.titulo)
      y = 35
    }

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    setTextColor(doc, DARK_TEXT)
    doc.text(`Imprevistos do Período (${dados.imprevistos.length})`, margin, y)
    doc.setFont('helvetica', 'normal')
    y += 2

    autoTableMod.default(doc, {
      startY: y,
      head: [['Quando', 'Tipo', 'Atividade', 'Funcionário', 'Descrição', 'Impacto']],
      body: dados.imprevistos.slice(0, 50).map((i) => [
        formatarDataHora(i.ocorrido_at),
        i.tipo,
        i.atividade_titulo,
        i.funcionario_nome,
        i.descricao || '-',
        i.impacto_minutos != null ? `${i.impacto_minutos}min` : '-',
      ]),
      theme: 'striped',
      headStyles: { fillColor: hexToRgb('#F59E0B'), textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: hexToRgb(DARK_TEXT) },
      alternateRowStyles: { fillColor: [253, 250, 240] },
      margin: { left: margin, right: margin },
    })

    // @ts-expect-error - autoTable adiciona finalY ao doc
    y = doc.lastAutoTable.finalY + 5
  }

  // Lista detalhada de atividades
  if (dados.atividades.length > 0) {
    if (y > pageH - 15) {
      doc.addPage()
      setFillColor(doc, LIGHT_BG)
      doc.rect(0, 0, pageW, pageH, 'F')
      renderHeader(ctx, dados.titulo)
      y = 35
    }

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    setTextColor(doc, DARK_TEXT)
    doc.text(`Atividades Detalhadas (${dados.atividades.length})`, margin, y)
    doc.setFont('helvetica', 'normal')
    y += 2

    autoTableMod.default(doc, {
      startY: y,
      head: [['Título', 'Responsáveis', 'Data', 'Status', 'Tempo']],
      body: dados.atividades.slice(0, 80).map((a) => {
        const tempo = a.funcionarios.reduce((s, af) => s + (af.tempo_gasto_segundos || 0), 0)
        const responsaveis = a.funcionarios.map((af) => af.funcionario_nome).join(', ')
        const statusLabel = STATUS_LABELS[a.status] || a.status
        const statusFull = a.atrasada ? `${statusLabel} (Atrasada)` : a.nao_prevista ? `${statusLabel} (Não prevista)` : statusLabel
        return [
          a.titulo.length > 40 ? a.titulo.substring(0, 40) + '...' : a.titulo,
          responsaveis.length > 30 ? responsaveis.substring(0, 30) + '...' : responsaveis,
          formatarData(a.data_inicio),
          statusFull,
          tempo > 0 ? formatarTempo(tempo) : '-',
        ]
      }),
      theme: 'striped',
      headStyles: { fillColor: hexToRgb(GREEN_DARK), textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: hexToRgb(DARK_TEXT) },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin, right: margin },
    })
  }

  return doc.output('blob')
}
