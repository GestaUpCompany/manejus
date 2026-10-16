import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, formatDate } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Button, Card, Input, CardSkeleton, Select, Pagination, useToast } from '@gestaup/ui'
import { getFazendaIdForUser } from '@gestaup/shared'
import { useLotes, usePastos } from '@gestaup/shared'
import { categoriasTodas, sexos, statusList, origens } from '../../utils/individualValidation'
import { escapeLikeTerm, ilikeContainsCondition } from '../../utils/postgrestFilter'
import { planejarConfirmacao } from '../../utils/confirmacaoLocalizacao'
import { useConfirmarLocalizacaoEmMassa } from '../../hooks/useConfirmarLocalizacaoEmMassa'

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
  localizacao_incerta_desde?: string
  created_at: string
  updated_at: string
}

interface Raca {
  id: string
  nome: string
}

const categorias = categoriasTodas

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
  const toast = useToast()
  const [individuos, setIndividuos] = useState<Individuo[]>([])
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
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
  const [filtroIncerta, setFiltroIncerta] = useState(false)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(getStoredPerPage)
  const [totalCount, setTotalCount] = useState(0)

  const { data: lotes = [] } = useLotes(fazendaId)
  const { data: pastos = [] } = usePastos(fazendaId)

  const from = (page - 1) * perPage
  const to = from + perPage - 1

  const loadDataRef = useRef<() => Promise<void>>(async () => {})
  const requestIdRef = useRef(0)

  useEffect(() => {
    loadData()
  }, [
    user,
    page,
    perPage,
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
    filtroIncerta,
  ])

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
    filtroIncerta,
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
            loadDataRef.current()
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

    if (filtroIncerta) query = query.not('localizacao_incerta_desde', 'is', null)

    const term = searchTerm.trim()
    if (term) {
      const ilikeTerm = `%${escapeLikeTerm(term)}%`
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
          ['id_brinco', 'id_chip', 'id_manejo', 'id_provisorio_cria'].map((coluna) => ilikeContainsCondition(coluna, term)).join(',')
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

  // A seleção vale só para a página e os filtros atuais
  useEffect(() => {
    setSelecionados(new Set())
  }, [individuos])

  const confirmarEmMassa = useConfirmarLocalizacaoEmMassa(fazendaId)
  const incertosDaPagina = individuos.filter((i) => !!i.localizacao_incerta_desde)
  const alternarSelecao = (id: string) =>
    setSelecionados((atual) => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  const todosIncertosSelecionados = incertosDaPagina.length > 0 && incertosDaPagina.every((i) => selecionados.has(i.id))
  const alternarTodosIncertos = () =>
    setSelecionados(todosIncertosSelecionados ? new Set() : new Set(incertosDaPagina.map((i) => i.id)))

  const confirmarSelecionados = async () => {
    const plano = planejarConfirmacao(individuos.filter((i) => selecionados.has(i.id)))
    if (plano.grupos.length === 0) {
      toast.error('Nenhum dos animais selecionados está com localização incerta e lote definido.')
      return
    }
    try {
      const r = await confirmarEmMassa.mutateAsync(plano.grupos)
      toast.success(`${r.atualizados} animal(is) com localização confirmada no lote em que constam.`)
      setSelecionados(new Set())
      await loadData()
    } catch (error) {
      toast.error((error as Error).message || 'Não foi possível confirmar a localização.')
    }
  }

  const loadData = async () => {
    if (!user) return

    const requestId = ++requestIdRef.current
    const isAdmin = user.papel === 'admin'
    let fazendaId: string | null = null

    if (!isAdmin) {
      fazendaId = await getFazendaIdForUser(user.id)
      if (!fazendaId) {
        setLoading(false)
        return
      }
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

    // Descarta resposta de uma consulta antiga (filtros mudaram durante o carregamento)
    if (requestId !== requestIdRef.current) return

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

  loadDataRef.current = loadData

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
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-800 dark:text-yellow-200">
            Criado automaticamente
          </span>
        )
      case 'manual_completo':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-800 dark:text-green-200">
            Completo
          </span>
        )
      case 'manual_incompleto':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-800 dark:text-red-200">
            Incompleto
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-surface-2 text-content-strong">
            Não classificado
          </span>
        )
    }
  }

  const getLocalizacaoBadge = (desde?: string) =>
    desde ? (
      <span
        className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-800 dark:text-amber-200"
        title="Não se sabe se o animal continua neste lote (movimentação por contagem)"
      >
        incerta desde {formatDate(desde)}
      </span>
    ) : null

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
    setFiltroIncerta(false)
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
    filtroAutomaticos ||
    filtroIncerta

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div className="h-8 w-48 bg-surface-3 rounded animate-pulse" />
          <div className="h-10 w-32 bg-surface-3 rounded animate-pulse" />
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
          <h2 className="text-2xl font-bold text-content-strong">Indivíduos</h2>
          <p className="text-sm text-content-muted mt-1">
            {totalCount} indivíduo{totalCount !== 1 ? 's' : ''} no total
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate('/controller/individuos/identificar')} className="h-10">
            Identificar lote
          </Button>
          <Button variant="secondary" onClick={() => navigate('/controller/individuos/conciliacao')} className="h-10">
            Conciliação
          </Button>
          <Button onClick={() => navigate('/controller/individuos/novo')} className="h-10">
            Novo Indivíduo
          </Button>
        </div>
      </div>

      {/* Search and quick filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1">
          <Input
            type="text"
            placeholder={placeholderBusca}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border-border-base focus:border-accent h-10 min-h-0"
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
                ? 'bg-red-500/10 text-red-800 dark:text-red-200 border border-red-500/30'
                : 'bg-surface-1 border border-border-base text-content hover:bg-surface-2'
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
                ? 'bg-yellow-500/10 text-yellow-800 dark:text-yellow-200 border border-yellow-500/30'
                : 'bg-surface-1 border border-border-base text-content hover:bg-surface-2'
            }`}
          >
            Criados automaticamente
          </button>
          <button
            onClick={() => setFiltroIncerta(!filtroIncerta)}
            title="Animais identificados cuja localização não foi confirmada após uma movimentação por contagem"
            className={`h-10 px-3 rounded-lg text-sm font-medium transition-colors ${
              filtroIncerta
                ? 'bg-amber-500/10 text-amber-800 dark:text-amber-200 border border-amber-500/30'
                : 'bg-surface-1 border border-border-base text-content hover:bg-surface-2'
            }`}
          >
            Localização incerta
          </button>
          {temFiltros && (
            <Button onClick={limparFiltros} variant="secondary" size="sm">
              Limpar filtros
            </Button>
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
      <div className="bg-surface-1 rounded-xl border border-border-base p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-content-strong">Filtro de identificação</h3>
            <p className="text-sm text-content-muted">{notaIdentificacao}</p>
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
              <span className="text-sm text-content-muted whitespace-nowrap">
                {totalCount} resultado{totalCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      {selecionados.size > 0 && fazendaId && (
        <div className="sticky top-2 z-10 rounded-lg border border-accent/40 bg-surface-1 shadow-md p-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-content">
            <strong className="text-content-strong">{selecionados.size}</strong> animal(is) selecionado(s). Confirmar que continuam no
            lote em que constam tira a marca de localização incerta; não altera a contagem do lote.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setSelecionados(new Set())}>
              Limpar seleção
            </Button>
            <Button size="sm" onClick={confirmarSelecionados} disabled={confirmarEmMassa.isPending}>
              {confirmarEmMassa.isPending ? 'Confirmando...' : 'Confirmar localização'}
            </Button>
          </div>
        </div>
      )}

      {/* Mobile cards */}
      <div className="md:hidden space-y-4">
        {individuos.length === 0 ? (
          <Card className="p-8 text-center border-0 shadow-sm">
            <p className="text-content-muted">Nenhum indivíduo encontrado</p>
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
                  <div className="font-semibold text-content-strong text-lg">
                    <span className="text-sm font-normal text-content-muted">{identificacao?.label}:</span>{' '}
                    {identificacao?.value}
                  </div>
                  <p className="text-sm text-content-muted">
                    {ind.categoria} • {ind.sexo}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {ind.localizacao_incerta_desde && fazendaId && (
                    <input
                      type="checkbox"
                      aria-label="Selecionar para confirmar localização"
                      className="h-5 w-5"
                      checked={selecionados.has(ind.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => alternarSelecao(ind.id)}
                    />
                  )}
                  {getCompletudeBadge(ind.sync_status)}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm text-content-muted mb-3">
                <div>
                  <span className="text-content-faint">Raça:</span> {ind.raca}
                </div>
                <div>
                  <span className="text-content-faint">Nascimento:</span>{' '}
                  {formatDate(ind.data_nascimento)}
                </div>
                <div>
                  <span className="text-content-faint">Status:</span> {ind.status}
                </div>
                <div>
                  <span className="text-content-faint">Peso:</span>{' '}
                  {ind.peso_atual_kg ? `${ind.peso_atual_kg} kg` : ind.peso_nascimento_kg ? `${ind.peso_nascimento_kg} kg` : '-'}
                </div>
                <div>
                  <span className="text-content-faint">Lote:</span> {getNomeLote(ind.lote_atual)}
                  {getLocalizacaoBadge(ind.localizacao_incerta_desde)}
                </div>
                <div>
                  <span className="text-content-faint">Pasto:</span> {getNomePasto(ind.pasto_atual)}
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
        <div className="overflow-x-auto bg-surface-1 rounded-2xl shadow-lg border-2 border-border-base overflow-hidden">
          <table className="w-full">
            <thead className="bg-surface-2 border-b-2 border-border-base">
              <tr>
                <th className="px-4 py-3 w-10">
                  {fazendaId && incertosDaPagina.length > 0 && (
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos os animais com localização incerta desta página"
                      title="Selecionar os animais com localização incerta desta página"
                      checked={todosIncertosSelecionados}
                      onChange={alternarTodosIncertos}
                    />
                  )}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-content-muted uppercase tracking-wider">
                  Identificação
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-content-muted uppercase tracking-wider">
                  Categoria
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-content-muted uppercase tracking-wider">
                  Sexo
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-content-muted uppercase tracking-wider">
                  Raça
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-content-muted uppercase tracking-wider">
                  Nascimento
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-content-muted uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-content-muted uppercase tracking-wider">
                  Lote
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-content-muted uppercase tracking-wider">
                  Pasto
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-content-muted uppercase tracking-wider">
                  Completude
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-content-muted uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-base">
              {individuos.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-content-muted">
                    Nenhum indivíduo encontrado
                  </td>
                </tr>
              ) : (
                individuos.map((ind) => {
                  const identificacao = getIdentificacao(ind, filtroTipoIdentificacao)
                  return (
                    <tr
                      key={ind.id}
                      className="hover:bg-surface-2 transition-colors cursor-pointer"
                      onClick={() => navigate(`/controller/individuos/${ind.id}`)}
                    >
                      <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                        {ind.localizacao_incerta_desde && fazendaId && (
                          <input
                            type="checkbox"
                            aria-label="Selecionar para confirmar localização"
                            checked={selecionados.has(ind.id)}
                            onChange={() => alternarSelecao(ind.id)}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {identificacao ? (
                          <div className="font-medium text-content-strong">
                            <span className="text-xs font-normal text-content-muted">{identificacao.label}:</span>{' '}
                            {identificacao.value}
                          </div>
                        ) : (
                          <div className="font-medium text-content-strong">-</div>
                        )}
                        {ind.id_provisorio_cria && identificacao?.label !== 'Provisório' && (
                          <div className="text-xs text-content-muted">Prov: {ind.id_provisorio_cria}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-content">{ind.categoria}</td>
                      <td className="px-4 py-3 text-sm text-content">{ind.sexo}</td>
                      <td className="px-4 py-3 text-sm text-content">{ind.raca}</td>
                      <td className="px-4 py-3 text-sm text-content">
                        {formatDate(ind.data_nascimento)}
                      </td>
                      <td className="px-4 py-3 text-sm text-content">{ind.status}</td>
                      <td className="px-4 py-3 text-sm text-content">
                        {getNomeLote(ind.lote_atual)}
                        {getLocalizacaoBadge(ind.localizacao_incerta_desde)}
                      </td>
                      <td className="px-4 py-3 text-sm text-content">{getNomePasto(ind.pasto_atual)}</td>
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
                              navigate(`/controller/individuos/novo?edit=${ind.id}`)
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
