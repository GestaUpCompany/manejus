import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, Input, CardSkeleton, ConfirmModal, CardItem, useToast } from '../../components/ui'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

interface Raca {
  id: string
  fazenda_id: string
  nome: string
  ativo: boolean
}

export function Racas() {
  const { user } = useAuth()
  const toast = useToast()
  const [racas, setRacas] = useState<Raca[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingRaca, setEditingRaca] = useState<Raca | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [formData, setFormData] = useState({
    nome: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [racaToDelete, setRacaToDelete] = useState<string | null>(null)

  useEffect(() => {
    loadRacas()
  }, [user])

  const loadRacas = async () => {
    if (!user) return

    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) return

    const fazendaId = vinculos[0].fazenda_id

    const { data, error } = await supabase
      .from('racas')
      .select('*')
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)
      .order('nome', { ascending: true })

    if (error) {
      console.error('Erro ao buscar raças:', error)
    } else {
      setRacas(data as Raca[])
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
    }

    let error

    if (editingRaca) {
      const { error: updateError } = await supabase
        .from('racas')
        .update(data)
        .eq('id', editingRaca.id)
      error = updateError
    } else {
      const { error: insertError } = await supabase.from('racas').insert(data)
      error = insertError
    }

    if (error) {
      console.error('Erro ao salvar raça:', error)
      toast.error('Erro ao salvar raça. Verifique se já não existe uma raça com este nome.')
    } else {
      setFormData({ nome: '' })
      setShowForm(false)
      setEditingRaca(null)
      loadRacas()
    }

    setSubmitting(false)
  }

  const handleEdit = (raca: Raca) => {
    setEditingRaca(raca)
    setFormData({ nome: raca.nome })
    setShowForm(true)
  }

  const handleCancel = () => {
    setEditingRaca(null)
    setFormData({ nome: '' })
    setShowForm(false)
  }

  const handleDeleteClick = (id: string) => {
    setRacaToDelete(id)
    setShowDeleteModal(true)
  }

  const handleDeleteConfirm = async () => {
    if (!racaToDelete) return

    const { error } = await supabase
      .from('racas')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', racaToDelete)

    if (error) {
      console.error('Erro ao excluir raça:', error)
    } else {
      loadRacas()
    }

    setShowDeleteModal(false)
    setRacaToDelete(null)
  }

  const shortcuts = [
    {
      key: 'f',
      ctrl: true,
      description: 'Buscar raças',
      action: () => {
        const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement
        searchInput?.focus()
      },
    },
  ]

  useKeyboardShortcuts(shortcuts)

  const handleToggleActive = async (raca: Raca) => {
    const { error } = await supabase
      .from('racas')
      .update({ ativo: !raca.ativo })
      .eq('id', raca.id)

    if (error) {
      console.error('Erro ao atualizar status:', error)
    } else {
      loadRacas()
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Raças</h2>
        <div className="flex gap-2 items-start">
          <Input
            type="text"
            placeholder="Buscar raça..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-xs border-gray-200 focus:border-accent h-10"
          />
          <Button onClick={() => setShowForm(true)} className="h-10">Nova Raça</Button>
        </div>
      </div>

      {showForm && (
        <Card className="bg-white p-6 border-0 shadow-sm">
          <h3 className="text-xl font-semibold text-gray-800 mb-4">
            {editingRaca ? 'Editar Raça' : 'Nova Raça'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nome *
              </label>
              <Input
                type="text"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                required
                placeholder="Nome da raça"
                className="border-gray-200 focus:border-accent"
              />
            </div>

            <div className="flex gap-2 items-center">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Salvando...' : 'Salvar'}
              </Button>
              <Button variant="secondary" onClick={handleCancel}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {!showForm && racas.length === 0 ? (
        <Card className="bg-white p-12 border-0 shadow-sm text-center">
          <p className="text-gray-600 mb-4">Nenhuma raça cadastrada</p>
          <Button onClick={() => setShowForm(true)}>Criar Primeira Raça</Button>
        </Card>
      ) : !showForm ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
          {racas
            .filter((raca) =>
              raca.nome.toLowerCase().includes(searchTerm.toLowerCase())
            )
            .map((raca) => (
              <CardItem
                key={raca.id}
                title={raca.nome}
                status={raca.ativo}
                onClick={() => handleEdit(raca)}
              >
                <div className="flex flex-wrap gap-1 sm:gap-2 mt-auto">
                  <Button 
                    variant="secondary" 
                    className="flex-1 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleToggleActive(raca)
                    }}
                  >
                    {raca.ativo ? 'Desativar' : 'Ativar'}
                  </Button>
                  <Button 
                    variant="secondary" 
                    className="flex-1 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleEdit(raca)
                    }}
                  >
                    Editar
                  </Button>
                  <Button 
                    variant="secondary" 
                    className="flex-1 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteClick(raca.id)
                    }}
                  >
                    Excluir
                  </Button>
                </div>
              </CardItem>
            ))}
        </div>
      ) : null}

      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteConfirm}
        title="Excluir Raça"
        message="Tem certeza que deseja excluir esta raça? Esta ação não pode ser desfeita."
        confirmText="Excluir"
        cancelText="Cancelar"
        variant="danger"
      />
    </div>
  )
}
