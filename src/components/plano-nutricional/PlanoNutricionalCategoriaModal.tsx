import { useEffect, useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import { Button, Input, Modal } from '../ui'

interface Personalizacao {
  id: string
  plano_id: string
  lote_categoria_id: string
  periodo_dias: number | null
  peso_meta_kg: number | null
  ativo: boolean
}

interface PlanoNutricional {
  id: string
  nome: string
  formulacao_id: string
  periodo_dias: number
  peso_meta_kg: number
  gmd_planejado?: number | null
  ativo: boolean
  data_inicio: string | null
  data_fim: string | null
}

interface FormulacaoInfo {
  id: string
  nome: string
  gmd?: number | null
  consumo_ms_percent_pv?: number | null
}

interface PlanoNutricionalCategoriaModalProps {
  isOpen: boolean
  onClose: () => void
  loteCategoriaId: string
  categoria: string
  loteId?: string
  loteNome?: string
  formulacaoLoteId?: string | null
  onOpenLoteModal?: () => void
  onOpenFormulacao?: (formulacaoId: string) => void
  onPlanChanged?: () => void
}

export function PlanoNutricionalCategoriaModal({
  isOpen,
  onClose,
  loteCategoriaId,
  categoria,
  loteId,
  loteNome,
  formulacaoLoteId,
  onOpenLoteModal,
  onOpenFormulacao,
  onPlanChanged,
}: PlanoNutricionalCategoriaModalProps) {
  const [planoVigente, setPlanoVigente] = useState<PlanoNutricional | null>(null)
  const [planosFila, setPlanosFila] = useState<PlanoNutricional[]>([])
  const [formulacaoLote, setFormulacaoLote] = useState<FormulacaoInfo | null>(null)
  const [personalizacao, setPersonalizacao] = useState<Personalizacao | null>(null)
  const [pesoAtual, setPesoAtual] = useState<number | null>(null)
  const [gmdCategoria, setGmdCategoria] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const [periodoDias, setPeriodoDias] = useState<string>('')
  const [pesoMetaKg, setPesoMetaKg] = useState<string>('')

  useEffect(() => {
    if (!isOpen || !loteCategoriaId) return
    loadData()
  }, [isOpen, loteCategoriaId])

  const loadData = async () => {
    if (!loteCategoriaId) return
    setLoading(true)
    setMessage(null)
    try {
      // Buscar dados da categoria
      const { data: catData } = await supabase
        .from('lote_categorias')
        .select('peso_vivo_atual_kg_cab, gmd, lote_id')
        .eq('id', loteCategoriaId)
        .single()

      setPesoAtual(catData?.peso_vivo_atual_kg_cab ?? null)
      setGmdCategoria(catData?.gmd ? parseFloat(String(catData.gmd).replace(',', '.')) : null)

      const lId = loteId || catData?.lote_id
      if (!lId) return

      // Buscar planos do LOTE (não da categoria)
      const { data: planosData, error } = await supabase
        .from('planos_nutricionais')
        .select('*')
        .eq('lote_id', lId)
        .order('ordem', { ascending: true })

      if (error) throw error

      const planos = (planosData as PlanoNutricional[]) || []
      const vigente = planos.find((p) => p.ativo && !p.data_fim) || null
      const fila = planos.filter((p) => !p.ativo && !p.data_fim)

      setPlanoVigente(vigente)
      setPlanosFila(fila)

      // Buscar personalização desta categoria para o plano vigente
      if (vigente) {
        const { data: persData } = await supabase
          .from('plano_categoria_personalizacao')
          .select('*')
          .eq('plano_id', vigente.id)
          .eq('lote_categoria_id', loteCategoriaId)
          .eq('ativo', true)
          .maybeSingle()

        setPersonalizacao(persData as Personalizacao | null)
        setPeriodoDias(persData?.periodo_dias?.toString() || vigente.periodo_dias?.toString() || '')
        setPesoMetaKg(persData?.peso_meta_kg?.toString().replace('.', ',') || vigente.peso_meta_kg?.toString().replace('.', ',') || '')
      } else {
        setPersonalizacao(null)
        setPeriodoDias('')
        setPesoMetaKg('')
      }

      // Buscar formulação do lote
      const fLoteId = formulacaoLoteId
      if (fLoteId) {
        const { data: flData } = await supabase
          .from('formulacoes')
          .select('id, nome, gmd, consumo_ms_percent_pv')
          .eq('id', fLoteId)
          .single()
        setFormulacaoLote(flData as FormulacaoInfo | null)
      }
    } catch (error) {
      console.error('Erro ao carregar dados da categoria:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSalvar = async () => {
    if (!planoVigente) return
    setSaving(true)
    setMessage(null)
    try {
      const data: Record<string, any> = {
        plano_id: planoVigente.id,
        lote_categoria_id: loteCategoriaId,
        ativo: true,
      }
      if (periodoDias) data.periodo_dias = parseInt(periodoDias)
      if (pesoMetaKg) data.peso_meta_kg = parseFloat(pesoMetaKg.replace(',', '.'))

      if (personalizacao?.id) {
        const { error } = await supabase
          .from('plano_categoria_personalizacao')
          .update(data)
          .eq('id', personalizacao.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('plano_categoria_personalizacao')
          .upsert(data, { onConflict: 'plano_id,lote_categoria_id' })
        if (error) throw error
      }

      setMessage('Período e peso meta personalizados para esta categoria.')
      onPlanChanged?.()
      await loadData()
    } catch (error: any) {
      setMessage(error.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const isBezerroAope = ['bezerro ao pé', 'bezerro ao pe', 'bezerra ao pé', 'bezerra ao pe'].includes(categoria.toLowerCase())

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${categoria.replace(/\b\w/g, (c) => c.toUpperCase())}${loteNome ? ` — ${loteNome}` : ''}`}
      size="md"
    >
      {loading ? (
        <div className="py-8 flex flex-col items-center gap-3 text-content-muted">
          <svg className="animate-spin h-6 w-6 text-content-faint" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-sm">Carregando...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {isBezerroAope ? (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-300">GMD de {categoria}</p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                Bezerros/bezerras ao pé usam GMD próprio (padrão: 0,600 / 0,500). Não há plano nutricional para esta categoria.
              </p>
              {gmdCategoria != null && (
                <p className="text-lg font-bold text-amber-700 dark:text-amber-300 mt-2">{gmdCategoria.toFixed(3).replace('.', ',')} kg/cab/dia</p>
              )}
            </div>
          ) : (
            <>
              {/* Plano vigente do lote */}
              {planoVigente ? (
                <div className="space-y-3">
                  {/* Header do plano vigente */}
                  <div className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-2 border-green-500/30 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-green-700 dark:text-green-300 uppercase tracking-wider">Plano Vigente</p>
                        <h4 className="text-base font-bold text-green-700 dark:text-green-300 mt-0.5">{planoVigente.nome}</h4>
                      </div>
                      <span className="px-2.5 py-1 bg-green-600 text-white text-xs font-bold rounded-full">Ativo</span>
                    </div>
                    <div className="flex flex-wrap gap-4 mt-2 text-xs text-content-muted">
                      <span><span className="text-content-muted">Início:</span> <span className="font-medium text-content-strong">{planoVigente.data_inicio ? new Date(planoVigente.data_inicio + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</span></span>
                      {formulacaoLote && <span><span className="text-content-muted">Formulação:</span> <span className="font-medium text-content-strong">{formulacaoLote.nome}</span></span>}
                    </div>
                  </div>

                  {/* Aviso: categoria não contemplada pela formulação */}
                  {gmdCategoria == null && formulacaoLoteId && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                      <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Categoria sem GMD</p>
                      <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                        O plano está ativo, mas a formulação "{formulacaoLote?.nome || 'vigente'}" não contempla a categoria "{categoria}". Esta categoria não evolui peso.
                      </p>
                      {onOpenFormulacao && formulacaoLoteId && (
                        <button
                          type="button"
                          onClick={() => onOpenFormulacao(formulacaoLoteId)}
                          className="mt-2 px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 transition-colors"
                        >
                          Editar formulação e adicionar categoria →
                        </button>
                      )}
                    </div>
                  )}

                  {/* Campos de personalização */}
                  <div className="bg-surface-1 border border-border-base rounded-lg p-3 space-y-3">
                    <p className="text-xs font-semibold text-content">Personalizar para esta categoria</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-content mb-1">Período (dias)</label>
                        <Input type="number" value={periodoDias} onChange={(e) => setPeriodoDias(e.target.value)} placeholder="Ex: 90" className="text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-content mb-1">Peso Meta (kg)</label>
                        <Input type="text" inputMode="decimal" value={pesoMetaKg} onChange={(e) => setPesoMetaKg(e.target.value)} placeholder="Ex: 500,00" className="text-sm" />
                      </div>
                    </div>
                    <p className="text-xs text-content-muted">
                      Se o período desta categoria terminar antes das outras, ela para de evoluir peso e aguarda o fim das demais.
                    </p>
                    <Button size="sm" onClick={handleSalvar} disabled={saving}>
                      {saving ? 'Salvando...' : 'Salvar Personalização'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    {planosFila.length > 0
                      ? 'Nenhum plano vigente no lote. Use a gestão de planos do lote para iniciar.'
                      : 'Nenhum plano cadastrado no lote. Use a gestão de planos do lote para criar.'}
                  </p>
                </div>
              )}

              {/* Resumo da fila do lote */}
              {planosFila.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-content-muted">
                  <span className="font-medium">Fila:</span>
                  {planosFila.map((p, i) => (
                    <span key={p.id} className="truncate">
                      {i > 0 && ' → '}
                      {p.nome} ({p.periodo_dias}d)
                    </span>
                  ))}
                </div>
              )}

              {/* GMD e peso atual como mini-cards */}
              <div className="grid grid-cols-2 gap-3">
                {gmdCategoria != null && (
                  <div className="bg-surface-2 border border-border-base rounded-lg p-3 text-center">
                    <p className="text-xs text-content-muted mb-1">GMD</p>
                    <p className="text-lg font-bold text-content-strong">{gmdCategoria.toFixed(3).replace('.', ',')}</p>
                    <p className="text-[10px] text-content-faint">kg/cab/dia</p>
                  </div>
                )}
                {pesoAtual != null && (
                  <div className="bg-surface-2 border border-border-base rounded-lg p-3 text-center">
                    <p className="text-xs text-content-muted mb-1">Peso Atual</p>
                    <p className="text-lg font-bold text-content-strong">{Number(pesoAtual).toFixed(2).replace('.', ',')}</p>
                    <p className="text-[10px] text-content-faint">kg/cab</p>
                  </div>
                )}
              </div>
            </>
          )}

          {message && (
            <div className={`p-3 rounded-lg text-sm ${message.includes('Erro') ? 'bg-red-500/10 text-red-700 dark:text-red-300' : 'bg-green-500/10 text-green-700 dark:text-green-300'}`}>
              {message}
            </div>
          )}

          {/* Botão para abrir modal completo do lote */}
          {onOpenLoteModal && !isBezerroAope && (
            <div className="border-t border-border-base pt-4">
              <Button variant="secondary" onClick={() => { onClose(); onOpenLoteModal(); }} className="w-full">
                Gerenciar Planos do Lote →
              </Button>
              <p className="text-xs text-content-faint text-center mt-1">
                Criar, encerrar, migrar e reordenar planos do lote
              </p>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
