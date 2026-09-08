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

interface AplicacaoItem {
  insumo_aplicado?: string
  quantidade_total_aplicada?: string
  area_trabalhada?: string
  dose_aplicada?: string
}

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
  observacao?: string
  checklist?: {
    meta_diaria_batida?: ChecklistItem
    algum_imprevisto?: ChecklistItem
  }
  aplicacoes?: AplicacaoItem[]
  sync_status?: string
  version?: number
  created_at: string
  updated_at: string
  deleted_at?: string
  nome_usuario?: string
}

function simNao(valor?: string): string {
  if (valor === 'S') return 'Sim'
  if (valor === 'N') return 'Não'
  return formatValue(valor)
}

export function RegistrosOperacoesMaquinasDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registro, setRegistro] = useState<RegistroOperacoesMaquinas | null>(null)
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
      .from('registros_operacoes_maquinas')
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
      setRegistro(data as RegistroOperacoesMaquinas)
    }

    setLoading(false)
  }

  const backUrl = '/controller/cadernetas/operacoes-maquinas'

  return (
    <DetailLayout
      loading={loading}
      loadError={loadError}
      notFound={!registro}
      onBack={() => navigate(backUrl)}
      title="Detalhes do Registro de Operações de Máquinas"
    >
      {() => (
        <Card className="bg-white p-4 sm:p-6 border-0 shadow-sm" disableHover>
          <div className="space-y-6">
            {/* Informações Gerais */}
            <DetailSection title="Informações Gerais">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <DetailField label="Data" value={formatDate(registro!.data)} />
                <DetailField label="Usuário" value={formatValue(registro!.nome_usuario)} />
                <DetailField label="Veículo/Trator" value={formatValue(registro!.veiculo_trator)} />
                <DetailField label="Implemento Utilizado" value={formatValue(registro!.implemento_utilizado)} />
                <DetailField label="Tipo Operação" value={registro!.tipo_operacao.charAt(0).toUpperCase() + registro!.tipo_operacao.slice(1)} />
              </div>
            </DetailSection>

            {/* Horários */}
            <DetailSection title="Horários" highlighted>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailField label="Hora Inicial" value={formatValue(registro!.hora_inicial)} />
                <DetailField label="Hora Final" value={formatValue(registro!.hora_final)} />
              </div>
            </DetailSection>

            {/* Odômetro */}
            <DetailSection title="Odômetro/Horímetro" highlighted>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <DetailField label="Inicial" value={formatValue(registro!.odometro_horimetro_inicial)} />
                <DetailField label="Final" value={formatValue(registro!.odometro_horimetro_final)} />
                <DetailField label="Total" value={formatValue(registro!.total_odometro_horimetro)} />
              </div>
            </DetailSection>

            {/* Aplicação */}
            {registro!.aplicacoes && Array.isArray(registro!.aplicacoes) && registro!.aplicacoes.length > 0 && (
              <DetailSection title="Aplicação" highlighted>
                <div className="space-y-3">
                  {registro!.aplicacoes.map((aplic, idx) => (
                    <div key={idx} className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                      <DetailField label="Insumo Aplicado" value={formatValue(aplic.insumo_aplicado)} />
                      <DetailField label="Quantidade Total" value={formatValue(aplic.quantidade_total_aplicada)} />
                      <DetailField label="Área Trabalhada" value={formatValue(aplic.area_trabalhada)} />
                      <DetailField label="Dose Aplicada" value={formatValue(aplic.dose_aplicada)} />
                    </div>
                  ))}
                </div>
              </DetailSection>
            )}

            {/* Meta Diária */}
            {registro!.checklist?.meta_diaria_batida && (
              <DetailSection title="Meta Diária" highlighted>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <DetailField label="Meta Diária Batida" value={simNao(registro!.checklist.meta_diaria_batida.valor)} />
                  <DetailField label="Obs." value={formatValue(registro!.checklist.meta_diaria_batida.observacao)} />
                </div>
              </DetailSection>
            )}

            {/* Imprevistos */}
            {registro!.checklist?.algum_imprevisto && (
              <DetailSection title="Imprevistos" highlighted>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <DetailField label="Algum Imprevisto" value={simNao(registro!.checklist.algum_imprevisto.valor)} />
                  <DetailField label="Obs." value={formatValue(registro!.checklist.algum_imprevisto.observacao)} />
                </div>
              </DetailSection>
            )}

            {/* Observação */}
            {registro!.observacao && (
              <DetailSection title="Observação" highlighted>
                <p className="text-sm">{registro!.observacao}</p>
              </DetailSection>
            )}
          </div>
        </Card>
      )}
    </DetailLayout>
  )
}
