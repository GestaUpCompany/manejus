import { useEffect, useMemo, useState } from 'react'
import { useAuth, getFazendaIdForUser, formatDate, toFarmDateOnly, useLotes } from '@gestaup/shared'
import { Button, Card, ConfirmModal, EmptyState, Input, PageSkeleton, Select, useToast } from '@gestaup/ui'
import {
  useAplicacoesDeLote,
  useCategoriasDoLote,
  useExcluirAplicacao,
  useLancarAplicacaoLote,
  useLotesEmCarencia,
  useMedicamentosCatalogo,
  type AplicacaoDeLote,
} from '../../hooks/useSanidade'
import {
  TIPOS_APLICACAO,
  aplicarMedicamentoNoForm,
  formVazioAplicacaoLote,
  validarAplicacaoLote,
  type FormAplicacaoLote,
  type TipoAplicacao,
} from '../../utils/sanidade'

const th = 'px-3 py-2 text-left text-xs font-semibold text-content-muted uppercase'
const td = 'px-3 py-2 text-sm text-content'

/** Manejo sanitário em lote: um evento por lote (e categoria), com o número de cabeças; não altera a contagem do lote. */
export function ManejoSanitario() {
  const { user } = useAuth()
  const toast = useToast()
  const [fazendaId, setFazendaId] = useState<string | undefined>(undefined)
  const [carregando, setCarregando] = useState(true)
  const hoje = toFarmDateOnly(new Date().toISOString()) ?? new Date().toISOString().slice(0, 10)

  const { data: lotes = [] } = useLotes(fazendaId)
  const catalogo = useMedicamentosCatalogo(fazendaId)
  const aplicacoes = useAplicacoesDeLote(fazendaId)
  const emCarencia = useLotesEmCarencia(fazendaId)
  const lancar = useLancarAplicacaoLote(fazendaId)
  const excluir = useExcluirAplicacao()

  const [form, setForm] = useState<FormAplicacaoLote>(() => formVazioAplicacaoLote(hoje))
  const [erros, setErros] = useState<string[]>([])
  const [paraExcluir, setParaExcluir] = useState<AplicacaoDeLote | null>(null)
  const categorias = useCategoriasDoLote(form.loteId || undefined)

  useEffect(() => {
    if (!user) return
    getFazendaIdForUser(user.id)
      .then((id) => setFazendaId(id ?? undefined))
      .finally(() => setCarregando(false))
  }, [user])

  const nomeLote = useMemo(() => new Map(lotes.map((l) => [l.id, l.nome])), [lotes])

  // Sugestão de cabeças: a contagem atual da categoria escolhida (ou do lote todo). O usuário pode ajustar.
  const sugestao = useMemo(() => {
    const lista = categorias.data ?? []
    if (form.categoria !== '') return lista.find((c) => c.categoria === form.categoria)?.quant_atual ?? null
    return lista.length > 0 ? lista.reduce((s, c) => s + (c.quant_atual ?? 0), 0) : null
  }, [categorias.data, form.categoria])

  const escolherLote = (loteId: string) => setForm((f) => ({ ...f, loteId, categoria: '', numeroCabecas: '' }))
  const escolherProduto = (id: string) =>
    setForm((f) => ({ ...f, ...aplicarMedicamentoNoForm(f, (catalogo.data ?? []).find((m) => m.id === id) ?? null) }))

  const gravar = async () => {
    const lista = validarAplicacaoLote(form, hoje)
    setErros(lista)
    if (lista.length > 0) return
    try {
      await lancar.mutateAsync(form)
      toast.success(`${form.tipo} registrada no lote.`)
      setForm(formVazioAplicacaoLote(hoje))
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  const confirmarExclusao = async () => {
    if (!paraExcluir) return
    try {
      await excluir.mutateAsync(paraExcluir.id)
      toast.success('Aplicação excluída.')
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setParaExcluir(null)
    }
  }

  if (carregando) return <PageSkeleton />
  if (!fazendaId) return <EmptyState title="Fazenda não encontrada" />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-content-strong">Manejo sanitário em lote</h1>
        <p className="text-sm text-content-muted mt-1">
          Registra uma vacinação, vermifugação ou tratamento feito em um lote inteiro (ou em uma categoria dele). A contagem do lote não muda;
          para saber quais animais, lance a aplicação na aba Sanidade da ficha de cada um.
        </p>
      </div>

      <Card className="p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-content-strong mb-4">Lançar aplicação em lote</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select
            label="Tipo"
            value={form.tipo}
            onChange={(v) => setForm((f) => ({ ...f, tipo: v as TipoAplicacao }))}
            options={TIPOS_APLICACAO.map((t) => ({ value: t, label: t }))}
          />
          <Input label="Data" type="date" max={hoje} value={form.data} onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))} />
          <Select
            label="Lote"
            value={form.loteId}
            onChange={escolherLote}
            options={[{ value: '', label: 'Selecione...' }, ...lotes.map((l) => ({ value: l.id, label: l.nome }))]}
          />
          <Select
            label="Categoria (opcional)"
            value={form.categoria}
            onChange={(v) => setForm((f) => ({ ...f, categoria: v, numeroCabecas: '' }))}
            options={[
              { value: '', label: 'Todas as categorias do lote' },
              ...(categorias.data ?? []).map((c) => ({ value: c.categoria, label: `${c.categoria} (${c.quant_atual} cab.)` })),
            ]}
          />
          <Input
            label={sugestao != null ? `Cabeças que receberam (lote tem ${sugestao})` : 'Cabeças que receberam'}
            inputMode="numeric"
            value={form.numeroCabecas}
            onChange={(e) => setForm((f) => ({ ...f, numeroCabecas: e.target.value }))}
            placeholder={sugestao != null ? String(sugestao) : ''}
          />
          <Select
            label="Produto do catálogo (opcional)"
            value={form.medicamentoId}
            onChange={escolherProduto}
            options={[
              { value: '', label: 'Outro produto (digitar)' },
              ...(catalogo.data ?? []).map((m) => ({ value: m.id, label: `${m.nome_comercial} (${m.principio_ativo})` })),
            ]}
          />
          <Input label="Produto aplicado" value={form.medicamentoNome} onChange={(e) => setForm((f) => ({ ...f, medicamentoNome: e.target.value }))} />
          <Input label="Dose (opcional)" value={form.dose} onChange={(e) => setForm((f) => ({ ...f, dose: e.target.value }))} />
          <Input label="Via de aplicação (opcional)" value={form.via} onChange={(e) => setForm((f) => ({ ...f, via: e.target.value }))} />
          <Input
            label="Carência para abate (dias)"
            inputMode="numeric"
            value={form.carenciaDias}
            onChange={(e) => setForm((f) => ({ ...f, carenciaDias: e.target.value }))}
          />
          <Input
            label="Reaplicar em (dias)"
            inputMode="numeric"
            value={form.intervaloDias}
            onChange={(e) => setForm((f) => ({ ...f, intervaloDias: e.target.value }))}
          />
          <Input label="Partida do produto (opcional)" value={form.loteProduto} onChange={(e) => setForm((f) => ({ ...f, loteProduto: e.target.value }))} />
          <Input
            label="Validade do produto (opcional)"
            type="date"
            value={form.validadeProduto}
            onChange={(e) => setForm((f) => ({ ...f, validadeProduto: e.target.value }))}
          />
          <div className="md:col-span-2">
            <Input label="Observação (opcional)" value={form.observacao} onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))} />
          </div>
        </div>
        {erros.length > 0 && (
          <ul className="text-sm text-red-600 list-disc pl-5 mt-3">
            {erros.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <div className="flex justify-end mt-4">
          <Button onClick={gravar} disabled={lancar.isPending}>
            {lancar.isPending ? 'Gravando...' : 'Registrar aplicação'}
          </Button>
        </div>
      </Card>

      <Card className="p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-content-strong mb-3">Lotes em carência</h2>
        {emCarencia.isLoading ? (
          <p className="text-content-muted">Carregando...</p>
        ) : (emCarencia.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-content-muted">Nenhum lote em carência hoje.</p>
        ) : (
          <ul className="space-y-2">
            {emCarencia.data!.map((c) => (
              <li key={`${c.lote_id}-${c.categoria ?? ''}`} className="text-sm px-3 py-2 rounded-lg bg-red-500/10 text-red-800 dark:text-red-200">
                ⛔ {nomeLote.get(c.lote_id) ?? 'Lote'}
                {c.categoria ? ` (${c.categoria})` : ''}: libera para abate em {formatDate(c.liberacao_abate_em)} ({c.medicamento_nome})
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-content-strong mb-3">Aplicações em lote recentes</h2>
        {aplicacoes.isLoading ? (
          <p className="text-content-muted">Carregando...</p>
        ) : (aplicacoes.data?.length ?? 0) === 0 ? (
          <EmptyState title="Nenhuma aplicação em lote registrada" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-2 border-b border-border-base">
                <tr>
                  <th className={th}>Data</th>
                  <th className={th}>Lote</th>
                  <th className={th}>Produto</th>
                  <th className={th}>Tipo</th>
                  <th className={th}>Cabeças</th>
                  <th className={th}>Carência até</th>
                  <th className={th}>Próxima</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-base">
                {aplicacoes.data!.map((a) => (
                  <tr key={a.id}>
                    <td className={td}>{formatDate(a.data)}</td>
                    <td className={td}>
                      {a.lote?.nome ?? '-'}
                      {a.categoria ? ` (${a.categoria})` : ''}
                    </td>
                    <td className={td}>
                      {a.medicamento_nome}
                      {a.dose_aplicada ? ` · ${a.dose_aplicada}` : ''}
                    </td>
                    <td className={td}>{a.tipo}</td>
                    <td className={td}>{a.numero_cabecas ?? '-'}</td>
                    <td className={td}>{a.liberacao_abate_em ? formatDate(a.liberacao_abate_em) : '-'}</td>
                    <td className={td}>{a.proxima_aplicacao_em ? formatDate(a.proxima_aplicacao_em) : '-'}</td>
                    <td className={td}>
                      <button onClick={() => setParaExcluir(a)} className="text-red-600 hover:underline text-sm">
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
        title="Excluir aplicação"
        message={paraExcluir ? `Excluir ${paraExcluir.medicamento_nome} de ${formatDate(paraExcluir.data)}? A carência dela deixa de valer.` : ''}
        confirmText="Excluir"
      />
    </div>
  )
}
