import { useEffect, useState } from 'react'
import { supabase } from '../services/supabaseClient'

interface ImpersonationData {
  sessionId: string
  superAdminId: string
  superAdminEmail: string
  targetUserId: string
  targetUserEmail: string
  targetUserNome: string
  targetFazendaId: string | null
  targetFazendaNome: string | null
  startedAt: string
  expiresAt: string
}

export function ImpersonationBar() {
  const [impersonation, setImpersonation] = useState<ImpersonationData | null>(null)
  const [ending, setEnding] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('impersonation_session')
    if (stored) {
      try {
        const data = JSON.parse(stored) as ImpersonationData
        // Verificar se não expirou
        if (new Date(data.expiresAt) > new Date()) {
          setImpersonation(data)
        } else {
          localStorage.removeItem('impersonation_session')
        }
      } catch {
        localStorage.removeItem('impersonation_session')
      }
    }
  }, [])

  const handleEndImpersonation = async () => {
    if (!impersonation) return
    setEnding(true)
    try {
      // Encerrar a sessão de impersonação no banco
      await supabase.rpc('end_impersonation_session', { p_session_id: impersonation.sessionId })

      // Limpar localStorage
      localStorage.removeItem('impersonation_session')

      // Fazer logout do usuário impersonado
      await supabase.auth.signOut()

      // Redirecionar para login
      window.location.href = '/login'
    } catch (e) {
      console.error('Erro ao encerrar impersonação:', e)
      // Mesmo com erro, limpar e redirecionar
      localStorage.removeItem('impersonation_session')
      await supabase.auth.signOut()
      window.location.href = '/login'
    } finally {
      setEnding(false)
    }
  }

  if (!impersonation) return null

  const expiresAt = new Date(impersonation.expiresAt)
  const now = new Date()
  const remainingMs = expiresAt.getTime() - now.getTime()
  const remainingMin = Math.max(0, Math.round(remainingMs / 60000))

  return (
    <div className="bg-red-600 text-white px-4 py-2 flex items-center justify-between gap-4 sticky top-0 z-50 shadow-md">
      <div className="flex items-center gap-3 min-w-0">
        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div className="text-sm min-w-0">
          <span className="font-bold">IMPERSONAÇÃO ATIVA</span>
          <span className="mx-2">|</span>
          <span>Você está acessando como <strong>{impersonation.targetUserNome}</strong></span>
          {impersonation.targetFazendaNome && (
            <span><span className="mx-2">|</span><span>Fazenda: <strong>{impersonation.targetFazendaNome}</strong></span></span>
          )}
          <span className="mx-2">|</span>
          <span>Expira em {remainingMin}min</span>
        </div>
      </div>
      <button
        onClick={handleEndImpersonation}
        disabled={ending}
        className="text-sm bg-surface-1 text-red-500 px-4 py-1.5 rounded-lg font-medium hover:bg-red-500/10 transition-colors flex-shrink-0 disabled:opacity-50"
      >
        {ending ? 'Encerrando...' : 'Encerrar e voltar'}
      </button>
    </div>
  )
}
