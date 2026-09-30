import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth, useFazenda } from '@gestaup/shared'
import {
  Card,
  Input,
  Select,
  Button,
  Modal,
  ConfirmModal,
  EmptyState,
  PageSkeleton,
  useToast,
} from '@gestaup/ui'
import { usePlanoAtivo, useFuncionariosFp, useEquipesFp } from '../../services/farmplanService'
import { useSetores, useAtividades, useSaveAtividade, useDeleteAtividade } from '../../services/cadastrosService'
import type { AtividadeInput } from '../../services/cadastrosService'
import { DIAS_SEMANA_CURTO, FP_TIPO_LABEL } from '../../types/farmplan'
import type { FpAtividade, FpTipoAtividade } from '../../types/farmplan'

const URGENCIA_LABEL = { 1: 'Alta', 2: 'Média', 3: 'Baixa' } as const

const FORM_VAZIO = {
  nome: '',
  local: '',
  coordenador_id: '',
  executorTipo: 'pessoa' as 'pessoa' | 'equipe',
  executor_funcionario_id: '',
  executor_equipe_id: '',
  setor_id: '',
  tipo: 2,
  urgencia: 2,
  dias_semana: [true, true, true, true, true, false, false] as boolean[],
  metodologia: '',
  maquinas: '',
  materiais: '',
  meta: '',
  exige_sessao: false,
}

export function AtividadesTab() {
  const { user } = useAuth()
  const { data: fazenda } = useFazenda(user?.id)
  const fazendaId = fazenda?.id
  const { data: plano } = usePlanoAtivo(fazendaId)
  const { data: atividades, isLoading } = useAtividades(plano?.id)
  const { data: funcionarios } = useFuncionariosFp(fazendaId)
  const { data: equipes } = useEquipesFp(fazendaId)
  const { data: setores } = useSetores(fazendaId)
  const save = useSaveAtividade()
  const del = useDeleteAtividade()
  const toast = useToast()

  const [modalOpen, setModalOpen] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)

  const funcOptions = useMemo(
    () =>
      (funcionarios ?? [])
        .filter((f) => f.ativo)
        .map((f) => ({ value: f.id, label: f.apelido ? `${f.nome} (${f.apelido})` : f.nome })),
    [funcionarios],
  )
  const equipeOptions = (equipes ?? []).map((e) => ({ value: e.id, label: e.nome }))
  const setorOptions = (setores ?? []).filter((s) => s.ativo).map((s) => ({ value: s.id, label: s.nome }))

  const abrirNovo = () => {
    setEditId(null)
    setForm(FORM_VAZIO)
    setModalOpen(true)
  }

  const [searchParams, setSearchParams] = useSearchParams()
  const novaHandled = useRef(false)
  useEffect(() => {
    if (novaHandled.current || searchParams.get('nova') !== '1' || !plano) return
    novaHandled.current = true
    abrirNovo()
    searchParams.delete('nova')
    setSearchParams(searchParams, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, plano])

  const abrirEdicao = (a: FpAtividade) => {
    setEditId(a.id)
    setForm({
      nome: a.nome,
      local: a.local ?? '',
      coordenador_id: a.coordenador_id ?? '',
      executorTipo: a.executor_equipe_id ? 'equipe' : 'pessoa',
      executor_funcionario_id: a.executor_funcionario_id ?? '',
      executor_equipe_id: a.executor_equipe_id ?? '',
      setor_id: a.setor_id ?? '',
      tipo: a.tipo,
      urgencia: a.urgencia,
      dias_semana: [...a.dias_semana],
      metodologia: a.metodologia ?? '',
      maquinas: a.maquinas ?? '',
      materiais: a.materiais ?? '',
      meta: a.meta ?? '',
      exige_sessao: a.exige_sessao,
    })
    setModalOpen(true)
  }

  const salvar = () => {
    if (!plano || !fazendaId) return
    if (!form.nome.trim()) {
      toast.error('Informe o nome da atividade')
      return
    }
    if (!form.dias_semana.some(Boolean)) {
      toast.error('Marque ao menos um dia da semana')
      return
    }
    const input: AtividadeInput = {
      id: editId ?? undefined,
      plano_id: plano.id,
      fazenda_id: fazendaId,
      nome: form.nome.trim(),
      local: form.local || null,
      coordenador_id: form.coordenador_id || null,
      executor_funcionario_id:
        form.executorTipo === 'pessoa' ? form.executor_funcionario_id || null : null,
      executor_equipe_id:
        form.executorTipo === 'equipe' ? form.executor_equipe_id || null : null,
      setor_id: form.setor_id || null,
      tipo: form.tipo,
      urgencia: form.urgencia,
      dias_semana: form.dias_semana,
      metodologia: form.metodologia || null,
      maquinas: form.maquinas || null,
      materiais: form.materiais || null,
      meta: form.meta || null,
      exige_sessao: form.exige_sessao,
    }
    save.mutate(input, {
      onSuccess: () => {
        toast.success(editId ? 'Atividade atualizada' : 'Atividade criada')
        setModalOpen(false)
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Erro ao salvar'),
    })
  }

  const nomeExecutor = (a: FpAtividade) => {
    if (a.executor_funcionario_id) {
      const f = funcionarios?.find((x) => x.id === a.executor_funcionario_id)
      return f?.apelido || f?.nome || '—'
    }
    if (a.executor_equipe_id) {
      const n = equipes?.find((e) => e.id === a.executor_equipe_id)?.nome ?? ''
      return /^equipe/i.test(n.trim()) ? n : `Equipe ${n}`
    }
    return '—'
  }

  const diasLabel = (dias: boolean[]) =>
    DIAS_SEMANA_CURTO.filter((_, i) => dias[i]).join(', ')

  if (!plano) {
    return (
      <EmptyState
        title="Crie o plano anual primeiro"
        description="As atividades pertencem a um plano. Cadastre-o na aba Plano anual."
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-content-muted">
          {atividades?.length ?? 0} atividade(s) no plano {plano.ano}. As semanas de execução são
          distribuídas no Plano anual.
        </p>
        <Button onClick={abrirNovo}>+ Nova atividade</Button>
      </div>

      {isLoading ? (
        <PageSkeleton />
      ) : !atividades?.length ? (
        <EmptyState
          title="Nenhuma atividade cadastrada"
          description="Cadastre a primeira atividade do plano."
        />
      ) : (
        <div className="space-y-2">
          {atividades.map((a) => (
            <Card key={a.id} className="p-4" disableHover>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-content-strong">{a.nome}</p>
                  <p className="text-xs text-content-muted mt-0.5">
                    {nomeExecutor(a)} · {FP_TIPO_LABEL[a.tipo as FpTipoAtividade]} · Urgência{' '}
                    {URGENCIA_LABEL[a.urgencia]}
                    {a.local ? ` · ${a.local}` : ''}
                  </p>
                  <p className="text-xs text-content-faint mt-0.5">{diasLabel(a.dias_semana)}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Button variant="secondary" size="sm" onClick={() => abrirEdicao(a)}>
                    Editar
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => setConfirmId(a.id)}>
                    Excluir
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? 'Editar atividade' : 'Nova atividade'}
        size="lg"
      >
        <div className="space-y-4">
          <Input
            label="Nome"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Local"
              value={form.local}
              onChange={(e) => setForm({ ...form, local: e.target.value })}
              placeholder="Ex.: Curral 1, Sede"
            />
            <Select
              label="Coordenador"
              options={funcOptions}
              value={form.coordenador_id}
              onChange={(v) => setForm({ ...form, coordenador_id: v })}
              placeholder="Quem acompanha"
            />
          </div>

          <div>
            <span className="block text-sm font-semibold text-primary dark:text-content mb-2">
              Executor
            </span>
            <div className="flex gap-4 mb-2">
              {(['pessoa', 'equipe'] as const).map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm text-content">
                  <input
                    type="radio"
                    checked={form.executorTipo === t}
                    onChange={() => setForm({ ...form, executorTipo: t })}
                  />
                  {t === 'pessoa' ? 'Pessoa' : 'Equipe'}
                </label>
              ))}
            </div>
            {form.executorTipo === 'pessoa' ? (
              <Select
                options={funcOptions}
                value={form.executor_funcionario_id}
                onChange={(v) => setForm({ ...form, executor_funcionario_id: v })}
                placeholder="Selecione a pessoa"
              />
            ) : (
              <Select
                options={equipeOptions}
                value={form.executor_equipe_id}
                onChange={(v) => setForm({ ...form, executor_equipe_id: v })}
                placeholder="Selecione a equipe"
              />
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Select
              label="Setor"
              options={setorOptions}
              value={form.setor_id}
              onChange={(v) => setForm({ ...form, setor_id: v })}
            />
            <Select
              label="Tipo"
              options={([1, 2, 3, 4, 5] as const).map((v) => ({
                value: String(v),
                label: FP_TIPO_LABEL[v],
              }))}
              value={String(form.tipo)}
              onChange={(v) => setForm({ ...form, tipo: Number(v) })}
            />
            <Select
              label="Urgência"
              options={([1, 2, 3] as const).map((v) => ({
                value: String(v),
                label: URGENCIA_LABEL[v],
              }))}
              value={String(form.urgencia)}
              onChange={(v) => setForm({ ...form, urgencia: Number(v) })}
            />
          </div>

          <div>
            <span className="block text-sm font-semibold text-primary dark:text-content mb-2">
              Dias da semana
            </span>
            <div className="flex gap-1.5 flex-wrap">
              {DIAS_SEMANA_CURTO.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      dias_semana: form.dias_semana.map((v, j) => (j === i ? !v : v)),
                    })
                  }
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    form.dias_semana[i]
                      ? 'bg-primary text-white border-primary'
                      : 'bg-surface-1 text-content-muted border-border-base'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <details className="border border-border-subtle rounded-lg p-3">
            <summary className="text-sm font-semibold text-content cursor-pointer">
              Campos 5M (opcional)
            </summary>
            <div className="grid grid-cols-1 gap-3 mt-3">
              {(
                [
                  ['metodologia', 'Metodologia (como fazer)'],
                  ['maquinas', 'Máquinas'],
                  ['materiais', 'Materiais'],
                  ['meta', 'Meta'],
                ] as const
              ).map(([campo, label]) => (
                <div key={campo}>
                  <label className="block text-xs font-medium text-content-muted mb-1">{label}</label>
                  <textarea
                    value={form[campo]}
                    onChange={(e) => setForm({ ...form, [campo]: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface-1 text-content-strong border-border-base"
                  />
                </div>
              ))}
            </div>
          </details>

          <label className="flex items-center gap-2 text-sm text-content">
            <input
              type="checkbox"
              checked={form.exige_sessao}
              onChange={(e) => setForm({ ...form, exige_sessao: e.target.checked })}
            />
            Exige cronômetro (sessão) para dar baixa
          </label>

          <div className="flex gap-2 pt-2">
            <Button onClick={salvar} disabled={save.isPending}>
              {save.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!confirmId}
        onClose={() => setConfirmId(null)}
        onConfirm={() => {
          if (confirmId) {
            del.mutate(confirmId, {
              onSuccess: () => toast.success('Atividade excluída'),
              onError: () => toast.error('Erro ao excluir'),
            })
          }
          setConfirmId(null)
        }}
        title="Excluir atividade"
        message="A atividade e suas semanas planejadas serão removidas. Baixas já registradas são mantidas no histórico."
        confirmText="Excluir"
      />
    </div>
  )
}
