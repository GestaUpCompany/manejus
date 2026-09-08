import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Card, DetailLayout, DetailSection, DetailField, formatValue } from '../../components/ui'
import { formatDate } from '../../utils/formatDate'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

interface RegistroEnfermaria {
  id: string
  fazenda_id: string
  dispositivo_id?: string
  nome_usuario?: string
  data: string
  brinco?: string
  chip?: string
  lote?: string
  pasto?: string
  categoria?: string
  tratamento_outros?: string
  tratamento_obs?: string
  diagnosticos?: Record<string, any>
  medicamentos?: Record<string, any>
  sexo?: string
  raca?: string
  idade?: string
  sync_status?: string
  created_at: string
  updated_at?: string
}

const DIAGNOSTICO_LABELS: Record<string, string> = {
  bicheira: 'Bicheira',
  cegueira: 'Cegueira',
  fraturas: 'Fraturas',
  febreAlta: 'Febre Alta',
  picadoCobra: 'Picado por Cobra',
  presencaSangue: 'Presença de Sangue',
  andarCambaleante: 'Andar Cambaleante',
  pododermiteCascos: 'Pododermite/Cascos',
  sintomasPneumonia: 'Sintomas de Pneumonia',
  desordensDigestivas: 'Desordens Digestivas',
  incoordenacaoTremores: 'Incoordenação/Tremores',
}

export function EnfermariaDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registro, setRegistro] = useState<RegistroEnfermaria | null>(null)
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
      .from('registros_enfermaria')
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
      setRegistro(data as RegistroEnfermaria)
    }

    setLoading(false)
  }

  const backUrl = '/controller/cadernetas/enfermaria'

  return (
    <DetailLayout
      loading={loading}
      loadError={loadError}
      notFound={!registro}
      onBack={() => navigate(backUrl)}
      title="Detalhes do Registro de Enfermaria"
    >
      {() => (
        <Card className="bg-white p-4 sm:p-6 border-0 shadow-sm" disableHover>
          <div className="space-y-6">
            {/* Informações Gerais */}
            <DetailSection title="Informações Gerais">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <DetailField label="Data" value={formatDate(registro!.data)} />
                <DetailField label="Usuário" value={formatValue(registro!.nome_usuario)} />
                <DetailField label="Brinco" value={formatValue(registro!.brinco)} />
                <DetailField label="Chip" value={formatValue(registro!.chip)} />
              </div>
            </DetailSection>

            {/* Identificação do Animal */}
            <DetailSection title="Identificação do Animal" highlighted>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <DetailField label="Categoria" value={formatValue(registro!.categoria)} />
                <DetailField label="Sexo" value={formatValue(registro!.sexo)} />
                <DetailField label="Raça" value={formatValue(registro!.raca)} />
                <DetailField label="Idade" value={formatValue(registro!.idade)} />
              </div>
            </DetailSection>

            {/* Localização */}
            <DetailSection title="Localização" highlighted>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailField label="Lote" value={formatValue(registro!.lote)} />
                <DetailField label="Pasto" value={formatValue(registro!.pasto)} />
              </div>
            </DetailSection>

            {/* Tratamento */}
            <DetailSection title="Tratamento" highlighted>
              <div className="space-y-2">
                <DetailField label="Tratamento" value={formatValue(registro!.tratamento_outros)} />
                {registro!.tratamento_obs && (
                  <DetailField label="Observação" value={formatValue(registro!.tratamento_obs)} />
                )}
              </div>
            </DetailSection>

            {/* Diagnósticos */}
            {registro!.diagnosticos && Object.keys(registro!.diagnosticos).length > 0 && (
              <DetailSection title="Diagnósticos" highlighted>
                <p className="text-sm font-medium text-gray-700">
                  {Object.entries(registro!.diagnosticos)
                    .filter(([_, value]: [string, any]) => value.valor === 'S')
                    .map(([key]: [string, any]) => DIAGNOSTICO_LABELS[key] || key)
                    .join(', ') || 'Nenhum diagnóstico positivo'}
                </p>
              </DetailSection>
            )}

            {/* Medicamentos */}
            {registro!.medicamentos && Array.isArray(registro!.medicamentos) && (registro!.medicamentos as any[]).length > 0 && (
              <DetailSection title="Medicamentos" highlighted>
                <div className="space-y-3">
                  {(registro!.medicamentos as any[]).map((med: any, index: number) => (
                    <div key={index} className="border-b border-gray-200 pb-2 last:border-0 last:pb-0">
                      <DetailField label="Nome" value={formatValue(med.nomeComercial)} />
                      <DetailField label="Tipo" value={formatValue(med.tipo)} />
                      <DetailField label="Dose Aplicada" value={formatValue(med.doseAplicada)} />
                      {med.doseRecomendada && <DetailField label="Dose Recomendada" value={formatValue(med.doseRecomendada)} />}
                    </div>
                  ))}
                </div>
              </DetailSection>
            )}
          </div>
        </Card>
      )}
    </DetailLayout>
  )
}
