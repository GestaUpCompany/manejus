import { memo } from 'react'
import { Input, Button } from '../ui'

interface LoteFiltersProps {
  searchTerm: string
  onSearchChange: (value: string) => void
  showInactive: boolean
  onToggleInactive: () => void
  filtroLocal: 'todos' | 'pasto' | 'confinamento'
  onFiltroChange: (filtro: 'todos' | 'pasto' | 'confinamento') => void
  counts: { todos: number; pasto: number; confinamento: number }
  onNewLote: () => void
  onExport: () => void
  exportDisabled: boolean
}

function LoteFiltersComponent({
  searchTerm,
  onSearchChange,
  showInactive,
  onToggleInactive,
  filtroLocal,
  onFiltroChange,
  counts,
  onNewLote,
  onExport,
  exportDisabled,
}: LoteFiltersProps) {
  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold text-content-strong">Lotes</h2>
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          <Input
            type="text"
            placeholder="Buscar por lote, pasto ou curral..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="flex-1 border-border-base focus:border-accent h-10"
          />
          <div className="flex gap-2 sm:gap-2">
            <Button onClick={onNewLote} className="h-10 flex-1 sm:flex-none">Novo Lote</Button>
            <Button onClick={onExport} disabled={exportDisabled} className="h-10 flex-1 sm:flex-none">
              Exportar Tudo
            </Button>
          </div>
        </div>
      </div>

      <div className="flex justify-start sm:justify-end">
        <button
          type="button"
          onClick={onToggleInactive}
          className={`px-2 sm:px-4 py-2 rounded-lg font-medium text-xs sm:text-sm transition-all duration-200 border-2 whitespace-nowrap min-h-[44px] ${
            showInactive
              ? 'bg-primary text-white border-primary hover:bg-primary/90'
              : 'bg-surface-1 text-content border-surface-3 hover:bg-surface-2'
          }`}
        >
          {showInactive ? (
            <>
              <span className="sm:hidden">✓ Mostrando</span>
              <span className="hidden sm:inline">✓ Mostrando Desativados</span>
            </>
          ) : (
            <>
              <span className="sm:hidden">Mostrar</span>
              <span className="hidden sm:inline">Mostrar Desativados</span>
            </>
          )}
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => onFiltroChange('todos')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border min-h-[44px] ${filtroLocal === 'todos' ? 'bg-primary text-white border-primary' : 'bg-surface-1 text-content-muted border-border-base hover:bg-surface-2'}`}
        >
          Todos <span className="opacity-60 ml-1">{counts.todos}</span>
        </button>
        <button
          onClick={() => onFiltroChange('pasto')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border min-h-[44px] ${filtroLocal === 'pasto' ? 'bg-primary text-white border-primary' : 'bg-surface-1 text-content-muted border-border-base hover:bg-surface-2'}`}
        >
          Pasto <span className="opacity-60 ml-1">{counts.pasto}</span>
        </button>
        <button
          onClick={() => onFiltroChange('confinamento')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border min-h-[44px] ${filtroLocal === 'confinamento' ? 'bg-amber-700 dark:bg-amber-600 text-white border-amber-700 dark:border-amber-600' : 'bg-surface-1 text-content-muted border-border-base hover:bg-surface-2'}`}
        >
          Confinamento <span className="opacity-60 ml-1">{counts.confinamento}</span>
        </button>
      </div>
    </>
  )
}

export const LoteFilters = memo(LoteFiltersComponent)
