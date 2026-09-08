import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Card, DetailLayout, DetailSection, DetailField, formatValue } from '../../components/ui'
import { formatDate } from '../../utils/formatDate'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

interface RegistroMaternidade {
  id: string
  fazenda_id: string
  nome_usuario?: string
  data: string
  pasto?: string
  lote?: string
  peso_cria_kg?: number
  numero_cria?: string
  tratamento?: string
  tipo_parto?: string
  sexo?: string
  raca?: string
  numero_mae?: string
  categoria_mae?: string
  escore_matriz?: string
  id_brinco_mae?: string
  id_chip_mae?: string
  id_brinco_cria?: string
  id_chip_cria?: string
  id_provisorio_cria?: string
  individuo_id_cria?: string
  sync_status?: string
  created_at: string
  updated_at?: string
}

export function MaternidadeDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registro, setRegistro] = useState<RegistroMaternidade | null>(null)
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
      .from('registros_maternidade')
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
      setRegistro(data as RegistroMaternidade)
    }

    setLoading(false)
  }

  const backUrl = '/controller/cadernetas/maternidade'

  return (
    <DetailLayout
      loading={loading}
      loadError={loadError}
      notFound={!registro}
      onBack={() => navigate(backUrl)}
      title="Detalhes do Registro de Maternidade"
    >
      {() => (
      <Card className="bg-white p-4 sm:p-6 border-0 shadow-sm" disableHover>
        <div className="space-y-6">
          {/* Informações Gerais */}
          <DetailSection title="Informações Gerais">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DetailField label="Data" value={formatDate(registro!.data)} />
              <DetailField label="Usuário" value={formatValue(registro!.nome_usuario)} />
            </div>
          </DetailSection>

          {/* Localização */}
          <DetailSection title="Localização">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DetailField label="Lote" value={formatValue(registro!.lote)} />
              <DetailField label="Pasto" value={formatValue(registro!.pasto)} />
            </div>
          </DetailSection>

          {/* Informações dos Animais */}
          <DetailSection title="Informações dos Animais">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Mãe */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium text-gray-800 mb-3">Mãe</h4>
                <div className="space-y-2">
                  <DetailField label="Número" value={formatValue(registro!.numero_mae)} />
                  <DetailField label="ID Brinco" value={formatValue(registro!.id_brinco_mae)} />
                  <DetailField label="ID Chip" value={formatValue(registro!.id_chip_mae)} />
                  <DetailField label="Categoria" value={formatValue(registro!.categoria_mae)} />
                  <DetailField label="Raça" value={formatValue(registro!.raca)} />
                </div>
              </div>

              {/* Cria */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium text-gray-800 mb-3">Cria</h4>
                <div className="space-y-2">
                  <DetailField label="Número" value={formatValue(registro!.numero_cria)} />
                  <DetailField label="ID Provisório" value={formatValue(registro!.id_provisorio_cria)} />
                  <DetailField label="ID Brinco" value={formatValue(registro!.id_brinco_cria)} />
                  <DetailField label="ID Chip" value={formatValue(registro!.id_chip_cria)} />
                  <DetailField label="Sexo" value={formatValue(registro!.sexo)} />
                  <DetailField label="Peso (kg)" value={formatValue(registro!.peso_cria_kg)} />
                  {registro!.individuo_id_cria && (
                    <p className="text-sm pt-2 border-t border-gray-200 mt-2">
                      <span className="font-medium text-gray-700">Indivíduo:</span>{' '}
                      <button
                        onClick={() => navigate(`/controller/individuos/${registro!.individuo_id_cria}`)}
                        className="text-primary hover:underline font-medium"
                      >
                        Ver indivíduo
                      </button>
                    </p>
                  )}
                </div>
              </div>
            </div>
          </DetailSection>

          {/* Informações do Parto */}
          <DetailSection title="Informações do Parto" highlighted>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DetailField label="Tipo Parto" value={formatValue(registro!.tipo_parto)} />
              <DetailField label="Escore Matriz" value={formatValue(registro!.escore_matriz)} />
            </div>
            <div className="mt-3">
              <DetailField label="Tratamento" value={formatValue(registro!.tratamento)} />
            </div>
          </DetailSection>
        </div>
      </Card>
      )}
    </DetailLayout>
  )
}
