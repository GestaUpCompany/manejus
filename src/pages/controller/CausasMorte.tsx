import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, Input, CardSkeleton, CardItem } from '../../components/ui'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

interface CausaMorte {
  id: string
  fazenda_id: string
  nome: string
  descricao?: string
  ativo: boolean
}

export function CausasMorte() {
  const { user } = useAuth()
  const [causas, setCausas] = useState<CausaMorte[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingCausa, setEditingCausa] = useState<CausaMorte | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [formData, setFormData] = useState({
    nome: '',
    descricao: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [showInactive, setShowInactive] = useState(false)

  useEffect(() => {
    loadCausas()
  }, [user])

  const loadCausas = async () => {
    if (!user) return

    // Buscar fazenda vinculada
    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) return

    const fazendaId = vinculos[0].fazenda_id

    const { data, error } = await supabase
      .from('causas_morte')
      .select('*')
      .eq('fazenda_id', fazendaId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erro ao buscar causas de morte:', error)
    } else {
      setCausas(data as CausaMorte[])
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
      descricao: formData.descricao || null,
    }

    let error

    if (editingCausa) {
      // Atualizar causa existente
      const { error: updateError } = await supabase
        .from('causas_morte')
        .update(data)
        .eq('id', editingCausa.id)
      error = updateError
    } else {
      // Criar nova causa
      const { error: insertError } = await supabase.from('causas_morte').insert(data)
      error = insertError
    }

    if (error) {
      console.error('Erro ao salvar causa de morte:', error)
    } else {
      setFormData({
        nome: '',
        descricao: '',
      })
      setShowForm(false)
      setEditingCausa(null)
      loadCausas()
    }

    setSubmitting(false)
  }

  const handleEdit = (causa: CausaMorte) => {
    setEditingCausa(causa)
    setFormData({
      nome: causa.nome,
      descricao: causa.descricao || '',
    })
    setShowForm(true)
  }

  const handleCancel = () => {
    setEditingCausa(null)
    setFormData({
      nome: '',
      descricao: '',
    })
    setShowForm(false)
  }

  const shortcuts = [
    {
      key: 'f',
      ctrl: true,
      description: 'Buscar causas de morte',
      action: () => {
        const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement
        searchInput?.focus()
      },
    },
  ]

  useKeyboardShortcuts(shortcuts)

  const handleToggleActive = async (causa: CausaMorte) => {
    const { error } = await supabase
      .from('causas_morte')
      .update({ ativo: !causa.ativo })
      .eq('id', causa.id)

    if (error) {
      console.error('Erro ao atualizar status:', error)
    } else {
      loadCausas()
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
        <h2 className="text-2xl font-bold text-content-strong">Causas de Morte</h2>
        <div className="flex gap-2 items-start">
          <Input
            type="text"
            placeholder="Buscar causa..."
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
          <Button onClick={() => setShowForm(true)} className="h-10">Nova Causa</Button>
        </div>
      </div>

      {showForm && (
        <Card className="bg-surface-1 p-6 border-0 shadow-sm">
          <h3 className="text-xl font-semibold text-content-strong mb-4">
            {editingCausa ? 'Editar Causa de Morte' : 'Nova Causa de Morte'}
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
                placeholder="Nome da causa de morte"
                className="border-border-base focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-content mb-1">
                Descrição
              </label>
              <Input
                type="text"
                value={formData.descricao}
                onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                placeholder="Descrição opcional"
                className="border-border-base focus:border-accent"
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

      {!showForm && causas.length === 0 ? (
        <Card className="bg-surface-1 p-12 border-0 shadow-sm text-center">
          <p className="text-content-muted mb-4">Nenhuma causa de morte cadastrada</p>
          <Button onClick={() => setShowForm(true)}>Criar Primeira Causa</Button>
        </Card>
      ) : !showForm ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {causas
            .filter((causa) => (showInactive || causa.ativo))
            .filter((causa) =>
              causa.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
              (causa.descricao && causa.descricao.toLowerCase().includes(searchTerm.toLowerCase()))
            )
            .map((causa) => (
              <CardItem
                key={causa.id}
                title={causa.nome}
                subtitle={causa.descricao}
                status={causa.ativo}
                onClick={() => handleEdit(causa)}
              >
                <div className="flex flex-wrap gap-1 sm:gap-2">
                  <Button 
                    variant="secondary" 
                    className="flex-1 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleToggleActive(causa)
                    }}
                  >
                    {causa.ativo ? 'Desativar' : 'Ativar'}
                  </Button>
                  <Button 
                    variant="secondary" 
                    className="flex-1 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleEdit(causa)
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
