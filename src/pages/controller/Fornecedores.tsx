import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, Input, CardSkeleton, CardItem } from '../../components/ui'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

interface Fornecedor {
  id: string
  fazenda_id: string
  nome: string
  razao_social?: string
  cnpj?: string
  telefone?: string
  email?: string
  endereco?: string
  cidade?: string
  estado?: string
  cep?: string
  ativo: boolean
  created_at: string
  updated_at: string
}

export function Fornecedores() {
  const { user } = useAuth()
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingFornecedor, setEditingFornecedor] = useState<Fornecedor | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [formData, setFormData] = useState({
    nome: '',
    razao_social: '',
    cnpj: '',
    telefone: '',
    email: '',
    endereco: '',
    cidade: '',
    estado: '',
    cep: '',
    ativo: true,
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadFornecedores()
  }, [user])

  const loadFornecedores = async () => {
    if (!user) return

    // Buscar fazenda vinculada
    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) return

    const fazendaId = vinculos[0].fazenda_id

    const { data, error } = await supabase
      .from('fornecedores')
      .select('*')
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erro ao buscar fornecedores:', error)
    } else {
      setFornecedores(data as Fornecedor[])
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
      razao_social: formData.razao_social || null,
      cnpj: formData.cnpj || null,
      telefone: formData.telefone || null,
      email: formData.email || null,
      endereco: formData.endereco || null,
      cidade: formData.cidade || null,
      estado: formData.estado || null,
      cep: formData.cep || null,
      ativo: formData.ativo,
    }

    let error

    if (editingFornecedor) {
      // Atualizar fornecedor existente
      const { error: updateError } = await supabase
        .from('fornecedores')
        .update(data)
        .eq('id', editingFornecedor.id)
      error = updateError
    } else {
      // Criar novo fornecedor
      const { error: insertError } = await supabase.from('fornecedores').insert(data)
      error = insertError
    }

    if (error) {
      console.error('Erro ao salvar fornecedor:', error)
    } else {
      setFormData({
        nome: '',
        razao_social: '',
        cnpj: '',
        telefone: '',
        email: '',
        endereco: '',
        cidade: '',
        estado: '',
        cep: '',
        ativo: true,
      })
      setShowForm(false)
      setEditingFornecedor(null)
      loadFornecedores()
    }

    setSubmitting(false)
  }

  const handleEdit = (fornecedor: Fornecedor) => {
    setEditingFornecedor(fornecedor)
    setFormData({
      nome: fornecedor.nome,
      razao_social: fornecedor.razao_social || '',
      cnpj: fornecedor.cnpj || '',
      telefone: fornecedor.telefone || '',
      email: fornecedor.email || '',
      endereco: fornecedor.endereco || '',
      cidade: fornecedor.cidade || '',
      estado: fornecedor.estado || '',
      cep: fornecedor.cep || '',
      ativo: fornecedor.ativo,
    })
    setShowForm(true)
  }

  const handleCancel = () => {
    setEditingFornecedor(null)
    setFormData({
      nome: '',
      razao_social: '',
      cnpj: '',
      telefone: '',
      email: '',
      endereco: '',
      cidade: '',
      estado: '',
      cep: '',
      ativo: true,
    })
    setShowForm(false)
  }

  const shortcuts = [
    {
      key: 'f',
      ctrl: true,
      description: 'Buscar fornecedores',
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
        <h2 className="text-2xl font-bold text-content-strong">Fornecedores</h2>
        <div className="flex gap-2 items-start">
          <Input
            type="text"
            placeholder="Buscar fornecedor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-xs border-border-base focus:border-accent h-10"
          />
          <Button onClick={() => setShowForm(true)} className="h-10">Novo Fornecedor</Button>
        </div>
      </div>

      {showForm && (
        <Card className="bg-surface-1 p-6 border-0 shadow-sm">
          <h3 className="text-xl font-semibold text-content-strong mb-4">
            {editingFornecedor ? 'Editar Fornecedor' : 'Novo Fornecedor'}
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
                placeholder="Nome do fornecedor"
                className="border-border-base focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-content mb-1">
                Razão Social
              </label>
              <Input
                type="text"
                value={formData.razao_social}
                onChange={(e) => setFormData({ ...formData, razao_social: e.target.value })}
                placeholder="Razão social jurídica"
                className="border-border-base focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-content mb-1">
                CNPJ
              </label>
              <Input
                type="text"
                value={formData.cnpj}
                onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                placeholder="00.000.000/0000-00"
                className="border-border-base focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-content mb-1">
                Telefone
              </label>
              <Input
                type="text"
                value={formData.telefone}
                onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                placeholder="(00) 00000-0000"
                className="border-border-base focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-content mb-1">
                Email
              </label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="email@exemplo.com"
                className="border-border-base focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-content mb-1">
                Endereço
              </label>
              <Input
                type="text"
                value={formData.endereco}
                onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
                placeholder="Rua, número, complemento"
                className="border-border-base focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-content mb-1">
                Cidade
              </label>
              <Input
                type="text"
                value={formData.cidade}
                onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                placeholder="Nome da cidade"
                className="border-border-base focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-content mb-1">
                Estado
              </label>
              <Input
                type="text"
                value={formData.estado}
                onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
                placeholder="UF"
                className="border-border-base focus:border-accent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-content mb-1">
                CEP
              </label>
              <Input
                type="text"
                value={formData.cep}
                onChange={(e) => setFormData({ ...formData, cep: e.target.value })}
                placeholder="00000-000"
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

      {!showForm && fornecedores.length === 0 ? (
        <Card className="bg-surface-1 p-12 border-0 shadow-sm text-center">
          <p className="text-content-muted mb-4">Nenhum fornecedor cadastrado</p>
          <Button onClick={() => setShowForm(true)}>Criar Primeiro Fornecedor</Button>
        </Card>
      ) : !showForm ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {fornecedores
            .filter((fornecedor) =>
              fornecedor.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
              (fornecedor.razao_social && fornecedor.razao_social.toLowerCase().includes(searchTerm.toLowerCase()))
            )
            .map((fornecedor) => (
              <CardItem
                key={fornecedor.id}
                title={fornecedor.nome}
                subtitle={fornecedor.razao_social}
                status={fornecedor.ativo}
                onClick={() => handleEdit(fornecedor)}
              >
                <div className="space-y-2 mb-4">
                  {fornecedor.telefone && (
                    <p className="text-sm text-content-muted">
                      <span className="font-medium">Telefone:</span> {fornecedor.telefone}
                    </p>
                  )}

                  {fornecedor.email && (
                    <p className="text-sm text-content-muted">
                      <span className="font-medium">Email:</span> {fornecedor.email}
                    </p>
                  )}

                  {fornecedor.cidade && fornecedor.estado && (
                    <p className="text-sm text-content-muted">
                      <span className="font-medium">Cidade:</span> {fornecedor.cidade}/{fornecedor.estado}
                    </p>
                  )}

                  {fornecedor.cnpj && (
                    <p className="text-sm text-content-muted">
                      <span className="font-medium">CNPJ:</span> {fornecedor.cnpj}
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button 
                    variant="secondary" 
                    className="flex-1"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleEdit(fornecedor)
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
