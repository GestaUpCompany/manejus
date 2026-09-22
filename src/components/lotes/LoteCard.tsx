import { memo } from 'react'
import { CardItem, Button } from '../ui'
import { usaCurral } from '../../utils/lotes'

interface LoteCategoria {
  categoria: string
  quant_atual?: number | null
  quant_inicial?: number | null
}

interface OcupacaoInfo {
  pasto?: { periodo_ocupacao_dias: number }
  modulo?: { modulo_nome: string; periodo_ocupacao_dias: number }
}

interface LoteCardProps {
  lote: {
    id: string
    nome: string
    ativo: boolean | null
    sistema_producao?: string | null
    peso_vivo_atual_kg_cab?: number | null
    pasto_nome?: string | null
    curral_nome?: string | null
    n_cabecas?: number | null
    qtd_bezerros?: number | null
    categorias?: LoteCategoria[]
  }
  ocupacao?: OcupacaoInfo
  onEdit: (lote: any) => void
  onToggleActive: (lote: any) => void
  onDelete: (id: string, nome: string) => void
}

function LoteCardComponent({ lote, ocupacao, onEdit, onToggleActive, onDelete }: LoteCardProps) {
  const total = lote.categorias?.reduce((sum, cat) => sum + (cat.quant_atual ?? cat.quant_inicial ?? 0), 0) || lote.n_cabecas || 0

  return (
    <CardItem
      title={lote.nome}
      subtitle={total > 0 ? `${total} cabeças` : undefined}
      status={lote.ativo ?? undefined}
      onClick={() => onEdit(lote)}
    >
      <div className="space-y-2 mb-4 flex-1">
        {lote.sistema_producao && (
          <p className="text-sm text-content-muted">
            <span className="font-medium">Sistema:</span>{' '}
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${lote.sistema_producao === 'TIP' ? 'bg-sky-100 dark:bg-sky-500/20 text-sky-800 dark:text-sky-200' : usaCurral(lote.sistema_producao) ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-200' : 'bg-green-100 dark:bg-green-500/20 text-green-800 dark:text-green-200'}`}>
              {lote.sistema_producao === 'TIP' ? 'TIP' : usaCurral(lote.sistema_producao) ? 'Confinamento' : 'Pasto'}
            </span>
          </p>
        )}
        {lote.peso_vivo_atual_kg_cab && (
          <p className="text-sm text-content-muted">
            <span className="font-medium">Peso Vivo:</span> {lote.peso_vivo_atual_kg_cab} kg
          </p>
        )}
        {lote.pasto_nome && (
          <p className="text-sm text-content-muted">
            <span className="font-medium">Pasto:</span> {lote.pasto_nome}
          </p>
        )}
        {lote.curral_nome && (
          <p className="text-sm text-content-muted">
            <span className="font-medium">Curral:</span> {lote.curral_nome}
          </p>
        )}
        {ocupacao?.pasto && (
          <p className="text-sm text-content-muted">
            <span className="font-medium">Tempo no pasto:</span> {ocupacao.pasto.periodo_ocupacao_dias} dias
          </p>
        )}
        {ocupacao?.modulo && (
          <p className="text-sm text-content-muted">
            <span className="font-medium">Módulo:</span> {ocupacao.modulo.modulo_nome}
          </p>
        )}
        {ocupacao?.modulo && (
          <p className="text-sm text-content-muted">
            <span className="font-medium">Tempo no módulo:</span> {ocupacao.modulo.periodo_ocupacao_dias} dias
          </p>
        )}
        {lote.categorias && lote.categorias.length > 0 && (
          <div>
            <p className="text-sm font-medium text-content mb-2">Categorias:</p>
            <div className="flex flex-wrap gap-1">
              {lote.categorias.map((cat, index) => (
                <span key={index} className="px-2 py-1 bg-surface-2 rounded text-xs capitalize">
                  {cat.categoria}
                </span>
              ))}
            </div>
          </div>
        )}
        {lote.qtd_bezerros && (
          <p className="text-sm text-content-muted">
            <span className="font-medium">Bezerros:</span> {lote.qtd_bezerros}
          </p>
        )}
      </div>

      <div className="flex gap-2 mt-auto pt-3">
        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); onEdit(lote) }}
        >
          Editar
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="text-red-500 dark:text-red-400 hover:text-red-400 dark:hover:text-red-300"
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); onToggleActive(lote) }}
        >
          {lote.ativo ? 'Desativar' : 'Ativar'}
        </Button>
        {!lote.ativo && (
          <Button
            variant="danger"
            size="sm"
            className="flex-1"
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => { e.stopPropagation(); onDelete(lote.id, lote.nome) }}
          >
            Excluir
          </Button>
        )}
      </div>
    </CardItem>
  )
}

export const LoteCard = memo(LoteCardComponent)
