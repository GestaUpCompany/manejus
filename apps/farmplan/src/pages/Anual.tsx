import { useMemo, useState } from 'react'
import { useAuth, useFazenda } from '@gestaup/shared'
import { Card, PageSkeleton, EmptyState, useToast } from '@gestaup/ui'
import {
  usePlanoAtivo,
  usePlanoSemanas,
  useFpSetStatusSemana,
} from '../services/farmplanService'
import { useAtividades } from '../services/cadastrosService'
import { FP_STATUS_LABEL, datasDaSemana } from '../types/farmplan'
import type { FpStatusSemana } from '../types/farmplan'

const COR_CELULA: Record<FpStatusSemana, string> = {
  1: 'bg-surface-3 hover:bg-surface-3/70',
  2: 'bg-green-500 hover:bg-green-600',
  3: 'bg-blue-500 hover:bg-blue-600',
  4: 'bg-red-500 hover:bg-red-600',
  5: 'bg-amber-400 hover:bg-amber-500',
}

const PINCEIS: { valor: number; label: string; cor: string }[] = [
  { valor: 1, label: 'Planejado', cor: 'bg-surface-3' },
  { valor: 2, label: 'Concluído', cor: 'bg-green-500' },
  { valor: 3, label: 'Em andamento', cor: 'bg-blue-500' },
  { valor: 4, label: 'Atrasado', cor: 'bg-red-500' },
  { valor: 5, label: 'Pausado', cor: 'bg-amber-400' },
  { valor: 0, label: 'Limpar', cor: 'bg-white border border-border-base' },
]

export function Anual() {
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
  const setStatus = useFpSetStatusSemana()
  const toast = useToast()

  const [pincel, setPincel] = useState(1)

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

  const pintar = (atividadeId: string, semana: number) => {
    setStatus.mutate(
      { atividadeId, semana, status: pincel },
      { onError: () => toast.error('Erro ao atualizar semana') },
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-content-strong">Plano anual {plano.ano}</h1>
          <p className="text-content-muted mt-1">
            Semana atual: {plano.semanaAtual}. Selecione um status e clique nas células para pintar.
          </p>
        </div>
        <div className="flex gap-1.5 flex-wrap" role="toolbar" aria-label="Pincel de status">
          {PINCEIS.map((p) => (
            <button
              key={p.valor}
              onClick={() => setPincel(p.valor)}
              aria-pressed={pincel === p.valor}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                pincel === p.valor
                  ? 'border-primary ring-2 ring-primary/30 text-content-strong'
                  : 'border-border-base text-content-muted hover:border-primary/50'
              }`}
            >
              <span className={`w-3 h-3 rounded-sm ${p.cor}`} aria-hidden="true" />
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loadingSemanas ? (
        <PageSkeleton />
      ) : !atividades?.length ? (
        <EmptyState
          title="Nenhuma atividade no plano"
          description="Cadastre atividades em Cadastros > Atividades."
        />
      ) : (
        <Card className="p-0 overflow-x-auto" disableHover>
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-surface-1 text-left px-3 py-2 font-semibold text-content-strong min-w-[200px] border-b border-r border-border-base">
                  Atividade
                </th>
                {Array.from({ length: 53 }, (_, i) => {
                  const sem = i + 1
                  const atual = sem === plano.semanaAtual
                  const data = datasDaSemana(plano.semana1_inicio, sem)[0]
                  return (
                    <th
                      key={sem}
                      title={`Semana ${sem} · ${data.toLocaleDateString('pt-BR')}`}
                      className={`px-0 py-1 font-normal border-b border-border-base w-6 min-w-6 text-[10px] ${
                        atual ? 'bg-primary/15 text-primary font-bold' : 'text-content-faint'
                      }`}
                    >
                      {sem}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {atividades.map((a) => (
                <tr key={a.id} className="group">
                  <td className="sticky left-0 z-10 bg-surface-1 group-hover:bg-surface-2 px-3 py-1 border-r border-border-base">
                    <p className="font-medium text-content-strong truncate max-w-[240px]">{a.nome}</p>
                  </td>
                  {Array.from({ length: 53 }, (_, i) => {
                    const sem = i + 1
                    const s = semanasMap.get(`${a.id}:${sem}`)
                    const atual = sem === plano.semanaAtual
                    return (
                      <td key={sem} className={`p-0 border-b border-border-subtle ${atual ? 'bg-primary/5' : ''}`}>
                        <button
                          onClick={() => pintar(a.id, sem)}
                          title={`Semana ${sem} · ${s ? FP_STATUS_LABEL[s.status] : 'vazio'}${s?.carry_from ? ` · veio da sem. ${s.carry_from}` : ''}`}
                          aria-label={`${a.nome} semana ${sem}`}
                          className={`w-6 h-7 block transition-colors ${
                            s ? COR_CELULA[s.status] : 'hover:bg-surface-2'
                          }`}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
