import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../../services/supabaseClient'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, LabelList,
} from 'recharts'
import logoManejus from '/images/manejus360.png'
import {
  gerarRelatorioConsumoPDFPuppeteer,
} from '../../utils/relatorioConsumoPDFPuppeteer'
import {
  type DadoRelatorioConsumo,
  type InfoLote,
  type LoteRelatorio,
} from '../../utils/relatorioConsumoPDF'

const CHART_NO_FOCUS_CSS = `
.recharts-surface {
  outline: none !important;
  box-shadow: none !important;
  border: none !important;
  -webkit-tap-highlight-color: transparent !important;
  -webkit-focus-ring-color: transparent !important;
}
.recharts-surface:focus,
.recharts-surface:focus-visible,
.recharts-surface *:focus,
.recharts-surface *:focus-visible {
  outline: none !important;
  box-shadow: none !important;
  border: none !important;
}
.recharts-wrapper, .recharts-bar-rectangle, .recharts-bar-rectangle * {
  outline: none !important;
  -webkit-tap-highlight-color: transparent !important;
}
.recharts-active-dot { display: none !important; }
`

const GREEN_DARK = '#0F6437'
const BLUE_BAR = '#1E3A5F'
const GREEN_LINE = '#10B981'
const LEITURA_COLOR = '#6B7280'
const DARK_TEXT = '#1F2937'
const MEDIUM_TEXT = '#6B7280'

interface LoteDisponivel {
  lote_id: string
  lote_nome: string
}

interface LoteDados {
  lote_id: string
  lote_nome: string
  info: InfoLote
  dados: DadoRelatorioConsumo[]
}

interface DadosRelatorioConsumo {
  fazenda_nome?: string
  fazenda_logo_url?: string | null
  lotes: LoteDados[]
  lotes_disponiveis: LoteDisponivel[]
}

interface RelatorioInfo {
  fazenda_id: string
  titulo: string
  tipo: string
  fazenda_nome?: string
  fazenda_logo_url?: string | null
}

function formatarNumero(valor: number | null | undefined, casas = 2, padrao = '—'): string {
  if (valor === null || valor === undefined || isNaN(valor as number)) return padrao
  return (valor as number).toFixed(casas).replace('.', ',')
}

function formatarInteiro(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || isNaN(valor as number)) return '—'
  return Math.round(valor as number).toString()
}

function formatarData(d: string | null | undefined): string {
  if (!d || d === '—') return '—'
  const parts = d.split('-')
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
  return d
}

interface Props {
  token: string
  relatorioInfo: RelatorioInfo
}

// Factory que cria os três labels customizados (CMS, Consumo %PV, Leitura de
// Cocho) com prevenção de colisão baseada exclusivamente em posição gráfica
// (pixels). Cada label registra sua posição Y no Map compartilhado; o label
// posterior consulta essa posição e reposiciona para baixo se houver colisão.
// Ordem de renderização Recharts: Bar (CmsLabel) → Consumo Line → Leitura Line,
// garantindo que os Maps estejam populados antes da consulta.
function criarLabelsAntiColisao() {
  const barPositions = new Map<number, number>()
  const consumoPositions = new Map<number, number>()

  function CmsLabel(props: any) {
    const { x, y, width, value, index } = props
    if (value == null) return null

    // Registra a posição Y do topo da barra para o índice atual
    barPositions.set(index, y)

    return (
      <text
        x={x + width / 2}
        y={y - 6}
        textAnchor="middle"
        fill={DARK_TEXT}
        fontSize={10}
        fontWeight="bold"
      >
        {Number(value).toFixed(2)}
      </text>
    )
  }

  function ConsumoPercentPVLabel(props: any) {
    const { x, y, value, index } = props
    if (value == null) return null

    // Registra a posição Y do ponto da linha para o índice atual
    consumoPositions.set(index, y)

    const barTopY = barPositions.get(index)
    const COLLISION_THRESHOLD = 18

    // Posição default: 16px acima do ponto, afastado do círculo
    let labelY = y - 16

    if (barTopY != null) {
      const distance = Math.abs(barTopY - y)
      if (distance < COLLISION_THRESHOLD) {
        // Colisão: move o label para baixo do ponto, do lado oposto da barra
        labelY = y + 24
      }
    }

    return (
      <text
        x={x}
        y={labelY}
        textAnchor="middle"
        fill={GREEN_LINE}
        fontSize={10}
        fontWeight="bold"
      >
        {`${Number(value).toFixed(2)}%`}
      </text>
    )
  }

  function LeituraCochoLabel(props: any) {
    const { x, y, value, index, height, viewBox } = props
    if (value == null) return null

    const chartHeight = (viewBox?.height ?? height ?? 400) as number
    const pontoY = y as number

    // Default: acima do ponto quando na metade inferior, abaixo na metade superior
    const naBase = pontoY > chartHeight * 0.65
    let labelY = naBase ? pontoY - 12 : pontoY + 16

    // Colisão com ponto do Consumo %PV: move o label para baixo do ponto,
    // mesmo comportamento do Consumo %PV quando colide com a barra de CMS.
    const consumoY = consumoPositions.get(index)
    const COLLISION_THRESHOLD = 34
    if (consumoY != null && Math.abs(pontoY - consumoY) < COLLISION_THRESHOLD) {
      labelY = pontoY + 24
    }

    return (
      <text
        x={x}
        y={labelY}
        textAnchor="middle"
        fill="#FFFFFF"
        stroke="#000000"
        strokeWidth={2.5}
        paintOrder="stroke"
        fontSize={10}
        fontWeight="bold"
      >
        {String(value)}
      </text>
    )
  }

  return { CmsLabel, ConsumoPercentPVLabel, LeituraCochoLabel }
}

export function RelatorioConsumoPublico({ token, relatorioInfo }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dados, setDados] = useState<DadosRelatorioConsumo | null>(null)
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [filtroLote, setFiltroLote] = useState<Set<string>>(new Set())
  const [loteDropdownOpen, setLoteDropdownOpen] = useState(false)
  const [exportandoPDF, setExportandoPDF] = useState(false)
  const loteDropdownRef = useRef<HTMLDivElement>(null)

  const carregarDados = useCallback(async () => {
    if (!token) return
    try {
      setLoading(true)
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('get_dados_relatorio_consumo', {
          p_token: token,
          p_data_inicio: dataInicio || null,
          p_data_fim: dataFim || null,
        })

      if (rpcError) {
        console.error('Erro ao carregar dados:', rpcError)
        setError('Erro ao carregar dados do relatório.')
        setLoading(false)
        return
      }

      setDados(rpcData?.dados as DadosRelatorioConsumo)
      setError(null)
    } catch (err) {
      console.error('Erro:', err)
      setError('Erro inesperado ao carregar relatório.')
    } finally {
      setLoading(false)
    }
  }, [token, dataInicio, dataFim])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (loteDropdownRef.current && !loteDropdownRef.current.contains(e.target as Node)) {
        setLoteDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      document.querySelectorAll('.recharts-surface').forEach((svg) => {
        svg.removeAttribute('tabindex')
        svg.removeAttribute('role')
        ;(svg as HTMLElement).style.outline = 'none'
        ;(svg as HTMLElement).style.boxShadow = 'none'
      })
    }, 300)
    return () => clearTimeout(timer)
  }, [dados, filtroLote, dataInicio, dataFim])

  const lotesFiltrados = useMemo(() => {
    if (!dados) return []
    if (filtroLote.size === 0) return dados.lotes
    return dados.lotes.filter((l) => filtroLote.has(l.lote_id))
  }, [dados, filtroLote])

  const temFiltrosAtivos = filtroLote.size > 0 || dataInicio || dataFim

  const limparFiltros = () => {
    setDataInicio('')
    setDataFim('')
    setFiltroLote(new Set())
  }

  const toggleLote = (loteId: string) => {
    setFiltroLote((prev) => {
      const next = new Set(prev)
      if (next.has(loteId)) next.delete(loteId)
      else next.add(loteId)
      return next
    })
  }

  const toggleAllLotes = () => {
    if (!dados) return
    if (filtroLote.size === dados.lotes_disponiveis.length) {
      setFiltroLote(new Set())
    } else {
      setFiltroLote(new Set(dados.lotes_disponiveis.map((l) => l.lote_id)))
    }
  }

  const calcularKPIs = (lote: LoteDados) => {
    const dados = lote.dados
    const consumoMedio = dados.length
      ? dados.reduce((s, d) => s + d.consumo_percent_pv, 0) / dados.length
      : null
    const custoMedio =
      dados.length && dados.some((d) => d.custo_reais_cab_dia != null)
        ? dados.reduce((s, d) => s + (d.custo_reais_cab_dia || 0), 0) /
          dados.filter((d) => d.custo_reais_cab_dia != null).length
        : null
    return { consumoMedio, custoMedio }
  }

  const exportarPDF = async () => {
    if (!dados || lotesFiltrados.length === 0) return
    try {
      setExportandoPDF(true)

      const lotesRelatorio: LoteRelatorio[] = lotesFiltrados
        .filter((l) => !l.info.erro || l.info.erro.length === 0)
        .map((l) => ({
        info: {
          ...l.info,
          fazenda_id: relatorioInfo.fazenda_id,
          fazenda_nome: relatorioInfo.fazenda_nome,
          fazenda_logo_url: relatorioInfo.fazenda_logo_url,
        },
        dados: l.dados,
      }))

      const blob = await gerarRelatorioConsumoPDFPuppeteer({
        dataInicio: dataInicio || dados.lotes[0]?.dados[0]?.data || '',
        dataFim: dataFim || dados.lotes[0]?.dados[dados.lotes[0]?.dados.length - 1]?.data || '',
        lotes: lotesRelatorio,
        fazendaNome: relatorioInfo.fazenda_nome || '',
        fazendaLogoUrl: relatorioInfo.fazenda_logo_url,
      })

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const nomeFazenda = relatorioInfo.fazenda_nome || 'Fazenda'
      link.download = `Gesta'Up - Relatório de Consumo ${nomeFazenda}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Erro ao exportar PDF:', err)
      alert('Erro ao gerar PDF. Tente novamente.')
    } finally {
      setExportandoPDF(false)
    }
  }

  if (loading && !dados) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F5F5' }}>
        <div className="text-center flex flex-col items-center">
          <div className="bg-white rounded-xl p-4 shadow-sm mb-3">
            <img src={logoManejus} alt="Manejus 360" className="h-12" />
          </div>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 mb-3" style={{ borderColor: GREEN_DARK }}></div>
          <p className="text-gray-600">Carregando relatório...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F5F5' }}>
        <div className="text-center max-w-md">
          <div className="bg-white rounded-xl p-4 inline-block shadow-sm mb-4">
            <img src={logoManejus} alt="Manejus 360" className="h-12 mx-auto" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Relatório indisponível</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F5' }}>
      <style>{CHART_NO_FOCUS_CSS}</style>

      {/* Header verde */}
      <header className="sticky top-0 z-10" style={{ backgroundColor: GREEN_DARK }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="bg-white rounded-lg p-1 flex items-center justify-center">
                <img src={logoManejus} alt="Manej'Us 360" className="h-8 w-auto" />
              </div>
              <h1 className="text-sm sm:text-base font-bold text-white hidden sm:block">
                Manej'Us <span className="text-yellow-500">360</span>
              </h1>
            </div>

            <div className="bg-white rounded-full px-5 py-1.5 shadow-sm flex-1 max-w-md text-center">
              <h2 className="text-sm font-bold leading-tight" style={{ color: GREEN_DARK }}>
                {relatorioInfo?.titulo || 'Análise de Consumo'}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              {relatorioInfo?.fazenda_logo_url && (
                <div className="bg-white rounded-lg p-1 flex items-center justify-center">
                  <img src={relatorioInfo.fazenda_logo_url} alt={relatorioInfo?.fazenda_nome || 'Fazenda'} className="h-8 w-auto max-w-[80px] object-contain" />
                </div>
              )}
              <button
                onClick={exportarPDF}
                disabled={exportandoPDF || lotesFiltrados.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                style={{ color: GREEN_DARK }}
              >
                {exportandoPDF ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2" style={{ borderColor: GREEN_DARK }}></div>
                    Gerando...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13l3 3 3-3M12 16V9" />
                    </svg>
                    Exportar PDF
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Slicers */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data início</label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:ring-1 focus:ring-green-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data fim</label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:ring-1 focus:ring-green-600"
              />
            </div>
            <div ref={loteDropdownRef} className="relative">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Lotes {filtroLote.size > 0 && <span style={{ color: GREEN_DARK }}>● {filtroLote.size}</span>}
              </label>
              <button
                onClick={() => setLoteDropdownOpen(!loteDropdownOpen)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-left bg-white focus:border-green-600 focus:ring-1 focus:ring-green-600 flex items-center justify-between"
              >
                <span className={filtroLote.size > 0 ? 'text-gray-900' : 'text-gray-400'}>
                  {filtroLote.size === 0
                    ? 'Todos'
                    : filtroLote.size === 1
                      ? dados?.lotes_disponiveis.find((l) => filtroLote.has(l.lote_id))?.lote_nome || '1 selecionado'
                      : `${filtroLote.size} selecionados`}
                </span>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {loteDropdownOpen && (
                <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg p-2">
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-100">
                    <button
                      onClick={toggleAllLotes}
                      className="text-xs text-green-700 hover:text-green-800 font-medium"
                    >
                      {filtroLote.size === dados?.lotes_disponiveis.length && (dados?.lotes_disponiveis.length ?? 0) > 0
                        ? 'Desmarcar todos'
                        : 'Selecionar todos'}
                    </button>
                    {filtroLote.size > 0 && (
                      <button
                        onClick={() => setFiltroLote(new Set())}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Limpar ({filtroLote.size})
                      </button>
                    )}
                  </div>
                  {dados?.lotes_disponiveis.map((l) => (
                    <label
                      key={l.lote_id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={filtroLote.has(l.lote_id)}
                        onChange={() => toggleLote(l.lote_id)}
                        className="rounded border-gray-300 text-green-600 focus:ring-green-600"
                      />
                      <span className="text-gray-700">{l.lote_nome}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-gray-400">
              {lotesFiltrados.length} lote(s) com dados no período selecionado.
            </p>
            {temFiltrosAtivos && (
              <button
                onClick={limparFiltros}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Limpar filtros
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filtros ativos (chips) */}
      {filtroLote.size > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500">Lotes filtrados:</span>
            {Array.from(filtroLote).map((loteId) => {
              const lote = dados?.lotes_disponiveis.find((l) => l.lote_id === loteId)
              if (!lote) return null
              return (
                <button
                  key={loteId}
                  onClick={() => toggleLote(loteId)}
                  className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-800 px-3 py-1 text-xs font-medium hover:bg-green-200"
                >
                  {lote.lote_nome}
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Conteúdo: um card por lote, agrupado por dieta */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {lotesFiltrados.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <p className="text-gray-500">Nenhum registro de suplementação encontrado para os filtros selecionados.</p>
          </div>
        ) : (
          lotesFiltrados.map((lote, index) => {
            const { consumoMedio, custoMedio } = calcularKPIs(lote)
            const info = lote.info
            const temDados = lote.dados.length > 0
            const temErro = info.erro && info.erro.length > 0
            const { CmsLabel, ConsumoPercentPVLabel, LeituraCochoLabel } = criarLabelsAntiColisao()

            // Separador visual por dieta: renderiza um header quando a dieta muda
            const dietaAtual = info.dieta || 'Sem dieta'
            const dietaAnterior = index > 0 ? (lotesFiltrados[index - 1].info.dieta || 'Sem dieta') : null
            const mudouDieta = dietaAnterior !== null && dietaAnterior !== dietaAtual
            const primeiraDieta = index === 0

            return (
              <div key={lote.lote_id}>
              {(primeiraDieta || mudouDieta) && (
                <div className="mb-4 mt-2 first:mt-0">
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-gray-300"></div>
                    <span className="text-sm font-bold tracking-wide uppercase" style={{ color: GREEN_DARK }}>
                      🌿 {dietaAtual}
                    </span>
                    <div className="h-px flex-1 bg-gray-300"></div>
                  </div>
                </div>
              )}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Header do lote */}
                <div className="px-5 py-3 flex items-center justify-between" style={{ backgroundColor: GREEN_DARK }}>
                  <h2 className="text-base font-bold text-white">{lote.lote_nome}</h2>
                  <span className="text-xs text-white opacity-80">
                    {lote.dados.length} registro(s)
                  </span>
                </div>

                {temErro ? (
                  <div className="p-5">
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
                      <p className="text-sm font-semibold text-amber-900 mb-2">
                        Não foi possível gerar o relatório deste lote.
                      </p>
                      <p className="text-xs text-amber-800 mb-3">
                        As seguintes categorias ativas possuem dados faltantes necessários para calcular a média ponderada:
                      </p>
                      <ul className="space-y-2">
                        {info.erro!.map((e, i) => (
                          <li key={i} className="text-sm text-amber-900">
                            <span className="font-medium capitalize">{e.categoria}</span>
                            <span className="text-amber-700">: {e.dados_faltantes.join(', ')}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs text-amber-700 mt-3">
                        Preencha os dados faltantes na tela de Lotes para que o lote apareça no relatório.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                {/* KPIs + Pills */}
                <div className="p-5 space-y-4">
                  {/* Pills (Nº Cab, Raça, Categoria, Dieta) */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: 'Nº Cab. Atual', value: formatarInteiro(info.n_cabecas_atual) },
                      { label: 'Raça', value: info.raca || '—' },
                      { label: 'Categoria', value: info.categoria ? info.categoria.split(', ').map(c => c.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')).join(', ') : '—' },
                      { label: 'Dieta', value: info.dieta || '—' },
                    ].map((p) => (
                      <div key={p.label} className="rounded-lg p-2.5 text-center text-white shadow-sm" style={{ backgroundColor: GREEN_DARK }}>
                        <p className="text-sm font-bold leading-tight truncate">{p.value}</p>
                        <p className="text-[10px] opacity-90 leading-tight mt-0.5">{p.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* KPIs (Peso Entrada, Consumo %PV, R$/cab/dia, Peso Atual, Período, Data Prevista) */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                    {[
                      { label: 'Peso Entrada (kg)', value: formatarInteiro(info.peso_entrada_kg) },
                      { label: 'Consumo %PV', value: `${formatarNumero(consumoMedio, 2)}%` },
                      { label: 'R$/cab/dia', value: `R$ ${formatarNumero(custoMedio, 2)}` },
                      { label: 'Peso Atual (kg)', value: formatarNumero(info.peso_atual_kg, 2) },
                      { label: 'Período (dias)', value: formatarInteiro(info.dias) },
                      { label: 'Data Prevista Final', value: formatarData(info.data_prevista_final) },
                    ].map((k) => (
                      <div key={k.label} className="rounded-lg p-2.5 text-center text-white shadow-sm" style={{ backgroundColor: GREEN_DARK }}>
                        <p className="text-sm sm:text-base font-bold leading-tight">{k.value}</p>
                        <p className="text-[10px] opacity-90 leading-tight mt-0.5">{k.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Gráfico */}
                  {temDados ? (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                      <h3 className="text-sm font-semibold text-gray-900 mb-3 text-center">Consumo Médio %PV</h3>
                      <ResponsiveContainer width="100%" height={460}>
                        <ComposedChart
                          data={lote.dados}
                          margin={{ top: 20, right: 65, left: 10, bottom: 30 }}
                          style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                          <XAxis
                            dataKey="data_label"
                            tick={{ fontSize: 11, fill: MEDIUM_TEXT }}
                            padding={{ left: 25, right: 25 }}
                            label={{ value: 'Dias', position: 'insideBottom', offset: -18, style: { fontSize: 12, fill: MEDIUM_TEXT, fontWeight: 'bold' } }}
                          />
                          <YAxis
                            yAxisId="left"
                            tick={{ fontSize: 11, fill: MEDIUM_TEXT }}
                            label={{ value: 'CMS (kg/cab/dia)', angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 12, fill: DARK_TEXT, fontWeight: 'bold', textAnchor: 'middle' } }}
                          />
                          <YAxis
                            yAxisId="right"
                            orientation="right"
                            tick={{ fontSize: 11, fill: GREEN_LINE }}
                            tickFormatter={(val) => `${Number(val).toFixed(1)}%`}
                            label={{ value: '% PV', angle: 90, position: 'insideRight', offset: 20, style: { fontSize: 12, fill: GREEN_LINE, fontWeight: 'bold', textAnchor: 'middle' } }}
                          />
                          <YAxis yAxisId="leitura" orientation="right" hide domain={[-1, 25]} />
                          <Tooltip
                            contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                            formatter={((value: any, name: any) => {
                              if (name === 'Consumo %PV') return [`${Number(value).toFixed(2)}%`, name]
                              if (name === 'CMS (kg/cab/dia)') return [`${Number(value).toFixed(2)} kg`, name]
                              if (name === 'Leitura Cocho') return [value != null ? value : '—', name]
                              return [String(value), name]
                            }) as any}
                          />
                          <Legend
                            wrapperStyle={{ fontSize: '12px', fontWeight: 'bold', paddingTop: '25px', width: '100%' }}
                            iconType="circle"
                            content={({ payload }: any) => {
                              if (!payload) return null
                              const order = ['CMS (kg/cab/dia)', 'Consumo %PV', 'Leitura Cocho']
                              const sorted = [...payload].sort((a: any, b: any) =>
                                order.indexOf(a.value) - order.indexOf(b.value)
                              )
                              return (
                                <ul style={{ padding: 0, margin: 0, textAlign: 'center', listStyle: 'none' }}>
                                  {sorted.map((entry: any, i: number) => (
                                    <li key={i} style={{ display: 'inline-block', marginRight: 10 }}>
                                      <svg width="14" height="14" viewBox="0 0 32 32" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }}>
                                        <path fill={entry.color} d="M16,0A16,16,0,1,1,-16,0A16,16,0,1,1,16,0" transform="translate(16,16)" />
                                      </svg>
                                      <span style={{ color: entry.color, fontSize: '12px', fontWeight: 'bold' }}>{entry.value}</span>
                                    </li>
                                  ))}
                                </ul>
                              )
                            }}
                          />
                          <Bar
                            yAxisId="left"
                            dataKey="trato_kg_cab_dia"
                            name="CMS (kg/cab/dia)"
                            fill={BLUE_BAR}
                            radius={[4, 4, 0, 0]}
                            barSize={30}
                          >
                            <LabelList
                              dataKey="trato_kg_cab_dia"
                              content={CmsLabel}
                            />
                          </Bar>
                          <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="consumo_percent_pv"
                            name="Consumo %PV"
                            stroke={GREEN_LINE}
                            strokeWidth={3}
                            dot={{ r: 5, fill: GREEN_LINE, stroke: '#FFFFFF', strokeWidth: 2 }}
                          >
                            <LabelList
                              dataKey="consumo_percent_pv"
                              content={ConsumoPercentPVLabel}
                            />
                          </Line>
                          <Line
                            yAxisId="leitura"
                            type="monotone"
                            dataKey="leitura_cocho"
                            name="Leitura Cocho"
                            stroke={LEITURA_COLOR}
                            strokeWidth={2}
                            dot={{ r: 4, fill: LEITURA_COLOR, stroke: '#FFFFFF', strokeWidth: 1.5 }}
                            connectNulls
                          >
                            <LabelList
                              dataKey="leitura_cocho"
                              content={LeituraCochoLabel}
                            />
                          </Line>
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
                      <p className="text-sm text-gray-500">Nenhum dado de suplementação encontrado no período para este lote.</p>
                    </div>
                  )}
                </div>
                  </>
                )}
              </div>
              </div>
            )
          })
        )}
      </main>
    </div>
  )
}
