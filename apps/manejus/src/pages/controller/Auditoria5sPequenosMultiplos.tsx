import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { COR_NEUTRA, textoNota, textoPercentual } from '../../features/relatorioAuditoria5s/apresentacao'
import type { MetricaComparacao } from '../../features/relatorioAuditoria5s/porSetor'

export interface SetorSerie {
  chave: string
  nome: string
  cor: string
}

/** Um ponto por período: rótulo, média da fazenda e o valor de cada setor (chave = id do setor). */
export type PontoSerie = { rotulo: string; media: number | null } & Record<string, number | string | null>

interface Props {
  pontos: PontoSerie[]
  setores: SetorSerie[]
  metrica: MetricaComparacao
  /** Rótulo do período no texto de acessibilidade ("mês" ou "semana"). */
  unidade: string
}

const valorTexto = (metrica: MetricaComparacao, v: number | null | undefined) =>
  typeof v !== 'number' ? '-' : metrica === 'nota' ? textoNota(v) : textoPercentual(v)

const ultimoValor = (pontos: PontoSerie[], chave: string) => {
  for (let i = pontos.length - 1; i >= 0; i--) {
    const v = pontos[i][chave]
    if (typeof v === 'number') return { valor: v, rotulo: pontos[i].rotulo }
  }
  return null
}

/**
 * Evolução comparada em pequenos múltiplos: um gráfico por setor, com uma única linha colorida
 * e a média da fazenda tracejada. Cada gráfico tem eixo fixo (0 a 5 ou 0 a 100), então a
 * comparação entre setores é direta, sem as linhas se cruzarem.
 */
export function Auditoria5sPequenosMultiplos({ pontos, setores, metrica, unidade }: Props) {
  const dominio: [number, number] = metrica === 'nota' ? [0, 5] : [0, 100]
  const escala = metrica === 'nota' ? '0 a 5' : '0 a 100%'

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {setores.map((s) => {
        const ultimo = ultimoValor(pontos, s.chave)
        const descricao = `${s.nome}: último valor ${ultimo ? `${valorTexto(metrica, ultimo.valor)} em ${ultimo.rotulo}` : 'sem dado'}. Média da fazenda no ${unidade} da última leitura, tracejada.`
        return (
          <li key={s.chave} className="rounded-xl border border-border-base bg-surface-1 p-3">
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-content-strong">
                <span aria-hidden="true" className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: s.cor }} />
                <span className="truncate">{s.nome}</span>
              </span>
              <span className="flex-shrink-0 text-sm font-bold tabular-nums text-content-strong">
                {ultimo ? valorTexto(metrica, ultimo.valor) : '-'}
              </span>
            </div>
            <div role="img" aria-label={descricao} className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={pontos} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis domain={dominio} ticks={metrica === 'nota' ? [0, 2, 4] : [0, 50, 100]} tick={{ fontSize: 11 }} width={34} unit={metrica === 'nota' ? '' : '%'} />
                  <Tooltip
                    formatter={(v, nome) => [valorTexto(metrica, typeof v === 'number' ? v : null), String(nome)]}
                    labelFormatter={(rotulo) => String(rotulo)}
                  />
                  <Line type="linear" name="Média da fazenda" dataKey="media" stroke={COR_NEUTRA} strokeDasharray="5 4" strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
                  <Line type="linear" name={s.nome} dataKey={s.chave} stroke={s.cor} strokeWidth={2.5} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 text-[11px] text-content-muted">Escala {escala}</p>
          </li>
        )
      })}
    </ul>
  )
}
