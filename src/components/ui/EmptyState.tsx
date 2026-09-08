import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  description?: string
  action?: ReactNode
  icon?: ReactNode
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="text-center py-12 px-4">
      {icon && (
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 mb-4">
          {icon}
        </div>
      )}
      <p className="text-gray-600 font-medium mb-2">{title}</p>
      {description && <p className="text-sm text-gray-500 mb-4">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
