import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, CardSkeleton, Input, Select } from '../../components/ui'
import { getFazendaIdForUser, getFazendaNome } from '../../utils/fazendaContext'

interface Item {
  id: string
  nome: string
  classificacao: string
  unidade: string
  estoque_atual: number
  estoque_minimo: number
  custo_unitario: number
  custo_total_estoque: number
  controla_estoque: boolean
  ativo: boolean
}

interface Movement {
  id: string
  tipo_movimentacao: string
  quantidade: number
  custo_unitario: number | null
  valor_total: number | null
  data: string
  origem: string | null
  fornecedor: string | null
  observacao: string | null
  unidade: string | null
}

const tipoLabel: Record<string, string> = { entrada: 'Entrada', baixa: 'Baixa', ajuste: 'Ajuste', estorno: 'Estorno', devolucao: 'Devolução' }
const origemLabel: Record<string, string> = { painel_entrada: 'Entrada manual', painel_ajuste: 'Ajuste manual', pwa_retirada: 'Retirada no PWA', estoque_inicial: 'Estoque inicial' }

export function EstoqueAlmoxarifado() {
  const { user } = useAuth()
  const [fazendaId, setFazendaId] = useState<string | null>(null)
  const [fazendaNome, setFazendaNome] = useState<string | null>(null)
  const [itens, setItens] = useState<Item[]>([])
  const [revisoes, setRevisoes] = useState(0)
  const [revisaoMovs, setRevisaoMovs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [classificacao, setClassificacao] = useState('')
  const [modal, setModal] = useState<'entrada' | 'ajuste' | null>(null)
  const [historico, setHistorico] = useState<{ item: Item; movimentos: Movement[] } | null>(null)
  const [form, setForm] = useState({ itemId: '', quantidade: '', custo: '', fornecedor: '', observacao: '' })

  const carregar = useCallback(async () => {
    if (!fazendaId) return
    setLoading(true)
    const { data, error } = await supabase.from('itens_almoxarifado').select('id,nome,classificacao,unidade,estoque_atual,estoque_minimo,custo_unitario,custo_total_estoque,controla_estoque,ativo').eq('fazenda_id', fazendaId).eq('ativo', true).order('nome')
    if (error) setErro(error.message)
    setItens((data as Item[]) || [])
    const { data: revisaoData, count } = await supabase.from('movimentacoes_almoxarifado').select('id,item_id,quantidade,quantidade_aprovada,data,observacao,registro_origem_id,itens_almoxarifado(nome,unidade),registros_almoxarifado!registro_origem_id(quem_pegou,quem_entregou)', { count: 'exact' }).eq('fazenda_id', fazendaId).eq('requer_revisao', true).is('deleted_at', null).order('data', { ascending: false })
    setRevisaoMovs(revisaoData || [])
    setRevisoes(count || 0)
    setLoading(false)
  }, [fazendaId])

  useEffect(() => {
    if (!user) return
    getFazendaIdForUser(user.id).then((id) => { setFazendaId(id); if (id) getFazendaNome(id).then(setFazendaNome) })
  }, [user])
  useEffect(() => { carregar() }, [carregar])

  const salvarMovimento = async () => {
    if (!fazendaId || !form.itemId || !form.quantidade) return
    const item = itens.find((i) => i.id === form.itemId)
    if (!item) return
    const quantidade = Number(form.quantidade)
    const isEntrada = modal === 'entrada'
    if (!Number.isFinite(quantidade) || quantidade < 0 || (isEntrada && !form.custo)) return
    const { error } = await supabase.from('movimentacoes_almoxarifado').insert({
      fazenda_id: fazendaId, item_id: item.id, tipo_movimentacao: isEntrada ? 'entrada' : 'ajuste', quantidade,
      custo_unitario: isEntrada ? Number(form.custo) : null, valor_total: isEntrada ? quantidade * Number(form.custo) : null,
      origem: isEntrada ? 'painel_entrada' : 'painel_ajuste', fornecedor: form.fornecedor || null,
      observacao: form.observacao || null, data: new Date().toISOString().slice(0, 10),
    })
    if (error) setErro(error.message)
    else { setModal(null); setForm({ itemId: '', quantidade: '', custo: '', fornecedor: '', observacao: '' }); carregar() }
  }

  const aprovarDevolucao = async (movimento: any) => {
    const { error } = await supabase.from('movimentacoes_almoxarifado').update({ quantidade_aprovada: movimento.quantidade, requer_revisao: false, aprovacao_manual: true }).eq('id', movimento.id).eq('fazenda_id', fazendaId!)
    if (error) setErro(error.message)
    else carregar()
  }

  const abrirHistorico = async (item: Item) => {
    const { data } = await supabase.from('movimentacoes_almoxarifado').select('id,tipo_movimentacao,quantidade,custo_unitario,valor_total,data,origem,fornecedor,observacao,unidade').eq('fazenda_id', fazendaId!).eq('item_id', item.id).is('deleted_at', null).order('data', { ascending: false }).order('created_at', { ascending: false })
    setHistorico({ item, movimentos: (data as Movement[]) || [] })
  }

  const categorias = [...new Set(itens.map((i) => i.classificacao))].sort()
  const visiveis = itens.filter((i) => !classificacao || i.classificacao === classificacao)
  const valorTotal = visiveis.reduce((sum, i) => sum + Number(i.custo_total_estoque || Number(i.estoque_atual) * Number(i.custo_unitario)), 0)

  if (loading) return <div className="grid grid-cols-1 md:grid-cols-3 gap-4"><CardSkeleton /><CardSkeleton /><CardSkeleton /></div>

  return <div className="space-y-4 sm:space-y-6">
    <div className="flex flex-col sm:flex-row justify-between gap-3"><div><h2 className="text-xl sm:text-2xl font-bold text-content-strong">Estoque de Almoxarifado</h2>{fazendaNome && <p className="text-sm text-content-muted">{fazendaNome}</p>}</div><div className="flex gap-2"><Button variant="secondary" onClick={() => setModal('ajuste')}>Ajuste</Button><Button onClick={() => setModal('entrada')}>Registrar Entrada</Button></div></div>
    {erro && <Card className="p-4 bg-red-500/10"><p className="text-sm text-red-700">{erro}</p></Card>}
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3"><Card className="p-4" disableHover><p className="text-xs text-content-muted">Itens controlados</p><p className="text-2xl font-bold">{visiveis.filter((i) => i.controla_estoque).length}</p></Card><Card className="p-4" disableHover><p className="text-xs text-content-muted">Itens em alerta</p><p className="text-2xl font-bold text-amber-600">{visiveis.filter((i) => Number(i.estoque_atual) <= Number(i.estoque_minimo) && Number(i.estoque_minimo) > 0).length}</p></Card><Card className="p-4" disableHover><p className="text-xs text-content-muted">Devoluções para revisar</p><p className={`text-2xl font-bold ${revisoes > 0 ? 'text-red-600' : 'text-content-strong'}`}>{revisoes}</p></Card><Card className="p-4" disableHover><p className="text-xs text-content-muted">Valor em estoque</p><p className="text-2xl font-bold">R$ {valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p></Card></div>
    {revisaoMovs.length > 0 && <Card className="p-4 border border-red-200" disableHover><h3 className="font-semibold text-red-700">Devoluções aguardando revisão</h3><p className="text-sm text-content-muted mt-1">A quantidade excedeu o saldo devolvível e não foi incorporada ao estoque.</p><div className="mt-3 space-y-2">{revisaoMovs.map((movimento) => <div key={movimento.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg bg-red-500/5 p-3 text-sm"><div><strong>{movimento.itens_almoxarifado?.nome || movimento.item_id}</strong><p className="text-xs text-content-muted">Solicitado: {movimento.quantidade} · aprovado: {movimento.quantidade_aprovada} · {movimento.data}{movimento.registros_almoxarifado?.quem_pegou ? ` · devolvido por ${movimento.registros_almoxarifado.quem_pegou}` : ''}</p></div><Button size="sm" onClick={() => aprovarDevolucao(movimento)}>Incorporar ao estoque</Button></div>)}</div></Card>}
    <div className="max-w-xs"><Select label="Classificação" value={classificacao} onChange={setClassificacao} placeholder="Todas" options={categorias.map((c) => ({ value: c, label: c }))} /></div>
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{visiveis.map((item) => { const saldo = Number(item.estoque_atual); const alerta = item.estoque_minimo > 0 && saldo <= Number(item.estoque_minimo); return <Card key={item.id} className="p-4" disableHover><div className="flex justify-between gap-2"><div><h3 className="font-semibold text-content-strong">{item.nome}</h3><p className="text-xs text-content-muted">{item.classificacao} · {item.unidade}</p></div>{alerta && <span className="text-xs rounded-full px-2 py-1 bg-amber-500/10 text-amber-700">Atenção</span>}</div><div className="mt-4 space-y-1 text-sm"><div className="flex justify-between"><span className="text-content-muted">Saldo</span><strong className={saldo < 0 ? 'text-red-600' : ''}>{saldo.toLocaleString('pt-BR')} {item.unidade}</strong></div><div className="flex justify-between"><span className="text-content-muted">Custo médio</span><span>R$ {Number(item.custo_unitario).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div><div className="flex justify-between"><span className="text-content-muted">Mínimo</span><span>{Number(item.estoque_minimo).toLocaleString('pt-BR')} {item.unidade}</span></div></div><div className="mt-4 flex gap-2"><Button size="sm" variant="secondary" onClick={() => abrirHistorico(item)}>Histórico</Button></div></Card> })}</div>
    {modal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><Card className="w-full max-w-lg p-5" disableHover><h3 className="text-lg font-semibold mb-4">{modal === 'entrada' ? 'Registrar entrada' : 'Ajustar saldo'}</h3><div className="space-y-3"><Select label="Item" value={form.itemId} onChange={(value) => setForm({ ...form, itemId: value })} placeholder="Selecione..." options={itens.filter((i) => i.controla_estoque).map((i) => ({ value: i.id, label: `${i.nome} (${i.unidade})` }))} /><Input label={modal === 'entrada' ? 'Quantidade' : 'Novo saldo'} type="number" min="0" step="0.001" value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: e.target.value })} />{modal === 'entrada' && <><Input label="Custo unitário" type="number" min="0" step="0.0001" value={form.custo} onChange={(e) => setForm({ ...form, custo: e.target.value })} /><Input label="Fornecedor" value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} /></>}<Input label="Observação" value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} /></div><div className="flex gap-2 mt-5"><Button onClick={salvarMovimento}>Salvar</Button><Button variant="secondary" onClick={() => setModal(null)}>Cancelar</Button></div></Card></div>}
    {historico && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><Card className="w-full max-w-2xl max-h-[80vh] overflow-auto p-5" disableHover><div className="flex justify-between mb-4"><h3 className="text-lg font-semibold">Histórico: {historico.item.nome}</h3><button onClick={() => setHistorico(null)}>Fechar</button></div>{historico.movimentos.map((m) => <div key={m.id} className="border-b border-border-base py-3 flex justify-between gap-3 text-sm"><div><strong>{tipoLabel[m.tipo_movimentacao] || m.tipo_movimentacao}</strong><p className="text-xs text-content-muted">{origemLabel[m.origem || ''] || m.origem || 'Manual'} · {m.data}</p></div><span>{Number(m.quantidade).toLocaleString('pt-BR')} {m.unidade || historico.item.unidade}</span></div>)}</Card></div>}
  </div>
}
