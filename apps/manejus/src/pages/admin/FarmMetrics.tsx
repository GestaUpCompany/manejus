import { Fragment, useEffect, useState, useCallback } from 'react'
import { supabase } from '../../services/supabaseClient'
import { Card } from '../../components/ui'

interface FarmMetric {
  id: string
  nome: string
  ativo: boolean
  createdAt: string
  usuarios: number
  usuariosAtivos24h: number
  usuariosAtivos7d: number
  lotes: number
  lotesAtivos: number
  individuos: number
  pastos: number
  currais: number
  planosNutricionais: number
  planosAtivos: number
  formulacoes: number
  registrosSuplementacao: number
  registrosSuplementacao30d: number
  registrosMaternidade: number
  registrosEnfermaria: number
  registrosMovimentacao: number
  registrosLeituraCocho: number
  registrosAlimentacao: number
  notificacoesEnviadas: number
  chatIaLogs: number
  ultimaAtividade: string | null
  crescimento30d: number
}

interface Summary {
  totalFarms: number
  farmsAtivas: number
  farmsAtivas24h: number
  farmsAtivas7d: number
  farmsInativas30d: number
  totalUsuarios: number
  totalLotes: number
  totalIndividuos: number
  totalRegistros30d: number
}

interface UsageData {
  farms: FarmMetric[]
  summary: Summary
  timestamp: string
}

type SortField = 'crescimento30d' | 'usuariosAtivos24h' | 'registrosSuplementacao' | 'lotesAtivos' | 'individuos' | 'ultimaAtividade' | 'nome'
type SortDir = 'asc' | 'desc'

function formatLastActivity(date: string | null): string {
  if (!date) return 'Nunca'
  const d = new Date(date)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Hoje'
  if (diffDays === 1) return 'Ontem'
  if (diffDays < 7) return `Há ${diffDays} dias`
  if (diffDays < 30) return `Há ${Math.floor(diffDays / 7)} sem.`
  if (diffDays < 365) return `Há ${Math.floor(diffDays / 30)} meses`
  return d.toLocaleDateString('pt-BR')
}

function activityColor(date: string | null): string {
  if (!date) return 'text-gray-400'
  const d = new Date(date)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays <= 1) return 'text-green-600'
  if (diffDays <= 7) return 'text-blue-600'
  if (diffDays <= 30) return 'text-amber-600'
  return 'text-red-600'
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toString()
}

export function FarmMetrics() {
  const [data, setData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField>('crescimento30d')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [filtroAtivo, setFiltroAtivo] = useState<string>('')
  const [busca, setBusca] = useState<string>('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const { data: result, error: err } = await supabase.rpc('get_farm_usage_metrics')
      if (err) throw err
      setData(result as unknown as UsageData)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar métricas')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const sortedFarms = data ? [...data.farms].sort((a, b) => {
    let cmp = 0
    switch (sortField) {
      case 'nome': cmp = a.nome.localeCompare(b.nome); break
      case 'ultimaAtividade':
        cmp = (a.ultimaAtividade || '0').localeCompare(b.ultimaAtividade || '0')
        break
      default:
        cmp = (a[sortField] as number) - (b[sortField] as number)
    }
    return sortDir === 'desc' ? -cmp : cmp
  }) : []

  const filteredFarms = sortedFarms.filter((f) => {
    if (filtroAtivo === 'ativo' && !f.ativo) return false
    if (filtroAtivo === 'inativo' && f.ativo) return false
    if (filtroAtivo === '24h' && f.usuariosAtivos24h === 0) return false
    if (filtroAtivo === 'inativo30d') {
      if (!f.ativo) return false
      if (f.ultimaAtividade) {
        const diffDays = Math.floor((Date.now() - new Date(f.ultimaAtividade).getTime()) / (1000 * 60 * 60 * 24))
        if (diffDays < 30) return false
      }
    }
    if (busca) {
      return f.nome.toLowerCase().includes(busca.toLowerCase())
    }
    return true
  })

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc')
    } else {
      setSortField(field)
      setSortDir(field === 'nome' ? 'asc' : 'desc')
    }
  }

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return ' ↕'
    return sortDir === 'desc' ? ' ↓' : ' ↑'
  }

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
        <p className="text-red-600 mb-2">Erro ao carregar métricas</p>
        <p className="text-sm text-gray-500">{error}</p>
        <button onClick={fetchData} className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm">
          Tentar novamente
        </button>
      </div>
    )
  }

  if (!data) return null

  const s = data.summary

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Métricas por Fazenda</h1>
          <p className="text-sm text-gray-500 mt-1">
            Ranking de uso e atividade por fazenda ({data.farms.length} fazendas)
          </p>
        </div>
        <button
          onClick={fetchData}
          className="px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 transition-colors"
        >
          Atualizar
        </button>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="bg-white p-4 shadow-md rounded-xl border border-gray-100 text-center">
          <p className="text-2xl font-bold text-gray-800">{s.totalFarms}</p>
          <p className="text-xs text-gray-500 mt-1">Total fazendas</p>
        </Card>
        <Card className="bg-white p-4 shadow-md rounded-xl border border-gray-100 text-center">
          <p className="text-2xl font-bold text-green-600">{s.farmsAtivas}</p>
          <p className="text-xs text-gray-500 mt-1">Ativas</p>
        </Card>
        <Card className="bg-white p-4 shadow-md rounded-xl border border-gray-100 text-center">
          <p className="text-2xl font-bold text-blue-600">{s.farmsAtivas24h}</p>
          <p className="text-xs text-gray-500 mt-1">Ativas 24h</p>
        </Card>
        <Card className="bg-white p-4 shadow-md rounded-xl border border-gray-100 text-center">
          <p className="text-2xl font-bold text-purple-600">{s.farmsAtivas7d}</p>
          <p className="text-xs text-gray-500 mt-1">Ativas 7d</p>
        </Card>
        <Card className="bg-white p-4 shadow-md rounded-xl border border-gray-100 text-center">
          <p className="text-2xl font-bold text-red-600">{s.farmsInativas30d}</p>
          <p className="text-xs text-gray-500 mt-1">Inativas 30d+</p>
        </Card>
        <Card className="bg-white p-4 shadow-md rounded-xl border border-gray-100 text-center">
          <p className="text-2xl font-bold text-amber-600">{formatNumber(s.totalRegistros30d)}</p>
          <p className="text-xs text-gray-500 mt-1">Registros 30d</p>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="bg-white p-4 shadow-md rounded-xl border border-gray-100">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Buscar fazenda</label>
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome da fazenda..."
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Filtro</label>
            <select
              value={filtroAtivo}
              onChange={(e) => setFiltroAtivo(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="">Todas</option>
              <option value="ativo">Apenas ativas</option>
              <option value="inativo">Apenas inativas</option>
              <option value="24h">Com atividade 24h</option>
              <option value="inativo30d">Ativas mas sem uso 30d+</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Tabela de ranking */}
      <Card className="bg-white shadow-md rounded-xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th
                  className="text-left px-4 py-3 font-medium text-gray-600 cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                  onClick={() => handleSort('nome')}
                >
                  Fazenda{sortIcon('nome')}
                </th>
                <th
                  className="text-right px-4 py-3 font-medium text-gray-600 cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                  onClick={() => handleSort('usuariosAtivos24h')}
                >
                  Users 24h{sortIcon('usuariosAtivos24h')}
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">
                  Users total
                </th>
                <th
                  className="text-right px-4 py-3 font-medium text-gray-600 cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                  onClick={() => handleSort('lotesAtivos')}
                >
                  Lotes ativos{sortIcon('lotesAtivos')}
                </th>
                <th
                  className="text-right px-4 py-3 font-medium text-gray-600 cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                  onClick={() => handleSort('individuos')}
                >
                  Indivíduos{sortIcon('individuos')}
                </th>
                <th
                  className="text-right px-4 py-3 font-medium text-gray-600 cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                  onClick={() => handleSort('registrosSuplementacao')}
                >
                  Reg. Suplement.{sortIcon('registrosSuplementacao')}
                </th>
                <th
                  className="text-right px-4 py-3 font-medium text-gray-600 cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                  onClick={() => handleSort('crescimento30d')}
                >
                  Atividade 30d{sortIcon('crescimento30d')}
                </th>
                <th
                  className="text-right px-4 py-3 font-medium text-gray-600 cursor-pointer hover:bg-gray-100 whitespace-nowrap"
                  onClick={() => handleSort('ultimaAtividade')}
                >
                  Última atividade{sortIcon('ultimaAtividade')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredFarms.map((f) => (
                <Fragment key={f.id}>
                  <tr
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => setExpandedId(expandedId === f.id ? null : f.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${f.ativo ? 'bg-green-500' : 'bg-gray-300'}`} />
                        <span className="font-medium text-gray-800">{f.nome}</span>
                        {!f.ativo && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">inativa</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={f.usuariosAtivos24h > 0 ? 'font-bold text-green-600' : 'text-gray-400'}>
                        {f.usuariosAtivos24h}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{f.usuarios}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{f.lotesAtivos}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{f.individuos}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatNumber(f.registrosSuplementacao)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={f.crescimento30d > 0 ? 'font-bold text-blue-600' : 'text-gray-400'}>
                        {f.crescimento30d}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-xs ${activityColor(f.ultimaAtividade)}`}>
                        {formatLastActivity(f.ultimaAtividade)}
                      </span>
                    </td>
                  </tr>
                  {expandedId === f.id && (
                    <tr className="bg-gray-50">
                      <td colSpan={8} className="px-4 py-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
                          <div>
                            <p className="text-xs text-gray-400">Pastos</p>
                            <p className="text-sm font-medium text-gray-700">{f.pastos}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400">Currais</p>
                            <p className="text-sm font-medium text-gray-700">{f.currais}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400">Planos nutricionais</p>
                            <p className="text-sm font-medium text-gray-700">{f.planosAtivos} ativos / {f.planosNutricionais} total</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400">Formulações</p>
                            <p className="text-sm font-medium text-gray-700">{f.formulacoes}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400">Reg. maternidade</p>
                            <p className="text-sm font-medium text-gray-700">{f.registrosMaternidade}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400">Reg. enfermaria</p>
                            <p className="text-sm font-medium text-gray-700">{f.registrosEnfermaria}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400">Reg. movimentação</p>
                            <p className="text-sm font-medium text-gray-700">{f.registrosMovimentacao}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400">Reg. leitura cocho</p>
                            <p className="text-sm font-medium text-gray-700">{f.registrosLeituraCocho}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400">Reg. alimentação</p>
                            <p className="text-sm font-medium text-gray-700">{f.registrosAlimentacao}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400">Notificações enviadas</p>
                            <p className="text-sm font-medium text-gray-700">{f.notificacoesEnviadas}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400">Chats com IA</p>
                            <p className="text-sm font-medium text-gray-700">{f.chatIaLogs}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400">Cadastrada em</p>
                            <p className="text-sm font-medium text-gray-700">{new Date(f.createdAt).toLocaleDateString('pt-BR')}</p>
                          </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <p className="text-xs text-gray-400">Atividade de suplementação (últimos 30 dias)</p>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 bg-gray-200 rounded-full h-2 min-w-[100px]">
                              <div
                                className="h-2 rounded-full bg-purple-500"
                                style={{ width: `${Math.min(100, (f.registrosSuplementacao30d / Math.max(1, Math.max(...filteredFarms.map(x => x.registrosSuplementacao30d)))) * 100)}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-600">{f.registrosSuplementacao30d} reg.</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {filteredFarms.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-400">Nenhuma fazenda encontrada com os filtros aplicados</p>
          </div>
        )}
      </Card>

      {/* Insights automáticos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-white p-5 shadow-md rounded-xl border border-gray-100">
          <h3 className="text-base font-semibold text-gray-800 mb-3">Fazendas com maior atividade (30d)</h3>
          <div className="space-y-2">
            {[...data.farms].sort((a, b) => b.crescimento30d - a.crescimento30d).slice(0, 5).map((f, i) => (
              <div key={f.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-gray-400 w-5">{i + 1}º</span>
                  <span className="text-sm font-medium text-gray-700 truncate">{f.nome}</span>
                </div>
                <span className="text-sm text-blue-600 font-bold flex-shrink-0">{f.crescimento30d} reg.</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="bg-white p-5 shadow-md rounded-xl border border-gray-100">
          <h3 className="text-base font-semibold text-gray-800 mb-3">Fazendas que precisam de atenção</h3>
          <div className="space-y-2">
            {data.farms
              .filter(f => f.ativo && (!f.ultimaAtividade || new Date(f.ultimaAtividade) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)))
              .sort((a, b) => (a.ultimaAtividade || '0').localeCompare(b.ultimaAtividade || '0'))
              .slice(0, 5)
              .map((f) => (
                <div key={f.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-700 truncate">{f.nome}</span>
                  </div>
                  <span className="text-xs text-amber-600 flex-shrink-0">{formatLastActivity(f.ultimaAtividade)}</span>
                </div>
              ))}
            {data.farms.filter(f => f.ativo && (!f.ultimaAtividade || new Date(f.ultimaAtividade) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))).length === 0 && (
              <p className="text-sm text-gray-400 py-4 text-center">Todas as fazendas ativas tiveram atividade nos últimos 30 dias</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
