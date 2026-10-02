import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Card, DetailLayout, DetailSection, DetailField, formatValue } from '@gestaup/ui'
import { formatDateTime } from '@gestaup/shared'
import { getFazendaIdForUser } from '@gestaup/shared'

interface RegistroEntradaCantina {
  id: string
  fazenda_id: string
  data: string
  quem_recebeu?: string | null
  itens?: any[] | null
  itens_detalhe?: any[] | null
  observacao?: string | null
  nome_usuario?: string | null
}

const ITEM_LABELS: Record<string, string> = {
  nome: 'Item',
  classificacao: 'Classificação',
  quantidade: 'Quantidade',
  unidade: 'Unidade',
  unidade_medida: 'Unidade',
  observacao: 'Observação',
}

function isInternalKey(key: string): boolean {
  const k = key.replace(/[_-]/g, '').toLowerCase()
  return k === 'id' || k.endsWith('id') || k === 'novoitem'
}

function formatItemKey(key: string): string {
  if (ITEM_LABELS[key]) return ITEM_LABELS[key]
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (str) => str.toUpperCase())
}

function formatItemValue(value: any): string {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'number') return value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  return String(value)
}

function renderItens(itens: any): React.ReactNode {
  if (Array.isArray(itens)) {
    return (
      <div className="space-y-4">
        {itens.map((item: any, index: number) => (
          <div key={index} className="border-b border-border-base pb-3 last:border-0 last:pb-0">
            {typeof item === 'object' && item !== null ? (
              <div className="text-sm">
                {item.nome && <p className="font-semibold text-content-strong mb-1">{item.nome}</p>}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {Object.entries(item)
                    .filter(([key, value]) => !isInternalKey(key) && key !== 'nome' && value !== null && value !== undefined && value !== '')
                    .map(([key, value]) => (
                      <div key={key} className="flex flex-col">
                        <span className="font-medium text-content">{formatItemKey(key)}:</span>
                        <span className="text-content-strong">{formatItemValue(value)}</span>
                      </div>
                    ))}
                </div>
              </div>
            ) : (
              <p className="text-sm">{String(item)}</p>
            )}
          </div>
        ))}
      </div>
    )
  }
  return <p className="text-sm">{String(itens)}</p>
}

export function EntradaCantinaDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registro, setRegistro] = useState<RegistroEntradaCantina | null>(null)
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
      .from('registros_alimentacao')
      .select('*')
      .eq('id', id)
      .eq('fazenda_id', fazendaId)
      .eq('modo', 'entrada')
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
      setRegistro(data as RegistroEntradaCantina)
    }

    setLoading(false)
  }

  return (
    <DetailLayout
      loading={loading}
      loadError={loadError}
      notFound={!registro}
      onBack={() => navigate('/controller/cadernetas/entrada-cantina')}
      title="Detalhes da Entrada na Cantina"
    >
      {() => (
        <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm" disableHover>
          <div className="space-y-6">
            <DetailSection title="Informações Gerais">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <DetailField label="Data" value={formatDateTime(registro!.data)} />
                <DetailField label="Usuário" value={formatValue(registro!.nome_usuario)} />
                <DetailField label="Quem Recebeu" value={formatValue(registro!.quem_recebeu)} />
              </div>
            </DetailSection>

            {registro!.itens_detalhe && Array.isArray(registro!.itens_detalhe) && registro!.itens_detalhe.length > 0 && (
              <DetailSection title="Itens Recebidos" highlighted>
                {renderItens(registro!.itens_detalhe)}
              </DetailSection>
            )}

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
