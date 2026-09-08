import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, Input, CardItem, useToast, EmptyState, PageSkeleton } from '../../components/ui'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

function fmt(n: number, digits = 2): string {
  return n.toFixed(digits).replace('.', ',')
}

function maskCurrency(value: string): string {
  let clean = value.replace(/^R\$\s*/, '').replace(/\./g, '')
  clean = clean.replace(/[^\d,]/g, '')
  const parts = clean.split(',')
  if (parts.length > 1) {
    clean = `${parts[0]},${parts[1].slice(0, 2)}`
  }
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const decPart = parts[1] !== undefined ? parts[1].slice(0, 2) : ''
  const formatted = parts.length > 1 ? `${intPart},${decPart}` : intPart
  return formatted ? `R$ ${formatted}` : ''
}

function parseCurrency(value: string): number {
  const clean = value.replace(/^R\$\s*/, '').replace(/\./g, '').replace(',', '.').trim()
  return parseFloat(clean) || 0
}

interface Insumo {
  id: string
  fazenda_id: string
  nome: string
  tipo?: string
  fornecedor?: string
  teor_ms?: number
  preco_ton_mn?: number
  formulacao_origem_id?: string | null
  ativo: boolean
  created_at: string
  updated_at: string
}

interface FornecedorOption {
  id: string
  nome: string
}

export function Insumos() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [fornecedores, setFornecedores] = useState<FornecedorOption[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingInsumo, setEditingInsumo] = useState<Insumo | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [formData, setFormData] = useState({
    nome: '',
    tipo: '',
    fornecedor: '',
    teor_ms: '',
    preco_ton_mn: '',
    ativo: true,
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadInsumos()
    loadFornecedores()
  }, [user])

  const loadInsumos = async () => {
    if (!user) return

    // Buscar fazenda vinculada
    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) return

    const fazendaId = vinculos[0].fazenda_id

    const { data, error } = await supabase
      .from('insumos')
      .select('*')
      .eq('fazenda_id', fazendaId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erro ao buscar insumos:', error)
    } else {
      setInsumos(data as Insumo[])
    }

    setLoading(false)
  }

  const loadFornecedores = async () => {
    if (!user) return
    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []
    if (!vinculos || vinculos.length === 0) return
    const fazendaId = vinculos[0].fazenda_id

    const { data } = await supabase
      .from('fornecedores')
      .select('id, nome')
      .eq('fazenda_id', fazendaId)
      .eq('ativo', true)
      .is('deleted_at', null)
      .order('nome')

    setFornecedores(data as FornecedorOption[] || [])
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
      tipo: formData.tipo,
      fornecedor: formData.fornecedor || null,
      teor_ms: formData.teor_ms ? parseFloat(formData.teor_ms.replace(',', '.')) : null,
      preco_ton_mn: formData.preco_ton_mn ? parseCurrency(formData.preco_ton_mn) : null,
      ativo: formData.ativo,
    }

    let error

    if (editingInsumo) {
      // Atualizar insumo existente
      const { error: updateError } = await supabase
        .from('insumos')
        .update(data)
        .eq('id', editingInsumo.id)
      error = updateError
    } else {
      // Criar novo insumo
      const { error: insertError } = await supabase.from('insumos').insert(data)
      error = insertError
    }

    if (error) {
      console.error('Erro ao salvar insumo:', error)
    } else {
      setFormData({
        nome: '',
        tipo: '',
        fornecedor: '',
        teor_ms: '',
        preco_ton_mn: '',
        ativo: true,
      })
      setShowForm(false)
      setEditingInsumo(null)
      loadInsumos()
    }

    setSubmitting(false)
  }

  const handleEdit = (insumo: Insumo) => {
    // Insumos gerados de premix são read-only: redireciona para a formulação de origem
    if (insumo.formulacao_origem_id) {
      navigate(`/controller/formulacoes?edit=${insumo.formulacao_origem_id}`)
      return
    }
    setEditingInsumo(insumo)
    setFormData({
      nome: insumo.nome,
      tipo: insumo.tipo || '',
      fornecedor: insumo.fornecedor || '',
      teor_ms: insumo.teor_ms != null ? insumo.teor_ms.toFixed(2).replace('.', ',') : '',
      preco_ton_mn: insumo.preco_ton_mn != null ? maskCurrency(fmt(insumo.preco_ton_mn)) : '',
      ativo: insumo.ativo,
    })
    setShowForm(true)
  }

  const handleCancel = () => {
    setEditingInsumo(null)
    setFormData({
      nome: '',
      tipo: '',
      fornecedor: '',
      teor_ms: '',
      preco_ton_mn: '',
      ativo: true,
    })
    setShowForm(false)
  }

  const handleToggleActive = async (insumo: Insumo) => {
    // Insumos gerados de premix não podem ser desativados diretamente
    if (insumo.formulacao_origem_id) {
      toast.warning(
        'Este insumo é gerado automaticamente por uma formulação premix. ' +
        'Para desativá-lo, desative a formulação de origem em Formulações.'
      )
      return
    }
    const { error } = await supabase
      .from('insumos')
      .update({ ativo: !insumo.ativo })
      .eq('id', insumo.id)

    if (error) {
      console.error('Erro ao atualizar insumo:', error)
    } else {
      loadInsumos()
    }
  }

  const shortcuts = [
    {
      key: 'f',
      ctrl: true,
      description: 'Buscar insumos',
      action: () => {
        const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement
        searchInput?.focus()
      },
    },
    {
      key: 'Escape',
      description: 'Fechar formulário',
      action: () => {
        if (showForm) handleCancel()
      },
    },
  ]

  useKeyboardShortcuts(shortcuts)

  if (loading) {
    return <PageSkeleton variant="grid" />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Insumos</h2>
        <div className="flex gap-2 items-start">
          <Input
            type="text"
            placeholder="Buscar insumo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-xs border-gray-200 focus:border-accent h-10"
          />
          <Button onClick={() => setShowForm(true)} className="h-10">Novo Insumo</Button>
          {!showForm && (
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
          )}
        </div>
      </div>

      {showForm && (
        <Card className="bg-white p-6 border-0 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-xl font-semibold text-gray-800">
              {editingInsumo ? 'Editar Insumo' : 'Novo Insumo'}
            </h3>
            <button
              type="button"
              onClick={handleCancel}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1"
              aria-label="Fechar formulário"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">
                  Nome *
                </label>
                <Input
                  type="text"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  required
                  placeholder="Nome do insumo"
                  className="border-gray-200 focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">
                  Tipo <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.tipo}
                  onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}
                  required
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary input-focus min-h-[44px] text-sm sm:text-base border-gray-300 bg-white"
                >
                  <option value="">Selecione...</option>
                  <option value="Aditivo">Aditivo</option>
                  <option value="Energético">Energético</option>
                  <option value="Inerte">Inerte</option>
                  <option value="Mineral">Mineral</option>
                  <option value="Núcleo">Núcleo</option>
                  <option value="Premix">Premix</option>
                  <option value="Proteico">Proteico</option>
                  <option value="Volumoso">Volumoso</option>
                  <option value="Outros">Outros</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">
                  Fornecedor
                </label>
                <select
                  value={formData.fornecedor}
                  onChange={(e) => setFormData({ ...formData, fornecedor: e.target.value })}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary input-focus min-h-[44px] text-sm sm:text-base border-gray-300 bg-white"
                >
                  <option value="">Selecione um fornecedor...</option>
                  {fornecedores.map((f) => (
                    <option key={f.id} value={f.nome}>{f.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">
                  Teor MS (%) <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={formData.teor_ms}
                  onChange={(e) => setFormData({ ...formData, teor_ms: e.target.value })}
                  required
                  placeholder="Ex: 88,00"
                  className="border-gray-200 focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">
                  Preço (R$/Ton/MN) <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={formData.preco_ton_mn}
                  onChange={(e) => setFormData({ ...formData, preco_ton_mn: maskCurrency(e.target.value) })}
                  required
                  placeholder="Ex: R$ 750,00"
                  className="border-gray-200 focus:border-accent"
                />
              </div>

            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Salvando...' : 'Salvar'}
              </Button>
              <Button variant="secondary" onClick={handleCancel}>
                Cancelar
              </Button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, ativo: !formData.ativo })}
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 border-2 ${
                  formData.ativo
                    ? 'bg-green-100 text-green-800 border-green-300 hover:bg-green-200'
                    : 'bg-gray-100 text-gray-800 border-gray-300 hover:bg-gray-200'
                }`}
              >
                {formData.ativo ? '✓ Ativo' : '✗ Inativo'}
              </button>
            </div>
          </form>
        </Card>
      )}

      {!showForm && insumos.length === 0 ? (
        <EmptyState
          title="Nenhum insumo cadastrado"
          action={<Button onClick={() => setShowForm(true)}>Criar Primeiro Insumo</Button>}
        />
      ) : !showForm ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {insumos
            .filter((insumo) =>
              (showInactive || insumo.ativo) &&
              (insumo.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
              (insumo.tipo && insumo.tipo.toLowerCase().includes(searchTerm.toLowerCase())))
            )
            .map((insumo) => (
              <CardItem
                key={insumo.id}
                title={insumo.nome}
                subtitle={insumo.tipo}
                status={insumo.ativo}
                onClick={() => handleEdit(insumo)}
              >
                {insumo.formulacao_origem_id && (
                  <div className="mb-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-xs font-medium">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Gerado de formulação
                  </div>
                )}
                <div className="space-y-2 mb-4">
                  {insumo.fornecedor && (
                    <p className="text-sm text-gray-500">
                      <span className="font-medium">Fornecedor:</span> {insumo.fornecedor}
                    </p>
                  )}
                  {insumo.teor_ms !== undefined && insumo.teor_ms !== null && (
                    <p className="text-sm text-gray-500">
                      <span className="font-medium">Teor MS:</span> {fmt(insumo.teor_ms)}%
                    </p>
                  )}
                  {insumo.preco_ton_mn !== undefined && insumo.preco_ton_mn !== null && (
                    <p className="text-sm text-gray-500">
                      <span className="font-medium">Preço:</span> R$ {insumo.preco_ton_mn.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/Ton/MN
                    </p>
                  )}
                </div>

                <div className="flex gap-2 mt-auto pt-3">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleEdit(insumo)
                    }}
                  >
                    {insumo.formulacao_origem_id ? 'Editar na formulação' : 'Editar'}
                  </Button>
                  {!insumo.formulacao_origem_id && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="text-red-600 hover:text-red-700"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleToggleActive(insumo)
                    }}
                  >
                    {insumo.ativo ? 'Desativar' : 'Ativar'}
                  </Button>
                  )}
                </div>
              </CardItem>
            ))}
        </div>
      ) : null}

    </div>
  )
}
