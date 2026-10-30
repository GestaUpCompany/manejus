import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Card, Input, EmptyState, PageSkeleton, Table, Thead, Tbody, Tr, Th, Td, SearchInput, FilterToolbar, FilterField } from '@gestaup/ui'
import { exportToXLSXMultiSheet } from '@gestaup/shared'
import { TRATO_CONFINAMENTO_EXPORT_CONFIG, CONSUMO_CONFINAMENTO_EXPORT_CONFIG } from '../../utils/exportConfigs'
import { formatDate, formatDateTime, toFarmDateOnly } from '@gestaup/shared'
import { getFazendaIdForUser, getFazendaNome } from '@gestaup/shared'
import { RelatorioListaImpressao } from '../../components/RelatorioListaImpressao'

interface RegistroTrato {
  id: string
  fazenda_id: string
  data: string
  ordem_trato: number
  kg_planejado?: number | null
  kg_ofertado_real?: number | null
  leitura_cocho_nota?: number | null
  origem: string
  curral?: { nome: string } | null
  lote?: { nome: string } | null
  nome_usuario?: string | null
  created_at: string
  curral_id?: string | null
  lote_id?: string | null
}

interface ConsumoDia {
  lote_id: string
  data: string
  n_currais: number
  n_tratos: number
  kg_ofertado_mn: number
  kg_consumido_mn: number
  fator_consumo: number
  leitura_confirmada: boolean
  consumo_piso: boolean
  n_cabecas: number | null
  peso_vivo_kg: number | null
  kg_mn_cab_dia: number | null
  kg_ms_cab_dia: number | null
  consumo_percent_pv: number | null
  custo_reais_cab_dia: number | null
  fora_faixa_pv: boolean
}

interface OcupacaoCurral {
  curral_id: string
  lote_id: string
  data_inicial: string
  data_final: string | null
}

function statusConsumo(c: ConsumoDia): string {
  if (!c.leitura_confirmada) return 'Provisório (sem leitura de cocho no dia seguinte)'
  return c.consumo_piso ? 'Confirmado (piso: nota ≤ 0)' : 'Confirmado'
}

export function TratoConfinamento() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registros, setRegistros] = useState<RegistroTrato[]>([])
  const [loading, setLoading] = useState(true)
  const [fazendaNome, setFazendaNome] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [dateSortOrder, setDateSortOrder] = useState<'asc' | 'desc'>('desc')
  const [consumos, setConsumos] = useState<ConsumoDia[]>([])
  const [ocupacoes, setOcupacoes] = useState<OcupacaoCurral[]>([])
  const [lotesNomes, setLotesNomes] = useState<Record<string, string>>({})

  useEffect(() => {
    loadRegistros()
  }, [user])

  const loadRegistros = async () => {
    if (!user) return

    const fazendaId = await getFazendaIdForUser(user.id)
    if (!fazendaId) return

    getFazendaNome(fazendaId).then(setFazendaNome)

    const { data, error } = await supabase
      .from('registros_oferta_trato')
      .select('*, curral:currais(nome), lote:lotes(nome)')
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)
      .order('data', { ascending: false })
      .order('ordem_trato', { ascending: true })

    if (error) {
      console.error('Erro ao buscar tratos:', error)
    } else {
      setRegistros(data as RegistroTrato[])
    }

    // Dados de apoio da exportação: consumo por lote/dia, ocupação de currais (para tratos sem lote_id) e nomes dos lotes
    const [consumoRes, ocupRes, lotesRes] = await Promise.all([
      supabase
        .from('consumo_confinamento_dia')
        .select('lote_id, data, n_currais, n_tratos, kg_ofertado_mn, kg_consumido_mn, fator_consumo, leitura_confirmada, consumo_piso, n_cabecas, peso_vivo_kg, kg_mn_cab_dia, kg_ms_cab_dia, consumo_percent_pv, custo_reais_cab_dia, fora_faixa_pv')
        .eq('fazenda_id', fazendaId)
        .order('data', { ascending: false }),
      supabase
        .from('lote_curral_historico')
        .select('curral_id, lote_id, data_inicial, data_final')
        .eq('fazenda_id', fazendaId),
      supabase.from('lotes').select('id, nome').eq('fazenda_id', fazendaId),
    ])
    if (consumoRes.error) console.error('Erro ao buscar consumo do confinamento:', consumoRes.error)
    else setConsumos((consumoRes.data || []) as ConsumoDia[])
    if (ocupRes.error) console.error('Erro ao buscar ocupação de currais:', ocupRes.error)
    else setOcupacoes((ocupRes.data || []) as OcupacaoCurral[])
    if (!lotesRes.error) {
      setLotesNomes(Object.fromEntries((lotesRes.data || []).map((l) => [l.id, l.nome])))
    }

    setLoading(false)
  }

  const filteredRegistros = registros.filter((registro) => {
    const search = searchTerm.toLowerCase()
    const matchesSearch =
      (registro.curral?.nome && registro.curral.nome.toLowerCase().includes(search)) ||
      (registro.lote?.nome && registro.lote.nome.toLowerCase().includes(search)) ||
      (registro.origem && registro.origem.toLowerCase().includes(search)) ||
      (registro.nome_usuario && registro.nome_usuario.toLowerCase().includes(search))

    const matchesDataInicio = !dataInicio || registro.data >= dataInicio
    const matchesDataFim = !dataFim || registro.data <= dataFim

    return matchesSearch && matchesDataInicio && matchesDataFim
  }).sort((a, b) => {
    const dateA = new Date(a.data)
    const dateB = new Date(b.data)
    return dateSortOrder === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime()
  })

  if (loading) {
    return <PageSkeleton variant="list" />
  }

  const handleExport = () => {
    const consumoPorLoteDia = new Map(consumos.map((c) => [`${c.lote_id}::${c.data}`, c]))

    // Mesma regra do banco: lote do trato, ou lote que ocupava o curral na data
    const loteDoTrato = (r: RegistroTrato, dia: string): string | null => {
      if (r.lote_id) return r.lote_id
      if (!r.curral_id) return null
      const ocup = ocupacoes
        .filter((o) => o.curral_id === r.curral_id && o.data_inicial <= dia && (!o.data_final || o.data_final >= dia))
        .sort((a, b) => b.data_inicial.localeCompare(a.data_inicial))[0]
      return ocup?.lote_id ?? null
    }

    const loteDiasVisiveis = new Set<string>()
    const tratos = filteredRegistros.map((r) => {
      const dia = toFarmDateOnly(r.data) || ''
      const loteId = loteDoTrato(r, dia)
      const c = loteId ? consumoPorLoteDia.get(`${loteId}::${dia}`) : undefined
      if (loteId && c) loteDiasVisiveis.add(`${loteId}::${dia}`)
      return {
        ...r,
        consumo_status: c ? statusConsumo(c) : '',
        consumo_kg_consumido_mn: c?.kg_consumido_mn,
        consumo_n_cabecas: c?.n_cabecas,
        consumo_peso_vivo_kg: c?.peso_vivo_kg,
        consumo_kg_mn_cab_dia: c?.kg_mn_cab_dia,
        consumo_kg_ms_cab_dia: c?.kg_ms_cab_dia,
        consumo_percent_pv: c?.consumo_percent_pv,
        consumo_custo_reais_cab_dia: c?.custo_reais_cab_dia,
      }
    })

    const consumoDiario = consumos
      .filter((c) => loteDiasVisiveis.has(`${c.lote_id}::${c.data}`))
      .sort((a, b) => b.data.localeCompare(a.data) || (lotesNomes[a.lote_id] || '').localeCompare(lotesNomes[b.lote_id] || ''))
      .map((c) => ({
        data: c.data,
        lote_nome: lotesNomes[c.lote_id] || '',
        status: statusConsumo(c),
        n_currais: c.n_currais,
        n_tratos: c.n_tratos,
        kg_ofertado_mn: c.kg_ofertado_mn,
        kg_consumido_mn: c.kg_consumido_mn,
        fator_consumo: c.fator_consumo,
        n_cabecas: c.n_cabecas,
        peso_vivo_kg: c.peso_vivo_kg,
        kg_mn_cab_dia: c.kg_mn_cab_dia,
        kg_ms_cab_dia: c.kg_ms_cab_dia,
        consumo_percent_pv: c.consumo_percent_pv,
        custo_reais_cab_dia: c.custo_reais_cab_dia,
        fora_faixa_pv: c.fora_faixa_pv,
      }))

    exportToXLSXMultiSheet(
      {
        tableName: TRATO_CONFINAMENTO_EXPORT_CONFIG.tableName,
        sheets: [
          { data: tratos, config: TRATO_CONFINAMENTO_EXPORT_CONFIG },
          { data: consumoDiario, config: CONSUMO_CONFINAMENTO_EXPORT_CONFIG },
        ],
      },
      fazendaNome,
    )
  }

  const fmtKg = (n?: number | null) => (n != null ? Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '-')
  const somaKg = (campo: 'kg_planejado' | 'kg_ofertado_real') =>
    fmtKg(filteredRegistros.reduce((s, r) => s + Number(r[campo] || 0), 0))
  const periodoImpressao = [
    dataInicio || dataFim ? `Período: ${dataInicio ? formatDate(dataInicio) : '…'} a ${dataFim ? formatDate(dataFim) : '…'}` : 'Todos os períodos',
    searchTerm ? `Busca: ${searchTerm}` : '',
  ].filter(Boolean).join(' · ')
  const linhasImpressao = filteredRegistros.map((r) => [
    formatDateTime(r.data),
    r.nome_usuario || '-',
    r.curral?.nome || '-',
    r.lote?.nome || '-',
    `${r.ordem_trato}º`,
    fmtKg(r.kg_planejado),
    fmtKg(r.kg_ofertado_real),
    String(r.leitura_cocho_nota ?? '-'),
  ])

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-xl sm:text-2xl font-bold text-content-strong">Caderneta de Trato</h2>
      </div>

      <FilterToolbar
        onExport={handleExport}
        exportDisabled={filteredRegistros.length === 0}
        onPrint={() => window.print()}
        printDisabled={filteredRegistros.length === 0}
        onClear={() => {
          setSearchTerm('')
          setDataInicio('')
          setDataFim('')
        }}
      >
        <FilterField label="Buscar" className="sm:col-span-2">
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Curral, lote, usuário..."
            className="text-sm"
          />
        </FilterField>
        <FilterField label="Data Início">
          <Input
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            className="text-sm"
          />
        </FilterField>
        <FilterField label="Data Fim">
          <Input
            type="date"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            className="text-sm"
          />
        </FilterField>
      </FilterToolbar>

      {registros.length === 0 ? (
        <EmptyState title="Nenhum trato encontrado" />
      ) : filteredRegistros.length === 0 ? (
        <EmptyState title="Nenhum registro encontrado" description="Nenhum registro encontrado com os filtros aplicados" />
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="sm:hidden space-y-3">
            {filteredRegistros.map((registro) => (
              <Card
                key={registro.id}
                className="p-4"
                onClick={() => navigate(`/controller/cadernetas/trato-confinamento/${registro.id}`)}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-medium text-content-muted">Data:</span>
                    <span className="text-xs sm:text-sm font-semibold text-content-strong">
                      {formatDateTime(registro.data)}
                    </span>
                  </div>
                  <span
                    className="text-xs sm:text-sm px-2 py-1 rounded-full bg-primary/10 text-primary dark:text-primary-light"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDateSortOrder(dateSortOrder === 'asc' ? 'desc' : 'asc')
                    }}
                  >
                    {dateSortOrder === 'asc' ? '↑' : '↓'}
                  </span>
                </div>
                <div className="space-y-2 text-xs sm:text-sm">
                  <div className="flex justify-between">
                    <span className="text-content-muted">Curral:</span>
                    <span className="text-content-strong font-medium">{registro.curral?.nome || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Lote:</span>
                    <span className="text-content-strong font-medium">{registro.lote?.nome || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Trato:</span>
                    <span className="text-content-strong font-medium">{registro.ordem_trato}º</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Ofertado:</span>
                    <span className="text-content-strong font-medium">
                      {registro.kg_ofertado_real != null ? `${Number(registro.kg_ofertado_real).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg` : '-'}
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Desktop Table View */}
          <Card className="bg-surface-1 overflow-x-auto hidden sm:block" disableHover>
            <Table>
              <Thead>
                <Tr>
                  <Th
                    className="cursor-pointer hover:bg-surface-2 transition-colors"
                    onClick={() => setDateSortOrder(dateSortOrder === 'asc' ? 'desc' : 'asc')}
                  >
                    Data <span className="text-lg ml-1">{dateSortOrder === 'asc' ? '↑' : '↓'}</span>
                  </Th>
                  <Th>Usuário</Th>
                  <Th>Curral</Th>
                  <Th>Lote</Th>
                  <Th>Trato</Th>
                  <Th>Planejado (kg)</Th>
                  <Th>Ofertado (kg)</Th>
                  <Th>Nota Cocho</Th>
                </Tr>
              </Thead>
              <Tbody>
                {filteredRegistros.map((registro) => (
                  <Tr
                    key={registro.id}
                    onClick={() => navigate(`/controller/cadernetas/trato-confinamento/${registro.id}`)}
                    className="cursor-pointer"
                  >
                    <Td>{formatDateTime(registro.data)}</Td>
                    <Td>{registro.nome_usuario || '-'}</Td>
                    <Td>{registro.curral?.nome || '-'}</Td>
                    <Td>{registro.lote?.nome || '-'}</Td>
                    <Td>{registro.ordem_trato}º</Td>
                    <Td>{registro.kg_planejado != null ? Number(registro.kg_planejado).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '-'}</Td>
                    <Td>{registro.kg_ofertado_real != null ? Number(registro.kg_ofertado_real).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '-'}</Td>
                    <Td>{registro.leitura_cocho_nota ?? '-'}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Card>
          <RelatorioListaImpressao
            titulo="Caderneta de Trato"
            fazendaNome={fazendaNome}
            periodo={periodoImpressao}
            colunas={[
              { titulo: 'Data' },
              { titulo: 'Usuário' },
              { titulo: 'Curral' },
              { titulo: 'Lote' },
              { titulo: 'Trato' },
              { titulo: 'Planejado (kg)', alinhamento: 'right' },
              { titulo: 'Ofertado (kg)', alinhamento: 'right' },
              { titulo: 'Nota Cocho', alinhamento: 'center' },
            ]}
            linhas={linhasImpressao}
            rodape={['Total', '', '', '', '', somaKg('kg_planejado'), somaKg('kg_ofertado_real'), '']}
          />
        </>
      )}
    </div>
  )
}
