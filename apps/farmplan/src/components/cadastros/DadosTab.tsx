import { useAuth, useFazenda } from '@gestaup/shared'
import { Card, PageSkeleton } from '@gestaup/ui'
import { useFpContagens, usePlanoAtivo } from '../../services/farmplanService'

export function DadosTab() {
  const { user } = useAuth()
  const { data: fazenda } = useFazenda(user?.id)
  const { data: plano } = usePlanoAtivo(fazenda?.id)
  const { data: contagens, isLoading } = useFpContagens(fazenda?.id)

  if (isLoading) return <PageSkeleton />

  const linhas = [
    ['Atividades', contagens?.atividades ?? 0],
    ['Semanas marcadas', contagens?.semanasMarcadas ?? 0],
    ['Baixas por dia lançadas', contagens?.baixas ?? 0],
    ['Lançamentos fora do plano', contagens?.extras ?? 0],
    ['Colaboradores', contagens?.colaboradores ?? 0],
  ] as const

  return (
    <Card className="p-4 max-w-xl" disableHover>
      <h4 className="m-0 text-sm font-bold text-content-strong">Onde ficam as alterações</h4>
      <p className="mt-2 text-[13.5px] text-content">
        {plano
          ? `Plano ${plano.ano} ativo, semana ${plano.semanaAtual}. `
          : 'Nenhum plano ativo. '}
        As alterações ficam no banco compartilhado: quem abre o Farm Plan vê as baixas do
        aplicativo e as mudanças dos outros na hora, sem recarregar.
      </p>
      <div className="divide-y divide-border-subtle mt-3">
        {linhas.map(([label, v]) => (
          <div key={label} className="flex justify-between items-center py-2 text-sm">
            <span className="text-content-muted">{label}</span>
            <b className="tabular-nums text-content-strong">{v}</b>
          </div>
        ))}
      </div>
    </Card>
  )
}
