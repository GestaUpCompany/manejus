import { useAuth } from '@gestaup/shared'
import { Dropdown, ThemeToggle } from '@gestaup/ui'

export function FarmPlanHeader() {
  const { user, signOut } = useAuth()

  const handleLogout = async () => {
    await signOut()
    window.location.href = '/login'
  }

  const userMenuOptions = [
    {
      label: 'Sair',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
      ),
      onClick: handleLogout,
      danger: true,
    },
  ]

  return (
    <header className="sticky top-0 z-50 transition-shadow duration-300">
      <div className="bg-gradient-to-r from-[#0f1f17] via-primary to-[#0f1f17] border-b border-white/5 shadow-lg shadow-black/20">
        <div className="px-2 sm:px-4 md:px-6 py-2 sm:py-2.5 md:py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-4">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="h-7 w-7 sm:h-8 sm:w-8 md:h-10 md:w-10 rounded-lg bg-white/10 ring-1 ring-white/10 flex items-center justify-center">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <div className="hidden sm:block">
                <h1 className="text-sm sm:text-base md:text-xl font-bold text-white leading-tight">
                  Farm <span className="text-yellow-400">Plan</span>
                </h1>
                <p className="hidden md:block text-[10px] text-white/40 font-medium tracking-wide uppercase">
                  Atividades e Pessoas
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 md:gap-3">
            <ThemeToggle />
            <div className="hidden md:block w-px h-8 bg-white/10" />
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
