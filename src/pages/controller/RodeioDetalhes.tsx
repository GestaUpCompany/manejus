import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Card, DetailLayout, DetailSection, DetailField, formatValue } from '../../components/ui'
import { formatDate } from '../../utils/formatDate'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

interface RegistroRodeio {
  id: string
  fazenda_id: string
  dispositivo_id?: string
  nome_usuario?: string
  data: string
  pasto?: string
  lote?: string
  vaca?: number
  touro?: number
  bezerro?: number
  boi?: number
  garrote?: number
  novilha?: number
  total_cabecas?: number
  escore_fezes?: number
  escore_gado?: number
  equipe?: number
  diagnosticos?: any
  sync_status?: string
  created_at: string
  updated_at?: string
}

function formatProblemKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim()
}

export function RodeioDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registro, setRegistro] = useState<RegistroRodeio | null>(null)
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
      .from('registros_rodeio')
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
      setRegistro(data as RegistroRodeio)
    }

    setLoading(false)
  }

  const backUrl = '/controller/cadernetas/rodeio'

  const problemas = registro?.diagnosticos
    ? Object.keys(registro.diagnosticos).filter(key => registro.diagnosticos[key]).map(formatProblemKey)
    : []

  return (
    <DetailLayout
      loading={loading}
      loadError={loadError}
      notFound={!registro}
      onBack={() => navigate(backUrl)}
      title="Detalhes do Registro de Rodeio"
    >
      {() => (
        <Card className="bg-white p-4 sm:p-6 border-0 shadow-sm" disableHover>
          <div className="space-y-6">
            {/* Informações Gerais */}
            <DetailSection title="Informações Gerais">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <DetailField label="Data" value={formatDate(registro!.data)} />
                <DetailField label="Usuário" value={formatValue(registro!.nome_usuario)} />
                <DetailField label="Pasto" value={formatValue(registro!.pasto)} />
                <DetailField label="Lote" value={formatValue(registro!.lote)} />
              </div>
            </DetailSection>

            {/* Contagem de Animais */}
            <DetailSection title="Contagem de Animais">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Categoria</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Quantidade</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    <tr><td className="px-4 py-2 text-sm text-gray-900">Vaca</td><td className="px-4 py-2 text-sm text-gray-900 text-right">{registro!.vaca || 0}</td></tr>
                    <tr><td className="px-4 py-2 text-sm text-gray-900">Touro</td><td className="px-4 py-2 text-sm text-gray-900 text-right">{registro!.touro || 0}</td></tr>
                    <tr><td className="px-4 py-2 text-sm text-gray-900">Bezerro</td><td className="px-4 py-2 text-sm text-gray-900 text-right">{registro!.bezerro || 0}</td></tr>
                    <tr><td className="px-4 py-2 text-sm text-gray-900">Boi</td><td className="px-4 py-2 text-sm text-gray-900 text-right">{registro!.boi || 0}</td></tr>
                    <tr><td className="px-4 py-2 text-sm text-gray-900">Garrote</td><td className="px-4 py-2 text-sm text-gray-900 text-right">{registro!.garrote || 0}</td></tr>
                    <tr><td className="px-4 py-2 text-sm text-gray-900">Novilha</td><td className="px-4 py-2 text-sm text-gray-900 text-right">{registro!.novilha || 0}</td></tr>
                    {registro!.total_cabecas !== undefined && (
                      <tr className="bg-gray-50 font-bold">
                        <td className="px-4 py-2 text-sm text-gray-900">Total Cabeças</td>
                        <td className="px-4 py-2 text-sm text-gray-900 text-right">{registro!.total_cabecas}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </DetailSection>

            {/* Indicadores */}
            <DetailSection title="Indicadores" highlighted>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <DetailField label="Escore Fezes" value={formatValue(registro!.escore_fezes)} />
                <DetailField label="Escore Gado" value={formatValue(registro!.escore_gado)} />
                <DetailField label="Equipe" value={registro!.equipe ?? 0} />
              </div>
            </DetailSection>

            {/* Problemas Identificados */}
            <DetailSection title="Problemas Identificados" highlighted>
              <DetailField label="Problemas" value={problemas.length > 0 ? problemas.join(', ') : 'Nenhum'} />
            </DetailSection>
          </div>
        </Card>
      )}
    </DetailLayout>
  )
}
