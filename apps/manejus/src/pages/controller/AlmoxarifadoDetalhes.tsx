import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Card, DetailLayout, DetailSection, DetailField, formatValue } from '@gestaup/ui'
import { formatDateTime } from '@gestaup/shared'
import { getFazendaIdForUser } from '@gestaup/shared'

interface RegistroAlmoxarifado {
  id: string
  fazenda_id: string
  dispositivo_id?: string
  nome_usuario?: string
  data: string
  quem_entregou?: string
  quem_pegou?: string
  quem_recebeu?: string
  tipo?: 'retirada' | 'devolucao' | 'entrada'
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

const TIPO_LABEL: Record<string, string> = { retirada: 'Retirada', devolucao: 'Devolução', entrada: 'Entrada' }

// Campos técnicos do jsonb que não interessam a quem lê o registro
const CAMPOS_OCULTOS = new Set(['itemId', 'retiradaId', 'retiradaItemIndex', 'saldoAtual', 'quantidadePendente', 'setor', 'novoItem'])

// Item no formato atual (nome + quantidade): linha legível em vez de chaves cruas
function renderItemLegivel(item: any, tipo?: string): React.ReactNode {
  const unidade = item.unidade && item.unidade !== 'un' ? ` ${item.unidade}` : ''
  const mostraDevolucao = tipo !== 'devolucao' && tipo !== 'entrada' && item.necessitaDevolucao
  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold text-content-strong">{item.nome}</span>
        <span className="text-content-strong">{String(item.quantidade ?? '-')}{unidade}</span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-content-muted">
        {item.classificacao && item.classificacao !== 'Pendentes' && <span>Classificação: {item.classificacao}</span>}
        {mostraDevolucao && (
          <span>{item.necessitaDevolucao === 'S' ? `Volta${item.prazoDevolucao ? ` até ${item.prazoDevolucao}` : ''}` : 'Fica'}</span>
        )}
        {item.observacao && <span>Obs: {item.observacao}</span>}
      </div>
    </div>
  )
}

function renderItens(itens: any, tipo?: string): React.ReactNode {
  if (Array.isArray(itens)) {
    return (
      <div className="space-y-4">
        {itens.map((item: any, index: number) => (
          <div key={index} className="border-b border-border-base pb-3 last:border-0 last:pb-0">
            {typeof item === 'string' ? (
              <p className="text-sm">{item}</p>
            ) : typeof item === 'object' && item !== null && item.nome ? (
              renderItemLegivel(item, tipo)
            ) : typeof item === 'object' && item !== null ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                {Object.entries(item).map(([key, value]) => {
                  if (CAMPOS_OCULTOS.has(key)) return null
                  if (key === 'necessitaDevolucao' && item.prazoDevolucao) return null
                  return (
                    <div key={key} className="flex flex-col">
                      <span className="font-medium text-content capitalize">{formatItemKey(key)}:</span>
                      <span className="text-content-strong">{String(value)}</span>
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
              <span className="font-medium text-content capitalize">{formatItemKey(key)}:</span>
              <span className="text-content-strong">{String(value)}</span>
            </div>
          )
        })}
      </div>
    )
  }
  return <p className="text-sm">{String(itens)}</p>
}

// Registros novos trazem setor no registro; antigos só dentro dos itens
function setorDe(registro: RegistroAlmoxarifado): string {
  if (registro.setor) return registro.setor
  if (Array.isArray(registro.itens)) {
    const item = registro.itens.find((i: any) => i && typeof i === 'object' && i.setor)
    if (item) return String(item.setor)
  }
  return ''
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
        <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm" disableHover>
          <div className="space-y-6">
            {/* Informações Gerais */}
            <DetailSection title="Informações Gerais">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailField label="Data" value={formatDateTime(registro!.data)} />
                <DetailField label="Usuário" value={formatValue(registro!.nome_usuario)} />
                <DetailField label="Tipo" value={TIPO_LABEL[registro!.tipo || 'retirada'] || '-'} />
                <DetailField label="Setor" value={formatValue(setorDe(registro!))} />
              </div>
            </DetailSection>

            {/* Movimentação */}
            <DetailSection title="Movimentação" highlighted>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailField label="Quem Entregou" value={formatValue(registro!.quem_entregou)} />
                <DetailField label="Quem Pegou" value={formatValue(registro!.quem_pegou)} />
                <DetailField label="Quem Recebeu" value={formatValue(registro!.quem_recebeu)} />
              </div>
            </DetailSection>

            {/* Itens */}
            {registro!.itens && (
              <DetailSection title="Itens" highlighted>
                {renderItens(registro!.itens, registro!.tipo)}
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
