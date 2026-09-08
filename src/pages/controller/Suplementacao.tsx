import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, Input, CardSkeleton } from '../../components/ui'
import { exportToXLSX } from '../../utils/exportXLSX'
import { SUPLEMENTACAO_EXPORT_CONFIG } from '../../utils/exportConfigs'
import { formatDate } from '../../utils/formatDate'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

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
  const [searchTerm, setSearchTerm] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [dateSortOrder, setDateSortOrder] = useState<'asc' | 'desc'>('desc')
  const [loteDropdownOpen, setLoteDropdownOpen] = useState(false)
  const loteDropdownRef = useRef<HTMLDivElement>(null)

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
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Caderneta de Suplementação</h2>
      </div>

      <Card className="bg-white p-4 sm:p-6" disableHover>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
          <h3 className="text-base sm:text-lg font-semibold text-gray-800">Filtros</h3>
          <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4 w-full sm:w-auto">
            <Button
              onClick={() => {
              // Pre-computar data_anterior e intervalo_dias para cada registro
              // baseado na serie por lote_id ordenada por data ( independente da formulação)
              // Normaliza para meia-noite (YYYY-MM-DD) para que o intervalo conte dias de calendário,
              // independentemente do horário do registro (o campo data é timestamptz, não date).
              const toDateOnly = (dateStr: string) => new Date(dateStr.substring(0, 10))
              const sorted = [...filteredRegistros].sort((a, b) =>
                toDateOnly(a.data).getTime() - toDateOnly(b.data).getTime()
              )
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
                const dataAtual = toDateOnly(reg.data)
                const dataAnterior = prev ? toDateOnly(prev.data) : null
                const dataProximo = next ? toDateOnly(next.data) : null
                const intervalo = dataAnterior
                  ? Math.max(Math.round((dataAtual.getTime() - dataAnterior.getTime()) / (1000 * 60 * 60 * 24)), 0)
                  : null
                const intervaloAteProximo = dataProximo
                  ? Math.max(Math.round((dataProximo.getTime() - dataAtual.getTime()) / (1000 * 60 * 60 * 24)), 0)
                  : null
                return {
                  ...reg,
                  data_anterior: dataAnterior ? dataAnterior.toISOString() : null,
                  intervalo_dias: intervalo,
                  data_proximo: dataProximo ? dataProximo.toISOString() : null,
                  intervalo_ate_proximo_dias: intervaloAteProximo
                }
              })
              exportToXLSX(enriched, SUPLEMENTACAO_EXPORT_CONFIG)
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
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Lotes</label>
            <button
              type="button"
              onClick={() => setLoteDropdownOpen(!loteDropdownOpen)}
              className={`w-full px-3 sm:px-4 py-2.5 sm:py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary input-focus min-h-[44px] text-sm sm:text-base text-left bg-white flex items-center justify-between border-gray-300`}
            >
              <span className={lotesSelecionados.length === 0 ? 'text-gray-400' : 'text-gray-900'}>
                {lotesSelecionados.length === 0
                  ? 'Selecione os lotes'
                  : lotesSelecionados.length === 1
                    ? lotes.find((l) => l.id === lotesSelecionados[0])?.nome || '1 lote'
                    : `${lotesSelecionados.length} lotes selecionados`}
              </span>
              <svg className={`w-4 h-4 text-gray-400 transition-transform ${loteDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {loteDropdownOpen && (
              <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-auto">
                <button
                  type="button"
                  onClick={() => {
                    if (lotesSelecionados.length === lotes.length) {
                      setLotesSelecionados([])
                    } else {
                      setLotesSelecionados(lotes.map((l) => l.id))
                    }
                  }}
                  className="w-full px-3 py-2 text-left text-sm font-medium text-primary hover:bg-primary/10 border-b border-gray-100"
                >
                  {lotesSelecionados.length === lotes.length ? 'Desmarcar todos' : 'Selecionar todos'}
                </button>
                {lotes.map((l) => (
                  <label
                    key={l.id}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm"
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
                      className="w-4 h-4 rounded text-primary focus:ring-primary"
                    />
                    <span className="text-gray-700">{l.nome}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="sm:col-span-2 md:col-span-3">
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Buscar</label>
            <Input
              type="text"
              placeholder="Tratador, produto, lote, pasto, kg cocho, kg depósito..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="text-sm"
            />
          </div>
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Data Início</label>
            <Input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="text-sm"
            />
          </div>
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">Data Fim</label>
            <Input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">&nbsp;</label>
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
        <Card className="bg-white p-4 sm:p-6 text-center" disableHover>
          <p className="text-gray-600">Nenhum registro de suplementação encontrado</p>
        </Card>
      ) : filteredRegistros.length === 0 ? (
        <Card className="bg-white p-4 sm:p-6 text-center" disableHover>
          <p className="text-gray-600">Nenhum registro encontrado com os filtros aplicados</p>
        </Card>
      ) : (
        <>
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
                    <span className="text-xs sm:text-sm font-medium text-gray-500">Data:</span>
                    <span className="text-xs sm:text-sm font-semibold text-gray-800">
                      {formatDate(registro.data)}
                    </span>
                  </div>
                  <span
                    className="text-xs sm:text-sm px-2 py-1 rounded-full bg-primary/10 text-primary"
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
                    <span className="text-gray-500">Usuário:</span>
                    <span className="text-gray-800 font-medium">{registro.nome_usuario || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Tratador:</span>
                    <span className="text-gray-800 font-medium">{registro.tratador || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Formulação:</span>
                    <span className="text-gray-800 font-medium">{registro.formulacao || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Lote:</span>
                    <span className="text-gray-800 font-medium">{registro.lote || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Pasto:</span>
                    <span className="text-gray-800 font-medium">{registro.pasto || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">KG Cocho:</span>
                    <span className="text-gray-800 font-medium">{registro.kg_cocho || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">KG Depósito:</span>
                    <span className="text-gray-800 font-medium">{registro.kg_deposito || 0}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Desktop Table View */}
          <Card className="bg-white overflow-x-auto hidden sm:block" disableHover>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => setDateSortOrder(dateSortOrder === 'asc' ? 'desc' : 'asc')}
                  >
                    Data <span className="text-lg ml-1">{dateSortOrder === 'asc' ? '↑' : '↓'}</span>
                  </th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuário</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tratador</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Formulação</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lote</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pasto</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">KG Cocho</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">KG Depósito</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
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
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(registro.data)}
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-900">{registro.nome_usuario || '-'}</td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-900">
                        {registro.tratador || '-'}
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-900">
                        {registro.formulacao || '-'}
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-900">
                        {registro.lote || '-'}
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-900">
                        {registro.pasto || '-'}
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-900">
                        {registro.kg_cocho || 0}
                      </td>
                      <td className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-900">
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
