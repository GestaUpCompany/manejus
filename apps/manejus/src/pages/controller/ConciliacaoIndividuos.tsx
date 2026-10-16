import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, getFazendaIdForUser, useLotes } from '@gestaup/shared'
import { Button, Card, CardSkeleton, EmptyState, ErrorState, useToast } from '@gestaup/ui'
import { formatDate } from '@gestaup/shared'
import {
  useConciliacaoLotes,
  useIndividuosSemCategoria,
  usePendenciasSemAnimal,
} from '../../hooks/useConciliacaoIdentificacao'
import { useConfirmarDesignacoes, useDescartarDesignacoes, useDesignacoesLote } from '../../hooks/useDesignacoesLote'
import { agruparDesignacoes, type GrupoDesignacao } from '../../utils/designacoesLote'
import {
  filtrarConciliacao,
  qualificacaoPorLote,
  resumirConciliacao,
  resumirQualificacao,
  situacaoConciliacao,
  type FiltroConciliacao,
  type NivelQualificacao,
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

const NIVEL: Record<NivelQualificacao, { rotulo: string; classe: string }> = {
  agregado: { rotulo: 'Só contagem', classe: 'bg-surface-2 text-content-muted' },
  parcial: { rotulo: 'Parcial', classe: 'bg-blue-500/10 text-blue-800 dark:text-blue-200' },
  completo: { rotulo: 'Completo', classe: 'bg-green-500/10 text-green-800 dark:text-green-200' },
}

const percentual = (fracao: number) => `${Math.round(fracao * 100)}%`

export function ConciliacaoIndividuos() {
  const { user } = useAuth()
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
  const nomeLote = useMemo(() => new Map(lotes.map((l) => [l.id, l.nome])), [lotes])

  const linhas = useMemo(() => conciliacao.data ?? [], [conciliacao.data])
  const resumo = useMemo(() => resumirConciliacao(linhas), [linhas])
  const visiveis = useMemo(() => filtrarConciliacao(linhas, filtro), [linhas, filtro])
  // O nível de cada lote é calculado pelos identificados confirmados; lotes sem cabeças nem identificados não entram
  const qualificacao = useMemo(
    () => qualificacaoPorLote(linhas).filter((l) => l.cabecas > 0 || l.identificados > 0),
    [linhas]
  )
  const resumoQualificacao = useMemo(() => resumirQualificacao(qualificacao), [qualificacao])
  const lotesQualificados = useMemo(
    () =>
      qualificacao
        .filter((l) => l.nivel !== 'agregado')
        .sort(
          (a, b) =>
            b.qualificadas / Math.max(b.cabecas, 1) - a.qualificadas / Math.max(a.cabecas, 1) ||
            a.lote_nome.localeCompare(b.lote_nome, 'pt-BR')
        ),
    [qualificacao]
  )
  const pendencias = usePendenciasSemAnimal(fazendaId, linhas)
  const toast = useToast()
  const designacoes = useDesignacoesLote(fazendaId)
  const confirmarDesignacoes = useConfirmarDesignacoes(fazendaId)
  const descartarDesignacoes = useDescartarDesignacoes(fazendaId)
  const gruposDesignacao = useMemo(() => agruparDesignacoes(designacoes.data ?? []), [designacoes.data])
  const ocupadoDesignacao = confirmarDesignacoes.isPending || descartarDesignacoes.isPending

  const confirmarGrupo = async (g: GrupoDesignacao) => {
    const n = g.pendencias.length
    const ok = window.confirm(
      `Confirmar a mudança de ${n} animal(is) (${g.categoria}) de "${g.lote_origem_nome}" para "${g.lote_destino_nome}"?

` +
        'Isso registra uma movimentação de apartação e altera a contagem dos dois lotes.'
    )
    if (!ok) return
    try {
      const movimentados = await confirmarDesignacoes.mutateAsync(g.pendencias.map((p) => p.id))
      toast.success(`${movimentados} animal(is) movido(s) para ${g.lote_destino_nome}.`)
    } catch (error) {
      toast.error((error as Error).message || 'Não foi possível confirmar a designação.')
    }
  }

  const descartarGrupo = async (g: GrupoDesignacao) => {
    const n = g.pendencias.length
    if (!window.confirm(`Descartar ${n} designação(ões) para "${g.lote_destino_nome}"? Nenhum lote nem contagem será alterado.`)) return
    try {
      const descartadas = await descartarDesignacoes.mutateAsync(g.pendencias.map((p) => p.id))
      toast.success(`${descartadas} designação(ões) descartada(s).`)
    } catch (error) {
      toast.error((error as Error).message || 'Não foi possível descartar a designação.')
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
          <Card className="p-4">
            <p className="text-sm text-content-muted">Qualificação da fazenda</p>
            <p className="text-2xl font-bold mt-1 text-content-strong">
              {resumoQualificacao.qualificadas.toLocaleString('pt-BR')} de {resumoQualificacao.cabecas.toLocaleString('pt-BR')} cabeças
              identificadas ({percentual(resumoQualificacao.fracao)})
            </p>
            <p className="text-sm text-content-muted mt-1">
              {resumoQualificacao.lotesPorNivel.completo} lote(s) completo(s), {resumoQualificacao.lotesPorNivel.parcial} parcial(is) e{' '}
              {resumoQualificacao.lotesPorNivel.agregado} só com contagem. A contagem do lote continua sendo a do agregado; a
              identificação é uma camada que se acrescenta aos poucos.
            </p>
          </Card>

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

      {lotesQualificados.length > 0 && (
        <Card className="p-4 space-y-3">
          <div>
            <h3 className="text-lg font-semibold text-content-strong">Qualificação dos lotes</h3>
            <p className="text-sm text-content-muted">
              O nível é calculado: <strong>completo</strong> quando toda categoria com cabeças tem os animais identificados e com
              localização confirmada; <strong>parcial</strong> quando só parte deles está. Lotes sem nenhum identificado seguem só com a
              contagem e não aparecem aqui.
            </p>
          </div>
          <ul className="divide-y divide-border-base">
            {lotesQualificados.map((l) => (
              <li key={l.lote_id} className="py-2 flex flex-wrap items-center justify-between gap-3 text-sm">
                <span className="font-medium text-content-strong">{l.lote_nome}</span>
                <span className="text-content">
                  {l.qualificadas.toLocaleString('pt-BR')} de {l.cabecas.toLocaleString('pt-BR')} (
                  {percentual(l.cabecas > 0 ? l.qualificadas / l.cabecas : 0)})
                </span>
                <span className="flex flex-wrap gap-2">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${NIVEL[l.nivel].classe}`}>
                    {NIVEL[l.nivel].rotulo}
                  </span>
                  {l.incertos > 0 && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-800 dark:text-amber-200">
                      {l.incertos} com localização incerta
                    </span>
                  )}
                  {l.divergente && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-800 dark:text-red-200">
                      Divergência
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {gruposDesignacao.length > 0 && (
        <Card className="p-4 space-y-3">
          <div>
            <h3 className="text-lg font-semibold text-content-strong">Designações de lote do manejo de curral</h3>
            <p className="text-sm text-content-muted">
              O peão escolheu o lote de destino destes animais no curral. Nada mudou ainda: ao confirmar, é registrada uma
              movimentação de apartação (que altera a contagem dos lotes) com os animais ligados a ela.
            </p>
          </div>
          <ul className="divide-y divide-border-base">
            {gruposDesignacao.map((g) => (
              <li key={g.chave} className="py-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-content">
                    <strong className="text-content-strong">{g.pendencias.length}</strong> {g.categoria} ·{' '}
                    {g.lote_origem_nome} → <strong className="text-content-strong">{g.lote_destino_nome}</strong>
                  </span>
                  <span className="flex gap-2">
                    <Button size="sm" disabled={ocupadoDesignacao} onClick={() => confirmarGrupo(g)}>
                      Confirmar mudança
                    </Button>
                    <Button size="sm" variant="secondary" disabled={ocupadoDesignacao} onClick={() => descartarGrupo(g)}>
                      Descartar
                    </Button>
                  </span>
                </div>
                <p className="text-xs text-content-muted">
                  {g.pendencias.map((p) => p.identificacao).join(', ')}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {((pendencias.data?.mortes.length ?? 0) > 0 || (pendencias.data?.apartacoes.length ?? 0) > 0) && (
        <Card className="p-4 space-y-3">
          <div>
            <h3 className="text-lg font-semibold text-content-strong">Informar quais animais</h3>
            <p className="text-sm text-content-muted">
              Eventos dos últimos 90 dias, em lotes com animais identificados, que ainda não dizem quais animais foram. É uma
              sugestão: a contagem do lote já foi atualizada e nada aqui bloqueia a operação.
            </p>
          </div>
          <ul className="divide-y divide-border-base">
            {pendencias.data!.mortes.map((m) => (
              <li key={m.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-content">
                  <strong className="text-content-strong">Morte</strong> · {formatDate(m.data)} ·{' '}
                  {m.lote ?? nomeLote.get(m.lote_id ?? '') ?? 'Lote'} · {m.categoria}
                </span>
                <Button size="sm" variant="secondary" onClick={() => navigate(`/controller/cadernetas/morte/${m.id}`)}>
                  Informar animal
                </Button>
              </li>
            ))}
            {pendencias.data!.apartacoes.map((a) => (
              <li key={a.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-content">
                  <strong className="text-content-strong">Apartação</strong> · {formatDate(a.data)} ·{' '}
                  {nomeLote.get(a.lote_origem_id ?? '') ?? 'Origem'} → {nomeLote.get(a.lote_destino_id ?? '') ?? 'Destino'} ·{' '}
                  {a.numero_cabecas} {a.categoria}
                </span>
                <Button size="sm" variant="secondary" onClick={() => navigate(`/controller/cadernetas/movimentacao/${a.id}`)}>
                  Informar animais
                </Button>
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
