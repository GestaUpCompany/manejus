import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card } from '@gestaup/ui'
import { formatDate } from '@gestaup/shared'
import { notaMedia, resultadoRegistro } from '../../features/relatorioAuditoria5s/agregacao'
import {
  LIMIAR_AUDITORIA_ANTIGA_DIAS,
  agruparPorSetor,
  chaveSetor,
  evolucaoPilaresSetor,
  itensRecorrentesSetor,
  linhasDosSetores,
  pilaresSetorVsFazenda,
  resumirSetor,
  serieSetor,
} from '../../features/relatorioAuditoria5s/porSetor'
import { diasEntre, type PendenciaAbertaDoSetor, type PendenciaResolvidaDoSetor } from '../../features/pendencias5s/calculo'
import {
  COR_ALERTA,
  COR_NEUTRA,
  COR_NOTA,
  COR_OK,
  LABEL,
  SELECT,
  SETA_TENDENCIA,
  corNota,
  corPercentual,
  corTendencia,
  rotuloDia,
  textoDelta,
  textoDiasDesde,
  textoNota,
  textoPercentual,
} from '../../features/relatorioAuditoria5s/apresentacao'
import type { RegistroAuditoria5sRow, SetorCadastrado } from '../../hooks/useAuditorias5s'
import { Auditoria5sPendencias } from './Auditoria5sPendencias'
import { Auditoria5sPilaresTempo } from './Auditoria5sPilaresTempo'

interface Props {
  /** Auditorias do período e responsável selecionados (todos os setores). */
  registrosPeriodo: RegistroAuditoria5sRow[]
  /** Histórico inteiro (as pendências não dependem do período). */
  todosRegistros: RegistroAuditoria5sRow[]
  setores: SetorCadastrado[]
  setorChave: string | null
  pendenciasAbertas: PendenciaAbertaDoSetor[]
  pendenciasResolvidas: PendenciaResolvidaDoSetor[]
  fazendaNome: string | null
  onSelecionar: (chave: string | null) => void
  onVerPendencias: (chave: string) => void
}

function Kpi({ titulo, valor, cor, detalhe, detalheCor }: { titulo: string; valor: string; cor?: string; detalhe?: string; detalheCor?: string }) {
  return (
    <Card className="bg-surface-1 p-4" disableHover>
      <p className="text-xs font-medium text-content-muted uppercase tracking-wider">{titulo}</p>
      <p className="mt-1 text-2xl font-bold text-content-strong" style={cor ? { color: cor } : undefined}>
        {valor}
      </p>
      {detalhe && (
        <p className="text-xs text-content-muted" style={detalheCor ? { color: detalheCor, fontWeight: 600 } : undefined}>
          {detalhe}
        </p>
      )}
    </Card>
  )
}

/** Ponto do gráfico que abre a auditoria ao clicar. */
function PontoClicavel(props: { cx?: number; cy?: number; stroke?: string; payload?: { id: string }; onAbrir: (id: string) => void }) {
  const { cx, cy, stroke, payload, onAbrir } = props
  if (typeof cx !== 'number' || typeof cy !== 'number' || !payload) return null
  return <circle cx={cx} cy={cy} r={5} fill={stroke} stroke="#fff" strokeWidth={1.5} style={{ cursor: 'pointer' }} onClick={() => onAbrir(payload.id)} />
}

function TooltipAuditoria({ active, payload }: { active?: boolean; payload?: { payload: Record<string, any> }[] }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-lg border border-border-base bg-surface-1 px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-content-strong">{formatDate(p.data)}</p>
      {p.responsavel && <p className="text-content-muted">{p.responsavel}</p>}
      <p className="mt-1 text-content-strong">Nota: <b style={{ color: corNota(p.nota) }}>{textoNota(p.nota)}</b></p>
      <p className="text-content-strong">Conformidade: <b style={{ color: corPercentual(p.percentual) }}>{textoPercentual(p.percentual)}</b></p>
      <p className="text-content-strong">Itens N: <b>{p.naoConformes}</b></p>
      <p className="mt-1 text-content-muted">Clique no ponto para abrir</p>
    </div>
  )
}

interface SerieAuditoriasProps {
  titulo: string
  escala: string
  serie: ReturnType<typeof serieSetor>
  chave: 'nota' | 'percentual'
  cor: string
  dominio: [number, number]
  ticks: number[]
  formatar: (v: number) => string
  referencia?: { valor: number; rotulo: string }
  onAbrir: (id: string) => void
}

/** Uma métrica por auditoria, em gráfico próprio: sem eixo duplo, sem disputar a leitura com a outra linha. */
function SerieAuditorias({ titulo, escala, serie, chave, cor, dominio, ticks, formatar, referencia, onAbrir }: SerieAuditoriasProps) {
  const temDado = serie.some((p) => p[chave] !== null)
  const ultimo = [...serie].reverse().find((p) => p[chave] !== null)
  // Mesmo dia em mais de uma auditoria: o eixo X ganha a ordem (#1, #2), como no mapa de pilares
  const rotulos = new Map<string, string>()
  const contagemDoDia = new Map<string, number>()
  serie.forEach((p) => contagemDoDia.set(rotuloDia(p.data), (contagemDoDia.get(rotuloDia(p.data)) ?? 0) + 1))
  const vistos = new Map<string, number>()
  serie.forEach((p) => {
    const dia = rotuloDia(p.data)
    const k = (vistos.get(dia) ?? 0) + 1
    vistos.set(dia, k)
    rotulos.set(p.id, (contagemDoDia.get(dia) ?? 0) > 1 ? `${dia} #${k}` : dia)
  })
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-content-strong">{titulo}</h4>
        <span className="text-sm font-bold tabular-nums text-content-strong">{ultimo ? formatar(ultimo[chave] as number) : '-'}</span>
      </div>
      <p className="mb-2 text-[11px] text-content-muted">{escala}</p>
      {!temDado ? (
        <p className="py-10 text-center text-sm text-content-muted">Sem dados neste período.</p>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={serie} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="id" tickFormatter={(id: string) => rotulos.get(id) ?? ''} tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={20} />
              <YAxis domain={dominio} ticks={ticks} tick={{ fontSize: 11 }} width={40} unit={dominio[1] === 100 ? '%' : ''} />
              <Tooltip content={<TooltipAuditoria />} />
              {referencia && (
                <ReferenceLine y={referencia.valor} stroke={COR_NEUTRA} strokeDasharray="5 4" label={{ value: referencia.rotulo, position: 'insideTopRight', fontSize: 11, fill: COR_NEUTRA }} />
              )}
              <Line type="linear" dataKey={chave} name={titulo} stroke={cor} strokeWidth={2.5} connectNulls isAnimationActive={false} dot={(p: any) => <PontoClicavel key={p.index} {...p} stroke={cor} onAbrir={onAbrir} />} activeDot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

export function Auditoria5sSetor({
  registrosPeriodo,
  todosRegistros,
  setores,
  setorChave,
  pendenciasAbertas,
  pendenciasResolvidas,
  fazendaNome,
  onSelecionar,
  onVerPendencias,
}: Props) {
  const navigate = useNavigate()
  const agora = useMemo(() => new Date().toISOString(), [])
  const [todosItens, setTodosItens] = useState(false)

  const opcoes = useMemo(
    () => linhasDosSetores(todosRegistros, agora, { cadastrados: setores }).sort((a, b) => a.nome.localeCompare(b.nome)).map((l) => ({ chave: l.chave, nome: l.nome, auditorias: l.auditorias })),
    [todosRegistros, agora, setores]
  )
  const indice = opcoes.findIndex((o) => o.chave === setorChave)
  const abrirOffset = (delta: number) => {
    if (opcoes.length === 0) return
    const base = indice < 0 ? (delta > 0 ? -1 : 0) : indice
    onSelecionar(opcoes[(base + delta + opcoes.length) % opcoes.length].chave)
  }

  const abrirAuditoria = (id: string) => navigate(`/controller/checklists/auditoria-5s/${id}`)

  const registrosSetor = useMemo(() => registrosPeriodo.filter((r) => chaveSetor(r) === setorChave), [registrosPeriodo, setorChave])
  const historicoSetor = useMemo(() => todosRegistros.filter((r) => chaveSetor(r) === setorChave), [todosRegistros, setorChave])
  const abertasSetor = useMemo(() => pendenciasAbertas.filter((p) => p.setorChave === setorChave), [pendenciasAbertas, setorChave])
  const resolvidasSetor = useMemo(() => pendenciasResolvidas.filter((p) => p.setorChave === setorChave), [pendenciasResolvidas, setorChave])
  const nomeSetor = opcoes.find((o) => o.chave === setorChave)?.nome ?? ''

  const resumo = useMemo(() => {
    const grupo = agruparPorSetor(registrosSetor)[0]
    return grupo ? resumirSetor(grupo, agora) : null
  }, [registrosSetor, agora])
  const serie = useMemo(() => serieSetor(registrosSetor), [registrosSetor])
  const pilaresTempo = useMemo(() => evolucaoPilaresSetor(registrosSetor), [registrosSetor])
  const pilaresComparados = useMemo(() => pilaresSetorVsFazenda(registrosSetor, registrosPeriodo), [registrosSetor, registrosPeriodo])
  const itens = useMemo(() => itensRecorrentesSetor(registrosSetor, abertasSetor), [registrosSetor, abertasSetor])
  // Abertas primeiro (é onde a ação é necessária), depois as mais recorrentes
  const itensOrdenados = useMemo(
    () => [...itens].sort((a, b) => (a.situacao === 'aberta' ? 0 : 1) - (b.situacao === 'aberta' ? 0 : 1) || b.naoConformes - a.naoConformes),
    [itens]
  )
  const LIMITE_ITENS = 8
  const itensVisiveis = todosItens ? itensOrdenados : itensOrdenados.slice(0, LIMITE_ITENS)
  const mediaFazenda = useMemo(() => notaMedia(registrosPeriodo), [registrosPeriodo])
  const temNota = serie.some((p) => p.nota !== null)
  const tempoMedioResolucao = useMemo(() => {
    const tempos = resolvidasSetor.map((r) => diasEntre(r.abertaEm, r.resolvidaEm))
    return tempos.length > 0 ? Math.round((tempos.reduce((a, b) => a + b, 0) / tempos.length) * 10) / 10 : null
  }, [resolvidasSetor])

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      <Card className="bg-surface-1 p-4 sm:p-6" disableHover>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className={LABEL}>Setor</label>
            <select className={SELECT} value={setorChave ?? ''} onChange={(e) => onSelecionar(e.target.value || null)}>
              <option value="">Selecione um setor...</option>
              {opcoes.map((o) => (
                <option key={o.chave} value={o.chave}>
                  {o.nome}{o.auditorias === 0 ? ' (sem auditoria)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => abrirOffset(-1)} className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-semibold text-content-strong hover:bg-surface-2/70" aria-label="Setor anterior">← Anterior</button>
            <button type="button" onClick={() => abrirOffset(1)} className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-semibold text-content-strong hover:bg-surface-2/70" aria-label="Próximo setor">Próximo →</button>
            <button type="button" onClick={() => onSelecionar(null)} className="rounded-lg border border-border-base px-3 py-2 text-sm font-semibold text-content-strong hover:bg-surface-2">Todos os setores</button>
          </div>
        </div>
      </Card>

      {!setorChave ? (
        <Card className="bg-surface-1 p-6 text-center" disableHover>
          <p className="text-content-muted">Escolha um setor acima, ou clique em um setor na Visão geral, para ver a evolução dele.</p>
        </Card>
      ) : registrosSetor.length === 0 ? (
        <Card className="bg-surface-1 p-6 text-center" disableHover>
          <p className="text-lg font-semibold text-content-strong">{nomeSetor || 'Setor'}</p>
          <p className="mt-1 text-content-muted">
            {historicoSetor.length === 0 ? 'Este setor ainda não teve nenhuma auditoria.' : 'Sem auditorias deste setor no período/responsável selecionado. Amplie o período para ver o histórico.'}
          </p>
          {abertasSetor.length > 0 && (
            <button type="button" onClick={() => onVerPendencias(setorChave)} className="mt-3 text-sm font-semibold text-primary underline">
              Ver {abertasSetor.length} {abertasSetor.length === 1 ? 'pendência aberta' : 'pendências abertas'}
            </button>
          )}
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 sm:gap-4">
            <Kpi
              titulo="Última nota"
              valor={textoNota(resumo?.ultimaNota)}
              cor={corNota(resumo?.ultimaNota)}
              detalhe={resumo?.tendencia ? `${SETA_TENDENCIA[resumo.tendencia]} ${textoDelta(resumo.delta)} vs anterior` : undefined}
              detalheCor={corTendencia(resumo?.tendencia ?? null)}
            />
            <Kpi
              titulo="Nota média"
              valor={textoNota(resumo?.notaMedia)}
              cor={corNota(resumo?.notaMedia)}
              detalhe={mediaFazenda !== null ? `fazenda: ${textoNota(mediaFazenda)}` : undefined}
            />
            <Kpi titulo="Conformidade" valor={textoPercentual(resumo?.percentual)} cor={corPercentual(resumo?.percentual)} />
            <Kpi titulo="Auditorias" valor={String(resumo?.auditorias ?? 0)} />
            <Kpi titulo="Itens N" valor={String(resumo?.naoConformes ?? 0)} />
            <Kpi
              titulo="Pendências abertas"
              valor={String(abertasSetor.length)}
              cor={abertasSetor.length > 0 ? COR_ALERTA : undefined}
              detalhe={tempoMedioResolucao !== null ? `resolve em ${tempoMedioResolucao.toLocaleString('pt-BR')} dias (média)` : 'estado atual'}
            />
            <Kpi
              titulo="Última auditoria"
              valor={textoDiasDesde(resumo?.diasDesdeUltima ?? null).replace('há ', '')}
              detalhe={resumo?.ultimaData ? formatDate(resumo.ultimaData) : undefined}
              detalheCor={(resumo?.diasDesdeUltima ?? 0) > LIMIAR_AUDITORIA_ANTIGA_DIAS ? COR_ALERTA : undefined}
            />
          </div>

          <Card className="bg-surface-1 p-4 sm:p-6" disableHover>
            <h3 className="text-base sm:text-lg font-semibold text-content-strong">Evolução da nota e da conformidade</h3>
            <p className="mb-4 text-xs text-content-muted">
              Um ponto por auditoria, cada métrica no seu gráfico. Clique em um ponto para abrir a auditoria.
              {!temNota ? ' As auditorias deste período não têm nota (registros antigos).' : ''}
            </p>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <SerieAuditorias
                titulo="Nota do setor"
                escala="Escala de 0 a 5"
                serie={serie}
                chave="nota"
                cor={COR_NOTA}
                dominio={[0, 5]}
                ticks={[0, 2, 4]}
                formatar={(v) => textoNota(v)}
                referencia={mediaFazenda !== null ? { valor: mediaFazenda, rotulo: `fazenda ${textoNota(mediaFazenda)}` } : undefined}
                onAbrir={abrirAuditoria}
              />
              <SerieAuditorias
                titulo="Conformidade"
                escala="Escala de 0 a 100%"
                serie={serie}
                chave="percentual"
                cor={COR_OK}
                dominio={[0, 100]}
                ticks={[0, 50, 100]}
                formatar={(v) => textoPercentual(v)}
                onAbrir={abrirAuditoria}
              />
            </div>
          </Card>

          <Card className="bg-surface-1 p-4 sm:p-6" disableHover>
            <h3 className="text-base font-semibold text-content-strong">Pilares ao longo do tempo</h3>
            <p className="mb-3 text-xs text-content-muted">Uma linha por pilar, uma coluna por auditoria. Toque em uma célula para abrir a auditoria.</p>
            <Auditoria5sPilaresTempo pontos={pilaresTempo} onAbrirAuditoria={abrirAuditoria} />
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <Card className="bg-surface-1 p-4 sm:p-6" disableHover>
              <h3 className="text-base font-semibold text-content-strong">Pilares: setor × fazenda</h3>
              <p className="mb-3 text-xs text-content-muted">Auditoria mais recente do setor, média do setor e média da fazenda no período.</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pilaresComparados.map((p) => ({ ...p, atual: p.atual ?? 0, mediaSetor: p.mediaSetor ?? 0, mediaFazenda: p.mediaFazenda ?? 0 }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="titulo" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" width={44} />
                    <Tooltip formatter={(v) => `${v}%`} />
                    <Legend />
                    <Bar dataKey="atual" name="Última auditoria" fill={COR_NOTA} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="mediaSetor" name="Média do setor" fill={COR_OK} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="mediaFazenda" name="Média da fazenda" fill={COR_NEUTRA} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card className="bg-surface-1 p-4 sm:p-6 overflow-x-auto" disableHover>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-content-strong">
                Inconformidades do setor <span className="font-normal text-content-muted">({itens.filter((i) => i.situacao === 'aberta').length} abertas de {itens.length})</span>
              </h3>
              {itens.length > LIMITE_ITENS && (
                <button type="button" onClick={() => setTodosItens((v) => !v)} className="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-semibold text-content-strong hover:bg-surface-2/70">
                  {todosItens ? 'Mostrar só as principais' : `Ver todas (${itens.length})`}
                </button>
              )}
            </div>
            {itens.length === 0 ? (
              <p className="rounded-xl bg-green-500/10 px-4 py-3 text-sm font-medium text-green-700 dark:text-green-400">Nenhum item não conforme neste setor no período.</p>
            ) : (
              <table className="min-w-full divide-y divide-border-base text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-content-muted uppercase tracking-wider">
                    <th className="py-2 pr-4">Item</th>
                    <th className="py-2 pr-4">Pilar</th>
                    <th className="py-2 pr-4">Vezes N</th>
                    <th className="py-2 pr-4">Última vez</th>
                    <th className="py-2 pr-4">Situação</th>
                    <th className="py-2 pr-4">Observação</th>
                    <th className="py-2">Foto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-base">
                  {itensVisiveis.map((i) => (
                    <tr key={i.chave}>
                      <td className="py-2 pr-4 text-content-strong">{i.negativa}</td>
                      <td className="py-2 pr-4 text-content-strong">{i.secao}</td>
                      <td className="py-2 pr-4 text-content-strong whitespace-nowrap">{i.naoConformes}/{i.avaliacoes} ({textoPercentual(i.percentualNaoConforme)})</td>
                      <td className="py-2 pr-4 text-content-strong whitespace-nowrap">{i.ultimaOcorrencia ? formatDate(i.ultimaOcorrencia) : '-'}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {i.situacao === 'aberta' ? (
                          <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-400">Aberta{i.desde ? ` desde ${formatDate(i.desde)}` : ''}</span>
                        ) : (
                          <span className="rounded bg-green-500/15 px-2 py-0.5 text-xs font-bold text-green-700 dark:text-green-400">Resolvida</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-content-strong">{i.observacao || '-'}</td>
                      <td className="py-2">
                        {i.fotoUrl ? <a href={i.fotoUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">Ver foto</a> : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-base sm:text-lg font-semibold text-content-strong">Pendências do setor</h3>
              <button type="button" onClick={() => onVerPendencias(setorChave)} className="text-sm font-semibold text-content-strong underline">Abrir na aba Pendências</button>
            </div>
            <Auditoria5sPendencias registros={historicoSetor} fazendaNome={fazendaNome} compacto />
          </div>

          <Card className="bg-surface-1 overflow-x-auto" disableHover>
            <h3 className="text-base font-semibold text-content-strong p-4 sm:p-6 pb-3">Histórico de auditorias do setor</h3>
            <table className="min-w-full divide-y divide-border-base">
              <thead className="bg-surface-2">
                <tr>
                  {['Data', 'Responsável', 'Nota', 'Conformidade', 'C', 'N', '–'].map((h) => (
                    <th key={h} className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-surface-1 divide-y divide-border-base">
                {[...registrosSetor].sort((a, b) => b.data.localeCompare(a.data)).map((r) => {
                  const res = resultadoRegistro(r)
                  return (
                    <tr key={r.id} onClick={() => abrirAuditoria(r.id)} className="cursor-pointer hover:bg-surface-2 transition-colors">
                      <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-sm text-content-strong">{formatDate(r.data)}</td>
                      <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-sm text-content-strong">{r.responsavel || '-'}</td>
                      <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-sm font-semibold" style={{ color: corNota(r.nota_geral) }}>{textoNota(r.nota_geral)}</td>
                      <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-sm font-semibold" style={{ color: corPercentual(res.percentual) }}>{textoPercentual(res.percentual)}</td>
                      <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-sm text-content-strong">{res.conformes}</td>
                      <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-sm text-content-strong">{res.naoConformes}</td>
                      <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-sm text-content-strong">{res.naoAplicaveis}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  )
}
