import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Card, DetailLayout, DetailSection, DetailField, formatValue } from '../../components/ui'
import { formatDateTime } from '../../utils/formatDate'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

interface RegistroAlmoxarifado {
  id: string
  fazenda_id: string
  dispositivo_id?: string
  nome_usuario?: string
  data: string
  quem_entregou?: string
  quem_pegou?: string
  setor?: string
  observacao?: string
  itens?: any
  sync_status?: string
  created_at: string
  updated_at?: string
}

function formatItemKey(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())
}

function renderItens(itens: any): React.ReactNode {
  if (Array.isArray(itens)) {
    return (
      <div className="space-y-4">
        {itens.map((item: any, index: number) => (
          <div key={index} className="border-b border-gray-200 pb-3 last:border-0 last:pb-0">
            {typeof item === 'string' ? (
              <p className="text-sm">{item}</p>
            ) : typeof item === 'object' && item !== null ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                {Object.entries(item).map(([key, value]) => {
                  if (key === 'necessitaDevolucao' && item.prazoDevolucao) return null
                  return (
                    <div key={key} className="flex flex-col">
                      <span className="font-medium text-gray-700 capitalize">{formatItemKey(key)}:</span>
                      <span className="text-gray-900">{String(value)}</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm">{String(item)}</p>
            )}
          </div>
        ))}
      </div>
    )
  }
  if (typeof itens === 'object' && itens !== null) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        {Object.entries(itens).map(([key, value]) => {
          if (key === 'necessitaDevolucao' && itens.prazoDevolucao) return null
          return (
            <div key={key} className="flex flex-col">
              <span className="font-medium text-gray-700 capitalize">{formatItemKey(key)}:</span>
              <span className="text-gray-900">{String(value)}</span>
            </div>
          )
        })}
      </div>
    )
  }
  return <p className="text-sm">{String(itens)}</p>
}

export function AlmoxarifadoDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registro, setRegistro] = useState<RegistroAlmoxarifado | null>(null)
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
      .from('registros_almoxarifado')
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
      setRegistro(data as RegistroAlmoxarifado)
    }

    setLoading(false)
  }

  const backUrl = '/controller/cadernetas/almoxarifado'

  return (
    <DetailLayout
      loading={loading}
      loadError={loadError}
      notFound={!registro}
      onBack={() => navigate(backUrl)}
      title="Detalhes do Registro de Almoxarifado"
    >
      {() => (
        <Card className="bg-white p-4 sm:p-6 border-0 shadow-sm" disableHover>
          <div className="space-y-6">
            {/* Informações Gerais */}
            <DetailSection title="Informações Gerais">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailField label="Data" value={formatDateTime(registro!.data)} />
                <DetailField label="Usuário" value={formatValue(registro!.nome_usuario)} />
                <DetailField label="Setor" value={formatValue(registro!.setor)} />
              </div>
            </DetailSection>

            {/* Movimentação */}
            <DetailSection title="Movimentação" highlighted>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailField label="Quem Entregou" value={formatValue(registro!.quem_entregou)} />
                <DetailField label="Quem Pegou" value={formatValue(registro!.quem_pegou)} />
              </div>
            </DetailSection>

            {/* Itens */}
            {registro!.itens && (
              <DetailSection title="Itens" highlighted>
                {renderItens(registro!.itens)}
              </DetailSection>
            )}

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
