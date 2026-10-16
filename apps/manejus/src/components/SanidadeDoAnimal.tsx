import { useMemo, useState } from 'react'
import { formatDate } from '@gestaup/shared'
import { Button, ConfirmModal, DetailSection, EmptyState, Input, Modal, Select, useToast } from '@gestaup/ui'
import {
  useExcluirAplicacao,
  useHistoricoSanitario,
  useLancarAplicacao,
  useMedicamentosCatalogo,
  type HistoricoSanitarioRow,
} from '../hooks/useSanidade'
import {
  TIPOS_APLICACAO,
  aplicarMedicamentoNoForm,
  carenciaAtiva,
  dosesAVencer,
  formVazioAplicacao,
  textoCarencia,
  textoDose,
  validarAplicacao,
  type FormAplicacao,
  type TipoAplicacao,
} from '../utils/sanidade'

interface Props {
  individuoId: string
  fazendaId: string
  /** AAAA-MM-DD na fazenda */
  hoje: string
}

const th = 'px-3 py-2 text-left text-xs font-semibold text-content-muted uppercase'
const td = 'px-3 py-2 text-sm text-content'

const ROTULO_ORIGEM: Record<HistoricoSanitarioRow['origem'], string> = {
  aplicacao: 'Aplicação',
  enfermaria: 'Enfermaria',
  maternidade: 'Maternidade',
}

function detalhe(l: HistoricoSanitarioRow): string {
  const partes: string[] = []
  if (l.principio_ativo) partes.push(l.principio_ativo)
  if (l.dose) partes.push(`dose ${l.dose}`)
  if (l.diagnostico) partes.push(l.diagnostico)
  if (l.liberacao_abate_em) partes.push(`libera para abate em ${formatDate(l.liberacao_abate_em)}`)
  if (l.proxima_aplicacao_em) partes.push(`próxima em ${formatDate(l.proxima_aplicacao_em)}`)
  return partes.length > 0 ? partes.join(' · ') : '-'
}

/** Aba Sanidade da ficha do animal: carência ativa, doses a vencer, histórico unificado e lançamento de aplicações. */
export function SanidadeDoAnimal({ individuoId, fazendaId, hoje }: Props) {
  const toast = useToast()
  const historico = useHistoricoSanitario(individuoId)
  const catalogo = useMedicamentosCatalogo(fazendaId)
  const lancar = useLancarAplicacao(fazendaId, individuoId)
  const excluir = useExcluirAplicacao()

  const [aberto, setAberto] = useState(false)
  const [form, setForm] = useState<FormAplicacao>(() => formVazioAplicacao(hoje))
  const [erros, setErros] = useState<string[]>([])
  const [paraExcluir, setParaExcluir] = useState<HistoricoSanitarioRow | null>(null)

  const linhas = useMemo(() => historico.data ?? [], [historico.data])
  const carencia = useMemo(() => carenciaAtiva(linhas, hoje), [linhas, hoje])
  const doses = useMemo(() => dosesAVencer(linhas, hoje), [linhas, hoje])

  const abrir = () => {
    setForm(formVazioAplicacao(hoje))
    setErros([])
    setAberto(true)
  }

  const escolherProduto = (id: string) =>
    setForm((f) => aplicarMedicamentoNoForm(f, (catalogo.data ?? []).find((m) => m.id === id) ?? null))

  const gravar = async () => {
    const lista = validarAplicacao(form, hoje)
    setErros(lista)
    if (lista.length > 0) return
    try {
      await lancar.mutateAsync(form)
      toast.success(`${form.tipo} registrada.`)
      setAberto(false)
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  const confirmarExclusao = async () => {
    if (!paraExcluir) return
    try {
      await excluir.mutateAsync(paraExcluir.origem_id)
      toast.success('Aplicação excluída.')
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setParaExcluir(null)
    }
  }

  return (
    <div className="space-y-6">
      <DetailSection title="Situação sanitária" highlighted>
        {historico.isLoading ? (
          <p className="text-content-muted">Carregando...</p>
        ) : historico.error ? (
          <p className="text-red-500">Não foi possível carregar o histórico sanitário.</p>
        ) : (
          <div className="space-y-2">
            {carencia ? (
              <p className="text-sm px-3 py-2 rounded-lg bg-red-500/10 text-red-800 dark:text-red-200">⛔ {textoCarencia(carencia)}</p>
            ) : (
              <p className="text-sm px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-800 dark:text-emerald-200">Sem carência ativa.</p>
            )}
            {doses.map((d) => (
              <p key={d.medicamento} className="text-sm px-3 py-2 rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-200">
                ⚠️ {textoDose(d)}
              </p>
            ))}
            <p className="text-xs text-content-muted">
              Calculado das aplicações lançadas aqui. O histórico da Enfermaria e da Maternidade aparece na lista, sem carência. Esta informação só avisa: não bloqueia nenhuma operação.
            </p>
          </div>
        )}
      </DetailSection>

      <DetailSection title="Histórico sanitário">
        <div className="flex justify-end mb-3">
          <Button onClick={abrir}>Lançar aplicação</Button>
        </div>
        {linhas.length === 0 && !historico.isLoading ? (
          <EmptyState title="Nenhuma aplicação ou tratamento registrado" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-2 border-b border-border-base">
                <tr>
                  <th className={th}>Data</th>
                  <th className={th}>Produto</th>
                  <th className={th}>Tipo</th>
                  <th className={th}>Detalhes</th>
                  <th className={th}>Origem</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-base">
                {linhas.map((l, i) => (
                  <tr key={`${l.origem}-${l.origem_id}-${i}`}>
                    <td className={td}>{formatDate(l.data)}</td>
                    <td className={td}>{l.medicamento_nome}</td>
                    <td className={td}>{l.tipo ?? '-'}</td>
                    <td className={td}>{detalhe(l)}</td>
                    <td className={td}>{ROTULO_ORIGEM[l.origem]}</td>
                    <td className={td}>
                      {l.origem === 'aplicacao' && (
                        <button onClick={() => setParaExcluir(l)} className="text-red-600 hover:underline text-sm">
                          Excluir
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DetailSection>

      <Modal isOpen={aberto} onClose={() => setAberto(false)} title="Lançar aplicação sanitária" size="md">
        <div className="space-y-4">
          <Select
            label="Tipo"
            value={form.tipo}
            onChange={(v) => setForm((f) => ({ ...f, tipo: v as TipoAplicacao }))}
            options={TIPOS_APLICACAO.map((t) => ({ value: t, label: t }))}
          />
          <Input label="Data" type="date" max={hoje} value={form.data} onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))} />
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
          <div className="grid grid-cols-2 gap-4">
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
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Partida do produto (opcional)" value={form.loteProduto} onChange={(e) => setForm((f) => ({ ...f, loteProduto: e.target.value }))} />
            <Input
              label="Validade do produto (opcional)"
              type="date"
              value={form.validadeProduto}
              onChange={(e) => setForm((f) => ({ ...f, validadeProduto: e.target.value }))}
            />
          </div>
          {form.tipo === 'Tratamento' && (
            <Input label="Diagnóstico (opcional)" value={form.diagnostico} onChange={(e) => setForm((f) => ({ ...f, diagnostico: e.target.value }))} />
          )}
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
            <Button onClick={gravar} disabled={lancar.isPending}>
              {lancar.isPending ? 'Gravando...' : 'Gravar'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!paraExcluir}
        onClose={() => setParaExcluir(null)}
        onConfirm={confirmarExclusao}
        title="Excluir aplicação"
        message={paraExcluir ? `Excluir ${paraExcluir.medicamento_nome} de ${formatDate(paraExcluir.data)}? A carência e a próxima dose dela deixam de valer.` : ''}
        confirmText="Excluir"
      />
    </div>
  )
}
