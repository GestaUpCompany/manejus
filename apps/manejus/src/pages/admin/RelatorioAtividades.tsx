import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Button } from '../../components/ui'
import {
  AtividadeRegistro,
  PeriodoAtividade,
  agruparPorCaderneta,
  formatarPeriodo,
  getAtividadesRegistros,
} from '../../services/registrosAtividadesService'

const periodos: { key: PeriodoAtividade; label: string; descricao: string }[] = [
  { key: 'day', label: 'Últimos 30 dias', descricao: 'Lançamentos dos últimos 30 dias, agrupados por dia' },
  { key: 'week', label: 'Últimas 12 semanas', descricao: 'Lançamentos das últimas 12 semanas, agrupados por semana' },
  { key: 'month', label: 'Últimos 12 meses', descricao: 'Lançamentos dos últimos 12 meses, agrupados por mês' },
]

function getDescricaoPeriodo(periodo: PeriodoAtividade): string {
  return periodos.find((p) => p.key === periodo)?.descricao || ''
}

export function RelatorioAtividades() {
  const navigate = useNavigate()
  const [periodo, setPeriodo] = useState<PeriodoAtividade>('day')
  const [atividades, setAtividades] = useState<AtividadeRegistro[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroCaderneta, setFiltroCaderneta] = useState('')
  const [filtroFazenda, setFiltroFazenda] = useState('')
  const [filtroBusca, setFiltroBusca] = useState('')
  const [filtroData, setFiltroData] = useState('')
  const [dataInicial, setDataInicial] = useState('')
  const [dataFinal, setDataFinal] = useState('')
  const [modoData, setModoData] = useState<'todos' | 'especifica' | 'intervalo'>('todos')

  const limparFiltros = () => {
    setFiltroCaderneta('')
    setFiltroFazenda('')
    setFiltroBusca('')
    setFiltroData('')
    setDataInicial('')
    setDataFinal('')
    setModoData('todos')
  }

  useEffect(() => {
    loadAtividades()
  }, [periodo])

  const loadAtividades = async () => {
    setLoading(true)
    const data = await getAtividadesRegistros(periodo)
    setAtividades(data)
    setLoading(false)
  }

  const cadernetasUnicas = useMemo(
    () => Array.from(new Set(atividades.map((item) => item.caderneta))).sort(),
    [atividades]
  )

  const fazendasUnicas = useMemo(
    () => Array.from(new Set(atividades.map((item) => item.fazenda_nome))).sort(),
    [atividades]
  )

  const atividadesFiltradas = useMemo(() => {
    const busca = filtroBusca.toLowerCase().trim()
    return atividades.filter((item) => {
      const matchCaderneta = !filtroCaderneta || item.caderneta === filtroCaderneta
      const matchFazenda = !filtroFazenda || item.fazenda_nome === filtroFazenda
      const matchBusca =
        !busca ||
        item.caderneta.toLowerCase().includes(busca) ||
        item.fazenda_nome.toLowerCase().includes(busca)

      let matchData = true
      if (modoData === 'especifica' && filtroData) {
        matchData = item.periodo_inicio === filtroData
      } else if (modoData === 'intervalo' && (dataInicial || dataFinal)) {
        const inicio = dataInicial || '0000-01-01'
        const fim = dataFinal || '9999-12-31'
        matchData = item.periodo_inicio >= inicio && item.periodo_inicio <= fim
      }

      return matchCaderneta && matchFazenda && matchBusca && matchData
    })
  }, [atividades, filtroCaderneta, filtroFazenda, filtroBusca, modoData, filtroData, dataInicial, dataFinal])

  const resumo = useMemo(() => agruparPorCaderneta(atividades), [atividades])

  const totalLancamentos = useMemo(
    () => atividades.reduce((sum, item) => sum + item.quantidade, 0),
    [atividades]
  )

  const totalFazendasAtivas = useMemo(
    () => new Set(atividades.map((item) => item.fazenda_id)).size,
    [atividades]
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Relatório de Atividades</h1>
          <p className="text-sm text-gray-500 mt-1">
            Lançamentos nas cadernetas por período
          </p>
        </div>
        <Button variant="secondary" onClick={() => navigate('/admin')}>
          Voltar
        </Button>
      </div>

      <p className="text-sm text-gray-600 bg-blue-50 border border-blue-100 rounded-lg p-3">
        {getDescricaoPeriodo(periodo)}
      </p>

      <div className="flex gap-2">
        {periodos.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriodo(p.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              periodo === p.key
                ? 'bg-primary text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="bg-white p-4 sm:p-6">
          <p className="text-sm text-gray-500">Total de lançamentos no período</p>
          <p className="text-2xl sm:text-3xl font-bold text-gray-800 mt-1">
            {loading ? '-' : totalLancamentos.toLocaleString('pt-BR')}
          </p>
        </Card>
        <Card className="bg-white p-4 sm:p-6">
          <p className="text-sm text-gray-500">Fazendas ativas no período</p>
          <p className="text-2xl sm:text-3xl font-bold text-gray-800 mt-1">
            {loading ? '-' : totalFazendasAtivas.toLocaleString('pt-BR')}
          </p>
        </Card>
        <Card className="bg-white p-4 sm:p-6">
          <p className="text-sm text-gray-500">Cadernetas com lançamentos</p>
          <p className="text-2xl sm:text-3xl font-bold text-gray-800 mt-1">
            {loading ? '-' : resumo.length.toLocaleString('pt-BR')}
          </p>
        </Card>
      </div>

      {loading ? (
        <Card className="bg-white p-6 text-center">
          <p className="text-gray-600">Carregando relatório...</p>
        </Card>
      ) : atividades.length === 0 ? (
        <Card className="bg-white p-6 text-center">
          <p className="text-gray-600">Nenhum lançamento encontrado no período.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card className="bg-white p-4 sm:p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Resumo do período por caderneta</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500 uppercase bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 rounded-l-lg">Caderneta</th>
                    <th className="px-4 py-3">Lançamentos</th>
                    <th className="px-4 py-3">Fazendas</th>
                    <th className="px-4 py-3 rounded-r-lg">Principais fazendas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {resumo.map((item) => (
                    <tr key={item.caderneta} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{item.caderneta}</td>
                      <td className="px-4 py-3">{item.total.toLocaleString('pt-BR')}</td>
                      <td className="px-4 py-3">{item.fazendas.length.toLocaleString('pt-BR')}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {item.fazendas
                            .sort((a, b) => b.quantidade - a.quantidade)
                            .slice(0, 3)
                            .map((fazenda) => (
                              <span
                                key={fazenda.id}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs"
                                title={`${fazenda.quantidade} lançamentos`}
                              >
                                {fazenda.nome}
                                <span className="font-semibold">{fazenda.quantidade}</span>
                              </span>
                            ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="bg-white p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <h2 className="text-lg font-bold text-gray-800">Detalhamento por período e fazenda</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">
                  {atividadesFiltradas.length} de {atividades.length} registros
                </span>
                <button
                  type="button"
                  onClick={limparFiltros}
                  className="text-xs text-primary hover:text-primary-dark font-medium underline"
                >
                  Limpar filtros
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Caderneta</label>
                <select
                  value={filtroCaderneta}
                  onChange={(e) => setFiltroCaderneta(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                >
                  <option value="">Todas</option>
                  {cadernetasUnicas.map((caderneta) => (
                    <option key={caderneta} value={caderneta}>{caderneta}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Fazenda</label>
                <select
                  value={filtroFazenda}
                  onChange={(e) => setFiltroFazenda(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                >
                  <option value="">Todas</option>
                  {fazendasUnicas.map((fazenda) => (
                    <option key={fazenda} value={fazenda}>{fazenda}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Data</label>
                <select
                  value={modoData}
                  onChange={(e) => {
                    setModoData(e.target.value as 'todos' | 'especifica' | 'intervalo')
                    setFiltroData('')
                    setDataInicial('')
                    setDataFinal('')
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                >
                  <option value="todos">Todo o período</option>
                  <option value="especifica">Data específica</option>
                  <option value="intervalo">Intervalo</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Buscar</label>
                <input
                  type="text"
                  value={filtroBusca}
                  onChange={(e) => setFiltroBusca(e.target.value)}
                  placeholder="Caderneta ou fazenda"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
            </div>

            {modoData === 'especifica' && (
              <div className="mb-4">
                <label className="text-xs font-medium text-gray-600 block mb-1">Selecione a data</label>
                <input
                  type="date"
                  value={filtroData}
                  onChange={(e) => setFiltroData(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
            )}

            {modoData === 'intervalo' && (
              <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Data inicial</label>
                  <input
                    type="date"
                    value={dataInicial}
                    onChange={(e) => setDataInicial(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Data final</label>
                  <input
                    type="date"
                    value={dataFinal}
                    onChange={(e) => setDataFinal(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500 uppercase bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 rounded-l-lg">Período</th>
                    <th className="px-4 py-3">Caderneta</th>
                    <th className="px-4 py-3">Fazenda</th>
                    <th className="px-4 py-3 rounded-r-lg">Lançamentos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {atividadesFiltradas.map((item, index) => (
                    <tr key={`${item.periodo_inicio}-${item.caderneta}-${item.fazenda_id}-${index}`} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600">
                        {formatarPeriodo(item.periodo_inicio, periodo)}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800">{item.caderneta}</td>
                      <td className="px-4 py-3 text-gray-600">{item.fazenda_nome}</td>
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {item.quantidade.toLocaleString('pt-BR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
