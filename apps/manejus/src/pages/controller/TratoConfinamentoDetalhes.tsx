import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Card, DetailLayout, DetailSection, DetailField, formatValue } from '@gestaup/ui'
import { formatDateTime } from '@gestaup/shared'
import { getFazendaIdForUser } from '@gestaup/shared'
import { LEITURA_COCHO_DESCRICOES } from './RegistrosLeituraCocho'

interface RegistroTrato {
  id: string
  fazenda_id: string
  data: string
  ordem_trato: number
  kg_planejado?: number | null
  kg_ofertado_real?: number | null
  leitura_cocho_nota?: number | null
  origem: string
  curral?: { nome: string } | null
  lote?: { nome: string } | null
  nome_usuario?: string | null
}

export function TratoConfinamentoDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registro, setRegistro] = useState<RegistroTrato | null>(null)
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
      .from('registros_oferta_trato')
      .select('*, curral:currais(nome), lote:lotes(nome)')
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
      setRegistro(data as RegistroTrato)
    }

    setLoading(false)
  }

  const notaCocho = registro?.leitura_cocho_nota
  const notaDescricao = notaCocho != null ? LEITURA_COCHO_DESCRICOES[notaCocho] : null

  return (
    <DetailLayout
      loading={loading}
      loadError={loadError}
      notFound={!registro}
      onBack={() => navigate('/controller/cadernetas/trato-confinamento')}
      title="Detalhes do Trato"
    >
      {() => (
        <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm" disableHover>
          <div className="space-y-6">
            <DetailSection title="Informações Gerais">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <DetailField label="Data" value={formatDateTime(registro!.data)} />
                <DetailField label="Usuário" value={formatValue(registro!.nome_usuario)} />
                <DetailField label="Ordem do Trato" value={`${registro!.ordem_trato}º`} />
                <DetailField label="Origem" value={formatValue(registro!.origem)} />
              </div>
            </DetailSection>

            <DetailSection title="Local" highlighted>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailField label="Curral" value={formatValue(registro!.curral?.nome)} />
                <DetailField label="Lote" value={formatValue(registro!.lote?.nome)} />
              </div>
            </DetailSection>

            <DetailSection title="Oferta" highlighted>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <DetailField
                  label="Planejado (kg)"
                  value={registro!.kg_planejado != null ? Number(registro!.kg_planejado).toLocaleString('pt-BR') : '-'}
                />
                <DetailField
                  label="Ofertado Real (kg)"
                  value={registro!.kg_ofertado_real != null ? Number(registro!.kg_ofertado_real).toLocaleString('pt-BR') : '-'}
                />
                <DetailField
                  label="Nota do Cocho"
                  value={notaCocho != null ? `${notaCocho}${notaDescricao ? ` — ${notaDescricao}` : ''}` : '-'}
                />
              </div>
            </DetailSection>
          </div>
        </Card>
      )}
    </DetailLayout>
  )
}
