import { useAuth, useFazenda } from '@gestaup/shared'
import { Card, PageSkeleton, EmptyState } from '@gestaup/ui'
import { usePlanoAtivo, useSemanaDados } from '../services/farmplanService'
import { FP_STATUS_LABEL, FP_TIPO_LABEL } from '../types/farmplan'

export function Painel() {
  const { user } = useAuth()
  const { data: fazenda } = useFazenda(user?.id)
  const fazendaId = fazenda?.id
  const { data: plano, isLoading: loadingPlano } = usePlanoAtivo(fazendaId)
  const { data: semana, isLoading: loadingSemana } = useSemanaDados(
    fazendaId,
    plano?.id,
    plano?.semanaAtual ?? 1,
  )

  if (loadingPlano || loadingSemana) return <PageSkeleton />

  if (!plano) {
    return (
      <EmptyState
        title="Nenhum plano anual ativo"
        description="Crie o plano do ano em Cadastros para começar a planejar atividades."
      />
    )
  }

  const semanasPorAtividade = new Map(semana?.semanas.map((s) => [s.atividade_id, s]) ?? [])
  const ativasNaSemana = (semana?.atividades ?? []).filter((a) => semanasPorAtividade.has(a.id))

  const contagens = { planejado: 0, concluido: 0, andamento: 0, atrasado: 0, pausado: 0 }
  for (const s of semanasPorAtividade.values()) {
    if (s.status === 1) contagens.planejado++
    else if (s.status === 2) contagens.concluido++
    else if (s.status === 3) contagens.andamento++
    else if (s.status === 4) contagens.atrasado++
    else if (s.status === 5) contagens.pausado++
  }

  const pendencias = ativasNaSemana.filter((a) => {
    const st = semanasPorAtividade.get(a.id)?.status
    return st === 3 || st === 4
  })

  const kpis = [
    { label: 'Planejadas', valor: contagens.planejado, cor: 'text-content-strong' },
    { label: 'Em andamento', valor: contagens.andamento, cor: 'text-blue-600 dark:text-blue-400' },
    { label: 'Concluídas', valor: contagens.concluido, cor: 'text-green-600 dark:text-green-400' },
    { label: 'Atrasadas', valor: contagens.atrasado, cor: 'text-red-600 dark:text-red-400' },
    { label: 'Pausadas', valor: contagens.pausado, cor: 'text-content-muted' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-content-strong">Painel</h1>
        <p className="text-content-muted mt-1">
          {fazenda?.nome} · Plano {plano.ano} · Semana {plano.semanaAtual}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="p-4" disableHover>
            <p className="text-xs font-semibold uppercase tracking-wide text-content-faint">{k.label}</p>
            <p className={`text-3xl font-bold mt-1 ${k.cor}`}>{k.valor}</p>
          </Card>
        ))}
      </div>

      <Card className="p-4" disableHover>
        <h2 className="text-sm font-semibold text-content-strong mb-3">
          Pendências da semana {plano.semanaAtual}
        </h2>
        {pendencias.length === 0 ? (
          <p className="text-sm text-content-muted">Nenhuma pendência. Semana limpa.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {pendencias.map((a) => {
              const s = semanasPorAtividade.get(a.id)
              return (
                <li key={a.id} className="py-2 flex items-center gap-3">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      s?.status === 4 ? 'bg-red-500' : 'bg-blue-500'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="text-sm text-content-strong flex-1">{a.nome}</span>
                  <span className="text-xs text-content-faint">{FP_TIPO_LABEL[a.tipo]}</span>
                  <span className="text-xs text-content-muted">
                    {s ? FP_STATUS_LABEL[s.status] : ''}
                    {s?.carry_from ? ` · veio da sem. ${s.carry_from}` : ''}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
