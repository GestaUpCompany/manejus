import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, Input, CardSkeleton } from '../../components/ui'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

interface Setor {
  id: string
  fazenda_id: string
  nome: string
  ativo: boolean
}

export function Setores() {
  const { user } = useAuth()
  const [setores, setSetores] = useState<Setor[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingSetor, setEditingSetor] = useState<Setor | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [formData, setFormData] = useState({
    nome: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [showInactive, setShowInactive] = useState(false)

  useEffect(() => {
    loadSetores()
  }, [user])

  const loadSetores = async () => {
    if (!user) return

    // Buscar fazenda vinculada
    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) return

    const fazendaId = vinculos[0].fazenda_id

    const { data, error } = await supabase
      .from('setores')
      .select('*')
      .eq('fazenda_id', fazendaId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erro ao buscar setores:', error)
    } else {
      setSetores(data as Setor[])
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
    }

    let error

    if (editingSetor) {
      // Atualizar setor existente
      const { error: updateError } = await supabase
        .from('setores')
        .update(data)
        .eq('id', editingSetor.id)
      error = updateError
    } else {
      // Criar novo setor
      const { error: insertError } = await supabase.from('setores').insert(data)
      error = insertError
    }

    if (error) {
      console.error('Erro ao salvar setor:', error)
    } else {
      setFormData({
        nome: '',
      })
      setShowForm(false)
      setEditingSetor(null)
      loadSetores()
    }

    setSubmitting(false)
  }

  const handleEdit = (setor: Setor) => {
    setEditingSetor(setor)
    setFormData({
      nome: setor.nome,
    })
    setShowForm(true)
  }

  const handleCancel = () => {
    setEditingSetor(null)
    setFormData({
      nome: '',
    })
    setShowForm(false)
  }

  const handleToggleActive = async (setor: Setor) => {
    const { error } = await supabase
      .from('setores')
      .update({
        ativo: !setor.ativo,
        deleted_at: !setor.ativo ? new Date().toISOString() : null,
      })
      .eq('id', setor.id)

    if (error) {
      console.error('Erro ao atualizar setor:', error)
    } else {
      loadSetores()
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

  const filteredSetores = setores.filter((setor) =>
    setor.nome.toLowerCase().includes(searchTerm.toLowerCase()) &&
    (showInactive || setor.ativo)
  )

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      {!showForm && (
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-xl sm:text-2xl font-bold text-content-strong">Setores</h2>
          <div className="flex flex-col sm:flex-row gap-2 items-start w-full md:w-auto">
            <Input
              type="text"
              placeholder="Buscar setor..."
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
            <Button onClick={() => setShowForm(true)} className="h-10 text-sm flex-1 sm:flex-none">Novo Setor</Button>
          </div>
        </div>
      )}

      {showForm && (
        <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm">
          <h3 className="text-lg sm:text-xl font-semibold text-content-strong mb-4">
            {editingSetor ? 'Editar Setor' : 'Novo Setor'}
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
                placeholder="Nome do setor"
                className="border-border-base focus:border-accent"
              />
            </div>

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

      {!showForm && filteredSetores.length === 0 ? (
        <Card className="bg-surface-1 p-8 sm:p-12 border-0 shadow-sm text-center">
          <p className="text-content-muted mb-4 text-sm sm:text-base">Nenhum setor cadastrado</p>
          <Button onClick={() => setShowForm(true)} className="text-sm">Criar Primeiro Setor</Button>
        </Card>
      ) : !showForm ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSetores.map((setor) => (
            <Card key={setor.id} className={!setor.ativo ? 'opacity-60' : ''}>
              <div className="flex justify-between items-start mb-3">
                <h3 className="text-lg font-semibold">{setor.nome}</h3>
                <span
                  className={`px-2 py-1 text-xs rounded-full ${
                    setor.ativo ? 'bg-green-500/10 text-green-800 dark:text-green-200' : 'bg-red-500/10 text-red-800 dark:text-red-200'
                  }`}
                >
                  {setor.ativo ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              <div className="flex gap-2 mt-4">
                <Button size="sm" variant="secondary" onClick={() => handleEdit(setor)}>
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleToggleActive(setor)}
                >
                  {setor.ativo ? 'Desativar' : 'Ativar'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  )
}
