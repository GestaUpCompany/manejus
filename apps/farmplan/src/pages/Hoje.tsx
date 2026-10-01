import { useEffect, useMemo, useState } from 'react'
import { useAuth, useFazenda } from '@gestaup/shared'
import {
  Card,
  PageSkeleton,
  EmptyState,
  useToast,
  Button,
  Input,
  Select,
} from '@gestaup/ui'
import {
  usePlanoAtivo,
  useSemanaDados,
  useFpSetDia,
  useFpSetStatusSemana,
  useFuncionariosFp,
  useEquipesFp,
} from '../services/farmplanService'
import { useSetores, useSaveExtra, useDeleteExtra } from '../services/cadastrosService'
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

const STATUS_DOT: Record<number, string> = {
  1: 'bg-slate-400',
  2: 'bg-green-500',
  3: 'bg-blue-500',
  4: 'bg-red-500',
  5: 'bg-amber-400',
}

const DOW_LONG = [
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
  'Domingo',
] as const

const MES_LONGO = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
] as const

interface PopState {
  atividade: FpAtividade
  x: number
  y: number
}

export function Hoje() {
  const { user } = useAuth()
  const { data: fazenda } = useFazenda(user?.id)
  const fazendaId = fazenda?.id
  const toast = useToast()

  const { data: plano, isLoading: loadingPlano } = usePlanoAtivo(fazendaId)
  const diaHoje = (new Date().getDay() + 6) % 7 // 0=seg .. 6=dom

  const [semana, setSemana] = useState<number | null>(null)
  const [diaSel, setDiaSel] = useState<number | null>(null)
  const sem = semana ?? plano?.semanaAtual ?? 1
  const d = diaSel ?? diaHoje

  const { data, isLoading } = useSemanaDados(fazendaId, plano?.id, sem)
  const { data: funcionarios } = useFuncionariosFp(fazendaId)
  const { data: equipes } = useEquipesFp(fazendaId)
  const { data: setores } = useSetores(fazendaId)
  const setDia = useFpSetDia()
  const setStatus = useFpSetStatusSemana()
  const saveExtra = useSaveExtra()
  const deleteExtra = useDeleteExtra()

  const [pop, setPop] = useState<PopState | null>(null)
  const [baixaOv, setBaixaOv] = useState<Map<string, boolean>>(new Map())
  const [extraForm, setExtraForm] = useState({
    nome: '',
    quem: '',
    setor_id: '',
    observacao: '',
  })

  useEffect(() => {
    const close = (e: KeyboardEvent) => e.key === 'Escape' && setPop(null)
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [])

  const semanasMap = useMemo(
    () => new Map(data?.semanas.map((s) => [s.atividade_id, s]) ?? []),
    [data?.semanas],
  )
  const baixasMap = useMemo(() => {
    const m = new Map<string, { feita: boolean; observacao: string | null }>()
    for (const b of data?.baixas ?? [])
      m.set(`${b.atividade_id}:${b.dia}`, { feita: b.feita, observacao: b.observacao })
    return m
  }, [data?.baixas])

  // reconcilia overrides otimistas com o que voltou do servidor
  useEffect(() => {
    if (!data?.baixas) return
    setBaixaOv((prev) => {
      if (prev.size === 0) return prev
      const server = new Map(data.baixas.map((b) => [`${b.atividade_id}:${b.dia}`, b.feita]))
      const next = new Map(prev)
      for (const [k, v] of next) {
        const sv = server.get(k)
        if (sv === v || (sv === undefined && v === false)) next.delete(k)
      }
      return next.size === prev.size ? prev : next
    })
  }, [data?.baixas])

  const diaFeito = (a: FpAtividade, diaIdx: number) =>
    baixaOv.get(`${a.id}:${diaIdx}`) ?? baixasMap.get(`${a.id}:${diaIdx}`)?.feita ?? false

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
  const setorNome = (a: FpAtividade) =>
    setores?.find((s) => s.id === a.setor_id)?.nome ?? '—'

  const tarefasDia = useMemo(() => {
    const t = (data?.atividades ?? []).filter((a) => {
      const s = semanasMap.get(a.id)
      return s && a.dias_semana[d] && s.status !== 5
    })
    return t.sort(
      (a, b) =>
        Number(diaFeito(a, d)) - Number(diaFeito(b, d)) ||
        (b.urgencia ?? 0) - (a.urgencia ?? 0) ||
        a.nome.localeCompare(b.nome, 'pt-BR'),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.atividades, semanasMap, baixasMap, baixaOv, d])

  const extrasDia = (data?.extras ?? []).filter((e) => e.dia === d)
  const feitas = tarefasDia.filter((a) => diaFeito(a, d)).length
  const emAndamento = tarefasDia.filter(
    (a) => !diaFeito(a, d) && semanasMap.get(a.id)?.status === 3,
  ).length
  const pessoasEnvolvidas = new Set(
    tarefasDia.map(quemFaz).concat(
      extrasDia.map((e) =>
        e.funcionario_id
          ? nomePessoa(e.funcionario_id) ?? '—'
          : e.equipe_id
            ? `Equipe ${equipes?.find((q) => q.id === e.equipe_id)?.nome ?? ''}`
            : '—',
      ),
    ),
  ).size

  const biblioteca = useMemo(
    () =>
      [...new Set((data?.atividades ?? []).map((a) => a.nome))].sort((x, y) =>
        x.localeCompare(y, 'pt-BR'),
      ),
    [data?.atividades],
  )
  const doers = useMemo(
    () => [
      ...(funcionarios ?? [])
        .filter((f) => f.ativo)
        .map((f) => ({ value: `f:${f.id}`, label: f.apelido || f.nome })),
      ...(equipes ?? [])
        .filter((e) => e.ativo)
        .map((e) => ({
          value: `e:${e.id}`,
          label: /^equipe/i.test(e.nome.trim()) ? e.nome : `Equipe ${e.nome}`,
        })),
    ],
    [funcionarios, equipes],
  )

  if (loadingPlano) return <PageSkeleton />
  if (!plano) {
    return (
      <EmptyState
        title="Nenhum plano anual ativo"
        description="Crie o plano do ano em Cadastros para começar a planejar atividades."
      />
    )
  }

  const datas = datasDaSemana(plano.semana1_inicio, sem)
  const dataSel = datas[d]
  const ehHoje = sem === plano.semanaAtual && d === diaHoje

  const moverDia = (delta: number) => {
    let nd = d + delta
    let ns = sem
    if (nd < 0) {
      nd = 6
      ns = Math.max(1, ns - 1)
    }
    if (nd > 6) {
      nd = 0
      ns = Math.min(53, ns + 1)
    }
    setSemana(ns)
    setDiaSel(nd)
  }
  const voltaHoje = () => {
    setSemana(null)
    setDiaSel(null)
  }

  const toggle = (a: FpAtividade) => {
    const atual = diaFeito(a, d)
    const v = !atual
    const key = `${a.id}:${d}`
    setBaixaOv((prev) => new Map(prev).set(key, v))
    setDia.mutate(
      { atividadeId: a.id, semana: sem, dia: d, feita: v, usuarioId: user?.id },
      {
        onSuccess: () =>
          toast.success(`${a.nome}${v ? ' concluída' : ' desmarcada'}`),
        onError: () => {
          setBaixaOv((prev) => {
            const n = new Map(prev)
            n.delete(key)
            return n
          })
          toast.error('Erro ao atualizar baixa')
        },
      },
    )
  }

  const lancarExtra = () => {
    if (!fazendaId || !extraForm.nome.trim() || !extraForm.quem) {
      toast.error('Informe o que foi feito e quem fez')
      return
    }
    const [tipo, id] = extraForm.quem.split(':')
    saveExtra.mutate(
      {
        fazendaId,
        semana: sem,
        dia: d,
        nome: extraForm.nome.trim(),
        funcionarioId: tipo === 'f' ? id : null,
        setorId: extraForm.setor_id || null,
        observacao: extraForm.observacao || null,
        usuarioId: user?.id,
      },
      {
        onSuccess: () => {
          toast.success('Lançado no histórico do dia')
          setExtraForm({ nome: '', quem: '', setor_id: '', observacao: '' })
        },
        onError: () => toast.error('Erro ao lançar extra'),
      },
    )
  }

  const extraNomePessoa = (e: (typeof extrasDia)[number]) =>
    e.funcionario_id
      ? nomePessoa(e.funcionario_id) ?? '—'
      : e.equipe_id
        ? `Equipe ${equipes?.find((q) => q.id === e.equipe_id)?.nome ?? ''}`
        : '—'

  return (
    <div className="space-y-4">
      {/* phead */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[13px] text-content-muted">
            Plano diário · semana {sem}
            {ehHoje ? ' · hoje' : ''}
          </p>
          <h1 className="text-3xl font-extrabold text-content-strong mt-0.5 tracking-tight">
            {DOW_LONG[d]}, {dataSel.getDate()} de {MES_LONGO[dataSel.getMonth()]}
          </h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            disabled={sem === 1 && d === 0}
            onClick={() => moverDia(-1)}
          >
            ‹ Dia anterior
          </Button>
          {!ehHoje && (
            <Button variant="secondary" size="sm" onClick={voltaHoje}>
              Hoje
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            disabled={sem === 53 && d === 6}
            onClick={() => moverDia(1)}
          >
            Próximo dia ›
          </Button>
        </div>
      </div>

      {/* seletor de dia */}
      <div className="flex gap-1.5 flex-wrap">
        {DIAS_SEMANA_CURTO.map((x, i) => (
          <button
            key={x}
            onClick={() => setDiaSel(i)}
            className={`border rounded-lg px-3 py-1.5 font-semibold text-[13px] flex flex-col items-center leading-tight min-w-[58px] transition-colors ${
              i === d
                ? 'bg-primary text-white border-primary'
                : 'border-border-base bg-surface-1 text-content-strong hover:bg-surface-2'
            }`}
          >
            {x}
            <small
              className={`font-medium text-[11px] ${i === d ? 'text-white/75' : 'text-content-muted'}`}
            >
              {`${String(datas[i].getDate()).padStart(2, '0')}/${String(datas[i].getMonth() + 1).padStart(2, '0')}`}
            </small>
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        {/* tabela do dia */}
        <Card className="p-0 overflow-hidden" disableHover>
          {isLoading ? (
            <PageSkeleton />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="w-11 px-3 py-2.5 border-b border-border-base" />
                    {['O que fazer hoje?', 'Local / observação', 'Quem faz', 'Setor'].map(
                      (h) => (
                        <th
                          key={h}
                          className="text-[11px] uppercase tracking-wide text-content-muted font-semibold px-3 py-2.5 border-b border-border-base text-left whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ),
                    )}
                    <th className="text-[11px] uppercase tracking-wide text-content-muted font-semibold px-3 py-2.5 border-b border-border-base text-right">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tarefasDia.map((a) => {
                    const s = semanasMap.get(a.id)
                    const bx = baixasMap.get(`${a.id}:${d}`)
                    const ok = diaFeito(a, d)
                    const st = (s?.status ?? 1) as FpStatusSemana
                    const carry = s?.carry_from != null
                    return (
                      <tr key={a.id}>
                        <td className="px-3 py-2.5 border-b border-border-subtle">
                          <button
                            onClick={() => toggle(a)}
                            aria-label={ok ? 'Desmarcar' : 'Marcar como feito'}
                            className={`w-[34px] h-[34px] rounded-full border-2 grid place-items-center transition-colors ${
                              ok
                                ? 'bg-green-600 border-green-600 text-white'
                                : st === 3
                                  ? 'border-blue-500 text-blue-500'
                                  : 'border-slate-400 text-transparent hover:border-green-500'
                            }`}
                          >
                            {ok && (
                              <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                        </td>
                        <td className="px-3 py-2.5 border-b border-border-subtle">
                          <b
                            className={`text-sm ${ok ? 'text-content-muted' : 'text-content-strong'}`}
                          >
                            {a.nome}
                          </b>
                          {carry && !ok && (
                            <span className="inline-block whitespace-nowrap align-middle bg-red-600 text-white rounded px-1 ml-1.5 text-[10px] font-bold">
                              atrasada
                            </span>
                          )}
                          {bx?.observacao && (
                            <p className="text-xs text-content-muted mt-0.5">
                              📝 {bx.observacao}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2.5 border-b border-border-subtle text-xs text-content-muted max-w-[200px]">
                          {s?.observacao || a.local || '—'}
                        </td>
                        <td className="px-3 py-2.5 border-b border-border-subtle text-sm text-content whitespace-nowrap">
                          {quemFaz(a)}
                        </td>
                        <td className="px-3 py-2.5 border-b border-border-subtle text-xs text-content-muted whitespace-nowrap">
                          {setorNome(a)}
                        </td>
                        <td className="px-3 py-2.5 border-b border-border-subtle text-right">
                          {ok ? (
                            <span className="inline-block text-[11.5px] font-semibold rounded-full px-2.5 py-0.5 bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
                              Feito hoje
                            </span>
                          ) : (
                            <button
                              onClick={(e) =>
                                setPop({ atividade: a, x: e.clientX, y: e.clientY })
                              }
                              className={`inline-block text-[11.5px] font-semibold rounded-full px-2.5 py-0.5 ${STATUS_PILL[st]}`}
                            >
                              {FP_STATUS_LABEL[st]}
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {extrasDia.map((e) => (
                    <tr key={e.id}>
                      <td className="px-3 py-2.5 border-b border-border-subtle">
                        <span className="w-[34px] h-[34px] rounded-full bg-green-600 text-white grid place-items-center">
                          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 border-b border-border-subtle">
                        <b className="text-sm text-content-strong">{e.nome}</b>
                        <span className="inline-block whitespace-nowrap align-middle bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 rounded px-1.5 ml-1.5 text-[10.5px] font-bold">
                          fora do plano
                        </span>
                      </td>
                      <td className="px-3 py-2.5 border-b border-border-subtle text-xs text-content-muted max-w-[200px]">
                        {e.observacao || '—'}
                      </td>
                      <td className="px-3 py-2.5 border-b border-border-subtle text-sm text-content whitespace-nowrap">
                        {extraNomePessoa(e)}
                      </td>
                      <td className="px-3 py-2.5 border-b border-border-subtle text-xs text-content-muted whitespace-nowrap">
                        {setores?.find((s) => s.id === e.setor_id)?.nome ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 border-b border-border-subtle text-right">
                        <button
                          onClick={() =>
                            deleteExtra.mutate(e.id, {
                              onSuccess: () => toast.success('Extra removido'),
                              onError: () => toast.error('Erro ao remover'),
                            })
                          }
                          className="text-xs font-semibold text-content-muted hover:text-red-600"
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))}
                  {tarefasDia.length === 0 && extrasDia.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-7 text-center text-sm text-content-muted"
                      >
                        Nada planejado para este dia.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-between items-center gap-2.5 px-4 py-2.5 border-t border-border-subtle text-xs text-content-muted flex-wrap">
            <span>
              {feitas} de {tarefasDia.length} tarefas do plano feitas
              {extrasDia.length ? ` · ${extrasDia.length} fora do plano` : ''}
            </span>
            <span>
              Toque no círculo para dar baixa · o aplicativo marca aqui em tempo real
            </span>
          </div>
        </Card>

        {/* coluna direita */}
        <div className="grid gap-4 content-start">
          <Card className="p-0 overflow-hidden" disableHover>
            <h3 className="px-4 pt-4 pb-1 text-sm font-bold text-content-strong">
              Resumo do dia
            </h3>
            <div className="grid grid-cols-3 gap-2 px-4 pb-4">
              <div className="rounded-lg px-3 py-2.5 bg-green-100 dark:bg-green-900/30">
                <b className="block text-2xl font-extrabold text-green-700 dark:text-green-300 tabular-nums">
                  {feitas + extrasDia.length}
                </b>
                <small className="block text-[11px] leading-tight font-semibold text-content-muted break-words">
                  concluídas
                </small>
              </div>
              <div className="rounded-lg px-3 py-2.5 bg-blue-100 dark:bg-blue-900/30">
                <b className="block text-2xl font-extrabold text-blue-700 dark:text-blue-300 tabular-nums">
                  {tarefasDia.length - feitas}
                </b>
                <small className="block text-[11px] leading-tight font-semibold text-content-muted break-words">
                  a fazer{emAndamento ? ` · ${emAndamento} em and.` : ''}
                </small>
              </div>
              <div className="rounded-lg px-3 py-2.5 bg-surface-2">
                <b className="block text-2xl font-extrabold text-content-strong tabular-nums">
                  {pessoasEnvolvidas}
                </b>
                <small className="block text-[11px] leading-tight font-semibold text-content-muted break-words">
                  pessoas/ equipes
                </small>
              </div>
            </div>
          </Card>

          <Card disableHover>
            <h4 className="text-sm font-bold text-content-strong">
              Lançar o que foi feito fora do plano
            </h4>
            <p className="text-[12.5px] text-content-muted -mt-0.5">
              Substitui a aba Plano_Diário: imprevistos entram aqui e contam no
              histórico.
            </p>
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-content-muted mb-1">
                  O que fez no dia?
                </label>
                <input
                  list="fp-lib"
                  value={extraForm.nome}
                  onChange={(e) => {
                    const nome = e.target.value
                    const ref = data?.atividades.find((a) => a.nome === nome)
                    setExtraForm((f) => ({
                      ...f,
                      nome,
                      setor_id: ref?.setor_id ?? f.setor_id,
                      quem:
                        f.quem ||
                        (ref?.executor_funcionario_id
                          ? `f:${ref.executor_funcionario_id}`
                          : ref?.executor_equipe_id
                            ? `e:${ref.executor_equipe_id}`
                            : ''),
                    }))
                  }}
                  placeholder="Buscar na biblioteca de atividades"
                  className="w-full px-3 py-2 rounded-lg border border-border-base bg-surface-1 text-sm text-content-strong focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <datalist id="fp-lib">
                  {biblioteca.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>
              <div className="grid grid-cols-2 gap-3 [&_label]:!mb-1 [&>div]:!mb-0">
                <Select
                  label="Quem fez?"
                  options={doers}
                  value={extraForm.quem}
                  onChange={(v) => setExtraForm((f) => ({ ...f, quem: v }))}
                  className="!min-h-0 !py-2 !px-3 !text-[13px] pr-8 [&>span]:block [&>span]:truncate"
                />
                <Select
                  label="Setor"
                  options={(setores ?? [])
                    .filter((s) => s.ativo)
                    .map((s) => ({ value: s.id, label: s.nome }))}
                  value={extraForm.setor_id}
                  onChange={(v) => setExtraForm((f) => ({ ...f, setor_id: v }))}
                  className="!min-h-0 !py-2 !px-3 !text-[13px] pr-8 [&>span]:block [&>span]:truncate"
                />
              </div>
              <Input
                label="Observação de execução"
                placeholder="Local, lote, o que aconteceu"
                value={extraForm.observacao}
                onChange={(e) =>
                  setExtraForm((f) => ({ ...f, observacao: e.target.value }))
                }
              />
              <div className="flex justify-end">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={saveExtra.isPending}
                  onClick={lancarExtra}
                >
                  + Lançar atividade
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* popover de status */}
      {pop && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPop(null)} />
          <div
            className="fixed z-50 bg-surface-1 border border-border-base rounded-xl shadow-xl p-1.5 min-w-[200px]"
            style={{
              left: Math.min(pop.x, window.innerWidth - 220),
              top: Math.min(pop.y, window.innerHeight - 280),
            }}
          >
            <div className="px-2 pt-1.5 pb-2 text-xs text-content-muted border-b border-border-subtle mb-1">
              <b className="block text-[13px] text-content-strong">{pop.atividade.nome}</b>
              Semana {sem}
            </div>
            {[1, 3, 2, 4, 5].map((v) => {
              const atual = semanasMap.get(pop.atividade.id)?.status
              return (
                <button
                  key={v}
                  onClick={() => {
                    setStatus.mutate(
                      {
                        atividadeId: pop.atividade.id,
                        semana: sem,
                        status: v,
                        usuarioId: user?.id,
                      },
                      { onError: () => toast.error('Erro ao atualizar status') },
                    )
                    setPop(null)
                  }}
                  className={`flex w-full gap-2 items-center px-2 py-1.5 rounded-md text-[13px] text-left hover:bg-surface-2 ${
                    atual === v ? 'font-bold' : ''
                  }`}
                >
                  <i className={`w-[11px] h-[11px] rounded-[3px] ${STATUS_DOT[v]}`} />
                  {FP_STATUS_LABEL[v as FpStatusSemana]}
                </button>
              )
            })}
            <button
              onClick={() => {
                setStatus.mutate(
                  {
                    atividadeId: pop.atividade.id,
                    semana: sem,
                    status: 0,
                    usuarioId: user?.id,
                  },
                  { onError: () => toast.error('Erro ao atualizar status') },
                )
                setPop(null)
              }}
              className="flex w-full gap-2 items-center px-2 py-1.5 rounded-md text-[13px] text-left hover:bg-surface-2"
            >
              <i className="w-[11px] h-[11px] rounded-[3px] bg-surface-2 border border-content-muted" />
              Tirar da semana
            </button>
          </div>
        </>
      )}
    </div>
  )
}
