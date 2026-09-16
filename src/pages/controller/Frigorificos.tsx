import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, Input, CardSkeleton, CardItem } from '../../components/ui'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

interface Frigorifico {
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

export function Frigorificos() {
  const { user } = useAuth()
  const [frigorificos, setFrigorificos] = useState<Frigorifico[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingFrigorifico, setEditingFrigorifico] = useState<Frigorifico | null>(null)
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
    loadFrigorificos()
  }, [user])

  const loadFrigorificos = async () => {
    if (!user) return

    // Buscar fazenda vinculada
    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) return

    const fazendaId = vinculos[0].fazenda_id

    const { data, error } = await supabase
      .from('frigorificos')
      .select('*')
      .eq('fazenda_id', fazendaId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erro ao buscar frigoríficos:', error)
    } else {
      setFrigorificos(data as Frigorifico[])
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

    if (editingFrigorifico) {
      // Atualizar frigorífico existente
      const { error: updateError } = await supabase
        .from('frigorificos')
        .update(data)
        .eq('id', editingFrigorifico.id)
      error = updateError
    } else {
      // Criar novo frigorífico
      const { error: insertError } = await supabase.from('frigorificos').insert(data)
      error = insertError
    }

    if (error) {
      console.error('Erro ao salvar frigorífico:', error)
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
      setEditingFrigorifico(null)
      loadFrigorificos()
    }

    setSubmitting(false)
  }

  const handleEdit = (frigorifico: Frigorifico) => {
    setEditingFrigorifico(frigorifico)
    setFormData({
      nome: frigorifico.nome,
      razao_social: frigorifico.razao_social || '',
      cnpj: frigorifico.cnpj || '',
      telefone: frigorifico.telefone || '',
      email: frigorifico.email || '',
      endereco: frigorifico.endereco || '',
      cidade: frigorifico.cidade || '',
      estado: frigorifico.estado || '',
      cep: frigorifico.cep || '',
      ativo: frigorifico.ativo,
    })
    setShowForm(true)
  }

  const handleCancel = () => {
    setEditingFrigorifico(null)
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
      description: 'Buscar frigoríficos',
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
        <h2 className="text-2xl font-bold text-content-strong">Frigoríficos</h2>
        <div className="flex gap-2 items-start">
          <Input
            type="text"
            placeholder="Buscar frigorífico..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-xs border-border-base focus:border-accent h-10"
          />
          <Button onClick={() => setShowForm(true)} className="h-10">Novo Frigorífico</Button>
        </div>
      </div>

      {showForm && (
        <Card className="bg-surface-1 p-6 border-0 shadow-sm">
          <h3 className="text-xl font-semibold text-content-strong mb-4">
            {editingFrigorifico ? 'Editar Frigorífico' : 'Novo Frigorífico'}
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
                placeholder="Nome do frigorífico"
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

      {!showForm && frigorificos.length === 0 ? (
        <Card className="bg-surface-1 p-12 border-0 shadow-sm text-center">
          <p className="text-content-muted mb-4">Nenhum frigorífico cadastrado</p>
          <Button onClick={() => setShowForm(true)}>Criar Primeiro Frigorífico</Button>
        </Card>
      ) : !showForm ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {frigorificos
            .filter((frigorifico) =>
              frigorifico.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
              (frigorifico.razao_social && frigorifico.razao_social.toLowerCase().includes(searchTerm.toLowerCase()))
            )
            .map((frigorifico) => (
              <CardItem
                key={frigorifico.id}
                title={frigorifico.nome}
                subtitle={frigorifico.razao_social}
                status={frigorifico.ativo}
                onClick={() => handleEdit(frigorifico)}
              >
                <div className="space-y-2 mb-4">
                  {frigorifico.telefone && (
                    <p className="text-sm text-content-muted">
                      <span className="font-medium">Telefone:</span> {frigorifico.telefone}
                    </p>
                  )}

                  {frigorifico.email && (
                    <p className="text-sm text-content-muted">
                      <span className="font-medium">Email:</span> {frigorifico.email}
                    </p>
                  )}

                  {frigorifico.cidade && frigorifico.estado && (
                    <p className="text-sm text-content-muted">
                      <span className="font-medium">Cidade:</span> {frigorifico.cidade}/{frigorifico.estado}
                    </p>
                  )}

                  {frigorifico.cnpj && (
                    <p className="text-sm text-content-muted">
                      <span className="font-medium">CNPJ:</span> {frigorifico.cnpj}
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button 
                    variant="secondary" 
                    className="flex-1"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleEdit(frigorifico)
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
