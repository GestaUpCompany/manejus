import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Card, Input, EmptyState, PageSkeleton, Table, Thead, Tbody, Tr, Th, Td, SearchInput, FilterToolbar, FilterField } from '../../components/ui'
import { exportToXLSX } from '../../utils/exportXLSX'
import { MORTE_EXPORT_CONFIG } from '../../utils/exportConfigs'
import { formatDate } from '../../utils/formatDate'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

interface RegistroMorte {
  id: string
  fazenda_id: string
  dispositivo_id?: string
  nome_usuario?: string
  data: string
  pasto?: string
  lote?: string
  sexo?: string
  raca?: string
  idade?: string
  peso_vivo?: number
  causa_morte?: string
  brinco?: string
  chip?: string
  categoria?: string
  categoria_outros?: string
  escore?: number
  nutricao_atual?: string
  nutricao_anterior?: string
  diagnosticos?: Record<string, { valor: string; observacao: string }>
  sync_status?: string
  version?: number
  created_at: string
  updated_at: string
  deleted_at?: string
}

export function RegistrosMorte() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registros, setRegistros] = useState<RegistroMorte[]>([])
  const [loading, setLoading] = useState(true)
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

    let query = supabase
      .from('registros_morte')
      .select('*')
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })

    const { data, error } = await query

    if (error) {
      console.error('Erro ao buscar registros de morte:', error)
    } else {
      setRegistros(data as RegistroMorte[])
    }

    setLoading(false)
  }

  const filteredRegistros = registros.filter((registro) => {
    const matchesSearch =
      (registro.causa_morte && registro.causa_morte.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (registro.lote && registro.lote.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (registro.pasto && registro.pasto.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (registro.brinco && registro.brinco.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (registro.chip && registro.chip.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (registro.categoria && registro.categoria.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (registro.sexo && registro.sexo.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (registro.raca && registro.raca.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (registro.peso_vivo && registro.peso_vivo.toString().includes(searchTerm.toLowerCase())) ||
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
    return <PageSkeleton variant="list" />
  }

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Caderneta de Morte</h2>
      </div>

      <FilterToolbar
        onExport={() => exportToXLSX(filteredRegistros, MORTE_EXPORT_CONFIG)}
        exportDisabled={filteredRegistros.length === 0}
        onClear={() => {
          setSearchTerm('')
          setDataInicio('')
          setDataFim('')
        }}
      >
        <FilterField label="Buscar" className="sm:col-span-2">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Causa, lote, pasto, brinco, chip, categoria, sexo, raça, peso..."
            className="text-sm"
          />
        </FilterField>
        <FilterField label="Data Início">
          <Input
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            className="text-sm"
          />
        </FilterField>
        <FilterField label="Data Fim">
          <Input
            type="date"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            className="text-sm"
          />
        </FilterField>
      </FilterToolbar>

      {registros.length === 0 ? (
        <EmptyState title="Nenhum registro encontrado" />
      ) : filteredRegistros.length === 0 ? (
        <EmptyState title="Nenhum registro encontrado" description="Nenhum registro encontrado com os filtros aplicados" />
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="sm:hidden space-y-3">
            {filteredRegistros.map((registro) => (
              <Card
                key={registro.id}
                className="p-4"
                onClick={() => navigate(`/controller/cadernetas/morte/${registro.id}`)}
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
                    <span className="text-gray-500">Causa:</span>
                    <span className="text-gray-800 font-medium">{registro.causa_morte || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Lote:</span>
                    <span className="text-gray-800 font-medium">{registro.lote || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Pasto:</span>
                    <span className="text-gray-800 font-medium">{registro.pasto || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Brinco:</span>
                    <span className="text-gray-800 font-medium">{registro.brinco || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Chip:</span>
                    <span className="text-gray-800 font-medium">{registro.chip || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Categoria:</span>
                    <span className="text-gray-800 font-medium">{registro.categoria || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Sexo:</span>
                    <span className="text-gray-800 font-medium">{registro.sexo || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Raça:</span>
                    <span className="text-gray-800 font-medium">{registro.raca || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Peso (kg):</span>
                    <span className="text-gray-800 font-medium">{registro.peso_vivo || '-'}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Desktop Table View */}
          <Card className="bg-white overflow-x-auto hidden sm:block" disableHover>
            <Table>
              <Thead>
                <Tr>
                  <Th
                    className="cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => setDateSortOrder(dateSortOrder === 'asc' ? 'desc' : 'asc')}
                  >
                    Data <span className="text-lg ml-1">{dateSortOrder === 'asc' ? '↑' : '↓'}</span>
                  </Th>
                  <Th>Usuário</Th>
                  <Th>Causa</Th>
                  <Th>Lote</Th>
                  <Th>Pasto</Th>
                  <Th>Brinco</Th>
                  <Th>Chip</Th>
                  <Th>Categoria</Th>
                  <Th>Sexo</Th>
                  <Th>Raça</Th>
                  <Th>Peso (kg)</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filteredRegistros.map((registro) => (
                  <Tr
                    key={registro.id}
                    onClick={() => navigate(`/controller/cadernetas/morte/${registro.id}`)}
                    className="cursor-pointer"
                  >
                    <Td>
                      {formatDate(registro.data)}
                    </Td>
                    <Td>{registro.nome_usuario || '-'}</Td>
                    <Td>
                      {registro.causa_morte || '-'}
                    </Td>
                    <Td>
                      {registro.lote || '-'}
                    </Td>
                    <Td>
                      {registro.pasto || '-'}
                    </Td>
                    <Td>
                      {registro.brinco || '-'}
                    </Td>
                    <Td>
                      {registro.chip || '-'}
                    </Td>
                    <Td>
                      {registro.categoria || '-'}
                    </Td>
                    <Td>
                      {registro.sexo || '-'}
                    </Td>
                    <Td>
                      {registro.raca || '-'}
                    </Td>
                    <Td>
                      {registro.peso_vivo || '-'}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Card>
        </>
      )}
    </div>
  )
}
