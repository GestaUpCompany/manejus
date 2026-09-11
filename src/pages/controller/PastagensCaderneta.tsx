import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, Input, CardSkeleton } from '../../components/ui'
import { exportToXLSX } from '../../utils/exportXLSX'
import { PASTAGENS_EXPORT_CONFIG } from '../../utils/exportConfigs'
import { formatDate } from '../../utils/formatDate'
import { getFazendaIdForUser, getFazendaNome } from '../../utils/fazendaContext'

interface RegistroPastagens {
  id: string
  fazenda_id: string
  dispositivo_id?: string
  nome_usuario?: string
  data: string
  manejador?: string
  lote?: string
  pasto_saida?: string
  avaliacao_saida?: number
  pasto_entrada?: string
  avaliacao_entrada?: number
  vaca?: number
  touro?: number
  bezerro?: number
  boi_magro?: number
  garrote?: number
  novilha?: number
  sync_status?: string
  created_at: string
}

export function PastagensCaderneta() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registros, setRegistros] = useState<RegistroPastagens[]>([])
  const [loading, setLoading] = useState(true)
  const [fazendaNome, setFazendaNome] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [dateSortOrder, setDateSortOrder] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    loadRegistros()
  }, [user])

  const loadRegistros = async () => {
    if (!user) return

    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) return

    const fazendaId = vinculos[0].fazenda_id
    getFazendaNome(fazendaId).then(setFazendaNome)

    let query = supabase
      .from('registros_pastagens')
      .select('*')
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })

    const { data, error } = await query

    if (error) {
      console.error('Erro ao buscar registros de pastagens:', error)
    } else {
      setRegistros(data as RegistroPastagens[])
    }

    setLoading(false)
  }

  const filteredRegistros = registros.filter((registro) => {
    const totalAnimais = (registro.vaca || 0) + (registro.touro || 0) + (registro.bezerro || 0) + (registro.boi_magro || 0) + (registro.garrote || 0) + (registro.novilha || 0)

    const matchesSearch =
      (registro.manejador && registro.manejador.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (registro.lote && registro.lote.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (registro.pasto_saida && registro.pasto_saida.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (registro.avaliacao_saida && registro.avaliacao_saida.toString().includes(searchTerm.toLowerCase())) ||
      (registro.pasto_entrada && registro.pasto_entrada.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (registro.avaliacao_entrada && registro.avaliacao_entrada.toString().includes(searchTerm.toLowerCase())) ||
      (registro.vaca && registro.vaca.toString().includes(searchTerm.toLowerCase())) ||
      (registro.touro && registro.touro.toString().includes(searchTerm.toLowerCase())) ||
      (registro.bezerro && registro.bezerro.toString().includes(searchTerm.toLowerCase())) ||
      (registro.boi_magro && registro.boi_magro.toString().includes(searchTerm.toLowerCase())) ||
      (registro.garrote && registro.garrote.toString().includes(searchTerm.toLowerCase())) ||
      (registro.novilha && registro.novilha.toString().includes(searchTerm.toLowerCase())) ||
      totalAnimais.toString().includes(searchTerm.toLowerCase()) ||
      (registro.nome_usuario && registro.nome_usuario.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesDataInicio = !dataInicio || new Date(registro.data) >= new Date(dataInicio)
    const matchesDataFim = !dataFim || new Date(registro.data) <= new Date(dataFim + 'T23:59:59')

    return matchesSearch && matchesDataInicio && matchesDataFim
  }).sort((a, b) => {
    const dateA = new Date(a.data)
    const dateB = new Date(b.data)
    return dateSortOrder === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime()
  })

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Caderneta de Pastagens</h2>
      </div>

      <Card className="bg-white p-4 sm:p-6" disableHover>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
          <h3 className="text-base sm:text-lg font-semibold text-gray-800">Filtros</h3>
          <Button
            onClick={() => exportToXLSX(filteredRegistros, PASTAGENS_EXPORT_CONFIG, fazendaNome)}
            disabled={filteredRegistros.length === 0}
            className="w-full sm:w-auto text-sm"
          >
            Exportar XLSX
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 min-h-[2.5rem] leading-tight line-clamp-2">Buscar</label>
            <Input
              type="text"
              placeholder="Manejador, lote, pasto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="text-sm"
            />
          </div>
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 min-h-[2.5rem] leading-tight line-clamp-2">Data Início</label>
            <Input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="text-sm"
            />
          </div>
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 min-h-[2.5rem] leading-tight line-clamp-2">Data Fim</label>
            <Input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 min-h-[2.5rem] leading-tight line-clamp-2">&nbsp;</label>
            <Button variant="secondary" onClick={() => {
              setSearchTerm('')
              setDataInicio('')
              setDataFim('')
            }} className="w-full sm:w-auto text-sm">
              Limpar Filtros
            </Button>
          </div>
        </div>
      </Card>

      {registros.length === 0 ? (
        <Card className="bg-white p-4 sm:p-6 text-center" disableHover>
          <p className="text-gray-600">Nenhum registro de pastagens encontrado</p>
        </Card>
      ) : filteredRegistros.length === 0 ? (
        <Card className="bg-white p-4 sm:p-6 text-center" disableHover>
          <p className="text-gray-600">Nenhum registro encontrado com os filtros aplicados</p>
        </Card>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="sm:hidden space-y-3">
            {filteredRegistros.map((registro) => {
              const totalAnimais = (registro.vaca || 0) + (registro.touro || 0) + (registro.bezerro || 0) + (registro.boi_magro || 0) + (registro.garrote || 0) + (registro.novilha || 0)

              return (
                <Card
                  key={registro.id}
                  className="p-4"
                  onClick={() => navigate(`/controller/cadernetas/pastagens/${registro.id}`)}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm font-medium text-gray-500">Data:</span>
                      <span className="text-xs sm:text-sm font-semibold text-gray-800">
                        {formatDate(registro.data)}
                      </span>
                    </div>
                    <span
                      className="text-xs sm:text-sm px-2 py-1 rounded-full bg-primary/10 text-primary"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDateSortOrder(dateSortOrder === 'asc' ? 'desc' : 'asc')
                      }}
                    >
                      {dateSortOrder === 'asc' ? '↑' : '↓'}
                    </span>
                  </div>
                  <div className="space-y-2 text-xs sm:text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Usuário:</span>
                      <span className="text-gray-800 font-medium">{registro.nome_usuario || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Manejador:</span>
                      <span className="text-gray-800 font-medium">{registro.manejador || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Lote:</span>
                      <span className="text-gray-800 font-medium">{registro.lote || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Pasto Saída:</span>
                      <span className="text-gray-800 font-medium">{registro.pasto_saida || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Aval. Saída:</span>
                      <span className="text-gray-800 font-medium">{registro.avaliacao_saida || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Pasto Entrada:</span>
                      <span className="text-gray-800 font-medium">{registro.pasto_entrada || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Aval. Entrada:</span>
                      <span className="text-gray-800 font-medium">{registro.avaliacao_entrada || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Total Animais:</span>
                      <span className="text-gray-800 font-medium">{totalAnimais}</span>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>

          {/* Desktop Table View */}
          <Card className="bg-white overflow-x-auto hidden sm:block" disableHover>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => setDateSortOrder(dateSortOrder === 'asc' ? 'desc' : 'asc')}
                  >
                    Data <span className="text-lg ml-1">{dateSortOrder === 'asc' ? '↑' : '↓'}</span>
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuário</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Manejador</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lote</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pasto Saída</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aval. Saída</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pasto Entrada</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aval. Entrada</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Animais</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredRegistros.map((registro) => {
                  const totalAnimais = (registro.vaca || 0) + (registro.touro || 0) + (registro.bezerro || 0) + (registro.boi_magro || 0) + (registro.garrote || 0) + (registro.novilha || 0)

                  return (
                    <tr
                      key={registro.id}
                      onClick={() => navigate(`/controller/cadernetas/pastagens/${registro.id}`)}
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(registro.data)}
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-900">{registro.nome_usuario || '-'}</td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-900">
                        {registro.manejador || '-'}
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-900">
                        {registro.lote || '-'}
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-900">
                        {registro.pasto_saida || '-'}
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-900">
                        {registro.avaliacao_saida || '-'}
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-900">
                        {registro.pasto_entrada || '-'}
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-900">
                        {registro.avaliacao_entrada || '-'}
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-900">
                        {totalAnimais}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  )
}
