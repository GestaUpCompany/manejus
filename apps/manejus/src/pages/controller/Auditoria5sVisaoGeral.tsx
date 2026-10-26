import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button, Card } from '@gestaup/ui'
import { exportToXLSX, formatDate } from '@gestaup/shared'
import { RANKING_SETORES_5S_EXPORT_CONFIG } from '../../utils/exportConfigs'
import { porPilar, resumoGeral, rankingItens, notaMedia } from '../../features/relatorioAuditoria5s/agregacao'
import {
  LIMIAR_AUDITORIA_ANTIGA_DIAS,
  linhasDosSetores,
  matrizSetorPilar,
  ordenarLinhas,
  serieMultiSetor,
  setoresPadraoComparacao,
  setoresPorItem,
  type CriterioOrdem,
  type LinhaSetorDetalhada,
  type MetricaComparacao,
} from '../../features/relatorioAuditoria5s/porSetor'
import type { PendenciaAbertaDoSetor } from '../../features/pendencias5s/calculo'
import {
  COR_NOTA,
  COR_OK,
  COR_NEUTRA,
  LABEL,
  SELECT,
  SETA_TENDENCIA,
  corDaSerie,
  corNota,
  corPercentual,
  corTendencia,
  rotuloPeriodo,
  textoDelta,
  textoDiasDesde,
  textoNota,
  textoPercentual,
} from '../../features/relatorioAuditoria5s/apresentacao'
import type { RegistroAuditoria5sRow, SetorCadastrado } from '../../hooks/useAuditorias5s'
import { Auditoria5sCartaoSetor } from './Auditoria5sCartaoSetor'
import { Auditoria5sMapaCalor } from './Auditoria5sMapaCalor'
import { Auditoria5sPequenosMultiplos } from './Auditoria5sPequenosMultiplos'

interface Props {
  /** Auditorias do período e responsável selecionados. */
  registros: RegistroAuditoria5sRow[]
  setores: SetorCadastrado[]
  /** Pendências abertas AGORA (histórico inteiro, não dependem do período). */
  pendenciasAbertas: PendenciaAbertaDoSetor[]
  fazendaNome: string | null
  onAbrirSetor: (chave: string) => void
  onVerPendencias: (chave?: string) => void
}

function Kpi({ titulo, valor, cor, detalhe }: { titulo: string; valor: string; cor?: string; detalhe?: string }) {
  return (
    <Card className="bg-surface-1 p-4" disableHover>
      <p className="text-xs font-medium text-content-muted uppercase tracking-wider">{titulo}</p>
      <p className="mt-1 text-2xl font-bold text-content-strong" style={cor ? { color: cor } : undefined}>
        {valor}
      </p>
      {detalhe && <p className="text-xs text-content-muted">{detalhe}</p>}
    </Card>
  )
}

type ColunaRanking = 'nome' | 'auditorias' | 'notaMedia' | 'ultimaNota' | 'delta' | 'percentual' | 'naoConformes' | 'pendenciasAbertas' | 'diasDesdeUltima'

const COLUNAS_RANKING: { chave: ColunaRanking; titulo: string }[] = [
  { chave: 'nome', titulo: 'Setor' },
  { chave: 'auditorias', titulo: 'Auditorias' },
  { chave: 'notaMedia', titulo: 'Nota média' },
  { chave: 'ultimaNota', titulo: 'Última nota' },
  { chave: 'delta', titulo: 'Tendência' },
  { chave: 'percentual', titulo: 'Conformidade' },
  { chave: 'naoConformes', titulo: 'Itens N' },
  { chave: 'pendenciasAbertas', titulo: 'Pendências' },
  { chave: 'diasDesdeUltima', titulo: 'Última auditoria' },
]

export function Auditoria5sVisaoGeral({ registros, setores, pendenciasAbertas, fazendaNome, onAbrirSetor, onVerPendencias }: Props) {
  const agora = useMemo(() => new Date().toISOString(), [])
  const [ordem, setOrdem] = useState<CriterioOrdem>('pior-nota')
  const [metrica, setMetrica] = useState<MetricaComparacao>('nota')
  const [agrupamento, setAgrupamento] = useState<'semana' | 'mes'>('mes')
  const [selecionados, setSelecionados] = useState<string[] | null>(null)
  const [ordenacao, setOrdenacao] = useState<{ coluna: ColunaRanking; asc: boolean }>({ coluna: 'notaMedia', asc: true })

  const pendenciasPorChave = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of pendenciasAbertas) m.set(p.setorChave, (m.get(p.setorChave) ?? 0) + 1)
    return m
  }, [pendenciasAbertas])

  const linhas = useMemo(() => linhasDosSetores(registros, agora, { pendenciasPorChave, cadastrados: setores }), [registros, agora, pendenciasPorChave, setores])
  const linhasOrdenadas = useMemo(() => ordenarLinhas(linhas, ordem), [linhas, ordem])
  const comAuditoria = useMemo(() => linhas.filter((l) => !l.semAuditoria), [linhas])
  const resumo = useMemo(() => resumoGeral(registros), [registros])
  const matriz = useMemo(() => matrizSetorPilar(registros), [registros])
  const pilares = useMemo(() => porPilar(registros), [registros])
  const itensCriticos = useMemo(() => rankingItens(registros).slice(0, 10), [registros])
  const setoresAfetados = useMemo(() => setoresPorItem(registros), [registros])
  const antigas = useMemo(
    () => comAuditoria.filter((l) => l.diasDesdeUltima !== null && l.diasDesdeUltima > LIMIAR_AUDITORIA_ANTIGA_DIAS).sort((a, b) => (b.diasDesdeUltima ?? 0) - (a.diasDesdeUltima ?? 0)),
    [comAuditoria]
  )
  const semAuditoria = useMemo(() => linhas.filter((l) => l.semAuditoria), [linhas])

  // Cor estável por setor: posição na lista alfabética de todos os setores com auditoria
  const coresPorChave = useMemo(() => {
    const ordenados = [...comAuditoria].sort((a, b) => a.nome.localeCompare(b.nome))
    return new Map(ordenados.map((l, i) => [l.chave, corDaSerie(i)]))
  }, [comAuditoria])

  const padrao = useMemo(() => setoresPadraoComparacao(comAuditoria), [comAuditoria])
  const ativos = selecionados ?? padrao
  const serie = useMemo(() => serieMultiSetor(registros, agrupamento, metrica), [registros, agrupamento, metrica])
  const nomePorChave = useMemo(() => new Map(serie.setores.map((s) => [s.chave, s.nome])), [serie.setores])

  const alternar = (chave: string) => setSelecionados((atual) => {
    const base = atual ?? padrao
    return base.includes(chave) ? base.filter((c) => c !== chave) : [...base, chave]
  })

  const linhasRanking = useMemo(() => {
    const valor = (l: LinhaSetorDetalhada): number | string | null => {
      switch (ordenacao.coluna) {
        case 'nome': return l.nome.toLowerCase()
        case 'delta': return l.delta
        default: return l[ordenacao.coluna]
      }
    }
    return [...comAuditoria].sort((a, b) => {
      const va = valor(a)
      const vb = valor(b)
      if (va === null && vb === null) return a.nome.localeCompare(b.nome)
      if (va === null) return 1
      if (vb === null) return -1
      const c = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number)
      return (ordenacao.asc ? c : -c) || a.nome.localeCompare(b.nome)
    })
  }, [comAuditoria, ordenacao])

  const ordenarPor = (coluna: ColunaRanking) => setOrdenacao((o) => (o.coluna === coluna ? { coluna, asc: !o.asc } : { coluna, asc: coluna === 'nome' || coluna === 'notaMedia' || coluna === 'ultimaNota' || coluna === 'percentual' }))

  const exportar = () =>
    exportToXLSX(
      linhasRanking.map((l) => ({
        setor: l.nome,
        auditorias: l.auditorias,
        nota_media: l.notaMedia,
        ultima_nota: l.ultimaNota,
        variacao: l.delta,
        conformidade: l.percentual,
        itens_n: l.naoConformes,
        pendencias_abertas: l.pendenciasAbertas,
        ultima_auditoria: l.ultimaData,
      })),
      RANKING_SETORES_5S_EXPORT_CONFIG,
      fazendaNome
    )

  if (registros.length === 0) {
    return (
      <Card className="bg-surface-1 p-4 sm:p-6 text-center" disableHover>
        <p className="text-content-muted">Nenhuma auditoria 5S no período selecionado</p>
      </Card>
    )
  }

  const mediaFazenda = notaMedia(registros)

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4">
        <Kpi titulo="Auditorias" valor={String(resumo.auditorias)} />
        <Kpi titulo="Conformidade média" valor={textoPercentual(resumo.percentual)} cor={corPercentual(resumo.percentual)} />
        <Kpi titulo="Nota média" valor={textoNota(resumo.notaMedia)} cor={corNota(resumo.notaMedia)} />
        <Kpi titulo="Setores auditados" valor={`${comAuditoria.length}${setores.length > 0 ? ` / ${setores.length}` : ''}`} detalhe={setores.length > 0 ? 'de cadastrados' : undefined} />
        <Kpi titulo="Itens não conformes" valor={String(resumo.itensNaoConformes)} />
        <Kpi titulo="Pendências abertas" valor={String(pendenciasAbertas.length)} detalhe="estado atual" cor={pendenciasAbertas.length > 0 ? '#F59E0B' : undefined} />
      </div>

      <Card className="bg-surface-1 p-4 sm:p-6" disableHover>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-base sm:text-lg font-semibold text-content-strong">Setores</h3>
            <p className="text-xs text-content-muted">Clique em um setor para ver a evolução dele.</p>
          </div>
          <div className="w-full sm:w-56">
            <label className={LABEL}>Ordenar por</label>
            <select className={SELECT} value={ordem} onChange={(e) => setOrdem(e.target.value as CriterioOrdem)}>
              <option value="pior-nota">Pior nota primeiro</option>
              <option value="mais-pendencias">Mais pendências</option>
              <option value="mais-antiga">Auditoria mais antiga</option>
              <option value="nome">Nome</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {linhasOrdenadas.map((l) => (
            <Auditoria5sCartaoSetor key={l.chave} linha={l} onAbrir={onAbrirSetor} onVerPendencias={onVerPendencias} />
          ))}
        </div>
      </Card>

      <Card className="bg-surface-1 p-4 sm:p-6" disableHover>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-base sm:text-lg font-semibold text-content-strong">Evolução comparada</h3>
          <div className="flex flex-wrap gap-2">
            <select className="rounded-lg border border-border-base bg-surface-1 px-2 py-1 text-xs text-content-strong" value={metrica} onChange={(e) => setMetrica(e.target.value as MetricaComparacao)} aria-label="Métrica">
              <option value="nota">Nota (0 a 5)</option>
              <option value="percentual">Conformidade (%)</option>
            </select>
            <select className="rounded-lg border border-border-base bg-surface-1 px-2 py-1 text-xs text-content-strong" value={agrupamento} onChange={(e) => setAgrupamento(e.target.value as 'semana' | 'mes')} aria-label="Agrupamento">
              <option value="mes">Por mês</option>
              <option value="semana">Por semana</option>
            </select>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          {[...comAuditoria].sort((a, b) => a.nome.localeCompare(b.nome)).map((l) => {
            const ativo = ativos.includes(l.chave)
            const cor = coresPorChave.get(l.chave) ?? COR_NEUTRA
            return (
              <button
                key={l.chave}
                type="button"
                aria-pressed={ativo}
                onClick={() => alternar(l.chave)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${ativo ? 'border-transparent text-content-strong' : 'border-border-base text-content-muted opacity-70'}`}
                style={ativo ? { backgroundColor: `${cor}22`, borderColor: cor } : undefined}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cor }} />
                {l.nome}
              </button>
            )
          })}
          <span className="mx-1 hidden h-4 w-px bg-border-base sm:inline-block" />
          <button type="button" className="text-xs font-medium text-content-strong underline" onClick={() => setSelecionados(comAuditoria.map((l) => l.chave))}>Todos</button>
          <button type="button" className="text-xs font-medium text-content-strong underline" onClick={() => setSelecionados([])}>Nenhum</button>
          <button type="button" className="text-xs font-medium text-content-strong underline" onClick={() => setSelecionados(null)}>Piores</button>
        </div>

        {serie.pontos.length === 0 ? (
          <p className="py-8 text-center text-sm text-content-muted">{metrica === 'nota' ? 'Nenhuma auditoria com nota no período.' : 'Sem dados no período.'}</p>
        ) : ativos.filter((c) => nomePorChave.has(c)).length === 0 ? (
          <p className="py-8 text-center text-sm text-content-muted">Escolha ao menos um setor acima para ver a evolução.</p>
        ) : (
          <Auditoria5sPequenosMultiplos
            pontos={serie.pontos.map((p) => ({ ...p, rotulo: rotuloPeriodo(p.periodo, agrupamento) }))}
            setores={[...comAuditoria]
              .filter((l) => ativos.includes(l.chave) && nomePorChave.has(l.chave))
              .sort((a, b) => a.nome.localeCompare(b.nome))
              .map((l) => ({ chave: l.chave, nome: nomePorChave.get(l.chave) ?? l.nome, cor: coresPorChave.get(l.chave) ?? COR_NOTA }))}
            metrica={metrica}
            unidade={agrupamento === 'mes' ? 'mês' : 'semana'}
          />
        )}
        <p className="mt-3 text-xs text-content-muted">
          Cada gráfico é um setor, na mesma escala. A linha tracejada cinza é a média da fazenda{mediaFazenda !== null ? ` (${textoNota(mediaFazenda)} no período)` : ''}. Cada ponto é a média das auditorias do setor no {agrupamento === 'mes' ? 'mês' : 'semana'}.
        </p>
      </Card>

      <Card className="bg-surface-1 p-4 sm:p-6" disableHover>
        <h3 className="mb-1 text-base sm:text-lg font-semibold text-content-strong">Mapa de calor: setor × pilar</h3>
        <p className="mb-3 text-xs text-content-muted">Conformidade no período, pior setor primeiro. Mostra qual pilar derruba cada setor.</p>
        <Auditoria5sMapaCalor linhas={matriz} onAbrirSetor={onAbrirSetor} />
      </Card>

      <Card className="bg-surface-1 p-4 sm:p-6 overflow-x-auto" disableHover>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-base sm:text-lg font-semibold text-content-strong">Ranking dos setores</h3>
          <Button onClick={exportar} disabled={linhasRanking.length === 0} className="w-full sm:w-auto text-sm">
            Exportar XLSX
          </Button>
        </div>
        <table className="min-w-full divide-y divide-border-base text-sm">
          <thead>
            <tr className="text-left text-xs font-medium text-content-muted uppercase tracking-wider">
              {COLUNAS_RANKING.map((c) => (
                <th key={c.chave} className="py-2 pr-4" aria-sort={ordenacao.coluna === c.chave ? (ordenacao.asc ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" onClick={() => ordenarPor(c.chave)} className="uppercase tracking-wider hover:text-content-strong">
                    {c.titulo}
                    {ordenacao.coluna === c.chave ? (ordenacao.asc ? ' ▲' : ' ▼') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-base">
            {linhasRanking.map((l) => (
              <tr key={l.chave} onClick={() => onAbrirSetor(l.chave)} className="cursor-pointer hover:bg-surface-2 transition-colors">
                <td className="py-2 pr-4 font-medium text-content-strong">{l.nome}</td>
                <td className="py-2 pr-4 text-content-strong">{l.auditorias}</td>
                <td className="py-2 pr-4 font-semibold" style={{ color: corNota(l.notaMedia) }}>{textoNota(l.notaMedia)}</td>
                <td className="py-2 pr-4 font-semibold" style={{ color: corNota(l.ultimaNota) }}>{textoNota(l.ultimaNota)}</td>
                <td className="py-2 pr-4 font-semibold whitespace-nowrap" style={{ color: corTendencia(l.tendencia) }}>
                  {l.tendencia ? `${SETA_TENDENCIA[l.tendencia]} ${textoDelta(l.delta)}` : '-'}
                </td>
                <td className="py-2 pr-4 font-semibold" style={{ color: corPercentual(l.percentual) }}>{textoPercentual(l.percentual)}</td>
                <td className="py-2 pr-4 text-content-strong">{l.naoConformes}</td>
                <td className="py-2 pr-4 text-content-strong">{l.pendenciasAbertas > 0 ? <span className="font-semibold text-amber-500">{l.pendenciasAbertas}</span> : 0}</td>
                <td className="py-2 text-content-strong whitespace-nowrap">{l.ultimaData ? `${formatDate(l.ultimaData)} · ${textoDiasDesde(l.diasDesdeUltima)}` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(semAuditoria.length > 0 || antigas.length > 0) && (
          <div className="mt-4 space-y-1 text-xs text-content-muted">
            {semAuditoria.length > 0 && (
              <p><span className="font-semibold">Sem auditoria no período:</span> {semAuditoria.map((l) => l.nome).sort((a, b) => a.localeCompare(b)).join(', ')}</p>
            )}
            {antigas.length > 0 && (
              <p><span className="font-semibold text-amber-600">Última auditoria há mais de {LIMIAR_AUDITORIA_ANTIGA_DIAS} dias:</span> {antigas.map((l) => `${l.nome} (${l.diasDesdeUltima} dias)`).join(', ')}</p>
            )}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 items-start gap-4 sm:gap-6">
        <Card className="bg-surface-1 p-4 sm:p-6" disableHover>
          <h3 className="text-base font-semibold text-content-strong mb-3">Conformidade por pilar (fazenda)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pilares.map((p) => ({ ...p, valor: p.percentual ?? 0 }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="titulo" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
                <Tooltip formatter={(v) => [`${v}%`, 'Conformidade']} />
                <Bar dataKey="valor" fill={COR_OK} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="bg-surface-1 p-4 sm:p-6 overflow-x-auto" disableHover>
          <h3 className="text-base font-semibold text-content-strong mb-3">Itens mais não conformes</h3>
          {itensCriticos.length === 0 ? (
            <p className="text-sm text-content-muted">Nenhum item não conforme no período.</p>
          ) : (
            <table className="min-w-full divide-y divide-border-base text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-content-muted uppercase tracking-wider">
                  <th className="py-2 pr-4">Item</th>
                  <th className="py-2 pr-4">Pilar</th>
                  <th className="py-2 pr-4">Não conforme</th>
                  <th className="py-2">Setores</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-base">
                {itensCriticos.map((i) => (
                  <tr key={i.chave}>
                    <td className="py-2 pr-4 text-content-strong">{i.negativa}</td>
                    <td className="py-2 pr-4 text-content-strong">{i.secao}</td>
                    <td className="py-2 pr-4 text-content-strong whitespace-nowrap">{i.naoConformes}/{i.respondidos} ({textoPercentual(i.percentualNaoConforme)})</td>
                    <td className="py-2 text-content-strong">{setoresAfetados.get(i.chave) ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  )
}
