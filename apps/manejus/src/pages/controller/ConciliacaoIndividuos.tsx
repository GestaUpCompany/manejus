import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, getFazendaIdForUser, useLotes } from '@gestaup/shared'
import { Button, Card, CardSkeleton, EmptyState, ErrorState, Select, useToast } from '@gestaup/ui'
import {
  useConciliacaoLotes,
  useDefinirModoIdentificacao,
  useIndividuosSemCategoria,
  useModosIdentificacao,
  type ModoIdentificacao,
} from '../../hooks/useConciliacaoIdentificacao'
import {
  filtrarConciliacao,
  resumirConciliacao,
  situacaoConciliacao,
  type FiltroConciliacao,
  type SituacaoConciliacao,
} from '../../utils/conciliacaoIdentificacao'

const SITUACAO: Record<SituacaoConciliacao, { rotulo: string; classe: string; dica: string }> = {
  divergente: {
    rotulo: 'Divergência',
    classe: 'bg-red-500/10 text-red-800 dark:text-red-200',
    dica: 'Há mais animais identificados e confirmados neste lote do que cabeças contadas. Ajuste o agregado ou o cadastro dos animais.',
  },
  incerta: {
    rotulo: 'Localização incerta',
    classe: 'bg-amber-500/10 text-amber-800 dark:text-amber-200',
    dica: 'Parte dos identificados pode já ter saído do lote por movimentação por contagem. Confirme a localização na ficha de cada animal.',
  },
  ok: {
    rotulo: 'Conciliado',
    classe: 'bg-green-500/10 text-green-800 dark:text-green-200',
    dica: 'Os identificados cabem no agregado do lote.',
  },
}

const FILTROS: { valor: FiltroConciliacao; rotulo: string }[] = [
  { valor: 'todos', rotulo: 'Todos' },
  { valor: 'divergentes', rotulo: 'Divergências' },
  { valor: 'incertos', rotulo: 'Com localização incerta' },
]

function Resumo({ titulo, valor, destaque }: { titulo: string; valor: number; destaque?: 'vermelho' | 'ambar' }) {
  const cor =
    destaque && valor > 0
      ? destaque === 'vermelho'
        ? 'text-red-700 dark:text-red-300'
        : 'text-amber-700 dark:text-amber-300'
      : 'text-content-strong'
  return (
    <Card className="p-4">
      <p className="text-sm text-content-muted">{titulo}</p>
      <p className={`text-2xl font-bold mt-1 ${cor}`}>{valor.toLocaleString('pt-BR')}</p>
    </Card>
  )
}

const MODOS: { value: ModoIdentificacao; label: string }[] = [
  { value: 'agregado', label: 'Agregado (só contagem)' },
  { value: 'parcial', label: 'Parcial (alguns identificados)' },
  { value: 'individual', label: 'Individual (todos identificados)' },
]

export function ConciliacaoIndividuos() {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [fazendaId, setFazendaId] = useState<string | undefined>(undefined)
  const [semFazenda, setSemFazenda] = useState(false)
  const [filtro, setFiltro] = useState<FiltroConciliacao>('todos')

  useEffect(() => {
    if (!user) return
    let ativo = true
    getFazendaIdForUser(user.id).then((id) => {
      if (!ativo) return
      if (id) setFazendaId(id)
      else setSemFazenda(true)
    })
    return () => {
      ativo = false
    }
  }, [user])

  const conciliacao = useConciliacaoLotes(fazendaId)
  const semCategoria = useIndividuosSemCategoria(fazendaId)
  const { data: lotes = [] } = useLotes(fazendaId)
  const modos = useModosIdentificacao(fazendaId)
  const definirModo = useDefinirModoIdentificacao(fazendaId)
  const nomeLote = useMemo(() => new Map(lotes.map((l) => [l.id, l.nome])), [lotes])

  const linhas = useMemo(() => conciliacao.data ?? [], [conciliacao.data])
  const resumo = useMemo(() => resumirConciliacao(linhas), [linhas])
  const visiveis = useMemo(() => filtrarConciliacao(linhas, filtro), [linhas, filtro])
  // Lotes que já têm identificados ou um modo diferente de 'agregado'
  const lotesComIdentificados = useMemo(() => new Set(linhas.map((l) => l.lote_id)), [linhas])
  const lotesModo = useMemo(
    () => (modos.data ?? []).filter((l) => l.modo_identificacao !== 'agregado' || lotesComIdentificados.has(l.id)),
    [modos.data, lotesComIdentificados]
  )

  const alterarModo = async (loteId: string, modo: string) => {
    try {
      await definirModo.mutateAsync({ loteId, modo: modo as ModoIdentificacao })
      toast.success('Modo de identificação atualizado.')
    } catch (error) {
      toast.error((error as Error).message || 'Não foi possível definir o modo.')
    }
  }

  if (semFazenda) {
    return <EmptyState title="Selecione uma fazenda" description="A conciliação é feita por fazenda." />
  }
  if (conciliacao.isError) {
    return <ErrorState message="Erro ao carregar a conciliação" detail={String(conciliacao.error)} onRetry={() => conciliacao.refetch()} />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-content-strong">Conciliação de indivíduos</h2>
          <p className="text-sm text-content-muted mt-1 max-w-2xl">
            O agregado do lote (quantas cabeças) é a verdade da contagem. Os animais identificados são um subconjunto dele:
            esta tela mostra onde os dois não fecham.
          </p>
        </div>
        <Button variant="secondary" onClick={() => navigate('/controller/individuos')} className="h-10">
          ← Indivíduos
        </Button>
      </div>

      {conciliacao.isLoading ? (
        <CardSkeleton />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Resumo titulo="Categorias com identificados" valor={resumo.categoriasComIdentificados} />
            <Resumo titulo="Animais identificados" valor={resumo.identificados} />
            <Resumo titulo="Divergências" valor={resumo.divergentes} destaque="vermelho" />
            <Resumo titulo="Com localização incerta" valor={resumo.incertos} destaque="ambar" />
          </div>

          <div className="flex flex-wrap gap-2">
            {FILTROS.map((f) => (
              <button
                key={f.valor}
                onClick={() => setFiltro(f.valor)}
                className={`h-10 px-3 rounded-lg text-sm font-medium transition-colors ${
                  filtro === f.valor
                    ? 'bg-accent/10 text-content-strong border border-accent/40'
                    : 'bg-surface-1 border border-border-base text-content hover:bg-surface-2'
                }`}
              >
                {f.rotulo}
              </button>
            ))}
          </div>

          {visiveis.length === 0 ? (
            <EmptyState
              title={filtro === 'todos' ? 'Nenhum animal identificado em lotes' : 'Nada neste filtro'}
              description={filtro === 'todos' ? 'Cadastre indivíduos com lote para acompanhá-los aqui.' : 'Nenhum lote com essa situação.'}
            />
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-surface-2 text-content-muted">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Lote</th>
                      <th className="px-4 py-3 text-left font-medium">Categoria</th>
                      <th className="px-4 py-3 text-right font-medium" title="Cabeças contadas pelo lote (agregado)">No lote</th>
                      <th className="px-4 py-3 text-right font-medium">Identificados</th>
                      <th className="px-4 py-3 text-right font-medium" title="Identificados com localização confirmada">Confirmados</th>
                      <th className="px-4 py-3 text-right font-medium">Incertos</th>
                      <th className="px-4 py-3 text-right font-medium" title="Cabeças do lote sem indivíduo cadastrado">Sem identificação</th>
                      <th className="px-4 py-3 text-left font-medium">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-base">
                    {visiveis.map((l) => {
                      const s = SITUACAO[situacaoConciliacao(l)]
                      return (
                        <tr key={l.lote_categoria_id} className="text-content">
                          <td className="px-4 py-3 font-medium text-content-strong">{l.lote_nome}</td>
                          <td className="px-4 py-3 capitalize">{l.categoria}</td>
                          <td className="px-4 py-3 text-right">{l.quant_atual.toLocaleString('pt-BR')}</td>
                          <td className="px-4 py-3 text-right">{l.identificados.toLocaleString('pt-BR')}</td>
                          <td className="px-4 py-3 text-right">{l.confirmados.toLocaleString('pt-BR')}</td>
                          <td className="px-4 py-3 text-right">{l.incertos.toLocaleString('pt-BR')}</td>
                          <td className="px-4 py-3 text-right">{l.nao_identificados.toLocaleString('pt-BR')}</td>
                          <td className="px-4 py-3">
                            <span title={s.dica} className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${s.classe}`}>
                              {s.rotulo}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {lotesModo.length > 0 && (
        <Card className="p-4 space-y-3">
          <div>
            <h3 className="text-lg font-semibold text-content-strong">Modo de identificação dos lotes</h3>
            <p className="text-sm text-content-muted">
              Um lote só pode ser <strong>individual</strong> quando todos os animais de cada categoria estão identificados e com a
              localização confirmada. O modo é um registro de intenção: a contagem continua sendo a do lote.
            </p>
          </div>
          <ul className="divide-y divide-border-base">
            {lotesModo.map((l) => (
              <li key={l.id} className="py-2 flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm font-medium text-content-strong">{l.nome}</span>
                <div className="w-full sm:w-72">
                  <Select
                    label=""
                    value={l.modo_identificacao}
                    onChange={(valor) => alterarModo(l.id, valor)}
                    options={MODOS}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {(semCategoria.data?.length ?? 0) > 0 && (
        <Card className="p-4 space-y-3">
          <div>
            <h3 className="text-lg font-semibold text-content-strong">Animais em lote sem a categoria deles</h3>
            <p className="text-sm text-content-muted">
              O lote do animal não tem a categoria dele ativa, então ele não entra na contagem de nenhuma linha acima. Corrija a
              categoria ou o lote na ficha.
            </p>
          </div>
          <ul className="divide-y divide-border-base">
            {semCategoria.data!.map((i) => (
              <li key={i.individuo_id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-content">
                  <strong className="text-content-strong">{i.identificacao}</strong> · {i.categoria} · {nomeLote.get(i.lote_id) ?? 'Lote'}
                </span>
                <span className="text-content-muted">{i.motivo}</span>
                <Button size="sm" variant="secondary" onClick={() => navigate(`/controller/individuos/${i.individuo_id}`)}>
                  Abrir
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

export default ConciliacaoIndividuos
