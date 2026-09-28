import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, Input, CardSkeleton, Select } from '../../components/ui'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

interface ItemAlmoxarifado {
  id: string
  fazenda_id: string
  nome: string
  classificacao: string
  unidade: string
  estoque_atual: number
  estoque_minimo: number
  controla_estoque: boolean
  ativo: boolean
}

export function ItensAlmoxarifado() {
  const { user } = useAuth()
  const [itens, setItens] = useState<ItemAlmoxarifado[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState<ItemAlmoxarifado | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [formData, setFormData] = useState({
    nome: '',
    classificacao: '',
    unidade: 'un',
    estoque_minimo: '0',
    controla_estoque: true,
  })
  const [submitting, setSubmitting] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [unidadeBloqueada, setUnidadeBloqueada] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    loadItens()
  }, [user])

  const loadItens = async () => {
    if (!user) return

    // Buscar fazenda vinculada
    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) return

    const fazendaId = vinculos[0].fazenda_id

    const { data, error } = await supabase
      .from('itens_almoxarifado')
      .select('*')
      .eq('fazenda_id', fazendaId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erro ao buscar itens:', error)
    } else {
      setItens(data as ItemAlmoxarifado[])
    }

    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    if (!user) {
      setSubmitting(false)
      return
    }

    // Buscar fazenda vinculada
    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) {
      setSubmitting(false)
      return
    }

    const fazendaId = vinculos[0].fazenda_id

    const data = {
      fazenda_id: fazendaId,
      nome: formData.nome,
      classificacao: formData.classificacao,
      unidade: formData.unidade,
      estoque_minimo: Number(formData.estoque_minimo) || 0,
      controla_estoque: formData.controla_estoque,
    }

    let error

    if (editingItem) {
      // Atualizar item existente
      const { error: updateError } = await supabase
        .from('itens_almoxarifado')
        .update(data)
        .eq('id', editingItem.id)
      error = updateError
    } else {
      // Criar novo item
      const { error: insertError } = await supabase.from('itens_almoxarifado').insert(data)
      error = insertError
    }

    if (error) {
      console.error('Erro ao salvar item:', error)
      setErro(error.message)
    } else {
      setErro(null)
      setFormData({ nome: '', classificacao: '', unidade: 'un', estoque_minimo: '0', controla_estoque: true })
      setShowForm(false)
      setEditingItem(null)
      loadItens()
    }

    setSubmitting(false)
  }

  const handleEdit = async (item: ItemAlmoxarifado) => {
    setEditingItem(item)
    setErro(null)
    setFormData({
      nome: item.nome,
      classificacao: item.classificacao,
      unidade: item.unidade || 'un',
      estoque_minimo: String(item.estoque_minimo || 0),
      controla_estoque: item.controla_estoque ?? true,
    })
    setShowForm(true)
    const { count } = await supabase
      .from('movimentacoes_almoxarifado')
      .select('id', { count: 'exact', head: true })
      .eq('item_id', item.id)
      .is('deleted_at', null)
    setUnidadeBloqueada(Number(item.estoque_atual || 0) !== 0 || (count || 0) > 0)
  }

  const handleCancel = () => {
    setEditingItem(null)
    setErro(null)
    setUnidadeBloqueada(false)
    setFormData({ nome: '', classificacao: '', unidade: 'un', estoque_minimo: '0', controla_estoque: true })
    setShowForm(false)
  }

  const handleToggleActive = async (item: ItemAlmoxarifado) => {
    const { error } = await supabase
      .from('itens_almoxarifado')
      .update({
        ativo: !item.ativo,
        deleted_at: !item.ativo ? new Date().toISOString() : null,
      })
      .eq('id', item.id)

    if (error) {
      console.error('Erro ao atualizar item:', error)
    } else {
      loadItens()
    }
  }

  useKeyboardShortcuts([
    {
      key: 'Escape',
      description: 'Cancelar formulário',
      action: () => {
        if (showForm) handleCancel()
      },
    },
  ])

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    )
  }

  const filteredItens = itens.filter((item) =>
    (item.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.classificacao.toLowerCase().includes(searchTerm.toLowerCase())) &&
    (showInactive || item.ativo)
  )

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      {!showForm && (
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-xl sm:text-2xl font-bold text-content-strong">Itens do Almoxarifado</h2>
          <div className="flex flex-col sm:flex-row gap-2 items-start w-full md:w-auto">
            <Input
              type="text"
              placeholder="Buscar item..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full sm:max-w-xs border-border-base focus:border-accent h-10 text-sm"
            />
            <button
              type="button"
              onClick={() => setShowInactive(!showInactive)}
              className={`px-2 sm:px-4 py-2 rounded-lg font-medium text-xs sm:text-sm transition-all duration-200 border-2 whitespace-nowrap h-10 ${
                showInactive
                  ? 'bg-primary text-white border-primary hover:bg-primary/90'
                  : 'bg-surface-1 text-content border-surface-3 hover:bg-surface-2'
              }`}
            >
              {showInactive ? (
                <>
                  <span className="sm:hidden">✓ Mostrando</span>
                  <span className="hidden sm:inline">✓ Mostrando Desativados</span>
                </>
              ) : (
                <>
                  <span className="sm:hidden">Mostrar</span>
                  <span className="hidden sm:inline">Mostrar Desativados</span>
                </>
              )}
            </button>
            <Button onClick={() => { setErro(null); setUnidadeBloqueada(false); setShowForm(true) }} className="h-10 text-sm flex-1 sm:flex-none">Novo Item</Button>
          </div>
        </div>
      )}

      {showForm && (
        <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm">
          <h3 className="text-lg sm:text-xl font-semibold text-content-strong mb-4">
            {editingItem ? 'Editar Item' : 'Novo Item'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-content mb-1">
                Nome <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                required
                placeholder="Nome do item"
                className="border-border-base focus:border-accent"
              />
            </div>
            <div>
              <Select
                label="Classificação"
                value={formData.classificacao}
                onChange={(value) => setFormData({ ...formData, classificacao: value })}
                placeholder="Selecione..."
                required
                options={[
                  { value: 'Ferramentas', label: 'Ferramentas' },
                  { value: 'Peças', label: 'Peças' },
                  { value: 'Hidráulica', label: 'Hidráulica' },
                  { value: 'Elétrica', label: 'Elétrica' },
                  { value: 'Insumos', label: 'Insumos' },
                  { value: 'Fertilizantes', label: 'Fertilizantes' },
                  { value: 'Corretivos', label: 'Corretivos' },
                  { value: 'Defensivos', label: 'Defensivos' },
                  { value: 'Herbicidas', label: 'Herbicidas' },
                  { value: 'Fungicidas', label: 'Fungicidas' },
                  { value: 'Inseticidas', label: 'Inseticidas' },
                  { value: 'Adjuvantes', label: 'Adjuvantes' },
                  { value: 'Sementes', label: 'Sementes' },
                  { value: 'Medicamentos', label: 'Medicamentos' },
                  { value: 'Equipamentos', label: 'Equipamentos' },
                  { value: 'Combustíveis', label: 'Combustíveis' },
                  { value: 'Lubrificantes', label: 'Lubrificantes' },
                  { value: 'EPI', label: 'EPI' },
                  { value: 'Materiais de Construção', label: 'Materiais de Construção' },
                ]}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {editingItem && unidadeBloqueada ? (
                <div className="mb-4">
                  <label className="block text-xs sm:text-sm font-semibold text-content mb-2">Unidade de medida</label>
                  <div className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border border-surface-3 rounded-lg min-h-[44px] text-sm sm:text-base bg-surface-2 text-content-muted">
                    {formData.unidade}
                  </div>
                  <p className="text-xs text-content-faint mt-1">Item com estoque ou movimentações não pode trocar de unidade. Cadastre um novo item.</p>
                </div>
              ) : (
                <Select
                  label="Unidade de medida"
                  value={formData.unidade}
                  onChange={(value) => setFormData({ ...formData, unidade: value })}
                  options={[
                    { value: 'un', label: 'Unidade' }, { value: 'kg', label: 'kg' }, { value: 'g', label: 'g' },
                    { value: 'L', label: 'Litro' }, { value: 'mL', label: 'mL' }, { value: 'm', label: 'Metro' },
                    { value: 'cx', label: 'Caixa' }, { value: 'pct', label: 'Pacote' }, { value: 'par', label: 'Par' }, { value: 'kit', label: 'Kit' },
                  ]}
                />
              )}
              <Input
                type="number"
                min="0"
                step="0.001"
                label="Estoque mínimo"
                value={formData.estoque_minimo}
                onChange={(e) => setFormData({ ...formData, estoque_minimo: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-content cursor-pointer">
              <input type="checkbox" checked={formData.controla_estoque} onChange={(e) => setFormData({ ...formData, controla_estoque: e.target.checked })} />
              Controlar este item no estoque
            </label>

            {erro && <p className="text-sm text-red-600">{erro}</p>}
            <div className="flex gap-2 items-center">
              <Button type="submit" disabled={submitting} className="flex-1 sm:flex-none text-sm">
                {submitting ? 'Salvando...' : 'Salvar'}
              </Button>
              <Button variant="secondary" onClick={handleCancel} className="flex-1 sm:flex-none text-sm">
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {!showForm && filteredItens.length === 0 ? (
        <Card className="bg-surface-1 p-8 sm:p-12 border-0 shadow-sm text-center">
          <p className="text-content-muted mb-4 text-sm sm:text-base">Nenhum item cadastrado</p>
          <Button onClick={() => setShowForm(true)} className="text-sm">Criar Primeiro Item</Button>
        </Card>
      ) : !showForm ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItens.map((item) => (
            <Card key={item.id} className={!item.ativo ? 'opacity-60' : ''}>
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="text-lg font-semibold">{item.nome}</h3>
                  <p className="text-sm text-content-muted">{item.classificacao}</p>
                </div>
                <span
                  className={`px-2 py-1 text-xs rounded-full ${
                    item.ativo ? 'bg-green-500/10 text-green-800 dark:text-green-200' : 'bg-red-500/10 text-red-800 dark:text-red-200'
                  }`}
                >
                  {item.ativo ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              <div className="flex gap-2 mt-4">
                <Button size="sm" variant="secondary" onClick={() => handleEdit(item)}>
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleToggleActive(item)}
                >
                  {item.ativo ? 'Desativar' : 'Ativar'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  )
}
