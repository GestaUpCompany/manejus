import { useEffect, useState } from 'react'
import { useAuth, getFazendaIdForUser, formatDate, toFarmDateOnly } from '@gestaup/shared'
import { Button, Card, ConfirmModal, EmptyState, Input, Modal, PageSkeleton, Table, Thead, Tbody, Tr, Th, Td, useToast } from '@gestaup/ui'
import { useEstacoesMonta, useExcluirEstacao, useSalvarEstacao, type EstacaoMonta } from '../../hooks/useReproducao'
import { validarEstacao, type FormEstacao } from '../../utils/reproducao'

const FORM_VAZIO: FormEstacao = { nome: '', dataInicio: '', dataFim: '', observacao: '' }

export function EstacoesMonta() {
  const { user } = useAuth()
  const toast = useToast()
  const [fazendaId, setFazendaId] = useState<string | undefined>(undefined)
  const [carregandoFazenda, setCarregandoFazenda] = useState(true)
  const estacoes = useEstacoesMonta(fazendaId)
  const salvar = useSalvarEstacao(fazendaId)
  const excluir = useExcluirEstacao()

  const [aberto, setAberto] = useState(false)
  const [editandoId, setEditandoId] = useState<string | undefined>(undefined)
  const [form, setForm] = useState<FormEstacao>(FORM_VAZIO)
  const [erros, setErros] = useState<string[]>([])
  const [paraExcluir, setParaExcluir] = useState<EstacaoMonta | null>(null)

  useEffect(() => {
    if (!user) return
    getFazendaIdForUser(user.id)
      .then((id) => setFazendaId(id ?? undefined))
      .finally(() => setCarregandoFazenda(false))
  }, [user])

  const hoje = toFarmDateOnly(new Date().toISOString()) ?? new Date().toISOString().slice(0, 10)

  const novo = () => {
    setEditandoId(undefined)
    setForm({ ...FORM_VAZIO, dataInicio: hoje, dataFim: hoje })
    setErros([])
    setAberto(true)
  }

  const editar = (e: EstacaoMonta) => {
    setEditandoId(e.id)
    setForm({ nome: e.nome, dataInicio: e.data_inicio, dataFim: e.data_fim, observacao: e.observacao ?? '' })
    setErros([])
    setAberto(true)
  }

  const gravar = async () => {
    const lista = validarEstacao(form)
    setErros(lista)
    if (lista.length > 0) return
    try {
      await salvar.mutateAsync({ id: editandoId, form })
      toast.success(editandoId ? 'Estação atualizada.' : 'Estação criada.')
      setAberto(false)
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  const confirmarExclusao = async () => {
    if (!paraExcluir) return
    try {
      await excluir.mutateAsync(paraExcluir.id)
      toast.success('Estação excluída. Os eventos já lançados continuam, sem estação.')
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setParaExcluir(null)
    }
  }

  if (carregandoFazenda || estacoes.isLoading) return <PageSkeleton variant="list" />

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-content-strong">Estações de Monta</h2>
          <p className="text-sm text-content-muted mt-1 max-w-2xl">
            Períodos de cobertura e inseminação da fazenda. Escolha a estação ao lançar o evento reprodutivo na ficha da fêmea.
          </p>
        </div>
        <Button onClick={novo}>Nova estação</Button>
      </div>

      {(estacoes.data?.length ?? 0) === 0 ? (
        <EmptyState title="Nenhuma estação de monta cadastrada" description="Crie a primeira para agrupar as coberturas e inseminações." />
      ) : (
        <Card className="bg-surface-1 overflow-x-auto" disableHover>
          <Table>
            <Thead>
              <Tr>
                <Th>Nome</Th>
                <Th>Início</Th>
                <Th>Fim</Th>
                <Th>Observação</Th>
                <Th> </Th>
              </Tr>
            </Thead>
            <Tbody>
              {estacoes.data!.map((e) => (
                <Tr key={e.id}>
                  <Td>{e.nome}</Td>
                  <Td>{formatDate(e.data_inicio)}</Td>
                  <Td>{formatDate(e.data_fim)}</Td>
                  <Td>{e.observacao || '-'}</Td>
                  <Td>
                    <span className="flex gap-3 text-sm">
                      <button className="text-primary hover:underline" onClick={() => editar(e)}>
                        Editar
                      </button>
                      <button className="text-red-600 hover:underline" onClick={() => setParaExcluir(e)}>
                        Excluir
                      </button>
                    </span>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Card>
      )}

      <Modal isOpen={aberto} onClose={() => setAberto(false)} title={editandoId ? 'Editar estação de monta' : 'Nova estação de monta'} size="sm">
        <div className="space-y-4">
          <Input label="Nome" value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Ex: Estação 2026/2027" />
          <Input label="Início" type="date" value={form.dataInicio} onChange={(e) => setForm((f) => ({ ...f, dataInicio: e.target.value }))} />
          <Input label="Fim" type="date" value={form.dataFim} onChange={(e) => setForm((f) => ({ ...f, dataFim: e.target.value }))} />
          <Input label="Observação (opcional)" value={form.observacao} onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))} />
          {erros.length > 0 && (
            <ul className="text-sm text-red-600 list-disc pl-5">
              {erros.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={gravar} disabled={salvar.isPending}>
              {salvar.isPending ? 'Gravando...' : 'Gravar'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!paraExcluir}
        onClose={() => setParaExcluir(null)}
        onConfirm={confirmarExclusao}
        title="Excluir estação de monta"
        message={paraExcluir ? `Excluir "${paraExcluir.nome}"? Os eventos reprodutivos já lançados continuam, só perdem o vínculo com a estação.` : ''}
        confirmText="Excluir"
      />
    </div>
  )
}
