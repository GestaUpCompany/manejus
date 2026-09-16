import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, Input, CardSkeleton } from '../../components/ui'
import { exportToXLSX } from '../../utils/exportXLSX'
import { RODEIO_EXPORT_CONFIG } from '../../utils/exportConfigs'
import { formatDate } from '../../utils/formatDate'
import { getFazendaIdForUser, getFazendaNome } from '../../utils/fazendaContext'

interface RegistroRodeio {
  id: string
  fazenda_id: string
  dispositivo_id?: string
  nome_usuario?: string
  data: string
  pasto?: string
  lote?: string
  vaca?: number
  touro?: number
  bezerro?: number
  boi?: number
  garrote?: number
  novilha?: number
  total_cabecas?: number
  escore_gado_ideal?: boolean
  escore_gado_ideal_obs?: string
  agua_boa_bebedouro?: boolean
  agua_boa_bebedouro_obs?: string
  pastagem_adequada?: boolean
  pastagem_adequada_obs?: string
  animais_doentes?: boolean
  animais_doentes_obs?: string
  cercas_cochos?: boolean
  cercas_cochos_obs?: string
  carrapatos_moscas?: boolean
  carrapatos_moscas_obs?: string
  animais_entrevero?: boolean
  animais_entrevero_obs?: string
  animal_morto?: boolean
  animal_morto_obs?: string
  animais_tratados?: number
  escore_fezes?: number
  equipe?: number
  sync_status?: string
  created_at: string
}

export function Rodeio() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registros, setRegistros] = useState<RegistroRodeio[]>([])
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
      .from('registros_rodeio')
      .select('*')
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })

    const { data, error } = await query

    if (error) {
      console.error('Erro ao buscar registros de rodeio:', error)
    } else {
      setRegistros(data as RegistroRodeio[])
    }

    setLoading(false)
  }

  const filteredRegistros = registros.filter((registro) => {
    const matchesSearch =
      (registro.pasto && registro.pasto.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (registro.lote && registro.lote.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (registro.total_cabecas && registro.total_cabecas.toString().includes(searchTerm.toLowerCase())) ||
      (registro.equipe && registro.equipe.toString().includes(searchTerm.toLowerCase())) ||
      (registro.escore_fezes && registro.escore_fezes.toString().includes(searchTerm.toLowerCase())) ||
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
        <h2 className="text-xl sm:text-2xl font-bold text-content-strong">Caderneta de Rodeio</h2>
      </div>

      <Card className="bg-surface-1 p-4 sm:p-6" disableHover>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
          <h3 className="text-base sm:text-lg font-semibold text-content-strong">Filtros</h3>
          <Button
            onClick={() => exportToXLSX(filteredRegistros, RODEIO_EXPORT_CONFIG, fazendaNome)}
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
              placeholder="Pasto, lote, total cabeças, equipe, escore fezes..."
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
          <p className="text-content-muted">Nenhum registro de rodeio encontrado</p>
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
                className="p-4"
                onClick={() => navigate(`/controller/cadernetas/rodeio/${registro.id}`)}
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
                    <span className="text-content-muted">Pasto:</span>
                    <span className="text-content-strong font-medium">{registro.pasto || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Lote:</span>
                    <span className="text-content-strong font-medium">{registro.lote || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Total Cabeças:</span>
                    <span className="text-content-strong font-medium">{registro.total_cabecas || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Equipe:</span>
                    <span className="text-content-strong font-medium">{registro.equipe || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Escore Fezes:</span>
                    <span className="text-content-strong font-medium">{registro.escore_fezes || '-'}</span>
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
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Pasto</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Lote</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Total Cabeças</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Equipe</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Escore Fezes</th>
                </tr>
              </thead>
              <tbody className="bg-surface-1 divide-y divide-border-base">
                {filteredRegistros.map((registro) => (
                  <tr
                    key={registro.id}
                    onClick={() => navigate(`/controller/cadernetas/rodeio/${registro.id}`)}
                    className="cursor-pointer hover:bg-surface-2 transition-colors"
                  >
                    <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong">
                      {formatDate(registro.data)}
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong">{registro.nome_usuario || '-'}</td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong">
                      {registro.pasto || '-'}
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong">
                      {registro.lote || '-'}
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong">
                      {registro.total_cabecas || '-'}
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong">
                      {registro.equipe || '-'}
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong">
                      {registro.escore_fezes || '-'}
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
