// Modal: associar geometria desenhada a pasto (polígono) ou bebedouro (ponto)
import { Button, Modal, Select } from '../../../components/ui'
import type { BebedouroMapa } from '../mapaFazenda/types'

interface PastoDetectado {
  id: string
  nome: string
}

interface Props {
  isOpen: boolean
  onClose: () => void
  featureDesenhada: { geometry: { type: string } } | null
  // Bebedouro (Point)
  buscandoPasto: boolean
  pastoDetectado: PastoDetectado | null
  bebedourosDoPasto: BebedouroMapa[]
  // Pasto (Polygon)
  pastosSemGeometria: { id: string; nome: string }[]
  // Comum
  pastoSelecionadoAssoc: string
  setPastoSelecionadoAssoc: (v: string) => void
  salvando: boolean
  onSalvarBebedouro: () => void
  onSalvarPasto: () => void
}

export function AssocGeometriaModal({
  isOpen, onClose, featureDesenhada,
  buscandoPasto, pastoDetectado, bebedourosDoPasto,
  pastosSemGeometria,
  pastoSelecionadoAssoc, setPastoSelecionadoAssoc,
  salvando, onSalvarBebedouro, onSalvarPasto,
}: Props) {
  const isPoint = featureDesenhada?.geometry.type === 'Point'

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isPoint ? 'Associar ao Bebedouro' : 'Associar ao Pasto'}
      size="md"
    >
      <div className="space-y-4">
        {isPoint ? (
          <>
            {buscandoPasto ? (
              <div className="flex items-center gap-2 text-sm text-content-muted">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Detectando pasto...
              </div>
            ) : pastoDetectado ? (
              <>
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-sm text-green-800 dark:text-green-200">
                  Ponto marcado dentro do pasto <strong>{pastoDetectado.nome}</strong>.
                </div>

                {bebedourosDoPasto.length === 0 ? (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-200">
                    Este pasto não tem bebedouros associados, ou todos já possuem localização marcada.
                    Associe bebedouros ao pasto na página de Pastos antes de marcá-los no mapa.
                  </div>
                ) : bebedourosDoPasto.length === 1 ? (
                  <div className="space-y-2">
                    <p className="text-sm text-content-muted">
                      Este pasto tem apenas um bebedouro sem localização. Confirme para salvá-lo:
                    </p>
                    <div className="bg-primary/10 border border-primary/30 rounded-lg p-3 text-sm text-primary font-medium">
                      {bebedourosDoPasto[0].nome}
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-content-muted">
                      Selecione qual bebedouro deste pasto está nesta localização:
                    </p>
                    <Select
                      label="Bebedouro"
                      value={pastoSelecionadoAssoc}
                      onChange={(value) => setPastoSelecionadoAssoc(value)}
                      options={[
                        { value: '', label: 'Selecione um bebedouro...' },
                        ...bebedourosDoPasto.map((b) => ({ value: b.id, label: b.nome })),
                      ]}
                    />
                  </>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="secondary" onClick={onClose}>
                    Cancelar
                  </Button>
                  <Button
                    variant="primary"
                    onClick={onSalvarBebedouro}
                    disabled={!pastoSelecionadoAssoc || salvando || bebedourosDoPasto.length === 0}
                  >
                    {salvando ? 'Salvando...' : 'Salvar Localização'}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-800 dark:text-red-200">
                  O ponto foi marcado fora de qualquer pasto com geometria.
                  Bebedouros só podem ser marcados dentro de pastos. Desenhe o pasto primeiro ou
                  marque o ponto dentro de um pasto já delimitado.
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="secondary" onClick={onClose}>
                    Entendi
                  </Button>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-content-muted">
              Selecione qual pasto cadastrado esta delimitação representa. A geometria será salva no banco.
            </p>

            {pastosSemGeometria.length === 0 ? (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-200">
                Todos os pastos já possuem geometria. Para reassociar, remova a geometria existente na página de Pastos.
              </div>
            ) : (
              <Select
                label="Pasto"
                value={pastoSelecionadoAssoc}
                onChange={(value) => setPastoSelecionadoAssoc(value)}
                options={[
                  { value: '', label: 'Selecione um pasto...' },
                  ...pastosSemGeometria.map((p) => ({ value: p.id, label: p.nome })),
                ]}
              />
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={onSalvarPasto}
                disabled={!pastoSelecionadoAssoc || salvando || pastosSemGeometria.length === 0}
              >
                {salvando ? 'Salvando...' : 'Salvar Geometria'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
