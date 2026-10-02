import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Card, Input, EmptyState, PageSkeleton, Table, Thead, Tbody, Tr, Th, Td, SearchInput, FilterToolbar, FilterField } from '@gestaup/ui'
import { exportToXLSX } from '@gestaup/shared'
import { TRATO_CONFINAMENTO_EXPORT_CONFIG } from '../../utils/exportConfigs'
import { formatDateTime } from '@gestaup/shared'
import { getFazendaIdForUser, getFazendaNome } from '@gestaup/shared'

interface RegistroTrato {
  id: string
  fazenda_id: string
  data: string
  ordem_trato: number
  kg_planejado?: number | null
  kg_ofertado_real?: number | null
  leitura_cocho_nota?: number | null
  origem: string
  curral?: { nome: string } | null
  lote?: { nome: string } | null
  nome_usuario?: string | null
  created_at: string
}

export function TratoConfinamento() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registros, setRegistros] = useState<RegistroTrato[]>([])
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
      .from('registros_oferta_trato')
      .select('*, curral:currais(nome), lote:lotes(nome)')
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)
      .order('data', { ascending: false })
      .order('ordem_trato', { ascending: true })

    if (error) {
      console.error('Erro ao buscar tratos:', error)
    } else {
      setRegistros(data as RegistroTrato[])
    }

    setLoading(false)
  }

  const filteredRegistros = registros.filter((registro) => {
    const search = searchTerm.toLowerCase()
    const matchesSearch =
      (registro.curral?.nome && registro.curral.nome.toLowerCase().includes(search)) ||
      (registro.lote?.nome && registro.lote.nome.toLowerCase().includes(search)) ||
      (registro.origem && registro.origem.toLowerCase().includes(search)) ||
      (registro.nome_usuario && registro.nome_usuario.toLowerCase().includes(search))

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
        <h2 className="text-xl sm:text-2xl font-bold text-content-strong">Caderneta de Trato</h2>
      </div>

      <FilterToolbar
        onExport={() => exportToXLSX(exportData, TRATO_CONFINAMENTO_EXPORT_CONFIG, fazendaNome)}
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
            placeholder="Curral, lote, usuário..."
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
        <EmptyState title="Nenhum trato encontrado" />
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
                onClick={() => navigate(`/controller/cadernetas/trato-confinamento/${registro.id}`)}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-medium text-content-muted">Data:</span>
                    <span className="text-xs sm:text-sm font-semibold text-content-strong">
                      {formatDateTime(registro.data)}
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
                    <span className="text-content-muted">Curral:</span>
                    <span className="text-content-strong font-medium">{registro.curral?.nome || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Lote:</span>
                    <span className="text-content-strong font-medium">{registro.lote?.nome || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Trato:</span>
                    <span className="text-content-strong font-medium">{registro.ordem_trato}º</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Ofertado:</span>
                    <span className="text-content-strong font-medium">
                      {registro.kg_ofertado_real != null ? `${Number(registro.kg_ofertado_real).toLocaleString('pt-BR')} kg` : '-'}
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
                  <Th>Curral</Th>
                  <Th>Lote</Th>
                  <Th>Trato</Th>
                  <Th>Planejado (kg)</Th>
                  <Th>Ofertado (kg)</Th>
                  <Th>Nota Cocho</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filteredRegistros.map((registro) => (
                  <Tr
                    key={registro.id}
                    onClick={() => navigate(`/controller/cadernetas/trato-confinamento/${registro.id}`)}
                    className="cursor-pointer"
                  >
                    <Td>{formatDateTime(registro.data)}</Td>
                    <Td>{registro.nome_usuario || '-'}</Td>
                    <Td>{registro.curral?.nome || '-'}</Td>
                    <Td>{registro.lote?.nome || '-'}</Td>
                    <Td>{registro.ordem_trato}º</Td>
                    <Td>{registro.kg_planejado != null ? Number(registro.kg_planejado).toLocaleString('pt-BR') : '-'}</Td>
                    <Td>{registro.kg_ofertado_real != null ? Number(registro.kg_ofertado_real).toLocaleString('pt-BR') : '-'}</Td>
                    <Td>{registro.leitura_cocho_nota ?? '-'}</Td>
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
