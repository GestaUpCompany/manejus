import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Card, Button, Input } from '../../components/ui'
import { supabase } from '../../services/supabaseClient'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

interface Lote {
  id: string
  nome: string
  cabecas: number
  pesoMedio: number
  categorias: string[]
  ativo: boolean
}

type PeriodoFiltro = '7d' | '30d' | '90d' | 'custom' | 'all'

export function RelatorioGado() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [lotes, setLotes] = useState<Lote[]>([])
  const [loading, setLoading] = useState(true)
  const [periodoFiltro, setPeriodoFiltro] = useState<PeriodoFiltro>('all')
  const [customDays, setCustomDays] = useState('')

  useEffect(() => {
    loadLotes()
  }, [user, periodoFiltro, customDays])

  const loadLotes = async () => {
    if (!user) return

    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) return

    const fazendaId = vinculos[0].fazenda_id

    // Build date range filter
    let fromDate: string | null = null
    if (periodoFiltro !== 'all') {
      let days: number
      if (periodoFiltro === 'custom') {
        days = parseInt(customDays) || 0
      } else {
        days = periodoFiltro === '7d' ? 7 : periodoFiltro === '30d' ? 30 : 90
      }
      if (days > 0) {
        const d = new Date()
        d.setDate(d.getDate() - days)
        fromDate = d.toISOString()
      }
    }

    let query = supabase
      .from('lotes')
      .select('id, nome, ativo, created_at')
      .eq('fazenda_id', fazendaId)
      .eq('ativo', true)

    if (fromDate) {
      query = query.gte('created_at', fromDate)
    }

    const { data: lotesData } = await query

    if (!lotesData || lotesData.length === 0) {
      setLotes([])
      setLoading(false)
      return
    }

    const loteIds = lotesData.map(l => l.id)
    const { data: categoriasData } = await supabase
      .from('lote_categorias')
      .select('lote_id, categoria, quant_atual, quant_inicial, peso_vivo_atual_kg_cab, peso_entrada_kg_cab')
      .in('lote_id', loteIds)
      .eq('ativo', true)

    const categoriasPorLote: Record<string, NonNullable<typeof categoriasData>[number][]> = {}
    categoriasData?.forEach(cat => {
      if (!categoriasPorLote[cat.lote_id]) categoriasPorLote[cat.lote_id] = []
      categoriasPorLote[cat.lote_id].push(cat)
    })

    const enrichedLotes: Lote[] = lotesData.map(lote => {
      const cats = categoriasPorLote[lote.id] || []
      const cabecas = cats.reduce((sum, c) => sum + (c.quant_atual ?? c.quant_inicial ?? 0), 0)
      const totalPeso = cats.reduce((sum, c) => {
        const q = c.quant_atual ?? c.quant_inicial ?? 0
        const pesoAtual = c.peso_vivo_atual_kg_cab ? parseFloat(c.peso_vivo_atual_kg_cab as unknown as string) : 0
        const pesoEntrada = c.peso_entrada_kg_cab ? parseFloat(c.peso_entrada_kg_cab as unknown as string) : 0
        const p = pesoAtual || pesoEntrada || 0
        return sum + (q * p)
      }, 0)
      const pesoMedio = cabecas > 0 ? totalPeso / cabecas : 0
      return {
        id: lote.id,
        nome: lote.nome,
        cabecas,
        pesoMedio,
        categorias: cats.map(c => c.categoria).filter(Boolean),
        ativo: lote.ativo,
      }
    })

    setLotes(enrichedLotes)
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-surface-1 p-6 border-0 shadow-sm rounded-xl">
            <div className="h-4 w-24 bg-surface-3 rounded animate-pulse mb-2" />
            <div className="h-10 w-20 bg-surface-3 rounded animate-pulse" />
          </div>
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
          <div className="h-48 bg-surface-3 rounded animate-pulse" />
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

  const totalAnimais = lotes.reduce((acc, lote) => acc + lote.cabecas, 0)
  const lotesComPeso = lotes.filter(l => l.pesoMedio > 0)
  const totalCabecasComPeso = lotesComPeso.reduce((sum, l) => sum + l.cabecas, 0)
  const totalPeso = lotesComPeso.reduce((sum, l) => sum + (l.cabecas * l.pesoMedio), 0)
  const pesoMedio = totalCabecasComPeso > 0 ? totalPeso / totalCabecasComPeso : 0

  // Dados para o gráfico
  const dadosGrafico = lotes.map(lote => ({
    nome: lote.nome,
    cabecas: lote.cabecas,
  }))

  return (
    <div className="space-y-6 page-transition">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold text-content-strong">Relatório de Gado</h2>
        <Button onClick={() => navigate('/controller/dashboard')} variant="secondary" className="w-full md:w-auto">
          Voltar ao Dashboard
        </Button>
      </div>

      {/* Filtro de Período */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <span className="text-sm text-content-muted">Relatório dos últimos:</span>
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
            variant={periodoFiltro === 'custom' ? 'primary' : 'secondary'}
            onClick={() => setPeriodoFiltro('custom')}
            className="text-sm flex-1 sm:flex-none"
          >
            Personalizado
          </Button>
          <Button
            variant={periodoFiltro === 'all' ? 'primary' : 'secondary'}
            onClick={() => setPeriodoFiltro('all')}
            className="text-sm flex-1 sm:flex-none"
          >
            Todo o período
          </Button>
        </div>
        {periodoFiltro === 'custom' && (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min="1"
              placeholder="Dias"
              value={customDays}
              onChange={(e) => setCustomDays(e.target.value)}
              className="w-20 h-10 text-sm border-border-base focus:border-accent"
            />
            <span className="text-sm text-content-muted">dias</span>
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
        <Card className="bg-surface-1 p-6 border-0 shadow-sm">
          <p className="text-sm text-content-muted mb-2">Total de Animais</p>
          <p className="text-4xl font-bold text-content-strong">{totalAnimais}</p>
          <p className="text-xs text-content-faint mt-2">Cabeças</p>
        </Card>
        <Card className="bg-surface-1 p-6 border-0 shadow-sm">
          <p className="text-sm text-content-muted mb-2">Total de Lotes</p>
          <p className="text-4xl font-bold text-content-strong">{lotes.length}</p>
          <p className="text-xs text-content-faint mt-2">Lotes ativos</p>
        </Card>
        <Card className="bg-surface-1 p-6 border-0 shadow-sm">
          <p className="text-sm text-content-muted mb-2">Peso Médio</p>
          <p className="text-4xl font-bold text-content-strong">{pesoMedio.toFixed(0)}</p>
          <p className="text-xs text-content-faint mt-2">kg por animal</p>
        </Card>
      </div>

      {/* Gráfico de Distribuição por Lote */}
      <Card className="bg-surface-1 p-6 border-0 shadow-sm">
        <h3 className="text-xl font-semibold text-content-strong mb-4">Distribuição de cabeças por Lote</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={dadosGrafico}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="nome" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="cabecas" fill="#10b981" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Detalhes por Lote */}
      <Card className="bg-surface-1 p-6 border-0 shadow-sm">
        <h3 className="text-xl font-semibold text-content-strong mb-4">Detalhes por Lote</h3>
        <div className="space-y-3">
          {lotes.map((lote) => (
            <div key={lote.id} className="flex justify-between items-center p-4 bg-surface-2 rounded-lg">
              <div>
                <p className="font-medium text-content-strong">{lote.nome}</p>
                <p className="text-sm text-content-muted">
                  {lote.categorias && Array.isArray(lote.categorias) 
                    ? lote.categorias.join(', ') 
                    : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-content-strong">{lote.cabecas} cabeças</p>
                <p className="text-sm text-content-muted">
                  {lote.pesoMedio > 0 ? `${lote.pesoMedio.toFixed(0)} kg médio` : 'Peso não informado'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
