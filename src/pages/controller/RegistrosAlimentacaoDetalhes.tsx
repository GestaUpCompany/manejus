import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Card, DetailLayout, DetailSection, DetailField, formatValue } from '../../components/ui'
import { formatDateTime } from '../../utils/formatDate'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

interface RegistroAlimentacao {
  id: string
  fazenda_id: string
  dispositivo_id?: string
  data: string
  modo?: string
  numero_cozinheiras?: number
  quem_cozinhou?: string
  quem_ajudou?: string
  numero_cafe_manha?: number
  numero_lanches?: number
  numero_refeicoes_almoco?: number
  numero_refeicoes_jantar?: number
  fornecedor?: string
  quantidade_marmitas?: number
  preco_unitario?: number
  destinatario?: string
  itens?: any[]
  observacao?: string
  nome_usuario?: string
  sync_status?: string
  version?: number
  created_at: string
  updated_at: string
  deleted_at?: string
}

export function RegistrosAlimentacaoDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registro, setRegistro] = useState<RegistroAlimentacao | null>(null)
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
      setRegistro(data as RegistroAlimentacao)
    }

    setLoading(false)
  }

  const backUrl = '/controller/cadernetas/alimentacao'

  return (
    <DetailLayout
      loading={loading}
      loadError={loadError}
      notFound={!registro}
      onBack={() => navigate(backUrl)}
      title="Detalhes do Registro de Alimentação"
    >
      {() => (
        <Card className="bg-white p-4 sm:p-6 border-0 shadow-sm" disableHover>
          <div className="space-y-6">
            {/* Badge do modo */}
            {registro!.modo && (
              <div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  registro!.modo === 'marmita'
                    ? 'bg-orange-100 text-orange-700'
                    : 'bg-blue-100 text-blue-700'
                }`}>
                  {registro!.modo === 'marmita' ? 'Marmita' : 'Cantina'}
                </span>
              </div>
            )}

            {registro!.modo === 'marmita' ? (
              <>
                {/* Informações da Marmita */}
                <DetailSection title="Informações Gerais">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <DetailField label="Data" value={formatDateTime(registro!.data)} />
                    <DetailField label="Usuário" value={formatValue(registro!.nome_usuario)} />
                    <DetailField label="Fornecedor" value={formatValue(registro!.fornecedor)} />
                    <DetailField label="Destinatário" value={formatValue(registro!.destinatario)} />
                  </div>
                </DetailSection>

                {/* Detalhes da Marmita */}
                <DetailSection title="Detalhes" highlighted>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <DetailField label="Qtd. Marmitas" value={formatValue(registro!.quantidade_marmitas)} />
                    <DetailField label="Preço Unit." value={registro!.preco_unitario ? `R$ ${Number(registro!.preco_unitario).toFixed(2).replace('.', ',')}` : '-'} />
                    <DetailField label="Valor Total" value={(registro!.quantidade_marmitas && registro!.preco_unitario) ? `R$ ${(registro!.quantidade_marmitas * Number(registro!.preco_unitario)).toFixed(2).replace('.', ',')}` : '-'} />
                  </div>
                </DetailSection>
              </>
            ) : (
              <>
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
              </>
            )}

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
