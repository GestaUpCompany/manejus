import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts'
import { Card } from '@gestaup/ui'
import type { LinhaSetorDetalhada } from '../../features/relatorioAuditoria5s/porSetor'
import { LIMIAR_AUDITORIA_ANTIGA_DIAS } from '../../features/relatorioAuditoria5s/porSetor'
import {
  COR_ALERTA,
  COR_NEUTRA,
  SETA_TENDENCIA,
  corNota,
  corPercentual,
  corTendencia,
  textoDelta,
  textoDiasDesde,
  textoPercentual,
} from '../../features/relatorioAuditoria5s/apresentacao'

interface Props {
  linha: LinhaSetorDetalhada
  onAbrir: (chave: string) => void
  onVerPendencias: (chave: string) => void
}

/** Mini-gráfico das últimas notas do setor (eixo fixo 0 a 5, sem eixos visíveis). */
function Sparkline({ notas, cor }: { notas: number[]; cor: string }) {
  if (notas.length < 2) {
    return <div className="flex h-10 items-center text-xs text-content-muted">{notas.length === 1 ? 'Uma nota registrada' : 'Sem notas'}</div>
  }
  const dados = notas.map((v, i) => ({ i, v }))
  return (
    <div className="h-10" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={dados} margin={{ top: 4, right: 6, bottom: 4, left: 6 }}>
          <YAxis domain={[0, 5]} hide />
          <Line type="monotone" dataKey="v" stroke={cor} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Cartão de um setor na visão geral: última nota, tendência, sparkline, conformidade e pendências. Clique abre o setor. */
export function Auditoria5sCartaoSetor({ linha, onAbrir, onVerPendencias }: Props) {
  const cor = corNota(linha.ultimaNota)
  const antiga = linha.diasDesdeUltima !== null && linha.diasDesdeUltima > LIMIAR_AUDITORIA_ANTIGA_DIAS

  return (
    <Card className={`bg-surface-1 p-4 ${linha.semAuditoria ? 'opacity-60' : ''}`} disableHover>
      <button
        type="button"
        onClick={() => onAbrir(linha.chave)}
        className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-lg"
        aria-label={`Abrir setor ${linha.nome}`}
      >
        <div className="flex items-start justify-between gap-2">
          <h4 className="min-w-0 truncate text-sm font-bold uppercase tracking-wide text-content-strong" title={linha.nome}>
            {linha.nome}
          </h4>
          {linha.tendencia && (
            <span className="shrink-0 text-xs font-bold" style={{ color: corTendencia(linha.tendencia) }} title="Última nota vs anterior">
              {SETA_TENDENCIA[linha.tendencia]} {textoDelta(linha.delta)}
            </span>
          )}
        </div>

        {linha.semAuditoria ? (
          <p className="mt-3 text-sm text-content-muted">Sem auditoria no período</p>
        ) : (
          <>
            <div className="mt-2 flex items-end gap-2">
              <span className="text-3xl font-bold leading-none" style={{ color: cor }}>
                {typeof linha.ultimaNota === 'number' ? linha.ultimaNota.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '-'}
              </span>
              <span className="pb-0.5 text-xs text-content-muted">/5 última nota</span>
            </div>
            <Sparkline notas={linha.serieNotas} cor={cor === COR_NEUTRA ? COR_NEUTRA : cor} />
            <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-content-muted">
              <span>
                Conformidade <b style={{ color: corPercentual(linha.percentual) }}>{textoPercentual(linha.percentual)}</b>
              </span>
              <span>
                {linha.auditorias} {linha.auditorias === 1 ? 'auditoria' : 'auditorias'}
              </span>
            </div>
            <p className="mt-1 text-xs" style={antiga ? { color: COR_ALERTA, fontWeight: 600 } : undefined}>
              <span className={antiga ? '' : 'text-content-muted'}>Última {textoDiasDesde(linha.diasDesdeUltima)}</span>
            </p>
          </>
        )}
      </button>

      {linha.pendenciasAbertas > 0 && (
        <button
          type="button"
          onClick={() => onVerPendencias(linha.chave)}
          className="mt-3 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-500/25 dark:text-amber-400"
        >
          {linha.pendenciasAbertas} {linha.pendenciasAbertas === 1 ? 'pendência aberta' : 'pendências abertas'}
        </button>
      )}
    </Card>
  )
}
