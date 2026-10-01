import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth, useFazenda } from '@gestaup/shared'
import { Card, PageSkeleton, EmptyState, Button } from '@gestaup/ui'
import {
  usePlanoAtivo,
  useFuncionariosFp,
  useEquipesFp,
  useSemanaDados,
} from '../services/farmplanService'
import { useSetores } from '../services/cadastrosService'
import {
  useContratoItens,
  useAvaliacoesAno,
  escorePorSemana,
} from '../services/equipeService'
import type { FpAvaliacao, FuncionarioFp } from '../types/farmplan'

const nf = (v: number | null | undefined, casas = 1) =>
  v == null ? '—' : v.toFixed(casas)

// farol do escore: verde >= 8.5, âmbar >= 7, vermelho abaixo
const scCls = (v: number | null | undefined) =>
  v == null
    ? 'text-content-muted'
    : v >= 8.5
      ? 'text-green-600 dark:text-green-400'
      : v >= 7
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-red-600 dark:text-red-400'

const ini = (nome: string) =>
  nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

/** Média de um item de contrato no ano (ignora NSA); null = sem avaliação. */
function itemAvg(avaliacoes: FpAvaliacao[], itemId: string): number | null {
  const notas = avaliacoes.filter(
    (a) => a.contrato_item_id === itemId && !a.nsa && a.nota !== null,
  )
  if (!notas.length) return null
  return notas.reduce((s, a) => s + Number(a.nota), 0) / notas.length
}

/** Média de um bloco (tarefa/comportamento) = média das médias dos itens. */
function blockAvg(
  avaliacoes: FpAvaliacao[],
  itens: { id: string }[],
): number | null {
  const vals = itens
    .map((i) => itemAvg(avaliacoes, i.id))
    .filter((v): v is number => v !== null)
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
}

interface NoOrgProps {
  f: FuncionarioFp
  filhosDe: Map<string | null, FuncionarioFp[]>
  escoreDe: (id: string) => number | null
  onSelect: (id: string) => void
}

function NoOrg({ f, filhosDe, escoreDe, onSelect }: NoOrgProps) {
  const filhos = filhosDe.get(f.id) ?? []
  const sc = escoreDe(f.id)
  return (
    <div className="flex flex-col items-center">
      <button
        onClick={() => onSelect(f.id)}
        className="border border-border-base bg-surface-1 rounded-lg px-2.5 py-2 text-center min-w-[110px] max-w-[130px] text-[11.5px] text-content-muted hover:border-primary/60 transition-colors"
      >
        <b className="block text-[13px] text-content-strong">{f.apelido || f.nome}</b>
        {f.cargo || 'Cargo não cadastrado'}
        {sc !== null && (
          <span className={`block mt-0.5 text-[13px] font-extrabold ${scCls(sc)}`}>
            {nf(sc)}
          </span>
        )}
      </button>
      {filhos.length > 0 && (
        <>
          <div className="w-px h-[18px] bg-content-muted/50" />
          <div className="flex gap-2.5 items-start relative pt-0">
            {/* linha horizontal ligando os filhos */}
            {filhos.length > 1 && (
              <div
                className="absolute top-0 border-t border-content-muted/50"
                style={{
                  left: `calc(${100 / filhos.length / 2}%)`,
                  right: `calc(${100 / filhos.length / 2}%)`,
                }}
              />
            )}
            {filhos.map((filho) => (
              <div key={filho.id} className="flex flex-col items-center">
                <div className="w-px h-[18px] bg-content-muted/50" />
                <NoOrg
                  f={filho}
                  filhosDe={filhosDe}
                  escoreDe={escoreDe}
                  onSelect={onSelect}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function FichaPessoa({
  f,
  planoAno,
  semanaAtual,
}: {
  f: FuncionarioFp
  planoAno?: number
  semanaAtual: number
}) {
  const { user } = useAuth()
  const { data: fazenda } = useFazenda(user?.id)
  const { data: contrato } = useContratoItens(f.id)
  const { data: avaliacoes } = useAvaliacoesAno(fazenda?.id, planoAno)
  const { data: setores } = useSetores(fazenda?.id)
  const { data: funcionarios } = useFuncionariosFp(fazenda?.id)
  const { data: equipes } = useEquipesFp(fazenda?.id)
  const navigate = useNavigate()

  const avsPessoa = useMemo(
    () => (avaliacoes ?? []).filter((a) => a.funcionario_id === f.id),
    [avaliacoes, f.id],
  )
  const escores = useMemo(() => escorePorSemana(avsPessoa), [avsPessoa])

  const tarefas = (contrato ?? []).filter((c) => c.tipo === 'tarefa' && c.ativo)
  const comportamentos = (contrato ?? []).filter(
    (c) => c.tipo === 'comportamento' && c.ativo,
  )
  const ta = blockAvg(avsPessoa, tarefas)
  const ca = blockAvg(avsPessoa, comportamentos)
  const escore = useMemo(() => {
    const vals = [...escores.values()]
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }, [escores])

  const setor = setores?.find((s) => s.id === f.setor_id)
  const superior = funcionarios?.find((x) => x.id === f.superior_id)
  const minhasEquipes = (equipes ?? []).filter((e) => e.membros.includes(f.id))
  const hist = Array.from({ length: semanaAtual }, (_, i) => i + 1).map(
    (sem) => [sem, escores.get(sem) ?? null] as const,
  )
  const temAvaliacao = hist.some(([, v]) => v !== null)

  return (
    <Card className="p-4 space-y-3.5" disableHover>
      <div className="flex gap-3 items-center">
        <span className="w-12 h-12 rounded-full bg-[#114665] text-white grid place-items-center text-[15px] font-bold flex-none">
          {ini(f.nome)}
        </span>
        <div className="min-w-0">
          <h3 className="text-[19px] font-bold text-content-strong leading-tight">
            {f.nome}
          </h3>
          <p className="text-[12.5px] text-content-muted">
            {f.cargo || 'Cargo não cadastrado'} · Setor {setor?.nome ?? '—'}
            {superior ? ` · responde a ${superior.apelido || superior.nome}` : ''}
          </p>
          {minhasEquipes.length > 0 && (
            <p className="text-[11.5px] text-content-faint mt-0.5">
              Equipes: {minhasEquipes.map((e) => e.nome).join(', ')}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg px-3 py-2.5 bg-green-100 dark:bg-green-900/30">
          <small className="block text-[11px] font-semibold text-content-muted leading-tight">
            Escore individual
          </small>
          <b className="block text-2xl font-extrabold text-content-strong tabular-nums">
            {nf(escore)}
          </b>
        </div>
        <div className="rounded-lg px-3 py-2.5 bg-surface-2">
          <small className="block text-[11px] font-semibold text-content-muted leading-tight">
            Tarefas do contrato
          </small>
          <b className="block text-2xl font-extrabold text-content-strong tabular-nums">
            {nf(ta)}
          </b>
        </div>
        <div className="rounded-lg px-3 py-2.5 bg-surface-2">
          <small className="block text-[11px] font-semibold text-content-muted leading-tight">
            Comportamentos
          </small>
          <b className="block text-2xl font-extrabold text-content-strong tabular-nums">
            {nf(ca)}
          </b>
        </div>
      </div>

      {temAvaliacao && (
        <div>
          <p className="text-xs text-content-muted mb-1">
            Escore por semana (1 a {semanaAtual})
          </p>
          <svg
            viewBox={`0 0 ${hist.length * 26} 70`}
            className="w-full h-[70px]"
            role="img"
            aria-label="Escore semanal"
          >
            {hist.map(([sem, v], i) => {
              const h = v == null ? 0 : Math.max(3, ((v - 7) / 3) * 50)
              return (
                <g key={sem}>
                  <rect
                    x={i * 26 + 4}
                    y={56 - h}
                    width={18}
                    height={Math.max(h, 2)}
                    rx={3}
                    className={
                      v == null
                        ? 'fill-surface-2'
                        : sem === semanaAtual
                          ? 'fill-[#114665]'
                          : 'fill-blue-500'
                    }
                  >
                    <title>{`Sem. ${sem}: ${nf(v)}`}</title>
                  </rect>
                  <text
                    x={i * 26 + 13}
                    y={68}
                    fontSize={9}
                    textAnchor="middle"
                    className="fill-content-muted"
                  >
                    {sem}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>
      )}

      <div>
        <div className="flex justify-between items-baseline">
          <h3 className="text-[15px] font-bold text-content-strong">
            Atribuições e tarefas
          </h3>
          <small className="text-xs text-content-muted">média do ano</small>
        </div>
        <div>
          {tarefas.map((it) => {
            const v = itemAvg(avsPessoa, it.id)
            return (
              <div
                key={it.id}
                className="flex justify-between gap-2.5 py-[7px] border-b border-border-subtle text-[13px]"
              >
                <span className="text-content">{it.descricao}</span>
                <b className={`tabular-nums ${scCls(v)}`}>
                  {v == null ? 'NSA' : nf(v)}
                </b>
              </div>
            )
          })}
          {comportamentos.map((it) => {
            const v = itemAvg(avsPessoa, it.id)
            return (
              <div
                key={it.id}
                className="flex justify-between gap-2.5 py-[7px] border-b border-border-subtle text-[13px]"
              >
                <span className="text-content-muted">{it.descricao}</span>
                <b className={`tabular-nums ${scCls(v)}`}>
                  {v == null ? 'NSA' : nf(v)}
                </b>
              </div>
            )
          })}
          {!tarefas.length && !comportamentos.length && (
            <p className="py-2 text-xs text-content-muted">
              Sem itens no contrato de resultados.
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate(`/avaliacao?pessoa=${f.id}`)}
        >
          ★ Avaliar semana {semanaAtual}
        </Button>
      </div>
    </Card>
  )
}

export function Equipe() {
  const { id } = useParams()
  const { user } = useAuth()
  const { data: fazenda } = useFazenda(user?.id)
  const fazendaId = fazenda?.id

  const { data: plano } = usePlanoAtivo(fazendaId)
  const semanaAtual = plano?.semanaAtual ?? 1
  const { data: funcionarios, isLoading } = useFuncionariosFp(fazendaId)
  const { data: setores } = useSetores(fazendaId)
  const { data: equipes } = useEquipesFp(fazendaId)
  const { data: semanaDados } = useSemanaDados(fazendaId, plano?.id, semanaAtual)
  const { data: avaliacoes } = useAvaliacoesAno(fazendaId, plano?.ano)

  const [org, setOrg] = useState(false)
  const [filtroSetor, setFiltroSetor] = useState('')
  const [sel, setSel] = useState<string | null>(id ?? null)
  const containerRef = useRef<HTMLDivElement>(null)

  const pessoas = useMemo(
    () =>
      (funcionarios ?? [])
        .filter((f) => f.ativo && (!filtroSetor || f.setor_id === filtroSetor))
        .map((f) => ({ f, escore: escoreDe(f.id) }))
        .sort((a, b) =>
          (a.f.apelido || a.f.nome).localeCompare(b.f.apelido || b.f.nome, 'pt-BR'),
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [funcionarios, filtroSetor, avaliacoes],
  )

  function escoreDe(fid: string): number | null {
    const esc = escorePorSemana(
      (avaliacoes ?? []).filter((a) => a.funcionario_id === fid),
    )
    const vals = [...esc.values()]
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }

  const semanasMap = useMemo(
    () => new Map(semanaDados?.semanas.map((s) => [s.atividade_id, s]) ?? []),
    [semanaDados?.semanas],
  )
  const cargaSemana = (f: FuncionarioFp): [number, number] => {
    const minhasEquipes = (equipes ?? [])
      .filter((e) => e.membros.includes(f.id))
      .map((e) => e.id)
    const minhas = (semanaDados?.atividades ?? []).filter(
      (a) =>
        semanasMap.has(a.id) &&
        (a.executor_funcionario_id === f.id ||
          (a.executor_equipe_id && minhasEquipes.includes(a.executor_equipe_id))),
    )
    const feitas = minhas.filter((a) => semanasMap.get(a.id)?.status === 2).length
    return [feitas, minhas.length]
  }

  const filhosDe = useMemo(() => {
    const m = new Map<string | null, FuncionarioFp[]>()
    for (const f of funcionarios ?? []) {
      if (!f.ativo) continue
      const sup =
        f.superior_id && funcionarios?.some((x) => x.id === f.superior_id)
          ? f.superior_id
          : null
      const arr = m.get(sup) ?? []
      arr.push(f)
      m.set(sup, arr)
    }
    for (const arr of m.values())
      arr.sort((a, b) =>
        (a.apelido || a.nome).localeCompare(b.apelido || b.nome, 'pt-BR'),
      )
    return m
  }, [funcionarios])

  const selecionada =
    funcionarios?.find((f) => f.id === sel) ??
    pessoas[0]?.f ??
    null

  useEffect(() => {
    if (id) setSel(id)
  }, [id])

  if (isLoading) return <PageSkeleton />
  if (!funcionarios?.length) {
    return (
      <EmptyState
        title="Nenhuma pessoa"
        description="Cadastre pessoas em Cadastros > Pessoas."
      />
    )
  }

  const raizes = filhosDe.get(null) ?? []
  const comFilhos = raizes.filter((r) => (filhosDe.get(r.id) ?? []).length > 0)
  const semSup = raizes.filter((r) => !(filhosDe.get(r.id) ?? []).length)

  const selecionar = (fid: string) => {
    setSel(fid)
    setOrg(false)
  }

  return (
    <div className="space-y-4">
      {/* phead */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[13px] text-content-muted">
            {fazenda?.nome} · cargos, líderes e escore individual
          </p>
          <h1 className="text-3xl font-extrabold text-content-strong mt-0.5 tracking-tight">
            {org ? 'Organograma' : 'Equipe e contratos de resultados'}
          </h1>
        </div>
        <div className="inline-flex bg-surface-2 rounded-lg p-1 gap-0.5" role="tablist">
          {(
            [
              [false, 'Lista'],
              [true, 'Organograma'],
            ] as const
          ).map(([v, l]) => (
            <button
              key={l}
              role="tab"
              aria-selected={org === v}
              onClick={() => setOrg(v)}
              className={`px-3 py-1.5 rounded-md text-[13px] font-semibold transition-colors ${
                org === v
                  ? 'bg-surface-0 text-content-strong shadow-sm'
                  : 'text-content-muted hover:text-content-strong'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {org ? (
        <Card className="p-0 overflow-hidden" disableHover>
          <div ref={containerRef} className="overflow-x-auto">
            <div className="flex flex-col items-center py-6 px-3 min-w-max">
              {comFilhos.map((r) => (
                <NoOrg
                  key={r.id}
                  f={r}
                  filhosDe={filhosDe}
                  escoreDe={escoreDe}
                  onSelect={selecionar}
                />
              ))}
              {!comFilhos.length && (
                <p className="text-sm text-content-muted py-6">
                  Nenhum superior cadastrado — a árvore aparece quando as pessoas
                  tiverem "responde a" preenchido.
                </p>
              )}
            </div>
          </div>
          <div className="flex justify-between items-center gap-2.5 px-4 py-2.5 border-t border-border-subtle text-xs text-content-muted flex-wrap">
            <span>
              Sem superior cadastrado:{' '}
              {semSup.map((r) => r.apelido || r.nome).join(', ') || '—'}
            </span>
            <span>Clique numa pessoa para abrir a ficha</span>
          </div>
        </Card>
      ) : (
        <>
          <div className="flex gap-2 flex-wrap items-center">
            <select
              value={filtroSetor}
              onChange={(e) => setFiltroSetor(e.target.value)}
              className="border border-border-base bg-surface-1 rounded-lg px-2 py-1.5 text-[13px] text-content-strong"
              aria-label="Setor"
            >
              <option value="">Setor</option>
              {(setores ?? [])
                .filter((s) => s.ativo)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
            </select>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_minmax(320px,380px)] items-start">
            <Card className="p-0 overflow-hidden" disableHover>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="w-11 px-3 py-2.5 border-b border-border-base" />
                      {['Nome', 'Cargo', 'Setor', `Semana ${semanaAtual}`].map((h) => (
                        <th
                          key={h}
                          className="text-[11px] uppercase tracking-wide text-content-muted font-semibold px-3 py-2.5 border-b border-border-base text-left whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                      <th className="text-[11px] uppercase tracking-wide text-content-muted font-semibold px-3 py-2.5 border-b border-border-base text-right">
                        Escore
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pessoas.map(({ f, escore }) => {
                      const [dn, tt] = cargaSemana(f)
                      const on = selecionada?.id === f.id
                      return (
                        <tr
                          key={f.id}
                          onClick={() => setSel(f.id)}
                          className={`cursor-pointer ${on ? 'bg-primary/10' : 'hover:bg-surface-2'}`}
                        >
                          <td className="px-3 py-2.5 border-b border-border-subtle">
                            <span className="w-8 h-8 rounded-full bg-surface-2 text-content-muted grid place-items-center text-[11px] font-bold">
                              {ini(f.nome)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 border-b border-border-subtle">
                            <b className="text-sm text-content-strong">
                              {f.apelido || f.nome}
                            </b>
                            {f.apelido && (
                              <p className="text-xs text-content-muted">{f.nome}</p>
                            )}
                          </td>
                          <td className="px-3 py-2.5 border-b border-border-subtle text-xs text-content-muted">
                            {f.cargo || '—'}
                          </td>
                          <td className="px-3 py-2.5 border-b border-border-subtle text-sm text-content">
                            {setores?.find((s) => s.id === f.setor_id)?.nome ?? '—'}
                          </td>
                          <td className="px-3 py-2.5 border-b border-border-subtle text-xs text-content-muted tabular-nums">
                            {tt ? `${dn}/${tt}` : '—'}
                          </td>
                          <td className="px-3 py-2.5 border-b border-border-subtle text-right">
                            {escore !== null ? (
                              <span
                                className={`text-base font-extrabold tabular-nums ${scCls(escore)}`}
                              >
                                {nf(escore)}
                              </span>
                            ) : (
                              <span className="text-xs text-content-muted">
                                sem avaliação
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2.5 border-t border-border-subtle text-xs text-content-muted">
                {pessoas.length} colaboradores · escore = média das tarefas do
                contrato e dos comportamentos, semanas 1 a {semanaAtual}
              </div>
            </Card>

            {selecionada && (
              <FichaPessoa
                f={selecionada}
                planoAno={plano?.ano}
                semanaAtual={semanaAtual}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
