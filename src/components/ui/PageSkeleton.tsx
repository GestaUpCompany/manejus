interface PageSkeletonProps {
  variant?: 'list' | 'grid' | 'detail'
}

export function PageSkeleton({ variant = 'list' }: PageSkeletonProps) {
  if (variant === 'grid') {
    return (
      <div className="p-6 space-y-6">
        <div className="bg-gray-200 animate-pulse rounded-xl h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-2xl p-6 shadow-lg border-2 border-gray-200"
            >
              <div className="bg-gray-200 animate-pulse rounded h-6 w-3/4 mb-4" />
              <div className="bg-gray-200 animate-pulse rounded h-4 w-1/2 mb-2" />
              <div className="bg-gray-200 animate-pulse rounded h-4 w-1/3" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (variant === 'detail') {
    return (
      <div className="p-6 space-y-6">
        <div className="bg-gray-200 animate-pulse rounded-xl h-8 w-64" />
        <div className="bg-white rounded-2xl p-6 shadow-lg border-2 border-gray-200 space-y-4">
          <div className="bg-gray-200 animate-pulse rounded h-6 w-1/2" />
          <div className="bg-gray-200 animate-pulse rounded h-4 w-3/4" />
          <div className="bg-gray-200 animate-pulse rounded h-4 w-2/3" />
          <div className="bg-gray-200 animate-pulse rounded h-4 w-1/2" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="bg-gray-200 animate-pulse rounded-xl h-8 w-48" />
      <div className="bg-white rounded-2xl shadow-lg border-2 border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <div className="bg-gray-200 animate-pulse rounded h-6 w-32" />
        </div>
        <div className="divide-y divide-gray-200">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="p-4 flex items-center gap-4">
              <div className="bg-gray-200 animate-pulse rounded h-4 w-1/4" />
              <div className="bg-gray-200 animate-pulse rounded h-4 w-1/4" />
              <div className="bg-gray-200 animate-pulse rounded h-4 w-1/4" />
              <div className="bg-gray-200 animate-pulse rounded h-4 w-1/4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
