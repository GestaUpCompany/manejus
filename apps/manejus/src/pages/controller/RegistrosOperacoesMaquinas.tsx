import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, Input, CardSkeleton } from '../../components/ui'
import { exportToXLSX } from '../../utils/exportXLSX'
import { OPERACOES_MAQUINAS_EXPORT_CONFIG } from '../../utils/exportConfigs'
import { formatDate } from '../../utils/formatDate'
import { getFazendaIdForUser, getFazendaNome } from '../../utils/fazendaContext'

interface RegistroOperacoesMaquinas {
  id: string
  fazenda_id: string
  dispositivo_id?: string
  data: string
  veiculo_trator: string
  implemento_utilizado?: string
  hora_inicial?: string
  hora_final?: string
  odometro_horimetro_inicial?: string
  odometro_horimetro_final?: string
  total_odometro_horimetro?: string
  tipo_operacao: string
  checklist?: Record<string, { valor: string; observacao: string }>
  aplicacoes?: Array<{ insumo_aplicado: string; quantidade_total_aplicada: string; area_trabalhada: string; dose_aplicada: string }>
  observacao?: string
  sync_status?: string
  version?: number
  created_at: string
  updated_at: string
  deleted_at?: string
  nome_usuario?: string
}

export function RegistrosOperacoesMaquinas() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registros, setRegistros] = useState<RegistroOperacoesMaquinas[]>([])
  const [loading, setLoading] = useState(true)
  const [fazendaNome, setFazendaNome] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')

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
      .from('registros_operacoes_maquinas')
      .select('*')
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })

    const { data, error } = await query

    if (error) {
      console.error('Erro ao buscar registros de operações de máquinas:', error)
    } else {
      setRegistros(data as RegistroOperacoesMaquinas[])
    }

    setLoading(false)
  }

  const filteredRegistros = registros.filter((registro) => {
    const matchesSearch =
      (registro.veiculo_trator && registro.veiculo_trator.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (registro.implemento_utilizado && registro.implemento_utilizado.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (registro.tipo_operacao && registro.tipo_operacao.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (registro.observacao && registro.observacao.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (registro.nome_usuario && registro.nome_usuario.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesDataInicio = !dataInicio || registro.data >= dataInicio
    const matchesDataFim = !dataFim || registro.data <= dataFim

    return matchesSearch && matchesDataInicio && matchesDataFim
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
        <h2 className="text-xl sm:text-2xl font-bold text-content-strong">Caderneta de Operações de Máquinas</h2>
      </div>

      <Card className="bg-surface-1 p-4 sm:p-6" disableHover>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
          <h3 className="text-base sm:text-lg font-semibold text-content-strong">Filtros</h3>
          <Button
            onClick={() => exportToXLSX(filteredRegistros, OPERACOES_MAQUINAS_EXPORT_CONFIG, fazendaNome)}
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
              placeholder="Veículo, implemento, tipo operação..."
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
          <p className="text-content-muted">Nenhum registro de operações de máquinas encontrado</p>
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
                onClick={() => navigate(`/controller/cadernetas/operacoes-maquinas/${registro.id}`)}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-medium text-content-muted">Data:</span>
                    <span className="text-xs sm:text-sm font-semibold text-content-strong">
                      {formatDate(registro.data)}
                    </span>
                  </div>
                </div>
                <div className="space-y-2 text-xs sm:text-sm">
                  <div className="flex justify-between">
                    <span className="text-content-muted">Usuário:</span>
                    <span className="text-content-strong font-medium">{registro.nome_usuario || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Veículo/Trator:</span>
                    <span className="text-content-strong font-medium">{registro.veiculo_trator || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Implemento:</span>
                    <span className="text-content-strong font-medium">{registro.implemento_utilizado || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Tipo Operação:</span>
                    <span className="text-content-strong font-medium">{registro.tipo_operacao || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Aplicações:</span>
                    <span className="text-content-strong font-medium truncate max-w-[150px]">{registro.aplicacoes?.map((a) => a.insumo_aplicado).join(', ') || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Observação:</span>
                    <span className="text-content-strong font-medium truncate max-w-[150px]">{registro.observacao ? registro.observacao.substring(0, 50) + (registro.observacao.length > 50 ? '...' : '') : '-'}</span>
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
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Data</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Usuário</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Veículo/Trator</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Implemento</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Tipo Operação</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Aplicações</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Observação</th>
                </tr>
              </thead>
              <tbody className="bg-surface-1 divide-y divide-border-base">
                {filteredRegistros.map((registro) => (
                  <tr
                    key={registro.id}
                    onClick={() => navigate(`/controller/cadernetas/operacoes-maquinas/${registro.id}`)}
                    className="cursor-pointer hover:bg-surface-2 transition-colors"
                  >
                    <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong">
                      {formatDate(registro.data)}
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong">{registro.nome_usuario || '-'}</td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong">
                      {registro.veiculo_trator}
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong">
                      {registro.implemento_utilizado || '-'}
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong">
                      {registro.tipo_operacao}
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong">
                      {registro.aplicacoes?.map((a) => a.insumo_aplicado).join(', ') || '-'}
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong">
                      {registro.observacao ? registro.observacao.substring(0, 50) + (registro.observacao.length > 50 ? '...' : '') : '-'}
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
