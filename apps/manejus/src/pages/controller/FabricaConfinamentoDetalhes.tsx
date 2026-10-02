import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Card, DetailLayout, DetailSection, DetailField, formatValue, Table, Thead, Tbody, Tr, Th, Td } from '@gestaup/ui'
import { formatDate } from '@gestaup/shared'
import { getFazendaIdForUser } from '@gestaup/shared'

interface FabricaInsumoItem {
  id: string
  kg_previsto: number
  kg_produzido: number
  ordem: number
  insumo?: { nome: string } | null
}

function formatKg(value?: number | null) {
  if (value === null || value === undefined) return '-'
  return Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

interface RegistroFabricaConfinamento {
  id: string
  fazenda_id: string
  data: string
  ordem_trato: number
  tipo: string
  total_previsto: number
  total_produzido: number
  concluido: boolean
  vagao?: { nome: string | null; marca: string; modelo: string; capacidade_kg: number | null } | null
  formulacao?: { nome: string } | null
  nome_usuario?: string | null
}

export function FabricaConfinamentoDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registro, setRegistro] = useState<RegistroFabricaConfinamento | null>(null)
  const [insumos, setInsumos] = useState<FabricaInsumoItem[]>([])
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
      .from('registros_fabrica_confinamento')
      .select('*, vagao:vagoes(nome, marca, modelo, capacidade_kg), formulacao:formulacoes(nome)')
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

    setRegistro(data as RegistroFabricaConfinamento)

    const { data: insumosData, error: insumosError } = await supabase
      .from('registros_fabrica_confinamento_insumos')
      .select('*, insumo:insumos(nome)')
      .eq('registro_id', id)
      .order('ordem', { ascending: true })

    if (insumosError) {
      console.error('Erro ao buscar insumos do carregamento:', insumosError)
    } else {
      setInsumos((insumosData as FabricaInsumoItem[]) || [])
    }

    setLoading(false)
  }

  const vagaoLabel = registro?.vagao
    ? (registro.vagao.nome || `${registro.vagao.marca} ${registro.vagao.modelo}`.trim())
    : null

  return (
    <DetailLayout
      loading={loading}
      loadError={loadError}
      notFound={!registro}
      onBack={() => navigate('/controller/cadernetas/fabrica-confinamento')}
      title="Detalhes do Carregamento de Vagão"
    >
      {() => (
        <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm" disableHover>
          <div className="space-y-6">
            <DetailSection title="Informações Gerais">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <DetailField label="Data" value={formatDate(registro!.data)} />
                <DetailField label="Usuário" value={formatValue(registro!.nome_usuario)} />
                <DetailField label="Ordem do Trato" value={`${registro!.ordem_trato}º`} />
                <DetailField label="Tipo" value={formatValue(registro!.tipo)} />
              </div>
            </DetailSection>

            <DetailSection title="Vagão e Formulação" highlighted>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <DetailField label="Vagão" value={formatValue(vagaoLabel)} />
                <DetailField label="Capacidade (kg)" value={formatKg(registro!.vagao?.capacidade_kg)} />
                <DetailField label="Formulação" value={formatValue(registro!.formulacao?.nome)} />
              </div>
            </DetailSection>

            <DetailSection title="Produção" highlighted>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <DetailField label="Total Previsto (kg)" value={formatKg(registro!.total_previsto)} />
                <DetailField label="Total Produzido (kg)" value={formatKg(registro!.total_produzido)} />
                <DetailField label="Status" value={registro!.concluido ? 'Concluído' : 'Em aberto'} />
              </div>
            </DetailSection>

            {insumos.length > 0 && (
              <DetailSection title={`Insumos (${insumos.length})`} highlighted>
                <div className="overflow-x-auto">
                  <Table>
                    <Thead>
                      <Tr>
                        <Th>#</Th>
                        <Th>Insumo</Th>
                        <Th>Previsto (kg)</Th>
                        <Th>Produzido (kg)</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {insumos.map((item) => (
                        <Tr key={item.id}>
                          <Td>{item.ordem}</Td>
                          <Td>{item.insumo?.nome || '-'}</Td>
                          <Td>{formatKg(item.kg_previsto)}</Td>
                          <Td>{formatKg(item.kg_produzido)}</Td>
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
