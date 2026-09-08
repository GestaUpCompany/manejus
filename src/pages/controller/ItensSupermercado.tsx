import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, Input, CardSkeleton, Select, useToast } from '../../components/ui'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

interface ItemSupermercado {
  id: string
  fazenda_id: string
  nome: string
  unidade_medida: string
  ativo: boolean
  created_at: string
  updated_at: string
}

export function ItensSupermercado() {
  const { user } = useAuth()
  const toast = useToast()
  const [itens, setItens] = useState<ItemSupermercado[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState<ItemSupermercado | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [formData, setFormData] = useState({
    nome: '',
    unidade_medida: '',
    ativo: true,
  })
  const [submitting, setSubmitting] = useState(false)
  const [showInactive, setShowInactive] = useState(false)

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
      .from('itens_supermercado')
      .select('*')
      .eq('fazenda_id', fazendaId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erro ao buscar itens:', error)
    } else {
      setItens(data as ItemSupermercado[])
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
      unidade_medida: formData.unidade_medida,
      ativo: formData.ativo,
    }

    let error

    if (editingItem) {
      // Update existing
      const result = await supabase
        .from('itens_supermercado')
        .update(data)
        .eq('id', editingItem.id)
      error = result.error
    } else {
      // Insert new
      const result = await supabase
        .from('itens_supermercado')
        .insert(data)
      error = result.error
    }

    setSubmitting(false)

    if (error) {
      console.error('Erro ao salvar item:', error)
      toast.error('Erro ao salvar item')
      return
    }

    // Reset form and reload
    setFormData({ nome: '', unidade_medida: '', ativo: true })
    setShowForm(false)
    setEditingItem(null)
    loadItens()
  }

  const handleEdit = (item: ItemSupermercado) => {
    setEditingItem(item)
    setFormData({
      nome: item.nome,
      unidade_medida: item.unidade_medida,
      ativo: item.ativo,
    })
    setShowForm(true)
  }

  const handleToggleActive = async (item: ItemSupermercado) => {
    const { error } = await supabase
      .from('itens_supermercado')
      .update({ ativo: !item.ativo })
      .eq('id', item.id)

    if (error) {
      console.error('Erro ao atualizar item:', error)
    } else {
      loadItens()
    }
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingItem(null)
    setFormData({ nome: '', unidade_medida: '', ativo: true })
  }

  const filteredItens = itens.filter(item =>
    item.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.unidade_medida.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const activeItens = filteredItens.filter(item => item.ativo)
  const inactiveItens = showInactive ? filteredItens.filter(item => !item.ativo) : []

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: 'n',
      description: 'Novo item',
      action: () => {
        if (!showForm) {
          setEditingItem(null)
          setFormData({ nome: '', unidade_medida: '', ativo: true })
          setShowForm(true)
        }
      },
    },
    {
      key: 'Escape',
      description: 'Cancelar',
      action: () => {
        if (showForm) {
          handleCancel()
        }
      },
    },
  ])

  if (loading) {
    return <CardSkeleton />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Itens de Supermercado</h1>
        <Button
          onClick={() => {
            setEditingItem(null)
            setFormData({ nome: '', unidade_medida: '', ativo: true })
            setShowForm(true)
          }}
          disabled={showForm}
        >
          Novo Item
        </Button>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <Input
          type="text"
          placeholder="Buscar por nome ou unidade de medida..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1"
        />
        <button
          type="button"
          onClick={() => setShowInactive(!showInactive)}
          className={`px-2 sm:px-4 py-2 rounded-lg font-medium text-xs sm:text-sm transition-all duration-200 border-2 whitespace-nowrap h-10 ${
            showInactive
              ? 'bg-primary text-white border-primary hover:bg-primary/90'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
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
      </div>

      {/* Form */}
      {showForm && (
        <Card className="bg-white p-6 border-0 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            {editingItem ? 'Editar Item' : 'Novo Item'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 min-h-[2.5rem] leading-tight line-clamp-2">
                  Nome *
                </label>
                <Input
                  type="text"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  required
                  placeholder="Ex: Arroz, Feijão, Óleo..."
                />
              </div>
              <div>
                <Select
                  label="Unidade de Medida *"
                  value={formData.unidade_medida}
                  onChange={(value) => setFormData({ ...formData, unidade_medida: value })}
                  placeholder="Selecione..."
                  options={[
                    { value: 'kg', label: 'kg' },
                    { value: 'L', label: 'L' },
                    { value: 'Unidades', label: 'Unidades' },
                    { value: 'Pacotes', label: 'Pacotes' },
                  ]}
                />
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Salvando...' : editingItem ? 'Atualizar' : 'Salvar'}
              </Button>
              <Button type="button" variant="secondary" onClick={handleCancel}>
                Cancelar
              </Button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, ativo: !formData.ativo })}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 border-2 ${
                  formData.ativo
                    ? 'bg-green-100 text-green-800 border-green-300 hover:bg-green-200'
                    : 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200'
                }`}
              >
                {formData.ativo ? '✓ Ativo' : '✗ Inativo'}
              </button>
            </div>
          </form>
        </Card>
      )}

      {/* Active Items */}
      {!showForm && activeItens.length === 0 && inactiveItens.length === 0 && (
        <Card className="bg-white p-6 text-center border-0 shadow-sm">
          <p className="text-gray-600">Nenhum item cadastrado</p>
        </Card>
      )}

      {!showForm && activeItens.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Itens Ativos ({activeItens.length})</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeItens.map((item) => (
              <Card
                key={item.id}
                className="bg-white p-4 sm:p-6 border-0 shadow-sm cursor-pointer transition-all hover:shadow-xl flex flex-col"
              >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 sm:gap-3 mb-3 sm:mb-4 flex-grow">
                  <div>
                    <h3 className="font-semibold text-gray-800 text-base sm:text-lg">{item.nome}</h3>
                    <p className="text-xs sm:text-sm text-gray-500">Unidade: {item.unidade_medida}</p>
                  </div>
                  <div className="flex gap-2 items-center">
                    <span className="px-2 sm:px-3 py-1 rounded-full text-xs font-medium self-start md:self-auto bg-green-100 text-green-800">
                      Ativo
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 sm:gap-2 mt-auto">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleEdit(item)}
                    className="flex-1 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2"
                  >
                    Editar
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleToggleActive(item)}
                    className="flex-1 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2"
                  >
                    Desativar
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Inactive Items */}
      {!showForm && inactiveItens.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Itens Inativos ({inactiveItens.length})</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {inactiveItens.map((item) => (
              <Card
                key={item.id}
                className="bg-white p-4 sm:p-6 border-0 shadow-sm cursor-pointer transition-all hover:shadow-xl flex flex-col"
              >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 sm:gap-3 mb-3 sm:mb-4 flex-grow">
                  <div>
                    <h3 className="font-semibold text-gray-800 text-base sm:text-lg">{item.nome}</h3>
                    <p className="text-xs sm:text-sm text-gray-500">Unidade: {item.unidade_medida}</p>
                  </div>
                  <div className="flex gap-2 items-center">
                    <span className="px-2 sm:px-3 py-1 rounded-full text-xs font-medium self-start md:self-auto bg-red-100 text-red-800">
                      Inativo
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 sm:gap-2 mt-auto">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleEdit(item)}
                    className="flex-1 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2"
                  >
                    Editar
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleToggleActive(item)}
                    className="flex-1 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2"
                  >
                    Ativar
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
