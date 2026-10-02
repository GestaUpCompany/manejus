import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Card, Input, EmptyState, PageSkeleton, Table, Thead, Tbody, Tr, Th, Td, SearchInput, FilterToolbar, FilterField } from '@gestaup/ui'
import { exportToXLSX } from '@gestaup/shared'
import { ENTRADA_INSUMOS_EXPORT_CONFIG } from '../../utils/exportConfigs'
import { formatDate } from '@gestaup/shared'
import { getFazendaIdForUser, getFazendaNome } from '@gestaup/shared'

interface RegistroEntradaInsumos {
  id: string
  fazenda_id: string
  data_entrada: string
  horario?: string | null
  nota_fiscal?: string | null
  fornecedor?: string | null
  placa?: string | null
  motorista?: string | null
  responsavel_recebimento?: string | null
  nome_usuario?: string | null
  created_at?: string | null
  entrada_insumos_itens?: { id: string }[]
}

export function EntradaInsumos() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registros, setRegistros] = useState<RegistroEntradaInsumos[]>([])
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

    const fazendaId = await getFazendaIdForUser(user.id)
    if (!fazendaId) return

    getFazendaNome(fazendaId).then(setFazendaNome)

    const { data, error } = await supabase
      .from('registros_entrada_insumos')
      .select('*, entrada_insumos_itens(id)')
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)
      .order('data_entrada', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erro ao buscar entradas de insumos:', error)
    } else {
      setRegistros(data as RegistroEntradaInsumos[])
    }

    setLoading(false)
  }

  const filteredRegistros = registros.filter((registro) => {
    const search = searchTerm.toLowerCase()
    const matchesSearch =
      (registro.fornecedor && registro.fornecedor.toLowerCase().includes(search)) ||
      (registro.nota_fiscal && registro.nota_fiscal.toLowerCase().includes(search)) ||
      (registro.placa && registro.placa.toLowerCase().includes(search)) ||
      (registro.motorista && registro.motorista.toLowerCase().includes(search)) ||
      (registro.responsavel_recebimento && registro.responsavel_recebimento.toLowerCase().includes(search)) ||
      (registro.nome_usuario && registro.nome_usuario.toLowerCase().includes(search))

    const matchesDataInicio = !dataInicio || registro.data_entrada >= dataInicio
    const matchesDataFim = !dataFim || registro.data_entrada <= dataFim

    return matchesSearch && matchesDataInicio && matchesDataFim
  }).sort((a, b) => {
    const dateA = new Date(a.data_entrada)
    const dateB = new Date(b.data_entrada)
    return dateSortOrder === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime()
  })

  if (loading) {
    return <PageSkeleton variant="list" />
  }

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-xl sm:text-2xl font-bold text-content-strong">Caderneta de Entrada de Insumos</h2>
      </div>

      <FilterToolbar
        onExport={() => exportToXLSX(filteredRegistros, ENTRADA_INSUMOS_EXPORT_CONFIG, fazendaNome)}
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
            placeholder="Fornecedor, NF, placa, motorista, responsável..."
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
        <EmptyState title="Nenhuma entrada de insumos encontrada" />
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
                onClick={() => navigate(`/controller/cadernetas/entrada-insumos/${registro.id}`)}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-medium text-content-muted">Data:</span>
                    <span className="text-xs sm:text-sm font-semibold text-content-strong">
                      {formatDate(registro.data_entrada)}
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
                    <span className="text-content-muted">Fornecedor:</span>
                    <span className="text-content-strong font-medium">{registro.fornecedor || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Nota Fiscal:</span>
                    <span className="text-content-strong font-medium">{registro.nota_fiscal || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Itens:</span>
                    <span className="text-content-strong font-medium">
                      {registro.entrada_insumos_itens ? `${registro.entrada_insumos_itens.length} item(s)` : '-'}
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Desktop Table View */}
          <Card className="bg-surface-1 overflow-x-auto hidden sm:block" disableHover>
            <Table>
              <Thead>
                <Tr>
                  <Th
                    className="cursor-pointer hover:bg-surface-2 transition-colors"
                    onClick={() => setDateSortOrder(dateSortOrder === 'asc' ? 'desc' : 'asc')}
                  >
                    Data <span className="text-lg ml-1">{dateSortOrder === 'asc' ? '↑' : '↓'}</span>
                  </Th>
                  <Th>Usuário</Th>
                  <Th>Fornecedor</Th>
                  <Th>Nota Fiscal</Th>
                  <Th>Placa</Th>
                  <Th>Motorista</Th>
                  <Th>Itens</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filteredRegistros.map((registro) => (
                  <Tr
                    key={registro.id}
                    onClick={() => navigate(`/controller/cadernetas/entrada-insumos/${registro.id}`)}
                    className="cursor-pointer"
                  >
                    <Td>{formatDate(registro.data_entrada)}</Td>
                    <Td>{registro.nome_usuario || '-'}</Td>
                    <Td>{registro.fornecedor || '-'}</Td>
                    <Td>{registro.nota_fiscal || '-'}</Td>
                    <Td>{registro.placa || '-'}</Td>
                    <Td>{registro.motorista || '-'}</Td>
                    <Td>{registro.entrada_insumos_itens ? `${registro.entrada_insumos_itens.length} item(s)` : '-'}</Td>
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
