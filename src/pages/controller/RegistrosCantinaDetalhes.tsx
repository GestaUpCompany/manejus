import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Card, DetailLayout, DetailSection, DetailField, formatValue } from '../../components/ui'
import { formatDateTime } from '../../utils/formatDate'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

interface RegistroCantina {
  id: string
  fazenda_id: string
  dispositivo_id?: string
  data: string
  numero_cozinheiras?: number
  quem_cozinhou?: string
  quem_ajudou?: string
  numero_cafe_manha?: number
  numero_lanches?: number
  numero_refeicoes_almoco?: number
  numero_refeicoes_jantar?: number
  itens?: any[]
  observacao?: string
  nome_usuario?: string
  sync_status?: string
  version?: number
  created_at: string
  updated_at: string
  deleted_at?: string
}

export function RegistrosCantinaDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registro, setRegistro] = useState<RegistroCantina | null>(null)
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
      .from('registros_alimentacao')
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
      setRegistro(data as RegistroCantina)
    }

    setLoading(false)
  }

  const backUrl = '/controller/cadernetas/cantina'

  return (
    <DetailLayout
      loading={loading}
      loadError={loadError}
      notFound={!registro}
      onBack={() => navigate(backUrl)}
      title="Detalhes do Registro de Cantina"
    >
      {() => (
        <Card className="bg-white p-4 sm:p-6 border-0 shadow-sm" disableHover>
          <div className="space-y-6">
            {/* Informações Gerais */}
            <DetailSection title="Informações Gerais">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <DetailField label="Data" value={formatDateTime(registro!.data)} />
                <DetailField label="Usuário" value={formatValue(registro!.nome_usuario)} />
                <DetailField label="Nº Cozinheiras" value={formatValue(registro!.numero_cozinheiras)} />
                <DetailField label="Quem Cozinhou" value={formatValue(registro!.quem_cozinhou)} />
                <DetailField label="Quem Ajudou" value={formatValue(registro!.quem_ajudou)} />
              </div>
            </DetailSection>

            {/* Quantidades */}
            <DetailSection title="Quantidades" highlighted>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <DetailField label="Café Manhã" value={formatValue(registro!.numero_cafe_manha)} />
                <DetailField label="Lanches" value={formatValue(registro!.numero_lanches)} />
                <DetailField label="Almoço" value={formatValue(registro!.numero_refeicoes_almoco)} />
                <DetailField label="Jantar" value={formatValue(registro!.numero_refeicoes_jantar)} />
              </div>
            </DetailSection>

            {/* Itens */}
            {registro!.itens && registro!.itens.length > 0 && (
              <DetailSection title="Itens" highlighted>
                <div className="space-y-2">
                  {registro!.itens.map((item: any, index: number) => (
                    <p key={index} className="text-sm">
                      <span className="font-medium text-gray-700">{item.nome || item.item || 'Item'}:</span> {item.quantidade || '-'} {item.unidade || ''}
                    </p>
                  ))}
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
