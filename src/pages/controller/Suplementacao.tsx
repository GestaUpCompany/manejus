import { useEffect, useState, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, Input, CardSkeleton } from '../../components/ui'
import { exportToXLSX } from '../../utils/exportXLSX'
import { SUPLEMENTACAO_EXPORT_CONFIG } from '../../utils/exportConfigs'
import { formatDate, toFarmDateOnly } from '../../utils/formatDate'
import { getFazendaIdForUser, getFazendaNome } from '../../utils/fazendaContext'

interface RegistroSuplementacao {
  id: string
  fazenda_id: string
  dispositivo_id?: string
  nome_usuario?: string
  data: string
  tratador?: string
  pasto?: string
  lote?: string
  lote_id?: string
  formulacao?: string
  gado?: string
  vaca?: boolean
  touro?: boolean
  bezerro?: boolean
  boi?: boolean
  garrote?: boolean
  novilha?: boolean
  leitura?: number
  kg_cocho?: number
  kg_deposito?: number
  creep?: number
  n_cabecas?: number
  qtd_bezerros?: number
  peso_vivo_kg?: number
  consumo_medio_geral_kg_mn?: number
  consumo_medio_geral_kg_ms?: number
  consumo_medio_geral_percent_pv?: number
  custo_medio_reais_cab_dia?: number
  sync_status?: string
  created_at: string
}

export function Suplementacao() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registros, setRegistros] = useState<RegistroSuplementacao[]>([])
  const [lotes, setLotes] = useState<{ id: string; nome: string }[]>([])
  const [lotesSelecionados, setLotesSelecionados] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [fazendaNome, setFazendaNome] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [dateSortOrder, setDateSortOrder] = useState<'asc' | 'desc'>('desc')
  const [loteDropdownOpen, setLoteDropdownOpen] = useState(false)
  const loteDropdownRef = useRef<HTMLDivElement>(null)
  const [composicoesFormulacoes, setComposicoesFormulacoes] = useState<Record<string, { nome: string; mn_percent: number }[]>>({})

  useEffect(() => {
    loadRegistros()
    loadLotes()
  }, [user])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (loteDropdownRef.current && !loteDropdownRef.current.contains(e.target as Node)) {
        setLoteDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const loadLotes = async () => {
    if (!user) return
    const _fazendaId = await getFazendaIdForUser(user.id)
    if (!_fazendaId) return

    const { data, error } = await supabase
      .from('lotes')
      .select('id, nome')
      .eq('fazenda_id', _fazendaId)
      .eq('ativo', true)
      .order('nome', { ascending: true })

    if (error) {
      console.error('Erro ao carregar lotes:', error)
    } else {
      setLotes(data || [])
    }
  }

  const loadRegistros = async () => {
    if (!user) return

    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) return

    const fazendaId = vinculos[0].fazenda_id
    getFazendaNome(fazendaId).then(setFazendaNome)

    let query = supabase
      .from('registros_suplementacao')
      .select('*')
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })

    const { data, error } = await query

    if (error) {
      console.error('Erro ao buscar registros de suplementação:', error)
    } else {
      setRegistros(data as RegistroSuplementacao[])
    }

    // Carregar composição de insumos de todas as formulações da fazenda
    const { data: formRows } = await supabase
      .from('formulacoes')
      .select('id, nome')
      .eq('fazenda_id', fazendaId)

    const composicoes: Record<string, { nome: string; mn_percent: number }[]> = {}

    if (formRows && formRows.length > 0) {
      const formIds = formRows.map(f => f.id)
      const { data: insumoRows } = await supabase
        .from('formulacao_insumos')
        .select('formulacao_id, formula_teor_ms, insumos!inner(nome, teor_ms)')
        .in('formulacao_id', formIds)

      if (insumoRows) {
        const porForm: Record<string, { nome: string; teor_ms: number; formula_teor_ms: number }[]> = {}
        for (const row of insumoRows as unknown as {
          formulacao_id: string
          formula_teor_ms: number
          insumos: { nome: string; teor_ms: number }
        }[]) {
          if (!porForm[row.formulacao_id]) porForm[row.formulacao_id] = []
          porForm[row.formulacao_id].push({
            nome: row.insumos.nome,
            teor_ms: row.insumos.teor_ms || 0,
            formula_teor_ms: row.formula_teor_ms || 0,
          })
        }

        for (const f of formRows) {
          const insumos = porForm[f.id]
          if (!insumos || insumos.length === 0) continue
          let totalBruta = 0
          const brutas = insumos.map(i => {
            const bruta = i.teor_ms > 0 ? i.formula_teor_ms / (i.teor_ms / 100) : 0
            totalBruta += bruta
            return { nome: i.nome, bruta }
          })
          composicoes[f.nome] = totalBruta > 0
            ? brutas.map(b => ({ nome: b.nome, mn_percent: (b.bruta / totalBruta) * 100 }))
            : []
        }
      }
    }

    setComposicoesFormulacoes(composicoes)

    setLoading(false)
  }

  const filteredRegistros = registros.filter((registro) => {
    const matchesLote = lotesSelecionados.length === 0 || lotesSelecionados.includes(registro.lote_id || '')

    const matchesSearch =
      !searchTerm ||
      (registro.tratador && registro.tratador.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (registro.lote && registro.lote.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (registro.pasto && registro.pasto.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (registro.formulacao && registro.formulacao.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (registro.kg_cocho && registro.kg_cocho.toString().includes(searchTerm.toLowerCase())) ||
      (registro.kg_deposito && registro.kg_deposito.toString().includes(searchTerm.toLowerCase())) ||
      (registro.nome_usuario && registro.nome_usuario.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesDataInicio = !dataInicio || new Date(registro.data) >= new Date(dataInicio)
    const matchesDataFim = !dataFim || new Date(registro.data) <= new Date(dataFim + 'T23:59:59')

    return matchesLote && matchesSearch && matchesDataInicio && matchesDataFim
  }).sort((a, b) => {
    const dateA = new Date(a.data)
    const dateB = new Date(b.data)
    return dateSortOrder === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime()
  })

  // Somatória de kg_cocho por lote dentro do período filtrado
  const totalKgCocho = filteredRegistros.reduce((soma, reg) => soma + (reg.kg_cocho || 0), 0)
  const totalKgCochoPorLote = new Map<string, number>()
  for (const reg of filteredRegistros) {
    const key = reg.lote_id || ''
    totalKgCochoPorLote.set(key, (totalKgCochoPorLote.get(key) || 0) + (reg.kg_cocho || 0))
  }

  // Kg por insumo: distribui kg_cocho de cada registro entre os insumos da sua formulação
  const kgPorInsumo = useMemo(() => {
    const acumulado: Record<string, number> = {}
    for (const reg of filteredRegistros) {
      const kg = reg.kg_cocho || 0
      if (!kg || !reg.formulacao) continue
      const comp = composicoesFormulacoes[reg.formulacao]
      if (!comp || comp.length === 0) continue
      for (const ins of comp) {
        const kgInsumo = kg * (ins.mn_percent / 100)
        acumulado[ins.nome] = (acumulado[ins.nome] || 0) + kgInsumo
      }
    }
    return acumulado
  }, [filteredRegistros, composicoesFormulacoes])

  // Acumulado cumulativo por lote: para cada registro, a soma de todos os registros
  // do mesmo lote até aquela data (em ordem cronológica ascendente)
  const acumuladoPorRegistro = new Map<string, number>()
  const registrosPorLoteAsc = new Map<string, typeof filteredRegistros>()
  for (const reg of filteredRegistros) {
    const key = reg.lote_id || ''
    if (!registrosPorLoteAsc.has(key)) registrosPorLoteAsc.set(key, [])
    registrosPorLoteAsc.get(key)!.push(reg)
  }
  for (const [, lista] of registrosPorLoteAsc) {
    // Ordena por data ascendente para calcular o cumulativo
    const ordenado = [...lista].sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())
    let acumulado = 0
    for (const reg of ordenado) {
      acumulado += reg.kg_cocho || 0
      acumuladoPorRegistro.set(reg.id, acumulado)
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-xl sm:text-2xl font-bold text-content-strong">Caderneta de Suplementação</h2>
      </div>

      <Card className="bg-surface-1 p-4 sm:p-6" disableHover>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
          <h3 className="text-base sm:text-lg font-semibold text-content-strong">Filtros</h3>
          <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4 w-full sm:w-auto">
            <Button
              onClick={() => {
              // Pre-computar data_anterior e intervalo_dias para cada registro
              // baseado na serie por lote_id ordenada por data ( independente da formulação)
              // Ordena pelo timestamp completo para que registros do mesmo dia fiquem em
              // ordem cronológica real, e normaliza para o dia de calendário no fuso da
              // fazenda (YYYY-MM-DD) para que o intervalo conte dias locais e o formatDate
              // exiba a data sem conversão de fuso (o campo data é timestamptz, não date).
              const DAY_MS = 1000 * 60 * 60 * 24
              const sorted = [...filteredRegistros].sort((a, b) => {
                const diff = new Date(a.data).getTime() - new Date(b.data).getTime()
                return diff !== 0 ? diff : new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              })
              const seriesMap = new Map<string, typeof sorted>()
              for (const reg of sorted) {
                const key = reg.lote_id || ''
                if (!seriesMap.has(key)) seriesMap.set(key, [])
                seriesMap.get(key)!.push(reg)
              }
              const enriched = sorted.map((reg) => {
                const key = reg.lote_id || ''
                const series = seriesMap.get(key)!
                const idx = series.indexOf(reg)
                const prev = idx > 0 ? series[idx - 1] : null
                const next = idx < series.length - 1 ? series[idx + 1] : null
                const dataAtual = toFarmDateOnly(reg.data)
                const dataAnterior = prev ? toFarmDateOnly(prev.data) : null
                const dataProximo = next ? toFarmDateOnly(next.data) : null
                const intervalo = dataAtual && dataAnterior
                  ? Math.max(Math.round((new Date(dataAtual).getTime() - new Date(dataAnterior).getTime()) / DAY_MS), 0)
                  : null
                const intervaloAteProximo = dataAtual && dataProximo
                  ? Math.max(Math.round((new Date(dataProximo).getTime() - new Date(dataAtual).getTime()) / DAY_MS), 0)
                  : null
                return {
                  ...reg,
                  data_anterior: dataAnterior,
                  intervalo_dias: intervalo,
                  data_proximo: dataProximo,
                  intervalo_ate_proximo_dias: intervaloAteProximo,
                  total_acumulado_lote: acumuladoPorRegistro.get(reg.id) || 0
                }
              })
              exportToXLSX(enriched, SUPLEMENTACAO_EXPORT_CONFIG, fazendaNome)
            }}
            disabled={filteredRegistros.length === 0}
            className="w-full sm:w-auto text-sm"
          >
            Exportar XLSX
          </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div ref={loteDropdownRef} className="relative">
            <label className="block text-xs sm:text-sm font-medium text-content mb-1 leading-tight line-clamp-2">Lotes</label>
            <button
              type="button"
              onClick={() => setLoteDropdownOpen(!loteDropdownOpen)}
              className={`w-full px-3 sm:px-4 py-2.5 sm:py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary input-focus min-h-[44px] text-sm sm:text-base text-left bg-surface-1 flex items-center justify-between border-surface-3`}
            >
              <span className={lotesSelecionados.length === 0 ? 'text-content-faint' : 'text-content-strong'}>
                {lotesSelecionados.length === 0
                  ? 'Selecione os lotes'
                  : lotesSelecionados.length === 1
                    ? lotes.find((l) => l.id === lotesSelecionados[0])?.nome || '1 lote'
                    : `${lotesSelecionados.length} lotes selecionados`}
              </span>
              <svg className={`w-4 h-4 text-content-faint transition-transform ${loteDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {loteDropdownOpen && (
              <div className="absolute z-50 mt-1 w-full bg-surface-1 border border-border-base rounded-lg shadow-xl max-h-60 overflow-auto">
                <button
                  type="button"
                  onClick={() => {
                    if (lotesSelecionados.length === lotes.length) {
                      setLotesSelecionados([])
                    } else {
                      setLotesSelecionados(lotes.map((l) => l.id))
                    }
                  }}
                  className="w-full px-3 py-2 text-left text-sm font-medium text-primary dark:text-primary-light hover:bg-primary/10 border-b border-border-subtle"
                >
                  {lotesSelecionados.length === lotes.length ? 'Desmarcar todos' : 'Selecionar todos'}
                </button>
                {lotes.map((l) => (
                  <label
                    key={l.id}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-surface-2 cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={lotesSelecionados.includes(l.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setLotesSelecionados([...lotesSelecionados, l.id])
                        } else {
                          setLotesSelecionados(lotesSelecionados.filter((id) => id !== l.id))
                        }
                      }}
                      className="w-4 h-4 rounded text-primary dark:text-primary-light focus:ring-primary"
                    />
                    <span className="text-content">{l.nome}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="sm:col-span-2 md:col-span-3">
            <label className="block text-xs sm:text-sm font-medium text-content mb-1 leading-tight line-clamp-2">Buscar</label>
            <Input
              type="text"
              placeholder="Tratador, produto, lote, pasto, kg cocho, kg depósito..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="text-sm"
            />
          </div>
          <div>
            <label className="block text-xs sm:text-sm font-medium text-content mb-1 leading-tight line-clamp-2">Data Início</label>
            <Input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="text-sm"
            />
          </div>
          <div>
            <label className="block text-xs sm:text-sm font-medium text-content mb-1 leading-tight line-clamp-2">Data Fim</label>
            <Input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs sm:text-sm font-medium text-content mb-1 leading-tight line-clamp-2">&nbsp;</label>
            <Button variant="secondary" onClick={() => {
              setSearchTerm('')
              setDataInicio('')
              setDataFim('')
              setLotesSelecionados([])
            }} className="w-full sm:w-auto text-sm">
              Limpar Filtros
            </Button>
          </div>
        </div>
      </Card>

      {registros.length === 0 ? (
        <Card className="bg-surface-1 p-4 sm:p-6 text-center" disableHover>
          <p className="text-content-muted">Nenhum registro de suplementação encontrado</p>
        </Card>
      ) : filteredRegistros.length === 0 ? (
        <Card className="bg-surface-1 p-4 sm:p-6 text-center" disableHover>
          <p className="text-content-muted">Nenhum registro encontrado com os filtros aplicados</p>
        </Card>
      ) : (
        <>
          {/* Card de somatória de kg_cocho no período filtrado */}
          <Card className="bg-surface-1 p-4 sm:p-6" disableHover>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-xs sm:text-sm font-medium text-content-muted uppercase tracking-wide">Total suplementado no período</p>
                <p className="text-2xl sm:text-3xl font-bold text-content-strong mt-1">
                  {totalKgCocho.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
                </p>
                <p className="text-xs text-content-muted mt-1">
                  {filteredRegistros.length} registro(s) {lotesSelecionados.length > 0 ? `· ${lotesSelecionados.length} lote(s)` : '· todos os lotes'}
                </p>
              </div>
              {lotesSelecionados.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {lotesSelecionados.map((loteId) => {
                    const lote = lotes.find((l) => l.id === loteId)
                    const total = totalKgCochoPorLote.get(loteId) || 0
                    return (
                      <div key={loteId} className="rounded-lg bg-primary/10 px-3 py-2 text-sm">
                        <span className="font-medium text-primary dark:text-primary-light">{lote?.nome || '—'}:</span>{' '}
                        <span className="font-bold text-content-strong">{total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            {Object.keys(kgPorInsumo).length > 0 && (
              <div className="mt-4 pt-4 border-t border-border-subtle">
                <p className="text-xs sm:text-sm font-medium text-content-muted uppercase tracking-wide mb-2">Total por insumo</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(kgPorInsumo).sort((a, b) => b[1] - a[1]).map(([nome, kg]) => (
                    <div key={nome} className="rounded-lg bg-surface-2 border border-border-base px-3 py-2 text-sm">
                      <span className="font-medium text-content">{nome}:</span>{' '}
                      <span className="font-bold text-content-strong">{kg.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Mobile Card View */}
          <div className="sm:hidden space-y-3">
            {filteredRegistros
              .filter((registro) => registro.id)
              .map((registro) => (
              <Card
                key={registro.id}
                className="p-4"
                onClick={() => navigate(`/controller/cadernetas/suplementacao/${registro.id}`)}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-medium text-content-muted">Data:</span>
                    <span className="text-xs sm:text-sm font-semibold text-content-strong">
                      {formatDate(registro.data)}
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
                    <span className="text-content-muted">Usuário:</span>
                    <span className="text-content-strong font-medium">{registro.nome_usuario || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Tratador:</span>
                    <span className="text-content-strong font-medium">{registro.tratador || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Formulação:</span>
                    <span className="text-content-strong font-medium">{registro.formulacao || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Lote:</span>
                    <span className="text-content-strong font-medium">{registro.lote || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Pasto:</span>
                    <span className="text-content-strong font-medium">{registro.pasto || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">KG Cocho:</span>
                    <span className="text-content-strong font-medium">{registro.kg_cocho || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">Acumulado Lote:</span>
                    <span className="text-primary dark:text-primary-light font-semibold">{(acumuladoPorRegistro.get(registro.id) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-content-muted">KG Depósito:</span>
                    <span className="text-content-strong font-medium">{registro.kg_deposito || 0}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Desktop Table View */}
          <Card className="bg-surface-1 overflow-x-auto hidden sm:block" disableHover>
            <table className="min-w-full divide-y divide-border-base">
              <thead className="bg-surface-2">
                <tr>
                  <th
                    className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider cursor-pointer hover:bg-surface-2 transition-colors"
                    onClick={() => setDateSortOrder(dateSortOrder === 'asc' ? 'desc' : 'asc')}
                  >
                    Data <span className="text-lg ml-1">{dateSortOrder === 'asc' ? '↑' : '↓'}</span>
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Usuário</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Tratador</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Formulação</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Lote</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Pasto</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">KG Cocho</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">Acumulado Lote</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">KG Depósito</th>
                </tr>
              </thead>
              <tbody className="bg-surface-1 divide-y divide-border-base">
                {filteredRegistros
                  .filter((registro) => registro.id)
                  .map((registro) => {
                  const categorias = []
                  if (registro.vaca) categorias.push('Vaca')
                  if (registro.touro) categorias.push('Touro')
                  if (registro.bezerro) categorias.push('Bezerro')
                  if (registro.boi) categorias.push('Boi')
                  if (registro.garrote) categorias.push('Garrote')
                  if (registro.novilha) categorias.push('Novilha')

                  return (
                    <tr
                      key={registro.id}
                      onClick={() => navigate(`/controller/cadernetas/suplementacao/${registro.id}`)}
                      className="cursor-pointer hover:bg-surface-2 transition-colors"
                    >
                      <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong">
                        {formatDate(registro.data)}
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong">{registro.nome_usuario || '-'}</td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong">
                        {registro.tratador || '-'}
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong">
                        {registro.formulacao || '-'}
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong">
                        {registro.lote || '-'}
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong">
                        {registro.pasto || '-'}
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong">
                        {registro.kg_cocho || 0}
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm font-semibold text-primary dark:text-primary-light">
                        {(acumuladoPorRegistro.get(registro.id) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong">
                        {registro.kg_deposito || 0}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}

    </div>
  )
}
