import { useMemo, useState } from 'react'
import { useAuth, useFazenda } from '@gestaup/shared'
import { Card, PageSkeleton, EmptyState } from '@gestaup/ui'
import { usePlanoAtivo, usePlanoSemanas } from '../services/farmplanService'
import { useAtividades } from '../services/cadastrosService'
import { FP_STATUS_LABEL, datasDaSemana } from '../types/farmplan'
import type { FpStatusSemana } from '../types/farmplan'

const STATUS_COR: Record<FpStatusSemana, string> = {
  1: 'bg-surface-3 text-content',
  2: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  3: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  4: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  5: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

export function Mes() {
  const { user } = useAuth()
  const { data: fazenda } = useFazenda(user?.id)
  const fazendaId = fazenda?.id
  const { data: plano, isLoading: loadingPlano } = usePlanoAtivo(fazendaId)
  const { data: atividades, isLoading: loadingAtividades } = useAtividades(plano?.id)
  const atividadeIds = useMemo(() => atividades?.map((a) => a.id), [atividades])
  const { data: semanas, isLoading: loadingSemanas } = usePlanoSemanas(
    fazendaId,
    plano?.id,
    atividadeIds,
  )

  const hoje = new Date()
  const [mesSel, setMesSel] = useState(hoje.getMonth()) // 0-11
  const [anoSel] = useState(hoje.getFullYear())

  // Semanas do plano cuja segunda-feira cai dentro do mês selecionado
  const semanasDoMes = useMemo(() => {
    if (!plano) return []
    const lista: number[] = []
    for (let s = 1; s <= 53; s++) {
      const seg = datasDaSemana(plano.semana1_inicio, s)[0]
      if (seg.getMonth() === mesSel && seg.getFullYear() === anoSel) lista.push(s)
    }
    return lista
  }, [plano, mesSel, anoSel])

  const semanasMap = useMemo(() => {
    const m = new Map<string, { status: FpStatusSemana; carry_from: number | null }>()
    for (const s of semanas ?? []) m.set(`${s.atividade_id}:${s.semana}`, s)
    return m
  }, [semanas])

  if (loadingPlano || loadingAtividades) return <PageSkeleton />
  if (!plano) {
    return (
      <EmptyState
        title="Nenhum plano anual ativo"
        description="Crie o plano do ano em Cadastros > Plano anual."
      />
    )
  }

  const resumoMes = (status: FpStatusSemana) =>
    semanasDoMes.reduce(
      (acc, sem) =>
        acc + (atividades ?? []).filter((a) => semanasMap.get(`${a.id}:${sem}`)?.status === status).length,
      0,
    )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-content-strong">
            {MESES[mesSel]} {anoSel}
          </h1>
          <p className="text-content-muted mt-1">
            Semanas {semanasDoMes.join(', ')} do plano {plano.ano}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMesSel((m) => (m + 11) % 12)}
            className="px-3 py-1.5 rounded-lg bg-surface-1 border border-border-base text-sm text-content"
          >
            ← {MESES[(mesSel + 11) % 12]}
          </button>
          <button
            onClick={() => setMesSel((m) => (m + 1) % 12)}
            className="px-3 py-1.5 rounded-lg bg-surface-1 border border-border-base text-sm text-content"
          >
            {MESES[(mesSel + 1) % 12]} →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
        {([1, 3, 2, 4, 5] as FpStatusSemana[]).map((st) => (
          <Card key={st} className="p-3" disableHover>
            <p className="text-xs text-content-faint uppercase">{FP_STATUS_LABEL[st]}</p>
            <p className="text-xl font-bold text-content-strong">{resumoMes(st)}</p>
          </Card>
        ))}
      </div>

      {loadingSemanas ? (
        <PageSkeleton />
      ) : (
        semanasDoMes.map((sem) => {
          const datas = datasDaSemana(plano.semana1_inicio, sem)
          const ativsSemana = (atividades ?? []).filter((a) =>
            semanasMap.has(`${a.id}:${sem}`),
          )
          return (
            <Card key={sem} className="p-4" disableHover>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-semibold text-content-strong">
                  Semana {sem}
                  {sem === plano.semanaAtual && (
                    <span className="ml-2 text-xs text-primary font-medium">atual</span>
                  )}
                </h2>
                <p className="text-xs text-content-faint">
                  {datas[0].toLocaleDateString('pt-BR')} – {datas[6].toLocaleDateString('pt-BR')}
                </p>
              </div>
              {ativsSemana.length === 0 ? (
                <p className="text-sm text-content-faint">Sem atividades planejadas.</p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {ativsSemana.map((a) => {
                    const s = semanasMap.get(`${a.id}:${sem}`)
                    return (
                      <li key={a.id} className="py-2 flex items-center gap-3">
                        <span className="text-sm text-content-strong flex-1 truncate">{a.nome}</span>
                        {s?.carry_from && (
                          <span className="text-xs text-content-faint">veio da sem. {s.carry_from}</span>
                        )}
                        {s && (
                          <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${STATUS_COR[s.status]}`}>
                            {FP_STATUS_LABEL[s.status]}
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>
          )
        })
      )}
    </div>
  )
}
