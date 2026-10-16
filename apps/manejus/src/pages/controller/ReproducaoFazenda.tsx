import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, getFazendaIdForUser, getFazendaNome, exportToXLSX, formatDate, toFarmDateOnly, useLotes } from '@gestaup/shared'
import { Button, Card, EmptyState, PageSkeleton } from '@gestaup/ui'
import { useStatusReprodutivoDaFazenda } from '../../hooks/useReproducao'
import { REPRODUCAO_EXPORT_CONFIG } from '../../utils/exportConfigs'
import {
  CLASSE_STATUS_REPRODUTIVO,
  ORDEM_PENDENCIA,
  ROTULO_PENDENCIA,
  pendenciasDaFazenda,
  resumirReproducaoDaFazenda,
  type StatusFemeaFazenda,
  type StatusReprodutivo,
} from '../../utils/reproducao'

const STATUS: StatusReprodutivo[] = ['Prenha', 'Coberta', 'Vazia', 'Parida', 'Sem registro']
const rotuloFemea = (f: StatusFemeaFazenda) => f.id_brinco || f.id_manejo || f.id_chip || 'Sem identificação'
const num = (n: number | null) => (n == null ? '-' : n.toLocaleString('pt-BR'))

export function ReproducaoFazenda() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [fazendaId, setFazendaId] = useState<string | undefined>(undefined)
  const [fazendaNome, setFazendaNome] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const { data: lotes = [] } = useLotes(fazendaId)
  const femeas = useStatusReprodutivoDaFazenda(fazendaId)

  useEffect(() => {
    if (!user) return
    getFazendaIdForUser(user.id)
      .then((id) => {
        setFazendaId(id ?? undefined)
        if (id) getFazendaNome(id).then(setFazendaNome)
      })
      .finally(() => setCarregando(false))
  }, [user])

  const hoje = toFarmDateOnly(new Date().toISOString()) ?? new Date().toISOString().slice(0, 10)
  const nomeLote = useMemo(() => new Map(lotes.map((l) => [l.id, l.nome])), [lotes])
  const lista = useMemo(() => femeas.data ?? [], [femeas.data])
  const pendencias = useMemo(() => pendenciasDaFazenda(lista, hoje), [lista, hoje])
  const resumo = useMemo(() => resumirReproducaoDaFazenda(lista), [lista])

  const exportar = () =>
    exportToXLSX(
      lista.map((f) => ({ ...f, lote_nome: nomeLote.get(f.lote_atual ?? '') ?? '' })),
      REPRODUCAO_EXPORT_CONFIG,
      fazendaNome
    )

  if (carregando || femeas.isLoading) return <PageSkeleton variant="list" />

  return (
    <div className="space-y-6 min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-content-strong">Reprodução</h2>
          <p className="text-sm text-content-muted mt-1 max-w-2xl">
            Pendências e visão geral das fêmeas identificadas. O status é calculado a partir dos partos da Maternidade e dos eventos
            reprodutivos lançados nas fichas.
          </p>
        </div>
        <span className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate('/controller/estacoes-monta')}>
            Estações de Monta
          </Button>
          <Button variant="secondary" onClick={exportar} disabled={lista.length === 0}>
            Exportar Excel
          </Button>
        </span>
      </div>

      {femeas.isError ? (
        <EmptyState title="Não foi possível carregar a reprodução" description={String(femeas.error)} />
      ) : lista.length === 0 ? (
        <EmptyState title="Nenhuma fêmea identificada" description="Cadastre as fêmeas como indivíduos para acompanhar a reprodução." />
      ) : (
        <>
          <Card className="p-4 space-y-4" disableHover>
            <h3 className="text-lg font-semibold text-content-strong">Visão geral ({resumo.totalFemeas} fêmeas)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {STATUS.map((s) => (
                <div key={s} className="rounded-xl bg-surface-2 p-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${CLASSE_STATUS_REPRODUTIVO[s]}`}>{s}</span>
                  <p className="text-2xl font-bold text-content-strong mt-1">{resumo.porStatus[s]}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-content">
              <p>
                <strong className="text-content-strong">Intervalo médio entre partos:</strong>{' '}
                {resumo.intervaloMedioEntrePartosDias != null ? `${num(resumo.intervaloMedioEntrePartosDias)} dias (${resumo.femeasComIntervalo} fêmea(s) com 2 ou mais partos)` : '-'}
              </p>
              <p>
                <strong className="text-content-strong">Dias em aberto (média):</strong>{' '}
                {resumo.diasEmAbertoMedio != null ? `${num(resumo.diasEmAbertoMedio)} dias desde o último parto (${resumo.femeasEmAberto} fêmea(s) paridas ou vazias)` : '-'}
              </p>
            </div>
          </Card>

          <Card className="p-4 space-y-3" disableHover>
            <h3 className="text-lg font-semibold text-content-strong">Pendências ({pendencias.length})</h3>
            {pendencias.length === 0 ? (
              <p className="text-sm text-content-muted">Nenhuma pendência reprodutiva no momento.</p>
            ) : (
              ORDEM_PENDENCIA.map((tipo) => {
                const itens = pendencias.filter((p) => p.tipo === tipo)
                if (itens.length === 0) return null
                return (
                  <div key={tipo}>
                    <h4 className="text-sm font-semibold text-content-strong mb-1">
                      {ROTULO_PENDENCIA[tipo]} ({itens.length})
                    </h4>
                    <ul className="divide-y divide-border-base">
                      {itens.map((p) => (
                        <li key={`${tipo}-${p.femea.individuo_id}`} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span className="text-content">
                            <strong className="text-content-strong">{rotuloFemea(p.femea)}</strong> · {nomeLote.get(p.femea.lote_atual ?? '') ?? 'Sem lote'} · {p.texto}
                            {p.femea.previsao_parto ? ` (previsão ${formatDate(p.femea.previsao_parto)})` : ''}
                          </span>
                          <Button size="sm" variant="secondary" onClick={() => navigate(`/controller/individuos/${p.femea.individuo_id}?aba=reproducao`)}>
                            Abrir ficha
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })
            )}
          </Card>
        </>
      )}
    </div>
  )
}
