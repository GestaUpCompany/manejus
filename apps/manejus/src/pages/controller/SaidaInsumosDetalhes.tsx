import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Card, DetailLayout, DetailSection, DetailField, formatValue, Table, Thead, Tbody, Tr, Th, Td } from '@gestaup/ui'
import { formatDate } from '@gestaup/shared'
import { getFazendaIdForUser } from '@gestaup/shared'

interface SaidaInsumoItem {
  id: string
  quantidade: number
  insumo?: { nome: string } | null
}

function formatKg(value?: number | null) {
  if (value === null || value === undefined) return '-'
  return Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

interface RegistroSaidaInsumos {
  id: string
  fazenda_id: string
  data_producao: string
  dieta_produzida?: string | null
  destino_producao?: string | null
  total_produzido?: number | null
  formulacao?: { nome: string } | null
  insumos_quantidades?: any
  nome_usuario?: string | null
}

export function SaidaInsumosDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registro, setRegistro] = useState<RegistroSaidaInsumos | null>(null)
  const [itens, setItens] = useState<SaidaInsumoItem[]>([])
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
      .from('registros_saida_insumos')
      .select('*, formulacao:formulacoes(nome)')
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
      setLoading(false)
      return
    }

    setRegistro(data as RegistroSaidaInsumos)

    const { data: itensData, error: itensError } = await supabase
      .from('saida_insumos_itens')
      .select('*, insumo:insumos(nome)')
      .eq('saida_id', id)

    if (itensError) {
      console.error('Erro ao buscar insumos da produção:', itensError)
    } else {
      setItens((itensData as SaidaInsumoItem[]) || [])
    }

    setLoading(false)
  }

  return (
    <DetailLayout
      loading={loading}
      loadError={loadError}
      notFound={!registro}
      onBack={() => navigate('/controller/cadernetas/saida-insumos')}
      title="Detalhes da Produção Fábrica"
    >
      {() => (
        <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm" disableHover>
          <div className="space-y-6">
            <DetailSection title="Informações Gerais">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <DetailField label="Data" value={formatDate(registro!.data_producao)} />
                <DetailField label="Usuário" value={formatValue(registro!.nome_usuario)} />
                <DetailField label="Dieta Produzida" value={formatValue(registro!.dieta_produzida)} />
                <DetailField label="Formulação" value={formatValue(registro!.formulacao?.nome)} />
              </div>
            </DetailSection>

            <DetailSection title="Produção" highlighted>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailField label="Total Produzido (kg)" value={formatKg(registro!.total_produzido)} />
                <DetailField label="Destino" value={formatValue(registro!.destino_producao)} />
              </div>
            </DetailSection>

            {itens.length > 0 && (
              <DetailSection title={`Insumos Utilizados (${itens.length})`} highlighted>
                <div className="overflow-x-auto">
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>Insumo</Th>
                        <Th>Quantidade (kg)</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {itens.map((item) => (
                        <Tr key={item.id}>
                          <Td>{item.insumo?.nome || '-'}</Td>
                          <Td>{formatKg(item.quantidade)}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </div>
              </DetailSection>
            )}
          </div>
        </Card>
      )}
    </DetailLayout>
  )
}
