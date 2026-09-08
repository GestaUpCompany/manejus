import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, Input, CardItem, EmptyState, PageSkeleton } from '../../components/ui'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

const tiposComuns = [
  'Antibiótico',
  'Anti-inflamatório',
  'Vermífugo',
  'Analgésico',
  'Antiparasitário',
  'Vitamina',
  'Hormônio',
  'Soro',
  'Vacina',
  'Suplemento Vitamínico',
]

interface Medicamento {
  id: string
  fazenda_id: string
  tipo: string
  nome_comercial: string
  principio_ativo: string
  dose_recomendada?: string
  ativo: boolean
}

export function Medicamentos() {
  const { user } = useAuth()
  const [medicamentos, setMedicamentos] = useState<Medicamento[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingMedicamento, setEditingMedicamento] = useState<Medicamento | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [formData, setFormData] = useState({
    tipo: '',
    nome_comercial: '',
    principio_ativo: '',
    dose_recomendada: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [tiposDisponiveis, setTiposDisponiveis] = useState<string[]>(tiposComuns)

  useEffect(() => {
    loadMedicamentos()
  }, [user])

  useKeyboardShortcuts([
    {
      key: 'Escape',
      description: 'Cancelar formulário',
      action: () => {
        if (showForm) handleCancel()
      }
    }
  ])

  const loadMedicamentos = async () => {
    if (!user) return

    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) return

    const fazendaId = vinculos[0].fazenda_id

    const { data, error } = await supabase
      .from('medicamentos')
      .select('*')
      .eq('fazenda_id', fazendaId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erro ao buscar medicamentos:', error)
    } else {
      setMedicamentos(data as Medicamento[])
      
      // Calcular tipos disponíveis (comuns + já cadastrados)
      const tiposJaCadastrados = [...new Set(data.map((m: Medicamento) => m.tipo))]
      const todosTipos = [...new Set([...tiposComuns, ...tiposJaCadastrados])]
      setTiposDisponiveis(todosTipos)
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
      tipo: formData.tipo,
      nome_comercial: formData.nome_comercial,
      principio_ativo: formData.principio_ativo,
      dose_recomendada: formData.dose_recomendada,
    }

    let error

    if (editingMedicamento) {
      const { error: updateError } = await supabase
        .from('medicamentos')
        .update(data)
        .eq('id', editingMedicamento.id)
      error = updateError
    } else {
      const { error: insertError } = await supabase.from('medicamentos').insert(data)
      error = insertError
    }

    if (error) {
      console.error('Erro ao salvar medicamento:', error)
    } else {
      setFormData({
        tipo: '',
        nome_comercial: '',
        principio_ativo: '',
        dose_recomendada: '',
      })
      setShowForm(false)
      setEditingMedicamento(null)
      loadMedicamentos()
    }

    setSubmitting(false)
  }

  const handleEdit = (medicamento: Medicamento) => {
    setEditingMedicamento(medicamento)
    setFormData({
      tipo: medicamento.tipo,
      nome_comercial: medicamento.nome_comercial,
      principio_ativo: medicamento.principio_ativo,
      dose_recomendada: medicamento.dose_recomendada || '',
    })
    setShowForm(true)
  }

  const handleCancel = () => {
    setEditingMedicamento(null)
    setFormData({
      tipo: '',
      nome_comercial: '',
      principio_ativo: '',
      dose_recomendada: '',
    })
    setShowForm(false)
  }

  const handleToggleActive = async (medicamento: Medicamento) => {
    const { error } = await supabase
      .from('medicamentos')
      .update({ ativo: !medicamento.ativo, deleted_at: !medicamento.ativo ? new Date().toISOString() : null })
      .eq('id', medicamento.id)

    if (error) {
      console.error('Erro ao atualizar medicamento:', error)
    } else {
      loadMedicamentos()
    }
  }

  const filteredMedicamentos = medicamentos.filter((medicamento) =>
    (showInactive || medicamento.ativo) &&
    (medicamento.nome_comercial.toLowerCase().includes(searchTerm.toLowerCase()) ||
    medicamento.tipo.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  if (loading) {
    return <PageSkeleton variant="grid" />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Medicamentos</h1>
        {!showForm && (
          <Button onClick={() => setShowForm(true)}>Novo Medicamento</Button>
        )}
      </div>

      {!showForm && (
        <div className="flex gap-2 items-center">
          <Input
            placeholder="Buscar medicamentos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-md"
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
      )}

      {showForm && (
        <Card className="bg-white p-6 border-0 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">
            {editingMedicamento ? 'Editar Medicamento' : 'Novo Medicamento'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                list="tipos-medicamentos"
                value={formData.tipo}
                onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}
                required
                placeholder="Ex: Antibiótico, Anti-inflamatório"
                className="border-gray-200 focus:border-accent"
              />
              <datalist id="tipos-medicamentos">
                {tiposDisponiveis.map((tipo) => (
                  <option key={tipo} value={tipo} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nome Comercial <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                value={formData.nome_comercial}
                onChange={(e) => setFormData({ ...formData, nome_comercial: e.target.value })}
                required
                placeholder="Ex: Penicilina, Dipirona"
                className="border-gray-200 focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Princípio Ativo <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                value={formData.principio_ativo}
                onChange={(e) => setFormData({ ...formData, principio_ativo: e.target.value })}
                required
                placeholder="Ex: Amoxicilina"
                className="border-gray-200 focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Dose Recomendada <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                value={formData.dose_recomendada}
                onChange={(e) => setFormData({ ...formData, dose_recomendada: e.target.value })}
                required
                placeholder="Ex: 10mg/kg"
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

      {!showForm && medicamentos.length === 0 ? (
        <EmptyState
          title="Nenhum medicamento cadastrado"
          action={<Button onClick={() => setShowForm(true)}>Criar Primeiro Medicamento</Button>}
        />
      ) : !showForm ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMedicamentos.map((medicamento) => (
            <CardItem
              key={medicamento.id}
              title={medicamento.nome_comercial}
              subtitle={medicamento.tipo}
              status={medicamento.ativo}
              onClick={() => handleEdit(medicamento)}
            >
              <p className="text-sm text-gray-500 mb-2">Princípio Ativo: {medicamento.principio_ativo}</p>
              {medicamento.dose_recomendada && (
                <p className="text-sm text-gray-500 mb-4">Dose: {medicamento.dose_recomendada}</p>
              )}
              <div className="flex flex-wrap gap-1 sm:gap-2">
                <Button
                  variant="secondary"
                  className="flex-1 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleToggleActive(medicamento)
                  }}
                >
                  {medicamento.ativo ? 'Desativar' : 'Ativar'}
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleEdit(medicamento)
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
