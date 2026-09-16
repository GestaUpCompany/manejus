import type { ThHTMLAttributes, TdHTMLAttributes, TableHTMLAttributes, HTMLAttributes } from 'react'

export function Table({ className = '', children, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <table className={`min-w-full divide-y divide-border-base ${className}`} {...props}>
      {children}
    </table>
  )
}

export function Thead({ className = '', children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={`bg-surface-2 ${className}`} {...props}>
      {children}
    </thead>
  )
}

export function Tbody({ className = '', children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={`bg-surface-1 divide-y divide-border-base ${className}`} {...props}>
      {children}
    </tbody>
  )
}

export function Tr({ className = '', children, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={`hover:bg-surface-2 transition-colors ${className}`} {...props}>
      {children}
    </tr>
  )
}

export function Th({ className = '', children, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={`px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider ${className}`}
      {...props}
    >
      {children}
    </th>
  )
}

export function Td({ className = '', children, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={`px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-content-strong ${className}`} {...props}>
      {children}
    </td>
  )
}
