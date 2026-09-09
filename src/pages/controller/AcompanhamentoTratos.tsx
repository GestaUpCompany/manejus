import { useEffect, useState, useMemo, useCallback, Fragment } from 'react'
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

const CORES_STATUS = {
  ok: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', dot: 'bg-green-500' },
  alerta: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', dot: 'bg-yellow-500' },
  critico: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500' },
  sem_execucao: { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', dot: 'bg-gray-400' },
  sem_horario: { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', dot: 'bg-gray-400' },
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

function formatDesvioMin(v: number | null | undefined): string {
  if (v == null) return '—'
  const sinal = v > 0 ? '+' : ''
  const abs = Math.abs(v)
  if (abs < 60) return `${sinal}${v} min`
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return `${sinal}${v < 0 ? '-' : ''}${h}h${m > 0 ? ` ${m}min` : ''}`
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

  // Filtros
  const hoje = new Date()
  const trintaAtras = new Date()
  trintaAtras.setDate(trintaAtras.getDate() - 30)
  const [dataInicio, setDataInicio] = useState(trintaAtras.toISOString().substring(0, 10))
  const [dataFim, setDataFim] = useState(hoje.toISOString().substring(0, 10))

  const [lotes, setLotes] = useState<LoteOption[]>([])
  const [lotesSelecionados, setLotesSelecionados] = useState<string[]>([])
  const [loteDropdownOpen, setLoteDropdownOpen] = useState(false)
  const [tipoFiltro, setTipoFiltro] = useState<TipoProgramacao | 'todos'>('todos')

  // Dados
  const [linhas, setLinhas] = useState<LinhaDesvio[]>([])
  const [resumos, setResumos] = useState<ResumoLote[]>([])
  const [linhasHorario, setLinhasHorario] = useState<LinhaHorario[]>([])
  const [linhasFabrica, setLinhasFabrica] = useState<LinhaFabricaAcompanhamento[]>([])
  const [detalheTratos, setDetalheTratos] = useState<Record<string, DetalheTratoLote[]>>({})

  // Lotes expandidos na tabela unificada
  const [lotesExpandidos, setLotesExpandidos] = useState<Set<string>>(new Set())

  const loadFazenda = useCallback(async () => {
    if (!user) return
    const fid = await getFazendaIdForUser(user.id)
    setFazendaId(fid)
    setLoadingFazenda(false)
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

  const loadData = useCallback(async () => {
    if (!fazendaId || !dataInicio || !dataFim) return
    setLoading(true)

    const [planejado, real, horarios, fabrica, detalhes] = await Promise.all([
      fetchPlanejadoPorLote(fazendaId),
      fetchRealPorLoteDia(fazendaId, dataInicio, dataFim),
      fetchHorariosTratos(fazendaId, dataInicio, dataFim, lotesSelecionados),
      fetchFabricaAcompanhamento(fazendaId, dataInicio, dataFim, lotesSelecionados),
      fetchDetalheTratosPorLote(fazendaId, dataInicio, dataFim),
    ])

    const cruzado = cruzarPlanejadoReal(planejado, real, dataInicio, dataFim, lotesSelecionados)
    const resumo = calcularResumoPorLote(cruzado, dataInicio, dataFim)

    setLinhas(cruzado)
    setResumos(resumo)
    setLinhasHorario(horarios)
    setLinhasFabrica(fabrica)
    setDetalheTratos(detalhes)
    setLoading(false)
  }, [fazendaId, dataInicio, dataFim, lotesSelecionados])

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

    return {
      planejadoTotal,
      realTotal,
      desvioTotal,
      desvioPctGlobal,
      diasComRegistro,
      totalLinhas: linhasFiltradas.length,
    }
  }, [linhasFiltradas])

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

  // Agrupar detalhe de tratos por lote_id (já vêm ordenados por data + ordem_trato do serviço)
  const detalhesPorLote = useMemo(() => detalheTratos, [detalheTratos])

  const toggleLote = (id: string) => {
    setLotesSelecionados((prev) =>
      prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id]
    )
  }

  const toggleExpandirLote = (loteId: string) => {
    setLotesExpandidos((prev) => {
      const next = new Set(prev)
      if (next.has(loteId)) next.delete(loteId)
      else next.add(loteId)
      return next
    })
  }

  const limparFiltros = () => {
    setLotesSelecionados([])
    setTipoFiltro('todos')
    setDataInicio(trintaAtras.toISOString().substring(0, 10))
    setDataFim(hoje.toISOString().substring(0, 10))
  }

  if (loadingFazenda) {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
        <CardSkeleton />
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
        <div className="flex flex-col lg:flex-row gap-4 lg:items-end">
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
          <div className="relative flex-1 max-w-xs">
            <label className="block text-xs font-medium text-gray-600 mb-1">Lotes</label>
            <button
              onClick={() => setLoteDropdownOpen(!loteDropdownOpen)}
              className="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg bg-white text-left flex items-center justify-between hover:border-gray-300 transition-colors"
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
              <div className="absolute z-10 mt-1 w-full max-h-60 overflow-y-auto bg-white border-2 border-gray-200 rounded-lg shadow-lg">
                {lotes.map((l) => (
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
                {lotes.length === 0 && (
                  <p className="px-3 py-2 text-sm text-gray-400">Nenhum lote ativo</p>
                )}
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

          <Button variant="secondary" size="sm" onClick={limparFiltros}>
            Limpar filtros
          </Button>
        </div>
      </Card>

      {loading ? (
        <div className="space-y-4">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : linhasFiltradas.length === 0 && linhasFabricaFiltradas.length === 0 ? (
        <Card className="p-8 text-center" disableHover>
          <p className="text-gray-500">Nenhum dado encontrado para o período selecionado.</p>
          <p className="text-sm text-gray-400 mt-1">
            Verifique se há programação, fabricação ou distribuição registrada no período.
          </p>
        </Card>
      ) : (
        <>
          {/* Cards de métricas globais */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <Card className="p-4" disableHover>
              <p className="text-xs text-gray-500 font-medium">Planejado total</p>
              <p className="text-xl font-bold text-gray-800 mt-1">{formatKg(metricas.planejadoTotal)} kg</p>
            </Card>
            <Card className="p-4" disableHover>
              <p className="text-xs text-gray-500 font-medium">Real executado</p>
              <p className="text-xl font-bold text-gray-800 mt-1">{formatKg(metricas.realTotal)} kg</p>
            </Card>
            <Card className="p-4" disableHover>
              <p className="text-xs text-gray-500 font-medium">Desvio total</p>
              <p className={`text-xl font-bold mt-1 ${metricas.desvioTotal < 0 ? 'text-red-600' : metricas.desvioTotal > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
                {metricas.desvioTotal >= 0 ? '+' : ''}{formatKg(metricas.desvioTotal)} kg
              </p>
            </Card>
            <Card className="p-4" disableHover>
              <p className="text-xs text-gray-500 font-medium">Desvio %</p>
              <p className={`text-xl font-bold mt-1 ${metricas.desvioPctGlobal != null && metricas.desvioPctGlobal < 0 ? 'text-red-600' : metricas.desvioPctGlobal != null && metricas.desvioPctGlobal > 5 ? 'text-yellow-600' : 'text-green-600'}`}>
                {formatPct(metricas.desvioPctGlobal)}
              </p>
            </Card>
            <Card className="p-4" disableHover>
              <p className="text-xs text-gray-500 font-medium">Dias com registro</p>
              <p className="text-xl font-bold text-gray-800 mt-1">{metricas.diasComRegistro}</p>
            </Card>
          </div>

          {/* Fábrica e conciliação */}
          <Card className="p-4" disableHover>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Fábrica e conciliação</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Compare o que foi produzido na Fábrica com o que foi distribuído por dieta e trato.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
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
              </div>
            </div>
            {linhasFabricaFiltradas.length === 0 ? (
              <p className="mt-4 rounded-lg bg-gray-50 p-4 text-sm text-gray-500">
                Nenhuma produção de fábrica encontrada para os filtros selecionados.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-3 py-2">Data</th>
                      <th className="px-3 py-2">Dieta</th>
                      <th className="px-3 py-2">Trato</th>
                      <th className="px-3 py-2">Vagão</th>
                      <th className="px-3 py-2 text-right">Previsto</th>
                      <th className="px-3 py-2 text-right">Produzido</th>
                      <th className="px-3 py-2 text-right">Distribuído</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {linhasFabricaFiltradas.map((linha) => (
                      <tr key={`${linha.data}-${linha.tipo}-${linha.formulacao_id}-${linha.ordem_trato}`}>
                        <td className="whitespace-nowrap px-3 py-2 text-gray-600">{formatDate(linha.data)}</td>
                        <td className="px-3 py-2 font-medium text-gray-800">{linha.formulacao_nome}</td>
                        <td className="px-3 py-2 text-gray-600">{linha.ordem_trato}º</td>
                        <td className="px-3 py-2 text-gray-600 text-sm">{linha.vagao_nome || '—'}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{formatKg(linha.previsto_kg)} kg</td>
                        <td className="px-3 py-2 text-right font-medium text-gray-800">{formatKg(linha.produzido_kg)} kg</td>
                        <td className="px-3 py-2 text-right text-gray-700">{formatKg(linha.distribuido_kg)} kg</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusFabricaClass(linha.status)}`}>
                            {statusFabricaLabel(linha.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                      <td className="px-3 py-2 text-gray-700" colSpan={4}>Total</td>
                      <td className="px-3 py-2 text-right text-gray-800">{formatKg(resumoFabrica.totalPrevisto)} kg</td>
                      <td className="px-3 py-2 text-right text-gray-800">{formatKg(resumoFabrica.totalProduzido)} kg</td>
                      <td className="px-3 py-2 text-right text-gray-800">{formatKg(resumoFabrica.totalDistribuido)} kg</td>
                      <td className="px-3 py-2"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Tendência do desvio ao longo do tempo */}
            <Card className="p-4" disableHover>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Tendência do desvio (%)</h3>
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
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Planejado vs Real por lote (kg)</h3>
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

          {/* Acompanhamento de Horários */}
          {resumoHorarioFiltrado && resumoHorarioFiltrado.tratos_com_horario > 0 && (
            <>
              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-lg font-semibold text-gray-800">Pontualidade dos Tratos</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Compara o horário real de cada trato com o horário sugerido na programação.
                  Desvio positivo significa atraso, negativo significa adiantamento.
                </p>
              </div>

              {/* Cards de métricas de pontualidade */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <Card className="p-4" disableHover>
                  <p className="text-xs text-gray-500 font-medium">Tratos no horário</p>
                  <p className="text-xl font-bold text-green-600 mt-1">{resumoHorarioFiltrado.tratos_no_horario}</p>
                  <p className="text-xs text-gray-400 mt-0.5">desvio até 15 min</p>
                </Card>
                <Card className="p-4" disableHover>
                  <p className="text-xs text-gray-500 font-medium">Atraso leve</p>
                  <p className="text-xl font-bold text-yellow-600 mt-1">{resumoHorarioFiltrado.tratos_atraso_leve}</p>
                  <p className="text-xs text-gray-400 mt-0.5">15 a 30 min</p>
                </Card>
                <Card className="p-4" disableHover>
                  <p className="text-xs text-gray-500 font-medium">Atraso grave</p>
                  <p className="text-xl font-bold text-red-600 mt-1">{resumoHorarioFiltrado.tratos_atraso_grave}</p>
                  <p className="text-xs text-gray-400 mt-0.5">mais de 30 min</p>
                </Card>
                <Card className="p-4" disableHover>
                  <p className="text-xs text-gray-500 font-medium">Desvio médio</p>
                  <p className={`text-xl font-bold mt-1 ${
                    resumoHorarioFiltrado.desvio_medio_min != null && Math.abs(resumoHorarioFiltrado.desvio_medio_min) > 30
                      ? 'text-red-600'
                      : resumoHorarioFiltrado.desvio_medio_min != null && Math.abs(resumoHorarioFiltrado.desvio_medio_min) > 15
                      ? 'text-yellow-600'
                      : 'text-green-600'
                  }`}>
                    {formatDesvioMin(resumoHorarioFiltrado.desvio_medio_min)}
                  </p>
                </Card>
                <Card className="p-4" disableHover>
                  <p className="text-xs text-gray-500 font-medium">Pior desvio</p>
                  <p className={`text-xl font-bold mt-1 ${
                    resumoHorarioFiltrado.pior_desvio_min != null && Math.abs(resumoHorarioFiltrado.pior_desvio_min) > 30
                      ? 'text-red-600'
                      : resumoHorarioFiltrado.pior_desvio_min != null && Math.abs(resumoHorarioFiltrado.pior_desvio_min) > 15
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
                              l.desvio_min != null && Math.abs(l.desvio_min) > 30
                                ? 'text-red-600'
                                : l.desvio_min != null && Math.abs(l.desvio_min) > 15
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
          <Card className="p-4" disableHover>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">
                Resumo por lote ({resumosFiltrados.length} lotes)
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setLotesExpandidos(new Set(resumosFiltrados.map((r) => r.lote_id)))}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  Expandir todos
                </button>
                <button
                  onClick={() => setLotesExpandidos(new Set())}
                  className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                >
                  Recolher todos
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Lote</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Planejado</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Real</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Desvio kg</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Desvio %</th>
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
                        <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => toggleExpandirLote(r.lote_id)}>
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
                          <td className={`px-3 py-2 text-sm text-right font-medium ${r.desvio_total_kg < 0 ? 'text-red-600' : r.desvio_total_kg > 0 ? 'text-yellow-600' : 'text-gray-700'}`}>
                            {r.desvio_total_kg >= 0 ? '+' : ''}{formatKg(r.desvio_total_kg)}
                          </td>
                          <td className={`px-3 py-2 text-sm text-right font-medium ${r.desvio_medio_pct < 0 ? 'text-red-600' : r.desvio_medio_pct > 5 ? 'text-yellow-600' : 'text-green-600'}`}>
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
                        {expandido && tratos.length > 0 && (
                          <tr className="bg-gray-50">
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
        </>
      )}
    </div>
  )
}
