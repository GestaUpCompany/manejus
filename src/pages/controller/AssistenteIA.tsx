import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { useAuth } from '../../contexts/AuthContext'
import { useFazenda } from '../../hooks/useDashboardQueries'
import { Card, Button } from '../../components/ui'
import { enviarPerguntaIA, ChatResposta } from '../../services/chatIAService'
import { supabase } from '../../services/supabaseClient'

interface Mensagem {
  id: string
  tipo: 'usuario' | 'ia' | 'erro'
  texto: string
  funcoes?: string[]
  tokens?: { input: number; output: number; cached: number }
  timestamp: Date
}

const SUGESTOES_PERGUNTAS = [
  'Como está o plano nutricional do Boi Magro? Qual a GMD realizada vs planejada?',
  'Quais pastos estão ocupados e qual a taxa de lotação de cada um?',
  'Quanto choveu na fazenda nos últimos 30 dias por pluviômetro?',
  'Qual a margem de lucro projetada e o custo por arroba de cada lote ativo?',
  'Quantos bezerros nasceram nos últimos 3 meses e qual o peso médio das crias?',
  'Quais bebedouros precisam de limpeza e há quanto tempo não são limpos?',
]

export function AssistenteIA() {
  const { user } = useAuth()
  const { data: fazenda } = useFazenda(user?.id)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [iaAtiva, setIaAtiva] = useState<boolean | null>(null)
  const [limiteRestante, setLimiteRestante] = useState<number | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!fazenda?.id) return
    let cancelled = false
    supabase
      .from('ia_fazenda_config')
      .select('ia_ativo, limite_diario')
      .eq('fazenda_id', fazenda.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setIaAtiva(data?.ia_ativo === true)
      })
    return () => { cancelled = true }
  }, [fazenda?.id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens])

  const handleEnviar = async (pergunta?: string) => {
    const texto = (pergunta || input).trim()
    if (!texto || loading) return

    const msgUsuario: Mensagem = {
      id: crypto.randomUUID(),
      tipo: 'usuario',
      texto,
      timestamp: new Date(),
    }
    setMensagens((prev) => [...prev, msgUsuario])
    setInput('')
    setLoading(true)

    try {
      const resultado: ChatResposta = await enviarPerguntaIA(texto)
      if (typeof resultado.limite_restante === 'number') {
        setLimiteRestante(resultado.limite_restante)
      }
      const msgIA: Mensagem = {
        id: crypto.randomUUID(),
        tipo: 'ia',
        texto: resultado.resposta,
        funcoes: resultado.funcoes_chamadas,
        tokens: resultado.tokens,
        timestamp: new Date(),
      }
      setMensagens((prev) => [...prev, msgIA])
    } catch (err) {
      const msgErro: Mensagem = {
        id: crypto.randomUUID(),
        tipo: 'erro',
        texto: err instanceof Error ? err.message : 'Erro ao processar pergunta.',
        timestamp: new Date(),
      }
      setMensagens((prev) => [...prev, msgErro])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleEnviar()
    }
  }

  if (iaAtiva === null) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <p className="text-sm text-content-muted">Carregando...</p>
        </Card>
      </div>
    )
  }

  if (!iaAtiva) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-content-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-content mb-2">Assistente de IA indisponível</h2>
          <p className="text-sm text-content-muted">
            O assistente de IA não está disponível para esta fazenda.
          </p>
        </Card>
      </div>
    )
  }

  const limiteEsgotado = limiteRestante !== null && limiteRestante <= 0

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-content-strong">Assistente de IA</h1>
        <p className="text-sm text-content-muted mt-1">
          Pergunte qualquer coisa sobre a fazenda. A IA consulta os dados reais do sistema e responde.
        </p>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {limiteRestante !== null && (
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border ${
              limiteEsgotado
                ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-400/30'
                : limiteRestante <= 5
                ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-400/30'
                : 'bg-green-50 dark:bg-primary/10 border-green-200 dark:border-primary/30'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                limiteEsgotado
                  ? 'bg-red-400'
                  : limiteRestante <= 5
                  ? 'bg-amber-400'
                  : 'bg-green-400'
              }`} />
              <span className={`text-xs font-medium ${
                limiteEsgotado
                  ? 'text-red-700 dark:text-red-300'
                  : limiteRestante <= 5
                  ? 'text-amber-700 dark:text-amber-300'
                  : 'text-green-700 dark:text-primary-light'
              }`}>
                {limiteEsgotado
                  ? 'Limite diário esgotado'
                  : `${limiteRestante} pergunta${limiteRestante === 1 ? '' : 's'} restante${limiteRestante === 1 ? '' : 's'} hoje`}
              </span>
            </div>
          )}
        </div>
      </div>

      <Card className="flex flex-col h-[65vh] min-h-[400px]">
        {/* Área de mensagens */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {mensagens.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-primary dark:text-primary-light" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-content-strong mb-2">Faça sua pergunta</h3>
              <p className="text-sm text-content-muted mb-6 max-w-md">
                Posso analisar planos nutricionais, pastos, clima, estoque, tratamentos, financeiro, maternidade, bebedouros e muito mais.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 w-full max-w-2xl">
                {SUGESTOES_PERGUNTAS.map((sugestao) => (
                  <button
                    key={sugestao}
                    onClick={() => handleEnviar(sugestao)}
                    disabled={loading || limiteEsgotado}
                    className="group text-left p-3 rounded-lg border border-border-base hover:border-primary hover:bg-primary/5 transition-colors text-sm text-content disabled:opacity-50"
                  >
                    <span className="flex items-start gap-2">
                      <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-content-faint group-hover:text-primary dark:hover:text-primary-light transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <span>{sugestao}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {mensagens.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.tipo === 'usuario' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  msg.tipo === 'usuario'
                    ? 'bg-primary text-white'
                    : msg.tipo === 'erro'
                    ? 'bg-red-50 border border-red-200 text-red-700'
                    : 'bg-surface-2 text-content-strong'
                }`}
              >
                <div className="text-sm">
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="my-1 whitespace-pre-wrap">{children}</p>,
                      ul: ({ children }) => <ul className="my-1 list-disc pl-4">{children}</ul>,
                      ol: ({ children }) => <ol className="my-1 list-decimal pl-4">{children}</ol>,
                      li: ({ children }) => <li className="my-0.5">{children}</li>,
                      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                      h1: ({ children }) => <h1 className="text-base font-bold my-2">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-sm font-bold my-2">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-sm font-semibold my-1">{children}</h3>,
                    }}
                  >
                    {msg.texto}
                  </ReactMarkdown>
                </div>
                {msg.funcoes && msg.funcoes.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-border-subtle/50">
                    <p className="text-xs opacity-70 mb-1">Funções consultadas:</p>
                    <div className="flex flex-wrap gap-1">
                      {msg.funcoes.map((f, idx) => (
                        <span
                          key={`${f}-${idx}`}
                          className={`text-xs px-2 py-0.5 rounded ${
                            msg.tipo === 'usuario' ? 'bg-white/20' : 'bg-surface-3 text-content-muted'
                          }`}
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {msg.tokens && (
                  <p className={`text-xs mt-1 ${msg.tipo === 'usuario' ? 'text-white/60' : 'text-content-faint'}`}>
                    {msg.tokens.input + msg.tokens.output} tokens{msg.tokens.cached > 0 ? ` · ${msg.tokens.cached} cached` : ''}
                  </p>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-surface-2 rounded-lg p-3 max-w-[80%]">
                <div className="flex gap-1">
                  <span className="w-2 h-2 rounded-full bg-content-faint animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full bg-content-faint animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full bg-content-faint animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Área de input */}
        <div className="border-t border-border-base p-3">
          {limiteEsgotado ? (
            <div className="text-center py-3">
              <p className="text-sm text-red-600 font-medium">
                Limite diário de perguntas atingido. Volte amanhã.
              </p>
            </div>
          ) : (
            <div className="flex gap-2 items-end">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Digite sua pergunta sobre a fazenda..."
                rows={1}
                disabled={loading}
                className="flex-1 resize-none rounded-lg border border-surface-3 bg-surface-1 text-content-strong placeholder-content-faint px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary disabled:bg-surface-2"
                style={{ maxHeight: '120px' }}
              />
              <Button
                onClick={() => handleEnviar()}
                disabled={loading || !input.trim()}
                className="flex-shrink-0"
              >
                {loading ? (
                  <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" strokeWidth={3} className="opacity-25" />
                    <path strokeLinecap="round" strokeWidth={3} d="M4 12a8 8 0 018-8" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
              </Button>
            </div>
          )}
          <p className="text-xs text-content-faint mt-1">
            Enter envia, Shift+Enter quebra linha. A IA consulta apenas dados desta fazenda.
          </p>
        </div>
      </Card>
    </div>
  )
}
