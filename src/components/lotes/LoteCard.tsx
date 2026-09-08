import { memo } from 'react'
import { CardItem } from '../ui'

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
          <p className="text-sm text-gray-500">
            <span className="font-medium">Sistema:</span>{' '}
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${lote.sistema_producao === 'Confinamento' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
              {lote.sistema_producao === 'Confinamento' ? 'Confinamento' : 'Pasto'}
            </span>
          </p>
        )}
        {lote.peso_vivo_atual_kg_cab && (
          <p className="text-sm text-gray-500">
            <span className="font-medium">Peso Vivo:</span> {lote.peso_vivo_atual_kg_cab} kg
          </p>
        )}
        {lote.pasto_nome && (
          <p className="text-sm text-gray-500">
            <span className="font-medium">Pasto:</span> {lote.pasto_nome}
          </p>
        )}
        {lote.curral_nome && (
          <p className="text-sm text-gray-500">
            <span className="font-medium">Curral:</span> {lote.curral_nome}
          </p>
        )}
        {ocupacao?.pasto && (
          <p className="text-sm text-gray-500">
            <span className="font-medium">Tempo no pasto:</span> {ocupacao.pasto.periodo_ocupacao_dias} dias
          </p>
        )}
        {ocupacao?.modulo && (
          <p className="text-sm text-gray-500">
            <span className="font-medium">Módulo:</span> {ocupacao.modulo.modulo_nome}
          </p>
        )}
        {ocupacao?.modulo && (
          <p className="text-sm text-gray-500">
            <span className="font-medium">Tempo no módulo:</span> {ocupacao.modulo.periodo_ocupacao_dias} dias
          </p>
        )}
        {lote.categorias && lote.categorias.length > 0 && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Categorias:</p>
            <div className="flex flex-wrap gap-1">
              {lote.categorias.map((cat, index) => (
                <span key={index} className="px-2 py-1 bg-gray-100 rounded text-xs capitalize">
                  {cat.categoria}
                </span>
              ))}
            </div>
          </div>
        )}
        {lote.qtd_bezerros && (
          <p className="text-sm text-gray-500">
            <span className="font-medium">Bezerros:</span> {lote.qtd_bezerros}
          </p>
        )}
      </div>

      <div className="flex gap-2 mt-auto pt-3">
        <button
          className="rounded-lg font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 hover-scale-sm button-press whitespace-nowrap min-h-[44px] px-3 py-2 text-sm bg-gray-200 text-gray-800 focus:ring-gray-500 hover:shadow-md hover:bg-gray-300 flex-1"
          onClick={(e) => { e.stopPropagation(); onEdit(lote) }}
        >
          Editar
        </button>
        <button
          className="rounded-lg font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 hover-scale-sm button-press whitespace-nowrap min-h-[44px] px-3 py-2 text-sm bg-gray-200 text-gray-800 focus:ring-gray-500 hover:shadow-md hover:bg-gray-300 text-red-600 hover:text-red-700"
          onClick={(e) => { e.stopPropagation(); onToggleActive(lote) }}
        >
          {lote.ativo ? 'Desativar' : 'Ativar'}
        </button>
        {!lote.ativo && (
          <button
            className="rounded-lg font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 hover-scale-sm button-press whitespace-nowrap min-h-[44px] px-3 py-2 text-sm bg-red-600 text-white focus:ring-red-500 hover:shadow-md hover:bg-red-700 flex-1"
            onClick={(e) => { e.stopPropagation(); onDelete(lote.id, lote.nome) }}
          >
            Excluir
          </button>
        )}
      </div>
    </CardItem>
  )
}

export const LoteCard = memo(LoteCardComponent)
