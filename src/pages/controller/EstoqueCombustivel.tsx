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
  ativo: boolean
  deleted_at: string | null
}

interface AbastecimentoPendente {
  id: string
  data: string
  maquina_veiculo: string
  combustivel: string
  total_abastecido: number
  operador_motorista: string
  placa: string | null
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
  const [abastecimentosPendentes, setAbastecimentosPendentes] = useState<AbastecimentoPendente[]>([])
  const [kpiMes, setKpiMes] = useState({ consumo_l: 0, custo_rs: 0 })

  // Modais
  const [modalTanque, setModalTanque] = useState(false)
  const [tanqueEditando, setTanqueEditando] = useState<Tanque | null>(null)
  const [modalEntrada, setModalEntrada] = useState(false)
  const [modalBaixa, setModalBaixa] = useState<AbastecimentoPendente | null>(null)
  const [modalBaixaTodos, setModalBaixaTodos] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form tanque
  const [tanqueForm, setTanqueForm] = useState({
    nome: '',
    tipo_combustivel: '',
    capacidade_maxima_l: '',
    limite_alerta_l: '',
  })

  // Form entrada
  const [entradaForm, setEntradaForm] = useState({
    tanque_id: '',
    quantidade_l: '',
    preco_por_litro: '',
    fornecedor: '',
    observacao: '',
  })

  // Form baixa
  const [baixaForm, setBaixaForm] = useState({
    tanque_id: '',
    preco_por_litro: '',
    observacao: '',
  })

  const loadAll = useCallback(async () => {
    if (!fazendaId) return
    setLoading(true)
    try {
      const [tanquesRes, pendentesRes, kpiRes] = await Promise.all([
        supabase
          .from('tanques_combustivel')
          .select('*')
          .eq('fazenda_id', fazendaId)
          .is('deleted_at', null)
          .order('tipo_combustivel'),
        supabase
          .from('registros_abastecimento')
          .select('id, data, maquina_veiculo, combustivel, total_abastecido, operador_motorista, placa')
          .eq('fazenda_id', fazendaId)
          .is('deleted_at', null)
          .is('baixa_estoque_id', null)
          .order('data', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('movimentacoes_combustivel')
          .select('quantidade_l, preco_por_litro')
          .eq('fazenda_id', fazendaId)
          .eq('tipo_movimentacao', 'baixa')
          .gte('data', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]),
      ])

      if (tanquesRes.error) throw tanquesRes.error
      if (pendentesRes.error) throw pendentesRes.error
      if (kpiRes.error) throw kpiRes.error

      setTanques(tanquesRes.data as Tanque[])
      setAbastecimentosPendentes(pendentesRes.data as AbastecimentoPendente[])

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
    (async () => {
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
      })
    } else {
      setTanqueForm({ nome: '', tipo_combustivel: '', capacidade_maxima_l: '', limite_alerta_l: '' })
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
        const { error } = await supabase.from('tanques_combustivel').insert(payload)
        if (error) throw error
      }
      setModalTanque(false)
      loadAll()
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar tanque')
    } finally {
      setSubmitting(false)
    }
  }

  // Handlers entrada
  const abrirModalEntrada = () => {
    setEntradaForm({ tanque_id: '', quantidade_l: '', preco_por_litro: '', fornecedor: '', observacao: '' })
    setModalEntrada(true)
  }

  const salvarEntrada = async () => {
    if (!fazendaId || !entradaForm.tanque_id || !entradaForm.quantidade_l) return
    setSubmitting(true)
    setError(null)
    try {
      const { error } = await supabase.from('movimentacoes_combustivel').insert({
        fazenda_id: fazendaId,
        tanque_id: entradaForm.tanque_id,
        tipo_movimentacao: 'entrada',
        quantidade_l: parseFloat(entradaForm.quantidade_l),
        preco_por_litro: entradaForm.preco_por_litro ? parseFloat(entradaForm.preco_por_litro) : null,
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

  // Handlers baixa
  const abrirModalBaixa = (abastecimento: AbastecimentoPendente) => {
    // Auto-sugerir tanque pelo tipo de combustível
    const tanqueSugerido = tanquesAtivos.find((t) => t.tipo_combustivel === abastecimento.combustivel)
    setBaixaForm({
      tanque_id: tanqueSugerido?.id || '',
      preco_por_litro: '',
      observacao: '',
    })
    setModalBaixa(abastecimento)
  }

  const salvarBaixa = async () => {
    if (!fazendaId || !modalBaixa || !baixaForm.tanque_id) return
    setSubmitting(true)
    setError(null)
    try {
      // Inserir movimentação de baixa
      const { data: movData, error: movError } = await supabase.from('movimentacoes_combustivel').insert({
        fazenda_id: fazendaId,
        tanque_id: baixaForm.tanque_id,
        tipo_movimentacao: 'baixa',
        quantidade_l: modalBaixa.total_abastecido,
        preco_por_litro: baixaForm.preco_por_litro ? parseFloat(baixaForm.preco_por_litro) : null,
        data: modalBaixa.data,
        origem: 'painel_baixa',
        registro_abastecimento_id: modalBaixa.id,
        observacao: baixaForm.observacao || null,
      }).select('id').single()

      if (movError) throw movError

      // Vincular abastecimento à baixa
      const { error: updError } = await supabase
        .from('registros_abastecimento')
        .update({ baixa_estoque_id: movData.id })
        .eq('id', modalBaixa.id)

      if (updError) throw updError

      setModalBaixa(null)
      loadAll()
    } catch (err: any) {
      setError(err.message || 'Erro ao dar baixa. Verifique se há saldo suficiente no tanque.')
    } finally {
      setSubmitting(false)
    }
  }

  const baixarTodos = async () => {
    if (!fazendaId || abastecimentosPendentes.length === 0) return
    setSubmitting(true)
    setError(null)
    let sucessos = 0
    let falhas = 0
    for (const ab of abastecimentosPendentes) {
      const tanque = tanquesAtivos.find((t) => t.tipo_combustivel === ab.combustivel)
      if (!tanque) { falhas++; continue }
      try {
        const { data: movData, error: movError } = await supabase.from('movimentacoes_combustivel').insert({
          fazenda_id: fazendaId,
          tanque_id: tanque.id,
          tipo_movimentacao: 'baixa',
          quantidade_l: ab.total_abastecido,
          data: ab.data,
          origem: 'painel_baixa',
          registro_abastecimento_id: ab.id,
        }).select('id').single()
        if (movError) throw movError
        const { error: updError } = await supabase
          .from('registros_abastecimento')
          .update({ baixa_estoque_id: movData.id })
          .eq('id', ab.id)
        if (updError) throw updError
        sucessos++
      } catch {
        falhas++
      }
    }
    setModalBaixaTodos(false)
    loadAll()
    if (falhas > 0) {
      setError(`${sucessos} baixas com sucesso, ${falhas} falhas (verifique saldo dos tanques)`)
    }
    setSubmitting(false)
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
          <p className="text-xs sm:text-sm text-gray-500 font-medium">Consumo do Mês</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{kpiMes.consumo_l.toLocaleString('pt-BR')} L</p>
        </Card>
        <Card className="bg-white p-4 sm:p-5" disableHover>
          <p className="text-xs sm:text-sm text-gray-500 font-medium">Custo do Mês</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">R$ {kpiMes.custo_rs.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </Card>
        <Card className={`p-4 sm:p-5 ${tanquesEmAlerta.length > 0 ? 'bg-red-50 border-red-200' : 'bg-white'}`} disableHover>
          <p className="text-xs sm:text-sm text-gray-500 font-medium">Tanques em Alerta</p>
          <p className={`text-xl sm:text-2xl font-bold mt-1 ${tanquesEmAlerta.length > 0 ? 'text-red-600' : 'text-gray-900'}`}>{tanquesEmAlerta.length}</p>
        </Card>
      </div>

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
              return (
                <Card key={tanque.id} className="bg-white p-4 sm:p-5" disableHover>
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-semibold text-gray-800">{tanque.nome}</p>
                      <p className="text-xs text-gray-500">{tanque.tipo_combustivel}</p>
                    </div>
                    {emAlerta && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                        Alerta
                      </span>
                    )}
                    <button
                      onClick={() => abrirModalTanque(tanque)}
                      className="text-blue-500 text-sm hover:underline ml-2"
                    >
                      Editar
                    </button>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Saldo atual</span>
                      <span className="font-semibold text-gray-900">
                        {Number(tanque.saldo_atual_l).toLocaleString('pt-BR')} L
                      </span>
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
                  {/* Barra de ocupação */}
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

      {/* Abastecimentos pendentes de baixa */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-base sm:text-lg font-semibold text-gray-800">
            Abastecimentos Pendentes de Baixa
          </h3>
          {abastecimentosPendentes.length > 0 && (
            <Button variant="secondary" size="sm" onClick={() => setModalBaixaTodos(true)}>
              Dar Baixa em Todos ({abastecimentosPendentes.length})
            </Button>
          )}
        </div>
        {abastecimentosPendentes.length === 0 ? (
          <Card className="bg-white p-6 text-center" disableHover>
            <p className="text-gray-600">Nenhum abastecimento pendente de baixa</p>
          </Card>
        ) : (
          <Card className="bg-white overflow-x-auto" disableHover>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Máquina/Veículo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Combustível</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total (L)</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Operador</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ação</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {abastecimentosPendentes.map((ab) => {
                  const temTanque = tanquesAtivos.some((t) => t.tipo_combustivel === ab.combustivel)
                  return (
                    <tr key={ab.id}>
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">{formatDate(ab.data)}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{ab.maquina_veiculo || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{ab.combustivel || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 font-medium">{ab.total_abastecido} L</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{ab.operador_motorista || '-'}</td>
                      <td className="px-4 py-3">
                        <Button
                          size="sm"
                          onClick={() => abrirModalBaixa(ab)}
                          disabled={!temTanque}
                          title={temTanque ? 'Dar baixa no estoque' : `Nenhum tanque de ${ab.combustivel} cadastrado`}
                        >
                          Dar Baixa
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
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
            placeholder="Ex: 5.99"
            value={entradaForm.preco_por_litro}
            onChange={(e) => setEntradaForm({ ...entradaForm, preco_por_litro: e.target.value })}
          />
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
            <Button onClick={salvarEntrada} disabled={submitting || !entradaForm.tanque_id || !entradaForm.quantidade_l}>
              {submitting ? 'Salvando...' : 'Registrar Entrada'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Dar Baixa */}
      <Modal
        isOpen={!!modalBaixa}
        onClose={() => setModalBaixa(null)}
        title="Dar Baixa no Estoque"
        size="md"
      >
        {modalBaixa && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-3 space-y-1">
              <p className="text-sm"><span className="text-gray-500">Data:</span> <span className="font-medium">{formatDate(modalBaixa.data)}</span></p>
              <p className="text-sm"><span className="text-gray-500">Máquina:</span> <span className="font-medium">{modalBaixa.maquina_veiculo || '-'}</span></p>
              <p className="text-sm"><span className="text-gray-500">Combustível:</span> <span className="font-medium">{modalBaixa.combustivel}</span></p>
              <p className="text-sm"><span className="text-gray-500">Total:</span> <span className="font-medium">{modalBaixa.total_abastecido} L</span></p>
            </div>
            <Select
              label="Tanque para Baixa"
              options={tanquesAtivos
                .filter((t) => t.tipo_combustivel === modalBaixa.combustivel)
                .map((t) => ({ value: t.id, label: `${t.nome} (Saldo: ${Number(t.saldo_atual_l).toLocaleString('pt-BR')} L)` }))}
              value={baixaForm.tanque_id}
              onChange={(val) => setBaixaForm({ ...baixaForm, tanque_id: val })}
              placeholder="Selecione o tanque..."
              required
            />
            <Input
              label="Preço por Litro (R$)"
              type="number"
              placeholder="Ex: 5.99"
              value={baixaForm.preco_por_litro}
              onChange={(e) => setBaixaForm({ ...baixaForm, preco_por_litro: e.target.value })}
            />
            <Input
              label="Observação"
              placeholder="Detalhes adicionais (opcional)"
              value={baixaForm.observacao}
              onChange={(e) => setBaixaForm({ ...baixaForm, observacao: e.target.value })}
            />
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="secondary" onClick={() => setModalBaixa(null)}>Cancelar</Button>
              <Button onClick={salvarBaixa} disabled={submitting || !baixaForm.tanque_id}>
                {submitting ? 'Dando baixa...' : 'Confirmar Baixa'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirm: Baixar Todos */}
      <ConfirmModal
        isOpen={modalBaixaTodos}
        onClose={() => setModalBaixaTodos(false)}
        onConfirm={baixarTodos}
        title="Dar Baixa em Todos"
        message={`Confirmar baixa de ${abastecimentosPendentes.length} abastecimento(s) pendente(s)? O saldo de cada tanque será decrementado conforme o tipo de combustível de cada abastecimento. Abastecimentos sem tanque correspondente serão ignorados.`}
        confirmText="Confirmar"
        variant="warning"
      />
    </div>
  )
}
