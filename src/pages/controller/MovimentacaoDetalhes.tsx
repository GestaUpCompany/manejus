import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Card, DetailLayout, DetailSection, DetailField, formatValue } from '../../components/ui'
import { formatDate } from '../../utils/formatDate'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

interface RegistroMovimentacao {
  id: string
  fazenda_id: string
  dispositivo_id?: string
  nome_usuario?: string
  data: string
  lote_origem?: string
  destino?: string
  numero_cabecas?: number
  peso_vivo_atual_kg?: number
  motivo_movimentacao?: string
  causa_observacao?: string
  brinco?: string
  chip?: string
  tipo_saida?: string
  tipo_entrada?: string
  tipo_destino?: string
  categoria?: string
  subtipo?: string
  fazenda_destino_id?: string
  fazenda_destino_nome?: { nome: string } | null
  sync_status?: string
  created_at: string
  updated_at?: string
}

export function MovimentacaoDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registro, setRegistro] = useState<RegistroMovimentacao | null>(null)
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
      .from('registros_movimentacao')
      .select('*, fazenda_destino_nome:fazendas!fazenda_destino_id(nome)')
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
      setRegistro(data as RegistroMovimentacao)
    }

    setLoading(false)
  }

  const backUrl = '/controller/cadernetas/movimentacao'

  return (
    <DetailLayout
      loading={loading}
      loadError={loadError}
      notFound={!registro}
      onBack={() => navigate(backUrl)}
      title="Detalhes do Registro de Movimentação"
    >
      {() => (
        <Card className="bg-white p-4 sm:p-6 border-0 shadow-sm" disableHover>
          <div className="space-y-6">
            {/* Informações Gerais */}
            <DetailSection title="Informações Gerais">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <DetailField label="Data" value={formatDate(registro!.data)} />
                <DetailField label="Usuário" value={formatValue(registro!.nome_usuario)} />
                <DetailField label="Lote Origem" value={formatValue(registro!.lote_origem)} />
                <DetailField label="Destino" value={formatValue(registro!.destino)} />
              </div>
            </DetailSection>

            {/* Quantidades */}
            <DetailSection title="Quantidades" highlighted>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailField label="Nº Cabeças" value={registro!.numero_cabecas ?? 0} />
                <DetailField label="Peso Vivo Atual (kg)" value={registro!.peso_vivo_atual_kg ?? 0} />
              </div>
            </DetailSection>

            {/* Categorias */}
            <DetailSection title="Categorias" highlighted>
              <DetailField label="Categoria" value={formatValue(registro!.categoria)} />
            </DetailSection>

            {/* Motivação */}
            <DetailSection title="Motivação" highlighted>
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <DetailField label="Motivo" value={formatValue(registro!.motivo_movimentacao)} />
                  <DetailField label="Subtipo" value={formatValue(registro!.subtipo)} />
                  <DetailField label="Brinco" value={formatValue(registro!.brinco)} />
                  <DetailField label="Chip" value={formatValue(registro!.chip)} />
                  <DetailField label="Tipo Saída" value={formatValue(registro!.tipo_saida)} />
                  <DetailField label="Tipo Entrada" value={formatValue(registro!.tipo_entrada)} />
                  <DetailField label="Tipo Destino" value={formatValue(registro!.tipo_destino)} />
                  <DetailField label="Fazenda Destino" value={formatValue(registro!.fazenda_destino_nome?.nome)} />
                </div>
                {registro!.causa_observacao && (
                  <DetailField label="Observação" value={formatValue(registro!.causa_observacao)} />
                )}
              </div>
            </DetailSection>
          </div>
        </Card>
      )}
    </DetailLayout>
  )
}
