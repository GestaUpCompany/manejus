import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import {
  formatarDataNumerica,
  formatarNumero,
  formatarInteiro,
  labelDiagnostico,
  compactarDiagnosticos,
  carregarLogoComoBase64,
  renderizarGraficoMortesTempo,
  renderizarGraficoBarrasHorizontais,
  renderizarGraficoDonut,
  type LinhaMorte,
  type ResumoMorte,
  type ParametrosRelatorioMorte,
} from './relatorioMortePDF'

// === Estilos ===

const GREEN_DARK = '#0F6437'
const WHITE = '#FFFFFF'
const DARK_TEXT = '#1F2937'
const MEDIUM_TEXT = '#6B7280'
const LIGHT_BG = '#F5F5F5'
const RED = '#EF4444'
const YELLOW = '#B7791F'

const styles = StyleSheet.create({
  page: {
    backgroundColor: LIGHT_BG,
    paddingTop: 24,
    paddingHorizontal: 30,
    paddingBottom: 42,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: DARK_TEXT,
  },
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 30,
    right: 30,
    borderTopWidth: 1,
    borderTopColor: '#D1D5DB',
    paddingTop: 5,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: { fontSize: 7, color: MEDIUM_TEXT },
  sectionEyebrow: { fontSize: 8, fontWeight: 'bold', color: GREEN_DARK, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', color: DARK_TEXT, marginBottom: 8 },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: GREEN_DARK,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerLogo: { width: 40, height: 40, objectFit: 'contain' },
  headerLogoFazenda: { width: 80, height: 45, objectFit: 'contain' },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: GREEN_DARK },
  headerSystemName: { fontSize: 12, fontWeight: 'bold', color: DARK_TEXT, marginBottom: 1 },
  headerSystemNameYellow: { color: YELLOW },
  headerSubtitle: { fontSize: 9, color: MEDIUM_TEXT },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Period badge
  periodBadge: {
    alignSelf: 'flex-start',
    backgroundColor: WHITE,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  periodText: { fontSize: 9, fontWeight: 'bold', color: DARK_TEXT },
  // Insights
  insightsCard: {
    backgroundColor: WHITE,
    borderRadius: 4,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderLeftWidth: 3,
    borderLeftColor: GREEN_DARK,
  },
  insightsLabel: {
    fontSize: 7,
    fontWeight: 'bold',
    color: GREEN_DARK,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  insightsText: { fontSize: 9, color: DARK_TEXT, lineHeight: 1.45 },
  // KPIs
  kpiRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  kpiCard: {
    flex: 1,
    backgroundColor: WHITE,
    borderRadius: 5,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderTopWidth: 3,
    borderTopColor: GREEN_DARK,
  },
  kpiCardRed: { borderTopColor: RED },
  kpiValue: { fontSize: 16, fontWeight: 'bold', color: GREEN_DARK },
  kpiValueSmall: { fontSize: 11, fontWeight: 'bold', color: GREEN_DARK },
  kpiLabel: { fontSize: 8, color: MEDIUM_TEXT, marginTop: 2 },
  kpiSub: { fontSize: 7, color: MEDIUM_TEXT, marginTop: 1 },
  kpiValueRed: { color: RED },
  // Charts
  chartGrid: { flexDirection: 'row', gap: 8, height: 220 },
  chartCard: {
    flex: 1,
    height: 220,
    backgroundColor: WHITE,
    borderRadius: 6,
    padding: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chartImage: { width: '100%', height: 205, objectFit: 'contain' },
  chartsPageTitle: { fontSize: 14, fontWeight: 'bold', color: DARK_TEXT, marginBottom: 8 },
  // Table
  tableTitle: { fontSize: 12, fontWeight: 'bold', color: DARK_TEXT, marginBottom: 6 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: GREEN_DARK,
    borderRadius: 4,
    paddingVertical: 5,
  },
  tableHeaderText: { fontSize: 8, fontWeight: 'bold', color: WHITE, textAlign: 'center' },
  tableRow: { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  tableRowAlt: { backgroundColor: '#F9FAFB' },
  tableCell: { fontSize: 7, color: DARK_TEXT, textAlign: 'center' },
  tableCellLabel: { fontSize: 7, color: DARK_TEXT, textAlign: 'left', paddingLeft: 4 },
  tableCellPct: { fontSize: 7, color: MEDIUM_TEXT, textAlign: 'center' },
  // Detailed table
  detailTable: { width: '100%' },
  detailRow: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  detailRowAlt: { backgroundColor: '#F9FAFB' },
  detailCell: { fontSize: 7, color: DARK_TEXT, textAlign: 'center', paddingHorizontal: 1 },
})

// === Componentes ===

function KPICard({ value, label, sub, small, red }: { value: string; label: string; sub?: string; small?: boolean; red?: boolean }) {
  return (
    <View style={[styles.kpiCard, red ? styles.kpiCardRed : undefined]}>
      <Text style={[small ? styles.kpiValueSmall : styles.kpiValue, red ? styles.kpiValueRed : undefined]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      {sub && <Text style={styles.kpiSub}>{sub}</Text>}
    </View>
  )
}

function ChartCard({ image }: { image: string | null }) {
  return (
    <View style={styles.chartCard}>
      {image ? <Image src={image} style={styles.chartImage} /> : <Text style={{ fontSize: 9, color: MEDIUM_TEXT, textAlign: 'center' }}>Sem dados no período</Text>}
    </View>
  )
}

function Header({ logoGestao, logoFazenda, fazendaNome }: { logoGestao: string; logoFazenda: string; fazendaNome: string }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        {logoGestao ? <Image src={logoGestao} style={styles.headerLogo} /> : null}
        <View>
          <Text style={styles.headerSystemName}>
            Manej'Us <Text style={styles.headerSystemNameYellow}>360</Text>
          </Text>
          <Text style={styles.headerTitle}>Relatório de mortalidade</Text>
          {fazendaNome ? <Text style={styles.headerSubtitle}>{fazendaNome}</Text> : null}
        </View>
      </View>
      {logoFazenda ? (
        <View style={styles.headerRight}>
          <Image src={logoFazenda} style={styles.headerLogoFazenda} />
        </View>
      ) : null}
    </View>
  )
}

function Footer({ dataInicio, dataFim }: { dataInicio: string; dataFim: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>Gesta'Up • Relatório de mortalidade • {formatarDataNumerica(dataInicio)} a {formatarDataNumerica(dataFim)}</Text>
      <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  )
}

// === Documento ===

interface PDFData {
  dataInicio: string
  dataFim: string
  fazendaNome: string
  logoGestao: string
  logoFazenda: string
  resumo: ResumoMorte
  linhas: LinhaMorte[]
  chartTempo: string | null
  chartCausa: string | null
  chartCategoria: string | null
  chartSexo: string | null
}

function RelatorioMorteDoc({ data }: { data: PDFData }) {
  const { dataInicio, dataFim, fazendaNome, logoGestao, logoFazenda, resumo, linhas, chartTempo, chartCausa, chartCategoria, chartSexo } = data

  const causaTxt = resumo.causa_mais_frequente
    ? `${resumo.causa_mais_frequente} (${resumo.causa_mais_frequente_count ?? 0})`
    : '—'

  // Tabela de diagnósticos
  const diagTotal = resumo.frequencia_diagnosticos.reduce((s, i) => s + i.valor, 0)

  // Tabela detalhada
  const linhasOrdenadas = [...linhas].sort((a, b) => {
    if (a.data !== b.data) return b.data.localeCompare(a.data)
    return (a.lote_nome ?? '').localeCompare(b.lote_nome ?? '')
  })

  const colWidths = ['8%', '10%', '8%', '7%', '7%', '8%', '10%', '10%', '32%']
  const colHeaders = ['Data', 'Lote', 'Pasto', 'Sexo', 'Idade', 'Peso (kg)', 'Categoria', 'Causa', 'Diagnósticos']

  return (
    <Document>
      {/* Página 1: Header + Período + Insights + KPIs + Gráficos */}
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Header logoGestao={logoGestao} logoFazenda={logoFazenda} fazendaNome={fazendaNome} />

        <Text style={styles.sectionEyebrow}>Resumo executivo</Text>
        {/* Período */}
        <View style={styles.periodBadge}>
          <Text style={styles.periodText}>{formatarDataNumerica(dataInicio)}  a  {formatarDataNumerica(dataFim)}</Text>
        </View>

        {/* Insights */}
        {resumo.insights ? (
          <View style={styles.insightsCard}>
            <Text style={styles.insightsLabel}>Análise do período</Text>
            <Text style={styles.insightsText}>{resumo.insights}</Text>
          </View>
        ) : null}

        {/* KPIs linha 1 */}
        <View style={styles.kpiRow}>
          <KPICard value={formatarInteiro(resumo.total_mortes)} label="Total de mortes" />
          <KPICard value={formatarNumero(resumo.media_por_dia, 2)} label="Mortes/dia (média)" />
          <KPICard value={formatarNumero(resumo.peso_medio, 1)} label="Peso médio (kg)" />
          <KPICard value={causaTxt} label="Causa mais frequente" small />
        </View>

        {/* KPIs linha 2 */}
        {(resumo.taxa_mortalidade != null || (resumo.perda_estimada != null && resumo.perda_estimada > 0) || resumo.periodo_anterior) ? (
          <View style={styles.kpiRow}>
            {resumo.taxa_mortalidade != null ? (
              <KPICard
                value={`${formatarNumero(resumo.taxa_mortalidade, 2)}%`}
                label="Taxa de mortalidade"
                sub={resumo.rebanho_total && resumo.rebanho_total > 0 ? `Rebanho: ${formatarInteiro(resumo.rebanho_total)} cab.` : undefined}
              />
            ) : <View style={{ flex: 1 }} />}
            {resumo.perda_estimada != null && resumo.perda_estimada > 0 ? (
              <KPICard
                red
                value={`R$ ${resumo.perda_estimada.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                label="Perda estimada"
                sub={resumo.peso_total_perdido != null && resumo.peso_total_perdido > 0 ? `${formatarNumero(resumo.peso_total_perdido, 0)} kg perdidos` : undefined}
              />
            ) : <View style={{ flex: 1 }} />}
            {resumo.periodo_anterior ? (
              <KPICard
                value={`${formatarInteiro(resumo.periodo_anterior.total_mortes)} mortes`}
                label="Período anterior"
                sub={`${formatarDataNumerica(resumo.periodo_anterior.data_inicio)} a ${formatarDataNumerica(resumo.periodo_anterior.data_fim)}${resumo.periodo_anterior.taxa_mortalidade != null ? ` · Taxa: ${formatarNumero(resumo.periodo_anterior.taxa_mortalidade, 2)}%` : ''}`}
                small
              />
            ) : <View style={{ flex: 1 }} />}
          </View>
        ) : null}

        {/* Gráficos principais, com dimensões fixas para não serem espremidos */}
        <View style={styles.chartGrid}>
          <ChartCard image={chartTempo} />
          <ChartCard image={chartCausa} />
        </View>
        <Footer dataInicio={dataInicio} dataFim={dataFim} />
      </Page>

      {/* Página 2: Gráficos complementares */}
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Header logoGestao={logoGestao} logoFazenda={logoFazenda} fazendaNome={fazendaNome} />
        <Text style={styles.sectionEyebrow}>Análise de distribuição</Text>
        <Text style={styles.chartsPageTitle}>Distribuição das mortes</Text>
        <View style={styles.chartGrid}>
          <ChartCard image={chartCategoria} />
          <ChartCard image={chartSexo} />
        </View>
        <Footer dataInicio={dataInicio} dataFim={dataFim} />
      </Page>

      {/* Tabelas: diagnósticos e registros detalhados */}
      {resumo.frequencia_diagnosticos.length > 0 || linhasOrdenadas.length > 0 ? (
        <Page size="A4" orientation="landscape" style={styles.page}>
          <Header logoGestao={logoGestao} logoFazenda={logoFazenda} fazendaNome={fazendaNome} />

          <Text style={styles.sectionEyebrow}>Detalhamento</Text>
          {resumo.frequencia_diagnosticos.length > 0 ? <Text style={styles.tableTitle}>Frequência de diagnósticos</Text> : null}

          {resumo.frequencia_diagnosticos.length > 0 ? (
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, { flex: 6, textAlign: 'left', paddingLeft: 4 }]}>Diagnóstico</Text>
              <Text style={[styles.tableHeaderText, { flex: 2.5 }]}>Mortes</Text>
              <Text style={[styles.tableHeaderText, { flex: 1.5 }]}>%</Text>
            </View>
          ) : null}

          {resumo.frequencia_diagnosticos.map((item, idx) => {
            const pct = diagTotal > 0 ? (item.valor / diagTotal) * 100 : 0
            return (
              <View key={idx} style={[styles.tableRow, idx % 2 === 0 ? styles.tableRowAlt : undefined]}>
                <Text style={[styles.tableCellLabel, { flex: 6 }]}>{labelDiagnostico(item.label)}</Text>
                <Text style={[styles.tableCell, { flex: 2.5 }]}>{item.valor}</Text>
                <Text style={[styles.tableCellPct, { flex: 1.5 }]}>{pct.toFixed(1).replace('.', ',')}%</Text>
              </View>
            )
          })}

          {linhasOrdenadas.length > 0 ? (
            <View style={{ marginTop: 16 }}>
              <Text style={styles.tableTitle}>Registros detalhados</Text>
              <View style={styles.tableHeader}>
                {colHeaders.map((h, i) => (
                  <Text key={i} style={[styles.tableHeaderText, { flex: parseFloat(colWidths[i]) }]}>{h}</Text>
                ))}
              </View>
              {linhasOrdenadas.map((l, idx) => {
                const valores = [
                  formatarDataNumerica(l.data),
                  l.lote_nome ?? '—',
                  l.pasto ?? '—',
                  l.sexo ?? '—',
                  l.idade ?? '—',
                  formatarNumero(l.peso_vivo, 0),
                  l.categoria ?? '—',
                  l.causa_morte ?? '—',
                  compactarDiagnosticos(l.diagnosticos),
                ]
                return (
                  <View key={idx} style={[styles.detailRow, idx % 2 === 0 ? styles.detailRowAlt : undefined]} wrap={false}>
                    {valores.map((v, i) => (
                      <Text key={i} style={[styles.detailCell, { flex: parseFloat(colWidths[i]) }]}>{v}</Text>
                    ))}
                  </View>
                )
              })}
            </View>
          ) : null}
          <Footer dataInicio={dataInicio} dataFim={dataFim} />
        </Page>
      ) : null}
    </Document>
  )
}

// === Função principal ===

export async function gerarRelatorioMortePDFReact(params: ParametrosRelatorioMorte): Promise<Blob> {
  const { dataInicio, dataFim, fazendaNome, fazendaLogoUrl, linhas, resumo } = params

  // Carregar logos
  let logoGestao = ''
  try {
    logoGestao = await carregarLogoComoBase64('/images/manejus360.png')
  } catch {
    // silencioso
  }

  let logoFazenda = ''
  if (fazendaLogoUrl) {
    try {
      logoFazenda = await carregarLogoComoBase64(fazendaLogoUrl)
    } catch {
      // silencioso
    }
  }

  // Gerar gráficos como imagem (Chart.js)
  const chartW = 135
  const chartH = 85

  const [chartTempo, chartCausa, chartCategoria, chartSexo] = await Promise.all([
    renderizarGraficoMortesTempo(linhas, chartW, chartH).catch(() => null),
    renderizarGraficoBarrasHorizontais(resumo.por_causa, 'Mortes por causa', chartW, chartH).catch(() => null),
    renderizarGraficoBarrasHorizontais(resumo.por_categoria, 'Mortes por categoria', chartW, chartH).catch(() => null),
    renderizarGraficoDonut(resumo.por_sexo, 'Mortes por sexo', chartW, chartH).catch(() => null),
  ])

  const pdfData: PDFData = {
    dataInicio,
    dataFim,
    fazendaNome,
    logoGestao,
    logoFazenda,
    resumo,
    linhas,
    chartTempo,
    chartCausa,
    chartCategoria,
    chartSexo,
  }

  const { pdf } = await import('@react-pdf/renderer')
  const doc = <RelatorioMorteDoc data={pdfData} />
  const blob = await pdf(doc).toBlob()
  return blob
}
