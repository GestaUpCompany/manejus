import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Card, DetailLayout, DetailSection, DetailField, formatValue } from '../../components/ui'
import { formatDate } from '../../utils/formatDate'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

interface ChecklistItem {
  valor: boolean
  observacao: string
}

interface RegistroBebedouros {
  id: string
  fazenda_id: string
  dispositivo_id?: string
  nome_usuario?: string
  data: string
  responsavel?: string
  pasto?: string
  lote?: string
  gado?: string
  leitura_bebedouro?: number
  numero_bebedouro?: string
  observacao?: string
  checklist?: {
    agua_suficiente?: ChecklistItem
    vazao_bebedouro_ideal?: ChecklistItem
    aterro_acesso_bebedouro_ideal?: ChecklistItem
    espacamento_bebedouro_ideal?: ChecklistItem
    boia_protecao_boas_condicoes?: ChecklistItem
  }
  sync_status?: string
  created_at: string
  updated_at?: string
}

function boolSimNao(item?: ChecklistItem): string {
  if (!item) return '-'
  return item.valor ? 'Sim' : 'Não'
}

export function BebedourosDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registro, setRegistro] = useState<RegistroBebedouros | null>(null)
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
      .from('registros_bebedouros')
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
      setRegistro(data as RegistroBebedouros)
    }

    setLoading(false)
  }

  const backUrl = '/controller/cadernetas/bebedouros'

  return (
    <DetailLayout
      loading={loading}
      loadError={loadError}
      notFound={!registro}
      onBack={() => navigate(backUrl)}
      title="Detalhes do Registro de Bebedouros"
    >
      {() => (
        <Card className="bg-white p-4 sm:p-6 border-0 shadow-sm" disableHover>
          <div className="space-y-6">
            {/* Informações Gerais */}
            <DetailSection title="Informações Gerais">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <DetailField label="Data" value={formatDate(registro!.data)} />
                <DetailField label="Usuário" value={formatValue(registro!.nome_usuario)} />
                <DetailField label="Responsável" value={formatValue(registro!.responsavel)} />
                <DetailField label="Pasto" value={formatValue(registro!.pasto)} />
                <DetailField label="Lote" value={formatValue(registro!.lote)} />
              </div>
            </DetailSection>

            {/* Bebedouro */}
            <DetailSection title="Bebedouro" highlighted>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailField label="Nº Bebedouro" value={formatValue(registro!.numero_bebedouro)} />
                <DetailField label="Leitura" value={registro!.leitura_bebedouro ?? 0} />
              </div>
            </DetailSection>

            {/* Condições do Bebedouro */}
            <DetailSection title="Condições do Bebedouro" highlighted>
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <DetailField label="Água Suficiente" value={boolSimNao(registro!.checklist?.agua_suficiente)} />
                  <DetailField label="Vazão Bebedouro Ideal" value={boolSimNao(registro!.checklist?.vazao_bebedouro_ideal)} />
                  <DetailField label="Aterro Acesso Bebedouro Ideal" value={boolSimNao(registro!.checklist?.aterro_acesso_bebedouro_ideal)} />
                  <DetailField label="Espaçamento Bebedouro Ideal" value={boolSimNao(registro!.checklist?.espacamento_bebedouro_ideal)} />
                  <DetailField label="Boia Proteção Boas Condições" value={boolSimNao(registro!.checklist?.boia_protecao_boas_condicoes)} />
                </div>
                {registro!.checklist?.agua_suficiente?.observacao && <DetailField label="Obs. Água" value={registro!.checklist.agua_suficiente.observacao} />}
                {registro!.checklist?.vazao_bebedouro_ideal?.observacao && <DetailField label="Obs. Vazão" value={registro!.checklist.vazao_bebedouro_ideal.observacao} />}
                {registro!.checklist?.aterro_acesso_bebedouro_ideal?.observacao && <DetailField label="Obs. Aterro" value={registro!.checklist.aterro_acesso_bebedouro_ideal.observacao} />}
                {registro!.checklist?.espacamento_bebedouro_ideal?.observacao && <DetailField label="Obs. Espaçamento" value={registro!.checklist.espacamento_bebedouro_ideal.observacao} />}
                {registro!.checklist?.boia_protecao_boas_condicoes?.observacao && <DetailField label="Obs. Boia" value={registro!.checklist.boia_protecao_boas_condicoes.observacao} />}
              </div>
            </DetailSection>

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
