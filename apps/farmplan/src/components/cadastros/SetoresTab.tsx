import { useMemo, useState } from 'react'
import { useAuth, useFazenda } from '@gestaup/shared'
import {
  Card,
  Input,
  Select,
  Button,
  Modal,
  EmptyState,
  PageSkeleton,
  useToast,
} from '@gestaup/ui'
import { useFuncionariosFp } from '../../services/farmplanService'
import { useSetores, useSaveSetor } from '../../services/cadastrosService'
import type { SetorFp } from '../../services/cadastrosService'

export function SetoresTab() {
  const { user } = useAuth()
  const { data: fazenda } = useFazenda(user?.id)
  const fazendaId = fazenda?.id
  const { data: setores, isLoading } = useSetores(fazendaId)
  const { data: funcionarios } = useFuncionariosFp(fazendaId)
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
        .map((f) => ({ value: f.id, label: f.nome })),
    [funcionarios],
  )

  const nomeDe = (id: string | null) => {
    if (!id) return null
    const f = funcionarios?.find((x) => x.id === id)
    return f?.apelido || f?.nome
  }

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

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-content-muted">
          Setores compartilhados com o Manejus. O responsável é o dono do setor no Farm Plan.
        </p>
        <Button onClick={abrirNovo}>+ Novo setor</Button>
      </div>

      {isLoading ? (
        <PageSkeleton />
      ) : !setores?.length ? (
        <EmptyState title="Nenhum setor" description="Cadastre os setores da fazenda." />
      ) : (
        <div className="space-y-2">
          {setores.map((s) => (
            <Card key={s.id} className="p-4 flex items-center justify-between gap-3" disableHover>
              <div className="min-w-0">
                <p className="font-semibold text-content-strong">
                  {s.nome}
                  {!s.ativo && <span className="text-xs text-content-faint ml-2">(inativo)</span>}
                </p>
                <p className="text-xs text-content-muted mt-0.5">
                  {nomeDe(s.responsavel_id) ? `Dono: ${nomeDe(s.responsavel_id)}` : 'Sem responsável'}
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => abrirEdicao(s)}>
                Editar
              </Button>
            </Card>
          ))}
        </div>
      )}

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
