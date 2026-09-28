import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Card, Button } from '../../components/ui'
import { supabase } from '../../services/supabaseClient'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

interface RegistroMorte {
  id: string
  data: string
  causa_morte: string
  lote: string
}

interface RegistroEnfermaria {
  id: string
  data: string
  diagnostico: string
  tratamento: string
  lote?: string
}

type PeriodoFiltro = '7d' | '30d' | '90d' | 'all'

export function RelatorioSaude() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [mortes, setMortes] = useState<RegistroMorte[]>([])
  const [enfermidades, setEnfermidades] = useState<RegistroEnfermaria[]>([])
  const [loading, setLoading] = useState(true)
  const [periodoFiltro, setPeriodoFiltro] = useState<PeriodoFiltro>('all')

  useEffect(() => {
    loadData()
  }, [user, periodoFiltro])

  const getDataFiltro = () => {
    const hoje = new Date()
    switch (periodoFiltro) {
      case '7d':
        return new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000)
      case '30d':
        return new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000)
      case '90d':
        return new Date(hoje.getTime() - 90 * 24 * 60 * 60 * 1000)
      case 'all':
      default:
        return null
    }
  }

  const loadData = async () => {
    if (!user) return

    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) return

    const fazendaId = vinculos[0].fazenda_id
    const dataFiltro = getDataFiltro()

    let queryMortes = supabase
      .from('registros_morte')
      .select('*')
      .eq('fazenda_id', fazendaId)

    let queryEnfermidades = supabase
      .from('registros_enfermaria')
      .select('*')
      .eq('fazenda_id', fazendaId)

    if (dataFiltro) {
      const dataFiltroStr = dataFiltro.toISOString().split('T')[0]
      queryMortes = queryMortes.gte('data', dataFiltroStr)
      queryEnfermidades = queryEnfermidades.gte('data', dataFiltroStr)
    }

    const [mortesData, enfermidadesData] = await Promise.all([
      queryMortes.order('data', { ascending: false }).limit(50),
      queryEnfermidades.order('data', { ascending: false }).limit(50),
    ])

    setMortes(mortesData.data || [])
    setEnfermidades(enfermidadesData.data || [])
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="h-8 w-48 bg-surface-3 rounded animate-pulse" />
          <div className="h-10 w-32 bg-surface-3 rounded animate-pulse" />
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-content-muted">Período:</span>
          <div className="flex gap-2">
            <div className="h-8 w-16 bg-surface-3 rounded animate-pulse" />
            <div className="h-8 w-16 bg-surface-3 rounded animate-pulse" />
            <div className="h-8 w-16 bg-surface-3 rounded animate-pulse" />
            <div className="h-8 w-24 bg-surface-3 rounded animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-surface-1 p-6 border-0 shadow-sm rounded-xl">
            <div className="h-4 w-24 bg-surface-3 rounded animate-pulse mb-2" />
            <div className="h-10 w-20 bg-surface-3 rounded animate-pulse" />
          </div>
          <div className="bg-surface-1 p-6 border-0 shadow-sm rounded-xl">
            <div className="h-4 w-24 bg-surface-3 rounded animate-pulse mb-2" />
            <div className="h-10 w-20 bg-surface-3 rounded animate-pulse" />
          </div>
        </div>
        <div className="bg-surface-1 p-6 border-0 shadow-sm rounded-xl">
          <div className="h-6 w-48 bg-surface-3 rounded animate-pulse mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="h-64 bg-surface-3 rounded animate-pulse" />
            <div className="space-y-3">
              <div className="h-12 bg-surface-3 rounded animate-pulse" />
              <div className="h-12 bg-surface-3 rounded animate-pulse" />
              <div className="h-12 bg-surface-3 rounded animate-pulse" />
            </div>
          </div>
        </div>
        <div className="bg-surface-1 p-6 border-0 shadow-sm rounded-xl">
          <div className="h-6 w-48 bg-surface-3 rounded animate-pulse mb-4" />
          <div className="space-y-3">
            <div className="h-12 bg-surface-3 rounded animate-pulse" />
            <div className="h-12 bg-surface-3 rounded animate-pulse" />
            <div className="h-12 bg-surface-3 rounded animate-pulse" />
          </div>
        </div>
        <div className="bg-surface-1 p-6 border-0 shadow-sm rounded-xl">
          <div className="h-6 w-48 bg-surface-3 rounded animate-pulse mb-4" />
          <div className="space-y-3">
            <div className="h-12 bg-surface-3 rounded animate-pulse" />
            <div className="h-12 bg-surface-3 rounded animate-pulse" />
            <div className="h-12 bg-surface-3 rounded animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  const causasCount: { [key: string]: number } = {}
  mortes.forEach(m => {
    if (m.causa_morte) {
      causasCount[m.causa_morte] = (causasCount[m.causa_morte] || 0) + 1
    }
  })

  const causasMorteFrequentes = Object.entries(causasCount)
    .map(([causa, total]) => ({ causa, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)

  // Cores para o gráfico de pizza
  const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f59e0b']

  return (
    <div className="space-y-6 page-transition">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold text-content-strong">Relatório de Saúde</h2>
        <Button onClick={() => navigate('/controller/dashboard')} variant="secondary" className="w-full md:w-auto">
          Voltar ao Dashboard
        </Button>
      </div>

      {/* Filtro de Período */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <span className="text-sm text-content-muted">Período:</span>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Button
            variant={periodoFiltro === '7d' ? 'primary' : 'secondary'}
            onClick={() => setPeriodoFiltro('7d')}
            className="text-sm flex-1 sm:flex-none"
          >
            7 dias
          </Button>
          <Button
            variant={periodoFiltro === '30d' ? 'primary' : 'secondary'}
            onClick={() => setPeriodoFiltro('30d')}
            className="text-sm flex-1 sm:flex-none"
          >
            30 dias
          </Button>
          <Button
            variant={periodoFiltro === '90d' ? 'primary' : 'secondary'}
            onClick={() => setPeriodoFiltro('90d')}
            className="text-sm flex-1 sm:flex-none"
          >
            90 dias
          </Button>
          <Button
            variant={periodoFiltro === 'all' ? 'primary' : 'secondary'}
            onClick={() => setPeriodoFiltro('all')}
            className="text-sm flex-1 sm:flex-none"
          >
            Todo o período
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
        <Card className="bg-surface-1 p-6 border-0 shadow-sm">
          <p className="text-sm text-content-muted mb-2">Total de Mortes</p>
          <p className="text-4xl font-bold text-red-500">{mortes.length}</p>
          <p className="text-xs text-content-faint mt-2">Registros totais</p>
        </Card>
        <Card className="bg-surface-1 p-6 border-0 shadow-sm">
          <p className="text-sm text-content-muted mb-2">Total de Tratamentos</p>
          <p className="text-4xl font-bold text-orange-600">{enfermidades.length}</p>
          <p className="text-xs text-content-faint mt-2">Registros totais</p>
        </Card>
      </div>

      {/* Causas de Morte Mais Frequentes */}
      <Card className="bg-surface-1 p-6 border-0 shadow-sm">
        <h3 className="text-xl font-semibold text-content-strong mb-4">Causas de Morte Mais Frequentes</h3>
        {causasMorteFrequentes.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={causasMorteFrequentes}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry: any) => `${entry.causa} ${((entry.total / mortes.length) * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="total"
                >
                  {causasMorteFrequentes.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3">
              {causasMorteFrequentes.map((item, index) => (
                <div key={index} className="flex justify-between items-center p-3 bg-surface-2 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                    <p className="text-sm text-content">{item.causa}</p>
                  </div>
                  <p className="text-lg font-bold text-content-strong">{item.total}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-content-muted">Nenhum registro de morte encontrado</p>
        )}
      </Card>

      {/* Últimos Registros de Morte */}
      <Card className="bg-surface-1 p-6 border-0 shadow-sm">
        <h3 className="text-xl font-semibold text-content-strong mb-4">Últimos Registros de Morte</h3>
        <div className="space-y-3">
          {mortes.slice(0, 10).map((morte) => (
            <div key={morte.id} className="flex justify-between items-center p-3 bg-surface-2 rounded-lg">
              <div>
                <p className="font-medium text-content-strong">{morte.causa_morte}</p>
                <p className="text-sm text-content-muted">Lote: {morte.lote}</p>
              </div>
              <p className="text-sm text-content-muted">{morte.data}</p>
            </div>
          ))}
          {mortes.length === 0 && (
            <p className="text-sm text-content-muted">Nenhum registro de morte encontrado</p>
          )}
        </div>
      </Card>

      {/* Últimos Registros de Enfermaria */}
      <Card className="bg-surface-1 p-6 border-0 shadow-sm">
        <h3 className="text-xl font-semibold text-content-strong mb-4">Últimos Registros de Enfermaria</h3>
        <div className="space-y-3">
          {enfermidades.slice(0, 10).map((enfermidade) => (
            <div key={enfermidade.id} className="flex justify-between items-center p-3 bg-surface-2 rounded-lg">
              <div>
                <p className="font-medium text-content-strong">{enfermidade.tratamento}</p>
                <p className="text-sm text-content-muted">Lote: {enfermidade.lote}</p>
              </div>
              <p className="text-sm text-content-muted">{enfermidade.data}</p>
            </div>
          ))}
          {enfermidades.length === 0 && (
            <p className="text-sm text-content-muted">Nenhum registro de enfermaria encontrado</p>
          )}
        </div>
      </Card>
    </div>
  )
}
