import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Card, Input, EmptyState, PageSkeleton, Table, Thead, Tbody, Tr, Th, Td, SearchInput, FilterToolbar, FilterField } from '@gestaup/ui'
import { exportToXLSX } from '@gestaup/shared'
import { LEITURA_COCHO_EXPORT_CONFIG } from '../../utils/exportConfigs'
import { formatDateTime } from '@gestaup/shared'
import { getFazendaIdForUser, getFazendaNome } from '@gestaup/shared'

export const LEITURA_COCHO_DESCRICOES: Record<number, string> = {
  [-1]: 'Cocho vazio (lambido)',
  0: 'Cocho limpo (sem sobras)',
  1: 'Poucas sobras (rapinha)',
  2: 'Sobras moderadas',
  3: 'Sobras em excesso',
}

interface RegistroLeituraCocho {
  id: string
  fazenda_id: string
  data: string
  responsavel?: string | null
  pasto_curral?: string | null
  pasto?: { nome: string } | null
  curral?: { nome: string } | null
  lote?: string | null
  lote_rel?: { nome: string } | null
  leitura_cocho?: number | null
  nome_usuario?: string | null
  created_at?: string | null
}

export function RegistrosLeituraCocho() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registros, setRegistros] = useState<RegistroLeituraCocho[]>([])
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
      .from('registros_leitura_cocho')
      .select('*, pasto:pastos(nome), curral:currais(nome), lote_rel:lotes(nome)')
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erro ao buscar leituras de cocho:', error)
    } else {
      setRegistros(data as RegistroLeituraCocho[])
    }

    setLoading(false)
  }

  const localLabel = (r: RegistroLeituraCocho) => r.curral?.nome || r.pasto?.nome || r.pasto_curral || '-'
  const loteLabel = (r: RegistroLeituraCocho) => r.lote_rel?.nome || r.lote || '-'

  const filteredRegistros = registros.filter((registro) => {
    const search = searchTerm.toLowerCase()
    const matchesSearch =
      (registro.responsavel && registro.responsavel.toLowerCase().includes(search)) ||
      localLabel(registro).toLowerCase().includes(search) ||
      loteLabel(registro).toLowerCase().includes(search) ||
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
        <h2 className="text-xl sm:text-2xl font-bold text-content-strong">Caderneta de Leitura de Cocho</h2>
      </div>

      <FilterToolbar
        onExport={() => exportToXLSX(exportData, LEITURA_COCHO_EXPORT_CONFIG, fazendaNome)}
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
            placeholder="Responsável, curral, lote, usuário..."
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
        <EmptyState title="Nenhuma leitura de cocho encontrada" />
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
                onClick={() => navigate(`/controller/cadernetas/leitura-cocho/${registro.id}`)}
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
                    <span className="text-content-muted">Responsável:</span>
                    <span className="text-content-strong font-medium">{registro.responsavel || registro.nome_usuario || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Curral/Pasto:</span>
                    <span className="text-content-strong font-medium">{localLabel(registro)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Lote:</span>
                    <span className="text-content-strong font-medium">{loteLabel(registro)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Nota:</span>
                    <span className="text-content-strong font-medium">
                      {registro.leitura_cocho != null ? `${registro.leitura_cocho} — ${LEITURA_COCHO_DESCRICOES[registro.leitura_cocho] || ''}` : '-'}
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
                  <Th>Responsável</Th>
                  <Th>Curral/Pasto</Th>
                  <Th>Lote</Th>
                  <Th>Nota</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filteredRegistros.map((registro) => (
                  <Tr
                    key={registro.id}
                    onClick={() => navigate(`/controller/cadernetas/leitura-cocho/${registro.id}`)}
                    className="cursor-pointer"
                  >
                    <Td>{formatDateTime(registro.data)}</Td>
                    <Td>{registro.nome_usuario || '-'}</Td>
                    <Td>{registro.responsavel || '-'}</Td>
                    <Td>{localLabel(registro)}</Td>
                    <Td>{loteLabel(registro)}</Td>
                    <Td>
                      {registro.leitura_cocho != null
                        ? `${registro.leitura_cocho} — ${LEITURA_COCHO_DESCRICOES[registro.leitura_cocho] || ''}`
                        : '-'}
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
