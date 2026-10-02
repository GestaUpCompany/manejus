import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Card, Input, EmptyState, PageSkeleton, Table, Thead, Tbody, Tr, Th, Td, SearchInput, FilterToolbar, FilterField } from '@gestaup/ui'
import { exportToXLSX } from '@gestaup/shared'
import { ENTRADA_COMBUSTIVEL_EXPORT_CONFIG } from '../../utils/exportConfigs'
import { formatDate } from '@gestaup/shared'
import { getFazendaIdForUser, getFazendaNome } from '@gestaup/shared'

interface EntradaCombustivelRegistro {
  id: string
  fazenda_id: string
  data: string
  quantidade_l: number
  valor_total?: number | null
  preco_por_litro?: number | null
  fornecedor?: string | null
  placa_veiculo?: string | null
  nome_motorista?: string | null
  nota_fiscal?: string | null
  observacao?: string | null
  tanque_id?: string | null
  tanque?: { nome: string } | null
  created_at?: string | null
}

export function EntradaCombustivel() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registros, setRegistros] = useState<EntradaCombustivelRegistro[]>([])
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
      .from('movimentacoes_combustivel')
      .select('*, tanque:tanques_combustivel!movimentacoes_combustivel_tanque_id_fkey(nome)')
      .eq('fazenda_id', fazendaId)
      .eq('tipo_movimentacao', 'entrada')
      .eq('origem', 'pwa_entrada')
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erro ao buscar entradas de combustível:', error)
    } else {
      setRegistros(data as EntradaCombustivelRegistro[])
    }

    setLoading(false)
  }

  const filteredRegistros = registros.filter((registro) => {
    const search = searchTerm.toLowerCase()
    const matchesSearch =
      (registro.fornecedor && registro.fornecedor.toLowerCase().includes(search)) ||
      (registro.placa_veiculo && registro.placa_veiculo.toLowerCase().includes(search)) ||
      (registro.nome_motorista && registro.nome_motorista.toLowerCase().includes(search)) ||
      (registro.nota_fiscal && registro.nota_fiscal.toLowerCase().includes(search)) ||
      (registro.tanque?.nome && registro.tanque.nome.toLowerCase().includes(search)) ||
      (registro.observacao && registro.observacao.toLowerCase().includes(search))

    const matchesDataInicio = !dataInicio || registro.data >= dataInicio
    const matchesDataFim = !dataFim || registro.data <= dataFim

    return matchesSearch && matchesDataInicio && matchesDataFim
  }).sort((a, b) => {
    const dateA = new Date(a.data)
    const dateB = new Date(b.data)
    return dateSortOrder === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime()
  })

  if (loading) {
    return <PageSkeleton variant="list" />
  }

  const exportData = filteredRegistros.map((r) => ({ ...r }))

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-xl sm:text-2xl font-bold text-content-strong">Caderneta de Entrada de Combustível</h2>
      </div>

      <FilterToolbar
        onExport={() => exportToXLSX(exportData, ENTRADA_COMBUSTIVEL_EXPORT_CONFIG, fazendaNome)}
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
            placeholder="Fornecedor, placa, motorista, NF, tanque..."
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
        <EmptyState title="Nenhuma entrada de combustível encontrada" />
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
                onClick={() => navigate(`/controller/cadernetas/entrada-combustivel/${registro.id}`)}
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
                    <span className="text-content-muted">Tanque:</span>
                    <span className="text-content-strong font-medium">{registro.tanque?.nome || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Quantidade:</span>
                    <span className="text-content-strong font-medium">{registro.quantidade_l} L</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Fornecedor:</span>
                    <span className="text-content-strong font-medium">{registro.fornecedor || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Motorista:</span>
                    <span className="text-content-strong font-medium">{registro.nome_motorista || '-'}</span>
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
                  <Th>Tanque</Th>
                  <Th>Quantidade (L)</Th>
                  <Th>Fornecedor</Th>
                  <Th>Placa</Th>
                  <Th>Motorista</Th>
                  <Th>Nota Fiscal</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filteredRegistros.map((registro) => (
                  <Tr
                    key={registro.id}
                    onClick={() => navigate(`/controller/cadernetas/entrada-combustivel/${registro.id}`)}
                    className="cursor-pointer"
                  >
                    <Td>{formatDate(registro.data)}</Td>
                    <Td>{registro.tanque?.nome || '-'}</Td>
                    <Td>{Number(registro.quantidade_l).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} L</Td>
                    <Td>{registro.fornecedor || '-'}</Td>
                    <Td>{registro.placa_veiculo || '-'}</Td>
                    <Td>{registro.nome_motorista || '-'}</Td>
                    <Td>{registro.nota_fiscal || '-'}</Td>
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
