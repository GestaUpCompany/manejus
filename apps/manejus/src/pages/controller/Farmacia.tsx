import { useEffect, useMemo, useState } from 'react'
import { useAuth, getFazendaIdForUser, getFazendaNome } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Card, Input, EmptyState, PageSkeleton, Select, Table, Thead, Tbody, Tr, Th, Td, SearchInput, FilterToolbar, FilterField } from '@gestaup/ui'
import { ROTULO_ORIGEM, ROTULO_TIPO, sinalMovimento, valorDoMovimento, type TipoMovimentoFarmacia } from '../../features/estoqueFarmacia/logica'

interface RegistroFarmacia {
  id: string
  data: string
  tipo_movimentacao: TipoMovimentoFarmacia
  quantidade: number
  unidade: string | null
  custo_unitario: number | null
  valor_total: number | null
  origem: string | null
  fornecedor: string | null
  nota_fiscal: string | null
  lote_produto: string | null
  validade: string | null
  observacao: string | null
  nome_usuario: string | null
  created_at: string
  medicamentos: { nome_comercial: string; tipo: string; sku: string | null } | null
}

const dataBR = (iso: string) => iso.split('-').reverse().join('/')
const numero = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Entrada lista as entradas; Saída lista as baixas (PWA, Enfermaria) e estornos. Ajustes ficam no histórico do estoque.
const TIPOS_POR_MODO: Record<'entrada' | 'saida', TipoMovimentoFarmacia[]> = {
  entrada: ['entrada'],
  saida: ['baixa', 'estorno'],
}

export function Farmacia({ modo }: { modo: 'entrada' | 'saida' }) {
  const { user } = useAuth()
  const [registros, setRegistros] = useState<RegistroFarmacia[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [fazendaNome, setFazendaNome] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')

  useEffect(() => {
    if (!user) return
    ;(async () => {
      const fazendaId = await getFazendaIdForUser(user.id)
      if (!fazendaId) return setLoading(false)
      getFazendaNome(fazendaId).then(setFazendaNome)
      const { data, error } = await supabase
        .from('movimentacoes_farmacia')
        .select('id,data,tipo_movimentacao,quantidade,unidade,custo_unitario,valor_total,origem,fornecedor,nota_fiscal,lote_produto,validade,observacao,nome_usuario,created_at,medicamentos(nome_comercial,tipo,sku)')
        .eq('fazenda_id', fazendaId)
        .in('tipo_movimentacao', TIPOS_POR_MODO[modo])
        .is('deleted_at', null)
        .order('data', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(2000)
      if (error) setErro(error.message)
      else setRegistros((data as unknown as RegistroFarmacia[]) || [])
      setLoading(false)
    })()
  }, [user, modo])

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return registros.filter((r) => {
      const texto = [r.medicamentos?.nome_comercial, r.medicamentos?.sku, r.fornecedor, r.nota_fiscal, r.lote_produto, r.observacao, r.nome_usuario].filter(Boolean).join(' ').toLowerCase()
      return (!termo || texto.includes(termo)) && (!tipo || r.tipo_movimentacao === tipo) && (!dataInicio || r.data >= dataInicio) && (!dataFim || r.data <= dataFim)
    })
  }, [registros, busca, tipo, dataInicio, dataFim])

  if (loading) return <PageSkeleton variant="list" />

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-content-strong">{modo === 'entrada' ? 'Entradas da Farmácia' : 'Saídas da Farmácia'}</h2>
        {fazendaNome && <p className="text-sm text-content-muted">{fazendaNome}</p>}
      </div>

      {erro && <Card className="p-4 bg-red-500/10"><p className="text-sm text-red-700">{erro}</p></Card>}

      <FilterToolbar onClear={() => { setBusca(''); setTipo(''); setDataInicio(''); setDataFim('') }}>
        <FilterField label="Buscar" className="sm:col-span-2">
          <SearchInput value={busca} onChange={setBusca} placeholder="Medicamento, SKU, fornecedor, lote, nota..." className="text-sm" />
        </FilterField>
        <FilterField label="Tipo">
          <Select value={tipo} onChange={setTipo} placeholder="Todos" options={TIPOS_POR_MODO[modo].map((value) => ({ value, label: ROTULO_TIPO[value] }))} />
        </FilterField>
        <FilterField label="Data Início">
          <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="text-sm" />
        </FilterField>
        <FilterField label="Data Fim">
          <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="text-sm" />
        </FilterField>
      </FilterToolbar>

      {registros.length === 0 ? (
        <EmptyState title={modo === 'entrada' ? 'Nenhuma entrada da farmácia encontrada' : 'Nenhuma saída da farmácia encontrada'} />
      ) : filtrados.length === 0 ? (
        <EmptyState title="Nenhum registro encontrado" description="Nenhum registro encontrado com os filtros aplicados" />
      ) : (
        <Card className="bg-surface-1 overflow-x-auto" disableHover>
          <Table>
            <Thead>
              <Tr>
                <Th>Data</Th>
                <Th>Tipo</Th>
                <Th>Medicamento</Th>
                <Th>Quantidade</Th>
                <Th>Custo un.</Th>
                <Th>Valor</Th>
                <Th>Lote / Validade</Th>
                <Th>Fornecedor / NF</Th>
                <Th>Origem</Th>
                <Th>Usuário</Th>
              </Tr>
            </Thead>
            <Tbody>
              {filtrados.map((r) => {
                const { sinal, qtd } = sinalMovimento(r)
                return (
                  <Tr key={r.id}>
                    <Td>{dataBR(r.data)}</Td>
                    <Td>{ROTULO_TIPO[r.tipo_movimentacao] ?? r.tipo_movimentacao}</Td>
                    <Td>{r.medicamentos?.nome_comercial ?? '-'}{r.medicamentos?.sku && <span className="block text-xs text-content-muted">SKU {r.medicamentos.sku}</span>}</Td>
                    <Td className={sinal === '−' ? 'text-red-600' : ''}>{sinal} {numero(qtd)} {r.unidade ?? ''}</Td>
                    <Td>{r.custo_unitario == null ? '—' : moeda(Number(r.custo_unitario))}</Td>
                    <Td>{(() => { const v = valorDoMovimento(r); return v == null ? '—' : moeda(v) })()}</Td>
                    <Td>{[r.lote_produto, r.validade ? dataBR(r.validade) : null].filter(Boolean).join(' · ') || '-'}</Td>
                    <Td>{[r.fornecedor, r.nota_fiscal].filter(Boolean).join(' · ') || '-'}</Td>
                    <Td className="text-content-muted">{ROTULO_ORIGEM[r.origem ?? ''] ?? r.origem ?? 'Manual'}</Td>
                    <Td>{r.nome_usuario || '-'}</Td>
                  </Tr>
                )
              })}
            </Tbody>
          </Table>
        </Card>
      )}
    </div>
  )
}

export const FarmaciaEntradas = () => <Farmacia modo="entrada" />
export const FarmaciaSaidas = () => <Farmacia modo="saida" />
