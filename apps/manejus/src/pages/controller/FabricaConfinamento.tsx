import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Card, Input, EmptyState, PageSkeleton, Table, Thead, Tbody, Tr, Th, Td, SearchInput, FilterToolbar, FilterField } from '@gestaup/ui'
import { exportToXLSX } from '@gestaup/shared'
import { FABRICA_CONFINAMENTO_EXPORT_CONFIG } from '../../utils/exportConfigs'
import { formatDate } from '@gestaup/shared'
import { getFazendaIdForUser, getFazendaNome } from '@gestaup/shared'

interface RegistroFabricaConfinamento {
  id: string
  fazenda_id: string
  data: string
  ordem_trato: number
  tipo: string
  total_previsto: number
  total_produzido: number
  concluido: boolean
  vagao?: { nome: string | null; marca: string; modelo: string } | null
  formulacao?: { nome: string } | null
  nome_usuario?: string | null
  created_at: string
}

export function FabricaConfinamento() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registros, setRegistros] = useState<RegistroFabricaConfinamento[]>([])
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
      .from('registros_fabrica_confinamento')
      .select('*, vagao:vagoes(nome, marca, modelo), formulacao:formulacoes(nome)')
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)
      .order('data', { ascending: false })
      .order('ordem_trato', { ascending: true })

    if (error) {
      console.error('Erro ao buscar carregamentos de vagão:', error)
    } else {
      setRegistros(data as RegistroFabricaConfinamento[])
    }

    setLoading(false)
  }

  const vagaoLabel = (v?: RegistroFabricaConfinamento['vagao']) =>
    v ? (v.nome || `${v.marca} ${v.modelo}`.trim()) : '-'

  const filteredRegistros = registros.filter((registro) => {
    const search = searchTerm.toLowerCase()
    const matchesSearch =
      (vagaoLabel(registro.vagao) !== '-' && vagaoLabel(registro.vagao).toLowerCase().includes(search)) ||
      (registro.formulacao?.nome && registro.formulacao.nome.toLowerCase().includes(search)) ||
      (registro.tipo && registro.tipo.toLowerCase().includes(search)) ||
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
        <h2 className="text-xl sm:text-2xl font-bold text-content-strong">Caderneta de Carregamento Vagão</h2>
      </div>

      <FilterToolbar
        onExport={() => exportToXLSX(exportData, FABRICA_CONFINAMENTO_EXPORT_CONFIG, fazendaNome)}
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
            placeholder="Vagão, formulação, tipo, usuário..."
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
        <EmptyState title="Nenhum carregamento de vagão encontrado" />
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
                onClick={() => navigate(`/controller/cadernetas/fabrica-confinamento/${registro.id}`)}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-medium text-content-muted">Data:</span>
                    <span className="text-xs sm:text-sm font-semibold text-content-strong">
                      {formatDate(registro.data)}
                    </span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${registro.concluido ? 'bg-green-500/10 text-green-700' : 'bg-amber-500/10 text-amber-700'}`}>
                    {registro.concluido ? 'Concluído' : 'Em aberto'}
                  </span>
                </div>
                <div className="space-y-2 text-xs sm:text-sm">
                  <div className="flex justify-between">
                    <span className="text-content-muted">Vagão:</span>
                    <span className="text-content-strong font-medium">{vagaoLabel(registro.vagao)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Formulação:</span>
                    <span className="text-content-strong font-medium">{registro.formulacao?.nome || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Trato:</span>
                    <span className="text-content-strong font-medium">{registro.ordem_trato}º · {registro.tipo}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Produzido:</span>
                    <span className="text-content-strong font-medium">
                      {Number(registro.total_produzido).toLocaleString('pt-BR')} / {Number(registro.total_previsto).toLocaleString('pt-BR')} kg
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
                  <Th>Vagão</Th>
                  <Th>Formulação</Th>
                  <Th>Trato</Th>
                  <Th>Previsto (kg)</Th>
                  <Th>Produzido (kg)</Th>
                  <Th>Status</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filteredRegistros.map((registro) => (
                  <Tr
                    key={registro.id}
                    onClick={() => navigate(`/controller/cadernetas/fabrica-confinamento/${registro.id}`)}
                    className="cursor-pointer"
                  >
                    <Td>{formatDate(registro.data)}</Td>
                    <Td>{registro.nome_usuario || '-'}</Td>
                    <Td>{vagaoLabel(registro.vagao)}</Td>
                    <Td>{registro.formulacao?.nome || '-'}</Td>
                    <Td>{registro.ordem_trato}º · {registro.tipo}</Td>
                    <Td>{Number(registro.total_previsto).toLocaleString('pt-BR')}</Td>
                    <Td>{Number(registro.total_produzido).toLocaleString('pt-BR')}</Td>
                    <Td>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${registro.concluido ? 'bg-green-500/10 text-green-700' : 'bg-amber-500/10 text-amber-700'}`}>
                        {registro.concluido ? 'Concluído' : 'Em aberto'}
                      </span>
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
