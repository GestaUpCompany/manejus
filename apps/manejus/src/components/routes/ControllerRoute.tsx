import { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

interface ControllerRouteProps {
  children: ReactNode
}

export function ControllerRoute({ children }: ControllerRouteProps) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-2 flex items-center justify-center">
        <p className="text-gray-600">Carregando...</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (user.papel !== 'controller') {
    return <Navigate to="/admin/dashboard" replace />
  }

  return <>{children}</>
}
