import { ReactNode, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@gestaup/shared'
import { Breadcrumbs, FarmSwitcher } from '@gestaup/ui'
import { VisionHeader } from './VisionHeader'

interface MenuItem {
  label: string
  path: string
  icon: ReactNode
}

const menuItems: MenuItem[] = [
  {
    label: 'Relatórios',
    path: '/relatorios',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
]

export function VisionLayout() {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  const isPathActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`)

  const renderNav = (isMobile: boolean) => {
    const showLabel = isMobile || !isSidebarCollapsed
    return (
      <nav className="space-y-0.5" aria-label="Itens de navegação">
        {menuItems.map((item) => {
          const active = isPathActive(item.path)
          return (
            <button
              key={item.path}
              onClick={() => {
                navigate(item.path)
                if (isMobile) setMobileMenuOpen(false)
              }}
              aria-current={active ? 'page' : undefined}
              title={!isMobile && isSidebarCollapsed ? item.label : undefined}
              className={`w-full text-left px-3 py-2 rounded-lg transition-all duration-200 flex items-center gap-3 border-l-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                !isMobile && isSidebarCollapsed ? 'justify-center' : ''
              } ${
                active
                  ? 'bg-primary/15 dark:bg-primary/35 text-primary dark:text-white border-primary dark:border-primary-light font-medium'
                  : 'text-content border-transparent hover:bg-surface-2'
              }`}
            >
              <span className="flex-shrink-0" aria-hidden="true">{item.icon}</span>
              {showLabel && <span>{item.label}</span>}
            </button>
          )
        })}
      </nav>
    )
  }

  const userBlock = (
    <div className="mt-auto border-t-2 border-border-base">
      {!isSidebarCollapsed ? (
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/20 dark:bg-primary/40 text-primary dark:text-white flex items-center justify-center text-sm font-semibold flex-shrink-0" aria-hidden="true">
            {(user?.nome || '?').split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-content-strong truncate">{user?.nome}</p>
            <p className="text-xs text-content-faint capitalize">{user?.papel}</p>
          </div>
        </div>
      ) : (
        <div className="px-3 py-3 flex justify-center" title={user?.nome}>
          <div className="w-9 h-9 rounded-full bg-primary/20 dark:bg-primary/40 text-primary dark:text-white flex items-center justify-center text-sm font-semibold" aria-hidden="true">
            {(user?.nome || '?').split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()}
          </div>
        </div>
      )}
      {!isSidebarCollapsed && <FarmSwitcher redirectTo="/relatorios" />}
    </div>
  )

  return (
    <div className="min-h-screen bg-surface-2">
      <VisionHeader />

      <div className="flex">
        {/* Sidebar - Desktop */}
        <aside
          role="navigation"
          aria-label="Navegação principal"
          className={`${isSidebarCollapsed ? 'w-20 overflow-visible' : 'w-64 overflow-y-auto'} hidden md:block bg-green-50 dark:bg-surface-1 border-r-2 border-green-200 dark:border-border-base fixed top-0 h-screen z-10 transition-all duration-300 flex flex-col`}
        >
          <div className="p-4 pt-24">
            <div className="flex items-center justify-between mb-4">
              {!isSidebarCollapsed && <p className="text-xs font-semibold text-content-faint uppercase tracking-wider" aria-hidden="true">Navegação</p>}
              <button
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                aria-label={isSidebarCollapsed ? 'Expandir menu' : 'Colapsar menu'}
                aria-expanded={!isSidebarCollapsed}
                className="p-2 rounded-lg hover:bg-surface-2 transition-colors text-content-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                title={isSidebarCollapsed ? 'Expandir menu' : 'Colapsar menu'}
              >
                <svg
                  className={`w-5 h-5 transition-transform ${isSidebarCollapsed ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
              </button>
            </div>
            {renderNav(false)}
          </div>

          {user && userBlock}
        </aside>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div
            className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-50 animate-fade-in"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Menu de navegação"
              className="bg-green-50 dark:bg-surface-1 w-64 h-full p-4 overflow-y-auto animate-slide-in flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold text-content-faint uppercase tracking-wider" aria-hidden="true">Navegação</p>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 rounded-lg transition-all hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  aria-label="Fechar menu"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {renderNav(true)}
              {user && (
                <div className="mt-4 border-t-2 border-border-base pt-3">
                  <div className="px-1 py-2 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/20 dark:bg-primary/40 text-primary dark:text-white flex items-center justify-center text-sm font-semibold flex-shrink-0" aria-hidden="true">
                      {(user.nome || '?').split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-content-strong truncate">{user.nome}</p>
                      <p className="text-xs text-content-faint capitalize">{user.papel}</p>
                    </div>
                  </div>
                  <FarmSwitcher redirectTo="/relatorios" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className={`flex-1 p-4 sm:p-6 md:p-8 transition-all duration-300 min-w-0 ${isSidebarCollapsed ? 'md:ml-20' : 'md:ml-64'}`}>
          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Abrir menu de navegação"
            className="md:hidden mb-4 p-2 bg-surface-1 border-2 border-surface-3 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Breadcrumbs */}
          <div className="mb-4">
            <Breadcrumbs />
          </div>

          <Outlet />
        </main>
      </div>
    </div>
  )
}
