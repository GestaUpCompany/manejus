import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Button, Card, ConfirmModal, DetailLayout, DetailSection, DetailField, formatValue, useToast } from '@gestaup/ui'
import { formatDate } from '@gestaup/shared'
import { getFazendaIdForUser } from '@gestaup/shared'

interface RegistroAbastecimento {
  id: string
  fazenda_id: string
  dispositivo_id?: string
  data: string
  quem_abasteceu: string
  operador_motorista: string
  maquina_veiculo: string
  placa: string
  total_abastecido: number
  total_bomba?: number
  combustivel: string
  tanque_id?: string | null
  tanque_nome?: string | null
  baixa_estoque_id?: string | null
  odometro_horimetro: number | null
  tipo_operacao: string
  tipo_operacao_outros?: string
  observacao?: string
  sync_status?: string
  version?: number
  created_at: string
  updated_at: string
  deleted_at?: string
  nome_usuario?: string
}

export function RegistrosAbastecimentoDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [registro, setRegistro] = useState<RegistroAbastecimento | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const canDelete = user && (user.papel === 'admin' || user.papel === 'super_admin' || user.papel === 'controller')

  useEffect(() => {
    loadRegistro()
  }, [id, user])

  const loadRegistro = async () => {
    if (!id || !user) return

    setLoadError(null)
    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) return

    const fazendaId = vinculos[0].fazenda_id

    const { data, error } = await supabase
      .from('registros_abastecimento')
      .select('*')
      .eq('id', id)
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        setRegistro(null)
      } else {
        console.error('Erro ao buscar registro:', error)
        setLoadError(error.message || 'Erro ao buscar registro')
      }
    } else {
      setRegistro(data as RegistroAbastecimento)
    }

    setLoading(false)
  }

  const handleConfirmDelete = async () => {
    if (!registro || !user || isSubmitting) return

    setIsSubmitting(true)
    try {
      const _fazendaId = await getFazendaIdForUser(user.id)
      if (!_fazendaId) return

      const { error } = await supabase.rpc('excluir_registro_abastecimento', {
        p_id: registro.id,
        p_fazenda_id: _fazendaId,
        p_usuario_id: user.id,
        p_usuario_email: user.email,
      })

      if (error) {
        console.error('Erro ao excluir registro:', error)
        toast.error(error.message || 'Erro ao excluir registro')
        return
      }

      toast.success('Registro excluído com sucesso.')
      navigate('/controller/cadernetas/abastecimento')
    } catch (err) {
      console.error('Erro ao excluir registro:', err)
      toast.error('Erro inesperado ao excluir registro')
    } finally {
      setIsSubmitting(false)
    }
  }

  const backUrl = '/controller/cadernetas/abastecimento'

  const actions = (
    <>
      {canDelete && (
        <Button
          variant="danger"
          onClick={() => setIsDeleteConfirmOpen(true)}
          className="text-sm"
        >
          Excluir
        </Button>
      )}
    </>
  )

  return (
    <>
    <DetailLayout
      loading={loading}
      loadError={loadError}
      notFound={!registro}
      onBack={() => navigate(backUrl)}
      title="Detalhes do Registro de Abastecimento"
      actions={actions}
    >
      {() => (
        <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm" disableHover>
          <div className="space-y-6">
            {/* Informações Gerais */}
            <DetailSection title="Informações Gerais">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <DetailField label="Data" value={formatDate(registro!.data)} />
                <DetailField label="Usuário" value={formatValue(registro!.nome_usuario)} />
                <DetailField label="Quem Abasteceu" value={formatValue(registro!.quem_abasteceu)} />
                <DetailField label="Operador/Motorista" value={formatValue(registro!.operador_motorista)} />
              </div>
            </DetailSection>

            {/* Veículo */}
            <DetailSection title="Veículo" highlighted>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <DetailField label="Máquina/Veículo" value={formatValue(registro!.maquina_veiculo)} />
                <DetailField label="Placa" value={formatValue(registro!.placa)} />
                <DetailField label="Combustível" value={formatValue(registro!.combustivel)} />
                <DetailField label="Tanque" value={formatValue(registro!.tanque_nome)} />
              </div>
            </DetailSection>

            {/* Medições */}
            <DetailSection title="Medições" highlighted>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <DetailField label="Total Abastecido" value={`${registro!.total_abastecido} L`} />
                <DetailField label="Total Bomba" value={formatValue(registro!.total_bomba)} />
                <DetailField label="Odômetro/Horímetro" value={formatValue(registro!.odometro_horimetro)} />
              </div>
            </DetailSection>

            {/* Operação */}
            <DetailSection title="Operação" highlighted>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailField label="Tipo de Operação" value={formatValue(registro!.tipo_operacao)} />
                <DetailField label="Observação" value={formatValue(registro!.observacao)} />
              </div>
            </DetailSection>
          </div>
        </Card>
      )}
    </DetailLayout>

    {/* Confirm Modal de Exclusão */}
    {registro && (
      <ConfirmModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => !isSubmitting && setIsDeleteConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Excluir Registro de Abastecimento"
        message={`Tem certeza que deseja excluir o registro de ${formatDate(registro.data)}?\n\nMáquina/Veículo: ${registro.maquina_veiculo || '-'}\nTotal Abastecido: ${registro.total_abastecido || 0} L\nTanque: ${registro.tanque_nome || '-'}\n\nO registro será marcado como excluído.${registro.baixa_estoque_id ? ' A baixa de estoque vinculada será estornada e o saldo do tanque recalculado automaticamente.' : ''}`}
        confirmText={isSubmitting ? 'Excluindo...' : 'Excluir'}
        cancelText="Cancelar"
        variant="danger"
      />
    )}
    </>
  )
}
