import { useState } from 'react'
import { formatDate } from '@gestaup/shared'
import { Button, Card, ConfirmModal, EmptyState, Input, Select, useToast } from '@gestaup/ui'
import {
  useAtivarProgramacao,
  useExcluirProgramacao,
  useMedicamentosCatalogo,
  usePendenciasCalendario,
  useProgramacoesSanitarias,
  useSalvarProgramacao,
} from '../hooks/useSanidade'
import {
  MODELOS_PROGRAMACAO,
  agruparPendencias,
  formDaProgramacao,
  formDoModelo,
  formVazioProgramacao,
  rotuloPeriodo,
  textoPrazo,
  validarProgramacao,
  type FormProgramacao,
  type ProgramacaoSanitaria,
} from '../utils/calendarioSanitario'
import { TIPOS_APLICACAO, type TipoAplicacao } from '../utils/sanidade'

const th = 'px-3 py-2 text-left text-xs font-semibold text-content-muted uppercase'
const td = 'px-3 py-2 text-sm text-content'

/**
 * Calendário sanitário: programações de campanhas por fazenda e as pendências (campanha esperada, lote sem aplicação).
 * Só avisa; não altera contagem nem bloqueia nada. Para dar a campanha por feita, lance a aplicação do produto no lote.
 */
export function CalendarioSanitario({ fazendaId }: { fazendaId: string }) {
  const toast = useToast()
  const programacoes = useProgramacoesSanitarias(fazendaId)
  const pendencias = usePendenciasCalendario(fazendaId)
  const catalogo = useMedicamentosCatalogo(fazendaId)
  const salvar = useSalvarProgramacao(fazendaId)
  const ativar = useAtivarProgramacao()
  const excluir = useExcluirProgramacao()

  const [aberto, setAberto] = useState(false)
  const [editandoId, setEditandoId] = useState<string | undefined>(undefined)
  const [form, setForm] = useState<FormProgramacao>(formVazioProgramacao)
  const [erros, setErros] = useState<string[]>([])
  const [paraExcluir, setParaExcluir] = useState<ProgramacaoSanitaria | null>(null)

  const abrirNova = (inicial: FormProgramacao) => {
    setEditandoId(undefined)
    setForm(inicial)
    setErros([])
    setAberto(true)
  }
  const abrirEdicao = (p: ProgramacaoSanitaria) => {
    setEditandoId(p.id)
    setForm(formDaProgramacao(p))
    setErros([])
    setAberto(true)
  }
  const fechar = () => {
    setAberto(false)
    setEditandoId(undefined)
    setErros([])
  }

  const escolherProduto = (id: string) => {
    const med = (catalogo.data ?? []).find((m) => m.id === id)
    setForm((f) => ({ ...f, medicamentoId: id, produtoNome: med ? med.nome_comercial : f.produtoNome }))
  }

  const gravar = async () => {
    const lista = validarProgramacao(form)
    setErros(lista)
    if (lista.length > 0) return
    try {
      await salvar.mutateAsync({ form, id: editandoId })
      toast.success(editandoId ? 'Programação atualizada.' : 'Programação criada.')
      fechar()
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  const confirmarExclusao = async () => {
    if (!paraExcluir) return
    try {
      await excluir.mutateAsync(paraExcluir.id)
      toast.success('Programação excluída.')
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setParaExcluir(null)
    }
  }

  const alternar = async (p: ProgramacaoSanitaria) => {
    try {
      await ativar.mutateAsync({ id: p.id, ativo: !p.ativo })
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  const grupos = agruparPendencias(pendencias.data ?? [])
  const lista = programacoes.data ?? []

  return (
    <div className="space-y-6">
      <Card className="p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-content-strong mb-1">Campanhas pendentes</h2>
        <p className="text-sm text-content-muted mb-3">
          Lotes com campanha programada que ainda não tem aplicação do produto. Registre a aplicação no lote (abaixo) para dar a campanha por feita.
        </p>
        {pendencias.isLoading ? (
          <p className="text-content-muted">Carregando...</p>
        ) : grupos.length === 0 ? (
          <p className="text-sm text-content-muted">Nenhuma campanha pendente.</p>
        ) : (
          <div className="space-y-4">
            {grupos.map((g) => (
              <div key={g.programacaoId}>
                <h3 className="text-sm font-semibold text-content-strong">
                  {g.situacao === 'atrasada' ? '⚠️' : '📅'} {g.nome} · {g.produto} · {formatDate(g.ocorrencia)} ({textoPrazo(g.situacao, g.dias)})
                </h3>
                <ul className="mt-1 space-y-1">
                  {g.itens.map((i) => (
                    <li
                      key={`${i.lote_id}-${i.categoria}`}
                      className={`text-sm px-3 py-2 rounded-lg ${
                        g.situacao === 'atrasada' ? 'bg-amber-500/10 text-amber-800 dark:text-amber-200' : 'bg-surface-2 text-content'
                      }`}
                    >
                      {i.lote_nome} ({i.categoria}): {i.quant_atual} cab.
                      {i.cabecas_aplicadas > 0 ? ` · ${i.cabecas_aplicadas} já aplicadas` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-lg font-semibold text-content-strong">Programações</h2>
          <div className="flex flex-wrap gap-2">
            <Select
              label=""
              value=""
              onChange={(id) => {
                const m = MODELOS_PROGRAMACAO.find((x) => x.id === id)
                if (m) abrirNova(formDoModelo(m))
              }}
              options={[{ value: '', label: 'Começar de um modelo...' }, ...MODELOS_PROGRAMACAO.map((m) => ({ value: m.id, label: m.nome }))]}
            />
            <Button onClick={() => abrirNova(formVazioProgramacao())}>Nova programação</Button>
          </div>
        </div>

        {aberto && (
          <div className="border border-border-base rounded-lg p-4 mb-4 bg-surface-2">
            <h3 className="text-base font-semibold text-content-strong mb-3">{editandoId ? 'Editar programação' : 'Nova programação'}</h3>
            <p className="text-xs text-content-muted mb-3">
              As datas oficiais (aftosa, brucelose...) dependem do órgão sanitário do estado: informe a data de uma ocorrência e confirme a exigência com ele.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Nome" value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
              <Select
                label="Tipo"
                value={form.tipo}
                onChange={(v) => setForm((f) => ({ ...f, tipo: v as TipoAplicacao }))}
                options={TIPOS_APLICACAO.map((t) => ({ value: t, label: t }))}
              />
              <Select
                label="Produto do catálogo (opcional)"
                value={form.medicamentoId}
                onChange={escolherProduto}
                options={[{ value: '', label: 'Outro produto (digitar)' }, ...(catalogo.data ?? []).map((m) => ({ value: m.id, label: m.nome_comercial }))]}
              />
              <Input
                label="Produto (nome usado para achar as aplicações)"
                value={form.produtoNome}
                onChange={(e) => setForm((f) => ({ ...f, produtoNome: e.target.value }))}
              />
              <Input
                label="Categorias (separadas por vírgula; vazio = todas)"
                value={form.categorias}
                onChange={(e) => setForm((f) => ({ ...f, categorias: e.target.value }))}
                placeholder="Ex: garrote, bezerra ao pé"
              />
              <Input label="Data de uma ocorrência" type="date" value={form.dataBase} onChange={(e) => setForm((f) => ({ ...f, dataBase: e.target.value }))} />
              <Input
                label="Repetir a cada (meses)"
                inputMode="numeric"
                value={form.periodoMeses}
                onChange={(e) => setForm((f) => ({ ...f, periodoMeses: e.target.value }))}
              />
              <Input
                label="Avisar com antecedência (dias)"
                inputMode="numeric"
                value={form.antecedenciaDias}
                onChange={(e) => setForm((f) => ({ ...f, antecedenciaDias: e.target.value }))}
              />
              <Input
                label="Continua atrasada por (dias após a data)"
                inputMode="numeric"
                value={form.prazoDias}
                onChange={(e) => setForm((f) => ({ ...f, prazoDias: e.target.value }))}
              />
              <Input label="Observação (opcional)" value={form.observacao} onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))} />
            </div>
            {erros.length > 0 && (
              <ul className="text-sm text-red-600 list-disc pl-5 mt-3">
                {erros.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="secondary" onClick={fechar}>
                Cancelar
              </Button>
              <Button onClick={gravar} disabled={salvar.isPending}>
                {salvar.isPending ? 'Gravando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        )}

        {programacoes.isLoading ? (
          <p className="text-content-muted">Carregando...</p>
        ) : lista.length === 0 ? (
          <EmptyState title="Nenhuma programação cadastrada" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-2 border-b border-border-base">
                <tr>
                  <th className={th}>Nome</th>
                  <th className={th}>Produto</th>
                  <th className={th}>Categorias</th>
                  <th className={th}>Repete</th>
                  <th className={th}>Referência</th>
                  <th className={th}>Situação</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-base">
                {lista.map((p) => (
                  <tr key={p.id} className={p.ativo ? '' : 'opacity-60'}>
                    <td className={td}>{p.nome}</td>
                    <td className={td}>
                      {p.produto_nome} <span className="text-content-muted">· {p.tipo}</span>
                    </td>
                    <td className={td}>{p.categorias.length === 0 ? 'Todas' : p.categorias.join(', ')}</td>
                    <td className={td}>{rotuloPeriodo(p.periodo_meses)}</td>
                    <td className={td}>{formatDate(p.data_base)}</td>
                    <td className={td}>{p.ativo ? 'Ativa' : 'Inativa'}</td>
                    <td className={`${td} whitespace-nowrap space-x-3`}>
                      <button onClick={() => abrirEdicao(p)} className="text-primary hover:underline text-sm">
                        Editar
                      </button>
                      <button onClick={() => alternar(p)} className="text-primary hover:underline text-sm">
                        {p.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                      <button onClick={() => setParaExcluir(p)} className="text-red-600 hover:underline text-sm">
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmModal
        isOpen={!!paraExcluir}
        onClose={() => setParaExcluir(null)}
        onConfirm={confirmarExclusao}
        title="Excluir programação"
        message={paraExcluir ? `Excluir "${paraExcluir.nome}"? As aplicações já registradas não mudam.` : ''}
        confirmText="Excluir"
      />
    </div>
  )
}
