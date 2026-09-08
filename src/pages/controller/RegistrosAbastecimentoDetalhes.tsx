import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Card, DetailLayout, DetailSection, DetailField, formatValue } from '../../components/ui'
import { formatDate } from '../../utils/formatDate'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

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
  odometro_horimetro: string
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
  const [registro, setRegistro] = useState<RegistroAbastecimento | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

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

  const backUrl = '/controller/cadernetas/abastecimento'

  return (
    <DetailLayout
      loading={loading}
      loadError={loadError}
      notFound={!registro}
      onBack={() => navigate(backUrl)}
      title="Detalhes do Registro de Abastecimento"
    >
      {() => (
        <Card className="bg-white p-4 sm:p-6 border-0 shadow-sm" disableHover>
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
  )
}
