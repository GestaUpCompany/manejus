import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Card, Input, EmptyState, PageSkeleton, Table, Thead, Tbody, Tr, Th, Td, SearchInput, FilterToolbar, FilterField } from '@gestaup/ui'
import { exportToXLSX } from '@gestaup/shared'
import { RECEBIMENTO_COMPRA_EXPORT_CONFIG } from '../../utils/exportConfigs'
import { formatDateTime } from '@gestaup/shared'
import { getFazendaIdForUser, getFazendaNome } from '@gestaup/shared'

interface Recebimento {
  id: string
  fazenda_id: string
  os_id: string
  data?: string | null
  data_chegada?: string | null
  hora_chegada?: string | null
  numero_gta?: string | null
  numero_nf?: string | null
  transportadora?: string | null
  placa_veiculo?: string | null
  motorista?: string | null
  responsavel?: string | null
  destino?: string | null
  lote_destino?: string | null
  mortes?: number | null
  peso_medio_balancao?: number | null
  peso_origem?: number | null
  conferido?: boolean
  nome_usuario?: string | null
  ordem_servico?: { numero_os: string | null; tipo: string } | null
  created_at?: string | null
}

export function RecebimentoCompra() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [recebimentos, setRecebimentos] = useState<Recebimento[]>([])
  const [loading, setLoading] = useState(true)
  const [fazendaNome, setFazendaNome] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [dateSortOrder, setDateSortOrder] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    loadRecebimentos()
  }, [user])

  const loadRecebimentos = async () => {
    if (!user) return

    const fazendaId = await getFazendaIdForUser(user.id)
    if (!fazendaId) return

    getFazendaNome(fazendaId).then(setFazendaNome)

    const { data, error } = await supabase
      .from('os_recebimentos')
      .select('*, ordem_servico:ordens_servico!os_recebimentos_os_id_fkey(numero_os, tipo)')
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)
      .order('data_chegada', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erro ao buscar recebimentos:', error)
    } else {
      setRecebimentos(data as Recebimento[])
    }

    setLoading(false)
  }

  const dataRef = (r: Recebimento) => r.data_chegada || r.data || r.created_at || ''
  const totalCabecas = (r: Recebimento) => {
    const contagens = (r as any).contagens
    if (!contagens) return null
    if (typeof contagens === 'object' && !Array.isArray(contagens)) {
      const total = Object.values(contagens).reduce((acc: number, v: any) => acc + (Number(v) || 0), 0)
      return total > 0 ? total : null
    }
    if (Array.isArray(contagens)) {
      const total = contagens.reduce((acc: number, c: any) => acc + (Number(c?.quantidade ?? c) || 0), 0)
      return total > 0 ? total : null
    }
    return null
  }

  const filtered = recebimentos.filter((r) => {
    const search = searchTerm.toLowerCase()
    const matchesSearch =
      !search ||
      (r.ordem_servico?.numero_os && r.ordem_servico.numero_os.toLowerCase().includes(search)) ||
      (r.numero_gta && r.numero_gta.toLowerCase().includes(search)) ||
      (r.numero_nf && r.numero_nf.toLowerCase().includes(search)) ||
      (r.transportadora && r.transportadora.toLowerCase().includes(search)) ||
      (r.motorista && r.motorista.toLowerCase().includes(search)) ||
      (r.responsavel && r.responsavel.toLowerCase().includes(search)) ||
      (r.nome_usuario && r.nome_usuario.toLowerCase().includes(search))

    const d = dataRef(r)
    const matchesDataInicio = !dataInicio || d >= dataInicio
    const matchesDataFim = !dataFim || d <= dataFim

    return matchesSearch && matchesDataInicio && matchesDataFim
  }).sort((a, b) => {
    const dateA = new Date(dataRef(a))
    const dateB = new Date(dataRef(b))
    return dateSortOrder === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime()
  })

  if (loading) {
    return <PageSkeleton variant="list" />
  }

  const exportData = filtered.map((r) => ({
    ...r,
    total_cabecas: totalCabecas(r),
  }))

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-xl sm:text-2xl font-bold text-content-strong">Caderneta de Recebimento de Compra</h2>
      </div>

      <FilterToolbar
        onExport={() => exportToXLSX(exportData, RECEBIMENTO_COMPRA_EXPORT_CONFIG, fazendaNome)}
        exportDisabled={filtered.length === 0}
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
            placeholder="OS, GTA, NF, transportadora, motorista..."
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

      {recebimentos.length === 0 ? (
        <EmptyState title="Nenhum recebimento encontrado" />
      ) : filtered.length === 0 ? (
        <EmptyState title="Nenhum registro encontrado" description="Nenhum registro encontrado com os filtros aplicados" />
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="sm:hidden space-y-3">
            {filtered.map((r) => (
              <Card
                key={r.id}
                className="p-4"
                onClick={() => navigate(`/controller/ordens-servico/${r.os_id}`)}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-medium text-content-muted">Chegada:</span>
                    <span className="text-xs sm:text-sm font-semibold text-content-strong">
                      {dataRef(r) ? formatDateTime(dataRef(r)) : '-'}
                    </span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.conferido ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                    {r.conferido ? 'Conferido' : 'Pendente'}
                  </span>
                </div>
                <div className="space-y-2 text-xs sm:text-sm">
                  <div className="flex justify-between">
                    <span className="text-content-muted">OS:</span>
                    <span className="text-content-strong font-medium">{r.ordem_servico?.numero_os || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">GTA:</span>
                    <span className="text-content-strong font-medium">{r.numero_gta || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Transportadora:</span>
                    <span className="text-content-strong font-medium">{r.transportadora || r.motorista || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Cabeças:</span>
                    <span className="text-content-strong font-medium">{totalCabecas(r) ?? '-'}</span>
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
                    Chegada <span className="text-lg ml-1">{dateSortOrder === 'asc' ? '↑' : '↓'}</span>
                  </Th>
                  <Th>OS</Th>
                  <Th>Usuário</Th>
                  <Th>GTA</Th>
                  <Th>NF</Th>
                  <Th>Transportadora</Th>
                  <Th>Cabeças</Th>
                  <Th>Mortes</Th>
                  <Th>Status</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filtered.map((r) => (
                  <Tr
                    key={r.id}
                    onClick={() => navigate(`/controller/ordens-servico/${r.os_id}`)}
                    className="cursor-pointer"
                  >
                    <Td>{dataRef(r) ? formatDateTime(dataRef(r)) : '-'}</Td>
                    <Td>{r.ordem_servico?.numero_os || '-'}</Td>
                    <Td>{r.nome_usuario || '-'}</Td>
                    <Td>{r.numero_gta || '-'}</Td>
                    <Td>{r.numero_nf || '-'}</Td>
                    <Td>{r.transportadora || r.motorista || '-'}</Td>
                    <Td>{totalCabecas(r) ?? '-'}</Td>
                    <Td>{r.mortes ?? '-'}</Td>
                    <Td>
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${r.conferido ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                        {r.conferido ? 'Conferido' : 'Pendente'}
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
