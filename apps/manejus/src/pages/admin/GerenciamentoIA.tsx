import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, Button } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
interface FazendaIA {
  fazenda_id: string
  fazenda_nome: string
  ia_ativo: boolean
  limite_diario: number
  custo_input_por_mil: number
  custo_output_por_mil: number
  custo_cached_por_mil: number
  total_perguntas: number
  perguntas_hoje: number
  perguntas_30d: number
  total_tokens_input: number
  total_tokens_output: number
  total_tokens_cached: number
  custo_total_usd: number
  custo_30d_usd: number
  custo_hoje_usd: number
  ultima_pergunta: string | null
  media_tokens_input: number
  media_tokens_output: number
}

interface ResumoGlobal {
  total_fazendas_ativas: number
  total_fazendas_com_ia: number
  total_perguntas: number
  perguntas_hoje: number
  perguntas_30d: number
  custo_total_usd: number
  custo_hoje_usd: number
  custo_30d_usd: number
  total_tokens_input: number
  total_tokens_output: number
  total_tokens_cached: number
}

interface MonitoramentoData {
  cotacao_usd_brl: number
  cotacao_atualizada_em: string
  fazendas: FazendaIA[]
  resumo_global: ResumoGlobal
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatUSD(value: number): string {
  if (value < 0.01) return `$${value.toFixed(6)}`
  if (value < 1) return `$${value.toFixed(4)}`
  return `$${value.toFixed(2)}`
}

function formatBRL(valueUsd: number, cotacao: number): string {
  const brl = valueUsd * cotacao
  if (brl < 0.01) return `R$${brl.toFixed(4)}`
  if (brl < 1) return `R$${brl.toFixed(2)}`
  return `R$${brl.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatNumber(value: number): string {
  return value.toLocaleString('pt-BR')
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Nunca'
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Projeção de custo: usa a média de tokens por pergunta da fazenda (ou média global)
// multiplicada pelo limite_diario * 30 dias (mensal) e * 365 (anual).
function projetarCusto(fazenda: FazendaIA, mediaTokensInputGlobal: number, mediaTokensOutputGlobal: number): {
  mensal: number
  anual: number
  custoPorPergunta: number
} {
  const mediaInput = fazenda.total_perguntas > 0 ? fazenda.media_tokens_input : mediaTokensInputGlobal
  const mediaOutput = fazenda.total_perguntas > 0 ? fazenda.media_tokens_output : mediaTokensOutputGlobal
  // Assume 0 cached para projeção conservadora
  const custoPorPergunta =
    (mediaInput * fazenda.custo_input_por_mil / 1000000)
    + (mediaOutput * fazenda.custo_output_por_mil / 1000000)
  const mensal = custoPorPergunta * fazenda.limite_diario * 30
  const anual = custoPorPergunta * fazenda.limite_diario * 365
  return { mensal, anual, custoPorPergunta }
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
export function GerenciamentoIA() {
  const { user } = useAuth()
  const isSuperAdmin = user?.papel === 'super_admin'

  const [data, setData] = useState<MonitoramentoData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingFazenda, setEditingFazenda] = useState<string | null>(null)
  const [editLimite, setEditLimite] = useState<number>(20)
  const [saving, setSaving] = useState(false)
  const [filtroAtivo, setFiltroAtivo] = useState<'todos' | 'ativos' | 'inativos'>('todos')
  const [busca, setBusca] = useState('')
  const [fetchingCotacao, setFetchingCotacao] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_ia_monitoramento')
      if (rpcError) throw rpcError
      setData(rpcData as MonitoramentoData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Busca cotação USD->BRL direto da API (suporta CORS) se desatualizada (>1h).
  // Se desatualizada, busca na awesomeapi e salva no banco via Supabase.
  const fetchCotacao = useCallback(async () => {
    setFetchingCotacao(true)
    try {
      // Verifica se a cotação do banco foi atualizada há menos de 1 hora.
      const cotacaoStale = !data?.cotacao_atualizada_em
        || (Date.now() - new Date(data.cotacao_atualizada_em).getTime()) > 60 * 60 * 1000

      if (cotacaoStale) {
        // Busca cotação fresca da awesomeapi (suporta CORS).
        const res = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL')
        if (res.ok) {
          const json = await res.json()
          const cotacao = parseFloat(json?.USDBRL?.bid)
          if (!isNaN(cotacao) && cotacao > 0) {
            // Salva no banco.
            const { data: { session } } = await supabase.auth.getSession()
            if (session) {
              const { error: updateError } = await supabase
                .from('ia_config_global')
                .update({ cotacao_usd_brl: cotacao })
                .eq('id', 1)
              if (updateError) {
                console.error('Erro ao salvar cotação no banco:', updateError)
              }
            } else {
              console.error('Sessão não encontrada ao tentar salvar cotação')
            }
          }
        }
      }
      await fetchData()
    } catch (err) {
      // Se a API falhar, mantém a cotação armazenada e recarrega os dados.
      console.error('Erro ao buscar cotação:', err)
      await fetchData()
    } finally {
      setFetchingCotacao(false)
    }
  }, [fetchData, data?.cotacao_atualizada_em])

  // Auto-buscar cotação ao montar a página (após o primeiro fetchData).
  useEffect(() => {
    fetchCotacao()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleToggleIA = async (fazendaId: string, novoAtivo: boolean) => {
    setSaving(true)
    try {
      // Upsert: se não existe config, cria; se existe, atualiza ia_ativo.
      const { error: upsertError } = await supabase
        .from('ia_fazenda_config')
        .upsert({
          fazenda_id: fazendaId,
          ia_ativo: novoAtivo,
        }, { onConflict: 'fazenda_id' })

      if (upsertError) throw upsertError
      await fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar configuração')
    } finally {
      setSaving(false)
    }
  }

  const handleSalvarLimite = async (fazendaId: string) => {
    setSaving(true)
    try {
      const { error: updateError } = await supabase
        .from('ia_fazenda_config')
        .update({ limite_diario: editLimite })
        .eq('fazenda_id', fazendaId)

      if (updateError) throw updateError
      setEditingFazenda(null)
      await fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar limite')
    } finally {
      setSaving(false)
    }
  }

  const handleIniciarEdicao = (fazenda: FazendaIA) => {
    setEditLimite(fazenda.limite_diario)
    setEditingFazenda(fazenda.fazenda_id)
  }

  // Médias globais de tokens para projeção de fazendas sem uso histórico.
  const mediasGlobais = useMemo(() => {
    if (!data || data.resumo_global.total_perguntas === 0) {
      return { input: 4249, output: 236 } // fallback com dados reais históricos
    }
    const r = data.resumo_global
    return {
      input: r.total_tokens_input / r.total_perguntas,
      output: r.total_tokens_output / r.total_perguntas,
    }
  }, [data])

  // Projeção total: soma das projeções de todas as fazendas com IA ativa.
  const projecaoTotal = useMemo(() => {
    if (!data) return { mensal: 0, anual: 0 }
    return data.fazendas
      .filter((f) => f.ia_ativo)
      .reduce(
        (acc, f) => {
          const p = projetarCusto(f, mediasGlobais.input, mediasGlobais.output)
          return { mensal: acc.mensal + p.mensal, anual: acc.anual + p.anual }
        },
        { mensal: 0, anual: 0 }
      )
  }, [data, mediasGlobais])

  const fazendasFiltradas = useMemo(() => {
    if (!data) return []
    let lista = data.fazendas
    if (filtroAtivo === 'ativos') lista = lista.filter((f) => f.ia_ativo)
    if (filtroAtivo === 'inativos') lista = lista.filter((f) => !f.ia_ativo)
    if (busca.trim()) {
      const q = busca.toLowerCase().trim()
      lista = lista.filter((f) => f.fazenda_nome.toLowerCase().includes(q))
    }
    return lista
  }, [data, filtroAtivo, busca])

  if (!isSuperAdmin) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <h2 className="text-lg font-semibold text-gray-700 mb-2">Acesso restrito</h2>
          <p className="text-sm text-gray-500">
            Esta tela é exclusiva do super administrador.
          </p>
        </Card>
      </div>
    )
  }

  if (loading && !data) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <p className="text-sm text-gray-500">Carregando dados de monitoramento...</p>
        </Card>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <Button onClick={fetchData}>Tentar novamente</Button>
        </Card>
      </div>
    )
  }

  const resumo = data?.resumo_global
  const cotacao = data?.cotacao_usd_brl ?? 5.50

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Gerenciamento de IA</h1>
        <p className="text-sm text-gray-500 mt-1">
          Controle de acesso ao assistente de IA por fazenda, limites diários e monitoramento de uso e custos.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Fechar</button>
        </div>
      )}

      {/* Resumo global */}
      {resumo && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
          <Card className="p-4">
            <p className="text-xs text-gray-500 mb-1">Fazendas com IA</p>
            <p className="text-xl font-bold text-gray-800">
              {resumo.total_fazendas_com_ia}
              <span className="text-sm text-gray-400 font-normal"> / {resumo.total_fazendas_ativas}</span>
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-gray-500 mb-1">Perguntas (hoje)</p>
            <p className="text-xl font-bold text-gray-800">{formatNumber(resumo.perguntas_hoje)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-gray-500 mb-1">Perguntas (30 dias)</p>
            <p className="text-xl font-bold text-gray-800">{formatNumber(resumo.perguntas_30d)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-gray-500 mb-1">Custo (hoje)</p>
            <p className="text-xl font-bold text-gray-800">{formatUSD(resumo.custo_hoje_usd)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{formatBRL(resumo.custo_hoje_usd, cotacao)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-gray-500 mb-1">Custo (30 dias)</p>
            <p className="text-xl font-bold text-gray-800">{formatUSD(resumo.custo_30d_usd)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{formatBRL(resumo.custo_30d_usd, cotacao)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-gray-500 mb-1">Custo total</p>
            <p className="text-xl font-bold text-gray-800">{formatUSD(resumo.custo_total_usd)}</p>
            <p className="text-xs text-gray-400 mt-0.5">{formatBRL(resumo.custo_total_usd, cotacao)}</p>
          </Card>
        </div>
      )}

      {/* Projeção de custos + Cotação */}
      <Card className="p-5 mb-6 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-sm font-semibold text-blue-900 mb-1">Projeção de custos (fazendas com IA ativa)</h2>
            <p className="text-xs text-blue-700">
              Estimativa baseada na média de tokens por pergunta e no limite diário configurado por fazenda.
              Projeção conservadora: assume 0% de cache hit.
            </p>
          </div>
          <div className="flex gap-6">
            <div className="text-right">
              <p className="text-xs text-blue-600">Mensal</p>
              <p className="text-2xl font-bold text-blue-900">{formatUSD(projecaoTotal.mensal)}</p>
              <p className="text-xs text-blue-500">{formatBRL(projecaoTotal.mensal, cotacao)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-blue-600">Anual</p>
              <p className="text-2xl font-bold text-blue-900">{formatUSD(projecaoTotal.anual)}</p>
              <p className="text-xs text-blue-500">{formatBRL(projecaoTotal.anual, cotacao)}</p>
            </div>
          </div>
        </div>
        {/* Cotação atual + botão de atualizar */}
        <div className="mt-4 pt-4 border-t border-blue-200 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-blue-800">Cotação:</span>
            <span className="text-sm font-bold text-blue-900">
              US$ 1 = R$ {cotacao.toFixed(4).replace('.', ',')}
            </span>
            {data?.cotacao_atualizada_em && (
              <span className="text-xs text-blue-500">
                (atualizada em {new Date(data.cotacao_atualizada_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })})
              </span>
            )}
          </div>
          <button
            onClick={fetchCotacao}
            disabled={fetchingCotacao}
            className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-wait transition-colors"
          >
            {fetchingCotacao ? 'Buscando...' : 'Atualizar cotação'}
          </button>
          <p className="text-xs text-blue-500">
            Buscada automaticamente ao abrir esta página (Banco Central PTAX + awesomeapi fallback)
          </p>
        </div>
      </Card>

      {/* Filtros e busca */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
          {(['todos', 'ativos', 'inativos'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltroAtivo(f)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filtroAtivo === f ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {f === 'todos' ? 'Todas' : f === 'ativos' ? 'Com IA' : 'Sem IA'}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar fazenda..."
          className="flex-1 min-w-[200px] px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <Button
          onClick={fetchData}
          disabled={loading}
          variant="secondary"
          className="flex-shrink-0"
        >
          {loading ? 'Atualizando...' : 'Atualizar'}
        </Button>
      </div>

      {/* Tabela de fazendas */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Fazenda</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">IA</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Limite/dia</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Perguntas (hoje)</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Perguntas (total)</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Custo (total)</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Custo (30d)</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Projeção mensal</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Projeção anual</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Última pergunta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {fazendasFiltradas.map((f) => {
                const projecao = projetarCusto(f, mediasGlobais.input, mediasGlobais.output)
                const isEditing = editingFazenda === f.fazenda_id
                return (
                  <tr key={f.fazenda_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{f.fazenda_nome}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggleIA(f.fazenda_id, !f.ia_ativo)}
                        disabled={saving}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          f.ia_ativo ? 'bg-green-500' : 'bg-gray-300'
                        } disabled:opacity-50`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            f.ia_ativo ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isEditing ? (
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={1000}
                            value={editLimite}
                            onChange={(e) => setEditLimite(Math.max(0, Math.min(1000, parseInt(e.target.value) || 0)))}
                            className="w-16 px-2 py-1 text-sm border border-gray-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                          <button
                            onClick={() => handleSalvarLimite(f.fazenda_id)}
                            disabled={saving}
                            className="text-green-600 hover:text-green-700 disabled:opacity-50"
                            title="Salvar"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setEditingFazenda(null)}
                            className="text-gray-400 hover:text-gray-600"
                            title="Cancelar"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleIniciarEdicao(f)}
                          disabled={!f.ia_ativo}
                          className="px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                          title={f.ia_ativo ? 'Editar limite' : 'Ative a IA primeiro'}
                        >
                          {f.limite_diario}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-medium ${
                        f.perguntas_hoje >= f.limite_diario && f.limite_diario > 0
                          ? 'text-red-600'
                          : f.perguntas_hoje > 0
                          ? 'text-amber-600'
                          : 'text-gray-400'
                      }`}>
                        {f.perguntas_hoje}
                      </span>
                      <span className="text-gray-400"> / {f.limite_diario}</span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">{formatNumber(f.total_perguntas)}</td>
                    <td className="px-4 py-3 text-right text-gray-600 font-mono text-xs">
                      {formatUSD(f.custo_total_usd)}
                      {f.custo_total_usd > 0 && (
                        <div className="text-gray-400 text-[10px]">{formatBRL(f.custo_total_usd, cotacao)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600 font-mono text-xs">
                      {formatUSD(f.custo_30d_usd)}
                      {f.custo_30d_usd > 0 && (
                        <div className="text-gray-400 text-[10px]">{formatBRL(f.custo_30d_usd, cotacao)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {f.ia_ativo ? (
                        <span className="text-blue-700 font-medium">
                          {formatUSD(projecao.mensal)}
                          <div className="text-blue-400 text-[10px] font-normal">{formatBRL(projecao.mensal, cotacao)}</div>
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {f.ia_ativo ? (
                        <span className="text-blue-700 font-medium">
                          {formatUSD(projecao.anual)}
                          <div className="text-blue-400 text-[10px] font-normal">{formatBRL(projecao.anual, cotacao)}</div>
                        </span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-left text-xs text-gray-500">{formatDate(f.ultima_pergunta)}</td>
                  </tr>
                )
              })}
              {fazendasFiltradas.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-400">
                    Nenhuma fazenda encontrada com os filtros atuais.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Detalhes de tokens por fazenda (expansível) */}
      {data && data.fazendas.some((f) => f.total_perguntas > 0) && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Detalhes de tokens por fazenda (histórico)</h2>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Fazenda</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Tokens input (total)</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Tokens output (total)</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Tokens cached (total)</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Média input/pergunta</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Média output/pergunta</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600">Custo/pergunta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.fazendas
                    .filter((f) => f.total_perguntas > 0)
                    .map((f) => {
                      const custoPorPergunta = f.total_perguntas > 0 ? f.custo_total_usd / f.total_perguntas : 0
                      return (
                        <tr key={f.fazenda_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-800">{f.fazenda_nome}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-gray-600">{formatNumber(f.total_tokens_input)}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-gray-600">{formatNumber(f.total_tokens_output)}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-gray-600">{formatNumber(f.total_tokens_cached)}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-gray-600">{formatNumber(Math.round(f.media_tokens_input))}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-gray-600">{formatNumber(Math.round(f.media_tokens_output))}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-gray-600">
                            {formatUSD(custoPorPergunta)}
                            <div className="text-gray-400 text-[10px]">{formatBRL(custoPorPergunta, cotacao)}</div>
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Nota explicativa */}
      <div className="mt-6 p-4 rounded-lg bg-gray-50 border border-gray-200">
        <h3 className="text-xs font-semibold text-gray-600 mb-2">Como a projeção é calculada</h3>
        <p className="text-xs text-gray-500 leading-relaxed">
          Para cada fazenda com IA ativa, a projeção usa a média de tokens input e output por pergunta
          (dados históricos da própria fazenda, ou média global se a fazenda ainda não tem uso),
          multiplicada pelo limite diário configurado e por 30 dias (mensal) ou 365 dias (anual).
          A projeção é conservadora: assume 0% de cache hit, que na prática reduz o custo de input
          em ~75% quando o system context é idêntico entre fazendas. O custo real tende a ser menor
          que a projeção conforme o uso estabiliza.
        </p>
      </div>
    </div>
  )
}
