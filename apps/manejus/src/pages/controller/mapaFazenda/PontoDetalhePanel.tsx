// Side panel: detalhes do ponto de interesse
import { Button, Card } from '../../../components/ui'
import type { PontoMapa } from '../mapaFazenda/types'
import { corPonto, labelPonto } from '../mapaFazenda/mapaConfig'

interface Props {
  detalhe: PontoMapa
  modoTelaCheia: boolean
  onFechar: () => void
  onRemover: (id: string) => void
}

export function PontoDetalhePanel({ detalhe, modoTelaCheia, onFechar, onRemover }: Props) {
  return (
    <div className={modoTelaCheia
      ? 'absolute top-2 right-2 bottom-2 w-80 z-10 overflow-y-auto shadow-xl'
      : 'w-full lg:w-80 flex-shrink-0'
    }>
      <Card>
        <div className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full border-2 border-white shadow" style={{ backgroundColor: corPonto(detalhe.tipo) }} />
              <div>
                <h2 className="text-lg font-bold text-content-strong">{detalhe.nome}</h2>
                <p className="text-xs text-content-muted">{labelPonto(detalhe.tipo)}</p>
              </div>
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
          <div className="mt-4 pt-3 border-t border-border-base space-y-2">
            <Button
              variant="danger"
              onClick={() => onRemover(detalhe.id)}
              className="w-full"
            >
              Remover Ponto
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
