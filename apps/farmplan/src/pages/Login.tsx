import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@gestaup/shared'
import { Card } from '@gestaup/ui'

export function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const user = await signIn(email, password)
      if (user) {
        navigate('/')
      } else {
        setError('Email ou senha inválidos')
        setLoading(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao fazer login')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-green-50/60 dark:from-surface-0 dark:via-surface-1 dark:to-primary/15 flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg space-y-10">
        <div className="flex flex-col items-center animate-fade-in">
          <h1 className="text-4xl font-extrabold text-primary dark:text-content-strong mb-3 tracking-wider leading-tight text-center">
            Farm <span className="text-accent">Plan</span>
          </h1>
          <p className="text-slate-600 dark:text-content text-lg mb-1">Gestão de Atividades e Pessoas</p>
          <p className="text-slate-500 dark:text-content-muted">Faça login para acessar sua fazenda</p>
        </div>

        <Card className="bg-white dark:bg-surface-1 shadow-xl border border-slate-200 dark:border-border-base animate-scale-in" disableHover>
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 rounded-lg p-4 mb-6 flex items-start gap-3 animate-fade-in">
              <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-red-800 dark:text-red-200">Erro de autenticação</p>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">{error}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="relative">
              <label htmlFor="login-email" className="block text-sm font-semibold text-primary dark:text-content mb-2">Email</label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary input-focus focus:border-primary bg-slate-50 dark:bg-surface-2 text-slate-900 dark:text-content-strong placeholder-slate-400 dark:placeholder-content-faint border-slate-300 dark:border-surface-3"
              />
            </div>
            <div className="relative">
              <label htmlFor="login-password" className="block text-sm font-semibold text-primary dark:text-content mb-2">Senha</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary input-focus focus:border-primary bg-slate-50 dark:bg-surface-2 text-slate-900 dark:text-content-strong placeholder-slate-400 dark:placeholder-content-faint border-slate-300 dark:border-surface-3"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-primary to-primary/90 text-white font-semibold py-3 px-4 rounded-lg hover-scale-sm button-press hover:from-primary/95 hover:to-primary/85 transition-all duration-200 flex items-center justify-center gap-2"
              disabled={loading}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </Card>

        <div className="text-center space-y-2">
          <p className="text-sm text-slate-500 dark:text-content-muted">© 2026 Gesta'Up - Todos os direitos reservados</p>
        </div>
      </div>
    </div>
  )
}
