import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, CardSkeleton } from '../../components/ui'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

interface NotaConfig {
  id: string
  nota: number
  percentual_ajuste: number
  descricao: string | null
}

// Descricoes fixas por nota (nao editaveis pelo usuario)
const DESCRICOES_FIXAS: Record<number, string> = {
  [-1]: 'Cocho vazio (lambido)',
  0: 'Cocho limpo (sem sobras)',
  1: 'Poucas sobras (rapinha)',
  2: 'Sobras moderadas',
  3: 'Sobras em excesso',
}

const NOTAS_ORDEM = [-1, 0, 1, 2, 3]

export function LeituraCocho() {
  const { user } = useAuth()
  const [fazendaId, setFazendaId] = useState<string | null>(null)
  const [loadingFazenda, setLoadingFazenda] = useState(true)
  const [notas, setNotas] = useState<NotaConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const [editando, setEditando] = useState<Record<number, string>>({})
  const [erro, setErro] = useState<string | null>(null)

  const loadFazenda = useCallback(async () => {
    if (!user) return
    const fid = await getFazendaIdForUser(user.id)
    setFazendaId(fid)
    setLoadingFazenda(false)
  }, [user])

  useEffect(() => {
    loadFazenda()
  }, [loadFazenda])

  const loadNotas = useCallback(async () => {
    if (!fazendaId) return
    setLoading(true)
    setErro(null)
    const { data, error } = await supabase
      .from('notas_leitura_cocho_config')
      .select('*')
      .eq('fazenda_id', fazendaId)
      .order('nota', { ascending: true })

    if (error) {
      console.error('Erro ao buscar notas:', error)
      setErro(error.message)
    } else if (data) {
      setNotas(data as NotaConfig[])
      const editMap: Record<number, string> = {}
      ;(data as NotaConfig[]).forEach(n => {
        editMap[n.nota] = String(n.percentual_ajuste)
      })
      setEditando(editMap)
    }
    setLoading(false)
  }, [fazendaId])

  useEffect(() => {
    if (fazendaId) loadNotas()
  }, [fazendaId, loadNotas])

  const handlePercentualChange = (nota: number, valor: string) => {
    setEditando(prev => ({ ...prev, [nota]: valor }))
  }

  const handleSalvar = async () => {
    if (!fazendaId) return
    setSaving(true)
    setSalvo(false)

    let erro = false
    for (const notaConfig of notas) {
      const novoValor = parseFloat(editando[notaConfig.nota] || '0')
      if (isNaN(novoValor)) continue

      const { error } = await supabase
        .from('notas_leitura_cocho_config')
        .update({ percentual_ajuste: novoValor, updated_at: new Date().toISOString() })
        .eq('id', notaConfig.id)

      if (error) {
        console.error(`Erro ao salvar nota ${notaConfig.nota}:`, error)
        erro = true
      }
    }

    if (!erro) {
      setSalvo(true)
      setTimeout(() => setSalvo(false), 3000)
      loadNotas()
    }

    setSaving(false)
  }

  const haAlteracoes = notas.some(n => {
    const editado = parseFloat(editando[n.nota] || '0')
    return !isNaN(editado) && editado !== Number(n.percentual_ajuste)
  })

  const getNotaStyle = (nota: number) => {
    switch (nota) {
      case -1:
        return { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-700 dark:text-red-300', badge: 'bg-red-500' }
      case 0:
        return { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-700 dark:text-yellow-300', badge: 'bg-yellow-500' }
      case 1:
        return { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-700 dark:text-green-300', badge: 'bg-green-500' }
      case 2:
        return { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-700 dark:text-yellow-300', badge: 'bg-yellow-500' }
      case 3:
        return { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-700 dark:text-red-300', badge: 'bg-red-500' }
      default:
        return { bg: 'bg-surface-2', border: 'border-border-base', text: 'text-content', badge: 'bg-surface-20' }
    }
  }

  const formatPercentual = (valor: number) => {
    if (valor > 0) return `+${valor}%`
    if (valor === 0) return '0%'
    return `${valor}%`
  }

  if (loadingFazenda) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        <CardSkeleton />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-content-strong">Leitura de Cocho</h1>
        <p className="text-sm text-content-muted mt-1">
          Configure a porcentagem de ajuste para cada nota de leitura de cocho. As notas são fixas e não podem ser alteradas.
        </p>
      </div>

      {/* Card explicativo */}
      <Card className="p-4 bg-primary/10 border-primary/30">
        <div className="flex gap-3">
          <svg className="w-6 h-6 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-primary dark:text-primary-light">
            <p className="font-medium mb-1">Como funciona</p>
            <p>
              O tratador faz a leitura do cocho no aplicativo e atribui uma nota de -1 a 3. Cada nota representa um ajuste na quantidade de comida do próximo trato.
              A porcentagem que você configura aqui determina quanto o tratador deve aumentar ou reduzir.
            </p>
            <p className="mt-2">
              <strong>Exemplo:</strong> se a nota foi <strong>2</strong> (sobras moderadas) e a porcentagem é <strong>-5%</strong>, o tratador reduz 5% da quantidade de comida no próximo trato.
            </p>
          </div>
        </div>
      </Card>

      {/* Erro */}
      {erro && (
        <div className="p-4 bg-red-500/10 border-2 border-red-500/30 rounded-xl">
          <p className="text-sm text-red-700 dark:text-red-300 font-medium">Erro ao carregar configurações</p>
          <p className="text-xs text-red-500 mt-1">{erro}</p>
          <p className="text-xs text-red-500 mt-1">fazenda_id: {fazendaId || 'null'}</p>
        </div>
      )}

      {/* Lista de notas */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="animate-pulse flex items-center gap-4 p-4 bg-surface-1 rounded-xl border border-border-subtle">
              <div className="w-12 h-12 bg-surface-3 rounded-full shrink-0"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-surface-3 rounded w-1/3"></div>
                <div className="h-3 bg-surface-3 rounded w-1/2"></div>
              </div>
              <div className="w-24 h-10 bg-surface-3 rounded-lg"></div>
            </div>
          ))}
        </div>
      ) : notas.length === 0 ? (
        <div className="p-6 bg-surface-2 rounded-xl border-2 border-border-base text-center">
          <p className="text-sm text-content-muted">
            {fazendaId
              ? `Nenhuma configuração encontrada para esta fazenda (${fazendaId}).`
              : 'Não foi possível identificar a fazenda do usuário.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {NOTAS_ORDEM.map(nota => {
            const config = notas.find(n => n.nota === nota)
            if (!config) return null
            const style = getNotaStyle(nota)
            const valorEditado = editando[nota] || ''

            return (
              <div
                key={nota}
                className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 bg-surface-1 rounded-xl border-2 ${style.border} ${style.bg}`}
              >
                {/* Badge da nota */}
                <div className="flex items-center gap-3 shrink-0">
                  <div className={`w-12 h-12 rounded-full ${style.badge} flex items-center justify-center text-white font-bold text-lg`}>
                    {nota}
                  </div>
                  <div className="min-w-0">
                    <p className={`font-semibold ${style.text}`}>Nota {nota}</p>
                    <p className="text-xs text-content-muted">{DESCRICOES_FIXAS[nota]}</p>
                  </div>
                </div>

                {/* Descricao do efeito */}
                <div className="flex-1 min-w-0 sm:text-right">
                  <p className="text-sm text-content-muted">
                    Ajuste no próximo trato:
                  </p>
                  <p className={`text-lg font-bold ${style.text}`}>
                    {formatPercentual(parseFloat(valorEditado) || 0)}
                  </p>
                </div>

                {/* Input de percentual */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      value={valorEditado}
                      onChange={e => handlePercentualChange(nota, e.target.value)}
                      className="w-24 px-3 py-2 border-2 border-border-base rounded-lg text-center font-semibold text-content focus:border-accent focus:outline-none"
                      placeholder="0"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-content-faint text-sm pointer-events-none">%</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Botao salvar */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleSalvar}
          disabled={saving || !haAlteracoes}
          variant="primary"
        >
          {saving ? 'Salvando...' : 'Salvar configurações'}
        </Button>
        {salvo && (
          <span className="text-sm text-green-500 flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Configurações salvas
          </span>
        )}
        {haAlteracoes && !salvo && (
          <span className="text-sm text-content-muted">
            Alterações não salvas
          </span>
        )}
      </div>
    </div>
  )
}
