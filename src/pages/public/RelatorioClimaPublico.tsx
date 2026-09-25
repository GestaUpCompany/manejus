import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../../services/supabaseClient'
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import logoManejus from '/images/manejus360.png'
import { gerarRelatorioClimaPDFPuppeteer } from '../../utils/relatorioClimaPDFPuppeteer'

const GREEN_DARK = '#0F6437'
const PLUV_COLORS = ['#1E3A5F', '#0F6437', '#10B981', '#c28a27', '#6B7280', '#34b87c', '#5ccf94', '#a2e9bc']
const TEMP_COLOR = '#EF4444'

const CHART_NO_FOCUS_CSS = `
.recharts-surface {
  outline: none !important;
  box-shadow: none !important;
  border: none !important;
  -webkit-tap-highlight-color: transparent !important;
}
.recharts-surface:focus,
.recharts-surface:focus-visible,
.recharts-surface *:focus,
.recharts-surface *:focus-visible {
  outline: none !important;
  box-shadow: none !important;
}
.recharts-wrapper, .recharts-bar-rectangle, .recharts-bar-rectangle * {
  outline: none !important;
}
.recharts-active-dot { display: none !important; }
`

interface RelatorioInfo {
  fazenda_id: string
  titulo: string
  tipo: string
  fazenda_nome?: string
  fazenda_logo_url?: string | null
}

export interface PluviometroDisponivel {
  pluviometro_id: string
  pluviometro_nome: string
  pluviometro_localizacao: string | null
}

export interface LeituraClima {
  registro_id: string
  data: string
  horario: string | null
  pluviometro_id: string | null
  pluviometro_nome: string | null
  pluviometro_localizacao: string | null
  medicao_mm: number | null
  temperatura: number | null
  temperatura_media: number | null
  umidade_relativa: number | null
  responsavel: string | null
  nome_usuario: string | null
  observacao: string | null
}

interface DadosRelatorioClima {
  fazenda_nome?: string
  fazenda_logo_url?: string | null
  timezone?: string
  pluviometros_disponiveis: PluviometroDisponivel[]
  registros: LeituraClima[]
}

export interface ResumoPluviometro {
  pluviometro_id: string
  pluviometro_nome: string
  pluviometro_localizacao: string | null
  n_medicoes: number
  mm_total: number
  mm_medio: number | null
  maior_leitura: number | null
  temp_min: number | null
  temp_max: number | null
}

export interface PontoSerieClima {
  data: string
  data_label: string
  temp_media: number | null
  [pluviometro: string]: string | number | null
}

export interface KpisClima {
  mm_total: number
  n_leituras: number
  dias_com_chuva: number
  temp_media: number | null
  temp_min: number | null
  temp_max: number | null
  umidade_media: number | null
}

interface Props {
  token: string
  relatorioInfo: RelatorioInfo
}

function formatarData(iso: string): string {
  if (!iso) return '—'
  const partes = iso.split('T')[0].split('-')
  if (partes.length === 3) return `${partes[2]}/${partes[1]}/${partes[0]}`
  return iso
}

function dataLabel(iso: string): string {
  const partes = iso.split('-')
  return partes.length === 3 ? `${partes[2]}/${partes[1]}` : iso
}

function fmtNum(v: number | null | undefined, casas = 1): string {
  if (v === null || v === undefined || isNaN(v)) return '—'
  return v.toFixed(casas).replace('.', ',')
}

export function calcularKpis(registros: LeituraClima[]): KpisClima {
  const mmTotal = registros.reduce((s, r) => s + (Number(r.medicao_mm) || 0), 0)
  const diasComChuva = new Set(
    registros.filter((r) => (Number(r.medicao_mm) || 0) > 0).map((r) => r.data),
  ).size
  const temps = registros.map((r) => r.temperatura).filter((t): t is number => t !== null && t !== undefined)
  const umidades = registros.map((r) => r.umidade_relativa).filter((u): u is number => u !== null && u !== undefined)
  return {
    mm_total: mmTotal,
    n_leituras: registros.length,
    dias_com_chuva: diasComChuva,
    temp_media: temps.length ? temps.reduce((s, t) => s + t, 0) / temps.length : null,
    temp_min: temps.length ? Math.min(...temps) : null,
    temp_max: temps.length ? Math.max(...temps) : null,
    umidade_media: umidades.length ? umidades.reduce((s, u) => s + u, 0) / umidades.length : null,
  }
}

export function resumirPorPluviometro(registros: LeituraClima[]): ResumoPluviometro[] {
  const map = new Map<string, LeituraClima[]>()
  for (const r of registros) {
    const key = r.pluviometro_id || r.pluviometro_nome || 'desconhecido'
    const arr = map.get(key) || []
    arr.push(r)
    map.set(key, arr)
  }
  return Array.from(map.entries()).map(([key, regs]) => {
    const mms = regs.map((r) => Number(r.medicao_mm)).filter((v) => !isNaN(v))
    const temps = regs.map((r) => r.temperatura).filter((t): t is number => t !== null && t !== undefined)
    const first = regs[0]
    return {
      pluviometro_id: key,
      pluviometro_nome: first.pluviometro_nome || '—',
      pluviometro_localizacao: first.pluviometro_localizacao,
      n_medicoes: regs.length,
      mm_total: mms.reduce((s, v) => s + v, 0),
      mm_medio: mms.length ? mms.reduce((s, v) => s + v, 0) / mms.length : null,
      maior_leitura: mms.length ? Math.max(...mms) : null,
      temp_min: temps.length ? Math.min(...temps) : null,
      temp_max: temps.length ? Math.max(...temps) : null,
    }
  }).sort((a, b) => b.mm_total - a.mm_total)
}

export function serieDiaria(registros: LeituraClima[], nomesPluviometros: string[]): PontoSerieClima[] {
  const byDia = new Map<string, LeituraClima[]>()
  for (const r of registros) {
    const arr = byDia.get(r.data) || []
    arr.push(r)
    byDia.set(r.data, arr)
  }
  return Array.from(byDia.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, regs]) => {
      const temps = regs.map((r) => r.temperatura_media ?? r.temperatura).filter((t): t is number => t !== null && t !== undefined)
      const ponto: PontoSerieClima = {
        data,
        data_label: dataLabel(data),
        temp_media: temps.length ? Number((temps.reduce((s, t) => s + t, 0) / temps.length).toFixed(2)) : null,
      }
      for (const nome of nomesPluviometros) {
        const mm = regs
          .filter((r) => (r.pluviometro_nome || '—') === nome)
          .reduce((s, r) => s + (Number(r.medicao_mm) || 0), 0)
        ponto[nome] = Number(mm.toFixed(1))
      }
      return ponto
    })
}

export function RelatorioClimaPublico({ token, relatorioInfo }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dados, setDados] = useState<DadosRelatorioClima | null>(null)
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [filtroPluviometro, setFiltroPluviometro] = useState<Set<string>>(new Set())
  const [dropdownAberto, setDropdownAberto] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [exportandoPDF, setExportandoPDF] = useState(false)

  const carregarDados = useCallback(async () => {
    if (!token) return
    try {
      setLoading(true)
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('get_dados_relatorio_clima', {
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

      setDados(rpcData?.dados as DadosRelatorioClima)
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
    if (!dropdownAberto) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownAberto(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownAberto])

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
  }, [dados, filtroPluviometro, dataInicio, dataFim])

  const registrosFiltrados = useMemo(() => {
    if (!dados) return []
    if (filtroPluviometro.size === 0) return dados.registros
    return dados.registros.filter((r) => r.pluviometro_id && filtroPluviometro.has(r.pluviometro_id))
  }, [dados, filtroPluviometro])

  const pluviometrosSelecionados = useMemo(() => {
    const disponiveis = dados?.pluviometros_disponiveis || []
    if (filtroPluviometro.size === 0) return disponiveis
    return disponiveis.filter((p) => filtroPluviometro.has(p.pluviometro_id))
  }, [dados, filtroPluviometro])

  const nomesPluviometros = useMemo(
    () => pluviometrosSelecionados.map((p) => p.pluviometro_nome || '—'),
    [pluviometrosSelecionados],
  )

  const kpis = useMemo(() => calcularKpis(registrosFiltrados), [registrosFiltrados])
  const resumo = useMemo(() => resumirPorPluviometro(registrosFiltrados), [registrosFiltrados])
  const serie = useMemo(() => serieDiaria(registrosFiltrados, nomesPluviometros), [registrosFiltrados, nomesPluviometros])

  // Só entram no gráfico/legenda os pluviômetros com leitura no período
  // filtrado (a lista completa inclui pluviômetros sem dados).
  const nomesPluviometrosComDados = useMemo(() => {
    const comDados = new Set(registrosFiltrados.map((r) => r.pluviometro_nome || '—'))
    return nomesPluviometros.filter((n) => comDados.has(n))
  }, [registrosFiltrados, nomesPluviometros])

  // Sem registros de temperatura/umidade no período, os cards, a linha do
  // gráfico e as colunas correspondentes ficam ocultos.
  const temTemperatura = useMemo(
    () => registrosFiltrados.some((r) => r.temperatura != null || r.temperatura_media != null),
    [registrosFiltrados],
  )
  const temUmidade = useMemo(
    () => registrosFiltrados.some((r) => r.umidade_relativa != null),
    [registrosFiltrados],
  )

  const kpiCards = [
    { label: 'Chuva acumulada', value: `${fmtNum(kpis.mm_total, 1)} mm` },
    { label: 'Leituras', value: kpis.n_leituras.toString() },
    { label: 'Dias com chuva', value: kpis.dias_com_chuva.toString() },
    ...(temTemperatura
      ? [
          { label: 'Temp. média', value: kpis.temp_media !== null ? `${fmtNum(kpis.temp_media)}°C` : '—' },
          { label: 'Temp. mínima', value: kpis.temp_min !== null ? `${fmtNum(kpis.temp_min)}°C` : '—' },
          { label: 'Temp. máxima', value: kpis.temp_max !== null ? `${fmtNum(kpis.temp_max)}°C` : '—' },
        ]
      : []),
    ...(temUmidade
      ? [{ label: 'Umidade média', value: kpis.umidade_media !== null ? `${fmtNum(kpis.umidade_media, 0)}%` : '—' }]
      : []),
  ]
  const kpiGridCols =
    ({ 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 6: 'lg:grid-cols-6', 7: 'lg:grid-cols-7' } as Record<number, string>)[
      kpiCards.length
    ] || 'lg:grid-cols-7'

  const temFiltrosAtivos = filtroPluviometro.size > 0 || dataInicio || dataFim

  const limparFiltros = () => {
    setDataInicio('')
    setDataFim('')
    setFiltroPluviometro(new Set())
  }

  const togglePluviometro = (id: string) => {
    setFiltroPluviometro((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllPluviometros = () => {
    if (!dados) return
    if (filtroPluviometro.size === dados.pluviometros_disponiveis.length) {
      setFiltroPluviometro(new Set())
    } else {
      setFiltroPluviometro(new Set(dados.pluviometros_disponiveis.map((p) => p.pluviometro_id)))
    }
  }

  const exportarPDF = async () => {
    if (!dados || registrosFiltrados.length === 0) return
    try {
      setExportandoPDF(true)
      const datas = serie.map((p) => p.data).sort()
      const blob = await gerarRelatorioClimaPDFPuppeteer({
        dataInicio: dataInicio || datas[0] || '',
        dataFim: dataFim || datas[datas.length - 1] || '',
        fazendaNome: relatorioInfo.fazenda_nome || '',
        fazendaLogoUrl: relatorioInfo.fazenda_logo_url,
        kpis,
        pluviometros: nomesPluviometros,
        serie,
        resumo,
        registros: registrosFiltrados,
      })

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const nomeFazenda = relatorioInfo.fazenda_nome || 'Fazenda'
      link.download = `Gesta'Up - Relatório de Clima ${nomeFazenda}.pdf`
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
            <img src={logoManejus} alt="Manejus 360" loading="eager" className="h-12" />
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
            <img src={logoManejus} alt="Manejus 360" loading="eager" className="h-12 mx-auto" />
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
      <header className="sticky top-0 z-10" style={{ backgroundColor: GREEN_DARK }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="bg-white rounded-lg p-1 flex items-center justify-center">
                <img src={logoManejus} alt="Manej'Us 360" loading="eager" className="h-8 w-auto" />
              </div>
              <h1 className="text-sm sm:text-base font-bold text-white hidden sm:block">
                Manej'Us <span className="text-yellow-500">360</span>
              </h1>
            </div>

            <div className="bg-white rounded-full px-5 py-1.5 shadow-sm flex-1 max-w-md text-center">
              <h2 className="text-sm font-bold leading-tight" style={{ color: GREEN_DARK }}>
                {relatorioInfo?.titulo || 'Relatório de Clima'}
              </h2>
              {relatorioInfo?.fazenda_nome && (
                <p className="text-[10px] text-gray-500 leading-tight">{relatorioInfo.fazenda_nome}</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {relatorioInfo?.fazenda_logo_url && (
                <div className="bg-white rounded-lg p-1 flex items-center justify-center">
                  <img src={relatorioInfo.fazenda_logo_url} alt={relatorioInfo?.fazenda_nome || 'Fazenda'} loading="eager" className="h-8 w-auto max-w-[80px] object-contain" />
                </div>
              )}
              <button
                onClick={exportarPDF}
                disabled={exportandoPDF || registrosFiltrados.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                style={{ color: GREEN_DARK }}
                title="Exportar PDF com os filtros atuais"
              >
                {exportandoPDF ? (
                  <>
                    <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2" style={{ borderColor: GREEN_DARK }}></div>
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

      {/* KPIs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className={`grid grid-cols-2 sm:grid-cols-3 ${kpiGridCols} gap-2 sm:gap-3`}>
          {kpiCards.map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-lg p-2.5 text-center text-white shadow-sm"
              style={{ backgroundColor: GREEN_DARK }}
            >
              <p className="text-base sm:text-lg font-bold leading-tight">{kpi.value}</p>
              <p className="text-[10px] sm:text-xs opacity-90 leading-tight mt-0.5">{kpi.label}</p>
            </div>
          ))}
        </div>
      </div>

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
            <div className="relative" ref={dropdownRef}>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Pluviômetro {filtroPluviometro.size > 0 && <span className="text-green-600">● {filtroPluviometro.size}</span>}
              </label>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setDropdownAberto(!dropdownAberto)
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-left bg-white focus:border-green-600 focus:ring-1 focus:ring-green-600 flex items-center justify-between"
              >
                <span className={filtroPluviometro.size > 0 ? 'text-gray-900' : 'text-gray-400'}>
                  {filtroPluviometro.size === 0
                    ? 'Todos'
                    : filtroPluviometro.size === 1
                      ? pluviometrosSelecionados[0]?.pluviometro_nome || '—'
                      : `${filtroPluviometro.size} selecionados`}
                </span>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {dropdownAberto && (
                <div
                  className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg p-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-100">
                    <button
                      onClick={toggleAllPluviometros}
                      className="text-xs text-green-700 hover:text-green-800 font-medium"
                    >
                      {filtroPluviometro.size === (dados?.pluviometros_disponiveis.length ?? 0) ? 'Desmarcar todos' : 'Selecionar todos'}
                    </button>
                  </div>
                  {(dados?.pluviometros_disponiveis || []).map((p) => (
                    <label
                      key={p.pluviometro_id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={filtroPluviometro.has(p.pluviometro_id)}
                        onChange={() => togglePluviometro(p.pluviometro_id)}
                        className="rounded border-gray-300 text-green-600 focus:ring-green-600"
                      />
                      <span className="text-gray-700">
                        {p.pluviometro_nome}
                        {p.pluviometro_localizacao && <span className="text-gray-400"> · {p.pluviometro_localizacao}</span>}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          {temFiltrosAtivos ? (
            <div className="flex items-center justify-end mt-2">
              <button
                onClick={limparFiltros}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Limpar filtros
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Gráfico: chuva diária por pluviômetro + temperatura média */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">
            {temTemperatura ? 'Chuva diária (mm) e temperatura média (°C)' : 'Chuva diária (mm)'}
          </h2>
          {serie.length > 0 ? (
            <ResponsiveContainer width="100%" height={360}>
              <ComposedChart data={serie} margin={{ top: 10, right: 25, left: 0, bottom: 20 }} style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="data_label" tick={{ fontSize: 10, fill: '#666' }} />
                <YAxis
                  yAxisId="mm"
                  tick={{ fontSize: 11, fill: '#666' }}
                  label={{ value: 'mm', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#666' } }}
                />
                {temTemperatura && (
                  <YAxis
                    yAxisId="temp"
                    orientation="right"
                    tick={{ fontSize: 11, fill: TEMP_COLOR }}
                    label={{ value: '°C', angle: 90, position: 'insideRight', style: { fontSize: 11, fill: TEMP_COLOR } }}
                  />
                )}
                <Tooltip
                  formatter={((value: any, name: any) => [
                    name === 'Temperatura média' ? `${fmtNum(Number(value))}°C` : `${fmtNum(Number(value))} mm`,
                    name,
                  ]) as any}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                {nomesPluviometrosComDados.map((nome, idx) => (
                  <Bar
                    key={nome}
                    yAxisId="mm"
                    dataKey={nome}
                    name={nome}
                    fill={PLUV_COLORS[idx % PLUV_COLORS.length]}
                    radius={[3, 3, 0, 0]}
                    barSize={24}
                  />
                ))}
                {temTemperatura && (
                  <Line
                    yAxisId="temp"
                    type="monotone"
                    dataKey="temp_media"
                    name="Temperatura média"
                    stroke={TEMP_COLOR}
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[360px] flex items-center justify-center text-gray-400 text-sm">
              Sem dados para os filtros selecionados
            </div>
          )}
        </div>

        {/* Resumo por pluviômetro */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Resumo por pluviômetro</h2>
          {resumo.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Pluviômetro</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Localização</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Leituras</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Total (mm)</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Média/leitura</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Maior leitura</th>
                    {temTemperatura && (
                      <>
                        <th className="text-right py-2 px-3 font-semibold text-gray-700">Temp. mín</th>
                        <th className="text-right py-2 px-3 font-semibold text-gray-700">Temp. máx</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {resumo.map((r) => (
                    <tr key={r.pluviometro_id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3 font-medium text-gray-900">{r.pluviometro_nome}</td>
                      <td className="py-2 px-3 text-gray-600">{r.pluviometro_localizacao || '—'}</td>
                      <td className="py-2 px-3 text-right text-gray-700">{r.n_medicoes}</td>
                      <td className="py-2 px-3 text-right font-semibold" style={{ color: GREEN_DARK }}>{fmtNum(r.mm_total)} mm</td>
                      <td className="py-2 px-3 text-right text-gray-700">{fmtNum(r.mm_medio)} mm</td>
                      <td className="py-2 px-3 text-right text-gray-700">{fmtNum(r.maior_leitura)} mm</td>
                      {temTemperatura && (
                        <>
                          <td className="py-2 px-3 text-right text-gray-700">{r.temp_min !== null ? `${fmtNum(r.temp_min)}°C` : '—'}</td>
                          <td className="py-2 px-3 text-right text-gray-700">{r.temp_max !== null ? `${fmtNum(r.temp_max)}°C` : '—'}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Sem dados para os filtros selecionados</p>
          )}
        </div>

        {/* Leituras detalhadas */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">
            Leituras detalhadas <span className="text-gray-400 font-normal">({registrosFiltrados.length})</span>
          </h2>
          {registrosFiltrados.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Data</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Horário</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Pluviômetro</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Chuva (mm)</th>
                    {temTemperatura && <th className="text-right py-2 px-3 font-semibold text-gray-700">Temp. (°C)</th>}
                    {temUmidade && <th className="text-right py-2 px-3 font-semibold text-gray-700">Umidade</th>}
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Responsável</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Observação</th>
                  </tr>
                </thead>
                <tbody>
                  {registrosFiltrados.map((r, idx) => (
                    <tr key={`${r.registro_id}-${r.pluviometro_id}-${idx}`} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3 text-gray-900 whitespace-nowrap">{formatarData(r.data)}</td>
                      <td className="py-2 px-3 text-gray-600">{r.horario || '—'}</td>
                      <td className="py-2 px-3 text-gray-900">{r.pluviometro_nome || '—'}</td>
                      <td className="py-2 px-3 text-right font-semibold" style={{ color: GREEN_DARK }}>{fmtNum(r.medicao_mm)}</td>
                      {temTemperatura && <td className="py-2 px-3 text-right text-gray-700">{r.temperatura !== null ? fmtNum(r.temperatura) : '—'}</td>}
                      {temUmidade && <td className="py-2 px-3 text-right text-gray-700">{r.umidade_relativa !== null ? `${fmtNum(r.umidade_relativa, 0)}%` : '—'}</td>}
                      <td className="py-2 px-3 text-gray-700">{r.responsavel || r.nome_usuario || '—'}</td>
                      <td className="py-2 px-3 text-gray-600 max-w-[240px] truncate" title={r.observacao || ''}>{r.observacao || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Sem leituras para os filtros selecionados</p>
          )}
        </div>
      </main>
    </div>
  )
}
