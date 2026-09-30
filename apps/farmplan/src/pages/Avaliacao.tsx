import { useMemo, useState } from 'react'
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
import { usePlanoAtivo, useFuncionariosFp } from '../services/farmplanService'
import {
  useCriterios,
  useContratosFazenda,
  useAvaliacoesSemana,
  useSaveAvaliacao,
  useSaveContratoItem,
  useDeleteContratoItem,
} from '../services/equipeService'
import type { FpContratoItem, FuncionarioFp } from '../types/farmplan'

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

// ---------- Item avaliável ----------

function ItemAvaliacao({
  item,
  avaliacao,
  onSave,
  salvando,
}: {
  item: FpContratoItem
  avaliacao: { nota: number | null; nsa: boolean } | undefined
  onSave: (nota: number | null, nsa: boolean) => void
  salvando: boolean
}) {
  const [notaTxt, setNotaTxt] = useState(avaliacao?.nota != null ? String(avaliacao.nota) : '')
  const nsa = avaliacao?.nsa ?? false

  const commitNota = () => {
    if (notaTxt === '') return
    const v = Number(notaTxt.replace(',', '.'))
    if (Number.isNaN(v) || v < 0 || v > 10) return
    if (v === avaliacao?.nota) return
    onSave(v, false)
  }

  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="flex-1 text-sm text-content min-w-0 truncate" title={item.descricao}>
        {item.descricao}
      </span>
      <input
        type="number"
        min={0}
        max={10}
        step={0.5}
        value={nsa ? '' : notaTxt}
        disabled={nsa}
        onChange={(e) => setNotaTxt(e.target.value)}
        onBlur={commitNota}
        onKeyDown={(e) => e.key === 'Enter' && commitNota()}
        placeholder="0-10"
        className="w-16 px-2 py-1 text-sm text-center border rounded-md bg-surface-1 text-content-strong border-border-base disabled:opacity-40"
      />
      <button
        onClick={() => onSave(null, !nsa)}
        disabled={salvando}
        title="Sem avaliação (NSA)"
        className={`px-2 py-1 text-xs rounded-md border transition-colors ${
          nsa
            ? 'bg-amber-100 border-amber-400 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
            : 'border-border-base text-content-faint hover:border-amber-400'
        }`}
      >
        NSA
      </button>
    </div>
  )
}

// ---------- Página ----------

export function Avaliacao() {
  const { user } = useAuth()
  const { data: fazenda } = useFazenda(user?.id)
  const fazendaId = fazenda?.id
  const { data: plano, isLoading: loadingPlano } = usePlanoAtivo(fazendaId)
  const [semanaSel, setSemanaSel] = useState<number | null>(null)
  const semana = semanaSel ?? plano?.semanaAtual ?? 1
  const ano = plano?.ano

  const { data: funcionarios, isLoading: loadingFuncs } = useFuncionariosFp(fazendaId)
  const { data: contratos, isLoading: loadingContratos } = useContratosFazenda(fazendaId)
  const { data: avaliacoes } = useAvaliacoesSemana(fazendaId, ano, semana)
  const saveAvaliacao = useSaveAvaliacao()
  const toast = useToast()

  const [editandoContrato, setEditandoContrato] = useState<FuncionarioFp | null>(null)

  const itensPorFunc = useMemo(() => {
    const m = new Map<string, FpContratoItem[]>()
    for (const c of contratos ?? []) {
      const arr = m.get(c.funcionario_id) ?? []
      arr.push(c)
      m.set(c.funcionario_id, arr)
    }
    return m
  }, [contratos])

  const avalMap = useMemo(
    () => new Map((avaliacoes ?? []).map((a) => [a.contrato_item_id, a])),
    [avaliacoes],
  )

  const avaliavies = (funcionarios ?? []).filter((f) => f.ativo)

  const progresso = useMemo(() => {
    let feitos = 0
    let total = 0
    for (const itens of itensPorFunc.values()) {
      for (const i of itens) {
        const a = avalMap.get(i.id)
        total++
        if (a && (a.nsa || a.nota !== null)) feitos++
      }
    }
    return { feitos, total }
  }, [itensPorFunc, avalMap])

  if (loadingPlano || loadingFuncs || loadingContratos) return <PageSkeleton />
  if (!plano) {
    return (
      <EmptyState
        title="Nenhum plano anual ativo"
        description="Crie o plano do ano em Cadastros > Plano anual."
      />
    )
  }

  const salvarNota = (item: FpContratoItem, nota: number | null, nsa: boolean) => {
    if (!fazendaId || !ano || !user) return
    saveAvaliacao.mutate(
      {
        contratoItemId: item.id,
        funcionarioId: item.funcionario_id,
        fazendaId,
        ano,
        semana,
        nota,
        nsa,
        avaliadorUsuarioId: user.id,
      },
      { onError: () => toast.error('Erro ao salvar avaliação') },
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-content-strong">Avaliação semanal</h1>
          <p className="text-content-muted mt-1">
            Semana {semana} de {ano} · {progresso.feitos}/{progresso.total} itens avaliados
          </p>
        </div>
        <div className="flex items-center gap-2">
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

      <p className="text-xs text-content-faint">
        Regra do plano: quem avalia é o superior direto (ou gestor/admin, que tem override). Esta tela
        web opera como gestor.
      </p>

      {avaliavies.length === 0 ? (
        <EmptyState title="Nenhuma pessoa ativa" description="Cadastre pessoas em Cadastros > Pessoas." />
      ) : (
        <div className="space-y-3">
          {avaliavies.map((f) => {
            const itens = itensPorFunc.get(f.id) ?? []
            return (
              <Card key={f.id} className="p-4" disableHover>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div>
                    <p className="font-semibold text-content-strong">
                      {f.apelido ? `${f.apelido} — ${f.nome}` : f.nome}
                    </p>
                    {f.cargo && <p className="text-xs text-content-faint">{f.cargo}</p>}
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setEditandoContrato(f)}>
                    Contrato ({itens.length})
                  </Button>
                </div>
                {itens.length === 0 ? (
                  <p className="text-sm text-content-faint">
                    Sem contrato de resultados. Clique em Contrato para montar.
                  </p>
                ) : (
                  <div className="divide-y divide-border-subtle">
                    {itens.map((item) => (
                      <ItemAvaliacao
                        key={`${item.id}:${semana}`}
                        item={item}
                        avaliacao={avalMap.get(item.id)}
                        onSave={(nota, nsa) => salvarNota(item, nota, nsa)}
                        salvando={saveAvaliacao.isPending}
                      />
                    ))}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

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
