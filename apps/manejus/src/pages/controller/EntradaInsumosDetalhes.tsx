import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Card, DetailLayout, DetailSection, DetailField, formatValue, Table, Thead, Tbody, Tr, Th, Td } from '@gestaup/ui'
import { formatDate } from '@gestaup/shared'
import { getFazendaIdForUser } from '@gestaup/shared'

interface EntradaInsumoItem {
  id: string
  produto?: string | null
  quantidade: number
  valor_unitario?: number | null
  valor_total?: number | null
  lote?: string | null
  validade?: string | null
  insumo?: { nome: string } | null
  formulacao?: { nome: string } | null
}

interface RegistroEntradaInsumos {
  id: string
  fazenda_id: string
  data_entrada: string
  horario?: string | null
  nota_fiscal?: string | null
  fornecedor?: string | null
  placa?: string | null
  motorista?: string | null
  responsavel_recebimento?: string | null
  nome_usuario?: string | null
}

function formatCurrency(value?: number | null) {
  if (value === null || value === undefined) return '-'
  return `R$ ${Number(value).toFixed(2).replace('.', ',')}`
}

export function EntradaInsumosDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registro, setRegistro] = useState<RegistroEntradaInsumos | null>(null)
  const [itens, setItens] = useState<EntradaInsumoItem[]>([])
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
      .from('registros_entrada_insumos')
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
      setLoading(false)
      return
    }

    setRegistro(data as RegistroEntradaInsumos)

    const { data: itensData, error: itensError } = await supabase
      .from('entrada_insumos_itens')
      .select('*, insumo:insumos(nome), formulacao:formulacoes(nome)')
      .eq('entrada_id', id)

    if (itensError) {
      console.error('Erro ao buscar itens da entrada:', itensError)
    } else {
      setItens((itensData as EntradaInsumoItem[]) || [])
    }

    setLoading(false)
  }

  return (
    <DetailLayout
      loading={loading}
      loadError={loadError}
      notFound={!registro}
      onBack={() => navigate('/controller/cadernetas/entrada-insumos')}
      title="Detalhes da Entrada de Insumos"
    >
      {() => (
        <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm" disableHover>
          <div className="space-y-6">
            <DetailSection title="Informações Gerais">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <DetailField label="Data" value={formatDate(registro!.data_entrada)} />
                <DetailField label="Horário" value={formatValue(registro!.horario)} />
                <DetailField label="Usuário" value={formatValue(registro!.nome_usuario)} />
                <DetailField label="Responsável Recebimento" value={formatValue(registro!.responsavel_recebimento)} />
              </div>
            </DetailSection>

            <DetailSection title="Documento e Transporte" highlighted>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <DetailField label="Nota Fiscal" value={formatValue(registro!.nota_fiscal)} />
                <DetailField label="Fornecedor" value={formatValue(registro!.fornecedor)} />
                <DetailField label="Placa" value={formatValue(registro!.placa)} />
                <DetailField label="Motorista" value={formatValue(registro!.motorista)} />
              </div>
            </DetailSection>

            {itens.length > 0 && (
              <DetailSection title={`Itens (${itens.length})`} highlighted>
                <div className="overflow-x-auto">
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>Produto</Th>
                        <Th>Quantidade</Th>
                        <Th>Valor Unit.</Th>
                        <Th>Valor Total</Th>
                        <Th>Lote</Th>
                        <Th>Validade</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {itens.map((item) => (
                        <Tr key={item.id}>
                          <Td>{item.insumo?.nome || item.formulacao?.nome || item.produto || '-'}</Td>
                          <Td>{Number(item.quantidade).toLocaleString('pt-BR')}</Td>
                          <Td>{formatCurrency(item.valor_unitario)}</Td>
                          <Td>{formatCurrency(item.valor_total)}</Td>
                          <Td>{item.lote || '-'}</Td>
                          <Td>{item.validade ? formatDate(item.validade) : '-'}</Td>
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
