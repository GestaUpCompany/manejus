import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, getFazendaIdForUser, getFazendaNome } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Button, Card, CardSkeleton, Input, Modal, Select } from '@gestaup/ui'
import {
  ROTULO_ORIGEM,
  ROTULO_TIPO,
  consumoDoMes,
  divergenciaDeSaldo,
  emAlerta,
  filtrarEOrdenar,
  lotesComSaldo,
  movimentoEditavel,
  movimentosComSaldo,
  semCusto,
  sinalMovimento,
  situacaoValidade,
  totaisDaTela,
  unidadeNaQuantidade,
  validarAjuste,
  validarConteudoObrigatorio,
  validarEntrada,
  valorDoItem,
  type FormAjuste,
  type FormEntrada,
  type ItemEstoqueFarmacia,
  type LoteFarmacia,
  type SituacaoValidade,
  UNIDADES_CONTEUDO,
  UNIDADES_DIRETAS,
  UNIDADES_ESTOQUE,
  modoBaixaEnfermaria,
  rotuloBaixaEnfermaria,
  validarConteudo,
  type MovimentoFarmacia,
} from '../../features/estoqueFarmacia/logica'

const hojeLocal = () => new Date().toLocaleDateString('en-CA')

const COLUNAS_ITEM = 'id,nome_comercial,sku,tipo,unidade,estoque_atual,estoque_minimo,custo_unitario,custo_total_estoque,controla_estoque,conteudo_por_unidade,conteudo_unidade'
const COLUNAS_MOVIMENTO = 'id,medicamento_id,tipo_movimentacao,quantidade,custo_unitario,valor_total,data,origem,fornecedor,nota_fiscal,lote_produto,validade,observacao,unidade,registro_origem_id,created_at'
const TAMANHO_PAGINA = 1000

// Todo o ledger da fazenda (paginado), para montar os lotes de cada medicamento no card.
async function buscarMovimentosFarmacia(fazendaId: string): Promise<MovimentoFarmacia[]> {
  const linhas: MovimentoFarmacia[] = []
  for (let de = 0; ; de += TAMANHO_PAGINA) {
    const { data, error } = await supabase
      .from('movimentacoes_farmacia')
      .select(COLUNAS_MOVIMENTO)
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)
      .order('id')
      .range(de, de + TAMANHO_PAGINA - 1)
    if (error) throw new Error(error.message)
    const pagina = (data as MovimentoFarmacia[]) || []
    linhas.push(...pagina)
    if (pagina.length < TAMANHO_PAGINA) return linhas
  }
}

const rotuloValidade = (situacao: SituacaoValidade, dias: number | null) => {
  if (situacao === 'vencido') return 'Vencido'
  if (situacao === 'vence_em_breve') return dias === 0 ? 'Vence hoje' : `Vence em ${dias}d`
  return null
}

const CORES_VALIDADE: Partial<Record<SituacaoValidade, string>> = {
  vencido: 'bg-red-500/10 text-red-700 dark:text-red-300',
  vence_em_breve: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
}

// Botões de ação do card: grade de 3 colunas no celular (alvo de toque de 36px), linha no desktop.
const BOTAO_ACAO = 'inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors'

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const numero = (v: number, casas = 3) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas })
const dataBR = (iso: string) => iso.split('-').reverse().join('/')

const formEntradaVazio = (): FormEntrada => ({ itemId: '', quantidade: '', custo: '', fornecedor: '', notaFiscal: '', lote: '', validade: '', observacao: '', data: hojeLocal() })
const formAjusteVazio = (): FormAjuste => ({ itemId: '', saldo: '', observacao: '', data: hojeLocal() })

interface HistoricoAberto {
  item: ItemEstoqueFarmacia
  movimentos: MovimentoFarmacia[]
}

export function EstoqueFarmacia() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [fazendaId, setFazendaId] = useState<string | null>(null)
  const [fazendaNome, setFazendaNome] = useState<string | null>(null)
  const [itens, setItens] = useState<ItemEstoqueFarmacia[]>([])
  const [consumoMes, setConsumoMes] = useState(0)
  const [movimentos, setMovimentos] = useState<MovimentoFarmacia[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [tipo, setClassificacao] = useState('')
  const [modal, setModal] = useState<'entrada' | 'ajuste' | null>(null)
  // Ativação do controle: é o único momento de escolher a unidade (depois de haver histórico ela não muda)
  const [ativacao, setAtivacao] = useState<{ item: ItemEstoqueFarmacia; modo: 'ativar' | 'conteudo'; unidade: string; minimo: string; conteudo: string; conteudoUn: string } | null>(null)
  // Edição inline do estoque mínimo (igual ao estoque de suplementação)
  const [editandoMinimoId, setEditandoMinimoId] = useState<string | null>(null)
  const [valorMinimoEditando, setValorMinimoEditando] = useState('')
  const [salvandoMinimo, setSalvandoMinimo] = useState(false)
  const [formEntrada, setFormEntrada] = useState<FormEntrada>(formEntradaVazio)
  const [formAjuste, setFormAjuste] = useState<FormAjuste>(formAjusteVazio)
  const [erroForm, setErroForm] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [historico, setHistorico] = useState<HistoricoAberto | null>(null)
  const [periodoDe, setPeriodoDe] = useState('')
  const [periodoAte, setPeriodoAte] = useState('')

  const carregar = useCallback(async () => {
    if (!fazendaId) return
    setLoading(true)
    const inicioDoMes = `${hojeLocal().slice(0, 8)}01`
    const [itensRes, consumoRes, movimentosRes] = await Promise.all([
      supabase.from('medicamentos').select(COLUNAS_ITEM).eq('fazenda_id', fazendaId).eq('ativo', true).is('deleted_at', null).order('nome_comercial'),
      supabase
        .from('movimentacoes_farmacia')
        .select('tipo_movimentacao,data,quantidade,custo_unitario,valor_total')
        .eq('fazenda_id', fazendaId)
        .in('tipo_movimentacao', ['baixa', 'estorno'])
        .gte('data', inicioDoMes)
        .is('deleted_at', null),
      buscarMovimentosFarmacia(fazendaId).then(
        (dados) => ({ dados, erro: null as string | null }),
        (e: Error) => ({ dados: [] as MovimentoFarmacia[], erro: e.message }),
      ),
    ])
    if (itensRes.error) setErro(itensRes.error.message)
    else if (consumoRes.error) setErro(consumoRes.error.message)
    else setErro(movimentosRes.erro)
    setItens((itensRes.data as ItemEstoqueFarmacia[]) || [])
    setConsumoMes(consumoDoMes((consumoRes.data as MovimentoFarmacia[]) || [], inicioDoMes))
    setMovimentos(movimentosRes.dados)
    setLoading(false)
  }, [fazendaId])

  useEffect(() => {
    if (!user) return
    getFazendaIdForUser(user.id).then((id) => {
      setFazendaId(id)
      if (id) getFazendaNome(id).then(setFazendaNome)
    })
  }, [user])

  useEffect(() => {
    carregar()
  }, [carregar])

  const totais = useMemo(() => totaisDaTela(itens), [itens])
  const categorias = useMemo(() => [...new Set(itens.map((i) => i.tipo))].sort(), [itens])
  const visiveis = useMemo(() => filtrarEOrdenar(itens, busca, tipo), [itens, busca, tipo])
  const itensControlados = useMemo(() => itens.filter((i) => i.controla_estoque), [itens])
  const lotesPorItem = useMemo(() => {
    const porItem = new Map<string, MovimentoFarmacia[]>()
    for (const m of movimentos) porItem.set(m.medicamento_id, [...(porItem.get(m.medicamento_id) ?? []), m])
    const hoje = hojeLocal()
    const resultado = new Map<string, Array<LoteFarmacia & { situacao: SituacaoValidade; dias: number | null }>>()
    for (const [itemId, movs] of porItem) {
      resultado.set(itemId, lotesComSaldo(movs).map((l) => ({ ...l, ...situacaoValidade(l.validade, hoje) })))
    }
    return resultado
  }, [movimentos])

  const abrirModal = (tipo: 'entrada' | 'ajuste', itemId = '') => {
    setErroForm(null)
    if (tipo === 'entrada') setFormEntrada({ ...formEntradaVazio(), itemId })
    else setFormAjuste({ ...formAjusteVazio(), itemId })
    setModal(tipo)
  }

  const salvarEntrada = async () => {
    if (!fazendaId) return
    const v = validarEntrada(formEntrada)
    if (!v.ok) return setErroForm(v.erro)
    setSubmitting(true)
    try {
      const { error } = await supabase.from('movimentacoes_farmacia').insert({
        fazenda_id: fazendaId,
        medicamento_id: formEntrada.itemId,
        tipo_movimentacao: 'entrada',
        quantidade: v.valores.quantidade,
        custo_unitario: v.valores.custo,
        valor_total: Math.round(v.valores.quantidade * v.valores.custo * 100) / 100,
        origem: 'painel_entrada',
        fornecedor: formEntrada.fornecedor.trim() || null,
        nota_fiscal: formEntrada.notaFiscal.trim() || null,
        lote_produto: formEntrada.lote.trim() || null,
        validade: formEntrada.validade || null,
        observacao: formEntrada.observacao.trim() || null,
        data: formEntrada.data,
      })
      if (error) return setErroForm(error.message)
      setModal(null)
      await carregar()
    } catch (e) {
      setErroForm(e instanceof Error ? e.message : 'Erro ao salvar a entrada.')
    } finally {
      setSubmitting(false)
    }
  }

  const salvarAjuste = async () => {
    if (!fazendaId) return
    const v = validarAjuste(formAjuste)
    if (!v.ok) return setErroForm(v.erro)
    setSubmitting(true)
    try {
      const { error } = await supabase.from('movimentacoes_farmacia').insert({
        fazenda_id: fazendaId,
        medicamento_id: formAjuste.itemId,
        tipo_movimentacao: 'ajuste',
        quantidade: v.valores.saldo,
        origem: 'painel_ajuste',
        observacao: formAjuste.observacao.trim(),
        data: formAjuste.data,
      })
      if (error) return setErroForm(error.message)
      setModal(null)
      await carregar()
    } catch (e) {
      setErroForm(e instanceof Error ? e.message : 'Erro ao salvar o ajuste.')
    } finally {
      setSubmitting(false)
    }
  }

  const salvarAtivacao = async () => {
    if (!ativacao || !fazendaId) return
    const direta = UNIDADES_DIRETAS.includes(ativacao.unidade)
    // Ativar controle exige conteúdo para a Enfermaria baixar; na edição de item já ativo continua opcional
    const conteudo = ativacao.modo === 'ativar'
      ? validarConteudoObrigatorio(ativacao.unidade, direta ? '' : ativacao.conteudo, ativacao.conteudoUn)
      : validarConteudo(direta ? '' : ativacao.conteudo)
    if (!conteudo.ok) return setErroForm(conteudo.erro)
    const campos: Record<string, unknown> = {
      conteudo_por_unidade: conteudo.valores.conteudo,
      conteudo_unidade: conteudo.valores.conteudo == null ? null : ativacao.conteudoUn,
    }
    if (ativacao.modo === 'ativar') {
      const minimo = Number(ativacao.minimo.replace(',', '.') || '0')
      if (!Number.isFinite(minimo) || minimo < 0) return setErroForm('Informe um mínimo válido (zero ou maior).')
      Object.assign(campos, { controla_estoque: true, unidade: ativacao.unidade, estoque_minimo: minimo })
    }
    const { error } = await supabase
      .from('medicamentos')
      .update(campos)
      .eq('id', ativacao.item.id)
      .eq('fazenda_id', fazendaId)
    if (error) return setErroForm(error.message)
    setAtivacao(null)
    await carregar()
  }

  const salvarEstoqueMinimo = async (itemId: string) => {
    if (!fazendaId) return
    const minimo = Number(valorMinimoEditando.replace(',', '.') || '0')
    if (!Number.isFinite(minimo) || minimo < 0) return setErro('Informe um mínimo válido (zero ou maior).')
    setSalvandoMinimo(true)
    const { error } = await supabase.from('medicamentos').update({ estoque_minimo: minimo }).eq('id', itemId).eq('fazenda_id', fazendaId)
    setSalvandoMinimo(false)
    if (error) return setErro(error.message)
    setEditandoMinimoId(null)
    await carregar()
  }

  const abrirHistorico = async (item: ItemEstoqueFarmacia) => {
    if (!fazendaId) return
    const { data, error } = await supabase
      .from('movimentacoes_farmacia')
      .select(COLUNAS_MOVIMENTO)
      .eq('fazenda_id', fazendaId)
      .eq('medicamento_id', item.id)
      .is('deleted_at', null)
      .limit(2000)
    if (error) return setErro(error.message)
    setPeriodoDe('')
    setPeriodoAte('')
    setHistorico({ item, movimentos: (data as MovimentoFarmacia[]) || [] })
  }

  const extrato = useMemo(() => (historico ? movimentosComSaldo(historico.movimentos) : []), [historico])
  const divergencia = historico ? divergenciaDeSaldo(extrato, historico.item.estoque_atual) : null
  const extratoVisivel = useMemo(
    () => extrato.filter((m) => (!periodoDe || m.data >= periodoDe) && (!periodoAte || m.data <= periodoAte)).reverse(),
    [extrato, periodoDe, periodoAte],
  )
  const temMovimentoDoApp = extratoVisivel.some((m) => !movimentoEditavel(m))

  const itemDoAjuste = itens.find((i) => i.id === formAjuste.itemId)
  const novoSaldo = Number(formAjuste.saldo.replace(',', '.'))
  const diferencaAjuste = itemDoAjuste && formAjuste.saldo.trim() !== '' && Number.isFinite(novoSaldo)
    ? novoSaldo - Number(itemDoAjuste.estoque_atual)
    : null

  if (loading && itens.length === 0) {
    return <div className="grid grid-cols-1 md:grid-cols-3 gap-4"><CardSkeleton /><CardSkeleton /><CardSkeleton /></div>
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold text-content-strong">Estoque da Farmácia</h2>
          {fazendaNome && <p className="text-sm text-content-muted">{fazendaNome}</p>}
        </div>
        <div className="flex flex-wrap gap-2 [&>button]:flex-1 sm:[&>button]:flex-none">
          <Button variant="secondary" onClick={() => navigate('/controller/cadastros-auxiliares')}>Cadastrar medicamentos</Button>
          <Button variant="secondary" onClick={() => navigate('/controller/cadernetas/entrada-farmacia')}>Entradas</Button>
          <Button variant="secondary" onClick={() => navigate('/controller/cadernetas/saida-farmacia')}>Saídas</Button>
          <Button variant="secondary" onClick={() => abrirModal('ajuste')}>Ajuste</Button>
          <Button onClick={() => abrirModal('entrada')}>Registrar Entrada</Button>
        </div>
      </div>

      {erro && <Card className="p-4 bg-red-500/10"><p className="text-sm text-red-700">{erro}</p></Card>}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <Card className="p-4" disableHover>
          <p className="text-xs text-content-muted">Medicamentos controlados</p>
          <p className="text-base sm:text-lg xl:text-xl font-bold break-words">{totais.controlados}</p>
        </Card>
        <Card className="p-4" disableHover>
          <p className="text-xs text-content-muted">Em alerta</p>
          <p className="text-base sm:text-lg xl:text-xl font-bold text-amber-600">{totais.em_alerta}</p>
          {totais.sem_custo > 0 && <p className="text-[11px] text-content-muted">{totais.sem_custo} sem custo</p>}
        </Card>
        <Card className="p-4" disableHover>
          <p className="text-xs text-content-muted">Valor em estoque</p>
          <p className="text-base sm:text-lg xl:text-xl font-bold break-words">{moeda(totais.valor_total)}</p>
        </Card>
        <Card className="p-4" disableHover>
          <p className="text-xs text-content-muted">Baixas no mês</p>
          <p className="text-base sm:text-lg xl:text-xl font-bold break-words">{moeda(consumoMes)}</p>
        </Card>
      </div>

      {totais.sem_conversao > 0 && (
        <p className="text-sm text-amber-700">
          {totais.sem_conversao} {totais.sem_conversao === 1 ? 'medicamento controlado sem conteúdo definido' : 'medicamentos controlados sem conteúdo definido'}: a Enfermaria não dá baixa no estoque deles. Use "Definir" no card para informar o conteúdo da embalagem.
        </p>
      )}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="sm:w-72 min-w-0">
          <Input label="Buscar medicamento" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome comercial ou SKU" />
        </div>
        <div className="sm:w-60">
          <Select label="Tipo" value={tipo} onChange={setClassificacao} placeholder="Todas" options={categorias.map((c) => ({ value: c, label: c }))} />
        </div>
      </div>

      {visiveis.length === 0 ? (
        <Card className="p-8 text-center" disableHover>
          <p className="text-content-muted">
            {itens.length === 0 ? 'Nenhum medicamento cadastrado.' : 'Nenhum item para o filtro escolhido.'}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visiveis.map((item) => {
            const saldo = Number(item.estoque_atual)
            const alerta = emAlerta(item)
            const editandoEste = editandoMinimoId === item.id
            const lotes = lotesPorItem.get(item.id) ?? []
            const lotesVencidos = lotes.filter((l) => l.situacao === 'vencido').length
            const lotesAVencer = lotes.filter((l) => l.situacao === 'vence_em_breve').length
            return (
              <Card key={item.id} className="bg-surface-1 p-4 sm:p-5 h-full" disableHover>
                <div className="flex flex-col gap-3 mb-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-content-strong break-words">{item.nome_comercial}</p>
                    <p className="text-xs text-content-muted break-words">{item.tipo}{item.controla_estoque ? ` · ${item.unidade}` : ''}{item.sku ? ` · SKU ${item.sku}` : ''}</p>
                  </div>
                  {(alerta || semCusto(item) || lotes.some((l) => l.situacao === 'vencido' || l.situacao === 'vence_em_breve')) && (
                    <div className="flex flex-wrap items-center gap-2">
                      {alerta && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-700 dark:text-red-300">{saldo < 0 ? 'Negativo' : 'Alerta'}</span>
                      )}
                      {lotesVencidos > 0 && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CORES_VALIDADE.vencido}`}>{lotesVencidos === 1 ? 'Lote vencido' : `${lotesVencidos} lotes vencidos`}</span>}
                      {lotesAVencer > 0 && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CORES_VALIDADE.vence_em_breve}`}>{lotesAVencer === 1 ? 'Lote a vencer' : `${lotesAVencer} lotes a vencer`}</span>}
                      {semCusto(item) && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-700">Sem custo</span>}
                    </div>
                  )}
                  <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-2">
                    {item.controla_estoque ? (
                      <>
                        <button
                          onClick={() => { setEditandoMinimoId(item.id); setValorMinimoEditando(String(Number(item.estoque_minimo)).replace('.', ',')) }}
                          className={`${BOTAO_ACAO} border-primary/30 bg-primary/10 text-primary dark:text-primary-light hover:bg-primary/20`}
                          title="Editar estoque mínimo"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => abrirModal('ajuste', item.id)}
                          className={`${BOTAO_ACAO} border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20`}
                          title="Ajustar saldo atual"
                        >
                          Ajustar
                        </button>
                        <button
                          onClick={() => abrirHistorico(item)}
                          className={`${BOTAO_ACAO} border-border-base bg-surface-2 text-content hover:bg-surface-3`}
                          title="Ver histórico"
                        >
                          Histórico
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => { setErroForm(null); setAtivacao({ item, modo: 'ativar', unidade: item.unidade, minimo: '0', conteudo: '', conteudoUn: 'mL' }) }}
                        className={`${BOTAO_ACAO} col-span-3 border-primary/30 bg-primary/10 text-primary dark:text-primary-light hover:bg-primary/20`}
                      >
                        Ativar controle
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  {!item.controla_estoque ? (
                    <p className="text-sm text-content-muted">Sem controle de estoque. Ative o controle para acompanhar saldo e custo.</p>
                  ) : (
                    <>
                  <div className="flex justify-between text-sm">
                    <span className="text-content-muted">Saldo atual</span>
                    <span className={`font-semibold ${saldo < 0 ? 'text-red-500' : 'text-content-strong'}`}>{numero(saldo)} {unidadeNaQuantidade(item.unidade, saldo)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-content-muted">Custo médio</span>
                    <span className="text-content">{moeda(Number(item.custo_unitario))}/{item.unidade}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-content-muted">Valor em estoque</span>
                    <span className="font-semibold text-content-strong">{moeda(valorDoItem(item))}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-content-muted">Estoque mínimo</span>
                    {editandoEste ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={valorMinimoEditando}
                          onChange={(e) => setValorMinimoEditando(e.target.value.replace(/[^\d,]/g, ''))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') salvarEstoqueMinimo(item.id)
                            if (e.key === 'Escape') setEditandoMinimoId(null)
                          }}
                          className="w-20 rounded border border-surface-3 px-1.5 py-0.5 text-right text-sm"
                          autoFocus
                          disabled={salvandoMinimo}
                        />
                        <button
                          onClick={() => salvarEstoqueMinimo(item.id)}
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
                      <span className="font-medium text-content">{Number(item.estoque_minimo) > 0 ? `${numero(Number(item.estoque_minimo))} ${unidadeNaQuantidade(item.unidade, Number(item.estoque_minimo))}` : '—'}</span>
                    )}
                  </div>
                  <div className="mt-2 border-t border-border-base pt-2 space-y-1.5">
                    <p className="text-xs text-content-muted">Lotes em estoque (vence primeiro)</p>
                    {lotes.length === 0 ? (
                      <p className="text-sm text-content-muted">Nenhum lote com saldo.</p>
                    ) : lotes.map((l) => {
                      const rotulo = rotuloValidade(l.situacao, l.dias)
                      return (
                        <div key={l.chave} className="flex justify-between items-center gap-2 text-sm">
                          <span className="min-w-0 truncate text-content">
                            {l.lote ?? 'Sem lote'}
                            <span className="text-content-muted"> · {l.validade ? `val. ${dataBR(l.validade)}` : 'sem validade'}</span>
                          </span>
                          <span className="flex items-center gap-2 whitespace-nowrap">
                            {rotulo && <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-medium ${CORES_VALIDADE[l.situacao]}`}>{rotulo}</span>}
                            <span className="font-semibold text-content-strong">{numero(l.saldo)} {unidadeNaQuantidade(item.unidade, l.saldo)}</span>
                          </span>
                        </div>
                      )
                    })}
                  </div>
                    </>
                  )}
                  {item.controla_estoque && (
                    <div className="flex flex-wrap justify-between items-center gap-x-2 gap-y-1 pt-2 text-sm">
                      <span className="text-content-muted">Baixa da Enfermaria</span>
                      <span className="flex items-center gap-2 text-right">
                        <span className={modoBaixaEnfermaria(item) === 'sem_conversao' ? 'text-amber-700' : 'text-content'}>{rotuloBaixaEnfermaria(item)}</span>
                        {modoBaixaEnfermaria(item) !== 'direta' && (
                          <button
                            onClick={() => { setErroForm(null); setAtivacao({ item, modo: 'conteudo', unidade: item.unidade, minimo: String(item.estoque_minimo ?? 0), conteudo: item.conteudo_por_unidade ? String(Number(item.conteudo_por_unidade)).replace('.', ',') : '', conteudoUn: item.conteudo_unidade || 'mL' }) }}
                            className="text-xs font-semibold text-primary dark:text-primary-light underline"
                          >
                            {modoBaixaEnfermaria(item) === 'embalagem' ? 'Alterar' : 'Definir'}
                          </button>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Modal isOpen={modal === 'entrada'} onClose={() => setModal(null)} title="Registrar entrada">
        <div className="space-y-3">
          <Select
            label="Medicamento"
            value={formEntrada.itemId}
            onChange={(value) => setFormEntrada({ ...formEntrada, itemId: value })}
            placeholder="Selecione..."
            options={itensControlados.map((i) => ({ value: i.id, label: `${i.nome_comercial} (${i.unidade})` }))}
          />
          <Input label="Quantidade" type="number" min="0" step="0.001" value={formEntrada.quantidade} onChange={(e) => setFormEntrada({ ...formEntrada, quantidade: e.target.value })} />
          <Input label="Custo unitário (R$)" type="number" min="0" step="0.0001" value={formEntrada.custo} onChange={(e) => setFormEntrada({ ...formEntrada, custo: e.target.value })} />
          <Input label="Fornecedor" value={formEntrada.fornecedor} onChange={(e) => setFormEntrada({ ...formEntrada, fornecedor: e.target.value })} />
          <Input label="Nota fiscal" value={formEntrada.notaFiscal} onChange={(e) => setFormEntrada({ ...formEntrada, notaFiscal: e.target.value })} />
          <Input label="Lote do produto" value={formEntrada.lote} onChange={(e) => setFormEntrada({ ...formEntrada, lote: e.target.value })} />
          <Input label="Validade" type="date" value={formEntrada.validade} onChange={(e) => setFormEntrada({ ...formEntrada, validade: e.target.value })} />
          <Input label="Data" type="date" value={formEntrada.data} onChange={(e) => setFormEntrada({ ...formEntrada, data: e.target.value })} />
          <Input label="Observação" value={formEntrada.observacao} onChange={(e) => setFormEntrada({ ...formEntrada, observacao: e.target.value })} />
          {erroForm && <p className="text-sm text-red-700">{erroForm}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={salvarEntrada} disabled={submitting}>{submitting ? 'Salvando...' : 'Salvar'}</Button>
            <Button variant="secondary" onClick={() => setModal(null)} disabled={submitting}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={modal === 'ajuste'} onClose={() => setModal(null)} title="Ajustar saldo (inventário)">
        <div className="space-y-3">
          <Select
            label="Medicamento"
            value={formAjuste.itemId}
            onChange={(value) => setFormAjuste({ ...formAjuste, itemId: value })}
            placeholder="Selecione..."
            options={itensControlados.map((i) => ({ value: i.id, label: `${i.nome_comercial} (${i.unidade})` }))}
          />
          <Input label="Novo saldo" type="number" min="0" step="0.001" value={formAjuste.saldo} onChange={(e) => setFormAjuste({ ...formAjuste, saldo: e.target.value })} />
          {itemDoAjuste && (
            <p className="text-xs text-content-muted">
              Saldo atual: {numero(Number(itemDoAjuste.estoque_atual))} {itemDoAjuste.unidade}
              {diferencaAjuste != null && ` · diferença: ${diferencaAjuste > 0 ? '+' : ''}${numero(diferencaAjuste)} ${itemDoAjuste.unidade}`}
            </p>
          )}
          <Input label="Data" type="date" value={formAjuste.data} onChange={(e) => setFormAjuste({ ...formAjuste, data: e.target.value })} />
          <Input label="Motivo" value={formAjuste.observacao} onChange={(e) => setFormAjuste({ ...formAjuste, observacao: e.target.value })} placeholder="Ex.: inventário, perda, quebra" />
          {erroForm && <p className="text-sm text-red-700">{erroForm}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={salvarAjuste} disabled={submitting}>{submitting ? 'Salvando...' : 'Salvar'}</Button>
            <Button variant="secondary" onClick={() => setModal(null)} disabled={submitting}>Cancelar</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!ativacao} onClose={() => setAtivacao(null)} title={ativacao ? `${ativacao.modo === 'ativar' ? 'Ativar controle' : 'Conteúdo da embalagem'}: ${ativacao.item.nome_comercial}` : 'Ativar controle'}>
        {ativacao && (
          <div className="space-y-3">
            {ativacao.modo === 'ativar' ? (
              <>
                <Select
                  label="Unidade de medida"
                  value={ativacao.unidade}
                  onChange={(value) => setAtivacao({ ...ativacao, unidade: value })}
                  options={UNIDADES_ESTOQUE.map((u) => ({ value: u, label: u }))}
                />
                <p className="text-xs text-amber-700">Escolha com atenção: depois de ativado, a unidade não pode ser alterada, para o histórico continuar correto.</p>
                <Input label="Estoque mínimo (alerta)" type="number" min="0" step="0.001" value={ativacao.minimo} onChange={(e) => setAtivacao({ ...ativacao, minimo: e.target.value })} />
              </>
            ) : (
              <p className="text-sm text-content-muted">Unidade de estoque: <strong>{ativacao.unidade}</strong></p>
            )}
            {UNIDADES_DIRETAS.includes(ativacao.unidade) ? (
              <p className="text-xs text-content-muted">Em {ativacao.unidade}, a Enfermaria baixa o estoque direto pela dose aplicada.</p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Input label={`Conteúdo por ${ativacao.unidade}`} type="number" min="0" step="0.001" value={ativacao.conteudo} onChange={(e) => setAtivacao({ ...ativacao, conteudo: e.target.value })} placeholder="Ex.: 500" />
                  <Select label="Em" value={ativacao.conteudoUn} onChange={(value) => setAtivacao({ ...ativacao, conteudoUn: value })} options={UNIDADES_CONTEUDO.map((u) => ({ value: u, label: u }))} />
                </div>
                <p className="text-xs text-content-muted">
                  Usado para a baixa automática da Enfermaria (ex.: 20 mL aplicados ÷ 500 mL = 0,04 {ativacao.unidade}).
                  {ativacao.modo === 'ativar' ? ' Obrigatório ao ativar.' : ' Vazio: a Enfermaria não baixa este medicamento.'} No aplicativo, a dose é digitada na mesma unidade (mL ou mg).
                </p>
              </div>
            )}
            {erroForm && <p className="text-sm text-red-700">{erroForm}</p>}
            <div className="flex gap-2 pt-2">
              <Button onClick={salvarAtivacao}>{ativacao.modo === 'ativar' ? 'Ativar' : 'Salvar'}</Button>
              <Button variant="secondary" onClick={() => setAtivacao(null)}>Cancelar</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!historico} onClose={() => setHistorico(null)} title={historico ? `Histórico: ${historico.item.nome_comercial}` : 'Histórico'} size="xl">
        {historico && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-40"><Input label="De" type="date" value={periodoDe} onChange={(e) => setPeriodoDe(e.target.value)} /></div>
              <div className="w-40"><Input label="Até" type="date" value={periodoAte} onChange={(e) => setPeriodoAte(e.target.value)} /></div>
              {(periodoDe || periodoAte) && <Button size="sm" variant="secondary" onClick={() => { setPeriodoDe(''); setPeriodoAte('') }}>Limpar</Button>}
            </div>
            {divergencia != null && (
              <p className="text-xs rounded-lg bg-amber-500/10 text-amber-700 p-2">
                O saldo reconstruído por data difere do saldo gravado em {numero(divergencia)} {historico.item.unidade}. Costuma acontecer com ajuste lançado com data anterior a outros lançamentos.
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-content-muted border-b border-border-base">
                    <th className="py-2 pr-3">Data</th>
                    <th className="py-2 pr-3">Tipo</th>
                    <th className="py-2 pr-3">Origem</th>
                    <th className="py-2 pr-3">Detalhe</th>
                    <th className="py-2 pr-3 text-right">Quantidade</th>
                    <th className="py-2 pr-3 text-right">Custo un.</th>
                    <th className="py-2 text-right">Saldo após</th>
                  </tr>
                </thead>
                <tbody>
                  {extratoVisivel.map((m) => {
                    const { sinal, qtd } = sinalMovimento(m)
                    return (
                      <tr key={m.id} className="border-b border-border-base">
                        <td className="py-2 pr-3 whitespace-nowrap">{dataBR(m.data)}</td>
                        <td className="py-2 pr-3 font-medium">{ROTULO_TIPO[m.tipo_movimentacao] ?? m.tipo_movimentacao}</td>
                        <td className="py-2 pr-3 text-content-muted">{ROTULO_ORIGEM[m.origem ?? ''] ?? m.origem ?? 'Manual'}</td>
                        <td className="py-2 pr-3 text-content-muted">{[m.fornecedor, m.lote_produto && `Lote ${m.lote_produto}`, m.validade && `val. ${dataBR(m.validade)}`, m.observacao].filter(Boolean).join(' · ') || '—'}</td>
                        <td className={`py-2 pr-3 text-right whitespace-nowrap ${m.variacao < 0 ? 'text-red-600' : ''}`}>{sinal} {numero(qtd)} {unidadeNaQuantidade(m.unidade || historico.item.unidade, qtd)}</td>
                        <td className="py-2 pr-3 text-right">{m.custo_unitario == null ? '—' : moeda(Number(m.custo_unitario))}</td>
                        <td className={`py-2 text-right font-semibold ${m.saldo_apos < 0 ? 'text-red-600' : ''}`}>{numero(m.saldo_apos)}</td>
                      </tr>
                    )
                  })}
                  {extratoVisivel.length === 0 && (
                    <tr><td colSpan={7} className="py-6 text-center text-content-muted">Nenhum lançamento no período.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {temMovimentoDoApp && (
              <p className="text-xs text-content-muted">Lançamentos gerados por registros (aplicativo ou Enfermaria) não são editados aqui: corrija o registro de origem.</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
