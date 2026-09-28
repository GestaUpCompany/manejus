import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../services/supabaseClient'
import { Card, DatePresets, Pagination } from '../../components/ui'

interface AuditEntry {
  id: number
  createdAt: string
  usuarioId: string | null
  usuarioEmail: string | null
  usuarioNome: string | null
  fazendaId: string | null
  fazendaNome: string | null
  tabela: string
  operacao: string
  registroId: string | null
  valorAnterior: Record<string, unknown> | null
  valorNovo: Record<string, unknown> | null
  alteracoes: Record<string, [unknown, unknown]> | null
  isImpersonation: boolean
  impersonatedBy: string | null
  ipAddress: string | null
  userAgent: string | null
  sourceApp: string | null
  originPage: string | null
  transactionId: number | null
  isSoftDelete: boolean
  batchSize: number | null
}

interface AuditLogResponse {
  entries: AuditEntry[]
  total: number
  tabelasAuditadas: { tabela: string; count: number }[]
}

const OPERACOES = ['INSERT', 'UPDATE', 'DELETE'] as const

function operacaoColor(op: string): string {
  switch (op) {
    case 'INSERT': return 'bg-green-100 text-green-700'
    case 'UPDATE': return 'bg-blue-100 text-blue-700'
    case 'DELETE': return 'bg-red-100 text-red-700'
    default: return 'bg-gray-100 text-gray-700'
  }
}

function operacaoLabel(op: string): string {
  switch (op) {
    case 'INSERT': return 'Criação'
    case 'UPDATE': return 'Alteração'
    case 'DELETE': return 'Exclusão'
    default: return op
  }
}

function tabelaLabel(tabela: string): string {
  const map: Record<string, string> = {
    lotes: 'Lotes',
    individuos: 'Indivíduos',
    registros_suplementacao: 'Reg. Suplementação',
    registros_maternidade: 'Reg. Maternidade',
    registros_enfermaria: 'Reg. Enfermaria',
    registros_morte: 'Reg. Morte',
    registros_movimentacao: 'Reg. Movimentação',
    registros_leitura_cocho: 'Reg. Leitura Cocho',
    registros_alimentacao: 'Reg. Alimentação',
    registros_abastecimento: 'Reg. Abastecimento',
    planos_nutricionais: 'Planos Nutricionais',
    formulacoes: 'Formulações',
    fazendas: 'Fazendas',
    usuarios: 'Usuários',
    usuario_fazenda: 'Vínculo Usuário-Fazenda',
    lote_categorias: 'Categorias do Lote',
    currais: 'Currais',
    pastos: 'Pastos',
    programacao_tratos: 'Configuração de Tratos',
    funcionarios: 'Funcionários',
    tratamentos: 'Tratamentos',
  }
  return map[tabela] || tabela
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'string') return val.length > 80 ? val.slice(0, 80) + '...' : val
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  return JSON.stringify(val).slice(0, 80)
}

function exportCSV(entries: AuditEntry[]) {
  const headers = ['Data', 'Usuário', 'Email', 'Fazenda', 'Tabela', 'Operação', 'Registro ID', 'Impersonação', 'Campos Alterados']
  const rows = entries.map((e) => [
    new Date(e.createdAt).toLocaleString('pt-BR'),
    e.usuarioNome || 'Sistema',
    e.usuarioEmail || '',
    e.fazendaNome || '',
    e.tabela,
    e.operacao,
    e.registroId || '',
    e.isImpersonation ? 'Sim' : 'Não',
    e.alteracoes ? Object.keys(e.alteracoes).join('; ') : '',
  ])
  const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `auditoria_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function AuditLog() {
  const [data, setData] = useState<AuditLogResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const pageSize = 50

  // Filtros
  const [filtroFazenda, setFiltroFazenda] = useState<string>('')
  const [filtroTabela, setFiltroTabela] = useState<string>('')
  const [filtroOperacao, setFiltroOperacao] = useState<string>('')
  const [filtroDataInicio, setFiltroDataInicio] = useState<string>('')
  const [filtroDataFim, setFiltroDataFim] = useState<string>('')
  const [presetData, setPresetData] = useState<string>('30d')
  const [filtroUsuario, setFiltroUsuario] = useState<string>('')
  const [apenasImpersonacao, setApenasImpersonacao] = useState<boolean>(false)
  const [buscaUsuario, setBuscaUsuario] = useState<string>('')

  // Detalhe expandido
  const [expandedId, setExpandedId] = useState<number | null>(null)

  // Listas para filtros
  const [fazendas, setFazendas] = useState<{ id: string; nome: string }[]>([])
  const [usuarios, setUsuarios] = useState<{ id: string; nome: string; email: string }[]>([])

  const fetchFazendas = useCallback(async () => {
    const { data: result } = await supabase
      .from('fazendas')
      .select('id, nome')
      .order('nome')
    if (result) setFazendas(result)
  }, [])

  const fetchUsuarios = useCallback(async () => {
    const { data: result } = await supabase
      .from('usuarios')
      .select('id, nome, email')
      .order('nome')
    if (result) setUsuarios(result)
  }, [])

  const applyPreset = useCallback((preset: string) => {
    setPresetData(preset)
    if (preset === '24h') {
      const d = new Date(Date.now() - 24 * 60 * 60 * 1000)
      setFiltroDataInicio(d.toISOString().slice(0, 10))
      setFiltroDataFim('')
    } else if (preset === '7d') {
      const d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      setFiltroDataInicio(d.toISOString().slice(0, 10))
      setFiltroDataFim('')
    } else if (preset === '30d') {
      const d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      setFiltroDataInicio(d.toISOString().slice(0, 10))
      setFiltroDataFim('')
    }
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, unknown> = {
        p_limite: pageSize,
        p_offset: page * pageSize,
      }
      if (filtroFazenda) params.p_fazenda_id = filtroFazenda
      if (filtroTabela) params.p_tabela = filtroTabela
      if (filtroOperacao) params.p_operacao = filtroOperacao
      if (filtroUsuario) params.p_usuario_id = filtroUsuario
      if (filtroDataInicio) params.p_data_inicio = new Date(filtroDataInicio).toISOString()
      if (filtroDataFim) params.p_data_fim = new Date(filtroDataFim + 'T23:59:59').toISOString()

      const { data: result, error: err } = await supabase.rpc('get_audit_log', params)
      if (err) throw err
      setData(result as unknown as AuditLogResponse)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar auditoria')
    } finally {
      setLoading(false)
    }
  }, [page, filtroFazenda, filtroTabela, filtroOperacao, filtroUsuario, filtroDataInicio, filtroDataFim])

  useEffect(() => {
    fetchFazendas()
    fetchUsuarios()
    applyPreset('30d')
  }, [fetchFazendas, fetchUsuarios, applyPreset])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleFilter = () => {
    setPage(0)
    fetchData()
  }

  const handleClearFilters = () => {
    setFiltroFazenda('')
    setFiltroTabela('')
    setFiltroOperacao('')
    setFiltroUsuario('')
    setFiltroDataInicio('')
    setFiltroDataFim('')
    setPresetData('30d')
    setApenasImpersonacao(false)
    setBuscaUsuario('')
    setPage(0)
    applyPreset('30d')
  }

  // Filtrar entradas por impersonação no cliente (RPC não tem esse filtro)
  const displayedEntries = data?.entries.filter((e) => {
    if (apenasImpersonacao && !e.isImpersonation) return false
    if (buscaUsuario) {
      const q = buscaUsuario.toLowerCase()
      if (!(e.usuarioNome?.toLowerCase().includes(q) || e.usuarioEmail?.toLowerCase().includes(q))) return false
    }
    return true
  }) ?? []

  // Tabelas dinâmicas da RPC + fallback
  const tabelasDisponiveis = data?.tabelasAuditadas?.map((t) => t.tabela) ?? []

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Auditoria do Sistema</h1>
          <p className="text-sm text-gray-500 mt-1">
            Registro de criação, alteração e exclusão em tabelas sensíveis (90 dias de retenção)
          </p>
        </div>
        {data && data.entries.length > 0 && (
          <button
            onClick={() => exportCSV(data.entries)}
            className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition-colors flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Exportar CSV
          </button>
        )}
      </div>

      {/* Presets de data */}
      <div className="flex flex-wrap gap-2">
        <DatePresets
          value={presetData}
          onChange={(v) => v === 'custom' ? setPresetData('custom') : applyPreset(v)}
        />
        {apenasImpersonacao && (
          <span className="text-xs px-3 py-1.5 rounded-full bg-amber-100 text-amber-700 font-medium">
            Apenas impersonações
          </span>
        )}
      </div>

      {/* Filtros */}
      <Card className="bg-white p-4 shadow-md rounded-xl border border-gray-100">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Fazenda</label>
            <select
              value={filtroFazenda}
              onChange={(e) => setFiltroFazenda(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="">Todas</option>
              {fazendas.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Tabela</label>
            <select
              value={filtroTabela}
              onChange={(e) => setFiltroTabela(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="">Todas</option>
              {tabelasDisponiveis.length > 0 ? (
                tabelasDisponiveis.map((t) => (
                  <option key={t} value={t}>{tabelaLabel(t)}</option>
                ))
              ) : (
                <option value="" disabled>Carregando...</option>
              )}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Operação</label>
            <select
              value={filtroOperacao}
              onChange={(e) => setFiltroOperacao(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="">Todas</option>
              {OPERACOES.map((o) => (
                <option key={o} value={o}>{operacaoLabel(o)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Usuário</label>
            <select
              value={filtroUsuario}
              onChange={(e) => setFiltroUsuario(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="">Todos</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>{u.nome} ({u.email})</option>
              ))}
            </select>
          </div>
          {presetData === 'custom' && (
            <>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Data início</label>
                <input
                  type="date"
                  value={filtroDataInicio}
                  onChange={(e) => setFiltroDataInicio(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Data fim</label>
                <input
                  type="date"
                  value={filtroDataFim}
                  onChange={(e) => setFiltroDataFim(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button
            onClick={handleFilter}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 transition-colors"
          >
            Filtrar
          </button>
          <button
            onClick={handleClearFilters}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition-colors"
          >
            Limpar
          </button>
          <div className="flex-1" />
          <input
            type="text"
            value={buscaUsuario}
            onChange={(e) => setBuscaUsuario(e.target.value)}
            placeholder="Buscar por nome/email..."
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 w-56 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={apenasImpersonacao}
              onChange={(e) => setApenasImpersonacao(e.target.checked)}
              className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
            />
            Apenas impersonações
          </label>
        </div>
      </Card>

      {/* Resumo por tabela */}
      {data && data.tabelasAuditadas.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.tabelasAuditadas.map((t) => (
            <button
              key={t.tabela}
              onClick={() => { setFiltroTabela(t.tabela); setPage(0); }}
              className={`text-xs px-3 py-1 rounded-full transition-colors ${
                filtroTabela === t.tabela
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tabelaLabel(t.tabela)}: <strong>{t.count}</strong>
            </button>
          ))}
        </div>
      )}

      {/* Total de registros */}
      {data && (
        <p className="text-sm text-gray-500">
          {data.total} registro{data.total !== 1 ? 's' : ''} encontrado{data.total !== 1 ? 's' : ''}
          {data.total > 0 && ` (página ${page + 1} de ${totalPages})`}
        </p>
      )}

      {/* Erro */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Lista de auditoria */}
      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-600">Carregando...</p>
        </div>
      ) : displayedEntries.length > 0 ? (
        <div className="space-y-2">
          {displayedEntries.map((entry) => (
            <Card key={entry.id} className="bg-white shadow-sm rounded-lg border border-gray-100 overflow-hidden">
              <div
                className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${operacaoColor(entry.operacao)}`}>
                        {operacaoLabel(entry.operacao)}
                      </span>
                      <span className="text-sm font-medium text-gray-700">{tabelaLabel(entry.tabela)}</span>
                      {entry.isImpersonation && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                          Impersonação
                        </span>
                      )}
                      {entry.isSoftDelete && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-medium">
                          Soft delete
                        </span>
                      )}
                      {entry.batchSize && entry.batchSize > 1 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium" title={`Parte de um lote de ${entry.batchSize} operações na mesma transação`}>
                          Lote ({entry.batchSize})
                        </span>
                      )}
                      {entry.sourceApp && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 font-medium">
                          {entry.sourceApp === 'pwa' ? 'PWA' : entry.sourceApp === 'web' ? 'Web' : entry.sourceApp}
                        </span>
                      )}
                      {!entry.usuarioId && !entry.isImpersonation && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 font-medium" title="setAuditContext não foi chamado antes desta operação">
                          Sem contexto de usuário
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 space-y-0.5">
                      <p>
                        <span className="text-gray-400">Por:</span>{' '}
                        <span className="font-medium">{entry.usuarioNome || entry.usuarioEmail || 'Sistema'}</span>
                        {entry.fazendaNome && (
                          <> | <span className="text-gray-400">Fazenda:</span> <span className="font-medium">{entry.fazendaNome}</span></>
                        )}
                      </p>
                      <p>
                        <span className="text-gray-400">Quando:</span>{' '}
                        {new Date(entry.createdAt).toLocaleString('pt-BR')}
                        {entry.registroId && (
                          <> | <span className="text-gray-400">ID:</span> <span className="font-mono">{entry.registroId.slice(0, 8)}</span></>
                        )}
                      </p>
                      {entry.alteracoes && Object.keys(entry.alteracoes).length > 0 && (
                        <p className="text-gray-400">
                          {Object.keys(entry.alteracoes).length} campo(s) alterado(s):{' '}
                          {Object.keys(entry.alteracoes).slice(0, 5).join(', ')}
                          {Object.keys(entry.alteracoes).length > 5 && ` +${Object.keys(entry.alteracoes).length - 5}`}
                        </p>
                      )}
                    </div>
                  </div>
                  <svg
                    className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${expandedId === entry.id ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Detalhe expandido */}
              {expandedId === entry.id && (
                <div className="border-t border-gray-100 p-4 bg-gray-50 space-y-3">
                  {/* Metadados de granularidade */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    {entry.originPage && (
                      <div>
                        <span className="text-gray-400">Origem:</span>{' '}
                        <span className="font-mono text-gray-600">{entry.originPage}</span>
                      </div>
                    )}
                    {entry.userAgent && (
                      <div className="col-span-2">
                        <span className="text-gray-400">User agent:</span>{' '}
                        <span className="font-mono text-gray-600 break-all">{entry.userAgent.slice(0, 120)}{entry.userAgent.length > 120 && '...'}</span>
                      </div>
                    )}
                    {entry.transactionId && (
                      <div>
                        <span className="text-gray-400">Tx ID:</span>{' '}
                        <span className="font-mono text-gray-600">{entry.transactionId}</span>
                      </div>
                    )}
                    {entry.ipAddress && (
                      <div>
                        <span className="text-gray-400">IP:</span>{' '}
                        <span className="font-mono text-gray-600">{entry.ipAddress}</span>
                      </div>
                    )}
                  </div>
                  {entry.alteracoes && Object.keys(entry.alteracoes).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-600 mb-2">Campos alterados:</p>
                      <div className="space-y-1">
                        {Object.entries(entry.alteracoes).map(([campo, valores]) => (
                          <div key={campo} className="text-xs grid grid-cols-3 gap-2 items-start">
                            <span className="font-mono text-gray-600 font-medium">{campo}</span>
                            <div className="text-red-600">
                              <span className="text-gray-400 mr-1">de:</span>
                              <span className="font-mono break-all">{formatValue(valores[0])}</span>
                            </div>
                            <div className="text-green-600">
                              <span className="text-gray-400 mr-1">para:</span>
                              <span className="font-mono break-all">{formatValue(valores[1])}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {entry.valorNovo && !entry.alteracoes && (
                    <div>
                      <p className="text-xs font-semibold text-gray-600 mb-2">Dados criados:</p>
                      <pre className="text-xs text-gray-700 font-mono whitespace-pre-wrap break-all bg-white rounded p-2 border border-gray-200 max-h-60 overflow-y-auto">
                        {JSON.stringify(entry.valorNovo, null, 2)}
                      </pre>
                    </div>
                  )}
                  {entry.valorAnterior && entry.operacao === 'DELETE' && (
                    <div>
                      <p className="text-xs font-semibold text-gray-600 mb-2">Dados excluídos:</p>
                      <pre className="text-xs text-gray-700 font-mono whitespace-pre-wrap break-all bg-white rounded p-2 border border-gray-200 max-h-60 overflow-y-auto">
                        {JSON.stringify(entry.valorAnterior, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-400">Nenhum registro de auditoria encontrado</p>
          <p className="text-xs text-gray-400 mt-2">
            Os triggers foram instalados. Novas operações (INSERT/UPDATE/DELETE) nas tabelas monitoradas aparecerão aqui.
          </p>
        </div>
      )}

      {/* Paginação */}
      {data && data.total > 0 && (
        <Pagination
          page={page + 1}
          totalItems={data.total}
          perPage={pageSize}
          onPageChange={(p) => setPage(p - 1)}
        />
      )}
    </div>
  )
}
