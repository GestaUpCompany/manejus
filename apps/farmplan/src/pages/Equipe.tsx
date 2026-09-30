import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth, useFazenda } from '@gestaup/shared'
import { Card, PageSkeleton, EmptyState } from '@gestaup/ui'
import { usePlanoAtivo, useFuncionariosFp, useEquipesFp } from '../services/farmplanService'
import { useSetores } from '../services/cadastrosService'
import { useContratoItens, useAvaliacoesAno, escorePorSemana } from '../services/equipeService'
import type { FuncionarioFp } from '../types/farmplan'

const PAPEL_LABEL: Record<string, string> = {
  colaborador: 'Colaborador',
  lider: 'Líder',
  gestor: 'Gestor',
}

function CardPessoa({ f, onClick }: { f: FuncionarioFp; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-surface-1 border border-border-base rounded-lg px-4 py-3 hover:border-primary/50 transition-colors"
    >
      <p className="font-semibold text-content-strong text-sm">
        {f.apelido || f.nome}
        {f.apelido && <span className="text-xs text-content-faint font-normal"> · {f.nome}</span>}
      </p>
      <p className="text-xs text-content-muted">
        {[f.cargo, PAPEL_LABEL[f.farmplan_papel]].filter(Boolean).join(' · ')}
      </p>
    </button>
  )
}

function NoOrganograma({
  f,
  subordinados,
  nivel,
}: {
  f: FuncionarioFp
  subordinados: Map<string | null, FuncionarioFp[]>
  nivel: number
}) {
  const filhos = subordinados.get(f.id) ?? []
  return (
    <div className={nivel > 0 ? 'ml-6 border-l-2 border-border-base pl-4 mt-2' : ''}>
      <Link to={`/equipe/${f.id}`}>
        <CardPessoa f={f} />
      </Link>
      {filhos.map((filho) => (
        <NoOrganograma key={filho.id} f={filho} subordinados={subordinados} nivel={nivel + 1} />
      ))}
    </div>
  )
}

function FichaPessoa({ f }: { f: FuncionarioFp }) {
  const { user } = useAuth()
  const { data: fazenda } = useFazenda(user?.id)
  const { data: plano } = usePlanoAtivo(fazenda?.id)
  const { data: contrato } = useContratoItens(f.id)
  const { data: avaliacoes } = useAvaliacoesAno(fazenda?.id, plano?.ano)
  const { data: setores } = useSetores(fazenda?.id)
  const { data: equipes } = useEquipesFp(fazenda?.id)

  const escores = useMemo(
    () => escorePorSemana((avaliacoes ?? []).filter((a) => a.funcionario_id === f.id)),
    [avaliacoes, f.id],
  )
  const setor = setores?.find((s) => s.id === f.setor_id)
  const minhasEquipes = (equipes ?? []).filter((e) => e.membros.includes(f.id))
  const mediaGeral = useMemo(() => {
    const vals = [...escores.values()]
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }, [escores])

  const tarefas = (contrato ?? []).filter((c) => c.tipo === 'tarefa' && c.ativo)
  const comportamentos = (contrato ?? []).filter((c) => c.tipo === 'comportamento' && c.ativo)

  return (
    <div className="space-y-4">
      <Card className="p-5" disableHover>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold text-content-strong">
              {f.apelido ? `${f.apelido} — ${f.nome}` : f.nome}
            </h2>
            <p className="text-sm text-content-muted mt-1">
              {[f.cargo, setor?.nome, PAPEL_LABEL[f.farmplan_papel]].filter(Boolean).join(' · ')}
            </p>
            {minhasEquipes.length > 0 && (
              <p className="text-xs text-content-faint mt-1">
                Equipes: {minhasEquipes.map((e) => e.nome).join(', ')}
              </p>
            )}
          </div>
          {mediaGeral !== null && (
            <div className="text-right">
              <p className="text-xs text-content-faint uppercase">Escore médio</p>
              <p className="text-3xl font-bold text-primary dark:text-green-400">
                {mediaGeral.toFixed(1)}
              </p>
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4" disableHover>
          <h3 className="font-semibold text-content-strong mb-2">Contrato de resultados</h3>
          {!contrato?.filter((c) => c.ativo).length ? (
            <p className="text-sm text-content-faint">Sem itens de contrato.</p>
          ) : (
            <>
              {tarefas.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-content-faint uppercase mt-2 mb-1">Tarefas</p>
                  <ul className="space-y-1">
                    {tarefas.map((c) => (
                      <li key={c.id} className="text-sm text-content flex gap-2">
                        <span className="text-content-faint">•</span>{c.descricao}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {comportamentos.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-content-faint uppercase mt-3 mb-1">Comportamentos</p>
                  <ul className="space-y-1">
                    {comportamentos.map((c) => (
                      <li key={c.id} className="text-sm text-content flex gap-2">
                        <span className="text-content-faint">•</span>{c.descricao}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </Card>

        <Card className="p-4" disableHover>
          <h3 className="font-semibold text-content-strong mb-2">Escore por semana</h3>
          {escores.size === 0 ? (
            <p className="text-sm text-content-faint">Nenhuma avaliação registrada.</p>
          ) : (
            <div className="flex items-end gap-1 h-24">
              {Array.from({ length: plano?.semanaAtual ?? 1 }, (_, i) => i + 1).map((sem) => {
                const v = escores.get(sem)
                return (
                  <div
                    key={sem}
                    title={`Semana ${sem}: ${v !== undefined ? v.toFixed(1) : 'sem avaliação'}`}
                    className={`flex-1 rounded-sm ${v === undefined ? 'bg-surface-3/50' : v >= 7 ? 'bg-green-500' : v >= 5 ? 'bg-amber-400' : 'bg-red-500'}`}
                    style={{ height: v !== undefined ? `${Math.max(8, v * 10)}%` : '6%' }}
                  />
                )
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

export function Equipe() {
  const { id } = useParams()
  const { user } = useAuth()
  const { data: fazenda } = useFazenda(user?.id)
  const { data: funcionarios, isLoading } = useFuncionariosFp(fazenda?.id)

  const pessoa = funcionarios?.find((f) => f.id === id)

  const raizes = useMemo(() => {
    const porSuperior = new Map<string | null, FuncionarioFp[]>()
    for (const f of funcionarios ?? []) {
      const sup = f.superior_id && funcionarios?.some((x) => x.id === f.superior_id)
        ? f.superior_id
        : null
      const arr = porSuperior.get(sup) ?? []
      arr.push(f)
      porSuperior.set(sup, arr)
    }
    return porSuperior
  }, [funcionarios])

  if (isLoading) return <PageSkeleton />

  if (id) {
    if (!pessoa) return <EmptyState title="Pessoa não encontrada" />
    return (
      <div className="space-y-4">
        <Link to="/equipe" className="text-sm text-primary hover:underline">
          ← Voltar para equipe
        </Link>
        <FichaPessoa f={pessoa} />
      </div>
    )
  }

  const topo = raizes.get(null) ?? []

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-content-strong">Equipe</h1>
        <p className="text-content-muted mt-1">
          Organograma por superior direto. Clique numa pessoa para ver a ficha.
        </p>
      </div>
      {!funcionarios?.length ? (
        <EmptyState title="Nenhuma pessoa" description="Cadastre pessoas em Cadastros > Pessoas." />
      ) : (
        <div className="space-y-2 max-w-xl">
          {topo.map((f) => (
            <NoOrganograma key={f.id} f={f} subordinados={raizes} nivel={0} />
          ))}
        </div>
      )}
    </div>
  )
}
