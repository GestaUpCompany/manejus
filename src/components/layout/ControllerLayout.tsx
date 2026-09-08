import { ReactNode, useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useFazenda } from '../../hooks/useDashboardQueries'
import { Header } from './Header'
import { FarmSwitcher } from './FarmSwitcher'
import { Breadcrumbs } from '../ui'
import { KeyboardHelpModal } from '../ui/KeyboardHelpModal'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { supabase } from '../../services/supabaseClient'
import { ImpersonationBar } from '../ImpersonationBar'

interface ControllerLayoutProps {
  children: ReactNode
}

interface MenuItem {
  label: string
  path?: string
  standalone?: boolean
  icon?: ReactNode
  items?: { label: string; path: string }[]
}

const menuStructure: MenuItem[] = [
  {
    label: 'Dashboard',
    path: '/controller/dashboard',
    standalone: true,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    label: 'Gestão da Fazenda',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
    items: [
      { label: 'Lotes', path: '/controller/lotes' },
      { label: 'Indivíduos', path: '/controller/individuos' },
      { label: 'Cadastros Auxiliares', path: '/controller/cadastros-auxiliares' },
      { label: 'Faixas de Categorias', path: '/controller/faixas-categorias' },
      { label: 'Mapa da Fazenda', path: '/controller/mapa-fazenda' },
    ],
  },
  {
    label: 'Pastagem e Ocupação',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
    items: [
      { label: 'Pastos', path: '/controller/pastos' },
      { label: 'Módulos', path: '/controller/modulos-pastos' },
      { label: 'Histórico de Ocupação', path: '/controller/historico-ocupacao' },
    ],
  },
  {
    label: 'Confinamento e TIP',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5h16M4 5v14a2 2 0 002 2h12a2 2 0 002-2V5M4 5h16M9 9h6M9 13h6M9 17h6" />
      </svg>
    ),
    items: [
      { label: 'Currais', path: '/controller/currais' },
      { label: 'Configuração de Tratos', path: '/controller/configuracao-tratos' },
      { label: 'Acompanhamento de Tratos', path: '/controller/acompanhamento-tratos' },
      { label: 'Histórico de Dietas', path: '/controller/historico-dietas' },
    ],
  },
  {
    label: 'Gestão de Insumos e Nutrição',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
    items: [
      { label: 'Insumos', path: '/controller/insumos' },
      { label: 'Formulações', path: '/controller/formulacoes' },
      { label: 'Histórico de Planos', path: '/controller/historico-planos' },
    ],
  },
  {
    label: 'Parceiros',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    items: [
      { label: 'Fornecedores', path: '/controller/fornecedores' },
      { label: 'Frigoríficos', path: '/controller/frigorificos' },
    ],
  },
  {
    label: 'Aplicativo',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
    items: [
      { label: 'Cadernetas', path: '/controller/cadernetas' },
      { label: 'Rotinas', path: '/controller/rotinas' },
      { label: 'Auditoria de Rotinas', path: '/controller/auditoria-rotinas' },
      { label: 'Uso das Cadernetas', path: '/controller/rastreio-cadernetas' },
    ],
  },
  {
    label: 'Notificações',
    path: '/controller/notificacoes',
    standalone: true,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
  },
  {
    label: 'Planejamento',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    items: [
      { label: 'Atividades', path: '/controller/atividades' },
      { label: 'Monitoramento', path: '/controller/monitoramento-atividades' },
    ],
  },
  {
    label: 'Relatórios',
    path: '/controller/relatorios',
    standalone: true,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
]

const menuItemAssistenteIA: MenuItem = {
  label: 'Assistente de IA',
  path: '/controller/assistente-ia',
  standalone: true,
  icon: (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" />
      <path d="M19 15L19.75 17.25L22 18L19.75 18.75L19 21L18.25 18.75L16 18L18.25 17.25L19 15Z" opacity="0.6" />
    </svg>
  ),
}

export function ControllerLayout({ children }: ControllerLayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const { data: fazenda } = useFazenda(user?.id)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [openMenus, setOpenMenus] = useState<Set<string>>(new Set())
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const drawerRef = useRef<HTMLDivElement>(null)

  const shortcuts = [
    {
      key: 'F1',
      description: 'Abrir ajuda de atalhos',
      action: () => setShowHelpModal(true),
    },
    {
      key: 'Escape',
      description: 'Fechar modal',
      action: () => setShowHelpModal(false),
    },
  ]

  useKeyboardShortcuts(shortcuts)

  // Swipe gesture para fechar menu mobile
  useEffect(() => {
    const drawer = drawerRef.current
    if (!drawer) return

    let startX = 0

    const handleTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX
    }

    const handleTouchMove = (e: TouchEvent) => {
      const currentX = e.touches[0].clientX
      const diff = startX - currentX
      
      // Se swipe para a esquerda com velocidade suficiente
      if (diff > 50) {
        setMobileMenuOpen(false)
      }
    }

    drawer.addEventListener('touchstart', handleTouchStart)
    drawer.addEventListener('touchmove', handleTouchMove)

    return () => {
      drawer.removeEventListener('touchstart', handleTouchStart)
      drawer.removeEventListener('touchmove', handleTouchMove)
    }
  }, [mobileMenuOpen])

  const [iaAtiva, setIaAtiva] = useState(false)

  // Busca status da IA para a fazenda atual.
  useEffect(() => {
    if (!fazenda?.id) {
      setIaAtiva(false)
      return
    }
    let cancelled = false
    supabase
      .from('ia_fazenda_config')
      .select('ia_ativo')
      .eq('fazenda_id', fazenda.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setIaAtiva(data?.ia_ativo === true)
      })
    return () => { cancelled = true }
  }, [fazenda?.id])

  const visibleMenuStructure = useMemo(() => {
    let structure = menuStructure
    if (!fazenda?.acesso_confinamento) {
      structure = structure.filter((menu) => menu.label !== 'Confinamento e TIP')
    }
    // IA visível apenas para fazendas com ia_ativo=true em ia_fazenda_config.
    if (iaAtiva) {
      structure = [...structure, menuItemAssistenteIA]
    }
    return structure
  }, [fazenda?.acesso_confinamento, iaAtiva])

  // Auto-open submenu if current path is in it
  useEffect(() => {
    visibleMenuStructure.forEach(menu => {
      if (menu.items && isSubmenuActive(menu.items)) {
        setOpenMenus(prev => new Set(prev).add(menu.label))
      }
    })
  }, [location.pathname, visibleMenuStructure])

  const toggleMenu = (label: string) => {
    const newOpenMenus = new Set(openMenus)
    if (newOpenMenus.has(label)) {
      newOpenMenus.delete(label)
    } else {
      newOpenMenus.add(label)
    }
    setOpenMenus(newOpenMenus)
  }

  const isMenuOpen = (label: string) => openMenus.has(label)

  const isPathActive = (path: string) => location.pathname === path

  const isSubmenuActive = (items: any[]) => {
    return items.some((item) => location.pathname === item.path)
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <ImpersonationBar />
      <Header />
      
      <div className="flex">
        {/* Sidebar - Desktop */}
        <aside className={`${isSidebarCollapsed ? 'w-20' : 'w-64'} hidden md:block bg-white border-r-2 border-gray-200 fixed top-0 h-screen overflow-y-auto z-10 transition-all duration-300`}>
          <div className="p-4 pt-24">
            <div className="flex items-center justify-between mb-4">
              {!isSidebarCollapsed && <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Navegação</p>}
              <button
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
                title={isSidebarCollapsed ? 'Expandir menu' : 'Colapsar menu'}
              >
                <svg
                  className={`w-5 h-5 transition-transform ${isSidebarCollapsed ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
              </button>
            </div>
            <nav className="space-y-1">
              {visibleMenuStructure.map((menu, index) => {
                if (menu.standalone && menu.path) {
                  return (
                    <button
                      key={menu.path}
                      onClick={() => navigate(menu.path!)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-all duration-200 flex items-center gap-3 ${
                        isPathActive(menu.path!)
                          ? 'bg-primary/10 text-primary border-l-4 border-primary font-medium'
                          : 'text-gray-700 border-l-4 border-transparent'
                      }`}
                    >
                      {menu.icon && <span className="flex-shrink-0">{menu.icon}</span>}
                      {!isSidebarCollapsed && <span>{menu.label}</span>}
                    </button>
                  )
                }

                if (menu.items) {
                  const isOpen = isMenuOpen(menu.label)
                  const isActive = isSubmenuActive(menu.items)

                  return (
                    <div key={index}>
                      <button
                        onClick={() => toggleMenu(menu.label)}
                        className={`w-full text-left px-3 py-2.5 rounded-lg transition-all duration-200 flex items-center justify-between ${
                          isActive ? 'bg-primary/10 text-primary border-l-4 border-primary font-medium' : 'text-gray-700 border-l-4 border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {menu.icon && <span className="flex-shrink-0">{menu.icon}</span>}
                          {!isSidebarCollapsed && <span>{menu.label}</span>}
                        </div>
                        {!isSidebarCollapsed && (
                          <svg
                            className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        )}
                      </button>
                      {isOpen && (
                        <div className="ml-6 mt-1 space-y-1 animate-slide-in">
                          {menu.items.map((item) => (
                            <button
                              key={item.path}
                              onClick={() => navigate(item.path)}
                              className={`w-full text-left px-3 py-2 rounded-lg transition-all duration-200 text-sm flex items-center gap-3 ${
                                isPathActive(item.path)
                                  ? 'bg-primary text-white font-medium'
                                  : 'text-gray-600'
                              }`}
                            >
                              <span className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />
                              {!isSidebarCollapsed && <span>{item.label}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                }

                return null
              })}
            </nav>
          </div>
          
          {!isSidebarCollapsed && <FarmSwitcher />}
        </aside>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div 
            className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-50 animate-fade-in"
            onClick={() => setMobileMenuOpen(false)}
          >
            <div 
              ref={drawerRef}
              className="bg-white w-64 h-full p-4 overflow-y-auto animate-slide-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Navegação</p>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 rounded-lg transition-all hover:bg-gray-100"
                  aria-label="Fechar menu"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <nav className="space-y-1">
                {visibleMenuStructure.map((menu, index) => {
                  if (menu.standalone && menu.path) {
                    return (
                      <button
                        key={menu.path}
                        onClick={() => {
                          navigate(menu.path!)
                          setMobileMenuOpen(false)
                        }}
                        className={`w-full text-left px-3 py-2.5 rounded-lg transition-all duration-200 flex items-center gap-3 ${
                          isPathActive(menu.path!)
                            ? 'bg-primary/10 text-primary border-l-4 border-primary font-medium'
                            : 'text-gray-700 border-l-4 border-transparent hover:bg-gray-50'
                        }`}
                        aria-label={`Ir para ${menu.label}`}
                      >
                        {menu.icon && <span className="flex-shrink-0" aria-hidden="true">{menu.icon}</span>}
                        <span>{menu.label}</span>
                      </button>
                    )
                  }

                  if (menu.items) {
                    const isOpen = isMenuOpen(menu.label)
                    const isActive = isSubmenuActive(menu.items)

                    return (
                      <div key={index}>
                        <button
                          onClick={() => toggleMenu(menu.label)}
                          className={`w-full text-left px-3 py-2.5 rounded-lg transition-all duration-200 flex items-center justify-between ${
                            isActive ? 'bg-primary/10 text-primary border-l-4 border-primary font-medium' : 'text-gray-700 border-l-4 border-transparent hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {menu.icon && <span className="flex-shrink-0">{menu.icon}</span>}
                            <span>{menu.label}</span>
                          </div>
                          <svg
                            className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                        {isOpen && (
                          <div className="ml-6 mt-1 space-y-1 animate-slide-in">
                            {menu.items.map((item) => (
                              <button
                                key={item.path}
                                onClick={() => {
                                  navigate(item.path)
                                  setMobileMenuOpen(false)
                                }}
                                className={`w-full text-left px-3 py-2 rounded-lg transition-all duration-200 text-sm flex items-center gap-3 ${
                                  isPathActive(item.path)
                                    ? 'bg-primary text-white font-medium'
                                    : 'text-gray-600 hover:bg-gray-50'
                                }`}
                              >
                                <span className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />
                                <span>{item.label}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  }

                  return null
                })}
              </nav>
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className={`flex-1 p-4 sm:p-6 md:p-8 transition-all duration-300 min-w-0 ${isSidebarCollapsed ? 'md:ml-20' : 'md:ml-64'}`}>
          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden mb-4 p-2 bg-white border-2 border-gray-300 rounded-lg transition-all"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          
          {/* Breadcrumbs */}
          <div className="mb-4">
            <Breadcrumbs />
          </div>
          
          {children}
        </main>
      </div>

      <KeyboardHelpModal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
        shortcuts={[
          { key: 'F1', description: 'Abrir ajuda de atalhos' },
          { key: 'Escape', description: 'Fechar modal' },
          { key: 'f', ctrl: true, description: 'Buscar' },
        ]}
      />
    </div>
  )
}
