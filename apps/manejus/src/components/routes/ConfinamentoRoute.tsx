import { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useFazenda } from '../../hooks/useDashboardQueries'

interface ConfinamentoRouteProps {
  children: ReactNode
}

export function ConfinamentoRoute({ children }: ConfinamentoRouteProps) {
  const { user } = useAuth()
  const { data: fazenda, isLoading } = useFazenda(user?.id)

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Carregando...</p>
      </div>
    )
  }

  if (!fazenda?.acesso_confinamento) {
    return <Navigate to="/controller/dashboard" replace />
  }

  return <>{children}</>
}
