import { useMemo, useState } from 'react'
import { useAuth, useFazenda } from '@gestaup/shared'
import { Card, PageSkeleton, EmptyState, useToast } from '@gestaup/ui'
import {
  usePlanoAtivo,
  useSemanaDados,
  useFuncionariosFp,
  useEquipesFp,
  useFpSetDia,
  useFpSetStatusSemana,
} from '../services/farmplanService'
import { DIAS_SEMANA_CURTO, FP_STATUS_LABEL, FP_TIPO_LABEL, datasDaSemana } from '../types/farmplan'
import type { FpAtividade, FpStatusSemana } from '../types/farmplan'

const STATUS_COR: Record<FpStatusSemana, string> = {
  1: 'bg-surface-3 text-content',
  2: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  3: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  4: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  5: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
}

export function Semana() {
  const { user } = useAuth()
  const { data: fazenda } = useFazenda(user?.id)
  const fazendaId = fazenda?.id
  const { data: plano, isLoading: loadingPlano } = usePlanoAtivo(fazendaId)
  const [semanaSel, setSemanaSel] = useState<number | null>(null)
  const semana = semanaSel ?? plano?.semanaAtual ?? 1

  const { data, isLoading } = useSemanaDados(fazendaId, plano?.id, semana)
  const { data: funcionarios } = useFuncionariosFp(fazendaId)
  const { data: equipes } = useEquipesFp(fazendaId)
  const setDia = useFpSetDia()
  const setStatus = useFpSetStatusSemana()
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

  const atividadesDaSemana = useMemo(
    () => (data?.atividades ?? []).filter((a) => semanasMap.has(a.id)),
    [data?.atividades, semanasMap],
  )

  const nomePessoa = (id: string | null) => {
    if (!id) return null
    const f = funcionarios?.find((x) => x.id === id)
    return f?.apelido || f?.nome || null
  }
  const executorLabel = (a: FpAtividade) => {
    if (a.executor_funcionario_id) return nomePessoa(a.executor_funcionario_id) ?? '—'
    if (a.executor_equipe_id) {
      const eq = equipes?.find((e) => e.id === a.executor_equipe_id)
      return eq ? `Equipe ${eq.nome}` : 'Equipe'
    }
    return '—'
  }

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

  const toggleDia = (a: FpAtividade, dia: number) => {
    const atual = baixasMap.get(`${a.id}:${dia}`) ?? false
    setDia.mutate(
      { atividadeId: a.id, semana, dia, feita: !atual, usuarioId: user?.id },
      { onError: () => toast.error('Erro ao atualizar baixa') },
    )
  }

  const mudarStatus = (a: FpAtividade, status: number) => {
    setStatus.mutate(
      { atividadeId: a.id, semana, status, usuarioId: user?.id },
      { onError: () => toast.error('Erro ao atualizar status') },
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-content-strong">Semana {semana}</h1>
          <p className="text-content-muted mt-1">
            {datas[0].toLocaleDateString('pt-BR')} a {datas[6].toLocaleDateString('pt-BR')}
            {semana === plano.semanaAtual ? ' · semana atual' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSemanaSel(Math.max(1, semana - 1))}
            disabled={semana <= 1}
            className="px-3 py-1.5 rounded-lg bg-surface-1 border border-border-base text-sm text-content disabled:opacity-40"
          >
            ← Sem. {semana - 1}
          </button>
          <button
            onClick={() => setSemanaSel(Math.min(53, semana + 1))}
            disabled={semana >= 53}
            className="px-3 py-1.5 rounded-lg bg-surface-1 border border-border-base text-sm text-content disabled:opacity-40"
          >
            Sem. {semana + 1} →
          </button>
        </div>
      </div>

      {isLoading ? (
        <PageSkeleton />
      ) : atividadesDaSemana.length === 0 ? (
        <EmptyState
          title={`Nenhuma atividade planejada na semana ${semana}`}
          description="Planeje atividades no Plano anual ou em Cadastros."
        />
      ) : (
        <div className="space-y-2">
          {atividadesDaSemana.map((a) => {
            const s = semanasMap.get(a.id)
            return (
              <Card key={a.id} className="p-4" disableHover>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-semibold text-content-strong truncate">{a.nome}</p>
                    <p className="text-xs text-content-muted mt-0.5">
                      {executorLabel(a)}
                      {a.local ? ` · ${a.local}` : ''} · {FP_TIPO_LABEL[a.tipo]}
                      {s?.carry_from ? ` · atrasada da sem. ${s.carry_from}` : ''}
                    </p>
                  </div>
                  <select
                    value={s?.status ?? 1}
                    onChange={(e) => mudarStatus(a, Number(e.target.value))}
                    className={`text-xs font-medium rounded-full px-2.5 py-1 border-0 cursor-pointer ${STATUS_COR[(s?.status ?? 1) as FpStatusSemana]}`}
                    aria-label={`Status da semana para ${a.nome}`}
                  >
                    {[1, 2, 3, 4, 5].map((v) => (
                      <option key={v} value={v}>
                        {FP_STATUS_LABEL[v as FpStatusSemana]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-1.5 mt-3 flex-wrap">
                  {DIAS_SEMANA_CURTO.map((d, i) => {
                    const planejado = a.dias_semana[i]
                    const feita = baixasMap.get(`${a.id}:${i}`) ?? false
                    return (
                      <button
                        key={d}
                        disabled={!planejado}
                        onClick={() => toggleDia(a, i)}
                        title={`${d} ${datas[i].toLocaleDateString('pt-BR')}`}
                        className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                          !planejado
                            ? 'opacity-30 cursor-not-allowed border-border-subtle text-content-faint'
                            : feita
                              ? 'bg-green-600 text-white border-green-600'
                              : 'bg-surface-1 text-content border-border-base hover:bg-surface-2'
                        }`}
                      >
                        {d} {feita ? '✓' : ''}
                      </button>
                    )
                  })}
                </div>
                {s?.observacao && (
                  <p className="text-xs text-content-muted mt-2 italic">Obs: {s.observacao}</p>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
