import { Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@gestaup/shared'
import { ThemeToggle, Button } from '@gestaup/ui'

export function VisionLayout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-surface-0 dark:bg-surface-0">
      <header className="sticky top-0 z-40 bg-surface-1 border-b border-border-base">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl font-extrabold text-primary dark:text-content-strong tracking-wider">
              Vision<span className="text-accent">'</span>Up
            </span>
            <span className="hidden sm:inline text-xs text-content-muted border border-border-base rounded-full px-2 py-0.5">
              Gestão Financeira
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden md:inline text-sm text-content-muted">{user?.nome}</span>
            <ThemeToggle />
            <Button variant="secondary" onClick={handleSignOut}>
              Sair
            </Button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
