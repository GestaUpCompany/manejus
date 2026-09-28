// Side panel: detalhes do curral
import { Button, Card } from '../../../components/ui'
import type { CurralDetalhe } from '../mapaFazenda/types'

interface Props {
  detalhe: CurralDetalhe
  modoTelaCheia: boolean
  onFechar: () => void
  onEditarGeometria: (id: string, nome: string) => void
  onRemoverGeometria: (id: string) => void
}

export function CurralDetalhePanel({ detalhe, modoTelaCheia, onFechar, onEditarGeometria, onRemoverGeometria }: Props) {
  return (
    <div className={modoTelaCheia
      ? 'absolute top-2 right-2 bottom-2 w-80 z-10 overflow-y-auto shadow-xl'
      : 'w-full lg:w-80 flex-shrink-0'
    }>
      <Card>
        <div className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 bg-amber-800 border border-amber-900" />
              <div>
                <h2 className="text-lg font-bold text-content-strong">{detalhe.nome}</h2>
                <p className="text-xs text-content-muted">Curral</p>
              </div>
            </div>
            <button onClick={onFechar} className="text-content-faint hover:text-content-muted">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="space-y-2 text-sm">
            {detalhe.formulacao_nome && (
              <div className="flex justify-between">
                <span className="text-content-muted">Formulação:</span>
                <span className="font-medium text-content-strong">{detalhe.formulacao_nome}</span>
              </div>
            )}
            {detalhe.largura_m != null && (
              <div className="flex justify-between">
                <span className="text-content-muted">Largura:</span>
                <span className="font-medium text-content-strong">{detalhe.largura_m} m</span>
              </div>
            )}
            {detalhe.comprimento_m != null && (
              <div className="flex justify-between">
                <span className="text-content-muted">Comprimento:</span>
                <span className="font-medium text-content-strong">{detalhe.comprimento_m} m</span>
              </div>
            )}
            {detalhe.metros_cocho_m != null && (
              <div className="flex justify-between">
                <span className="text-content-muted">Metros de cocho:</span>
                <span className="font-medium text-content-strong">{detalhe.metros_cocho_m} m</span>
              </div>
            )}
          </div>

          {/* Lote atual */}
          {detalhe.lote_atual ? (
            <div className="mt-4 pt-3 border-t border-border-base">
              <p className="text-xs font-semibold text-content-faint uppercase tracking-wider mb-1">Lote Atual</p>
              <div className="text-sm space-y-1">
                <p className="font-medium">{detalhe.lote_atual.nome}</p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-content-muted">
                  <span>Cabeças:</span>
                  <span className="font-medium text-content-strong">{detalhe.lote_atual.n_cabecas}</span>
                  {detalhe.lote_atual.raca && (
                    <>
                      <span>Raça:</span>
                      <span className="font-medium text-content-strong">{detalhe.lote_atual.raca}</span>
                    </>
                  )}
                  {detalhe.lote_atual.sexo && (
                    <>
                      <span>Sexo:</span>
                      <span className="font-medium text-content-strong">{detalhe.lote_atual.sexo}</span>
                    </>
                  )}
                  {detalhe.lote_atual.peso_medio_atual_kg != null && (
                    <>
                      <span>Peso médio:</span>
                      <span className="font-medium text-content-strong">
                        {detalhe.lote_atual.peso_medio_atual_kg} kg
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 pt-3 border-t border-border-base">
              <p className="text-xs font-semibold text-content-faint uppercase tracking-wider mb-1">Lote Atual</p>
              <p className="text-sm text-content-faint italic">Sem lote associado</p>
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-border-base space-y-2">
            <Button variant="secondary" onClick={() => onEditarGeometria(detalhe.id, detalhe.nome)} className="w-full">
              Editar Geometria
            </Button>
            <Button variant="danger" onClick={() => onRemoverGeometria(detalhe.id)} className="w-full">
              Remover Geometria
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
