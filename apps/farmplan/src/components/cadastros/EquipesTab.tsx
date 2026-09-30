import { useMemo, useState } from 'react'
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
