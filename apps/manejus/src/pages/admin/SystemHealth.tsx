import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../services/supabaseClient'
import { Card } from '../../components/ui'

interface SystemHealth {
  postgres: {
    version: string
    timezone: string
    maxConnections: number
    sharedBuffers: string
    effectiveCacheSize: string
    workMem: string
    startTime: string
    uptimeSeconds: number
  }
  database: {
    sizeBytes: number
    sizePretty: string
    totalTables: number
    totalIndexes: number
    totalFunctions: number
    securityDefinerFunctions: number
    rlsTables: number
    rlsPolicies: number
  }
  connections: {
    total: number
    active: number
    idle: number
    idleInTransaction: number
    maxDirect: number
  }
  users: {
    total: number
    active24h: number
    active1h: number
    activeSessions1h: number
    signupsToday: number
    signups7d: number
    byRole: { role: string; count: number }[]
  }
  fazendas: {
    total: number
    ativas: number
    withUsers24h: number
  }
  fazendasActive: { fazenda_id: string; fazenda_nome: string; active_users: number }[]
  dataVolume: {
    lotes: number
    individuos: number
    registrosSuplementacao: number
    registrosMaternidade: number
    registrosEnfermaria: number
    planosNutricionais: number
  }
  throughput: {
    xactCommit: number
    xactRollback: number
    xactTotal: number
    rollbackRate: number
    tupInserted: number
    tupUpdated: number
    tupDeleted: number
    tupReturned: number
    tupFetched: number
  }
  cache: {
    hitRatio: number
    blksHit: number
    blksRead: number
    deadlocks: number
    conflicts: number
    tempBytes: number
    tempFiles: number
  }
  indexUsage: {
    seqScans: number
    idxScans: number
    deadTuples: number
    liveTuples: number
  }
  unusedIndexes: {
    schemaname: string
    relname: string
    indexrelname: string
    idxScan: number
    sizeBytes: number
    sizePretty: string
  }[]
  topTables: { name: string; sizePretty: string; sizeBytes: number }[]
  slowQueries: {
    pid: number
    state: string
    query: string
    durationMs: number
    applicationName: string | null
    userName: string | null
  }[]
  cronJobs: {
    jobid: number
    jobname: string
    schedule: string
    active: boolean
    command: string
  }[]
  samples: {
    sampledAt: string
    dbSizeBytes: number
    activeConnections: number
    totalConnections: number
    activeUsers1h: number
    activeSessions1h: number
    cacheHitRatio: number
    xactTotal: number
    avgQueryMs: number
    maxQueryMs: number
    activeQueries: number
  }[]
  growthRate: {
    bytesPerHour: number | null
    bytesPerDay: number | null
    size24hAgo: number
    sizeNow: number
    deltaBytes: number
    hoursSpan: number
  } | null
  timestamp: string
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}min`
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h ${mins}m`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toString()
}

function connectionColor(total: number, max: number): string {
  const pct = (total / max) * 100
  if (pct < 50) return 'text-green-600'
  if (pct < 80) return 'text-amber-600'
  return 'text-red-600'
}

function cacheColor(ratio: number): string {
  if (ratio >= 99) return 'text-green-600'
  if (ratio >= 95) return 'text-amber-600'
  return 'text-red-600'
}

function rollbackColor(rate: number): string {
  if (rate < 1) return 'text-green-600'
  if (rate < 5) return 'text-amber-600'
  return 'text-red-600'
}

// Mini gráfico SVG sparkline
function Sparkline({ data, color = '#7c3aed', height = 40, width = 200 }: { data: number[]; color?: string; height?: number; width?: number }) {
  if (data.length < 2) {
    return <div className="text-xs text-gray-400" style={{ height }}>Aguardando dados...</div>
  }
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {data.length > 0 && (
        <circle
          cx={width}
          cy={height - ((data[data.length - 1] - min) / range) * (height - 4) - 2}
          r={2.5}
          fill={color}
        />
      )}
    </svg>
  )
}

export function SystemHealth() {
  const [data, setData] = useState<SystemHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const { data: result, error: err } = await supabase.rpc('get_system_health')
      if (err) throw err
      setData(result as unknown as SystemHealth)
      setLastRefresh(new Date())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchData])

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-600">Carregando métricas...</p>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-2">Erro ao carregar dados do sistema</p>
        <p className="text-sm text-gray-500">{error}</p>
        <button onClick={fetchData} className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm">
          Tentar novamente
        </button>
      </div>
    )
  }

  if (!data) return null

  const connPct = Math.round((data.connections.total / data.connections.maxDirect) * 100)
  const idxPct = data.indexUsage.seqScans + data.indexUsage.idxScans > 0
    ? Math.round((data.indexUsage.idxScans / (data.indexUsage.seqScans + data.indexUsage.idxScans)) * 100)
    : 0
  const tps = data.postgres.uptimeSeconds > 0
    ? Math.round(data.throughput.xactTotal / data.postgres.uptimeSeconds)
    : 0

  // Dados para sparklines (samples vêm em ordem DESC, reverter para cronológica)
  const samples = [...(data.samples || [])].reverse()
  const connData = samples.map(s => s.totalConnections)
  const usersData = samples.map(s => s.activeUsers1h)
  const cacheData = samples.map(s => s.cacheHitRatio)
  const dbSizeData = samples.map(s => s.dbSizeBytes / (1024 * 1024)) // em MB
  const avgQueryData = samples.map(s => s.avgQueryMs)

  const unusedIndexesTotalSize = data.unusedIndexes.reduce((sum, idx) => sum + idx.sizeBytes, 0)

  return (
    <div className="space-y-6">
      {/* Header com controles */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Saúde do Sistema</h1>
          <p className="text-sm text-gray-500 mt-1">
            Monitoramento em tempo real {lastRefresh && `(atualizado: ${lastRefresh.toLocaleTimeString('pt-BR')})`}
            {' '}| Uptime: {formatUptime(data.postgres.uptimeSeconds)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
            />
            Auto-atualizar (5s)
          </label>
          <button
            onClick={fetchData}
            className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 transition-colors"
          >
            Atualizar
          </button>
        </div>
      </div>

      {/* Cards principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Conexões com sparkline */}
        <Card className="bg-white p-5 shadow-md rounded-xl border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-500">Conexões no Banco</p>
            <span className={`text-2xl font-bold ${connectionColor(data.connections.total, data.connections.maxDirect)}`}>
              {data.connections.total}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
            <div
              className={`h-2 rounded-full transition-all ${
                connPct < 50 ? 'bg-green-500' : connPct < 80 ? 'bg-amber-500' : 'bg-red-500'
              }`}
              style={{ width: `${Math.min(connPct, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mb-2">
            <span>Limite: {data.connections.maxDirect}</span>
            <span>{connPct}% usado</span>
          </div>
          {connData.length > 1 && (
            <div className="mb-2">
              <Sparkline data={connData} color="#3b82f6" width={180} />
              <p className="text-xs text-gray-400">Tendência (24h, a cada 5min)</p>
            </div>
          )}
          <div className="mt-2 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">Ativas</span>
              <span className="text-blue-600 font-medium">{data.connections.active}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Ociosas</span>
              <span className="text-gray-600 font-medium">{data.connections.idle}</span>
            </div>
            {data.connections.idleInTransaction > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-400">Ociosa em transação</span>
                <span className="text-red-600 font-medium">{data.connections.idleInTransaction}</span>
              </div>
            )}
          </div>
        </Card>

        {/* Usuários ativos com sparkline */}
        <Card className="bg-white p-5 shadow-md rounded-xl border border-gray-100">
          <p className="text-sm text-gray-500 mb-1">Usuários Ativos</p>
          <p className="text-3xl font-bold text-purple-600">{data.users.active1h}</p>
          <p className="text-xs text-gray-400 mt-1">na última hora</p>
          {usersData.length > 1 && (
            <div className="my-2">
              <Sparkline data={usersData} color="#7c3aed" width={180} />
              <p className="text-xs text-gray-400">Tendência (24h)</p>
            </div>
          )}
          <div className="mt-2 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">Últimas 24h</span>
              <span className="text-gray-700 font-medium">{data.users.active24h}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Sessões ativas (1h)</span>
              <span className="text-gray-700 font-medium">{data.users.activeSessions1h}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Cadastros hoje</span>
              <span className="text-gray-700 font-medium">{data.users.signupsToday}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Cadastros 7 dias</span>
              <span className="text-gray-700 font-medium">{data.users.signups7d}</span>
            </div>
          </div>
        </Card>

        {/* Cache hit ratio com sparkline */}
        <Card className="bg-white p-5 shadow-md rounded-xl border border-gray-100">
          <p className="text-sm text-gray-500 mb-1">Cache Hit Ratio</p>
          <p className={`text-3xl font-bold ${cacheColor(data.cache.hitRatio)}`}>{data.cache.hitRatio}%</p>
          <p className="text-xs text-gray-400 mt-1">{formatNumber(data.cache.blksHit)} hits / {formatNumber(data.cache.blksRead)} reads</p>
          {cacheData.length > 1 && (
            <div className="my-2">
              <Sparkline data={cacheData} color="#10b981" width={180} />
              <p className="text-xs text-gray-400">Tendência (24h)</p>
            </div>
          )}
          <div className="mt-2 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">Deadlocks</span>
              <span className={data.cache.deadlocks > 0 ? 'text-red-600 font-medium' : 'text-gray-600 font-medium'}>
                {data.cache.deadlocks}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Conflitos</span>
              <span className={data.cache.conflicts > 0 ? 'text-amber-600 font-medium' : 'text-gray-600 font-medium'}>
                {data.cache.conflicts}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Arquivos temp.</span>
              <span className="text-gray-600 font-medium">{formatNumber(data.cache.tempFiles)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Dados temp. (acum.)</span>
              <span className="text-gray-600 font-medium">{formatBytes(data.cache.tempBytes)}</span>
            </div>
          </div>
        </Card>

        {/* Throughput */}
        <Card className="bg-white p-5 shadow-md rounded-xl border border-gray-100">
          <p className="text-sm text-gray-500 mb-1">Transações</p>
          <p className="text-3xl font-bold text-gray-800">{formatNumber(data.throughput.xactTotal)}</p>
          <p className="text-xs text-gray-400 mt-1">{tps} TPS médio | Rollback: <span className={rollbackColor(data.throughput.rollbackRate)}>{data.throughput.rollbackRate}%</span></p>
          {avgQueryData.length > 1 && (
            <div className="my-2">
              <Sparkline data={avgQueryData} color="#f59e0b" width={180} />
              <p className="text-xs text-gray-400">Latência média das queries ativas (ms)</p>
            </div>
          )}
          <div className="mt-2 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">Commits</span>
              <span className="text-green-600 font-medium">{formatNumber(data.throughput.xactCommit)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Rollbacks</span>
              <span className="text-gray-600 font-medium">{formatNumber(data.throughput.xactRollback)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Linhas inseridas</span>
              <span className="text-gray-600 font-medium">{formatNumber(data.throughput.tupInserted)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Linhas atualizadas</span>
              <span className="text-gray-600 font-medium">{formatNumber(data.throughput.tupUpdated)}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Gráfico de crescimento do banco + Fazendas ativas agora */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Crescimento do banco */}
        <Card className="bg-white p-5 shadow-md rounded-xl border border-gray-100 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-800">Crescimento do Banco (24h)</h3>
            {data.growthRate && data.growthRate.bytesPerDay !== null && (
              <div className="text-right">
                <p className="text-sm font-bold text-gray-700">
                  {data.growthRate.bytesPerDay > 0 ? '+' : ''}{formatBytes(data.growthRate.bytesPerDay)}/dia
                </p>
                <p className="text-xs text-gray-400">
                  {formatBytes(data.growthRate.deltaBytes)} em {data.growthRate.hoursSpan}h
                </p>
              </div>
            )}
          </div>
          {dbSizeData.length > 1 ? (
            <div className="flex items-end gap-1 h-32">
              {dbSizeData.map((sizeMB, i) => {
                const min = Math.min(...dbSizeData)
                const max = Math.max(...dbSizeData)
                const range = max - min || 1
                const heightPct = ((sizeMB - min) / range) * 80 + 20
                return (
                  <div
                    key={i}
                    className="flex-1 bg-purple-400 rounded-t hover:bg-purple-600 transition-colors min-w-[2px]"
                    style={{ height: `${heightPct}%` }}
                    title={`${sizeMB.toFixed(1)} MB`}
                  />
                )
              })}
            </div>
          ) : (
            <div className="h-32 flex items-center justify-center text-sm text-gray-400">
              Aguardando amostras (cron a cada 5 min)...
            </div>
          )}
          <div className="flex justify-between mt-2 text-xs text-gray-400">
            <span>{data.database.sizePretty} agora</span>
            <span>Projeção mensal: {data.growthRate?.bytesPerDay ? formatBytes(data.growthRate.bytesPerDay * 30) : '...'}</span>
          </div>
        </Card>

        {/* Fazendas ativas agora */}
        <Card className="bg-white p-5 shadow-md rounded-xl border border-gray-100">
          <h3 className="text-base font-semibold text-gray-800 mb-4">Fazendas Ativas Agora (1h)</h3>
          {data.fazendasActive.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Nenhuma fazenda com atividade na última hora</p>
          ) : (
            <div className="space-y-2">
              {data.fazendasActive.map((f) => (
                <div key={f.fazenda_id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-700 truncate">{f.fazenda_nome}</span>
                  </div>
                  <span className="text-sm text-purple-600 font-bold flex-shrink-0">{f.active_users}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400 space-y-1">
            <div className="flex justify-between">
              <span>Total ativas (24h)</span>
              <span className="text-gray-600 font-medium">{data.fazendas.withUsers24h}/{data.fazendas.ativas}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Fazendas, volume e índices */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="bg-white p-5 shadow-md rounded-xl border border-gray-100">
          <h3 className="text-base font-semibold text-gray-800 mb-4">Fazendas</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-800">{data.fazendas.total}</p>
              <p className="text-xs text-gray-500 mt-1">Total</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{data.fazendas.ativas}</p>
              <p className="text-xs text-gray-500 mt-1">Ativas</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{data.fazendas.withUsers24h}</p>
              <p className="text-xs text-gray-500 mt-1">Ativas 24h</p>
            </div>
          </div>
        </Card>

        <Card className="bg-white p-5 shadow-md rounded-xl border border-gray-100">
          <h3 className="text-base font-semibold text-gray-800 mb-4">Volume de Dados</h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xl font-bold text-gray-800">{data.dataVolume.lotes}</p>
              <p className="text-xs text-gray-500">Lotes</p>
            </div>
            <div>
              <p className="text-xl font-bold text-gray-800">{data.dataVolume.individuos}</p>
              <p className="text-xs text-gray-500">Indivíduos</p>
            </div>
            <div>
              <p className="text-xl font-bold text-gray-800">{data.dataVolume.planosNutricionais}</p>
              <p className="text-xs text-gray-500">Planos Nut.</p>
            </div>
            <div>
              <p className="text-xl font-bold text-gray-800">{data.dataVolume.registrosSuplementacao}</p>
              <p className="text-xs text-gray-500">Suplement.</p>
            </div>
            <div>
              <p className="text-xl font-bold text-gray-800">{data.dataVolume.registrosMaternidade}</p>
              <p className="text-xs text-gray-500">Matern.</p>
            </div>
            <div>
              <p className="text-xl font-bold text-gray-800">{data.dataVolume.registrosEnfermaria}</p>
              <p className="text-xs text-gray-500">Enferm.</p>
            </div>
          </div>
        </Card>

        <Card className="bg-white p-5 shadow-md rounded-xl border border-gray-100">
          <h3 className="text-base font-semibold text-gray-800 mb-4">Uso de Índices</h3>
          <div className="text-center mb-3">
            <p className="text-3xl font-bold text-gray-800">{idxPct}%</p>
            <p className="text-xs text-gray-500 mt-1">queries via índice</p>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
            <div className="h-2 rounded-full bg-blue-500" style={{ width: `${idxPct}%` }} />
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">Scans via índice</span>
              <span className="text-blue-600 font-medium">{formatNumber(data.indexUsage.idxScans)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Scans sequenciais</span>
              <span className="text-gray-600 font-medium">{formatNumber(data.indexUsage.seqScans)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Tuplas vivas</span>
              <span className="text-gray-600 font-medium">{formatNumber(data.indexUsage.liveTuples)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Tuplas mortas (bloat)</span>
              <span className={data.indexUsage.deadTuples > 1000 ? 'text-amber-600 font-medium' : 'text-gray-600 font-medium'}>
                {formatNumber(data.indexUsage.deadTuples)}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Queries em execução */}
      <Card className="bg-white p-5 shadow-md rounded-xl border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-800">Queries em Execução</h3>
          <span className={`text-xs px-2 py-1 rounded-full ${data.slowQueries.length > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
            {data.slowQueries.length} ativa{data.slowQueries.length !== 1 ? 's' : ''}
          </span>
        </div>
        {data.slowQueries.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">Nenhuma query ativa no momento</p>
        ) : (
          <div className="space-y-2">
            {data.slowQueries.map((q) => (
              <div key={q.pid} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-gray-500">PID {q.pid}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{q.state}</span>
                    {q.applicationName && (
                      <span className="text-xs text-gray-400">{q.applicationName}</span>
                    )}
                  </div>
                  <span className="text-xs font-medium text-gray-600">{formatDuration(q.durationMs)}</span>
                </div>
                <pre className="text-xs text-gray-700 font-mono whitespace-pre-wrap break-all line-clamp-3">{q.query}</pre>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Índices não utilizados + Tabelas pesadas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-white p-5 shadow-md rounded-xl border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-800">Índices Não Utilizados</h3>
            <div className="text-right">
              <p className="text-xs text-gray-400">{data.unusedIndexes.length} índices</p>
              <p className="text-xs text-amber-600 font-medium">{formatBytes(unusedIndexesTotalSize)} recuperáveis</p>
            </div>
          </div>
          {data.unusedIndexes.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Nenhum índice não utilizado</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {data.unusedIndexes.slice(0, 20).map((idx) => (
                <div key={`${idx.schemaname}.${idx.indexrelname}`} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-700 truncate">{idx.indexrelname}</p>
                    <p className="text-xs text-gray-400">em {idx.relname}</p>
                  </div>
                  <span className="text-sm text-gray-500 flex-shrink-0 ml-2">{idx.sizePretty}</span>
                </div>
              ))}
              {data.unusedIndexes.length > 20 && (
                <p className="text-xs text-gray-400 text-center pt-2">
                  +{data.unusedIndexes.length - 20} índices menores...
                </p>
              )}
            </div>
          )}
          <p className="text-xs text-gray-400 mt-3 pt-3 border-t border-gray-100">
            Índices com 0 scans desde o último restart. Excluir os maiores pode recuperar espaço e melhorar performance de escrita.
          </p>
        </Card>

        <Card className="bg-white p-5 shadow-md rounded-xl border border-gray-100">
          <h3 className="text-base font-semibold text-gray-800 mb-4">Tabelas Mais Pesadas</h3>
          <div className="space-y-2">
            {data.topTables.map((t, i) => (
              <div key={t.name} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs text-gray-400 w-5">{i + 1}</span>
                  <span className="text-sm font-medium text-gray-700 truncate">{t.name}</span>
                </div>
                <span className="text-sm text-gray-500 flex-shrink-0">{t.sizePretty}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Cron jobs e Configuração */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-white p-5 shadow-md rounded-xl border border-gray-100">
          <h3 className="text-base font-semibold text-gray-800 mb-4">Cron Jobs</h3>
          <div className="space-y-2">
            {data.cronJobs.map((job) => (
              <div key={job.jobid} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">{job.jobname}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${job.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {job.active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="font-mono">{job.schedule}</span>
                  <span className="text-gray-400">#{job.jobid}</span>
                </div>
                <p className="text-xs text-gray-400 mt-1 font-mono truncate">{job.command}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="bg-white p-5 shadow-md rounded-xl border border-gray-100">
          <h3 className="text-base font-semibold text-gray-800 mb-4">Configuração do PostgreSQL</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-400">Versão</p>
              <p className="text-sm font-medium text-gray-700">{data.postgres.version}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Timezone</p>
              <p className="text-sm font-medium text-gray-700">{data.postgres.timezone}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Max Connections</p>
              <p className="text-sm font-medium text-gray-700">{data.postgres.maxConnections}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Shared Buffers</p>
              <p className="text-sm font-medium text-gray-700">{data.postgres.sharedBuffers}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Effective Cache</p>
              <p className="text-sm font-medium text-gray-700">{data.postgres.effectiveCacheSize}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Work Mem</p>
              <p className="text-sm font-medium text-gray-700">{data.postgres.workMem}</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
