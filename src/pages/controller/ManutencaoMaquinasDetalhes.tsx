import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Card, DetailLayout, DetailSection, DetailField, formatValue } from '../../components/ui'
import { formatDate } from '../../utils/formatDate'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

interface ChecklistItem {
  valor: string
  observacao: string
}

interface RegistroManutencaoMaquinas {
  id: string
  fazenda_id: string
  dispositivo_id?: string
  nome_usuario?: string
  data: string
  responsavel_checklist?: string
  operador_motorista?: string
  veiculo_trator?: string
  placa?: string
  odometro_horimetro?: string
  observacao?: string
  checklist?: Record<string, ChecklistItem>
  sync_status?: string
  created_at: string
  updated_at?: string
}

const CHECKLIST_LABELS: Record<string, string> = {
  assentoBom: 'Assento em bom estado',
  bateriaBoa: 'Bateria em boa condição',
  freiosBons: 'Freios em bom estado',
  tapetesBons: 'Tapetes em bom estado',
  calibrouPneus: 'Calibrou pneus',
  limpouRadiador: 'Limpou radiador',
  nivelAguaIdeal: 'Nível de água ideal',
  vidrosPerfeitos: 'Vidros perfeitos',
  conferiuEletrica: 'Conferiu parte elétrica',
  lavagemRealizada: 'Lavagem realizada',
  maquinaEngraxada: 'Máquina engraxada',
  conferiuNivelOleo: 'Conferiu nível de óleo',
  abastecimentoRealizado: 'Abastecimento realizado',
}

function simNao(valor?: string): string {
  if (valor === 'S') return 'Sim'
  if (valor === 'N') return 'Não'
  return formatValue(valor)
}

export function ManutencaoMaquinasDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registro, setRegistro] = useState<RegistroManutencaoMaquinas | null>(null)
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
      .from('registros_manutencao_maquinas')
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
      setRegistro(data as RegistroManutencaoMaquinas)
    }

    setLoading(false)
  }

  const backUrl = '/controller/cadernetas/manutencao-maquinas'

  return (
    <DetailLayout
      loading={loading}
      loadError={loadError}
      notFound={!registro}
      onBack={() => navigate(backUrl)}
      title="Detalhes do Registro de Manutenção de Máquinas"
    >
      {() => (
        <Card className="bg-white p-4 sm:p-6 border-0 shadow-sm" disableHover>
          <div className="space-y-6">
            {/* Informações Gerais */}
            <DetailSection title="Informações Gerais">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailField label="Data" value={formatDate(registro!.data)} />
                <DetailField label="Usuário" value={formatValue(registro!.nome_usuario)} />
                <DetailField label="Veículo/Trator" value={formatValue(registro!.veiculo_trator)} />
                <DetailField label="Placa" value={formatValue(registro!.placa)} />
                <DetailField label="Odômetro/Horímetro" value={formatValue(registro!.odometro_horimetro)} />
                <DetailField label="Operador/Motorista" value={formatValue(registro!.operador_motorista)} />
                <DetailField label="Responsável Checklist" value={formatValue(registro!.responsavel_checklist)} />
              </div>
            </DetailSection>

            {/* Checklist de Manutenção */}
            {registro!.checklist && Object.keys(registro!.checklist).length > 0 && (
              <DetailSection title="Checklist de Manutenção" highlighted>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {Object.entries(registro!.checklist).map(([key, item]) => (
                    <div key={key} className="space-y-1">
                      <DetailField label={CHECKLIST_LABELS[key] || key} value={simNao(item.valor)} />
                      {item.observacao && (
                        <p className="text-sm text-gray-600"><span className="font-medium">Obs.:</span> {item.observacao}</p>
                      )}
                    </div>
                  ))}
                </div>
              </DetailSection>
            )}

            {/* Observações */}
            <DetailSection title="Observações" highlighted>
              <DetailField label="Observação" value={formatValue(registro!.observacao)} />
            </DetailSection>
          </div>
        </Card>
      )}
    </DetailLayout>
  )
}
