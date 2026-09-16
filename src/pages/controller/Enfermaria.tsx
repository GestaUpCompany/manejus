import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, Input, CardSkeleton } from '../../components/ui'
import { exportToXLSX } from '../../utils/exportXLSX'
import { ENFERMARIA_EXPORT_CONFIG } from '../../utils/exportConfigs'
import { formatDate } from '../../utils/formatDate'
import { getFazendaIdForUser, getFazendaNome } from '../../utils/fazendaContext'

interface RegistroEnfermaria {
  id: string
  fazenda_id: string
  dispositivo_id?: string
  nome_usuario?: string
  data: string
  pasto?: string
  lote?: string
  brinco?: string
  chip?: string
  categoria?: string
  sexo?: string
  raca?: string
  idade?: string
  tratamento_outros?: string
  tratamento_obs?: string
  diagnosticos?: Record<string, { valor: string; observacao?: string }>
  medicamentos?: Array<{ tipo: string; nomeComercial: string; doseAplicada: string }>
  sync_status?: string
  created_at: string
}

export function Enfermaria() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registros, setRegistros] = useState<RegistroEnfermaria[]>([])
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
      .from('registros_enfermaria')
      .select('*')
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })

    const { data, error } = await query

    if (error) {
      console.error('Erro ao buscar registros de enfermaria:', error)
    } else {
      setRegistros(data as RegistroEnfermaria[])
    }

    setLoading(false)
  }

  const filteredRegistros = registros.filter((registro) => {
    const matchesSearch =
      (registro.brinco && registro.brinco.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (registro.chip && registro.chip.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (registro.lote && registro.lote.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (registro.pasto && registro.pasto.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (registro.categoria && registro.categoria.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (registro.tratamento_outros && registro.tratamento_outros.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (registro.tratamento_obs && registro.tratamento_obs.toLowerCase().includes(searchTerm.toLowerCase())) ||
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
        <h2 className="text-xl sm:text-2xl font-bold text-content-strong">Caderneta de Enfermaria</h2>
      </div>

      <Card className="bg-surface-1 p-4 sm:p-6" disableHover>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
          <h3 className="text-base sm:text-lg font-semibold text-content-strong">Filtros</h3>
          <Button
            onClick={() => exportToXLSX(filteredRegistros, ENFERMARIA_EXPORT_CONFIG, fazendaNome)}
            disabled={filteredRegistros.length === 0}
            className="w-full sm:w-auto text-sm"
          >
            Exportar XLSX
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs sm:text-sm font-medium text-content mb-1 min-h-[2.5rem] leading-tight line-clamp-2">Buscar</label>
            <Input
              type="text"
              placeholder="Brinco, chip, categoria, tratamento, lote, pasto, sintomas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="text-sm"
            />
          </div>
          <div>
            <label className="block text-xs sm:text-sm font-medium text-content mb-1 min-h-[2.5rem] leading-tight line-clamp-2">Data Início</label>
            <Input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="text-sm"
            />
          </div>
          <div>
            <label className="block text-xs sm:text-sm font-medium text-content mb-1 min-h-[2.5rem] leading-tight line-clamp-2">Data Fim</label>
            <Input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs sm:text-sm font-medium text-content mb-1 min-h-[2.5rem] leading-tight line-clamp-2">&nbsp;</label>
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
        <Card className="bg-surface-1 p-4 sm:p-6 text-center" disableHover>
          <p className="text-content-muted">Nenhum registro de enfermaria encontrado</p>
        </Card>
      ) : filteredRegistros.length === 0 ? (
        <Card className="bg-surface-1 p-4 sm:p-6 text-center" disableHover>
          <p className="text-content-muted">Nenhum registro encontrado com os filtros aplicados</p>
        </Card>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="sm:hidden space-y-3">
            {filteredRegistros.map((registro) => (
              <Card
                key={registro.id}
                className="bg-surface-1 p-4 cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => navigate(`/controller/cadernetas/enfermaria/${registro.id}`)}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-medium text-content-muted">Data:</span>
                    <span className="text-xs sm:text-sm font-semibold text-content-strong">
                      {formatDate(registro.data)}
                    </span>
                  </div>
                  <span
                    className="text-xs sm:text-sm px-2 py-1 rounded-full bg-primary/10 text-primary dark:text-primary-light"
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
                    <span className="text-content-muted">Usuário:</span>
                    <span className="text-content-strong font-medium">{registro.nome_usuario || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Brinco:</span>
                    <span className="text-content-strong font-medium">{registro.brinco || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Chip:</span>
                    <span className="text-content-strong font-medium">{registro.chip || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Categoria:</span>
                    <span className="text-content-strong font-medium">{registro.categoria || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Tratamento:</span>
                    <span className="text-content-strong font-medium truncate max-w-[150px]">{registro.tratamento_outros || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Lote:</span>
                    <span className="text-content-strong font-medium">{registro.lote || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Pasto:</span>
                    <span className="text-content-strong font-medium">{registro.pasto || '-'}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Desktop Table View */}
          <Card className="bg-surface-1 overflow-x-auto hidden sm:block" disableHover>
            <table className="min-w-full divide-y divide-border-base">
              <thead className="bg-surface-2">
                <tr>
                  <th
                    className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider cursor-pointer hover:bg-surface-2 transition-colors"
                    onClick={() => setDateSortOrder(dateSortOrder === 'asc' ? 'desc' : 'asc')}
                  >
                    Data <span className="text-lg ml-1">{dateSortOrder === 'asc' ? '↑' : '↓'}</span>
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Usuário</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Brinco</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Chip</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Categoria</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Tratamento</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Lote</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Pasto</th>
                </tr>
              </thead>
              <tbody className="bg-surface-1 divide-y divide-border-base">
                {filteredRegistros.map((registro) => (
                  <tr
                    key={registro.id}
                    onClick={() => navigate(`/controller/cadernetas/enfermaria/${registro.id}`)}
                    className="cursor-pointer hover:bg-surface-2 transition-colors"
                  >
                    <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong">
                      {formatDate(registro.data)}
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong">{registro.nome_usuario || '-'}</td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong">
                      {registro.brinco || '-'}
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong">
                      {registro.chip || '-'}
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong">
                      {registro.categoria || '-'}
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong">
                      {registro.tratamento_outros || '-'}
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong">
                      {registro.lote || '-'}
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong">
                      {registro.pasto || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  )
}
