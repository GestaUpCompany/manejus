import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@gestaup/shared'
import { PageSkeleton } from '@gestaup/ui'
import { VisionLayout } from './components/VisionLayout'
import { Login } from './pages/Login'
import { Relatorios } from './pages/Relatorios'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <PageSkeleton />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <ProtectedRoute>
              <VisionLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Navigate to="/relatorios" replace />} />
          <Route path="/relatorios" element={<Relatorios />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  )
}
