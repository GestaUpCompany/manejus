import type jsPDF from 'jspdf'
import type { PlanoAgrupado } from '../pages/controller/HistoricoPlanos'

// ===== Utils =====
function fmt(n: number | null | undefined, digits = 2): string {
  if (n == null) return '—'
  return n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
function fmtDate(d: string | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR')
}
function fmtMoney(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function getMetric(plano: PlanoAgrupado, tipo: 'entrada' | 'saida', key: string): any {
  const reg = tipo === 'entrada' ? plano.entrada : plano.saida
  if (!reg) return null
  return reg.metricas_derivadas?.[key] ?? reg.snapshot?.[key] ?? null
}
function cap(s: string): string {
  return s?.replace(/\b\w/g, (c: string) => c.toUpperCase()) || '—'
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size))
}

async function renderChart(config: any, w = 900, h = 450): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const { Chart, registerables } = await import('chart.js')
  Chart.register(...registerables)
  const chart = new Chart(ctx, config)
  await new Promise((r) => setTimeout(r, 150))
  const dataUrl = canvas.toDataURL('image/png', 1.0)
  chart.destroy()
  canvas.remove()
  return dataUrl
}

// ===== Cores =====
const C = {
  blue: [26, 58, 42] as [number, number, number],
  blueLight: [219, 238, 226] as [number, number, number],
  blueDark: [15, 40, 30] as [number, number, number],
  green: [22, 163, 74] as [number, number, number],
  greenLight: [220, 252, 231] as [number, number, number],
  red: [239, 68, 68] as [number, number, number],
  redLight: [254, 226, 226] as [number, number, number],
  yellow: [250, 204, 21] as [number, number, number],
  yellowLight: [254, 249, 195] as [number, number, number],
  gray: [107, 114, 128] as [number, number, number],
  grayLight: [243, 244, 246] as [number, number, number],
  grayMid: [209, 213, 219] as [number, number, number],
  dark: [17, 24, 39] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  logoBg: [248, 250, 248] as [number, number, number],
}

async function roundedImageDataURL(dataUrl: string, size: number, radius: number): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  ctx.beginPath()
  ctx.moveTo(radius, 0)
  ctx.lineTo(size - radius, 0)
  ctx.quadraticCurveTo(size, 0, size, radius)
  ctx.lineTo(size, size - radius)
  ctx.quadraticCurveTo(size, size, size - radius, size)
  ctx.lineTo(radius, size)
  ctx.quadraticCurveTo(0, size, 0, size - radius)
  ctx.lineTo(0, radius)
  ctx.quadraticCurveTo(0, 0, radius, 0)
  ctx.closePath()
  ctx.clip()

  const img = new Image()
  img.src = dataUrl
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Erro ao carregar imagem para arredondar'))
  })
  ctx.drawImage(img, 0, 0, size, size)
  return canvas.toDataURL('image/png')
}

// ===== Gauge: gráfico de progresso da meta =====
async function renderGauge(percent: number): Promise<string> {
  const clamped = Math.max(0, Math.min(100, percent))
  const color = clamped >= 80 ? 'rgba(22, 163, 74, 0.9)' : clamped >= 50 ? 'rgba(234, 179, 8, 0.9)' : 'rgba(239, 68, 68, 0.9)'
  return renderChart({
    type: 'doughnut',
    data: {
      datasets: [
        { data: [clamped, 100 - clamped], backgroundColor: [color, 'rgba(229, 231, 235, 0.5)'], borderWidth: 0, circumference: 180, rotation: 270 },
      ],
    },
    options: {
      responsive: false,
      animation: false,
      cutout: '75%',
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
    },
  }, 300, 200)
}

// ===== KPI Card =====
function drawKPICard(doc: jsPDF, x: number, y: number, w: number, h: number, label: string, value: string, sub: string, color: [number, number, number], bgColor: [number, number, number]) {
  doc.setFillColor(...bgColor)
  doc.roundedRect(x, y, w, h, 2.5, 2.5, 'F')
  doc.setFillColor(...color)
  doc.roundedRect(x, y, 2, h, 0, 0, 'F')
  doc.setFontSize(6.5)
  doc.setTextColor(...C.gray)
  doc.setFont('helvetica', 'normal')
  doc.text(label.toUpperCase(), x + 5, y + 7)
  doc.setFontSize(14)
  doc.setTextColor(...C.dark)
  doc.setFont('helvetica', 'bold')
  doc.text(value, x + 5, y + 16)
  doc.setFontSize(6.5)
  doc.setTextColor(...C.gray)
  doc.setFont('helvetica', 'normal')
  doc.text(sub, x + 5, y + 22)
}

// ===== Seção header =====
function sectionHeader(doc: jsPDF, title: string, y: number, margin: number, pageW: number, color: [number, number, number] = C.blue) {
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...color)
  doc.text(title, margin, y)
  y += 2
  doc.setDrawColor(...color)
  doc.setLineWidth(0.5)
  doc.line(margin, y, pageW - margin, y)
  doc.setDrawColor(...C.grayMid)
  doc.setLineWidth(0.2)
  doc.line(margin, y + 0.8, pageW - margin, y + 0.8)
  doc.setTextColor(0, 0, 0)
  return y + 6
}

// ===== Main =====
export async function gerarRelatorioPlanosPDF(
  planos: PlanoAgrupado[],
  nomeFazenda: string,
  filtros: { lote: string; categoria: string }
): Promise<void> {
  const jsPDFMod = await import('jspdf')
  const autoTableMod = await import('jspdf-autotable')
  const doc = new jsPDFMod.default({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 14
  const contentW = pageW - margin * 2

  const planosComSaida = planos.filter((p) => p.saida)
  const planosVigentes = planos.filter((p) => p.vigente)
  const todosLotes = [...new Set(planos.map((p) => p.nomeLote))]

  // ===== Cálculos agregados (médias ponderadas) =====
  // GMD: ponderado pelos dias de duração de cada plano.
  // Ganho, custo e mortalidade: ponderados pela quantidade de cabeças do plano.
  const agg = planosComSaida.reduce((acc: any, p) => {
    const dias = p.saida?.duracao_dias ?? 1
    const quantRaw = getMetric(p, 'saida', 'quant_atual') ?? 1
    const quant = typeof quantRaw === 'number' && quantRaw > 0 ? quantRaw : 1

    const gmdR = p.saida?.gmd_realizado
    if (gmdR != null) { acc.gmdRealNum += gmdR * dias; acc.gmdRealDen += dias }

    const gmdP = p.entrada?.gmd_planejado ?? p.saida?.gmd_planejado
    if (gmdP != null) { acc.gmdPlanNum += gmdP * dias; acc.gmdPlanDen += dias }

    const ganho = p.saida?.ganho_peso_total_kg_cab
    if (ganho != null) { acc.ganhoNum += ganho * quant; acc.ganhoDen += quant }

    const custo = getMetric(p, 'saida', 'custo_total_producao_cab')
    if (custo != null && !isNaN(custo)) { acc.custoNum += custo * quant; acc.custoDen += quant }

    const mort = p.saida?.mortalidade_percent
    if (mort != null) { acc.mortNum += mort * quant; acc.mortDen += quant }

    const prod = p.saida?.producao_arroba_lote
    if (prod != null) { acc.producaoTotal += prod }

    return acc
  }, { gmdRealNum: 0, gmdRealDen: 0, gmdPlanNum: 0, gmdPlanDen: 0, ganhoNum: 0, ganhoDen: 0, custoNum: 0, custoDen: 0, mortNum: 0, mortDen: 0, producaoTotal: 0 })

  const gmdMedioReal = agg.gmdRealDen ? agg.gmdRealNum / agg.gmdRealDen : null
  const gmdMedioPlan = agg.gmdPlanDen ? agg.gmdPlanNum / agg.gmdPlanDen : null
  const producaoTotal = agg.producaoTotal
  const ganhoMedio = agg.ganhoDen ? agg.ganhoNum / agg.ganhoDen : null
  const custoMedio = agg.custoDen ? agg.custoNum / agg.custoDen : null
  const mortalidadeMedia = agg.mortDen ? agg.mortNum / agg.mortDen : null
  const eficienciaGMD = gmdMedioReal != null && gmdMedioPlan != null && gmdMedioPlan > 0 ? (gmdMedioReal / gmdMedioPlan) * 100 : null

  // ===== Página 1: Capa =====
  doc.setFillColor(...C.blue)
  doc.rect(0, 0, pageW, 52, 'F')
  doc.setFillColor(...C.blueDark)
  doc.rect(0, 49.5, pageW, 2.5, 'F')

  // Logomarca
  let logoImg: string | null = null
  let logoRounded: string | null = null
  try {
    const logoUrl = '/images/manejus360.png'
    const resp = await fetch(logoUrl)
    if (resp.ok) {
      const blob = await resp.blob()
      logoImg = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
      if (logoImg) {
        logoRounded = await roundedImageDataURL(logoImg, 150, 24)
      }
    }
  } catch (e) {
    // Se não conseguir carregar, segue sem logo
  }

  const logoW = 24
  const logoH = 24
  const textX = margin + logoW + 6

  if (logoRounded) {
    // Fundo sutil atrás do logo para destacar bordas arredondadas
    doc.setFillColor(...C.logoBg)
    doc.roundedRect(margin - 0.5, 13 - 0.5, logoW + 1, logoH + 1, 4, 4, 'F')
    doc.addImage(logoRounded, 'PNG', margin, 13, logoW, logoH)
  }

  doc.setTextColor(...C.white)
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.text('Relatório de Planos Nutricionais', textX, 22)

  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text(nomeFazenda, textX, 31)

  // Data no canto inferior direito do header
  doc.setFontSize(8)
  doc.setTextColor(220, 230, 225)
  const dataStr = `Gerado em: ${new Date().toLocaleString('pt-BR')}`
  const dataW = doc.getTextWidth(dataStr)
  doc.text(dataStr, pageW - margin - dataW, 40)

  // Linha divisória sutil abaixo do header
  doc.setDrawColor(220, 230, 225)
  doc.setLineWidth(0.2)
  doc.line(margin, 52.5, pageW - margin, 52.5)

  // Box de filtros abaixo do header
  doc.setTextColor(...C.dark)
  doc.setFontSize(9)
  let y = 59
  doc.setFillColor(...C.grayLight)
  doc.roundedRect(margin, y - 3, contentW, 12, 2, 2, 'F')
  const dataInicio = planosComSaida.length > 0
    ? planosComSaida.map((p) => p.entrada?.created_at).filter(Boolean).sort()[0]?.slice(0, 10)
    : null
  const dataFim = planosComSaida.length > 0
    ? planosComSaida.map((p) => p.saida?.created_at).filter(Boolean).sort().slice(-1)[0]?.slice(0, 10)
    : null
  const periodoStr = dataInicio && dataFim ? `${new Date(dataInicio).toLocaleDateString('pt-BR')} a ${new Date(dataFim).toLocaleDateString('pt-BR')}` : '—'
  doc.text(
    `Lotes: ${todosLotes.length === 1 ? todosLotes[0] : filtros.lote || 'Todos'}  |  Categorias: ${filtros.categoria || 'Todas'}  |  Período: ${periodoStr}  |  Total de planos: ${planos.length}`,
    margin + 4,
    y + 4
  )
  y += 14

  // ===== KPI Cards (4 por linha) =====
  y = sectionHeader(doc, 'Indicadores-Chave', y, margin, pageW)
  const cardW = (contentW - 9) / 4
  const cardH = 25
  const cardGap = 3

  drawKPICard(doc, margin, y, cardW, cardH, 'Planos', String(planos.length), cap(`${planosVigentes.length} vigentes`), C.blue, C.blueLight)
  drawKPICard(doc, margin + cardW + cardGap, y, cardW, cardH, 'GMD Médio', gmdMedioReal != null ? `${fmt(gmdMedioReal, 3)}` : '—', cap('kg/dia realizado'), C.green, C.greenLight)
  drawKPICard(doc, margin + (cardW + cardGap) * 2, y, cardW, cardH, 'Produção', `${fmt(producaoTotal)}`, cap('@ total'), C.yellow, C.yellowLight)
  drawKPICard(doc, margin + (cardW + cardGap) * 3, y, cardW, cardH, 'Custo/cab', custoMedio != null ? `R$ ${fmt(custoMedio)}` : '—', cap('médio'), C.red, C.redLight)
  y += cardH + 5

  // Segunda linha de KPIs
  drawKPICard(doc, margin, y, cardW, cardH, 'GMD Planejado', gmdMedioPlan != null ? `${fmt(gmdMedioPlan, 3)}` : '—', cap('kg/dia meta'), C.gray, C.grayLight)
  drawKPICard(doc, margin + cardW + cardGap, y, cardW, cardH, 'Eficiência', eficienciaGMD != null ? `${fmt(eficienciaGMD, 0)}%` : '—', 'GMD Realizado vs Planejado', eficienciaGMD != null && eficienciaGMD >= 90 ? C.green : C.yellow, eficienciaGMD != null && eficienciaGMD >= 90 ? C.greenLight : C.yellowLight)
  drawKPICard(doc, margin + (cardW + cardGap) * 2, y, cardW, cardH, 'Ganho médio', ganhoMedio != null ? `${fmt(ganhoMedio)}` : '—', cap('kg/cab'), C.blue, C.blueLight)
  drawKPICard(doc, margin + (cardW + cardGap) * 3, y, cardW, cardH, 'Mortalidade', mortalidadeMedia != null ? `${fmt(mortalidadeMedia, 2)}%` : '—', cap('média'), C.red, C.redLight)
  y += cardH + 8

  // ===== Tabela resumo por lote =====
  y = sectionHeader(doc, 'Resumo por Lote', y, margin, pageW)

  const resumoLoteBody = todosLotes.map((lote) => {
    const planosLote = planos.filter((p) => p.nomeLote === lote)
    const comSaida = planosLote.filter((p) => p.saida)
    const vigentes = planosLote.filter((p) => p.vigente)
    const gmdAgg = comSaida.reduce((acc: { num: number; den: number }, p) => {
      const gmd = p.saida!.gmd_realizado
      const dias = p.saida!.duracao_dias ?? 1
      if (gmd != null) { acc.num += gmd * dias; acc.den += dias }
      return acc
    }, { num: 0, den: 0 })
    const gmdLoteMedio = gmdAgg.den ? gmdAgg.num / gmdAgg.den : null
    const prodLote = comSaida.map((p) => p.saida!.producao_arroba_lote).filter((v): v is number => v != null).reduce((a, b) => a + b, 0)
    const ganhoAgg = comSaida.reduce((acc: { num: number; den: number }, p) => {
      const ganho = p.saida!.ganho_peso_total_kg_cab
      const quant = getMetric(p, 'saida', 'quant_atual') ?? 1
      const q = typeof quant === 'number' && quant > 0 ? quant : 1
      if (ganho != null) { acc.num += ganho * q; acc.den += q }
      return acc
    }, { num: 0, den: 0 })
    const ganhoLoteMedio = ganhoAgg.den ? ganhoAgg.num / ganhoAgg.den : null
    const categorias = [...new Set(planosLote.map((p) => cap(p.categoria)))].join(', ')
    const planoRef = vigentes[vigentes.length - 1] ?? comSaida[comSaida.length - 1] ?? planosLote[0]
    const cabLote = planoRef ? getMetric(planoRef, planoRef.vigente ? 'entrada' : 'saida', 'quant_atual') : null
    return [
      lote,
      categorias,
      String(planosLote.length),
      String(vigentes.length),
      String(comSaida.length),
      cabLote != null ? fmt(cabLote, 0) : '—',
      gmdLoteMedio != null ? fmt(gmdLoteMedio, 3) : '—',
      ganhoLoteMedio != null ? fmt(ganhoLoteMedio) : '—',
      fmt(prodLote),
    ]
  })

  autoTableMod.default(doc, {
    startY: y,
    head: [['Lote', 'Categoria', 'Planos', 'Vigentes', 'Encerrados', 'Cab.', 'GMD Médio', 'Ganho kg/cab', 'Produção @']],
    body: resumoLoteBody,
    theme: 'grid',
    headStyles: { fillColor: C.blue, fontSize: 8, halign: 'center', cellPadding: 2 },
    bodyStyles: { fontSize: 8, halign: 'center', cellPadding: 1.5 },
    columnStyles: { 0: { halign: 'left', cellWidth: contentW * 0.15 }, 1: { halign: 'left', cellWidth: contentW * 0.2 } },
    margin: { left: margin, right: margin },
  })
  y = (doc as any).lastAutoTable.finalY + 10

  // ===== Gráfico: GMD Realizado vs Planejado =====
  if (planosComSaida.length > 0) {
    const gmdBarValuePlugin = {
      id: 'gmdBarValueLabels',
      afterDatasetsDraw(chart: any) {
        const { ctx } = chart
        chart.data.datasets.forEach((dataset: any, datasetIndex: number) => {
          const meta = chart.getDatasetMeta(datasetIndex)
          dataset.data.forEach((value: number, index: number) => {
            const bar = meta.data[index]
            if (!bar) return
            const label = value.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
            ctx.fillStyle = '#1f2937'
            ctx.font = 'bold 10px Arial'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'bottom'
            ctx.fillText(label, bar.x, bar.y - 1)
          })
        })
      },
    }
    const GMD_CHUNK = 8
    const gmdChunks = chunkArray(planosComSaida, GMD_CHUNK)
    for (let i = 0; i < gmdChunks.length; i++) {
      const chunk = gmdChunks[i]
      if (i === 0) {
        if (y + 70 > pageH - 20) { doc.addPage(); y = margin }
        y = sectionHeader(doc, 'GMD Realizado vs Planejado por Plano', y, margin, pageW)
      } else {
        if (y + 62 > pageH - 20) { doc.addPage(); y = margin }
      }
      const chunkLabels = chunk.map((p) => `${p.nomeLote} - ${p.nomePlano}`.substring(0, 22))
      const chartImg = await renderChart({
        type: 'bar',
        data: {
          labels: chunkLabels,
          datasets: [
            { label: 'GMD Realizado (kg/dia)', data: chunk.map((p) => p.saida!.gmd_realizado ?? 0), backgroundColor: 'rgba(26, 58, 42, 0.75)', borderColor: 'rgba(26, 58, 42, 1)', borderWidth: 1 },
            { label: 'GMD Planejado (kg/dia)', data: chunk.map((p) => p.entrada?.gmd_planejado ?? p.saida!.gmd_planejado ?? 0), backgroundColor: 'rgba(239, 68, 68, 0.5)', borderColor: 'rgba(239, 68, 68, 1)', borderWidth: 1 },
          ],
        },
        options: { responsive: false, animation: false, layout: { padding: { top: 18 } }, plugins: { legend: { display: i === 0, position: 'top' } }, scales: { y: { beginAtZero: true, title: { display: true, text: 'kg/dia' } } } },
        plugins: [gmdBarValuePlugin],
      })
      doc.addImage(chartImg, 'PNG', margin, y, contentW, 62)
      y += 68
    }
  }

  // ===== Gráfico: Ganho de peso por plano =====
  if (planosComSaida.length > 0) {
    const barValuePlugin = {
      id: 'barValueLabels',
      afterDatasetsDraw(chart: any) {
        const { ctx } = chart
        chart.data.datasets.forEach((dataset: any, datasetIndex: number) => {
          const meta = chart.getDatasetMeta(datasetIndex)
          dataset.data.forEach((value: number, index: number) => {
            const bar = meta.data[index]
            if (!bar) return
            const label = value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
            const padding = 4
            ctx.font = 'bold 12px Arial'
            ctx.textBaseline = 'middle'
            const textWidth = ctx.measureText(label).width
            const rightEdge = bar.x
            const chartAreaRight = chart.chartArea.right
            let x = rightEdge + padding
            let textAlign: CanvasTextAlign = 'left'
            let color = '#1f2937'
            // Se não couber fora, coloca dentro da barra alinhado à direita
            if (x + textWidth > chartAreaRight - padding) {
              x = rightEdge - padding
              textAlign = 'right'
              color = '#ffffff'
            }
            ctx.fillStyle = color
            ctx.textAlign = textAlign
            ctx.fillText(label, x, bar.y)
          })
        })
      },
    }
    const GANHO_CHUNK = 12
    const ganhoChunks = chunkArray(planosComSaida, GANHO_CHUNK)
    for (let i = 0; i < ganhoChunks.length; i++) {
      const chunk = ganhoChunks[i]
      if (i === 0) {
        if (y + 70 > pageH - 20) { doc.addPage(); y = margin }
        y = sectionHeader(doc, 'Ganho de Peso Total por Plano (kg/cab)', y, margin, pageW, C.green)
      } else {
        if (y + 62 > pageH - 20) { doc.addPage(); y = margin }
      }
      const chunkLabels = chunk.map((p) => `${p.nomeLote} - ${p.nomePlano}`.substring(0, 25))
      const chunkData = chunk.map((p) => p.saida!.ganho_peso_total_kg_cab ?? 0)
      const chartImg = await renderChart({
        type: 'bar',
        data: { labels: chunkLabels, datasets: [{ label: 'Ganho de Peso (kg/cab)', data: chunkData, backgroundColor: 'rgba(34, 197, 94, 0.75)', borderColor: 'rgba(34, 197, 94, 1)', borderWidth: 1 }] },
        options: { responsive: false, animation: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } },
        plugins: [barValuePlugin],
      }, 900, 500)
      doc.addImage(chartImg, 'PNG', margin, y, contentW, 62)
      y += 68
    }
  }

  // ===== Gráfico: Produção em @ por lote (doughnut) =====
  if (todosLotes.length > 0 && planosComSaida.length > 0) {
    if (y + 70 > pageH - 20) { doc.addPage(); y = margin }
    y = sectionHeader(doc, 'Produção em Arrobas por Lote', y, margin, pageW, C.yellow)

    let prodPorLote = todosLotes.map((lote) =>
      planosComSaida.filter((p) => p.nomeLote === lote).reduce((acc, p) => acc + (p.saida!.producao_arroba_lote ?? 0), 0)
    )
    let lotesDoughnut = [...todosLotes]
    const MAX_DOUGHNUT = 8
    if (lotesDoughnut.length > MAX_DOUGHNUT) {
      const zipped = lotesDoughnut.map((lote, i) => ({ lote, prod: prodPorLote[i] })).sort((a, b) => b.prod - a.prod)
      const top = zipped.slice(0, MAX_DOUGHNUT - 1)
      const outros = zipped.slice(MAX_DOUGHNUT - 1).reduce((s, x) => s + x.prod, 0)
      lotesDoughnut = [...top.map((x) => x.lote), 'Outros']
      prodPorLote = [...top.map((x) => x.prod), outros]
    }
    const palette = ['rgba(26,58,42,0.85)', 'rgba(34,197,94,0.85)', 'rgba(250,204,21,0.85)', 'rgba(239,68,68,0.85)', 'rgba(168,85,247,0.85)', 'rgba(14,165,233,0.85)', 'rgba(249,115,22,0.85)', 'rgba(20,184,166,0.85)']
    const totalProd = prodPorLote.reduce((a, b) => a + b, 0)
    const doughnutLabelPlugin = {
      id: 'doughnutLabels',
      afterDatasetsDraw(chart: any) {
        const { ctx } = chart
        chart.data.datasets[0].data.forEach((value: number, index: number) => {
          if (value <= 0) return
          const meta = chart.getDatasetMeta(0)
          const arc = meta.data[index]
          const { x, y } = arc.tooltipPosition()
          const pct = totalProd > 0 ? (value / totalProd) * 100 : 0
          ctx.fillStyle = '#fff'
          ctx.font = 'bold 13px Arial'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(`${value.toFixed(0)}@`, x, y - 7)
          ctx.font = '10px Arial'
          ctx.fillText(`${pct.toFixed(1)}%`, x, y + 7)
        })
      },
    }
    const chartImg = await renderChart({
      type: 'doughnut',
      data: { labels: lotesDoughnut, datasets: [{ data: prodPorLote, backgroundColor: palette, borderWidth: 2, borderColor: '#fff' }] },
      options: { responsive: false, animation: false, plugins: { legend: { position: 'right', labels: { font: { size: 12 } } } } },
      plugins: [doughnutLabelPlugin],
    } as any)
    doc.addImage(chartImg, 'PNG', margin, y, contentW, 62)
    y += 68
  }

  // ===== Detalhamento por lote =====
  for (const lote of todosLotes) {
    const planosDoLote = planos.filter((p) => p.nomeLote === lote)
    if (y + 50 > pageH - 20) { doc.addPage(); y = margin }

    // Header do lote com fundo colorido
    doc.setFillColor(...C.blueLight)
    doc.roundedRect(margin, y - 2, contentW, 10, 2, 2, 'F')
    doc.setFillColor(...C.blue)
    doc.roundedRect(margin, y - 2, 3, 10, 0, 0, 'F')
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C.blue)
    doc.text(`Lote: ${lote}`, margin + 6, y + 4.5)
    const categoriasLote = [...new Set(planosDoLote.map((p) => cap(p.categoria)))].join(', ')
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C.gray)
    doc.text(categoriasLote, pageW - margin - 3, y + 4.5, { align: 'right' })
    doc.setTextColor(0, 0, 0)
    y += 12

    // Tabela detalhada: entrada e saída na mesma linha
    const tableBody = planosDoLote.map((p) => {
      const ent = p.entrada
      const sai = p.saida
      const mEnt = ent?.metricas_derivadas
      const mSai = sai?.metricas_derivadas
      const pesoAtual = mSai?.peso_vivo_medio_lote ?? mEnt?.peso_vivo_atual_kg_cab ?? getMetric(p, 'entrada', 'peso_vivo_atual_kg_cab') ?? null
      const pesoMeta = getMetric(p, 'entrada', 'peso_vivo_meta_kg_cab')
      return [
        p.nomePlano,
        p.vigente ? 'Vigente' : (sai?.motivo_migracao === 'encerramento' ? 'Encerrado' : sai ? 'Migrado' : 'Sem saída'),
        fmtDate(ent?.created_at),
        sai?.duracao_dias ? `${sai.duracao_dias}d` : '—',
        fmt(mEnt?.peso_inicial_kg_cab ?? getMetric(p, 'entrada', 'peso_vivo_atual_kg_cab')),
        fmt(pesoAtual),
        fmt(pesoMeta),
        fmt(sai?.ganho_peso_total_kg_cab),
        fmt(sai?.gmd_realizado, 3),
        fmt(ent?.gmd_planejado ?? sai?.gmd_planejado, 3),
        fmt(mSai?.ganho_arroba_cab),
        fmt(sai?.producao_arroba_lote),
        mSai?.custo_total_producao_cab != null ? `R$ ${fmtMoney(mSai.custo_total_producao_cab)}` : '—',
        sai?.mortalidade_percent != null ? fmt(sai.mortalidade_percent, 2) + '%' : '—',
      ]
    })

    autoTableMod.default(doc, {
      startY: y,
      head: [['Plano', 'Status', 'Início', 'Duração', 'Peso Inic.', 'Peso Atual', 'Meta', 'Ganho kg', 'GMD Real', 'GMD Plan', 'Ganho @', 'Prod. @', 'Custo/cab', 'Mort. %']],
      body: tableBody,
      theme: 'grid',
      headStyles: { fillColor: C.blue, fontSize: 7, halign: 'center', cellPadding: 1.5 },
      bodyStyles: { fontSize: 7, halign: 'center', cellPadding: 1.2 },
      columnStyles: { 0: { halign: 'left', cellWidth: contentW * 0.1 } },
      margin: { left: margin, right: margin },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 1) {
          const status = data.cell.raw
          if (status === 'Vigente') { data.cell.styles.textColor = C.green; data.cell.styles.fontStyle = 'bold' }
          else if (status === 'Encerrado') { data.cell.styles.textColor = C.gray }
          else if (status === 'Migrado') { data.cell.styles.textColor = C.blue }
        }
      },
    })
    y = (doc as any).lastAutoTable.finalY + 8

    // Gauge de progresso da meta para planos vigentes
    const vigentesLote = planosDoLote.filter((p) => p.vigente && p.entrada)
    if (vigentesLote.length > 0) {
      const gaugeData = vigentesLote.map((p) => getMetric(p, 'entrada', 'progresso_meta_percent')).filter((v): v is number => v != null)
      if (gaugeData.length > 0) {
        if (y + 48 > pageH - 20) { doc.addPage(); y = margin }
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(...C.dark)
        doc.text('Progresso da Meta', margin, y)
        y += 4
        const gaugeW = (contentW - 8) / Math.min(gaugeData.length, 3)
        for (let i = 0; i < Math.min(gaugeData.length, 3); i++) {
          const pct = gaugeData[i]
          const planoNome = vigentesLote[i].nomePlano.substring(0, 18)
          const gaugeImg = await renderGauge(pct)
          const gx = margin + i * (gaugeW + 4)
          doc.addImage(gaugeImg, 'PNG', gx, y, gaugeW, 32)
          doc.setFontSize(7)
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(...C.gray)
          doc.text(planoNome, gx + gaugeW / 2, y + 36, { align: 'center' })
          doc.setFontSize(11)
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(...(pct >= 80 ? C.green : pct >= 50 ? C.yellow : C.red))
          doc.text(`${fmt(pct, 0)}%`, gx + gaugeW / 2, y + 23, { align: 'center' })
          doc.setTextColor(0, 0, 0)
        }
        y += 42
      }
    }

    // Gráfico de evolução de peso (linha) se houver mais de 1 plano
    if (planosDoLote.length > 1) {
      if (y + 58 > pageH - 20) { doc.addPage(); y = margin }
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...C.dark)
      doc.text('Evolução de Peso (kg/cab)', margin, y)
      y += 4

      const labelsPlanos = planosDoLote.map((p) => p.nomePlano.substring(0, 15))
      const pesosEnt = planosDoLote.map((p) => getMetric(p, 'entrada', 'peso_inicial_kg_cab') ?? 0)
      const pesosSai = planosDoLote.map((p) => {
        const mSai = p.saida?.metricas_derivadas
        return mSai?.peso_vivo_medio_lote ?? getMetric(p, 'entrada', 'peso_vivo_atual_kg_cab') ?? 0
      })

      const chartImg = await renderChart({
        type: 'line',
        data: {
          labels: labelsPlanos,
          datasets: [
            { label: 'Peso Entrada', data: pesosEnt, borderColor: 'rgba(26, 58, 42, 1)', backgroundColor: 'rgba(26, 58, 42, 0.08)', fill: true, tension: 0.3, pointRadius: 4 },
            { label: 'Peso Saída/Atual', data: pesosSai, borderColor: 'rgba(34, 197, 94, 1)', backgroundColor: 'rgba(34, 197, 94, 0.08)', fill: true, tension: 0.3, pointRadius: 4 },
          ],
        },
        options: { responsive: false, animation: false, plugins: { legend: { position: 'top' } }, scales: { y: { beginAtZero: false, title: { display: true, text: 'kg/cab' } } } },
      })
      doc.addImage(chartImg, 'PNG', margin, y, contentW, 52)
      y += 58
    }

    // Tabela de métricas detalhadas (entrada vs saída lado a lado)
    if (y + 38 > pageH - 20) { doc.addPage(); y = margin }
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C.dark)
    doc.text('Métricas Detalhadas', margin, y)
    y += 4

    const metricasBody: any[] = []
    for (const p of planosDoLote) {
      const mEnt = p.entrada?.metricas_derivadas
      const mSai = p.saida?.metricas_derivadas
      metricasBody.push([
        p.nomePlano,
        fmt(mEnt?.quant_atual ?? getMetric(p, 'entrada', 'quant_atual'), 0),
        fmt(mSai?.quant_atual ?? mEnt?.quant_atual ?? getMetric(p, 'entrada', 'quant_atual'), 0),
        mEnt?.rc_inicio != null ? fmt(mEnt.rc_inicio) + '%' : '—',
        mSai?.rc_atual != null ? fmt(mSai.rc_atual) + '%' : '—',
        mSai?.progresso_meta_percent != null ? fmt(mSai.progresso_meta_percent) + '%' : '—',
        mSai?.custo_total_producao_cab != null ? `R$ ${fmtMoney(mSai.custo_total_producao_cab)}` : '—',
        fmt(mEnt?.producao_atual_arroba_cab),
        fmt(mSai?.producao_atual_arroba_cab),
        p.saida?.mortalidade_percent != null ? fmt(p.saida.mortalidade_percent, 2) + '%' : '—',
      ])
    }

    autoTableMod.default(doc, {
      startY: y,
      head: [['Plano', 'Cab Inic.', 'Cab Final', 'RC Inic.', 'RC Final', 'Prog Final', 'Custo (R$/Cab)', '@/cab Inic.', '@/cab Final', 'Mort. %']],
      body: metricasBody,
      theme: 'striped',
      headStyles: { fillColor: C.gray, fontSize: 7, halign: 'center', cellPadding: 1.5 },
      bodyStyles: { fontSize: 7, halign: 'center', cellPadding: 1.2 },
      columnStyles: { 0: { halign: 'left', cellWidth: contentW * 0.1 } },
      margin: { left: margin, right: margin },
    })
    y = (doc as any).lastAutoTable.finalY + 10
  }

  // ===== Planos vigentes: tabela consolidada =====
  if (planosVigentes.length > 0) {
    if (y + 38 > pageH - 20) { doc.addPage(); y = margin }
    y = sectionHeader(doc, 'Planos Vigentes', y, margin, pageW, C.green)

    const vigBody = planosVigentes.map((p) => {
      const mEnt = p.entrada?.metricas_derivadas
      return [
        p.nomeLote,
        cap(p.categoria),
        p.nomePlano,
        fmtDate(p.entrada?.created_at),
        fmt(mEnt?.peso_inicial_kg_cab ?? getMetric(p, 'entrada', 'peso_vivo_atual_kg_cab')),
        fmt(mEnt?.peso_vivo_atual_kg_cab ?? getMetric(p, 'entrada', 'peso_vivo_atual_kg_cab')),
        fmt(getMetric(p, 'entrada', 'peso_vivo_meta_kg_cab')),
        mEnt?.progresso_meta_percent != null ? fmt(mEnt.progresso_meta_percent) + '%' : '—',
        fmt(mEnt?.gmd ?? getMetric(p, 'entrada', 'gmd'), 3),
        mEnt?.custo_total_producao_cab != null ? `R$ ${fmtMoney(mEnt.custo_total_producao_cab)}` : '—',
        fmt(mEnt?.quant_atual ?? getMetric(p, 'entrada', 'quant_atual')),
      ]
    })

    autoTableMod.default(doc, {
      startY: y,
      head: [['Lote', 'Categoria', 'Plano', 'Início', 'Peso Inic.', 'Peso Atual', 'Meta', 'Prog.', 'GMD', 'Custo/cab', 'Cabeças']],
      body: vigBody,
      theme: 'striped',
      headStyles: { fillColor: C.green, fontSize: 8, halign: 'center', cellPadding: 2 },
      bodyStyles: { fontSize: 8, halign: 'center', cellPadding: 1.5 },
      columnStyles: { 0: { halign: 'left' }, 2: { halign: 'left' } },
      margin: { left: margin, right: margin },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 7) {
          const val = parseFloat(String(data.cell.raw).replace('%', '').replace(',', '.'))
          if (!isNaN(val)) {
            data.cell.styles.textColor = val >= 80 ? C.green : val >= 50 ? C.yellow : C.red
            data.cell.styles.fontStyle = 'bold'
          }
        }
      },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  // ===== Rodapé e cabeçalho em todas as páginas =====
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)

    // Página X de Y no cabeçalho superior direito
    doc.setFontSize(8)
    doc.setTextColor(...C.gray)
    doc.setFont('helvetica', 'normal')
    const paginaStr = `Página ${i} de ${pageCount}`
    doc.text(paginaStr, pageW - margin, 8, { align: 'right' })

    // Linha do rodapé
    doc.setDrawColor(...C.grayMid)
    doc.setLineWidth(0.3)
    doc.line(margin, pageH - 10, pageW - margin, pageH - 10)
    doc.setFontSize(7)
    doc.setTextColor(...C.gray)
    doc.text(`GestaUp - ${nomeFazenda}`, margin, pageH - 5.5)
    doc.text(`Relatório gerado em ${new Date().toLocaleString('pt-BR')}`, pageW / 2, pageH - 5.5, { align: 'center' })
    doc.text(`Página ${i} de ${pageCount}`, pageW - margin, pageH - 5.5, { align: 'right' })
  }

  const lotesNoRelatorio = [...new Set(planos.map((p) => p.nomeLote))]
  const escopoLotes = lotesNoRelatorio.length === 1 ? lotesNoRelatorio[0] : 'Todos os Lotes'
  const nomeArquivo = `Relatorio Planos Nutricionais - ${nomeFazenda} - ${escopoLotes} - ${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`
  doc.save(nomeArquivo)
}
