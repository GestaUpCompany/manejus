import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Card, DetailLayout, DetailSection, DetailField, formatValue } from '../../components/ui'
import { formatDate } from '../../utils/formatDate'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

interface RegistroMorte {
  id: string
  fazenda_id: string
  dispositivo_id?: string
  nome_usuario?: string
  data: string
  pasto?: string
  lote?: string
  sexo?: string
  raca?: string
  idade?: string
  peso_vivo?: number
  causa_morte?: string
  brinco?: string
  chip?: string
  categoria?: string
  categoria_outros?: string
  diagnosticos?: Record<string, any>
  escore?: number
  nutricao_atual?: string
  nutricao_anterior?: string
  individuo_id?: string
  sync_status?: string
  version?: number
  created_at: string
  updated_at: string
  deleted_at?: string
}

const SINAIS_CLINICOS_LABELS: Record<string, string> = {
  secrecaoOrificios: 'Secreção pelos orifícios',
  sintomasPneumonia: 'Sintomas de pneumonia',
  inchaco: 'Inchaço',
  incoordenacaoTremores: 'Incoordenação/Tremores',
  apatiaFraqueza: 'Apatia/Fraqueza',
  presencaSangue: 'Presença de sangue',
  desordensDigestivas: 'Desordens digestivas',
  morteSubita: 'Morte Súbita',
  animalSozinho: 'Animal Sozinho',
}

export function RegistrosMorteDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registro, setRegistro] = useState<RegistroMorte | null>(null)
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
      .from('registros_morte')
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
      setRegistro(data as RegistroMorte)
    }

    setLoading(false)
  }

  const backUrl = '/controller/cadernetas/morte'

  return (
    <DetailLayout
      loading={loading}
      loadError={loadError}
      notFound={!registro}
      onBack={() => navigate(backUrl)}
      onRetry={loadRegistro}
      title="Detalhes do Registro de Morte"
    >
      {() => (
        <Card className="bg-white p-4 sm:p-6 border-0 shadow-sm" disableHover>
          <div className="space-y-6">
            {/* Informações Gerais */}
            <DetailSection title="Informações Gerais">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <DetailField label="Data" value={formatDate(registro!.data)} />
                <DetailField label="Usuário" value={formatValue(registro!.nome_usuario)} />
                <DetailField label="Lote" value={formatValue(registro!.lote)} />
                <DetailField label="Pasto" value={formatValue(registro!.pasto)} />
              </div>
            </DetailSection>

            {/* Identificação do Animal */}
            <DetailSection title="Identificação do Animal" highlighted>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <DetailField label="Brinco" value={formatValue(registro!.brinco)} />
                <DetailField label="Chip" value={formatValue(registro!.chip)} />
                <DetailField label="Categoria" value={registro!.categoria === 'outros' && registro!.categoria_outros ? `${registro!.categoria} (${registro!.categoria_outros})` : formatValue(registro!.categoria)} />
              </div>
              {registro!.individuo_id && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <p className="text-sm">
                    <span className="font-medium text-gray-700">Indivíduo:</span>{' '}
                    <button
                      onClick={() => navigate(`/controller/individuos/${registro!.individuo_id}`)}
                      className="text-primary hover:underline font-medium"
                    >
                      Ver indivíduo
                    </button>
                  </p>
                </div>
              )}
            </DetailSection>

            {/* Características */}
            <DetailSection title="Características" highlighted>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
                <DetailField label="Sexo" value={formatValue(registro!.sexo)} />
                <DetailField label="Raça" value={formatValue(registro!.raca)} />
                <DetailField label="Idade" value={formatValue(registro!.idade)} />
                <DetailField label="Peso Vivo (kg)" value={formatValue(registro!.peso_vivo)} />
                <DetailField label="Escore" value={registro!.escore !== undefined && registro!.escore !== null ? registro!.escore : '-'} />
              </div>
            </DetailSection>

            {/* Causa da Morte */}
            <DetailSection title="Causa da Morte" highlighted>
              <DetailField label="Causa" value={formatValue(registro!.causa_morte)} />
            </DetailSection>

            {/* Sinais Clínicos */}
            {registro!.diagnosticos && Object.keys(registro!.diagnosticos).length > 0 && (
              <DetailSection title="Sinais Clínicos" highlighted>
                <p className="text-sm font-medium text-gray-700">
                  {Object.entries(registro!.diagnosticos)
                    .filter(([_, value]: [string, any]) => value.valor === 'S')
                    .map(([key]: [string, any]) => SINAIS_CLINICOS_LABELS[key] || key)
                    .join(', ') || 'Nenhum sinal clínico registrado'}
                </p>
              </DetailSection>
            )}

            {/* Nutrição */}
            {(registro!.nutricao_atual || registro!.nutricao_anterior) && (
              <DetailSection title="Nutrição" highlighted>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <DetailField label="Nutrição Atual" value={formatValue(registro!.nutricao_atual)} />
                  <DetailField label="Nutrição Anterior" value={formatValue(registro!.nutricao_anterior)} />
                </div>
              </DetailSection>
            )}
          </div>
        </Card>
      )}
    </DetailLayout>
  )
}
