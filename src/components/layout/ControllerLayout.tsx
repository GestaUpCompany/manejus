import { ReactNode, useState, useEffect, useRef, useMemo, useTransition } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useFazenda } from '../../hooks/useDashboardQueries'
import { Header } from './Header'
import { FarmSwitcher } from './FarmSwitcher'
import { Breadcrumbs } from '../ui'
import { CommandPalette } from '../ui/CommandPalette'
import type { CommandItem } from '../ui/CommandPalette'
import { KeyboardHelpModal } from '../ui/KeyboardHelpModal'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { supabase } from '../../services/supabaseClient'
import { ImpersonationBar } from '../ImpersonationBar'
import { prefetchRoute } from '../../utils/routePrefetch'

interface ControllerLayoutProps {
  children: ReactNode
}

interface MenuItem {
  label: string
  path?: string
  standalone?: boolean
  icon?: ReactNode
  items?: { label: string; path: string }[]
  section?: string
}

const MENU_SECTIONS: { id: string; label: string }[] = [
  { id: 'principal', label: 'Principal' },
  { id: 'operacao', label: 'Operação' },
  { id: 'insumos-estoque', label: 'Insumos & Estoque' },
  { id: 'sistema', label: 'Sistema' },
]

const menuStructure: MenuItem[] = [
  {
    label: 'Dashboard',
    path: '/controller/dashboard',
    standalone: true,
    section: 'principal',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    label: 'Gestão da Fazenda',
    section: 'operacao',
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
    section: 'operacao',
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
    section: 'operacao',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5h16M4 5v14a2 2 0 002 2h12a2 2 0 002-2V5M4 5h16M9 9h6M9 13h6M9 17h6" />
      </svg>
    ),
    items: [
      { label: 'Currais', path: '/controller/currais' },
      { label: 'Configuração de Tratos', path: '/controller/configuracao-tratos' },
      { label: 'Lançamento de Tratos', path: '/controller/lancamento-tratos' },
      { label: 'Acompanhamento de Tratos', path: '/controller/acompanhamento-tratos' },
      { label: 'Histórico de Dietas', path: '/controller/historico-dietas' },
    ],
  },
  {
    label: 'Gestão de Insumos e Nutrição',
    section: 'insumos-estoque',
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
    label: 'Estoque',
    section: 'insumos-estoque',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8M9 12h6" />
      </svg>
    ),
    items: [
      { label: 'Combustível', path: '/controller/estoque-combustivel' },
      { label: 'Suplementação', path: '/controller/estoque-suplementacao' },
      { label: 'Almoxarifado', path: '/controller/estoque-almoxarifado' }
    ],
  },
  {
    label: 'Parceiros',
    section: 'sistema',
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
    section: 'sistema',
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
    section: 'principal',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
  },
  {
    label: 'Planejamento',
    section: 'sistema',
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
    section: 'principal',
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
  section: 'principal',
  icon: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-6.714 2.143L12 21l-2.286-6.857L3 12l6.714-2.143L12 3z" />
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
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [, startTransition] = useTransition()
  const drawerRef = useRef<HTMLDivElement>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)

  const handleNavigate = (path: string) => {
    startTransition(() => {
      navigate(path)
    })
  }

  const handlePrefetch = (path: string) => {
    prefetchRoute(path)
  }

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
    {
      key: 'k',
      ctrl: true,
      description: 'Abrir busca rápida (command palette)',
      action: () => setShowCommandPalette(true),
    },
  ]

  useKeyboardShortcuts(shortcuts)

  // Listener dedicado para Ctrl+K: precisa funcionar mesmo com foco em input,
  // o que o useKeyboardShortcuts bloqueia por design.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const modifier = isMac ? e.metaKey : e.ctrlKey
      if (modifier && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setShowCommandPalette((open) => !open)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

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

  // Lista achatada de destinos para a command palette.
  const commandItems: CommandItem[] = useMemo(() => {
    const result: CommandItem[] = []
    visibleMenuStructure.forEach((menu) => {
      const sectionLabel = MENU_SECTIONS.find((s) => s.id === menu.section)?.label
      if (menu.standalone && menu.path) {
        result.push({ label: menu.label, path: menu.path, section: sectionLabel, icon: menu.icon })
      }
      if (menu.items) {
        menu.items.forEach((item) => {
          result.push({ label: item.label, path: item.path, section: `${sectionLabel} · ${menu.label}`, icon: menu.icon })
        })
      }
    })
    return result
  }, [visibleMenuStructure])

  // Auto-open submenu if current path is in it
  useEffect(() => {
    visibleMenuStructure.forEach(menu => {
      if (menu.items && isSubmenuActive(menu.items)) {
        setOpenMenus(prev => new Set(prev).add(menu.label))
      }
    })
  }, [location.pathname, visibleMenuStructure])

  // Auto-scroll para o item ativo no mount e ao trocar de rota
  useEffect(() => {
    if (isSidebarCollapsed || !sidebarRef.current) return
    const activeEl = sidebarRef.current.querySelector('[aria-current="page"]') as HTMLElement | null
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [location.pathname, isSidebarCollapsed, visibleMenuStructure])

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

  const renderMenuItem = (menu: MenuItem, isMobile: boolean) => {
    const showLabel = isMobile || !isSidebarCollapsed
    const hoverClass = isMobile ? 'hover:bg-surface-2' : ''

    if (menu.standalone && menu.path) {
      const active = isPathActive(menu.path!)
      return (
        <button
          key={menu.path}
          onClick={() => {
            handleNavigate(menu.path!)
            if (isMobile) setMobileMenuOpen(false)
          }}
          onMouseEnter={() => handlePrefetch(menu.path!)}
          aria-current={active ? 'page' : undefined}
          title={!isMobile && isSidebarCollapsed ? menu.label : undefined}
          className={`w-full text-left px-3 py-2 rounded-lg transition-all duration-200 flex items-center gap-3 border-l-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
            !isMobile && isSidebarCollapsed ? 'justify-center' : ''
          } ${
            active
              ? 'bg-primary/15 dark:bg-primary/35 text-primary dark:text-white border-primary dark:border-primary-light font-medium'
              : `text-content border-transparent ${hoverClass}`
          }`}
          aria-label={isMobile ? `Ir para ${menu.label}` : undefined}
        >
          {menu.icon && <span className="flex-shrink-0" aria-hidden={isMobile}>{menu.icon}</span>}
          {showLabel && <span>{menu.label}</span>}
        </button>
      )
    }

    if (menu.items) {
      const isOpen = isMenuOpen(menu.label)
      const isActive = isSubmenuActive(menu.items)
      const collapsed = !isMobile && isSidebarCollapsed

      if (collapsed) {
        return (
          <div key={menu.label} className="group relative">
            <button
              onClick={() => toggleMenu(menu.label)}
              aria-expanded={isOpen}
              aria-haspopup="menu"
              title={menu.label}
              aria-label={menu.label}
              className={`w-full flex items-center justify-center px-3 py-2 rounded-lg transition-all duration-200 border-l-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                isActive ? 'bg-primary/15 dark:bg-primary/35 text-primary dark:text-white border-primary dark:border-primary-light font-medium' : 'text-content border-transparent'
              }`}
            >
              {menu.icon && <span className="flex-shrink-0" aria-hidden="true">{menu.icon}</span>}
            </button>
            <div
              role="menu"
              aria-label={menu.label}
              className="absolute left-full top-0 ml-2 w-56 invisible opacity-0 group-hover:visible group-hover:opacity-100 transition-all duration-150 z-50 bg-surface-1 border border-border-base rounded-lg shadow-lg p-2"
            >
              <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-content-faint border-b border-border-subtle mb-1" aria-hidden="true">
                {menu.label}
              </p>
              <div className="space-y-0.5" role="group" aria-label={`Submenu ${menu.label}`}>
                {menu.items.map((item) => {
                  const active = isPathActive(item.path)
                  return (
                    <button
                      key={item.path}
                      role="menuitem"
                      onClick={() => handleNavigate(item.path)}
                      onMouseEnter={() => handlePrefetch(item.path)}
                      aria-current={active ? 'page' : undefined}
                      className={`w-full text-left px-3 py-1.5 rounded-lg transition-all duration-200 text-sm font-normal flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                        active
                          ? 'bg-primary/20 dark:bg-primary/35 text-primary dark:text-white font-medium'
                          : 'text-content-muted hover:bg-surface-2'
                      }`}
                    >
                      <svg
                        className={`w-3.5 h-3.5 flex-shrink-0 ${active ? 'text-primary' : 'text-content-faint'}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <span>{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )
      }

      return (
        <div key={menu.label}>
          <button
            onClick={() => toggleMenu(menu.label)}
            aria-expanded={isOpen}
            aria-haspopup="menu"
            className={`w-full text-left px-3 py-2 rounded-lg transition-all duration-200 flex items-center justify-between border-l-[3px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
              isActive ? 'bg-primary/15 dark:bg-primary/35 text-primary dark:text-white border-primary dark:border-primary-light font-medium' : `text-content border-transparent ${hoverClass}`
            }`}
          >
            <div className="flex items-center gap-3">
              {menu.icon && <span className="flex-shrink-0" aria-hidden={isMobile}>{menu.icon}</span>}
              {showLabel && <span>{menu.label}</span>}
            </div>
            {showLabel && (
              <svg
                className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
          </button>
          {isOpen && (
            <div className="ml-3 mt-1 space-y-0.5 animate-slide-in border-l border-border-subtle pl-3" role="group" aria-label={`Submenu ${menu.label}`}>
              {menu.items.map((item) => {
                const active = isPathActive(item.path)
                return (
                  <button
                    key={item.path}
                    onClick={() => {
                      handleNavigate(item.path)
                      if (isMobile) setMobileMenuOpen(false)
                    }}
                    onMouseEnter={() => handlePrefetch(item.path)}
                    aria-current={active ? 'page' : undefined}
                    className={`w-full text-left px-3 py-1.5 rounded-lg transition-all duration-200 text-sm font-normal flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                      active
                        ? 'bg-primary/20 dark:bg-primary/35 text-primary dark:text-white font-medium'
                        : `text-content-muted ${hoverClass}`
                    }`}
                  >
                    <svg
                      className={`w-3.5 h-3.5 flex-shrink-0 ${active ? 'text-primary' : 'text-content-faint'}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    {showLabel && <span>{item.label}</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )
    }

    return null
  }

  const renderMenuSections = (isMobile: boolean) => {
    const showSectionLabel = isMobile || !isSidebarCollapsed
    const collapsed = !isMobile && isSidebarCollapsed
    return (
      <nav aria-label="Seções do menu">
        {MENU_SECTIONS.map((section, sectionIndex) => {
          const sectionItems = visibleMenuStructure.filter((m) => m.section === section.id)
          if (sectionItems.length === 0) return null
          return (
            <div key={section.id} className={sectionIndex > 0 ? (collapsed ? 'mt-3' : 'mt-4') : ''}>
              {sectionIndex > 0 && !collapsed && <div className="mx-3 mb-2 border-t border-border-subtle" />}
              {showSectionLabel && (
                <p className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wider text-content-faint">
                  {section.label}
                </p>
              )}
              <div className="space-y-0.5">
                {sectionItems.map((menu) => renderMenuItem(menu, isMobile))}
              </div>
            </div>
          )
        })}
      </nav>
    )
  }

  return (
    <div className="min-h-screen bg-surface-2">
      <ImpersonationBar />
      <Header />
      
      <div className="flex">
        {/* Sidebar - Desktop */}
        <aside
          ref={sidebarRef}
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
            {renderMenuSections(false)}
          </div>

          {/* Bloco de contexto: usuário + farm switcher */}
          {user && (
            <div className="mt-auto border-t-2 border-border-base">
              {!isSidebarCollapsed && (
                <div className="px-4 py-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/20 dark:bg-primary/40 text-primary dark:text-white flex items-center justify-center text-sm font-semibold flex-shrink-0" aria-hidden="true">
                    {(user.nome || '?').split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-content-strong truncate">{user.nome}</p>
                    <p className="text-xs text-content-faint capitalize">{user.papel}</p>
                  </div>
                </div>
              )}
              {isSidebarCollapsed && (
                <div className="px-3 py-3 flex justify-center" title={user.nome}>
                  <div className="w-9 h-9 rounded-full bg-primary/20 dark:bg-primary/40 text-primary dark:text-white flex items-center justify-center text-sm font-semibold" aria-hidden="true">
                    {(user.nome || '?').split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()}
                  </div>
                </div>
              )}
              {!isSidebarCollapsed && <FarmSwitcher />}
            </div>
          )}
        </aside>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div
            className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-50 animate-fade-in"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          >
            <div
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-label="Menu de navegação"
              className="bg-green-50 dark:bg-surface-1 w-64 h-full p-4 overflow-y-auto animate-slide-in"
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
              {renderMenuSections(true)}
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
                  <FarmSwitcher />
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
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
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
          { key: 'K', ctrl: true, description: 'Abrir busca rápida' },
        ]}
      />

      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        items={commandItems}
        onSelect={handleNavigate}
      />
    </div>
  )
}
