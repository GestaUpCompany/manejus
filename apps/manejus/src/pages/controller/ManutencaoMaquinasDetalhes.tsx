import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Card, DetailLayout, DetailSection, DetailField, formatValue } from '@gestaup/ui'
import { formatDate } from '@gestaup/shared'
import { getFazendaIdForUser } from '@gestaup/shared'

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
  tipo_equipamento?: 'maquina' | 'implemento'
  tipo_manutencao?: 'rotina' | 'preventiva' | 'corretiva' | null
  placa?: string
  odometro_horimetro?: string
  observacao?: string
  checklist?: Record<string, ChecklistItem>
  sync_status?: string
  created_at: string
  updated_at?: string
}

const CHECKLIST_LABELS: Record<string, string> = {
  abastecimentoRealizado: 'Abasteceu?',
  lavagemRealizada: 'Lavou?',
  vidrosPerfeitos: 'Conferiu os vidros?',
  freiosBons: 'Conferiu os freios?',
  bateriaBoa: 'Conferiu a bateria?',
  conferiuEletrica: 'Conferiu a parte elétrica?',
  maquinaEngraxada: 'Engraxou?',
  nivelAguaIdeal: 'Conferiu o nível de água?',
  conferiuNivelOleo: 'Conferiu o nível de óleo?',
  calibrouPneus: 'Calibrou os pneus?',
  limpouRadiador: 'Limpou o radiador?',
  tapetesBons: 'Conferiu os tapetes?',
  assentoBom: 'Conferiu o assento?',
  pneusRodadoBons: 'Conferiu pneus/rodado?',
  pecasDesgasteBoas: 'Conferiu as peças de desgaste?',
  parafusosFixos: 'Conferiu parafusos e pinos?',
  mangueirasSemVazamento: 'Conferiu mangueiras e vazamentos?',
  engateBom: 'Conferiu engate/cabeçalho?',
  estruturaBoa: 'Conferiu estrutura e soldas?',
}

const TIPOS_MANUTENCAO: Record<string, string> = { rotina: 'Rotina', preventiva: 'Preventiva', corretiva: 'Corretiva' }

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
        <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm" disableHover>
          <div className="space-y-6">
            {/* Informações Gerais */}
            <DetailSection title="Informações Gerais">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailField label="Data" value={formatDate(registro!.data)} />
                <DetailField label="Usuário" value={formatValue(registro!.nome_usuario)} />
                <DetailField label="Tipo" value={registro!.tipo_equipamento === 'implemento' ? 'Implemento' : 'Máquina/Veículo'} />
                <DetailField label="Tipo de manutenção" value={registro!.tipo_manutencao ? TIPOS_MANUTENCAO[registro!.tipo_manutencao] : '-'} />
                <DetailField
                  label={registro!.tipo_equipamento === 'implemento' ? 'Implemento' : 'Veículo/Trator'}
                  value={formatValue(registro!.veiculo_trator)}
                />
                {registro!.tipo_equipamento !== 'implemento' && (
                  <>
                    <DetailField label="Placa" value={formatValue(registro!.placa)} />
                    <DetailField label="Odômetro/Horímetro" value={formatValue(registro!.odometro_horimetro)} />
                  </>
                )}
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
                        <p className="text-sm text-content-muted"><span className="font-medium">Motivo:</span> {item.observacao}</p>
                      )}
                    </div>
                  ))}
                </div>
              </DetailSection>
            )}

            {/* Observações */}
            <DetailSection title="Atividades executadas" highlighted>
              <DetailField label="Detalhamento" value={formatValue(registro!.observacao)} />
            </DetailSection>
          </div>
        </Card>
      )}
    </DetailLayout>
  )
}
