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
  useSaveObsSemana,
} from '../services/farmplanService'
import { useSetores } from '../services/cadastrosService'
import { DIAS_SEMANA_CURTO, FP_STATUS_LABEL, FP_TIPO_LABEL, datasDaSemana } from '../types/farmplan'
import type { FpAtividade, FpAtividadeSemana, FpStatusSemana } from '../types/farmplan'

const STATUS_COR: Record<FpStatusSemana, string> = {
  1: 'bg-surface-3 text-content',
  2: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  3: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  4: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  5: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
}

type Modo = 'lista' | 'pessoa' | 'setor'

// ---------- Card de atividade (compartilhado entre os modos) ----------

function CardAtividade({
  a,
  s,
  datas,
  baixasMap,
  executorLabel,
  setorNome,
  onToggleDia,
  onMudarStatus,
  onSalvarObs,
}: {
  a: FpAtividade
  s: FpAtividadeSemana | undefined
  datas: Date[]
  baixasMap: Map<string, boolean>
  executorLabel: string
  setorNome: string | null
  onToggleDia: (dia: number) => void
  onMudarStatus: (status: number) => void
  onSalvarObs: (obs: string | null) => void
}) {
  const [editandoObs, setEditandoObs] = useState(false)
  const [obsTxt, setObsTxt] = useState(s?.observacao ?? '')
  const tem5M = !!(a.metodologia || a.maquinas || a.materiais || a.meta)

  return (
    <Card className="p-4" disableHover>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="font-semibold text-content-strong truncate">{a.nome}</p>
          <p className="text-xs text-content-muted mt-0.5">
            {executorLabel}
            {setorNome ? ` · ${setorNome}` : ''}
            {a.local ? ` · ${a.local}` : ''} · {FP_TIPO_LABEL[a.tipo]}
            {s?.carry_from ? ` · atrasada da sem. ${s.carry_from}` : ''}
          </p>
        </div>
        <select
          value={s?.status ?? 1}
          onChange={(e) => onMudarStatus(Number(e.target.value))}
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
              onClick={() => onToggleDia(i)}
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

      {tem5M && (
        <details className="mt-3 border border-border-subtle rounded-lg p-2.5">
          <summary className="text-xs font-semibold text-content-muted cursor-pointer">
            5M (metodologia, máquinas, materiais, meta)
          </summary>
          <dl className="mt-2 space-y-1 text-xs">
            {a.metodologia && <div><dt className="inline font-medium text-content">Metodologia: </dt><dd className="inline text-content-muted">{a.metodologia}</dd></div>}
            {a.maquinas && <div><dt className="inline font-medium text-content">Máquinas: </dt><dd className="inline text-content-muted">{a.maquinas}</dd></div>}
            {a.materiais && <div><dt className="inline font-medium text-content">Materiais: </dt><dd className="inline text-content-muted">{a.materiais}</dd></div>}
            {a.meta && <div><dt className="inline font-medium text-content">Meta: </dt><dd className="inline text-content-muted">{a.meta}</dd></div>}
          </dl>
        </details>
      )}

      <div className="mt-3">
        {editandoObs ? (
          <div className="flex gap-2 items-start">
            <textarea
              value={obsTxt}
              onChange={(e) => setObsTxt(e.target.value)}
              rows={2}
              autoFocus
              placeholder="Observação da semana (ex.: local do giro)"
              className="flex-1 px-2 py-1.5 border rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-primary bg-surface-1 text-content-strong border-border-base"
            />
            <button
              onClick={() => {
                onSalvarObs(obsTxt.trim() || null)
                setEditandoObs(false)
              }}
              className="px-2.5 py-1.5 text-xs rounded-md bg-primary text-white"
            >
              Salvar
            </button>
            <button
              onClick={() => setEditandoObs(false)}
              className="px-2.5 py-1.5 text-xs rounded-md bg-surface-2 text-content-muted"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              setObsTxt(s?.observacao ?? '')
              setEditandoObs(true)
            }}
            className="text-xs text-left text-content-muted hover:text-content-strong transition-colors"
          >
            {s?.observacao ? (
              <span className="italic">Obs: {s.observacao}</span>
            ) : (
              <span className="text-content-faint">+ observação da semana</span>
            )}
          </button>
        )}
      </div>
    </Card>
  )
}

// ---------- Página ----------

export function Semana() {
  const { user } = useAuth()
  const { data: fazenda } = useFazenda(user?.id)
  const fazendaId = fazenda?.id
  const { data: plano, isLoading: loadingPlano } = usePlanoAtivo(fazendaId)
  const [semanaSel, setSemanaSel] = useState<number | null>(null)
  const semana = semanaSel ?? plano?.semanaAtual ?? 1
  const [modo, setModo] = useState<Modo>('lista')

  const { data, isLoading } = useSemanaDados(fazendaId, plano?.id, semana)
  const { data: funcionarios } = useFuncionariosFp(fazendaId)
  const { data: equipes } = useEquipesFp(fazendaId)
  const { data: setores } = useSetores(fazendaId)
  const setDia = useFpSetDia()
  const setStatus = useFpSetStatusSemana()
  const saveObs = useSaveObsSemana()
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
  const setorNome = (id: string | null) => setores?.find((s) => s.id === id)?.nome ?? null

  // Agrupamentos
  const grupos = useMemo(() => {
    if (modo === 'lista') return null
    const m = new Map<string, FpAtividade[]>()
    for (const a of atividadesDaSemana) {
      let chave: string
      if (modo === 'pessoa') {
        chave = a.executor_funcionario_id
          ? (nomePessoa(a.executor_funcionario_id) ?? '—')
          : a.executor_equipe_id
            ? `Equipe ${equipes?.find((e) => e.id === a.executor_equipe_id)?.nome ?? ''}`
            : 'Sem executor'
      } else {
        chave = setorNome(a.setor_id) ?? 'Sem setor'
      }
      const arr = m.get(chave) ?? []
      arr.push(a)
      m.set(chave, arr)
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, atividadesDaSemana, funcionarios, equipes, setores])

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

  const propsDe = (a: FpAtividade) => ({
    a,
    s: semanasMap.get(a.id),
    datas,
    baixasMap,
    executorLabel: executorLabel(a),
    setorNome: modo === 'setor' ? null : setorNome(a.setor_id),
    onToggleDia: (dia: number) => {
      const atual = baixasMap.get(`${a.id}:${dia}`) ?? false
      setDia.mutate(
        { atividadeId: a.id, semana, dia, feita: !atual, usuarioId: user?.id },
        { onError: () => toast.error('Erro ao atualizar baixa') },
      )
    },
    onMudarStatus: (status: number) => {
      setStatus.mutate(
        { atividadeId: a.id, semana, status, usuarioId: user?.id },
        { onError: () => toast.error('Erro ao atualizar status') },
      )
    },
    onSalvarObs: (obs: string | null) => {
      saveObs.mutate(
        { atividadeId: a.id, semana, observacao: obs },
        { onError: () => toast.error('Erro ao salvar observação') },
      )
    },
  })

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
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-border-base overflow-hidden" role="tablist" aria-label="Modo de visualização">
            {(
              [
                ['lista', 'Lista'],
                ['pessoa', 'Por pessoa'],
                ['setor', 'Por setor'],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                role="tab"
                aria-selected={modo === m}
                onClick={() => setModo(m)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  modo === m ? 'bg-primary text-white' : 'bg-surface-1 text-content-muted hover:text-content-strong'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
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
      ) : modo === 'lista' || !grupos ? (
        <div className="space-y-2">
          {atividadesDaSemana.map((a) => (
            <CardAtividade key={a.id} {...propsDe(a)} />
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {grupos.map(([grupo, ativs]) => (
            <section key={grupo}>
              <h2 className="text-sm font-semibold text-content-strong uppercase tracking-wide mb-2">
                {grupo}
                <span className="ml-2 text-xs font-normal text-content-faint">
                  {ativs.length} atividade(s)
                </span>
              </h2>
              <div className="space-y-2">
                {ativs.map((a) => (
                  <CardAtividade key={a.id} {...propsDe(a)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
