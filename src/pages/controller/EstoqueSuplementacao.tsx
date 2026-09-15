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

  // Modais
  const [modalInstanciar, setModalInstanciar] = useState(false)
  const [modalEntrada, setModalEntrada] = useState(false)
  const [modalAjuste, setModalAjuste] = useState(false)
  const [modalHistorico, setModalHistorico] = useState<{ tipo: ItemTipo; id: string; nome: string } | null>(null)
  const [historicoMovs, setHistoricoMovs] = useState<Movimentacao[]>([])
  const [historicoLoading, setHistoricoLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form instanciar
  const [instanciarForm, setInstanciarForm] = useState({
    item_tipo: 'insumo' as ItemTipo,
    item_id: '',
    estoque_inicial: '',
    custo_unitario: '',
    estoque_minimo: '',
  })

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
      const [insumosRes, formulacoesRes] = await Promise.all([
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
      ])

      if (insumosRes.error) throw insumosRes.error
      if (formulacoesRes.error) throw formulacoesRes.error

      setInsumos((insumosRes.data as InsumoItem[]) || [])
      setFormulacoes((formulacoesRes.data as FormulacaoItem[]) || [])
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

  // Filtrar apenas itens com controle de estoque ativo
  const insumosControlados = insumos.filter((i) => i.controla_estoque && i.ativo)
  const formulacoesControladas = formulacoes.filter((f) => f.controla_estoque && f.ativo)

  const saldoTotalInsumos = insumosControlados.reduce((sum, i) => sum + Number(i.estoque_atual), 0)
  const valorTotalInsumos = insumosControlados.reduce((sum, i) => sum + Number(i.estoque_atual) * Number(i.custo_unitario), 0)
  const saldoTotalFormulacoes = formulacoesControladas.reduce((sum, f) => sum + Number(f.estoque_atual), 0)
  const valorTotalFormulacoes = formulacoesControladas.reduce((sum, f) => sum + Number(f.estoque_atual) * Number(f.custo_unitario), 0)

  const insumosEmAlerta = insumosControlados.filter((i) => i.estoque_minimo > 0 && Number(i.estoque_atual) <= Number(i.estoque_minimo))
  const formulacoesEmAlerta = formulacoesControladas.filter((f) => f.estoque_minimo > 0 && Number(f.estoque_atual) <= Number(f.estoque_minimo))

  // Handlers
  const abrirModalInstanciar = () => {
    setInstanciarForm({ item_tipo: 'insumo', item_id: '', estoque_inicial: '', custo_unitario: '', estoque_minimo: '' })
    setModalInstanciar(true)
  }

  const salvarInstanciacao = async () => {
    if (!fazendaId || !instanciarForm.item_id) return
    setSubmitting(true)
    setError(null)
    try {
      const tabela = instanciarForm.item_tipo === 'insumo' ? 'insumos' : 'formulacoes'
      const saldoInicial = parseFloat(instanciarForm.estoque_inicial) || 0
      const custoUnitario = parseFloat(instanciarForm.custo_unitario) || 0
      const estoqueMinimo = parseFloat(instanciarForm.estoque_minimo) || 0

      // 1. Marcar controla_estoque = true e definir estoque_minimo
      const updatePayload: Record<string, unknown> = {
        controla_estoque: true,
        estoque_minimo: estoqueMinimo,
      }
      if (instanciarForm.item_tipo === 'insumo') {
        updatePayload.custo_unitario = custoUnitario
      }

      const { error: updError } = await supabase
        .from(tabela)
        .update(updatePayload)
        .eq('id', instanciarForm.item_id)
      if (updError) throw updError

      // 2. Se houver saldo inicial, inserir movimentação de estoque_inicial
      if (saldoInicial > 0) {
        const { error: movError } = await supabase.from('movimentacoes_estoque_suplementos').insert({
          fazenda_id: fazendaId,
          item_tipo: instanciarForm.item_tipo,
          item_id: instanciarForm.item_id,
          tipo_movimentacao: 'entrada',
          quantidade: saldoInicial,
          custo_unitario: custoUnitario,
          valor_total: Math.round(saldoInicial * custoUnitario * 100) / 100,
          origem: 'estoque_inicial',
          data: new Date().toISOString().split('T')[0],
          observacao: 'Saldo inicial',
        })
        if (movError) throw movError
      }

      setModalInstanciar(false)
      loadAll()
    } catch (err: any) {
      setError(err.message || 'Erro ao instanciar item')
    } finally {
      setSubmitting(false)
    }
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

  // Opções para selects
  const insumosOptions = insumosControlados.map((i) => ({
    value: i.id,
    label: `${i.nome}${i.unidade ? ` (${i.unidade})` : ''}`,
  }))
  const formulacoesOptions = formulacoesControladas.map((f) => ({
    value: f.id,
    label: `${f.nome}${f.e_premix ? ' (premix)' : ''}`,
  }))

  // Itens não instanciados (para o modal de instanciar)
  const insumosNaoInstanciados = insumos.filter((i) => !i.controla_estoque && i.ativo)
  const formulacoesNaoInstanciadas = formulacoes.filter((f) => !f.controla_estoque && f.ativo)

  const itensNaoInstanciadosOptions =
    instanciarForm.item_tipo === 'insumo'
      ? insumosNaoInstanciados.map((i) => ({ value: i.id, label: i.nome }))
      : formulacoesNaoInstanciadas.map((f) => ({ value: f.id, label: f.nome }))

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

    return (
      <Card key={item.id} className="bg-white p-4 sm:p-5" disableHover>
        <div className="flex justify-between items-start mb-3">
          <div>
            <p className="font-semibold text-gray-800">{item.nome}</p>
            <p className="text-xs text-gray-500">
              {tipo === 'insumo' ? 'Insumo' : 'Produto Final'}
              {tipo === 'formulacao' && (item as FormulacaoItem).e_premix && ' · Premix'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {emAlerta && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Alerta</span>
            )}
            {negativo && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">Negativo</span>
            )}
            <button
              onClick={() => abrirModalHistorico(tipo, item.id, item.nome)}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100"
              title="Ver histórico"
            >
              Histórico
            </button>
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Saldo atual</span>
            <span className={`font-semibold ${negativo ? 'text-red-600' : 'text-gray-900'}`}>
              {saldo.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Custo médio</span>
            <span className="text-gray-700">R$ {custo.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}/kg</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Valor em estoque</span>
            <span className="font-semibold text-gray-900">R$ {valorEstoque.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Estoque mínimo</span>
            <span className="text-gray-700">{Number(item.estoque_minimo).toLocaleString('pt-BR')} kg</span>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Estoque de Suplementação</h2>
          {fazendaNome && <p className="text-sm text-gray-500 mt-1">{fazendaNome}</p>}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" onClick={abrirModalInstanciar}>Instanciar Item</Button>
          <Button variant="secondary" onClick={abrirModalAjuste}>Ajuste</Button>
          <Button onClick={abrirModalEntrada}>Registrar Entrada</Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-4">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="text-xs text-red-500 underline mt-1">Fechar</button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <Card className="bg-white p-4 sm:p-5" disableHover>
          <p className="text-xs sm:text-sm text-gray-500 font-medium">Saldo Insumos</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{saldoTotalInsumos.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg</p>
        </Card>
        <Card className="bg-white p-4 sm:p-5" disableHover>
          <p className="text-xs sm:text-sm text-gray-500 font-medium">Valor Insumos</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">R$ {valorTotalInsumos.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </Card>
        <Card className="bg-white p-4 sm:p-5" disableHover>
          <p className="text-xs sm:text-sm text-gray-500 font-medium">Saldo Produtos Finais</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{saldoTotalFormulacoes.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg</p>
        </Card>
        <Card className="bg-white p-4 sm:p-5" disableHover>
          <p className="text-xs sm:text-sm text-gray-500 font-medium">Valor Produtos Finais</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">R$ {valorTotalFormulacoes.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </Card>
      </div>

      {/* Alertas */}
      {(insumosEmAlerta.length > 0 || formulacoesEmAlerta.length > 0) && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-4">
          <p className="text-sm font-semibold text-red-700">
            {insumosEmAlerta.length + formulacoesEmAlerta.length} item(s) com estoque baixo:
          </p>
          <p className="text-xs text-red-600 mt-1">
            {insumosEmAlerta.map((i) => i.nome).concat(formulacoesEmAlerta.map((f) => f.nome)).join(', ')}
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setTab('insumos')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
            tab === 'insumos' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Insumos ({insumosControlados.length})
        </button>
        <button
          onClick={() => setTab('formulacoes')}
          className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
            tab === 'formulacoes' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Produtos Finais ({formulacoesControladas.length})
        </button>
      </div>

      {/* Lista de itens */}
      {tab === 'insumos' ? (
        insumosControlados.length === 0 ? (
          <Card className="bg-white p-6" disableHover>
            <EmptyState
              title="Nenhum insumo instanciado"
              description="Instancie insumos para controlar o estoque de suplementação."
              action={<Button onClick={abrirModalInstanciar}>Instanciar Item</Button>}
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {insumosControlados.map((i) => renderCard(i, 'insumo'))}
          </div>
        )
      ) : (
        formulacoesControladas.length === 0 ? (
          <Card className="bg-white p-6" disableHover>
            <EmptyState
              title="Nenhum produto final instanciado"
              description="Instancie formulações com controle de estoque para acompanhar o saldo de produtos acabados."
              action={<Button onClick={abrirModalInstanciar}>Instanciar Item</Button>}
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {formulacoesControladas.map((f) => renderCard(f, 'formulacao'))}
          </div>
        )
      )}

      {/* Modal: Instanciar Item */}
      <Modal isOpen={modalInstanciar} onClose={() => setModalInstanciar(false)} title="Instanciar Item de Estoque" size="md">
        <div className="space-y-4">
          <Select
            label="Tipo de item"
            options={[
              { value: 'insumo', label: 'Insumo' },
              { value: 'formulacao', label: 'Produto Final (Formulação)' },
            ]}
            value={instanciarForm.item_tipo}
            onChange={(val) => setInstanciarForm({ ...instanciarForm, item_tipo: val as ItemTipo, item_id: '' })}
            placeholder="Selecione..."
            required
          />
          <Select
            label="Item"
            options={itensNaoInstanciadosOptions}
            value={instanciarForm.item_id}
            onChange={(val) => setInstanciarForm({ ...instanciarForm, item_id: val })}
            placeholder="Selecione o item..."
            required
          />
          {itensNaoInstanciadosOptions.length === 0 && (
            <p className="text-xs text-gray-500">
              {instanciarForm.item_tipo === 'insumo'
                ? 'Todos os insumos ativos já estão instanciados ou não há insumos cadastrados.'
                : 'Todas as formulações ativas já estão instanciadas ou não há formulações cadastradas.'}
            </p>
          )}
          <Input
            label="Saldo Inicial (kg)"
            type="number"
            placeholder="Ex: 1000"
            value={instanciarForm.estoque_inicial}
            onChange={(e) => setInstanciarForm({ ...instanciarForm, estoque_inicial: e.target.value })}
          />
          <Input
            label="Custo Unitário Inicial (R$/kg)"
            type="number"
            placeholder="Ex: 2.50"
            value={instanciarForm.custo_unitario}
            onChange={(e) => setInstanciarForm({ ...instanciarForm, custo_unitario: e.target.value })}
          />
          <Input
            label="Estoque Mínimo (kg)"
            type="number"
            placeholder="Ex: 200"
            value={instanciarForm.estoque_minimo}
            onChange={(e) => setInstanciarForm({ ...instanciarForm, estoque_minimo: e.target.value })}
          />
          <p className="text-xs text-gray-500">
            Instanciar ativa o controle de estoque para este item. O saldo inicial e custo médio serão ajustados conforme novas entradas forem registradas.
          </p>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => setModalInstanciar(false)}>Cancelar</Button>
            <Button onClick={salvarInstanciacao} disabled={submitting || !instanciarForm.item_id}>
              {submitting ? 'Salvando...' : 'Instanciar'}
            </Button>
          </div>
        </div>
      </Modal>

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
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800">
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
          <p className="text-xs text-gray-500">
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
                <div className="bg-green-50 rounded-lg p-3">
                  <p className="text-xs text-green-600">Total Entradas</p>
                  <p className="text-lg font-bold text-green-700">{totalEntradas.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3">
                  <p className="text-xs text-red-600">Total Saídas</p>
                  <p className="text-lg font-bold text-red-700">{totalSaidas.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Ajustes</p>
                  <p className="text-lg font-bold text-gray-700">{ajustes.length}</p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Linha do Tempo</h4>
                {historicoLoading ? (
                  <div className="text-center py-8 text-gray-500">Carregando movimentações...</div>
                ) : historicoMovs.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">Nenhuma movimentação registrada.</div>
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
                            isAjuste ? 'border-gray-200 bg-gray-50' : isEntrada ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                          }`}
                        >
                          <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                            isAjuste ? 'bg-gray-100 text-gray-700' : isEntrada ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {isAjuste ? '=' : isEntrada ? '↓' : '↑'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="text-sm font-semibold text-gray-900">
                                  {TIPO_MOV_LABEL[mov.tipo_movimentacao] || mov.tipo_movimentacao} — {Number(mov.quantidade).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg
                                </p>
                                <p className="text-xs text-gray-500">
                                  {mov.data ? formatDate(mov.data) : '-'} · {ORIGEM_LABEL[mov.origem || ''] || mov.origem || '-'}
                                </p>
                              </div>
                              {valor > 0 && (
                                <div className="text-right">
                                  <p className="text-sm font-semibold text-gray-900">
                                    R$ {valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </p>
                                  {mov.custo_unitario && (
                                    <p className="text-xs text-gray-500">
                                      R$ {Number(mov.custo_unitario).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}/kg
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                            {mov.observacao && (
                              <p className="text-xs text-gray-500 mt-1">{mov.observacao}</p>
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
