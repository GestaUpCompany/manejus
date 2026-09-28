import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getFazendas, Fazenda } from '../../services/fazendasService'
import { getAdminStats, AdminStats, getAdminEvolutionData, EvolutionData } from '../../services/adminStatsService'
import { Button, Card } from '../../components/ui'

const statCards = [
  {
    key: 'totalFazendas' as const,
    label: 'Fazendas',
    subLabel: 'Cadastradas',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
    color: 'bg-blue-50 text-blue-600',
  },
  {
    key: 'totalUsuarios' as const,
    label: 'Usuários',
    subLabel: 'Ativos',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    color: 'bg-purple-50 text-purple-600',
  },
  {
    key: 'totalLotes' as const,
    label: 'Lotes',
    subLabel: 'Ativos',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
    color: 'bg-amber-50 text-amber-600',
  },
  {
    key: 'totalPastos' as const,
    label: 'Pastos',
    subLabel: 'Cadastrados',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
    ),
    color: 'bg-green-50 text-green-600',
  },
  {
    key: 'totalIndividuos' as const,
    label: 'Animais',
    subLabel: 'Cadastrados',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21a9 9 0 100-18 9 9 0 000 18z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10h.01M15 10h.01M9.75 14.25a3.75 3.75 0 014.5 0" />
      </svg>
    ),
    color: 'bg-rose-50 text-rose-600',
  },
  {
    key: 'fazendasInativas' as const,
    label: 'Inativas',
    subLabel: 'Fazendas',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    color: 'bg-red-50 text-red-600',
  },
]

const quickActions = [
  { label: 'Nova Fazenda', path: '/admin/fazendas/nova', color: 'bg-primary text-white hover:bg-primary/90' },
  { label: 'Novo Usuário', path: '/admin/usuarios/novo', color: 'bg-accent text-gray-800 hover:bg-accent/90' },
  { label: 'Ver Fazendas', path: '/admin/fazendas', color: 'bg-white text-gray-700 border-2 border-gray-300 hover:bg-gray-50' },
  { label: 'Ver Usuários', path: '/admin/usuarios', color: 'bg-white text-gray-700 border-2 border-gray-300 hover:bg-gray-50' },
]

type MetricKey = 'fazendas' | 'usuarios' | 'individuos'

const metricOptions: { key: MetricKey; label: string; color: string; bg: string }[] = [
  { key: 'fazendas', label: 'Fazendas', color: 'text-blue-600', bg: 'bg-blue-500' },
  { key: 'usuarios', label: 'Usuários', color: 'text-purple-600', bg: 'bg-purple-500' },
  { key: 'individuos', label: 'Animais', color: 'text-rose-600', bg: 'bg-rose-500' },
]

export function AdminDashboard() {
  const navigate = useNavigate()
  const [fazendas, setFazendas] = useState<Fazenda[]>([])
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [evolution, setEvolution] = useState<EvolutionData[]>([])
  const [loading, setLoading] = useState(true)
  const [activeMetric, setActiveMetric] = useState<MetricKey>('individuos')
  const [hoveredBar, setHoveredBar] = useState<{ index: number; value: number; label: string } | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    const [fazendasData, statsData, evolutionData] = await Promise.all([
      getFazendas(),
      getAdminStats(),
      getAdminEvolutionData(),
    ])
    setFazendas(fazendasData)
    setStats(statsData)
    setEvolution(evolutionData)
    setLoading(false)
  }

  const maxValue = Math.max(1, ...evolution.map((d) => d[activeMetric]))

  const growthStats = (() => {
    if (evolution.length < 2) return null
    const current = evolution[evolution.length - 1]
    const previous = evolution[evolution.length - 2]
    return metricOptions.map((metric) => {
      const currentValue = current[metric.key]
      const previousValue = previous[metric.key]
      const diff = currentValue - previousValue
      const percent = previousValue === 0 ? (currentValue > 0 ? 100 : 0) : Math.round((diff / previousValue) * 100)
      return { ...metric, currentValue, previousValue, diff, percent }
    })
  })()

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Dashboard Administrativo</h1>
          <p className="text-sm text-gray-500 mt-1">Visão geral do sistema e ações rápidas</p>
        </div>
      </div>

      {/* Métricas */}
      <div>
        <h2 className="text-lg font-bold text-gray-800 mb-4">Métricas do Sistema</h2>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {statCards.map((card) => (
              <Card key={card.key} className="bg-white p-5 border-0 shadow-sm animate-pulse">
                <div className="h-16 bg-gray-200 rounded"></div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {statCards.map((card) => (
              <Card key={card.key} className="bg-white p-5 border-0 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">{card.label}</p>
                    <p className="text-2xl sm:text-3xl font-bold text-gray-800">
                      {stats ? stats[card.key].toLocaleString('pt-BR') : '0'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">{card.subLabel}</p>
                  </div>
                  <div className={`p-2.5 rounded-lg ${card.color}`}>
                    {card.icon}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Gráfico de Evolução */}
      <Card className="bg-white p-4 sm:p-6 border-0 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-800">Evolução Mensal</h2>
            <p className="text-sm text-gray-500 mt-0.5">Crescimento nos últimos 6 meses</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {metricOptions.map((metric) => (
              <button
                key={metric.key}
                onClick={() => setActiveMetric(metric.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                  activeMetric === metric.key
                    ? `${metric.color} border-current bg-opacity-10`
                    : 'text-gray-600 border-gray-300 hover:bg-gray-100'
                }`}
              >
                {metric.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="h-64 bg-gray-100 rounded-lg animate-pulse"></div>
        ) : evolution.length === 0 || evolution.every((d) => d[activeMetric] === 0) ? (
          <div className="h-64 flex items-center justify-center text-gray-500">
            Nenhum dado de evolução disponível
          </div>
        ) : (
          <div className="h-64 flex flex-col">
            <div className="flex-1 flex items-end justify-around gap-2 sm:gap-4 px-2">
              {evolution.map((data, index) => {
                const value = data[activeMetric]
                const heightPercent = Math.max((value / maxValue) * 100, 4)
                const metric = metricOptions.find((m) => m.key === activeMetric)!
                return (
                  <div
                    key={data.month}
                    className="flex-1 flex flex-col items-center justify-end h-full group relative"
                    onMouseEnter={() => setHoveredBar({ index, value, label: data.label })}
                    onMouseLeave={() => setHoveredBar(null)}
                  >
                    {hoveredBar?.index === index && (
                      <div className="absolute bottom-full mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap z-10">
                        {hoveredBar.label}: {hoveredBar.value}
                      </div>
                    )}
                    <div
                      className={`w-8 sm:w-12 rounded-t-md ${metric.bg}`}
                      style={{ height: `${heightPercent}%` }}
                    ></div>
                  </div>
                )
              })}
            </div>
            <div className="flex justify-around px-2 mt-2">
              {evolution.map((data) => (
                <span key={data.month} className="flex-1 text-center text-[10px] sm:text-xs text-gray-500">
                  {data.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {!loading && growthStats && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Comparativo com o mês anterior</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {growthStats.map((stat) => (
                <div key={stat.key} className="bg-gray-50 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-medium ${stat.color}`}>{stat.label}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      stat.diff >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {stat.diff >= 0 ? '+' : ''}{stat.percent}%
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {stat.currentValue} agora vs {stat.previousValue} no mês anterior
                    {stat.diff !== 0 && (
                      <span className={stat.diff >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {' '}({stat.diff >= 0 ? '+' : ''}{stat.diff})
                      </span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Ações Rápidas */}
      <div>
        <h2 className="text-lg font-bold text-gray-800 mb-4">Ações Rápidas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <Button
              key={action.path}
              onClick={() => navigate(action.path)}
              className={`w-full py-3 text-sm font-semibold rounded-lg transition-all ${action.color}`}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Fazendas Recentes */}
      <Card className="bg-white p-4 sm:p-6 border-0 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-6 gap-3">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-800">Fazendas Recentes</h2>
            <p className="text-sm text-gray-500 mt-0.5">Últimas fazendas cadastradas no sistema</p>
          </div>
          <Button variant="secondary" onClick={() => navigate('/admin/fazendas')} className="w-full sm:w-auto text-sm">
            Ver Todas
          </Button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse"></div>
            ))}
          </div>
        ) : fazendas.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-600 mb-3">Nenhuma fazenda cadastrada</p>
            <Button onClick={() => navigate('/admin/fazendas/nova')} className="bg-primary text-white text-sm">
              Cadastrar Primeira Fazenda
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {fazendas.slice(0, 5).map((fazenda) => (
              <div
                key={fazenda.id}
                className="flex items-center justify-between p-3 sm:p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => navigate(`/admin/fazendas/${fazenda.id}/detalhes`)}
              >
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    {fazenda.logo_url ? (
                      <img
                        src={fazenda.logo_url}
                        alt={fazenda.nome}
                        className="w-full h-full rounded-lg object-cover"
                      />
                    ) : (
                      <span className="text-primary font-bold text-lg">
                        {fazenda.nome.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-gray-800 text-sm sm:text-base truncate">{fazenda.nome}</h3>
                    <p className="text-xs sm:text-sm text-gray-500">ID: {fazenda.acesso_id}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={`px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium ${
                      fazenda.ativo
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {fazenda.ativo ? 'Ativa' : 'Inativa'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
