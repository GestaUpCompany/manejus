import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react'

type ToastVariant = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: number
  message: string
  variant: ToastVariant
}

interface ToastContextValue {
  toast: {
    success: (message: string) => void
    error: (message: string) => void
    warning: (message: string) => void
    info: (message: string) => void
  }
}

const ToastContext = createContext<ToastContextValue | null>(null)

const variantStyles: Record<ToastVariant, { bg: string; border: string; text: string; icon: string }> = {
  success: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', icon: '✓' },
  error: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', icon: '✕' },
  warning: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', icon: '⚠' },
  info: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', icon: 'ℹ' },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const show = useCallback(
    (message: string, variant: ToastVariant) => {
      const id = Date.now() + Math.random()
      setToasts((prev) => [...prev, { id, message, variant }])
      const duration = variant === 'error' ? 6000 : 4000
      setTimeout(() => dismiss(id), duration)
    },
    [dismiss],
  )

  const toast = {
    success: (message: string) => show(message, 'success'),
    error: (message: string) => show(message, 'error'),
    warning: (message: string) => show(message, 'warning'),
    info: (message: string) => show(message, 'info'),
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => {
          const s = variantStyles[t.variant]
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-3 ${s.bg} ${s.border} ${s.text} border rounded-lg shadow-lg px-4 py-3 max-w-sm min-w-[280px] animate-[slideIn_0.2s_ease-out]`}
              role="alert"
            >
              <span className="font-bold text-lg leading-none mt-0.5">{s.icon}</span>
              <p className="text-sm flex-1 leading-snug">{t.message}</p>
              <button
                onClick={() => dismiss(t.id)}
                className="text-current opacity-50 hover:opacity-100 transition-opacity flex-shrink-0"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast deve ser usado dentro de ToastProvider')
  return ctx.toast
}
