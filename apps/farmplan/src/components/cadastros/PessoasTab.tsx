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
import { useSetores, useSaveFuncionario } from '../../services/cadastrosService'
import type { FuncionarioInput } from '../../services/cadastrosService'
import type { FuncionarioFp } from '../../types/farmplan'

const PAPEL_LABEL: Record<string, string> = {
  colaborador: 'Colaborador',
  lider: 'Líder',
  gestor: 'Gestor',
}

const FORM_VAZIO = {
  nome: '',
  apelido: '',
  cargo: '',
  setor_id: '',
  superior_id: '',
  farmplan_papel: 'colaborador',
  ativo: true,
}

export function PessoasTab() {
  const { user } = useAuth()
  const { data: fazenda } = useFazenda(user?.id)
  const fazendaId = fazenda?.id
  const { data: funcionarios, isLoading } = useFuncionariosFp(fazendaId)
  const { data: setores } = useSetores(fazendaId)
  const save = useSaveFuncionario()
  const toast = useToast()

  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(FORM_VAZIO)

  const funcOptions = useMemo(
    () =>
      (funcionarios ?? [])
        .filter((f) => f.ativo && f.id !== editId)
        .map((f) => ({ value: f.id, label: f.nome })),
    [funcionarios, editId],
  )
  const setorOptions = (setores ?? []).filter((s) => s.ativo).map((s) => ({ value: s.id, label: s.nome }))

  const nomeDe = (id: string | null) => funcionarios?.find((f) => f.id === id)?.nome
  const setorDe = (id: string | null) => setores?.find((s) => s.id === id)?.nome

  const abrirNovo = () => {
    setEditId(null)
    setForm(FORM_VAZIO)
    setModalOpen(true)
  }

  const abrirEdicao = (f: FuncionarioFp) => {
    setEditId(f.id)
    setForm({
      nome: f.nome,
      apelido: f.apelido ?? '',
      cargo: f.cargo ?? '',
      setor_id: f.setor_id ?? '',
      superior_id: f.superior_id ?? '',
      farmplan_papel: f.farmplan_papel ?? 'colaborador',
      ativo: f.ativo,
    })
    setModalOpen(true)
  }

  const salvar = () => {
    if (!fazendaId) return
    if (!form.nome.trim()) {
      toast.error('Informe o nome')
      return
    }
    const input: FuncionarioInput = {
      id: editId ?? undefined,
      fazenda_id: fazendaId,
      nome: form.nome.trim(),
      apelido: form.apelido.trim() || null,
      cargo: form.cargo.trim() || null,
      setor_id: form.setor_id || null,
      superior_id: form.superior_id || null,
      farmplan_papel: form.farmplan_papel,
      ativo: form.ativo,
    }
    save.mutate(input, {
      onSuccess: () => {
        toast.success(editId ? 'Pessoa atualizada' : 'Pessoa cadastrada')
        setModalOpen(false)
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Erro ao salvar'),
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-content-muted">
          Cadastro compartilhado com o Manejus e o PWA. Aqui ficam os campos do Farm Plan
          (apelido, superior, papel).
        </p>
        <Button onClick={abrirNovo}>+ Nova pessoa</Button>
      </div>

      {isLoading ? (
        <PageSkeleton />
      ) : !funcionarios?.length ? (
        <EmptyState title="Nenhuma pessoa cadastrada" description="Cadastre o primeiro colaborador." />
      ) : (
        <div className="space-y-2">
          {funcionarios.map((f) => (
            <Card key={f.id} className="p-4 flex items-center justify-between gap-3" disableHover>
              <div className="min-w-0">
                <p className="font-semibold text-content-strong">
                  {f.apelido ? `${f.apelido} — ${f.nome}` : f.nome}
                  {!f.ativo && <span className="text-xs text-content-faint ml-2">(inativo)</span>}
                </p>
                <p className="text-xs text-content-muted mt-0.5">
                  {[f.cargo, setorDe(f.setor_id), PAPEL_LABEL[f.farmplan_papel] ?? f.farmplan_papel]
                    .filter(Boolean)
                    .join(' · ')}
                  {f.superior_id ? ` · resp. ${nomeDe(f.superior_id)}` : ''}
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => abrirEdicao(f)}>
                Editar
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editId ? 'Editar pessoa' : 'Nova pessoa'}
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Nome completo"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Apelido / nome de chamada"
              value={form.apelido}
              onChange={(e) => setForm({ ...form, apelido: e.target.value })}
            />
            <Input
              label="Cargo"
              value={form.cargo}
              onChange={(e) => setForm({ ...form, cargo: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Setor"
              options={setorOptions}
              value={form.setor_id}
              onChange={(v) => setForm({ ...form, setor_id: v })}
            />
            <Select
              label="Superior direto"
              options={funcOptions}
              value={form.superior_id}
              onChange={(v) => setForm({ ...form, superior_id: v })}
              placeholder="Ninguém acima"
            />
          </div>
          <Select
            label="Papel no Farm Plan"
            options={Object.entries(PAPEL_LABEL).map(([value, label]) => ({ value, label }))}
            value={form.farmplan_papel}
            onChange={(v) => setForm({ ...form, farmplan_papel: v })}
          />
          <label className="flex items-center gap-2 text-sm text-content">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
            />
            Ativo
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
    </div>
  )
}
