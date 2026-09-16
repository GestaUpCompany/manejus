import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Dropdown, GlobalSearch, Notifications, ThemeToggle } from '../ui'

export function Header() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await signOut()
    window.location.href = '/login'
  }

  const userMenuOptions = [
    {
      label: 'Configurações',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      onClick: () => navigate('/controller/configuracoes')
    },
    {
      label: 'Sair',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
      ),
      onClick: handleLogout,
      danger: true
    }
  ]

  return (
    <header className="sticky top-0 z-50 transition-shadow duration-300">
      <div className="bg-gradient-to-r from-[#0f1f17] via-primary to-[#0f1f17] border-b border-white/5 shadow-lg shadow-black/20">
        <div className="px-2 sm:px-4 md:px-6 py-2 sm:py-2.5 md:py-3 flex items-center justify-between">
          {/* Lado esquerdo: logo + título */}
          <div className="flex items-center gap-2 md:gap-4">
            <div className="flex items-center gap-2 md:gap-3">
              <img
                src="/images/manejus360.png"
                alt="Manej'Us 360"
                loading="eager"
                className="h-7 sm:h-8 md:h-10 w-auto hover-scale cursor-pointer rounded-lg ring-1 ring-white/10"
              />
              <div className="hidden sm:block">
                <h1 className="text-sm sm:text-base md:text-xl font-bold text-white leading-tight">
                  Manej'Us <span className="text-yellow-400">360</span>
                </h1>
                <p className="hidden md:block text-[10px] text-white/40 font-medium tracking-wide uppercase">
                  Gestão Pecuária
                </p>
              </div>
            </div>
          </div>

          {/* Lado direito: busca, notificações, usuário */}
          <div className="flex items-center gap-1 sm:gap-2 md:gap-3">
            <GlobalSearch />
            <Notifications />
            <ThemeToggle />

            {/* Separador sutil */}
            <div className="hidden md:block w-px h-8 bg-white/10" />

            {/* Usuário */}
            <div className="hidden md:block text-right">
              <p className="font-semibold text-white text-sm leading-tight">{user?.nome}</p>
              <p className="text-xs text-white/40 capitalize leading-tight">{user?.papel}</p>
            </div>
            <Dropdown
              trigger={
                <button
                  aria-label="Menu do usuário"
                  className="flex items-center justify-center w-8 h-8 rounded-full transition-all hover:bg-white/10 md:w-auto md:h-auto md:pl-1.5 md:pr-2 md:py-1.5 md:min-h-[40px] md:min-w-0 md:bg-white/5 md:backdrop-blur-sm md:rounded-full md:ring-1 md:ring-white/10"
                >
                  <span className="w-8 h-8 rounded-full bg-primary dark:bg-primary-light text-white flex items-center justify-center text-[10px] font-semibold flex-shrink-0 ring-1 ring-white/10 md:w-7 md:h-7 md:text-xs">
                    {(user?.nome || '?').split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()}
                  </span>
                  <svg className="hidden md:block w-4 h-4 text-white/50 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              }
              options={userMenuOptions}
              align="left"
            />
          </div>
        </div>
      </div>
    </header>
  )
}
