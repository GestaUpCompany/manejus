import { useMemo, useState } from 'react'
import { useAuth, useFazenda } from '@gestaup/shared'
import { Card, PageSkeleton, EmptyState, useToast } from '@gestaup/ui'
import { usePlanoAtivo, usePlanoSemanas } from '../services/farmplanService'
import { useAtividades } from '../services/cadastrosService'
import { useAvaliacoesAno } from '../services/equipeService'
import {
  useIndicadores,
  useIndicadorValores,
  useSaveIndicadorValor,
} from '../services/indicadoresService'
import { semanasIntersectamMes } from '../types/farmplan'
import type { FpIndicador } from '../types/farmplan'

const MESES_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

type Farol = 'verde' | 'amarelo' | 'vermelho' | 'cinza'

function farol(ind: FpIndicador, valor: number | null): Farol {
  if (valor === null) return 'cinza'
  const meta = ind.meta_valor
  const atencao = ind.atencao_valor
  if (meta === null || atencao === null) return 'cinza'
  if (ind.direcao === 'up') {
    if (valor >= meta) return 'verde'
    if (valor >= atencao) return 'amarelo'
    return 'vermelho'
  }
  if (valor <= meta) return 'verde'
  if (valor <= atencao) return 'amarelo'
  return 'vermelho'
}

const COR_FAROL: Record<Farol, string> = {
  verde: 'bg-green-500',
  amarelo: 'bg-amber-400',
  vermelho: 'bg-red-500',
  cinza: 'bg-surface-3',
}

function CelulaValor({
  ind,
  valor,
  onSave,
  editavel,
}: {
  ind: FpIndicador
  valor: number | null
  onSave: (v: number | null) => void
  editavel: boolean
}) {
  const [txt, setTxt] = useState(valor !== null ? valor.toFixed(ind.casas_decimais) : '')
  const cor = COR_FAROL[farol(ind, valor)]

  const commit = () => {
    if (txt.trim() === '') {
      if (valor !== null) onSave(null)
      return
    }
    const v = Number(txt.replace(',', '.'))
    if (Number.isNaN(v)) return
    if (valor !== null && v === valor) return
    onSave(v)
  }

  return (
    <div className="flex items-center gap-1 justify-center">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cor}`} aria-hidden="true" />
      {editavel ? (
        <input
          value={txt}
          onChange={(e) => setTxt(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          className="w-14 px-1 py-0.5 text-xs text-center border rounded bg-surface-1 text-content-strong border-border-base"
        />
      ) : (
        <span className="text-xs text-content-strong min-w-14 text-center">
          {valor !== null ? valor.toFixed(ind.casas_decimais) : '—'}
        </span>
      )}
    </div>
  )
}

export function Indicadores() {
  const { user } = useAuth()
  const { data: fazenda } = useFazenda(user?.id)
  const fazendaId = fazenda?.id
  const { data: plano, isLoading: loadingPlano } = usePlanoAtivo(fazendaId)
  const ano = plano?.ano

  const { data: indicadores, isLoading: loadingInd } = useIndicadores(fazendaId)
  const { data: valores } = useIndicadorValores(fazendaId, ano)
  const { data: atividades } = useAtividades(plano?.id)
  const atividadeIds = useMemo(() => atividades?.map((a) => a.id), [atividades])
  const { data: semanas } = usePlanoSemanas(fazendaId, plano?.id, atividadeIds)
  const { data: avaliacoes } = useAvaliacoesAno(fazendaId, ano)
  const saveValor = useSaveIndicadorValor()
  const toast = useToast()

  const valoresMap = useMemo(
    () => new Map((valores ?? []).map((v) => [`${v.indicador_id}:${v.mes}`, v.valor])),
    [valores],
  )

  // Pré-computa os valores automáticos por mês (0-11)
  const autoPorMes = useMemo(() => {
    if (!plano) return { escore: new Map<number, number>(), atividades: new Map<number, number>() }
    const escore = new Map<number, number>()
    const ativ = new Map<number, number>()
    for (let mes = 0; mes < 12; mes++) {
      const semanasDoMes = new Set(semanasIntersectamMes(plano.semana1_inicio, plano.ano, mes))

      const notasMes = (avaliacoes ?? []).filter(
        (a) => !a.nsa && a.nota !== null && semanasDoMes.has(a.semana),
      )
      if (notasMes.length) {
        escore.set(mes, notasMes.reduce((s, a) => s + Number(a.nota), 0) / notasMes.length)
      }

      const semMes = (semanas ?? []).filter((s) => semanasDoMes.has(s.semana))
      if (semMes.length) {
        const concluidas = semMes.filter((s) => s.status === 2).length
        ativ.set(mes, (concluidas / semMes.length) * 100)
      }
    }
    return { escore, atividades: ativ }
  }, [plano, avaliacoes, semanas])

  if (loadingPlano || loadingInd) return <PageSkeleton />
  if (!plano) {
    return (
      <EmptyState
        title="Nenhum plano anual ativo"
        description="Crie o plano do ano em Cadastros > Plano anual."
      />
    )
  }

  const valorDo = (ind: FpIndicador, mesIdx: number): number | null => {
    if (ind.origem === 'escore') return autoPorMes.escore.get(mesIdx) ?? null
    if (ind.origem === 'atividades') return autoPorMes.atividades.get(mesIdx) ?? null
    return valoresMap.get(`${ind.id}:${mesIdx + 1}`) ?? null
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-content-strong">Painel de bordo {ano}</h1>
        <p className="text-content-muted mt-1">
          Indicadores mensais de gente e execução. Células editáveis são lançamento manual; as demais
          são calculadas pelo sistema.
        </p>
      </div>

      {!indicadores?.length ? (
        <EmptyState title="Nenhum indicador" description="Os indicadores padrão são criados com a fazenda." />
      ) : (
        <Card className="p-0 overflow-x-auto" disableHover>
          <table className="border-collapse text-xs w-full">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-surface-1 text-left px-3 py-2 font-semibold text-content-strong min-w-[220px] border-b border-r border-border-base">
                  Indicador
                </th>
                <th className="px-2 py-2 text-left border-b border-border-base text-content-faint font-normal">
                  Meta
                </th>
                {MESES_CURTO.map((m) => (
                  <th key={m} className="px-2 py-2 border-b border-border-base text-content-faint font-normal">
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {indicadores.map((ind) => (
                <tr key={ind.id} className="group">
                  <td className="sticky left-0 z-10 bg-surface-1 group-hover:bg-surface-2 px-3 py-2 border-r border-b border-border-subtle">
                    <p className="font-medium text-content-strong">{ind.nome}</p>
                    <p className="text-[10px] text-content-faint">
                      {ind.unidade} · {ind.origem === 'manual' ? 'manual' : `auto (${ind.origem})`}
                    </p>
                  </td>
                  <td className="px-2 py-2 border-b border-border-subtle text-content-muted whitespace-nowrap">
                    {ind.meta_label ?? ''}
                  </td>
                  {MESES_CURTO.map((_, mesIdx) => (
                    <td key={mesIdx} className="px-1 py-1 border-b border-border-subtle">
                      <CelulaValor
                        key={`${ind.id}:${mesIdx}:${valorDo(ind, mesIdx)}`}
                        ind={ind}
                        valor={valorDo(ind, mesIdx)}
                        editavel={ind.origem === 'manual'}
                        onSave={(v) => {
                          if (!fazendaId || !ano || !user) return
                          saveValor.mutate(
                            {
                              indicadorId: ind.id,
                              fazendaId,
                              ano,
                              mes: mesIdx + 1,
                              valor: v,
                              usuarioId: user.id,
                            },
                            { onError: () => toast.error('Erro ao salvar valor') },
                          )
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
