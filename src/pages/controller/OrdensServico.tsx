import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, Input, Select, CardSkeleton } from '../../components/ui'
import { formatDate } from '../../utils/formatDate'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

export interface OrdemServico {
  id: string
  fazenda_id: string
  numero_os: string | null
  tipo: 'venda' | 'compra' | 'transferencia'
  tipo_venda: 'abate' | 'animal_vivo' | null
  status: 'aberta' | 'embarcada' | 'recebida' | 'aguardando_pagamento' | 'fechada' | 'cancelada'
  vendedor: string | null
  comprador: string | null
  fornecedor: string | null
  origem_fazenda: string | null
  quantidade_prevista: number | null
  quantidade_embarcada: number | null
  data_prevista_embarque: string | null
  nome_usuario: string | null
  data: string
  created_at: string
}

export const STATUS_OS: Record<string, { label: string; classes: string }> = {
  aberta: { label: 'Aberta', classes: 'bg-blue-100 text-blue-800' },
  embarcada: { label: 'Embarcada', classes: 'bg-amber-100 text-amber-800' },
  recebida: { label: 'Recebida', classes: 'bg-cyan-100 text-cyan-800' },
  aguardando_pagamento: { label: 'Aguard. Pagamento', classes: 'bg-amber-100 text-amber-800' },
  fechada: { label: 'Fechada', classes: 'bg-green-100 text-green-800' },
  cancelada: { label: 'Cancelada', classes: 'bg-red-100 text-red-800' },
}

export const TIPO_OS: Record<string, string> = {
  venda: 'Venda',
  compra: 'Compra',
  transferencia: 'Transferência',
}

export const TIPO_VENDA: Record<string, string> = {
  abate: 'Abate',
  animal_vivo: 'Animal Vivo',
}

export function OrdensServico() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [ordens, setOrdens] = useState<OrdemServico[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')

  useEffect(() => {
    loadOrdens()
  }, [user])

  const loadOrdens = async () => {
    if (!user) return

    const fazendaId = await getFazendaIdForUser(user.id)
    if (!fazendaId) {
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('ordens_servico')
      .select('*')
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erro ao buscar ordens de serviço:', error)
    } else {
      setOrdens(data as OrdemServico[])
    }
    setLoading(false)
  }

  const filtered = ordens.filter((os) => {
    const termo = searchTerm.toLowerCase()
    const matchesSearch =
      !termo ||
      (os.numero_os && os.numero_os.toLowerCase().includes(termo)) ||
      (os.vendedor && os.vendedor.toLowerCase().includes(termo)) ||
      (os.comprador && os.comprador.toLowerCase().includes(termo)) ||
      (os.fornecedor && os.fornecedor.toLowerCase().includes(termo)) ||
      (os.origem_fazenda && os.origem_fazenda.toLowerCase().includes(termo)) ||
      (os.nome_usuario && os.nome_usuario.toLowerCase().includes(termo))
    const matchesStatus = !filtroStatus || os.status === filtroStatus
    const matchesTipo = !filtroTipo || os.tipo === filtroTipo
    return matchesSearch && matchesStatus && matchesTipo
  })

  const statusBadge = (status: string) => {
    const cfg = STATUS_OS[status] || { label: status, classes: 'bg-gray-100 text-gray-800' }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${cfg.classes}`}>
        {cfg.label}
      </span>
    )
  }

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
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-xl sm:text-2xl font-bold text-content-strong">Ordens de Serviço</h2>
      </div>

      <Card className="bg-surface-1 p-4 sm:p-6" disableHover>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
          <h3 className="text-base sm:text-lg font-semibold text-content-strong">Filtros</h3>
          <Button
            variant="secondary"
            onClick={() => {
              setSearchTerm('')
              setFiltroStatus('')
              setFiltroTipo('')
            }}
            className="w-full sm:w-auto text-sm"
          >
            Limpar Filtros
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs sm:text-sm font-medium text-content mb-1">Buscar</label>
            <Input
              type="text"
              placeholder="Número da OS, vendedor, comprador, usuário..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="text-sm"
            />
          </div>
          <div>
            <label className="block text-xs sm:text-sm font-medium text-content mb-1">Tipo</label>
            <Select
              value={filtroTipo}
              onChange={setFiltroTipo}
              placeholder="Todos"
              options={[
                { value: '', label: 'Todos' },
                { value: 'venda', label: 'Venda' },
                { value: 'compra', label: 'Compra' },
                { value: 'transferencia', label: 'Transferência' },
              ]}
            />
          </div>
          <div>
            <label className="block text-xs sm:text-sm font-medium text-content mb-1">Status</label>
            <Select
              value={filtroStatus}
              onChange={setFiltroStatus}
              placeholder="Todos"
              options={[
                { value: '', label: 'Todos' },
                ...Object.entries(STATUS_OS).map(([value, cfg]) => ({ value, label: cfg.label })),
              ]}
            />
          </div>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card className="bg-surface-1 p-4 sm:p-6 text-center" disableHover>
          <p className="text-content-muted">Nenhuma ordem de serviço encontrada</p>
        </Card>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="sm:hidden space-y-3">
            {filtered.map((os) => (
              <Card
                key={os.id}
                className="bg-surface-1 p-4 cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => navigate(`/controller/ordens-servico/${os.id}`)}
              >
                <div className="flex justify-between items-start mb-3">
                  <span className="text-sm font-bold text-content-strong">{os.numero_os || '(sem número)'}</span>
                  {statusBadge(os.status)}
                </div>
                <div className="space-y-2 text-xs sm:text-sm">
                  <div className="flex justify-between">
                    <span className="text-content-muted">Tipo:</span>
                    <span className="text-content-strong font-medium">
                      {TIPO_OS[os.tipo] || os.tipo}
                      {os.tipo_venda ? ` · ${TIPO_VENDA[os.tipo_venda]}` : ''}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">{os.tipo === 'compra' ? 'Fornecedor:' : 'Comprador:'}</span>
                    <span className="text-content-strong font-medium">
                      {os.tipo === 'compra' ? (os.fornecedor || os.origem_fazenda || '-') : (os.comprador || '-')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Cabeças ({os.tipo === 'compra' ? 'rec./prev.' : 'emb./prev.'}):</span>
                    <span className="text-content-strong font-medium">
                      {os.quantidade_embarcada ?? 0} / {os.quantidade_prevista ?? '-'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Criada em:</span>
                    <span className="text-content-strong font-medium">{formatDate(os.created_at)}</span>
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
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">OS</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Tipo</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Comprador/Fornecedor</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Cabeças (proc./prev.)</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Data Prev.</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Status</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Criada em</th>
                </tr>
              </thead>
              <tbody className="bg-surface-1 divide-y divide-border-base">
                {filtered.map((os) => (
                  <tr
                    key={os.id}
                    onClick={() => navigate(`/controller/ordens-servico/${os.id}`)}
                    className="cursor-pointer hover:bg-surface-2 transition-colors"
                  >
                    <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm font-semibold text-content-strong">
                      {os.numero_os || '(sem número)'}
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong">
                      {TIPO_OS[os.tipo] || os.tipo}
                      {os.tipo_venda ? ` · ${TIPO_VENDA[os.tipo_venda]}` : ''}
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong">
                      {os.tipo === 'compra' ? (os.fornecedor || os.origem_fazenda || '-') : (os.comprador || '-')}
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong">
                      {os.quantidade_embarcada ?? 0} / {os.quantidade_prevista ?? '-'}
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong">
                      {formatDate(os.data_prevista_embarque)}
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm">
                      {statusBadge(os.status)}
                    </td>
                    <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong">
                      {formatDate(os.created_at)}
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
