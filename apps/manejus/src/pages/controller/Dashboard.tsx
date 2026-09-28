import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Card, Button, ErrorState, PageSkeleton } from '../../components/ui'
import { CADERNETA_IMAGES, CADERNETA_TITLES } from '../../types/images'
import { useFazenda, useDashboardStats, useGadoStats, useRecentActivities, useFormulacoesBackfillAlert } from '../../hooks/useDashboardQueries'

function StatCard({
  title,
  value,
  subtitle,
  icon,
  accent,
  onClick,
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ReactNode
  accent: 'blue' | 'green' | 'purple' | 'red' | 'orange' | 'primary'
  onClick?: () => void
}) {
  const accentMap = {
    blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    green: 'bg-green-500/10 text-green-600 dark:text-green-400',
    purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    red: 'bg-red-500/10 text-red-600 dark:text-red-400',
    orange: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    primary: 'bg-primary/10 text-primary dark:text-primary-light',
  }

  return (
    <Card
      className={`bg-surface-1 p-4 sm:p-5 border border-border-subtle ${onClick ? 'hover:border-primary/30 hover:shadow-md transition-all cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs sm:text-sm text-content-muted mb-1">{title}</p>
          <p className="text-2xl sm:text-3xl font-bold text-content-strong">{value}</p>
          {subtitle && <p className="text-xs text-content-faint mt-1">{subtitle}</p>}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${accentMap[accent]}`}>
          {icon}
        </div>
      </div>
    </Card>
  )
}

function CadernetaCard({
  title,
  count,
  image,
  onClick,
}: {
  title: string
  count: number
  image: string
  onClick: () => void
}) {
  return (
    <Card
      className="bg-surface-1 p-4 border border-border-subtle cursor-pointer hover:border-primary/40 hover:shadow-md transition-all group"
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <div className="w-20 h-20 rounded-2xl bg-surface-2 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors overflow-hidden">
          <img src={image} alt={title} loading="lazy" className="w-16 h-16 rounded-xl object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs sm:text-sm text-content-muted truncate">{title}</p>
          <p className="text-xl sm:text-2xl font-bold text-content-strong">{count}</p>
        </div>
      </div>
    </Card>
  )
}

function QuickActionButton({
  label,
  icon,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 p-3 rounded-lg bg-surface-2 border border-border-subtle hover:bg-primary/10 hover:border-primary/30 hover:text-primary dark:hover:text-primary-light text-content transition-colors text-left"
    >
      <span className="w-8 h-8 rounded-lg bg-surface-1 flex items-center justify-center flex-shrink-0 text-content-muted">
        {icon}
      </span>
      <span className="text-sm font-medium">{label}</span>
    </button>
  )
}

export function ControllerDashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const { data: fazenda, isLoading: loadingFazenda, isError: fazendaError, error: fazendaErr, refetch: refetchFazenda } = useFazenda(user?.id)
  const { data: stats, isLoading: loadingStats, isError: statsError, error: statsErr, refetch: refetchStats } = useDashboardStats(user?.id)
  const { data: gadoStats } = useGadoStats(user?.id)
  const { data: recentActivities } = useRecentActivities(user?.id)
  const { data: formulacoesBackfill } = useFormulacoesBackfillAlert(user?.id)

  const loading = loadingFazenda || loadingStats
  const loadError = fazendaError || statsError

  const cadastroStats = stats?.cadastroStats ?? { pastos: 0, lotes: 0, funcionarios: 0, insumos: 0, pluviometros: 0, medicamentos: 0 }
  const cadernetaStats = stats?.cadernetaStats ?? {
    maternidade: 0, enfermaria: 0, pastagens: 0, rodeio: 0, suplementacao: 0,
    bebedouros: 0, movimentacao: 0, morte: 0, clima: 0, abastecimento: 0,
    cantina: 0, limpeza: 0, 'operacoes-maquinas': 0, almoxarifado: 0, 'manutencao-maquinas': 0, problemas: 0,
  }
  const registrosHoje = stats?.registrosHoje ?? 0
  const gadoData = gadoStats ?? {
    totalAnimais: 0, animaisPorLote: [], mortesMesAtual: 0,
    pesoMedioLotes: 0, enfermariaMesAtual: 0, causasMorteFrequentes: [],
  }

  const totalCadastros = cadastroStats.pastos + cadastroStats.lotes + cadastroStats.funcionarios + cadastroStats.insumos + cadastroStats.pluviometros + cadastroStats.medicamentos
  const totalRegistros = cadernetaStats.maternidade + cadernetaStats.enfermaria + cadernetaStats.pastagens + cadernetaStats.rodeio + cadernetaStats.suplementacao + cadernetaStats.bebedouros + cadernetaStats.movimentacao + cadernetaStats.morte + cadernetaStats.clima + cadernetaStats.abastecimento + cadernetaStats.cantina + cadernetaStats.limpeza + cadernetaStats['operacoes-maquinas'] + cadernetaStats.almoxarifado + cadernetaStats['manutencao-maquinas'] + cadernetaStats.problemas

  if (loading) {
    return <PageSkeleton variant="grid" />
  }

  if (loadError) {
    const errMsg = (fazendaErr as Error)?.message || (statsErr as Error)?.message
    return (
      <ErrorState
        message="Erro ao carregar dados do dashboard"
        detail={errMsg}
        onRetry={() => { refetchFazenda(); refetchStats() }}
      />
    )
  }

  if (!fazenda) {
    return (
      <div className="text-center py-12">
        <p className="text-content-muted mb-4">Nenhuma fazenda vinculada ao seu usuário</p>
        <p className="text-sm text-content-muted">Entre em contato com o administrador</p>
      </div>
    )
  }

  const icons = {
    registros: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
    cadastros: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
    registrosTotal: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    gado: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
    morte: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
    peso: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
      </svg>
    ),
    enfermaria: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    ),
  }

  const cadernetas = [
    { key: 'maternidade', title: CADERNETA_TITLES.maternidade, count: cadernetaStats.maternidade, path: '/controller/cadernetas/maternidade' },
    { key: 'pastagens', title: CADERNETA_TITLES.pastagens, count: cadernetaStats.pastagens, path: '/controller/cadernetas/pastagens' },
    { key: 'rodeio', title: CADERNETA_TITLES.rodeio, count: cadernetaStats.rodeio, path: '/controller/cadernetas/rodeio' },
    { key: 'suplementacao', title: CADERNETA_TITLES.suplementacao, count: cadernetaStats.suplementacao, path: '/controller/cadernetas/suplementacao' },
    { key: 'bebedouros', title: CADERNETA_TITLES.bebedouros, count: cadernetaStats.bebedouros, path: '/controller/cadernetas/bebedouros' },
    { key: 'movimentacao', title: CADERNETA_TITLES.movimentacao, count: cadernetaStats.movimentacao, path: '/controller/cadernetas/movimentacao' },
    { key: 'enfermaria', title: CADERNETA_TITLES.enfermaria, count: cadernetaStats.enfermaria, path: '/controller/cadernetas/enfermaria' },
    { key: 'morte', title: CADERNETA_TITLES.morte, count: cadernetaStats.morte, path: '/controller/cadernetas/morte' },
    { key: 'clima', title: CADERNETA_TITLES.clima, count: cadernetaStats.clima, path: '/controller/cadernetas/clima' },
    { key: 'abastecimento', title: CADERNETA_TITLES.abastecimento, count: cadernetaStats.abastecimento, path: '/controller/cadernetas/abastecimento' },
    { key: 'cantina', title: CADERNETA_TITLES.cantina, count: cadernetaStats.cantina, path: '/controller/cadernetas/alimentacao' },
    { key: 'limpeza', title: CADERNETA_TITLES.limpeza, count: cadernetaStats.limpeza, path: '/controller/cadernetas/limpeza' },
    { key: 'operacoes-maquinas', title: CADERNETA_TITLES['operacoes-maquinas'], count: cadernetaStats['operacoes-maquinas'], path: '/controller/cadernetas/operacoes-maquinas' },
    { key: 'almoxarifado', title: CADERNETA_TITLES.almoxarifado, count: cadernetaStats.almoxarifado, path: '/controller/cadernetas/almoxarifado' },
    { key: 'manutencao-maquinas', title: CADERNETA_TITLES['manutencao-maquinas'], count: cadernetaStats['manutencao-maquinas'], path: '/controller/cadernetas/manutencao-maquinas' },
    { key: 'problemas', title: CADERNETA_TITLES.problemas, count: cadernetaStats.problemas, path: '/controller/cadernetas/problemas' },
  ]

  const quickActions = [
    { label: 'Novo Pasto', path: '/controller/pastos', icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
      </svg>
    )},
    { label: 'Novo Lote', path: '/controller/lotes', icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
      </svg>
    )},
    { label: 'Novo Funcionário', path: '/controller/funcionarios', icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
      </svg>
    )},
    { label: 'Novo Insumo', path: '/controller/insumos', icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
      </svg>
    )},
  ]

  return (
    <div className="space-y-6 sm:space-y-8 page-transition">
      {/* Header da Fazenda */}
      <div className="bg-gradient-to-r from-primary/10 via-surface-1 to-surface-1 rounded-xl p-4 sm:p-6 border border-border-subtle">
        <div className="flex items-center gap-4">
          {fazenda.logo_url ? (
            <img
              src={fazenda.logo_url}
              alt={fazenda.nome}
              loading="eager"
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-contain bg-surface-1 p-2 border border-border-subtle"
            />
          ) : (
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
              <span className="text-2xl sm:text-3xl font-bold text-primary">F</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-content-strong truncate">{fazenda.nome}</h2>
            <p className="text-sm text-content-muted">ID: {fazenda.acesso_id}</p>
          </div>
        </div>
      </div>

      {/* Avisos */}
      {formulacoesBackfill && formulacoesBackfill.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-amber-800 dark:text-amber-200 mb-1">
                {formulacoesBackfill.length} formulaç{formulacoesBackfill.length > 1 ? 'ões' : ''} com categoria a confirmar
              </h3>
              <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">
                A categoria destas formulações foi inferida automaticamente e precisa ser revisada.
              </p>
              <ul className="space-y-1">
                {formulacoesBackfill.map((f) => (
                  <li key={f.id}>
                    <button
                      onClick={() => navigate(`/controller/formulacoes?edit=${f.id}`)}
                      className="text-sm text-amber-800 dark:text-amber-200 hover:text-amber-900 dark:hover:text-amber-100 underline underline-offset-2 text-left"
                    >
                      {f.nome}
                      {f.categoria && <span className="text-amber-600 dark:text-amber-400"> (sugerida: {f.categoria})</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* KPIs Principais */}
      <div>
        <h3 className="text-lg font-semibold text-content-strong mb-4">Resumo</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            title="Registros Hoje"
            value={registrosHoje}
            icon={icons.registros}
            accent="primary"
          />
          <StatCard
            title="Total Cadastros"
            value={totalCadastros}
            icon={icons.cadastros}
            accent="blue"
          />
          <StatCard
            title="Total Registros"
            value={totalRegistros}
            icon={icons.registrosTotal}
            accent="purple"
          />
        </div>
      </div>

      {/* Métricas de Produção */}
      <div>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
          <h3 className="text-lg font-semibold text-content-strong">Métricas de Produção</h3>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => navigate('/controller/relatorios/gado')} className="text-xs">
              Relatório Rebanho
            </Button>
            <Button variant="secondary" onClick={() => navigate('/controller/relatorios/saude')} className="text-xs">
              Relatório Saúde
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total de Animais"
            value={gadoData.totalAnimais}
            subtitle="Cabeças"
            icon={icons.gado}
            accent="green"
          />
          <StatCard
            title="Mortes"
            value={gadoData.mortesMesAtual}
            subtitle="Registros totais"
            icon={icons.morte}
            accent="red"
          />
          <StatCard
            title="Peso Vivo Médio"
            value={gadoData.pesoMedioLotes.toFixed(0)}
            subtitle="kg por animal"
            icon={icons.peso}
            accent="blue"
          />
          <StatCard
            title="Casos Enfermaria"
            value={gadoData.enfermariaMesAtual}
            subtitle="Registros totais"
            icon={icons.enfermaria}
            accent="orange"
          />
        </div>
      </div>

      {/* Animais por Lote */}
      {gadoData.animaisPorLote.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-content-strong mb-4">Animais por Lote</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {gadoData.animaisPorLote.map((item) => (
              <div
                key={item.nome}
                className="flex items-center justify-between p-4 bg-surface-1 rounded-lg border border-border-subtle hover:border-primary/30 transition-colors"
              >
                <p className="font-medium text-content-strong truncate">{item.nome}</p>
                <span className="text-lg font-bold text-primary dark:text-primary-light bg-primary/10 px-3 py-1 rounded-lg">
                  {item.cabecas}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cadastros */}
      <div>
        <h3 className="text-lg font-semibold text-content-strong mb-4">Cadastros</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Pastos', count: cadastroStats.pastos, path: '/controller/pastos' },
            { label: 'Lotes', count: cadastroStats.lotes, path: '/controller/lotes' },
            { label: 'Funcionários', count: cadastroStats.funcionarios, path: '/controller/funcionarios' },
            { label: 'Insumos', count: cadastroStats.insumos, path: '/controller/insumos' },
            { label: 'Pluviômetros', count: cadastroStats.pluviometros, path: '/controller/pluviometros' },
            { label: 'Medicamentos', count: cadastroStats.medicamentos, path: '/controller/medicamentos' },
          ].map((item) => (
            <Card
              key={item.label}
              className="bg-surface-1 p-4 border border-border-subtle hover:border-primary/40 hover:shadow-md transition-all cursor-pointer text-center"
              onClick={() => navigate(item.path)}
            >
              <p className="text-2xl font-bold text-content-strong">{item.count}</p>
              <p className="text-xs text-content-muted mt-1">{item.label}</p>
            </Card>
          ))}
        </div>
      </div>

      {/* Cadernetas */}
      <div>
        <h3 className="text-lg font-semibold text-content-strong mb-4">Cadernetas</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {cadernetas.map((caderneta) => (
            <CadernetaCard
              key={caderneta.key}
              title={caderneta.title}
              count={caderneta.count}
              image={CADERNETA_IMAGES[caderneta.key as keyof typeof CADERNETA_IMAGES]}
              onClick={() => navigate(caderneta.path)}
            />
          ))}
        </div>
      </div>

      {/* Atividades Recentes */}
      {(recentActivities ?? []).length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-content-strong mb-4">Atividades Recentes</h3>
          <Card className="bg-surface-1 border border-border-subtle">
            <div className="divide-y divide-border-subtle">
              {(recentActivities ?? []).slice(0, 8).map((activity) => (
                <button
                  key={activity.id}
                  className="w-full flex items-center gap-4 p-4 hover:bg-surface-2 transition-colors text-left"
                  onClick={() => navigate(activity.path)}
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-content-strong truncate">{activity.title}</p>
                    <p className="text-sm text-content-muted truncate">{activity.type}</p>
                  </div>
                  <p className="text-sm text-content-faint flex-shrink-0">{activity.date}</p>
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Ações Rápidas */}
      <div>
        <h3 className="text-lg font-semibold text-content-strong mb-4">Ações Rápidas</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <QuickActionButton
              key={action.label}
              label={action.label}
              icon={action.icon}
              onClick={() => navigate(action.path)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
