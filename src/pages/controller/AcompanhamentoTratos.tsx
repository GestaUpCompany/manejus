import { useEffect, useState, useMemo, useCallback, useRef, Fragment } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, CardSkeleton, Input } from '../../components/ui'
import { getFazendaIdForUser } from '../../utils/fazendaContext'
import { formatDate } from '../../utils/formatDate'
import {
  fetchPlanejadoPorLote,
  fetchRealPorLoteDia,
  cruzarPlanejadoReal,
  calcularResumoPorLote,
  fetchHorariosTratos,
  calcularResumoHorarios,
  fetchFabricaAcompanhamento,
  fetchDetalheTratosPorLote,
  TOLERANCIA_OK_PCT,
  TOLERANCIA_ALERTA_PCT,
  TOLERANCIA_OK_MIN,
  TOLERANCIA_ALERTA_MIN,
  type LinhaDesvio,
  type ResumoLote,
  type LinhaHorario,
  type LinhaFabricaAcompanhamento,
  type DetalheTratoLote,
} from '../../services/acompanhamentoTratosService'
import type { TipoProgramacao } from '../../services/programacaoTratosService'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'

interface LoteOption {
  id: string
  nome: string
}

interface ResumoFabricaDia {
  data: string
  linhas: LinhaFabricaAcompanhamento[]
  previsto_kg: number
  produzido_kg: number
  distribuido_kg: number
  saldo_kg: number
}

const CORES_STATUS = {
  ok: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', dot: 'bg-green-500' },
  alerta: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', dot: 'bg-yellow-500' },
  critico: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500' },
  sem_execucao: { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', dot: 'bg-gray-400' },
  sem_horario: { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', dot: 'bg-gray-400' },
}

type StatusDesvioPct = 'ok' | 'alerta' | 'critico' | 'sem_execucao'

function statusDesvioPct(v: number | null): StatusDesvioPct {
  if (v == null) return 'sem_execucao'
  const abs = Math.abs(v)
  if (abs <= TOLERANCIA_OK_PCT) return 'ok'
  if (abs <= TOLERANCIA_ALERTA_PCT) return 'alerta'
  return 'critico'
}

function statusLabel(status: string): string {
  switch (status) {
    case 'ok': return 'OK'
    case 'alerta': return 'Alerta'
    case 'critico': return 'Crítico'
    case 'sem_execucao': return 'Sem execução'
    default: return '—'
  }
}

function formatKg(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })
}

function formatPct(v: number | null | undefined): string {
  if (v == null) return '—'
  const sinal = v > 0 ? '+' : ''
  return `${sinal}${v.toFixed(1)}%`
}

function situacaoDesvio(v: number | null | undefined): string {
  if (v == null) return 'Sem base de comparação'
  if (v < 0) return 'Abaixo do planejado'
  if (v > 0) return 'Acima do planejado'
  return 'Dentro do planejado'
}

function formatDesvioMin(v: number | null | undefined): string {
  if (v == null) return '—'
  const sinal = v > 0 ? '+' : ''
  const abs = Math.abs(v)
  if (abs < 60) return `${sinal}${v} min`
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return `${sinal}${v < 0 ? '-' : ''}${h}h${m > 0 ? ` ${m}min` : ''}`
}

function calcularDiasNoPeriodo(dataInicio: string, dataFim: string): number {
  const inicio = new Date(`${dataInicio}T00:00:00Z`)
  const fim = new Date(`${dataFim}T00:00:00Z`)
  return Math.max(0, Math.round((fim.getTime() - inicio.getTime()) / 86400000) + 1)
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function statusFabricaLabel(status: LinhaFabricaAcompanhamento['status']): string {
  switch (status) {
    case 'concluido': return 'Concluído'
    case 'parcial': return 'Parcial'
    case 'produzido_sem_distribuicao': return 'Sem distribuição'
    case 'distribuido_sem_fabricacao': return 'Sem fabricação'
    default: return 'Não produzido'
  }
}

function statusFabricaClass(status: LinhaFabricaAcompanhamento['status']): string {
  switch (status) {
    case 'concluido': return 'bg-green-50 text-green-700 border-green-200'
    case 'parcial': return 'bg-yellow-50 text-yellow-700 border-yellow-200'
    case 'produzido_sem_distribuicao': return 'bg-blue-50 text-blue-700 border-blue-200'
    case 'distribuido_sem_fabricacao': return 'bg-gray-50 text-gray-600 border-gray-200'
    default: return 'bg-gray-50 text-gray-600 border-gray-200'
  }
}

export function AcompanhamentoTratos() {
  const { user } = useAuth()
  const [fazendaId, setFazendaId] = useState<string | null>(null)
  const [loadingFazenda, setLoadingFazenda] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filtros
  const hoje = new Date()
  const trintaAtras = new Date()
  trintaAtras.setDate(trintaAtras.getDate() - 30)
  const [dataInicio, setDataInicio] = useState(formatDateInput(trintaAtras))
  const [dataFim, setDataFim] = useState(formatDateInput(hoje))
  const [dataInicioAplicada, setDataInicioAplicada] = useState(dataInicio)
  const [dataFimAplicada, setDataFimAplicada] = useState(dataFim)

  const [lotes, setLotes] = useState<LoteOption[]>([])
  const [lotesSelecionados, setLotesSelecionados] = useState<string[]>([])
  const [lotesSelecionadosAplicados, setLotesSelecionadosAplicados] = useState<string[]>([])
  const [loteDropdownOpen, setLoteDropdownOpen] = useState(false)
  const [loteSearchTerm, setLoteSearchTerm] = useState('')
  const loteDropdownRef = useRef<HTMLDivElement>(null)
  const [tipoFiltro, setTipoFiltro] = useState<TipoProgramacao | 'todos'>('todos')
  const [showPlanejadoInfo, setShowPlanejadoInfo] = useState(false)
  const [showDetalhesFabrica, setShowDetalhesFabrica] = useState(false)
  const [diasFabricaExpandidos, setDiasFabricaExpandidos] = useState<Set<string>>(new Set())
  const [secaoAtiva, setSecaoAtiva] = useState<'visao-geral' | 'fabrica' | 'pontualidade' | 'resumo'>('visao-geral')

  // Dados
  const [linhas, setLinhas] = useState<LinhaDesvio[]>([])
  const [resumos, setResumos] = useState<ResumoLote[]>([])
  const [linhasHorario, setLinhasHorario] = useState<LinhaHorario[]>([])
  const [linhasFabrica, setLinhasFabrica] = useState<LinhaFabricaAcompanhamento[]>([])
  const [detalheTratos, setDetalheTratos] = useState<Record<string, DetalheTratoLote[]>>({})
  const [lotesCarregandoDetalhes, setLotesCarregandoDetalhes] = useState<Set<string>>(new Set())
  const dataRequestIdRef = useRef(0)

  // Lotes expandidos na tabela unificada
  const [lotesExpandidos, setLotesExpandidos] = useState<Set<string>>(new Set())

  const loadFazenda = useCallback(async () => {
    if (!user) {
      setLoadingFazenda(false)
      return
    }

    try {
      const fid = await getFazendaIdForUser(user.id)
      if (!fid) {
        setError('Não foi possível identificar a fazenda vinculada ao usuário.')
        return
      }
      setFazendaId(fid)
    } catch {
      setError('Não foi possível carregar a fazenda vinculada ao usuário.')
    } finally {
      setLoadingFazenda(false)
    }
  }, [user])

  useEffect(() => {
    loadFazenda()
  }, [loadFazenda])

  const loadLotes = useCallback(async () => {
    if (!fazendaId) return
    const { data, error } = await supabase
      .from('lotes')
      .select('id, nome')
      .eq('fazenda_id', fazendaId)
      .eq('ativo', true)
      .order('nome', { ascending: true })

    if (!error && data) {
      setLotes(data.map((l: any) => ({ id: l.id, nome: l.nome })))
    }
  }, [fazendaId])

  useEffect(() => {
    loadLotes()
  }, [loadLotes])

  useEffect(() => {
    if (!loteDropdownOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!loteDropdownRef.current?.contains(event.target as Node)) {
        setLoteDropdownOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLoteDropdownOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [loteDropdownOpen])

  const loadData = useCallback(async () => {
    if (!fazendaId || !dataInicioAplicada || !dataFimAplicada) return

    if (dataInicioAplicada > dataFimAplicada) {
      setError('A data de início deve ser anterior ou igual à data de fim.')
      setLoading(false)
      return
    }

    const requestId = ++dataRequestIdRef.current
    setLoading(true)
    setError(null)
    setShowDetalhesFabrica(false)
    setDiasFabricaExpandidos(new Set())
    setDetalheTratos({})
    setLotesCarregandoDetalhes(new Set())

    try {
      const [planejado, real, horarios, fabrica] = await Promise.all([
        fetchPlanejadoPorLote(fazendaId),
        fetchRealPorLoteDia(fazendaId, dataInicioAplicada, dataFimAplicada),
        fetchHorariosTratos(fazendaId, dataInicioAplicada, dataFimAplicada, lotesSelecionadosAplicados),
        fetchFabricaAcompanhamento(fazendaId, dataInicioAplicada, dataFimAplicada, lotesSelecionadosAplicados),
      ])

      if (requestId !== dataRequestIdRef.current) return

      const cruzado = cruzarPlanejadoReal(planejado, real, dataInicioAplicada, dataFimAplicada, lotesSelecionadosAplicados)
      const resumo = calcularResumoPorLote(cruzado, dataInicioAplicada, dataFimAplicada)

      setLinhas(cruzado)
      setResumos(resumo)
      setLinhasHorario(horarios)
      setLinhasFabrica(fabrica)
    } catch (err) {
      if (requestId !== dataRequestIdRef.current) return
      console.error('Erro ao carregar acompanhamento de tratos:', err)
      setLinhas([])
      setResumos([])
      setLinhasHorario([])
      setLinhasFabrica([])
      setDetalheTratos({})
      setError('Não foi possível carregar os dados do acompanhamento. Tente novamente.')
    } finally {
      if (requestId === dataRequestIdRef.current) setLoading(false)
    }
  }, [fazendaId, dataInicioAplicada, dataFimAplicada, lotesSelecionadosAplicados])

  useEffect(() => {
    if (fazendaId) loadData()
  }, [fazendaId, loadData])

  // Aplicar filtro de tipo (engorda, sequestro ou TIP) sobre os dados carregados
  const linhasFiltradas = useMemo(() => {
    if (tipoFiltro === 'todos') return linhas
    return linhas.filter((l) => l.tipo === tipoFiltro)
  }, [linhas, tipoFiltro])

  const resumosFiltrados = useMemo(() => {
    if (tipoFiltro === 'todos') return resumos
    return resumos.filter((r) => r.tipo === tipoFiltro)
  }, [resumos, tipoFiltro])

  const linhasHorarioFiltradas = useMemo(() => {
    if (tipoFiltro === 'todos') return linhasHorario
    return linhasHorario.filter((l) => l.tipo === tipoFiltro)
  }, [linhasHorario, tipoFiltro])

  const linhasFabricaFiltradas = useMemo(() => {
    if (tipoFiltro === 'todos') return linhasFabrica
    return linhasFabrica.filter((l) => l.tipo === tipoFiltro)
  }, [linhasFabrica, tipoFiltro])

  const resumoFabrica = useMemo(() => ({
    total: linhasFabricaFiltradas.length,
    concluidos: linhasFabricaFiltradas.filter((l) => l.status === 'concluido').length,
    parciais: linhasFabricaFiltradas.filter((l) => l.status === 'parcial').length,
    pendentes: linhasFabricaFiltradas.filter((l) => l.status === 'nao_produzido').length,
    saldoKg: linhasFabricaFiltradas.reduce((sum, l) => sum + l.saldo_kg, 0),
    totalPrevisto: linhasFabricaFiltradas.reduce((sum, l) => sum + l.previsto_kg, 0),
    totalProduzido: linhasFabricaFiltradas.reduce((sum, l) => sum + l.produzido_kg, 0),
    totalDistribuido: linhasFabricaFiltradas.reduce((sum, l) => sum + l.distribuido_kg, 0),
  }), [linhasFabricaFiltradas])

  const fabricaPorDia = useMemo<ResumoFabricaDia[]>(() => {
    const mapa = new Map<string, ResumoFabricaDia>()
    for (const linha of linhasFabricaFiltradas) {
      const dia = mapa.get(linha.data) || {
        data: linha.data,
        linhas: [],
        previsto_kg: 0,
        produzido_kg: 0,
        distribuido_kg: 0,
        saldo_kg: 0,
      }
      dia.linhas.push(linha)
      dia.previsto_kg += linha.previsto_kg
      dia.produzido_kg += linha.produzido_kg
      dia.distribuido_kg += linha.distribuido_kg
      dia.saldo_kg += linha.saldo_kg
      mapa.set(linha.data, dia)
    }
    return Array.from(mapa.values()).sort((a, b) => b.data.localeCompare(a.data))
  }, [linhasFabricaFiltradas])

  const resumoHorarioFiltrado = useMemo(() => {
    return calcularResumoHorarios(linhasHorarioFiltradas)
  }, [linhasHorarioFiltradas])

  // Métricas globais
  const metricas = useMemo(() => {
    let planejadoTotal = 0
    let realTotal = 0
    const diasComRegistroSet = new Set<string>()

    for (const l of linhasFiltradas) {
      if (l.planejado_kg != null) planejadoTotal += l.planejado_kg
      realTotal += l.real_kg
      if (l.n_tratos > 0) diasComRegistroSet.add(l.data)
    }
    const diasComRegistro = diasComRegistroSet.size

    const desvioTotal = realTotal - planejadoTotal
    const desvioPctGlobal = planejadoTotal > 0
      ? (desvioTotal / planejadoTotal) * 100
      : null
    const diasNoPeriodo = calcularDiasNoPeriodo(dataInicioAplicada, dataFimAplicada)

    return {
      planejadoTotal,
      realTotal,
      desvioTotal,
      desvioPctGlobal,
      statusDesvioPct: statusDesvioPct(desvioPctGlobal),
      planejadoMedioDia: diasNoPeriodo > 0 ? planejadoTotal / diasNoPeriodo : 0,
      diasComRegistro,
      diasNoPeriodo,
      totalLinhas: linhasFiltradas.length,
    }
  }, [linhasFiltradas, dataInicioAplicada, dataFimAplicada])

  const alertasOperacionais = useMemo(() => {
    const lotesCriticos = resumosFiltrados.filter((resumo) => resumo.status === 'critico')
    const lotesSemExecucao = resumosFiltrados.filter((resumo) => resumo.status === 'sem_execucao')
    const tratosForaDoHorario = linhasHorarioFiltradas.filter((linha) => linha.status === 'critico')
    const lotesForaDoHorario = [...new Set(tratosForaDoHorario.map((linha) => linha.lote_nome))]

    return {
      lotesCriticos,
      lotesSemExecucao,
      tratosForaDoHorario,
      lotesForaDoHorario,
      total: lotesCriticos.length + lotesSemExecucao.length + tratosForaDoHorario.length,
    }
  }, [resumosFiltrados, linhasHorarioFiltradas])

  const nomesLotes = (loteIds: string[]) => {
    const nomes = loteIds.slice(0, 3).map((loteId) => resumosFiltrados.find((resumo) => resumo.lote_id === loteId)?.lote_nome)
    const nomesValidos = nomes.filter(Boolean)
    const restante = loteIds.length - nomesValidos.length
    return `${nomesValidos.join(', ')}${restante > 0 ? ` e mais ${restante}` : ''}`
  }

  const navegarParaSecao = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const abrirLotesComAlerta = (loteIds: string[]) => {
    setSecaoAtiva('resumo')
    setLotesExpandidos(new Set(loteIds))
    loteIds.forEach((loteId) => carregarDetalhesLote(loteId))
    window.setTimeout(() => navegarParaSecao('resumo-por-lote'), 0)
  }

  // Dados para gráfico de tendência (desvio % por data, consolidado)
  const dadosGraficoTendencia = useMemo(() => {
    const mapa: Record<string, { data: string; planejado: number; real: number; desvio_pct: number | null }> = {}

    for (const l of linhasFiltradas) {
      if (l.planejado_kg == null) continue // pular sem planejamento no gráfico
      if (!mapa[l.data]) {
        mapa[l.data] = { data: l.data, planejado: 0, real: 0, desvio_pct: 0 }
      }
      mapa[l.data].planejado += l.planejado_kg
      mapa[l.data].real += l.real_kg
    }

    const arr = Object.values(mapa).map((d) => ({
      data: d.data,
      dataFormatada: formatDate(d.data),
      planejado: Number(d.planejado.toFixed(1)),
      real: Number(d.real.toFixed(1)),
      desvio_pct: d.planejado > 0 ? Number(((d.real - d.planejado) / d.planejado * 100).toFixed(1)) : 0,
    })).sort((a, b) => a.data.localeCompare(b.data))

    return arr
  }, [linhasFiltradas])

  // Dados para gráfico de barras (planejado vs real por lote)
  const dadosGraficoLotes = useMemo(() => {
    return resumosFiltrados.map((r) => ({
      lote: r.lote_nome,
      planejado: Number(r.planejado_total_kg.toFixed(1)),
      real: Number(r.real_total_kg.toFixed(1)),
    }))
  }, [resumosFiltrados])

  // Detalhes individuais por lote, ordenados pelo serviço por data e trato.
  const detalhesPorLote = useMemo(() => detalheTratos, [detalheTratos])

  const lotesVisiveis = useMemo(() => {
    const termo = loteSearchTerm.toLowerCase().trim()
    if (!termo) return lotes
    return lotes.filter((lote) => lote.nome.toLowerCase().includes(termo))
  }, [lotes, loteSearchTerm])

  const carregarDetalhesLote = useCallback(async (loteId: string) => {
    if (!fazendaId || detalheTratos[loteId] || lotesCarregandoDetalhes.has(loteId)) return

    const requestId = dataRequestIdRef.current
    setLotesCarregandoDetalhes((prev) => new Set(prev).add(loteId))
    try {
      const detalhes = await fetchDetalheTratosPorLote(
        fazendaId,
        dataInicioAplicada,
        dataFimAplicada,
        [loteId]
      )
      if (requestId !== dataRequestIdRef.current) return
      setDetalheTratos((prev) => ({ ...prev, ...detalhes }))
    } catch (err) {
      console.error('Erro ao carregar detalhes do lote:', err)
    } finally {
      setLotesCarregandoDetalhes((prev) => {
        const next = new Set(prev)
        next.delete(loteId)
        return next
      })
    }
  }, [fazendaId, dataInicioAplicada, dataFimAplicada, detalheTratos, lotesCarregandoDetalhes])

  const toggleLote = (id: string) => {
    setLotesSelecionados((prev) =>
      prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id]
    )
  }

  const toggleExpandirLote = (loteId: string) => {
    if (!lotesExpandidos.has(loteId)) carregarDetalhesLote(loteId)
    setLotesExpandidos((prev) => {
      const next = new Set(prev)
      if (next.has(loteId)) next.delete(loteId)
      else next.add(loteId)
      return next
    })
  }

  const selecionarTodosLotes = () => {
    setLotesSelecionados(lotes.map((lote) => lote.id))
  }

  const limparSelecaoLotes = () => {
    setLotesSelecionados([])
  }

  const handleToggleLoteKeyDown = (event: React.KeyboardEvent<HTMLTableRowElement>, loteId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggleExpandirLote(loteId)
    }
  }

  const aplicarFiltros = () => {
    if (dataInicio > dataFim) {
      setError('A data de início deve ser anterior ou igual à data de fim.')
      return
    }

    setDataInicioAplicada(dataInicio)
    setDataFimAplicada(dataFim)
    setLotesSelecionadosAplicados(lotesSelecionados)
    setLoteDropdownOpen(false)
  }

  const limparFiltros = () => {
    const inicioPadrao = formatDateInput(trintaAtras)
    const fimPadrao = formatDateInput(hoje)
    setLoteSearchTerm('')
    setLotesSelecionados([])
    setLotesSelecionadosAplicados([])
    setTipoFiltro('todos')
    setDataInicio(inicioPadrao)
    setDataFim(fimPadrao)
    setDataInicioAplicada(inicioPadrao)
    setDataFimAplicada(fimPadrao)
    setLoteDropdownOpen(false)
  }

  const definirAtalhoPeriodo = (atalho: 'hoje' | '7' | '30' | 'mes') => {
    const fim = new Date()
    const inicio = new Date(fim)
    if (atalho === 'hoje') {
      // mantém o início no mesmo dia
    } else if (atalho === 'mes') {
      inicio.setDate(1)
    } else {
      inicio.setDate(inicio.getDate() - Number(atalho) + 1)
    }
    setDataInicio(formatDateInput(inicio))
    setDataFim(formatDateInput(fim))
  }

  const filtrosPendentes =
    dataInicio !== dataInicioAplicada ||
    dataFim !== dataFimAplicada ||
    lotesSelecionados.length !== lotesSelecionadosAplicados.length ||
    lotesSelecionados.some((loteId) => !lotesSelecionadosAplicados.includes(loteId))
  const nomesLotesAplicados = lotes.filter((lote) => lotesSelecionadosAplicados.includes(lote.id)).map((lote) => lote.nome)
  const lotesAplicadosLabel = nomesLotesAplicados.length === 0
    ? 'Todos os lotes'
    : nomesLotesAplicados.length <= 2
    ? nomesLotesAplicados.join(', ')
    : `${nomesLotesAplicados.slice(0, 2).join(', ')} e mais ${nomesLotesAplicados.length - 2}`
  const todosLotesExpandidos = resumosFiltrados.length > 0 && resumosFiltrados.every((resumo) => lotesExpandidos.has(resumo.lote_id))
  const nenhumLoteExpandido = !resumosFiltrados.some((resumo) => lotesExpandidos.has(resumo.lote_id))

  if (loadingFazenda) {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
        <CardSkeleton />
      </div>
    )
  }

  if (error && !fazendaId) {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
        <Card className="p-8 text-center" disableHover>
          <p className="font-medium text-red-700">Não foi possível abrir o acompanhamento</p>
          <p className="mt-2 text-sm text-gray-600">{error}</p>
          <Button className="mt-4" onClick={() => loadFazenda()}>Tentar novamente</Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Acompanhamento de Tratos</h1>
          <p className="text-sm text-gray-500 mt-1">
            Compare o kg planejado por dia com o kg realmente tratado, por lote. Identifique desvios e tendências.
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadData()}
          disabled={loading}
          aria-label="Atualizar acompanhamento de tratos"
          title="Atualizar dados"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border-2 border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg
            className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 11a8.1 8.1 0 0 0-14.7-4.7L3 8" />
            <path d="M3 3v5h5" />
            <path d="M4 13a8.1 8.1 0 0 0 14.7 4.7L21 16" />
            <path d="M21 21v-5h-5" />
          </svg>
          Atualizar
        </button>
      </div>

      {/* Filtros */}
      <Card className="p-4" disableHover>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-600">Período rápido:</span>
          {[
            { id: 'hoje', label: 'Hoje' },
            { id: '7', label: 'Últimos 7 dias' },
            { id: '30', label: 'Últimos 30 dias' },
            { id: 'mes', label: 'Mês atual' },
          ].map((atalho) => (
            <button
              key={atalho.id}
              type="button"
              onClick={() => definirAtalhoPeriodo(atalho.id as 'hoje' | '7' | '30' | 'mes')}
              className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
            >
              {atalho.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col xl:flex-row gap-4 xl:items-end">
          <div className="flex gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data início</label>
              <Input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-40"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data fim</label>
              <Input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="w-40"
              />
            </div>
          </div>

          {/* Dropdown de lotes */}
          <div ref={loteDropdownRef} className="relative flex-1 max-w-xs">
            <label className="block text-xs font-medium text-gray-600 mb-1">Lotes</label>
            <button
              onClick={() => setLoteDropdownOpen(!loteDropdownOpen)}
              className="w-full min-h-[52px] px-3 py-2 text-sm border-2 border-gray-200 rounded-lg bg-white text-left flex items-center justify-between hover:border-gray-300 transition-colors"
            >
              <span className="truncate">
                {lotesSelecionados.length === 0
                  ? 'Todos os lotes'
                  : `${lotesSelecionados.length} selecionado(s)`}
              </span>
              <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {loteDropdownOpen && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border-2 border-gray-200 bg-white shadow-lg">
                <div className="border-b border-gray-100 p-2">
                  <Input
                    type="search"
                    value={loteSearchTerm}
                    onChange={(e) => setLoteSearchTerm(e.target.value)}
                    placeholder="Buscar lote..."
                    className="text-sm"
                    autoFocus
                  />
                  <div className="mt-2 flex justify-between gap-2">
                    <button type="button" onClick={selecionarTodosLotes} className="text-xs font-medium text-blue-600 hover:text-blue-800">
                      Selecionar todos
                    </button>
                    <button type="button" onClick={limparSelecaoLotes} className="text-xs font-medium text-gray-500 hover:text-gray-700">
                      Limpar seleção
                    </button>
                  </div>
                </div>
                <div className="max-h-52 overflow-y-auto">
                  {lotesVisiveis.map((l) => (
                    <label
                      key={l.id}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={lotesSelecionados.includes(l.id)}
                        onChange={() => toggleLote(l.id)}
                        className="rounded"
                      />
                      <span className="truncate">{l.nome}</span>
                    </label>
                  ))}
                  {lotesVisiveis.length === 0 && (
                    <p className="px-3 py-2 text-sm text-gray-400">Nenhum lote encontrado</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Seletor de tipo */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
            <div className="inline-flex rounded-lg border-2 border-gray-200 overflow-hidden">
              {(['todos', 'engorda', 'sequestro', 'tip'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTipoFiltro(t)}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    tipoFiltro === t
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {t === 'todos' ? 'Todos' : t === 'engorda' ? 'Engorda' : t === 'sequestro' ? 'Sequestro' : 'TIP'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={aplicarFiltros}
              disabled={loading || dataInicio > dataFim}
            >
              Aplicar filtros
            </Button>
            <Button variant="secondary" size="sm" onClick={limparFiltros}>
              Limpar filtros
            </Button>
          </div>
        </div>
        {filtrosPendentes && dataInicio <= dataFim && (
          <p className="mt-3 text-sm text-blue-700" role="status">
            Há alterações de filtro pendentes. Clique em Aplicar filtros para atualizar os dados.
          </p>
        )}
        {dataInicio > dataFim && (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            A data de início deve ser anterior ou igual à data de fim.
          </p>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600" aria-label="Filtros aplicados">
        <span className="font-medium text-gray-700">Filtros aplicados:</span>
        <span className="rounded-full bg-gray-100 px-2.5 py-1">{formatDate(dataInicioAplicada)} a {formatDate(dataFimAplicada)}</span>
        <span className="rounded-full bg-gray-100 px-2.5 py-1">{lotesAplicadosLabel}</span>
        <span className="rounded-full bg-gray-100 px-2.5 py-1">Tipo: {tipoFiltro === 'todos' ? 'Todos' : tipoFiltro}</span>
      </div>

      {loading ? (
        <div className="space-y-4">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : error ? (
        <Card className="p-8 text-center" disableHover>
          <p className="font-medium text-red-700">Não foi possível carregar o acompanhamento</p>
          <p className="mt-2 text-sm text-gray-600">{error}</p>
          {dataInicio <= dataFim && (
            <Button className="mt-4" onClick={() => loadData()}>
              Tentar novamente
            </Button>
          )}
        </Card>
      ) : linhasFiltradas.length === 0 && linhasFabricaFiltradas.length === 0 ? (
        <Card className="p-8 text-center" disableHover>
          <p className="font-medium text-gray-700">Nenhum dado encontrado para o período selecionado.</p>
          <p className="text-sm text-gray-500 mt-1">
            Verifique se há programação, fabricação ou distribuição registrada no período.
          </p>
          <Button variant="secondary" className="mt-4" onClick={limparFiltros}>
            Voltar para os últimos 30 dias
          </Button>
        </Card>
      ) : (
        <>
          {/* Cards de métricas globais */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <Card className="p-4" disableHover>
              <p className="text-xs text-gray-500 font-medium">Planejado no período</p>
              <p className="text-xl font-bold text-gray-800 mt-1">{formatKg(metricas.planejadoTotal)} kg</p>
              <p className="text-xs text-gray-400 mt-1">{formatDate(dataInicioAplicada)} a {formatDate(dataFimAplicada)}</p>
            </Card>
            <Card className="p-4" disableHover>
              <p className="text-xs text-gray-500 font-medium">Média planejada por dia</p>
              <p className="text-xl font-bold text-gray-800 mt-1">{formatKg(metricas.planejadoMedioDia)} kg</p>
              <p className="text-xs text-gray-400 mt-1">média em {metricas.diasNoPeriodo} dias</p>
            </Card>
            <Card className="p-4" disableHover>
              <p className="text-xs text-gray-500 font-medium">Real executado no período</p>
              <p className="text-xl font-bold text-gray-800 mt-1">{formatKg(metricas.realTotal)} kg</p>
              <p className="text-xs text-gray-400 mt-1">{formatDate(dataInicioAplicada)} a {formatDate(dataFimAplicada)}</p>
            </Card>
            <Card className="p-4" disableHover>
              <p className="text-xs text-gray-500 font-medium">Desvio acumulado</p>
              <p className={`text-xl font-bold mt-1 ${CORES_STATUS[metricas.statusDesvioPct].text}`}>
                {metricas.desvioTotal >= 0 ? '+' : ''}{formatKg(metricas.desvioTotal)} kg
              </p>
              <p className="text-xs text-gray-400 mt-1">{situacaoDesvio(metricas.desvioTotal)}; real menos planejado</p>
            </Card>
            <Card className="p-4" disableHover>
              <p className="text-xs text-gray-500 font-medium">Desvio no período</p>
              <p className={`text-xl font-bold mt-1 ${CORES_STATUS[metricas.statusDesvioPct].text}`}>
                {formatPct(metricas.desvioPctGlobal)}
              </p>
              <p className="text-xs text-gray-400 mt-1">{situacaoDesvio(metricas.desvioPctGlobal)}; real versus planejado</p>
            </Card>
            <Card className="p-4" disableHover>
              <p className="text-xs text-gray-500 font-medium">Dias com registro</p>
              <p className="text-xl font-bold text-gray-800 mt-1">{metricas.diasComRegistro} de {metricas.diasNoPeriodo}</p>
              <p className="text-xs text-gray-400 mt-1">dias do período</p>
            </Card>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-600" aria-label="Legenda dos desvios">
            <span className="font-medium text-gray-700">Leitura das cores:</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-500" />Dentro da tolerância, até {TOLERANCIA_OK_PCT}%</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-yellow-500" />Alerta, até {TOLERANCIA_ALERTA_PCT}%</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" />Crítico, acima de {TOLERANCIA_ALERTA_PCT}%</span>
            <span className="text-gray-500">Nos horários, até {TOLERANCIA_OK_MIN} min é normal, de {TOLERANCIA_OK_MIN} a {TOLERANCIA_ALERTA_MIN} é alerta e acima disso é crítico.</span>
          </div>

          <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-blue-900">
            <button
              type="button"
              onClick={() => setShowPlanejadoInfo(!showPlanejadoInfo)}
              className="font-medium text-blue-800 hover:text-blue-950"
              aria-expanded={showPlanejadoInfo}
            >
              {showPlanejadoInfo ? 'Ocultar como é calculado' : 'Como é calculado o planejado?'}
            </button>
            {showPlanejadoInfo && (
              <p className="mt-2 leading-relaxed">
                O planejado no período é a soma do planejamento diário dos lotes entre as datas selecionadas. Em dias com registro de trato, usamos o kg planejado gravado no registro. Em dias sem execução, usamos o kg diário definido na programação de tratos.
              </p>
            )}
          </div>

          <section aria-labelledby="alertas-operacionais-titulo">
            <div className="mb-3">
              <h2 id="alertas-operacionais-titulo" className="text-lg font-semibold text-gray-800">Atenção necessária</h2>
              <p className="mt-1 text-sm text-gray-500">Situações que podem exigir verificação no período selecionado.</p>
            </div>
            {alertasOperacionais.total === 0 ? (
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                Nenhuma situação prioritária identificada nos filtros atuais.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {alertasOperacionais.lotesCriticos.length > 0 && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                    <p className="text-sm font-semibold text-red-800">{alertasOperacionais.lotesCriticos.length} lote(s) com desvio crítico</p>
                    <p className="mt-1 text-sm text-red-700">{nomesLotes(alertasOperacionais.lotesCriticos.map((lote) => lote.lote_id))}</p>
                    <button
                      type="button"
                      onClick={() => abrirLotesComAlerta(alertasOperacionais.lotesCriticos.map((lote) => lote.lote_id))}
                      className="mt-3 text-sm font-medium text-red-800 underline hover:text-red-950"
                    >
                      Ver lotes
                    </button>
                  </div>
                )}
                {alertasOperacionais.lotesSemExecucao.length > 0 && (
                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
                    <p className="text-sm font-semibold text-yellow-800">{alertasOperacionais.lotesSemExecucao.length} lote(s) sem execução</p>
                    <p className="mt-1 text-sm text-yellow-700">Há planejamento sem registro de trato no período.</p>
                    <button
                      type="button"
                      onClick={() => abrirLotesComAlerta(alertasOperacionais.lotesSemExecucao.map((lote) => lote.lote_id))}
                      className="mt-3 text-sm font-medium text-yellow-800 underline hover:text-yellow-950"
                    >
                      Ver lotes
                    </button>
                  </div>
                )}
                {alertasOperacionais.tratosForaDoHorario.length > 0 && (
                  <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
                    <p className="text-sm font-semibold text-orange-800">{alertasOperacionais.tratosForaDoHorario.length} trato(s) fora da tolerância</p>
                    <p className="mt-1 text-sm text-orange-700">Lotes: {alertasOperacionais.lotesForaDoHorario.slice(0, 3).join(', ')}</p>
                    <button
                      type="button"
                      onClick={() => navegarParaSecao('pontualidade-dos-tratos')}
                      className="mt-3 text-sm font-medium text-orange-800 underline hover:text-orange-950"
                    >
                      Ver pontualidade
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          <nav aria-label="Seções do acompanhamento" className="flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-gray-50 p-2">
            {[
              { id: 'visao-geral', label: 'Visão geral' },
              { id: 'fabrica', label: 'Fábrica e distribuição' },
              { id: 'pontualidade', label: 'Pontualidade' },
              { id: 'resumo', label: 'Resumo por lote' },
            ].map((secao) => (
              <button
                key={secao.id}
                type="button"
                onClick={() => setSecaoAtiva(secao.id as typeof secaoAtiva)}
                aria-pressed={secaoAtiva === secao.id}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  secaoAtiva === secao.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white text-gray-600 hover:bg-gray-100'
                }`}
              >
                {secao.label}
              </button>
            ))}
          </nav>

          {/* Fábrica e conciliação */}
          {secaoAtiva === 'fabrica' && (
          <Card className="p-4" disableHover>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Fábrica e conciliação</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Compare o que foi produzido na Fábrica com o que foi distribuído por dieta e trato.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-3 xl:grid-cols-6">
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-xs text-gray-500">Tratos</p>
                  <p className="font-bold text-gray-800">{resumoFabrica.total}</p>
                </div>
                <div className="rounded-lg bg-green-50 px-3 py-2">
                  <p className="text-xs text-green-700">Concluídos</p>
                  <p className="font-bold text-green-700">{resumoFabrica.concluidos}</p>
                </div>
                <div className="rounded-lg bg-yellow-50 px-3 py-2">
                  <p className="text-xs text-yellow-700">Parciais</p>
                  <p className="font-bold text-yellow-700">{resumoFabrica.parciais}</p>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-xs text-gray-600">Pendente fabricação</p>
                  <p className="font-bold text-gray-700">{formatKg(resumoFabrica.saldoKg)} kg</p>
                </div>
                <div className="rounded-lg bg-blue-50 px-3 py-2">
                  <p className="text-xs text-blue-700">Produzido</p>
                  <p className="font-bold text-blue-700">{formatKg(resumoFabrica.totalProduzido)} kg</p>
                </div>
                <div className="rounded-lg bg-purple-50 px-3 py-2">
                  <p className="text-xs text-purple-700">Distribuído</p>
                  <p className="font-bold text-purple-700">{formatKg(resumoFabrica.totalDistribuido)} kg</p>
                </div>
              </div>
            </div>
            {linhasFabricaFiltradas.length === 0 ? (
              <p className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-500">
                Nenhuma produção de fábrica encontrada para os filtros selecionados.
              </p>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setShowDetalhesFabrica((prev) => !prev)}
                  aria-expanded={showDetalhesFabrica}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                >
                  <svg className={`h-4 w-4 transition-transform ${showDetalhesFabrica ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7-7" />
                  </svg>
                  {showDetalhesFabrica ? 'Ocultar detalhes' : `Ver detalhes por dia (${fabricaPorDia.length})`}
                </button>
                {showDetalhesFabrica && (
                  <div className="mt-3 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-3 py-2">Data</th>
                      <th className="px-3 py-2 text-center">Tratos</th>
                      <th className="px-3 py-2 text-right">Previsto</th>
                      <th className="px-3 py-2 text-right">Produzido</th>
                      <th className="px-3 py-2 text-right">Distribuído</th>
                      <th className="px-3 py-2 text-right">Saldo</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {fabricaPorDia.map((dia) => {
                      const expandido = diasFabricaExpandidos.has(dia.data)
                      const status = dia.saldo_kg <= 0 ? 'concluido' : dia.produzido_kg > 0 ? 'parcial' : 'nao_produzido'
                      return (
                        <Fragment key={dia.data}>
                          <tr
                            className="cursor-pointer hover:bg-gray-50"
                            onClick={() => setDiasFabricaExpandidos((prev) => {
                              const next = new Set(prev)
                              if (next.has(dia.data)) next.delete(dia.data)
                              else next.add(dia.data)
                              return next
                            })}
                          >
                            <td className="px-3 py-2 font-medium text-gray-800">{formatDate(dia.data)}</td>
                            <td className="px-3 py-2 text-center text-gray-600">{dia.linhas.length}</td>
                            <td className="px-3 py-2 text-right text-gray-700">{formatKg(dia.previsto_kg)} kg</td>
                            <td className="px-3 py-2 text-right text-gray-700">{formatKg(dia.produzido_kg)} kg</td>
                            <td className="px-3 py-2 text-right text-gray-700">{formatKg(dia.distribuido_kg)} kg</td>
                            <td className="px-3 py-2 text-right text-gray-700">{formatKg(dia.saldo_kg)} kg</td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusFabricaClass(status)}`}>
                                {statusFabricaLabel(status)}
                              </span>
                            </td>
                          </tr>
                          {expandido && (
                            <tr className="bg-gray-50">
                              <td colSpan={7} className="px-4 py-3">
                                <div className="overflow-x-auto">
                                  <table className="min-w-full text-xs">
                                    <thead className="text-left text-gray-500">
                                      <tr>
                                        <th className="px-2 py-1">Dieta</th>
                                        <th className="px-2 py-1">Trato</th>
                                        <th className="px-2 py-1">Vagão</th>
                                        <th className="px-2 py-1 text-right">Previsto</th>
                                        <th className="px-2 py-1 text-right">Produzido</th>
                                        <th className="px-2 py-1 text-right">Distribuído</th>
                                        <th className="px-2 py-1">Status</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {dia.linhas.map((linha) => (
                                        <tr key={`${linha.data}-${linha.tipo}-${linha.formulacao_id}-${linha.ordem_trato}`} className="border-t border-gray-200">
                                          <td className="px-2 py-1 font-medium text-gray-700">{linha.formulacao_nome}</td>
                                          <td className="px-2 py-1 text-gray-600">{linha.ordem_trato}º</td>
                                          <td className="px-2 py-1 text-gray-600">{linha.vagao_nome || '—'}</td>
                                          <td className="px-2 py-1 text-right">{formatKg(linha.previsto_kg)} kg</td>
                                          <td className="px-2 py-1 text-right">{formatKg(linha.produzido_kg)} kg</td>
                                          <td className="px-2 py-1 text-right">{formatKg(linha.distribuido_kg)} kg</td>
                                          <td className="px-2 py-1"><span className={`rounded-full border px-1.5 py-0.5 ${statusFabricaClass(linha.status)}`}>{statusFabricaLabel(linha.status)}</span></td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                    <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                      <td className="px-3 py-2 text-gray-700">Total</td>
                      <td className="px-3 py-2 text-center text-gray-800">{linhasFabricaFiltradas.length}</td>
                      <td className="px-3 py-2 text-right text-gray-800">{formatKg(resumoFabrica.totalPrevisto)} kg</td>
                      <td className="px-3 py-2 text-right text-gray-800">{formatKg(resumoFabrica.totalProduzido)} kg</td>
                      <td className="px-3 py-2 text-right text-gray-800">{formatKg(resumoFabrica.totalDistribuido)} kg</td>
                      <td className="px-3 py-2 text-right text-gray-800">{formatKg(resumoFabrica.saldoKg)} kg</td>
                      <td className="px-3 py-2"></td>
                    </tr>
                  </tbody>
                </table>
                  </div>
                )}
              </>
            )}
          </Card>
          )}

          {/* Gráficos */}
          {secaoAtiva === 'visao-geral' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* Tendência do desvio ao longo do tempo */}
            <Card className="p-4" disableHover>
              <h3 className="text-sm font-semibold text-gray-700">Tendência do desvio (%)</h3>
              <p className="mt-1 text-xs text-gray-500">Percentual de real menos planejado em cada dia.</p>
              {dadosGraficoTendencia.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={dadosGraficoTendencia}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="dataFormatada"
                      tick={{ fontSize: 10 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      formatter={(v: any) => [`${Number(v).toFixed(1)}%`, 'Desvio']}
                      labelStyle={{ fontSize: 12 }}
                    />
                    <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="2 2" />
                    <Line
                      type="monotone"
                      dataKey="desvio_pct"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-gray-400 text-center py-12">
                  Sem dados de planejamento para o período.
                </p>
              )}
            </Card>

            {/* Planejado vs Real por lote */}
            <Card className="p-4" disableHover>
              <h3 className="text-sm font-semibold text-gray-700">Planejado vs Real no período por lote (kg)</h3>
              <p className="mt-1 text-xs text-gray-500">Comparação acumulada no intervalo selecionado.</p>
              {dadosGraficoLotes.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={dadosGraficoLotes}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="lote"
                      tick={{ fontSize: 10 }}
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: any) => [`${Number(v).toFixed(1)} kg`, '']} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="planejado" fill="#93c5fd" name="Planejado" />
                    <Bar dataKey="real" fill="#3b82f6" name="Real" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-gray-400 text-center py-12">Sem dados para exibir.</p>
              )}
            </Card>
          </div>
          )}

          {/* Acompanhamento de Horários */}
          {secaoAtiva === 'pontualidade' && resumoHorarioFiltrado && resumoHorarioFiltrado.tratos_com_horario > 0 && (
            <>
              <div id="pontualidade-dos-tratos" className="border-t border-gray-200 pt-4 scroll-mt-6">
                <h3 className="text-lg font-semibold text-gray-800">Pontualidade dos Tratos</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Compara o horário real de cada trato com o horário sugerido na programação.
                  Desvio positivo significa atraso, negativo significa adiantamento.
                </p>
              </div>

              {/* Cards de métricas de pontualidade */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                <Card className="p-4" disableHover>
                  <p className="text-xs text-gray-500 font-medium">Tratos no horário</p>
                  <p className="text-xl font-bold text-green-600 mt-1">{resumoHorarioFiltrado.tratos_no_horario}</p>
                  <p className="text-xs text-gray-400 mt-0.5">desvio até {TOLERANCIA_OK_MIN} min</p>
                </Card>
                <Card className="p-4" disableHover>
                  <p className="text-xs text-gray-500 font-medium">Atraso leve</p>
                  <p className="text-xl font-bold text-yellow-600 mt-1">{resumoHorarioFiltrado.tratos_atraso_leve}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{TOLERANCIA_OK_MIN} a {TOLERANCIA_ALERTA_MIN} min</p>
                </Card>
                <Card className="p-4" disableHover>
                  <p className="text-xs text-gray-500 font-medium">Atraso grave</p>
                  <p className="text-xl font-bold text-red-600 mt-1">{resumoHorarioFiltrado.tratos_atraso_grave}</p>
                  <p className="text-xs text-gray-400 mt-0.5">mais de {TOLERANCIA_ALERTA_MIN} min</p>
                </Card>
                <Card className="p-4" disableHover>
                  <p className="text-xs text-gray-500 font-medium">Desvio médio</p>
                  <p className={`text-xl font-bold mt-1 ${
                    resumoHorarioFiltrado.desvio_medio_min != null && Math.abs(resumoHorarioFiltrado.desvio_medio_min) > TOLERANCIA_ALERTA_MIN
                      ? 'text-red-600'
                      : resumoHorarioFiltrado.desvio_medio_min != null && Math.abs(resumoHorarioFiltrado.desvio_medio_min) > TOLERANCIA_OK_MIN
                      ? 'text-yellow-600'
                      : 'text-green-600'
                  }`}>
                    {formatDesvioMin(resumoHorarioFiltrado.desvio_medio_min)}
                  </p>
                </Card>
                <Card className="p-4" disableHover>
                  <p className="text-xs text-gray-500 font-medium">Pior desvio</p>
                  <p className={`text-xl font-bold mt-1 ${
                    resumoHorarioFiltrado.pior_desvio_min != null && Math.abs(resumoHorarioFiltrado.pior_desvio_min) > TOLERANCIA_ALERTA_MIN
                      ? 'text-red-600'
                      : resumoHorarioFiltrado.pior_desvio_min != null && Math.abs(resumoHorarioFiltrado.pior_desvio_min) > TOLERANCIA_OK_MIN
                      ? 'text-yellow-600'
                      : 'text-green-600'
                  }`}>
                    {formatDesvioMin(resumoHorarioFiltrado.pior_desvio_min)}
                  </p>
                </Card>
              </div>

              {/* Tabela detalhada de horários */}
              <Card className="p-4" disableHover>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Detalhamento por trato ({linhasHorarioFiltradas.length} registros)
                </h3>
                <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                  <table className="min-w-full divide-y divide-gray-200 sticky-header">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Lote</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Curral</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Trato</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Horário sugerido</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Horário real</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Desvio</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {linhasHorarioFiltradas.map((l, idx) => {
                        const cor = CORES_STATUS[l.status] || CORES_STATUS.sem_execucao
                        return (
                          <tr key={`${l.lote_id}-${l.data}-${l.ordem_trato}-${idx}`} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">{formatDate(l.data)}</td>
                            <td className="px-3 py-2 text-sm font-medium text-gray-800">{l.lote_nome}</td>
                            <td className="px-3 py-2 text-sm text-gray-600">{l.curral_nome || '—'}</td>
                            <td className="px-3 py-2 text-sm text-center text-gray-600">#{l.ordem_trato}</td>
                            <td className="px-3 py-2 text-sm text-center text-gray-700 font-mono">{l.horario_sugerido || '—'}</td>
                            <td className="px-3 py-2 text-sm text-center text-gray-700 font-mono">{l.horario_real || '—'}</td>
                            <td className={`px-3 py-2 text-sm text-right font-medium ${
                              l.desvio_min != null && Math.abs(l.desvio_min) > TOLERANCIA_ALERTA_MIN
                                ? 'text-red-600'
                                : l.desvio_min != null && Math.abs(l.desvio_min) > TOLERANCIA_OK_MIN
                                ? 'text-yellow-600'
                                : 'text-green-600'
                            }`}>
                              {formatDesvioMin(l.desvio_min)}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cor.bg} ${cor.text} ${cor.border} border`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${cor.dot}`} />
                                {l.status === 'sem_horario' ? 'Sem horário' : statusLabel(l.status)}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}

          {/* Tabela unificada: resumo por lote com detalhamento por dia expansível */}
          {secaoAtiva === 'resumo' && (
          <div id="resumo-por-lote" className="scroll-mt-6">
            <Card className="p-4" disableHover>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">
                Resumo por lote ({resumosFiltrados.length} lotes)
              </h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setLotesExpandidos(new Set(resumosFiltrados.map((r) => r.lote_id)))}
                  disabled={todosLotesExpandidos || resumosFiltrados.length === 0}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Expandir todos
                </button>
                <button
                  type="button"
                  onClick={() => setLotesExpandidos(new Set())}
                  disabled={nenhumLoteExpandido}
                  className="text-xs text-gray-500 hover:text-gray-700 font-medium disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Recolher todos
                </button>
              </div>
            </div>
            <div className="space-y-3 sm:hidden">
              {resumosFiltrados.map((r) => {
                const cor = CORES_STATUS[r.status]
                const expandido = lotesExpandidos.has(r.lote_id)
                const tratos = detalhesPorLote[r.lote_id] || []
                return (
                  <div key={`mobile-${r.lote_id}`} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={expandido}
                      aria-controls={`mobile-detalhe-lote-${r.lote_id}`}
                      onClick={() => toggleExpandirLote(r.lote_id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          toggleExpandirLote(r.lote_id)
                        }
                      }}
                      className="cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-lg"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-gray-800">{r.lote_nome}</p>
                          <p className="mt-1 text-xs text-gray-500">{r.dias_com_registro} de {r.dias_no_periodo} dias com registro</p>
                        </div>
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cor.bg} ${cor.text} ${cor.border}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${cor.dot}`} />
                          {statusLabel(r.status)}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <div><p className="text-xs text-gray-500">Planejado no período</p><p className="font-medium text-gray-800">{formatKg(r.planejado_total_kg)} kg</p></div>
                        <div><p className="text-xs text-gray-500">Real</p><p className="font-medium text-gray-800">{formatKg(r.real_total_kg)} kg</p></div>
                        <div><p className="text-xs text-gray-500">Diferença</p><p className={`font-medium ${cor.text}`}>{r.desvio_total_kg >= 0 ? '+' : ''}{formatKg(r.desvio_total_kg)} kg</p></div>
                        <div><p className="text-xs text-gray-500">Diferença (%)</p><p className={`font-medium ${cor.text}`}>{formatPct(r.desvio_medio_pct)}</p></div>
                      </div>
                    </div>
                    {expandido && lotesCarregandoDetalhes.has(r.lote_id) && (
                      <p className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-500">Carregando detalhes dos tratos...</p>
                    )}
                    {expandido && !lotesCarregandoDetalhes.has(r.lote_id) && tratos.length > 0 && (
                      <div id={`mobile-detalhe-lote-${r.lote_id}`} className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                        {tratos.map((trato, index) => (
                          <div key={`${trato.lote_id}-${trato.data}-${index}`} className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-gray-700">T{trato.ordem_trato} · {formatDate(trato.data)}</span>
                              <span>{trato.kg_real === 0 ? 'Zerado' : Math.abs(trato.desvio_kg) <= 1 ? 'No plano' : trato.desvio_kg > 0 ? 'Acima' : 'Abaixo'}</span>
                            </div>
                            <p className="mt-1">Planejado: {formatKg(trato.kg_planejado)} kg · Real: {formatKg(trato.kg_real)} kg · Desvio: {trato.desvio_kg >= 0 ? '+' : ''}{formatKg(trato.desvio_kg)} kg</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="hidden overflow-x-auto sm:block">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Lote</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Planejado no período</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Real</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Diferença no período (kg)</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Diferença no período (%)</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Dias c/ registro</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase"></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {resumosFiltrados.map((r) => {
                    const cor = CORES_STATUS[r.status]
                    const expandido = lotesExpandidos.has(r.lote_id)
                    const tratos = detalhesPorLote[r.lote_id] || []
                    return (
                      <Fragment key={r.lote_id}>
                        <tr
                          className="hover:bg-gray-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                          onClick={() => toggleExpandirLote(r.lote_id)}
                          onKeyDown={(event) => handleToggleLoteKeyDown(event, r.lote_id)}
                          tabIndex={0}
                          role="button"
                          aria-expanded={expandido}
                          aria-controls={`detalhe-lote-${r.lote_id}`}
                        >
                          <td className="px-3 py-2 text-sm font-medium text-gray-800 flex items-center gap-2">
                            <svg
                              className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${expandido ? 'rotate-90' : ''}`}
                              fill="none" stroke="currentColor" viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            {r.lote_nome}
                          </td>
                          <td className="px-3 py-2 text-sm text-right text-gray-700">{formatKg(r.planejado_total_kg)}</td>
                          <td className="px-3 py-2 text-sm text-right text-gray-700">{formatKg(r.real_total_kg)}</td>
                          <td className={`px-3 py-2 text-sm text-right font-medium ${cor.text}`}>
                            {r.desvio_total_kg >= 0 ? '+' : ''}{formatKg(r.desvio_total_kg)}
                          </td>
                          <td className={`px-3 py-2 text-sm text-right font-medium ${cor.text}`}>
                            {formatPct(r.desvio_medio_pct)}
                          </td>
                          <td className="px-3 py-2 text-sm text-center text-gray-600">
                            {r.dias_com_registro} / {r.dias_no_periodo}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cor.bg} ${cor.text} ${cor.border} border`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${cor.dot}`} />
                              {statusLabel(r.status)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center text-xs text-gray-400">
                            {tratos.length > 0 ? `${tratos.length} trato(s)` : ''}
                          </td>
                        </tr>
                        {expandido && lotesCarregandoDetalhes.has(r.lote_id) && (
                          <tr id={`detalhe-lote-${r.lote_id}`} className="bg-gray-50">
                            <td colSpan={8} className="px-4 py-4 text-sm text-gray-500">Carregando detalhes dos tratos...</td>
                          </tr>
                        )}
                        {expandido && !lotesCarregandoDetalhes.has(r.lote_id) && tratos.length > 0 && (
                          <tr id={`detalhe-lote-${r.lote_id}`} className="bg-gray-50">
                            <td colSpan={8} className="px-4 py-4">
                              <div className="space-y-2">
                                {tratos.map((t, idx) => {
                                  const desvioAbs = Math.abs(t.desvio_kg)
                                  const corTrato = t.kg_real === 0
                                    ? 'red'
                                    : desvioAbs <= 1
                                    ? 'green'
                                    : desvioAbs <= t.kg_planejado * 0.2
                                    ? 'yellow'
                                    : 'red'
                                  const corClasses = {
                                    red: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500' },
                                    yellow: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', dot: 'bg-yellow-500' },
                                    green: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', dot: 'bg-green-500' },
                                  }[corTrato]
                                  return (
                                    <div key={`${t.lote_id}-${t.data}-${idx}`} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2.5">
                                      <div className="flex items-center gap-2 w-20 shrink-0">
                                        <span className={`w-2 h-2 rounded-full ${corClasses.dot}`} />
                                        <span className="text-sm font-medium text-gray-700">T{t.ordem_trato}</span>
                                      </div>
                                      <span className="text-xs text-gray-400 w-16 shrink-0">{t.horario_real || '—'}</span>
                                      <span className="text-xs text-gray-400 w-24 shrink-0 hidden sm:inline">{formatDate(t.data)}</span>
                                      <div className="flex-1 flex items-center gap-4 text-sm">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-gray-400 text-xs">Planejado</span>
                                          <span className="font-medium text-gray-700">{formatKg(t.kg_planejado)} kg</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-gray-400 text-xs">Real</span>
                                          <span className={`font-medium ${t.kg_real === 0 ? 'text-red-600' : 'text-gray-800'}`}>{formatKg(t.kg_real)} kg</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-gray-400 text-xs">Desvio</span>
                                          <span className={`font-medium ${corClasses.text}`}>
                                            {t.desvio_kg >= 0 ? '+' : ''}{formatKg(t.desvio_kg)} kg
                                          </span>
                                        </div>
                                      </div>
                                      {t.leitura_cocho != null && (
                                        <span className="text-xs text-gray-400 shrink-0 hidden md:inline">Cocho: {t.leitura_cocho}</span>
                                      )}
                                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${corClasses.bg} ${corClasses.text} ${corClasses.border}`}>
                                        {t.kg_real === 0 ? 'Zerado' : desvioAbs <= 1 ? 'No plano' : t.desvio_kg > 0 ? 'Acima' : 'Abaixo'}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
            </Card>
          </div>
          )}
        </>
      )}
    </div>
  )
}
