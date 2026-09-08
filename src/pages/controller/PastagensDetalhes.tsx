import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Card, DetailLayout, DetailSection, DetailField, formatValue } from '../../components/ui'
import { formatDate } from '../../utils/formatDate'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

interface RegistroPastagens {
  id: string
  fazenda_id: string
  dispositivo_id?: string
  nome_usuario?: string
  data: string
  manejador?: string
  lote?: string
  pasto_saida?: string
  avaliacao_saida?: number
  pasto_saida_area_util?: string
  pasto_saida_especie?: string
  pasto_entrada?: string
  avaliacao_entrada?: number
  pasto_entrada_area_util?: string
  pasto_entrada_especie?: string
  vaca?: number
  touro?: number
  bezerro?: number
  boi_magro?: number
  garrote?: number
  novilha?: number
  escore_gado?: number
  sync_status?: string
  created_at: string
  updated_at?: string
}

export function PastagensDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registro, setRegistro] = useState<RegistroPastagens | null>(null)
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
      .from('registros_pastagens')
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
      setRegistro(data as RegistroPastagens)
    }

    setLoading(false)
  }

  const backUrl = '/controller/cadernetas/pastagens'

  const totalAnimais = (registro?.vaca || 0) + (registro?.touro || 0) + (registro?.bezerro || 0) + (registro?.boi_magro || 0) + (registro?.garrote || 0) + (registro?.novilha || 0)

  return (
    <DetailLayout
      loading={loading}
      loadError={loadError}
      notFound={!registro}
      onBack={() => navigate(backUrl)}
      title="Detalhes do Registro de Pastagens"
    >
      {() => (
        <Card className="bg-white p-4 sm:p-6 border-0 shadow-sm" disableHover>
          <div className="space-y-6">
            {/* Informações Gerais */}
            <DetailSection title="Informações Gerais">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <DetailField label="Data" value={formatDate(registro!.data)} />
                <DetailField label="Usuário" value={formatValue(registro!.nome_usuario)} />
                <DetailField label="Manejador" value={formatValue(registro!.manejador)} />
                <DetailField label="Lote" value={formatValue(registro!.lote)} />
              </div>
            </DetailSection>

            {/* Movimentação de Pasto */}
            <DetailSection title="Movimentação de Pasto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Pasto Saída */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium text-gray-800 mb-3">Pasto Saída</h4>
                  <div className="space-y-2">
                    <DetailField label="Pasto" value={formatValue(registro!.pasto_saida)} />
                    <DetailField label="Área Útil" value={formatValue(registro!.pasto_saida_area_util)} />
                    <DetailField label="Espécie" value={formatValue(registro!.pasto_saida_especie)} />
                    <DetailField label="Avaliação" value={formatValue(registro!.avaliacao_saida)} />
                  </div>
                </div>

                {/* Pasto Entrada */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium text-gray-800 mb-3">Pasto Entrada</h4>
                  <div className="space-y-2">
                    <DetailField label="Pasto" value={formatValue(registro!.pasto_entrada)} />
                    <DetailField label="Área Útil" value={formatValue(registro!.pasto_entrada_area_util)} />
                    <DetailField label="Espécie" value={formatValue(registro!.pasto_entrada_especie)} />
                    <DetailField label="Avaliação" value={formatValue(registro!.avaliacao_entrada)} />
                  </div>
                </div>
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
                    <tr><td className="px-4 py-2 text-sm text-gray-900">Boi Magro</td><td className="px-4 py-2 text-sm text-gray-900 text-right">{registro!.boi_magro || 0}</td></tr>
                    <tr><td className="px-4 py-2 text-sm text-gray-900">Garrote</td><td className="px-4 py-2 text-sm text-gray-900 text-right">{registro!.garrote || 0}</td></tr>
                    <tr><td className="px-4 py-2 text-sm text-gray-900">Novilha</td><td className="px-4 py-2 text-sm text-gray-900 text-right">{registro!.novilha || 0}</td></tr>
                    <tr className="bg-gray-50 font-bold">
                      <td className="px-4 py-2 text-sm text-gray-900">Total</td>
                      <td className="px-4 py-2 text-sm text-gray-900 text-right">{totalAnimais}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="mt-4">
                <DetailField label="Escore Gado" value={formatValue(registro!.escore_gado)} />
              </div>
            </DetailSection>
          </div>
        </Card>
      )}
    </DetailLayout>
  )
}
