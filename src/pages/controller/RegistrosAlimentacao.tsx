import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Card, Input, EmptyState, PageSkeleton, Table, Thead, Tbody, Tr, Th, Td, SearchInput, FilterToolbar, FilterField } from '../../components/ui'
import { exportToXLSX } from '../../utils/exportXLSX'
import { ALIMENTACAO_EXPORT_CONFIG } from '../../utils/exportConfigs'
import { formatDateTime } from '../../utils/formatDate'
import { getFazendaIdForUser, getFazendaNome } from '../../utils/fazendaContext'

interface RegistroAlimentacao {
  id: string
  fazenda_id: string
  dispositivo_id?: string
  data: string
  modo?: string
  quem_recebeu?: string
  itens_detalhe?: any[]
  numero_cozinheiras?: number
  quem_cozinhou?: string
  quem_ajudou?: string
  numero_cafe_manha?: number
  numero_lanches?: number
  numero_refeicoes_almoco?: number
  numero_refeicoes_jantar?: number
  fornecedor?: string
  quantidade_marmitas?: number
  preco_unitario?: number
  destinatario?: string
  quantidade_outros?: string
  unidade_outros?: string
  itens?: any
  observacao?: string
  nome_usuario?: string
  sync_status?: string
  version?: number
  created_at: string
  updated_at: string
  deleted_at?: string
}

export function RegistrosAlimentacao() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registros, setRegistros] = useState<RegistroAlimentacao[]>([])
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
      .from('registros_alimentacao')
      .select('*')
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })

    const { data, error } = await query

    if (error) {
      console.error('Erro ao buscar registros de alimentação:', error)
    } else {
      setRegistros(data as RegistroAlimentacao[])
    }

    setLoading(false)
  }

  const filteredRegistros = registros.filter((registro) => {
    const search = searchTerm.toLowerCase()
    const matchesSearch =
      (registro.quem_cozinhou && registro.quem_cozinhou.toLowerCase().includes(search)) ||
      (registro.quem_ajudou && registro.quem_ajudou.toLowerCase().includes(search)) ||
      (registro.numero_cozinheiras && registro.numero_cozinheiras.toString().includes(search)) ||
      (registro.numero_cafe_manha && registro.numero_cafe_manha.toString().includes(search)) ||
      (registro.numero_lanches && registro.numero_lanches.toString().includes(search)) ||
      (registro.numero_refeicoes_almoco && registro.numero_refeicoes_almoco.toString().includes(search)) ||
      (registro.numero_refeicoes_jantar && registro.numero_refeicoes_jantar.toString().includes(search)) ||
      (registro.fornecedor && registro.fornecedor.toLowerCase().includes(search)) ||
      (registro.destinatario && registro.destinatario.toLowerCase().includes(search)) ||
      (registro.quantidade_marmitas && registro.quantidade_marmitas.toString().includes(search)) ||
      (registro.observacao && registro.observacao.toLowerCase().includes(search)) ||
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

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-xl sm:text-2xl font-bold text-content-strong">Caderneta de Alimentação</h2>
      </div>

      <FilterToolbar
        onExport={() => exportToXLSX(filteredRegistros, ALIMENTACAO_EXPORT_CONFIG, fazendaNome)}
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
            placeholder="Quem cozinhou, fornecedor, destinatário, refeições..."
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
                onClick={() => navigate(`/controller/cadernetas/alimentacao/${registro.id}`)}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-medium text-content-muted">Data:</span>
                    <span className="text-xs sm:text-sm font-semibold text-content-strong">
                      {formatDateTime(registro.data)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {registro.modo && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        registro.modo === 'marmita'
                          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                          : registro.modo === 'entrada'
                          ? 'bg-emerald-500/10 text-emerald-700'
                          : 'bg-primary/10 text-primary dark:text-primary-light'
                      }`}>
                        {registro.modo === 'marmita' ? 'Marmita' : registro.modo === 'entrada' ? 'Entrada' : 'Cantina'}
                      </span>
                    )}
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
                </div>
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-content-muted">Usuário:</span>
                  <span className="text-content-strong font-medium">{registro.nome_usuario || '-'}</span>
                </div>
                {registro.modo === 'entrada' ? (
                  <div className="space-y-2 text-xs sm:text-sm">
                    <div className="flex justify-between">
                      <span className="text-content-muted">Quem Recebeu:</span>
                      <span className="text-content-strong font-medium">{registro.quem_recebeu || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-content-muted">Itens:</span>
                      <span className="text-content-strong font-medium">
                        {Array.isArray(registro.itens_detalhe) ? `${registro.itens_detalhe.length} item(s)` : '-'}
                      </span>
                    </div>
                  </div>
                ) : registro.modo === 'marmita' ? (
                  <div className="space-y-2 text-xs sm:text-sm">
                    <div className="flex justify-between">
                      <span className="text-content-muted">Fornecedor:</span>
                      <span className="text-content-strong font-medium">{registro.fornecedor || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-content-muted">Qtd. Marmitas:</span>
                      <span className="text-content-strong font-medium">{registro.quantidade_marmitas || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-content-muted">Preço Unit.:</span>
                      <span className="text-content-strong font-medium">
                        {registro.preco_unitario ? `R$ ${Number(registro.preco_unitario).toFixed(2).replace('.', ',')}` : '-'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-content-muted">Destinatário:</span>
                      <span className="text-content-strong font-medium">{registro.destinatario || '-'}</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 text-xs sm:text-sm">
                    <div className="flex justify-between">
                      <span className="text-content-muted">Quem Cozinhou:</span>
                      <span className="text-content-strong font-medium">{registro.quem_cozinhou || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-content-muted">Quem Ajudou:</span>
                      <span className="text-content-strong font-medium">{registro.quem_ajudou || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-content-muted">Nº Cozinheiras:</span>
                      <span className="text-content-strong font-medium">{registro.numero_cozinheiras || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-content-muted">Café Manhã:</span>
                      <span className="text-content-strong font-medium">{registro.numero_cafe_manha || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-content-muted">Lanches:</span>
                      <span className="text-content-strong font-medium">{registro.numero_lanches || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-content-muted">Almoço:</span>
                      <span className="text-content-strong font-medium">{registro.numero_refeicoes_almoco || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-content-muted">Jantar:</span>
                      <span className="text-content-strong font-medium">{registro.numero_refeicoes_jantar || '-'}</span>
                    </div>
                  </div>
                )}
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
                  <Th>Modo</Th>
                  <Th>Responsável / Fornecedor</Th>
                  <Th>Detalhes</Th>
                  <Th>Observação</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filteredRegistros.map((registro) => (
                  <Tr
                    key={registro.id}
                    onClick={() => navigate(`/controller/cadernetas/alimentacao/${registro.id}`)}
                    className="cursor-pointer"
                  >
                    <Td>
                      {formatDateTime(registro.data)}
                    </Td>
                    <Td>{registro.nome_usuario || '-'}</Td>
                    <Td>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        registro.modo === 'marmita'
                          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                          : registro.modo === 'entrada'
                          ? 'bg-emerald-500/10 text-emerald-700'
                          : 'bg-primary/10 text-primary dark:text-primary-light'
                      }`}>
                        {registro.modo === 'marmita' ? 'Marmita' : registro.modo === 'entrada' ? 'Entrada' : 'Cantina'}
                      </span>
                    </Td>
                    <Td>
                      {registro.modo === 'marmita'
                        ? (registro.fornecedor || '-')
                        : registro.modo === 'entrada'
                        ? (registro.quem_recebeu || '-')
                        : (registro.quem_cozinhou || '-')}
                    </Td>
                    <Td>
                      {registro.modo === 'entrada' ? (
                        <span className="whitespace-nowrap">
                          {Array.isArray(registro.itens_detalhe) ? `${registro.itens_detalhe.length} item(s)` : '-'}
                        </span>
                      ) : registro.modo === 'marmita' ? (
                        <span className="whitespace-nowrap">
                          {registro.quantidade_marmitas || 0} marmitas
                          {registro.preco_unitario ? ` × R$ ${Number(registro.preco_unitario).toFixed(2).replace('.', ',')}` : ''}
                          {registro.destinatario ? ` → ${registro.destinatario}` : ''}
                        </span>
                      ) : (
                        <span className="whitespace-nowrap">
                          {[
                            registro.numero_cafe_manha != null && `Café: ${registro.numero_cafe_manha}`,
                            registro.numero_lanches != null && `Lanches: ${registro.numero_lanches}`,
                            registro.numero_refeicoes_almoco != null && `Almoço: ${registro.numero_refeicoes_almoco}`,
                            registro.numero_refeicoes_jantar != null && `Jantar: ${registro.numero_refeicoes_jantar}`,
                          ].filter(Boolean).join(' · ') || '-'}
                        </span>
                      )}
                    </Td>
                    <Td className="text-content-muted max-w-xs truncate">
                      {registro.observacao || '-'}
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
