import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import {
  Button,
  Card,
  Input,
  Modal,
  ConfirmModal,
  MultiSelect,
  useToast,
} from '../../components/ui'
import {
  ChecklistRegra,
  ChecklistRegraTipo,
  getChecklistRegras,
  createChecklistRegra,
  updateChecklistRegra,
  deleteChecklistRegra,
} from '../../services/checklistRegrasService'
import { getRotinas, createRotina, updateRotina, deleteRotina } from '../../services/rotinasService'
import { CADERNETAS } from '../../utils/cadernetas'
import { Rotina, rotinaEstaAtivaHoje, getRotinasDoDia } from '../../utils/rotinas'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

const CHECKLIST_CADERNETAS = ['bebedouros', 'suplementacao', 'rodeio', 'pastagens']

const CADERNETAS_OPTIONS = CADERNETAS.filter((c) => CHECKLIST_CADERNETAS.includes(c.id)).map(
  (c) => ({ id: c.id, name: c.label })
)

const DIAS_DA_SEMANA = [
  { value: 0, label: 'Dom' },
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
]

interface RegraFormData {
  cadernetas: string[]
  tipo: ChecklistRegraTipo
  data_inicio: string
  data_fim: string
  ativo: boolean
}

interface RotinaFormData {
  funcionario_id: string
  cadernetas: string[]
  dias_semana: number[]
  horarios: Record<string, string>
  data_inicio: string
  data_fim: string
  ativo: boolean
}

const INITIAL_REGRA_FORM: RegraFormData = {
  cadernetas: [],
  tipo: 'periodo',
  data_inicio: '',
  data_fim: '',
  ativo: true,
}

const INITIAL_ROTINA_FORM: RotinaFormData = {
  funcionario_id: '',
  cadernetas: [],
  dias_semana: [1, 2, 3, 4, 5],
  horarios: {},
  data_inicio: '',
  data_fim: '',
  ativo: true,
}

export function Rotinas() {
  const { user } = useAuth()
  const toast = useToast()
  const [fazendaId, setFazendaId] = useState<string | null>(null)
  const [funcionarios, setFuncionarios] = useState<{ id: string; nome: string }[]>([])

  const [regras, setRegras] = useState<ChecklistRegra[]>([])
  const [rotinas, setRotinas] = useState<Rotina[]>([])
  const [loading, setLoading] = useState(true)

  const [regraModalOpen, setRegraModalOpen] = useState(false)
  const [editingRegraId, setEditingRegraId] = useState<string | null>(null)
  const [regraForm, setRegraForm] = useState<RegraFormData>(INITIAL_REGRA_FORM)
  const [regraErrors, setRegraErrors] = useState<Record<string, string>>({})
  const [savingRegra, setSavingRegra] = useState(false)

  const [rotinaModalOpen, setRotinaModalOpen] = useState(false)
  const [editingRotinaId, setEditingRotinaId] = useState<string | null>(null)
  const [rotinaForm, setRotinaForm] = useState<RotinaFormData>(INITIAL_ROTINA_FORM)
  const [rotinaErrors, setRotinaErrors] = useState<Record<string, string>>({})
  const [savingRotina, setSavingRotina] = useState(false)

  const [deleteRegraModal, setDeleteRegraModal] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  })
  const [deleteRotinaModal, setDeleteRotinaModal] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  })
  const [cadernetasModal, setCadernetasModal] = useState<{
    open: boolean
    funcionarioId: string | null
    funcionarioNome: string
    cadernetas: string[]
    payload: any
  }>({
    open: false,
    funcionarioId: null,
    funcionarioNome: '',
    cadernetas: [],
    payload: null,
  })
  const [habilitandoCadernetas, setHabilitandoCadernetas] = useState(false)

  useEffect(() => {
    loadFazendaId()
  }, [user])

  useEffect(() => {
    if (fazendaId) {
      loadFuncionarios()
      loadRegras()
      loadRotinas()
    }
  }, [fazendaId])

  const loadFazendaId = async () => {
    if (!user) return
    const fazendaId = await getFazendaIdForUser(user.id)
    if (fazendaId) setFazendaId(fazendaId)
  }

  const loadFuncionarios = async () => {
    if (!fazendaId) return
    const { data: funcionariosData } = await supabase
      .from('funcionarios')
      .select('id, nome')
      .eq('fazenda_id', fazendaId)
      .eq('ativo', true)
      .eq('acessa_app', true)
      .order('nome', { ascending: true })

    const lista = (funcionariosData || []).map((f) => ({
      id: f.id,
      nome: f.nome || f.id,
    }))
    setFuncionarios(lista)
  }

  const loadRegras = async () => {
    if (!fazendaId) return
    const data = await getChecklistRegras(fazendaId)
    setRegras(data)
  }

  const loadRotinas = async () => {
    if (!fazendaId) return
    setLoading(true)
    const data = await getRotinas(fazendaId)
    setRotinas(data)
    setLoading(false)
  }

  const hoje = useMemo(() => new Date().toISOString().split('T')[0], [])

  const cadernetasAtivasHoje = useMemo(() => {
    const positivas = new Set<string>()
    const negativas = new Set<string>()

    regras.forEach((r) => {
      if (!r.ativo) return
      const inicio = r.data_inicio
      const fim = r.data_fim || inicio
      if (hoje < inicio || hoje > fim) return

      const afetadas = r.cadernetas.length === 0 ? CHECKLIST_CADERNETAS : r.cadernetas
      if (r.tipo === 'excecao') {
        afetadas.forEach((c) => negativas.add(c))
      } else {
        afetadas.forEach((c) => positivas.add(c))
      }
    })

    const ativas = Array.from(positivas).filter((c) => !negativas.has(c))
    return ativas.map((id) => ({
      id,
      label: CADERNETAS.find((c) => c.id === id)?.label || id,
    }))
  }, [regras, hoje])

  const programacaoHoje = useMemo(() => {
    const rotinasHoje = getRotinasDoDia(rotinas, hoje)
    const map = new Map<string, { id: string; label: string; horario: string | null }[]>()
    rotinasHoje.forEach((r: Rotina) => {
      const existente = map.get(r.funcionario_id) || []
      const novas = r.cadernetas.map((id) => ({
        id,
        label: CADERNETAS.find((c) => c.id === id)?.label || id,
        horario: r.horarios?.[id] || null,
      }))
      const merged = [...existente]
      novas.forEach((n) => {
        const idx = merged.findIndex((m) => m.id === n.id)
        if (idx === -1) merged.push(n)
        else if (n.horario) merged[idx] = n
      })
      map.set(r.funcionario_id, merged)
    })
    return Array.from(map.entries()).map(([funcionarioId, cadernetas]) => ({
      funcionarioId,
      funcionarioNome: funcionarios.find((f) => f.id === funcionarioId)?.nome || funcionarioId,
      cadernetas,
    }))
  }, [rotinas, hoje, funcionarios])

  const getCadernetaLabel = (id: string) => CADERNETAS.find((c) => c.id === id)?.label || id
  const getFuncionarioNome = (id: string) => funcionarios.find((f: { id: string; nome: string }) => f.id === id)?.nome || id

  const formatDate = (date: string) => {
    const [ano, mes, dia] = date.split('-')
    return `${dia}/${mes}/${ano}`
  }

  const formatDiasSemana = (dias: number[]) => {
    if (dias.length === 7) return 'Todos os dias'
    if (dias.length === 0) return 'Nenhum dia'
    return dias
      .sort((a, b) => a - b)
      .map((d) => DIAS_DA_SEMANA.find((ds) => ds.value === d)?.label)
      .join(', ')
  }

  const isRegraVigenteHoje = (regra: ChecklistRegra) => {
    if (!regra.ativo) return false
    const fim = regra.data_fim || regra.data_inicio
    return hoje >= regra.data_inicio && hoje <= fim
  }

  const getSobreposicoesRegras = (
    cadernetas: string[],
    inicio: string,
    fim: string,
    excetoId?: string | null
  ) => {
    const alvos = cadernetas.length === 0 ? CHECKLIST_CADERNETAS : cadernetas
    const conflitos: { cadernetaId: string; regra: ChecklistRegra }[] = []

    regras.forEach((r) => {
      if (r.id === excetoId) return
      if (!r.ativo) return
      const rFim = r.data_fim || r.data_inicio
      if (fim < r.data_inicio || inicio > rFim) return
      const rAlvos = r.cadernetas.length === 0 ? CHECKLIST_CADERNETAS : r.cadernetas
      alvos.forEach((c) => {
        if (rAlvos.includes(c)) conflitos.push({ cadernetaId: c, regra: r })
      })
    })

    return conflitos
  }

  // Regras
  const openRegraModal = (regra?: ChecklistRegra) => {
    if (regra) {
      setEditingRegraId(regra.id)
      setRegraForm({
        cadernetas: regra.cadernetas,
        tipo: regra.tipo,
        data_inicio: regra.data_inicio,
        data_fim: regra.data_fim || '',
        ativo: regra.ativo,
      })
    } else {
      setEditingRegraId(null)
      setRegraForm({ ...INITIAL_REGRA_FORM, data_inicio: hoje })
    }
    setRegraErrors({})
    setRegraModalOpen(true)
  }

  const closeRegraModal = () => {
    setRegraModalOpen(false)
    setEditingRegraId(null)
    setRegraForm(INITIAL_REGRA_FORM)
    setRegraErrors({})
  }

  const validateRegra = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!regraForm.data_inicio) newErrors.data_inicio = 'Informe a data de início'
    if (regraForm.data_fim && regraForm.data_fim < regraForm.data_inicio) {
      newErrors.data_fim = 'A data final não pode ser anterior à data inicial'
    }
    if (regraForm.cadernetas.length === 0) {
      newErrors.cadernetas = 'Selecione pelo menos uma caderneta ou marque "Todas"'
    }
    setRegraErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleRegraSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fazendaId || !validateRegra()) return

    setSavingRegra(true)
    const payload = {
      fazenda_id: fazendaId,
      cadernetas: regraForm.cadernetas,
      tipo: regraForm.tipo,
      data_inicio: regraForm.data_inicio,
      data_fim: regraForm.tipo === 'excecao' ? regraForm.data_fim || regraForm.data_inicio : regraForm.data_fim || null,
      ativo: regraForm.ativo,
    }

    let ok = false
    if (editingRegraId) {
      ok = !!(await updateChecklistRegra(editingRegraId, payload))
    } else {
      ok = !!(await createChecklistRegra(payload))
    }

    setSavingRegra(false)
    if (ok) {
      closeRegraModal()
      await loadRegras()
    }
  }

  const handleToggleRegra = async (regra: ChecklistRegra) => {
    const updated = await updateChecklistRegra(regra.id, { ativo: !regra.ativo })
    if (updated) await loadRegras()
  }

  const handleDeleteRegra = async () => {
    if (!deleteRegraModal.id) return
    const success = await deleteChecklistRegra(deleteRegraModal.id)
    if (success) {
      setDeleteRegraModal({ open: false, id: null })
      await loadRegras()
    }
  }

  // Rotinas
  const openRotinaModal = (rotina?: Rotina) => {
    if (rotina) {
      setEditingRotinaId(rotina.id)
      setRotinaForm({
        funcionario_id: rotina.funcionario_id,
        cadernetas: rotina.cadernetas,
        dias_semana: rotina.dias_semana,
        horarios: (rotina.horarios || {}) as Record<string, string>,
        data_inicio: rotina.data_inicio,
        data_fim: rotina.data_fim || '',
        ativo: rotina.ativo,
      })
    } else {
      setEditingRotinaId(null)
      setRotinaForm({ ...INITIAL_ROTINA_FORM, data_inicio: hoje })
    }
    setRotinaErrors({})
    setRotinaModalOpen(true)
  }

  const closeRotinaModal = () => {
    setRotinaModalOpen(false)
    setEditingRotinaId(null)
    setRotinaForm(INITIAL_ROTINA_FORM)
    setRotinaErrors({})
  }

  const validateRotina = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!rotinaForm.funcionario_id) newErrors.funcionario_id = 'Selecione um usuário'
    if (rotinaForm.cadernetas.length === 0) {
      newErrors.cadernetas = 'Selecione pelo menos uma caderneta'
    }
    if (rotinaForm.dias_semana.length === 0) {
      newErrors.dias_semana = 'Selecione pelo menos um dia da semana'
    }
    if (!rotinaForm.data_inicio) newErrors.data_inicio = 'Informe a data de início'
    if (rotinaForm.data_fim && rotinaForm.data_fim < rotinaForm.data_inicio) {
      newErrors.data_fim = 'A data final não pode ser anterior à data inicial'
    }
    setRotinaErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const doSaveRotina = async (payload: any) => {
    let ok = false
    if (editingRotinaId) {
      ok = !!(await updateRotina(editingRotinaId, payload))
    } else {
      ok = !!(await createRotina(payload))
    }

    setSavingRotina(false)
    if (ok) {
      closeRotinaModal()
      await loadRotinas()
    }
  }

  const handleRotinaSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fazendaId || !validateRotina()) return

    const payload = {
      fazenda_id: fazendaId,
      funcionario_id: rotinaForm.funcionario_id,
      cadernetas: rotinaForm.cadernetas,
      dias_semana: rotinaForm.dias_semana,
      horarios: rotinaForm.horarios,
      data_inicio: rotinaForm.data_inicio,
      data_fim: rotinaForm.data_fim || null,
      ativo: rotinaForm.ativo,
    }

    const controleAcesso = await supabase
      .from('fazendas')
      .select('controle_acesso_habilitado')
      .eq('id', fazendaId)
      .single()

    if (!controleAcesso.data?.controle_acesso_habilitado) {
      setSavingRotina(true)
      await doSaveRotina(payload)
      return
    }

    const { data: funcionario } = await supabase
      .from('funcionarios')
      .select('id, nome, cadernetas_permitidas')
      .eq('id', rotinaForm.funcionario_id)
      .single()

    const permitidas = Array.isArray(funcionario?.cadernetas_permitidas)
      ? funcionario.cadernetas_permitidas
      : []
    const faltantes = rotinaForm.cadernetas.filter((c) => !permitidas.includes(c))

    if (faltantes.length === 0) {
      setSavingRotina(true)
      await doSaveRotina(payload)
      return
    }

    setCadernetasModal({
      open: true,
      funcionarioId: funcionario?.id || null,
      funcionarioNome: funcionario?.nome || rotinaForm.funcionario_id,
      cadernetas: faltantes,
      payload,
    })
  }

  const handleConfirmarCadernetas = async () => {
    if (!cadernetasModal.funcionarioId || cadernetasModal.cadernetas.length === 0) return

    setHabilitandoCadernetas(true)
    const { data: funcionario } = await supabase
      .from('funcionarios')
      .select('cadernetas_permitidas')
      .eq('id', cadernetasModal.funcionarioId)
      .single()

    const permitidas = Array.isArray(funcionario?.cadernetas_permitidas)
      ? funcionario.cadernetas_permitidas
      : []
    const novasCadernetas = [...new Set([...permitidas, ...cadernetasModal.cadernetas])]

    const { error } = await supabase
      .from('funcionarios')
      .update({ cadernetas_permitidas: novasCadernetas })
      .eq('id', cadernetasModal.funcionarioId)

    setHabilitandoCadernetas(false)
    if (error) {
      console.error('[Rotinas] Erro ao habilitar cadernetas:', error)
      toast.error('Erro ao habilitar cadernetas. Tente novamente.')
      return
    }

    setCadernetasModal({ open: false, funcionarioId: null, funcionarioNome: '', cadernetas: [], payload: null })
    setSavingRotina(true)
    await doSaveRotina(cadernetasModal.payload)
  }

  const handleToggleRotina = async (rotina: Rotina) => {
    const updated = await updateRotina(rotina.id, { ativo: !rotina.ativo })
    if (updated) await loadRotinas()
  }

  const handleDeleteRotina = async () => {
    if (!deleteRotinaModal.id) return
    const success = await deleteRotina(deleteRotinaModal.id)
    if (success) {
      setDeleteRotinaModal({ open: false, id: null })
      await loadRotinas()
    }
  }

  const toggleDiaSemana = (dia: number) => {
    setRotinaForm((prev) => ({
      ...prev,
      dias_semana: prev.dias_semana.includes(dia)
        ? prev.dias_semana.filter((d) => d !== dia)
        : [...prev.dias_semana, dia].sort((a, b) => a - b),
    }))
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Rotinas</h1>
          <p className="text-sm text-gray-500">
            Programe tarefas por usuário e controle quando os checklists aparecem.
          </p>
        </div>
      </div>

      {/* Seção Rotinas */}
      <section>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Programação de rotinas</h2>
          <Button onClick={() => openRotinaModal()} className="min-h-[44px]">
            + Nova rotina
          </Button>
        </div>

        <Card className="bg-white p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Programação de hoje
          </h3>
          {programacaoHoje.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhuma programação para hoje.</p>
          ) : (
            <div className="space-y-3">
              {programacaoHoje.map((p) => (
                <div key={p.funcionarioId} className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-gray-800">{p.funcionarioNome}:</span>
                  {p.cadernetas.map((c) => (
                    <span
                      key={c.id}
                      className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                      title={c.horario ? `Às ${c.horario.substring(0, 5)}` : 'Sem horário definido'}
                    >
                      {c.label}
                      {c.horario && <span className="ml-1">({c.horario.substring(0, 5)})</span>}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="bg-white p-0 overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : rotinas.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-600 mb-2">Nenhuma rotina cadastrada.</p>
              <p className="text-sm text-gray-500">
                Crie uma rotina para definir quem faz o quê e em quais dias.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3">Usuário</th>
                    <th className="px-4 py-3">Cadernetas</th>
                    <th className="px-4 py-3">Dias</th>
                    <th className="px-4 py-3">Horários</th>
                    <th className="px-4 py-3">Vigência</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rotinas.map((rotina) => (
                    <tr key={rotina.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {getFuncionarioNome(rotina.funcionario_id)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {rotina.cadernetas.slice(0, 3).map((id: string) => (
                            <span
                              key={id}
                              className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700"
                            >
                              {getCadernetaLabel(id)}
                            </span>
                          ))}
                          {rotina.cadernetas.length > 3 && (
                            <span className="text-xs text-gray-500">
                              +{rotina.cadernetas.length - 3} mais
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{formatDiasSemana(rotina.dias_semana)}</td>
                      <td className="px-4 py-3 text-gray-700">
                        <div className="flex flex-col gap-1">
                          {rotina.cadernetas.map((id: string) => (
                            <span key={id} className="text-xs">
                              {getCadernetaLabel(id)}: {rotina.horarios?.[id] || '-'}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {formatDate(rotina.data_inicio)}
                        {rotina.data_fim ? ` a ${formatDate(rotina.data_fim)}` : ''}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleRotina(rotina)}
                            className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors ${
                              rotina.ativo ? 'bg-primary' : 'bg-gray-300'
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                rotina.ativo ? 'translate-x-5' : 'translate-x-1'
                              }`}
                            />
                          </button>
                          <span className="text-xs text-gray-500">
                            {rotina.ativo ? 'Ativa' : 'Inativa'}
                            {rotinaEstaAtivaHoje(rotina, hoje) && (
                              <span className="ml-1 text-green-600 font-medium">· hoje</span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="secondary"
                            className="text-xs px-2 py-1 min-h-[32px]"
                            onClick={() => openRotinaModal(rotina)}
                          >
                            Editar
                          </Button>
                          <Button
                            variant="secondary"
                            className="text-xs px-2 py-1 min-h-[32px] text-red-600 hover:bg-red-50"
                            onClick={() => setDeleteRotinaModal({ open: true, id: rotina.id })}
                          >
                            Excluir
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      {/* Seção Frequência de Checklists */}
      <section>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Frequência de checklists</h2>
          <Button onClick={() => openRegraModal()} className="min-h-[44px]">
            + Nova regra
          </Button>
        </div>

        <Card className="bg-white p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Cadernetas disponíveis hoje
          </h3>
          {cadernetasAtivasHoje.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhuma caderneta terá checklist exibido hoje.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {cadernetasAtivasHoje.map((c) => (
                <span
                  key={c.id}
                  className="px-3 py-1.5 rounded-full text-sm font-medium bg-green-100 text-green-800"
                >
                  {c.label}
                </span>
              ))}
            </div>
          )}
        </Card>

        <Card className="bg-white p-0 overflow-hidden">
          {regras.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-600 mb-2">Nenhuma regra cadastrada.</p>
              <p className="text-sm text-gray-500">
                Crie uma regra para definir quando as cadernetas ficam disponíveis.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3">Cadernetas</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Período</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {regras.map((regra) => (
                    <tr key={regra.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        {regra.cadernetas.length === 0 ? (
                          <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            Todas as cadernetas
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {regra.cadernetas.slice(0, 3).map((id) => (
                              <span
                                key={id}
                                className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700"
                              >
                                {getCadernetaLabel(id)}
                              </span>
                            ))}
                            {regra.cadernetas.length > 3 && (
                              <span className="text-xs text-gray-500">
                                +{regra.cadernetas.length - 3} mais
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {regra.tipo === 'excecao' ? (
                          <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            Exceção
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                            Período
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {formatDate(regra.data_inicio)}
                        {regra.data_fim && regra.data_fim !== regra.data_inicio
                          ? ` a ${formatDate(regra.data_fim)}`
                          : ' (dia único)'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleRegra(regra)}
                            className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors ${
                              regra.ativo ? 'bg-primary' : 'bg-gray-300'
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                regra.ativo ? 'translate-x-5' : 'translate-x-1'
                              }`}
                            />
                          </button>
                          <span className="text-xs text-gray-500">
                            {regra.ativo ? 'Ativo' : 'Inativo'}
                            {isRegraVigenteHoje(regra) && (
                              <span className="ml-1 text-green-600 font-medium">· vigente hoje</span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="secondary"
                            className="text-xs px-2 py-1 min-h-[32px]"
                            onClick={() => openRegraModal(regra)}
                          >
                            Editar
                          </Button>
                          <Button
                            variant="secondary"
                            className="text-xs px-2 py-1 min-h-[32px] text-red-600 hover:bg-red-50"
                            onClick={() => setDeleteRegraModal({ open: true, id: regra.id })}
                          >
                            Excluir
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      {/* Modal Regra */}
      <Modal
        isOpen={regraModalOpen}
        onClose={closeRegraModal}
        title={editingRegraId ? 'Editar regra' : 'Nova regra'}
        size="md"
      >
        <form onSubmit={handleRegraSubmit} className="space-y-4">
          <div>
            <MultiSelect
              label="Cadernetas afetadas"
              required
              options={CADERNETAS_OPTIONS}
              value={regraForm.cadernetas}
              onChange={(value) => setRegraForm({ ...regraForm, cadernetas: value })}
              placeholder="Selecione as cadernetas"
            />
            {regraErrors.cadernetas && (
              <p className="text-red-500 text-xs mt-1">{regraErrors.cadernetas}</p>
            )}
            <label className="flex items-center gap-2 mt-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={regraForm.cadernetas.length === CHECKLIST_CADERNETAS.length}
                onChange={(e) =>
                  setRegraForm({
                    ...regraForm,
                    cadernetas: e.target.checked ? [...CHECKLIST_CADERNETAS] : [],
                  })
                }
                className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
              />
              Todas as cadernetas
            </label>
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">
              Tipo de regra
            </label>
            <select
              value={regraForm.tipo}
              onChange={(e) =>
                setRegraForm({ ...regraForm, tipo: e.target.value as ChecklistRegraTipo })
              }
              className="w-full min-h-[44px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="periodo">Período fixo</option>
              <option value="excecao">Exceção (não exibe checklist)</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {regraForm.tipo === 'excecao'
                ? 'Neste período, as cadernetas selecionadas não exibirão checklist.'
                : 'O checklist será exibido em todos os dias do período.'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">
                Data de início <span className="text-red-500">*</span>
              </label>
              <Input
                type="date"
                value={regraForm.data_inicio}
                onChange={(e) => setRegraForm({ ...regraForm, data_inicio: e.target.value })}
                className="min-h-[44px]"
              />
              {regraErrors.data_inicio && (
                <p className="text-red-500 text-xs mt-1">{regraErrors.data_inicio}</p>
              )}
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">
                Data de fim
              </label>
              <Input
                type="date"
                value={regraForm.data_fim}
                onChange={(e) => setRegraForm({ ...regraForm, data_fim: e.target.value })}
                className="min-h-[44px]"
              />
              {regraErrors.data_fim && (
                <p className="text-red-500 text-xs mt-1">{regraErrors.data_fim}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">Se vazio, vale apenas o dia do início.</p>
            </div>
          </div>

          <div className="flex items-center gap-3 py-2">
            <button
              type="button"
              onClick={() => setRegraForm({ ...regraForm, ativo: !regraForm.ativo })}
              className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors ${
                regraForm.ativo ? 'bg-primary' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  regraForm.ativo ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="text-sm text-gray-700">{regraForm.ativo ? 'Ativo' : 'Inativo'}</span>
          </div>

          {(() => {
            const inicio = regraForm.data_inicio
            const fim = regraForm.data_fim || inicio
            if (!inicio || !fim || regraForm.cadernetas.length === 0) return null
            const sobreposicoes = getSobreposicoesRegras(regraForm.cadernetas, inicio, fim, editingRegraId)
            if (sobreposicoes.length === 0) return null
            const cadernetasUnicas = Array.from(new Set(sobreposicoes.map((s) => s.cadernetaId)))
            return (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <p className="font-medium mb-1">Atenção: sobreposição de regras</p>
                <p>
                  As cadernetas {cadernetasUnicas.map((id) => getCadernetaLabel(id)).join(', ')} já possuem regras ativas neste período. Exceções terão prioridade.
                </p>
              </div>
            )
          })()}

          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-gray-100">
            <Button type="button" variant="secondary" onClick={closeRegraModal} className="min-h-[44px]">
              Cancelar
            </Button>
            <Button type="submit" disabled={savingRegra} className="min-h-[44px]">
              {savingRegra ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Rotina */}
      <Modal
        isOpen={rotinaModalOpen}
        onClose={closeRotinaModal}
        title={editingRotinaId ? 'Editar rotina' : 'Nova rotina'}
        size="md"
      >
        <form onSubmit={handleRotinaSubmit} className="space-y-4">
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">
              Funcionário <span className="text-red-500">*</span>
            </label>
            <select
              value={rotinaForm.funcionario_id}
              onChange={(e) => setRotinaForm({ ...rotinaForm, funcionario_id: e.target.value })}
              className="w-full min-h-[44px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">Selecione um funcionário</option>
              {funcionarios.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
            {rotinaErrors.funcionario_id && (
              <p className="text-red-500 text-xs mt-1">{rotinaErrors.funcionario_id}</p>
            )}
          </div>

          <div>
            <MultiSelect
              label="Cadernetas"
              required
              options={CADERNETAS_OPTIONS}
              value={rotinaForm.cadernetas}
              onChange={(value) => setRotinaForm({ ...rotinaForm, cadernetas: value })}
              placeholder="Selecione as cadernetas"
            />
            {rotinaErrors.cadernetas && (
              <p className="text-red-500 text-xs mt-1">{rotinaErrors.cadernetas}</p>
            )}
          </div>

          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
              Dias da semana <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {DIAS_DA_SEMANA.map((dia) => (
                <label
                  key={dia.value}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                    rotinaForm.dias_semana.includes(dia.value)
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-white border-gray-300 text-gray-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={rotinaForm.dias_semana.includes(dia.value)}
                    onChange={() => toggleDiaSemana(dia.value)}
                  />
                  {dia.label}
                </label>
              ))}
            </div>
            {rotinaErrors.dias_semana && (
              <p className="text-red-500 text-xs mt-1">{rotinaErrors.dias_semana}</p>
            )}
          </div>

          {rotinaForm.cadernetas.length > 0 && (
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                Horários por caderneta (opcionais)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {rotinaForm.cadernetas.map((id: string) => (
                  <div key={id}>
                    <label className="block text-xs text-gray-600 mb-1">{getCadernetaLabel(id)}</label>
                    <Input
                      type="time"
                      value={rotinaForm.horarios[id] || ''}
                      onChange={(e) =>
                        setRotinaForm((prev) => ({
                          ...prev,
                          horarios: { ...prev.horarios, [id]: e.target.value },
                        }))
                      }
                      className="min-h-[44px]"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">
                Data de início <span className="text-red-500">*</span>
              </label>
              <Input
                type="date"
                value={rotinaForm.data_inicio}
                onChange={(e) => setRotinaForm({ ...rotinaForm, data_inicio: e.target.value })}
                className="min-h-[44px]"
              />
              {rotinaErrors.data_inicio && (
                <p className="text-red-500 text-xs mt-1">{rotinaErrors.data_inicio}</p>
              )}
            </div>
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 leading-tight line-clamp-2">
                Data de fim
              </label>
              <Input
                type="date"
                value={rotinaForm.data_fim}
                onChange={(e) => setRotinaForm({ ...rotinaForm, data_fim: e.target.value })}
                className="min-h-[44px]"
              />
              {rotinaErrors.data_fim && (
                <p className="text-red-500 text-xs mt-1">{rotinaErrors.data_fim}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">Se vazio, não tem data limite.</p>
            </div>
          </div>

          <div className="flex items-center gap-3 py-2">
            <button
              type="button"
              onClick={() => setRotinaForm({ ...rotinaForm, ativo: !rotinaForm.ativo })}
              className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors ${
                rotinaForm.ativo ? 'bg-primary' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  rotinaForm.ativo ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="text-sm text-gray-700">{rotinaForm.ativo ? 'Ativa' : 'Inativa'}</span>
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-gray-100">
            <Button type="button" variant="secondary" onClick={closeRotinaModal} className="min-h-[44px]">
              Cancelar
            </Button>
            <Button type="submit" disabled={savingRotina} className="min-h-[44px]">
              {savingRotina ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={deleteRegraModal.open}
        onClose={() => setDeleteRegraModal({ open: false, id: null })}
        onConfirm={handleDeleteRegra}
        title="Excluir regra"
        message="Tem certeza que deseja excluir esta regra?"
        confirmText="Excluir"
        cancelText="Cancelar"
        variant="danger"
      />

      <ConfirmModal
        isOpen={deleteRotinaModal.open}
        onClose={() => setDeleteRotinaModal({ open: false, id: null })}
        onConfirm={handleDeleteRotina}
        title="Excluir rotina"
        message="Tem certeza que deseja excluir esta rotina?"
        confirmText="Excluir"
        cancelText="Cancelar"
        variant="danger"
      />

      <Modal
        isOpen={cadernetasModal.open}
        onClose={() => setCadernetasModal({ open: false, funcionarioId: null, funcionarioNome: '', cadernetas: [], payload: null })}
        title="Habilitar acesso às cadernetas"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            <strong>{cadernetasModal.funcionarioNome}</strong> não tem acesso às cadernetas abaixo. Para salvar a rotina, habilite o acesso:
          </p>
          <div className="flex flex-wrap gap-2">
            {cadernetasModal.cadernetas.map((id: string) => (
              <span
                key={id}
                className="inline-flex px-3 py-1.5 rounded-full text-sm font-medium bg-primary/10 text-primary"
              >
                {getCadernetaLabel(id)}
              </span>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-gray-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCadernetasModal({ open: false, funcionarioId: null, funcionarioNome: '', cadernetas: [], payload: null })}
              className="min-h-[44px]"
              disabled={habilitandoCadernetas}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleConfirmarCadernetas}
              disabled={habilitandoCadernetas}
              className="min-h-[44px]"
            >
              {habilitandoCadernetas ? 'Habilitando...' : 'Habilitar e salvar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
