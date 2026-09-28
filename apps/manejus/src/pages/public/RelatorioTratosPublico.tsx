import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../../services/supabaseClient'
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import logoManejus from '/images/manejus360.png'
import {
  gerarRelatorioTratosPDF,
  type LinhaTrato,
  type ResumoLoteTrato,
  type LoteRelatorioTratos,
} from '../../utils/relatorioTratosPDF'

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

interface LoteDisponivel {
  lote_id: string
  lote_nome: string
}

interface DadosRelatorioTratos {
  fazenda_nome?: string
  fazenda_logo_url?: string | null
  timezone?: string
  lotes_disponiveis: LoteDisponivel[]
  linhas: LinhaTrato[]
  resumo_por_lote: ResumoLoteTrato[]
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

function formatarMinutos(min: number | null | undefined): string {
  if (min === null || min === undefined || isNaN(min as number)) return '—'
  const v = Math.round(min as number)
  const sinal = v > 0 ? '+' : ''
  return `${sinal}${v}min`
}

function formatarData(d: string | null | undefined): string {
  if (!d || d === '—') return '—'
  const parts = d.split('-')
  if (parts.length === 3) return `${parts[2]}/${parts[1]}`
  return d
}

interface Props {
  token: string
  relatorioInfo: RelatorioInfo
}

export function RelatorioTratosPublico({ token, relatorioInfo }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dados, setDados] = useState<DadosRelatorioTratos | null>(null)
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
        .rpc('get_dados_relatorio_tratos', {
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

      setDados(rpcData?.dados as DadosRelatorioTratos)
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

  const linhasFiltradas = useMemo(() => {
    if (!dados) return []
    if (filtroLote.size === 0) return dados.linhas
    return dados.linhas.filter((l) => filtroLote.has(l.lote_id))
  }, [dados, filtroLote])

  const resumosFiltrados = useMemo(() => {
    if (!dados) return []
    if (filtroLote.size === 0) return dados.resumo_por_lote
    return dados.resumo_por_lote.filter((r) => filtroLote.has(r.lote_id))
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

  // === Granularidade adaptativa para gráficos ===
  // Princípio: legibilidade de gráfico de barras decai rápido após ~31 pontos.
  // Em vez de renderizar N barras finas ou multiplicar gráficos, agrega por
  // dia (≤31), semana (≤84) ou mês (>84). A tabela detalhada mantém granularidade por trato.
  const diasUnicos = useMemo(() => {
    const set = new Set<string>()
    for (const l of linhasFiltradas) set.add(l.data)
    return set.size
  }, [linhasFiltradas])

  const granularidade = useMemo<'dia' | 'semana' | 'mes'>(() => {
    if (diasUnicos <= 31) return 'dia'
    if (diasUnicos <= 84) return 'semana'
    return 'mes'
  }, [diasUnicos])

  const labelGranularidade = granularidade === 'dia' ? 'por dia' : granularidade === 'semana' ? 'por semana' : 'por mês'

  function chaveAgregacao(data: string, gran: 'dia' | 'semana' | 'mes'): { chave: string; label: string } {
    const [ano, mes, dia] = data.split('-').map(Number)
    if (gran === 'dia') {
      return { chave: data, label: `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}` }
    }
    if (gran === 'mes') {
      const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
      return { chave: `${ano}-${String(mes).padStart(2, '0')}`, label: `${nomes[mes - 1]}/${String(ano).slice(2)}` }
    }
    // semana: segunda-feira da semana ISO
    const d = new Date(ano, mes - 1, dia)
    const dayOfWeek = d.getDay()
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const monday = new Date(ano, mes - 1, dia + diff)
    return {
      chave: `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`,
      label: `${String(monday.getDate()).padStart(2, '0')}/${String(monday.getMonth() + 1).padStart(2, '0')}`,
    }
  }

  // Agregar desvio de kg para o gráfico (granularidade adaptativa)
  const dadosGraficoKg = useMemo(() => {
    const porPeriodo = new Map<string, { chave: string; label: string; desvio: number; planejado: number }>()
    for (const l of linhasFiltradas) {
      const { chave, label } = chaveAgregacao(l.data, granularidade)
      const existing = porPeriodo.get(chave)
      if (existing) {
        existing.desvio += l.desvio_kg ?? 0
        existing.planejado += l.kg_planejado ?? 0
      } else {
        porPeriodo.set(chave, { chave, label, desvio: l.desvio_kg ?? 0, planejado: l.kg_planejado ?? 0 })
      }
    }
    return Array.from(porPeriodo.values())
      .sort((a, b) => a.chave.localeCompare(b.chave))
      .map((d) => ({
        data: d.label,
        desvio: Math.round(d.desvio * 100) / 100,
        status: d.planejado === 0 ? 'sem_execucao' : Math.abs((d.desvio / d.planejado) * 100) <= 5 ? 'ok' : Math.abs((d.desvio / d.planejado) * 100) <= 15 ? 'alerta' : 'critico',
      }))
  }, [linhasFiltradas, granularidade])

  // Dados para o gráfico de desvio de horário (granularidade adaptativa, média em minutos)
  const dadosGraficoHorario = useMemo(() => {
    const porPeriodo = new Map<string, { chave: string; label: string; soma: number; count: number }>()
    for (const l of linhasFiltradas) {
      if (l.desvio_min == null) continue
      const { chave, label } = chaveAgregacao(l.data, granularidade)
      const v = l.desvio_min as number
      const existing = porPeriodo.get(chave)
      if (existing) {
        existing.soma += v
        existing.count += 1
      } else {
        porPeriodo.set(chave, { chave, label, soma: v, count: 1 })
      }
    }
    return Array.from(porPeriodo.values())
      .sort((a, b) => a.chave.localeCompare(b.chave))
      .map((d) => {
        const media = d.soma / d.count
        return {
          data: d.label,
          desvio: Math.round(media * 10) / 10,
          status: Math.abs(media) <= 15 ? 'ok' : Math.abs(media) <= 30 ? 'alerta' : 'critico',
        }
      })
  }, [linhasFiltradas, granularidade])

  const exportarPDF = async () => {
    if (!dados || resumosFiltrados.length === 0) return
    try {
      setExportandoPDF(true)

      const lotesRelatorio: LoteRelatorioTratos[] = resumosFiltrados.map((resumo) => ({
        resumo,
        linhas: linhasFiltradas.filter((l) => l.lote_id === resumo.lote_id),
      }))

      const periodoInicio = dataInicio || (linhasFiltradas[linhasFiltradas.length - 1]?.data ?? '')
      const periodoFim = dataFim || (linhasFiltradas[0]?.data ?? '')

      const blob = await gerarRelatorioTratosPDF({
        dataInicio: periodoInicio,
        dataFim: periodoFim,
        fazendaNome: relatorioInfo.fazenda_nome || '',
        fazendaLogoUrl: relatorioInfo.fazenda_logo_url,
        lotes: lotesRelatorio,
      })

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const nomeFazenda = relatorioInfo.fazenda_nome || 'Fazenda'
      link.download = `Gesta'Up - Relatório de Tratos ${nomeFazenda}.pdf`
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
                {relatorioInfo?.titulo || 'Acompanhamento de Tratos'}
              </h2>
              {relatorioInfo?.fazenda_nome && (
                <p className="text-[10px] text-gray-500 leading-tight">{relatorioInfo.fazenda_nome}</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {relatorioInfo?.fazenda_logo_url && (
                <div className="bg-white rounded-lg p-1 flex items-center justify-center">
                  <img src={relatorioInfo.fazenda_logo_url} alt={relatorioInfo?.fazenda_nome || 'Fazenda'} className="h-8 w-auto max-w-[80px] object-contain" />
                </div>
              )}
              <button
                onClick={exportarPDF}
                disabled={exportandoPDF || resumosFiltrados.length === 0}
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
              {linhasFiltradas.length} registro(s) de {resumosFiltrados.length} lote(s) no período.
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

      {/* Conteúdo */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {resumosFiltrados.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <p className="text-gray-500">Nenhum registro de trato encontrado para os filtros selecionados.</p>
          </div>
        ) : (
          <>
            {/* Resumo por lote */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-5 py-3" style={{ backgroundColor: GREEN_DARK }}>
                <h2 className="text-base font-bold text-white">Resumo por lote</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left py-2.5 px-4 font-medium text-gray-600">Lote</th>
                      <th className="text-right py-2.5 px-3 font-medium text-gray-600">Dias</th>
                      <th className="text-right py-2.5 px-3 font-medium text-gray-600">Tratos</th>
                      <th className="text-right py-2.5 px-3 font-medium text-gray-600">Planejado (kg)</th>
                      <th className="text-right py-2.5 px-3 font-medium text-gray-600">Real (kg)</th>
                      <th className="text-right py-2.5 px-3 font-medium text-gray-600">Desvio (kg)</th>
                      <th className="text-right py-2.5 px-3 font-medium text-gray-600">Desvio %</th>
                      <th className="text-right py-2.5 px-3 font-medium text-gray-600">Desvio hor. médio</th>
                      <th className="text-center py-2.5 px-3 font-medium text-gray-600">Status kg</th>
                      <th className="text-center py-2.5 px-3 font-medium text-gray-600">Status hor.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumosFiltrados.map((r) => (
                      <tr key={r.lote_id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="py-2.5 px-4 font-medium text-gray-900">{r.lote_nome}</td>
                        <td className="py-2.5 px-3 text-right text-gray-700">{r.dias_com_registro}</td>
                        <td className="py-2.5 px-3 text-right text-gray-700">{r.n_tratos}</td>
                        <td className="py-2.5 px-3 text-right text-gray-700">{formatarInteiro(r.planejado_total_kg)}</td>
                        <td className="py-2.5 px-3 text-right text-gray-700">{formatarInteiro(r.real_total_kg)}</td>
                        <td className="py-2.5 px-3 text-right text-gray-700">{formatarInteiro(r.desvio_total_kg)}</td>
                        <td className="py-2.5 px-3 text-right text-gray-700">{formatarNumero(r.desvio_medio_pct, 2)}%</td>
                        <td className="py-2.5 px-3 text-right text-gray-700">{formatarMinutos(r.desvio_medio_min)}</td>
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1 flex-wrap">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium" style={{ backgroundColor: STATUS_KG_COLORS.ok + '20', color: STATUS_KG_COLORS.ok }}>{r.n_ok}</span>
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium" style={{ backgroundColor: STATUS_KG_COLORS.alerta + '20', color: STATUS_KG_COLORS.alerta }}>{r.n_alerta}</span>
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium" style={{ backgroundColor: STATUS_KG_COLORS.critico + '20', color: STATUS_KG_COLORS.critico }}>{r.n_critico}</span>
                            {r.n_sem_execucao > 0 && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium" style={{ backgroundColor: STATUS_KG_COLORS.sem_execucao + '20', color: STATUS_KG_COLORS.sem_execucao }}>{r.n_sem_execucao}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <div className="flex items-center justify-center gap-1 flex-wrap">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium" style={{ backgroundColor: STATUS_HORARIO_COLORS.ok + '20', color: STATUS_HORARIO_COLORS.ok }}>{r.n_horario_ok}</span>
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium" style={{ backgroundColor: STATUS_HORARIO_COLORS.alerta + '20', color: STATUS_HORARIO_COLORS.alerta }}>{r.n_horario_alerta}</span>
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium" style={{ backgroundColor: STATUS_HORARIO_COLORS.critico + '20', color: STATUS_HORARIO_COLORS.critico }}>{r.n_horario_critico}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Gráfico de desvio de kg por dia */}
            {dadosGraficoKg.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Desvio de kg {labelGranularidade}</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={dadosGraficoKg} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="data" tick={{ fontSize: 11, fill: '#6B7280' }} angle={-45} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} />
                    <Tooltip
                      formatter={(v: any) => [`${formatarNumero(Number(v), 2)} kg`, 'Desvio']}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}
                    />
                    <ReferenceLine y={0} stroke="#9CA3AF" strokeWidth={1} />
                    <Bar dataKey="desvio" radius={[4, 4, 0, 0]}>
                      {dadosGraficoKg.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={STATUS_KG_COLORS[entry.status]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Gráfico de desvio de horário por dia (média em minutos) */}
            {dadosGraficoHorario.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Desvio de horário {labelGranularidade} (média em minutos)</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={dadosGraficoHorario} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="data" tick={{ fontSize: 11, fill: '#6B7280' }} angle={-45} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} />
                    <Tooltip
                      formatter={(v: any) => [`${formatarMinutos(Number(v))}`, 'Desvio médio']}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}
                    />
                    <ReferenceLine y={0} stroke="#9CA3AF" strokeWidth={1} />
                    <Bar dataKey="desvio" radius={[4, 4, 0, 0]}>
                      {dadosGraficoHorario.map((entry, index) => (
                        <Cell key={`cell-h-${index}`} fill={STATUS_HORARIO_COLORS[entry.status]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Tabela detalhada */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-5 py-3" style={{ backgroundColor: GREEN_DARK }}>
                <h2 className="text-base font-bold text-white">Detalhamento por trato</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left py-2.5 px-3 font-medium text-gray-600">Data</th>
                      <th className="text-left py-2.5 px-3 font-medium text-gray-600">Lote</th>
                      <th className="text-center py-2.5 px-2 font-medium text-gray-600">Trato</th>
                      <th className="text-right py-2.5 px-3 font-medium text-gray-600">Planejado</th>
                      <th className="text-right py-2.5 px-3 font-medium text-gray-600">Real</th>
                      <th className="text-right py-2.5 px-3 font-medium text-gray-600">Desvio kg</th>
                      <th className="text-right py-2.5 px-3 font-medium text-gray-600">Desvio %</th>
                      <th className="text-center py-2.5 px-3 font-medium text-gray-600">Horário sug.</th>
                      <th className="text-center py-2.5 px-3 font-medium text-gray-600">Horário real</th>
                      <th className="text-right py-2.5 px-3 font-medium text-gray-600">Desvio min</th>
                      <th className="text-center py-2.5 px-3 font-medium text-gray-600">Status kg</th>
                      <th className="text-center py-2.5 px-3 font-medium text-gray-600">Status hor.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhasFiltradas.slice(0, 200).map((l, i) => (
                      <tr key={`${l.lote_id}-${l.data}-${l.ordem_trato}-${i}`} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="py-2 px-3 text-gray-700">{formatarData(l.data)}</td>
                        <td className="py-2 px-3 text-gray-900 font-medium">{l.lote_nome}</td>
                        <td className="py-2 px-2 text-center text-gray-700">T{l.ordem_trato}</td>
                        <td className="py-2 px-3 text-right text-gray-700">{formatarNumero(l.kg_planejado, 1)}</td>
                        <td className="py-2 px-3 text-right text-gray-700">{formatarNumero(l.kg_ofertado_real, 1)}</td>
                        <td className="py-2 px-3 text-right text-gray-700">{formatarNumero(l.desvio_kg, 1)}</td>
                        <td className="py-2 px-3 text-right text-gray-700">{l.desvio_pct != null ? `${formatarNumero(l.desvio_pct, 1)}%` : '—'}</td>
                        <td className="py-2 px-3 text-center text-gray-700">{l.horario_sugerido ?? '—'}</td>
                        <td className="py-2 px-3 text-center text-gray-700">{l.horario_real ?? '—'}</td>
                        <td className="py-2 px-3 text-right text-gray-700">{formatarMinutos(l.desvio_min)}</td>
                        <td className="py-2 px-3 text-center">
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
                            style={{ backgroundColor: STATUS_KG_COLORS[l.status_kg] + '20', color: STATUS_KG_COLORS[l.status_kg] }}
                          >
                            {l.status_kg === 'sem_execucao' ? 'S/exec' : l.status_kg}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center">
                          {l.status_horario !== 'sem_horario' && (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
                              style={{ backgroundColor: STATUS_HORARIO_COLORS[l.status_horario] + '20', color: STATUS_HORARIO_COLORS[l.status_horario] }}
                            >
                              {l.status_horario}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {linhasFiltradas.length > 200 && (
                  <div className="px-4 py-3 text-center text-xs text-gray-500 bg-gray-50">
                    Mostrando 200 de {linhasFiltradas.length} registros. Exporte o PDF para ver todos.
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
