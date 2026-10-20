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
  movimentoEditavel,
  movimentosComSaldo,
  semCusto,
  sinalMovimento,
  totaisDaTela,
  validarAjuste,
  validarEntrada,
  valorDoItem,
  type FormAjuste,
  type FormEntrada,
  type ItemEstoqueCantina,
  type MovimentoCantina,
} from '../../features/estoqueCantina/logica'

const hojeLocal = () => new Date().toLocaleDateString('en-CA')

const COLUNAS_ITEM = 'id,nome,classificacao,unidade_medida,estoque_atual,estoque_minimo,custo_unitario,custo_total_estoque,controla_estoque'
const COLUNAS_MOVIMENTO = 'id,item_id,tipo_movimentacao,quantidade,custo_unitario,valor_total,data,origem,fornecedor,observacao,unidade,registro_origem_id,created_at'

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const numero = (v: number, casas = 3) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas })
const dataBR = (iso: string) => iso.split('-').reverse().join('/')

const formEntradaVazio = (): FormEntrada => ({ itemId: '', quantidade: '', custo: '', fornecedor: '', observacao: '', data: hojeLocal() })
const formAjusteVazio = (): FormAjuste => ({ itemId: '', saldo: '', observacao: '', data: hojeLocal() })

interface HistoricoAberto {
  item: ItemEstoqueCantina
  movimentos: MovimentoCantina[]
}

export function EstoqueCantina() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [fazendaId, setFazendaId] = useState<string | null>(null)
  const [fazendaNome, setFazendaNome] = useState<string | null>(null)
  const [itens, setItens] = useState<ItemEstoqueCantina[]>([])
  const [consumoMes, setConsumoMes] = useState(0)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [classificacao, setClassificacao] = useState('')
  const [modal, setModal] = useState<'entrada' | 'ajuste' | null>(null)
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
    const [itensRes, consumoRes] = await Promise.all([
      supabase.from('itens_cantina').select(COLUNAS_ITEM).eq('fazenda_id', fazendaId).eq('ativo', true).is('deleted_at', null).order('nome'),
      supabase
        .from('movimentacoes_cantina')
        .select('tipo_movimentacao,data,quantidade,custo_unitario,valor_total')
        .eq('fazenda_id', fazendaId)
        .in('tipo_movimentacao', ['baixa', 'estorno'])
        .gte('data', inicioDoMes)
        .is('deleted_at', null),
    ])
    if (itensRes.error) setErro(itensRes.error.message)
    else if (consumoRes.error) setErro(consumoRes.error.message)
    else setErro(null)
    setItens((itensRes.data as ItemEstoqueCantina[]) || [])
    setConsumoMes(consumoDoMes((consumoRes.data as MovimentoCantina[]) || [], inicioDoMes))
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
  const categorias = useMemo(() => [...new Set(itens.map((i) => i.classificacao))].sort(), [itens])
  const visiveis = useMemo(() => filtrarEOrdenar(itens, busca, classificacao), [itens, busca, classificacao])
  const itensControlados = useMemo(() => itens.filter((i) => i.controla_estoque), [itens])

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
      const { error } = await supabase.from('movimentacoes_cantina').insert({
        fazenda_id: fazendaId,
        item_id: formEntrada.itemId,
        tipo_movimentacao: 'entrada',
        quantidade: v.valores.quantidade,
        custo_unitario: v.valores.custo,
        valor_total: Math.round(v.valores.quantidade * v.valores.custo * 100) / 100,
        origem: 'painel_entrada',
        fornecedor: formEntrada.fornecedor.trim() || null,
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
      const { error } = await supabase.from('movimentacoes_cantina').insert({
        fazenda_id: fazendaId,
        item_id: formAjuste.itemId,
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

  const abrirHistorico = async (item: ItemEstoqueCantina) => {
    if (!fazendaId) return
    const { data, error } = await supabase
      .from('movimentacoes_cantina')
      .select(COLUNAS_MOVIMENTO)
      .eq('fazenda_id', fazendaId)
      .eq('item_id', item.id)
      .is('deleted_at', null)
      .limit(2000)
    if (error) return setErro(error.message)
    setPeriodoDe('')
    setPeriodoAte('')
    setHistorico({ item, movimentos: (data as MovimentoCantina[]) || [] })
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
      <div className="flex flex-col sm:flex-row justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-content-strong">Estoque da Cantina</h2>
          {fazendaNome && <p className="text-sm text-content-muted">{fazendaNome}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => navigate('/controller/cadastros-auxiliares')}>Cadastrar itens</Button>
          <Button variant="secondary" onClick={() => navigate('/controller/relatorios')}>Relatório de Cantina</Button>
          <Button variant="secondary" onClick={() => abrirModal('ajuste')}>Ajuste</Button>
          <Button onClick={() => abrirModal('entrada')}>Registrar Entrada</Button>
        </div>
      </div>

      {erro && <Card className="p-4 bg-red-500/10"><p className="text-sm text-red-700">{erro}</p></Card>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4" disableHover>
          <p className="text-xs text-content-muted">Itens controlados</p>
          <p className="text-2xl font-bold">{totais.controlados}</p>
        </Card>
        <Card className="p-4" disableHover>
          <p className="text-xs text-content-muted">Itens em alerta</p>
          <p className="text-2xl font-bold text-amber-600">{totais.em_alerta}</p>
          {totais.sem_custo > 0 && <p className="text-[11px] text-content-muted">{totais.sem_custo} sem custo</p>}
        </Card>
        <Card className="p-4" disableHover>
          <p className="text-xs text-content-muted">Valor em estoque</p>
          <p className="text-2xl font-bold">{moeda(totais.valor_total)}</p>
        </Card>
        <Card className="p-4" disableHover>
          <p className="text-xs text-content-muted">Consumo no mês</p>
          <p className="text-2xl font-bold">{moeda(consumoMes)}</p>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="sm:w-72">
          <Input label="Buscar item" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome do item" />
        </div>
        <div className="sm:w-60">
          <Select label="Classificação" value={classificacao} onChange={setClassificacao} placeholder="Todas" options={categorias.map((c) => ({ value: c, label: c }))} />
        </div>
      </div>

      {visiveis.length === 0 ? (
        <Card className="p-8 text-center" disableHover>
          <p className="text-content-muted">
            {itens.length === 0 ? 'Nenhum item da cantina cadastrado.' : 'Nenhum item para o filtro escolhido.'}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visiveis.map((item) => {
            const saldo = Number(item.estoque_atual)
            const alerta = emAlerta(item)
            return (
              <Card key={item.id} className="p-4" disableHover>
                <div className="flex justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-content-strong">{item.nome}</h3>
                    <p className="text-xs text-content-muted">{item.classificacao} · {item.unidade_medida}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {alerta && <span className="text-xs rounded-full px-2 py-1 bg-amber-500/10 text-amber-700">{saldo < 0 ? 'Saldo negativo' : 'Abaixo do mínimo'}</span>}
                    {semCusto(item) && <span className="text-xs rounded-full px-2 py-1 bg-blue-500/10 text-blue-700">Sem custo</span>}
                    {!item.controla_estoque && <span className="text-xs rounded-full px-2 py-1 bg-gray-500/10 text-content-muted">Sem controle de estoque</span>}
                  </div>
                </div>
                <div className="mt-4 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-content-muted">Saldo</span><strong className={saldo < 0 ? 'text-red-600' : ''}>{numero(saldo)} {item.unidade_medida}</strong></div>
                  <div className="flex justify-between"><span className="text-content-muted">Custo médio</span><span>{moeda(Number(item.custo_unitario))}</span></div>
                  <div className="flex justify-between"><span className="text-content-muted">Mínimo</span><span>{Number(item.estoque_minimo) > 0 ? `${numero(Number(item.estoque_minimo))} ${item.unidade_medida}` : '—'}</span></div>
                  <div className="flex justify-between"><span className="text-content-muted">Valor</span><strong>{moeda(valorDoItem(item))}</strong></div>
                </div>
                {item.controla_estoque ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => abrirModal('entrada', item.id)}>Entrada</Button>
                    <Button size="sm" variant="secondary" onClick={() => abrirModal('ajuste', item.id)}>Ajuste</Button>
                    <Button size="sm" variant="secondary" onClick={() => abrirHistorico(item)}>Histórico</Button>
                  </div>
                ) : (
                  <p className="mt-4 text-xs text-content-muted">Ative "Controla Estoque" no cadastro do item para registrar movimentos.</p>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <Modal isOpen={modal === 'entrada'} onClose={() => setModal(null)} title="Registrar entrada">
        <div className="space-y-3">
          <Select
            label="Item"
            value={formEntrada.itemId}
            onChange={(value) => setFormEntrada({ ...formEntrada, itemId: value })}
            placeholder="Selecione..."
            options={itensControlados.map((i) => ({ value: i.id, label: `${i.nome} (${i.unidade_medida})` }))}
          />
          <Input label="Quantidade" type="number" min="0" step="0.001" value={formEntrada.quantidade} onChange={(e) => setFormEntrada({ ...formEntrada, quantidade: e.target.value })} />
          <Input label="Custo unitário (R$)" type="number" min="0" step="0.0001" value={formEntrada.custo} onChange={(e) => setFormEntrada({ ...formEntrada, custo: e.target.value })} />
          <Input label="Fornecedor" value={formEntrada.fornecedor} onChange={(e) => setFormEntrada({ ...formEntrada, fornecedor: e.target.value })} />
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
            label="Item"
            value={formAjuste.itemId}
            onChange={(value) => setFormAjuste({ ...formAjuste, itemId: value })}
            placeholder="Selecione..."
            options={itensControlados.map((i) => ({ value: i.id, label: `${i.nome} (${i.unidade_medida})` }))}
          />
          <Input label="Novo saldo" type="number" min="0" step="0.001" value={formAjuste.saldo} onChange={(e) => setFormAjuste({ ...formAjuste, saldo: e.target.value })} />
          {itemDoAjuste && (
            <p className="text-xs text-content-muted">
              Saldo atual: {numero(Number(itemDoAjuste.estoque_atual))} {itemDoAjuste.unidade_medida}
              {diferencaAjuste != null && ` · diferença: ${diferencaAjuste > 0 ? '+' : ''}${numero(diferencaAjuste)} ${itemDoAjuste.unidade_medida}`}
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

      <Modal isOpen={!!historico} onClose={() => setHistorico(null)} title={historico ? `Histórico: ${historico.item.nome}` : 'Histórico'} size="xl">
        {historico && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-40"><Input label="De" type="date" value={periodoDe} onChange={(e) => setPeriodoDe(e.target.value)} /></div>
              <div className="w-40"><Input label="Até" type="date" value={periodoAte} onChange={(e) => setPeriodoAte(e.target.value)} /></div>
              {(periodoDe || periodoAte) && <Button size="sm" variant="secondary" onClick={() => { setPeriodoDe(''); setPeriodoAte('') }}>Limpar</Button>}
            </div>
            {divergencia != null && (
              <p className="text-xs rounded-lg bg-amber-500/10 text-amber-700 p-2">
                O saldo reconstruído por data difere do saldo gravado em {numero(divergencia)} {historico.item.unidade_medida}. Costuma acontecer com ajuste lançado com data anterior a outros lançamentos.
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
                        <td className="py-2 pr-3 text-content-muted">{[m.fornecedor, m.observacao].filter(Boolean).join(' · ') || '—'}</td>
                        <td className={`py-2 pr-3 text-right whitespace-nowrap ${m.variacao < 0 ? 'text-red-600' : ''}`}>{sinal} {numero(qtd)} {m.unidade || historico.item.unidade_medida}</td>
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
              <p className="text-xs text-content-muted">Lançamentos do aplicativo são gerados pelos registros de Entrada e Saída da Cantina: para corrigi-los, edite o registro nessas telas.</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
