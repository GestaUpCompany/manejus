import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { Button, Card, Input, CardSkeleton, ConfirmModal, Modal, MultiSelect, useToast } from '../../components/ui'
import { AtividadeCard } from '../../components/atividades/AtividadeCard'
import { getFazendaIdForUser } from '../../utils/fazendaContext'
import { usePastos, useCurrais } from '../../hooks/useFazendaQueries'
import {
  getAtividades,
  createAtividade,
  updateAtividade,
  deleteAtividade,
  getPrioridades,
  updatePrioridade,
  getFuncionariosComSetor,
  getControleAcessoHabilitado,
  getAtividadeTemplates,
  createAtividadeTemplate,
  updateAtividadeTemplate,
  deleteAtividadeTemplate,
  Atividade,
  PrioridadeAtividade,
  FuncionarioComSetor,
  AtividadeTemplate,
} from '../../services/atividadesService'
// TemplateFormRow removido: unificado em FormRow com eh_padrao

const PRIORIDADE_CORES: Record<number, string> = {
  1: 'bg-red-500',
  2: 'bg-yellow-400',
  3: 'bg-green-500',
}

const LOCAL_TIPO_LABELS: Record<string, string> = {
  livre: 'Livre',
  pasto: 'Pasto',
  curral: 'Curral',
  local: 'Infraestrutura',
  maquina: 'Máquina/Equipamento',
}

interface LocalPickerProps {
  localTipo: string
  localId: string
  localNome: string
  pastos: { id: string; nome: string }[]
  currais: { id: string; nome: string }[]
  locais: { id: string; nome: string }[]
  maquinas: { id: string; nome: string }[]
  onChange: (patch: { local_tipo: string; local_id: string; local: string }) => void
  compact?: boolean
}

function LocalPicker({ localTipo, localId, localNome, pastos, currais, locais, maquinas, onChange, compact }: LocalPickerProps) {
  const opcoesPorTipo: Record<string, { id: string; nome: string }[]> = {
    pasto: pastos,
    curral: currais,
    local: locais,
    maquina: maquinas,
  }

  const handleTipoChange = (tipo: string) => {
    if (tipo === 'livre') {
      onChange({ local_tipo: 'livre', local_id: '', local: '' })
    } else {
      onChange({ local_tipo: tipo, local_id: '', local: '' })
    }
  }

  const handleEntidadeChange = (id: string) => {
    const lista = opcoesPorTipo[localTipo] || []
    const entidade = lista.find((e) => e.id === id)
    onChange({ local_tipo: localTipo, local_id: id, local: entidade?.nome || '' })
  }

  return (
    <div className={compact ? 'flex gap-1' : 'space-y-2'}>
      <select
        value={localTipo}
        onChange={(e) => handleTipoChange(e.target.value)}
        className="px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-accent min-h-[44px] bg-white"
      >
        {Object.entries(LOCAL_TIPO_LABELS).map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
      {localTipo === 'livre' ? (
        <input
          type="text"
          value={localNome}
          onChange={(e) => onChange({ local_tipo: 'livre', local_id: '', local: e.target.value })}
          placeholder="Digite o local..."
          className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-accent min-h-[44px]"
        />
      ) : (
        <select
          value={localId}
          onChange={(e) => handleEntidadeChange(e.target.value)}
          className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-accent min-h-[44px] bg-white"
        >
          <option value="">-</option>
          {(opcoesPorTipo[localTipo] || []).map((e) => (
            <option key={e.id} value={e.id}>{e.nome}</option>
          ))}
        </select>
      )}
    </div>
  )
}

// === Tipos do formulario de criacao em lote ===

interface FormRow {
  id: string
  titulo: string
  descricao: string
  local: string
  local_tipo: string
  local_id: string
  setor_id: string
  funcionario_ids: string[]
  tipo_data: 'periodo' | 'dia'
  data_inicio: string
  data_fim: string
  prioridade: number
  eh_padrao: boolean
  origem_template_id?: string
}

// Formulario de edicao (atividade unica, modal vertical)
interface EditFormData {
  titulo: string
  descricao: string
  local: string
  local_tipo: string
  local_id: string
  setor_id: string
  funcionario_ids: string[]
  tipo_data: 'periodo' | 'dia'
  data_inicio: string
  data_fim: string
  prioridade: number
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function emptyRow(): FormRow {
  return {
    id: uid(),
    titulo: '',
    descricao: '',
    local: '',
    local_tipo: 'livre',
    local_id: '',
    setor_id: '',
    funcionario_ids: [],
    tipo_data: 'dia',
    data_inicio: '',
    data_fim: '',
    prioridade: 3,
    eh_padrao: false,
  }
}

// === Helpers de data ===

function getHoje(): string {
  const hoje = new Date()
  const ano = hoje.getFullYear()
  const mes = String(hoje.getMonth() + 1).padStart(2, '0')
  const dia = String(hoje.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

// === Draft cache ===

const DRAFT_KEY = 'atividades_draft'

function saveDraft(rows: FormRow[]) {
  // So salva se houver pelo menos uma linha com algum conteudo
  const hasContent = rows.some((r) => r.titulo.trim() || r.data_inicio || r.funcionario_ids.length > 0)
  if (hasContent) {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(rows))
  } else {
    localStorage.removeItem(DRAFT_KEY)
  }
}

function loadDraft(): FormRow[] | null {
  const raw = localStorage.getItem(DRAFT_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as FormRow[]
    if (Array.isArray(parsed) && parsed.length > 0) return parsed
  } catch { /* ignore */ }
  return null
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY)
}

// === Componente ===

export function Atividades() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [fazendaId, setFazendaId] = useState<string | null>(null)
  const [atividades, setAtividades] = useState<Atividade[]>([])
  const [loading, setLoading] = useState(true)

  // Form de criacao em lote (planilha inline)
  const [showBulkForm, setShowBulkForm] = useState(false)
  const [rows, setRows] = useState<FormRow[]>([emptyRow()])
  const [submitting, setSubmitting] = useState(false)
  const [bulkErrors, setBulkErrors] = useState<string>('')
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  // Form de edicao (modal vertical, atividade unica)
  const [editingAtividade, setEditingAtividade] = useState<Atividade | null>(null)
  const [editForm, setEditForm] = useState<EditFormData | null>(null)
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [editErrors, setEditErrors] = useState<Record<string, string>>({})

  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [atividadeToDelete, setAtividadeToDelete] = useState<string | null>(null)

  const [controleAcessoHabilitado, setControleAcessoHabilitado] = useState(false)
  const [gateLoading, setGateLoading] = useState(true)

  const [setores, setSetores] = useState<{ id: string; nome: string }[]>([])
  const [funcionarios, setFuncionarios] = useState<FuncionarioComSetor[]>([])
  const [prioridades, setPrioridades] = useState<PrioridadeAtividade[]>([])
  const { data: pastosData = [] } = usePastos(fazendaId || undefined)
  const { data: curraisData = [] } = useCurrais(fazendaId || undefined)
  const pastos = useMemo(() => pastosData.filter(p => p.ativo), [pastosData])
  const currais = useMemo(() => curraisData.filter(c => c.ativo), [curraisData])
  const [locais, setLocais] = useState<{ id: string; nome: string }[]>([])
  const [maquinas, setMaquinas] = useState<{ id: string; nome: string }[]>([])

  const [filtroDataInicio, setFiltroDataInicio] = useState<string>('')
  const [filtroDataFim, setFiltroDataFim] = useState<string>('')
  const [filtroStatus, setFiltroStatus] = useState<string>('')
  const [filtroPrioridade, setFiltroPrioridade] = useState<number | ''>('')

  // Limite de exibição da lista de atividades
  const LIMITE_LISTA = 10
  const [expandirLista, setExpandirLista] = useState(false)

  // Presets de data rápida
  const aplicarPreset = (preset: 'esta_semana' | 'proximas_2' | 'este_mes' | 'proximos_30') => {
    const hoje = new Date()
    const diaSemana = hoje.getDay()
    const diasParaSegunda = ((1 - diaSemana + 7) % 7)
    const segundaAtual = new Date(hoje)
    segundaAtual.setDate(hoje.getDate() - diasParaSegunda)
    const fmt = (d: Date) => d.toISOString().split('T')[0]
    if (preset === 'esta_semana') {
      const fim = new Date(segundaAtual)
      fim.setDate(segundaAtual.getDate() + 6)
      setFiltroDataInicio(fmt(segundaAtual))
      setFiltroDataFim(fmt(fim))
    } else if (preset === 'proximas_2') {
      const fim = new Date(segundaAtual)
      fim.setDate(segundaAtual.getDate() + 13)
      setFiltroDataInicio(fmt(segundaAtual))
      setFiltroDataFim(fmt(fim))
    } else if (preset === 'este_mes') {
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
      const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)
      setFiltroDataInicio(fmt(inicio))
      setFiltroDataFim(fmt(fim))
    } else if (preset === 'proximos_30') {
      const fim = new Date(hoje)
      fim.setDate(hoje.getDate() + 30)
      setFiltroDataInicio(fmt(hoje))
      setFiltroDataFim(fmt(fim))
    }
  }

  const [showPrioridadesModal, setShowPrioridadesModal] = useState(false)
  const [prioridadeNomes, setPrioridadeNomes] = useState<Record<number, string>>({})
  const [salvandoPrioridades, setSalvandoPrioridades] = useState(false)

  // === Templates (Atividades Padrão) ===
  const [abaMode, setAbaMode] = useState<'atividades' | 'padroes'>('atividades')
  const [templates, setTemplates] = useState<AtividadeTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<AtividadeTemplate | null>(null)
  const [editTemplateForm, setEditTemplateForm] = useState<{ id: string; titulo: string; descricao: string; local: string; local_tipo: string; local_id: string; setor_id: string; funcionario_ids: string[]; prioridade: number } | null>(null)
  const [editTemplateSubmitting, setEditTemplateSubmitting] = useState(false)
  const [editTemplateErrors, setEditTemplateErrors] = useState<Record<string, string>>({})
  const [showTemplateDeleteModal, setShowTemplateDeleteModal] = useState(false)
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([])

  const loadFazenda = useCallback(async () => {
    if (!user) return
    const id = await getFazendaIdForUser(user.id)
    if (id) setFazendaId(id)
  }, [user])

  useEffect(() => { loadFazenda() }, [loadFazenda])

  useEffect(() => {
    if (!fazendaId) return
    loadControleAcesso()
    loadPrioridades()
    void (async () => {
      await Promise.all([
        loadSetores(),
        loadFuncionarios(),
        loadLocais(),
        loadMaquinas(),
        loadAtividades(),
        loadTemplates(),
      ])
    })()
  }, [fazendaId])

  const loadControleAcesso = async () => {
    if (!fazendaId) return
    const habilitado = await getControleAcessoHabilitado(fazendaId)
    setControleAcessoHabilitado(habilitado)
    setGateLoading(false)
  }

  const loadSetores = async () => {
    if (!fazendaId) return
    const { data, error } = await supabase
      .from('setores')
      .select('id, nome')
      .eq('fazenda_id', fazendaId)
      .eq('ativo', true)
      .order('nome', { ascending: true })
    if (error) { console.error('Erro ao buscar setores:', error) }
    else { setSetores(data || []) }
  }

  const loadFuncionarios = async () => {
    if (!fazendaId) return
    const data = await getFuncionariosComSetor(fazendaId)
    setFuncionarios(data.filter((f) => f.ativo))
  }


  const loadLocais = async () => {
    if (!fazendaId) return
    const { data, error } = await supabase
      .from('locais')
      .select('id, nome')
      .eq('fazenda_id', fazendaId)
      .eq('ativo', true)
      .is('deleted_at', null)
      .order('nome', { ascending: true })
    if (error) { console.error('Erro ao buscar locais:', error) }
    else { setLocais(data || []) }
  }

  const loadMaquinas = async () => {
    if (!fazendaId) return
    const { data, error } = await supabase
      .from('maquinas_veiculos')
      .select('id, nome')
      .eq('fazenda_id', fazendaId)
      .eq('ativo', true)
      .is('deleted_at', null)
      .order('nome', { ascending: true })
    if (error) { console.error('Erro ao buscar máquinas:', error) }
    else { setMaquinas(data || []) }
  }

  const loadPrioridades = async () => {
    if (!fazendaId) return
    const data = await getPrioridades(fazendaId)
    setPrioridades(data)
    const nomes: Record<number, string> = {}
    data.forEach((p) => { nomes[p.nivel] = p.nome })
    setPrioridadeNomes(nomes)
  }

  const loadAtividades = async () => {
    if (!fazendaId) return
    setLoading(true)
    const filtros: { dataInicio?: string; dataFim?: string; status?: string; prioridade?: number } = {}
    if (filtroDataInicio) filtros.dataInicio = filtroDataInicio
    if (filtroDataFim) filtros.dataFim = filtroDataFim
    if (filtroStatus) filtros.status = filtroStatus
    if (filtroPrioridade !== '') filtros.prioridade = filtroPrioridade
    setAtividades(await getAtividades(fazendaId, filtros))
    setLoading(false)
  }

  useEffect(() => { if (fazendaId) loadAtividades() }, [filtroDataInicio, filtroDataFim, filtroStatus, filtroPrioridade, fazendaId])

  const funcionarioOptionsAll = useMemo(() => {
    return funcionarios.map((f) => ({
      id: f.id,
      name: f.nome,
      category: f.setor_nomes.length > 0 ? f.setor_nomes.join(', ') : undefined,
    }))
  }, [funcionarios])

  // === Handlers do form em lote ===

  const handleOpenBulkForm = () => {
    const draft = loadDraft()
    if (draft && draft.length > 0) {
      setRows(draft)
    } else {
      setRows([{ ...emptyRow(), data_inicio: getHoje() }])
    }
    setShowBulkForm(true)
  }

  const handleCloseBulkForm = () => {
    saveDraft(rows)
    setShowBulkForm(false)
    setBulkErrors('')
  }

  const updateRow = (rowId: string, patch: Partial<FormRow>) => {
    if (bulkErrors) setBulkErrors('')
    setRows((prev) => {
      const updated = prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r))
      saveDraft(updated)
      return updated
    })
  }

  const handleAddRow = () => {
    setRows((prev) => {
      const updated = [...prev, { ...emptyRow(), data_inicio: getHoje() }]
      saveDraft(updated)
      return updated
    })
  }

  const handleRemoveRow = (rowId: string) => {
    setRows((prev) => {
      const updated = prev.filter((r) => r.id !== rowId)
      if (updated.length === 0) {
        const fresh = [{ ...emptyRow(), data_inicio: getHoje() }]
        saveDraft(fresh)
        return fresh
      }
      saveDraft(updated)
      return updated
    })
  }

  const duplicateRow = (rowId: string) => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.id === rowId)
      if (idx === -1) return prev
      const original = prev[idx]
      const copy: FormRow = {
        ...original,
        id: uid(),
        funcionario_ids: [...original.funcionario_ids],
        origem_template_id: undefined,
      }
      const next = [...prev]
      next.splice(idx + 1, 0, copy)
      saveDraft(next)
      return next
    })
  }

  const handleSalvarLote = async () => {
    if (!fazendaId) return

    // Separar linhas por tipo
    const linhasPadrao = rows.filter((r) => r.eh_padrao && r.titulo.trim())
    const linhasNormais = rows.filter((r) => !r.eh_padrao && r.titulo.trim())

    // Validar atividades normais: exigem data e responsáveis
    const normaisInvalidas = linhasNormais.filter((r) => !r.data_inicio || r.funcionario_ids.length === 0)
    if (linhasNormais.length === 0 && linhasPadrao.length === 0) {
      setBulkErrors('Preencha pelo menos uma linha com título.')
      return
    }
    if (normaisInvalidas.length > 0) {
      setBulkErrors('Há atividades normais (não padrão) com título mas sem data ou responsável. Corrija, remova ou ative o modo padrão.')
      return
    }

    const semDataFim = linhasNormais.filter((r) => r.tipo_data === 'periodo' && !r.data_fim)
    if (semDataFim.length > 0) {
      setBulkErrors('Há atividades em período sem data final. Defina a data fim ou mude para "Dia único".')
      return
    }

    setSubmitting(true)
    try {
      // Salvar atividades normais
      for (const row of linhasNormais) {
        const dataFim = row.tipo_data === 'dia' ? row.data_inicio : (row.data_fim || row.data_inicio)
        await createAtividade({
          fazenda_id: fazendaId,
          titulo: row.titulo.trim(),
          descricao: row.descricao.trim() || null,
          local: row.local.trim() || null,
          local_tipo: row.local_tipo || 'livre',
          local_id: row.local_id || null,
          setor_id: row.setor_id || null,
          data_inicio: row.data_inicio,
          data_fim: dataFim,
          prioridade: row.prioridade,
          status: 'pendente' as const,
          ativo: true,
          created_by: user?.id || null,
          funcionario_ids: row.funcionario_ids,
        })
      }
      // Salvar atividades padrão
      for (const row of linhasPadrao) {
        await createAtividadeTemplate({
          fazenda_id: fazendaId,
          titulo: row.titulo.trim(),
          descricao: row.descricao.trim() || null,
          local: row.local.trim() || null,
          local_tipo: row.local_tipo || 'livre',
          local_id: row.local_id || null,
          setor_id: row.setor_id || null,
          prioridade: row.prioridade,
          ativo: true,
          created_by: user?.id || null,
          funcionario_ids: row.funcionario_ids,
        })
      }
      clearDraft()
      setRows([{ ...emptyRow(), data_inicio: getHoje() }])
      setShowBulkForm(false)
      loadAtividades()
      loadTemplates()
      toast.success('Atividade(s) salva(s) com sucesso.')
    } catch (err) {
      console.error('Erro ao salvar:', err)
      toast.error('Erro ao salvar uma ou mais atividades.')
    } finally {
      setSubmitting(false)
    }
  }

  // === Handlers de edicao (modal) ===

  const handleEdit = (atividade: Atividade) => {
    const isSingleDay = atividade.data_inicio === atividade.data_fim
    setEditForm({
      titulo: atividade.titulo,
      descricao: atividade.descricao || '',
      local: atividade.local || '',
      local_tipo: atividade.local_tipo || 'livre',
      local_id: atividade.local_id || '',
      setor_id: atividade.setor_id || '',
      funcionario_ids: atividade.funcionarios?.map((af) => af.funcionario_id) || [],
      tipo_data: isSingleDay ? 'dia' : 'periodo',
      data_inicio: atividade.data_inicio,
      data_fim: atividade.data_fim,
      prioridade: atividade.prioridade,
    })
    setEditingAtividade(atividade)
  }

  // Deep link via ?atividade=<id> (vindo da busca global)
  useEffect(() => {
    const atividadeId = searchParams.get('atividade')
    if (!atividadeId || atividades.length === 0) return
    const atividade = atividades.find((a) => a.id === atividadeId)
    if (atividade) {
      handleEdit(atividade)
      searchParams.delete('atividade')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, atividades, setSearchParams])

  const handleSubmitEdit = async () => {
    if (!editingAtividade || !editForm) return
    const errs: Record<string, string> = {}
    if (!editForm.titulo.trim()) errs.titulo = 'Título é obrigatório.'
    if (!editForm.data_inicio) errs.data_inicio = 'Selecione a data.'
    if (editForm.funcionario_ids.length === 0) errs.funcionario_ids = 'Selecione pelo menos um responsável.'
    if (Object.keys(errs).length > 0) { setEditErrors(errs); return }

    setEditSubmitting(true)
    try {
      const dataFim = editForm.tipo_data === 'dia' ? editForm.data_inicio : (editForm.data_fim || editForm.data_inicio)
      await updateAtividade(editingAtividade.id, {
        titulo: editForm.titulo.trim(),
        descricao: editForm.descricao.trim() || null,
        local: editForm.local.trim() || null,
        local_tipo: editForm.local_tipo || 'livre',
        local_id: editForm.local_id || null,
        setor_id: editForm.setor_id || null,
        data_inicio: editForm.data_inicio,
        data_fim: dataFim,
        prioridade: editForm.prioridade,
        funcionario_ids: editForm.funcionario_ids,
      })
      setEditingAtividade(null)
      setEditForm(null)
      loadAtividades()
      toast.success('Atividade atualizada com sucesso.')
    } catch (err) {
      console.error('Erro ao editar:', err)
      toast.error('Erro ao salvar alterações.')
    } finally {
      setEditSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!atividadeToDelete) return
    await deleteAtividade(atividadeToDelete)
    setShowDeleteModal(false)
    setAtividadeToDelete(null)
    loadAtividades()
  }

  const handleSalvarPrioridades = async () => {
    if (!fazendaId) return
    setSalvandoPrioridades(true)
    for (const nivel of [1, 2, 3]) {
      const nome = prioridadeNomes[nivel]
      if (nome) await updatePrioridade(fazendaId, nivel, nome.trim())
    }
    setSalvandoPrioridades(false)
    setShowPrioridadesModal(false)
    loadPrioridades()
  }

  const funcionarioOptionsEdit = useMemo(() => {
    return funcionarios.map((f) => ({
      id: f.id,
      name: f.nome,
      category: f.setor_nomes.length > 0 ? f.setor_nomes.join(', ') : undefined,
    }))
  }, [funcionarios])

  // === Funcoes de Template (Atividades Padrão) ===

  const loadTemplates = async () => {
    if (!fazendaId) return
    setTemplatesLoading(true)
    const data = await getAtividadeTemplates(fazendaId)
    setTemplates(data)
    setTemplatesLoading(false)
  }

  const handleEditarTemplate = (t: AtividadeTemplate) => {
    setEditingTemplate(t)
    const fids = t.funcionario_ids || []
    const todosIds = funcionarios.map((f) => f.id)
    const ehTodos = fids.length > 0 && todosIds.length === fids.length && todosIds.every((id) => fids.includes(id))
    setEditTemplateForm({
      id: t.id,
      titulo: t.titulo,
      descricao: t.descricao || '',
      local: t.local || '',
      local_tipo: t.local_tipo || 'livre',
      local_id: t.local_id || '',
      setor_id: ehTodos ? 'todos' : (t.setor_id || ''),
      funcionario_ids: fids,
      prioridade: t.prioridade,
    })
  }

  const handleSubmitEditTemplate = async () => {
    if (!editingTemplate || !editTemplateForm || !fazendaId) return
    if (!editTemplateForm.titulo.trim()) { setEditTemplateErrors({ titulo: 'Nome da atividade é obrigatório.' }); return }

    setEditTemplateSubmitting(true)
    try {
      await updateAtividadeTemplate(editingTemplate.id, {
        titulo: editTemplateForm.titulo.trim(),
        local: editTemplateForm.local || null,
        local_tipo: editTemplateForm.local_tipo || 'livre',
        local_id: editTemplateForm.local_id || null,
        setor_id: editTemplateForm.setor_id === 'todos' ? null : (editTemplateForm.setor_id || null),
        funcionario_ids: editTemplateForm.funcionario_ids,
      })
      setEditingTemplate(null)
      setEditTemplateForm(null)
      loadTemplates()
      toast.success('Atividade padrão atualizada com sucesso.')
    } catch (err) {
      console.error('Erro ao editar atividade padrão:', err)
      toast.error('Erro ao salvar alterações.')
    } finally {
      setEditTemplateSubmitting(false)
    }
  }

  const handleExcluirTemplate = async () => {
    if (!templateToDelete) return
    await deleteAtividadeTemplate(templateToDelete)
    setShowTemplateDeleteModal(false)
    setTemplateToDelete(null)
    loadTemplates()
  }

  const handleUsarTemplatesSelecionados = () => {
    const selecionados = templates.filter((t) => selectedTemplateIds.includes(t.id))
    if (selecionados.length === 0) return
    const novasLinhas: FormRow[] = selecionados.map((t) => ({
      id: uid(),
      titulo: t.titulo,
      descricao: t.descricao || '',
      local: t.local || '',
      local_tipo: t.local_tipo || 'livre',
      local_id: t.local_id || '',
      setor_id: t.setor_id || '',
      funcionario_ids: t.funcionario_ids || [],
      tipo_data: 'dia' as const,
      data_inicio: getHoje(),
      data_fim: '',
      prioridade: t.prioridade,
      eh_padrao: false,
      origem_template_id: t.id,
    }))
    // Sobrescreve linhas em branco existentes com as novas, preservando linhas preenchidas
    const linhasPreenchidas = rows.filter((r) => r.titulo.trim() || r.funcionario_ids.length > 0)
    const todas = [...linhasPreenchidas, ...novasLinhas]
    setRows(todas)
    saveDraft(todas)
    setSelectedTemplateIds([])
    setShowTemplatePicker(false)
    setShowBulkForm(true)
  }

  const toggleTemplateSelection = (id: string) => {
    setSelectedTemplateIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const toggleAllTemplates = () => {
    if (selectedTemplateIds.length === templates.length) {
      setSelectedTemplateIds([])
    } else {
      setSelectedTemplateIds(templates.map((t) => t.id))
    }
  }

  // === Callbacks estáveis para AtividadeCard (evita re-render dos cards ao digitar no form em lote) ===
  const cbRef = useRef({} as { handleEdit: (a: Atividade) => void; openDeleteModal: (id: string) => void; navigate: (path: string) => void })
  cbRef.current = {
    handleEdit,
    openDeleteModal: (id: string) => { setAtividadeToDelete(id); setShowDeleteModal(true) },
    navigate,
  }
  const stableOnEdit = useCallback((a: Atividade) => cbRef.current.handleEdit(a), [])
  const stableOnNavigate = useCallback((path: string) => cbRef.current.navigate(path), [])
  const stableOnDelete = useCallback((id: string) => cbRef.current.openDeleteModal(id), [])

  if (gateLoading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-800">Atividades</h2>
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-full min-w-0 overflow-x-hidden">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Atividades</h2>
        <div className="flex gap-2">
          {abaMode === 'atividades' && (
            <>
              <Button variant="secondary" onClick={() => setShowPrioridadesModal(true)} className="h-10">
                Prioridades
              </Button>
              <Button onClick={handleOpenBulkForm} disabled={!controleAcessoHabilitado} className="h-10">
                Nova Atividade
              </Button>
            </>
          )}
          {abaMode === 'padroes' && (
            <div className="text-xs text-gray-500 max-w-md text-right">
              Para criar uma atividade padrão, abra "Nova Atividade" na aba Atividades e ative a estrela na linha desejada.
            </div>
          )}
        </div>
      </div>

      {/* Toggle Atividades / Atividades Padrão */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setAbaMode('atividades')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            abaMode === 'atividades' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Atividades
        </button>
        <button
          onClick={() => setAbaMode('padroes')}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            abaMode === 'padroes' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Atividades Padrão
        </button>
      </div>

      {/* === Seção Atividades Padrão === */}
      {abaMode === 'padroes' && (
        <div className="space-y-4">
          {!controleAcessoHabilitado && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg">
              <p className="text-sm font-medium">
                Ative o controle de acesso por funcionário em Cadastros Auxiliares para criar atividades padrão.
              </p>
            </div>
          )}

          {templatesLoading ? (
            <CardSkeleton />
          ) : templates.length === 0 ? (
            <Card className="bg-white p-8 border-0 shadow-sm text-center">
              <p className="text-gray-600 mb-4">Nenhuma atividade padrão cadastrada</p>
              <Button onClick={handleOpenBulkForm} disabled={!controleAcessoHabilitado}>
                Criar Primeira Atividade Padrão
              </Button>
            </Card>
          ) : (
            <>
              <p className="text-sm text-gray-500">
                {templates.length} atividade(s) padrão cadastrada(s). Ao criar uma atividade, você pode selecionar uma atividade padrão para preencher automaticamente.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {templates.map((t) => {
                  const fids = t.funcionario_ids || []
                  const todosIds = funcionarios.map((f) => f.id)
                  const ehTodos = fids.length > 0 && todosIds.length === fids.length && todosIds.every((id) => fids.includes(id))
                  const setorLabel = ehTodos ? 'Todos' : (t.setor_nome || (fids.length > 0 ? 'Personalizado' : '-'))
                  const nomesResp = fids.map((fid) => funcionarios.find((f) => f.id === fid)?.nome).filter(Boolean) as string[]
                  const metaParts: string[] = []
                  if (t.local) {
                    const tipoPrefix = t.local_tipo && t.local_tipo !== 'livre' ? `${LOCAL_TIPO_LABELS[t.local_tipo] || t.local_tipo}: ` : ''
                    metaParts.push(`${tipoPrefix}${t.local}`)
                  }
                  metaParts.push(`Setor: ${setorLabel}`)
                  const respLabel = nomesResp.length > 0
                    ? nomesResp.length <= 3
                      ? nomesResp.join(', ')
                      : `${nomesResp.slice(0, 3).join(', ')} +${nomesResp.length - 3}`
                    : 'Nenhum'
                  metaParts.push(`Resp: ${respLabel}`)
                  return (
                    <Card key={t.id} className="bg-white p-3 border-0 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-gray-800 truncate text-sm">{t.titulo}</h3>
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <button
                            onClick={() => handleEditarTemplate(t)}
                            className="text-gray-400 hover:text-primary p-1 min-w-[44px] min-h-[44px] flex items-center justify-center"
                            title="Editar"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button
                            onClick={() => {
                              setTemplateToDelete(t.id)
                              setShowTemplateDeleteModal(true)
                            }}
                            className="text-gray-400 hover:text-red-500 p-1 min-w-[44px] min-h-[44px] flex items-center justify-center"
                            title="Excluir"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 mt-1 truncate">
                        {metaParts.join(' · ')}
                      </div>
                    </Card>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* === Seção Atividades === */}
      {abaMode === 'atividades' && (
        <>
      {!controleAcessoHabilitado && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg">
          <p className="text-sm font-medium">
            Ative o controle de acesso por funcionário em Cadastros Auxiliares para criar atividades.
          </p>
        </div>
      )}

      {/* Formulario em lote (modal planilha) */}
      {showBulkForm && (
        <Modal
          isOpen={showBulkForm}
          onClose={handleCloseBulkForm}
          title="Nova Atividade"
          size="full"
        >
          {/* Aviso de draft */}
          {loadDraft() && (
            <div className="bg-blue-50 border border-blue-200 text-blue-700 px-3 py-2 rounded-lg text-xs mb-3">
              Você tem atividades preenchidas salvas como rascunho. Elas serão mantidas até você salvar ou limpar.
            </div>
          )}

          {/* Erros de validação */}
          {bulkErrors && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm mb-3">
              {bulkErrors}
            </div>
          )}

          {/* Botão Usar Atividade Padrão */}
          {templates.length > 0 && (
            <div className="mb-3">
              <Button
                variant="secondary"
                onClick={() => { setSelectedTemplateIds([]); setShowTemplatePicker(true) }}
                className="h-9 text-sm"
              >
                Usar Atividade Padrão
              </Button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1360px]">
              <thead>
                <tr className="border-b-2 border-gray-200 text-xs text-gray-500 uppercase tracking-wider">
                  <th className="text-left py-2 px-2 w-8">#</th>
                  <th className="text-left py-2 px-2 w-10">Padrão</th>
                  <th className="text-left py-2 px-2 min-w-[200px]">Atividade *</th>
                  <th className="text-left py-2 px-2 min-w-[160px]">Descrição</th>
                  <th className="text-left py-2 px-2 min-w-[140px]">Local</th>
                  <th className="text-left py-2 px-2 w-36">Setor</th>
                  <th className="text-left py-2 px-2 min-w-[220px]">Responsáveis *</th>
                  <th className="text-left py-2 px-2 w-28">Quando</th>
                  <th className="text-left py-2 px-2 w-44">Data *</th>
                  <th className="text-left py-2 px-2 w-40">Prioridade</th>
                  <th className="text-center py-2 px-2 w-20">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  return (
                    <tr key={row.id} className={`border-b border-gray-100 hover:bg-gray-50/50 align-top h-20 ${row.eh_padrao ? 'bg-amber-50/40' : ''}`}>
                      <td className="py-2 px-2 text-gray-400 text-xs">{idx + 1}</td>
                      <td className="py-2 px-2 text-center">
                        <button
                          onClick={() => updateRow(row.id, { eh_padrao: !row.eh_padrao })}
                          disabled={!!row.origem_template_id}
                          className={`p-1.5 rounded-md transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center ${row.eh_padrao ? 'text-amber-500 bg-amber-100' : 'text-gray-300 hover:text-amber-400 hover:bg-amber-50'} ${row.origem_template_id ? 'opacity-30 cursor-not-allowed' : ''}`}
                          title={row.origem_template_id ? 'Esta linha veio de uma atividade padrão existente. Use-a como atividade normal.' : (row.eh_padrao ? 'Atividade padrão (sem data). Clique para voltar a atividade normal' : 'Marcar como atividade padrão (sem data)')}
                        >
                          <svg className="w-4 h-4" fill={row.eh_padrao ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                          </svg>
                        </button>
                      </td>
                      <td className="py-2 px-2">
                        <textarea
                          value={row.titulo}
                          onChange={(e) => updateRow(row.id, { titulo: e.target.value })}
                          placeholder={row.eh_padrao ? "Vacinação do rebanho..." : "Consertar cerca..."}
                          rows={1}
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-accent min-h-[44px] resize-none"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <textarea
                          value={row.descricao}
                          onChange={(e) => updateRow(row.id, { descricao: e.target.value })}
                          placeholder="Opcional"
                          rows={1}
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-accent min-h-[44px] resize-none"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <LocalPicker
                          localTipo={row.local_tipo}
                          localId={row.local_id}
                          localNome={row.local}
                          pastos={pastos}
                          currais={currais}
                          locais={locais}
                          maquinas={maquinas}
                          onChange={(patch) => updateRow(row.id, patch)}
                          compact
                        />
                      </td>
                      <td className="py-2 px-2">
                        <select
                          value={row.setor_id}
                          onChange={(e) => {
                            const setorId = e.target.value
                            const membros = setorId
                              ? funcionarios.filter((f) => f.setor_ids.includes(setorId)).map((f) => f.id)
                              : []
                            updateRow(row.id, { setor_id: setorId, funcionario_ids: membros })
                          }}
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-accent min-h-[44px] bg-white"
                        >
                          <option value="">-</option>
                          {setores.map((s) => (
                            <option key={s.id} value={s.id}>{s.nome}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-2 align-top">
                        <MultiSelect
                          options={funcionarioOptionsAll}
                          value={row.funcionario_ids}
                          onChange={(ids) => {
                            const membrosSetor = row.setor_id
                              ? funcionarios.filter((f) => f.setor_ids.includes(row.setor_id)).map((f) => f.id)
                              : []
                            const aindaIgualSetor = membrosSetor.length > 0 &&
                              membrosSetor.length === ids.length &&
                              membrosSetor.every((id) => ids.includes(id))
                            updateRow(row.id, {
                              funcionario_ids: ids,
                              setor_id: aindaIgualSetor ? row.setor_id : '',
                            })
                          }}
                          placeholder="Selecionar..."
                          compact
                        />
                      </td>
                      <td className="py-2 px-2">
                        {row.eh_padrao ? (
                          <div className="flex items-center justify-center h-[44px] text-xs text-amber-600 font-medium">
                            Padrão
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                              <input
                                type="radio"
                                checked={row.tipo_data === 'dia'}
                                onChange={() => updateRow(row.id, { tipo_data: 'dia', data_fim: '' })}
                                className="w-3.5 h-3.5"
                              />
                              Dia único
                            </label>
                            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                              <input
                                type="radio"
                                checked={row.tipo_data === 'periodo'}
                                onChange={() => updateRow(row.id, { tipo_data: 'periodo' })}
                                className="w-3.5 h-3.5"
                              />
                              Período
                            </label>
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        {row.eh_padrao ? (
                          <div className="flex items-center justify-center h-[44px] text-xs text-gray-400">
                            —
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            <input
                              type="date"
                              value={row.data_inicio}
                              onChange={(e) => updateRow(row.id, { data_inicio: e.target.value })}
                              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-accent min-h-[44px]"
                            />
                            {row.tipo_data === 'periodo' && (
                              <input
                                type="date"
                                value={row.data_fim}
                                onChange={(e) => updateRow(row.id, { data_fim: e.target.value })}
                                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-accent min-h-[44px]"
                              />
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-2">
                        <select
                          value={row.prioridade}
                          onChange={(e) => updateRow(row.id, { prioridade: Number(e.target.value) })}
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-accent min-h-[44px] bg-white"
                        >
                          {prioridades.map((p) => (
                            <option key={p.nivel} value={p.nivel}>
                              {p.nome}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => duplicateRow(row.id)}
                            className="text-gray-400 hover:text-primary p-1 min-w-[44px] min-h-[44px] flex items-center justify-center"
                            title="Copiar linha"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleRemoveRow(row.id)}
                            className="text-gray-400 hover:text-red-500 p-1 min-w-[44px] min-h-[44px] flex items-center justify-center"
                            title="Remover linha"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <Button variant="secondary" onClick={handleAddRow} className="h-9 text-sm">
              + Adicionar Atividade
            </Button>
            <div className="flex gap-2">
              <Button onClick={handleSalvarLote} disabled={submitting} className="h-9">
                {submitting ? 'Salvando...' : 'Salvar Todas'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowClearConfirm(true)}
                className="h-9"
              >
                Limpar
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Filtros - toolbar unificada com intervalo de data + presets */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={filtroDataInicio}
            onChange={(e) => setFiltroDataInicio(e.target.value)}
            placeholder="Data inicial"
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent min-h-[40px] bg-white text-sm min-w-[140px]"
          />
          <span className="text-gray-400 text-sm">até</span>
          <input
            type="date"
            value={filtroDataFim}
            onChange={(e) => setFiltroDataFim(e.target.value)}
            placeholder="Data final"
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent min-h-[40px] bg-white text-sm min-w-[140px]"
          />
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent min-h-[40px] bg-white text-sm min-w-[140px]"
          >
            <option value="">Todos os status</option>
            <option value="pendente">Pendente</option>
            <option value="em_andamento">Em Andamento</option>
            <option value="concluido">Concluído</option>
          </select>
          <select
            value={filtroPrioridade}
            onChange={(e) => setFiltroPrioridade(e.target.value === '' ? '' : Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent min-h-[40px] bg-white text-sm min-w-[160px]"
          >
            <option value="">Todas as prioridades</option>
            {prioridades.map((p) => (
              <option key={p.nivel} value={p.nivel}>{p.nome}</option>
            ))}
          </select>
          {(filtroDataInicio || filtroDataFim || filtroStatus || filtroPrioridade !== '') && (
            <button
              onClick={() => { setFiltroDataInicio(''); setFiltroDataFim(''); setFiltroStatus(''); setFiltroPrioridade('') }}
              className="px-3 py-2 rounded-md text-xs font-medium text-red-600 hover:bg-red-50 transition-colors min-h-[40px]"
            >
              Limpar
            </button>
          )}
        </div>
        {/* Presets de data rápida */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-gray-400">Filtros rápidos:</span>
          {[
            { key: 'esta_semana' as const, label: 'Esta semana' },
            { key: 'proximas_2' as const, label: 'Próximas 2 semanas' },
            { key: 'este_mes' as const, label: 'Este mês' },
            { key: 'proximos_30' as const, label: 'Próximos 30 dias' },
          ].map((p) => (
            <button
              key={p.key}
              onClick={() => aplicarPreset(p.key)}
              className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de atividades */}
      {loading ? (
        <div className="space-y-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : atividades.length === 0 ? (
        <Card className="bg-white p-8 border-0 shadow-sm text-center">
          <p className="text-gray-600 mb-4">Nenhuma atividade encontrada</p>
          {controleAcessoHabilitado && (
            <Button onClick={handleOpenBulkForm}>Criar Primeira Atividade</Button>
          )}
        </Card>
      ) : (
        <>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {(expandirLista ? atividades : atividades.slice(0, LIMITE_LISTA)).map((atividade) => (
            <AtividadeCard
              key={atividade.id}
              atividade={atividade}
              onEdit={stableOnEdit}
              onNavigate={stableOnNavigate}
              onDelete={stableOnDelete}
            />
          ))}
        </div>
        {atividades.length > LIMITE_LISTA && (
          <div className="flex justify-center mt-4">
            <button
              onClick={() => setExpandirLista((v) => !v)}
              className="px-4 py-2 text-sm text-gray-600 font-medium rounded-md border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              {expandirLista
                ? 'Ver menos'
                : `Ver mais ${atividades.length - LIMITE_LISTA} de ${atividades.length}`}
            </button>
          </div>
        )}
        </>
      )}

      {/* Modal de edicao (atividade unica, layout vertical) */}
      {editingAtividade && editForm && (
        <Modal
          isOpen={!!editingAtividade}
          onClose={() => { setEditingAtividade(null); setEditForm(null); setEditErrors({}) }}
          title="Editar Atividade"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Atividade *</label>
              <Input
                type="text"
                value={editForm.titulo}
                onChange={(e) => { setEditForm({ ...editForm, titulo: e.target.value }); if (editErrors.titulo) setEditErrors((p) => ({ ...p, titulo: '' })) }}
                placeholder="Descrição da atividade"
                className={`focus:border-accent ${editErrors.titulo ? 'border-red-400' : 'border-gray-200'}`}
              />
              {editErrors.titulo && <p className="text-xs text-red-600 mt-1">{editErrors.titulo}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
              <textarea
                value={editForm.descricao}
                onChange={(e) => setEditForm({ ...editForm, descricao: e.target.value })}
                rows={3}
                placeholder="Detalhes adicionais (opcional)"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent min-h-[44px]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Local</label>
              <LocalPicker
                localTipo={editForm.local_tipo}
                localId={editForm.local_id}
                localNome={editForm.local}
                pastos={pastos}
                currais={currais}
                locais={locais}
                maquinas={maquinas}
                onChange={(patch) => setEditForm({ ...editForm, ...patch })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Setor</label>
              <select
                value={editForm.setor_id}
                onChange={(e) => {
                  const setorId = e.target.value
                  const membros = setorId
                    ? funcionarios.filter((f) => f.setor_ids.includes(setorId)).map((f) => f.id)
                    : []
                  setEditForm({ ...editForm, setor_id: setorId, funcionario_ids: membros })
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent min-h-[44px] bg-white"
              >
                <option value="">Selecione</option>
                {setores.map((s) => (
                  <option key={s.id} value={s.id}>{s.nome}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Responsáveis *</label>
              <MultiSelect
                options={funcionarioOptionsEdit}
                value={editForm.funcionario_ids}
                onChange={(ids) => {
                  if (editErrors.funcionario_ids) setEditErrors((p) => ({ ...p, funcionario_ids: '' }))
                  const membrosSetor = editForm.setor_id
                    ? funcionarios.filter((f) => f.setor_ids.includes(editForm.setor_id)).map((f) => f.id)
                    : []
                  const aindaIgualSetor = membrosSetor.length > 0 &&
                    membrosSetor.length === ids.length &&
                    membrosSetor.every((id) => ids.includes(id))
                  setEditForm({
                    ...editForm,
                    funcionario_ids: ids,
                    setor_id: aindaIgualSetor ? editForm.setor_id : '',
                  })
                }}
                placeholder="Selecione os responsáveis"
              />
              {editErrors.funcionario_ids && <p className="text-xs text-red-600 mt-1">{editErrors.funcionario_ids}</p>}
            </div>

            {/* Selecao dupla de data */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Quando *</label>
              <div className="flex gap-4 mb-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    checked={editForm.tipo_data === 'dia'}
                    onChange={() => setEditForm({ ...editForm, tipo_data: 'dia', data_fim: '' })}
                    className="w-4 h-4"
                  />
                  Dia único
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    checked={editForm.tipo_data === 'periodo'}
                    onChange={() => setEditForm({ ...editForm, tipo_data: 'periodo' })}
                    className="w-4 h-4"
                  />
                  Período (de x até)
                </label>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">
                    {editForm.tipo_data === 'dia' ? 'Data' : 'Data início'}
                  </label>
                  <Input
                    type="date"
                    value={editForm.data_inicio}
                    onChange={(e) => { setEditForm({ ...editForm, data_inicio: e.target.value }); if (editErrors.data_inicio) setEditErrors((p) => ({ ...p, data_inicio: '' })) }}
                    className={`focus:border-accent ${editErrors.data_inicio ? 'border-red-400' : 'border-gray-200'}`}
                  />
                  {editErrors.data_inicio && <p className="text-xs text-red-600 mt-1">{editErrors.data_inicio}</p>}
                </div>
                {editForm.tipo_data === 'periodo' && (
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 mb-1 block">Data fim</label>
                    <Input
                      type="date"
                      value={editForm.data_fim}
                      onChange={(e) => setEditForm({ ...editForm, data_fim: e.target.value })}
                      className="border-gray-200 focus:border-accent"
                    />
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Prioridade</label>
              <div className="flex gap-3">
                {[1, 2, 3].map((nivel) => (
                  <button
                    key={nivel}
                    type="button"
                    onClick={() => setEditForm({ ...editForm, prioridade: nivel })}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                      editForm.prioridade === nivel
                        ? 'border-primary bg-primary/5'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-3 h-3 rounded-full ${PRIORIDADE_CORES[nivel]}`} />
                    <span className="text-sm">{prioridadeNomes[nivel] || `Nível ${nivel}`}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t border-gray-100">
              <Button onClick={handleSubmitEdit} disabled={editSubmitting} className="flex-1">
                {editSubmitting ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => { setEditingAtividade(null); setEditForm(null) }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title="Excluir Atividade"
        message="Tem certeza que deseja excluir esta atividade? Esta ação não pode ser desfeita."
        confirmText="Excluir"
      />

      {showPrioridadesModal && (
        <Modal
          isOpen={showPrioridadesModal}
          onClose={() => setShowPrioridadesModal(false)}
          title="Editar Nomes das Prioridades"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Você pode personalizar os nomes das prioridades, mas não pode alterar as cores nem adicionar/remover níveis.
            </p>
            {[1, 2, 3].map((nivel) => (
              <div key={nivel} className="flex items-center gap-3">
                <div className={`w-4 h-4 rounded-full flex-shrink-0 ${PRIORIDADE_CORES[nivel]}`} />
                <Input
                  type="text"
                  value={prioridadeNomes[nivel] || ''}
                  onChange={(e) => setPrioridadeNomes({ ...prioridadeNomes, [nivel]: e.target.value })}
                  className="flex-1 border-gray-200 focus:border-accent"
                />
              </div>
            ))}
            <div className="flex gap-3 pt-4 border-t border-gray-100">
              <Button onClick={handleSalvarPrioridades} disabled={salvandoPrioridades} className="flex-1">
                {salvandoPrioridades ? 'Salvando...' : 'Salvar'}
              </Button>
              <Button variant="secondary" onClick={() => setShowPrioridadesModal(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </Modal>
      )}
        </>
      )}

      {/* === Modal: Editar Atividade Padrão === */}
      {editingTemplate && editTemplateForm && (
        <Modal
          isOpen={!!editingTemplate}
          onClose={() => { setEditingTemplate(null); setEditTemplateForm(null); setEditTemplateErrors({}) }}
          title="Editar Atividade Padrão"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Atividade *</label>
              <Input
                type="text"
                value={editTemplateForm.titulo}
                onChange={(e) => { setEditTemplateForm({ ...editTemplateForm, titulo: e.target.value }); if (editTemplateErrors.titulo) setEditTemplateErrors((p) => ({ ...p, titulo: '' })) }}
                placeholder="Ex: Vacinação do rebanho"
                className={`focus:border-accent ${editTemplateErrors.titulo ? 'border-red-400' : 'border-gray-200'}`}
                autoFocus
              />
              {editTemplateErrors.titulo && <p className="text-xs text-red-600 mt-1">{editTemplateErrors.titulo}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Local</label>
              <LocalPicker
                localTipo={editTemplateForm.local_tipo}
                localId={editTemplateForm.local_id}
                localNome={editTemplateForm.local}
                pastos={pastos}
                currais={currais}
                locais={locais}
                maquinas={maquinas}
                onChange={(patch) => setEditTemplateForm({ ...editTemplateForm, ...patch })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Setor</label>
              <select
                value={editTemplateForm.setor_id}
                onChange={(e) => {
                  const setorId = e.target.value
                  let membros: string[]
                  if (setorId === 'todos') {
                    membros = funcionarios.map((f) => f.id)
                  } else if (setorId) {
                    membros = funcionarios.filter((f) => f.setor_ids.includes(setorId)).map((f) => f.id)
                  } else {
                    membros = []
                  }
                  setEditTemplateForm({ ...editTemplateForm, setor_id: setorId, funcionario_ids: membros })
                }}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-accent min-h-[44px] bg-white"
              >
                <option value="">-</option>
                <option value="todos">Todos</option>
                {setores.map((s) => (
                  <option key={s.id} value={s.id}>{s.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Responsáveis</label>
              <MultiSelect
                options={funcionarioOptionsAll}
                value={editTemplateForm.funcionario_ids}
                onChange={(ids) => {
                  let novoSetor = editTemplateForm.setor_id
                  if (editTemplateForm.setor_id === 'todos') {
                    const todosIds = funcionarios.map((f) => f.id)
                    const aindaTodos = todosIds.length === ids.length && todosIds.every((id) => ids.includes(id))
                    if (!aindaTodos) novoSetor = ''
                  } else if (editTemplateForm.setor_id) {
                    const membrosSetor = funcionarios.filter((f) => f.setor_ids.includes(editTemplateForm.setor_id)).map((f) => f.id)
                    const aindaIgualSetor = membrosSetor.length > 0 &&
                      membrosSetor.length === ids.length &&
                      membrosSetor.every((id) => ids.includes(id))
                    if (!aindaIgualSetor) novoSetor = ''
                  }
                  setEditTemplateForm({ ...editTemplateForm, funcionario_ids: ids, setor_id: novoSetor })
                }}
                placeholder="Selecionar..."
              />
            </div>
            <div className="flex gap-3 pt-4 border-t border-gray-100">
              <Button onClick={handleSubmitEditTemplate} disabled={editTemplateSubmitting} className="flex-1">
                {editTemplateSubmitting ? 'Salvando...' : 'Salvar'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => { setEditingTemplate(null); setEditTemplateForm(null) }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* === Modal: Excluir Template === */}
      <ConfirmModal
        isOpen={showTemplateDeleteModal}
        onClose={() => setShowTemplateDeleteModal(false)}
        onConfirm={handleExcluirTemplate}
        title="Excluir Atividade Padrão"
        message="Tem certeza que deseja excluir esta atividade padrão? Esta ação não pode ser desfeita."
        confirmText="Excluir"
      />

      {/* === Modal: Selecionar Atividade Padrão (no form em lote) === */}
      {showTemplatePicker && (
        <Modal
          isOpen={showTemplatePicker}
          onClose={() => setShowTemplatePicker(false)}
          title="Usar Atividade Padrão"
        >
          {templates.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-gray-600 mb-4">Nenhuma atividade padrão cadastrada</p>
              <Button variant="secondary" onClick={() => setShowTemplatePicker(false)}>
                Fechar
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  Selecione uma ou mais atividades padrão para preencher novas linhas. Você poderá ajustar a data e outros campos depois.
                </p>
              </div>
              <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                <button
                  onClick={toggleAllTemplates}
                  className="text-sm text-primary hover:underline"
                >
                  {selectedTemplateIds.length === templates.length ? 'Desmarcar todas' : 'Selecionar todas'}
                </button>
                <span className="text-xs text-gray-400">
                  {selectedTemplateIds.length} de {templates.length} selecionada(s)
                </span>
              </div>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {templates.map((t) => {
                  const checked = selectedTemplateIds.includes(t.id)
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggleTemplateSelection(t.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        checked ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                          checked ? 'bg-primary border-primary' : 'border-gray-300 bg-white'
                        }`}>
                          {checked && (
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <span className="font-medium text-gray-800">{t.titulo}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
              <div className="flex gap-2 pt-3 border-t border-gray-100">
                <Button
                  onClick={handleUsarTemplatesSelecionados}
                  disabled={selectedTemplateIds.length === 0}
                  className="flex-1"
                >
                  Adicionar {selectedTemplateIds.length > 0 ? `(${selectedTemplateIds.length})` : ''}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => { setShowTemplatePicker(false); setSelectedTemplateIds([]) }}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}

      <ConfirmModal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={() => {
          clearDraft()
          setRows([{ ...emptyRow(), data_inicio: getHoje() }])
          setShowClearConfirm(false)
        }}
        title="Limpar todas as linhas?"
        message="O rascunho será descartado."
        confirmText="Limpar"
        variant="warning"
      />
    </div>
  )
}
