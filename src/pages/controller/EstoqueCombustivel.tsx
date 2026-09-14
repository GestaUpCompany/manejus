import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, Input, Select, Modal, ConfirmModal, CardSkeleton, EmptyState } from '../../components/ui'
import { getFazendaIdForUser, getFazendaNome } from '../../utils/fazendaContext'
import { formatDate } from '../../utils/formatDate'

interface Tanque {
  id: string
  fazenda_id: string
  nome: string
  tipo_combustivel: string
  capacidade_maxima_l: number
  saldo_atual_l: number
  limite_alerta_l: number
  custo_medio_l: number
  ativo: boolean
  deleted_at: string | null
}

const TIPOS_COMBUSTIVEL = [
  { value: 'Álcool', label: 'Álcool' },
  { value: 'Gasolina', label: 'Gasolina' },
  { value: 'Diesel S10', label: 'Diesel S10' },
  { value: 'Diesel Comum', label: 'Diesel Comum' },
]

export function EstoqueCombustivel() {
  const { user } = useAuth()
  const [fazendaId, setFazendaId] = useState<string | null>(null)
  const [fazendaNome, setFazendaNome] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tanques, setTanques] = useState<Tanque[]>([])
  const [kpiMes, setKpiMes] = useState({ consumo_l: 0, custo_rs: 0 })

  // Modais
  const [modalTanque, setModalTanque] = useState(false)
  const [tanqueEditando, setTanqueEditando] = useState<Tanque | null>(null)
  const [modalEntrada, setModalEntrada] = useState(false)
  const [modalHistorico, setModalHistorico] = useState<Tanque | null>(null)
  const [historicoMovs, setHistoricoMovs] = useState<any[]>([])
  const [historicoLoading, setHistoricoLoading] = useState(false)
  const [modalExcluirTanque, setModalExcluirTanque] = useState<Tanque | null>(null)
  const [tanquesExcluidos, setTanquesExcluidos] = useState<Tanque[]>([])
  const [mostrarLixeira, setMostrarLixeira] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form tanque
  const [tanqueForm, setTanqueForm] = useState({
    nome: '',
    tipo_combustivel: '',
    capacidade_maxima_l: '',
    limite_alerta_l: '',
    saldo_inicial_l: '',
    preco_inicial_l: '',
  })

  // Form entrada (preco por litro digitado, valor total derivado)
  const [entradaForm, setEntradaForm] = useState({
    tanque_id: '',
    quantidade_l: '',
    preco_por_litro: '',
    fornecedor: '',
    observacao: '',
  })

  const loadAll = useCallback(async () => {
    if (!fazendaId) return
    setLoading(true)
    try {
      const [tanquesRes, kpiRes, excluidosRes] = await Promise.all([
        supabase
          .from('tanques_combustivel')
          .select('*')
          .eq('fazenda_id', fazendaId)
          .is('deleted_at', null)
          .order('tipo_combustivel'),
        supabase
          .from('movimentacoes_combustivel')
          .select('quantidade_l, preco_por_litro')
          .eq('fazenda_id', fazendaId)
          .eq('tipo_movimentacao', 'baixa')
          .gte('data', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]),
        supabase
          .from('tanques_combustivel')
          .select('*')
          .eq('fazenda_id', fazendaId)
          .not('deleted_at', 'is', null)
          .order('deleted_at', { ascending: false }),
      ])

      if (tanquesRes.error) throw tanquesRes.error
      if (kpiRes.error) throw kpiRes.error
      if (excluidosRes.error) throw excluidosRes.error

      setTanques(tanquesRes.data as Tanque[])
      setTanquesExcluidos(excluidosRes.data as Tanque[])

      const movs = kpiRes.data || []
      const consumo = movs.reduce((sum, m) => sum + Number(m.quantidade_l), 0)
      const custo = movs.reduce((sum, m) => sum + (Number(m.quantidade_l) * (Number(m.preco_por_litro) || 0)), 0)
      setKpiMes({ consumo_l: consumo, custo_rs: custo })
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

  // Helpers
  const saldoTotal = tanques.reduce((sum, t) => sum + Number(t.saldo_atual_l), 0)
  const valorEstoque = tanques.reduce((sum, t) => sum + Number(t.saldo_atual_l) * Number(t.custo_medio_l), 0)
  const tanquesEmAlerta = tanques.filter((t) => Number(t.saldo_atual_l) <= Number(t.limite_alerta_l) && t.limite_alerta_l > 0)

  const tanquesAtivos = tanques.filter((t) => t.ativo)

  // Handlers tanque
  const abrirModalTanque = (tanque: Tanque | null) => {
    setTanqueEditando(tanque)
    if (tanque) {
      setTanqueForm({
        nome: tanque.nome,
        tipo_combustivel: tanque.tipo_combustivel,
        capacidade_maxima_l: String(tanque.capacidade_maxima_l),
        limite_alerta_l: String(tanque.limite_alerta_l),
        saldo_inicial_l: '',
        preco_inicial_l: '',
      })
    } else {
      setTanqueForm({ nome: '', tipo_combustivel: '', capacidade_maxima_l: '', limite_alerta_l: '', saldo_inicial_l: '', preco_inicial_l: '' })
    }
    setModalTanque(true)
  }

  const salvarTanque = async () => {
    if (!fazendaId) return
    setSubmitting(true)
    setError(null)
    try {
      const payload = {
        fazenda_id: fazendaId,
        nome: tanqueForm.nome,
        tipo_combustivel: tanqueForm.tipo_combustivel,
        capacidade_maxima_l: parseFloat(tanqueForm.capacidade_maxima_l),
        limite_alerta_l: parseFloat(tanqueForm.limite_alerta_l) || 0,
      }
      if (tanqueEditando) {
        const { error } = await supabase.from('tanques_combustivel').update(payload).eq('id', tanqueEditando.id)
        if (error) throw error
      } else {
        const { data: newTanque, error } = await supabase.from('tanques_combustivel').insert(payload).select('id').single()
        if (error) throw error

        // Se houver saldo inicial, inserir movimentacao de estoque_inicial
        const saldoInicial = parseFloat(tanqueForm.saldo_inicial_l) || 0
        const precoInicial = parseFloat(tanqueForm.preco_inicial_l) || 0
        if (saldoInicial > 0 && precoInicial > 0) {
          const valorTotal = saldoInicial * precoInicial
          const { error: movError } = await supabase.from('movimentacoes_combustivel').insert({
            fazenda_id: fazendaId,
            tanque_id: newTanque.id,
            tipo_movimentacao: 'entrada',
            quantidade_l: saldoInicial,
            valor_total: parseFloat(valorTotal.toFixed(2)),
            preco_por_litro: precoInicial,
            data: new Date().toISOString().split('T')[0],
            origem: 'estoque_inicial',
            observacao: 'Saldo inicial do tanque',
          })
          if (movError) throw movError
        }
      }
      setModalTanque(false)
      loadAll()
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar tanque')
    } finally {
      setSubmitting(false)
    }
  }

  // Handlers entrada (valor total unico, preco derivado)
  const abrirModalEntrada = () => {
    setEntradaForm({ tanque_id: '', quantidade_l: '', preco_por_litro: '', fornecedor: '', observacao: '' })
    setModalEntrada(true)
  }

  const salvarEntrada = async () => {
    if (!fazendaId || !entradaForm.tanque_id || !entradaForm.quantidade_l || !entradaForm.preco_por_litro) return
    setSubmitting(true)
    setError(null)
    try {
      const litros = parseFloat(entradaForm.quantidade_l)
      const precoPorLitro = parseFloat(entradaForm.preco_por_litro)
      const valorTotal = litros * precoPorLitro

      const { error } = await supabase.from('movimentacoes_combustivel').insert({
        fazenda_id: fazendaId,
        tanque_id: entradaForm.tanque_id,
        tipo_movimentacao: 'entrada',
        quantidade_l: litros,
        valor_total: valorTotal,
        preco_por_litro: precoPorLitro,
        data: new Date().toISOString().split('T')[0],
        origem: 'painel_entrada',
        fornecedor: entradaForm.fornecedor || null,
        observacao: entradaForm.observacao || null,
      })
      if (error) throw error
      setModalEntrada(false)
      loadAll()
    } catch (err: any) {
      setError(err.message || 'Erro ao registrar entrada')
    } finally {
      setSubmitting(false)
    }
  }

  // Handler histórico
  const abrirModalHistorico = async (tanque: Tanque) => {
    setModalHistorico(tanque)
    setHistoricoLoading(true)
    try {
      const { data, error } = await supabase
        .from('movimentacoes_combustivel')
        .select('id, tipo_movimentacao, quantidade_l, preco_por_litro, valor_total, data, origem, fornecedor, observacao, created_at, registro_abastecimento_id')
        .eq('tanque_id', tanque.id)
        .order('data', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      setHistoricoMovs(data || [])
    } catch (err: any) {
      console.error('Erro ao carregar histórico:', err)
      setHistoricoMovs([])
    } finally {
      setHistoricoLoading(false)
    }
  }

  // Handler excluir tanque (soft delete)
  const excluirTanque = async () => {
    if (!modalExcluirTanque) return
    setSubmitting(true)
    setError(null)
    try {
      const { error } = await supabase
        .from('tanques_combustivel')
        .update({ deleted_at: new Date().toISOString(), ativo: false })
        .eq('id', modalExcluirTanque.id)
      if (error) throw error
      setModalExcluirTanque(null)
      loadAll()
    } catch (err: any) {
      setError(err.message || 'Erro ao excluir tanque')
    } finally {
      setSubmitting(false)
    }
  }

  // Handler restaurar tanque (undo soft delete)
  const restaurarTanque = async (tanque: Tanque) => {
    setSubmitting(true)
    setError(null)
    try {
      const { error } = await supabase
        .from('tanques_combustivel')
        .update({ deleted_at: null, ativo: true })
        .eq('id', tanque.id)
      if (error) throw error
      loadAll()
    } catch (err: any) {
      setError(err.message || 'Erro ao restaurar tanque')
    } finally {
      setSubmitting(false)
    }
  }

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

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Estoque de Combustível</h2>
          {fazendaNome && <p className="text-sm text-gray-500 mt-1">{fazendaNome}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => abrirModalTanque(null)}>
            Configurar Tanque
          </Button>
          <Button onClick={abrirModalEntrada}>
            Registrar Entrada
          </Button>
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
          <p className="text-xs sm:text-sm text-gray-500 font-medium">Saldo Total</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{saldoTotal.toLocaleString('pt-BR')} L</p>
        </Card>
        <Card className="bg-white p-4 sm:p-5" disableHover>
          <p className="text-xs sm:text-sm text-gray-500 font-medium">Valor em Estoque</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">R$ {valorEstoque.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </Card>
        <Card className="bg-white p-4 sm:p-5" disableHover>
          <p className="text-xs sm:text-sm text-gray-500 font-medium">Consumo do Mês</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{kpiMes.consumo_l.toLocaleString('pt-BR')} L</p>
        </Card>
        <Card className="bg-white p-4 sm:p-5" disableHover>
          <p className="text-xs sm:text-sm text-gray-500 font-medium">Custo do Mês</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">R$ {kpiMes.custo_rs.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </Card>
      </div>

      {/* Alerta de tanques baixos */}
      {tanquesEmAlerta.length > 0 && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-4">
          <p className="text-sm font-semibold text-red-700">
            {tanquesEmAlerta.length} tanque(s) com estoque baixo:
          </p>
          <p className="text-xs text-red-600 mt-1">
            {tanquesEmAlerta.map((t) => t.nome).join(', ')}
          </p>
        </div>
      )}

      {/* Tanques */}
      <div>
        <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-3">Tanques</h3>
        {tanquesAtivos.length === 0 ? (
          <Card className="bg-white p-6" disableHover>
            <EmptyState
              title="Nenhum tanque cadastrado"
              description="Configure tanques de combustível para controlar o estoque."
              action={<Button onClick={() => abrirModalTanque(null)}>Configurar Tanque</Button>}
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {tanquesAtivos.map((tanque) => {
              const pctOcupacao = tanque.capacidade_maxima_l > 0
                ? Math.min(100, (Number(tanque.saldo_atual_l) / Number(tanque.capacidade_maxima_l)) * 100)
                : 0
              const emAlerta = tanque.limite_alerta_l > 0 && Number(tanque.saldo_atual_l) <= Number(tanque.limite_alerta_l)
              const valorTanque = Number(tanque.saldo_atual_l) * Number(tanque.custo_medio_l)
              return (
                <Card key={tanque.id} className="bg-white p-4 sm:p-5" disableHover>
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-semibold text-gray-800">{tanque.nome}</p>
                      <p className="text-xs text-gray-500">{tanque.tipo_combustivel}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {emAlerta && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          Alerta
                        </span>
                      )}
                      <button
                        onClick={() => abrirModalTanque(tanque)}
                        className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100"
                        title="Editar tanque"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => abrirModalHistorico(tanque)}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100"
                        title="Ver histórico"
                      >
                        Histórico
                      </button>
                      <button
                        onClick={() => setModalExcluirTanque(tanque)}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100"
                        title="Excluir tanque"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Saldo atual</span>
                      <span className="font-semibold text-gray-900">
                        {Number(tanque.saldo_atual_l).toLocaleString('pt-BR')} L
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Custo médio</span>
                      <span className="text-gray-700">R$ {Number(tanque.custo_medio_l).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}/L</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Valor em estoque</span>
                      <span className="font-semibold text-gray-900">R$ {valorTanque.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Capacidade</span>
                      <span className="text-gray-700">{Number(tanque.capacidade_maxima_l).toLocaleString('pt-BR')} L</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Alerta abaixo de</span>
                      <span className="text-gray-700">{Number(tanque.limite_alerta_l).toLocaleString('pt-BR')} L</span>
                    </div>
                  </div>
                  {/* Barra de ocupacao */}
                  <div className="mt-3">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${emAlerta ? 'bg-red-500' : pctOcupacao > 80 ? 'bg-green-600' : 'bg-blue-500'}`}
                        style={{ width: `${pctOcupacao}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{pctOcupacao.toFixed(0)}% de ocupação</p>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal: Configurar Tanque */}
      <Modal
        isOpen={modalTanque}
        onClose={() => setModalTanque(false)}
        title={tanqueEditando ? 'Editar Tanque' : 'Novo Tanque'}
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Nome do Tanque"
            placeholder="Ex: Tanque Diesel S10"
            value={tanqueForm.nome}
            onChange={(e) => setTanqueForm({ ...tanqueForm, nome: e.target.value })}
            required
          />
          <Select
            label="Tipo de Combustível"
            options={TIPOS_COMBUSTIVEL}
            value={tanqueForm.tipo_combustivel}
            onChange={(val) => setTanqueForm({ ...tanqueForm, tipo_combustivel: val })}
            placeholder="Selecione..."
            required
          />
          <Input
            label="Capacidade Máxima (L)"
            type="number"
            placeholder="Ex: 5000"
            value={tanqueForm.capacidade_maxima_l}
            onChange={(e) => setTanqueForm({ ...tanqueForm, capacidade_maxima_l: e.target.value })}
            required
          />
          <Input
            label="Limite de Alerta (L)"
            type="number"
            placeholder="Ex: 500"
            value={tanqueForm.limite_alerta_l}
            onChange={(e) => setTanqueForm({ ...tanqueForm, limite_alerta_l: e.target.value })}
          />
          <p className="text-xs text-gray-500">Alerta dispara quando o saldo ficar abaixo deste valor.</p>
          {!tanqueEditando && (
            <>
              <div className="border-t pt-4 mt-2">
                <p className="text-sm font-semibold text-gray-700 mb-3">Campos opcionais</p>
                <Input
                  label="Saldo Inicial (L)"
                  type="number"
                  placeholder="Ex: 1800"
                  value={tanqueForm.saldo_inicial_l}
                  onChange={(e) => setTanqueForm({ ...tanqueForm, saldo_inicial_l: e.target.value })}
                />
                <Input
                  label="Preço por Litro Inicial (R$)"
                  type="number"
                  placeholder="Ex: 5.99"
                  value={tanqueForm.preco_inicial_l}
                  onChange={(e) => setTanqueForm({ ...tanqueForm, preco_inicial_l: e.target.value })}
                />
                <p className="text-xs text-gray-500">Define o saldo e custo médio inicial do tanque. O custo médio será ajustado conforme novas entradas forem registradas.</p>
              </div>
            </>
          )}
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => setModalTanque(false)}>Cancelar</Button>
            <Button onClick={salvarTanque} disabled={submitting || !tanqueForm.nome || !tanqueForm.tipo_combustivel || !tanqueForm.capacidade_maxima_l}>
              {submitting ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Registrar Entrada */}
      <Modal
        isOpen={modalEntrada}
        onClose={() => setModalEntrada(false)}
        title="Registrar Entrada de Combustível"
        size="md"
      >
        <div className="space-y-4">
          <Select
            label="Tanque"
            options={tanquesAtivos.map((t) => ({ value: t.id, label: `${t.nome} (${t.tipo_combustivel})` }))}
            value={entradaForm.tanque_id}
            onChange={(val) => setEntradaForm({ ...entradaForm, tanque_id: val })}
            placeholder="Selecione o tanque..."
            required
          />
          <Input
            label="Quantidade (L)"
            type="number"
            placeholder="Ex: 1000"
            value={entradaForm.quantidade_l}
            onChange={(e) => setEntradaForm({ ...entradaForm, quantidade_l: e.target.value })}
            required
          />
          <Input
            label="Preço por Litro (R$)"
            type="number"
            placeholder="Ex: 6.50"
            value={entradaForm.preco_por_litro}
            onChange={(e) => setEntradaForm({ ...entradaForm, preco_por_litro: e.target.value })}
            required
          />
          {entradaForm.quantidade_l && entradaForm.preco_por_litro && (() => {
            const litros = parseFloat(entradaForm.quantidade_l) || 0
            const preco = parseFloat(entradaForm.preco_por_litro) || 0
            const total = litros * preco
            if (total > 0) {
              return (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800">
                    <span className="font-bold">Valor total: R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    <span className="block text-xs mt-0.5">{litros.toLocaleString('pt-BR')} L × R$ {preco.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}/L</span>
                  </p>
                </div>
              )
            }
            return null
          })()}
          <p className="text-xs text-gray-500">O valor total é calculado automaticamente: preço por litro × quantidade.</p>
          <Input
            label="Fornecedor"
            placeholder="Ex: Posto São João"
            value={entradaForm.fornecedor}
            onChange={(e) => setEntradaForm({ ...entradaForm, fornecedor: e.target.value })}
          />
          <Input
            label="Observação"
            placeholder="Detalhes adicionais (opcional)"
            value={entradaForm.observacao}
            onChange={(e) => setEntradaForm({ ...entradaForm, observacao: e.target.value })}
          />
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="secondary" onClick={() => setModalEntrada(false)}>Cancelar</Button>
            <Button onClick={salvarEntrada} disabled={submitting || !entradaForm.tanque_id || !entradaForm.quantidade_l || !entradaForm.preco_por_litro}>
              {submitting ? 'Salvando...' : 'Registrar Entrada'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Histórico do Tanque */}
      <Modal
        isOpen={!!modalHistorico}
        onClose={() => setModalHistorico(null)}
        title={modalHistorico ? `Histórico — ${modalHistorico.nome}` : 'Histórico'}
        size="lg"
      >
        {modalHistorico && (() => {
          const entradas = historicoMovs.filter((m) => m.tipo_movimentacao === 'entrada')
          const saidas = historicoMovs.filter((m) => m.tipo_movimentacao === 'baixa')
          const totalEntradasL = entradas.reduce((sum, m) => sum + Number(m.quantidade_l), 0)
          const totalSaidasL = saidas.reduce((sum, m) => sum + Number(m.quantidade_l), 0)
          const totalEntradasRS = entradas.reduce((sum, m) => sum + Number(m.valor_total || (Number(m.quantidade_l) * Number(m.preco_por_litro))), 0)
          const totalSaidasRS = saidas.reduce((sum, m) => sum + Number(m.quantidade_l) * Number(m.preco_por_litro), 0)
          const custoMedio = Number(modalHistorico.custo_medio_l)
          const saldoAtual = Number(modalHistorico.saldo_atual_l)

          return (
            <div className="space-y-4">
              {/* Métricas resumidas */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Saldo Atual</p>
                  <p className="text-lg font-bold text-gray-900">{saldoAtual.toLocaleString('pt-BR')} L</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Custo Médio</p>
                  <p className="text-lg font-bold text-gray-900">R$ {custoMedio.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3">
                  <p className="text-xs text-green-600">Total Entradas</p>
                  <p className="text-lg font-bold text-green-700">{totalEntradasL.toLocaleString('pt-BR')} L</p>
                  <p className="text-xs text-green-600">R$ {totalEntradasRS.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3">
                  <p className="text-xs text-red-600">Total Saídas</p>
                  <p className="text-lg font-bold text-red-700">{totalSaidasL.toLocaleString('pt-BR')} L</p>
                  <p className="text-xs text-red-600">R$ {totalSaidasRS.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                </div>
              </div>

              {/* Timeline */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Linha do Tempo</h4>
                {historicoLoading ? (
                  <div className="text-center py-8 text-gray-500">Carregando movimentações...</div>
                ) : historicoMovs.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">Nenhuma movimentação registrada.</div>
                ) : (
                  <div className="max-h-96 overflow-y-auto space-y-2">
                    {historicoMovs.map((mov) => {
                      const isEntrada = mov.tipo_movimentacao === 'entrada'
                      const valor = Number(mov.valor_total || (Number(mov.quantidade_l) * Number(mov.preco_por_litro)))
                      const origemLabel: Record<string, string> = {
                        estoque_inicial: 'Estoque Inicial',
                        painel_entrada: 'Entrada Manual',
                        pwa_entrada: 'Entrada via App',
                        painel_baixa: 'Baixa Manual',
                        painel_ajuste: 'Ajuste Manual',
                        manual: 'Manual',
                      }
                      return (
                        <div
                          key={mov.id}
                          className={`flex items-start gap-3 rounded-lg border p-3 ${
                            isEntrada ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                          }`}
                        >
                          <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                            isEntrada ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}>
                            {isEntrada ? '↓' : '↑'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="text-sm font-semibold text-gray-900">
                                  {isEntrada ? 'Entrada' : 'Saída'} — {Number(mov.quantidade_l).toLocaleString('pt-BR')} L
                                </p>
                                <p className="text-xs text-gray-500">
                                  {formatDate(mov.data)} · {origemLabel[mov.origem] || mov.origem || '-'}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-semibold text-gray-900">
                                  R$ {valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                                <p className="text-xs text-gray-500">
                                  R$ {Number(mov.preco_por_litro).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}/L
                                </p>
                              </div>
                            </div>
                            {(mov.fornecedor || mov.observacao) && (
                              <p className="text-xs text-gray-500 mt-1">
                                {mov.fornecedor && `Fornecedor: ${mov.fornecedor}`}
                                {mov.fornecedor && mov.observacao && ' · '}
                                {mov.observacao}
                              </p>
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

      {/* Confirm: Excluir Tanque */}
      <ConfirmModal
        isOpen={!!modalExcluirTanque}
        onClose={() => setModalExcluirTanque(null)}
        onConfirm={excluirTanque}
        title="Excluir Tanque"
        message={
          modalExcluirTanque
            ? Number(modalExcluirTanque.saldo_atual_l) > 0
              ? `Excluir "${modalExcluirTanque.nome}"? Este tanque possui ${Number(modalExcluirTanque.saldo_atual_l).toLocaleString('pt-BR')} L em saldo. O saldo sairá da contagem total do estoque. As movimentações históricas serão preservadas.`
              : `Excluir "${modalExcluirTanque.nome}"? As movimentações históricas serão preservadas.`
            : ''
        }
        confirmText="Excluir"
        variant="danger"
      />

      {/* Lixeira: Tanques Excluídos */}
      {tanquesExcluidos.length > 0 && (
        <div>
          <button
            onClick={() => setMostrarLixeira(!mostrarLixeira)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`w-4 h-4 text-gray-400 transition-transform ${mostrarLixeira ? 'rotate-90' : ''}`}
            >
              <path
                fillRule="evenodd"
                d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                clipRule="evenodd"
              />
            </svg>
            Tanques Excluídos ({tanquesExcluidos.length})
          </button>
          {mostrarLixeira && (
            <div className="mt-3 space-y-2">
              {tanquesExcluidos.map((tanque) => (
                <Card key={tanque.id} className="bg-gray-50 p-3 sm:p-4 border border-gray-200" disableHover>
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium text-gray-600">{tanque.nome}</p>
                      <p className="text-xs text-gray-400">
                        {tanque.tipo_combustivel} · Saldo final: {Number(tanque.saldo_atual_l).toLocaleString('pt-BR')} L
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => abrirModalHistorico(tanque)}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-100"
                        title="Ver histórico"
                      >
                        Histórico
                      </button>
                      <button
                        onClick={() => restaurarTanque(tanque)}
                        disabled={submitting}
                        className="inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 transition-colors hover:bg-green-100 disabled:opacity-50"
                        title="Restaurar tanque"
                      >
                        Restaurar
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
