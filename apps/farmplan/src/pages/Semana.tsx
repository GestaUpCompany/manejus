import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, useFazenda } from '@gestaup/shared'
import { Card, PageSkeleton, EmptyState, Button, useToast } from '@gestaup/ui'
import {
  usePlanoAtivo,
  useSemanaDados,
  useFuncionariosFp,
  useEquipesFp,
  useFpSetDia,
  useFpSetStatusSemana,
  useSaveObsSemana,
} from '../services/farmplanService'
import { useSetores, useRecado } from '../services/cadastrosService'
import { gerarRelatorioSemanal } from '../utils/relatoriosPDF'
import {
  DIAS_SEMANA_CURTO,
  FP_STATUS_LABEL,
  datasDaSemana,
} from '../types/farmplan'
import type { FpAtividade, FpStatusSemana } from '../types/farmplan'

const STATUS_PILL: Record<FpStatusSemana, string> = {
  1: 'bg-surface-3 text-content',
  2: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  3: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  4: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  5: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
}

// chip de tarefa no quadro semanal (cor segue o status da semana)
const CHIP: Record<number, string> = {
  1: 'bg-slate-100 text-content-strong dark:bg-slate-700/40 dark:text-slate-200',
  2: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  3: 'bg-slate-100 text-content-strong dark:bg-slate-700/40 dark:text-slate-200',
  4: 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200',
  5: 'bg-slate-100 text-content-strong dark:bg-slate-700/40 dark:text-slate-200',
}
const CHIP_DOT: Record<number, string> = {
  1: 'bg-slate-400',
  2: 'bg-green-600',
  3: 'bg-blue-500',
  4: 'bg-red-600',
  5: 'bg-amber-500',
}

type WTab = 'pessoa' | 'setor' | 'lista'

const MES_ABREV = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
] as const

export function Semana() {
  const { user } = useAuth()
  const { data: fazenda } = useFazenda(user?.id)
  const fazendaId = fazenda?.id
  const navigate = useNavigate()
  const toast = useToast()

  const { data: plano, isLoading: loadingPlano } = usePlanoAtivo(fazendaId)
  const [semanaSel, setSemanaSel] = useState<number | null>(null)
  const semana = semanaSel ?? plano?.semanaAtual ?? 1
  const [wtab, setWtab] = useState<WTab>('pessoa')
  const [filtros, setFiltros] = useState({ setor: '', status: '' })
  const [expand, setExpand] = useState<Record<string, boolean>>({})
  const [gerandoPdf, setGerandoPdf] = useState(false)
  const [obsEdit, setObsEdit] = useState<{ id: string; txt: string } | null>(null)

  const { data, isLoading } = useSemanaDados(fazendaId, plano?.id, semana)
  const { data: funcionarios } = useFuncionariosFp(fazendaId)
  const { data: equipes } = useEquipesFp(fazendaId)
  const { data: setores } = useSetores(fazendaId)
  const { data: recado } = useRecado(plano?.id, semana)
  const setDia = useFpSetDia()
  const setStatus = useFpSetStatusSemana()
  const saveObs = useSaveObsSemana()

  useEffect(() => {
    setExpand({})
    setObsEdit(null)
  }, [semana])

  const semanasMap = useMemo(
    () => new Map(data?.semanas.map((s) => [s.atividade_id, s]) ?? []),
    [data?.semanas],
  )
  const baixasMap = useMemo(() => {
    const m = new Map<string, boolean>()
    for (const b of data?.baixas ?? []) m.set(`${b.atividade_id}:${b.dia}`, b.feita)
    return m
  }, [data?.baixas])

  const nomePessoa = (id: string | null) =>
    funcionarios?.find((f) => f.id === id)?.apelido ??
    funcionarios?.find((f) => f.id === id)?.nome ??
    null
  const quemFaz = (a: FpAtividade) => {
    if (a.executor_funcionario_id) return nomePessoa(a.executor_funcionario_id) ?? '—'
    if (a.executor_equipe_id) {
      const n = equipes?.find((e) => e.id === a.executor_equipe_id)?.nome ?? ''
      return /^equipe/i.test(n.trim()) ? n : `Equipe ${n}`
    }
    return '—'
  }
  const coordena = (a: FpAtividade) => nomePessoa(a.coordenador_id) ?? '—'
  const setorNome = (a: FpAtividade) =>
    setores?.find((s) => s.id === a.setor_id)?.nome ?? '—'

  const todasDaSemana = useMemo(
    () => (data?.atividades ?? []).filter((a) => semanasMap.has(a.id)),
    [data?.atividades, semanasMap],
  )
  const lista = useMemo(
    () =>
      todasDaSemana
        .filter(
          (a) =>
            (!filtros.setor || a.setor_id === filtros.setor) &&
            (!filtros.status ||
              semanasMap.get(a.id)?.status === Number(filtros.status)),
        )
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [todasDaSemana, filtros, semanasMap],
  )

  const grupos = useMemo(() => {
    if (wtab === 'lista') return []
    const m = new Map<string, FpAtividade[]>()
    for (const a of lista) {
      const k = wtab === 'pessoa' ? quemFaz(a) : setorNome(a)
      const arr = m.get(k) ?? []
      arr.push(a)
      m.set(k, arr)
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wtab, lista, funcionarios, equipes, setores])

  if (loadingPlano) return <PageSkeleton />
  if (!plano) {
    return (
      <EmptyState
        title="Nenhum plano anual ativo"
        description="Crie o plano do ano em Cadastros para começar a planejar atividades."
      />
    )
  }

  const datas = datasDaSemana(plano.semana1_inicio, semana)
  const cur = plano.semanaAtual
  const hoje = new Date()
  const idxHoje = datas.findIndex((d) => d.toDateString() === hoje.toDateString())
  const ehAtual = semana === cur
  const intervalo = `${datas[0].getDate()} ${MES_ABREV[datas[0].getMonth()]} – ${datas[6].getDate()} ${MES_ABREV[datas[6].getMonth()]}`
  const concluidas = todasDaSemana.filter(
    (a) => semanasMap.get(a.id)?.status === 2,
  ).length
  const pctSemana = todasDaSemana.length
    ? Math.round((concluidas / todasDaSemana.length) * 100)
    : 0

  const diaFeito = (a: FpAtividade, d: number) => baixasMap.get(`${a.id}:${d}`) ?? false

  const toggleDia = (a: FpAtividade, d: number) => {
    const v = !diaFeito(a, d)
    setDia.mutate(
      { atividadeId: a.id, semana, dia: d, feita: v, usuarioId: user?.id },
      {
        onSuccess: () => toast.success(`${a.nome} · ${DIAS_SEMANA_CURTO[d]}: ${v ? 'feito' : 'desmarcado'}`),
        onError: () => toast.error('Erro ao atualizar baixa'),
      },
    )
  }

  const gerarPDF = async () => {
    if (!plano || !fazenda || !data) return
    setGerandoPdf(true)
    try {
      await gerarRelatorioSemanal({
        fazendaNome: fazenda.nome,
        plano,
        semana,
        atividades: data.atividades,
        semanas: data.semanas,
        baixas: data.baixas,
        extras: data.extras,
        funcionarios: funcionarios ?? [],
        equipes: (equipes ?? []).map((e) => ({ id: e.id, nome: e.nome })),
        recado: recado?.texto ?? null,
      })
    } catch {
      toast.error('Erro ao gerar PDF')
    } finally {
      setGerandoPdf(false)
    }
  }

  const selectCls =
    'border border-border-base bg-surface-1 rounded-lg px-2 py-1.5 text-[13px] text-content-strong'

  return (
    <div className="space-y-4">
      {/* phead */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[13px] text-content-muted">
            Plano semanal · {todasDaSemana.length} atividades
            {recado?.texto && ehAtual ? ` · Recado: ${recado.texto}` : ''}
          </p>
          <h1 className="text-3xl font-extrabold text-content-strong mt-0.5 tracking-tight">
            Semana {semana} · {intervalo}
          </h1>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Button
            variant="secondary"
            size="sm"
            disabled={semana <= 1}
            onClick={() => setSemanaSel(semana - 1)}
          >
            ‹ Anterior
          </Button>
          {!ehAtual && (
            <Button variant="secondary" size="sm" onClick={() => setSemanaSel(null)}>
              Semana atual
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            disabled={semana >= 53}
            onClick={() => setSemanaSel(semana + 1)}
          >
            Próxima ›
          </Button>
          <Button variant="secondary" size="sm" disabled={gerandoPdf} onClick={gerarPDF}>
            {gerandoPdf ? 'Gerando...' : 'Gerar PDF da semana'}
          </Button>
          <Button size="sm" onClick={() => navigate('/cadastros?aba=atividades&nova=1')}>
            + Nova atividade
          </Button>
        </div>
      </div>

      {/* filtros + seg + progresso */}
      <div className="flex gap-2 flex-wrap items-center justify-between">
        <div className="inline-flex bg-surface-2 rounded-lg p-1 gap-0.5" role="tablist">
          {(
            [
              ['pessoa', 'Por pessoa'],
              ['setor', 'Por setor'],
              ['lista', 'Lista com 5M'],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              role="tab"
              aria-selected={wtab === k}
              onClick={() => setWtab(k)}
              className={`px-3 py-1.5 rounded-md text-[13px] font-semibold transition-colors ${
                wtab === k
                  ? 'bg-surface-0 text-content-strong shadow-sm'
                  : 'text-content-muted hover:text-content-strong'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <select
            value={filtros.setor}
            onChange={(e) => setFiltros((f) => ({ ...f, setor: e.target.value }))}
            className={selectCls}
            aria-label="Setor"
          >
            <option value="">Setor</option>
            {(setores ?? [])
              .filter((s) => s.ativo)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
          </select>
          <select
            value={filtros.status}
            onChange={(e) => setFiltros((f) => ({ ...f, status: e.target.value }))}
            className={selectCls}
            aria-label="Status"
          >
            <option value="">Status</option>
            {[1, 3, 2, 4, 5].map((s) => (
              <option key={s} value={s}>
                {FP_STATUS_LABEL[s as FpStatusSemana]}
              </option>
            ))}
          </select>
          <span className="flex items-center gap-2 text-[12.5px] text-content-muted">
            Semana concluída
            <span className="w-[130px] h-2 bg-surface-2 rounded-full overflow-hidden inline-block">
              <i
                className="block h-full bg-green-600 rounded-full"
                style={{ width: `${pctSemana}%` }}
              />
            </span>
            <b className="tabular-nums text-content-strong">{pctSemana}%</b>
          </span>
        </div>
      </div>

      {isLoading ? (
        <PageSkeleton />
      ) : lista.length === 0 ? (
        <Card disableHover>
          <p className="py-7 text-center text-sm text-content-muted">
            Nenhuma atividade nesta semana. Marque semanas no plano anual ou crie uma
            nova atividade.
          </p>
        </Card>
      ) : wtab === 'lista' ? (
        /* ===== Lista com 5M ===== */
        <Card className="p-0 overflow-hidden" disableHover>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {[
                    'Atividade',
                    'Local',
                    'Quem faz',
                    'Dias',
                    'Metodologia · 2º M',
                    'Máquinas · 3º M',
                    'Materiais · 4º M',
                    'Meta · 5º M',
                    'Status',
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-[11px] uppercase tracking-wide text-content-muted font-semibold px-3 py-2.5 border-b border-border-base text-left whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.map((a) => {
                  const s = semanasMap.get(a.id)
                  const localTxt = s?.observacao || a.local || ''
                  const editando = obsEdit?.id === a.id
                  return (
                    <tr key={a.id}>
                      <td className="px-3 py-2.5 border-b border-border-subtle">
                        <button
                          onClick={() => navigate('/cadastros?aba=atividades')}
                          className="font-semibold text-content-strong text-sm text-left hover:text-blue-500 hover:underline"
                        >
                          {a.nome}
                        </button>
                        <p className="text-xs text-content-muted">
                          Coordena: {coordena(a)}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 border-b border-border-subtle text-xs text-content-muted max-w-[180px]">
                        {editando ? (
                          <span className="flex gap-1.5 items-start">
                            <textarea
                              value={obsEdit.txt}
                              onChange={(e) =>
                                setObsEdit({ id: a.id, txt: e.target.value })
                              }
                              rows={2}
                              autoFocus
                              className="flex-1 px-2 py-1 border rounded-md text-xs bg-surface-1 text-content-strong border-border-base focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                            <button
                              onClick={() => {
                                saveObs.mutate(
                                  {
                                    atividadeId: a.id,
                                    semana,
                                    observacao: obsEdit.txt.trim() || null,
                                  },
                                  {
                                    onError: () => toast.error('Erro ao salvar'),
                                  },
                                )
                                setObsEdit(null)
                              }}
                              className="px-2 py-1 text-xs rounded-md bg-primary text-white"
                            >
                              Salvar
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() =>
                              setObsEdit({ id: a.id, txt: localTxt })
                            }
                            className="text-left hover:text-content-strong"
                            title="Clique para editar a observação da semana"
                          >
                            {localTxt || '—'}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2.5 border-b border-border-subtle text-sm text-content">
                        {quemFaz(a)}
                      </td>
                      <td className="px-3 py-2.5 border-b border-border-subtle text-xs text-content-muted whitespace-nowrap">
                        {a.dias_semana
                          .map((v, i) => (v ? DIAS_SEMANA_CURTO[i] : ''))
                          .filter(Boolean)
                          .join(' ')}
                      </td>
                      {([a.metodologia, a.maquinas, a.materiais, a.meta] as const).map(
                        (m, i) => (
                          <td
                            key={i}
                            className="px-3 py-2.5 border-b border-border-subtle text-xs text-content-muted max-w-[180px]"
                          >
                            {m ? (
                              m
                            ) : (
                              <button
                                onClick={() => navigate('/cadastros?aba=atividades')}
                                className="text-[12.5px] text-content-muted hover:text-content-strong"
                              >
                                + cadastrar
                              </button>
                            )}
                          </td>
                        ),
                      )}
                      <td className="px-3 py-2.5 border-b border-border-subtle">
                        <select
                          value={s?.status ?? 1}
                          onChange={(e) =>
                            setStatus.mutate(
                              {
                                atividadeId: a.id,
                                semana,
                                status: Number(e.target.value),
                                usuarioId: user?.id,
                              },
                              {
                                onError: () => toast.error('Erro ao atualizar status'),
                              },
                            )
                          }
                          className={`text-[11.5px] font-semibold rounded-full px-2.5 py-0.5 border-0 cursor-pointer ${STATUS_PILL[(s?.status ?? 1) as FpStatusSemana]}`}
                          aria-label={`Status da semana para ${a.nome}`}
                        >
                          {[1, 2, 3, 4, 5].map((v) => (
                            <option key={v} value={v}>
                              {FP_STATUS_LABEL[v as FpStatusSemana]}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        /* ===== Quadro por pessoa / setor ===== */
        <Card className="p-0 overflow-hidden" disableHover>
          <div className="overflow-x-auto">
            <div
              className="grid min-w-[1060px]"
              style={{ gridTemplateColumns: '150px repeat(7, minmax(128px, 1fr))' }}
            >
              {/* header */}
              <div className="text-xs text-content-muted px-2 py-2.5 border-b border-r border-border-subtle bg-surface-1">
                {wtab === 'setor' ? 'SETOR' : 'QUEM FAZ'}
              </div>
              {DIAS_SEMANA_CURTO.map((d, i) => (
                <div
                  key={d}
                  className={`text-xs text-content-muted px-2 py-2.5 border-b border-r border-border-subtle bg-surface-1 ${
                    ehAtual && i === idxHoje ? 'bg-primary/10' : ''
                  }`}
                >
                  <b
                    className={`text-[13px] mr-1 ${
                      ehAtual && i === idxHoje ? 'text-primary' : 'text-content-strong'
                    }`}
                  >
                    {d}
                  </b>
                  {`${String(datas[i].getDate()).padStart(2, '0')}/${String(datas[i].getMonth() + 1).padStart(2, '0')}`}
                </div>
              ))}

              {/* grupos */}
              {grupos.map(([grupo, ativs]) => {
                const dn = ativs.filter(
                  (a) => semanasMap.get(a.id)?.status === 2,
                ).length
                return (
                  <div key={grupo} className="contents">
                    <div className="px-2 py-2 border-b border-r border-border-subtle min-h-[60px]">
                      <b className="block text-[13.5px] text-content-strong">{grupo}</b>
                      <small className="text-xs text-content-muted">
                        {dn} de {ativs.length} concluídas
                      </small>
                    </div>
                    {DIAS_SEMANA_CURTO.map((_, d) => {
                      const t = ativs
                        .filter((a) => a.dias_semana[d])
                        .sort(
                          (x, y) =>
                            Number(semanasMap.get(y.id)?.carry_from != null) -
                            Number(semanasMap.get(x.id)?.carry_from != null),
                        )
                      const ex = expand[`${grupo}:${d}`]
                      const shown = ex ? t : t.slice(0, 4)
                      return (
                        <div
                          key={d}
                          className={`px-2 py-2 border-b border-r border-border-subtle min-h-[60px] ${
                            ehAtual && d === idxHoje ? 'bg-primary/10' : ''
                          }`}
                        >
                          {shown.map((a) => {
                            const s = semanasMap.get(a.id)
                            const st = s?.status ?? 1
                            const feita = diaFeito(a, d)
                            const carry = s?.carry_from != null && !feita
                            return (
                              <button
                                key={a.id}
                                onClick={() => toggleDia(a, d)}
                                title={`${a.nome} · ${s?.observacao || a.local || ''} · clique para marcar ${feita ? 'como não feito' : 'como feito'}`}
                                className={`flex gap-1.5 items-center w-full rounded-md px-1.5 py-1 text-xs font-semibold text-left mb-1 transition-colors ${
                                  feita
                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 line-through decoration-green-700/45'
                                    : CHIP[st]
                                }`}
                              >
                                <i
                                  className={`w-[7px] h-[7px] rounded-full flex-none ${
                                    feita ? 'bg-green-600' : CHIP_DOT[st]
                                  }`}
                                />
                                <span className="truncate flex-1">{a.nome}</span>
                                {carry && (
                                  <span className="bg-red-600 text-white rounded px-1 text-[10px] font-bold flex-none">
                                    atrasada
                                  </span>
                                )}
                              </button>
                            )
                          })}
                          {t.length > 4 && (
                            <button
                              onClick={() =>
                                setExpand((x) => ({
                                  ...x,
                                  [`${grupo}:${d}`]: !ex,
                                }))
                              }
                              className="text-[11.5px] text-content-muted font-semibold px-1 hover:text-content-strong"
                            >
                              {ex ? 'mostrar menos' : `+${t.length - 4} tarefas`}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
          <div className="flex justify-between items-center gap-2.5 px-4 py-2.5 border-t border-border-subtle text-xs text-content-muted flex-wrap">
            <span>
              Clique numa tarefa para dar baixa no dia (o status da semana se atualiza
              sozinho)
            </span>
            <span className="flex gap-3 flex-wrap items-center">
              <span className="inline-flex items-center">
                <i className="w-[11px] h-[11px] rounded-[3px] mr-1.5 bg-green-600" />
                Feito no dia
              </span>
              <span className="inline-flex items-center">
                <i className="w-[11px] h-[11px] rounded-[3px] mr-1.5 bg-blue-500" />
                Em andamento
              </span>
              <span className="inline-flex items-center">
                <i className="w-[11px] h-[11px] rounded-[3px] mr-1.5 bg-red-600" />
                Atrasado
              </span>
              <span className="inline-flex items-center">
                <i className="w-[11px] h-[11px] rounded-[3px] mr-1.5 bg-slate-400" />A
                fazer
              </span>
            </span>
          </div>
        </Card>
      )}
    </div>
  )
}
