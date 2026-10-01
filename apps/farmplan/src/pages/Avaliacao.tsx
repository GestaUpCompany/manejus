import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth, useFazenda } from '@gestaup/shared'
import {
  Card,
  Button,
  Modal,
  Select,
  Input,
  EmptyState,
  PageSkeleton,
  useToast,
} from '@gestaup/ui'
import {
  usePlanoAtivo,
  useFuncionariosFp,
  useEquipesFp,
  useSemanaDados,
} from '../services/farmplanService'
import {
  useCriterios,
  useContratosFazenda,
  useAvaliacoesAno,
  useSaveAvaliacao,
  useSaveContratoItem,
  useDeleteContratoItem,
} from '../services/equipeService'
import type { FpAvaliacao, FpContratoItem, FuncionarioFp } from '../types/farmplan'
import { datasDaSemana } from '../types/farmplan'

const MES_ABREV = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
] as const

const scCls = (v: number | null | undefined) =>
  v == null
    ? 'text-content-muted'
    : v >= 8.5
      ? 'text-green-600 dark:text-green-400'
      : v >= 7
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-red-600 dark:text-red-400'

const nf = (v: number | null | undefined, casas = 1) =>
  v == null ? '—' : v.toFixed(casas)

// ---------- Modal de contrato ----------

function ContratoModal({
  funcionario,
  itens,
  fazendaId,
  onClose,
}: {
  funcionario: FuncionarioFp
  itens: FpContratoItem[]
  fazendaId: string
  onClose: () => void
}) {
  const { data: criterios } = useCriterios(fazendaId)
  const saveItem = useSaveContratoItem()
  const delItem = useDeleteContratoItem()
  const toast = useToast()

  const [tipo, setTipo] = useState<'tarefa' | 'comportamento'>('tarefa')
  const [descricao, setDescricao] = useState('')
  const [criterioId, setCriterioId] = useState('')

  const criterioOptions = (criterios ?? []).map((c) => ({ value: c.id, label: c.nome }))

  const adicionar = () => {
    const criterio = criterios?.find((c) => c.id === criterioId)
    const desc = tipo === 'comportamento' && criterio ? criterio.nome : descricao.trim()
    if (!desc) {
      toast.error('Informe a descrição ou escolha um critério')
      return
    }
    saveItem.mutate(
      {
        funcionarioId: funcionario.id,
        fazendaId,
        tipo,
        descricao: desc,
        criterioId: tipo === 'comportamento' ? criterioId || null : null,
        ordem: itens.length,
      },
      {
        onSuccess: () => {
          setDescricao('')
          setCriterioId('')
          toast.success('Item adicionado')
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Erro ao salvar'),
      },
    )
  }

  return (
    <Modal isOpen onClose={onClose} title={`Contrato de ${funcionario.apelido || funcionario.nome}`} size="lg">
      <div className="space-y-4">
        {(['tarefa', 'comportamento'] as const).map((t) => {
          const lista = itens.filter((i) => i.tipo === t)
          return (
            <div key={t}>
              <p className="text-xs font-semibold text-content-faint uppercase mb-1">
                {t === 'tarefa' ? 'Tarefas' : 'Comportamentos'}
              </p>
              {lista.length === 0 ? (
                <p className="text-sm text-content-faint">Nenhum item.</p>
              ) : (
                <ul className="space-y-1">
                  {lista.map((i) => (
                    <li key={i.id} className="flex items-center gap-2 text-sm text-content">
                      <span className="flex-1">{i.descricao}</span>
                      <button
                        onClick={() =>
                          delItem.mutate(i.id, { onError: () => toast.error('Erro ao remover') })
                        }
                        className="text-content-faint hover:text-red-500 text-xs"
                        aria-label={`Remover ${i.descricao}`}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}

        <div className="border-t border-border-base pt-4 space-y-3">
          <p className="text-sm font-semibold text-content-strong">Adicionar item</p>
          <div className="flex gap-4">
            {(['tarefa', 'comportamento'] as const).map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm text-content">
                <input
                  type="radio"
                  checked={tipo === t}
                  onChange={() => setTipo(t)}
                />
                {t === 'tarefa' ? 'Tarefa' : 'Comportamento'}
              </label>
            ))}
          </div>
          {tipo === 'comportamento' && (
            <Select
              label="Critério da metodologia (opcional)"
              options={criterioOptions}
              value={criterioId}
              onChange={setCriterioId}
              placeholder="Escolher do catálogo"
            />
          )}
          {!(tipo === 'comportamento' && criterioId) && (
            <Input
              label="Descrição"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          )}
          <Button onClick={adicionar} disabled={saveItem.isPending} size="sm">
            Adicionar
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ---------- Linha de item avaliável ----------

interface NotaLocal {
  nota: number | null
  nsa: boolean
}

function LinhaItem({
  item,
  valor,
  media,
  onCommit,
}: {
  item: FpContratoItem
  valor: NotaLocal | undefined
  media: number | null
  onCommit: (v: NotaLocal | null) => void
}) {
  const inicial = valor?.nsa ? 'NSA' : valor?.nota != null ? String(valor.nota) : ''
  const [txt, setTxt] = useState(inicial)

  useEffect(() => {
    setTxt(valor?.nsa ? 'NSA' : valor?.nota != null ? String(valor.nota) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor?.nota, valor?.nsa])

  const commit = () => {
    const v = txt.trim().replace(',', '.')
    if (v === inicial) return
    if (!v) {
      onCommit(null)
      return
    }
    if (/^nsa$/i.test(v)) {
      onCommit({ nota: null, nsa: true })
      setTxt('NSA')
      return
    }
    const n = Math.max(0, Math.min(10, parseFloat(v)))
    if (Number.isNaN(n)) {
      setTxt(inicial)
      return
    }
    setTxt(String(n))
    onCommit({ nota: n, nsa: false })
  }

  const isNsa = /^nsa$/i.test(txt.trim())
  return (
    <div className="grid grid-cols-[1fr_44px_64px] gap-2.5 items-center py-[7px] border-b border-border-subtle text-[13px]">
      <span className="text-content">{item.descricao}</span>
      <span className="text-right text-content-muted tabular-nums">
        {media == null ? '—' : nf(media)}
      </span>
      <input
        value={txt}
        inputMode="decimal"
        placeholder={media == null ? 'NSA' : '—'}
        aria-label={`Nota: ${item.descricao}`}
        onChange={(e) => setTxt(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className={`w-16 text-center font-bold text-base px-1.5 py-1.5 rounded-lg border bg-surface-1 focus:outline-none focus:ring-2 focus:ring-primary ${
          isNsa
            ? 'border-dashed border-border-base text-content-muted text-xs'
            : 'border-border-base text-content-strong'
        }`}
      />
    </div>
  )
}

// ---------- Página ----------

export function Avaliacao() {
  const { user } = useAuth()
  const { data: fazenda } = useFazenda(user?.id)
  const fazendaId = fazenda?.id
  const [params] = useSearchParams()
  const { data: plano, isLoading: loadingPlano } = usePlanoAtivo(fazendaId)
  const [semanaSel, setSemanaSel] = useState<number | null>(null)
  const semana = semanaSel ?? plano?.semanaAtual ?? 1
  const ano = plano?.ano

  const { data: funcionarios, isLoading: loadingFuncs } = useFuncionariosFp(fazendaId)
  const { data: equipes } = useEquipesFp(fazendaId)
  const { data: contratos, isLoading: loadingContratos } = useContratosFazenda(fazendaId)
  const { data: avaliacoes } = useAvaliacoesAno(fazendaId, ano)
  const { data: semanaDados } = useSemanaDados(fazendaId, plano?.id, semana)
  const saveAvaliacao = useSaveAvaliacao()
  const toast = useToast()

  const [selId, setSelId] = useState<string | null>(params.get('pessoa'))
  const [edits, setEdits] = useState<Map<string, NotaLocal>>(new Map())
  const [editandoContrato, setEditandoContrato] = useState<FuncionarioFp | null>(null)

  useEffect(() => setEdits(new Map()), [selId, semana])

  const itensPorFunc = useMemo(() => {
    const m = new Map<string, FpContratoItem[]>()
    for (const c of contratos ?? []) {
      if (!c.ativo) continue
      const arr = m.get(c.funcionario_id) ?? []
      arr.push(c)
      m.set(c.funcionario_id, arr)
    }
    return m
  }, [contratos])

  // avaliações indexadas por (item, semana)
  const avalPor = useMemo(() => {
    const m = new Map<string, FpAvaliacao>()
    for (const a of avaliacoes ?? []) m.set(`${a.contrato_item_id}:${a.semana}`, a)
    return m
  }, [avaliacoes])

  const P = useMemo(
    () =>
      (funcionarios ?? [])
        .filter((f) => f.ativo && (itensPorFunc.get(f.id) ?? []).length > 0)
        .sort((a, b) => (a.apelido || a.nome).localeCompare(b.apelido || b.nome, 'pt-BR')),
    [funcionarios, itensPorFunc],
  )

  const sel = P.find((f) => f.id === selId) ?? P[0] ?? null

  const valorDe = (itemId: string): NotaLocal | undefined => {
    if (edits.has(itemId)) return edits.get(itemId)
    const a = avalPor.get(`${itemId}:${semana}`)
    if (!a) return undefined
    return { nota: a.nota, nsa: a.nsa }
  }

  const avaliado = (f: FuncionarioFp) => {
    const itens = itensPorFunc.get(f.id) ?? []
    return (
      itens.length > 0 &&
      itens.every((i) => {
        const v =
          f.id === sel?.id && edits.has(i.id)
            ? edits.get(i.id)
            : avalPor.get(`${i.id}:${semana}`)
        return !!v && (v.nsa || v.nota !== null)
      })
    )
  }

  /** Média de um item até a semana anterior. */
  const mediaAnterior = (itemId: string): number | null => {
    const notas = (avaliacoes ?? []).filter(
      (a) => a.contrato_item_id === itemId && a.semana < semana && !a.nsa && a.nota !== null,
    )
    return notas.length
      ? notas.reduce((s, a) => s + Number(a.nota), 0) / notas.length
      : null
  }

  /** Escore do ano = média das médias semanais até a semana anterior. */
  const escoreAno = (f: FuncionarioFp): number | null => {
    const porSem = new Map<number, { s: number; n: number }>()
    for (const a of avaliacoes ?? []) {
      if (a.funcionario_id !== f.id || a.semana >= semana || a.nsa || a.nota === null)
        continue
      const acc = porSem.get(a.semana) ?? { s: 0, n: 0 }
      acc.s += Number(a.nota)
      acc.n += 1
      porSem.set(a.semana, acc)
    }
    const medias = [...porSem.values()].map((x) => x.s / x.n)
    return medias.length ? medias.reduce((a, b) => a + b, 0) / medias.length : null
  }

  /** Escore desta semana (local + servidor). */
  const escoreSemana = (): number | null => {
    if (!sel) return null
    const itens = itensPorFunc.get(sel.id) ?? []
    const notas: number[] = []
    for (const i of itens) {
      const v = valorDe(i.id)
      if (v && !v.nsa && v.nota !== null) notas.push(v.nota)
    }
    return notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null
  }

  const semanasMap = useMemo(
    () => new Map(semanaDados?.semanas.map((s) => [s.atividade_id, s]) ?? []),
    [semanaDados?.semanas],
  )
  const cargaSemana = (f: FuncionarioFp): [number, number] => {
    const eqs = (equipes ?? []).filter((e) => e.membros.includes(f.id)).map((e) => e.id)
    const minhas = (semanaDados?.atividades ?? []).filter(
      (a) =>
        semanasMap.has(a.id) &&
        (a.executor_funcionario_id === f.id ||
          (a.executor_equipe_id && eqs.includes(a.executor_equipe_id))),
    )
    return [minhas.filter((a) => semanasMap.get(a.id)?.status === 2).length, minhas.length]
  }

  if (loadingPlano || loadingFuncs || loadingContratos) return <PageSkeleton />
  if (!plano) {
    return (
      <EmptyState
        title="Nenhum plano anual ativo"
        description="Crie o plano do ano em Cadastros > Plano anual."
      />
    )
  }
  if (!P.length) {
    return (
      <EmptyState
        title="Nenhum contrato de resultados"
        description="Monte o contrato das pessoas em Cadastros > Pessoas ou pela ficha na Equipe."
      />
    )
  }
  if (!sel) return null

  const datas = datasDaSemana(plano.semana1_inicio, semana)
  const intervalo = `${datas[0].getDate()} ${MES_ABREV[datas[0].getMonth()]} – ${datas[6].getDate()} ${MES_ABREV[datas[6].getMonth()]}`
  const nAvaliados = P.filter(avaliado).length
  const [dn, tt] = cargaSemana(sel)
  const tarefas = (itensPorFunc.get(sel.id) ?? []).filter((i) => i.tipo === 'tarefa')
  const comportamentos = (itensPorFunc.get(sel.id) ?? []).filter(
    (i) => i.tipo === 'comportamento',
  )

  const commitNota = (item: FpContratoItem, v: NotaLocal | null) => {
    if (!fazendaId || !ano || !user) return
    setEdits((prev) => {
      const n = new Map(prev)
      if (v === null) n.delete(item.id)
      else n.set(item.id, v)
      return n
    })
    saveAvaliacao.mutate(
      {
        contratoItemId: item.id,
        funcionarioId: item.funcionario_id,
        fazendaId,
        ano,
        semana,
        nota: v?.nota ?? null,
        nsa: v?.nsa ?? false,
        avaliadorUsuarioId: user.id,
      },
      { onError: () => toast.error('Erro ao salvar avaliação') },
    )
  }

  const repetirSemanaAnterior = () => {
    if (semana <= 1) return
    const itens = itensPorFunc.get(sel.id) ?? []
    let copiados = 0
    for (const i of itens) {
      const prev = avalPor.get(`${i.id}:${semana - 1}`)
      if (!prev || (prev.nota === null && !prev.nsa)) continue
      copiados++
      commitNota(i, { nota: prev.nota, nsa: prev.nsa })
    }
    toast.success(
      copiados
        ? `${copiados} nota(s) copiadas da semana ${semana - 1}`
        : `Semana ${semana - 1} não tem notas para copiar`,
    )
  }

  const proximo = () => {
    const idx = P.findIndex((f) => f.id === sel.id)
    if (idx < P.length - 1) setSelId(P[idx + 1].id)
    else toast.success('Último da lista')
  }

  const bloco = (
    titulo: string,
    sub: string,
    itens: FpContratoItem[],
  ) => (
    <Card className="p-4" disableHover>
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-base font-bold text-content-strong">{titulo}</h3>
          <p className="text-xs text-content-muted">{sub}</p>
        </div>
        <small className="text-xs text-content-muted font-semibold self-end">
          MÉDIA · NOTA
        </small>
      </div>
      <div className="mt-2">
        {itens.length === 0 ? (
          <p className="py-2 text-xs text-content-muted">Sem itens no contrato.</p>
        ) : (
          itens.map((it) => (
            <LinhaItem
              key={`${it.id}:${semana}`}
              item={it}
              valor={valorDe(it.id)}
              media={mediaAnterior(it.id)}
              onCommit={(v) => commitNota(it, v)}
            />
          ))
        )}
      </div>
    </Card>
  )

  return (
    <div className="space-y-4">
      {/* phead */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[13px] text-content-muted">
            Semana {semana} · {intervalo}
          </p>
          <h1 className="text-3xl font-extrabold text-content-strong mt-0.5 tracking-tight">
            Avaliação semanal de desempenho
          </h1>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <label className="flex items-center gap-1.5 text-[13px] text-content-muted">
            Semana
            <select
              value={semana}
              onChange={(e) => setSemanaSel(Number(e.target.value))}
              className="border border-border-base bg-surface-1 rounded-lg px-2 py-1.5 text-[13px] text-content-strong"
            >
              {Array.from({ length: plano.semanaAtual }, (_, i) => i + 1).map((s) => (
                <option key={s} value={s}>
                  Semana {s}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="secondary"
            size="sm"
            disabled={semana <= 1}
            onClick={repetirSemanaAnterior}
          >
            Repetir notas da semana {semana - 1}
          </Button>
          <Button variant="secondary" size="sm" onClick={proximo}>
            Salvar e ir para o próximo
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(200px,260px)_1fr] items-start">
        {/* lista de colaboradores */}
        <Card className="p-0 overflow-hidden" disableHover>
          <div className="px-3.5 pt-3.5 pb-2">
            <h3 className="text-sm font-bold text-content-strong">Colaboradores</h3>
            <p className="text-xs text-content-muted">
              {nAvaliados} de {P.length} avaliados nesta semana
            </p>
          </div>
          <div>
            {P.map((f) => {
              const on = f.id === sel.id
              const ok = avaliado(f)
              return (
                <button
                  key={f.id}
                  onClick={() => setSelId(f.id)}
                  className={`w-full flex justify-between items-center gap-2 border-t border-border-subtle px-3.5 py-2.5 text-left transition-colors ${
                    on ? 'bg-primary/10' : 'hover:bg-surface-2'
                  }`}
                >
                  <span className="min-w-0">
                    <b className="block text-[13.5px] text-content-strong truncate">
                      {f.apelido || f.nome}
                    </b>
                    <small className="text-[11.5px] text-content-muted">
                      {f.cargo || '—'}
                    </small>
                  </span>
                  {on ? (
                    <small className="text-blue-500 font-bold text-[11px]">agora</small>
                  ) : (
                    <span
                      className={`w-5 h-5 rounded-full border-2 grid place-items-center flex-none ${
                        ok
                          ? 'bg-green-600 border-green-600 text-white'
                          : 'border-slate-400'
                      }`}
                    >
                      {ok && (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </Card>

        {/* painel da pessoa */}
        <div className="grid gap-4">
          <Card className="px-4 py-4 flex justify-between gap-3 flex-wrap items-center" disableHover>
            <div>
              <h3 className="text-[19px] font-bold text-content-strong">{sel.nome}</h3>
              <p className="text-[12.5px] text-content-muted">
                {sel.cargo || '—'} · na semana: {dn} de {tt} tarefas do plano
                concluídas
              </p>
            </div>
            <div className="flex gap-5 text-[13px] text-content-muted items-center">
              <span>
                Escore no ano{' '}
                <b className="text-base font-extrabold text-content-strong tabular-nums">
                  {nf(escoreAno(sel))}
                </b>
              </span>
              <span>
                Esta semana{' '}
                <b className={`text-base font-extrabold tabular-nums ${scCls(escoreSemana())}`}>
                  {nf(escoreSemana())}
                </b>
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setEditandoContrato(sel)}
              >
                Contrato
              </Button>
            </div>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2 items-start">
            {bloco(
              'Atribuições e tarefas',
              'Nota de 0 a 10 · NSA quando não se aplica',
              tarefas,
            )}
            {bloco(
              'Comportamentos e atitudes',
              'Critérios escolhidos no contrato de resultados',
              comportamentos,
            )}
          </div>
        </div>
      </div>

      {editandoContrato && fazendaId && (
        <ContratoModal
          funcionario={editandoContrato}
          itens={itensPorFunc.get(editandoContrato.id) ?? []}
          fazendaId={fazendaId}
          onClose={() => setEditandoContrato(null)}
        />
      )}
    </div>
  )
}
