import { useMemo } from 'react'
import { useAuth, useFazenda } from '@gestaup/shared'
import { Card, PageSkeleton, EmptyState, useToast } from '@gestaup/ui'
import { usePlanoAtivo, useSemanaDados, useFpSetDia } from '../services/farmplanService'
import { DIAS_SEMANA_CURTO, FP_STATUS_LABEL } from '../types/farmplan'
import type { FpStatusSemana } from '../types/farmplan'

const STATUS_COR: Record<FpStatusSemana, string> = {
  1: 'bg-surface-3 text-content',
  2: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  3: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  4: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  5: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
}

export function Hoje() {
  const { user } = useAuth()
  const { data: fazenda } = useFazenda(user?.id)
  const fazendaId = fazenda?.id
  const { data: plano, isLoading: loadingPlano } = usePlanoAtivo(fazendaId)
  const semana = plano?.semanaAtual ?? 1
  const diaHoje = (new Date().getDay() + 6) % 7 // 0=seg .. 6=dom

  const { data, isLoading } = useSemanaDados(fazendaId, plano?.id, semana)
  const setDia = useFpSetDia()
  const toast = useToast()

  const semanasMap = useMemo(
    () => new Map(data?.semanas.map((s) => [s.atividade_id, s]) ?? []),
    [data?.semanas],
  )
  const baixasMap = useMemo(() => {
    const m = new Map<string, boolean>()
    for (const b of data?.baixas ?? []) m.set(`${b.atividade_id}:${b.dia}`, b.feita)
    return m
  }, [data?.baixas])

  const tarefasHoje = useMemo(
    () =>
      (data?.atividades ?? []).filter((a) => {
        const s = semanasMap.get(a.id)
        // prevista hoje: dia marcado na grade e semana ativa (não pausada/concluída)
        return s && a.dias_semana[diaHoje] && s.status !== 5
      }),
    [data?.atividades, semanasMap, diaHoje],
  )

  const extrasHoje = (data?.extras ?? []).filter((e) => e.dia === diaHoje)

  if (loadingPlano) return <PageSkeleton />
  if (!plano) {
    return (
      <EmptyState
        title="Nenhum plano anual ativo"
        description="Crie o plano do ano em Cadastros para começar a planejar atividades."
      />
    )
  }

  const hoje = new Date()
  const toggle = (atividadeId: string) => {
    const atual = baixasMap.get(`${atividadeId}:${diaHoje}`) ?? false
    setDia.mutate(
      { atividadeId, semana, dia: diaHoje, feita: !atual, usuarioId: user?.id },
      { onError: () => toast.error('Erro ao atualizar baixa') },
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-content-strong">
          Hoje · {DIAS_SEMANA_CURTO[diaHoje]} {hoje.toLocaleDateString('pt-BR')}
        </h1>
        <p className="text-content-muted mt-1">Semana {semana} do plano {plano.ano}</p>
      </div>

      {isLoading ? (
        <PageSkeleton />
      ) : tarefasHoje.length === 0 && extrasHoje.length === 0 ? (
        <EmptyState
          title="Nenhuma atividade prevista para hoje"
          description="Atividades marcadas para este dia da semana aparecem aqui."
        />
      ) : (
        <div className="space-y-2">
          {tarefasHoje.map((a) => {
            const s = semanasMap.get(a.id)
            const feita = baixasMap.get(`${a.id}:${diaHoje}`) ?? false
            return (
              <Card key={a.id} className="p-4 flex items-center gap-3" disableHover>
                <button
                  onClick={() => toggle(a.id)}
                  aria-label={feita ? `Desmarcar ${a.nome}` : `Concluir ${a.nome}`}
                  className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    feita
                      ? 'bg-green-600 border-green-600 text-white'
                      : 'border-border-base hover:border-green-500'
                  }`}
                >
                  {feita && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`font-medium text-content-strong truncate ${feita ? 'line-through opacity-60' : ''}`}>
                    {a.nome}
                  </p>
                  {a.local && <p className="text-xs text-content-faint">{a.local}</p>}
                </div>
                {s && (
                  <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${STATUS_COR[s.status]}`}>
                    {FP_STATUS_LABEL[s.status]}
                  </span>
                )}
              </Card>
            )
          })}
          {extrasHoje.map((e) => (
            <Card key={e.id} className="p-4 flex items-center gap-3 border-dashed" disableHover>
              <span className="w-6 h-6 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex items-center justify-center text-xs font-bold flex-shrink-0">
                +
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-content-strong truncate">{e.nome}</p>
                <p className="text-xs text-content-faint">Extra · fora do plano</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
