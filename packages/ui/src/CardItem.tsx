import { ReactNode } from 'react'
import { Card } from './Card'

interface CardItemProps {
  title: string
  subtitle?: string | ReactNode
  status?: boolean
  statusLabel?: 'Ativo' | 'Inativo'
  headerActions?: ReactNode
  onClick?: () => void
  children?: ReactNode
  className?: string
}

export function CardItem({
  title,
  subtitle,
  status,
  statusLabel = 'Ativo',
  headerActions,
  onClick,
  children,
  className = '',
}: CardItemProps) {
  return (
    <Card
      className={`bg-surface-1 p-4 sm:p-6 border-0 shadow-sm cursor-pointer transition-all h-full ${onClick ? '' : 'cursor-default'} ${className}`}
      onClick={onClick}
    >
      <div className="flex flex-col h-full">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-content-strong text-base sm:text-lg break-words">{title}</h3>
            {subtitle && (
              <div className="text-xs sm:text-sm text-content-muted break-words">{subtitle}</div>
            )}
          </div>
          <div className="flex gap-2 items-center">
            {headerActions}
            {status !== undefined && (
              <span
                className={`px-2 sm:px-3 py-1 rounded-full text-xs font-medium self-start md:self-auto ${
                  status ? 'bg-green-100 dark:bg-green-500/20 text-green-800 dark:text-green-200' : 'bg-red-100 dark:bg-red-500/20 text-red-800 dark:text-red-200'
                }`}
              >
                {status ? statusLabel : 'Inativo'}
              </span>
            )}
          </div>
        </div>
        <div className="flex-1 flex flex-col">
          {children}
        </div>
      </div>
    </Card>
  )
}
