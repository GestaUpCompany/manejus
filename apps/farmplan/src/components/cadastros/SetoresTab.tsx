import { useMemo, useState } from 'react'
import { useAuth, useFazenda } from '@gestaup/shared'
import {
  Input,
  Select,
  Button,
  Modal,
  EmptyState,
  PageSkeleton,
  useToast,
} from '@gestaup/ui'
import {
  useFuncionariosFp,
  usePlanoAtivo,
  usePlanoSemanas,
} from '../../services/farmplanService'
import {
  useSetores,
  useAtividades,
  useSaveSetor,
} from '../../services/cadastrosService'
import type { SetorFp } from '../../services/cadastrosService'

export function SetoresTab() {
  const { user } = useAuth()
  const { data: fazenda } = useFazenda(user?.id)
  const fazendaId = fazenda?.id
  const { data: plano } = usePlanoAtivo(fazendaId)
  const { data: setores, isLoading } = useSetores(fazendaId)
  const { data: funcionarios } = useFuncionariosFp(fazendaId)
  const { data: atividades } = useAtividades(plano?.id)
  const atividadeIds = useMemo(() => atividades?.map((a) => a.id), [atividades])
  const { data: semanas } = usePlanoSemanas(fazendaId, plano?.id, atividadeIds)
  const save = useSaveSetor()
  const toast = useToast()

  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [responsavelId, setResponsavelId] = useState('')

  const funcOptions = useMemo(
    () =>
      (funcionarios ?? [])
        .filter((f) => f.ativo)
        .map((f) => ({ value: f.id, label: f.apelido || f.nome })),
    [funcionarios],
  )

  const cur = plano?.semanaAtual ?? 0
  const ativNaSemanaPorSetor = useMemo(() => {
    const semanasAtivas = new Set(
      (semanas ?? []).filter((s) => s.semana === cur).map((s) => s.atividade_id),
    )
    const m = new Map<string, number>()
    for (const a of atividades ?? []) {
      if (!a.setor_id || !semanasAtivas.has(a.id)) continue
      m.set(a.setor_id, (m.get(a.setor_id) ?? 0) + 1)
    }
    return m
  }, [semanas, atividades, cur])

  const abrirNovo = () => {
    setEditId(null)
    setNome('')
    setResponsavelId('')
    setModalOpen(true)
  }

  const abrirEdicao = (s: SetorFp) => {
    setEditId(s.id)
    setNome(s.nome)
    setResponsavelId(s.responsavel_id ?? '')
    setModalOpen(true)
  }

  const salvar = () => {
    if (!fazendaId) return
    if (!nome.trim()) {
      toast.error('Informe o nome do setor')
      return
    }
    save.mutate(
      { id: editId ?? undefined, fazendaId, nome: nome.trim(), responsavel_id: responsavelId || null },
      {
        onSuccess: () => {
          toast.success(editId ? 'Setor atualizado' : 'Setor criado')
          setModalOpen(false)
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Erro ao salvar'),
      },
    )
  }

  const trocarDono = (s: SetorFp, responsavel_id: string) => {
    if (!fazendaId) return
    save.mutate(
      { id: s.id, fazendaId, nome: s.nome, responsavel_id: responsavel_id || null },
      {
        onSuccess: () => toast.success('Dono do setor atualizado'),
        onError: () => toast.error('Erro ao atualizar'),
      },
    )
  }

  return (
    <div className="space-y-3">
      {isLoading ? (
        <PageSkeleton />
      ) : !setores?.length ? (
        <EmptyState title="Nenhum setor" description="Cadastre os setores da fazenda." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-content-faint border-b border-border-base">
                <th className="py-2 pr-3 font-semibold">Setor</th>
                <th className="py-2 pr-3 font-semibold">Dono do setor</th>
                <th className="py-2 pr-3 font-semibold text-right">Na semana {cur}</th>
                <th className="py-2 font-semibold text-right w-16" />
              </tr>
            </thead>
            <tbody>
              {setores.map((s) => (
                <tr key={s.id} className="border-b border-border-subtle last:border-0">
                  <td className="py-2.5 pr-3 font-semibold text-content-strong">
                    {s.nome}
                    {!s.ativo && <span className="text-xs text-content-faint ml-2">(inativo)</span>}
                  </td>
                  <td className="py-1.5 pr-3 min-w-[180px] [&>div]:mb-0">
                    <Select
                      options={funcOptions}
                      value={s.responsavel_id ?? ''}
                      onChange={(v) => trocarDono(s, v)}
                      placeholder="Sem dono"
                    />
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-content-muted">
                    {ativNaSemanaPorSetor.get(s.id) ?? 0}
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      onClick={() => abrirEdicao(s)}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={abrirNovo}>+ Novo setor</Button>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? 'Editar setor' : 'Novo setor'}
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Nome do setor"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
          />
          <Select
            label="Responsável (dono do setor)"
            options={funcOptions}
            value={responsavelId}
            onChange={setResponsavelId}
            placeholder="Sem responsável"
          />
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
    </div>
  )
}
