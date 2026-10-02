import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Card, Input, EmptyState, PageSkeleton, Table, Thead, Tbody, Tr, Th, Td, SearchInput, FilterToolbar, FilterField } from '@gestaup/ui'
import { exportToXLSX } from '@gestaup/shared'
import { PESAGEM_EXPORT_CONFIG } from '../../utils/exportConfigs'
import { formatDateTime } from '@gestaup/shared'
import { getFazendaIdForUser, getFazendaNome } from '@gestaup/shared'

interface RegistroPesagem {
  id: string
  fazenda_id: string
  data: string
  tipo_manejo: string
  lote?: string | null
  lote_rel?: { nome: string } | null
  id_brinco?: string | null
  id_chip?: string | null
  categoria?: string | null
  sexo?: string | null
  peso_kg?: number | null
  responsavel?: string | null
  nome_usuario?: string | null
  ordem_servico?: { numero_os: string | null } | null
  created_at?: string | null
}

export function RegistrosPesagem() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registros, setRegistros] = useState<RegistroPesagem[]>([])
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
      .from('registros_pesagem')
      .select('*, lote_rel:lotes(nome), ordem_servico:ordens_servico!registros_pesagem_os_id_fkey(numero_os)')
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erro ao buscar pesagens:', error)
    } else {
      setRegistros(data as RegistroPesagem[])
    }

    setLoading(false)
  }

  const animalLabel = (r: RegistroPesagem) => r.id_brinco || r.id_chip || '-'
  const loteLabel = (r: RegistroPesagem) => r.lote_rel?.nome || r.lote || '-'

  const filteredRegistros = registros.filter((registro) => {
    const search = searchTerm.toLowerCase()
    const matchesSearch =
      (registro.id_brinco && registro.id_brinco.toLowerCase().includes(search)) ||
      (registro.id_chip && registro.id_chip.toLowerCase().includes(search)) ||
      (registro.categoria && registro.categoria.toLowerCase().includes(search)) ||
      (registro.tipo_manejo && registro.tipo_manejo.toLowerCase().includes(search)) ||
      loteLabel(registro).toLowerCase().includes(search) ||
      (registro.responsavel && registro.responsavel.toLowerCase().includes(search)) ||
      (registro.ordem_servico?.numero_os && registro.ordem_servico.numero_os.toLowerCase().includes(search)) ||
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
        <h2 className="text-xl sm:text-2xl font-bold text-content-strong">Caderneta de Pesagem</h2>
      </div>

      <FilterToolbar
        onExport={() => exportToXLSX(exportData, PESAGEM_EXPORT_CONFIG, fazendaNome)}
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
            placeholder="Brinco, chip, lote, categoria, OS, responsável..."
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
        <EmptyState title="Nenhuma pesagem encontrada" />
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
                onClick={() => navigate(`/controller/cadernetas/pesagem/${registro.id}`)}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-medium text-content-muted">Data:</span>
                    <span className="text-xs sm:text-sm font-semibold text-content-strong">
                      {formatDateTime(registro.data)}
                    </span>
                  </div>
                  {registro.ordem_servico?.numero_os && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-500/10 text-blue-700">
                      {registro.ordem_servico.numero_os}
                    </span>
                  )}
                </div>
                <div className="space-y-2 text-xs sm:text-sm">
                  <div className="flex justify-between">
                    <span className="text-content-muted">Animal:</span>
                    <span className="text-content-strong font-medium">{animalLabel(registro)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Lote:</span>
                    <span className="text-content-strong font-medium">{loteLabel(registro)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Peso:</span>
                    <span className="text-content-strong font-medium">
                      {registro.peso_kg != null ? `${Number(registro.peso_kg).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg` : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Manejo:</span>
                    <span className="text-content-strong font-medium">{registro.tipo_manejo || '-'}</span>
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
                  <Th>Brinco</Th>
                  <Th>Chip</Th>
                  <Th>Lote</Th>
                  <Th>Categoria</Th>
                  <Th>Peso (kg)</Th>
                  <Th>Manejo</Th>
                  <Th>OS</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filteredRegistros.map((registro) => (
                  <Tr
                    key={registro.id}
                    onClick={() => navigate(`/controller/cadernetas/pesagem/${registro.id}`)}
                    className="cursor-pointer"
                  >
                    <Td>{formatDateTime(registro.data)}</Td>
                    <Td>{registro.nome_usuario || registro.responsavel || '-'}</Td>
                    <Td>{registro.id_brinco || '-'}</Td>
                    <Td>{registro.id_chip || '-'}</Td>
                    <Td>{loteLabel(registro)}</Td>
                    <Td>{registro.categoria || '-'}</Td>
                    <Td>{registro.peso_kg != null ? Number(registro.peso_kg).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '-'}</Td>
                    <Td>{registro.tipo_manejo || '-'}</Td>
                    <Td>{registro.ordem_servico?.numero_os || '-'}</Td>
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
