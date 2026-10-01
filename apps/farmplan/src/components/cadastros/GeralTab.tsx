import { useMemo } from 'react'
import { useAuth, useFazenda } from '@gestaup/shared'
import { Card } from '@gestaup/ui'
import { usePlanoAtivo } from '../../services/farmplanService'
import { useAtividades, useSetores } from '../../services/cadastrosService'
import { PlanoTab } from './PlanoTab'
import { SetoresTab } from './SetoresTab'
import { FP_TIPO_LABEL, FP_STATUS_LABEL } from '../../types/farmplan'

const STATUS_COR: Record<number, string> = {
  1: 'bg-surface-3/70 text-content-muted',
  2: 'bg-green-100 text-green-800',
  3: 'bg-blue-100 text-blue-800',
  4: 'bg-red-100 text-red-700',
  5: 'bg-amber-100 text-amber-800',
}

export function GeralTab() {
  const { user } = useAuth()
  const { data: fazenda } = useFazenda(user?.id)
  const { data: plano } = usePlanoAtivo(fazenda?.id)
  const { data: atividades } = useAtividades(plano?.id)
  const { data: setores } = useSetores(fazenda?.id)

  const inicio = plano ? new Date(`${plano.semana1_inicio}T12:00:00`) : null
  const fim = inicio
    ? new Date(inicio.getTime() + 52 * 7 * 24 * 60 * 60 * 1000 + 6 * 24 * 60 * 60 * 1000)
    : null
  const fmt = (d: Date | null) => (d ? d.toLocaleDateString('pt-BR') : '—')

  const setoresSemCadastro = useMemo(() => {
    const cadastrados = new Set((setores ?? []).map((s) => s.id))
    const usados = [...new Set((atividades ?? []).map((a) => a.setor_id).filter(Boolean))]
    return usados.filter((id) => !cadastrados.has(id as string)).length
  }, [setores, atividades])

  return (
    <div className="space-y-4">
      <Card className="p-4" disableHover>
        <h4 className="m-0 text-sm font-bold text-content-strong">Fazenda e período do plano</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          {[
            ['Nome da fazenda', fazenda?.nome ?? '—'],
            ['Ano do plano', plano ? String(plano.ano) : '—'],
            ['Início', fmt(inicio)],
            ['Fim', fmt(fim)],
          ].map(([label, v]) => (
            <div key={label}>
              <p className="text-[11px] font-semibold text-content-faint uppercase tracking-wide">
                {label}
              </p>
              <p className="text-sm text-content-strong mt-0.5">{v}</p>
            </div>
          ))}
        </div>
      </Card>

      <PlanoTab />

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <Card className="p-4" disableHover>
          <div className="flex items-baseline justify-between mb-2">
            <h3 className="m-0 text-[15px] font-bold text-content-strong">Setores da fazenda</h3>
            <small className="text-xs text-content-faint">{setores?.length ?? 0} setores</small>
          </div>
          <SetoresTab />
        </Card>

        <Card className="p-4" disableHover>
          <h4 className="m-0 text-sm font-bold text-content-strong">Tipos de atividade e status</h4>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {Object.values(FP_TIPO_LABEL).map((t) => (
              <span
                key={t}
                className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#DCE8EE] text-[#114665]"
              >
                {t}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {[1, 2, 3, 4, 5].map((s) => (
              <span
                key={s}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COR[s]}`}
              >
                {FP_STATUS_LABEL[s as 1 | 2 | 3 | 4 | 5]}
              </span>
            ))}
          </div>
          <p className="mt-3 mb-0 text-[12.5px] text-content-muted">
            Setores usados nas atividades sem cadastro próprio:{' '}
            {setoresSemCadastro || 'nenhum'}.
          </p>
        </Card>
      </div>
    </div>
  )
}
