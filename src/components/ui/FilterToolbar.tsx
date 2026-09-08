import type { ReactNode } from 'react'
import { Card } from './Card'
import { Button } from './Button'

interface FilterToolbarProps {
  title?: string
  onExport?: () => void
  exportDisabled?: boolean
  onClear?: () => void
  clearDisabled?: boolean
  children: ReactNode
  /** Número de colunas no grid de filtros (default: 4) */
  columns?: 2 | 3 | 4
  className?: string
}

/**
 * Card padronizado para toolbars de filtro.
 * Renderiza um título "Filtros", botões opcionais (exportar/limpar) e um grid de filtros.
 */
export function FilterToolbar({
  title = 'Filtros',
  onExport,
  exportDisabled,
  onClear,
  clearDisabled,
  children,
  columns = 4,
  className = '',
}: FilterToolbarProps) {
  const gridCols = `grid-cols-1 sm:grid-cols-2 ${columns === 4 ? 'md:grid-cols-4' : columns === 3 ? 'md:grid-cols-3' : ''}`

  return (
    <Card className={`bg-white p-4 sm:p-6 ${className}`} disableHover>
      {(title || onExport || onClear) && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
          {title && <h3 className="text-base sm:text-lg font-semibold text-gray-800">{title}</h3>}
          <div className="flex gap-2 w-full sm:w-auto">
            {onClear && (
              <Button
                variant="secondary"
                onClick={onClear}
                disabled={clearDisabled}
                className="w-full sm:w-auto text-sm"
              >
                Limpar Filtros
              </Button>
            )}
            {onExport && (
              <Button
                onClick={onExport}
                disabled={exportDisabled}
                className="w-full sm:w-auto text-sm"
              >
                Exportar XLSX
              </Button>
            )}
          </div>
        </div>
      )}
      <div className={`grid ${gridCols} gap-3 sm:gap-4`}>
        {children}
      </div>
    </Card>
  )
}

/**
 * Field wrapper para usar dentro de FilterToolbar.
 * Aplica o label padronizado com altura mínima consistente.
 */
export function FilterField({
  label,
  children,
  className = '',
}: {
  label?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 min-h-[2.5rem] leading-tight line-clamp-2">
          {label}
        </label>
      )}
      {children}
    </div>
  )
}
