// Side panel: detalhes da morte (ponto no mapa com coordenadas GPS)
import { Card } from '../../../components/ui'

interface MorteDetalhe {
  id: string
  data: string
  causaMorte: string | null
  brinco: string | null
  chip: string | null
  categoria: string | null
  sexo: string | null
  raca: string | null
  idade: string | null
  pasto: string | null
  lote: string | null
  pesoVivo: number | null
  fotoUrl: string | null
}

interface Props {
  detalhe: MorteDetalhe
  modoTelaCheia: boolean
  onFechar: () => void
}

function formatarData(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return iso
  }
}

export function MorteDetalhePanel({ detalhe, modoTelaCheia, onFechar }: Props) {
  return (
    <div className={modoTelaCheia
      ? 'absolute top-2 right-2 bottom-2 w-80 z-10 overflow-y-auto shadow-xl'
      : 'w-full lg:w-80 flex-shrink-0'
    }>
      <Card>
        <div className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div>
                <h2 className="text-lg font-bold text-content-strong">Registro de Morte</h2>
                <p className="text-xs text-content-muted">{formatarData(detalhe.data)}</p>
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

          {detalhe.fotoUrl && (
            <div className="mb-3">
              <img
                src={detalhe.fotoUrl}
                alt="Foto do animal"
                className="w-full rounded-lg border border-border-base"
              />
            </div>
          )}

          <div className="space-y-2 text-sm">
            {detalhe.causaMorte && (
              <div className="flex justify-between">
                <span className="text-content-muted">Causa:</span>
                <span className="font-semibold text-content-strong">{detalhe.causaMorte}</span>
              </div>
            )}
            {detalhe.brinco && (
              <div className="flex justify-between">
                <span className="text-content-muted">Brinco:</span>
                <span className="font-semibold text-content-strong">{detalhe.brinco}</span>
              </div>
            )}
            {detalhe.chip && (
              <div className="flex justify-between">
                <span className="text-content-muted">Chip:</span>
                <span className="font-semibold text-content-strong">{detalhe.chip}</span>
              </div>
            )}
            {detalhe.categoria && (
              <div className="flex justify-between">
                <span className="text-content-muted">Categoria:</span>
                <span className="font-semibold text-content-strong">{detalhe.categoria}</span>
              </div>
            )}
            {detalhe.sexo && (
              <div className="flex justify-between">
                <span className="text-content-muted">Sexo:</span>
                <span className="font-semibold text-content-strong">{detalhe.sexo}</span>
              </div>
            )}
            {detalhe.raca && (
              <div className="flex justify-between">
                <span className="text-content-muted">Raça:</span>
                <span className="font-semibold text-content-strong">{detalhe.raca}</span>
              </div>
            )}
            {detalhe.idade && (
              <div className="flex justify-between">
                <span className="text-content-muted">Idade:</span>
                <span className="font-semibold text-content-strong">{detalhe.idade}</span>
              </div>
            )}
            {detalhe.pesoVivo != null && (
              <div className="flex justify-between">
                <span className="text-content-muted">Peso vivo:</span>
                <span className="font-semibold text-content-strong">{detalhe.pesoVivo} kg</span>
              </div>
            )}
            {detalhe.pasto && (
              <div className="flex justify-between">
                <span className="text-content-muted">Pasto:</span>
                <span className="font-semibold text-content-strong">{detalhe.pasto}</span>
              </div>
            )}
            {detalhe.lote && (
              <div className="flex justify-between">
                <span className="text-content-muted">Lote:</span>
                <span className="font-semibold text-content-strong">{detalhe.lote}</span>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
