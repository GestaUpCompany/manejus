import { useEffect, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, Input, CardSkeleton, ConfirmModal } from '../../components/ui'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

interface ModuloPasto {
  id: string
  fazenda_id: string
  nome: string
  area_util_total_ha: number | null
  setor_id?: string | null
  sistema_producao?: string | null
  responsavel?: string | null
  meta_intervalo_ocupacao_dias?: number | null
  ativo: boolean | null
  deleted_at?: string | null
  pastos?: Pasto[]
  setores?: { nome: string } | null
}

interface Pasto {
  id: string
  nome: string
  area_util_ha?: number | null
  especie?: string | null
  modulo_id?: string | null
}

export function ModulosPastos() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const [modulos, setModulos] = useState<ModuloPasto[]>([])
  const [pastos, setPastos] = useState<Pasto[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingModulo, setEditingModulo] = useState<ModuloPasto | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [formData, setFormData] = useState({
    nome: '',
    setor_id: '',
    sistema_producao: '',
    responsavel: '',
    meta_intervalo_ocupacao_dias: '',
  })
  const [setores, setSetores] = useState<{id: string, nome: string}[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [selectedPastos, setSelectedPastos] = useState<string[]>([])
  const [calculatedArea, setCalculatedArea] = useState(0)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [moduloToDelete, setModuloToDelete] = useState<ModuloPasto | null>(null)
  const [showDeactivateModal, setShowDeactivateModal] = useState(false)
  const [moduloToDeactivate, setModuloToDeactivate] = useState<ModuloPasto | null>(null)
  const [ocupacaoPorModulo, setOcupacaoPorModulo] = useState<Record<string, any[]>>({})

  const loadModulos = async () => {
    if (!user) return

    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) {
      setLoading(false)
      return
    }

    const fazendaId = vinculos[0].fazenda_id

    // Carregar módulos e ocupação atual em paralelo (consultas independentes)
    const [
      { data, error },
      { data: ocupacaoData },
    ] = await Promise.all([
      supabase
        .from('modulos_pastos')
        .select('*, pastos(id, nome, area_util_ha, especie), setores(nome)')
        .eq('fazenda_id', fazendaId)
        .order('nome'),
      // Carregar ocupação atual dos módulos (múltiplos lotes por módulo)
      supabase
        .from('v_lote_modulo_ocupacao_atual')
        .select('*'),
    ])

    if (error) {
      console.error('Erro ao carregar módulos:', error)
    } else {
      setModulos(data || [])
    }

    if (ocupacaoData) {
      const ocupacaoMap: Record<string, any[]> = {}
      ocupacaoData.forEach((item: any) => {
        if (!ocupacaoMap[item.modulo_id]) ocupacaoMap[item.modulo_id] = []
        ocupacaoMap[item.modulo_id].push(item)
      })
      setOcupacaoPorModulo(ocupacaoMap)
    }

    setLoading(false)
  }

  const loadPastos = async (moduloId?: string) => {
    if (!user) return

    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) return

    const fazendaId = vinculos[0].fazenda_id

    let query = supabase
      .from('pastos')
      .select('id, nome, area_util_ha, especie, modulo_id')
      .eq('fazenda_id', fazendaId)
      .eq('ativo', true)
      .is('deleted_at', null)

    // Se estiver editando um módulo, mostrar pastos órfãos OU pastos deste módulo
    // Se estiver criando novo módulo, mostrar apenas pastos órfãos
    if (moduloId) {
      query = query.or(`modulo_id.is.null,modulo_id.eq.${moduloId}`)
    } else {
      query = query.is('modulo_id', null)
    }

    const { data, error } = await query.order('nome')

    if (error) {
      console.error('Erro ao carregar pastos:', error)
    } else {
      setPastos(data || [])
    }
  }

  useEffect(() => {
    loadModulos()
    loadPastos()
    loadSetores()
  }, [user])

  // Se navegou com state ou query param para editar um módulo específico
  useEffect(() => {
    if (modulos.length === 0) return
    const editModuloId = (location.state as any)?.editModuloId || searchParams.get('modulo')
    if (editModuloId) {
      window.history.replaceState({}, document.title)
      const modulo = modulos.find(m => m.id === editModuloId)
      if (modulo) handleEdit(modulo)
    }
  }, [modulos])

  const loadSetores = async () => {
    if (!user) return

    const _fazendaId = await getFazendaIdForUser(user.id)
    const vinculos = _fazendaId ? [{ fazenda_id: _fazendaId }] : []

    if (!vinculos || vinculos.length === 0) return

    const fazendaId = vinculos[0].fazenda_id

    const { data, error } = await supabase
      .from('setores')
      .select('id, nome')
      .eq('fazenda_id', fazendaId)
      .eq('ativo', true)
      .order('nome', { ascending: true })

    if (error) {
      console.error('Erro ao buscar setores:', error)
    } else {
      setSetores(data || [])
    }
  }

  useEffect(() => {
    // Recarregar pastos quando mudar entre criar/editar
    if (editingModulo) {
      loadPastos(editingModulo.id)
    } else {
      loadPastos()
    }
  }, [editingModulo])

  useEffect(() => {
    const totalArea = selectedPastos.reduce((sum, pastoId) => {
      const pasto = pastos.find(p => p.id === pastoId)
      return sum + (pasto?.area_util_ha || 0)
    }, 0)
    setCalculatedArea(totalArea)
  }, [selectedPastos, pastos])

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
      nome: formData.nome,
      setor_id: formData.setor_id || null,
      sistema_producao: formData.sistema_producao || null,
      responsavel: formData.responsavel || null,
      meta_intervalo_ocupacao_dias: formData.meta_intervalo_ocupacao_dias ? parseInt(formData.meta_intervalo_ocupacao_dias) : null,
    }

    let moduloId: string | undefined
    let error

    if (editingModulo) {
      const { error: updateError } = await supabase
        .from('modulos_pastos')
        .update(data)
        .eq('id', editingModulo.id)
      error = updateError
      moduloId = editingModulo.id
    } else {
      const { data: insertedData, error: insertError } = await supabase.from('modulos_pastos').insert(data).select('id').single()
      error = insertError
      moduloId = insertedData?.id
    }

    if (error) {
      console.error('Erro ao salvar módulo:', error)
    } else if (moduloId) {
      // Get old associations BEFORE deleting (to identify pastos to orphan)
      let oldPastoIds: string[] = []
      if (editingModulo) {
        const { data: oldRotacoes } = await supabase
          .from('rotacao_pastos')
          .select('pasto_id')
          .eq('modulo_id', moduloId)
        
        oldPastoIds = oldRotacoes?.map(r => r.pasto_id) || []
      }

      // Remove existing associations
      await supabase
        .from('rotacao_pastos')
        .delete()
        .eq('modulo_id', moduloId)

      // Add new associations
      if (selectedPastos.length > 0) {
        const rotacoes = selectedPastos.map((pastoId, index) => ({
          modulo_id: moduloId,
          pasto_id: pastoId,
          ordem: index + 1,
        }))

        await supabase.from('rotacao_pastos').insert(rotacoes)
      }

      // Update pastos modulo_id for selected pastos
      await supabase
        .from('pastos')
        .update({ modulo_id: selectedPastos.length > 0 ? moduloId : null })
        .in('id', selectedPastos)

      // Reset modulo_id for pastos that were previously in this module but are no longer selected
      if (editingModulo && oldPastoIds.length > 0) {
        const toReset = oldPastoIds.filter(id => !selectedPastos.includes(id))
        if (toReset.length > 0) {
          await supabase
            .from('pastos')
            .update({ modulo_id: null })
            .in('id', toReset)
        }
      }

      setFormData({ nome: '', setor_id: '', sistema_producao: '', responsavel: '', meta_intervalo_ocupacao_dias: '' })
      setSelectedPastos([])
      setShowForm(false)
      setEditingModulo(null)
      loadModulos()
    }

    setSubmitting(false)
  }

  const handleEdit = async (modulo: ModuloPasto) => {
    setEditingModulo(modulo)
    setFormData({
      nome: modulo.nome,
      setor_id: modulo.setor_id || '',
      sistema_producao: modulo.sistema_producao || '',
      responsavel: modulo.responsavel || '',
      meta_intervalo_ocupacao_dias: modulo.meta_intervalo_ocupacao_dias?.toString() || '',
    })

    // Load associated pastos
    const { data: rotacoes } = await supabase
      .from('rotacao_pastos')
      .select('pasto_id')
      .eq('modulo_id', modulo.id)
      .eq('ativo', true)
    
    setSelectedPastos(rotacoes?.map(r => r.pasto_id) || [])
    setShowForm(true)
  }

  const handleDeactivateClick = (modulo: ModuloPasto) => {
    setModuloToDeactivate(modulo)
    setShowDeactivateModal(true)
  }

  const handleDeactivateConfirm = async () => {
    if (!moduloToDeactivate) return

    // Desativar os pastos associados ao módulo
    const { error: pastosError } = await supabase
      .from('pastos')
      .update({ ativo: false })
      .eq('modulo_id', moduloToDeactivate.id)

    if (pastosError) {
      console.error('Erro ao desativar pastos:', pastosError)
    }

    // Desativar o módulo
    const { error } = await supabase
      .from('modulos_pastos')
      .update({ ativo: false })
      .eq('id', moduloToDeactivate.id)

    if (error) {
      console.error('Erro ao desativar módulo:', error)
    } else {
      loadModulos()
    }

    setShowDeactivateModal(false)
    setModuloToDeactivate(null)
  }

  const handleToggleActive = async (modulo: ModuloPasto) => {
    // Se estiver reativando o módulo, reativar também os pastos associados
    if (!modulo.ativo) {
      const { error: pastosError } = await supabase
        .from('pastos')
        .update({ ativo: true })
        .eq('modulo_id', modulo.id)

      if (pastosError) {
        console.error('Erro ao reativar pastos:', pastosError)
      }
    }

    const { error } = await supabase
      .from('modulos_pastos')
      .update({ ativo: !modulo.ativo })
      .eq('id', modulo.id)

    if (error) {
      console.error('Erro ao atualizar status do módulo:', error)
    } else {
      loadModulos()
    }
  }

  const handleDelete = async () => {
    if (!moduloToDelete) return

    // Primeiro, tornar os pastos órfãos (limpar modulo_id)
    const { error: pastosError } = await supabase
      .from('pastos')
      .update({ modulo_id: null })
      .eq('modulo_id', moduloToDelete.id)

    if (pastosError) {
      console.error('Erro ao liberar pastos:', pastosError)
    }

    // Depois, fazer soft delete do módulo (marcar como deletado)
    const { error } = await supabase
      .from('modulos_pastos')
      .update({ 
        ativo: false,
        deleted_at: new Date().toISOString()
      })
      .eq('id', moduloToDelete.id)

    if (error) {
      console.error('Erro ao desativar módulo:', error)
    } else {
      setShowDeleteModal(false)
      setModuloToDelete(null)
      loadModulos()
      loadPastos() // Recarregar pastos para atualizar a lista
    }
  }

  const handleCancel = () => {
    setEditingModulo(null)
    setFormData({ nome: '', setor_id: '', sistema_producao: '', responsavel: '', meta_intervalo_ocupacao_dias: '' })
    setSelectedPastos([])
    setShowForm(false)
  }


  const filteredModulos = modulos.filter(
    (modulo) =>
      modulo.nome.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !modulo.deleted_at &&
      (showInactive || modulo.ativo)
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Módulos</h1>
        <Button onClick={() => setShowForm(true)} disabled={showForm}>
          Novo Módulo
        </Button>
      </div>

      {!showForm && (
        <div className="flex items-center justify-between mb-4">
          <Input
            type="text"
            placeholder="Buscar módulo..."
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
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              {editingModulo ? 'Editar Módulo' : 'Novo Módulo'}
            </h2>
            <button
              type="button"
              onClick={handleCancel}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1"
              aria-label="Fechar formulário"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nome <span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                required
                placeholder="Ex: Módulo 1"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Setor
              </label>
              <select
                value={formData.setor_id}
                onChange={(e) => setFormData({ ...formData, setor_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent min-h-[44px] bg-white"
              >
                <option value="">Selecione um setor</option>
                {setores.map((setor) => (
                  <option key={setor.id} value={setor.id}>{setor.nome}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sistema de Produção
              </label>
              <select
                value={formData.sistema_producao}
                onChange={(e) => setFormData({ ...formData, sistema_producao: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent min-h-[44px] bg-white"
              >
                <option value="">Selecione</option>
                <option value="Cria">Cria</option>
                <option value="Recria">Recria</option>
                <option value="Engorda">Engorda</option>
                <option value="Volumosos">Volumosos</option>
                <option value="RIP">RIP</option>
                <option value="TIP">TIP</option>
                <option value="Enfermaria">Enfermaria</option>
                <option value="Confinamento">Confinamento</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Responsável
              </label>
              <Input
                type="text"
                value={formData.responsavel}
                onChange={(e) => setFormData({ ...formData, responsavel: e.target.value })}
                placeholder="Nome do responsável"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Meta de Ocupação (dias)
              </label>
              <Input
                type="number"
                step="1"
                min="1"
                value={formData.meta_intervalo_ocupacao_dias}
                onChange={(e) => setFormData({ ...formData, meta_intervalo_ocupacao_dias: e.target.value })}
                placeholder="Ex: 7"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Área Total (ha)
              </label>
              <Input
                type="text"
                value={calculatedArea.toFixed(2)}
                disabled
                className="bg-gray-100"
              />
              <p className="text-xs text-gray-500 mt-1">Calculada automaticamente com base nos piquetes selecionados</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Piquetes
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                {pastos.map((pasto) => (
                  <button
                    key={pasto.id}
                    type="button"
                    onClick={() => {
                      if (selectedPastos.includes(pasto.id)) {
                        setSelectedPastos(selectedPastos.filter(id => id !== pasto.id))
                      } else {
                        setSelectedPastos([...selectedPastos, pasto.id])
                      }
                    }}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                      selectedPastos.includes(pasto.id)
                        ? 'border-primary bg-primary/10'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-medium">{pasto.nome}</div>
                    <div className="text-sm text-gray-600">
                      {pasto.especie || '—'} • {pasto.area_util_ha?.toFixed(2) || 0} ha
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {editingModulo && (
              <div className="border-t-2 border-gray-100 pt-4 mt-2">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Ocupação Atual
                </h3>
                {ocupacaoPorModulo[editingModulo.id]?.length > 0 ? (
                  <div className="space-y-2">
                    {ocupacaoPorModulo[editingModulo.id].some((oc: any) => oc.meta_excedida) && (
                      <p className="text-xs font-bold text-red-700 flex items-center gap-1 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        ⚠️ Um ou mais lotes com meta de ocupação excedida
                      </p>
                    )}
                    {ocupacaoPorModulo[editingModulo.id].map((oc: any) => (
                      <div
                        key={oc.lote_id}
                        className={`rounded-xl p-4 space-y-2 ${oc.meta_excedida ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}
                      >
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          <div>
                            <p className="text-xs text-gray-500">Lote</p>
                            <p className="text-sm font-medium text-gray-800">{oc.lote_nome}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Tempo de ocupação</p>
                            <p className="text-sm font-medium text-gray-800">{oc.periodo_ocupacao_dias} dias</p>
                          </div>
                          {oc.taxa_lotacao_ua_ha != null && (
                            <div>
                              <p className="text-xs text-gray-500">Taxa de lotação (módulo)</p>
                              <p className="text-sm font-semibold text-blue-700">{Number(oc.taxa_lotacao_ua_ha).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UA/ha</p>
                            </div>
                          )}
                          {oc.meta_intervalo_ocupacao_dias && (
                            <div>
                              <p className="text-xs text-gray-500">Meta</p>
                              <p className={`text-sm font-medium ${oc.meta_excedida ? 'text-red-700' : 'text-green-700'}`}>
                                {oc.meta_intervalo_ocupacao_dias} dias
                                {oc.meta_excedida && <span className="ml-1 text-xs">(+{oc.dias_acima_meta}d)</span>}
                              </p>
                            </div>
                          )}
                          {oc.cabecas_entrada && (
                            <div>
                              <p className="text-xs text-gray-500">Cabeças na entrada</p>
                              <p className="text-sm font-medium text-gray-800">{oc.cabecas_entrada}</p>
                            </div>
                          )}
                          {oc.peso_vivo_medio_entrada_kg && (
                            <div>
                              <p className="text-xs text-gray-500">Peso médio entrada</p>
                              <p className="text-sm font-medium text-gray-800">{Number(oc.peso_vivo_medio_entrada_kg).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg</p>
                            </div>
                          )}
                          {oc.data_hora_entrada && (
                            <div>
                              <p className="text-xs text-gray-500">Data de entrada</p>
                              <p className="text-sm font-medium text-gray-800">{new Date(oc.data_hora_entrada).toLocaleDateString('pt-BR')}</p>
                            </div>
                          )}
                        </div>
                        {oc.desvio_percentual_atual != null && (
                          <p className={`text-xs ${oc.meta_excedida ? 'text-red-600' : 'text-green-600'}`}>
                            Desvio atual: {oc.desvio_percentual_atual > 0 ? '+' : ''}{Number(oc.desvio_percentual_atual).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl p-4 bg-gray-50 border border-gray-200">
                    <p className="text-sm text-gray-500">Nenhum lote ocupando este módulo no momento.</p>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Salvando...' : editingModulo ? 'Atualizar' : 'Salvar'}
              </Button>
              <Button type="button" variant="secondary" onClick={handleCancel}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : !showForm && filteredModulos.length === 0 ? (
        <Card>
          <p className="text-center text-gray-500">
            {searchTerm ? 'Nenhum módulo encontrado' : 'Nenhum módulo cadastrado'}
          </p>
        </Card>
      ) : !showForm ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredModulos.map((modulo) => (
            <Card key={modulo.id} className={`hover:shadow-lg transition-shadow flex flex-col ${
                !modulo.ativo ? 'opacity-60' : ''
              } ${
                ocupacaoPorModulo[modulo.id]?.some((oc: any) => oc.meta_excedida)
                  ? 'border-2 border-red-400'
                  : ''
              }`}>
              <div className="flex flex-col flex-grow space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-lg">{modulo.nome}</h3>
                    <p className="text-sm text-gray-600">
                      Área Útil Total: {modulo.area_util_total_ha?.toFixed(2) || 0} ha
                    </p>
                    {modulo.setores?.nome && (
                      <p className="text-sm text-gray-600">Setor: {modulo.setores.nome}</p>
                    )}
                    {modulo.sistema_producao && (
                      <p className="text-sm text-gray-600">Sistema: {modulo.sistema_producao}</p>
                    )}
                    {modulo.responsavel && (
                      <p className="text-sm text-gray-600">Responsável: {modulo.responsavel}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {ocupacaoPorModulo[modulo.id]?.some((oc: any) => oc.meta_excedida) && (
                      <span className="px-2 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">
                        ⚠️ Meta excedida
                      </span>
                    )}
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${
                        modulo.ativo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {modulo.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                </div>
                {modulo.pastos && modulo.pastos.length > 0 && (
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Piquetes ({modulo.pastos.length}):</p>
                    <div className="flex flex-wrap gap-1">
                      {modulo.pastos.map((pasto) => (
                        <span
                          key={pasto.id}
                          className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-gray-100 text-gray-700"
                        >
                          {pasto.nome}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {ocupacaoPorModulo[modulo.id]?.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <p className="text-sm text-gray-600 font-medium mb-1">Lotes em ocupação:</p>
                    {ocupacaoPorModulo[modulo.id].map((oc: any) => (
                      <div key={oc.lote_id} className="mb-1">
                        <p className="text-sm text-gray-600">• <span className="font-medium">{oc.lote_nome}</span> — {oc.periodo_ocupacao_dias} dias</p>
                        {oc.meta_intervalo_ocupacao_dias && oc.meta_excedida && (
                          <p className="text-sm text-red-600 ml-3">⚠️ Meta de {oc.meta_intervalo_ocupacao_dias}d excedida em {oc.dias_acima_meta} dias</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-auto pt-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleEdit(modulo)}
                  className="flex-1"
                >
                  Editar
                </Button>
                {modulo.ativo ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleDeactivateClick(modulo)}
                    className="text-red-600 hover:text-red-700"
                  >
                    Desativar
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleToggleActive(modulo)}
                  >
                    Ativar
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    setModuloToDelete(modulo)
                    setShowDeleteModal(true)
                  }}
                  className="text-red-600 hover:text-red-700"
                >
                  Excluir
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      <ConfirmModal
        isOpen={showDeactivateModal}
        onClose={() => {
          setShowDeactivateModal(false)
          setModuloToDeactivate(null)
        }}
        onConfirm={handleDeactivateConfirm}
        title="Desativar Módulo"
        message={`Tem certeza que deseja desativar o módulo "${moduloToDeactivate?.nome}"?`}
        confirmText="Desativar"
        cancelText="Cancelar"
        variant="danger"
      />

      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false)
          setModuloToDelete(null)
        }}
        onConfirm={handleDelete}
        title="Excluir Módulo"
        message={`Tem certeza que deseja excluir o módulo "${moduloToDelete?.nome}"?`}
      />

    </div>
  )
}
