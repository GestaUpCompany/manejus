import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../services/supabaseClient'
import { Button, Input, NumericInput, ConfirmModal, Modal } from '../ui'

interface PlanoNutricional {
  id: string
  lote_id: string | null
  lote_categoria_id: string | null
  fazenda_id: string
  nome: string
  formulacao_id: string
  periodo_dias: number
  peso_meta_kg: number
  ordem: number
  ativo: boolean
  data_inicio: string | null
  data_fim: string | null
}

interface Personalizacao {
  id: string
  plano_id: string
  lote_categoria_id: string
  periodo_dias: number | null
  peso_meta_kg: number | null
  peso_inicio_kg_cab: number | null
  ativo: boolean
}

interface LoteCategoriaInfo {
  id: string
  categoria: string
  gmd: string | null
  peso_vivo_atual_kg_cab: number | null
  peso_vivo_meta_kg_cab: number | null
  periodo: number | null
  sexo: string | null
  ativo: boolean
}

interface Formulacao {
  id: string
  nome: string
  tipo?: string | null
  gmd?: number | null
  consumo_ms_percent_pv?: number | null
}

interface FormulacaoCategoriaGmd {
  formulacao_id: string
  categoria: string
  gmd: number
}

interface HistoricoPlano {
  id: string
  nome: string
  formulacao_nome: string | null
  data_inicio: string | null
  data_fim: string | null
  duracao_dias: number
  ganho_medio_kg: number | null
  gmd_realizado_medio: number | null
  motivo_migracao: string | null
}

interface PlanoNutricionalLoteModalProps {
  isOpen: boolean
  onClose: () => void
  loteId: string
  loteNome?: string
  loteDestino?: string | null
  fazendaId?: string
  formulacaoLoteId?: string | null
  onPlanChanged?: () => void
}


export function PlanoNutricionalLoteModal({
  isOpen,
  onClose,
  loteId,
  loteNome,
  loteDestino,
  fazendaId: fazendaIdProp,
  formulacaoLoteId,
  onPlanChanged,
}: PlanoNutricionalLoteModalProps) {
  const [planos, setPlanos] = useState<PlanoNutricional[]>([])
  const [categorias, setCategorias] = useState<LoteCategoriaInfo[]>([])
  const [personalizacoes, setPersonalizacoes] = useState<Personalizacao[]>([])
  const [formulacoes, setFormulacoes] = useState<Formulacao[]>([])
  const [formulacaoCategoriasGmd, setFormulacaoCategoriasGmd] = useState<FormulacaoCategoriaGmd[]>([])
  const [loading, setLoading] = useState(false)
  const [fazendaId, setFazendaId] = useState<string | undefined>(fazendaIdProp)
  const [activeTab, setActiveTab] = useState<'planos' | 'categorias'>('planos')

  const [editingPlano, setEditingPlano] = useState<PlanoNutricional | null>(null)
  const [formData, setFormData] = useState({
    nome: '',
    formulacao_id: '',
    periodo_dias: '',
    peso_meta_kg: '',
    tipo_entrada_periodo: 'periodo' as 'periodo' | 'data_final',
    data_final: '',
  })

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void
    variant: 'danger' | 'warning' | 'info'
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {}, variant: 'warning' })

  const [message, setMessage] = useState<string | null>(null)
  const [showEncerrados, setShowEncerrados] = useState(false)
  const [showHistorico, setShowHistorico] = useState(false)
  const [historicoPlanos, setHistoricoPlanos] = useState<HistoricoPlano[]>([])
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [formVisible, setFormVisible] = useState(false)
  const [formScrollTrigger, setFormScrollTrigger] = useState(0)
  const formRef = useRef<HTMLDivElement>(null)
  const [formMode, setFormMode] = useState<'closed' | 'create' | 'edit'>('closed')

  // Modal de início retroativo
  const [retroativoModal, setRetroativoModal] = useState<{
    isOpen: boolean
    plano: PlanoNutricional | null
    preview: { categoria: string; dataPesagem: string | null; pesoEntrada: number | null; gmd: number | null; dias: number; pesoProjetado: number | null; semDataPesagem: boolean; semPesoEntrada: boolean }[]
    loading: boolean
    submitting: boolean
    erro: string | null
  }>({ isOpen: false, plano: null, preview: [], loading: false, submitting: false, erro: null })

  useEffect(() => {
    if (!isOpen || !loteId) return
    loadData()
  }, [isOpen, loteId])

  const isFormOpen = formMode !== 'closed'
  useEffect(() => {
    if (isFormOpen && !formVisible) {
      setFormVisible(true)
    } else if (!isFormOpen && formVisible) {
      setFormVisible(false)
    }
  }, [isFormOpen, formVisible])

  // Scroll toda vez que o trigger muda (clicar em editar ou adicionar)
  useEffect(() => {
    if (formScrollTrigger > 0) {
      setTimeout(() => {
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 50)
    }
  }, [formScrollTrigger])

  const loadData = async () => {
    if (!loteId) return
    setLoading(true)
    setMessage(null)
    try {
      let fId = fazendaId
      if (!fId) {
        const { data: loteData } = await supabase
          .from('lotes')
          .select('fazenda_id, formulacao_id')
          .eq('id', loteId)
          .single()
        fId = loteData?.fazenda_id
        setFazendaId(fId)
      }

      // Buscar planos do lote (por lote_id)
      const { data: planosData, error: planosError } = await supabase
        .from('planos_nutricionais')
        .select('*')
        .eq('lote_id', loteId)
        .order('ordem', { ascending: true })

      if (planosError) throw planosError
      setPlanos((planosData as PlanoNutricional[]) || [])

      // Buscar categorias ativas do lote
      const { data: catsData } = await supabase
        .from('lote_categorias')
        .select('id, categoria, gmd, peso_vivo_atual_kg_cab, peso_vivo_meta_kg_cab, periodo, sexo, ativo')
        .eq('lote_id', loteId)
        .eq('ativo', true)
        .order('categoria', { ascending: true })

      setCategorias((catsData as LoteCategoriaInfo[]) || [])

      // Buscar personalizações
      const planoIds = ((planosData as PlanoNutricional[]) || []).map((p) => p.id)
      if (planoIds.length > 0) {
        const { data: persData } = await supabase
          .from('plano_categoria_personalizacao')
          .select('*')
          .in('plano_id', planoIds)
        setPersonalizacoes((persData as Personalizacao[]) || [])
      } else {
        setPersonalizacoes([])
      }

      // Buscar formulações da fazenda
      if (fId) {
        const { data: form_data } = await supabase
          .from('formulacoes')
          .select('id, nome, tipo, gmd, consumo_ms_percent_pv, e_premix')
          .eq('fazenda_id', fId)
          .eq('ativo', true)
          .eq('e_premix', false)
          .order('nome', { ascending: true })
        setFormulacoes((form_data as Formulacao[]) || [])

        // Buscar GMDs por categoria de todas as formulações da fazenda
        const formIds = ((form_data as Formulacao[]) || []).map((f) => f.id)
        if (formIds.length > 0) {
          const { data: fcgData } = await supabase
            .from('formulacao_categorias_gmd')
            .select('formulacao_id, categoria, gmd')
            .in('formulacao_id', formIds)
          setFormulacaoCategoriasGmd((fcgData as FormulacaoCategoriaGmd[]) || [])
        }
      }

      // Buscar histórico de planos encerrados com snapshots agregados
      const planoIdsEncerrados = ((planosData as PlanoNutricional[]) || [])
        .filter((p) => p.data_fim)
        .map((p) => p.id)

      if (planoIdsEncerrados.length > 0) {
        const { data: snapData } = await supabase
          .from('planos_nutricionais_snapshots')
          .select('plano_nutricional_id, ganho_peso_total_kg_cab, gmd_realizado, motivo_migracao, metricas_derivadas')
          .in('plano_nutricional_id', planoIdsEncerrados)
          .eq('tipo_snapshot', 'saida')

        const snapByPlano: Record<string, { ganhos: number[]; pesos: number[]; gmds: number[]; motivo: string | null }> = {}
        ;(snapData || []).forEach((s: any) => {
          const pid = s.plano_nutricional_id
          if (!snapByPlano[pid]) snapByPlano[pid] = { ganhos: [], pesos: [], gmds: [], motivo: null }
          const quant = s.metricas_derivadas?.quant_atual != null ? Number(s.metricas_derivadas.quant_atual) : 0
          if (s.ganho_peso_total_kg_cab != null) {
            snapByPlano[pid].ganhos.push(Number(s.ganho_peso_total_kg_cab))
            snapByPlano[pid].pesos.push(quant)
          }
          if (s.gmd_realizado != null) snapByPlano[pid].gmds.push(Number(s.gmd_realizado))
          if (s.motivo_migracao) snapByPlano[pid].motivo = s.motivo_migracao
        })

        const formIdSet = new Set(((planosData as PlanoNutricional[]) || []).map((p) => p.formulacao_id))
        const { data: formHist } = await supabase
          .from('formulacoes')
          .select('id, nome')
          .in('id', Array.from(formIdSet))

        const formNomeMap: Record<string, string> = {}
        ;(formHist || []).forEach((f: any) => { formNomeMap[f.id] = f.nome })

        const historico: HistoricoPlano[] = ((planosData as PlanoNutricional[]) || [])
          .filter((p) => p.data_fim)
          .map((p) => {
            const snaps = snapByPlano[p.id]
            // GMD: média simples entre categorias (já é por cabeça)
            const gmdMedio = snaps && snaps.gmds.length > 0
              ? snaps.gmds.reduce((a, b) => a + b, 0) / snaps.gmds.length
              : null
            // Ganho de peso: média ponderada por quant_atual de cada categoria
            const ganhoMedio = (() => {
              if (!snaps || snaps.ganhos.length === 0) return null
              const totalPesos = snaps.pesos.reduce((a, b) => a + b, 0)
              if (totalPesos === 0) {
                // Sem cabeças: média simples
                return snaps.ganhos.reduce((a, b) => a + b, 0) / snaps.ganhos.length
              }
              return snaps.ganhos.reduce((acc, g, i) => acc + g * snaps.pesos[i], 0) / totalPesos
            })()
            const duracao = p.data_inicio && p.data_fim
              ? Math.max(Math.ceil((new Date(p.data_fim + 'T00:00:00').getTime() - new Date(p.data_inicio + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24)), 0)
              : 0
            return {
              id: p.id,
              nome: p.nome,
              formulacao_nome: formNomeMap[p.formulacao_id] || null,
              data_inicio: p.data_inicio,
              data_fim: p.data_fim,
              duracao_dias: duracao,
              ganho_medio_kg: ganhoMedio,
              gmd_realizado_medio: gmdMedio,
              motivo_migracao: snaps?.motivo || null,
            }
          })
          .sort((a, b) => (b.data_fim || '').localeCompare(a.data_fim || ''))

        setHistoricoPlanos(historico)
      } else {
        setHistoricoPlanos([])
      }
    } catch (error) {
      console.error('Erro ao carregar dados do lote:', error)
    } finally {
      setLoading(false)
    }
  }

  const planoVigente = planos.find((p) => p.ativo && !p.data_fim)
  const planosFila = planos.filter((p) => !p.ativo && !p.data_fim).sort((a, b) => a.ordem - b.ordem)
  const planosEncerrados = planos.filter((p) => p.data_fim).sort((a, b) => a.ordem - b.ordem)
  const planosNaoEncerrados = [...planos].filter((p) => !p.data_fim).sort((a, b) => a.ordem - b.ordem)
  const ultimoPlano = planosNaoEncerrados[planosNaoEncerrados.length - 1]
  const isUltimoPlano = (planoId: string) => ultimoPlano?.id === planoId
  void isUltimoPlano

  const handleFormulacaoChange = (formulacaoId: string) => {
    const formulacao = formulacoes.find((f) => f.id === formulacaoId)
    setFormData((prev) => ({
      ...prev,
      formulacao_id: formulacaoId,
      nome: prev.nome || formulacao?.nome || '',
    }))
  }

  const resetForm = () => {
    setEditingPlano(null)
    setFormMode('closed')
    setFormData({
      nome: '',
      formulacao_id: '',
      periodo_dias: '',
      peso_meta_kg: '',
      tipo_entrada_periodo: 'periodo',
      data_final: '',
    })
    setMessage(null)
  }

  const handleEdit = (plano: PlanoNutricional) => {
    setEditingPlano(plano)
    setFormMode('edit')
    setFormScrollTrigger((n) => n + 1)
    setFormData({
      nome: plano.nome,
      formulacao_id: plano.formulacao_id,
      periodo_dias: String(plano.periodo_dias),
      peso_meta_kg: String(plano.peso_meta_kg),
      tipo_entrada_periodo: 'periodo',
      data_final: '',
    })
  }

  const handleAddPlano = () => {
    setEditingPlano(null)
    setFormMode('create')
    setFormScrollTrigger((n) => n + 1)
    setFormData({
      nome: '',
      formulacao_id: formulacaoLoteId || '',
      periodo_dias: '',
      peso_meta_kg: '',
      tipo_entrada_periodo: 'periodo',
      data_final: '',
    })
    if (formulacaoLoteId) {
      const f = formulacoes.find((f) => f.id === formulacaoLoteId)
      setFormData((prev) => ({ ...prev, nome: f?.nome || '' }))
    }
  }

  const validateForm = () => {
    if (!formData.nome.trim()) return 'Nome do plano é obrigatório'
    if (!formData.formulacao_id) return 'Formulação é obrigatória'
    if (formData.tipo_entrada_periodo === 'periodo') {
      if (!formData.periodo_dias || Number(formData.periodo_dias) <= 0) return 'Período deve ser maior que zero'
    } else {
      if (!formData.data_final) return 'Data final é obrigatória'
    }
    if (!formData.peso_meta_kg || Number(formData.peso_meta_kg) <= 0) return 'Peso meta deve ser maior que zero'
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const error = validateForm()
    if (error) { setMessage(error); return }
    if (!fazendaId) { setMessage('Fazenda não identificada'); return }

    let periodo: number
    if (formData.tipo_entrada_periodo === 'periodo') {
      periodo = parseInt(formData.periodo_dias, 10)
    } else {
      const dataFinal = new Date(formData.data_final + 'T00:00:00')
      const hoje = new Date()
      hoje.setHours(0, 0, 0, 0)
      periodo = Math.ceil((dataFinal.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
    }
    const pesoMeta = parseFloat(formData.peso_meta_kg.replace(',', '.'))
    const isVigente = !!editingPlano?.ativo

    const data: Record<string, any> = {
      lote_id: loteId,
      fazenda_id: fazendaId,
      nome: isVigente ? editingPlano!.nome : formData.nome.trim(),
      formulacao_id: isVigente ? editingPlano!.formulacao_id : formData.formulacao_id,
      periodo_dias: periodo,
      peso_meta_kg: pesoMeta,
    }

    try {
      if (editingPlano) {
        const { error } = await supabase.from('planos_nutricionais').update(data).eq('id', editingPlano.id)
        if (error) throw error
      } else {
        const maxOrdem = planos.length > 0 ? Math.max(...planos.map((p) => p.ordem)) : -1
        const { error } = await supabase.from('planos_nutricionais').insert({ ...data, ordem: maxOrdem + 1, ativo: false, data_inicio: null })
        if (error) throw error
      }
      resetForm()
      await loadData()
      onPlanChanged?.()
    } catch (error: any) {
      setMessage(error.message || 'Erro ao salvar plano')
    }
  }

  const handleDelete = async (plano: PlanoNutricional) => {
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Plano',
      message: `Excluir o plano "${plano.nome}" da fila do lote?`,
      variant: 'danger',
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('planos_nutricionais').delete().eq('id', plano.id)
          if (error) throw error
          await loadData()
          onPlanChanged?.()
        } catch (error) { console.error('Erro ao excluir:', error) }
      },
    })
  }

  const handleIniciarPlano = async (plano: PlanoNutricional) => {
    // Validar que categorias ativas afetadas têm peso vivo atual > 0
    try {
      const { data: catsData, error: catsError } = await supabase
        .from('lote_categorias')
        .select('id, categoria, peso_vivo_atual_kg_cab')
        .eq('lote_id', loteId)
        .eq('ativo', true)
        .is('data_fim', null)

      if (catsError) throw catsError

      const catsAfetadas = (catsData || []).filter(c => {
        const cat = c.categoria.toLowerCase()
        return !cat.includes('bezerro ao p') && !cat.includes('bezerra ao p')
      })

      const semPeso = catsAfetadas.filter(c => c.peso_vivo_atual_kg_cab == null || c.peso_vivo_atual_kg_cab <= 0)

      if (semPeso.length > 0) {
        const lista = semPeso.map(c => c.categoria).join(', ')
        setMessage(`Erro: não é possível iniciar o plano. As seguintes categorias precisam de peso vivo atual preenchido: ${lista}.`)
        return
      }
    } catch (error: any) {
      setMessage(error.message || 'Erro ao validar categorias antes de iniciar plano')
      return
    }

    setConfirmModal({
      isOpen: true,
      title: 'Iniciar Plano do Lote',
      message: `Iniciar o plano "${plano.nome}" para o lote inteiro?\n\nTodas as categorias ativas receberão esta formulação.`,
      variant: 'warning',
      onConfirm: async () => {
        try {
          const { error } = await supabase.rpc('iniciar_plano_lote', {
            p_lote_id: loteId,
            p_plano_id: plano.id,
          })
          if (error) throw error
          await loadData()
          onPlanChanged?.()
          setMessage('Plano iniciado para o lote. Todas as categorias foram atualizadas.')
        } catch (error: any) {
          setMessage(error.message || 'Erro ao iniciar plano')
        }
      },
    })
  }

  const handleIniciarPlanoRetroativo = async (plano: PlanoNutricional) => {
    setRetroativoModal({ isOpen: true, plano, preview: [], loading: true, submitting: false, erro: null })

    try {
      // Buscar categorias ativas com data_pesagem e peso_entrada
      const { data: catsData, error: catsError } = await supabase
        .from('lote_categorias')
        .select('id, categoria, sexo, peso_entrada_kg_cab, data_pesagem')
        .eq('lote_id', loteId)
        .eq('ativo', true)
        .is('data_fim', null)
        .order('categoria', { ascending: true })

      if (catsError) throw catsError

      // Filtrar bezerro/bezerra ao pé
      const catsRetroativas = (catsData || []).filter(c => {
        const cat = c.categoria.toLowerCase()
        return !cat.includes('bezerro ao p') && !cat.includes('bezerra ao p')
      })

      // Buscar GMDs da formulação do plano
      const { data: gmdsData } = await supabase
        .from('formulacao_categorias_gmd')
        .select('categoria, gmd')
        .eq('formulacao_id', plano.formulacao_id)

      const gmdMap: Record<string, number> = {}
      ;(gmdsData || []).forEach((g: any) => {
        gmdMap[g.categoria.toLowerCase().trim()] = g.gmd
      })

      // Montar preview usando data_pesagem de cada categoria
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const preview = catsRetroativas.map(c => {
        const gmd = gmdMap[c.categoria.toLowerCase().trim()] ?? null
        const semDataPesagem = !c.data_pesagem
        const semPesoEntrada = c.peso_entrada_kg_cab == null
        let dias = 0
        let pesoProjetado: number | null = null
        if (c.data_pesagem && c.peso_entrada_kg_cab != null && gmd != null) {
          const dataPesagemDate = new Date(c.data_pesagem + 'T00:00:00')
          dias = Math.max(Math.ceil((today.getTime() - dataPesagemDate.getTime()) / (1000 * 60 * 60 * 24)), 0)
          pesoProjetado = c.peso_entrada_kg_cab + (gmd * dias)
        }
        return {
          categoria: c.categoria,
          dataPesagem: c.data_pesagem ?? null,
          pesoEntrada: c.peso_entrada_kg_cab ?? null,
          gmd,
          dias,
          pesoProjetado,
          semDataPesagem,
          semPesoEntrada,
        }
      })

      setRetroativoModal(prev => ({
        ...prev,
        loading: false,
        preview,
      }))
    } catch (error: any) {
      setRetroativoModal(prev => ({
        ...prev,
        loading: false,
        erro: error.message || 'Erro ao carregar dados para preview',
      }))
    }
  }

  const confirmarInicioRetroativo = async () => {
    const { plano } = retroativoModal
    if (!plano) return

    setRetroativoModal(prev => ({ ...prev, submitting: true, erro: null }))
    try {
      const { error } = await supabase.rpc('iniciar_plano_lote', {
        p_lote_id: loteId,
        p_plano_id: plano.id,
        p_retroativo: true,
      })
      if (error) throw error
      await loadData()
      onPlanChanged?.()
      setMessage(`Plano "${plano.nome}" iniciado retroativamente. Categorias com data de pesagem tiveram o peso projetado; categorias sem dados começam a evoluir a partir de hoje.`)
      setRetroativoModal({ isOpen: false, plano: null, preview: [], loading: false, submitting: false, erro: null })
    } catch (error: any) {
      setRetroativoModal(prev => ({ ...prev, submitting: false, erro: error.message || 'Erro ao iniciar plano retroativo' }))
    }
  }

  const handleEncerrarPlano = () => {
    if (!planoVigente) return
    setConfirmModal({
      isOpen: true,
      title: 'Encerrar Plano do Lote',
      message: `Encerrar o plano "${planoVigente.nome}" para o lote inteiro?\n\nTodas as categorias terão a formulação limpa. Se houver próximo plano na fila, a formulação do lote avançará automaticamente.`,
      variant: 'warning',
      onConfirm: async () => {
        try {
          const { error } = await supabase.rpc('encerrar_plano_lote', { p_lote_id: loteId })
          if (error) throw error
          await loadData()
          onPlanChanged?.()
          setMessage('Plano encerrado para o lote. A formulação vigente avançou para o próximo plano da fila, se houver.')
        } catch (error: any) {
          setMessage(error.message || 'Erro ao encerrar plano')
        }
      },
    })
  }

  const handleMigrarPara = (planoDestino: PlanoNutricional) => {
    if (!planoVigente) return
    setConfirmModal({
      isOpen: true,
      title: 'Migrar Plano do Lote',
      message: `Migrar do plano "${planoVigente.nome}" para "${planoDestino.nome}"?\n\nEsta migração afeta todas as categorias do lote.`,
      variant: 'warning',
      onConfirm: async () => {
        try {
          const { error } = await supabase.rpc('migrar_plano_lote', {
            p_lote_id: loteId,
            p_plano_destino_id: planoDestino.id,
          })
          if (error) throw error
          await loadData()
          onPlanChanged?.()
          setMessage('Plano migrado para o lote.')
        } catch (error: any) {
          setMessage(error.message || 'Erro ao migrar plano')
        }
      },
    })
  }

  const handleReorder = async (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return
    const sorted = [...planos].sort((a, b) => a.ordem - b.ordem)
    const [moved] = sorted.splice(fromIndex, 1)
    sorted.splice(toIndex, 0, moved)
    const reordered = sorted.map((p, i) => ({ ...p, ordem: i }))
    setPlanos(reordered)
    try {
      await Promise.all(reordered.map((p) => supabase.from('planos_nutricionais').update({ ordem: p.ordem }).eq('id', p.id)))
      onPlanChanged?.()
    } catch (error) { console.error('Erro ao reordenar:', error); await loadData() }
  }

  const handleDragStart = (index: number) => (e: React.DragEvent<HTMLDivElement>) => {
    setDraggingIndex(index)
    e.dataTransfer.setData('text/plain', index.toString())
    e.dataTransfer.effectAllowed = 'move'
  }
  const handleDragOver = (index: number) => (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragOverIndex(index) }
  const handleDrop = (dropIndex: number) => (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const dragIndex = parseInt(e.dataTransfer.getData('text/plain'), 10)
    if (isNaN(dragIndex) || dragIndex === dropIndex) { setDragOverIndex(null); setDraggingIndex(null); return }
    handleReorder(dragIndex, dropIndex)
    setDragOverIndex(null); setDraggingIndex(null)
  }
  const handleDragEnd = () => { setDragOverIndex(null); setDraggingIndex(null) }

  const isBezerroAope = (cat: string) =>
    ['bezerro ao pé', 'bezerro ao pe', 'bezerra ao pé', 'bezerra ao pe'].includes(cat.toLowerCase())

  const getPersForCat = (catId: string) => {
    if (!planoVigente) return null
    return personalizacoes.find((p) => p.plano_id === planoVigente.id && p.lote_categoria_id === catId && p.ativo)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { resetForm(); onClose() }}
      title={`Gestão de Planos do Lote${loteNome ? ` — ${loteNome}` : ''}`}
      size="xl"
    >
      {loading ? (
        <div className="py-8 flex flex-col items-center gap-3 text-gray-500">
          <svg className="animate-spin h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-sm">Carregando...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {loteDestino === 'enfermaria' && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-900">
              <p className="font-semibold mb-1">Lote de Enfermaria — GMD reduzido em 50%</p>
              <p>
                Os GMDs exibidos abaixo já têm o desconto de 50% aplicado automaticamente.
                Bezerro ao pé e bezerra ao pé não são afetados.
              </p>
            </div>
          )}
          {/* Abas */}
          <div className="flex gap-1 border-b border-gray-200">
            <button
              type="button"
              onClick={() => setActiveTab('planos')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'planos' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Planos
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('categorias')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'categorias' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Categorias
            </button>
          </div>

          {/* ========== ABA: PLANOS ========== */}
          {activeTab === 'planos' && (
          <>
          {/* ========== SEÇÃO: FILA DE PLANOS DO LOTE (topo) ========== */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-800">Fila de Planos do Lote</h3>
                <p className="text-xs text-gray-500">A fila é compartilhada por todas as categorias. Arraste para reordenar.</p>
              </div>
              <Button size="sm" variant="secondary" onClick={handleAddPlano}>+ Adicionar Plano à Fila</Button>
            </div>

            {/* Plano vigente - destaque principal */}
            {planoVigente && (
              <div className="bg-gradient-to-br from-green-50 to-green-100/50 border-2 border-green-300 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-green-700 uppercase tracking-wider">Plano Vigente</p>
                    <h4 className="text-lg font-bold text-green-900 mt-0.5">{planoVigente.nome}</h4>
                  </div>
                  <span className="px-3 py-1 bg-green-600 text-white text-xs font-bold rounded-full">Ativo</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm bg-white/60 rounded-lg p-3">
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Formulação</p>
                    <p className="font-semibold text-gray-900">{formulacoes.find((f) => f.id === planoVigente.formulacao_id)?.nome || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Período</p>
                    <p className="font-semibold text-gray-900">{planoVigente.periodo_dias} dias</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">Peso Meta</p>
                    <p className="font-semibold text-gray-900">{Number(planoVigente.peso_meta_kg).toFixed(2).replace('.', ',')} kg</p>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="secondary" onClick={() => handleEdit(planoVigente)}>Editar</Button>
                  <Button size="sm" variant="danger" onClick={handleEncerrarPlano}>Encerrar Plano do Lote</Button>
                </div>
              </div>
            )}

            {/* Sem plano vigente */}
            {!planoVigente && planos.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm text-yellow-800 mb-2">Nenhum plano vigente. Inicie um plano para o lote.</p>
                <div className="flex flex-wrap gap-2">
                  {planosFila.map((p) => (
                    <div key={p.id} className="flex gap-2">
                      <Button size="sm" onClick={() => handleIniciarPlano(p)}>Iniciar "{p.nome}"</Button>
                      <Button size="sm" variant="secondary" onClick={() => handleIniciarPlanoRetroativo(p)}>Iniciar Retroativo "{p.nome}"</Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Lista de planos na fila */}
            {planosFila.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-gray-700">Sequência de Planos</p>
                  {planosEncerrados.length > 0 && (
                    <button type="button" onClick={() => setShowEncerrados(!showEncerrados)} className="text-xs text-gray-500 hover:text-gray-700 underline">
                      {showEncerrados ? 'Ocultar encerrados' : 'Mostrar encerrados'}
                    </button>
                  )}
                </div>
                {planosFila.map((plano, idx) => {
                  const canDrag = !plano.data_inicio
                  return (
                    <div
                      key={plano.id}
                      draggable={canDrag}
                      onDragStart={canDrag ? handleDragStart(idx) : undefined}
                      onDragOver={canDrag ? handleDragOver(idx) : undefined}
                      onDrop={canDrag ? handleDrop(idx) : undefined}
                      onDragEnd={handleDragEnd}
                      className={`flex items-center gap-2 border rounded-md py-2 px-3 transition-colors ${
                        dragOverIndex === idx ? 'border-primary bg-primary/5' : draggingIndex === idx ? 'border-gray-300 opacity-50' : 'border-gray-200'
                      } ${canDrag ? 'cursor-move' : ''}`}
                    >
                      {canDrag && <span className="text-gray-300 select-none flex-shrink-0 text-sm">⠿</span>}
                      <span className="text-xs font-bold text-gray-400 flex-shrink-0">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{plano.nome}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {formulacoes.find((f) => f.id === plano.formulacao_id)?.nome || '—'} • {plano.periodo_dias}d • {Number(plano.peso_meta_kg).toFixed(0)}kg
                        </p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <Button size="sm" variant="secondary" onClick={() => handleEdit(plano)}>Editar</Button>
                        <Button size="sm" variant="secondary" onClick={() => handleDelete(plano)} className="text-red-600 hover:text-red-700">Excluir</Button>
                        {planoVigente && <Button size="sm" onClick={() => handleMigrarPara(plano)}>Migrar</Button>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Planos encerrados */}
            {showEncerrados && planosEncerrados.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500">Planos Encerrados</p>
                {planosEncerrados.map((p) => (
                  <div key={p.id} className="flex items-center justify-between border border-gray-200 rounded-lg p-2 bg-gray-50">
                    <div>
                      <p className="text-sm text-gray-700">{p.nome} <span className="px-1.5 py-0.5 bg-gray-200 text-gray-600 text-xs rounded">Encerrado</span></p>
                      <p className="text-xs text-gray-500">{p.periodo_dias} dias • Meta: {Number(p.peso_meta_kg).toFixed(2).replace('.', ',')} kg{p.data_fim && ` • ${new Date(p.data_fim + 'T00:00:00').toLocaleDateString('pt-BR')}`}</p>
                    </div>
                    {!planoVigente && <Button size="sm" variant="secondary" onClick={() => handleIniciarPlano(p)}>Reativar</Button>}
                  </div>
                ))}
              </div>
            )}

            {/* Histórico de planos (vigentes e encerrados) */}
            {historicoPlanos.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowHistorico(!showHistorico)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <span className="text-sm font-medium text-gray-700">
                    Histórico de Planos ({historicoPlanos.length})
                  </span>
                  <span className="text-xs text-gray-500">{showHistorico ? '▲ Recolher' : '▼ Expandir'}</span>
                </button>
                {showHistorico && (
                  <div className="divide-y divide-gray-100">
                    {historicoPlanos.map((hp) => (
                      <div key={hp.id} className="px-3 py-2.5 bg-white">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-gray-800 truncate">{hp.nome}</p>
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full flex-shrink-0">
                            {hp.duracao_dias} dias
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                          <span>
                            Formulação: <span className="font-medium text-gray-700">{hp.formulacao_nome || '—'}</span>
                          </span>
                          {hp.data_inicio && hp.data_fim && (
                            <span>
                              {new Date(hp.data_inicio + 'T00:00:00').toLocaleDateString('pt-BR')}
                              {' → '}
                              {new Date(hp.data_fim + 'T00:00:00').toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                          {hp.ganho_medio_kg != null && (
                            <span className="text-green-700">
                              Ganho: <span className="font-semibold">{hp.ganho_medio_kg.toFixed(2).replace('.', ',')} kg/cab</span>
                            </span>
                          )}
                          {hp.gmd_realizado_medio != null && hp.gmd_realizado_medio > 0 && (
                            <span className="text-blue-700">
                              GMD realizado: <span className="font-semibold">{hp.gmd_realizado_medio.toFixed(3).replace('.', ',')} kg/dia</span>
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Nenhum plano */}
            {planos.length === 0 && (
              <div className="space-y-3">
                {formulacaoLoteId && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-xs text-blue-700 mb-0.5">Formulação salva no lote</p>
                    <p className="text-sm font-semibold text-blue-900">
                      {formulacoes.find((f) => f.id === formulacaoLoteId)?.nome || 'Formulação não encontrada'}
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                      Os GMDs por categoria já estão definidos, mas o peso só evolui após criar e iniciar um plano.
                    </p>
                  </div>
                )}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                  <p className="text-sm text-gray-600">Nenhum plano cadastrado para este lote.</p>
                  <Button size="sm" className="mt-2" onClick={handleAddPlano}>+ Criar Primeiro Plano</Button>
                </div>
              </div>
            )}
          </div>

          {/* ========== ABA: CATEGORIAS ========== */}
          </>
          )}
          {activeTab === 'categorias' && (
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-gray-800">Categorias do Lote</h3>
            <p className="text-xs text-gray-500">Personalize período e peso meta por categoria. O GMD vem da formulação vigente.</p>

            {categorias.filter((c) => !isBezerroAope(c.categoria)).map((cat) => {
              const pers = getPersForCat(cat.id)
              return (
                <CategoriaPersonalizacaoCard
                  key={cat.id}
                  categoria={cat}
                  personalizacao={pers ?? null}
                  planoVigenteId={planoVigente?.id}
                  planoPeriodoDias={planoVigente?.periodo_dias}
                  planoPesoMetaKg={planoVigente?.peso_meta_kg}
                  onSaved={async () => { await loadData(); onPlanChanged?.() }}
                />
              )
            })}

            {/* Bezerros ao pé: informativo */}
            {categorias.filter((c) => isBezerroAope(c.categoria)).map((cat) => (
              <div key={cat.id} className="bg-amber-50 border border-amber-300 rounded-lg p-3">
                <p className="text-sm font-medium text-amber-900 capitalize">{cat.categoria}</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Bezerros/bezerras ao pé usam GMD próprio. Não há plano nutricional.
                  {cat.gmd && ` • GMD: ${Number(cat.gmd).toFixed(3).replace('.', ',')} kg/cab/dia`}
                </p>
              </div>
            ))}

          {/* ========== ABA: CATEGORIAS (fim) ========== */}
          </div>
          )}

          {/* ========== FORMULÁRIO CRIAR/EDITAR PLANO (só na aba Planos) ========== */}
          {activeTab === 'planos' && isFormOpen ? (
            <div ref={formRef} className="border-t-2 border-gray-200 pt-4">
              {/* Indicador visual de que o form abriu */}
              <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg animate-fade-in">
                <svg className="w-4 h-4 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <p className="text-sm font-medium text-blue-800">
                  {editingPlano ? `Editando: ${editingPlano.nome}` : 'Preencha os dados do novo plano'}
                </p>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-base font-semibold text-gray-800">{editingPlano ? 'Editar Plano' : 'Novo Plano'}</h3>
                {editingPlano?.ativo && <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs font-medium rounded">Vigente</span>}
              </div>
              {editingPlano?.ativo && (
                <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                  Editando plano vigente. Apenas duração e peso meta podem ser alterados.
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Nome do Plano *</label>
                    <Input type="text" value={formData.nome} onChange={(e) => { if (!editingPlano?.ativo) setFormData({ ...formData, nome: e.target.value }) }} placeholder="Ex: Engorda Inicial" required disabled={!!editingPlano?.ativo}
                      className={`text-sm ${editingPlano?.ativo ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Formulação *</label>
                    <select value={formData.formulacao_id} onChange={(e) => { if (!editingPlano?.ativo) handleFormulacaoChange(e.target.value) }} required disabled={!!editingPlano?.ativo}
                      className={`w-full px-3 py-2 border rounded-lg text-sm ${editingPlano?.ativo ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white'}`}>
                      <option value="">Selecione...</option>
                      {formulacoes.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-gray-700">Duração *</label>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => setFormData({ ...formData, tipo_entrada_periodo: 'periodo' })} className={`px-3 py-1.5 rounded border text-xs min-h-[44px] ${formData.tipo_entrada_periodo === 'periodo' ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700 border-gray-200'}`}>Dias</button>
                        <button type="button" onClick={() => setFormData({ ...formData, tipo_entrada_periodo: 'data_final' })} className={`px-3 py-1.5 rounded border text-xs min-h-[44px] ${formData.tipo_entrada_periodo === 'data_final' ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700 border-gray-200'}`}>Data final</button>
                      </div>
                    </div>
                    {formData.tipo_entrada_periodo === 'periodo' ? (
                      <NumericInput value={formData.periodo_dias} onChange={(v) => setFormData({ ...formData, periodo_dias: v })} decimalPlaces={0} placeholder="Ex: 90" />
                    ) : (
                      <Input type="date" value={formData.data_final} onChange={(e) => setFormData({ ...formData, data_final: e.target.value })} className="text-sm" />
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Peso Meta (kg) *</label>
                    <Input type="text" inputMode="decimal" value={formData.peso_meta_kg} onChange={(e) => setFormData({ ...formData, peso_meta_kg: e.target.value })} placeholder="Ex: 500,00" className="text-sm" />
                  </div>
                </div>
                {(() => {
                  const formId = editingPlano?.ativo ? editingPlano.formulacao_id : formData.formulacao_id
                  const gmds = formulacaoCategoriasGmd.filter((g) => g.formulacao_id === formId)
                  if (gmds.length === 0) return null
                  const gmdMedio = gmds.reduce((s, g) => s + g.gmd, 0) / gmds.length
                  return (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-700">GMDs por categoria (formulação selecionada)</p>
                        <p className="text-xs text-gray-500">Média: {gmdMedio.toFixed(3).replace('.', ',')} kg/cab/dia</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {gmds.map((g) => (
                          <span key={`${g.formulacao_id}-${g.categoria}`} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-gray-200 rounded text-xs">
                            <span className="capitalize text-gray-700">{g.categoria}</span>
                            <span className="font-medium text-gray-900">{Number(g.gmd).toFixed(3).replace('.', ',')}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })()}
                <div className="flex gap-2">
                  <Button type="submit" size="sm">{editingPlano ? 'Salvar' : 'Adicionar à Fila'}</Button>
                  <Button type="button" size="sm" variant="secondary" onClick={resetForm}>Cancelar</Button>
                </div>
              </form>
            </div>
          ) : null}

          {message && (
            <div className={`p-3 rounded-lg text-sm ${message.includes('Erro') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{message}</div>
          )}
        </div>
      )}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
        onConfirm={() => { confirmModal.onConfirm(); setConfirmModal((prev) => ({ ...prev, isOpen: false })) }}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Modal de início retroativo */}
      <Modal
        isOpen={retroativoModal.isOpen}
        onClose={() => { if (!retroativoModal.submitting) setRetroativoModal({ isOpen: false, plano: null, preview: [], loading: false, submitting: false, erro: null }) }}
        title="Iniciar Plano Retroativo"
      >
        {retroativoModal.loading ? (
          <p className="text-sm text-gray-500">Carregando dados das categorias...</p>
        ) : retroativoModal.plano ? (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900">
              <p className="font-semibold mb-1">O que será feito:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>O plano <strong>"{retroativoModal.plano.nome}"</strong> será iniciado retroativamente.</li>
                <li><strong>Categorias com data de pesagem e peso de entrada:</strong> o peso atual será projetado retroativamente (peso de entrada + GMD × dias desde a data de pesagem) e a evolução continua a partir da projeção.</li>
                <li><strong>Categorias sem data de pesagem ou peso de entrada:</strong> mantêm o peso atual e passam a evoluir a partir de hoje, sem retroatividade. Depois que você cadastrar esses dados, a evolução segue normalmente.</li>
                <li>Bezerro ao pé e bezerra ao pé não são afetados.</li>
              </ul>
            </div>

            {retroativoModal.preview.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Projeção por categoria:</p>
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr className="text-left text-gray-500">
                        <th className="py-2 px-2 font-medium">Categoria</th>
                        <th className="py-2 px-2 font-medium">Data Pesagem</th>
                        <th className="py-2 px-2 font-medium">Peso Entrada</th>
                        <th className="py-2 px-2 font-medium">GMD</th>
                        <th className="py-2 px-2 font-medium">Dias</th>
                        <th className="py-2 px-2 font-medium">Peso Projetado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {retroativoModal.preview.map((p, idx) => (
                        <tr key={idx} className="border-t border-gray-100">
                          <td className="py-2 px-2 font-medium text-gray-800 capitalize">{p.categoria}</td>
                          <td className="py-2 px-2 text-gray-600">
                            {p.semDataPesagem ? <span className="text-red-600">sem data</span> : new Date(p.dataPesagem! + 'T00:00:00').toLocaleDateString('pt-BR')}
                          </td>
                          <td className="py-2 px-2 text-gray-600">
                            {p.semPesoEntrada ? <span className="text-red-600">sem peso</span> : `${p.pesoEntrada?.toFixed(2).replace('.', ',')} kg`}
                          </td>
                          <td className="py-2 px-2 text-gray-600">
                            {p.gmd != null ? `${p.gmd.toFixed(3).replace('.', ',')} kg/dia` : <span className="text-amber-600">sem GMD</span>}
                          </td>
                          <td className="py-2 px-2 text-gray-600">{p.dias}</td>
                          <td className="py-2 px-2 font-semibold text-gray-900">
                            {p.pesoProjetado != null ? `${p.pesoProjetado.toFixed(2).replace('.', ',')} kg` : <span className="text-amber-600">não projeta</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {retroativoModal.preview.some(p => p.semDataPesagem || p.semPesoEntrada) && (
                  <p className="text-xs text-red-600 mt-2">
                    Categorias marcadas em vermelho não têm data de pesagem ou peso de entrada. Elas manterão o peso atual e evoluirão a partir de hoje, sem retroatividade. Cadastre esses dados no formulário do lote para que a evolução funcione com a retroatividade.
                  </p>
                )}
                {retroativoModal.preview.some(p => p.gmd == null) && (
                  <p className="text-xs text-amber-600 mt-1">
                    Categorias sem GMD na formulação não terão peso projetado. O peso atual será mantido e a evolução será interrompida até que a formulação contemple a categoria.
                  </p>
                )}
              </div>
            )}

            {retroativoModal.erro && (
              <div className="bg-red-50 border border-red-300 rounded-lg p-3 text-sm text-red-700">
                {retroativoModal.erro}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                onClick={() => setRetroativoModal({ isOpen: false, plano: null, preview: [], loading: false, submitting: false, erro: null })}
                disabled={retroativoModal.submitting}
              >
                Cancelar
              </Button>
              <Button
                onClick={confirmarInicioRetroativo}
                disabled={retroativoModal.submitting}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {retroativoModal.submitting ? 'Iniciando...' : 'Confirmar Início Retroativo'}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </Modal>
  )
}

// Componente auxiliar: card de personalização por categoria
function CategoriaPersonalizacaoCard({
  categoria,
  personalizacao,
  planoVigenteId,
  planoPeriodoDias,
  planoPesoMetaKg,
  onSaved,
}: {
  categoria: LoteCategoriaInfo
  personalizacao: Personalizacao | null
  planoVigenteId?: string
  planoPeriodoDias?: number | null
  planoPesoMetaKg?: number | null
  onSaved: () => Promise<void>
}) {
  // Fallback: se não há personalização, usa os valores do plano vigente
  const fallbackPeriodo = personalizacao?.periodo_dias?.toString() || planoPeriodoDias?.toString() || ''
  const fallbackPesoMeta = personalizacao?.peso_meta_kg?.toString().replace('.', ',') || (planoPesoMetaKg != null ? planoPesoMetaKg.toString().replace('.', ',') : '')
  const [periodo, setPeriodo] = useState<string>(fallbackPeriodo)
  const [pesoMeta, setPesoMeta] = useState<string>(fallbackPesoMeta)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setPeriodo(personalizacao?.periodo_dias?.toString() || planoPeriodoDias?.toString() || '')
    setPesoMeta(personalizacao?.peso_meta_kg?.toString().replace('.', ',') || (planoPesoMetaKg != null ? planoPesoMetaKg.toString().replace('.', ',') : ''))
  }, [personalizacao, planoPeriodoDias, planoPesoMetaKg])

  // Detectar se o usuário alterou os valores (comparação numérica normalizada)
  const normalizeNum = (s: string): number | null => {
    const n = parseFloat(s.replace(',', '.').trim())
    return isNaN(n) ? null : n
  }
  const isDirty =
    normalizeNum(periodo) !== normalizeNum(fallbackPeriodo) ||
    normalizeNum(pesoMeta) !== normalizeNum(fallbackPesoMeta)

  const handleSave = async () => {
    if (!planoVigenteId) return
    setSaving(true)
    try {
      const data: Record<string, any> = {
        plano_id: planoVigenteId,
        lote_categoria_id: categoria.id,
        ativo: true,
      }
      if (periodo) data.periodo_dias = parseInt(periodo)
      if (pesoMeta) data.peso_meta_kg = parseFloat(pesoMeta.replace(',', '.'))

      if (personalizacao?.id) {
        const { error } = await supabase.from('plano_categoria_personalizacao').update(data).eq('id', personalizacao.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('plano_categoria_personalizacao').upsert(data, { onConflict: 'plano_id,lote_categoria_id' })
        if (error) throw error
      }
      await onSaved()
    } catch (error: any) {
      console.error('Erro ao salvar personalização:', error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="font-medium text-gray-900 capitalize">{categoria.categoria}</p>
          <p className="text-xs text-gray-500">
            {categoria.gmd && `GMD: ${Number(categoria.gmd).toFixed(3).replace('.', ',')} kg/cab/dia`}
            {categoria.peso_vivo_atual_kg_cab != null && ` • Peso atual: ${Number(categoria.peso_vivo_atual_kg_cab).toFixed(2).replace('.', ',')} kg`}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Período (dias)</label>
          <Input type="number" value={periodo} onChange={(e) => setPeriodo(e.target.value)} placeholder="Ex: 90" className="text-sm" disabled={!planoVigenteId} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Peso Meta (kg)</label>
          <Input type="text" inputMode="decimal" value={pesoMeta} onChange={(e) => setPesoMeta(e.target.value)} placeholder="Ex: 500,00" className="text-sm" disabled={!planoVigenteId} />
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-1">
        {personalizacao
          ? 'Personalização ativa. Se o período desta categoria terminar antes das outras, ela para de evoluir peso e aguarda o fim das demais.'
          : 'Valores do plano vigente. Edite para personalizar esta categoria. Se o período terminar antes das outras, ela para de evoluir peso e aguarda o fim das demais.'}
      </p>
      {planoVigenteId && isDirty && (
        <Button size="sm" className="mt-2" onClick={handleSave} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar Personalização'}
        </Button>
      )}
    </div>
  )
}
