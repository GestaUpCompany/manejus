import { useMemo, useState } from 'react'
import { useAuth, useFazenda } from '@gestaup/shared'
import { Card, PageSkeleton, EmptyState, Select, useToast } from '@gestaup/ui'
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

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

type Farol = 0 | 1 | 2 | 3 // sem lançamento, dentro, atenção, fora

function farol(ind: FpIndicador, valor: number | null): Farol {
  if (valor === null) return 0
  const meta = ind.meta_valor
  const atencao = ind.atencao_valor
  if (meta === null || atencao === null) return 0
  if (ind.direcao === 'up') {
    if (valor >= meta) return 1
    if (valor >= atencao) return 2
    return 3
  }
  if (valor <= meta) return 1
  if (valor <= atencao) return 2
  return 3
}

const FAROL_ROTULO = ['Sem lançamento', 'Dentro da meta', 'Zona de atenção', 'Fora da meta']
const FAROL_PILL = [
  'bg-surface-3 text-content-muted',
  'bg-green-100 text-green-800',
  'bg-amber-100 text-amber-800',
  'bg-red-100 text-red-700',
]
const FAROL_TXT = ['text-content-strong', 'text-green-600', 'text-amber-500', 'text-red-500']

function nf(v: number, dec = 0): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function CardIndicador({
  ind,
  valor,
  historico,
  metaLabel,
  onSave,
}: {
  ind: FpIndicador
  valor: number | null
  historico: (number | null)[]
  metaLabel: string
  onSave: (v: number | null) => void
}) {
  const f = farol(ind, valor)
  const [txt, setTxt] = useState(
    valor !== null ? String(valor.toFixed(ind.casas_decimais)).replace('.', ',') : '',
  )
  const auto = ind.origem !== 'manual'

  const commit = () => {
    const raw = txt.trim()
    if (raw === '') {
      if (valor !== null) onSave(null)
      return
    }
    const v = Number(raw.replace(/\./g, '').replace(',', '.'))
    if (Number.isNaN(v)) return
    if (valor !== null && v === valor) return
    onSave(v)
  }

  const vals = historico.filter((x): x is number => x !== null)
  const mx = Math.max(...vals, 0.0001)

  return (
    <Card className="p-4 flex flex-col gap-1.5 min-h-[170px]" disableHover>
      <h4 className="m-0 text-sm font-bold text-content-strong">{ind.nome}</h4>
      <div className="text-xs text-content-faint -mt-1">{ind.unidade}</div>

      {auto ? (
        <>
          <b className={`font-display text-[34px] leading-tight ${FAROL_TXT[f]}`}>
            {valor === null ? '—' : nf(valor, ind.casas_decimais)}
          </b>
          <small className="text-content-faint font-semibold">calculado pelo sistema</small>
        </>
      ) : (
        <input
          value={txt}
          onChange={(e) => setTxt(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commit()
              e.currentTarget.blur()
            }
          }}
          inputMode="decimal"
          placeholder="Lançar resultado"
          aria-label={`Resultado: ${ind.nome}`}
          className={`w-[130px] px-2 py-1 rounded-lg border border-border-base bg-surface-1 font-display font-bold outline-none focus:border-brand-500 ${
            valor === null ? 'text-sm' : 'text-[26px]'
          } ${FAROL_TXT[f]}`}
        />
      )}

      {vals.length > 1 && (
        <svg viewBox="0 0 120 26" className="w-[120px] h-[26px] mt-auto" aria-hidden="true">
          {historico.map((x, k) =>
            x === null ? null : (
              <rect
                key={k}
                x={k * 20 + 2}
                y={24 - (x / mx) * 22}
                width={14}
                height={(x / mx) * 22}
                rx={2}
                className={k === historico.length - 1 ? 'fill-brand-800' : 'fill-surface-3'}
              />
            ),
          )}
        </svg>
      )}

      <div className="mt-auto flex justify-between items-center gap-2 text-xs text-content-muted">
        <span>Meta: {metaLabel}</span>
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${FAROL_PILL[f]}`}>
          {FAROL_ROTULO[f]}
        </span>
      </div>
    </Card>
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

  const [mes, setMes] = useState(() => new Date().getMonth())

  const valoresMap = useMemo(
    () => new Map((valores ?? []).map((v) => [`${v.indicador_id}:${v.mes}`, v.valor])),
    [valores],
  )

  // Valores automáticos por mês (0-11)
  const autoPorMes = useMemo(() => {
    if (!plano) return { escore: new Map<number, number>(), atividades: new Map<number, number>() }
    const escore = new Map<number, number>()
    const ativ = new Map<number, number>()
    for (let m = 0; m < 12; m++) {
      const semanasDoMes = new Set(semanasIntersectamMes(plano.semana1_inicio, plano.ano, m))

      const notasMes = (avaliacoes ?? []).filter(
        (a) => !a.nsa && a.nota !== null && semanasDoMes.has(a.semana),
      )
      if (notasMes.length) {
        escore.set(m, notasMes.reduce((s, a) => s + Number(a.nota), 0) / notasMes.length)
      }

      const semMes = (semanas ?? []).filter((s) => semanasDoMes.has(s.semana))
      if (semMes.length) {
        const concluidas = semMes.filter((s) => s.status === 2).length
        ativ.set(m, (concluidas / semMes.length) * 100)
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

  const farois = (indicadores ?? []).map((ind) => farol(ind, valorDo(ind, mes)))
  const conta = (f: Farol) => farois.filter((x) => x === f).length

  const historicoDe = (ind: FpIndicador): (number | null)[] => {
    const h: (number | null)[] = []
    for (let k = Math.max(0, mes - 5); k <= mes; k++) h.push(valorDo(ind, k))
    return h
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">
            {indicadores?.length ?? 0} indicadores mensais · meta, resultado e farol
          </p>
          <h1 className="text-[28px] font-bold font-display text-content-strong tracking-tight leading-tight">
            Painel de bordo
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-content-muted">Mês</span>
          <div className="min-w-[170px] [&>div]:mb-0">
            <Select
              value={String(mes)}
              onChange={(v) => setMes(Number(v))}
              options={MESES.map((m, i) => ({ value: String(i), label: `${m} ${ano}` }))}
            />
          </div>
        </div>
      </div>

      {!indicadores?.length ? (
        <EmptyState
          title="Nenhum indicador"
          description="Os indicadores padrão são criados com a fazenda."
        />
      ) : (
        <>
          <div className="flex flex-wrap justify-between gap-2 text-xs text-content-muted font-medium">
            <span>
              {conta(1)} dentro da meta · {conta(2)} em atenção · {conta(3)} fora da meta ·{' '}
              {conta(0)} sem lançamento
            </span>
            <span>Mini-gráfico = últimos 6 meses</span>
          </div>

          <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))' }}>
            {indicadores.map((ind) => {
              const v = valorDo(ind, mes)
              return (
                <CardIndicador
                  key={`${ind.id}:${mes}:${v}`}
                  ind={ind}
                  valor={v}
                  historico={historicoDe(ind)}
                  metaLabel={ind.meta_label ?? '—'}
                  onSave={(nv) => {
                    if (!fazendaId || !ano || !user) return
                    saveValor.mutate(
                      {
                        indicadorId: ind.id,
                        fazendaId,
                        ano,
                        mes: mes + 1,
                        valor: nv,
                        usuarioId: user.id,
                      },
                      {
                        onSuccess: () => toast.success('Resultado lançado'),
                        onError: () => toast.error('Erro ao salvar valor'),
                      },
                    )
                  }}
                />
              )
            })}
          </div>

          <p className="eyebrow pt-1">
            Escore da equipe e atividades concluídas saem direto das avaliações e do plano semanal,
            sem digitação. Os demais: digite o resultado e tecle Enter.
          </p>
        </>
      )}
    </div>
  )
}
