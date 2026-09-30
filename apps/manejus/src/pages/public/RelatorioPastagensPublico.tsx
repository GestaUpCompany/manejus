import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@gestaup/supabase'
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts'
import logoManejus from '/images/manejus360.png'
import { ordenarPeriodo } from '../../features/relatorioGeral/periodo'
import { gerarRelatorioPastagensPDFPuppeteer } from '../../utils/relatorioPastagensPDFPuppeteer'
import {
  alertasDoRegistro,
  abreviarNome,
  calcularResumoPastagens,
  composicaoPastagem,
  listaAlertasPastagens,
  mapaOcupacaoPorPasto,
  normalizarNomesPasto,
  plural,
  totalAnimaisRegistro,
  type DadosRelatorioPastagens,
  type RegistroPastagem,
} from '../../features/relatorioPastagens/agregacao'

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
const BLUE = '#1E3A5F'
const RED = '#c94d46'
const GOLD = '#c28a27'

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

type Dimensao = 'pasto' | 'lote' | 'responsavel' | 'modulo'

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

function alertasCell(registro: RegistroPastagem) {
  const alertas = alertasDoRegistro(registro.avaliacao_geral)
  if (!alertas.length) return <span className="text-gray-400">—</span>
  return (
    <div className="space-y-0.5">
      {alertas.map((a) => (
        <div key={a.key} className="text-xs">
          <span className="font-medium" style={{ color: RED }}>{a.label}</span>
          {a.observacao && <span className="text-gray-500 block">{a.observacao}</span>}
        </div>
      ))}
    </div>
  )
}

export function RelatorioPastagensPublico({ token, relatorioInfo }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dados, setDados] = useState<DadosRelatorioPastagens | null>(null)
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')

  // Slicers multi-select (cross-filter no frontend; datas vão ao banco)
  const [filtroPasto, setFiltroPasto] = useState<Set<string>>(new Set())
  const [filtroLote, setFiltroLote] = useState<Set<string>>(new Set())
  const [filtroResponsavel, setFiltroResponsavel] = useState<Set<string>>(new Set())
  const [filtroModulo, setFiltroModulo] = useState<Set<string>>(new Set())

  const [dropdownAberto, setDropdownAberto] = useState<Dimensao | null>(null)
  const [exportandoPDF, setExportandoPDF] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const carregarDados = useCallback(async () => {
    if (!token) return
    try {
      setLoading(true)
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('get_dados_relatorio_pastagens', {
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

      const dadosRpc = rpcData?.dados as DadosRelatorioPastagens
      // Resolve grafias divergentes ("volta de cima A", "PV - 01") para
      // o nome cadastral antes de qualquer filtro/agregação.
      if (dadosRpc) {
        const norm = normalizarNomesPasto(
          dadosRpc.registros ?? [],
          dadosRpc.ocupacoes ?? [],
          dadosRpc.ocupacoes_contexto ?? [],
          dadosRpc.pastos_info ?? [],
          dadosRpc.lotes_disponiveis ?? [],
        )
        dadosRpc.registros = norm.registros
        dadosRpc.ocupacoes = norm.ocupacoes
        dadosRpc.ocupacoes_contexto = norm.ocupacoesContexto
      }
      setDados(dadosRpc)
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
  }, [dados, filtroPasto, filtroLote, filtroResponsavel, filtroModulo, dataInicio, dataFim])

  // O filtro de pasto casa com qualquer lado da movimentação (saída ou
  // entrada); idem módulo. Lote e responsável filtram direto.
  const registrosFiltrados = useMemo(() => {
    if (!dados) return []
    return dados.registros.filter((r) => {
      if (filtroPasto.size > 0 && !filtroPasto.has(r.pasto_saida || '') && !filtroPasto.has(r.pasto_entrada || '')) return false
      if (filtroLote.size > 0 && (!r.lote || !filtroLote.has(r.lote))) return false
      if (filtroResponsavel.size > 0 && (!r.responsavel || !filtroResponsavel.has(r.responsavel))) return false
      if (filtroModulo.size > 0 && !filtroModulo.has(r.modulo_saida || '') && !filtroModulo.has(r.modulo_entrada || '')) return false
      return true
    })
  }, [dados, filtroPasto, filtroLote, filtroResponsavel, filtroModulo])

  // Ocupação não tem responsável: os mesmos slicers de pasto/lote/módulo
  // filtram o histórico para os KPIs e tabelas ficarem consistentes.
  const ocupacoesFiltradas = useMemo(() => {
    if (!dados) return []
    return dados.ocupacoes.filter((o) => {
      if (filtroPasto.size > 0 && (!o.pasto || !filtroPasto.has(o.pasto))) return false
      if (filtroLote.size > 0 && (!o.lote || !filtroLote.has(o.lote))) return false
      if (filtroModulo.size > 0 && (!o.modulo || !filtroModulo.has(o.modulo))) return false
      return true
    })
  }, [dados, filtroPasto, filtroLote, filtroModulo])

  // Contexto de descanso: ocupações encerradas ANTES do período (não
  // entram em tabelas nem KPIs). Os mesmos slicers filtram para manter a
  // leitura consistente quando o usuário recorta por pasto/lote/módulo.
  const ocupacoesContextoFiltradas = useMemo(() => {
    if (!dados) return []
    return (dados.ocupacoes_contexto ?? []).filter((o) => {
      if (filtroPasto.size > 0 && (!o.pasto || !filtroPasto.has(o.pasto))) return false
      if (filtroLote.size > 0 && (!o.lote || !filtroLote.has(o.lote))) return false
      if (filtroModulo.size > 0 && (!o.modulo || !filtroModulo.has(o.modulo))) return false
      return true
    })
  }, [dados, filtroPasto, filtroLote, filtroModulo])

  const resumo = useMemo(
    () => calcularResumoPastagens(registrosFiltrados, ocupacoesFiltradas, dados?.pastos_info ?? [], ocupacoesContextoFiltradas),
    [registrosFiltrados, ocupacoesFiltradas, ocupacoesContextoFiltradas, dados],
  )

  const alertasPeriodo = useMemo(() => listaAlertasPastagens(registrosFiltrados), [registrosFiltrados])

  const dadosUaPorPasto = useMemo(
    () =>
      resumo.por_pasto
        .filter((p) => p.ua_ha_media != null && p.ua_ha_media > 0)
        .sort((a, b) => (b.ua_ha_media ?? 0) - (a.ua_ha_media ?? 0))
        .slice(0, 12),
    [resumo],
  )

  // Pastos cadastrados sem nenhuma ocupação na janela (vem do resumo,
  // que cruza pastos_info com os pastos usados): candidatos a reforma,
  // feno ou entrada no rodízio.
  const pastosSemUso = resumo.pastos_sem_uso

  const mapa = useMemo(
    () => mapaOcupacaoPorPasto(ocupacoesFiltradas, dataFim || null),
    [ocupacoesFiltradas, dataFim],
  )

  // Escala horizontal do Gantt: dia inicial, total de dias e ticks dd/mm.
  const mapaEscala = useMemo(() => {
    if (!mapa.inicio || !mapa.fim) return null
    const t0 = Date.parse(`${mapa.inicio}T00:00:00Z`)
    const t1 = Date.parse(`${mapa.fim}T00:00:00Z`)
    const span = Math.max(1, t1 - t0)
    const fmt = (t: number) => {
      const d = new Date(t)
      return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    }
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ pct: f * 100, label: fmt(t0 + span * f) }))
    return {
      ticks,
      left: (iso: string) => ((Date.parse(`${iso}T00:00:00Z`) - t0) / span) * 100,
      width: (inicio: string, fim: string) =>
        Math.max(0.8, ((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`) + 86400000) / span) * 100),
    }
  }, [mapa])

  const temFiltrosAtivos =
    filtroPasto.size > 0 || filtroLote.size > 0 || filtroResponsavel.size > 0 || filtroModulo.size > 0 || Boolean(dataInicio) || Boolean(dataFim)

  const limparFiltros = () => {
    setDataInicio('')
    setDataFim('')
    setFiltroPasto(new Set())
    setFiltroLote(new Set())
    setFiltroResponsavel(new Set())
    setFiltroModulo(new Set())
  }

  const getFiltroSet = (dim: Dimensao): Set<string> =>
    dim === 'pasto' ? filtroPasto : dim === 'lote' ? filtroLote : dim === 'responsavel' ? filtroResponsavel : filtroModulo

  const getSetter = (dim: Dimensao) =>
    dim === 'pasto' ? setFiltroPasto : dim === 'lote' ? setFiltroLote : dim === 'responsavel' ? setFiltroResponsavel : setFiltroModulo

  const getOpcoes = (dim: Dimensao): { id: string; label: string }[] => {
    if (!dados) return []
    const lista =
      dim === 'pasto'
        ? dados.pastos_disponiveis
        : dim === 'lote'
          ? dados.lotes_disponiveis
          : dim === 'responsavel'
            ? dados.responsaveis_disponiveis
            : dados.modulos_disponiveis
    return (lista ?? []).map((nome) => ({ id: nome, label: nome }))
  }

  const getLabelDim = (dim: Dimensao): string =>
    dim === 'pasto' ? 'Pasto' : dim === 'lote' ? 'Lote' : dim === 'responsavel' ? 'Manejador' : 'Módulo'

  const toggleItem = (dim: Dimensao, valor: string) => {
    getSetter(dim)((prev) => {
      const next = new Set(prev)
      if (next.has(valor)) next.delete(valor)
      else next.add(valor)
      return next
    })
  }

  const toggleAll = (dim: Dimensao, valores: string[]) => {
    const atual = getFiltroSet(dim)
    getSetter(dim)(atual.size === valores.length ? new Set() : new Set(valores))
  }

  const limparDimensao = (dim: Dimensao) => {
    getSetter(dim)(new Set())
  }

  const exportarPDF = async () => {
    if (!dados || (registrosFiltrados.length === 0 && ocupacoesFiltradas.length === 0)) return
    try {
      setExportandoPDF(true)
      const datas = [
        ...registrosFiltrados.map((r) => r.data),
        ...ocupacoesFiltradas.map((o) => o.data_entrada),
      ].sort()
      const di = dataInicio || datas[0] || ''
      const df = dataFim || datas[datas.length - 1] || ''
      const [diOk, dfOk] = ordenarPeriodo(di, df)
      const blob = await gerarRelatorioPastagensPDFPuppeteer({
        dataInicio: diOk,
        dataFim: dfOk,
        fazendaNome: relatorioInfo.fazenda_nome || '',
        fazendaLogoUrl: relatorioInfo.fazenda_logo_url,
        resumo,
        registros: registrosFiltrados,
        ocupacoes: ocupacoesFiltradas,
        ocupacoesContexto: ocupacoesContextoFiltradas,
      })

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const nomeFazenda = relatorioInfo.fazenda_nome || 'Fazenda'
      link.download = `Gesta'Up - Relatório de Manejo de Pastagens ${nomeFazenda}.pdf`
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

  const semDados = registrosFiltrados.length === 0 && ocupacoesFiltradas.length === 0

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
                {relatorioInfo?.titulo || 'Manejo de Pastagens'}
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
                disabled={exportandoPDF || semDados}
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data início</label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => {
                  const [ini, fim] = ordenarPeriodo(e.target.value, dataFim)
                  setDataInicio(ini)
                  setDataFim(fim)
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:ring-1 focus:ring-green-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data fim</label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => {
                  const [ini, fim] = ordenarPeriodo(dataInicio, e.target.value)
                  setDataInicio(ini)
                  setDataFim(fim)
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:ring-1 focus:ring-green-600"
              />
            </div>
            {(['pasto', 'lote', 'responsavel', 'modulo'] as Dimensao[]).map(renderSlicer)}
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-gray-400">
              {registrosFiltrados.length} {plural(registrosFiltrados.length, 'movimentação', 'movimentações')} · {ocupacoesFiltradas.length} {plural(ocupacoesFiltradas.length, 'período', 'períodos')} de ocupação.
            </p>
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
        {semDados ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <p className="text-gray-500">Nenhum registro de manejo de pastagens encontrado para os filtros selecionados.</p>
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
                <p className="text-2xl font-bold" style={{ color: GREEN_DARK }}>{formatarInteiro(resumo.total_movimentacoes)}</p>
                <p className="text-xs text-gray-600 mt-1">Movimentações de pasto</p>
                <p className="text-[10px] text-gray-400 mt-1">{formatarInteiro(resumo.lotes_movimentados)} {plural(resumo.lotes_movimentados, 'lote', 'lotes')} · {formatarInteiro(resumo.pastos_utilizados)} {plural(resumo.pastos_utilizados, 'pasto', 'pastos')}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <p className="text-2xl font-bold" style={{ color: GREEN_DARK }}>{formatarInteiro(resumo.animais_manejados)}</p>
                <p className="text-xs text-gray-600 mt-1">Animais manejados</p>
                <p className="text-[10px] text-gray-400 mt-1">Escore gado: {formatarNumero(resumo.escore_gado_medio, 1)}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <p className="text-2xl font-bold" style={{ color: GREEN_DARK }}>{formatarNumero(resumo.ocupacao_media_dias, 1)}</p>
                <p className="text-xs text-gray-600 mt-1">Ocupação média (dias)</p>
                <p className="text-[10px] text-gray-400 mt-1">
                  UA/ha: {formatarNumero(resumo.taxa_lotacao_media_ua_ha, 2)} · {formatarInteiro(resumo.ocupacoes_em_andamento)} em andamento
                </p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <p className="text-2xl font-bold" style={{ color: resumo.alertas_sanitarios + resumo.pendencias_infra + resumo.ocupacoes_acima_meta > 0 ? RED : GREEN_DARK }}>
                  {formatarInteiro(resumo.alertas_sanitarios + resumo.pendencias_infra)}
                </p>
                <p className="text-xs text-gray-600 mt-1">Alertas de diagnóstico</p>
                <p className="text-[10px] text-gray-400 mt-1">
                  {formatarInteiro(resumo.alertas_sanitarios)} sanitários · {formatarInteiro(resumo.pendencias_infra)} infra · {formatarInteiro(resumo.ocupacoes_acima_meta)} acima da meta
                </p>
              </div>
            </div>

            {/* Gráficos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 lg:col-span-2">
                <h2 className="text-sm font-semibold text-gray-900 mb-1">Mapa de ocupação</h2>
                <p className="text-xs text-gray-500 mb-4">Períodos com gado em cada pasto; os vazios são o descanso</p>
                {mapa.linhas.length > 0 && mapaEscala ? (
                  <div>
                    <div className="flex items-center">
                      <div className="w-36 shrink-0" />
                      <div className="relative flex-1 h-4 text-[10px] text-gray-400">
                        {mapaEscala.ticks.map((t) => (
                          <span key={t.pct} className="absolute" style={{ left: `${t.pct}%`, transform: 'translateX(-50%)' }}>{t.label}</span>
                        ))}
                      </div>
                    </div>
                    <div className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                      {mapa.linhas.map((linha, li) => (
                        <div key={linha.pasto} className={`flex items-center h-7 ${li % 2 === 0 ? 'bg-gray-50/70' : ''}`}>
                          <div className="w-36 shrink-0 pr-2 text-xs text-gray-700 truncate" title={linha.pasto}>{linha.pasto}</div>
                          <div className="relative flex-1 h-4 border-l border-r border-gray-100">
                            {linha.barras.map((b, i) => (
                              <div
                                key={i}
                                className="absolute top-0 h-full rounded-sm"
                                title={`${b.inicio.split('-').reverse().join('/')} → ${b.fim.split('-').reverse().join('/')}${b.lote ? ` · ${b.lote}` : ''}${b.aberta ? ' · em andamento' : ''}`}
                                style={{
                                  left: `${mapaEscala.left(b.inicio)}%`,
                                  width: `${mapaEscala.width(b.inicio, b.fim)}%`,
                                  ...(b.aberta
                                    ? { backgroundColor: BLUE }
                                    : {
                                        // Hachura + cor: em impressão P&B a diferença
                                        // sólido vs listrado continua legível.
                                        background: `repeating-linear-gradient(45deg, transparent 0, transparent 3px, ${GOLD} 3px, ${GOLD} 5px)`,
                                        border: `1px solid ${GOLD}`,
                                      }),
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-4 mt-3 text-[11px] text-gray-500">
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-3 rounded-sm border" style={{ borderColor: GOLD, background: `repeating-linear-gradient(45deg, transparent 0, transparent 2px, ${GOLD} 2px, ${GOLD} 4px)` }} />Encerrada
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: BLUE }} />Em andamento
                      </span>
                      {mapa.pastosOmitidos > 0 && <span>+ {mapa.pastosOmitidos} {plural(mapa.pastosOmitidos, 'pasto não exibido', 'pastos não exibidos')}</span>}
                      {pastosSemUso > 0 && <span>{pastosSemUso} {plural(pastosSemUso, 'pasto', 'pastos')} sem ocupação no período</span>}
                      {resumo.area_utilizada_pct != null && <span>{formatarNumero(resumo.area_utilizada_pct, 0)}% da área utilizada</span>}
                    </div>
                  </div>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-gray-400 text-sm">Sem ocupações no período</div>
                )}
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-1">Condição do pasto: entrada × saída</h2>
                <p className="text-xs text-gray-500 mb-4">Avaliação média 1–5 ao receber e ao liberar o gado; ordenado pelo pior na saída</p>
                {resumo.degradacao.some((d) => d.avaliacao_saida_media != null || d.avaliacao_entrada_media != null) ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={resumo.degradacao.filter((d) => d.avaliacao_saida_media != null || d.avaliacao_entrada_media != null).slice(0, 12)}
                      layout="vertical"
                      margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" domain={[0, 5]} tick={{ fontSize: 11, fill: '#666' }} />
                      <YAxis type="category" dataKey="nome" tick={{ fontSize: 10, fill: '#666' }} width={130} />
                      <Tooltip
                        formatter={(value: any, name: any) => [formatarNumero(Number(value), 1), name === 'avaliacao_entrada_media' ? 'Entrada' : 'Saída']}
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <ReferenceLine x={3} stroke="#9ca3af" strokeDasharray="4 4" />
                      <Bar dataKey="avaliacao_entrada_media" name="Entrada" fill="#9CB4A8" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="avaliacao_saida_media" name="Saída" radius={[0, 4, 4, 0]}>
                        {resumo.degradacao.filter((d) => d.avaliacao_saida_media != null || d.avaliacao_entrada_media != null).slice(0, 12).map((d, i) => (
                          <Cell key={i} fill={(d.avaliacao_saida_media ?? 0) < 3 ? RED : GREEN_DARK} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-gray-400 text-sm">Sem avaliações suficientes no período</div>
                )}
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-1">Descanso entre ocupações</h2>
                <p className="text-xs text-gray-500 mb-4">Dias médios sem gado entre um período e o seguinte no mesmo pasto</p>
                {resumo.descanso.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={resumo.descanso.slice(0, 12)} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#666' }} allowDecimals={false} />
                      <YAxis type="category" dataKey="nome" tick={{ fontSize: 10, fill: '#666' }} width={130} />
                      <Tooltip
                        formatter={(value: any, _name: any, item: any) => [
                          `${formatarNumero(Number(value), 0)} dias (menor: ${formatarInteiro(item?.payload?.menor_descanso)} · ${formatarInteiro(item?.payload?.intervalos)} ${plural(item?.payload?.intervalos ?? 0, 'intervalo', 'intervalos')})`,
                          'Descanso médio',
                        ]}
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                      />
                      <Bar dataKey="descanso_medio" name="Dias de descanso" fill={GREEN_DARK} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-gray-400 text-sm">Nenhum pasto com duas ocupações no período</div>
                )}
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-1">Taxa de lotação por pasto</h2>
                <p className="text-xs text-gray-500 mb-4">UA/ha média das ocupações no período</p>
                {dadosUaPorPasto.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={dadosUaPorPasto} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="nome" tick={{ fontSize: 10, fill: '#666' }} angle={-25} textAnchor="end" height={55} />
                      <YAxis tick={{ fontSize: 11, fill: '#666' }} />
                      <Tooltip
                        formatter={(value: any) => [`${formatarNumero(Number(value), 2)} UA/ha`, 'Taxa média']}
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                      />
                      {resumo.taxa_lotacao_media_ua_ha != null && (
                        <ReferenceLine
                          y={resumo.taxa_lotacao_media_ua_ha}
                          stroke="#9ca3af"
                          strokeDasharray="4 4"
                          label={{ value: `média ${formatarNumero(resumo.taxa_lotacao_media_ua_ha, 2)}`, position: 'insideTopRight', fontSize: 9, fill: '#6b7280' }}
                        />
                      )}
                      <Bar dataKey="ua_ha_media" name="UA/ha" fill={BLUE} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-gray-400 text-sm">Sem ocupações no período</div>
                )}
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-1">Alertas por diagnóstico</h2>
                <p className="text-xs text-gray-500 mb-4">Quantas vezes cada item saiu do padrão esperado</p>
                {resumo.frequencia_alertas.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={resumo.frequencia_alertas} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#666' }} allowDecimals={false} />
                      <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: '#666' }} width={150} />
                      <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }} />
                      <Bar dataKey="valor" name="Alertas" fill={RED} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-gray-400 text-sm">Nenhum alerta no período</div>
                )}
              </div>
            </div>

            {/* Alertas do período */}
            {alertasPeriodo.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-4">Alertas do período</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Data</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Trajeto</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Lote</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Diagnóstico</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Observação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {alertasPeriodo.map((a, i) => (
                        <tr key={i}>
                          <td className="px-4 py-2 whitespace-nowrap">{formatarData(a.data)}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{a.trajeto}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{a.lote}</td>
                          <td className="px-4 py-2" style={{ color: RED }}>{a.label}</td>
                          <td className="px-4 py-2 text-gray-500">{a.observacao || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Resumo por pasto */}
            {resumo.por_pasto.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-4">Resumo por pasto</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Pasto</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Módulo</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Área (ha)</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Entradas</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Saídas</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Aval. média</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Ocupação (dias)</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">UA/ha</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Desvio</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Alertas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {resumo.por_pasto.map((p) => (
                        <tr key={p.nome}>
                          <td className="px-4 py-2 font-medium whitespace-nowrap">{p.nome}</td>
                          <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{p.modulo || '—'}</td>
                          <td className="px-4 py-2 text-right">{p.area_util_ha != null ? formatarNumero(p.area_util_ha, 1) : '—'}</td>
                          <td className="px-4 py-2 text-right">{p.entradas || '—'}</td>
                          <td className="px-4 py-2 text-right">{p.saidas || '—'}</td>
                          <td className="px-4 py-2 text-right">{formatarNumero(p.avaliacao_media, 1)}</td>
                          <td className="px-4 py-2 text-right">{formatarNumero(p.ocupacao_dias_media, 1)}</td>
                          <td className="px-4 py-2 text-right">{formatarNumero(p.ua_ha_media, 2)}</td>
                          <td className="px-4 py-2 text-right" style={{ color: (p.desvio_medio_percent ?? 0) > 0 ? RED : undefined }}>
                            {p.desvio_medio_percent != null ? `${formatarNumero(p.desvio_medio_percent, 0)}%` : '—'}
                          </td>
                          <td className="px-4 py-2 text-right" style={{ color: p.alertas > 0 ? RED : undefined }}>{p.alertas || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Histórico de ocupação */}
            {ocupacoesFiltradas.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-4">Histórico de ocupação no período</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Lote</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Pasto</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Módulo</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Entrada</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Saída</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Dias</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Cab.</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">UA/ha</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Meta</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Desvio</th>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {ocupacoesFiltradas.map((o) => (
                        <tr key={o.historico_id}>
                          <td className="px-4 py-2 font-medium whitespace-nowrap">{o.lote || '—'}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{o.pasto || '—'}</td>
                          <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{o.modulo || '—'}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{formatarData(o.data_entrada)}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{o.data_saida ? formatarData(o.data_saida) : '—'}</td>
                          <td className="px-4 py-2 text-right">{formatarNumero(o.dias, 1)}</td>
                          <td className="px-4 py-2 text-right">{formatarInteiro(o.cabecas_entrada)}</td>
                          <td className="px-4 py-2 text-right">{formatarNumero(o.taxa_lotacao_ua_ha, 2)}</td>
                          <td className="px-4 py-2 text-right">{o.meta_ocupacao_dias != null ? `${formatarInteiro(o.meta_ocupacao_dias)}d` : '—'}</td>
                          <td className="px-4 py-2 text-right" style={{ color: (o.desvio_percent ?? 0) > 0 ? RED : '#16a34a' }}>
                            {o.desvio_percent != null ? `${formatarNumero(o.desvio_percent, 0)}%` : '—'}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${o.em_andamento ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                              {o.em_andamento ? 'Em andamento' : 'Encerrada'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Resumo por lote */}
            {resumo.por_lote.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-4">Resumo por lote</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Lote</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Pasto atual</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Movimentações</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Ocupações</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Ocupação média (dias)</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Última movimentação</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Alertas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {resumo.por_lote.map((l) => (
                        <tr key={l.nome}>
                          <td className="px-4 py-2 font-medium whitespace-nowrap">{l.nome}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{l.pasto_atual || '—'}</td>
                          <td className="px-4 py-2 text-right">{l.movimentacoes || '—'}</td>
                          <td className="px-4 py-2 text-right">{l.ocupacoes || '—'}</td>
                          <td className="px-4 py-2 text-right">{formatarNumero(l.dias_ocupacao_media, 1)}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{formatarData(l.ultima_data)}</td>
                          <td className="px-4 py-2 text-right" style={{ color: l.alertas > 0 ? RED : undefined }}>{l.alertas || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Movimentações detalhadas */}
            {registrosFiltrados.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-4">Movimentações detalhadas</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Data</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Manejador</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Lote</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Trajeto</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Aval. saída/entrada</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Ocup./Vedação</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Composição</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Animais</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Equipe</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Alertas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {registrosFiltrados.map((r) => (
                        <tr key={r.registro_id}>
                          <td className="px-4 py-2 whitespace-nowrap">
                            {formatarData(r.data)}
                            {r.horario_manejo && <span className="text-gray-400 text-xs block">{r.horario_manejo}</span>}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap">{r.responsavel || '—'}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{r.lote || '—'}</td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            {r.pasto_saida || '—'} <span className="text-gray-400">→</span> {r.pasto_entrada || '—'}
                          </td>
                          <td className="px-4 py-2 text-right whitespace-nowrap">
                            {r.avaliacao_saida ?? '—'} / {r.avaliacao_entrada ?? '—'}
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-500">
                            {r.tempo_ocupacao && <div>Ocup: {r.tempo_ocupacao}</div>}
                            {r.tempo_vedacao && <div>Ved: {r.tempo_vedacao}</div>}
                            {!r.tempo_ocupacao && !r.tempo_vedacao && '—'}
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-600">{composicaoPastagem(r)}</td>
                          <td className="px-4 py-2 text-right font-medium">{formatarInteiro(totalAnimaisRegistro(r))}</td>
                          <td className="px-4 py-2 text-xs text-gray-600">
                            {Array.isArray(r.equipe_nomes) && r.equipe_nomes.length
                              ? r.equipe_nomes.map(abreviarNome).filter(Boolean).join(', ')
                              : r.numero_pessoas_manejo != null
                                ? `${r.numero_pessoas_manejo} ${plural(r.numero_pessoas_manejo, 'pessoa', 'pessoas')}`
                                : '—'}
                          </td>
                          <td className="px-4 py-2">{alertasCell(r)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Fluxo entre pastos */}
            {resumo.fluxo.length > 1 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-4">Fluxo entre pastos</h2>
                <div className="flex flex-wrap gap-2">
                  {resumo.fluxo.map((f) => (
                    <span key={`${f.origem}-${f.destino}`} className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs">
                      <span className="font-medium text-gray-700">{f.origem}</span>
                      <span className="text-gray-400">→</span>
                      <span className="font-medium text-gray-700">{f.destino}</span>
                      <span className="text-gray-400">· {f.vezes}x</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center">
        <p className="text-xs text-gray-400">
          Relatório gerado por Manej'Us 360 · Gesta'Up
        </p>
      </footer>
    </div>
  )
}
