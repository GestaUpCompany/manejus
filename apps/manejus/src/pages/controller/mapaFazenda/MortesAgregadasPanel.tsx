// Side panel: metricas agregadas de mortes selecionadas por area
import { Card } from '../../../components/ui'

interface MorteSelecionada {
  id: string
  data: string
  causa_morte: string | null
  brinco: string | null
  chip: string | null
  categoria: string | null
  sexo: string | null
  raca: string | null
  idade: string | null
  pasto: string | null
  lote: string | null
  peso_vivo: number | null
  foto_url: string | null
}

interface Props {
  mortes: MorteSelecionada[]
  modoTelaCheia: boolean
  onFechar: () => void
  onVerDetalhe: (morte: MorteSelecionada) => void
}

function formatarData(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('pt-BR')
  } catch {
    return iso
  }
}

function agrupar(arr: (string | null)[]): Record<string, number> {
  const map: Record<string, number> = {}
  arr.forEach((v) => {
    const key = v || 'Não informado'
    map[key] = (map[key] || 0) + 1
  })
  return map
}

function BarraDistribuicao({ titulo, dados }: { titulo: string; dados: Record<string, number> }) {
  const entries = Object.entries(dados).sort((a, b) => b[1] - a[1])
  if (entries.length === 0) return null
  const max = Math.max(...entries.map((e) => e[1]))
  return (
    <div>
      <h3 className="text-xs font-semibold text-content-muted uppercase tracking-wide mb-1.5">{titulo}</h3>
      <div className="space-y-1">
        {entries.map(([key, count]) => (
          <div key={key} className="flex items-center gap-2 text-xs">
            <span className="w-24 truncate text-content" title={key}>{key}</span>
            <div className="flex-1 bg-surface-2 rounded h-4 relative overflow-hidden">
              <div
                className="bg-red-700 h-full rounded"
                style={{ width: `${(count / max) * 100}%` }}
              />
            </div>
            <span className="w-6 text-right font-semibold text-content-strong">{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function MortesAgregadasPanel({ mortes, modoTelaCheia, onFechar, onVerDetalhe }: Props) {
  const total = mortes.length
  const datas = mortes.map((m) => m.data).sort()
  const primeira = datas[0] ? formatarData(datas[0]) : ''
  const ultima = datas[datas.length - 1] ? formatarData(datas[datas.length - 1]) : ''

  const porCausa = agrupar(mortes.map((m) => m.causa_morte))
  const porCategoria = agrupar(mortes.map((m) => m.categoria))
  const porSexo = agrupar(mortes.map((m) => m.sexo))
  const porPasto = agrupar(mortes.map((m) => m.pasto))

  const pesos = mortes.map((m) => m.peso_vivo).filter((p): p is number => p != null)
  const pesoMedio = pesos.length > 0 ? Math.round(pesos.reduce((a, b) => a + b, 0) / pesos.length) : null

  return (
    <div className={modoTelaCheia
      ? 'absolute top-2 right-2 bottom-2 w-96 z-10 overflow-y-auto shadow-xl'
      : 'w-full lg:w-96 flex-shrink-0 overflow-y-auto'
    }>
      <Card>
        <div className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="text-lg font-bold text-content-strong">Mortes na área</h2>
              <p className="text-xs text-content-muted">{total} {total === 1 ? 'registro' : 'registros'}</p>
            </div>
            <button
              onClick={onFechar}
              className="text-content-faint hover:text-content-muted"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-2 text-sm mb-4">
            <div className="flex justify-between">
              <span className="text-content-muted">Período:</span>
              <span className="font-semibold text-content-strong">{primeira} a {ultima}</span>
            </div>
            {pesoMedio != null && (
              <div className="flex justify-between">
                <span className="text-content-muted">Peso médio:</span>
                <span className="font-semibold text-content-strong">{pesoMedio} kg</span>
              </div>
            )}
          </div>

          <div className="space-y-4 mb-4">
            <BarraDistribuicao titulo="Causa" dados={porCausa} />
            <BarraDistribuicao titulo="Categoria" dados={porCategoria} />
            <BarraDistribuicao titulo="Sexo" dados={porSexo} />
            <BarraDistribuicao titulo="Pasto" dados={porPasto} />
          </div>

          <div>
            <h3 className="text-xs font-semibold text-content-muted uppercase tracking-wide mb-1.5">Registros</h3>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {mortes.map((m) => (
                <button
                  key={m.id}
                  onClick={() => onVerDetalhe(m)}
                  className="w-full flex items-center justify-between text-xs p-1.5 rounded hover:bg-surface-2 text-left"
                >
                  <div className="flex flex-col">
                    <span className="font-semibold text-content-strong">{formatarData(m.data)}</span>
                    <span className="text-content-muted">{m.causa_morte || 'Causa não informada'}</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-content-muted">{m.brinco || ''}</span>
                    <span className="text-content-faint">{m.categoria || ''}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
