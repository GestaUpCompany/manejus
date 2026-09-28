// Side panel: detalhes da estrada
import { Button, Card } from '../../../components/ui'
import type { EstradaMapa } from '../mapaFazenda/types'
import { calcularComprimentoEstrada } from '../mapaFazenda/geometriaUtils'

interface Props {
  detalhe: EstradaMapa
  estradas: EstradaMapa[]
  modoTelaCheia: boolean
  onFechar: () => void
  onEditarGeometria: (id: string, nome: string) => void
  onRemover: (id: string) => void
}

export function EstradaDetalhePanel({ detalhe, estradas, modoTelaCheia, onFechar, onEditarGeometria, onRemover }: Props) {
  const estrada = estradas.find((e) => e.id === detalhe.id)
  const comprimento = estrada?.geometria_geojson?.features?.[0]?.geometry?.type === 'LineString'
    ? `${calcularComprimentoEstrada(estrada?.geometria_geojson?.features?.[0] as GeoJSON.Feature<GeoJSON.LineString>).toFixed(0)} m`
    : '—'

  return (
    <div className={modoTelaCheia
      ? 'absolute top-2 right-2 bottom-2 w-80 z-10 overflow-y-auto shadow-xl'
      : 'w-full lg:w-80 flex-shrink-0'
    }>
      <Card>
        <div className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="text-lg font-bold text-content-strong">{detalhe.nome}</h2>
              <p className="text-xs text-content-muted">Estrada interna</p>
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
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-content-muted">Comprimento:</span>
              <span className="font-medium">{comprimento}</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-border-base space-y-2">
            <Button
              variant="secondary"
              onClick={() => onEditarGeometria(detalhe.id, detalhe.nome)}
              className="w-full"
            >
              Editar Geometria
            </Button>
            <Button
              variant="danger"
              onClick={() => onRemover(detalhe.id)}
              className="w-full"
            >
              Remover Estrada
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
