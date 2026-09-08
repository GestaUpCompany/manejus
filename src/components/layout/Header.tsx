import { useAuth } from '../../contexts/AuthContext'
import { Dropdown, GlobalSearch, Notifications } from '../ui'

export function Header() {
  const { user, signOut } = useAuth()

  const handleLogout = async () => {
    await signOut()
    window.location.href = '/login'
  }

  const userMenuOptions = [
    // {
    //   label: 'Perfil',
    //   icon: (
    //     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    //       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    //     </svg>
    //   ),
    //   onClick: () => console.log('Perfil')
    // },
    // {
    //   label: 'Configurações',
    //   icon: (
    //     <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    //       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    //       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    //     </svg>
    //   ),
    //   onClick: () => console.log('Configurações')
    // },
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
    <header className="bg-primary border-b border-gray-200 px-3 sm:px-4 md:px-6 py-3 md:py-4 sticky top-0 z-50 transition-shadow duration-300">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 md:gap-4">
          <img
            src="/images/manejus360.png"
            alt="Manej'Us 360"
            loading="eager"
            className="h-7 sm:h-8 md:h-10 w-auto hover-scale cursor-pointer rounded-lg"
          />
          <h1 className="text-sm sm:text-base md:text-xl font-bold text-white ml-1 sm:ml-2 md:ml-3 hidden sm:block">
            Manej'Us <span className="text-yellow-500">360</span>
          </h1>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 md:gap-4">
          <GlobalSearch />
          <Notifications />
          <div className="hidden md:block text-right">
            <p className="font-semibold text-white text-sm">{user?.nome}</p>
            <p className="text-xs text-gray-200 capitalize">{user?.papel}</p>
          </div>
          <Dropdown
            trigger={
              <button aria-label="Menu do usuário" className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2 min-h-[44px] bg-white/10 rounded-lg transition-all text-white hover-scale button-press hover:bg-white/20">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <svg className="hidden md:block w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            }
            options={userMenuOptions}
            align="left"
          />
        </div>
      </div>
    </header>
  )
}
