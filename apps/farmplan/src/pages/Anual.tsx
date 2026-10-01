import { useEffect, useMemo, useRef, useState } from 'react'
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
import { FP_STATUS_LABEL, FP_TIPO_LABEL, datasDaSemana } from '../types/farmplan'
import type { FpAtividade, FpStatusSemana } from '../types/farmplan'

const COR_CELULA: Record<FpStatusSemana, string> = {
  1: 'bg-slate-400 dark:bg-slate-500',
  2: 'bg-green-500',
  3: 'bg-blue-500',
  4: 'bg-red-500',
  5: 'bg-amber-400',
}

const URG_COR: Record<number, string> = {
  1: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  2: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  3: 'bg-surface-3 text-content-muted',
}

const PINCEIS: { valor: number | null; label: string; cor?: string }[] = [
  { valor: null, label: 'Selecionar' },
  { valor: 1, label: 'Planejar', cor: 'bg-slate-400 dark:bg-slate-500' },
  { valor: 3, label: 'Em andamento', cor: 'bg-blue-500' },
  { valor: 2, label: 'Concluir', cor: 'bg-green-500' },
  { valor: 4, label: 'Atrasado', cor: 'bg-red-500' },
  { valor: 5, label: 'Pausar', cor: 'bg-amber-400' },
  { valor: 0, label: 'Apagar', cor: 'bg-surface-1 border border-border-base' },
]

const MES_ABREV = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
] as const

interface PopState {
  atividade: FpAtividade
  semana: number
  x: number
  y: number
}

interface UndoEntry {
  atividadeId: string
  semana: number
  anterior: number
}

export function Anual() {
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
  const setStatus = useFpSetStatusSemana()

  const [pincel, setPincel] = useState<number | null>(null)
  const [pop, setPop] = useState<PopState | null>(null)
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([])
  // Overrides otimistas: pintura aparece na hora, sem esperar o refetch.
  const [overrides, setOverrides] = useState<Map<string, number>>(new Map())
  const [filtros, setFiltros] = useState({
    q: '',
    setor: '',
    coordena: '',
    quemFaz: '',
    tipo: '',
    urgencia: '',
    mostrar: '',
  })
  const paintingRef = useRef(false)

  const semanasMap = useMemo(() => {
    const m = new Map<string, { status: FpStatusSemana; carry_from: number | null }>()
    for (const s of semanas ?? []) m.set(`${s.atividade_id}:${s.semana}`, s)
    return m
  }, [semanas])

  useEffect(() => {
    const up = () => {
      paintingRef.current = false
    }
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [])

  // Limpa overrides quando o servidor reflete o mesmo valor (pós-refetch).
  useEffect(() => {
    setOverrides((prev) => {
      if (prev.size === 0) return prev
      const next = new Map(prev)
      for (const [key, status] of prev) {
        const srv = semanasMap.get(key)?.status ?? 0
        if (srv === status) next.delete(key)
      }
      return next.size === prev.size ? prev : next
    })
  }, [semanasMap])

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPop(null)
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [])

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

  const lista = useMemo(() => {
    if (!atividades || !plano) return []
    const q = filtros.q.trim().toLowerCase()
    return atividades
      .filter((a) => {
        if (q && !`${a.nome} ${quemFaz(a)} ${coordena(a)} ${a.local ?? ''}`.toLowerCase().includes(q))
          return false
        if (filtros.setor && a.setor_id !== filtros.setor) return false
        if (filtros.coordena && a.coordenador_id !== filtros.coordena) return false
        if (filtros.quemFaz && quemFaz(a) !== filtros.quemFaz) return false
        if (filtros.tipo && a.tipo !== Number(filtros.tipo)) return false
        if (filtros.urgencia && a.urgencia !== Number(filtros.urgencia)) return false
        if (filtros.mostrar === 'sem' && !semanasMap.has(`${a.id}:${plano.semanaAtual}`))
          return false
        if (filtros.mostrar === 'atr' && !(semanas ?? []).some((s) => s.atividade_id === a.id && s.status === 4))
          return false
        if (filtros.mostrar === 'vaz' && (semanas ?? []).some((s) => s.atividade_id === a.id))
          return false
        return true
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atividades, plano, filtros, semanasMap, semanas, funcionarios, equipes, setores])

  const derivados = useMemo(() => {
    if (!plano) return null
    const carga = new Array<number>(54).fill(0)
    for (const a of lista)
      for (let w = 1; w <= 53; w++) if (semanasMap.has(`${a.id}:${w}`)) carga[w]++
    const cargaMax = Math.max(1, ...carga.slice(1))

    const meses = new Array<string>(54).fill('')
    let mesAnterior = -1
    for (let w = 1; w <= 53; w++) {
      const m = datasDaSemana(plano.semana1_inicio, w)[0].getMonth()
      if (m !== mesAnterior) {
        meses[w] = MES_ABREV[m]
        mesAnterior = m
      }
    }
    return { carga, cargaMax, meses }
  }, [plano, lista, semanasMap])

  if (loadingPlano || loadingAtividades) return <PageSkeleton />
  if (!plano) {
    return (
      <EmptyState
        title="Nenhum plano anual ativo"
        description="Crie o plano do ano em Cadastros > Plano anual."
      />
    )
  }
  if (!derivados) return <PageSkeleton />
  const { carga, cargaMax, meses } = derivados
  const cur = plano.semanaAtual

  const statusDe = (atividadeId: string, semana: number) =>
    overrides.get(`${atividadeId}:${semana}`) ??
    semanasMap.get(`${atividadeId}:${semana}`)?.status ??
    0

  // Fila serializa as RPCs: cada mudança só vai ao servidor depois da
  // anterior terminar, então undo/redo e drag ficam determinísticos.
  const filaRef = useRef<Promise<void>>(Promise.resolve())
  const enfileirar = (atividadeId: string, semana: number, status: number, key: string) => {
    filaRef.current = filaRef.current.then(async () => {
      try {
        await setStatus.mutateAsync({
          atividadeId,
          semana,
          status,
          usuarioId: user?.id,
        })
      } catch {
        setOverrides((prev) => {
          const next = new Map(prev)
          next.delete(key)
          return next
        })
        toast.error('Erro ao atualizar semana')
      }
    })
  }

  const aplicarStatus = (atividadeId: string, semana: number, status: number) => {
    const key = `${atividadeId}:${semana}`
    const atual = statusDe(atividadeId, semana)
    if (atual === status) return
    setUndoStack((st) => [...st, { atividadeId, semana, anterior: atual }])
    setOverrides((prev) => new Map(prev).set(key, status))
    enfileirar(atividadeId, semana, status, key)
  }

  const pintar = (atividadeId: string, semana: number) => {
    if (pincel == null) return
    aplicarStatus(atividadeId, semana, pincel)
  }

  const desfazer = () => {
    const ult = undoStack[undoStack.length - 1]
    if (!ult) return
    setUndoStack((st) => st.slice(0, -1))
    const key = `${ult.atividadeId}:${ult.semana}`
    setOverrides((prev) => new Map(prev).set(key, ult.anterior))
    enfileirar(ult.atividadeId, ult.semana, ult.anterior, key)
    toast.success('Alteração desfeita')
  }

  const clicarCelula = (a: FpAtividade, semana: number, e: React.MouseEvent) => {
    if (pincel != null) {
      paintingRef.current = true
      pintar(a.id, semana)
      return
    }
    setPop({ atividade: a, semana, x: e.clientX, y: e.clientY })
  }

  const selectCls =
    'border border-border-base bg-surface-1 rounded-lg px-2 py-1.5 text-[13px] text-content-strong'

  return (
    <div className="space-y-4">
      {/* phead */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[13px] text-content-muted">
            {(atividades ?? []).length} atividades · {(semanas ?? []).length} semanas
            marcadas · estamos na semana {cur}
          </p>
          <h1 className="text-3xl font-extrabold text-content-strong mt-0.5 tracking-tight">
            Plano anual {plano.ano}
          </h1>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Button
            variant="secondary"
            size="sm"
            disabled={undoStack.length === 0}
            onClick={desfazer}
          >
            Desfazer
          </Button>
          <Button size="sm" onClick={() => navigate('/cadastros?aba=atividades&nova=1')}>
            + Nova atividade
          </Button>
        </div>
      </div>

      {/* filtros */}
      <div className="flex gap-2 flex-wrap items-center">
        <input
          value={filtros.q}
          onChange={(e) => setFiltros((f) => ({ ...f, q: e.target.value }))}
          placeholder="Buscar atividade, pessoa ou local"
          aria-label="Buscar"
          className="border border-border-base bg-surface-1 rounded-lg px-3 py-1.5 text-[13px] text-content-strong min-w-[190px]"
        />
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
          value={filtros.coordena}
          onChange={(e) => setFiltros((f) => ({ ...f, coordena: e.target.value }))}
          className={selectCls}
          aria-label="Coordena"
        >
          <option value="">Coordena</option>
          {[...new Set((atividades ?? []).map((a) => a.coordenador_id).filter(Boolean))].map(
            (id) => (
              <option key={id as string} value={id as string}>
                {nomePessoa(id as string) ?? '—'}
              </option>
            ),
          )}
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
          value={filtros.tipo}
          onChange={(e) => setFiltros((f) => ({ ...f, tipo: e.target.value }))}
          className={selectCls}
          aria-label="Tipo"
        >
          <option value="">Tipo</option>
          {Object.entries(FP_TIPO_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select
          value={filtros.urgencia}
          onChange={(e) => setFiltros((f) => ({ ...f, urgencia: e.target.value }))}
          className={selectCls}
          aria-label="Urgência"
        >
          <option value="">Urgência</option>
          <option value="1">1 · Alta</option>
          <option value="2">2 · Média</option>
          <option value="3">3 · Baixa</option>
        </select>
        <select
          value={filtros.mostrar}
          onChange={(e) => setFiltros((f) => ({ ...f, mostrar: e.target.value }))}
          className={selectCls}
          aria-label="Mostrar"
        >
          <option value="">Todas</option>
          <option value="sem">Com atividade na semana {cur}</option>
          <option value="atr">Com algum atraso</option>
          <option value="vaz">Sem semana marcada</option>
        </select>
      </div>

      {loadingSemanas ? (
        <PageSkeleton />
      ) : !atividades?.length ? (
        <EmptyState
          title="Nenhuma atividade no plano"
          description="Cadastre atividades em Cadastros > Atividades."
        />
      ) : (
        <Card className="p-0 overflow-hidden" disableHover>
          {/* toolbar pincel */}
          <div className="flex gap-2.5 flex-wrap items-center justify-between px-3.5 py-3 border-b border-border-base">
            <div className="inline-flex gap-1 items-center flex-wrap" role="toolbar" aria-label="Ferramenta">
              {PINCEIS.map((p) => (
                <button
                  key={String(p.valor)}
                  onClick={() => setPincel(p.valor)}
                  aria-pressed={pincel === p.valor}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[12.5px] font-semibold border transition-colors ${
                    pincel === p.valor
                      ? 'border-content-strong text-content-strong ring-1 ring-inset ring-content-strong'
                      : 'border-border-base text-content-muted hover:border-content-muted'
                  }`}
                >
                  {p.cor && (
                    <i className={`w-2.5 h-2.5 rounded-[3px] inline-block ${p.cor}`} aria-hidden="true" />
                  )}
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-content-muted">
              {pincel != null ? (
                <>
                  <b className="text-content-strong">Pincel ativo:</b> clique ou arraste
                  sobre as semanas
                </>
              ) : (
                'Clique numa semana para mudar o status · clique no nome para editar'
              )}
            </p>
          </div>

          {/* grade */}
          <div className="overflow-auto max-h-[calc(100vh-250px)] min-h-[360px] select-none">
            <div
              className="grid text-[13px] w-max min-w-full"
              style={{ gridTemplateColumns: '240px 34px repeat(53,28px) 48px' }}
            >
              {/* header */}
              <div className="sticky top-0 left-0 z-30 bg-surface-1 border-b border-r border-border-base h-16 flex flex-col items-start justify-end pb-2 px-4">
                <span className="text-[10.5px] uppercase tracking-wide text-content-muted font-semibold">
                  O que fazer no ano?
                </span>
                <span className="text-[10.5px] text-content-faint font-medium">
                  coordena → quem faz · setor
                </span>
              </div>
              <div className="sticky top-0 z-20 bg-surface-1 border-b border-border-base h-16 flex items-end justify-center pb-2 text-[10.5px] uppercase tracking-wide text-content-muted font-semibold">
                Urg.
              </div>
              {Array.from({ length: 53 }, (_, i) => {
                const w = i + 1
                const primeiroMes = meses[w] !== ''
                return (
                  <button
                    key={w}
                    onClick={() => navigate(`/semana`)}
                    title={`Semana ${w} · ${carga[w]} atividades`}
                    className={`sticky top-0 z-20 bg-surface-1 border-b border-border-base h-16 flex flex-col items-center justify-end pb-1 gap-0.5 relative hover:[&_.wnum]:text-blue-500 ${
                      primeiroMes ? 'border-l border-border-base' : ''
                    } ${w === cur ? 'bg-primary/10' : ''}`}
                  >
                    {primeiroMes && (
                      <span className="absolute top-1 left-0.5 text-[10.5px] font-bold text-content">
                        {meses[w]}
                      </span>
                    )}
                    <span className="w-5 bg-blue-100 dark:bg-blue-900/40 rounded-t-sm flex items-end">
                      <i
                        className="block w-full bg-blue-500 rounded-t-sm"
                        style={{ height: `${Math.max(2, (carga[w] / cargaMax) * 24)}px` }}
                      />
                    </span>
                    <span
                      className={`wnum text-[11px] tabular-nums ${
                        w === cur
                          ? 'bg-primary text-white rounded px-0.5 font-bold'
                          : 'text-content-muted'
                      }`}
                    >
                      {w}
                    </span>
                  </button>
                )
              })}
              <div className="sticky top-0 z-20 bg-surface-1 border-b border-border-base h-16 flex items-end justify-end pb-2 pr-3.5 text-[10.5px] uppercase tracking-wide text-content-muted font-semibold">
                Sem.
              </div>

              {/* linhas */}
              {lista.map((a) => {
                let total = 0
                for (let w = 1; w <= 53; w++) if (statusDe(a.id, w) !== 0) total++
                return (
                  <div key={a.id} className="contents group">
                    <button
                      onClick={() => navigate('/cadastros?aba=atividades')}
                      title={`${a.nome} · clique para editar`}
                      className="sticky left-0 z-10 bg-surface-1 group-hover:bg-surface-2 border-b border-r border-border-subtle h-[42px] flex flex-col items-start justify-center px-4 min-w-0 text-left"
                    >
                      <span className="font-semibold text-content-strong truncate max-w-full group-hover:text-blue-500 group-hover:underline">
                        {a.nome}
                      </span>
                      <span className="text-[11.5px] text-content-muted truncate max-w-full">
                        {coordena(a)} → {quemFaz(a)} · {setorNome(a)}
                      </span>
                    </button>
                    <div className="border-b border-border-subtle h-[42px] flex items-center justify-center">
                      <span
                        className={`w-[22px] h-[22px] rounded-md grid place-items-center font-bold text-xs ${URG_COR[a.urgencia] ?? URG_COR[3]}`}
                      >
                        {a.urgencia}
                      </span>
                    </div>
                    {Array.from({ length: 53 }, (_, i) => {
                      const w = i + 1
                      const st = statusDe(a.id, w)
                      const carry = semanasMap.get(`${a.id}:${w}`)?.carry_from
                      return (
                        <div
                          key={w}
                          role="button"
                          tabIndex={-1}
                          onPointerDown={(e) => clicarCelula(a, w, e)}
                          onPointerEnter={(e) => {
                            if (paintingRef.current && e.buttons === 1) pintar(a.id, w)
                          }}
                          title={`Sem. ${w}: ${st ? FP_STATUS_LABEL[st as FpStatusSemana] : '—'}${carry ? ` · veio da sem. ${carry}` : ''}`}
                          className={`border-b border-border-subtle h-[42px] flex items-center justify-center ${
                            meses[w] !== '' ? 'border-l border-border-subtle' : ''
                          } ${w === cur ? 'bg-primary/10' : ''} ${pincel != null ? 'cursor-crosshair' : 'cursor-pointer'}`}
                        >
                          <b
                            className={`block w-5 h-6 rounded-[3px] transition-colors duration-75 ${
                              st ? COR_CELULA[st as FpStatusSemana] : 'bg-surface-2'
                            } ${pincel != null ? 'hover:outline hover:outline-2 hover:outline-content-muted' : ''}`}
                          />
                        </div>
                      )
                    })}
                    <div className="border-b border-border-subtle h-[42px] flex items-center justify-end pr-3.5 tabular-nums text-content">
                      {total}
                    </div>
                  </div>
                )
              })}
            </div>
            {lista.length === 0 && (
              <p className="py-7 text-center text-sm text-content-muted">
                Nenhuma atividade com esses filtros.
              </p>
            )}
          </div>

          {/* rodapé */}
          <div className="flex justify-between items-center gap-2.5 px-4 py-2.5 border-t border-border-subtle text-xs text-content-muted flex-wrap">
            <span>
              Mostrando {lista.length} de {(atividades ?? []).length} atividades
            </span>
            <span className="flex gap-3 flex-wrap items-center">
              {[1, 3, 2, 4, 5].map((s) => (
                <span key={s} className="inline-flex items-center">
                  <i className={`w-[11px] h-[11px] rounded-[3px] mr-1.5 inline-block ${COR_CELULA[s as FpStatusSemana]}`} />
                  {FP_STATUS_LABEL[s as FpStatusSemana]}
                </span>
              ))}
              <span>Barras no topo = carga da semana (clique para abrir a semana)</span>
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
              const atual = statusDe(pop.atividade.id, pop.semana)
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
                  <i className={`w-[11px] h-[11px] rounded-[3px] ${COR_CELULA[v as FpStatusSemana]}`} />
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
