import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, useFazenda } from '@gestaup/shared'
import { Card, PageSkeleton, EmptyState, Button, useToast } from '@gestaup/ui'
import {
  usePlanoAtivo,
  usePlanoSemanas,
  useSemanaDados,
  useFuncionariosFp,
  useEquipesFp,
  useFpSetStatusSemana,
} from '../services/farmplanService'
import { useRecado, useSaveRecado, useSetores } from '../services/cadastrosService'
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

const MES_ABREV = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
] as const

export function Painel() {
  const { user } = useAuth()
  const { data: fazenda } = useFazenda(user?.id)
  const fazendaId = fazenda?.id
  const navigate = useNavigate()
  const toast = useToast()

  const { data: plano, isLoading: loadingPlano } = usePlanoAtivo(fazendaId)
  const [semanaSel, setSemanaSel] = useState<number | null>(null)
  const semana = semanaSel ?? plano?.semanaAtual ?? 1

  const { data: semanaDados, isLoading: loadingSemana } = useSemanaDados(
    fazendaId,
    plano?.id,
    semana,
  )
  const { data: funcionarios } = useFuncionariosFp(fazendaId)
  const { data: equipes } = useEquipesFp(fazendaId)
  const { data: setores } = useSetores(fazendaId)
  const { data: recado } = useRecado(plano?.id, semana)
  const saveRecado = useSaveRecado()
  const setStatus = useFpSetStatusSemana()

  const atividadeIds = useMemo(
    () => semanaDados?.atividades.map((a) => a.id),
    [semanaDados?.atividades],
  )
  const { data: todasSemanas } = usePlanoSemanas(fazendaId, plano?.id, atividadeIds)

  const [editandoRecado, setEditandoRecado] = useState(false)
  const [recadoTxt, setRecadoTxt] = useState('')

  const semanasMap = useMemo(
    () => new Map(semanaDados?.semanas.map((s) => [s.atividade_id, s]) ?? []),
    [semanaDados?.semanas],
  )
  const baixasMap = useMemo(() => {
    const m = new Map<string, boolean>()
    for (const b of semanaDados?.baixas ?? []) m.set(`${b.atividade_id}:${b.dia}`, b.feita)
    return m
  }, [semanaDados?.baixas])

  const derivados = useMemo(() => {
    if (!plano || !semanaDados) return null
    const datas = datasDaSemana(plano.semana1_inicio, semana)
    const hoje = new Date()
    const list = semanaDados.atividades.filter((a) => semanasMap.has(a.id))

    // Índice do último dia "passado" na semana (comparação por data real)
    const limitePassado = datas.findIndex(
      (d) => d.toDateString() === hoje.toDateString(),
    )
    const diasPassados = limitePassado === -1 ? (datas[6] < hoje ? 7 : 0) : limitePassado

    const pastPending = (a: FpAtividade) =>
      Array.from({ length: diasPassados }, (_, d) => d).filter(
        (d) => a.dias_semana[d] && !(baixasMap.get(`${a.id}:${d}`) ?? false),
      )

    const cont = (s: number) =>
      list.filter((a) => semanasMap.get(a.id)?.status === s).length

    const semBaixa = list.filter(
      (a) => semanasMap.get(a.id)?.status !== 2 && pastPending(a).length > 0,
    )

    const pend = list
      .filter((a) => {
        const s = semanasMap.get(a.id)
        return (
          (s?.carry_from != null && s.status !== 2) ||
          s?.status === 4 ||
          s?.status === 3 ||
          s?.status === 5 ||
          pastPending(a).length > 0
        )
      })
      .sort((a, b) => {
        const sa = semanasMap.get(a.id)
        const sb = semanasMap.get(b.id)
        return (
          Number(sb?.carry_from != null) - Number(sa?.carry_from != null) ||
          Number(sb?.status === 4) - Number(sa?.status === 4) ||
          pastPending(b).length - pastPending(a).length ||
          a.urgencia - b.urgencia
        )
      })

    const porSetor = new Map<string, number>()
    for (const a of list) {
      const k = setores?.find((s) => s.id === a.setor_id)?.nome ?? '—'
      porSetor.set(k, (porSetor.get(k) ?? 0) + 1)
    }
    const setorArr = [...porSetor.entries()].sort((a, b) => b[1] - a[1])
    const setorMax = Math.max(1, ...setorArr.map((x) => x[1]))

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
    const porQuem = new Map<string, [number, number]>()
    for (const a of list) {
      const k = quemFaz(a)
      const par = porQuem.get(k) ?? [0, 0]
      par[1]++
      if (semanasMap.get(a.id)?.status === 2) par[0]++
      porQuem.set(k, par)
    }
    const quemArr = [...porQuem.entries()].sort((a, b) => b[1][1] - a[1][1])

    const porDia = DIAS_SEMANA_CURTO.map((_, d) =>
      list.filter((a) => a.dias_semana[d]),
    )
    const feitasDia = porDia.map((ativs, d) =>
      ativs.filter((a) => baixasMap.get(`${a.id}:${d}`) ?? false),
    )
    const diaMax = Math.max(1, ...porDia.map((x) => x.length))

    return {
      datas,
      list,
      pastPending,
      cont,
      semBaixa,
      pend,
      setorArr,
      setorMax,
      quemArr,
      quemFaz,
      porDia,
      feitasDia,
      diaMax,
      idxHoje: limitePassado,
      hoje,
    }
  }, [plano, semanaDados, semanasMap, baixasMap, semana, setores, funcionarios, equipes])

  if (loadingPlano || loadingSemana) return <PageSkeleton />

  if (!plano) {
    return (
      <EmptyState
        title="Nenhum plano anual ativo"
        description="Crie o plano do ano em Cadastros para começar a planejar atividades."
      />
    )
  }
  if (!derivados) return <PageSkeleton />

  const {
    datas,
    list,
    pastPending,
    cont,
    semBaixa,
    pend,
    setorArr,
    setorMax,
    quemArr,
    quemFaz,
    porDia,
    feitasDia,
    diaMax,
    idxHoje,
    hoje,
  } = derivados

  const ehAtual = semana === plano.semanaAtual
  const intervalo = `${datas[0].getDate()} ${MES_ABREV[datas[0].getMonth()]} – ${datas[6].getDate()} ${MES_ABREV[datas[6].getMonth()]}`
  const eyebrow = ehAtual
    ? `Painel · ${hoje.toLocaleDateString('pt-BR', { weekday: 'long' })}, ${hoje.getDate()} de ${hoje.toLocaleDateString('pt-BR', { month: 'long' })} de ${hoje.getFullYear()}`
    : `Painel · semana ${semana}`
  const totalAno = new Set((todasSemanas ?? []).map((s) => s.atividade_id)).size
  const pct = list.length ? Math.round((cont(2) / list.length) * 100) : 0
  const semBaixaNaoAtrasada = semBaixa.filter(
    (a) => semanasMap.get(a.id)?.status !== 4,
  ).length

  const kpis = [
    {
      label: 'Atividades na semana',
      valor: list.length,
      cor: 'text-content-strong',
      sub: `${totalAno} atividades com semana marcada no ano`,
    },
    {
      label: 'Concluídas',
      valor: cont(2),
      cor: 'text-green-600 dark:text-green-400',
      sub: `${pct}% da semana`,
    },
    {
      label: 'Em andamento',
      valor: cont(3),
      cor: 'text-blue-600 dark:text-blue-400',
      sub: `${cont(5)} pausadas`,
    },
    {
      label: 'Atrasadas ou sem baixa',
      valor: cont(4) + semBaixaNaoAtrasada,
      cor: 'text-red-600 dark:text-red-400',
      sub: `${cont(4)} atrasadas · ${semBaixaNaoAtrasada} com dias passados sem marcar`,
    },
  ]

  const mudarStatus = (atividadeId: string, status: number) => {
    setStatus.mutate(
      { atividadeId, semana, status, usuarioId: user?.id },
      { onError: () => toast.error('Erro ao atualizar status') },
    )
  }

  return (
    <div className="space-y-6">
      {/* phead */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[13px] text-content-muted">{eyebrow}</p>
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
            ‹ Semana anterior
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
          <Button
            size="sm"
            onClick={() => navigate('/cadastros?aba=atividades&nova=1')}
          >
            + Nova atividade
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {kpis.map((k) => (
          <Card key={k.label} className="px-4.5 py-3.5 p-4" disableHover>
            <p className="text-[12.5px] text-content">{k.label}</p>
            <p className={`text-4xl font-bold leading-tight tabular-nums mt-0.5 ${k.cor}`}>
              {k.valor}
            </p>
            <p className="text-xs text-content-muted mt-1">{k.sub}</p>
          </Card>
        ))}
      </div>

      {/* duas colunas */}
      <div className="grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          {/* Pendências */}
          <Card disableHover>
            <div className="flex justify-between items-baseline gap-2 px-4.5 p-4 pb-2.5 px-4">
              <h3 className="text-base font-bold text-content-strong">
                Pendências da semana
              </h3>
              <p className="text-xs text-content-muted">
                {pend.length} itens · clique no status para mudar
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    {['Atividade', 'Quem faz', 'Dias sem baixa', 'Status'].map((h, i) => (
                      <th
                        key={h}
                        className={`text-[11px] uppercase tracking-wide text-content-muted font-semibold px-3 py-2.5 border-b border-border-base whitespace-nowrap ${i === 3 ? 'text-right' : 'text-left'}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pend.slice(0, 10).map((a) => {
                    const s = semanasMap.get(a.id)
                    const pp = pastPending(a)
                    const setor = setores?.find((x) => x.id === a.setor_id)?.nome ?? ''
                    return (
                      <tr key={a.id}>
                        <td className="px-3 py-2.5 border-b border-border-subtle">
                          <span className="font-semibold text-content-strong text-sm">
                            {a.nome}
                          </span>
                          {s?.carry_from != null && (
                            <span className="inline-block ml-1.5 bg-red-600 text-white rounded px-1.5 text-[10.5px] font-bold leading-6 align-middle">
                              atrasada
                            </span>
                          )}
                          <p className="text-xs text-content-muted">
                            {[s?.observacao || a.local, setor]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 border-b border-border-subtle text-sm text-content">
                          {quemFaz(a)}
                        </td>
                        <td className="px-3 py-2.5 border-b border-border-subtle text-xs text-content-muted">
                          {pp.map((d) => DIAS_SEMANA_CURTO[d]).join(' · ') || '—'}
                        </td>
                        <td className="px-3 py-2.5 border-b border-border-subtle text-right">
                          <select
                            value={s?.status ?? 1}
                            onChange={(e) => mudarStatus(a.id, Number(e.target.value))}
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
                  {pend.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-3 py-7 text-center text-sm text-content-muted"
                      >
                        Nenhuma pendência nesta semana.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {pend.length > 10 && (
              <div className="flex justify-between items-center gap-2 px-4 py-2.5 border-t border-border-subtle text-xs text-content-muted">
                <span>Mostrando 10 de {pend.length}</span>
                <Button variant="secondary" size="sm" onClick={() => navigate('/semana')}>
                  Ver semana completa
                </Button>
              </div>
            )}
          </Card>

          {/* Tarefas por dia */}
          <Card disableHover>
            <div className="flex justify-between items-baseline gap-2 p-4 pb-2.5">
              <h3 className="text-base font-bold text-content-strong">
                Tarefas por dia
              </h3>
              <p className="text-xs text-content-muted">
                verde = já marcado como feito
              </p>
            </div>
            <div className="grid grid-cols-7 gap-2.5 px-4 pb-4 items-end h-40">
              {porDia.map((ativs, d) => {
                const n = ativs.length
                const feitas = feitasDia[d].length
                const ehHoje = ehAtual && d === idxHoje
                return (
                  <button
                    key={DIAS_SEMANA_CURTO[d]}
                    onClick={() => navigate('/hoje')}
                    className="flex flex-col items-center gap-1.5 h-full justify-end"
                  >
                    <b
                      className={`text-[13px] tabular-nums ${ehHoje ? 'text-blue-600 dark:text-blue-400' : 'text-content-strong'}`}
                    >
                      {n}
                    </b>
                    <span
                      className={`w-full rounded-t-md rounded-b-sm flex flex-col justify-end overflow-hidden ${ehHoje ? 'bg-primary' : 'bg-surface-3'}`}
                      style={{ height: `${Math.max(4, (n / diaMax) * 100)}%` }}
                    >
                      <i
                        className="block bg-green-600"
                        style={{ height: `${n ? (feitas / n) * 100 : 0}%` }}
                      />
                    </span>
                    <small
                      className={`text-xs ${ehHoje ? 'font-bold text-content-strong' : 'text-content-muted'}`}
                    >
                      {DIAS_SEMANA_CURTO[d]} {datas[d].getDate()}
                    </small>
                  </button>
                )
              })}
            </div>
          </Card>
        </div>

        <div className="space-y-4 min-w-0">
          {/* Por setor */}
          <Card disableHover>
            <div className="flex justify-between items-baseline gap-2 p-4 pb-2.5">
              <h3 className="text-base font-bold text-content-strong">Por setor</h3>
              <p className="text-xs text-content-muted">atividades na semana</p>
            </div>
            <div className="px-4 pb-4 space-y-1">
              {setorArr.map(([k, n]) => (
                <div
                  key={k}
                  className="grid grid-cols-[110px_1fr_44px] gap-2.5 items-center py-1 text-[13px]"
                >
                  <span className="truncate text-content">{k}</span>
                  <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
                    <i
                      className="block h-full bg-primary rounded-full"
                      style={{ width: `${(n / setorMax) * 100}%` }}
                    />
                  </div>
                  <b className="text-right tabular-nums text-content-strong">{n}</b>
                </div>
              ))}
              {setorArr.length === 0 && (
                <p className="text-sm text-content-muted py-4 text-center">
                  Sem atividades na semana.
                </p>
              )}
            </div>
          </Card>

          {/* Quem faz */}
          <Card disableHover>
            <div className="flex justify-between items-baseline gap-2 p-4 pb-2.5">
              <h3 className="text-base font-bold text-content-strong">Quem faz</h3>
              <p className="text-xs text-content-muted">concluídas / total</p>
            </div>
            <div className="px-4 pb-4 space-y-1">
              {quemArr.map(([k, [d, n]]) => (
                <div
                  key={k}
                  className="grid grid-cols-[110px_1fr_44px] gap-2.5 items-center py-1 text-[13px]"
                >
                  <span className="truncate text-content">{k}</span>
                  <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
                    <i
                      className={`block h-full rounded-full ${d === n ? 'bg-green-600' : 'bg-amber-500'}`}
                      style={{ width: `${(d / n) * 100}%` }}
                    />
                  </div>
                  <b className="text-right tabular-nums text-content-strong">
                    {d}/{n}
                  </b>
                </div>
              ))}
              {quemArr.length === 0 && (
                <p className="text-sm text-content-muted py-4 text-center">
                  Sem atividades na semana.
                </p>
              )}
            </div>
          </Card>

          {/* Recado da semana */}
          <Card className="p-4" disableHover>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-bold text-content-strong">
                Recado da semana
              </h3>
              {!editandoRecado && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setRecadoTxt(recado?.texto ?? '')
                    setEditandoRecado(true)
                  }}
                >
                  {recado?.texto ? 'Editar' : 'Escrever'}
                </Button>
              )}
            </div>
            {editandoRecado ? (
              <div className="space-y-2">
                <textarea
                  value={recadoTxt}
                  onChange={(e) => setRecadoTxt(e.target.value)}
                  rows={3}
                  placeholder="Mensagem para a equipe (aparece no PDF semanal)"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface-1 text-content-strong border-border-base"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={saveRecado.isPending}
                    onClick={() => {
                      if (!fazendaId) return
                      saveRecado.mutate(
                        {
                          planoId: plano.id,
                          fazendaId,
                          semana,
                          texto: recadoTxt.trim(),
                        },
                        {
                          onSuccess: () => {
                            toast.success('Recado salvo')
                            setEditandoRecado(false)
                          },
                          onError: () => toast.error('Erro ao salvar recado'),
                        },
                      )
                    }}
                  >
                    Salvar
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setEditandoRecado(false)}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : recado?.texto ? (
              <p className="text-sm text-content italic">{recado.texto}</p>
            ) : (
              <p className="text-sm text-content-faint">Nenhum recado esta semana.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
