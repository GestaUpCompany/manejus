import { useEffect, useId, useRef, useState } from 'react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  contentClassName?: string
}

export function Modal({ isOpen, onClose, title, children, size = 'md', contentClassName = '' }: ModalProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const [touchStartY, setTouchStartY] = useState(0)
  const titleId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (isOpen) {
      // Focar no botão de cancelar quando modal abrir
      cancelButtonRef.current?.focus()

      // Adicionar listener para ESC
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onCloseRef.current()
        }
      }

      // Focus trap: Tab no último focável volta ao primeiro, Shift+Tab no primeiro volta ao último
      const handleTab = (e: KeyboardEvent) => {
        if (e.key !== 'Tab' || !modalRef.current) return
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }

      document.addEventListener('keydown', handleEscape)
      document.addEventListener('keydown', handleTab)

      // Prevenir scroll do body
      document.body.style.overflow = 'hidden'

      return () => {
        document.removeEventListener('keydown', handleEscape)
        document.removeEventListener('keydown', handleTab)
        document.body.style.overflow = 'unset'
      }
    }
  }, [isOpen])

  // Swipe down gesture para fechar modal em mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartY(e.touches[0].clientY)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY === 0) return
    const touchY = e.touches[0].clientY
    const diff = touchY - touchStartY
    
    // Se swipe down mais de 100px, fecha o modal
    if (diff > 100) {
      onClose()
    }
  }

  const handleTouchEnd = () => {
    setTouchStartY(0)
  }

  if (!isOpen) return null

  const sizeClasses = {
    sm: 'max-w-md w-full mx-4',
    md: 'max-w-lg w-full mx-4',
    lg: 'max-w-2xl w-full mx-4',
    xl: 'max-w-6xl w-full mx-4',
    full: 'max-w-[95vw] w-full mx-2',
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl ${sizeClasses[size]} animate-in fade-in zoom-in duration-200 max-h-[90vh] flex flex-col`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 shrink-0">
          <h2 id={titleId} className="text-lg sm:text-xl font-semibold text-gray-900">{title}</h2>
          <button
            ref={cancelButtonRef}
            onClick={onClose}
            className="text-gray-400 rounded transition-all p-1"
            aria-label="Fechar modal"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className={`p-4 sm:p-6 overflow-y-auto flex-1 ${contentClassName}`}>{children}</div>
      </div>
    </div>
  )
}

interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'info'
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'danger',
}: ConfirmModalProps) {
  if (!isOpen) return null

  const variantStyles = {
    danger: {
      icon: '⚠️',
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600',
      confirmBg: 'bg-red-600',
    },
    warning: {
      icon: '⚠️',
      iconBg: 'bg-yellow-100',
      iconColor: 'text-yellow-600',
      confirmBg: 'bg-yellow-600',
    },
    info: {
      icon: 'ℹ️',
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      confirmBg: 'bg-blue-600',
    },
  }

  const style = variantStyles[variant]

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="flex items-start gap-4">
        <div className={`flex-shrink-0 w-12 h-12 rounded-full ${style.iconBg} flex items-center justify-center`}>
          <span className="text-2xl">{style.icon}</span>
        </div>
        <div className="flex-1">
          <p className="text-gray-700 whitespace-pre-line">{message}</p>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row justify-end gap-3 mt-6">
        <button
          onClick={onClose}
          className="flex-1 sm:flex-none px-4 py-2 text-gray-700 bg-gray-100 rounded-lg transition-all min-h-[44px]"
        >
          {cancelText}
        </button>
        <button
          onClick={() => {
            onConfirm()
            onClose()
          }}
          className={`flex-1 sm:flex-none px-4 py-2 text-white rounded-lg transition-colors min-h-[44px] ${style.confirmBg}`}
        >
          {confirmText}
        </button>
      </div>
    </Modal>
  )
}
