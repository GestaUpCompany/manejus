import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, useFazenda } from '@gestaup/shared'
import { Card, PageSkeleton, EmptyState, Button, useToast } from '@gestaup/ui'
import {
  usePlanoAtivo,
  usePlanoSemanas,
  useFpSetStatusSemana,
  useFuncionariosFp,
  useEquipesFp,
} from '../services/farmplanService'
import { useAtividades, useSetores } from '../services/cadastrosService'
import { useIndicadores, useIndicadorValores } from '../services/indicadoresService'
import { useAvaliacoesAno } from '../services/equipeService'
import { gerarRelatorioMensal } from '../utils/relatoriosPDF'
import {
  DIAS_SEMANA_CURTO,
  FP_STATUS_LABEL,
  datasDaSemana,
  semanasIntersectamMes,
} from '../types/farmplan'
import type { FpAtividade, FpStatusSemana } from '../types/farmplan'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const MES_ABREV = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
]

const WCELL: Record<number, string> = {
  0: 'bg-surface-2 text-content-muted',
  1: 'bg-slate-200 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300',
  2: 'bg-green-600 text-white',
  3: 'bg-blue-600 text-white',
  4: 'bg-red-600 text-white',
  5: 'bg-amber-500 text-white',
}

interface PopState {
  atividade: FpAtividade
  semana: number
  x: number
  y: number
}

export function Mes() {
  const { user } = useAuth()
  const { data: fazenda } = useFazenda(user?.id)
  const fazendaId = fazenda?.id
  const navigate = useNavigate()
  const toast = useToast()

  const { data: plano, isLoading: loadingPlano } = usePlanoAtivo(fazendaId)
  const { data: atividades, isLoading: loadingAtividades } = useAtividades(plano?.id)
  const atividadeIds = useMemo(() => atividades?.map((a) => a.id), [atividades])
  const { data: semanas, isLoading: loadingSemanas } = usePlanoSemanas(
    fazendaId,
    plano?.id,
    atividadeIds,
  )
  const { data: funcionarios } = useFuncionariosFp(fazendaId)
  const { data: equipes } = useEquipesFp(fazendaId)
  const { data: setores } = useSetores(fazendaId)
  const { data: indicadores } = useIndicadores(fazendaId)
  const { data: valores } = useIndicadorValores(fazendaId, plano?.ano)
  const { data: avaliacoes } = useAvaliacoesAno(fazendaId, plano?.ano)
  const setStatus = useFpSetStatusSemana()

  const hoje = new Date()
  const [mesSel, setMesSel] = useState(hoje.getMonth())
  const [pop, setPop] = useState<PopState | null>(null)
  const [gerando, setGerando] = useState(false)
  const [filtros, setFiltros] = useState({ setor: '', quemFaz: '', status: '' })

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPop(null)
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [])

  const semanasMap = useMemo(() => {
    const m = new Map<string, { status: FpStatusSemana; carry_from: number | null }>()
    for (const s of semanas ?? []) m.set(`${s.atividade_id}:${s.semana}`, s)
    return m
  }, [semanas])

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

  // Semanas que intersectam cada mês do ano do plano
  const semanasPorMes = useMemo(() => {
    if (!plano) return [] as number[][]
    return Array.from({ length: 12 }, (_, m) =>
      semanasIntersectamMes(plano.semana1_inicio, plano.ano, m),
    )
  }, [plano])

  // Contagem por mês: [total de ocorrências, concluídas]
  const cntMes = useMemo(() => {
    return semanasPorMes.map((ws) => {
      let t = 0
      let d = 0
      for (const a of atividades ?? [])
        for (const w of ws) {
          const st = semanasMap.get(`${a.id}:${w}`)?.status
          if (st != null) {
            t++
            if (st === 2) d++
          }
        }
      return [t, d] as [number, number]
    })
  }, [semanasPorMes, atividades, semanasMap])

  const lista = useMemo(() => {
    if (!plano) return []
    const ws = semanasPorMes[mesSel] ?? []
    return (atividades ?? [])
      .filter((a) => {
        if (!ws.some((w) => semanasMap.has(`${a.id}:${w}`))) return false
        if (filtros.setor && a.setor_id !== filtros.setor) return false
        if (filtros.quemFaz && quemFaz(a) !== filtros.quemFaz) return false
        if (
          filtros.status &&
          !ws.some((w) => semanasMap.get(`${a.id}:${w}`)?.status === Number(filtros.status))
        )
          return false
        return true
      })
      .sort(
        (a, b) =>
          setorNome(a).localeCompare(setorNome(b), 'pt-BR') ||
          a.nome.localeCompare(b.nome, 'pt-BR'),
      )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plano, atividades, semanasPorMes, mesSel, filtros, semanasMap, funcionarios, equipes, setores])

  if (loadingPlano || loadingAtividades) return <PageSkeleton />
  if (!plano) {
    return (
      <EmptyState
        title="Nenhum plano anual ativo"
        description="Crie o plano do ano em Cadastros > Plano anual."
      />
    )
  }

  const ws = semanasPorMes[mesSel] ?? []
  const w0 = ws[0] ?? 1
  const w1 = ws[ws.length - 1] ?? 1
  const cur = plano.semanaAtual
  const [occ, done] = cntMes[mesSel] ?? [0, 0]
  const pct = occ ? Math.round((done / occ) * 100) : 0
  const cntMax = Math.max(1, ...cntMes.map((c) => c[0]))
  const totalAno = cntMes.reduce((s, c) => s + c[0], 0)
  const top3 = cntMes
    .map((c, i) => [c[0], i] as [number, number])
    .sort((a, b) => b[0] - a[0])
    .slice(0, 3)
    .filter((x) => x[0] > 0)
    .map((x) => MES_ABREV[x[1]].toLowerCase())
    .join(', ')
  const passadas = ws.filter((w) => w <= cur).length
  const emAndamento = passadas > 0 && passadas < ws.length

  const fd = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`

  const gerarPDF = async () => {
    if (!plano || !fazenda) return
    setGerando(true)
    try {
      const notasMes = (avaliacoes ?? []).filter(
        (a) => !a.nsa && a.nota !== null && ws.includes(a.semana),
      )
      const escoreMedio = notasMes.length
        ? notasMes.reduce((s, a) => s + Number(a.nota), 0) / notasMes.length
        : null
      const semMes = (semanas ?? []).filter((s) => ws.includes(s.semana))
      const pctAtividades = semMes.length
        ? (semMes.filter((s) => s.status === 2).length / semMes.length) * 100
        : null
      const inds = (indicadores ?? []).map((ind) => {
        let valor: number | null = null
        if (ind.origem === 'escore') valor = escoreMedio
        else if (ind.origem === 'atividades') valor = pctAtividades
        else {
          const row = (valores ?? []).find(
            (v) => v.indicador_id === ind.id && v.mes === mesSel + 1,
          )
          valor = row?.valor ?? null
        }
        return {
          nome: ind.nome,
          unidade: ind.unidade,
          metaLabel: ind.meta_label,
          valor,
          casas: ind.casas_decimais,
        }
      })
      await gerarRelatorioMensal({
        fazendaNome: fazenda.nome,
        plano,
        mesIdx: mesSel,
        mesNome: MESES[mesSel],
        semanasDoMes: ws,
        semanas: semanas ?? [],
        indicadores: inds,
        escoreMedio,
      })
    } catch {
      toast.error('Erro ao gerar PDF')
    } finally {
      setGerando(false)
    }
  }

  const aplicarStatus = (atividadeId: string, semana: number, status: number) => {
    setStatus.mutate(
      { atividadeId, semana, status, usuarioId: user?.id },
      { onError: () => toast.error('Erro ao atualizar status') },
    )
  }

  const selectCls =
    'border border-border-base bg-surface-1 rounded-lg px-2 py-1.5 text-[13px] text-content-strong'

  return (
    <div className="space-y-4">
      {/* phead */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[13px] text-content-muted">
            Plano mensal · semanas {w0} a {w1} · {pct}% das ocorrências concluídas
            {emAndamento ? ' · mês em andamento' : ''}
          </p>
          <h1 className="text-3xl font-extrabold text-content-strong mt-0.5 tracking-tight">
            {MESES[mesSel]} {plano.ano}
          </h1>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setMesSel((m) => (m + 11) % 12)}
          >
            ‹ Mês anterior
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setMesSel((m) => (m + 1) % 12)}
          >
            Próximo ›
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={gerando}
            onClick={gerarPDF}
          >
            {gerando ? 'Gerando...' : 'Gerar PDF do mês'}
          </Button>
          <Button size="sm" onClick={() => navigate('/cadastros?aba=atividades&nova=1')}>
            + Nova atividade
          </Button>
        </div>
      </div>

      {/* seletor de meses */}
      <Card disableHover>
        <div className="flex justify-between items-baseline gap-2 p-4 pb-2.5">
          <h3 className="text-base font-bold text-content-strong">Atividades por mês</h3>
          <p className="text-xs text-content-muted">
            {totalAno} ocorrências no ano{top3 ? ` · mais carregados: ${top3}` : ''} · verde
            = concluídas
          </p>
        </div>
        <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5 px-3.5 pb-3.5">
          {cntMes.map(([t, d], i) => (
            <button
              key={i}
              onClick={() => setMesSel(i)}
              className={`border rounded-lg px-1 py-2 flex flex-col items-center gap-1 text-xs transition-colors ${
                i === mesSel
                  ? 'border-primary bg-primary/10 text-content-strong font-bold'
                  : 'border-transparent bg-surface-2 text-content-muted hover:border-border-base'
              }`}
            >
              <small className="font-bold text-content-strong tabular-nums">{t}</small>
              <span className="w-3/5 h-[54px] flex flex-col justify-end rounded overflow-hidden bg-surface-3/60">
                <i
                  className="block w-full bg-slate-400 dark:bg-slate-500"
                  style={{ height: `${((t - d) / cntMax) * 100}%` }}
                />
                <i
                  className="block w-full bg-green-600"
                  style={{ height: `${(d / cntMax) * 100}%` }}
                />
              </span>
              {MES_ABREV[i]}
            </button>
          ))}
        </div>
      </Card>

      {/* filtros */}
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
          value={filtros.quemFaz}
          onChange={(e) => setFiltros((f) => ({ ...f, quemFaz: e.target.value }))}
          className={selectCls}
          aria-label="Quem faz"
        >
          <option value="">Quem faz</option>
          {[...new Set((atividades ?? []).map((a) => quemFaz(a)))].sort().map((n) => (
            <option key={n} value={n}>
              {n}
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
      </div>

      {/* tabela consolidada */}
      {loadingSemanas ? (
        <PageSkeleton />
      ) : (
        <Card className="p-0 overflow-hidden" disableHover>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-[11px] uppercase tracking-wide text-content-muted font-semibold px-3 py-2.5 border-b border-border-base text-left whitespace-nowrap">
                    O que fazer no mês?
                  </th>
                  <th className="text-[11px] uppercase tracking-wide text-content-muted font-semibold px-3 py-2.5 border-b border-border-base text-left whitespace-nowrap">
                    Quem faz
                  </th>
                  <th className="text-[11px] uppercase tracking-wide text-content-muted font-semibold px-3 py-2.5 border-b border-border-base text-left whitespace-nowrap">
                    Setor
                  </th>
                  {ws.map((w) => {
                    const datas = datasDaSemana(plano.semana1_inicio, w)
                    return (
                      <th
                        key={w}
                        className={`text-[11px] uppercase tracking-wide text-content-muted font-semibold px-3 py-2.5 border-b border-border-base text-center whitespace-nowrap ${w === cur ? 'bg-primary/10' : ''}`}
                      >
                        Sem. {w}
                        <div className="normal-case tracking-normal font-medium text-[11px]">
                          {fd(datas[0])}–{fd(datas[6])}
                        </div>
                      </th>
                    )
                  })}
                  <th className="text-[11px] uppercase tracking-wide text-content-muted font-semibold px-3 py-2.5 border-b border-border-base text-left whitespace-nowrap">
                    Feito
                  </th>
                </tr>
              </thead>
              <tbody>
                {lista.map((a) => {
                  const tot = ws.filter((w) => semanasMap.has(`${a.id}:${w}`)).length
                  const dn = ws.filter(
                    (w) => semanasMap.get(`${a.id}:${w}`)?.status === 2,
                  ).length
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
                          {a.dias_semana
                            .map((v, i) => (v ? DIAS_SEMANA_CURTO[i] : ''))
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 border-b border-border-subtle text-sm text-content">
                        {quemFaz(a)}
                      </td>
                      <td className="px-3 py-2.5 border-b border-border-subtle text-xs text-content-muted">
                        {setorNome(a)}
                      </td>
                      {ws.map((w) => {
                        const st = semanasMap.get(`${a.id}:${w}`)?.status ?? 0
                        return (
                          <td
                            key={w}
                            className={`px-3 py-2.5 border-b border-border-subtle text-center ${w === cur ? 'bg-primary/10' : ''}`}
                          >
                            <button
                              onClick={(e) =>
                                setPop({ atividade: a, semana: w, x: e.clientX, y: e.clientY })
                              }
                              className={`inline-grid place-items-center min-w-16 h-[26px] rounded-md text-[11.5px] font-semibold px-1.5 ${WCELL[st]}`}
                            >
                              {st ? FP_STATUS_LABEL[st as FpStatusSemana] : '+'}
                            </button>
                          </td>
                        )
                      })}
                      <td className="px-3 py-2.5 border-b border-border-subtle text-xs text-content-muted tabular-nums">
                        {dn}/{tot}
                      </td>
                    </tr>
                  )
                })}
                {lista.length === 0 && (
                  <tr>
                    <td
                      colSpan={ws.length + 4}
                      className="px-3 py-7 text-center text-sm text-content-muted"
                    >
                      Nada planejado neste mês com esses filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between items-center gap-2.5 px-4 py-2.5 border-t border-border-subtle text-xs text-content-muted flex-wrap">
            <span>{lista.length} atividades no mês</span>
            <span>
              Clique numa célula para mudar o status ou incluir a atividade na semana
            </span>
          </div>
        </Card>
      )}

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
              Semana {pop.semana}
            </div>
            {[1, 3, 2, 4, 5].map((v) => {
              const atual = semanasMap.get(`${pop.atividade.id}:${pop.semana}`)?.status
              return (
                <button
                  key={v}
                  onClick={() => {
                    aplicarStatus(pop.atividade.id, pop.semana, v)
                    setPop(null)
                  }}
                  className={`flex w-full gap-2 items-center px-2 py-1.5 rounded-md text-[13px] text-left hover:bg-surface-2 ${
                    atual === v ? 'font-bold' : ''
                  }`}
                >
                  <i
                    className={`w-[11px] h-[11px] rounded-[3px] ${
                      { 1: 'bg-slate-400', 2: 'bg-green-500', 3: 'bg-blue-500', 4: 'bg-red-500', 5: 'bg-amber-400' }[v]
                    }`}
                  />
                  {FP_STATUS_LABEL[v as FpStatusSemana]}
                </button>
              )
            })}
            <button
              onClick={() => {
                aplicarStatus(pop.atividade.id, pop.semana, 0)
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
