import { useEffect, useState, useMemo, useCallback } from 'react'
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
  type LinhaDesvio,
  type ResumoLote,
  type LinhaHorario,
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

  // Ordenação da tabela
  const [sortField, setSortField] = useState<'data' | 'lote_nome' | 'planejado_kg' | 'real_kg' | 'desvio_pct'>('data')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

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

    const [planejado, real, horarios] = await Promise.all([
      fetchPlanejadoPorLote(fazendaId),
      fetchRealPorLoteDia(fazendaId, dataInicio, dataFim),
      fetchHorariosTratos(fazendaId, dataInicio, dataFim, lotesSelecionados),
    ])

    const cruzado = cruzarPlanejadoReal(planejado, real, dataInicio, dataFim, lotesSelecionados)
    const resumo = calcularResumoPorLote(cruzado, dataInicio, dataFim)

    setLinhas(cruzado)
    setResumos(resumo)
    setLinhasHorario(horarios)
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

  const resumoHorarioFiltrado = useMemo(() => {
    return calcularResumoHorarios(linhasHorarioFiltradas)
  }, [linhasHorarioFiltradas])

  // Métricas globais
  const metricas = useMemo(() => {
    let planejadoTotal = 0
    let realTotal = 0
    let diasComRegistro = 0

    for (const l of linhasFiltradas) {
      if (l.planejado_kg != null) planejadoTotal += l.planejado_kg
      realTotal += l.real_kg
      if (l.n_tratos > 0) diasComRegistro++
    }

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

  // Tabela ordenada
  const linhasOrdenadas = useMemo(() => {
    const sorted = [...linhasFiltradas]
    sorted.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'data':
          cmp = a.data.localeCompare(b.data)
          break
        case 'lote_nome':
          cmp = a.lote_nome.localeCompare(b.lote_nome)
          break
        case 'planejado_kg':
          cmp = (a.planejado_kg ?? -1) - (b.planejado_kg ?? -1)
          break
        case 'real_kg':
          cmp = a.real_kg - b.real_kg
          break
        case 'desvio_pct':
          cmp = (a.desvio_pct ?? -999) - (b.desvio_pct ?? -999)
          break
      }
      return sortOrder === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [linhasFiltradas, sortField, sortOrder])

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  const toggleLote = (id: string) => {
    setLotesSelecionados((prev) =>
      prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id]
    )
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
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Acompanhamento de Tratos</h1>
        <p className="text-sm text-gray-500 mt-1">
          Compare o kg planejado por dia com o kg realmente tratado, por lote. Identifique desvios e tendências.
        </p>
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
      ) : linhasFiltradas.length === 0 ? (
        <Card className="p-8 text-center" disableHover>
          <p className="text-gray-500">Nenhum dado encontrado para o período selecionado.</p>
          <p className="text-sm text-gray-400 mt-1">
            Verifique se há programação de tratos configurada e registros de suplementação no período.
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

          {/* Resumo por lote */}
          <Card className="p-4" disableHover>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Resumo por lote</h3>
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
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {resumosFiltrados.map((r) => {
                    const cor = CORES_STATUS[r.status]
                    return (
                      <tr key={r.lote_id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-sm font-medium text-gray-800">{r.lote_nome}</td>
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
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Tabela detalhada lote × dia */}
          <Card className="p-4" disableHover>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Detalhamento por lote × dia ({linhasOrdenadas.length} linhas)
            </h3>
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="min-w-full divide-y divide-gray-200 sticky-header">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onClick={() => handleSort('data')}>
                      Data {sortField === 'data' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onClick={() => handleSort('lote_nome')}>
                      Lote {sortField === 'lote_nome' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Curral</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onClick={() => handleSort('planejado_kg')}>
                      Planejado (kg) {sortField === 'planejado_kg' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onClick={() => handleSort('real_kg')}>
                      Real (kg) {sortField === 'real_kg' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Desvio (kg)</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100" onClick={() => handleSort('desvio_pct')}>
                      Desvio (%) {sortField === 'desvio_pct' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Nº tratos</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Leitura</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tratador</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {linhasOrdenadas.map((l, idx) => {
                    const cor = CORES_STATUS[l.status]
                    return (
                      <tr key={`${l.lote_id}-${l.data}-${idx}`} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-sm text-gray-700 whitespace-nowrap">{formatDate(l.data)}</td>
                        <td className="px-3 py-2 text-sm font-medium text-gray-800">{l.lote_nome}</td>
                        <td className="px-3 py-2 text-sm text-gray-600">{l.curral_nome || '—'}</td>
                        <td className="px-3 py-2 text-sm text-right text-gray-700">{formatKg(l.planejado_kg)}</td>
                        <td className="px-3 py-2 text-sm text-right text-gray-700">{formatKg(l.real_kg)}</td>
                        <td className={`px-3 py-2 text-sm text-right font-medium ${l.desvio_kg != null && l.desvio_kg < 0 ? 'text-red-600' : l.desvio_kg != null && l.desvio_kg > 0 ? 'text-yellow-600' : 'text-gray-700'}`}>
                          {l.desvio_kg != null ? `${l.desvio_kg >= 0 ? '+' : ''}${formatKg(l.desvio_kg)}` : '—'}
                        </td>
                        <td className={`px-3 py-2 text-sm text-right font-medium ${l.desvio_pct != null && l.desvio_pct < 0 ? 'text-red-600' : l.desvio_pct != null && l.desvio_pct > 5 ? 'text-yellow-600' : 'text-green-600'}`}>
                          {formatPct(l.desvio_pct)}
                        </td>
                        <td className="px-3 py-2 text-sm text-center text-gray-600">{l.n_tratos}</td>
                        <td className="px-3 py-2 text-sm text-center text-gray-600">
                          {l.leitura_media != null ? l.leitura_media.toFixed(1) : '—'}
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-600 whitespace-nowrap">{l.tratador || '—'}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cor.bg} ${cor.text} ${cor.border} border`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${cor.dot}`} />
                            {statusLabel(l.status)}
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
    </div>
  )
}
