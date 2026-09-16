// Side panel: detalhes da fábrica
import { Button, Card } from '../../../components/ui'
import type { PontoMapa } from '../mapaFazenda/types'

interface Props {
  detalhe: PontoMapa
  modoTelaCheia: boolean
  onFechar: () => void
  onEditarGeometria: (id: string, nome: string) => void
  onRemover: (id: string) => void
}

export function FabricaDetalhePanel({ detalhe, modoTelaCheia, onFechar, onEditarGeometria, onRemover }: Props) {
  return (
    <div className={modoTelaCheia
      ? 'absolute top-2 right-2 bottom-2 w-80 z-10 overflow-y-auto shadow-xl'
      : 'w-full lg:w-80 flex-shrink-0'
    }>
      <Card>
        <div className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 bg-violet-700 border border-violet-900" />
              <div>
                <h2 className="text-lg font-bold text-content-strong">{detalhe.nome}</h2>
                <p className="text-xs text-content-muted">Fábrica</p>
              </div>
            </div>
            <button onClick={onFechar} className="text-content-faint hover:text-content-muted">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="mt-4 pt-3 border-t border-border-base space-y-2">
            <Button variant="secondary" onClick={() => onEditarGeometria(detalhe.id, detalhe.nome)} className="w-full">
              Editar Geometria
            </Button>
            <Button variant="danger" onClick={() => onRemover(detalhe.id)} className="w-full">
              Remover Fábrica
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
