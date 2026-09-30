import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@gestaup/shared'
import { PageSkeleton } from '@gestaup/ui'
import { FarmPlanLayout } from './components/FarmPlanLayout'
import { Login } from './pages/Login'
import { Painel } from './pages/Painel'
import { Semana } from './pages/Semana'
import { Hoje } from './pages/Hoje'
import { Anual } from './pages/Anual'
import { Mes } from './pages/Mes'
import { Equipe } from './pages/Equipe'
import { Avaliacao } from './pages/Avaliacao'
import { Indicadores } from './pages/Indicadores'
import { Relatorios } from './pages/Relatorios'
import { Cadastros } from './pages/Cadastros'

const PAPEIS_PERMITIDOS = ['admin', 'controller', 'super_admin']

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <PageSkeleton />
  if (!user) return <Navigate to="/login" replace />
  if (!PAPEIS_PERMITIDOS.includes(user.papel)) {
    return (
      <div className="min-h-screen bg-surface-2 flex items-center justify-center p-6">
        <div className="bg-surface-1 rounded-2xl p-8 shadow-lg border border-border-base max-w-md w-full text-center">
          <h1 className="text-xl font-semibold text-content-strong mb-2">Acesso restrito</h1>
          <p className="text-content-muted">
            O Farm Plan é a ferramenta de gestão da fazenda. Colaboradores de campo dão baixa pelo
            aplicativo (PWA).
          </p>
        </div>
      </div>
    )
  }
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
              <FarmPlanLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Navigate to="/painel" replace />} />
          <Route path="/painel" element={<Painel />} />
          <Route path="/anual" element={<Anual />} />
          <Route path="/mes" element={<Mes />} />
          <Route path="/semana" element={<Semana />} />
          <Route path="/hoje" element={<Hoje />} />
          <Route path="/equipe" element={<Equipe />} />
          <Route path="/equipe/:id" element={<Equipe />} />
          <Route path="/avaliacao" element={<Avaliacao />} />
          <Route path="/indicadores" element={<Indicadores />} />
          <Route path="/relatorios" element={<Relatorios />} />
          <Route path="/cadastros" element={<Cadastros />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  )
}
