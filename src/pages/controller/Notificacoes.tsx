import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, CardSkeleton, ConfirmModal, LoadMore } from '../../components/ui'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

interface Notificacao {
  id: string
  tipo: 'info' | 'warning' | 'error' | 'success'
  titulo: string
  mensagem: string
  lida: boolean
  acao_url?: string | null
  acao_label?: string | null
  created_at: string
  dados_jsonb?: {
    lote_nome?: string
    categoria?: string
    peso_atual?: number
    limite_sup?: number
    percentual?: number
    dias_restantes?: number | null
    tipo_alerta?: string
    lote_id?: string
    categoria_destino?: string
    peso_meta_kg?: number | null
    periodo_dias?: number | null
    formulacao_cobre?: boolean | null
  } | null
}

interface NotificacaoConfig {
  id: string
  threshold_recategorizacao: number
  recategorizacao_ativo: boolean
  tratos_ativo: boolean
}

type FiltroTipo = 'todos' | 'info' | 'warning' | 'error' | 'success'
type FiltroLida = 'todas' | 'naolidas' | 'lidas'

const PAGE_SIZE = 20

export function Notificacoes() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [fazendaId, setFazendaId] = useState<string | null>(null)
  const [loadingFazenda, setLoadingFazenda] = useState(true)

  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [totalNaoLidas, setTotalNaoLidas] = useState(0)

  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('todos')
  const [filtroLida, setFiltroLida] = useState<FiltroLida>('todas')
  const [busca, setBusca] = useState('')

  const [loadingConfig, setLoadingConfig] = useState(true)
  const [percentualAviso, setPercentualAviso] = useState(95)
  const [recategorizacaoAtivo, setRecategorizacaoAtivo] = useState(true)
  const [tratosAtivo, setTratosAtivo] = useState(true)
  const [savingConfig, setSavingConfig] = useState(false)
  const [configSalvo, setConfigSalvo] = useState(false)
  const configLoadedRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)

  const loadFazenda = useCallback(async () => {
    if (!user) return
    const fid = await getFazendaIdForUser(user.id)
    setFazendaId(fid)
    setLoadingFazenda(false)
  }, [user])

  useEffect(() => {
    loadFazenda()
  }, [loadFazenda])

  const loadConfig = useCallback(async () => {
    if (!fazendaId) return
    setLoadingConfig(true)
    const { data, error } = await supabase
      .from('notificacoes_config')
      .select('*')
      .eq('fazenda_id', fazendaId)
      .maybeSingle()

    if (error) {
      console.error('Erro ao buscar config:', error)
    } else if (data) {
      setPercentualAviso(Number((data as NotificacaoConfig).threshold_recategorizacao))
      setRecategorizacaoAtivo((data as NotificacaoConfig).recategorizacao_ativo)
      setTratosAtivo((data as NotificacaoConfig).tratos_ativo ?? true)
    }
    configLoadedRef.current = true
    setLoadingConfig(false)
  }, [fazendaId])

  const loadNotificacoes = useCallback(async (resetPage = false) => {
    if (!user || !fazendaId) return
    const currentPage = resetPage ? 0 : page
    if (resetPage) {
      setPage(0)
      setHasMore(true)
    }

    setLoading(true)

    let query = supabase
      .from('notificacoes')
      .select('*', { count: 'exact' })
      .eq('usuario_id', user.id)
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (filtroTipo !== 'todos') {
      query = query.eq('tipo', filtroTipo)
    }

    if (filtroLida === 'naolidas') {
      query = query.eq('lida', false)
    } else if (filtroLida === 'lidas') {
      query = query.eq('lida', true)
    }

    if (busca.trim()) {
      query = query.or(`titulo.ilike.%${busca.trim()}%,mensagem.ilike.%${busca.trim}%`)
    }

    query = query.range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1)

    const { data, error } = await query

    if (error) {
      console.error('Erro ao buscar notificações:', error)
    } else {
      const newNotifs = data as Notificacao[]
      if (resetPage || currentPage === 0) {
        setNotificacoes(newNotifs)
      } else {
        setNotificacoes(prev => [...prev, ...newNotifs])
      }
      setHasMore(newNotifs.length === PAGE_SIZE)

      // Contar nao lidas
      const { count: naoLidas } = await supabase
        .from('notificacoes')
        .select('*', { count: 'exact', head: true })
        .eq('usuario_id', user.id)
        .eq('fazenda_id', fazendaId)
        .is('deleted_at', null)
        .eq('lida', false)
      setTotalNaoLidas(naoLidas || 0)
    }

    setLoading(false)
  }, [user, fazendaId, page, filtroTipo, filtroLida, busca])

  useEffect(() => {
    if (fazendaId) {
      loadConfig()
      loadNotificacoes(true)
    }
  }, [fazendaId, loadConfig, loadNotificacoes])

  // Recarregar quando filtros mudam
  useEffect(() => {
    if (fazendaId) {
      loadNotificacoes(true)
    }
  }, [filtroTipo, filtroLida, busca])

  const handleMarcarComoLida = async (id: string) => {
    await supabase
      .from('notificacoes')
      .update({ lida: true })
      .eq('id', id)

    setNotificacoes(prev =>
      prev.map(n => n.id === id ? { ...n, lida: true } : n)
    )
    setTotalNaoLidas(prev => Math.max(0, prev - 1))
  }

  const handleMarcarTodasComoLidas = async () => {
    if (!user || !fazendaId) return
    const naoLidas = notificacoes.filter(n => !n.lida)
    if (naoLidas.length === 0) return

    await supabase
      .from('notificacoes')
      .update({ lida: true })
      .in('id', naoLidas.map(n => n.id))

    setNotificacoes(prev => prev.map(n => ({ ...n, lida: true })))
    setTotalNaoLidas(0)
  }

  const handleDeletar = async (id: string) => {
    await supabase
      .from('notificacoes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)

    setNotificacoes(prev => prev.filter(n => n.id !== id))
    setConfirmDeleteId(null)
  }

  const handleDeletarTodas = async () => {
    if (!user || !fazendaId) return
    const ids = notificacoes.map(n => n.id)
    if (ids.length === 0) return

    await supabase
      .from('notificacoes')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', ids)

    setNotificacoes([])
    setTotalNaoLidas(0)
    setConfirmDeleteAll(false)
  }

  const handleNotificacaoClick = (notif: Notificacao) => {
    if (!notif.lida) {
      handleMarcarComoLida(notif.id)
    }
    if (notif.acao_url) {
      navigate(notif.acao_url)
    }
  }

  const salvarConfig = useCallback(async (threshold: number, recatAtivo: boolean, tratosAtivoParam: boolean) => {
    if (!fazendaId) return
    setSavingConfig(true)
    setConfigSalvo(false)

    const { data, error } = await supabase
      .rpc('salvar_notificacoes_config', {
        p_fazenda_id: fazendaId,
        p_threshold_recategorizacao: threshold,
        p_recategorizacao_ativo: recatAtivo,
        p_tratos_ativo: tratosAtivoParam,
      })

    if (error) {
      console.error('Erro ao salvar config:', error)
    } else if (data) {
      setConfigSalvo(true)
      setTimeout(() => setConfigSalvo(false), 3000)
    }

    setSavingConfig(false)
  }, [fazendaId])

  const toggleTratos = () => {
    const novo = !tratosAtivo
    setTratosAtivo(novo)
    if (configLoadedRef.current) salvarConfig(percentualAviso, recategorizacaoAtivo, novo)
  }

  const toggleRecategorizacao = () => {
    const novo = !recategorizacaoAtivo
    setRecategorizacaoAtivo(novo)
    if (configLoadedRef.current) salvarConfig(percentualAviso, novo, tratosAtivo)
  }

  const handleSliderChange = (valor: number) => {
    setPercentualAviso(valor)
    if (!configLoadedRef.current) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      salvarConfig(valor, recategorizacaoAtivo, tratosAtivo)
    }, 600)
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case 'info':
        return (
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        )
      case 'warning':
        return (
          <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
        )
      case 'error':
        return (
          <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        )
      case 'success':
        return (
          <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        )
      default:
        return null
    }
  }

  const getTipoLabel = (tipo: string) => {
    switch (tipo) {
      case 'info': return 'Informação'
      case 'warning': return 'Aviso'
      case 'error': return 'Erro'
      case 'success': return 'Sucesso'
      default: return tipo
    }
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Agora'
    if (diffMins < 60) return `${diffMins} min`
    if (diffHours < 24) return `${diffHours} h`
    if (diffDays < 7) return `${diffDays} d`
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  if (loadingFazenda) {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
        <CardSkeleton />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-content-strong">Notificações</h1>
        <p className="text-sm text-content-muted mt-1">
          {totalNaoLidas > 0
            ? `${totalNaoLidas} não lida${totalNaoLidas > 1 ? 's' : ''} de ${notificacoes.length} notificação${notificacoes.length !== 1 ? 's' : ''} exibida${notificacoes.length !== 1 ? 's' : ''}`
            : 'Todas as notificações foram lidas'
          }
        </p>
      </div>

      {/* Configurações */}
      <Card className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-4">
          <svg className="w-5 h-5 text-content-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h2 className="text-lg font-semibold text-content-strong">Configurações de Notificações</h2>
        </div>

        {loadingConfig ? (
          <div className="animate-pulse space-y-3">
            <div className="h-10 bg-surface-3 rounded"></div>
            <div className="h-10 bg-surface-3 rounded w-1/2"></div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Toggle lembrete de tratos */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-content">Lembrete diário de tratos</p>
                <p className="text-sm text-content-muted">Envia notificação no fim da tarde com os horários dos tratos do dia seguinte</p>
              </div>
              <button
                onClick={toggleTratos}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors shrink-0 ${tratosAtivo ? 'bg-primary' : 'bg-surface-3'}`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-surface-1 transition-transform ${tratosAtivo ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            <div className="border-t border-border-subtle pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-content-faint mb-3">Recategorização de lotes</p>

              {/* Toggle on/off */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-content">Notificações de recategorização</p>
                  <p className="text-sm text-content-muted">Ativa ou desativa alertas de lotes próximos do limite da faixa</p>
                </div>
                <button
                  onClick={toggleRecategorizacao}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors shrink-0 ${recategorizacaoAtivo ? 'bg-primary' : 'bg-surface-3'}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-surface-1 transition-transform ${recategorizacaoAtivo ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* Percentual de aviso slider */}
              <div className={`mt-4 ${recategorizacaoAtivo ? '' : 'opacity-50 pointer-events-none'}`}>
                <div className="flex items-center justify-between mb-2">
                  <label className="font-medium text-content">Percentual de aviso</label>
                  <span className="text-lg font-bold text-primary dark:text-primary-light">{percentualAviso}%</span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={99}
                  step={1}
                  value={percentualAviso}
                  onChange={e => handleSliderChange(Number(e.target.value))}
                  className="w-full h-2 bg-surface-3 rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-xs text-content-faint mt-1">
                  <span>50%</span>
                  <span>99%</span>
                </div>
                <p className="text-sm text-content-muted mt-2">
                  Notificar quando o lote atingir <strong>{percentualAviso}%</strong> do limite superior da faixa de categoria.
                  Ex: com {percentualAviso}%, um lote na categoria "Boi Magro" (limite 450 kg) dispara alerta aos {(450 * percentualAviso / 100).toFixed(0)} kg.
                </p>
              </div>
            </div>

            {/* Status de salvamento automático */}
            <div className="flex items-center gap-2 min-h-[20px]">
              {savingConfig && (
                <span className="text-sm text-content-muted flex items-center gap-1">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-400"></div>
                  Salvando...
                </span>
              )}
              {configSalvo && (
                <span className="text-sm text-green-500 flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Salvo automaticamente
                </span>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Filtros e ações */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <select
          value={filtroTipo}
          onChange={e => setFiltroTipo(e.target.value as FiltroTipo)}
          className="px-3 py-2 border border-surface-3 rounded-lg text-sm bg-surface-1 focus:ring-2 focus:ring-primary focus:border-transparent"
        >
          <option value="todos">Todos os tipos</option>
          <option value="warning">Avisos</option>
          <option value="info">Informações</option>
          <option value="success">Sucessos</option>
          <option value="error">Erros</option>
        </select>

        <select
          value={filtroLida}
          onChange={e => setFiltroLida(e.target.value as FiltroLida)}
          className="px-3 py-2 border border-surface-3 rounded-lg text-sm bg-surface-1 focus:ring-2 focus:ring-primary focus:border-transparent"
        >
          <option value="todas">Todas</option>
          <option value="naolidas">Não lidas</option>
          <option value="lidas">Lidas</option>
        </select>

        <input
          type="text"
          placeholder="Buscar..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="px-3 py-2 border border-surface-3 rounded-lg text-sm bg-surface-1 focus:ring-2 focus:ring-primary focus:border-transparent flex-1 min-w-[150px]"
        />

        <div className="flex gap-2 ml-auto">
          {totalNaoLidas > 0 && (
            <Button
              onClick={handleMarcarTodasComoLidas}
              variant="secondary"
              size="sm"
            >
              Marcar todas como lidas
            </Button>
          )}
          {notificacoes.length > 0 && (
            <Button
              onClick={() => setConfirmDeleteAll(true)}
              variant="danger"
              size="sm"
            >
              Limpar tudo
            </Button>
          )}
        </div>
      </div>

      {/* Lista de notificações */}
      {loading && notificacoes.length === 0 ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="animate-pulse flex gap-3 p-4 bg-surface-1 rounded-xl border border-border-subtle">
              <div className="w-10 h-10 bg-surface-3 rounded-full shrink-0"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-surface-3 rounded w-1/3"></div>
                <div className="h-3 bg-surface-3 rounded w-2/3"></div>
              </div>
            </div>
          ))}
        </div>
      ) : notificacoes.length === 0 ? (
        <Card className="p-8 text-center">
          <svg className="w-12 h-12 mx-auto mb-3 text-content-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <p className="text-content-muted">Nenhuma notificação encontrada</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {notificacoes.map(notif => (
            <div
              key={notif.id}
              className={`flex gap-3 p-4 bg-surface-1 rounded-xl border transition-all hover:shadow-sm cursor-pointer ${
                notif.lida
                  ? 'border-border-subtle'
                  : 'border-l-4 border-l-yellow-400 border-y-border-subtle border-r-border-subtle'
              }`}
              onClick={() => handleNotificacaoClick(notif)}
            >
              {getTipoIcon(notif.tipo)}

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`font-medium text-content-strong ${!notif.lida ? 'font-bold' : ''}`}>
                      {notif.titulo}
                    </p>
                    <p className="text-sm text-content-muted mt-0.5">{notif.mensagem}</p>
                    {notif.dados_jsonb?.tipo_alerta === 'nova_categoria_movimentacao' && (
                      <div className={`mt-2 p-2 rounded-lg border text-xs ${notif.dados_jsonb.formulacao_cobre ? 'bg-primary/10 border-primary/30 text-primary dark:text-primary-light' : 'bg-red-500/10 border-red-500/30 text-red-900'}`}>
                        <p className="font-semibold">
                          {notif.dados_jsonb.formulacao_cobre ? 'Categoria adicionada à formulação do lote' : 'Formulação do lote não contempla esta categoria'}
                        </p>
                        <p>
                          Categoria: <span className="font-medium">{notif.dados_jsonb.categoria_destino || notif.dados_jsonb.categoria}</span>
                          {notif.dados_jsonb.lote_nome && ` • Lote: ${notif.dados_jsonb.lote_nome}`}
                        </p>
                        <p className="mt-1">
                          {notif.dados_jsonb.formulacao_cobre
                            ? 'A formulação vigente do lote já cobre esta categoria. A evolução de peso continua normalmente com o GMD da formulação.'
                            : 'Não há GMD para essa categoria na formulação vigente do lote. A evolução de peso foi interrompida. Ajuste a formulação do lote ou recategorize para retomar a evolução.'}
                        </p>
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-content-faint shrink-0">{formatTime(notif.created_at)}</span>
                </div>

                <div className="flex items-center gap-3 mt-2">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-content-muted">
                    {getTipoLabel(notif.tipo)}
                  </span>
                  {notif.acao_label && notif.acao_url && (
                    <span className="text-xs text-primary dark:text-primary-light font-medium">
                      {notif.acao_label} →
                    </span>
                  )}
                  {!notif.lida && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleMarcarComoLida(notif.id)
                      }}
                      className="text-xs text-content-faint hover:text-content-muted"
                    >
                      Marcar como lida
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setConfirmDeleteId(notif.id)
                    }}
                    className="text-xs text-content-faint hover:text-red-500 ml-auto"
                  >
                    Remover
                  </button>
                </div>
              </div>
            </div>
          ))}

          <LoadMore
            hasMore={hasMore}
            loading={loading}
            onLoadMore={() => {
              setPage(p => p + 1)
              loadNotificacoes(false)
            }}
          />
        </div>
      )}

      {/* Confirm delete individual */}
      <ConfirmModal
        isOpen={confirmDeleteId !== null}
        title="Remover notificação"
        message="Tem certeza que deseja remover esta notificação?"
        confirmText="Remover"
        cancelText="Cancelar"
        onConfirm={() => confirmDeleteId && handleDeletar(confirmDeleteId)}
        onClose={() => setConfirmDeleteId(null)}
      />

      {/* Confirm delete all */}
      <ConfirmModal
        isOpen={confirmDeleteAll}
        title="Limpar todas as notificações"
        message={`Tem certeza que deseja remover todas as ${notificacoes.length} notificações exibidas? Esta ação não pode ser desfeita.`}
        confirmText="Remover todas"
        cancelText="Cancelar"
        onConfirm={handleDeletarTodas}
        onClose={() => setConfirmDeleteAll(false)}
      />
    </div>
  )
}
