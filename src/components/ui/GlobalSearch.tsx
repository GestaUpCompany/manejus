import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../services/supabaseClient'
import { getFazendaIdForUser } from '../../utils/fazendaContext'

interface SearchResult {
  id: string
  type: string
  label: string
  subtitle?: string
  url: string
}

interface EntityConfig {
  table: string
  searchFields: string[]
  selectFields: string
  typeLabel: string
  buildUrl: (id: string) => string
  buildLabel: (row: any) => string
  buildSubtitle?: (row: any) => string | undefined
  extraFilter?: (query: any) => any
  limit?: number
}

const ENTITY_CONFIGS: EntityConfig[] = [
  {
    table: 'pastos',
    searchFields: ['nome'],
    selectFields: 'id, nome, area_total_ha',
    typeLabel: 'Pasto',
    buildUrl: (id) => `/controller/pastos?pasto=${id}`,
    buildLabel: (row) => row.nome,
    buildSubtitle: (row) => row.area_total_ha ? `${row.area_total_ha} ha` : undefined,
    extraFilter: (q) => q.is('deleted_at', null),
    limit: 5,
  },
  {
    table: 'lotes',
    searchFields: ['nome'],
    selectFields: 'id, nome, sistema_producao',
    typeLabel: 'Lote',
    buildUrl: (id) => `/controller/lotes?lote=${id}`,
    buildLabel: (row) => row.nome,
    buildSubtitle: (row) => row.sistema_producao || undefined,
    limit: 5,
  },
  {
    table: 'atividades',
    searchFields: ['titulo', 'descricao'],
    selectFields: 'id, titulo, status, prioridade',
    typeLabel: 'Atividade',
    buildUrl: (id) => `/controller/atividades?atividade=${id}`,
    buildLabel: (row) => row.titulo,
    buildSubtitle: (row) => {
      const parts: string[] = []
      if (row.status) parts.push(row.status)
      if (row.prioridade != null) parts.push(`Prioridade ${row.prioridade}`)
      return parts.length > 0 ? parts.join(' · ') : undefined
    },
    extraFilter: (q) => q.is('deleted_at', null),
    limit: 5,
  },
  {
    table: 'currais',
    searchFields: ['nome'],
    selectFields: 'id, nome',
    typeLabel: 'Curral',
    buildUrl: (id) => `/controller/currais?edit=${id}`,
    buildLabel: (row) => row.nome,
    extraFilter: (q) => q.is('deleted_at', null),
    limit: 5,
  },
  {
    table: 'bebedouros',
    searchFields: ['nome'],
    selectFields: 'id, nome',
    typeLabel: 'Bebedouro',
    buildUrl: (id) => `/controller/bebedouros-cadastro?edit=${id}`,
    buildLabel: (row) => row.nome,
    limit: 5,
  },
  {
    table: 'pluviometros',
    searchFields: ['nome'],
    selectFields: 'id, nome',
    typeLabel: 'Pluviômetro',
    buildUrl: (id) => `/controller/pluviometros?edit=${id}`,
    buildLabel: (row) => row.nome,
    limit: 5,
  },
  {
    table: 'funcionarios',
    searchFields: ['nome'],
    selectFields: 'id, nome, cargo',
    typeLabel: 'Funcionário',
    buildUrl: (id) => `/controller/funcionarios?edit=${id}`,
    buildLabel: (row) => row.nome,
    buildSubtitle: (row) => row.cargo || undefined,
    limit: 5,
  },
  {
    table: 'formulacoes',
    searchFields: ['nome'],
    selectFields: 'id, nome, categoria',
    typeLabel: 'Formulação',
    buildUrl: (id) => `/controller/formulacoes?edit=${id}`,
    buildLabel: (row) => row.nome,
    buildSubtitle: (row) => row.categoria || undefined,
    extraFilter: (q) => q.eq('ativo', true).is('deleted_at', null),
    limit: 5,
  },
  {
    table: 'setores',
    searchFields: ['nome'],
    selectFields: 'id, nome',
    typeLabel: 'Setor',
    buildUrl: (id) => `/controller/setores?edit=${id}`,
    buildLabel: (row) => row.nome,
    limit: 5,
  },
  {
    table: 'locais',
    searchFields: ['nome'],
    selectFields: 'id, nome',
    typeLabel: 'Local',
    buildUrl: (id) => `/controller/locais?edit=${id}`,
    buildLabel: (row) => row.nome,
    limit: 5,
  },
  {
    table: 'maquinas_veiculos',
    searchFields: ['nome'],
    selectFields: 'id, nome',
    typeLabel: 'Máquina/Veículo',
    buildUrl: (id) => `/controller/maquinas-veiculos?edit=${id}`,
    buildLabel: (row) => row.nome,
    limit: 5,
  },
  {
    table: 'individuos',
    searchFields: ['id_brinco', 'id_chip', 'id_manejo'],
    selectFields: 'id, id_brinco, id_chip, id_manejo',
    typeLabel: 'Indivíduo',
    buildUrl: (id) => `/controller/individuos/${id}`,
    buildLabel: (row) => row.id_brinco || row.id_chip || row.id_manejo || row.id,
    buildSubtitle: (row) => {
      const ids = [row.id_brinco, row.id_chip, row.id_manejo].filter(Boolean)
      return ids.length > 1 ? ids.slice(1).join(' · ') : undefined
    },
    extraFilter: (q) => q.is('deleted_at', null),
    limit: 5,
  },
]

const RECENT_SEARCHES_KEY = 'gestaup_recent_searches'
const MAX_RECENT = 5

function loadRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT) : []
  } catch {
    return []
  }
}

function saveRecentSearch(term: string) {
  if (!term || term.trim().length < 2) return
  const termLower = term.trim()
  const current = loadRecentSearches().filter((t) => t.toLowerCase() !== termLower.toLowerCase())
  const updated = [termLower, ...current].slice(0, MAX_RECENT)
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated))
  } catch {
    // ignore quota errors
  }
}

export function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const searchRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { user } = useAuth()
  const navigate = useNavigate()

  const loadRecents = useCallback(() => {
    setRecentSearches(loadRecentSearches())
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault()
        setIsOpen(true)
        inputRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    document.addEventListener('keydown', handleShortcut)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
      document.removeEventListener('keydown', handleShortcut)
    }
  }, [])

  useEffect(() => {
    const searchDelay = setTimeout(async () => {
      if (searchTerm.length < 2) {
        setResults([])
        setLoading(false)
        setActiveIndex(0)
        return
      }

      setLoading(true)

      if (!user) {
        setLoading(false)
        return
      }

      const fazendaId = await getFazendaIdForUser(user.id)
      if (!fazendaId) {
        setLoading(false)
        return
      }

      const escapedTerm = searchTerm.replace(/"/g, '\\"')
      const orFilter = (fields: string[]) =>
        fields.map((f) => `${f}.ilike.%${escapedTerm}%`).join(',')

      const promises = ENTITY_CONFIGS.map(async (cfg) => {
        let query = supabase
          .from(cfg.table)
          .select(cfg.selectFields)
          .eq('fazenda_id', fazendaId)
          .or(orFilter(cfg.searchFields))
          .limit(cfg.limit ?? 5)

        if (cfg.extraFilter) {
          query = cfg.extraFilter(query)
        }

        const { data, error } = await query
        if (error || !data) return []

        return (data as any[]).map((row) => ({
          id: row.id,
          type: cfg.typeLabel,
          label: cfg.buildLabel(row),
          subtitle: cfg.buildSubtitle?.(row),
          url: cfg.buildUrl(row.id),
        })) as SearchResult[]
      })

      const settled = await Promise.all(promises)
      const allResults = settled.flat()
      setResults(allResults)
      setLoading(false)
      setActiveIndex(0)
    }, 300)

    return () => clearTimeout(searchDelay)
  }, [searchTerm, user])

  const handleOpen = () => {
    setIsOpen(true)
    loadRecents()
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const handleResultClick = (result: SearchResult) => {
    saveRecentSearch(searchTerm)
    navigate(result.url)
    setIsOpen(false)
    setSearchTerm('')
    setResults([])
  }

  const handleRecentClick = (term: string) => {
    setSearchTerm(term)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((prev) => Math.min(prev + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (results.length > 0 && results[activeIndex]) {
        handleResultClick(results[activeIndex])
      }
    }
  }

  const groupedResults = useMemo(() => {
    const groups: Record<string, SearchResult[]> = {}
    for (const result of results) {
      if (!groups[result.type]) groups[result.type] = []
      groups[result.type].push(result)
    }
    return groups
  }, [results])

  const flatResults = useMemo(() => results, [results])

  const entityList = ENTITY_CONFIGS.map((c) => c.typeLabel).join(', ')

  return (
    <div className="relative" ref={searchRef}>
      <button
        onClick={handleOpen}
        aria-label="Abrir busca"
        className="flex items-center gap-2 px-3 sm:px-4 py-2 min-h-[44px] bg-white/10 rounded-lg transition-all text-white"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="hidden md:inline text-sm">Buscar...</span>
        <kbd className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-white/20 rounded">
          <span>⌘ + </span>
          <span>K</span>
        </kbd>
      </button>

      {isOpen && (
        <>
          {/* Backdrop para mobile */}
          <div
            className="fixed inset-0 z-50 sm:hidden"
            onClick={() => setIsOpen(false)}
          />

          {/* Search Modal/Panel */}
          <div className="fixed sm:absolute inset-x-4 sm:inset-auto top-4 bottom-4 sm:top-auto sm:bottom-auto right-0 mt-2 w-[calc(100%-2rem)] sm:w-[480px] bg-white sm:rounded-lg shadow-xl border border-gray-200 overflow-hidden animate-scale-in z-[60] flex flex-col max-h-[80vh] sm:max-h-[600px] rounded-2xl">
            <div className="p-3 sm:p-4 border-b border-gray-200 shrink-0 flex items-center gap-3">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Digite para buscar..."
                  aria-label="Buscar"
                  role="searchbox"
                  className="w-full pl-10 pr-4 py-3 sm:py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm sm:text-base"
                  autoFocus
                />
              </div>
              <button
                onClick={() => setIsOpen(false)}
                aria-label="Fechar busca"
                className="p-2 text-gray-400 rounded-lg hover:bg-gray-100 transition-colors sm:hidden"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-xs text-gray-500 px-3 sm:px-4 pb-3 border-b border-gray-200">
              Pesquise em: {entityList}
            </p>

            <div className="overflow-y-auto flex-1">
              {loading && (
                <div className="p-4 text-center text-gray-500">
                  <svg className="animate-spin h-6 w-6 mx-auto mb-2" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Buscando...
                </div>
              )}

              {!loading && searchTerm.length < 2 && (
                <div className="p-4">
                  {recentSearches.length > 0 ? (
                    <div>
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Buscas recentes</p>
                      <div className="flex flex-wrap gap-2">
                        {recentSearches.map((term, i) => (
                          <button
                            key={i}
                            onClick={() => handleRecentClick(term)}
                            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-full transition-colors text-gray-700"
                          >
                            {term}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-center text-gray-500 text-sm sm:text-base">Digite pelo menos 2 caracteres para buscar</p>
                  )}
                </div>
              )}

              {!loading && searchTerm.length >= 2 && flatResults.length === 0 && (
                <div className="p-4 text-center text-gray-500">
                  <p className="text-sm sm:text-base">Nenhum resultado encontrado para "{searchTerm}"</p>
                </div>
              )}

              {!loading && searchTerm.length >= 2 && flatResults.length > 0 && (
                <div className="py-1">
                  {Object.entries(groupedResults).map(([type, items]) => (
                    <div key={type}>
                      <div className="px-4 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50 sticky top-0">
                        {type} <span className="text-gray-400 font-normal">({items.length})</span>
                      </div>
                      {items.map((result) => {
                        const globalIndex = flatResults.findIndex(
                          (r) => r.id === result.id && r.type === result.type
                        )
                        const isActive = globalIndex === activeIndex
                        return (
                          <button
                            key={`${result.type}-${result.id}`}
                            onClick={() => handleResultClick(result)}
                            onMouseEnter={() => setActiveIndex(globalIndex)}
                            className={`w-full px-4 py-2.5 sm:py-3 text-left transition-all flex items-center gap-3 min-h-[48px] ${
                              isActive ? 'bg-primary/10 border-l-2 border-primary' : 'hover:bg-gray-50 border-l-2 border-transparent'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 text-sm sm:text-base truncate">{result.label}</p>
                              {result.subtitle && (
                                <p className="text-xs sm:text-sm text-gray-500 truncate">{result.subtitle}</p>
                              )}
                            </div>
                            <svg className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer com dicas de teclado */}
            {flatResults.length > 0 && (
              <div className="border-t border-gray-200 px-4 py-2 flex items-center justify-between text-xs text-gray-400 shrink-0">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px]">↑↓</kbd>
                    navegar
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px]">↵</kbd>
                    selecionar
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-[10px]">esc</kbd>
                    fechar
                  </span>
                </div>
                <span>{flatResults.length} resultado{flatResults.length !== 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
