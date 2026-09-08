import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Card, DetailLayout, DetailSection, DetailField, formatValue } from '../../components/ui'
import { formatDate } from '../../utils/formatDate'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

interface RegistroLimpeza {
  id: string
  fazenda_id: string
  dispositivo_id?: string
  data: string
  numero_equipe?: number
  setor?: string
  local?: string
  hora_inicio?: string
  hora_final?: string
  limpeza_realizada?: any
  observacao?: string
  nome_usuario?: string
  sync_status?: string
  version?: number
  created_at: string
  updated_at: string
  deleted_at?: string
}

function renderLimpezaRealizada(val: any): React.ReactNode {
  if (Array.isArray(val)) {
    return <p className="text-sm font-medium text-gray-700">{val.map((item: string) => item.charAt(0).toUpperCase() + item.slice(1)).join(', ')}</p>
  }
  if (val && typeof val === 'object') {
    const lista = val.limpezaRealizada || val.tarefasRealizadas || []
    const detalhes = val.tarefas
    return (
      <>
        {Array.isArray(lista) && lista.length > 0 && (
          <p className="text-sm font-medium text-gray-700">{lista.map((item: string) => item.charAt(0).toUpperCase() + item.slice(1)).join(', ')}</p>
        )}
        {detalhes && typeof detalhes === 'object' && Object.keys(detalhes).length > 0 && (
          <div className="border-t pt-2 mt-2 space-y-1">
            {Object.entries(detalhes).map(([k, v]) => (
              <p key={k} className="text-sm text-gray-600"><span className="font-medium capitalize">{k.replace(/_/g, ' ')}:</span> {String(v)}</p>
            ))}
          </div>
        )}
      </>
    )
  }
  return <p className="text-sm text-gray-700">{String(val)}</p>
}

export function RegistrosLimpezaDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registro, setRegistro] = useState<RegistroLimpeza | null>(null)
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
      .from('registros_limpeza')
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
      setRegistro(data as RegistroLimpeza)
    }

    setLoading(false)
  }

  const backUrl = '/controller/cadernetas/limpeza'

  return (
    <DetailLayout
      loading={loading}
      loadError={loadError}
      notFound={!registro}
      onBack={() => navigate(backUrl)}
      title="Detalhes do Registro de Limpeza"
    >
      {() => (
        <Card className="bg-white p-4 sm:p-6 border-0 shadow-sm" disableHover>
          <div className="space-y-6">
            {/* Informações Gerais */}
            <DetailSection title="Informações Gerais">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <DetailField label="Data" value={formatDate(registro!.data)} />
                <DetailField label="Usuário" value={formatValue(registro!.nome_usuario)} />
                <DetailField label="Nº Equipe" value={formatValue(registro!.numero_equipe)} />
                <DetailField label="Setor" value={formatValue(registro!.setor)} />
                <DetailField label="Local" value={formatValue(registro!.local)} />
              </div>
            </DetailSection>

            {/* Horários */}
            <DetailSection title="Horários" highlighted>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailField label="Hora Início" value={formatValue(registro!.hora_inicio)} />
                <DetailField label="Hora Final" value={formatValue(registro!.hora_final)} />
              </div>
            </DetailSection>

            {/* Limpeza Realizada */}
            {registro!.limpeza_realizada && (
              <DetailSection title="Limpeza Realizada" highlighted>
                {renderLimpezaRealizada(registro!.limpeza_realizada)}
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
