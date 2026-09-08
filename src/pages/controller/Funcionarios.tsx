import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, Input, CardItem, EmptyState, PageSkeleton } from '../../components/ui'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

interface Funcionario {
  id: string
  fazenda_id: string
  nome: string
  cpf?: string
  telefone?: string
  cargo?: string
  ativo: boolean
}

export function Funcionarios() {
  const { user } = useAuth()
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingFuncionario, setEditingFuncionario] = useState<Funcionario | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [formData, setFormData] = useState({
    nome: '',
    cpf: '',
    telefone: '',
    cargo: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [showInactive, setShowInactive] = useState(false)

  useEffect(() => {
    loadFuncionarios()
  }, [user])

  const loadFuncionarios = async () => {
    if (!user) return

    // Buscar fazenda vinculada
    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) return

    const fazendaId = vinculos[0].fazenda_id

    const { data, error } = await supabase
      .from('funcionarios')
      .select('*')
      .eq('fazenda_id', fazendaId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erro ao buscar funcionários:', error)
    } else {
      setFuncionarios(data as Funcionario[])
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
      cpf: formData.cpf || null,
      telefone: formData.telefone || null,
      cargo: formData.cargo || null,
    }

    let error

    if (editingFuncionario) {
      // Atualizar funcionário existente
      const { error: updateError } = await supabase
        .from('funcionarios')
        .update(data)
        .eq('id', editingFuncionario.id)
      error = updateError
    } else {
      // Criar novo funcionário
      const { error: insertError } = await supabase.from('funcionarios').insert(data)
      error = insertError
    }

    if (error) {
      console.error('Erro ao salvar funcionário:', error)
    } else {
      setFormData({
        nome: '',
        cpf: '',
        telefone: '',
        cargo: '',
      })
      setShowForm(false)
      setEditingFuncionario(null)
      loadFuncionarios()
    }

    setSubmitting(false)
  }

  const handleEdit = (funcionario: Funcionario) => {
    setEditingFuncionario(funcionario)
    setFormData({
      nome: funcionario.nome,
      cpf: funcionario.cpf || '',
      telefone: funcionario.telefone || '',
      cargo: funcionario.cargo || '',
    })
    setShowForm(true)
  }

  const handleCancel = () => {
    setEditingFuncionario(null)
    setFormData({
      nome: '',
      cpf: '',
      telefone: '',
      cargo: '',
    })
    setShowForm(false)
  }

  const handleToggleActive = async (funcionario: Funcionario) => {
    const { error } = await supabase
      .from('funcionarios')
      .update({ ativo: !funcionario.ativo })
      .eq('id', funcionario.id)

    if (error) {
      console.error('Erro ao atualizar funcionário:', error)
    } else {
      loadFuncionarios()
    }
  }

  const shortcuts = [
    {
      key: 'f',
      ctrl: true,
      description: 'Buscar funcionários',
      action: () => {
        const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement
        searchInput?.focus()
      },
    },
  ]

  useKeyboardShortcuts(shortcuts)

  if (loading) {
    return <PageSkeleton variant="grid" />
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-2xl font-bold text-gray-800">Funcionários</h2>
          <div className="flex gap-2 items-start">
            <Input
              type="text"
              placeholder="Buscar funcionário..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-xs border-gray-200 focus:border-accent h-10"
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
            <Button onClick={() => setShowForm(true)} className="h-10">Novo Funcionário</Button>
          </div>
        </div>

        {showForm && (
          <Card className="bg-white p-6 border-0 shadow-sm">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">
              {editingFuncionario ? 'Editar Funcionário' : 'Novo Funcionário'}
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
                  placeholder="Nome completo"
                  className="border-gray-200 focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  CPF
                </label>
                <Input
                  type="text"
                  value={formData.cpf}
                  onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                  placeholder="000.000.000-00"
                  className="border-gray-200 focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Telefone
                </label>
                <Input
                  type="text"
                  value={formData.telefone}
                  onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                  placeholder="(00) 00000-0000"
                  className="border-gray-200 focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cargo
                </label>
                <Input
                  type="text"
                  value={formData.cargo}
                  onChange={(e) => setFormData({ ...formData, cargo: e.target.value })}
                  placeholder="Ex: Peão, Tratorista, Administrador"
                  className="border-gray-200 focus:border-accent"
                />
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

        {!showForm && funcionarios.length === 0 ? (
          <EmptyState
            title="Nenhum funcionário cadastrado"
            action={<Button onClick={() => setShowForm(true)}>Criar Primeiro Funcionário</Button>}
          />
        ) : !showForm ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {funcionarios
              .filter((funcionario) => (showInactive || funcionario.ativo))
              .filter((funcionario) =>
                funcionario.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (funcionario.cargo && funcionario.cargo.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (funcionario.cpf && funcionario.cpf.includes(searchTerm))
              )
              .map((funcionario) => (
              <CardItem
                key={funcionario.id}
                title={funcionario.nome}
                subtitle={funcionario.cargo}
                status={funcionario.ativo}
                onClick={() => handleEdit(funcionario)}
              >
                <div className="space-y-2 mb-4">
                  {funcionario.cpf && (
                    <p className="text-sm text-gray-500">
                      <span className="font-medium">CPF:</span> {funcionario.cpf}
                    </p>
                  )}

                  {funcionario.telefone && (
                    <p className="text-sm text-gray-500">
                      <span className="font-medium">Telefone:</span> {funcionario.telefone}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-1 sm:gap-2">
                  <Button 
                    variant="secondary" 
                    className="flex-1 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleEdit(funcionario)
                    }}
                  >
                    Editar
                  </Button>
                  <Button 
                    variant="secondary" 
                    className="flex-1 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleToggleActive(funcionario)
                    }}
                  >
                    {funcionario.ativo ? 'Desativar' : 'Ativar'}
                  </Button>
                </div>
              </CardItem>
            ))}
          </div>
        ) : null}
      </div>
    </>
  )
}
