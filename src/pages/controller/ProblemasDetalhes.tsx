import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Card, DetailLayout, DetailSection, DetailField, formatValue } from '../../components/ui'
import { formatDate } from '../../utils/formatDate'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

interface RegistroProblemas {
  id: string
  fazenda_id: string
  dispositivo_id?: string
  nome_usuario?: string
  data: string
  setor?: string
  local?: string
  descricao_problema?: string
  causa_identificada?: boolean
  causa_identificada_obs?: string
  acao_corretiva_realizada?: boolean
  acao_corretiva_realizada_obs?: string
  tipo_ocorrencia?: string
  tipo_ocorrencia_obs?: string
  causa_raiz_identificada?: boolean
  causa_raiz_identificada_obs?: string
  gravidade_impacto?: string
  gravidade_impacto_obs?: string
  tipo_problema?: string
  tipo_problema_obs?: string
  prioridade?: string
  setor_resolve?: string
  sync_status?: string
  created_at: string
  updated_at?: string
}

function fieldWithObs(value?: string, obs?: string): string {
  if (!value) return '-'
  return obs ? `${value} (${obs})` : value
}

function boolWithObs(value?: boolean, obs?: string): string {
  const base = value ? 'Sim' : 'Não'
  return obs ? `${base} - ${obs}` : base
}

export function ProblemasDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registro, setRegistro] = useState<RegistroProblemas | null>(null)
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
      .from('registros_problemas')
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
      setRegistro(data as RegistroProblemas)
    }

    setLoading(false)
  }

  const backUrl = '/controller/cadernetas/problemas'

  return (
    <DetailLayout
      loading={loading}
      loadError={loadError}
      notFound={!registro}
      onBack={() => navigate(backUrl)}
      title="Detalhes do Registro de Problemas"
    >
      {() => (
        <Card className="bg-white p-4 sm:p-6 border-0 shadow-sm" disableHover>
          <div className="space-y-6">
            {/* Informações Gerais */}
            <DetailSection title="Informações Gerais">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailField label="Data" value={formatDate(registro!.data)} />
                <DetailField label="Usuário" value={formatValue(registro!.nome_usuario)} />
                <DetailField label="Setor" value={formatValue(registro!.setor)} />
                <DetailField label="Local" value={formatValue(registro!.local)} />
                <DetailField label="Prioridade" value={formatValue(registro!.prioridade)} />
              </div>
            </DetailSection>

            {/* Problema */}
            <DetailSection title="Problema" highlighted>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailField label="Tipo Problema" value={fieldWithObs(registro!.tipo_problema, registro!.tipo_problema_obs)} />
                <DetailField label="Tipo Ocorrência" value={fieldWithObs(registro!.tipo_ocorrencia, registro!.tipo_ocorrencia_obs)} />
                <DetailField label="Gravidade do Impacto" value={fieldWithObs(registro!.gravidade_impacto, registro!.gravidade_impacto_obs)} />
                <DetailField label="Setor Resolve" value={formatValue(registro!.setor_resolve)} />
              </div>
            </DetailSection>

            {/* Descrição */}
            {registro!.descricao_problema && (
              <DetailSection title="Descrição do Problema" highlighted>
                <p className="text-sm">{registro!.descricao_problema}</p>
              </DetailSection>
            )}

            {/* Análise */}
            <DetailSection title="Análise e Ação" highlighted>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailField label="Causa Identificada" value={boolWithObs(registro!.causa_identificada, registro!.causa_identificada_obs)} />
                <DetailField label="Causa Raiz Identificada" value={boolWithObs(registro!.causa_raiz_identificada, registro!.causa_raiz_identificada_obs)} />
                <DetailField label="Ação Corretiva Realizada" value={boolWithObs(registro!.acao_corretiva_realizada, registro!.acao_corretiva_realizada_obs)} />
              </div>
            </DetailSection>
          </div>
        </Card>
      )}
    </DetailLayout>
  )
}
