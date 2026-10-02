import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Card, DetailLayout, DetailSection, DetailField, formatValue } from '@gestaup/ui'
import { formatDate } from '@gestaup/shared'
import { getFazendaIdForUser } from '@gestaup/shared'

interface EntradaCombustivelRegistro {
  id: string
  fazenda_id: string
  data: string
  quantidade_l: number
  valor_total?: number | null
  preco_por_litro?: number | null
  fornecedor?: string | null
  placa_veiculo?: string | null
  nome_motorista?: string | null
  nota_fiscal?: string | null
  observacao?: string | null
  tanque?: { nome: string; tipo_combustivel?: string } | null
}

function formatCurrency(value?: number | null) {
  if (value === null || value === undefined) return '-'
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatLitros(value?: number | null) {
  if (value === null || value === undefined) return '-'
  return `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} L`
}

export function EntradaCombustivelDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registro, setRegistro] = useState<EntradaCombustivelRegistro | null>(null)
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
      .from('movimentacoes_combustivel')
      .select('*, tanque:tanques_combustivel!movimentacoes_combustivel_tanque_id_fkey(nome, tipo_combustivel)')
      .eq('id', id)
      .eq('fazenda_id', fazendaId)
      .eq('tipo_movimentacao', 'entrada')
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        setRegistro(null)
      } else {
        console.error('Erro ao buscar registro:', error)
        setLoadError(error.message || 'Erro ao buscar registro')
      }
    } else {
      setRegistro(data as EntradaCombustivelRegistro)
    }

    setLoading(false)
  }

  return (
    <DetailLayout
      loading={loading}
      loadError={loadError}
      notFound={!registro}
      onBack={() => navigate('/controller/cadernetas/entrada-combustivel')}
      title="Detalhes da Entrada de Combustível"
    >
      {() => (
        <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm" disableHover>
          <div className="space-y-6">
            <DetailSection title="Informações Gerais">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <DetailField label="Data" value={formatDate(registro!.data)} />
                <DetailField label="Tanque" value={formatValue(registro!.tanque?.nome)} />
                <DetailField label="Tipo Combustível" value={formatValue(registro!.tanque?.tipo_combustivel)} />
                <DetailField label="Quantidade (L)" value={formatLitros(registro!.quantidade_l)} />
              </div>
            </DetailSection>

            <DetailSection title="Valores" highlighted>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DetailField label="Valor Total" value={formatCurrency(registro!.valor_total)} />
                <DetailField label="Preço por Litro" value={formatCurrency(registro!.preco_por_litro)} />
              </div>
            </DetailSection>

            <DetailSection title="Transporte" highlighted>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <DetailField label="Fornecedor" value={formatValue(registro!.fornecedor)} />
                <DetailField label="Placa do Veículo" value={formatValue(registro!.placa_veiculo)} />
                <DetailField label="Motorista" value={formatValue(registro!.nome_motorista)} />
                <DetailField label="Nota Fiscal" value={formatValue(registro!.nota_fiscal)} />
              </div>
            </DetailSection>

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
