import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@gestaup/supabase'
import { Button, Modal } from '@gestaup/ui'
import {
  categoriasDoPlano,
  isBezerroAoPe,
  modoPadrao,
  montarItens,
  parseNumero,
  periodoPorDataFinal,
  validarLinha,
  type CategoriaLinha,
  type LoteLinha,
  type ModoAtribuicao,
} from '../../utils/planoMassa'

interface Formulacao {
  id: string
  nome: string
}

interface ResultadoLote {
  lote_id: string
  ok: boolean
  plano_id: string | null
  erro: string | null
}

interface PlanoNutricionalMassaModalProps {
  isOpen: boolean
  onClose: () => void
  fazendaId: string
  loteIds: string[]
  onApplied: () => void
}

type Passo = 1 | 2 | 3

const MODOS: { valor: ModoAtribuicao; rotulo: string }[] = [
  { valor: 'migrar', rotulo: 'Migrar agora (encerra o vigente)' },
  { valor: 'iniciar', rotulo: 'Iniciar agora' },
  { valor: 'enfileirar', rotulo: 'Só enfileirar' },
]

const inputCls =
  'w-full px-2 py-1.5 border-2 border-surface-3 rounded-md bg-surface-1 text-content-strong text-sm focus:outline-none focus:border-primary disabled:bg-surface-2 disabled:text-content-faint'

const fmt = (n: number | null | undefined, casas = 2) =>
  n == null ? '—' : Number(n).toFixed(casas).replace('.', ',')

export function PlanoNutricionalMassaModal({ isOpen, onClose, fazendaId, loteIds, onApplied }: PlanoNutricionalMassaModalProps) {
  const [passo, setPasso] = useState<Passo>(1)
  const [formulacoes, setFormulacoes] = useState<Formulacao[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [formulacaoId, setFormulacaoId] = useState('')
  const [nomePlano, setNomePlano] = useState('')
  const [tipoPeriodo, setTipoPeriodo] = useState<'dias' | 'data_final'>('dias')
  const [periodoPadrao, setPeriodoPadrao] = useState('')
  const [dataFinal, setDataFinal] = useState('')
  const [pesoMetaPadrao, setPesoMetaPadrao] = useState('')

  const [linhas, setLinhas] = useState<LoteLinha[]>([])
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({})
  const [aplicando, setAplicando] = useState(false)
  const [resultados, setResultados] = useState<Record<string, ResultadoLote>>({})

  const periodoResolvido = tipoPeriodo === 'dias' ? parseNumero(periodoPadrao) : periodoPorDataFinal(dataFinal)

  useEffect(() => {
    if (!isOpen) return
    setPasso(1)
    setErro(null)
    setLinhas([])
    setResultados({})
    setExpandidos({})
    setFormulacaoId('')
    setNomePlano('')
    setPeriodoPadrao('')
    setDataFinal('')
    setPesoMetaPadrao('')
    setTipoPeriodo('dias')
    void (async () => {
      const { data, error } = await supabase
        .from('formulacoes')
        .select('id, nome')
        .eq('fazenda_id', fazendaId)
        .eq('ativo', true)
        .eq('e_premix', false)
        .eq('e_creep', false)
        .order('nome', { ascending: true })
      if (error) setErro(error.message)
      setFormulacoes((data as Formulacao[]) || [])
    })()
  }, [isOpen, fazendaId])

  const passo1Valido =
    !!formulacaoId &&
    !!nomePlano.trim() &&
    periodoResolvido != null && periodoResolvido > 0 && Number.isInteger(periodoResolvido) &&
    (parseNumero(pesoMetaPadrao) ?? 0) > 0

  const aoEscolherFormulacao = (id: string) => {
    setFormulacaoId(id)
    const f = formulacoes.find((x) => x.id === id)
    if (f) setNomePlano((atual) => atual.trim() ? atual : f.nome)
  }

  const prepararLinhas = async () => {
    setCarregando(true)
    setErro(null)
    try {
      const [lotesRes, catsRes, vigentesRes, gmdRes] = await Promise.all([
        supabase.from('lotes').select('id, nome, destino').eq('fazenda_id', fazendaId).in('id', loteIds),
        supabase
          .from('lote_categorias')
          .select('id, lote_id, categoria, quant_atual, peso_vivo_atual_kg_cab')
          .in('lote_id', loteIds)
          .eq('ativo', true)
          .is('data_fim', null)
          .order('categoria', { ascending: true }),
        supabase
          .from('planos_nutricionais')
          .select('lote_id, nome')
          .in('lote_id', loteIds)
          .eq('ativo', true)
          .is('data_fim', null),
        supabase.from('formulacao_categorias_gmd').select('categoria, gmd').eq('formulacao_id', formulacaoId),
      ])
      for (const r of [lotesRes, catsRes, vigentesRes, gmdRes]) if (r.error) throw r.error

      const gmdPorCategoria: Record<string, number> = {}
      ;(gmdRes.data || []).forEach((g: any) => { gmdPorCategoria[String(g.categoria).toLowerCase().trim()] = Number(g.gmd) })
      const vigentePorLote: Record<string, string> = {}
      ;(vigentesRes.data || []).forEach((p: any) => { vigentePorLote[p.lote_id] = p.nome })

      const novas: LoteLinha[] = ((lotesRes.data || []) as any[])
        .map((l) => {
          const enfermaria = l.destino === 'enfermaria'
          const categorias: CategoriaLinha[] = ((catsRes.data || []) as any[])
            .filter((c) => c.lote_id === l.id)
            .map((c) => {
              const base = gmdPorCategoria[String(c.categoria).toLowerCase().trim()]
              return {
                id: c.id,
                categoria: c.categoria,
                quantAtual: c.quant_atual,
                pesoAtual: c.peso_vivo_atual_kg_cab != null ? Number(c.peso_vivo_atual_kg_cab) : null,
                gmd: base == null || isBezerroAoPe(c.categoria) ? null : enfermaria ? base * 0.5 : base,
                periodo: '',
                pesoMeta: '',
              }
            })
          const vigenteNome = vigentePorLote[l.id] ?? null
          return {
            loteId: l.id,
            nome: l.nome,
            enfermaria,
            vigenteNome,
            modo: modoPadrao(!!vigenteNome),
            retroativo: false,
            nomePlano: nomePlano.trim(),
            periodo: String(periodoResolvido ?? ''),
            pesoMeta: pesoMetaPadrao,
            categorias,
          }
        })
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }))
      setLinhas(novas)
      setPasso(2)
    } catch (e: any) {
      setErro(e.message || 'Erro ao carregar os lotes selecionados')
    } finally {
      setCarregando(false)
    }
  }

  const atualizarLinha = (loteId: string, patch: Partial<LoteLinha>) =>
    setLinhas((prev) => prev.map((l) => (l.loteId === loteId ? { ...l, ...patch } : l)))

  const atualizarCategoria = (loteId: string, catId: string, patch: Partial<CategoriaLinha>) =>
    setLinhas((prev) =>
      prev.map((l) =>
        l.loteId === loteId ? { ...l, categorias: l.categorias.map((c) => (c.id === catId ? { ...c, ...patch } : c)) } : l,
      ),
    )

  const validacoes = useMemo(() => {
    const mapa: Record<string, ReturnType<typeof validarLinha>> = {}
    linhas.forEach((l) => { mapa[l.loteId] = validarLinha(l) })
    return mapa
  }, [linhas])

  const totalErros = linhas.filter((l) => validacoes[l.loteId]?.erros.length).length
  const jaAplicados = linhas.filter((l) => resultados[l.loteId]?.ok)
  const pendentes = linhas.filter((l) => !resultados[l.loteId]?.ok)
  const formulacaoNome = formulacoes.find((f) => f.id === formulacaoId)?.nome ?? ''

  const aplicar = async () => {
    const alvo = pendentes
    if (alvo.length === 0) return
    setAplicando(true)
    setErro(null)
    try {
      const { data, error } = await supabase.rpc('atribuir_plano_em_massa', {
        p_fazenda_id: fazendaId,
        p_formulacao_id: formulacaoId,
        p_itens: montarItens(alvo),
      })
      if (error) throw error
      const novos: Record<string, ResultadoLote> = {}
      ;((data as ResultadoLote[]) || []).forEach((r) => { novos[r.lote_id] = r })
      setResultados((prev) => ({ ...prev, ...novos }))
      onApplied()
    } catch (e: any) {
      setErro(e.message || 'Erro ao atribuir a dieta')
    } finally {
      setAplicando(false)
    }
  }

  const aplicarATodos = (campo: 'periodo' | 'pesoMeta', valor: string) =>
    setLinhas((prev) => prev.map((l) => ({ ...l, [campo]: valor })))

  const resumoModo = (l: LoteLinha) => {
    if (l.modo === 'migrar') return `Encerra "${l.vigenteNome}" e inicia o novo plano agora`
    if (l.modo === 'iniciar') return l.retroativo ? 'Inicia agora, de forma retroativa' : 'Inicia agora'
    return 'Entra no fim da fila, sem iniciar'
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { if (!aplicando) onClose() }}
      title={`Atribuir dieta em massa (${loteIds.length} ${loteIds.length === 1 ? 'lote' : 'lotes'})`}
      size="xl"
    >
      <div className="space-y-4">
        <ol className="flex gap-2 text-xs font-medium">
          {['Dieta e padrões', 'Ajuste por lote', 'Revisão'].map((t, i) => (
            <li key={t} className={`px-3 py-1 rounded-full border ${passo === i + 1 ? 'bg-primary text-white border-primary' : 'bg-surface-2 text-content-muted border-border-base'}`}>
              {i + 1}. {t}
            </li>
          ))}
        </ol>

        {/* ========== PASSO 1 ========== */}
        {passo === 1 && (
          <div className="space-y-3">
            <p className="text-xs text-content-muted">
              Escolha a dieta e os valores padrão. No próximo passo você ajusta cada lote e cada categoria.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-content mb-1">Formulação *</label>
                <select value={formulacaoId} onChange={(e) => aoEscolherFormulacao(e.target.value)} className={inputCls}>
                  <option value="">Selecione...</option>
                  {formulacoes.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-content mb-1">Nome do plano *</label>
                <input value={nomePlano} onChange={(e) => setNomePlano(e.target.value)} placeholder="Ex: Engorda Inicial" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-content mb-1">Duração padrão *</label>
                <div className="flex items-center gap-2">
                  {tipoPeriodo === 'dias' ? (
                    <input inputMode="numeric" value={periodoPadrao} onChange={(e) => setPeriodoPadrao(e.target.value.replace(/\D/g, ''))} placeholder="Ex: 90" className={inputCls} />
                  ) : (
                    <input type="date" value={dataFinal} onChange={(e) => setDataFinal(e.target.value)} className={inputCls} />
                  )}
                  {(['dias', 'data_final'] as const).map((t) => (
                    <button key={t} type="button" onClick={() => setTipoPeriodo(t)}
                      className={`px-3 py-1.5 rounded-lg border text-xs whitespace-nowrap ${tipoPeriodo === t ? 'bg-primary text-white border-primary' : 'bg-surface-2 text-content border-border-base'}`}>
                      {t === 'dias' ? 'Dias' : 'Data final'}
                    </button>
                  ))}
                </div>
                {tipoPeriodo === 'data_final' && periodoResolvido != null && (
                  <p className="text-xs text-content-muted mt-1">{periodoResolvido} dias a partir de hoje.</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-content mb-1">Peso meta padrão (kg) *</label>
                <input inputMode="decimal" value={pesoMetaPadrao} onChange={(e) => setPesoMetaPadrao(e.target.value)} placeholder="Ex: 500" className={inputCls} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={onClose}>Cancelar</Button>
              <Button onClick={prepararLinhas} disabled={!passo1Valido || carregando}>
                {carregando ? 'Carregando...' : 'Continuar'}
              </Button>
            </div>
          </div>
        )}

        {/* ========== PASSO 2 ========== */}
        {passo === 2 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-2 bg-surface-2 border border-border-base rounded-lg p-3">
              <p className="text-xs font-semibold text-content w-full">Aplicar a todos os lotes</p>
              <AplicarTodos rotulo="Período (dias)" onAplicar={(v) => aplicarATodos('periodo', v)} numerico />
              <AplicarTodos rotulo="Peso meta (kg)" onAplicar={(v) => aplicarATodos('pesoMeta', v)} />
            </div>

            <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
              {linhas.map((l) => {
                const v = validacoes[l.loteId]
                const aberto = expandidos[l.loteId]
                const cats = categoriasDoPlano(l)
                const aoPe = l.categorias.filter((c) => isBezerroAoPe(c.categoria))
                return (
                  <div key={l.loteId} className={`border rounded-lg p-3 space-y-2 ${v.erros.length ? 'border-red-500/40' : 'border-border-base'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-content-strong truncate">{l.nome}</p>
                        <p className="text-xs text-content-muted truncate">
                          {l.vigenteNome ? `Plano vigente: ${l.vigenteNome}` : 'Sem plano vigente'}
                        </p>
                      </div>
                      <button type="button" className="text-xs text-content-muted underline whitespace-nowrap"
                        onClick={() => setExpandidos((p) => ({ ...p, [l.loteId]: !aberto }))}>
                        {aberto ? 'Ocultar categorias' : `Categorias (${cats.length})`}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
                      <div className="col-span-2">
                        <label className="block text-xs text-content-muted mb-0.5">O que fazer</label>
                        <select value={l.modo} onChange={(e) => atualizarLinha(l.loteId, { modo: e.target.value as ModoAtribuicao })} className={inputCls}>
                          {MODOS.filter((m) => (m.valor === 'migrar' ? !!l.vigenteNome : m.valor === 'iniciar' ? !l.vigenteNome : true)).map((m) => (
                            <option key={m.valor} value={m.valor}>{m.rotulo}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-content-muted mb-0.5">Nome do plano</label>
                        <input value={l.nomePlano} onChange={(e) => atualizarLinha(l.loteId, { nomePlano: e.target.value })} className={inputCls} />
                      </div>
                      <div>
                        <label className="block text-xs text-content-muted mb-0.5">Período (dias)</label>
                        <input inputMode="numeric" value={l.periodo} onChange={(e) => atualizarLinha(l.loteId, { periodo: e.target.value.replace(/\D/g, '') })} className={inputCls} />
                      </div>
                      <div>
                        <label className="block text-xs text-content-muted mb-0.5">Peso meta (kg)</label>
                        <input inputMode="decimal" value={l.pesoMeta} onChange={(e) => atualizarLinha(l.loteId, { pesoMeta: e.target.value })} className={inputCls} />
                      </div>
                    </div>

                    {l.modo === 'iniciar' && (
                      <label className="flex items-center gap-2 text-xs text-content">
                        <input type="checkbox" checked={l.retroativo} onChange={(e) => atualizarLinha(l.loteId, { retroativo: e.target.checked })} />
                        Iniciar retroativo (projeta o peso a partir da data de pesagem de cada categoria)
                      </label>
                    )}

                    {aberto && (
                      <div className="overflow-x-auto border border-border-base rounded-lg">
                        <table className="w-full text-xs">
                          <thead className="bg-surface-2 text-content-muted text-left">
                            <tr>
                              <th className="py-1.5 px-2 font-medium">Categoria</th>
                              <th className="py-1.5 px-2 font-medium">Cab.</th>
                              <th className="py-1.5 px-2 font-medium">Peso atual</th>
                              <th className="py-1.5 px-2 font-medium">GMD</th>
                              <th className="py-1.5 px-2 font-medium w-28">Período</th>
                              <th className="py-1.5 px-2 font-medium w-32">Peso meta (kg)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cats.map((c) => (
                              <tr key={c.id} className="border-t border-border-subtle">
                                <td className="py-1.5 px-2 font-medium capitalize text-content-strong">{c.categoria}</td>
                                <td className="py-1.5 px-2 text-content-muted">{c.quantAtual ?? '—'}</td>
                                <td className="py-1.5 px-2 text-content-muted">{c.pesoAtual != null ? `${fmt(c.pesoAtual)} kg` : <span className="text-red-600 dark:text-red-200">sem peso</span>}</td>
                                <td className="py-1.5 px-2 text-content-muted">{c.gmd != null ? fmt(c.gmd, 3) : <span className="text-amber-700 dark:text-amber-200">sem GMD</span>}</td>
                                <td className="py-1.5 px-2">
                                  <input inputMode="numeric" disabled={l.modo === 'enfileirar'} value={c.periodo} placeholder={l.periodo}
                                    onChange={(e) => atualizarCategoria(l.loteId, c.id, { periodo: e.target.value.replace(/\D/g, '') })} className={inputCls} />
                                </td>
                                <td className="py-1.5 px-2">
                                  <input inputMode="decimal" disabled={l.modo === 'enfileirar'} value={c.pesoMeta} placeholder={l.pesoMeta}
                                    onChange={(e) => atualizarCategoria(l.loteId, c.id, { pesoMeta: e.target.value })} className={inputCls} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {aoPe.length > 0 && (
                          <p className="text-xs text-amber-700 dark:text-amber-200 px-2 py-1.5 border-t border-border-subtle">
                            {aoPe.map((c) => c.categoria).join(' e ')}: fora do plano (creep é gerenciado no modal do lote).
                          </p>
                        )}
                        {l.modo === 'enfileirar' && (
                          <p className="text-xs text-content-muted px-2 py-1.5 border-t border-border-subtle">
                            Ao só enfileirar, a personalização por categoria fica para depois de iniciar o plano.
                          </p>
                        )}
                      </div>
                    )}

                    {v.erros.map((m) => <p key={m} className="text-xs text-red-600 dark:text-red-200">• {m}</p>)}
                    {v.avisos.map((m) => <p key={m} className="text-xs text-amber-700 dark:text-amber-200">• {m}</p>)}
                  </div>
                )
              })}
            </div>

            {erro && <div className="p-3 rounded-lg text-sm bg-red-500/10 text-red-600 dark:text-red-200">{erro}</div>}
            <div className="flex justify-between gap-2 pt-1">
              <Button variant="secondary" onClick={() => setPasso(1)}>Voltar</Button>
              <div className="flex items-center gap-3">
                {totalErros > 0 && <span className="text-xs text-red-600 dark:text-red-200">{totalErros} {totalErros === 1 ? 'lote com erro' : 'lotes com erro'}</span>}
                <Button onClick={() => setPasso(3)} disabled={totalErros > 0 || linhas.length === 0}>Revisar</Button>
              </div>
            </div>
          </div>
        )}

        {/* ========== PASSO 3 ========== */}
        {passo === 3 && (
          <div className="space-y-3">
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 text-sm text-content-strong">
              Dieta <strong>{formulacaoNome}</strong> em <strong>{linhas.length}</strong> {linhas.length === 1 ? 'lote' : 'lotes'}.
              Cada lote é aplicado de forma independente: se um falhar, os outros continuam.
            </div>
            <div className="border border-border-base rounded-lg divide-y divide-border-base max-h-[50vh] overflow-y-auto">
              {linhas.map((l) => {
                const r = resultados[l.loteId]
                return (
                  <div key={l.loteId} className="px-3 py-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-content-strong truncate">{l.nome}</p>
                      <p className="text-xs text-content-muted">
                        {resumoModo(l)} • {l.nomePlano} • {l.periodo} dias • meta {fmt(parseNumero(l.pesoMeta))} kg
                      </p>
                      {r && !r.ok && <p className="text-xs text-red-600 dark:text-red-200 mt-0.5">{r.erro}</p>}
                    </div>
                    {r && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${r.ok ? 'bg-primary/15 text-primary' : 'bg-red-500/10 text-red-600 dark:text-red-200'}`}>
                        {r.ok ? 'Aplicado' : 'Falhou'}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
            {erro && <div className="p-3 rounded-lg text-sm bg-red-500/10 text-red-600 dark:text-red-200">{erro}</div>}
            <div className="flex justify-between gap-2 pt-1">
              <Button variant="secondary" onClick={() => setPasso(2)} disabled={aplicando}>Voltar e ajustar</Button>
              <div className="flex gap-2">
                {jaAplicados.length > 0 && <Button variant="secondary" onClick={onClose} disabled={aplicando}>Fechar</Button>}
                {pendentes.length > 0 && (
                  <Button onClick={aplicar} disabled={aplicando}>
                    {aplicando
                      ? 'Aplicando...'
                      : jaAplicados.length > 0
                        ? `Tentar de novo (${pendentes.length})`
                        : `Aplicar em ${pendentes.length} ${pendentes.length === 1 ? 'lote' : 'lotes'}`}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

function AplicarTodos({ rotulo, onAplicar, numerico }: { rotulo: string; onAplicar: (v: string) => void; numerico?: boolean }) {
  const [valor, setValor] = useState('')
  return (
    <div className="flex items-end gap-1">
      <div>
        <label className="block text-xs text-content-muted mb-0.5">{rotulo}</label>
        <input inputMode={numerico ? 'numeric' : 'decimal'} value={valor}
          onChange={(e) => setValor(numerico ? e.target.value.replace(/\D/g, '') : e.target.value)} className={`${inputCls} w-32`} />
      </div>
      <Button size="sm" variant="secondary" disabled={!valor} onClick={() => onAplicar(valor)}>Aplicar</Button>
    </div>
  )
}
