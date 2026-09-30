import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@gestaup/supabase'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ComposedChart, Line, Legend,
} from 'recharts'
import logoManejus from '/images/manejus360.png'
import { gerarRelatorioRodeioPDFPuppeteer } from '../../utils/relatorioRodeioPDFPuppeteer'
import {
  CATEGORIAS_RODEIO,
  alertasDoRegistro,
  calcularResumoRodeio,
  type DadosRelatorioRodeio,
  type RegistroRodeio,
} from '../../features/relatorioRodeio/agregacao'

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
}
.recharts-wrapper, .recharts-bar-rectangle, .recharts-bar-rectangle * {
  outline: none !important;
}
.recharts-active-dot { display: none !important; }
`

const GREEN_DARK = '#0F6437'
const RED = '#c94d46'
const GOLD = '#c28a27'

const CATEGORIA_COLORS: Record<string, string> = {
  vaca: '#0F6437',
  touro: '#1E3A5F',
  bezerro: '#10B981',
  boi: '#c28a27',
  garrote: '#6B7280',
  novilha: '#EC4899',
}

interface RelatorioInfo {
  fazenda_id: string
  titulo: string
  tipo: string
  fazenda_nome?: string
  fazenda_logo_url?: string | null
}

interface Props {
  token: string
  relatorioInfo: RelatorioInfo
}

type Dimensao = 'pasto' | 'lote' | 'usuario'

function formatarNumero(valor: number | null | undefined, casas = 1): string {
  if (valor === null || valor === undefined || isNaN(valor)) return '—'
  return valor.toFixed(casas).replace('.', ',')
}

function formatarInteiro(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || isNaN(valor)) return '—'
  return Math.round(valor).toString()
}

function formatarData(d: string | null | undefined): string {
  if (!d || d === '—') return '—'
  const parts = d.split('-')
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
  return d
}

export function RelatorioRodeioPublico({ token, relatorioInfo }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dados, setDados] = useState<DadosRelatorioRodeio | null>(null)
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')

  // Slicers multi-select (cross-filter no frontend; datas vão ao banco)
  const [filtroPasto, setFiltroPasto] = useState<Set<string>>(new Set())
  const [filtroLote, setFiltroLote] = useState<Set<string>>(new Set())
  const [filtroUsuario, setFiltroUsuario] = useState<Set<string>>(new Set())

  const [dropdownAberto, setDropdownAberto] = useState<Dimensao | null>(null)
  const [exportandoPDF, setExportandoPDF] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const carregarDados = useCallback(async () => {
    if (!token) return
    try {
      setLoading(true)
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('get_dados_relatorio_rodeio', {
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

      setDados(rpcData?.dados as DadosRelatorioRodeio)
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
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownAberto(null)
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
  }, [dados, filtroPasto, filtroLote, filtroUsuario, dataInicio, dataFim])

  const registrosFiltrados = useMemo(() => {
    if (!dados) return []
    return dados.registros.filter((r) => {
      if (filtroPasto.size > 0 && (!r.pasto || !filtroPasto.has(r.pasto))) return false
      if (filtroLote.size > 0 && (!r.lote || !filtroLote.has(r.lote))) return false
      if (filtroUsuario.size > 0 && (!r.nome_usuario || !filtroUsuario.has(r.nome_usuario))) return false
      return true
    })
  }, [dados, filtroPasto, filtroLote, filtroUsuario])

  const resumo = useMemo(() => calcularResumoRodeio(registrosFiltrados), [registrosFiltrados])

  const temFiltrosAtivos =
    filtroPasto.size > 0 || filtroLote.size > 0 || filtroUsuario.size > 0 || Boolean(dataInicio) || Boolean(dataFim)

  const limparFiltros = () => {
    setDataInicio('')
    setDataFim('')
    setFiltroPasto(new Set())
    setFiltroLote(new Set())
    setFiltroUsuario(new Set())
  }

  const getFiltroSet = (dim: Dimensao): Set<string> =>
    dim === 'pasto' ? filtroPasto : dim === 'lote' ? filtroLote : filtroUsuario

  const getOpcoes = (dim: Dimensao): { id: string; label: string }[] => {
    if (!dados) return []
    const lista =
      dim === 'pasto' ? dados.pastos_disponiveis : dim === 'lote' ? dados.lotes_disponiveis : dados.usuarios_disponiveis
    return (lista ?? []).map((nome) => ({ id: nome, label: nome }))
  }

  const getLabelDim = (dim: Dimensao): string =>
    dim === 'pasto' ? 'Pasto' : dim === 'lote' ? 'Lote' : 'Usuário'

  const toggleItem = (dim: Dimensao, valor: string) => {
    const setter = dim === 'pasto' ? setFiltroPasto : dim === 'lote' ? setFiltroLote : setFiltroUsuario
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(valor)) next.delete(valor)
      else next.add(valor)
      return next
    })
  }

  const toggleAll = (dim: Dimensao, valores: string[]) => {
    const setter = dim === 'pasto' ? setFiltroPasto : dim === 'lote' ? setFiltroLote : setFiltroUsuario
    const atual = getFiltroSet(dim)
    setter(atual.size === valores.length ? new Set() : new Set(valores))
  }

  const limparDimensao = (dim: Dimensao) => {
    const setter = dim === 'pasto' ? setFiltroPasto : dim === 'lote' ? setFiltroLote : setFiltroUsuario
    setter(new Set())
  }

  const exportarPDF = async () => {
    if (!dados || registrosFiltrados.length === 0) return
    try {
      setExportandoPDF(true)
      const datas = registrosFiltrados.map((r) => r.data).sort()
      const blob = await gerarRelatorioRodeioPDFPuppeteer({
        dataInicio: dataInicio || datas[0] || '',
        dataFim: dataFim || datas[datas.length - 1] || '',
        fazendaNome: relatorioInfo.fazenda_nome || '',
        fazendaLogoUrl: relatorioInfo.fazenda_logo_url,
        resumo,
        registros: registrosFiltrados,
      })

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const nomeFazenda = relatorioInfo.fazenda_nome || 'Fazenda'
      link.download = `Gesta'Up - Relatório de Rodeio ${nomeFazenda}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Erro ao exportar PDF com Puppeteer:', err)
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

  const renderDropdown = (dim: Dimensao) => {
    const opcoes = getOpcoes(dim)
    const selecionados = getFiltroSet(dim)
    return (
      <div
        className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-100">
          <button
            onClick={() => toggleAll(dim, opcoes.map((o) => o.id))}
            className="text-xs text-green-700 hover:text-green-800 font-medium"
          >
            {selecionados.size === opcoes.length && opcoes.length > 0 ? 'Desmarcar todos' : 'Selecionar todos'}
          </button>
          {selecionados.size > 0 && (
            <button onClick={() => limparDimensao(dim)} className="text-xs text-gray-500 hover:text-gray-700">
              Limpar ({selecionados.size})
            </button>
          )}
        </div>
        {opcoes.length === 0 ? (
          <p className="text-xs text-gray-400 px-2 py-2">Nenhum disponível.</p>
        ) : (
          opcoes.map((o) => (
            <label key={o.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={selecionados.has(o.id)}
                onChange={() => toggleItem(dim, o.id)}
                className="rounded border-gray-300 text-green-600 focus:ring-green-600"
              />
              <span className="text-gray-700">{o.label}</span>
            </label>
          ))
        )}
      </div>
    )
  }

  const renderSlicer = (dim: Dimensao) => {
    const selecionados = getFiltroSet(dim)
    const opcoes = getOpcoes(dim)
    const label = getLabelDim(dim)
    const displayLabel =
      selecionados.size === 0
        ? 'Todos'
        : selecionados.size === 1
          ? opcoes.find((o) => selecionados.has(o.id))?.label ?? '1 selecionado'
          : `${selecionados.size} selecionados`
    return (
      <div key={dim} className="relative" ref={dropdownAberto === dim ? dropdownRef : undefined}>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          {label} {selecionados.size > 0 && <span style={{ color: GREEN_DARK }}>● {selecionados.size}</span>}
        </label>
        <button
          onClick={() => setDropdownAberto(dropdownAberto === dim ? null : dim)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-left bg-white focus:border-green-600 focus:ring-1 focus:ring-green-600 flex items-center justify-between"
        >
          <span className={selecionados.size > 0 ? 'text-gray-900' : 'text-gray-400'}>{displayLabel}</span>
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {dropdownAberto === dim && renderDropdown(dim)}
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
                {relatorioInfo?.titulo || 'Rodeio'}
              </h2>
              {relatorioInfo?.fazenda_nome && (
                <p className="text-[10px] text-gray-500 leading-tight">{relatorioInfo.fazenda_nome}</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {relatorioInfo?.fazenda_logo_url && (
                <div className="bg-white rounded-lg p-1 flex items-center justify-center">
                  <img
                    src={relatorioInfo.fazenda_logo_url}
                    alt={relatorioInfo?.fazenda_nome || 'Fazenda'}
                    className="h-8 w-auto max-w-[80px] object-contain"
                  />
                </div>
              )}
              <button
                onClick={exportarPDF}
                disabled={exportandoPDF || registrosFiltrados.length === 0}
                className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                style={{ color: GREEN_DARK, borderColor: GREEN_DARK }}
                title="Baixar relatório em PDF"
              >
                {exportandoPDF ? 'Gerando...' : 'Baixar PDF'}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Slicers */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
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
            {(['pasto', 'lote', 'usuario'] as Dimensao[]).map(renderSlicer)}
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-gray-400">{registrosFiltrados.length} registro(s) no período.</p>
            {temFiltrosAtivos && (
              <button onClick={limparFiltros} className="text-xs text-gray-500 hover:text-gray-700 underline">
                Limpar filtros
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {registrosFiltrados.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <p className="text-gray-500">Nenhum registro de rodeio encontrado para os filtros selecionados.</p>
          </div>
        ) : (
          <>
            {/* Insights automáticos */}
            {resumo.insights && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <svg className="w-5 h-5" style={{ color: GREEN_DARK }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{resumo.insights}</p>
                </div>
              </div>
            )}

            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <p className="text-2xl font-bold" style={{ color: GREEN_DARK }}>{formatarInteiro(resumo.total_rodeios)}</p>
                <p className="text-xs text-gray-600 mt-1">Rodeios realizados</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <p className="text-2xl font-bold" style={{ color: GREEN_DARK }}>{formatarInteiro(resumo.cabecas_contadas)}</p>
                <p className="text-xs text-gray-600 mt-1">Cabeças contadas</p>
                <p className="text-[10px] text-gray-400 mt-1">Média: {formatarNumero(resumo.media_cabecas, 0)} por rodeio</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <p className="text-2xl font-bold" style={{ color: GREEN_DARK }}>{formatarNumero(resumo.escore_gado_medio, 1)}</p>
                <p className="text-xs text-gray-600 mt-1">Escore médio do gado</p>
                <p className="text-[10px] text-gray-400 mt-1">Fezes: {formatarNumero(resumo.escore_fezes_medio, 1)}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <p className="text-2xl font-bold" style={{ color: resumo.alertas_sanitarios > 0 ? RED : GREEN_DARK }}>
                  {formatarInteiro(resumo.alertas_sanitarios + resumo.pendencias_infra)}
                </p>
                <p className="text-xs text-gray-600 mt-1">Alertas de diagnóstico</p>
                <p className="text-[10px] text-gray-400 mt-1">
                  {formatarInteiro(resumo.alertas_sanitarios)} sanitários · {formatarInteiro(resumo.pendencias_infra)} infra ·{' '}
                  {formatarInteiro(resumo.rodeios_com_alerta)} rodeio(s)
                </p>
              </div>
            </div>

            {/* Gráficos: cabeças por dia + escore */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-1">Cabeças contadas por dia</h3>
                <p className="text-[10px] text-gray-400 mb-3">Composição por categoria</p>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={resumo.serie_diaria} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="data_label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    {CATEGORIAS_RODEIO.map((cat) => (
                      <Bar key={cat.key} dataKey={cat.key} name={cat.label} stackId="cabecas" fill={CATEGORIA_COLORS[cat.key]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-1">Escore médio por dia</h3>
                <p className="text-[10px] text-gray-400 mb-3">Condição corporal (gado) e digestiva (fezes), escala 1 a 5</p>
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={resumo.serie_diaria} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="data_label" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 5]} tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="escore_medio" name="Escore gado" stroke={GREEN_DARK} strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
                    <Line type="monotone" dataKey="escore_fezes_medio" name="Escore fezes" stroke={GOLD} strokeWidth={2.5} strokeDasharray="6 3" dot={{ r: 4 }} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Alertas por diagnóstico */}
            {resumo.frequencia_alertas.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-1">Alertas por diagnóstico</h3>
                <p className="text-[10px] text-gray-400 mb-3">Quantas vezes cada item saiu do padrão esperado no período</p>
                <ResponsiveContainer width="100%" height={Math.max(120, resumo.frequencia_alertas.length * 40)}>
                  <BarChart data={resumo.frequencia_alertas} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="label" width={220} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="valor" name="Ocorrências" fill={RED} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Resumo por lote e por pasto */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {resumo.por_lote.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Resumo por lote</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-2 font-medium text-gray-500">Lote</th>
                          <th className="text-right py-2 font-medium text-gray-500">Rodeios</th>
                          <th className="text-right py-2 font-medium text-gray-500">Última contagem</th>
                          <th className="text-right py-2 font-medium text-gray-500">Escore médio</th>
                          <th className="text-right py-2 font-medium text-gray-500">Alertas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resumo.por_lote.map((l) => (
                          <tr key={l.nome} className="border-b border-gray-100">
                            <td className="py-2 font-medium text-gray-800">{l.nome}</td>
                            <td className="py-2 text-right text-gray-600">{l.rodeios}</td>
                            <td className="py-2 text-right text-gray-600">
                              {l.cabecas_ultima != null ? `${formatarInteiro(l.cabecas_ultima)}` : '—'}
                              {l.data_ultima && <span className="text-gray-400 text-xs"> ({formatarData(l.data_ultima)})</span>}
                            </td>
                            <td className="py-2 text-right text-gray-600">{formatarNumero(l.escore_medio, 1)}</td>
                            <td className="py-2 text-right">
                              <span className={l.alertas > 0 ? 'font-medium' : 'text-gray-400'} style={l.alertas > 0 ? { color: RED } : undefined}>
                                {l.alertas}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {resumo.por_pasto.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Resumo por pasto</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-2 font-medium text-gray-500">Pasto</th>
                          <th className="text-right py-2 font-medium text-gray-500">Rodeios</th>
                          <th className="text-right py-2 font-medium text-gray-500">Última contagem</th>
                          <th className="text-right py-2 font-medium text-gray-500">Escore médio</th>
                          <th className="text-right py-2 font-medium text-gray-500">Alertas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resumo.por_pasto.map((p) => (
                          <tr key={p.nome} className="border-b border-gray-100">
                            <td className="py-2 font-medium text-gray-800">{p.nome}</td>
                            <td className="py-2 text-right text-gray-600">{p.rodeios}</td>
                            <td className="py-2 text-right text-gray-600">
                              {p.cabecas_ultima != null ? `${formatarInteiro(p.cabecas_ultima)}` : '—'}
                              {p.data_ultima && <span className="text-gray-400 text-xs"> ({formatarData(p.data_ultima)})</span>}
                            </td>
                            <td className="py-2 text-right text-gray-600">{formatarNumero(p.escore_medio, 1)}</td>
                            <td className="py-2 text-right">
                              <span className={p.alertas > 0 ? 'font-medium' : 'text-gray-400'} style={p.alertas > 0 ? { color: RED } : undefined}>
                                {p.alertas}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Detalhamento */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Registros detalhados</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 font-medium text-gray-500">Data</th>
                      <th className="text-left py-2 font-medium text-gray-500">Usuário</th>
                      <th className="text-left py-2 font-medium text-gray-500">Pasto</th>
                      <th className="text-left py-2 font-medium text-gray-500">Lote</th>
                      <th className="text-right py-2 font-medium text-gray-500">Vac</th>
                      <th className="text-right py-2 font-medium text-gray-500">Tou</th>
                      <th className="text-right py-2 font-medium text-gray-500">Bez</th>
                      <th className="text-right py-2 font-medium text-gray-500">Boi</th>
                      <th className="text-right py-2 font-medium text-gray-500">Gar</th>
                      <th className="text-right py-2 font-medium text-gray-500">Nov</th>
                      <th className="text-right py-2 font-medium text-gray-500">Total</th>
                      <th className="text-right py-2 font-medium text-gray-500">Esc. gado</th>
                      <th className="text-right py-2 font-medium text-gray-500">Esc. fezes</th>
                      <th className="text-left py-2 font-medium text-gray-500">Equipe</th>
                      <th className="text-left py-2 font-medium text-gray-500">Alertas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registrosFiltrados.map((r: RegistroRodeio) => {
                      const alertas = alertasDoRegistro(r.diagnosticos)
                      const equipe = Array.isArray(r.equipe_nomes) && r.equipe_nomes.length ? r.equipe_nomes.join(', ') : r.equipe != null ? String(r.equipe) : '—'
                      return (
                        <tr key={r.registro_id} className="border-b border-gray-100">
                          <td className="py-2 text-gray-800 whitespace-nowrap">{formatarData(r.data)}</td>
                          <td className="py-2 text-gray-600">{r.nome_usuario || '—'}</td>
                          <td className="py-2 text-gray-600">{r.pasto || '—'}</td>
                          <td className="py-2 text-gray-600">{r.lote || '—'}</td>
                          <td className="py-2 text-right text-gray-600">{r.vaca ?? '—'}</td>
                          <td className="py-2 text-right text-gray-600">{r.touro ?? '—'}</td>
                          <td className="py-2 text-right text-gray-600">{r.bezerro ?? '—'}</td>
                          <td className="py-2 text-right text-gray-600">{r.boi ?? '—'}</td>
                          <td className="py-2 text-right text-gray-600">{r.garrote ?? '—'}</td>
                          <td className="py-2 text-right text-gray-600">{r.novilha ?? '—'}</td>
                          <td className="py-2 text-right font-medium text-gray-800">{r.total_cabecas ?? '—'}</td>
                          <td className="py-2 text-right text-gray-600">{r.escore_gado != null ? formatarNumero(r.escore_gado, 1) : '—'}</td>
                          <td className="py-2 text-right text-gray-600">{r.escore_fezes ?? '—'}</td>
                          <td className="py-2 text-gray-600">{equipe}</td>
                          <td className="py-2">
                            {alertas.length === 0 ? (
                              <span className="text-gray-400">—</span>
                            ) : (
                              alertas.map((a) => (
                                <div key={a.key}>
                                  <span className="font-medium" style={{ color: RED }}>{a.label}</span>
                                  {a.observacao && <span className="block text-[11px] text-gray-400">{a.observacao}</span>}
                                </div>
                              ))
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
