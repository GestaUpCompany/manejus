import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, Input, CardSkeleton } from '../../components/ui'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

interface Implemento {
  id: string
  fazenda_id: string
  nome: string
  ativo: boolean
}

export function Implementos() {
  const { user } = useAuth()
  const [implementos, setImplementos] = useState<Implemento[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingImplemento, setEditingImplemento] = useState<Implemento | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [formData, setFormData] = useState({
    nome: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [showInactive, setShowInactive] = useState(false)

  useEffect(() => {
    loadImplementos()
  }, [user])

  const loadImplementos = async () => {
    if (!user) return

    // Buscar fazenda vinculada
    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) return

    const fazendaId = vinculos[0].fazenda_id

    const { data, error } = await supabase
      .from('implementos')
      .select('*')
      .eq('fazenda_id', fazendaId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erro ao buscar implementos:', error)
    } else {
      setImplementos(data as Implemento[])
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

    if (editingImplemento) {
      // Atualizar implemento existente
      const { error: updateError } = await supabase
        .from('implementos')
        .update(data)
        .eq('id', editingImplemento.id)
      error = updateError
    } else {
      // Criar novo implemento
      const { error: insertError } = await supabase.from('implementos').insert(data)
      error = insertError
    }

    if (error) {
      console.error('Erro ao salvar implemento:', error)
    } else {
      setFormData({
        nome: '',
      })
      setShowForm(false)
      setEditingImplemento(null)
      loadImplementos()
    }

    setSubmitting(false)
  }

  const handleEdit = (implemento: Implemento) => {
    setEditingImplemento(implemento)
    setFormData({
      nome: implemento.nome,
    })
    setShowForm(true)
  }

  const handleCancel = () => {
    setEditingImplemento(null)
    setFormData({
      nome: '',
    })
    setShowForm(false)
  }

  const handleToggleActive = async (implemento: Implemento) => {
    const { error } = await supabase
      .from('implementos')
      .update({
        ativo: !implemento.ativo,
        deleted_at: !implemento.ativo ? new Date().toISOString() : null,
      })
      .eq('id', implemento.id)

    if (error) {
      console.error('Erro ao atualizar implemento:', error)
    } else {
      loadImplementos()
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

  const filteredImplementos = implementos.filter((implemento) =>
    implemento.nome.toLowerCase().includes(searchTerm.toLowerCase()) &&
    (showInactive || implemento.ativo)
  )

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      {!showForm && (
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-xl sm:text-2xl font-bold text-content-strong">Implementos</h2>
          <div className="flex flex-col sm:flex-row gap-2 items-start w-full md:w-auto">
            <Input
              type="text"
              placeholder="Buscar implemento..."
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
            <Button onClick={() => setShowForm(true)} className="h-10 text-sm flex-1 sm:flex-none">Novo Implemento</Button>
          </div>
        </div>
      )}

      {showForm && (
        <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm">
          <h3 className="text-lg sm:text-xl font-semibold text-content-strong mb-4">
            {editingImplemento ? 'Editar Implemento' : 'Novo Implemento'}
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
                placeholder="Nome do implemento"
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

      {!showForm && filteredImplementos.length === 0 ? (
        <Card className="bg-surface-1 p-8 sm:p-12 border-0 shadow-sm text-center">
          <p className="text-content-muted mb-4 text-sm sm:text-base">Nenhum implemento cadastrado</p>
          <Button onClick={() => setShowForm(true)} className="text-sm">Criar Primeiro Implemento</Button>
        </Card>
      ) : !showForm ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredImplementos.map((implemento) => (
            <Card key={implemento.id} className={!implemento.ativo ? 'opacity-60' : ''}>
              <div className="flex justify-between items-start mb-3">
                <h3 className="text-lg font-semibold">{implemento.nome}</h3>
                <span
                  className={`px-2 py-1 text-xs rounded-full ${
                    implemento.ativo ? 'bg-green-500/10 text-green-800 dark:text-green-200' : 'bg-red-500/10 text-red-800 dark:text-red-200'
                  }`}
                >
                  {implemento.ativo ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              <div className="flex gap-2 mt-4">
                <Button size="sm" variant="secondary" onClick={() => handleEdit(implemento)}>
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleToggleActive(implemento)}
                >
                  {implemento.ativo ? 'Desativar' : 'Ativar'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  )
}
