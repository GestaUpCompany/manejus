import { useEffect, useRef, useState } from 'react'

interface DropdownOption {
  label: string
  icon?: React.ReactNode
  onClick?: () => void
  danger?: boolean
}

interface DropdownProps {
  trigger: React.ReactNode
  options: DropdownOption[]
  align?: 'left' | 'right'
}

export function Dropdown({ trigger, options, align = 'right' }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  return (
    <div className="relative" ref={dropdownRef}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setIsOpen(!isOpen)
          }
        }}
      >
        {trigger}
      </div>

      {isOpen && (
        <>
          {/* Backdrop para mobile */}
          <div
            className="fixed inset-0 z-40 sm:hidden"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div
            className={`absolute z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 mt-2 w-56 right-0 ${
              align === 'right' ? 'right-0' : 'right-0'
            }`}
          >
            {options.map((option, index) => (
              <div key={index}>
                {option.onClick ? (
                  <button
                    onClick={() => {
                      option.onClick?.()
                      setIsOpen(false)
                    }}
                    className={`w-full px-4 py-3 sm:py-2 text-left flex items-center gap-3 transition-all hover-scale button-press min-h-[44px] ${
                      option.danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {option.icon}
                    <span className="font-medium text-sm sm:text-base">{option.label}</span>
                  </button>
                ) : (
                  <div className="px-4 py-2 border-t border-gray-200 mt-1 pt-2 text-sm">
                    {option.label}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
