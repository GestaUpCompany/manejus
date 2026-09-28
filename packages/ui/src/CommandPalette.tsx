import { useEffect, useMemo, useRef, useState } from 'react'

export interface CommandItem {
  label: string
  path: string
  section?: string
  icon?: React.ReactNode
}

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  items: CommandItem[]
  onSelect: (path: string) => void
}

// Normaliza string para busca: lowercase, sem acentos, sem espaços extras.
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

// Fuzzy simples: cada char da query deve aparecer em ordem no target.
// Score = comprimento do match contíguo (prioriza matches consecutivos).
function fuzzyScore(query: string, target: string): number {
  if (!query) return 1
  const q = normalize(query)
  const t = normalize(target)
  if (!q) return 1
  // Match direto (substring) tem prioridade máxima.
  if (t.includes(q)) return 1000 - t.indexOf(q)
  // Fuzzy: percorre target consumindo chars da query em ordem.
  let qi = 0
  let contiguous = 0
  let maxContiguous = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      contiguous++
      maxContiguous = Math.max(maxContiguous, contiguous)
      qi++
    } else {
      contiguous = 0
    }
  }
  if (qi === q.length) return maxContiguous
  return -1
}

export function CommandPalette({ isOpen, onClose, items, onSelect }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Resetar query e índice ao abrir.
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setActiveIndex(0)
      // Focar input após render.
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isOpen])

  const filtered = useMemo(() => {
    if (!query.trim()) return items
    return items
      .map((item) => ({ item, score: fuzzyScore(query, item.label) }))
      .filter((r) => r.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.item)
  }, [query, items])

  // Resetar índice quando resultado muda.
  useEffect(() => {
    setActiveIndex(0)
  }, [filtered])

  // Garantir que o item ativo está visível na lista.
  useEffect(() => {
    if (!listRef.current) return
    const activeEl = listRef.current.children[activeIndex] as HTMLElement | undefined
    activeEl?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = filtered[activeIndex]
      if (item) {
        onSelect(item.path)
        onClose()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[15vh] px-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Palette */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Busca de navegação"
        className="relative w-full max-w-lg bg-surface-1 rounded-xl shadow-2xl border border-border-base animate-in fade-in zoom-in duration-150 overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 border-b border-border-subtle">
          <svg className="w-5 h-5 text-content-faint flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar página... (ex.: curral, lotes, relatórios)"
            className="w-full py-4 text-sm text-content-strong placeholder-content-faint bg-transparent outline-none"
            aria-label="Buscar página"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="px-2 py-1 text-xs text-content-faint bg-surface-2 border border-border-base rounded font-mono flex-shrink-0">
            ESC
          </kbd>
        </div>

        {/* Resultados */}
        <div ref={listRef} role="listbox" aria-label="Páginas disponíveis" className="max-h-[50vh] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-content-faint" role="status">
              Nenhuma página encontrada para "{query}"
            </div>
          ) : (
            filtered.map((item, index) => {
              const isActive = index === activeIndex
              return (
                <button
                  key={item.path}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => {
                    onSelect(item.path)
                    onClose()
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                    isActive ? 'bg-primary/10 text-primary' : 'text-content hover:bg-surface-2'
                  }`}
                >
                  {item.icon && (
                    <span className={`flex-shrink-0 ${isActive ? 'text-primary' : 'text-content-faint'}`} aria-hidden="true">
                      {item.icon}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="block text-sm font-medium truncate">{item.label}</span>
                    {item.section && (
                      <span className="block text-xs text-content-faint truncate">{item.section}</span>
                    )}
                  </div>
                  {isActive && (
                    <svg className="w-4 h-4 text-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </button>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border-subtle flex items-center justify-between text-xs text-content-faint">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-surface-2 border border-border-base rounded font-mono">↑↓</kbd>
              navegar
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-surface-2 border border-border-base rounded font-mono">↵</kbd>
              abrir
            </span>
          </div>
          <span>{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  )
}
