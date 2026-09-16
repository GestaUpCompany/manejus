// Side panel: detalhes do pasto
import { useNavigate } from 'react-router-dom'
import { Button, Card } from '../../../components/ui'
import type { PastoDetalhe } from '../mapaFazenda/types'

interface Props {
  detalhe: PastoDetalhe
  modoTelaCheia: boolean
  onFechar: () => void
  onEditarGeometria: (id: string, nome: string) => void
  onRemoverGeometria: (id: string, nome: string) => void
}

export function PastoDetalhePanel({ detalhe, modoTelaCheia, onFechar, onEditarGeometria, onRemoverGeometria }: Props) {
  const navigate = useNavigate()

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
              {detalhe.modulo_nome && (
                <p className="text-xs text-content-muted">Módulo: {detalhe.modulo_nome}</p>
              )}
            </div>
            <button
              onClick={onFechar}
              className="text-content-faint hover:text-content-muted"
              aria-label="Fechar detalhes"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-2 text-sm">
            {detalhe.setor && (
              <div className="flex justify-between">
                <span className="text-content-muted">Setor:</span>
                <span className="font-medium">{detalhe.setor}</span>
              </div>
            )}
            {detalhe.tipo && (
              <div className="flex justify-between">
                <span className="text-content-muted">Tipo:</span>
                <span className="font-medium">{detalhe.tipo}</span>
              </div>
            )}
            {detalhe.area_total_ha != null && (
              <div className="flex justify-between">
                <span className="text-content-muted">Área total:</span>
                <span className="font-medium">{detalhe.area_total_ha} ha</span>
              </div>
            )}
            {detalhe.area_util_ha != null && (
              <div className="flex justify-between">
                <span className="text-content-muted">Área útil:</span>
                <span className="font-medium">{detalhe.area_util_ha} ha</span>
              </div>
            )}
            {detalhe.especie && (
              <div className="flex justify-between">
                <span className="text-content-muted">Espécie:</span>
                <span className="font-medium">{detalhe.especie}</span>
              </div>
            )}
            {detalhe.metragem_cocho_m != null && (
              <div className="flex justify-between">
                <span className="text-content-muted">Cocho:</span>
                <span className="font-medium">{detalhe.metragem_cocho_m} m</span>
              </div>
            )}
            {detalhe.fonte_agua_principal && (
              <div className="flex justify-between">
                <span className="text-content-muted">Água:</span>
                <span className="font-medium">{detalhe.fonte_agua_principal}</span>
              </div>
            )}
            {detalhe.possui_deposito != null && (
              <div className="flex justify-between">
                <span className="text-content-muted">Depósito:</span>
                <span className="font-medium">{detalhe.possui_deposito ? 'Sim' : 'Não'}</span>
              </div>
            )}
          </div>

          {/* Lote atual */}
          {detalhe.lote_atual && (
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
          )}

          {/* Bebedouros */}
          {detalhe.bebedouros.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border-base">
              <p className="text-xs font-semibold text-content-faint uppercase tracking-wider mb-1">Bebedouros</p>
              <div className="flex flex-wrap gap-1">
                {detalhe.bebedouros.map((b) => (
                  <span key={b.id} className="px-2 py-1 bg-primary/10 text-primary text-xs rounded">
                    {b.nome}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Ações: editar pasto, editar geometria e remover geometria */}
          <div className="mt-4 pt-3 border-t border-border-base space-y-2">
            <Button
              variant="secondary"
              onClick={() => navigate(`/controller/pastos?pasto=${detalhe.id}`)}
              className="w-full"
            >
              Editar Pasto
            </Button>
            <Button
              variant="secondary"
              onClick={() => onEditarGeometria(detalhe.id, detalhe.nome)}
              className="w-full text-primary hover:text-blue-700 border-primary/30"
            >
              Editar Geometria
            </Button>
            <Button
              variant="secondary"
              onClick={() => onRemoverGeometria(detalhe.id, detalhe.nome)}
              className="w-full text-red-500 hover:text-red-700 border-red-500/30"
            >
              Remover do Mapa
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
