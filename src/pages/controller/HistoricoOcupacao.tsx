import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Card, CardSkeleton } from '../../components/ui'
import { getFazendaIdForUser } from '../../utils/fazendaContext'
import { useLotes, usePastos } from '../../hooks/useFazendaQueries'

interface HistoricoItem {
  historico_id: string
  lote_id: string
  lote_nome: string
  pasto_id?: string
  pasto_nome?: string
  modulo_id?: string
  modulo_nome?: string
  data_hora_entrada: string
  data_hora_saida?: string | null
  cabecas_entrada?: number | null
  peso_vivo_medio_entrada_kg?: number | null
  cabecas_saida?: number | null
  peso_vivo_medio_saida_kg?: number | null
  meta_intervalo_ocupacao_dias?: number | null
  desvio_tempo_ocupacao_percent?: number | null
  taxa_lotacao_ua_ha?: number | null
  periodo_ocupacao_dias?: number | null
  periodo_ocupacao_horas?: number | null
}

type VisualizacaoTipo = 'pasto' | 'modulo'

export function HistoricoOcupacao() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [historico, setHistorico] = useState<HistoricoItem[]>([])
  const [tipo, setTipo] = useState<VisualizacaoTipo>('pasto')
  const [searchTerm, setSearchTerm] = useState('')

  // Filtros temporais
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [periodoRapido, setPeriodoRapido] = useState('')

  // Filtros por entidade
  const [loteSelecionado, setLoteSelecionado] = useState('')
  const [pastoSelecionado, setPastoSelecionado] = useState('')
  const [moduloSelecionado, setModuloSelecionado] = useState('')
  const [fazendaId, setFazendaId] = useState<string | undefined>(undefined)
  const [modulosDisponiveis, setModulosDisponiveis] = useState<{id: string, nome: string}[]>([])

  const { data: lotesDisponiveis = [] } = useLotes(fazendaId)
  const { data: pastosDisponiveis = [] } = usePastos(fazendaId)

  // Filtros por métricas
  const [taxaLotacaoMin, setTaxaLotacaoMin] = useState('')
  const [taxaLotacaoMax, setTaxaLotacaoMax] = useState('')
  const [diasMin, setDiasMin] = useState('')
  const [diasMax, setDiasMax] = useState('')

  // Filtro de status
  const [statusFiltro, setStatusFiltro] = useState<'todos' | 'ativos' | 'encerrados'>('todos')

  // Paginação
  const [paginaAtual, setPaginaAtual] = useState(1)
  const ITENS_POR_PAGINA = 25

  useEffect(() => {
    if (!user) return
    getFazendaIdForUser(user.id).then(id => setFazendaId(id || undefined))
  }, [user])

  useEffect(() => {
    loadHistorico()
  }, [user, tipo, fazendaId, lotesDisponiveis])

  useEffect(() => {
    setPaginaAtual(1)
  }, [searchTerm, statusFiltro, dataInicio, dataFim, periodoRapido, loteSelecionado, pastoSelecionado, moduloSelecionado, taxaLotacaoMin, taxaLotacaoMax, diasMin, diasMax, tipo])

  const loadHistorico = async () => {
    if (!user || !fazendaId) return
    setLoading(true)

    // Buscar módulos da fazenda para os filtros
    const { data: modulosData } = await supabase
      .from('modulos_pastos')
      .select('id, nome')
      .eq('fazenda_id', fazendaId)
      .order('nome')

    setModulosDisponiveis(modulosData || [])

    const loteIds = lotesDisponiveis.map((l) => l.id)

    if (loteIds.length === 0) {
      setHistorico([])
      setLoading(false)
      return
    }

    const viewName = tipo === 'pasto' ? 'v_historico_ocupacao_pasto' : 'v_historico_ocupacao_modulo'

    const { data, error } = await supabase
      .from(viewName as any)
      .select('*')
      .in('lote_id', loteIds)
      .order('data_hora_entrada', { ascending: false })

    if (error) {
      console.error('Erro ao carregar histórico:', error)
    } else {
      setHistorico((data || []) as unknown as HistoricoItem[])
    }

    setLoading(false)
  }

  const filtrado = useMemo(() => {
    const termoBusca = searchTerm.toLowerCase().trim()
    const minTaxa = taxaLotacaoMin ? parseFloat(taxaLotacaoMin) : null
    const maxTaxa = taxaLotacaoMax ? parseFloat(taxaLotacaoMax) : null
    const minDias = diasMin ? parseFloat(diasMin) : null
    const maxDias = diasMax ? parseFloat(diasMax) : null
    const dataInicioValue = dataInicio ? new Date(dataInicio).getTime() : null
    const dataFimValue = dataFim ? new Date(dataFim).getTime() + 24 * 60 * 60 * 1000 - 1 : null

    let limitePeriodoRapido: number | null = null
    if (periodoRapido) {
      const diasAtras = { '7': 7, '30': 30, '90': 90, '365': 365 }[periodoRapido] || 0
      if (diasAtras > 0) {
        limitePeriodoRapido = new Date().getTime() - diasAtras * 24 * 60 * 60 * 1000
      }
    }

    return historico.filter((item) => {
      if (termoBusca) {
        const busca =
          item.lote_nome.toLowerCase().includes(termoBusca) ||
          (item.pasto_nome?.toLowerCase().includes(termoBusca) ?? false) ||
          (item.modulo_nome?.toLowerCase().includes(termoBusca) ?? false)
        if (!busca) return false
      }

      if (statusFiltro === 'ativos' && item.data_hora_saida != null) return false
      if (statusFiltro === 'encerrados' && item.data_hora_saida == null) return false

      const dataEntrada = new Date(item.data_hora_entrada).getTime()
      if (dataInicioValue && dataEntrada < dataInicioValue) return false
      if (dataFimValue && dataEntrada > dataFimValue) return false
      if (limitePeriodoRapido && dataEntrada < limitePeriodoRapido) return false

      if (loteSelecionado && item.lote_id !== loteSelecionado) return false
      if (pastoSelecionado && item.pasto_id !== pastoSelecionado) return false
      if (moduloSelecionado && item.modulo_id !== moduloSelecionado) return false

      if (minTaxa != null && (item.taxa_lotacao_ua_ha == null || item.taxa_lotacao_ua_ha < minTaxa)) return false
      if (maxTaxa != null && (item.taxa_lotacao_ua_ha == null || item.taxa_lotacao_ua_ha > maxTaxa)) return false
      if (minDias != null && (item.periodo_ocupacao_dias == null || item.periodo_ocupacao_dias < minDias)) return false
      if (maxDias != null && (item.periodo_ocupacao_dias == null || item.periodo_ocupacao_dias > maxDias)) return false

      return true
    })
  }, [historico, searchTerm, statusFiltro, dataInicio, dataFim, periodoRapido, loteSelecionado, pastoSelecionado, moduloSelecionado, taxaLotacaoMin, taxaLotacaoMax, diasMin, diasMax])

  const totalPaginas = Math.max(1, Math.ceil(filtrado.length / ITENS_POR_PAGINA))
  const paginaSegura = Math.min(paginaAtual, totalPaginas)
  const itensPaginados = filtrado.slice((paginaSegura - 1) * ITENS_POR_PAGINA, paginaSegura * ITENS_POR_PAGINA)

  const formatarData = (dataStr?: string | null) => {
    if (!dataStr) return '—'
    return new Date(dataStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  const formatarPeso = (peso?: number | null) => {
    if (peso == null) return '—'
    return `${peso.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`
  }

  const getDesvioClass = (desvio?: number | null) => {
    if (desvio == null) return 'text-gray-500'
    if (desvio > 0) return 'text-red-600 font-semibold'
    return 'text-green-600'
  }

  const limparFiltros = () => {
    setSearchTerm('')
    setStatusFiltro('todos')
    setDataInicio('')
    setDataFim('')
    setPeriodoRapido('')
    setLoteSelecionado('')
    setPastoSelecionado('')
    setModuloSelecionado('')
    setTaxaLotacaoMin('')
    setTaxaLotacaoMax('')
    setDiasMin('')
    setDiasMax('')
  }

  // Quando período rápido é selecionado, limpar os inputs de data manual
  useEffect(() => {
    if (periodoRapido) {
      setDataInicio('')
      setDataFim('')
    }
  }, [periodoRapido])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Histórico de Ocupação</h1>
          <p className="text-sm text-gray-500 mt-1">Entradas e saídas de lotes em pastos e módulos</p>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <div className="space-y-3">
          {/* Primeira linha: Toggle, Busca, Status */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 items-stretch sm:items-center">
            {/* Toggle Pasto / Módulo */}
            <div className="flex bg-gray-100 rounded-lg p-1 w-full sm:w-auto">
              <button
                onClick={() => setTipo('pasto')}
                className={`flex-1 sm:flex-none px-3 py-2 rounded-md text-sm font-medium transition-all ${
                  tipo === 'pasto' ? 'bg-white text-primary shadow-sm' : 'text-gray-600'
                }`}
              >
                Por Pasto
              </button>
              <button
                onClick={() => setTipo('modulo')}
                className={`flex-1 sm:flex-none px-3 py-2 rounded-md text-sm font-medium transition-all ${
                  tipo === 'modulo' ? 'bg-white text-primary shadow-sm' : 'text-gray-600'
                }`}
              >
                Por Módulo
              </button>
            </div>

            {/* Busca geral */}
            <div className="flex-1 min-w-[180px]">
              <input
                type="text"
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            {/* Status */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600">Status:</label>
              <select
                value={statusFiltro}
                onChange={(e) => setStatusFiltro(e.target.value as 'todos' | 'ativos' | 'encerrados')}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent w-full sm:w-auto"
              >
                <option value="todos">Todos</option>
                <option value="ativos">Ativos</option>
                <option value="encerrados">Encerrados</option>
              </select>
            </div>
          </div>

          {/* Segunda linha: Filtros agrupados */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 items-stretch sm:items-center text-sm">
            {/* Filtros temporais */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg w-full sm:w-auto">
              <span className="text-xs font-medium text-gray-600 whitespace-nowrap">Data:</span>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="px-2 py-1.5 border border-gray-300 rounded text-xs w-full sm:w-auto"
              />
              <span className="text-gray-400 hidden sm:inline">—</span>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="px-2 py-1.5 border border-gray-300 rounded text-xs w-full sm:w-auto"
              />
              <select
                value={periodoRapido}
                onChange={(e) => setPeriodoRapido(e.target.value)}
                className="px-2 py-1.5 border border-gray-300 rounded text-xs w-full sm:w-auto"
              >
                <option value="">Rápido</option>
                <option value="7">7d</option>
                <option value="30">30d</option>
                <option value="90">90d</option>
                <option value="365">1a</option>
              </select>
            </div>

            {/* Filtros por entidade */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg w-full sm:w-auto">
              <span className="text-xs font-medium text-gray-600 whitespace-nowrap">Entidade:</span>
              <select
                value={loteSelecionado}
                onChange={(e) => setLoteSelecionado(e.target.value)}
                className="px-2 py-1.5 border border-gray-300 rounded text-xs w-full sm:w-auto min-w-[120px]"
              >
                <option value="">Lote</option>
                {lotesDisponiveis.map(l => (
                  <option key={l.id} value={l.id}>{l.nome}</option>
                ))}
              </select>
              <select
                value={pastoSelecionado}
                onChange={(e) => setPastoSelecionado(e.target.value)}
                className="px-2 py-1.5 border border-gray-300 rounded text-xs w-full sm:w-auto min-w-[120px]"
              >
                <option value="">Pasto</option>
                {pastosDisponiveis.map(p => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
              <select
                value={moduloSelecionado}
                onChange={(e) => setModuloSelecionado(e.target.value)}
                className="px-2 py-1.5 border border-gray-300 rounded text-xs w-full sm:w-auto min-w-[120px]"
              >
                <option value="">Módulo</option>
                {modulosDisponiveis.map(m => (
                  <option key={m.id} value={m.id}>{m.nome}</option>
                ))}
              </select>
            </div>

            {/* Filtros por métricas */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg w-full sm:w-auto">
              <span className="text-xs font-medium text-gray-600 whitespace-nowrap">Métricas:</span>
              <div className="flex items-center gap-1 w-full sm:w-auto">
                <span className="text-xs text-gray-500 whitespace-nowrap">UA/ha</span>
                <input
                  type="number"
                  placeholder="Min"
                  value={taxaLotacaoMin}
                  onChange={(e) => setTaxaLotacaoMin(e.target.value)}
                  className="w-16 px-2 py-1.5 border border-gray-300 rounded text-xs"
                />
                <span className="text-gray-400">-</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={taxaLotacaoMax}
                  onChange={(e) => setTaxaLotacaoMax(e.target.value)}
                  className="w-16 px-2 py-1.5 border border-gray-300 rounded text-xs"
                />
              </div>
              <div className="flex items-center gap-1 w-full sm:w-auto">
                <span className="text-xs text-gray-500 whitespace-nowrap">Dias</span>
                <input
                  type="number"
                  placeholder="Min"
                  value={diasMin}
                  onChange={(e) => setDiasMin(e.target.value)}
                  className="w-12 px-1 py-1.5 border border-gray-300 rounded text-xs"
                />
                <span className="text-gray-400">-</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={diasMax}
                  onChange={(e) => setDiasMax(e.target.value)}
                  className="w-12 px-1 py-1.5 border border-gray-300 rounded text-xs"
                />
              </div>
            </div>

            {/* Botão limpar filtros */}
            <button
              onClick={limparFiltros}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors w-full sm:w-auto"
            >
              Limpar filtros
            </button>
          </div>
        </div>
      </Card>

      {/* Tabela */}
      {loading ? (
        <div className="space-y-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : filtrado.length === 0 ? (
        <Card>
          <p className="text-center text-gray-500 py-8">
            {searchTerm || statusFiltro !== 'todos' || dataInicio || dataFim || periodoRapido || loteSelecionado || pastoSelecionado || moduloSelecionado || taxaLotacaoMin || taxaLotacaoMax || diasMin || diasMax ? 'Nenhum registro encontrado com os filtros aplicados' : 'Nenhum histórico de ocupação disponível'}
          </p>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Lote</th>
                  {tipo === 'pasto' ? (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Pasto</th>
                  ) : (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Módulo</th>
                  )}
                  {tipo === 'pasto' && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Módulo</th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Entrada</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Saída</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Dias</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Cab. Entrada</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Peso Entrada</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Cab. Saída</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Peso Saída</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Meta (dias)</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Desvio (%)</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-blue-600 uppercase tracking-wider">Taxa (UA/ha)</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {itensPaginados.map((item) => (
                  <tr key={item.historico_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{item.lote_nome}</td>
                    {tipo === 'pasto' ? (
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{item.pasto_nome || '—'}</td>
                    ) : (
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{item.modulo_nome || '—'}</td>
                    )}
                    {tipo === 'pasto' && (
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{item.modulo_nome || '—'}</td>
                    )}
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatarData(item.data_hora_entrada)}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatarData(item.data_hora_saida)}</td>
                    <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">
                      {item.periodo_ocupacao_dias != null ? (
                        <span className={item.meta_intervalo_ocupacao_dias && item.periodo_ocupacao_dias > item.meta_intervalo_ocupacao_dias ? 'text-red-600 font-semibold' : ''}>
                          {item.periodo_ocupacao_dias}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{item.cabecas_entrada ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{formatarPeso(item.peso_vivo_medio_entrada_kg)}</td>
                    <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{item.cabecas_saida ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{formatarPeso(item.peso_vivo_medio_saida_kg)}</td>
                    <td className="px-4 py-3 text-right text-gray-500 whitespace-nowrap">{item.meta_intervalo_ocupacao_dias ?? '—'}</td>
                    <td className={`px-4 py-3 text-right whitespace-nowrap ${getDesvioClass(item.desvio_tempo_ocupacao_percent)}`}>
                      {item.desvio_tempo_ocupacao_percent != null
                        ? `${item.desvio_tempo_ocupacao_percent > 0 ? '+' : ''}${item.desvio_tempo_ocupacao_percent.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap font-semibold text-blue-700">
                      {item.taxa_lotacao_ua_ha != null
                        ? item.taxa_lotacao_ua_ha.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      {item.data_hora_saida == null ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          Encerrado
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 pb-2 mt-3">
            <p className="text-xs text-gray-400">
              {filtrado.length} registro{filtrado.length !== 1 ? 's' : ''} | Página {paginaSegura} de {totalPaginas}
            </p>
            {totalPaginas > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPaginaAtual((p) => Math.max(1, p - 1))}
                  disabled={paginaSegura === 1}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setPaginaAtual((p) => Math.min(totalPaginas, p + 1))}
                  disabled={paginaSegura === totalPaginas}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Próxima
                </button>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
