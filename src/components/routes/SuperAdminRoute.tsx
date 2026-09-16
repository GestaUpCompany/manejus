import { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

interface SuperAdminRouteProps {
  children: ReactNode
}

export function SuperAdminRoute({ children }: SuperAdminRouteProps) {
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

  if (user.papel !== 'super_admin') {
    // admin comum e controller são redirecionados para suas áreas
    if (user.papel === 'admin') {
      return <Navigate to="/admin/dashboard" replace />
    }
    return <Navigate to="/controller/dashboard" replace />
  }

  return <>{children}</>
}
