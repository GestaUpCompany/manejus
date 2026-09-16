import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, Input, CardSkeleton } from '../../components/ui'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

interface MaquinaVeiculo {
  id: string
  fazenda_id: string
  nome: string
  tipo: string
  categoria: string
  modelo?: string
  ano?: number
  placa?: string
  tipo_combustivel?: string
  capacidade?: number
  horimetro?: number
  quilometragem?: number
  custo_hora?: number
  custo_km?: number
  operador_padrao?: string
  status: string
  data_ultima_manutencao?: string
  data_proxima_manutencao?: string
  observacoes?: string
  ativo: boolean
}

export function MaquinasVeiculos() {
  const { user } = useAuth()
  const [maquinasVeiculos, setMaquinasVeiculos] = useState<MaquinaVeiculo[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingMaquinaVeiculo, setEditingMaquinaVeiculo] = useState<MaquinaVeiculo | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [formData, setFormData] = useState({
    nome: '',
    tipo: '',
    categoria: '',
    modelo: '',
    ano: '',
    placa: '',
    tipo_combustivel: '',
    capacidade: '',
    horimetro: '',
    quilometragem: '',
    custo_hora: '',
    custo_km: '',
    operador_padrao: '',
    status: 'Ativo',
    data_ultima_manutencao: '',
    data_proxima_manutencao: '',
    observacoes: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [showInactive, setShowInactive] = useState(false)

  useEffect(() => {
    loadMaquinasVeiculos()
  }, [user])

  const loadMaquinasVeiculos = async () => {
    if (!user) return

    // Buscar fazenda vinculada usando auth_id
    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) return

    const fazendaId = vinculos[0].fazenda_id

    const { data, error } = await supabase
      .from('maquinas_veiculos')
      .select('*')
      .eq('fazenda_id', fazendaId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Erro ao buscar máquinas e veículos:', error)
    } else {
      setMaquinasVeiculos(data as MaquinaVeiculo[])
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
      tipo: formData.tipo,
      categoria: formData.categoria,
      modelo: formData.modelo || null,
      ano: formData.ano ? parseInt(formData.ano) : null,
      placa: formData.placa || null,
      tipo_combustivel: formData.tipo_combustivel || null,
      capacidade: formData.capacidade ? parseFloat(formData.capacidade) : null,
      horimetro: formData.horimetro ? parseFloat(formData.horimetro) : null,
      quilometragem: formData.quilometragem ? parseFloat(formData.quilometragem) : null,
      custo_hora: formData.custo_hora ? parseFloat(formData.custo_hora) : null,
      custo_km: formData.custo_km ? parseFloat(formData.custo_km) : null,
      operador_padrao: formData.operador_padrao || null,
      status: formData.status,
      data_ultima_manutencao: formData.data_ultima_manutencao || null,
      data_proxima_manutencao: formData.data_proxima_manutencao || null,
      observacoes: formData.observacoes || null,
    }

    let error

    if (editingMaquinaVeiculo) {
      // Atualizar máquina/veículo existente
      const { error: updateError } = await supabase
        .from('maquinas_veiculos')
        .update(data)
        .eq('id', editingMaquinaVeiculo.id)
      error = updateError
    } else {
      // Criar nova máquina/veículo
      const { error: insertError } = await supabase.from('maquinas_veiculos').insert(data)
      error = insertError
    }

    if (error) {
      console.error('Erro ao salvar máquina/veículo:', error)
    } else {
      setFormData({
        nome: '',
        tipo: '',
        categoria: '',
        modelo: '',
        ano: '',
        placa: '',
        tipo_combustivel: '',
        capacidade: '',
        horimetro: '',
        quilometragem: '',
        custo_hora: '',
        custo_km: '',
        operador_padrao: '',
        status: 'Ativo',
        data_ultima_manutencao: '',
        data_proxima_manutencao: '',
        observacoes: '',
      })
      setShowForm(false)
      setEditingMaquinaVeiculo(null)
      loadMaquinasVeiculos()
    }

    setSubmitting(false)
  }

  const handleEdit = (maquinaVeiculo: MaquinaVeiculo) => {
    setEditingMaquinaVeiculo(maquinaVeiculo)
    setFormData({
      nome: maquinaVeiculo.nome,
      tipo: maquinaVeiculo.tipo,
      categoria: maquinaVeiculo.categoria,
      modelo: maquinaVeiculo.modelo || '',
      ano: maquinaVeiculo.ano?.toString() || '',
      placa: maquinaVeiculo.placa || '',
      tipo_combustivel: maquinaVeiculo.tipo_combustivel || '',
      capacidade: maquinaVeiculo.capacidade?.toString() || '',
      horimetro: maquinaVeiculo.horimetro?.toString() || '',
      quilometragem: maquinaVeiculo.quilometragem?.toString() || '',
      custo_hora: maquinaVeiculo.custo_hora?.toString() || '',
      custo_km: maquinaVeiculo.custo_km?.toString() || '',
      operador_padrao: maquinaVeiculo.operador_padrao || '',
      status: maquinaVeiculo.status,
      data_ultima_manutencao: maquinaVeiculo.data_ultima_manutencao || '',
      data_proxima_manutencao: maquinaVeiculo.data_proxima_manutencao || '',
      observacoes: maquinaVeiculo.observacoes || '',
    })
    setShowForm(true)
  }

  const handleCancel = () => {
    setEditingMaquinaVeiculo(null)
    setFormData({
      nome: '',
      tipo: '',
      categoria: '',
      modelo: '',
      ano: '',
      placa: '',
      tipo_combustivel: '',
      capacidade: '',
      horimetro: '',
      quilometragem: '',
      custo_hora: '',
      custo_km: '',
      operador_padrao: '',
      status: 'Ativo',
      data_ultima_manutencao: '',
      data_proxima_manutencao: '',
      observacoes: '',
    })
    setShowForm(false)
  }

  const handleToggleActive = async (maquinaVeiculo: MaquinaVeiculo) => {
    const { error } = await supabase
      .from('maquinas_veiculos')
      .update({ ativo: !maquinaVeiculo.ativo })
      .eq('id', maquinaVeiculo.id)

    if (error) {
      console.error('Erro ao atualizar máquina/veículo:', error)
    } else {
      loadMaquinasVeiculos()
    }
  }

  const filteredMaquinasVeiculos = maquinasVeiculos.filter((mv) => {
    if (!showInactive && !mv.ativo) return false
    const searchLower = searchTerm.toLowerCase()
    return (
      mv.nome.toLowerCase().includes(searchLower) ||
      mv.modelo?.toLowerCase().includes(searchLower) ||
      mv.placa?.toLowerCase().includes(searchLower) ||
      mv.categoria.toLowerCase().includes(searchLower) ||
      mv.tipo.toLowerCase().includes(searchLower) ||
      mv.status.toLowerCase().includes(searchLower)
    )
  })

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
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Máquinas e Veículos</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Máquinas e Veículos</h1>
        {!showForm && (
          <Button onClick={() => setShowForm(true)}>Novo</Button>
        )}
      </div>

      {!showForm && (
        <div className="mb-6 flex gap-2">
          <Input
            placeholder="Buscar por nome, modelo, placa, categoria..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
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
        </div>
      )}

      {showForm ? (
        <Card className="mb-6">
          <h2 className="text-xl font-semibold mb-4">
            {editingMaquinaVeiculo ? 'Editar' : 'Nova'} Máquina/Veículo
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-content mb-1 min-h-[2.5rem] leading-tight line-clamp-2">Nome *</label>
                <Input
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 min-h-[2.5rem] leading-tight line-clamp-2">Tipo *</label>
                <select
                  value={formData.tipo}
                  onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}
                  className="w-full px-3 py-2 border border-surface-3 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Selecione</option>
                  <option value="Maquina">Máquina</option>
                  <option value="Veiculo">Veículo</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 min-h-[2.5rem] leading-tight line-clamp-2">Categoria *</label>
                <select
                  value={formData.categoria}
                  onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
                  className="w-full px-3 py-2 border border-surface-3 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Selecione</option>
                  <option value="Trator">Trator</option>
                  <option value="Colheitadeira">Colheitadeira</option>
                  <option value="Caminhao">Caminhão</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 min-h-[2.5rem] leading-tight line-clamp-2">Modelo</label>
                <Input
                  value={formData.modelo}
                  onChange={(e) => setFormData({ ...formData, modelo: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 min-h-[2.5rem] leading-tight line-clamp-2">Ano</label>
                <Input
                  type="number"
                  value={formData.ano}
                  onChange={(e) => setFormData({ ...formData, ano: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 min-h-[2.5rem] leading-tight line-clamp-2">Placa</label>
                <Input
                  value={formData.placa}
                  onChange={(e) => setFormData({ ...formData, placa: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 min-h-[2.5rem] leading-tight line-clamp-2">Tipo de Combustível</label>
                <select
                  value={formData.tipo_combustivel}
                  onChange={(e) => setFormData({ ...formData, tipo_combustivel: e.target.value })}
                  className="w-full px-3 py-2 border border-surface-3 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Selecione</option>
                  <option value="Diesel S10">Diesel S10</option>
                  <option value="Diesel S500">Diesel S500</option>
                  <option value="Diesel Comum">Diesel Comum</option>
                  <option value="Gasolina">Gasolina</option>
                  <option value="Alcool">Álcool</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 min-h-[2.5rem] leading-tight line-clamp-2">Capacidade (L)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.capacidade}
                  onChange={(e) => setFormData({ ...formData, capacidade: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 min-h-[2.5rem] leading-tight line-clamp-2">Horímetro (h)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.horimetro}
                  onChange={(e) => setFormData({ ...formData, horimetro: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 min-h-[2.5rem] leading-tight line-clamp-2">Quilometragem (km)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.quilometragem}
                  onChange={(e) => setFormData({ ...formData, quilometragem: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 min-h-[2.5rem] leading-tight line-clamp-2">Custo por Hora (R$)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.custo_hora}
                  onChange={(e) => setFormData({ ...formData, custo_hora: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 min-h-[2.5rem] leading-tight line-clamp-2">Custo por km (R$)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.custo_km}
                  onChange={(e) => setFormData({ ...formData, custo_km: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 min-h-[2.5rem] leading-tight line-clamp-2">Operador Padrão</label>
                <Input
                  value={formData.operador_padrao}
                  onChange={(e) => setFormData({ ...formData, operador_padrao: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 min-h-[2.5rem] leading-tight line-clamp-2">Status *</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3 py-2 border border-surface-3 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="Ativo">Ativo</option>
                  <option value="Inativo">Inativo</option>
                  <option value="Manutencao">Manutenção</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 min-h-[2.5rem] leading-tight line-clamp-2">Última Manutenção</label>
                <Input
                  type="date"
                  value={formData.data_ultima_manutencao}
                  onChange={(e) => setFormData({ ...formData, data_ultima_manutencao: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1 min-h-[2.5rem] leading-tight line-clamp-2">Próxima Manutenção</label>
                <Input
                  type="date"
                  value={formData.data_proxima_manutencao}
                  onChange={(e) => setFormData({ ...formData, data_proxima_manutencao: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-content mb-1 min-h-[2.5rem] leading-tight line-clamp-2">Observações</label>
              <textarea
                value={formData.observacoes}
                onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                className="w-full px-3 py-2 border border-surface-3 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Salvando...' : 'Salvar'}
              </Button>
              <Button type="button" variant="secondary" onClick={handleCancel}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <>
          {filteredMaquinasVeiculos.length === 0 ? (
            <Card>Nenhuma máquina/veículo cadastrada</Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMaquinasVeiculos.map((mv) => (
                <Card key={mv.id} className={!mv.ativo ? 'opacity-60' : ''}>
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="text-lg font-semibold">{mv.nome}</h3>
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        mv.status === 'Ativo'
                          ? 'bg-green-500/10 text-green-800 dark:text-green-200'
                          : mv.status === 'Manutencao'
                          ? 'bg-yellow-500/10 text-yellow-800 dark:text-yellow-200'
                          : 'bg-red-500/10 text-red-800 dark:text-red-200'
                      }`}
                    >
                      {mv.status}
                    </span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-content-muted">Tipo:</span>
                      <span className="text-content-strong">{mv.tipo}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-content-muted">Categoria:</span>
                      <span className="text-content-strong">{mv.categoria}</span>
                    </div>
                    {mv.modelo && (
                      <div className="flex justify-between">
                        <span className="text-content-muted">Modelo:</span>
                        <span className="text-content-strong">{mv.modelo}</span>
                      </div>
                    )}
                    {mv.ano && (
                      <div className="flex justify-between">
                        <span className="text-content-muted">Ano:</span>
                        <span className="text-content-strong">{mv.ano}</span>
                      </div>
                    )}
                    {mv.placa && (
                      <div className="flex justify-between">
                        <span className="text-content-muted">Placa:</span>
                        <span className="text-content-strong">{mv.placa}</span>
                      </div>
                    )}
                    {mv.tipo_combustivel && (
                      <div className="flex justify-between">
                        <span className="text-content-muted">Combustível:</span>
                        <span className="text-content-strong">{mv.tipo_combustivel}</span>
                      </div>
                    )}
                    {mv.horimetro && (
                      <div className="flex justify-between">
                        <span className="text-content-muted">Horímetro:</span>
                        <span className="text-content-strong">{mv.horimetro}h</span>
                      </div>
                    )}
                    {mv.quilometragem && (
                      <div className="flex justify-between">
                        <span className="text-content-muted">Quilometragem:</span>
                        <span className="text-content-strong">{mv.quilometragem}km</span>
                      </div>
                    )}
                    {mv.data_proxima_manutencao && (
                      <div className="flex justify-between">
                        <span className="text-content-muted">Próx. Manutenção:</span>
                        <span className="text-content-strong">
                          {new Date(mv.data_proxima_manutencao).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button size="sm" onClick={() => handleEdit(mv)}>
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleToggleActive(mv)}
                    >
                      {mv.ativo ? 'Desativar' : 'Ativar'}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
