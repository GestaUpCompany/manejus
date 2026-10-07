import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Card, DetailLayout, DetailSection, DetailField, formatValue } from '@gestaup/ui'
import { formatDateTime } from '@gestaup/shared'
import { getFazendaIdForUser } from '@gestaup/shared'
import { LEITURA_COCHO_DESCRICOES } from './RegistrosLeituraCocho'

interface RegistroLeituraCocho {
  id: string
  fazenda_id: string
  data: string
  responsavel?: string | null
  pasto_curral?: string | null
  pasto?: { nome: string } | null
  curral?: { nome: string } | null
  lote?: string | null
  lote_rel?: { nome: string } | null
  leitura_cocho?: number | null
  nota_config?: { nota: number; percentual_ajuste: number; descricao: string | null } | null
  nome_usuario?: string | null
  foto_url?: string | null
}

export function RegistrosLeituraCochoDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registro, setRegistro] = useState<RegistroLeituraCocho | null>(null)
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
      .from('registros_leitura_cocho')
      .select('*, pasto:pastos(nome), curral:currais(nome), lote_rel:lotes(nome), nota_config:notas_leitura_cocho_config(nota, percentual_ajuste, descricao)')
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
      setRegistro(data as RegistroLeituraCocho)
    }

    setLoading(false)
  }

  const notaDescricao = registro?.leitura_cocho != null
    ? (registro.nota_config?.descricao || LEITURA_COCHO_DESCRICOES[registro.leitura_cocho] || null)
    : null

  return (
    <DetailLayout
      loading={loading}
      loadError={loadError}
      notFound={!registro}
      onBack={() => navigate('/controller/cadernetas/leitura-cocho')}
      title="Detalhes da Leitura de Cocho"
    >
      {() => (
        <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm" disableHover>
          <div className="space-y-6">
            <DetailSection title="Informações Gerais">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <DetailField label="Data" value={formatDateTime(registro!.data)} />
                <DetailField label="Usuário" value={formatValue(registro!.nome_usuario)} />
                <DetailField label="Responsável" value={formatValue(registro!.responsavel)} />
                <DetailField label="Lote" value={formatValue(registro!.lote_rel?.nome || registro!.lote)} />
              </div>
            </DetailSection>

            <DetailSection title="Local" highlighted>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <DetailField label="Curral" value={formatValue(registro!.curral?.nome)} />
                <DetailField label="Pasto" value={formatValue(registro!.pasto?.nome)} />
                <DetailField label="Local (texto)" value={formatValue(registro!.pasto_curral)} />
              </div>
            </DetailSection>

            <DetailSection title="Leitura" highlighted>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <DetailField label="Nota" value={formatValue(registro!.leitura_cocho)} />
                <DetailField label="Descrição" value={formatValue(notaDescricao)} />
                <DetailField
                  label="Ajuste (%)"
                  value={registro!.nota_config ? `${Number(registro!.nota_config.percentual_ajuste).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '-'}
                />
              </div>
            </DetailSection>

            {registro!.foto_url && (
              <DetailSection title="Foto do cocho" highlighted>
                <a href={registro!.foto_url} target="_blank" rel="noopener noreferrer" className="block w-48">
                  <img
                    src={registro!.foto_url}
                    alt="Foto do cocho"
                    className="w-full h-36 object-cover rounded-lg border border-border-base"
                    loading="lazy"
                  />
                </a>
              </DetailSection>
            )}
          </div>
        </Card>
      )}
    </DetailLayout>
  )
}
