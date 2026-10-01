import { useMemo, useState } from 'react'
import { useAuth, useFazenda } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Card, Button, Select, PageSkeleton, EmptyState, useToast } from '@gestaup/ui'
import {
  usePlanoAtivo,
  useSemanaDados,
  usePlanoSemanas,
  useFuncionariosFp,
  useEquipesFp,
} from '../services/farmplanService'
import { useAtividades, useSetores } from '../services/cadastrosService'
import { useIndicadores, useIndicadorValores } from '../services/indicadoresService'
import { useAvaliacoesAno, useContratosFazenda } from '../services/equipeService'
import { gerarRelatorioSemanal, gerarRelatorioMensal } from '../utils/relatoriosPDF'
import { semanasIntersectamMes, datasDaSemana, FP_TIPO_LABEL } from '../types/farmplan'
import type { FpAtividade, FpTipoAtividade } from '../types/farmplan'

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const MESES_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// Paleta do modelo (navy + status)
const NAVY = '#114665'
const COR: Record<number, string> = {
  1: '#5B7384',
  2: '#20A44B',
  3: '#2B79AE',
  4: '#C23D2B',
  5: '#C98A16',
}

const nf = (v: number | null | undefined, d = 2) =>
  v == null || Number.isNaN(v)
    ? '—'
    : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null)
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
const scHex = (v: number | null) =>
  v == null ? '#8C9BA2' : v >= 9.3 ? '#20A44B' : v >= 8.5 ? '#C98A16' : '#C23D2B'

interface OccStats {
  t: number
  d: number
  p: number
  l: number
  pl: number
  z: number
}

function Hbars({
  rows,
  max = 100,
  fmt = (v: number) => `${v}%`,
  color = NAVY,
}: {
  rows: { label: string; v: number; sub?: string; color?: string; tip?: string }[]
  max?: number
  fmt?: (v: number) => string
  color?: string
}) {
  return (
    <div className="space-y-1.5 text-[13px]">
      {rows.map((r, i) => (
        <div
          key={i}
          className="grid grid-cols-[130px_1fr_auto] sm:grid-cols-[160px_1fr_auto_auto] items-center gap-2.5"
          title={r.tip ?? `${r.label}: ${fmt(r.v)}`}
        >
          <span className="truncate text-content">{r.label}</span>
          <span className="h-2.5 rounded bg-surface-3/60 overflow-hidden">
            <i
              className="block h-full rounded"
              style={{
                width: `${Math.max(0, Math.min(100, (r.v / max) * 100))}%`,
                background: r.color || color,
              }}
            />
          </span>
          <b className="num font-semibold text-content-strong tabular-nums">{fmt(r.v)}</b>
          {r.sub ? <small className="hidden sm:block text-content-faint w-20">{r.sub}</small> : <span className="hidden sm:block w-20" />}
        </div>
      ))}
    </div>
  )
}

function Dotplot({
  rows,
  refV,
  refLab,
}: {
  rows: { label: string; v: number; t: number | null; c: number | null }[]
  refV: number | null
  refLab: string
}) {
  const lo = 7
  const hi = 10
  const x = (v: number) => ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * 100
  const ticks = [7, 7.5, 8, 8.5, 9, 9.5, 10]
  return (
    <div className="space-y-0.5 text-[13px]">
      <div className="grid grid-cols-[110px_1fr_44px] gap-2.5 items-center">
        <span />
        <div className="relative h-4">
          {ticks.map((t) => (
            <em
              key={t}
              className="absolute -translate-x-1/2 not-italic text-[10.5px] text-content-faint"
              style={{ left: `${x(t)}%` }}
            >
              {nf(t, 1)}
            </em>
          ))}
        </div>
        <span />
      </div>
      {rows.map((r) => (
        <div
          key={r.label}
          className="grid grid-cols-[110px_1fr_44px] gap-2.5 items-center h-[26px]"
          title={`${r.label} · escore ${nf(r.v)}${r.t != null ? ` · tarefas ${nf(r.t)} · comport. ${nf(r.c)}` : ''}`}
        >
          <span className="truncate text-content">{r.label}</span>
          <div className="relative h-full">
            {ticks.map((t) => (
              <i
                key={t}
                className="absolute top-0 bottom-0 border-l border-border-subtle"
                style={{ left: `${x(t)}%` }}
              />
            ))}
            {refV != null && (
              <i
                className="absolute -top-0.5 -bottom-0.5 border-l-2 border-dashed"
                style={{ left: `${x(refV)}%`, borderColor: COR[1] }}
              />
            )}
            <b
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full"
              style={{ left: `${x(r.v)}%`, background: scHex(r.v) }}
            />
          </div>
          <span className="num text-right font-bold tabular-nums" style={{ color: scHex(r.v) }}>
            {nf(r.v)}
          </span>
        </div>
      ))}
      {refV != null && (
        <div className="flex items-center gap-1.5 mt-1.5 text-[11.5px] text-content-faint">
          <i className="w-3.5 border-t-2 border-dashed" style={{ borderColor: COR[1] }} />
          {refLab} {nf(refV)}
        </div>
      )}
    </div>
  )
}

function LinhaChart({ pts }: { pts: { x: number; y: number | null; tip: string }[] }) {
  const W = 640
  const H = 200
  const L = 34
  const R = 12
  const T = 12
  const B = 24
  const n = pts.length
  const lo = 7
  const hi = 10
  const X = (i: number) => L + (n < 2 ? 0 : (i * (W - L - R)) / (n - 1))
  const Y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B)
  const ok = pts.filter((p) => p.y != null)
  if (!ok.length)
    return <div className="py-8 text-center text-sm text-content-faint">Sem notas lançadas neste período.</div>
  const path = pts.map((p, i) => (p.y == null ? null : ([X(i), Y(p.y)] as const))).filter(Boolean) as readonly (readonly [number, number])[]
  const d = path.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' ')
  const last = path[path.length - 1]
  const lp = ok[ok.length - 1]
  const slot = (W - L - R) / Math.max(1, n - 1)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label="Gráfico de linha">
      {[7, 8, 9, 10].map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="var(--color-border-base)" strokeWidth={1} />
          <text x={L - 6} y={Y(v) + 3.5} textAnchor="end" fontSize={10} fill="var(--color-content-faint)">
            {v}
          </text>
        </g>
      ))}
      <path d={`${d} L${last[0].toFixed(1)} ${H - B} L${path[0][0].toFixed(1)} ${H - B} Z`} fill={NAVY} opacity={0.08} />
      <path d={d} fill="none" stroke={NAVY} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) =>
        p.y == null ? null : (
          <circle
            key={i}
            cx={X(i)}
            cy={Y(p.y)}
            r={p === lp ? 4.5 : 2.5}
            fill={p === lp ? NAVY : '#fff'}
            stroke={NAVY}
            strokeWidth={2}
          />
        ),
      )}
      <text x={last[0] - 6} y={last[1] - 9} textAnchor="end" fontSize={11} fontWeight={700} fill="var(--color-content-strong)">
        {nf(lp.y, 1)}
      </text>
      {pts.map((p, i) => (
        <g key={`x${i}`}>
          <text x={X(i)} y={H - 7} textAnchor="middle" fontSize={10} fill="var(--color-content-faint)">
            {p.x}
          </text>
          <rect x={X(i) - slot / 2} y={T} width={slot} height={H - T - B} fill="transparent">
            <title>{p.tip}</title>
          </rect>
        </g>
      ))}
    </svg>
  )
}

function Stack({ r }: { r: OccStats }) {
  const segs: [number, number][] = [
    [r.d, 2],
    [r.p, 3],
    [r.l, 4],
    [r.z, 5],
    [r.pl, 1],
  ]
  return (
    <span className="flex h-2.5 w-full rounded overflow-hidden bg-surface-3/60">
      {segs
        .filter(([n]) => n > 0)
        .map(([n, s]) => (
          <i
            key={s}
            style={{ flex: n, background: COR[s] }}
            title={`${n} (${pct(n, r.t)}%)`}
          />
        ))}
    </span>
  )
}

export function Relatorios() {
  const { user } = useAuth()
  const { data: fazenda } = useFazenda(user?.id)
  const fazendaId = fazenda?.id
  const { data: plano, isLoading: loadingPlano } = usePlanoAtivo(fazendaId)
  const { data: funcionarios } = useFuncionariosFp(fazendaId)
  const { data: equipes } = useEquipesFp(fazendaId)
  const { data: setores } = useSetores(fazendaId)
  const { data: atividades } = useAtividades(plano?.id)
  const atividadeIds = useMemo(() => atividades?.map((a) => a.id), [atividades])
  const { data: todasSemanas } = usePlanoSemanas(fazendaId, plano?.id, atividadeIds)
  const { data: indicadores } = useIndicadores(fazendaId)
  const { data: valores } = useIndicadorValores(fazendaId, plano?.ano)
  const { data: avaliacoes } = useAvaliacoesAno(fazendaId, plano?.ano)
  const { data: contratoItens } = useContratosFazenda(fazendaId)
  const toast = useToast()

  const [rel, setRel] = useState<'equipe' | 'setores' | 'atividades'>('equipe')
  const [relP, setRelP] = useState('ano')
  const [semanaSel, setSemanaSel] = useState('')
  const [mesSel, setMesSel] = useState(String(new Date().getMonth()))
  const [gerando, setGerando] = useState(false)

  const CUR = plano?.semanaAtual ?? 1

  const semanaNum = Number(semanaSel) || CUR
  const { data: dadosSemana } = useSemanaDados(fazendaId, plano?.id, semanaNum)

  // Faixas de semana por mês (a partir das datas do plano)
  const mesFaixas = useMemo(() => {
    if (!plano) return []
    return MESES.map((_, i) => {
      const ws = semanasIntersectamMes(plano.semana1_inicio, plano.ano, i).sort((a, b) => a - b)
      return [ws[0] ?? 0, ws[ws.length - 1] ?? 0] as const
    })
  }, [plano])

  const relRange = (): [number, number] => {
    if (relP === '4') return [Math.max(1, CUR - 3), CUR]
    if (relP === '12') return [Math.max(1, CUR - 11), CUR]
    if (relP.startsWith('m')) {
      const m = Number(relP.slice(1))
      const f = mesFaixas[m]
      return f ? [f[0], Math.min(f[1], CUR)] : [1, CUR]
    }
    return [1, CUR]
  }
  const [a0, b0] = relRange()

  const fd = (w: number, offset = 0) => {
    if (!plano) return ''
    const d = datasDaSemana(plano.semana1_inicio, w)[offset]
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  // Mapas auxiliares
  const funcById = useMemo(() => new Map((funcionarios ?? []).map((f) => [f.id, f])), [funcionarios])
  const equipeById = useMemo(() => new Map((equipes ?? []).map((e) => [e.id, e])), [equipes])
  const setorById = useMemo(() => new Map((setores ?? []).map((s) => [s.id, s])), [setores])
  const itemTipo = useMemo(
    () => new Map((contratoItens ?? []).map((c) => [c.id, c.tipo])),
    [contratoItens],
  )

  const wkMap = useMemo(() => {
    const m = new Map<string, Map<number, number>>()
    for (const s of todasSemanas ?? []) {
      if (!m.has(s.atividade_id)) m.set(s.atividade_id, new Map())
      m.get(s.atividade_id)!.set(s.semana, s.status)
    }
    return m
  }, [todasSemanas])

  const execLabel = (a: FpAtividade) =>
    a.executor_funcionario_id
      ? funcById.get(a.executor_funcionario_id)?.apelido ||
        funcById.get(a.executor_funcionario_id)?.nome ||
        '—'
      : a.executor_equipe_id
        ? equipeById.get(a.executor_equipe_id)?.nome || '—'
        : '—'

  const setorNome = (a: FpAtividade) => (a.setor_id ? setorById.get(a.setor_id)?.nome || '—' : '—')

  // notas por funcionário por semana: funcId -> semana -> {all:[], tarefa:[], comportamento:[]}
  const notas = useMemo(() => {
    const m = new Map<string, Map<number, { all: number[]; t: number[]; c: number[] }>>()
    for (const av of avaliacoes ?? []) {
      if (av.nsa || av.nota === null) continue
      const nota = Number(av.nota)
      if (!m.has(av.funcionario_id)) m.set(av.funcionario_id, new Map())
      const fm = m.get(av.funcionario_id)!
      if (!fm.has(av.semana)) fm.set(av.semana, { all: [], t: [], c: [] })
      const e = fm.get(av.semana)!
      e.all.push(nota)
      if (itemTipo.get(av.contrato_item_id) === 'tarefa') e.t.push(nota)
      else if (itemTipo.get(av.contrato_item_id) === 'comportamento') e.c.push(nota)
    }
    return m
  }, [avaliacoes, itemTipo])

  const notasFaixa = (funcId: string, a: number, b: number) => {
    const fm = notas.get(funcId)
    const all: number[] = []
    const t: number[] = []
    const c: number[] = []
    if (fm)
      for (let w = a; w <= b; w++) {
        const e = fm.get(w)
        if (e) {
          all.push(...e.all)
          t.push(...e.t)
          c.push(...e.c)
        }
      }
    return { all, t, c }
  }
  const pWeek = (funcId: string, w: number) => mean(notas.get(funcId)?.get(w)?.all ?? [])

  const occStats = (filter: (a: FpAtividade) => boolean, a: number, b: number): OccStats => {
    const r: OccStats = { t: 0, d: 0, p: 0, l: 0, pl: 0, z: 0 }
    for (const at of atividades ?? []) {
      if (!filter(at)) continue
      const wk = wkMap.get(at.id)
      if (!wk) continue
      for (let w = a; w <= b; w++) {
        const s = wk.get(w)
        if (!s) continue
        r.t++
        if (s === 2) r.d++
        else if (s === 3) r.p++
        else if (s === 4) r.l++
        else if (s === 5) r.z++
        else r.pl++
      }
    }
    return r
  }

  if (loadingPlano) return <PageSkeleton />
  if (!plano) {
    return (
      <EmptyState
        title="Nenhum plano anual ativo"
        description="Crie o plano do ano em Cadastros > Plano anual."
      />
    )
  }

  const mesesAte = MESES.map((_, i) => i).filter((i) => (mesFaixas[i]?.[0] ?? 99) <= CUR)
  const periodoOptions = [
    { value: 'ano', label: 'Ano até agora' },
    { value: '12', label: 'Últimas 12 semanas' },
    { value: '4', label: 'Últimas 4 semanas' },
    ...mesesAte.map((i) => ({ value: `m${i}`, label: MESES[i] })),
  ]
  const relLabel = `semanas ${a0} a ${b0} · ${fd(a0)} a ${fd(b0, 6)}`

  /* ===== Equipe ===== */
  const ev = (funcionarios ?? [])
    .map((p) => {
      const f = notasFaixa(p.id, a0, b0)
      return { p, v: mean(f.all), t: mean(f.t), c: mean(f.c) }
    })
    .filter((x) => x.v != null)
    .sort((x, y) => (y.v ?? 0) - (x.v ?? 0))
  const avgEquipe = mean(ev.map((x) => x.v ?? 0))
  const tot = occStats(() => true, a0, b0)
  const hw: number[] = []
  for (let w = a0; w <= b0; w++) hw.push(w)
  const wkPts = hw.map((w) => {
    const v = mean(
      (funcionarios ?? [])
        .map((p) => pWeek(p.id, w))
        .filter((x): x is number => x != null),
    )
    return { x: w, y: v, tip: `Semana ${w} (${fd(w)}): média ${v == null ? 'sem notas' : nf(v)}` }
  })
  const dos = new Map<string, { t: number; d: number; l: number }>()
  for (const a of atividades ?? []) {
    const k = execLabel(a)
    const wk = wkMap.get(a.id)
    if (!wk || k === '—') continue
    for (let w = a0; w <= b0; w++) {
      const s = wk.get(w)
      if (!s) continue
      if (!dos.has(k)) dos.set(k, { t: 0, d: 0, l: 0 })
      const e = dos.get(k)!
      e.t++
      if (s === 2) e.d++
      if (s === 4) e.l++
    }
  }
  const drows = [...dos.entries()]
    .filter(([, v]) => v.t >= 2)
    .map(([k, v]) => {
      const p = pct(v.d, v.t)
      return {
        label: k,
        v: p,
        sub: `${v.d}/${v.t}${v.l ? ` · ${v.l} atras.` : ''}`,
        color: p >= 85 ? COR[2] : p >= 60 ? COR[5] : COR[4],
        tip: `${k} · ${v.d} de ${v.t} concluídas (${p}%)${v.l ? ` · ${v.l} atrasadas` : ''}`,
      }
    })
    .sort((x, y) => y.v - x.v)

  /* ===== Setores ===== */
  const secs = [...new Set((atividades ?? []).map((a) => setorNome(a)))].filter((s) => s !== '—')
  const rowsSetor = secs
    .map((s) => ({ s, r: occStats((a) => setorNome(a) === s, a0, b0) }))
    .filter((x) => x.r.t)
    .sort((x, y) => pct(y.r.d, y.r.t) - pct(x.r.d, x.r.t))
  const mxSetor = Math.max(1, ...rowsSetor.map((x) => x.r.t))

  /* ===== Atividades ===== */
  const mv = mesesAte.map((i) => {
    const f = mesFaixas[i]
    return [i, occStats(() => true, f[0], Math.min(f[1], CUR))] as const
  })
  const mm = Math.max(1, ...mv.map((v) => v[1].t))
  const tipos = new Map<number, number>()
  for (const a of atividades ?? []) {
    const wk = wkMap.get(a.id)
    if (!wk) continue
    let n = 0
    for (let w = a0; w <= b0; w++) if (wk.get(w)) n++
    if (n) tipos.set(a.tipo, (tipos.get(a.tipo) ?? 0) + n)
  }
  const tt = [...tipos.values()].reduce((x, y) => x + y, 0)
  const late = (atividades ?? [])
    .map((a) => {
      const wk = wkMap.get(a.id)
      let n = 0
      if (wk) for (let w = a0; w <= b0; w++) if (wk.get(w) === 4) n++
      return [a, n] as const
    })
    .filter((x) => x[1] > 0)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 10)

  const gerarSemanal = async () => {
    if (!plano || !fazenda || !dadosSemana) return
    setGerando(true)
    try {
      const { data: recadoRow } = await supabase
        .from('fp_recados')
        .select('texto')
        .eq('plano_id', plano.id)
        .eq('semana', semanaNum)
        .maybeSingle()
      await gerarRelatorioSemanal({
        fazendaNome: fazenda.nome,
        plano,
        semana: semanaNum,
        atividades: dadosSemana.atividades,
        semanas: dadosSemana.semanas,
        baixas: dadosSemana.baixas,
        extras: dadosSemana.extras,
        funcionarios: funcionarios ?? [],
        equipes: (equipes ?? []).map((e) => ({ id: e.id, nome: e.nome })),
        recado: recadoRow?.texto ?? null,
      })
    } catch {
      toast.error('Erro ao gerar PDF')
    } finally {
      setGerando(false)
    }
  }

  const gerarMensal = async () => {
    if (!plano || !fazenda) return
    setGerando(true)
    try {
      const mesIdx = Number(mesSel)
      const semanasDoMes = semanasIntersectamMes(plano.semana1_inicio, plano.ano, mesIdx)
      const notasMes = (avaliacoes ?? []).filter(
        (a) => !a.nsa && a.nota !== null && semanasDoMes.includes(a.semana),
      )
      const escoreMedio = notasMes.length
        ? notasMes.reduce((s, a) => s + Number(a.nota), 0) / notasMes.length
        : null
      const semMes = (todasSemanas ?? []).filter((s) => semanasDoMes.includes(s.semana))
      const pctAtividades = semMes.length
        ? (semMes.filter((s) => s.status === 2).length / semMes.length) * 100
        : null
      const inds = (indicadores ?? []).map((ind) => {
        let valor: number | null = null
        if (ind.origem === 'escore') valor = escoreMedio
        else if (ind.origem === 'atividades') valor = pctAtividades
        else valor = (valores ?? []).find((v) => v.indicador_id === ind.id && v.mes === mesIdx + 1)?.valor ?? null
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
        mesIdx,
        mesNome: MESES[mesIdx],
        semanasDoMes,
        semanas: todasSemanas ?? [],
        indicadores: inds,
        escoreMedio,
      })
    } catch {
      toast.error('Erro ao gerar PDF')
    } finally {
      setGerando(false)
    }
  }

  const TABS = [
    ['equipe', 'Equipe'],
    ['setores', 'Setores'],
    ['atividades', 'Atividades'],
  ] as const

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Relatórios · {relLabel}</p>
          <h1 className="text-[28px] font-bold font-display text-content-strong tracking-tight leading-tight">
            Rendimento da fazenda
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-content-muted">Período</span>
          <div className="min-w-[190px] [&>div]:mb-0">
            <Select value={relP} onChange={setRelP} options={periodoOptions} />
          </div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-border-base">
        {TABS.map(([k, l]) => (
          <button
            key={k}
            onClick={() => setRel(k)}
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg -mb-px border-b-2 transition-colors ${
              rel === k
                ? 'border-primary text-content-strong'
                : 'border-transparent text-content-muted hover:text-content'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {rel === 'equipe' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="p-4" disableHover>
              <small className="text-xs text-content-muted">Escore médio da equipe</small>
              <b className="num block text-2xl font-bold text-content-strong">{nf(avgEquipe)}</b>
              <span className="text-[11px] text-content-faint">
                {ev.length} colaboradores com nota no período
              </span>
            </Card>
            <Card className="p-4" disableHover>
              <small className="text-xs text-content-muted">Melhor escore</small>
              <b className="num block text-2xl font-bold text-green-600">
                {ev[0] ? nf(ev[0].v) : '—'}
              </b>
              <span className="text-[11px] text-content-faint">
                {ev[0] ? ev[0].p.apelido || ev[0].p.nome : ''}
              </span>
            </Card>
            <Card className="p-4" disableHover>
              <small className="text-xs text-content-muted">Tarefas do plano concluídas</small>
              <b className="num block text-2xl font-bold text-content-strong">{pct(tot.d, tot.t)}%</b>
              <span className="text-[11px] text-content-faint">
                {tot.d} de {tot.t} semanas-atividade
              </span>
            </Card>
            <Card className="p-4" disableHover>
              <small className="text-xs text-content-muted">Semanas atrasadas</small>
              <b className="num block text-2xl font-bold text-red-600">{tot.l}</b>
              <span className="text-[11px] text-content-faint">no período</span>
            </Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-3.5">
            <Card className="p-4" disableHover>
              <div className="flex items-baseline justify-between gap-2 mb-3">
                <h3 className="m-0 text-[15px] font-bold text-content-strong">Escore individual</h3>
                <small className="text-xs text-content-faint">
                  média de tarefas e comportamentos · escala 7 a 10
                </small>
              </div>
              {ev.length ? (
                <Dotplot
                  rows={ev.map((x) => ({
                    label: x.p.apelido || x.p.nome,
                    v: x.v ?? 0,
                    t: x.t,
                    c: x.c,
                  }))}
                  refV={avgEquipe}
                  refLab="Média da equipe"
                />
              ) : (
                <div className="py-8 text-center text-sm text-content-faint">
                  Sem avaliações neste período.
                </div>
              )}
            </Card>

            <Card className="p-4" disableHover>
              <div className="flex items-baseline justify-between gap-2 mb-3">
                <h3 className="m-0 text-[15px] font-bold text-content-strong">
                  Evolução do escore da equipe
                </h3>
                <small className="text-xs text-content-faint">média semanal das notas</small>
              </div>
              {hw.length ? (
                <LinhaChart pts={wkPts} />
              ) : (
                <div className="py-8 text-center text-sm text-content-faint">
                  Sem avaliações neste período.
                </div>
              )}
            </Card>

            <Card className="p-4" disableHover>
              <div className="flex items-baseline justify-between gap-2 mb-3">
                <h3 className="m-0 text-[15px] font-bold text-content-strong">
                  Rendimento no plano por pessoa ou equipe
                </h3>
                <small className="text-xs text-content-faint">% das semanas-atividade concluídas</small>
              </div>
              {drows.length ? (
                <Hbars rows={drows} />
              ) : (
                <div className="py-8 text-center text-sm text-content-faint">Sem dados no período.</div>
              )}
              <div className="mt-3 pt-3 border-t border-border-subtle flex gap-4 text-[11px] text-content-muted">
                <span className="flex items-center gap-1.5">
                  <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: COR[2] }} />
                  85% ou mais
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: COR[5] }} />
                  60 a 84%
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: COR[4] }} />
                  abaixo de 60%
                </span>
              </div>
            </Card>

            <Card className="p-4" disableHover>
              <div className="flex items-baseline justify-between gap-2 mb-3">
                <h3 className="m-0 text-[15px] font-bold text-content-strong">
                  Mapa das notas semanais
                </h3>
                <small className="text-xs text-content-faint">quanto mais escuro, maior a nota</small>
              </div>
              <div className="overflow-x-auto">
                {hw.length && ev.length ? (
                  <table className="border-separate text-[11.5px]" style={{ borderSpacing: 2 }}>
                    <thead>
                      <tr>
                        <th />
                        {hw.map((w) => (
                          <th key={w} className="text-center font-semibold text-content-faint text-[11px] px-1.5">
                            {w}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ev.map((x) => (
                        <tr key={x.p.id}>
                          <th className="text-left font-semibold text-content-muted whitespace-nowrap pr-2 text-[11px]">
                            {x.p.apelido || x.p.nome}
                          </th>
                          {hw.map((w) => {
                            const v = pWeek(x.p.id, w)
                            const alpha =
                              v == null
                                ? 0
                                : (Math.max(0, Math.min(1, (v - 7.5) / 2.5)) * 85 + 8) / 100
                            return (
                              <td
                                key={w}
                                className="min-w-[34px] h-[26px] text-center rounded tabular-nums bg-surface-2"
                                style={{
                                  background: v == null ? undefined : `rgba(17,70,101,${alpha})`,
                                  color: v != null && v >= 8.9 ? '#fff' : undefined,
                                }}
                                title={`${x.p.apelido || x.p.nome} · semana ${w} · ${v == null ? 'sem nota' : `nota ${nf(v)}`}`}
                              >
                                {v == null ? '' : nf(v, 1)}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="py-8 text-center text-sm text-content-faint">
                    Sem avaliações neste período.
                  </div>
                )}
              </div>
            </Card>
          </div>
        </>
      )}

      {rel === 'setores' && (
        <div className="space-y-3.5">
          <Card className="p-4" disableHover>
            <div className="flex items-baseline justify-between gap-2 mb-3">
              <h3 className="m-0 text-[15px] font-bold text-content-strong">Rendimento por setor</h3>
              <small className="text-xs text-content-faint">
                semanas-atividade no período, por status
              </small>
            </div>
            <div className="text-[13px]">
              <div className="grid grid-cols-[120px_1fr_86px_50px] gap-2.5 items-center font-semibold text-content-muted pb-1">
                <span />
                <span />
                <b>Concluído</b>
                <b>Total</b>
              </div>
              {rowsSetor.map(({ s, r }) => {
                const p = pct(r.d, r.t)
                return (
                  <div
                    key={s}
                    className="grid grid-cols-[120px_1fr_86px_50px] gap-2.5 items-center py-[5px]"
                    title={`${s} · ${r.d} concluídas · ${r.p} em andamento · ${r.l} atrasadas · ${r.pl} planejadas`}
                  >
                    <span className="truncate">{s}</span>
                    <span style={{ width: `${Math.max(18, (r.t / mxSetor) * 100)}%` }}>
                      <Stack r={r} />
                    </span>
                    <b
                      className="num tabular-nums"
                      style={{ color: p >= 85 ? COR[2] : p >= 60 ? COR[5] : COR[4] }}
                    >
                      {p}%
                    </b>
                    <span className="num tabular-nums text-content-faint text-right">{r.t}</span>
                  </div>
                )
              })}
            </div>
            <div className="mt-3 pt-3 border-t border-border-subtle flex flex-wrap gap-4 text-[11px] text-content-muted">
              {[
                [2, 'Concluída'],
                [3, 'Em andamento'],
                [4, 'Atrasada'],
                [5, 'Pausada'],
                [1, 'Planejada'],
              ].map(([s, l]) => (
                <span key={s} className="flex items-center gap-1.5">
                  <i
                    className="w-2.5 h-2.5 rounded-sm inline-block"
                    style={{ background: COR[s as number] }}
                  />
                  {l}
                </span>
              ))}
              <span className="text-content-faint">O comprimento da barra mostra a carga do setor</span>
            </div>
          </Card>

          <Card className="p-4" disableHover>
            <div className="flex items-baseline justify-between gap-2 mb-3">
              <h3 className="m-0 text-[15px] font-bold text-content-strong">
                % concluído por mês em cada setor
              </h3>
              <small className="text-xs text-content-faint">passe o mouse para ver os números</small>
            </div>
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {rowsSetor.map(({ s }) => {
                const vals = mesesAte.map((i) => {
                  const f = mesFaixas[i]
                  return [i, occStats((a) => setorNome(a) === s, f[0], Math.min(f[1], CUR))] as const
                })
                const td = vals.reduce((n, v) => n + v[1].d, 0)
                const tt2 = vals.reduce((n, v) => n + v[1].t, 0)
                return (
                  <div key={s} className="border border-border-subtle rounded-lg p-3">
                    <div className="flex justify-between items-baseline text-[13px]">
                      <b>{s}</b>
                      <span className="num tabular-nums text-content-muted">{pct(td, tt2)}%</span>
                    </div>
                    <div className="flex gap-0.5 h-[60px] items-end border-b border-border-subtle mt-2">
                      {vals.map(([i, r]) => {
                        const p = pct(r.d, r.t)
                        return (
                          <span
                            key={i}
                            className="flex-1 h-full flex items-end"
                            title={`${s} · ${MESES[i]} · ${r.t ? `${p}% · ${r.d} de ${r.t}` : 'nada planejado'}`}
                          >
                            <i
                              className="block w-full rounded-t"
                              style={{
                                height: `${r.t ? Math.max(3, p) : 0}%`,
                                background: !r.t
                                  ? 'transparent'
                                  : p >= 85
                                    ? COR[2]
                                    : p >= 60
                                      ? COR[5]
                                      : COR[4],
                              }}
                            />
                          </span>
                        )
                      })}
                    </div>
                    <div className="flex gap-0.5 mt-1">
                      {vals.map(([i]) => (
                        <span key={i} className="flex-1 text-center text-[10px] text-content-faint">
                          {MESES_CURTO[i][0]}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>

          <Card className="p-4" disableHover>
            <div className="flex items-baseline justify-between gap-2 mb-3">
              <h3 className="m-0 text-[15px] font-bold text-content-strong">
                Carga de trabalho por setor e mês
              </h3>
              <small className="text-xs text-content-faint">
                número de semanas-atividade planejadas
              </small>
            </div>
            <div className="overflow-x-auto">
              <table className="border-separate text-[11.5px]" style={{ borderSpacing: 2 }}>
                <thead>
                  <tr>
                    <th />
                    {MESES_CURTO.map((m) => (
                      <th key={m} className="text-center font-semibold text-content-faint text-[11px] px-1.5">
                        {m}
                      </th>
                    ))}
                    <th className="text-center font-semibold text-content-faint text-[11px] px-1.5">Ano</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsSetor.map(({ s }) => {
                    const c = MESES_CURTO.map((_, i) => {
                      const f = mesFaixas[i]
                      return f ? occStats((a) => setorNome(a) === s, f[0], f[1]).t : 0
                    })
                    const m2 = Math.max(1, ...c)
                    return (
                      <tr key={s}>
                        <th className="text-left font-semibold text-content-muted whitespace-nowrap pr-2 text-[11px]">
                          {s}
                        </th>
                        {c.map((n, i) => (
                          <td
                            key={i}
                            className="min-w-[34px] h-[26px] text-center rounded tabular-nums bg-surface-2"
                            style={
                              n
                                ? {
                                    background: `rgba(43,121,174,${Math.round((n / m2) * 70 + 10) / 100})`,
                                    color: n / m2 > 0.6 ? '#fff' : undefined,
                                  }
                                : undefined
                            }
                            title={`${s} · ${MESES[i]}: ${n}`}
                          >
                            {n || ''}
                          </td>
                        ))}
                        <td className="num text-center font-bold tabular-nums">
                          <b>{c.reduce((x, y) => x + y, 0)}</b>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {rel === 'atividades' && (
        <div className="space-y-3.5">
          <Card className="p-4" disableHover>
            <div className="flex items-baseline justify-between gap-2 mb-3">
              <h3 className="m-0 text-[15px] font-bold text-content-strong">Atividades por mês</h3>
              <small className="text-xs text-content-faint">
                semanas-atividade no ano · verde = concluídas
              </small>
            </div>
            <div className="grid grid-cols-12 gap-2 items-end h-[190px]">
              {MESES_CURTO.map((m, i) => {
                const entry = mv.find((v) => v[0] === i)
                const r = entry ? entry[1] : { t: 0, d: 0 }
                return (
                  <div
                    key={m}
                    className="flex flex-col items-center justify-end gap-1 h-full"
                    title={`${MESES[i]} · ${r.t} planejadas · ${r.d} concluídas (${pct(r.d, r.t)}%)`}
                  >
                    <small className="num text-[11px] text-content-faint tabular-nums">
                      {r.t || ''}
                    </small>
                    <span
                      className="w-[70%] flex flex-col gap-0.5 rounded-t overflow-hidden"
                      style={{ height: `${(r.t / mm) * 140}px` }}
                    >
                      <i className="block bg-surface-3" style={{ flex: r.t - r.d }} />
                      <i className="block" style={{ flex: r.d, background: COR[2] }} />
                    </span>
                    <em className="not-italic text-[11px] text-content-muted">{m}</em>
                  </div>
                )
              })}
            </div>
            <div className="mt-3 pt-3 border-t border-border-subtle flex gap-4 text-[11px] text-content-muted">
              <span className="flex items-center gap-1.5">
                <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: COR[2] }} />
                Concluídas
              </span>
              <span className="flex items-center gap-1.5">
                <i className="w-2.5 h-2.5 rounded-sm inline-block bg-surface-3" />
                Não concluídas ou futuras
              </span>
            </div>
          </Card>

          <div className="grid lg:grid-cols-2 gap-3.5">
            <Card className="p-4" disableHover>
              <div className="flex items-baseline justify-between gap-2 mb-3">
                <h3 className="m-0 text-[15px] font-bold text-content-strong">
                  Por tipo de atividade
                </h3>
                <small className="text-xs text-content-faint">{relLabel}</small>
              </div>
              {tipos.size ? (
                <Hbars
                  rows={[...tipos.entries()]
                    .sort((x, y) => x[0] - y[0])
                    .map(([k, n]) => ({
                      label: FP_TIPO_LABEL[k as FpTipoAtividade],
                      v: pct(n, tt),
                      sub: `${n} sem.`,
                    }))}
                />
              ) : (
                <div className="py-8 text-center text-sm text-content-faint">Sem dados no período.</div>
              )}
            </Card>

            <Card className="p-4" disableHover>
              <div className="flex items-baseline justify-between gap-2 mb-3">
                <h3 className="m-0 text-[15px] font-bold text-content-strong">
                  Atividades que mais atrasaram
                </h3>
                <small className="text-xs text-content-faint">
                  semanas marcadas como atrasadas
                </small>
              </div>
              {late.length ? (
                <Hbars
                  rows={late.map(([a, n]) => ({
                    label: a.nome,
                    v: n,
                    sub: execLabel(a),
                    color: COR[4],
                    tip: `${a.nome} · ${n} semana(s) atrasada(s) · ${execLabel(a)}`,
                  }))}
                  max={Math.max(...late.map((x) => x[1]))}
                  fmt={(v) => String(v)}
                />
              ) : (
                <div className="py-8 text-center text-sm text-content-faint">
                  Nenhum atraso no período.
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      <Card className="p-4" disableHover>
        <div className="flex items-baseline justify-between gap-2 mb-3">
          <h3 className="m-0 text-[15px] font-bold text-content-strong">Exportar PDF</h3>
          <small className="text-xs text-content-faint">
            para compartilhar no grupo da fazenda (WhatsApp)
          </small>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 max-w-2xl">
          <div className="flex items-end gap-2">
            <div className="flex-1 [&>div]:mb-0">
              <Select
                label="Relatório semanal"
                options={Array.from({ length: 53 }, (_, i) => ({
                  value: String(i + 1),
                  label: `Semana ${i + 1}${i + 1 === CUR ? ' (atual)' : ''}`,
                }))}
                value={String(semanaNum)}
                onChange={setSemanaSel}
              />
            </div>
            <Button onClick={gerarSemanal} disabled={gerando}>
              {gerando ? 'Gerando...' : 'Gerar PDF'}
            </Button>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1 [&>div]:mb-0">
              <Select
                label="Relatório mensal"
                options={MESES.map((m, i) => ({ value: String(i), label: m }))}
                value={mesSel}
                onChange={setMesSel}
              />
            </div>
            <Button onClick={gerarMensal} disabled={gerando}>
              {gerando ? 'Gerando...' : 'Gerar PDF'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
