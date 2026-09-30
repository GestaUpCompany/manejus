import { ReactNode, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth, useFazenda } from '@gestaup/shared'
import { Breadcrumbs, FarmSwitcher } from '@gestaup/ui'
import { FarmPlanHeader } from './FarmPlanHeader'
import { useFarmPlanRealtime } from '../services/farmplanService'

interface MenuItem {
  label: string
  path: string
  icon: ReactNode
}

const icon = (d: string) => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
  </svg>
)

const menuItems: MenuItem[] = [
  { label: 'Painel', path: '/painel', icon: icon('M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1h3a1 1 0 001-1V10') },
  { label: 'Plano anual', path: '/anual', icon: icon('M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z') },
  { label: 'Mês', path: '/mes', icon: icon('M8 7V3m8 4V3M3 11h18M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z') },
  { label: 'Semana', path: '/semana', icon: icon('M4 6h16M4 12h16M4 18h10') },
  { label: 'Hoje', path: '/hoje', icon: icon('M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z') },
  { label: 'Equipe', path: '/equipe', icon: icon('M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4m4 4a4 4 0 01-4 4m4-4v.01') },
  { label: 'Avaliação', path: '/avaliacao', icon: icon('M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118L2.075 10.1c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.52-4.674z') },
  { label: 'Indicadores', path: '/indicadores', icon: icon('M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z') },
  { label: 'Relatórios', path: '/relatorios', icon: icon('M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z') },
  { label: 'Cadastros', path: '/cadastros', icon: icon('M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z') },
]

export function FarmPlanLayout() {
  const { user } = useAuth()
  const { data: fazenda } = useFazenda(user?.id)
  useFarmPlanRealtime(fazenda?.id)
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
      {!isSidebarCollapsed && <FarmSwitcher redirectTo="/painel" />}
    </div>
  )

  return (
    <div className="min-h-screen bg-surface-2">
      <FarmPlanHeader />

      <div className="flex">
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
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  <FarmSwitcher redirectTo="/painel" />
                </div>
              )}
            </div>
          </div>
        )}

        <main className={`flex-1 p-4 sm:p-6 md:p-8 transition-all duration-300 min-w-0 ${isSidebarCollapsed ? 'md:ml-20' : 'md:ml-64'}`}>
          <button
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Abrir menu de navegação"
            className="md:hidden mb-4 p-2 bg-surface-1 border-2 border-surface-3 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="mb-4">
            <Breadcrumbs />
          </div>

          <Outlet />
        </main>
      </div>
    </div>
  )
}
