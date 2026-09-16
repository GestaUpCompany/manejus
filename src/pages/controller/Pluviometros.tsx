import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, Input, CardSkeleton, CardItem } from '../../components/ui'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

interface Pluviometro {
  id: string
  fazenda_id: string
  nome: string
  localizacao: string
  ativo: boolean
  created_at: string
  updated_at: string
}

export function Pluviometros() {
  const { user } = useAuth()
  const [pluviometros, setPluviometros] = useState<Pluviometro[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingPluviometro, setEditingPluviometro] = useState<Pluviometro | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [formData, setFormData] = useState({
    nome: '',
    localizacao: '',
    ativo: true,
  })
  const [submitting, setSubmitting] = useState(false)
  const [showInactive, setShowInactive] = useState(false)

  useEffect(() => {
    loadPluviometros()
  }, [user])

  const loadPluviometros = async () => {
    if (!user) return

    // Buscar fazenda vinculada
    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) return

    const fazendaId = vinculos[0].fazenda_id

    const { data, error } = await supabase
      .from('pluviometros')
      .select('*')
      .eq('fazenda_id', fazendaId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erro ao buscar pluviômetros:', error)
    } else {
      setPluviometros(data as Pluviometro[])
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
      localizacao: formData.localizacao,
      ativo: formData.ativo,
    }

    let error

    if (editingPluviometro) {
      // Atualizar pluviômetro existente
      const { error: updateError } = await supabase
        .from('pluviometros')
        .update(data)
        .eq('id', editingPluviometro.id)
      error = updateError
    } else {
      // Criar novo pluviômetro
      const { error: insertError } = await supabase.from('pluviometros').insert(data)
      error = insertError
    }

    if (error) {
      console.error('Erro ao salvar pluviômetro:', error)
    } else {
      setFormData({
        nome: '',
        localizacao: '',
        ativo: true,
      })
      setShowForm(false)
      setEditingPluviometro(null)
      loadPluviometros()
    }

    setSubmitting(false)
  }

  const handleEdit = (pluviometro: Pluviometro) => {
    setEditingPluviometro(pluviometro)
    setFormData({
      nome: pluviometro.nome,
      localizacao: pluviometro.localizacao,
      ativo: pluviometro.ativo,
    })
    setShowForm(true)
  }

  const handleCancel = () => {
    setEditingPluviometro(null)
    setFormData({
      nome: '',
      localizacao: '',
      ativo: true,
    })
    setShowForm(false)
  }

  const handleToggleActive = async (pluviometro: Pluviometro) => {
    const { error } = await supabase
      .from('pluviometros')
      .update({
        ativo: !pluviometro.ativo,
        deleted_at: !pluviometro.ativo ? new Date().toISOString() : null,
      })
      .eq('id', pluviometro.id)

    if (error) {
      console.error('Erro ao atualizar pluviômetro:', error)
    } else {
      loadPluviometros()
    }
  }

  const shortcuts = [
    {
      key: 'f',
      ctrl: true,
      description: 'Buscar pluviômetros',
      action: () => {
        const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement
        searchInput?.focus()
      },
    },
  ]

  useKeyboardShortcuts(shortcuts)

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
        <h2 className="text-2xl font-bold text-content-strong">Pluviômetros</h2>
        <div className="flex gap-2 items-start">
          <Input
            type="text"
            placeholder="Buscar pluviômetro..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-xs border-border-base focus:border-accent h-10"
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
          <Button onClick={() => setShowForm(true)} className="h-10">Novo Pluviômetro</Button>
        </div>
      </div>

      {showForm && (
        <Card className="bg-surface-1 p-6 border-0 shadow-sm">
          <h3 className="text-xl font-semibold text-content-strong mb-4">
            {editingPluviometro ? 'Editar Pluviômetro' : 'Novo Pluviômetro'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-content mb-1">
                Nome *
              </label>
              <Input
                type="text"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                required
                placeholder="Nome do pluviômetro"
                className="border-border-base focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-content mb-1">
                Localização *
              </label>
              <Input
                type="text"
                value={formData.localizacao}
                onChange={(e) => setFormData({ ...formData, localizacao: e.target.value })}
                required
                placeholder="Localização do pluviômetro"
                className="border-border-base focus:border-accent"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="ativo"
                checked={formData.ativo}
                onChange={(e) => setFormData({ ...formData, ativo: e.target.checked })}
                className="rounded border-surface-3 text-accent focus:ring-accent"
              />
              <label htmlFor="ativo" className="text-sm font-medium text-content">
                Ativo
              </label>
            </div>

            <div className="flex gap-2">
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

      {!showForm && pluviometros.length === 0 ? (
        <Card className="bg-surface-1 p-12 border-0 shadow-sm text-center">
          <p className="text-content-muted mb-4">Nenhum pluviômetro cadastrado</p>
          <Button onClick={() => setShowForm(true)}>Criar Primeiro Pluviômetro</Button>
        </Card>
      ) : !showForm ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pluviometros
            .filter((pluviometro) =>
              (pluviometro.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
              pluviometro.localizacao.toLowerCase().includes(searchTerm.toLowerCase())) &&
              (showInactive || pluviometro.ativo)
            )
            .map((pluviometro) => (
              <CardItem
                key={pluviometro.id}
                title={pluviometro.nome}
                subtitle={pluviometro.localizacao}
                status={pluviometro.ativo}
                onClick={() => handleEdit(pluviometro)}
              >
                <div className="flex flex-wrap gap-1 sm:gap-2">
                  <Button
                    variant="secondary"
                    className="flex-1 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleToggleActive(pluviometro)
                    }}
                  >
                    {pluviometro.ativo ? 'Desativar' : 'Ativar'}
                  </Button>
                  <Button
                    variant="secondary"
                    className="flex-1 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleEdit(pluviometro)
                    }}
                  >
                    Editar
                  </Button>
                </div>
              </CardItem>
            ))}
        </div>
      ) : null}
    </div>
  )
}
