import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, Input, CardSkeleton, Select, Pagination } from '../../components/ui'
import { getFazendaIdForUser } from '../../utils/fazendaContext'
import { useLotes, usePastos } from '../../hooks/useFazendaQueries'

interface Individuo {
  id: string
  fazenda_id: string
  id_manejo?: string
  id_brinco?: string
  id_chip?: string
  id_provisorio_cria?: string
  sexo: string
  categoria: string
  raca: string
  data_nascimento?: string
  peso_nascimento_kg?: number
  peso_atual_kg?: number
  status: string
  origem?: string
  sync_status?: string
  lote_atual?: string
  pasto_atual?: string
  created_at: string
  updated_at: string
}

interface Raca {
  id: string
  nome: string
}

const categorias = [
  'Bezerro ao Pé', 'Bezerra ao Pé', 'Bezerro Desmama', 'Bezerra Desmama',
  'Garrote', 'Novilha', 'Boi Magro', 'Primípara', 'Vaca Parida',
  'Vaca Prenha', 'Vaca Vazia', 'Vaca Descarte', 'Touro'
]

const statusList = ['Vivo', 'Abatido', 'Doado', 'Morto', 'Transferido', 'Venda Vivo']

const sexos = ['Macho', 'Fêmea']

const origens = ['Compra', 'Doação', 'Nascimento', 'Transferência']

const syncStatusList = [
  { value: 'automatico_incompleto', label: 'Criado automaticamente' },
  { value: 'manual_completo', label: 'Completo' },
  { value: 'manual_incompleto', label: 'Incompleto' },
]

const PER_PAGE_OPTIONS = [10, 25, 50, 100]
const PER_PAGE_STORAGE_KEY = 'gestaup_individuos_per_page'

function getStoredPerPage(): number {
  const stored = localStorage.getItem(PER_PAGE_STORAGE_KEY)
  const value = stored ? Number(stored) : 50
  return PER_PAGE_OPTIONS.includes(value) ? value : 50
}

export function Individuos() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [individuos, setIndividuos] = useState<Individuo[]>([])
  const [fazendaId, setFazendaId] = useState<string | undefined>(undefined)
  const [racas, setRacas] = useState<Raca[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filtroTipoIdentificacao, setFiltroTipoIdentificacao] = useState<'todos' | 'brinco' | 'chip' | 'manejo' | 'provisorio'>('todos')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroSexo, setFiltroSexo] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroRaca, setFiltroRaca] = useState('')
  const [filtroOrigem, setFiltroOrigem] = useState('')
  const [filtroSyncStatus, setFiltroSyncStatus] = useState('')
  const [filtroLote, setFiltroLote] = useState('')
  const [filtroPasto, setFiltroPasto] = useState('')
  const [filtroIncompletos, setFiltroIncompletos] = useState(false)
  const [filtroAutomaticos, setFiltroAutomaticos] = useState(false)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(getStoredPerPage)
  const [totalCount, setTotalCount] = useState(0)

  const { data: lotes = [] } = useLotes(fazendaId)
  const { data: pastos = [] } = usePastos(fazendaId)

  const from = (page - 1) * perPage
  const to = from + perPage - 1

  useEffect(() => {
    loadData()
  }, [user, page, perPage])

  useEffect(() => {
    setPage(1)
  }, [
    searchTerm,
    filtroTipoIdentificacao,
    filtroStatus,
    filtroSexo,
    filtroCategoria,
    filtroRaca,
    filtroOrigem,
    filtroSyncStatus,
    filtroLote,
    filtroPasto,
    filtroIncompletos,
    filtroAutomaticos,
    perPage,
  ])

  useEffect(() => {
    if (!user) return

    let subscription: any
    let isMounted = true

    const setupSubscription = async () => {
      const isAdmin = user.papel === 'admin'
      let fazendaId: string | null = null

      if (!isAdmin) {
        const _fazendaId = await getFazendaIdForUser(user.id)
        fazendaId = _fazendaId
        if (!fazendaId || !isMounted) return
      }

      const channelName = fazendaId ? `individuos_changes_${fazendaId}` : 'individuos_changes_admin'
      const filterConfig: any = {
        event: '*',
        schema: 'public',
        table: 'individuos',
      }
      if (fazendaId) filterConfig.filter = `fazenda_id=eq.${fazendaId}`

      subscription = supabase
        .channel(channelName)
        .on('postgres_changes', filterConfig, () => {
          if (isMounted) {
            loadData()
          }
        })
        .subscribe()
    }

    setupSubscription()

    return () => {
      isMounted = false
      if (subscription) {
        supabase.removeChannel(subscription)
      }
    }
  }, [user])

  const buildFilters = (query: any) => {
    if (filtroStatus) query = query.eq('status', filtroStatus)
    if (filtroSexo) query = query.eq('sexo', filtroSexo)
    if (filtroCategoria) query = query.eq('categoria', filtroCategoria)
    if (filtroRaca) query = query.eq('raca', filtroRaca)
    if (filtroOrigem) query = query.eq('origem', filtroOrigem)
    if (filtroSyncStatus) query = query.eq('sync_status', filtroSyncStatus)
    if (filtroLote) query = query.eq('lote_atual', filtroLote)
    if (filtroPasto) query = query.eq('pasto_atual', filtroPasto)

    if (filtroIncompletos) {
      query = query.in('sync_status', ['automatico_incompleto', 'manual_incompleto'])
    } else if (filtroAutomaticos) {
      query = query.eq('sync_status', 'automatico_incompleto')
    }

    const term = searchTerm.trim().toLowerCase()
    if (term) {
      const ilikeTerm = `%${term}%`
      if (filtroTipoIdentificacao === 'brinco') {
        query = query.ilike('id_brinco', ilikeTerm)
      } else if (filtroTipoIdentificacao === 'chip') {
        query = query.ilike('id_chip', ilikeTerm)
      } else if (filtroTipoIdentificacao === 'manejo') {
        query = query.ilike('id_manejo', ilikeTerm)
      } else if (filtroTipoIdentificacao === 'provisorio') {
        query = query.ilike('id_provisorio_cria', ilikeTerm)
      } else {
        query = query.or(
          `id_brinco.ilike.${ilikeTerm}, id_chip.ilike.${ilikeTerm}, id_manejo.ilike.${ilikeTerm}, id_provisorio_cria.ilike.${ilikeTerm}`
        )
      }
    } else if (filtroTipoIdentificacao !== 'todos') {
      if (filtroTipoIdentificacao === 'brinco') query = query.not('id_brinco', 'is', null)
      else if (filtroTipoIdentificacao === 'chip') query = query.not('id_chip', 'is', null)
      else if (filtroTipoIdentificacao === 'manejo') query = query.not('id_manejo', 'is', null)
      else if (filtroTipoIdentificacao === 'provisorio') query = query.not('id_provisorio_cria', 'is', null)
    }

    return query
  }

  const loadData = async () => {
    if (!user) return

    const isAdmin = user.papel === 'admin'
    let fazendaId: string | null = null

    if (!isAdmin) {
      const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

      if (!vinculos || vinculos.length === 0) return
      fazendaId = vinculos[0].fazenda_id
    }

    setFazendaId(fazendaId || undefined)

    let countQuery: any = supabase
      .from('individuos')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null)
    if (fazendaId) countQuery = countQuery.eq('fazenda_id', fazendaId)
    countQuery = buildFilters(countQuery)

    let dataQuery: any = supabase
      .from('individuos')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    if (fazendaId) dataQuery = dataQuery.eq('fazenda_id', fazendaId)
    dataQuery = buildFilters(dataQuery)
    dataQuery = dataQuery.range(from, to)

    let racasQuery = supabase.from('racas').select('id, nome').is('deleted_at', null)
    if (fazendaId) racasQuery = racasQuery.eq('fazenda_id', fazendaId)

    const [countRes, individuosRes, racasRes] = await Promise.all([
      countQuery,
      dataQuery,
      racasQuery,
    ])

    if (countRes.error) {
      console.error('Erro ao contar indivíduos:', countRes.error)
    } else {
      setTotalCount(countRes.count || 0)
    }

    if (individuosRes.error) {
      console.error('Erro ao buscar indivíduos:', individuosRes.error)
    } else {
      setIndividuos(individuosRes.data as Individuo[])
    }

    if (racasRes.error) console.error('Erro ao buscar raças:', racasRes.error)
    else setRacas(racasRes.data as Raca[])

    setLoading(false)
  }

  const getNomeLote = (id?: string) => lotes.find((l) => l.id === id)?.nome || '-'
  const getNomePasto = (id?: string) => pastos.find((p) => p.id === id)?.nome || '-'

  const getIdentificacao = (ind: Individuo, tipo?: 'todos' | 'brinco' | 'chip' | 'manejo' | 'provisorio') => {
    if (tipo === 'brinco') return ind.id_brinco ? { label: 'Brinco', value: ind.id_brinco } : null
    if (tipo === 'chip') return ind.id_chip ? { label: 'Chip', value: ind.id_chip } : null
    if (tipo === 'manejo') return ind.id_manejo ? { label: 'ID Manejo', value: ind.id_manejo } : null
    if (tipo === 'provisorio') return ind.id_provisorio_cria ? { label: 'Provisório', value: ind.id_provisorio_cria } : null

    if (ind.id_brinco) return { label: 'Brinco', value: ind.id_brinco }
    if (ind.id_chip) return { label: 'Chip', value: ind.id_chip }
    if (ind.id_manejo) return { label: 'ID Manejo', value: ind.id_manejo }
    if (ind.id_provisorio_cria) return { label: 'Provisório', value: ind.id_provisorio_cria }
    return { label: 'Identificação', value: 'Não informada' }
  }

  const getCompletudeBadge = (syncStatus?: string) => {
    switch (syncStatus) {
      case 'automatico_incompleto':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            Criado automaticamente
          </span>
        )
      case 'manual_completo':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            Completo
          </span>
        )
      case 'manual_incompleto':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            Incompleto
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            Não classificado
          </span>
        )
    }
  }

  const handlePerPageChange = (value: string) => {
    const newPerPage = Number(value)
    setPerPage(newPerPage)
    localStorage.setItem(PER_PAGE_STORAGE_KEY, String(newPerPage))
    setPage(1)
  }

  const limparFiltros = () => {
    setSearchTerm('')
    setFiltroTipoIdentificacao('todos')
    setFiltroStatus('')
    setFiltroSexo('')
    setFiltroCategoria('')
    setFiltroRaca('')
    setFiltroOrigem('')
    setFiltroSyncStatus('')
    setFiltroLote('')
    setFiltroPasto('')
    setFiltroIncompletos(false)
    setFiltroAutomaticos(false)
  }

  const temFiltros =
    searchTerm ||
    filtroTipoIdentificacao !== 'todos' ||
    filtroStatus ||
    filtroSexo ||
    filtroCategoria ||
    filtroRaca ||
    filtroOrigem ||
    filtroSyncStatus ||
    filtroLote ||
    filtroPasto ||
    filtroIncompletos ||
    filtroAutomaticos

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="h-10 w-32 bg-gray-200 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    )
  }

  const placeholderBusca =
    filtroTipoIdentificacao === 'brinco'
      ? 'Buscar por brinco...'
      : filtroTipoIdentificacao === 'chip'
      ? 'Buscar por chip...'
      : filtroTipoIdentificacao === 'manejo'
      ? 'Buscar por ID manejo...'
      : filtroTipoIdentificacao === 'provisorio'
      ? 'Buscar por ID provisório...'
      : 'Buscar por brinco, chip, manejo ou provisório...'

  const notaIdentificacao =
    filtroTipoIdentificacao === 'brinco'
      ? 'Exibindo apenas indivíduos com Brinco.'
      : filtroTipoIdentificacao === 'chip'
      ? 'Exibindo apenas indivíduos com Chip.'
      : filtroTipoIdentificacao === 'manejo'
      ? 'Exibindo apenas indivíduos com ID Manejo.'
      : filtroTipoIdentificacao === 'provisorio'
      ? 'Exibindo apenas indivíduos com ID Provisório.'
      : 'Identificação exibida: Brinco (quando disponível). Filtre por Brinco, Chip, ID Manejo ou Provisório.'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Indivíduos</h2>
          <p className="text-sm text-gray-500 mt-1">
            {totalCount} indivíduo{totalCount !== 1 ? 's' : ''} no total
          </p>
        </div>
        <Button onClick={() => navigate('/controller/individuos/novo')} className="h-10">
          Novo Indivíduo
        </Button>
      </div>

      {/* Search and quick filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1">
          <Input
            type="text"
            placeholder={placeholderBusca}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border-gray-200 focus:border-accent h-10 min-h-0"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setFiltroIncompletos(!filtroIncompletos)
              setFiltroAutomaticos(false)
            }}
            className={`h-10 px-3 rounded-lg text-sm font-medium transition-colors ${
              filtroIncompletos
                ? 'bg-red-100 text-red-800 border border-red-200'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            Incompletos
          </button>
          <button
            onClick={() => {
              setFiltroAutomaticos(!filtroAutomaticos)
              setFiltroIncompletos(false)
            }}
            className={`h-10 px-3 rounded-lg text-sm font-medium transition-colors ${
              filtroAutomaticos
                ? 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            Criados automaticamente
          </button>
          {temFiltros && (
            <button
              onClick={limparFiltros}
              className="h-10 px-3 rounded-lg text-sm font-medium bg-orange-100 text-orange-800 border border-orange-200 hover:bg-orange-200 transition-colors"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* Advanced filters */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Select
          label="Status"
          value={filtroStatus}
          onChange={setFiltroStatus}
          placeholder="Todos"
          options={statusList.map((s) => ({ value: s, label: s }))}
        />
        <Select
          label="Sexo"
          value={filtroSexo}
          onChange={setFiltroSexo}
          placeholder="Todos"
          options={sexos.map((s) => ({ value: s, label: s }))}
        />
        <Select
          label="Categoria"
          value={filtroCategoria}
          onChange={setFiltroCategoria}
          placeholder="Todas"
          options={categorias.map((c) => ({ value: c, label: c }))}
        />
        <Select
          label="Raça"
          value={filtroRaca}
          onChange={setFiltroRaca}
          placeholder="Todas"
          options={racas.map((r) => ({ value: r.nome, label: r.nome }))}
        />
        <Select
          label="Origem"
          value={filtroOrigem}
          onChange={setFiltroOrigem}
          placeholder="Todas"
          options={origens.map((o) => ({ value: o, label: o }))}
        />
        <Select
          label="Completude"
          value={filtroSyncStatus}
          onChange={setFiltroSyncStatus}
          placeholder="Todas"
          options={syncStatusList}
        />
        <Select
          label="Lote"
          value={filtroLote}
          onChange={setFiltroLote}
          placeholder="Todos"
          options={lotes.map((l) => ({ value: l.id, label: l.nome }))}
        />
        <Select
          label="Pasto"
          value={filtroPasto}
          onChange={setFiltroPasto}
          placeholder="Todos"
          options={pastos.map((p) => ({ value: p.id, label: p.nome }))}
        />
      </div>

      {/* Identification filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-gray-800">Filtro de identificação</h3>
            <p className="text-sm text-gray-500">{notaIdentificacao}</p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 min-w-0">
            <div className="w-full sm:w-56">
              <Select
                label="Identificar por"
                value={filtroTipoIdentificacao}
                onChange={(value) => setFiltroTipoIdentificacao(value as 'todos' | 'brinco' | 'chip' | 'manejo' | 'provisorio')}
                options={[
                  { value: 'todos', label: 'Qualquer identificação' },
                  { value: 'brinco', label: 'Brinco' },
                  { value: 'chip', label: 'Chip' },
                  { value: 'manejo', label: 'ID Manejo' },
                  { value: 'provisorio', label: 'ID Provisório' },
                ]}
                placeholder="Qualquer identificação"
              />
            </div>
            {searchTerm && (
              <span className="text-sm text-gray-500 whitespace-nowrap">
                {individuos.length} resultado{individuos.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-4">
        {individuos.length === 0 ? (
          <Card className="p-8 text-center border-0 shadow-sm">
            <p className="text-gray-600">Nenhum indivíduo encontrado</p>
          </Card>
        ) : (
          individuos.map((ind) => {
            const identificacao = getIdentificacao(ind, filtroTipoIdentificacao)
            return (
            <Card
              key={ind.id}
              className="p-4 border-0 shadow-sm cursor-pointer"
              onClick={() => navigate(`/controller/individuos/${ind.id}`)}
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="font-semibold text-gray-900 text-lg">
                    <span className="text-sm font-normal text-gray-500">{identificacao?.label}:</span>{' '}
                    {identificacao?.value}
                  </div>
                  <p className="text-sm text-gray-500">
                    {ind.categoria} • {ind.sexo}
                  </p>
                </div>
                {getCompletudeBadge(ind.sync_status)}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 mb-3">
                <div>
                  <span className="text-gray-400">Raça:</span> {ind.raca}
                </div>
                <div>
                  <span className="text-gray-400">Nascimento:</span>{' '}
                  {ind.data_nascimento ? new Date(ind.data_nascimento).toLocaleDateString('pt-BR') : '-'}
                </div>
                <div>
                  <span className="text-gray-400">Status:</span> {ind.status}
                </div>
                <div>
                  <span className="text-gray-400">Peso:</span>{' '}
                  {ind.peso_atual_kg ? `${ind.peso_atual_kg} kg` : ind.peso_nascimento_kg ? `${ind.peso_nascimento_kg} kg` : '-'}
                </div>
                <div>
                  <span className="text-gray-400">Lote:</span> {getNomeLote(ind.lote_atual)}
                </div>
                <div>
                  <span className="text-gray-400">Pasto:</span> {getNomePasto(ind.pasto_atual)}
                </div>
              </div>
              <div className="flex gap-2">
                                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  onClick={(e) => {
                    e.stopPropagation()
                    navigate(`/controller/individuos/novo?edit=${ind.id}`)
                  }}
                >
                  Editar
                </Button>
              </div>
            </Card>
          )
        }
      ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <div className="overflow-x-auto bg-white rounded-2xl shadow-lg border-2 border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b-2 border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Identificação
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Categoria
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Sexo
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Raça
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Nascimento
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Lote
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Pasto
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Completude
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {individuos.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-600">
                    Nenhum indivíduo encontrado
                  </td>
                </tr>
              ) : (
                individuos.map((ind) => {
                  const identificacao = getIdentificacao(ind, filtroTipoIdentificacao)
                  return (
                    <tr
                      key={ind.id}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/controller/individuos/${ind.id}`)}
                    >
                      <td className="px-4 py-3">
                        {identificacao ? (
                          <div className="font-medium text-gray-900">
                            <span className="text-xs font-normal text-gray-500">{identificacao.label}:</span>{' '}
                            {identificacao.value}
                          </div>
                        ) : (
                          <div className="font-medium text-gray-900">-</div>
                        )}
                        {ind.id_provisorio_cria && identificacao?.label !== 'Provisório' && (
                          <div className="text-xs text-gray-500">Prov: {ind.id_provisorio_cria}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{ind.categoria}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{ind.sexo}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{ind.raca}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {ind.data_nascimento
                          ? new Date(ind.data_nascimento).toLocaleDateString('pt-BR')
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{ind.status}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{getNomeLote(ind.lote_atual)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{getNomePasto(ind.pasto_atual)}</td>
                      <td className="px-4 py-3">{getCompletudeBadge(ind.sync_status)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/controller/individuos/${ind.id}`)
                            }}
                          >
                            Ver
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/controller/individuos/${ind.id}`)
                            }}
                          >
                            Editar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <Pagination
        page={page}
        totalItems={totalCount}
        perPage={perPage}
        onPageChange={setPage}
        onPerPageChange={(v) => handlePerPageChange(String(v))}
        perPageOptions={PER_PAGE_OPTIONS}
      />
    </div>
  )
}
