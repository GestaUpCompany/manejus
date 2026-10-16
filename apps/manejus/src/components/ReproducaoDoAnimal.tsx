import { useMemo, useState } from 'react'
import { formatDate } from '@gestaup/shared'
import { Button, ConfirmModal, DetailField, DetailSection, EmptyState, Input, Modal, Select, formatValue, useToast } from '@gestaup/ui'
import {
  useEstacoesMonta,
  useEventosReprodutivos,
  useExcluirEventoReprodutivo,
  useLancarEventoReprodutivo,
  useStatusReprodutivo,
  type EventoReprodutivo,
} from '../hooks/useReproducao'
import {
  CLASSE_STATUS_REPRODUTIVO,
  TIPOS_EVENTO,
  camposDoTipo,
  formVazioEvento,
  pendenciasDaFemea,
  textoPrevisaoParto,
  validarEvento,
  type FormEventoReprodutivo,
  type TipoEventoReprodutivo,
} from '../utils/reproducao'

interface Props {
  individuoId: string
  fazendaId: string
  sexo: string | null | undefined
  /** AAAA-MM-DD na fazenda */
  hoje: string
}

const th = 'px-3 py-2 text-left text-xs font-semibold text-content-muted uppercase'
const td = 'px-3 py-2 text-sm text-content'

function detalhe(e: EventoReprodutivo): string {
  const partes: string[] = []
  if (e.touro_nome) partes.push(`touro ${e.touro_nome}`)
  if (e.semen_partida) partes.push(`partida ${e.semen_partida}`)
  if (e.tecnico) partes.push(`técnico ${e.tecnico}`)
  if (e.resultado) partes.push(e.resultado + (e.metodo_diagnostico ? ` (${e.metodo_diagnostico})` : ''))
  if (e.idade_gestacao_dias != null) partes.push(`${e.idade_gestacao_dias} dias de gestação`)
  if (e.observacao) partes.push(e.observacao)
  return partes.length > 0 ? partes.join(' · ') : '-'
}

/** Aba Reprodução da ficha da fêmea: status derivado, previsão de parto, pendências e lançamento de eventos. */
export function ReproducaoDoAnimal({ individuoId, fazendaId, sexo, hoje }: Props) {
  const toast = useToast()
  const ehFemea = sexo === 'Fêmea'
  const status = useStatusReprodutivo(individuoId, ehFemea)
  const eventos = useEventosReprodutivos(individuoId, ehFemea)
  const estacoes = useEstacoesMonta(ehFemea ? fazendaId : undefined)
  const lancar = useLancarEventoReprodutivo(fazendaId, individuoId)
  const excluir = useExcluirEventoReprodutivo()

  const [aberto, setAberto] = useState(false)
  const [form, setForm] = useState<FormEventoReprodutivo>(() => formVazioEvento(hoje))
  const [erros, setErros] = useState<string[]>([])
  const [paraExcluir, setParaExcluir] = useState<EventoReprodutivo | null>(null)

  const coberturas = useMemo(() => (eventos.data ?? []).filter((e) => e.tipo === 'Cobertura' || e.tipo === 'Inseminação'), [eventos.data])
  const dataCoberturaEscolhida = coberturas.find((c) => c.id === form.eventoCoberturaId)?.data ?? null
  const campos = camposDoTipo(form.tipo)
  const s = status.data
  const pendencias = useMemo(() => (s ? pendenciasDaFemea(s, hoje) : []), [s, hoje])

  if (!ehFemea) {
    return <EmptyState title="A aba Reprodução só se aplica a fêmeas" />
  }

  const abrir = () => {
    // Diagnóstico e aborto apontam, por padrão, para a cobertura mais recente
    setForm({ ...formVazioEvento(hoje), eventoCoberturaId: s?.ultima_cobertura_id ?? '' })
    setErros([])
    setAberto(true)
  }

  const trocarTipo = (tipo: TipoEventoReprodutivo) =>
    setForm((f) => ({ ...f, tipo, resultado: '', metodoDiagnostico: '', idadeGestacaoDias: '', eventoCoberturaId: s?.ultima_cobertura_id ?? '' }))

  const gravar = async () => {
    const lista = validarEvento(form, hoje, dataCoberturaEscolhida)
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
      await excluir.mutateAsync(paraExcluir.id)
      toast.success('Evento excluído.')
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setParaExcluir(null)
    }
  }

  const previsao = s ? textoPrevisaoParto(s.previsao_parto, s.previsao_confirmada, hoje) : null

  return (
    <div className="space-y-6">
      <DetailSection title="Status reprodutivo" highlighted>
        {status.isLoading ? (
          <p className="text-content-muted">Carregando...</p>
        ) : status.error ? (
          <p className="text-red-500">Não foi possível carregar o status reprodutivo.</p>
        ) : !s ? (
          <p className="text-content-muted">Sem status: o animal precisa estar vivo e ser fêmea.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${CLASSE_STATUS_REPRODUTIVO[s.status_reprodutivo]}`}>
                {s.status_reprodutivo}
              </span>
              {previsao && <span className="text-sm text-content-strong font-medium">{previsao}</span>}
            </div>
            {pendencias.length > 0 && (
              <ul className="space-y-1">
                {pendencias.map((p) => (
                  <li key={p.tipo} className="text-sm px-3 py-2 rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-200">
                    ⚠️ {p.texto}
                  </li>
                ))}
              </ul>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <DetailField label="Previsão de parto" value={s.previsao_parto ? formatDate(s.previsao_parto) : '-'} />
              <DetailField label="Último parto" value={s.ultimo_parto ? formatDate(s.ultimo_parto) : '-'} />
              <DetailField label="Dias desde o parto" value={formatValue(s.dias_desde_ultimo_parto)} />
              <DetailField label="Intervalo entre partos" value={s.intervalo_entre_partos_dias != null ? `${s.intervalo_entre_partos_dias} dias` : '-'} />
              <DetailField label="Última cobertura" value={s.ultima_cobertura_data ? `${formatDate(s.ultima_cobertura_data)} (${s.ultima_cobertura_tipo})` : '-'} />
              <DetailField label="Touro" value={formatValue(s.ultima_cobertura_touro)} />
              <DetailField label="Último diagnóstico" value={s.ultimo_diagnostico_data ? `${formatDate(s.ultimo_diagnostico_data)}: ${s.ultimo_diagnostico_resultado}` : '-'} />
              <DetailField label="Último aborto" value={s.ultimo_aborto ? formatDate(s.ultimo_aborto) : '-'} />
            </div>
            <p className="text-xs text-content-muted">
              Calculado a partir dos partos da Maternidade e dos eventos abaixo (gestação de 283 dias). A categoria do animal não muda sozinha.
            </p>
          </div>
        )}
      </DetailSection>

      <DetailSection title="Eventos reprodutivos">
        <div className="flex justify-end mb-3">
          <Button onClick={abrir}>Lançar evento</Button>
        </div>
        {eventos.isLoading ? (
          <p className="text-content-muted">Carregando...</p>
        ) : eventos.error ? (
          <p className="text-red-500">Não foi possível carregar os eventos.</p>
        ) : (eventos.data?.length ?? 0) === 0 ? (
          <EmptyState title="Nenhum evento reprodutivo lançado" description="Os partos aparecem na aba Maternidade e já entram no status." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-2 border-b border-border-base">
                <tr>
                  <th className={th}>Data</th>
                  <th className={th}>Tipo</th>
                  <th className={th}>Detalhes</th>
                  <th className={th}>Estação</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-base">
                {eventos.data!.map((e) => (
                  <tr key={e.id}>
                    <td className={td}>{formatDate(e.data)}</td>
                    <td className={td}>{e.tipo}</td>
                    <td className={td}>{detalhe(e)}</td>
                    <td className={td}>{e.estacao?.nome ?? '-'}</td>
                    <td className={td}>
                      <button onClick={() => setParaExcluir(e)} className="text-red-600 hover:underline text-sm">
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DetailSection>

      <Modal isOpen={aberto} onClose={() => setAberto(false)} title="Lançar evento reprodutivo" size="md">
        <div className="space-y-4">
          <Select
            label="Tipo"
            value={form.tipo}
            onChange={(v) => trocarTipo(v as TipoEventoReprodutivo)}
            options={TIPOS_EVENTO.map((t) => ({ value: t, label: t }))}
          />
          <Input label="Data" type="date" max={hoje} value={form.data} onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))} />

          {campos.estacao && (
            <Select
              label="Estação de monta (opcional)"
              value={form.estacaoId}
              onChange={(v) => setForm((f) => ({ ...f, estacaoId: v }))}
              options={[{ value: '', label: 'Sem estação' }, ...(estacoes.data ?? []).map((x) => ({ value: x.id, label: x.nome }))]}
            />
          )}
          {campos.touro && (
            <Input label="Touro (nome ou brinco, opcional)" value={form.touroNome} onChange={(e) => setForm((f) => ({ ...f, touroNome: e.target.value }))} />
          )}
          {campos.semen && (
            <Input label="Partida do sêmen (opcional)" value={form.semenPartida} onChange={(e) => setForm((f) => ({ ...f, semenPartida: e.target.value }))} />
          )}
          {campos.tecnico && (
            <Input label="Técnico (opcional)" value={form.tecnico} onChange={(e) => setForm((f) => ({ ...f, tecnico: e.target.value }))} />
          )}

          {campos.diagnostico && (
            <>
              <Select
                label="Resultado"
                value={form.resultado}
                onChange={(v) => setForm((f) => ({ ...f, resultado: v as FormEventoReprodutivo['resultado'] }))}
                options={[
                  { value: '', label: 'Selecione...' },
                  { value: 'Prenha', label: 'Prenha' },
                  { value: 'Vazia', label: 'Vazia' },
                  { value: 'Inconclusivo', label: 'Inconclusivo' },
                ]}
              />
              <Select
                label="Método (opcional)"
                value={form.metodoDiagnostico}
                onChange={(v) => setForm((f) => ({ ...f, metodoDiagnostico: v as FormEventoReprodutivo['metodoDiagnostico'] }))}
                options={[
                  { value: '', label: 'Não informar' },
                  { value: 'Palpação', label: 'Palpação' },
                  { value: 'Ultrassom', label: 'Ultrassom' },
                  { value: 'Outro', label: 'Outro' },
                ]}
              />
              {form.resultado === 'Prenha' && (
                <Input
                  label="Idade da gestação em dias (opcional)"
                  inputMode="numeric"
                  value={form.idadeGestacaoDias}
                  onChange={(e) => setForm((f) => ({ ...f, idadeGestacaoDias: e.target.value }))}
                />
              )}
            </>
          )}

          {campos.cobertura && (
            <Select
              label="Cobertura de referência (opcional)"
              value={form.eventoCoberturaId}
              onChange={(v) => setForm((f) => ({ ...f, eventoCoberturaId: v }))}
              options={[
                { value: '', label: 'Nenhuma' },
                ...coberturas.map((c) => ({ value: c.id, label: `${formatDate(c.data)} · ${c.tipo}${c.touro_nome ? ` · ${c.touro_nome}` : ''}` })),
              ]}
            />
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
        title="Excluir evento reprodutivo"
        message={paraExcluir ? `Excluir ${paraExcluir.tipo} de ${formatDate(paraExcluir.data)}? O status reprodutivo da fêmea é recalculado.` : ''}
        confirmText="Excluir"
      />
    </div>
  )
}
