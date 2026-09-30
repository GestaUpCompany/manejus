import { useMemo, useState } from 'react'
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
import {
  useSetores,
  useTemplates,
  useSaveTemplate,
  useDeleteTemplate,
  useAplicarTemplate,
} from '../../services/cadastrosService'
import type { FpTemplate } from '../../services/cadastrosService'
import { DIAS_SEMANA_CURTO, FP_TIPO_LABEL } from '../../types/farmplan'

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
  rep_a_cada: 1,
}

export function TemplatesTab() {
  const { user } = useAuth()
  const { data: fazenda } = useFazenda(user?.id)
  const fazendaId = fazenda?.id
  const { data: plano } = usePlanoAtivo(fazendaId)
  const { data: templates, isLoading } = useTemplates(fazendaId)
  const { data: funcionarios } = useFuncionariosFp(fazendaId)
  const { data: equipes } = useEquipesFp(fazendaId)
  const { data: setores } = useSetores(fazendaId)
  const save = useSaveTemplate()
  const del = useDeleteTemplate()
  const aplicar = useAplicarTemplate()
  const toast = useToast()

  const [modalOpen, setModalOpen] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [aplicandoId, setAplicandoId] = useState<string | null>(null)
  const [semanaInicio, setSemanaInicio] = useState(1)
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

  const abrirEdicao = (t: FpTemplate) => {
    setEditId(t.id)
    setForm({
      nome: t.nome,
      local: t.local ?? '',
      coordenador_id: t.coordenador_id ?? '',
      executorTipo: t.executor_equipe_id ? 'equipe' : 'pessoa',
      executor_funcionario_id: t.executor_funcionario_id ?? '',
      executor_equipe_id: t.executor_equipe_id ?? '',
      setor_id: t.setor_id ?? '',
      tipo: t.tipo,
      urgencia: t.urgencia,
      dias_semana: [...t.dias_semana],
      metodologia: t.metodologia ?? '',
      maquinas: t.maquinas ?? '',
      materiais: t.materiais ?? '',
      meta: t.meta ?? '',
      rep_a_cada: t.rep_a_cada,
    })
    setModalOpen(true)
  }

  const salvar = () => {
    if (!fazendaId) return
    if (!form.nome.trim()) {
      toast.error('Informe o nome do template')
      return
    }
    if (!form.dias_semana.some(Boolean)) {
      toast.error('Marque ao menos um dia da semana')
      return
    }
    save.mutate(
      {
        id: editId ?? undefined,
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
        rep_a_cada: Math.max(1, form.rep_a_cada),
      },
      {
        onSuccess: () => {
          toast.success(editId ? 'Template atualizado' : 'Template criado')
          setModalOpen(false)
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Erro ao salvar'),
      },
    )
  }

  const confirmarAplicacao = () => {
    const t = templates?.find((x) => x.id === aplicandoId)
    if (!t || !plano) return
    aplicar.mutate(
      { template: t, planoId: plano.id, semanaInicio },
      {
        onSuccess: () => {
          toast.success(`"${t.nome}" aplicada ao plano ${plano.ano}`)
          setAplicandoId(null)
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Erro ao aplicar'),
      },
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-content-muted">
          Biblioteca de atividades-modelo. Aplicar materializa a atividade no plano e já distribui as
          semanas conforme a recorrência.
        </p>
        <Button onClick={abrirNovo}>+ Novo template</Button>
      </div>

      {isLoading ? (
        <PageSkeleton />
      ) : !templates?.length ? (
        <EmptyState
          title="Nenhum template"
          description="Cadastre atividades recorrentes para aplicar ao plano com um clique."
        />
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <Card key={t.id} className="p-4" disableHover>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-content-strong">{t.nome}</p>
                  <p className="text-xs text-content-muted mt-0.5">
                    {FP_TIPO_LABEL[t.tipo as 1 | 2 | 3 | 4 | 5]} · Urgência {URGENCIA_LABEL[t.urgencia as 1 | 2 | 3]}
                    {t.rep_a_cada > 1 ? ` · a cada ${t.rep_a_cada} semanas` : ' · toda semana'}
                  </p>
                  <p className="text-xs text-content-faint mt-0.5">
                    {DIAS_SEMANA_CURTO.filter((_, i) => t.dias_semana[i]).join(', ')}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    disabled={!plano}
                    onClick={() => {
                      setAplicandoId(t.id)
                      setSemanaInicio(plano?.semanaAtual ?? 1)
                    }}
                  >
                    Aplicar
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => abrirEdicao(t)}>
                    Editar
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => setConfirmId(t.id)}>
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
        title={editId ? 'Editar template' : 'Novo template'}
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
            />
            <Select
              label="Coordenador"
              options={funcOptions}
              value={form.coordenador_id}
              onChange={(v) => setForm({ ...form, coordenador_id: v })}
            />
          </div>
          <div>
            <span className="block text-sm font-semibold text-primary dark:text-content mb-2">
              Executor padrão
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
              />
            ) : (
              <Select
                options={equipeOptions}
                value={form.executor_equipe_id}
                onChange={(v) => setForm({ ...form, executor_equipe_id: v })}
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
          <Input
            label="Repetir a cada N semanas (ao aplicar)"
            type="number"
            min={1}
            max={53}
            value={String(form.rep_a_cada)}
            onChange={(e) => setForm({ ...form, rep_a_cada: Number(e.target.value) || 1 })}
          />
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

      <Modal
        isOpen={!!aplicandoId}
        onClose={() => setAplicandoId(null)}
        title="Aplicar template ao plano"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-content">
            Cria a atividade no plano {plano?.ano} e marca as semanas automaticamente.
          </p>
          <Select
            label="A partir da semana"
            options={Array.from({ length: 53 }, (_, i) => ({
              value: String(i + 1),
              label: `Semana ${i + 1}${i + 1 === plano?.semanaAtual ? ' (atual)' : ''}`,
            }))}
            value={String(semanaInicio)}
            onChange={(v) => setSemanaInicio(Number(v))}
          />
          <div className="flex gap-2">
            <Button onClick={confirmarAplicacao} disabled={aplicar.isPending}>
              {aplicar.isPending ? 'Aplicando...' : 'Aplicar'}
            </Button>
            <Button variant="secondary" onClick={() => setAplicandoId(null)}>
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
              onSuccess: () => toast.success('Template excluído'),
              onError: () => toast.error('Erro ao excluir'),
            })
          }
          setConfirmId(null)
        }}
        title="Excluir template"
        message="O template é removido da biblioteca. Atividades já criadas a partir dele não são afetadas."
        confirmText="Excluir"
      />
    </div>
  )
}
