interface SkeletonProps {
  className?: string
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`bg-surface-3 animate-pulse rounded ${className}`}
    />
  )
}

export function CardSkeleton() {
  return (
    <div className="bg-surface-1 rounded-2xl p-6 shadow-lg border-2 border-border-base">
      <Skeleton className="h-6 w-3/4 mb-4" />
      <Skeleton className="h-4 w-1/2 mb-2" />
      <Skeleton className="h-4 w-1/3" />
    </div>
  )
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-surface-1 rounded-2xl shadow-lg border-2 border-border-base overflow-hidden">
      <div className="p-4 border-b border-border-base">
        <Skeleton className="h-6 w-32" />
      </div>
      <div className="divide-y divide-border-base">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="p-4 flex items-center gap-4">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-1/4" />
          </div>
        ))}
      </div>
    </div>
  )
}
