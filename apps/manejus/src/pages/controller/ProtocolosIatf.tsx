import { useEffect, useMemo, useState } from 'react'
import { useAuth, getFazendaIdForUser, getFazendaNome, formatDate, toFarmDateOnly, useLotes } from '@gestaup/shared'
import { Button, Card, ConfirmModal, EmptyState, Input, Modal, PageSkeleton, Select, useToast } from '@gestaup/ui'
import {
  useAlternarProtocoloIatf,
  useCancelarLoteIatf,
  useCopiarModeloIatf,
  useCriarLoteIatf,
  useDescartarFemeaIatf,
  useDesfazerIaIatf,
  useExcluirProtocoloIatf,
  useLotesProtocoloIatf,
  useMarcarTarefaIatf,
  useProtocolosIatf,
  useRegistrarIaIatf,
  useSalvarProtocoloIatf,
  type LoteProtocoloIatf,
  type ProtocoloIatf,
  type TarefaLoteIatf,
} from '../../hooks/useProtocolosIatf'
import { useFemeasDoLote } from '../../hooks/useReproducao'
import { RelatorioIatf } from './RelatorioIatf'
import {
  CLASSE_SITUACAO_TAREFA,
  ROTULO_SITUACAO_TAREFA,
  TIPOS_PASSO_IATF,
  avisosReprodutivosIatf,
  femeasEmOutroLoteIatf,
  individuosComIa,
  passosAnterioresPendentes,
  rotuloDia,
  rotuloTipoPasso,
  situacaoTarefa,
  somarDias,
  validarNovoLote,
  validarProtocolo,
  type FormPassoIatf,
  type FormProtocoloIatf,
} from '../../utils/protocoloIatf'

const campoTabela =
  'px-2 py-1 bg-surface-1 text-content-strong border border-surface-3 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500'

const PASSO_VAZIO: FormPassoIatf = { dia: '0', rotulo: '', tipo: 'Aplicacao', medicamentoNome: '', dose: '' }
const PROTOCOLO_VAZIO: FormProtocoloIatf = { nome: '', descricao: '', passos: [{ ...PASSO_VAZIO }, { dia: '10', rotulo: 'Inseminação (IA)', tipo: 'Inseminacao', medicamentoNome: '', dose: '' }] }

const rotuloFemea = (f: { id_brinco: string | null; id_manejo: string | null; id_chip: string | null } | null) =>
  f?.id_brinco || f?.id_manejo || f?.id_chip || 'Sem identificação'

const listaErros = (erros: string[]) =>
  erros.length > 0 && (
    <ul className="text-sm text-red-600 list-disc pl-5">
      {erros.map((e) => (
        <li key={e}>{e}</li>
      ))}
    </ul>
  )

export function ProtocolosIatf() {
  const { user } = useAuth()
  const toast = useToast()
  const [fazendaId, setFazendaId] = useState<string | undefined>(undefined)
  const [carregandoFazenda, setCarregandoFazenda] = useState(true)
  const [fazendaNome, setFazendaNome] = useState<string | null>(null)
  const [aba, setAba] = useState<'lotes' | 'protocolos' | 'taxa'>('lotes')
  const hoje = toFarmDateOnly(new Date().toISOString()) ?? new Date().toISOString().slice(0, 10)

  const protocolos = useProtocolosIatf(fazendaId)
  const lotes = useLotesProtocoloIatf(fazendaId)

  useEffect(() => {
    if (!user) return
    getFazendaIdForUser(user.id)
      .then((id) => {
        setFazendaId(id ?? undefined)
        if (id) getFazendaNome(id).then(setFazendaNome)
      })
      .finally(() => setCarregandoFazenda(false))
  }, [user])

  if (carregandoFazenda || protocolos.isLoading || lotes.isLoading) return <PageSkeleton variant="list" />

  // O acesso (flag acesso_controle_individual) é conferido pela rota (ControleIndividualRoute)
  if (!fazendaId) {
    return (
      <EmptyState
        title="Fazenda não encontrada"
        description="Não foi possível identificar a fazenda do usuário."
      />
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-content-strong">Protocolos de IATF</h2>
        <p className="text-sm text-content-muted mt-1 max-w-2xl">
          Cadastre o protocolo (passos em dias a partir do D0), monte um lote com as fêmeas e acompanhe as tarefas. O passo de
          inseminação grava a IA das fêmeas escolhidas e só conclui quando todas as ativas do lote foram inseminadas.
        </p>
      </div>

      <div className="flex gap-2">
        <Button variant={aba === 'lotes' ? 'primary' : 'secondary'} onClick={() => setAba('lotes')}>
          Lotes de protocolo
        </Button>
        <Button variant={aba === 'protocolos' ? 'primary' : 'secondary'} onClick={() => setAba('protocolos')}>
          Protocolos
        </Button>
        <Button variant={aba === 'taxa' ? 'primary' : 'secondary'} onClick={() => setAba('taxa')}>
          Taxa de prenhez
        </Button>
      </div>

      {aba === 'lotes' ? (
        <AbaLotes fazendaId={fazendaId} lotes={lotes.data ?? []} protocolos={protocolos.data ?? []} hoje={hoje} toast={toast} />
      ) : aba === 'protocolos' ? (
        <AbaProtocolos fazendaId={fazendaId} protocolos={protocolos.data ?? []} toast={toast} />
      ) : (
        <RelatorioIatf fazendaId={fazendaId} fazendaNome={fazendaNome} />
      )}
    </div>
  )
}

type Toast = ReturnType<typeof useToast>

// ---------------------------------------------------------------------------
// Protocolos
// ---------------------------------------------------------------------------
function AbaProtocolos({ fazendaId, protocolos, toast }: { fazendaId: string | undefined; protocolos: ProtocoloIatf[]; toast: Toast }) {
  const salvar = useSalvarProtocoloIatf(fazendaId)
  const alternar = useAlternarProtocoloIatf()
  const excluir = useExcluirProtocoloIatf()
  const copiar = useCopiarModeloIatf(fazendaId)
  const [aberto, setAberto] = useState(false)
  const [editando, setEditando] = useState<ProtocoloIatf | undefined>(undefined)
  const [form, setForm] = useState<FormProtocoloIatf>(PROTOCOLO_VAZIO)
  const [erros, setErros] = useState<string[]>([])
  const [paraExcluir, setParaExcluir] = useState<ProtocoloIatf | null>(null)

  const novo = () => {
    setEditando(undefined)
    setForm({ ...PROTOCOLO_VAZIO, passos: PROTOCOLO_VAZIO.passos.map((p) => ({ ...p })) })
    setErros([])
    setAberto(true)
  }

  const editar = (p: ProtocoloIatf) => {
    setEditando(p)
    setForm({
      nome: p.nome,
      descricao: p.descricao ?? '',
      passos: p.passos.map((s) => ({ dia: String(s.dia), rotulo: s.rotulo, tipo: s.tipo, medicamentoNome: s.medicamento_nome ?? '', dose: s.dose ?? '' })),
    })
    setErros([])
    setAberto(true)
  }

  const setPasso = (i: number, patch: Partial<FormPassoIatf>) =>
    setForm((f) => ({ ...f, passos: f.passos.map((p, j) => (j === i ? { ...p, ...patch } : p)) }))

  const gravar = async () => {
    const lista = validarProtocolo(form)
    setErros(lista)
    if (lista.length > 0) return
    try {
      await salvar.mutateAsync({ id: editando?.id, form })
      toast.success(editando ? 'Protocolo atualizado.' : 'Protocolo criado.')
      setAberto(false)
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  const usarModelo = async () => {
    try {
      await copiar.mutateAsync()
      toast.success('Modelo clássico D0/D8/D10 criado. Ajuste produtos e doses ao protocolo do veterinário.')
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  const confirmarExclusao = async () => {
    if (!paraExcluir) return
    try {
      await excluir.mutateAsync(paraExcluir.id)
      toast.success('Protocolo excluído. Os lotes já criados continuam.')
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setParaExcluir(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 justify-end">
        <Button variant="secondary" onClick={usarModelo} disabled={copiar.isPending}>
          Usar modelo clássico (D0/D8/D10)
        </Button>
        <Button onClick={novo}>Novo protocolo</Button>
      </div>

      {protocolos.length === 0 ? (
        <EmptyState title="Nenhum protocolo cadastrado" description="Use o modelo clássico ou crie o seu, com os passos em dias a partir do D0." />
      ) : (
        protocolos.map((p) => (
          <Card key={p.id} className="p-4 space-y-3" disableHover>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-content-strong">
                  {p.nome} {!p.ativo && <span className="text-xs font-normal text-content-muted">(inativo)</span>}
                </h3>
                {p.descricao && <p className="text-sm text-content-muted max-w-2xl">{p.descricao}</p>}
              </div>
              <span className="flex gap-3 text-sm">
                <button className="text-primary hover:underline" onClick={() => editar(p)}>
                  Editar
                </button>
                <button
                  className="text-primary hover:underline"
                  onClick={() => alternar.mutate({ id: p.id, ativo: !p.ativo }, { onError: (e) => toast.error((e as Error).message) })}
                >
                  {p.ativo ? 'Inativar' : 'Ativar'}
                </button>
                <button className="text-red-600 hover:underline" onClick={() => setParaExcluir(p)}>
                  Excluir
                </button>
              </span>
            </div>
            <ul className="text-sm text-content divide-y divide-border-base">
              {p.passos.map((s) => (
                <li key={s.id} className="py-1.5 flex flex-wrap gap-x-3">
                  <span className="font-medium text-content-strong w-10">{rotuloDia(s.dia)}</span>
                  <span>{s.rotulo}</span>
                  <span className="text-content-muted">{rotuloTipoPasso(s.tipo)}</span>
                  {(s.medicamento_nome || s.dose) && (
                    <span className="text-content-muted">
                      {[s.medicamento_nome, s.dose].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}

      <Modal isOpen={aberto} onClose={() => setAberto(false)} title={editando ? 'Editar protocolo' : 'Novo protocolo'} size="lg">
        <div className="space-y-4">
          <Input label="Nome" value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Ex: IATF 3 manejos" />
          <Input label="Descrição (opcional)" value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} />
          <div className="space-y-2">
            <p className="text-sm font-medium text-content">Passos (dia a partir do D0)</p>
            {form.passos.map((p, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <input className={`${campoTabela} col-span-2`} inputMode="numeric" aria-label={`Dia do passo ${i + 1}`} placeholder="Dia" value={p.dia} onChange={(e) => setPasso(i, { dia: e.target.value })} />
                <input className={`${campoTabela} col-span-4`} aria-label={`Descrição do passo ${i + 1}`} placeholder="Descrição" value={p.rotulo} onChange={(e) => setPasso(i, { rotulo: e.target.value })} />
                <select className={`${campoTabela} col-span-2`} aria-label={`Tipo do passo ${i + 1}`} value={p.tipo} onChange={(e) => setPasso(i, { tipo: e.target.value as FormPassoIatf['tipo'] })}>
                  {TIPOS_PASSO_IATF.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <input className={`${campoTabela} col-span-2`} aria-label={`Produto do passo ${i + 1}`} placeholder="Produto" value={p.medicamentoNome} onChange={(e) => setPasso(i, { medicamentoNome: e.target.value })} />
                <input className={`${campoTabela} col-span-1`} aria-label={`Dose do passo ${i + 1}`} placeholder="Dose" value={p.dose} onChange={(e) => setPasso(i, { dose: e.target.value })} />
                <button
                  className="col-span-1 text-red-600 text-sm hover:underline"
                  onClick={() => setForm((f) => ({ ...f, passos: f.passos.filter((_, j) => j !== i) }))}
                  aria-label={`Remover passo ${i + 1}`}
                >
                  Remover
                </button>
              </div>
            ))}
            <Button size="sm" variant="secondary" onClick={() => setForm((f) => ({ ...f, passos: [...f.passos, { ...PASSO_VAZIO, dia: '' }] }))}>
              Adicionar passo
            </Button>
          </div>
          {listaErros(erros)}
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
        title="Excluir protocolo"
        message={paraExcluir ? `Excluir "${paraExcluir.nome}"? Os lotes já criados com ele continuam com as tarefas que já têm.` : ''}
        confirmText="Excluir"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Lotes de protocolo
// ---------------------------------------------------------------------------
function AbaLotes({
  fazendaId,
  lotes,
  protocolos,
  hoje,
  toast,
}: {
  fazendaId: string | undefined
  lotes: LoteProtocoloIatf[]
  protocolos: ProtocoloIatf[]
  hoje: string
  toast: Toast
}) {
  const [novoAberto, setNovoAberto] = useState(false)
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setNovoAberto(true)} disabled={protocolos.filter((p) => p.ativo).length === 0}>
          Novo lote de protocolo
        </Button>
      </div>
      {protocolos.filter((p) => p.ativo).length === 0 && (
        <p className="text-sm text-content-muted">Cadastre um protocolo ativo na aba Protocolos para criar um lote.</p>
      )}
      {lotes.length === 0 ? (
        <EmptyState title="Nenhum lote de protocolo" description="Crie um lote escolhendo o protocolo, o D0 e as fêmeas." />
      ) : (
        lotes.map((l) => <CartaoLote key={l.id} fazendaId={fazendaId} lote={l} hoje={hoje} toast={toast} />)
      )}
      <ModalNovoLote
        fazendaId={fazendaId}
        aberto={novoAberto}
        onClose={() => setNovoAberto(false)}
        protocolos={protocolos.filter((p) => p.ativo)}
        lotesEmAndamento={lotes.filter((l) => l.status === 'Em andamento')}
        hoje={hoje}
        toast={toast}
      />
    </div>
  )
}

function CartaoLote({ fazendaId, lote, hoje, toast }: { fazendaId: string | undefined; lote: LoteProtocoloIatf; hoje: string; toast: Toast }) {
  const marcar = useMarcarTarefaIatf(fazendaId)
  const registrarIa = useRegistrarIaIatf(fazendaId)
  const descartar = useDescartarFemeaIatf(fazendaId)
  const cancelar = useCancelarLoteIatf()
  const [tarefaAcao, setTarefaAcao] = useState<TarefaLoteIatf | null>(null)
  const [dataAcao, setDataAcao] = useState(hoje)
  const [ia, setIa] = useState({ touro: '', semen: '', tecnico: '', observacao: '' })
  const [obs, setObs] = useState('')
  const [confirmarCancelar, setConfirmarCancelar] = useState(false)
  const [verFemeas, setVerFemeas] = useState(false)
  const [femeasIa, setFemeasIa] = useState<string[]>([])
  // Desfazer IA: de todas as fêmeas (individuoId nulo) ou de uma só
  const [desfazerIa, setDesfazerIa] = useState<{ individuoId: string | null; rotulo: string | null } | null>(null)
  const desfazerIaMut = useDesfazerIaIatf(fazendaId)
  const [avisoPassos, setAvisoPassos] = useState<string | null>(null)

  const femeasAtivas = lote.femeas.filter((f) => f.status === 'Ativa')
  const ativas = femeasAtivas.length
  const comIa = useMemo(() => individuosComIa(lote.eventos ?? []), [lote.eventos])
  const touroDe = (individuoId: string) =>
    (lote.eventos ?? []).find((e) => e.individuo_id === individuoId && e.tipo === 'Inseminação' && e.deleted_at == null)?.touro_nome ?? null
  const semIa = femeasAtivas.filter((f) => !comIa.has(f.individuo_id))
  const aberto = lote.status === 'Em andamento'
  // Lote concluído ainda pode ter um passo desfeito (reabre o lote); só o cancelado fica travado
  const podeDesfazer = lote.status !== 'Cancelado'

  const abrirAcao = (t: TarefaLoteIatf) => {
    setTarefaAcao(t)
    setDataAcao(hoje)
    setObs('')
    setIa({ touro: '', semen: '', tecnico: lote.responsavel ?? '', observacao: '' })
    setFemeasIa(semIa.map((f) => f.individuo_id))
  }

  const alternarFemeaIa = (individuoId: string) =>
    setFemeasIa((atual) => (atual.includes(individuoId) ? atual.filter((id) => id !== individuoId) : [...atual, individuoId]))

  const dataAnteriorAoD0 = !!dataAcao && dataAcao < lote.data_d0
  const anterioresPendentes = tarefaAcao ? passosAnterioresPendentes(lote.tarefas, tarefaAcao.dia) : []

  const confirmarAcao = async (confirmado = false) => {
    if (!tarefaAcao) return
    if (dataAnteriorAoD0) return
    // IA com passo anterior do protocolo ainda por fazer: pode ser imprevisto de campo, então só confirma
    if (tarefaAcao.tipo === 'Inseminacao' && anterioresPendentes.length > 0 && !confirmado) {
      setAvisoPassos(anterioresPendentes.map((t) => `${rotuloDia(t.dia)} ${t.rotulo}`).join('; '))
      return
    }
    try {
      if (tarefaAcao.tipo === 'Inseminacao') {
        const n = await registrarIa.mutateAsync({ tarefaId: tarefaAcao.id, data: dataAcao, ...ia, individuos: femeasIa })
        const restam = semIa.length - femeasIa.length
        toast.success(
          restam > 0
            ? `${n} inseminação(ões) registrada(s). Faltam ${restam} fêmea(s); registre as demais com o touro correspondente.`
            : `${n} inseminação(ões) registrada(s).`
        )
      } else {
        await marcar.mutateAsync({ tarefaId: tarefaAcao.id, feitaEm: dataAcao, observacao: obs, responsavel: lote.responsavel ?? '' })
        toast.success('Passo marcado como feito.')
      }
      setTarefaAcao(null)
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  const tarefaIa = lote.tarefas.find((t) => t.tipo === 'Inseminacao')

  const desmarcar = async (t: TarefaLoteIatf) => {
    // A IA tem confirmação própria: desfazer remove as inseminações das fêmeas
    if (t.tipo === 'Inseminacao') {
      setDesfazerIa({ individuoId: null, rotulo: null })
      return
    }
    try {
      await marcar.mutateAsync({ tarefaId: t.id, feitaEm: null })
      toast.success('Marcação desfeita.')
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  const confirmarDesfazerIa = async () => {
    if (!tarefaIa || !desfazerIa) return
    try {
      const n = await desfazerIaMut.mutateAsync({ tarefaId: tarefaIa.id, individuos: desfazerIa.individuoId ? [desfazerIa.individuoId] : undefined })
      toast.success(`${n} inseminação(ões) removida(s). O passo de IA voltou a ficar pendente.`)
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setDesfazerIa(null)
    }
  }

  return (
    <Card className="p-4 space-y-3" disableHover>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-content-strong">{lote.nome}</h3>
          <p className="text-sm text-content-muted">
            {lote.protocolo?.nome ?? 'Protocolo removido'} · D0 {formatDate(lote.data_d0)} · {ativas} fêmea(s) ativa(s) de {lote.femeas.length}
            {lote.responsavel ? ` · ${lote.responsavel}` : ''}
          </p>
        </div>
        <span className="flex items-center gap-3 text-sm">
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-surface-2 text-content">{lote.status}</span>
          <button className="text-primary hover:underline" onClick={() => setVerFemeas((v) => !v)}>
            {verFemeas ? 'Ocultar fêmeas' : 'Ver fêmeas'}
          </button>
          {aberto && (
            <button className="text-red-600 hover:underline" onClick={() => setConfirmarCancelar(true)}>
              Cancelar lote
            </button>
          )}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-surface-2 border-b border-border-base">
            <tr>
              {['Dia', 'Passo', 'Produto', 'Previsto', 'Situação', ''].map((t) => (
                <th key={t} className="px-3 py-2 text-left text-xs font-semibold text-content-muted uppercase">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-base">
            {lote.tarefas.map((t) => {
              const sit = situacaoTarefa(t, hoje)
              return (
                <tr key={t.id}>
                  <td className="px-3 py-2 text-sm font-medium text-content-strong">{rotuloDia(t.dia)}</td>
                  <td className="px-3 py-2 text-sm text-content">{t.rotulo}</td>
                  <td className="px-3 py-2 text-sm text-content-muted">{[t.medicamento_nome, t.dose].filter(Boolean).join(' · ') || '-'}</td>
                  <td className="px-3 py-2 text-sm text-content">{formatDate(t.data_prevista)}</td>
                  <td className="px-3 py-2 text-sm">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${CLASSE_SITUACAO_TAREFA[sit]}`}>
                      {ROTULO_SITUACAO_TAREFA[sit]}
                      {t.feita_em ? ` ${formatDate(t.feita_em)}` : ''}
                    </span>
                    {t.tipo === 'Inseminacao' && !t.feita_em && comIa.size > 0 && ativas > 0 && (
                      <span className="ml-2 text-xs text-content-muted">
                        {ativas - semIa.length} de {ativas} inseminadas
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm">
                    {aberto && !t.feita_em && (
                      <button className="text-primary hover:underline" onClick={() => abrirAcao(t)}>
                        {t.tipo === 'Inseminacao' ? 'Registrar IA' : 'Marcar feito'}
                      </button>
                    )}
                    {podeDesfazer && t.feita_em && (
                      <button className="text-content-muted hover:underline" onClick={() => desmarcar(t)}>
                        Desfazer
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {verFemeas && (
        <ul className="text-sm divide-y divide-border-base">
          {lote.femeas.map((f) => (
            <li key={f.id} className="py-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className="text-content">
                <span className="font-medium text-content-strong">{rotuloFemea(f.individuo)}</span> {f.individuo?.categoria ?? ''}
                {f.status === 'Descartada' && <span className="ml-2 text-xs text-amber-700">Descartada{f.motivo_descarte ? `: ${f.motivo_descarte}` : ''}</span>}
              </span>
              {podeDesfazer && comIa.has(f.individuo_id) && (
                <button
                  className="text-content-muted hover:underline"
                  onClick={() => setDesfazerIa({ individuoId: f.individuo_id, rotulo: rotuloFemea(f.individuo) })}
                >
                  Desfazer IA
                </button>
              )}
              {aberto && (
                <button
                  className="text-primary hover:underline"
                  onClick={() =>
                    descartar.mutate(
                      {
                        id: f.id,
                        loteId: lote.id,
                        individuoId: f.individuo_id,
                        descartar: f.status === 'Ativa',
                        motivo: f.status === 'Ativa' ? 'Fora do protocolo' : undefined,
                      },
                      { onError: (e) => toast.error((e as Error).message) }
                    )
                  }
                >
                  {f.status === 'Ativa' ? 'Descartar' : 'Reativar'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal
        isOpen={!!tarefaAcao}
        onClose={() => setTarefaAcao(null)}
        title={tarefaAcao?.tipo === 'Inseminacao' ? `Registrar IA: ${lote.nome}` : `Marcar: ${tarefaAcao?.rotulo ?? ''}`}
        size="sm"
      >
        <div className="space-y-4">
          <Input label="Data" type="date" min={lote.data_d0} max={hoje} value={dataAcao} onChange={(e) => setDataAcao(e.target.value)} />
          {dataAnteriorAoD0 && <p className="text-sm text-red-600">A data não pode ser anterior ao D0 do lote ({formatDate(lote.data_d0)}).</p>}
          {tarefaAcao?.tipo === 'Inseminacao' ? (
            <>
              <div>
                <p className="text-sm font-medium text-content-strong">Fêmeas desta inseminação</p>
                <p className="text-xs text-content-muted mb-2">
                  O touro e a partida abaixo valem só para as fêmeas marcadas. Para usar outro sêmen, registre as demais em seguida.
                </p>
                <ul className="max-h-48 overflow-y-auto divide-y divide-border-base rounded border border-border-base">
                  {femeasAtivas.map((f) => {
                    const jaTem = comIa.has(f.individuo_id)
                    return (
                      <li key={f.id} className="px-2 py-1.5 text-sm">
                        <label className={`flex items-center gap-2 ${jaTem ? 'opacity-60' : 'cursor-pointer'}`}>
                          <input
                            type="checkbox"
                            checked={!jaTem && femeasIa.includes(f.individuo_id)}
                            disabled={jaTem}
                            onChange={() => alternarFemeaIa(f.individuo_id)}
                          />
                          <span className="font-medium text-content-strong">{rotuloFemea(f.individuo)}</span>
                          {jaTem && <span className="text-xs text-content-muted">IA já registrada{touroDe(f.individuo_id) ? ` (${touroDe(f.individuo_id)})` : ''}</span>}
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </div>
              <Input label="Touro / sêmen (opcional)" value={ia.touro} onChange={(e) => setIa((v) => ({ ...v, touro: e.target.value }))} />
              <Input label="Partida do sêmen (opcional)" value={ia.semen} onChange={(e) => setIa((v) => ({ ...v, semen: e.target.value }))} />
              <Input label="Técnico / inseminador (opcional)" value={ia.tecnico} onChange={(e) => setIa((v) => ({ ...v, tecnico: e.target.value }))} />
              <Input label="Observação (opcional)" value={ia.observacao} onChange={(e) => setIa((v) => ({ ...v, observacao: e.target.value }))} />
            </>
          ) : (
            <Input label="Observação (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setTarefaAcao(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => confirmarAcao()}
              disabled={marcar.isPending || registrarIa.isPending || !dataAcao || dataAnteriorAoD0 || (tarefaAcao?.tipo === 'Inseminacao' && femeasIa.length === 0)}
            >
              {marcar.isPending || registrarIa.isPending ? 'Gravando...' : 'Confirmar'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!avisoPassos}
        onClose={() => setAvisoPassos(null)}
        onConfirm={() => {
          setAvisoPassos(null)
          void confirmarAcao(true)
        }}
        title="Passos anteriores pendentes"
        message={`Ainda não foram marcados como feitos: ${avisoPassos ?? ''}. Registrar a inseminação mesmo assim?`}
        confirmText="Registrar mesmo assim"
      />

      <ConfirmModal
        isOpen={!!desfazerIa}
        onClose={() => setDesfazerIa(null)}
        onConfirm={confirmarDesfazerIa}
        title="Desfazer inseminação"
        message={
          desfazerIa?.individuoId
            ? `Remover a inseminação de ${desfazerIa.rotulo}? Ela some da ficha da fêmea e o passo de IA volta a ficar pendente; depois é possível registrar de novo.`
            : `Remover as ${comIa.size} inseminação(ões) deste lote? Elas somem da ficha das fêmeas e o passo de IA volta a ficar pendente; depois é possível registrar de novo. Não é possível se já houver diagnóstico de gestação depois da IA.`
        }
        confirmText="Desfazer IA"
      />

      <ConfirmModal
        isOpen={confirmarCancelar}
        onClose={() => setConfirmarCancelar(false)}
        onConfirm={async () => {
          try {
            await cancelar.mutateAsync(lote.id)
            toast.success('Lote cancelado. As inseminações já registradas continuam.')
          } catch (error) {
            toast.error((error as Error).message)
          } finally {
            setConfirmarCancelar(false)
          }
        }}
        title="Cancelar lote de protocolo"
        message={`Cancelar "${lote.nome}"? Não será mais possível marcar passos. O que já foi registrado continua.`}
        confirmText="Cancelar lote"
      />
    </Card>
  )
}

function ModalNovoLote({
  fazendaId,
  aberto,
  onClose,
  protocolos,
  lotesEmAndamento,
  hoje,
  toast,
}: {
  fazendaId: string | undefined
  aberto: boolean
  onClose: () => void
  protocolos: ProtocoloIatf[]
  lotesEmAndamento: LoteProtocoloIatf[]
  hoje: string
  toast: Toast
}) {
  const criar = useCriarLoteIatf(fazendaId)
  const { data: lotesFazenda = [] } = useLotes(fazendaId)
  const [protocoloId, setProtocoloId] = useState('')
  const [nome, setNome] = useState('')
  const [dataD0, setDataD0] = useState(hoje)
  const [responsavel, setResponsavel] = useState('')
  const [loteId, setLoteId] = useState('')
  const [marcadas, setMarcadas] = useState<Record<string, boolean>>({})
  const [erros, setErros] = useState<string[]>([])
  // Identificação e status reprodutivo das fêmeas já vistas (a seleção pode vir de vários lotes da fazenda)
  const [infoFemeas, setInfoFemeas] = useState<Record<string, { rotulo: string; status: string }>>({})
  const [avisoReprodutivo, setAvisoReprodutivo] = useState<string[] | null>(null)
  const femeas = useFemeasDoLote(fazendaId, loteId || undefined)

  useEffect(() => {
    if (!femeas.data?.length) return
    setInfoFemeas((atual) => {
      const novo = { ...atual }
      for (const f of femeas.data!) novo[f.individuo_id] = { rotulo: rotuloFemea(f), status: f.status_reprodutivo }
      return novo
    })
  }, [femeas.data])

  // Fêmea ativa em outro lote de protocolo em andamento não pode entrar em outro (o banco também recusa)
  const emOutroLote = useMemo(() => femeasEmOutroLoteIatf(lotesEmAndamento), [lotesEmAndamento])

  const protocolo = protocolos.find((p) => p.id === protocoloId)
  const previa = useMemo(() => (protocolo ? protocolo.passos.map((p) => `${rotuloDia(p.dia)} ${somarDias(dataD0 || hoje, p.dia).split('-').reverse().join('/')}`).join(' · ') : ''), [protocolo, dataD0, hoje])
  const selecionadas = Object.entries(marcadas)
    .filter(([id, v]) => v && !emOutroLote.has(id))
    .map(([id]) => id)

  const alternarTodas = (valor: boolean) =>
    setMarcadas((m) => {
      const novo = { ...m }
      for (const f of femeas.data ?? []) novo[f.individuo_id] = valor && !emOutroLote.has(f.individuo_id)
      return novo
    })

  const gravar = async (confirmado = false) => {
    const lista = validarNovoLote({ protocoloId, nome, dataD0, individuos: selecionadas })
    setErros(lista)
    if (lista.length > 0) return
    // Fêmea prenha (ou coberta sem diagnóstico) em protocolo de IATF costuma ser engano: avisa antes de criar
    const alertas = confirmado ? [] : avisosReprodutivosIatf(selecionadas.map((id) => infoFemeas[id]).filter(Boolean))
    if (alertas.length > 0) {
      setAvisoReprodutivo(alertas)
      return
    }
    try {
      await criar.mutateAsync({ protocoloId, nome: nome.trim(), dataD0, individuos: selecionadas, responsavel })
      toast.success('Lote de protocolo criado com as tarefas.')
      setNome('')
      setMarcadas({})
      setLoteId('')
      onClose()
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  return (
    <>
    <Modal isOpen={aberto} onClose={onClose} title="Novo lote de protocolo" size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select label="Protocolo" value={protocoloId} onChange={setProtocoloId} options={[{ value: '', label: 'Selecione...' }, ...protocolos.map((p) => ({ value: p.id, label: p.nome }))]} />
          <Input label="Nome do lote" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: IATF novilhas outubro" />
          <Input label="D0" type="date" value={dataD0} onChange={(e) => setDataD0(e.target.value)} />
          <Input label="Responsável (opcional)" value={responsavel} onChange={(e) => setResponsavel(e.target.value)} />
        </div>
        {previa && <p className="text-sm text-content-muted">Datas: {previa}</p>}

        <Select
          label="Buscar fêmeas no lote"
          value={loteId}
          onChange={setLoteId}
          options={[{ value: '', label: 'Selecione um lote da fazenda...' }, ...lotesFazenda.filter((l) => l.ativo).map((l) => ({ value: l.id, label: l.nome }))]}
        />
        {loteId && (
          <div className="space-y-2">
            {femeas.isLoading ? (
              <p className="text-sm text-content-muted">Carregando...</p>
            ) : (femeas.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-content-muted">Nenhuma fêmea identificada neste lote.</p>
            ) : (
              <>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => alternarTodas(true)}>
                    Marcar todas
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => alternarTodas(false)}>
                    Limpar
                  </Button>
                </div>
                <ul className="max-h-60 overflow-y-auto divide-y divide-border-base text-sm">
                  {femeas.data!.map((f) => {
                    const outroLote = emOutroLote.get(f.individuo_id)
                    return (
                      <li key={f.individuo_id} className="py-1.5">
                        <label className={`flex items-center gap-2 text-content ${outroLote ? 'opacity-60' : ''}`}>
                          <input
                            type="checkbox"
                            checked={!outroLote && !!marcadas[f.individuo_id]}
                            disabled={!!outroLote}
                            onChange={(e) => setMarcadas((m) => ({ ...m, [f.individuo_id]: e.target.checked }))}
                          />
                          <span className="font-medium text-content-strong">{rotuloFemea(f)}</span>
                          <span className="text-content-muted">
                            {f.categoria ?? ''} · {f.status_reprodutivo}
                          </span>
                          {outroLote && <span className="text-xs text-amber-700">já está no lote "{outroLote}"</span>}
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </div>
        )}
        <p className="text-sm text-content-muted">{selecionadas.length} fêmea(s) selecionada(s). Você pode trocar de lote e continuar marcando.</p>
        {listaErros(erros)}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => gravar()} disabled={criar.isPending}>
            {criar.isPending ? 'Criando...' : 'Criar lote'}
          </Button>
        </div>
      </div>
    </Modal>
      {/* Fora do Modal: dentro dele o clique em Cancelar subia pela árvore do React e fechava o formulário também */}
      <ConfirmModal
        isOpen={!!avisoReprodutivo}
        onClose={() => setAvisoReprodutivo(null)}
        onConfirm={() => {
          setAvisoReprodutivo(null)
          void gravar(true)
        }}
        title="Fêmeas com status reprodutivo a conferir"
        message={`${(avisoReprodutivo ?? []).join(' ')} Criar o lote mesmo assim?`}
        confirmText="Criar mesmo assim"
      />
    </>
  )
}

export default ProtocolosIatf
