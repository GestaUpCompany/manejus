import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, Input, Select, Modal, CardSkeleton, EmptyState } from '../../components/ui'
import { getFazendaIdForUser, getFazendaNome } from '../../utils/fazendaContext'
import { formatDate } from '../../utils/formatDate'

interface InsumoItem {
  id: string
  nome: string
  tipo: string | null
  unidade: string | null
  estoque_atual: number
  estoque_minimo: number
  custo_unitario: number
  controla_estoque: boolean
  ativo: boolean
}

interface FormulacaoItem {
  id: string
  nome: string
  tipo: string | null
  e_premix: boolean
  estoque_atual: number
  estoque_minimo: number
  custo_unitario: number
  controla_estoque: boolean
  ativo: boolean
}

type ItemTipo = 'insumo' | 'formulacao'
type Tab = 'insumos' | 'formulacoes'

interface Movimentacao {
  id: string
  tipo_movimentacao: string
  quantidade: number
  custo_unitario: number | null
  valor_total: number | null
  data: string | null
  origem: string | null
  observacao: string | null
  created_at: string
}

const ORIGEM_LABEL: Record<string, string> = {
  estoque_inicial: 'Estoque Inicial',
  painel_entrada: 'Entrada Manual',
  painel_ajuste: 'Ajuste Manual',
  entrada_insumos: 'Recebimento (App)',
  saida_insumos: 'Produção (App)',
  fabrica_confinamento: 'Fábrica (App)',
  suplementacao: 'Consumo (App)',
}

const TIPO_MOV_LABEL: Record<string, string> = {
  entrada: 'Entrada',
  baixa: 'Baixa',
  producao: 'Produção',
  consumo: 'Consumo',
  ajuste: 'Ajuste',
  estorno: 'Estorno',
}

export function EstoqueSuplementacao() {
  const { user } = useAuth()
  const [fazendaId, setFazendaId] = useState<string | null>(null)
  const [fazendaNome, setFazendaNome] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('insumos')

  const [insumos, setInsumos] = useState<InsumoItem[]>([])
  const [formulacoes, setFormulacoes] = useState<FormulacaoItem[]>([])

  // Filtro: mostrar apenas itens com movimentação
  const [mostrarApenasComMovimentacao, setMostrarApenasComMovimentacao] = useState(false)
  const [itemsComMovimentacao, setItemsComMovimentacao] = useState<Set<string>>(new Set())

  // Edição inline de estoque mínimo
  const [editandoMinimoId, setEditandoMinimoId] = useState<string | null>(null)
  const [valorMinimoEditando, setValorMinimoEditando] = useState('')
  const [salvandoMinimo, setSalvandoMinimo] = useState(false)

  // Modais
  const [modalEntrada, setModalEntrada] = useState(false)
  const [modalAjuste, setModalAjuste] = useState(false)
  const [modalHistorico, setModalHistorico] = useState<{ tipo: ItemTipo; id: string; nome: string } | null>(null)
  const [historicoMovs, setHistoricoMovs] = useState<Movimentacao[]>([])
  const [historicoLoading, setHistoricoLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form entrada
  const [entradaForm, setEntradaForm] = useState({
    item_tipo: 'insumo' as ItemTipo,
    item_id: '',
    quantidade: '',
    custo_unitario: '',
    observacao: '',
  })

  // Form ajuste
  const [ajusteForm, setAjusteForm] = useState({
    item_tipo: 'insumo' as ItemTipo,
    item_id: '',
    novo_saldo: '',
    observacao: '',
  })

  const loadAll = useCallback(async () => {
    if (!fazendaId) return
    setLoading(true)
    try {
      const [insumosRes, formulacoesRes, movsRes] = await Promise.all([
        supabase
          .from('insumos')
          .select('id, nome, tipo, unidade, estoque_atual, estoque_minimo, custo_unitario, controla_estoque, ativo')
          .eq('fazenda_id', fazendaId)
          .order('nome'),
        supabase
          .from('formulacoes')
          .select('id, nome, tipo, e_premix, estoque_atual, estoque_minimo, custo_unitario, controla_estoque, ativo')
          .eq('fazenda_id', fazendaId)
          .is('deleted_at', null)
          .order('nome'),
        supabase
          .from('movimentacoes_estoque_suplementos')
          .select('item_id')
          .eq('fazenda_id', fazendaId)
          .is('deleted_at', null),
      ])

      if (insumosRes.error) throw insumosRes.error
      if (formulacoesRes.error) throw formulacoesRes.error
      if (movsRes.error) throw movsRes.error

      setInsumos((insumosRes.data as InsumoItem[]) || [])
      setFormulacoes((formulacoesRes.data as FormulacaoItem[]) || [])

      // Set de item_ids que possuem pelo menos uma movimentação
      const idsComMov = new Set<string>((movsRes.data || []).map((m: any) => m.item_id))
      setItemsComMovimentacao(idsComMov)
    } catch (err) {
      console.error('Erro ao carregar estoque:', err)
      setError('Erro ao carregar dados do estoque')
    } finally {
      setLoading(false)
    }
  }, [fazendaId])

  useEffect(() => {
    if (!user) return
    ;(async () => {
      const fid = await getFazendaIdForUser(user.id)
      setFazendaId(fid)
      if (fid) getFazendaNome(fid).then(setFazendaNome)
    })()
  }, [user])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Filtrar itens ativos (controla_estoque é true por padrão agora)
  const insumosAtivos = insumos.filter((i) => i.ativo)
  const formulacoesAtivas = formulacoes.filter((f) => f.ativo)

  // Aplicar filtro de movimentação se ativo
  const insumosFiltrados = mostrarApenasComMovimentacao
    ? insumosAtivos.filter((i) => itemsComMovimentacao.has(i.id))
    : insumosAtivos
  const formulacoesFiltradas = mostrarApenasComMovimentacao
    ? formulacoesAtivas.filter((f) => itemsComMovimentacao.has(f.id))
    : formulacoesAtivas

  const saldoTotalInsumos = insumosAtivos.reduce((sum, i) => sum + Number(i.estoque_atual), 0)
  const valorTotalInsumos = insumosAtivos.reduce((sum, i) => sum + Number(i.estoque_atual) * Number(i.custo_unitario), 0)
  const saldoTotalFormulacoes = formulacoesAtivas.reduce((sum, f) => sum + Number(f.estoque_atual), 0)
  const valorTotalFormulacoes = formulacoesAtivas.reduce((sum, f) => sum + Number(f.estoque_atual) * Number(f.custo_unitario), 0)

  const insumosEmAlerta = insumosAtivos.filter((i) => i.estoque_minimo > 0 && Number(i.estoque_atual) <= Number(i.estoque_minimo))
  const formulacoesEmAlerta = formulacoesAtivas.filter((f) => f.estoque_minimo > 0 && Number(f.estoque_atual) <= Number(f.estoque_minimo))

  // Handlers
  const salvarEstoqueMinimo = async (itemTipo: ItemTipo, itemId: string) => {
    const novoMinimo = parseFloat(valorMinimoEditando) || 0
    setSalvandoMinimo(true)
    try {
      const tabela = itemTipo === 'insumo' ? 'insumos' : 'formulacoes'
      const { error: updError } = await supabase
        .from(tabela)
        .update({ estoque_minimo: novoMinimo })
        .eq('id', itemId)
      if (updError) throw updError
      setEditandoMinimoId(null)
      loadAll()
    } catch (err: any) {
      setError(err.message || 'Erro ao atualizar estoque mínimo')
    } finally {
      setSalvandoMinimo(false)
    }
  }

  const iniciarEdicaoMinimo = (itemId: string, valorAtual: number) => {
    setEditandoMinimoId(itemId)
    setValorMinimoEditando(String(valorAtual))
  }

  const abrirModalEntrada = () => {
    setEntradaForm({ item_tipo: tab === 'insumos' ? 'insumo' : 'formulacao', item_id: '', quantidade: '', custo_unitario: '', observacao: '' })
    setModalEntrada(true)
  }

  const salvarEntrada = async () => {
    if (!fazendaId || !entradaForm.item_id || !entradaForm.quantidade || !entradaForm.custo_unitario) return
    setSubmitting(true)
    setError(null)
    try {
      const qtd = parseFloat(entradaForm.quantidade)
      const custo = parseFloat(entradaForm.custo_unitario)
      const valorTotal = Math.round(qtd * custo * 100) / 100

      const { error: movError } = await supabase.from('movimentacoes_estoque_suplementos').insert({
        fazenda_id: fazendaId,
        item_tipo: entradaForm.item_tipo,
        item_id: entradaForm.item_id,
        tipo_movimentacao: 'entrada',
        quantidade: qtd,
        custo_unitario: custo,
        valor_total: valorTotal,
        origem: 'painel_entrada',
        data: new Date().toISOString().split('T')[0],
        observacao: entradaForm.observacao || null,
      })
      if (movError) throw movError

      setModalEntrada(false)
      loadAll()
    } catch (err: any) {
      setError(err.message || 'Erro ao registrar entrada')
    } finally {
      setSubmitting(false)
    }
  }

  const abrirModalAjuste = () => {
    setAjusteForm({ item_tipo: tab === 'insumos' ? 'insumo' : 'formulacao', item_id: '', novo_saldo: '', observacao: '' })
    setModalAjuste(true)
  }

  const salvarAjuste = async () => {
    if (!fazendaId || !ajusteForm.item_id || !ajusteForm.novo_saldo) return
    setSubmitting(true)
    setError(null)
    try {
      const novoSaldo = parseFloat(ajusteForm.novo_saldo)

      const { error: movError } = await supabase.from('movimentacoes_estoque_suplementos').insert({
        fazenda_id: fazendaId,
        item_tipo: ajusteForm.item_tipo,
        item_id: ajusteForm.item_id,
        tipo_movimentacao: 'ajuste',
        quantidade: novoSaldo,
        origem: 'painel_ajuste',
        data: new Date().toISOString().split('T')[0],
        observacao: ajusteForm.observacao || 'Ajuste manual de saldo',
      })
      if (movError) throw movError

      setModalAjuste(false)
      loadAll()
    } catch (err: any) {
      setError(err.message || 'Erro ao registrar ajuste')
    } finally {
      setSubmitting(false)
    }
  }

  const abrirModalHistorico = async (tipo: ItemTipo, id: string, nome: string) => {
    setModalHistorico({ tipo, id, nome })
    setHistoricoLoading(true)
    try {
      const { data, error } = await supabase
        .from('movimentacoes_estoque_suplementos')
        .select('id, tipo_movimentacao, quantidade, custo_unitario, valor_total, data, origem, observacao, created_at')
        .eq('item_tipo', tipo)
        .eq('item_id', id)
        .eq('fazenda_id', fazendaId!)
        .is('deleted_at', null)
        .order('data', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      setHistoricoMovs((data as Movimentacao[]) || [])
    } catch (err: any) {
      console.error('Erro ao carregar histórico:', err)
      setHistoricoMovs([])
    } finally {
      setHistoricoLoading(false)
    }
  }

  // Opções para selects (todos os itens ativos, não apenas os com movimentação)
  const insumosOptions = insumosAtivos.map((i) => ({
    value: i.id,
    label: `${i.nome}${i.unidade ? ` (${i.unidade})` : ''}`,
  }))
  const formulacoesOptions = formulacoesAtivas.map((f) => ({
    value: f.id,
    label: `${f.nome}${f.e_premix ? ' (premix)' : ''}`,
  }))

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    )
  }

  const renderCard = (item: InsumoItem | FormulacaoItem, tipo: ItemTipo) => {
    const saldo = Number(item.estoque_atual)
    const custo = Number(item.custo_unitario)
    const valorEstoque = saldo * custo
    const emAlerta = item.estoque_minimo > 0 && saldo <= Number(item.estoque_minimo)
    const negativo = saldo < 0
    const temMovimentacao = itemsComMovimentacao.has(item.id)
    const editandoEste = editandoMinimoId === item.id
    const pctSaude = item.estoque_minimo > 0
      ? Math.min(100, (saldo / Number(item.estoque_minimo)) * 100)
      : null

    return (
      <Card key={item.id} className="bg-surface-1 p-4 sm:p-5 h-full" disableHover>
        <div className="flex flex-col 2xl:flex-row justify-between items-start gap-3 mb-3">
          <div className="min-w-0 flex-1 w-full 2xl:min-w-[140px]">
            <p className="font-semibold text-content-strong truncate">{item.nome}</p>
            <p className="text-xs text-content-muted truncate">
              {tipo === 'insumo' ? 'Insumo' : 'Produto Final'}
              {tipo === 'formulacao' && (item as FormulacaoItem).e_premix && ' · Premix'}
              {!temMovimentacao && <span className="text-content-faint"> · Sem movimentação</span>}
            </p>
          </div>
          <div className="flex flex-wrap 2xl:flex-nowrap items-center gap-2 w-full 2xl:w-auto">
            {emAlerta && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-700 dark:text-red-300">Alerta</span>
            )}
            {negativo && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300">Negativo</span>
            )}
            <button
              onClick={() => iniciarEdicaoMinimo(item.id, Number(item.estoque_minimo))}
              className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary dark:text-primary-light transition-colors hover:bg-primary/10"
              title="Editar estoque mínimo"
            >
              Editar
            </button>
            <button
              onClick={() => abrirModalHistorico(tipo, item.id, item.nome)}
              className="inline-flex items-center gap-1 rounded-lg border border-border-base bg-surface-2 px-2.5 py-1 text-xs font-semibold text-content transition-colors hover:bg-surface-2"
              title="Ver histórico"
            >
              Histórico
            </button>
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-content-muted">Saldo atual</span>
            <span className={`font-semibold ${negativo ? 'text-red-500' : 'text-content-strong'}`}>
              {saldo.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-content-muted">Custo médio</span>
            <span className="text-content">R$ {custo.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}/kg</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-content-muted">Valor em estoque</span>
            <span className="font-semibold text-content-strong">R$ {valorEstoque.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-content-muted">Estoque mínimo</span>
            {editandoEste ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={valorMinimoEditando}
                  onChange={(e) => setValorMinimoEditando(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') salvarEstoqueMinimo(tipo, item.id)
                    if (e.key === 'Escape') setEditandoMinimoId(null)
                  }}
                  className="w-20 rounded border border-surface-3 px-1.5 py-0.5 text-right text-sm"
                  autoFocus
                  disabled={salvandoMinimo}
                />
                <button
                  onClick={() => salvarEstoqueMinimo(tipo, item.id)}
                  disabled={salvandoMinimo}
                  className="rounded bg-blue-500 px-1.5 py-0.5 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
                >
                  OK
                </button>
                <button
                  onClick={() => setEditandoMinimoId(null)}
                  disabled={salvandoMinimo}
                  className="rounded bg-surface-3 px-1.5 py-0.5 text-xs font-semibold text-content-muted hover:bg-surface-2"
                >
                  ✕
                </button>
              </div>
            ) : (
              <span className="font-medium text-content">
                {Number(item.estoque_minimo).toLocaleString('pt-BR')} kg
              </span>
            )}
          </div>
          {/* Barra de saúde do estoque vs estoque mínimo */}
          {item.estoque_minimo > 0 && pctSaude !== null && (
            <div className="mt-3">
              <div className="w-full bg-surface-3 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    pctSaude < 100 ? 'bg-red-500' : pctSaude <= 150 ? 'bg-yellow-500' : 'bg-primary'
                  }`}
                  style={{ width: `${pctSaude}%` }}
                />
              </div>
              <p className="text-xs text-content-muted mt-1">
                {pctSaude < 100
                  ? `${pctSaude.toFixed(0)}% do estoque mínimo`
                  : pctSaude === 100
                    ? 'Estoque no limite mínimo'
                    : `${pctSaude.toFixed(0)}% acima do mínimo`}
              </p>
            </div>
          )}
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-content-strong">Estoque de Suplementação</h2>
          {fazendaNome && <p className="text-sm text-content-muted mt-1">{fazendaNome}</p>}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" onClick={abrirModalAjuste}>Ajuste</Button>
          <Button onClick={abrirModalEntrada}>Registrar Entrada</Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-300 rounded-xl p-4">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="text-xs text-red-500 underline mt-1">Fechar</button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 items-stretch">
        <Card className="bg-surface-1 p-4 sm:p-5 h-full" disableHover>
          <p className="text-xs sm:text-sm text-content-muted font-medium">Saldo Insumos</p>
          <p className="text-base sm:text-lg xl:text-xl font-bold text-content-strong mt-1">{saldoTotalInsumos.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg</p>
        </Card>
        <Card className="bg-surface-1 p-4 sm:p-5 h-full" disableHover>
          <p className="text-xs sm:text-sm text-content-muted font-medium">Valor Insumos</p>
          <p className="text-base sm:text-lg xl:text-xl font-bold text-content-strong mt-1">R$ {valorTotalInsumos.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </Card>
        <Card className="bg-surface-1 p-4 sm:p-5 h-full" disableHover>
          <p className="text-xs sm:text-sm text-content-muted font-medium">Saldo Produtos Finais</p>
          <p className="text-base sm:text-lg xl:text-xl font-bold text-content-strong mt-1">{saldoTotalFormulacoes.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg</p>
        </Card>
        <Card className="bg-surface-1 p-4 sm:p-5 h-full" disableHover>
          <p className="text-xs sm:text-sm text-content-muted font-medium">Valor Produtos Finais</p>
          <p className="text-base sm:text-lg xl:text-xl font-bold text-content-strong mt-1">R$ {valorTotalFormulacoes.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </Card>
      </div>

      {/* Alertas */}
      {(insumosEmAlerta.length > 0 || formulacoesEmAlerta.length > 0) && (
        <div className="bg-red-500/10 border border-red-300 rounded-xl p-4">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">
            {insumosEmAlerta.length + formulacoesEmAlerta.length} item(s) com estoque baixo:
          </p>
          <p className="text-xs text-red-500 mt-1">
            {insumosEmAlerta.map((i) => i.nome).concat(formulacoesEmAlerta.map((f) => f.nome)).join(', ')}
          </p>
        </div>
      )}

      {/* Filtro + Tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex gap-2 border-b border-border-base">
          <button
            onClick={() => setTab('insumos')}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
              tab === 'insumos' ? 'border-blue-500 text-primary dark:text-primary-light' : 'border-transparent text-content-muted hover:text-content'
            }`}
          >
            Insumos ({insumosFiltrados.length}{mostrarApenasComMovimentacao && insumosFiltrados.length < insumosAtivos.length ? ` de ${insumosAtivos.length}` : ''})
          </button>
          <button
            onClick={() => setTab('formulacoes')}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
              tab === 'formulacoes' ? 'border-blue-500 text-primary dark:text-primary-light' : 'border-transparent text-content-muted hover:text-content'
            }`}
          >
            Produtos Finais ({formulacoesFiltradas.length}{mostrarApenasComMovimentacao && formulacoesFiltradas.length < formulacoesAtivas.length ? ` de ${formulacoesAtivas.length}` : ''})
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm text-content-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={mostrarApenasComMovimentacao}
            onChange={(e) => setMostrarApenasComMovimentacao(e.target.checked)}
            className="rounded border-surface-3 text-primary dark:text-primary-light focus:ring-blue-500"
          />
          Mostrar apenas itens com movimentação
        </label>
      </div>

      {/* Lista de itens */}
      {tab === 'insumos' ? (
        insumosFiltrados.length === 0 ? (
          <Card className="bg-surface-1 p-6" disableHover>
            <EmptyState
              title={insumosAtivos.length === 0 ? "Nenhum insumo cadastrado" : "Nenhum insumo com movimentação"}
              description={insumosAtivos.length === 0
                ? "Cadastre insumos na aba de Insumos para que eles apareçam aqui automaticamente."
                : "Todos os insumos ativos ainda estão sem movimentação. Registre uma entrada ou desmarque o filtro para ver todos."}
              action={insumosAtivos.length > 0
                ? <Button variant="secondary" onClick={() => setMostrarApenasComMovimentacao(false)}>Mostrar todos</Button>
                : undefined}
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {insumosFiltrados.map((i) => renderCard(i, 'insumo'))}
          </div>
        )
      ) : (
        formulacoesFiltradas.length === 0 ? (
          <Card className="bg-surface-1 p-6" disableHover>
            <EmptyState
              title={formulacoesAtivas.length === 0 ? "Nenhum produto final cadastrado" : "Nenhum produto final com movimentação"}
              description={formulacoesAtivas.length === 0
                ? "Cadastre formulações para que elas apareçam aqui automaticamente."
                : "Todos os produtos finais ativos ainda estão sem movimentação. Registre uma entrada ou desmarque o filtro para ver todos."}
              action={formulacoesAtivas.length > 0
                ? <Button variant="secondary" onClick={() => setMostrarApenasComMovimentacao(false)}>Mostrar todos</Button>
                : undefined}
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {formulacoesFiltradas.map((f) => renderCard(f, 'formulacao'))}
          </div>
        )
      )}

      {/* Modal: Registrar Entrada */}
      <Modal isOpen={modalEntrada} onClose={() => setModalEntrada(false)} title="Registrar Entrada" size="md">
        <div className="space-y-4">
          <Select
            label="Tipo de item"
            options={[
              { value: 'insumo', label: 'Insumo' },
              { value: 'formulacao', label: 'Produto Final (Formulação)' },
            ]}
            value={entradaForm.item_tipo}
            onChange={(val) => setEntradaForm({ ...entradaForm, item_tipo: val as ItemTipo, item_id: '' })}
            placeholder="Selecione..."
            required
          />
          <Select
            label="Item"
            options={entradaForm.item_tipo === 'insumo' ? insumosOptions : formulacoesOptions}
            value={entradaForm.item_id}
            onChange={(val) => setEntradaForm({ ...entradaForm, item_id: val })}
            placeholder="Selecione o item..."
            required
          />
          <Input
            label="Quantidade (kg)"
            type="number"
            placeholder="Ex: 500"
            value={entradaForm.quantidade}
            onChange={(e) => setEntradaForm({ ...entradaForm, quantidade: e.target.value })}
            required
          />
          <Input
            label="Custo Unitário (R$/kg)"
            type="number"
            placeholder="Ex: 3.20"
            value={entradaForm.custo_unitario}
            onChange={(e) => setEntradaForm({ ...entradaForm, custo_unitario: e.target.value })}
            required
          />
          {entradaForm.quantidade && entradaForm.custo_unitario && (() => {
            const qtd = parseFloat(entradaForm.quantidade) || 0
            const custo = parseFloat(entradaForm.custo_unitario) || 0
            const total = qtd * custo
            if (total > 0) {
              return (
                <div className="bg-primary/10 border border-primary/30 rounded-lg p-3">
                  <p className="text-sm text-primary dark:text-primary-light">
                    <span className="font-bold">Valor total: R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </p>
                </div>
              )
            }
            return null
          })()}
          <Input
            label="Observação"
            placeholder="Detalhes adicionais (opcional)"
            value={entradaForm.observacao}
            onChange={(e) => setEntradaForm({ ...entradaForm, observacao: e.target.value })}
          />
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => setModalEntrada(false)}>Cancelar</Button>
            <Button onClick={salvarEntrada} disabled={submitting || !entradaForm.item_id || !entradaForm.quantidade || !entradaForm.custo_unitario}>
              {submitting ? 'Salvando...' : 'Registrar Entrada'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Ajuste de Saldo */}
      <Modal isOpen={modalAjuste} onClose={() => setModalAjuste(false)} title="Ajuste de Saldo" size="md">
        <div className="space-y-4">
          <Select
            label="Tipo de item"
            options={[
              { value: 'insumo', label: 'Insumo' },
              { value: 'formulacao', label: 'Produto Final (Formulação)' },
            ]}
            value={ajusteForm.item_tipo}
            onChange={(val) => setAjusteForm({ ...ajusteForm, item_tipo: val as ItemTipo, item_id: '' })}
            placeholder="Selecione..."
            required
          />
          <Select
            label="Item"
            options={ajusteForm.item_tipo === 'insumo' ? insumosOptions : formulacoesOptions}
            value={ajusteForm.item_id}
            onChange={(val) => setAjusteForm({ ...ajusteForm, item_id: val })}
            placeholder="Selecione o item..."
            required
          />
          <Input
            label="Novo Saldo (kg)"
            type="number"
            placeholder="Ex: 850"
            value={ajusteForm.novo_saldo}
            onChange={(e) => setAjusteForm({ ...ajusteForm, novo_saldo: e.target.value })}
            required
          />
          <p className="text-xs text-content-muted">
            O ajuste define o saldo absoluto. O custo médio não é alterado. Use para correções de inventário.
          </p>
          <Input
            label="Observação"
            placeholder="Motivo do ajuste (opcional)"
            value={ajusteForm.observacao}
            onChange={(e) => setAjusteForm({ ...ajusteForm, observacao: e.target.value })}
          />
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => setModalAjuste(false)}>Cancelar</Button>
            <Button onClick={salvarAjuste} disabled={submitting || !ajusteForm.item_id || !ajusteForm.novo_saldo}>
              {submitting ? 'Salvando...' : 'Aplicar Ajuste'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Histórico */}
      <Modal
        isOpen={!!modalHistorico}
        onClose={() => setModalHistorico(null)}
        title={modalHistorico ? `Histórico — ${modalHistorico.nome}` : 'Histórico'}
        size="lg"
      >
        {modalHistorico && (() => {
          const entradas = historicoMovs.filter((m) => m.tipo_movimentacao === 'entrada' || m.tipo_movimentacao === 'producao')
          const saidas = historicoMovs.filter((m) => ['baixa', 'consumo', 'estorno'].includes(m.tipo_movimentacao))
          const ajustes = historicoMovs.filter((m) => m.tipo_movimentacao === 'ajuste')
          const totalEntradas = entradas.reduce((sum, m) => sum + Number(m.quantidade), 0)
          const totalSaidas = saidas.reduce((sum, m) => sum + Number(m.quantidade), 0)

          return (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="bg-green-500/10 rounded-lg p-3">
                  <p className="text-xs text-green-500">Total Entradas</p>
                  <p className="text-lg font-bold text-green-700 dark:text-green-300">{totalEntradas.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg</p>
                </div>
                <div className="bg-red-500/10 rounded-lg p-3">
                  <p className="text-xs text-red-500">Total Saídas</p>
                  <p className="text-lg font-bold text-red-700 dark:text-red-300">{totalSaidas.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg</p>
                </div>
                <div className="bg-surface-2 rounded-lg p-3">
                  <p className="text-xs text-content-muted">Ajustes</p>
                  <p className="text-lg font-bold text-content">{ajustes.length}</p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-content mb-2">Linha do Tempo</h4>
                {historicoLoading ? (
                  <div className="text-center py-8 text-content-muted">Carregando movimentações...</div>
                ) : historicoMovs.length === 0 ? (
                  <div className="text-center py-8 text-content-muted">Nenhuma movimentação registrada.</div>
                ) : (
                  <div className="max-h-96 overflow-y-auto space-y-2">
                    {historicoMovs.map((mov) => {
                      const isEntrada = mov.tipo_movimentacao === 'entrada' || mov.tipo_movimentacao === 'producao'
                      const isAjuste = mov.tipo_movimentacao === 'ajuste'
                      const valor = Number(mov.valor_total || (Number(mov.quantidade) * Number(mov.custo_unitario || 0)))
                      return (
                        <div
                          key={mov.id}
                          className={`flex items-start gap-3 rounded-lg border p-3 ${
                            isAjuste ? 'border-border-base bg-surface-2' : isEntrada ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'
                          }`}
                        >
                          <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                            isAjuste ? 'bg-surface-2 text-content' : isEntrada ? 'bg-green-500/10 text-green-700 dark:text-green-300' : 'bg-red-500/10 text-red-700 dark:text-red-300'
                          }`}>
                            {isAjuste ? '=' : isEntrada ? '↓' : '↑'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="text-sm font-semibold text-content-strong">
                                  {TIPO_MOV_LABEL[mov.tipo_movimentacao] || mov.tipo_movimentacao} — {Number(mov.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg
                                </p>
                                <p className="text-xs text-content-muted">
                                  {mov.data ? formatDate(mov.data) : '-'} · {ORIGEM_LABEL[mov.origem || ''] || mov.origem || '-'}
                                </p>
                              </div>
                              {valor > 0 && (
                                <div className="text-right">
                                  <p className="text-sm font-semibold text-content-strong">
                                    R$ {valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </p>
                                  {mov.custo_unitario && (
                                    <p className="text-xs text-content-muted">
                                      R$ {Number(mov.custo_unitario).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}/kg
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                            {mov.observacao && (
                              <p className="text-xs text-content-muted mt-1">{mov.observacao}</p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <Button variant="secondary" onClick={() => setModalHistorico(null)}>Fechar</Button>
              </div>
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
