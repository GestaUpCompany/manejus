import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Card, DetailLayout, DetailSection, DetailField, formatValue } from '@gestaup/ui'
import { formatDateTime } from '@gestaup/shared'
import { getFazendaIdForUser } from '@gestaup/shared'

interface RegistroPesagem {
  id: string
  fazenda_id: string
  data: string
  tipo_manejo: string
  lote?: string | null
  lote_rel?: { nome: string } | null
  id_brinco?: string | null
  id_chip?: string | null
  categoria?: string | null
  sexo?: string | null
  raca?: string | null
  idade_era?: string | null
  idade_dias?: number | null
  peso_kg?: number | null
  responsavel?: string | null
  nome_usuario?: string | null
  horario_inicio?: string | null
  horario_fim?: string | null
  tempo_total_min?: number | null
  tempo_medio_min_cab?: number | null
  balanca_aferida?: boolean | null
  curral_limpo?: boolean | null
  gritaria?: boolean | null
  manejo_agil?: boolean | null
  manejo_calmo?: boolean | null
  acidente?: boolean | null
  equipe_ajustada?: boolean | null
  ordem_servico?: { id: string; numero_os: string | null } | null
}

function boolLabel(v?: boolean | null) {
  if (v === null || v === undefined) return '-'
  return v ? 'Sim' : 'Não'
}

export function RegistrosPesagemDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registro, setRegistro] = useState<RegistroPesagem | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    loadRegistro()
  }, [id, user])

  const loadRegistro = async () => {
    if (!id || !user) return

    setLoadError(null)
    const fazendaId = await getFazendaIdForUser(user.id)
    if (!fazendaId) return

    const { data, error } = await supabase
      .from('registros_pesagem')
      .select('*, lote_rel:lotes(nome), ordem_servico:ordens_servico!registros_pesagem_os_id_fkey(id, numero_os)')
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
      setRegistro(data as RegistroPesagem)
    }

    setLoading(false)
  }

  return (
    <DetailLayout
      loading={loading}
      loadError={loadError}
      notFound={!registro}
      onBack={() => navigate('/controller/cadernetas/pesagem')}
      title="Detalhes da Pesagem"
    >
      {() => (
        <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm" disableHover>
          <div className="space-y-6">
            <DetailSection title="Informações Gerais">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <DetailField label="Data" value={formatDateTime(registro!.data)} />
                <DetailField label="Usuário" value={formatValue(registro!.nome_usuario)} />
                <DetailField label="Responsável" value={formatValue(registro!.responsavel)} />
                <DetailField label="Tipo de Manejo" value={formatValue(registro!.tipo_manejo)} />
                {registro!.ordem_servico?.id && (
                  <DetailField
                    label="Ordem de Serviço"
                    value={registro!.ordem_servico.numero_os || registro!.ordem_servico.id}
                  />
                )}
              </div>
            </DetailSection>

            <DetailSection title="Animal" highlighted>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <DetailField label="Brinco" value={formatValue(registro!.id_brinco)} />
                <DetailField label="Chip" value={formatValue(registro!.id_chip)} />
                <DetailField label="Lote" value={formatValue(registro!.lote_rel?.nome || registro!.lote)} />
                <DetailField label="Peso (kg)" value={registro!.peso_kg != null ? Number(registro!.peso_kg).toLocaleString('pt-BR') : '-'} />
                <DetailField label="Categoria" value={formatValue(registro!.categoria)} />
                <DetailField label="Sexo" value={formatValue(registro!.sexo)} />
                <DetailField label="Raça" value={formatValue(registro!.raca)} />
                <DetailField label="Idade" value={formatValue(registro!.idade_era || (registro!.idade_dias != null ? `${registro!.idade_dias} dias` : null))} />
              </div>
            </DetailSection>

            <DetailSection title="Tempos" highlighted>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <DetailField label="Início" value={formatValue(registro!.horario_inicio)} />
                <DetailField label="Fim" value={formatValue(registro!.horario_fim)} />
                <DetailField label="Tempo Total (min)" value={formatValue(registro!.tempo_total_min)} />
                <DetailField label="Tempo Médio (min/cab)" value={formatValue(registro!.tempo_medio_min_cab)} />
              </div>
            </DetailSection>

            <DetailSection title="Checklist de Manejo" highlighted>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <DetailField label="Balança Aferida" value={boolLabel(registro!.balanca_aferida)} />
                <DetailField label="Curral Limpo" value={boolLabel(registro!.curral_limpo)} />
                <DetailField label="Manejo Calmo" value={boolLabel(registro!.manejo_calmo)} />
                <DetailField label="Manejo Ágil" value={boolLabel(registro!.manejo_agil)} />
                <DetailField label="Gritaria" value={boolLabel(registro!.gritaria)} />
                <DetailField label="Acidente" value={boolLabel(registro!.acidente)} />
                <DetailField label="Equipe Ajustada" value={boolLabel(registro!.equipe_ajustada)} />
              </div>
            </DetailSection>
          </div>
        </Card>
      )}
    </DetailLayout>
  )
}
