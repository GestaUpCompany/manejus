import { useAuth, useFazenda } from '@gestaup/shared'
import { Card, EmptyState, PageSkeleton } from '@gestaup/ui'
import { useCriterios } from '../../services/equipeService'

export function CriteriosTab() {
  const { user } = useAuth()
  const { data: fazenda } = useFazenda(user?.id)
  const { data: criterios, isLoading } = useCriterios(fazenda?.id)

  if (isLoading) return <PageSkeleton />
  if (!criterios?.length) {
    return (
      <EmptyState
        title="Nenhum critério"
        description="Os critérios de comportamento são usados nos contratos de resultados."
      />
    )
  }

  return (
    <Card className="p-0 overflow-hidden" disableHover>
      <div className="flex items-baseline justify-between px-4 py-3 border-b border-border-base">
        <h3 className="m-0 text-[15px] font-bold text-content-strong">
          Critérios de comportamento
        </h3>
        <small className="text-xs text-content-faint">
          {criterios.length} critérios · usados nos contratos
        </small>
      </div>
      <table className="w-full text-sm border-collapse">
        <tbody>
          {criterios.map((c, i) => (
            <tr key={c.id} className="border-b border-border-subtle last:border-0">
              <td className="py-2.5 pl-4 pr-3 w-10 text-center tabular-nums text-content-faint">
                {i + 1}
              </td>
              <td className="py-2.5 pr-4 font-semibold text-content-strong">{c.nome}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
