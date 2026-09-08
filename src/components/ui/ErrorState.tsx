interface ErrorStateProps {
  message?: string
  detail?: string
  onRetry?: () => void
}

export function ErrorState({ message = 'Erro ao carregar dados', detail, onRetry }: ErrorStateProps) {
  return (
    <div className="text-center py-12 px-4">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mb-4">
        <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p className="text-red-600 font-medium mb-2">{message}</p>
      {detail && <p className="text-sm text-gray-500 mb-4">{detail}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary/90 transition-colors"
        >
          Tentar novamente
        </button>
      )}
    </div>
  )
}
