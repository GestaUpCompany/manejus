import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@gestaup/shared'
import { PageSkeleton } from '@gestaup/ui'
import { VisionLayout } from './components/VisionLayout'
import { Login } from './pages/Login'
import { Relatorios } from './pages/Relatorios'
import { RelatorioVision } from './pages/RelatorioVision'
import { RelatorioImpressao } from './pages/RelatorioImpressao'
import { RelatorioPublicoVision } from './pages/RelatorioPublicoVision'

function AcessoNegado() {
  const { user, signOut } = useAuth()
  return (
    <div className="min-h-screen bg-surface-2 flex items-center justify-center p-6">
      <div className="bg-surface-1 rounded-xl border border-border-base shadow-sm px-8 py-8 max-w-md text-center">
        <svg className="w-10 h-10 mx-auto mb-3 text-content-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
        <h1 className="text-lg font-bold text-content-strong">Acesso restrito</h1>
        <p className="text-sm text-content-muted mt-2">
          O Vision'Up está em acesso limitado. A conta <b>{user?.email}</b> não está habilitada.
        </p>
        <button
          onClick={() => signOut()}
          className="mt-5 rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
        >
          Entrar com outra conta
        </button>
      </div>
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <PageSkeleton />
  if (!user) return <Navigate to="/login" replace />
  if (!user.acesso_vision) return <AcessoNegado />
  return <>{children}</>
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/r/:token" element={<RelatorioPublicoVision />} />
        <Route
          path="/relatorios/imprimir"
          element={
            <ProtectedRoute>
              <RelatorioImpressao />
            </ProtectedRoute>
          }
        />
        <Route
          element={
            <ProtectedRoute>
              <VisionLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Navigate to="/relatorios" replace />} />
          <Route path="/relatorios" element={<Relatorios />} />
          <Route path="/relatorios/vision" element={<RelatorioVision />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  )
}
