import type { ReactNode } from 'react'
import { Button, ErrorState, EmptyState, PageSkeleton } from './'

interface DetailLayoutProps {
  loading: boolean
  loadError: string | null
  notFound: boolean
  onBack: () => void
  backLabel?: string
  title: string
  /** Conteúdo da página. Pode ser ReactNode ou função que retorna ReactNode (render prop, evita avaliação eager quando registro é null) */
  children: ReactNode | (() => ReactNode)
  /** Ações extras no header (ex: Editar, Excluir) */
  actions?: ReactNode
  /** Handler de retry para erro. Se não fornecido, usa onBack. */
  onRetry?: () => void
}

/**
 * Layout padronizado para páginas de detalhes de caderneta.
 * Trata loading, erro, não-encontrado e o header com botão voltar.
 */
export function DetailLayout({
  loading,
  loadError,
  notFound,
  onBack,
  backLabel = 'Voltar',
  title,
  children,
  actions,
  onRetry,
}: DetailLayoutProps) {
  if (loading) {
    return <PageSkeleton variant="detail" />
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <Button variant="secondary" onClick={onBack}>{backLabel}</Button>
        <ErrorState message={loadError} onRetry={onRetry || onBack} />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="space-y-6">
        <Button variant="secondary" onClick={onBack}>{backLabel}</Button>
        <EmptyState title="Registro não encontrado" />
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800">{title}</h2>
        <div className="flex gap-2">
          {actions}
          <Button variant="secondary" onClick={onBack}>{backLabel}</Button>
        </div>
      </div>
      {typeof children === 'function' ? (children as () => ReactNode)() : children}
    </div>
  )
}

interface DetailSectionProps {
  title: string
  children: ReactNode
  /** Se true, usa bg-gray-50 p-4 rounded-lg como wrapper (para seções destacadas) */
  highlighted?: boolean
  className?: string
}

/**
 * Seção padronizada de detalhes: título + grid de campos.
 */
export function DetailSection({ title, children, highlighted, className = '' }: DetailSectionProps) {
  return (
    <div>
      <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-3 sm:mb-4">{title}</h3>
      {highlighted ? (
        <div className={`bg-gray-50 p-4 rounded-lg ${className}`}>{children}</div>
      ) : (
        <div className={className}>{children}</div>
      )}
    </div>
  )
}

interface DetailFieldProps {
  label: string
  value?: ReactNode
}

/**
 * Campo individual de detalhe: label + valor em linha.
 */
export function DetailField({ label, value }: DetailFieldProps) {
  return (
    <p className="text-sm sm:text-base">
      <span className="font-medium text-gray-700">{label}:</span>{' '}
      {value ?? '-'}
    </p>
  )
}

/**
 * Helper para formatar valores opcionais: retorna '-' se null/undefined/vazio.
 */
export function formatValue(value?: string | number | null): string {
  if (value === null || value === undefined || value === '') return '-'
  return String(value)
}
