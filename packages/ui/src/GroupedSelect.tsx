import { useState, useRef, useEffect } from 'react'

interface GroupedOption {
  id: string
  name: string
  category: string
}

interface GroupedSelectProps {
  options: GroupedOption[]
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  className?: string
  label?: string
  required?: boolean
}

// Function to remove accents from a string
const removeAccents = (str: string): string => {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export function GroupedSelect({
  options,
  value,
  onChange,
  placeholder = 'Selecione...',
  className = '',
  label,
  required,
}: GroupedSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Group options by category
  const groupedOptions = options.reduce((acc, option) => {
    if (!acc[option.category]) {
      acc[option.category] = []
    }
    acc[option.category].push(option)
    return acc
  }, {} as Record<string, GroupedOption[]>)

  // Filter options based on search term (accent-insensitive)
  const filteredGroups = Object.entries(groupedOptions).reduce(
    (acc, [category, items]) => {
      const normalizedSearchTerm = removeAccents(searchTerm)
      const filteredItems = items.filter(
        (item) =>
          removeAccents(item.name).includes(normalizedSearchTerm) ||
          removeAccents(category).includes(normalizedSearchTerm)
      )
      if (filteredItems.length > 0) {
        acc[category] = filteredItems
      }
      return acc
    },
    {} as Record<string, GroupedOption[]>
  )

  // Get selected option
  const selectedOption = options.find((opt) => opt.name === value)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (option: GroupedOption) => {
    onChange?.(option.name)
    setIsOpen(false)
    setSearchTerm('')
  }

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-content mb-1">
          {label}
        </label>
      )}
      <div className="relative" ref={dropdownRef}>
        {required && (
          <input type="hidden" required={required} value={value || ''} />
        )}
        {/* Trigger button */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full px-3 py-2 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary input-focus min-h-[44px] text-sm text-left border-border-base focus:border-accent bg-surface-1 text-content ${className}`}
        >
          {selectedOption ? (
            <span className="flex items-center gap-2">
              <span className="text-xs font-bold text-white bg-surface-3 px-2.5 py-1 rounded-md shadow-sm">
                {selectedOption.category}
              </span>
              <span>{selectedOption.name}</span>
            </span>
          ) : (
            <span className="text-content-faint">{placeholder}</span>
          )}
        </button>

        {/* Dropdown */}
        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-surface-1 border border-border-base rounded-lg shadow-lg max-h-60 overflow-auto">
            {/* Search input */}
            <div className="p-2 border-b border-border-subtle sticky top-0 bg-surface-1">
              <input
                type="text"
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-border-base rounded-lg focus:outline-none focus:border-accent text-sm bg-surface-1 text-content-strong"
                autoFocus
              />
            </div>

            {/* Options */}
            {Object.keys(filteredGroups).length === 0 ? (
              <div className="p-4 text-center text-content-muted text-sm">
                Nenhum resultado encontrado
              </div>
            ) : (
              Object.entries(filteredGroups).map(([category, items]) => (
                <div key={category}>
                  {/* Category header */}
                  <div className="px-3 py-2.5 bg-surface-2 text-xs font-bold text-content uppercase tracking-wider sticky top-0 border-b border-border-base">
                    {category}
                  </div>
                  {/* Category items */}
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelect(item)}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-surface-2 transition-colors ${
                        value === item.name ? 'bg-primary/10 text-primary dark:text-primary-light font-medium' : 'text-content'
                      }`}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
