import { useEffect, useMemo, useState } from 'react'
import { useAuth, useFazenda } from '@gestaup/shared'
import {
  Card,
  Input,
  MultiSelect,
  Button,
  Modal,
  ConfirmModal,
  EmptyState,
  PageSkeleton,
  useToast,
} from '@gestaup/ui'
import { useFuncionariosFp, useEquipesFp } from '../../services/farmplanService'
import { useSaveEquipe, useDeleteEquipe } from '../../services/cadastrosService'
import type { FpEquipe } from '../../types/farmplan'

type EquipeComMembros = FpEquipe & { membros: string[] }

export function EquipesTab() {
  const { user } = useAuth()
  const { data: fazenda } = useFazenda(user?.id)
  const fazendaId = fazenda?.id
  const { data: equipes, isLoading } = useEquipesFp(fazendaId)
  const { data: funcionarios } = useFuncionariosFp(fazendaId)
  const save = useSaveEquipe()
  const del = useDeleteEquipe()
  const toast = useToast()

  const [modalOpen, setModalOpen] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [membros, setMembros] = useState<string[]>([])
  const [membrosOv, setMembrosOv] = useState<Map<string, boolean>>(new Map())

  // Reconcilia overrides com os dados do servidor após o refetch
  useEffect(() => {
    if (!membrosOv.size || !equipes) return
    const next = new Map(membrosOv)
    for (const [k, v] of membrosOv) {
      const [eid, fid] = k.split('|')
      const atual = equipes.find((e) => e.id === eid)?.membros.includes(fid) ?? false
      if (atual === v) next.delete(k)
    }
    if (next.size !== membrosOv.size) setMembrosOv(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipes])

  const membroDe = (equipeId: string, funcId: string) =>
    membrosOv.get(`${equipeId}|${funcId}`) ??
    (equipes?.find((e) => e.id === equipeId)?.membros.includes(funcId) ?? false)

  const funcOptions = useMemo(
    () =>
      (funcionarios ?? [])
        .filter((f) => f.ativo)
        .map((f) => ({ id: f.id, name: f.nome, subtitle: f.cargo ?? undefined })),
    [funcionarios],
  )

  const nomeDe = (id: string) => {
    const f = funcionarios?.find((x) => x.id === id)
    return f?.apelido || f?.nome || '?'
  }

  const abrirNovo = () => {
    setEditId(null)
    setNome('')
    setMembros([])
    setModalOpen(true)
  }

  const abrirEdicao = (e: EquipeComMembros) => {
    setEditId(e.id)
    setNome(e.nome)
    setMembros(e.membros)
    setModalOpen(true)
  }

  const toggleMembro = (equipe: EquipeComMembros, funcId: string, on: boolean) => {
    if (!fazendaId) return
    const key = `${equipe.id}|${funcId}`
    setMembrosOv((m) => new Map(m).set(key, on))
    const atuais = new Set(equipe.membros.filter((id) => id !== funcId))
    if (on) atuais.add(funcId)
    save.mutate(
      { id: equipe.id, fazendaId, nome: equipe.nome, membroIds: [...atuais] },
      {
        onSuccess: () => toast.success('Equipe atualizada'),
        onError: () => {
          setMembrosOv((m) => {
            const n = new Map(m)
            n.delete(key)
            return n
          })
          toast.error('Erro ao atualizar equipe')
        },
      },
    )
  }

  const salvar = () => {
    if (!fazendaId) return
    if (!nome.trim()) {
      toast.error('Informe o nome da equipe')
      return
    }
    save.mutate(
      { id: editId ?? undefined, fazendaId, nome: nome.trim(), membroIds: membros },
      {
        onSuccess: () => {
          toast.success(editId ? 'Equipe atualizada' : 'Equipe criada')
          setModalOpen(false)
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Erro ao salvar'),
      },
    )
  }

  return (
    <div className="space-y-4">
      {!!equipes?.length && !!funcionarios?.length && (
        <Card className="p-4" disableHover>
          <h4 className="m-0 text-sm font-bold text-content-strong">
            Quem faz parte de cada equipe
          </h4>
          <p className="mt-1 mb-3 text-[13px] text-content-muted">
            Define o que cada pessoa vê no aplicativo: as tarefas em nome dela e as das equipes
            marcadas aqui.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-content-faint border-b border-border-base">
                  <th className="py-2 pr-3 font-semibold">Pessoa</th>
                  {equipes.map((e) => (
                    <th key={e.id} className="py-2 px-2 font-semibold text-center whitespace-nowrap">
                      {e.nome}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {funcionarios
                  .filter((f) => f.ativo)
                  .map((f) => (
                    <tr key={f.id} className="border-b border-border-subtle last:border-0">
                      <td className="py-2 pr-3">
                        <b className="font-semibold text-content-strong">{f.apelido || f.nome}</b>{' '}
                        <span className="text-xs text-content-faint">{f.cargo ?? ''}</span>
                      </td>
                      {equipes.map((e) => (
                        <td key={e.id} className="py-2 px-2 text-center">
                          <input
                            type="checkbox"
                            checked={membroDe(e.id, f.id)}
                            onChange={(ev) => toggleMembro(e, f.id, ev.target.checked)}
                            aria-label={`${f.apelido || f.nome} em ${e.nome}`}
                            className="w-4 h-4 accent-primary"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="flex justify-between items-center">
        <p className="text-sm text-content-muted">
          Equipes do Farm Plan (N:N — uma pessoa pode estar em várias equipes).
        </p>
        <Button onClick={abrirNovo}>+ Nova equipe</Button>
      </div>

      {isLoading ? (
        <PageSkeleton />
      ) : !equipes?.length ? (
        <EmptyState title="Nenhuma equipe" description="Crie a primeira equipe de execução." />
      ) : (
        <div className="space-y-2">
          {equipes.map((e) => (
            <Card key={e.id} className="p-4 flex items-center justify-between gap-3" disableHover>
              <div className="min-w-0">
                <p className="font-semibold text-content-strong">{e.nome}</p>
                <p className="text-xs text-content-muted mt-0.5">
                  {e.membros.length
                    ? e.membros.map(nomeDe).join(', ')
                    : 'Sem membros'}
                </p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Button variant="secondary" size="sm" onClick={() => abrirEdicao(e)}>
                  Editar
                </Button>
                <Button variant="danger" size="sm" onClick={() => setConfirmId(e.id)}>
                  Excluir
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? 'Editar equipe' : 'Nova equipe'}
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Nome da equipe"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
          />
          <MultiSelect
            label="Membros"
            options={funcOptions}
            value={membros}
            onChange={setMembros}
            placeholder="Selecione os membros"
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

      <ConfirmModal
        isOpen={!!confirmId}
        onClose={() => setConfirmId(null)}
        onConfirm={() => {
          if (confirmId) {
            del.mutate(confirmId, {
              onSuccess: () => toast.success('Equipe excluída'),
              onError: () => toast.error('Erro ao excluir'),
            })
          }
          setConfirmId(null)
        }}
        title="Excluir equipe"
        message="A equipe será desativada. Atividades que a usam como executor ficam sem executor."
        confirmText="Excluir"
      />
    </div>
  )
}
