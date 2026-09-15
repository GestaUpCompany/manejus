import { useRef, useEffect, ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

export interface SidebarItem {
  label: string
  path: string
  icon?: ReactNode
}

interface SidebarProps {
  items: SidebarItem[]
  isCollapsed?: boolean
  onToggle?: () => void
  mobileMenuOpen?: boolean
  setMobileMenuOpen?: (open: boolean) => void
  title?: string
}

export function Sidebar({ items, isCollapsed = false, onToggle, mobileMenuOpen = false, setMobileMenuOpen, title }: SidebarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const drawerRef = useRef<HTMLDivElement>(null)

  // Swipe gesture para fechar menu mobile
  useEffect(() => {
    const drawer = drawerRef.current
    if (!drawer || !mobileMenuOpen) return

    let startX = 0

    const handleTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX
    }

    const handleTouchMove = (e: TouchEvent) => {
      const currentX = e.touches[0].clientX
      const diff = startX - currentX

      if (diff > 50 && setMobileMenuOpen) {
        setMobileMenuOpen(false)
      }
    }

    drawer.addEventListener('touchstart', handleTouchStart)
    drawer.addEventListener('touchmove', handleTouchMove)

    return () => {
      drawer.removeEventListener('touchstart', handleTouchStart)
      drawer.removeEventListener('touchmove', handleTouchMove)
    }
  }, [mobileMenuOpen, setMobileMenuOpen])

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={`${isCollapsed ? 'w-20' : 'w-64'} bg-white border-r-2 border-gray-200 min-h-screen transition-all duration-300 hidden md:block`}
        role="navigation"
        aria-label={title || 'Navegação principal'}
      >
        <div className="p-4">
          {onToggle && (
            <div className="flex items-center justify-between mb-6">
              {!isCollapsed && <h2 className="text-lg font-bold text-gray-800" aria-hidden="true">{title || 'Menu'}</h2>}
              <button
                onClick={onToggle}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-label={isCollapsed ? 'Expandir menu' : 'Colapsar menu'}
                aria-expanded={!isCollapsed}
              >
                <svg
                  className={`w-5 h-5 transition-transform ${isCollapsed ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
              </button>
            </div>
          )}
          <nav className="space-y-0.5" aria-label="Itens de navegação">
            {items.map((item) => {
              const isActive = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  aria-current={isActive ? 'page' : undefined}
                  title={isCollapsed ? item.label : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 text-sm font-medium border-l-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                    isCollapsed ? 'justify-center' : ''
                  } ${
                    isActive
                      ? 'bg-primary/15 text-primary border-primary'
                      : 'text-gray-600 border-transparent hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  {item.icon && (
                    <span className={`flex-shrink-0 ${isActive ? 'text-primary' : 'text-gray-400'}`} aria-hidden="true">
                      {item.icon}
                    </span>
                  )}
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </button>
              )
            })}
          </nav>
        </div>
        {!isCollapsed && user && (
          <div className="absolute bottom-0 w-64 p-6 border-t-2 border-gray-200">
            <div className="text-sm text-gray-500">
              <p>Usuário: {user.nome}</p>
              <p>Papel: <span className="capitalize">{user.papel}</span></p>
            </div>
          </div>
        )}
      </aside>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-50 animate-fade-in"
          onClick={() => setMobileMenuOpen?.(false)}
          aria-hidden="true"
        >
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu de navegação"
            className="bg-white w-64 h-full p-4 overflow-y-auto animate-slide-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800" aria-hidden="true">{title || 'Menu'}</h2>
              <button
                onClick={() => setMobileMenuOpen?.(false)}
                className="p-2 rounded-lg transition-all hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-label="Fechar menu"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="space-y-0.5" aria-label="Itens de navegação">
              {items.map((item) => {
                const isActive = location.pathname === item.path
                return (
                  <button
                    key={item.path}
                    onClick={() => {
                      navigate(item.path)
                      setMobileMenuOpen?.(false)
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-all duration-200 text-sm font-medium border-l-[3px] flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                      isActive
                        ? 'bg-primary/15 text-primary border-primary'
                        : 'text-gray-700 border-transparent hover:bg-gray-50'
                    }`}
                    aria-label={`Ir para ${item.label}`}
                  >
                    {item.icon && (
                      <span className={`flex-shrink-0 ${isActive ? 'text-primary' : 'text-gray-400'}`} aria-hidden="true">
                        {item.icon}
                      </span>
                    )}
                    {item.label}
                  </button>
                )
              })}
            </nav>
            {user && (
              <div className="absolute bottom-0 w-64 p-6 border-t-2 border-gray-200">
                <div className="text-sm text-gray-500">
                  <p>Usuário: {user.nome}</p>
                  <p>Papel: <span className="capitalize">{user.papel}</span></p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
