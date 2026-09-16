import { Button } from './Button'

interface PaginationProps {
  /** Página atual (1-based) */
  page: number
  totalItems: number
  perPage: number
  onPageChange: (page: number) => void
  onPerPageChange?: (perPage: number) => void
  perPageOptions?: number[]
}

/**
 * Paginação padronizada com botões anterior/próxima, info de itens e seletor de itens por página.
 */
export function Pagination({
  page,
  totalItems,
  perPage,
  onPageChange,
  onPerPageChange,
  perPageOptions = [10, 25, 50, 100],
}: PaginationProps) {
  const totalPages = Math.ceil(totalItems / perPage) || 1
  const startItem = totalItems === 0 ? 0 : (page - 1) * perPage + 1
  const endItem = Math.min(page * perPage, totalItems)

  if (totalPages <= 1 && !onPerPageChange) return null

  return (
    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-surface-1 rounded-xl border border-border-base p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm text-content-muted">
        <span>
          {startItem}–{endItem} de {totalItems}
        </span>
        {onPerPageChange && (
          <>
            <span className="text-content-faint">|</span>
            <div className="flex items-center gap-2">
              <label htmlFor="per-page">Por página:</label>
              <select
                id="per-page"
                value={perPage}
                onChange={(e) => onPerPageChange(Number(e.target.value))}
                className="border border-surface-3 rounded-lg px-2 py-1 text-sm bg-surface-2 text-content-strong focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {perPageOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
          >
            Anterior
          </Button>
          <span className="text-sm text-content-muted px-2">
            Página {page} de {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
          >
            Próxima
          </Button>
        </div>
      )}
    </div>
  )
}

interface LoadMoreProps {
  hasMore: boolean
  loading?: boolean
  onLoadMore: () => void
  label?: string
}

/**
 * Botão "Carregar mais" padronizado para paginação incremental.
 */
export function LoadMore({ hasMore, loading, onLoadMore, label = 'Carregar mais' }: LoadMoreProps) {
  if (!hasMore || loading) return null
  return (
    <div className="text-center py-4">
      <Button onClick={onLoadMore} variant="secondary" size="sm">
        {label}
      </Button>
    </div>
  )
}
