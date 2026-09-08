import { lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { AdminLayout } from './components/layout/AdminLayout'
import { ControllerLayout } from './components/layout/ControllerLayout'
import { SuperAdminLayout } from './components/layout/SuperAdminLayout'
import { AdminRoute } from './components/routes/AdminRoute'
import { ControllerRoute } from './components/routes/ControllerRoute'
import { ConfinamentoRoute } from './components/routes/ConfinamentoRoute'
import { SuperAdminRoute } from './components/routes/SuperAdminRoute'
import { PageSkeleton } from './components/ui/PageSkeleton'

// Helper para lazy-load de exports nomeados
const laz = <T extends Record<string, unknown>, K extends keyof T>(
  loader: () => Promise<T>,
  name: K,
) => lazy(() => loader().then((m) => ({ default: m[name] as unknown as React.ComponentType })))

// Auth e públicas
const Login = laz(() => import('./pages/auth/Login'), 'Login')
const RelatorioPublico = laz(() => import('./pages/public/RelatorioPublico'), 'RelatorioPublico')

// Admin
const AdminDashboard = laz(() => import('./pages/admin/Dashboard'), 'AdminDashboard')
const FazendasList = laz(() => import('./pages/admin/Fazendas'), 'FazendasList')
const NovaFazenda = laz(() => import('./pages/admin/NovaFazenda'), 'NovaFazenda')
const EditarFazenda = laz(() => import('./pages/admin/EditarFazenda'), 'EditarFazenda')
const DetalhesFazenda = laz(() => import('./pages/admin/DetalhesFazenda'), 'DetalhesFazenda')
const GruposList = laz(() => import('./pages/admin/Grupos'), 'GruposList')
const UsuariosList = laz(() => import('./pages/admin/Usuarios'), 'UsuariosList')
const NovoUsuario = laz(() => import('./pages/admin/NovoUsuario'), 'NovoUsuario')
const EditarUsuario = laz(() => import('./pages/admin/EditarUsuario'), 'EditarUsuario')
const RelatorioAtividades = laz(() => import('./pages/admin/RelatorioAtividades'), 'RelatorioAtividades')
const GerenciamentoIA = laz(() => import('./pages/admin/GerenciamentoIA'), 'GerenciamentoIA')
const SystemHealth = laz(() => import('./pages/admin/SystemHealth'), 'SystemHealth')
const AuditLog = laz(() => import('./pages/admin/AuditLog'), 'AuditLog')
const UserManagement = laz(() => import('./pages/admin/UserManagement'), 'UserManagement')
const FarmMetrics = laz(() => import('./pages/admin/FarmMetrics'), 'FarmMetrics')

// Controller - core
const ControllerDashboard = laz(() => import('./pages/controller/Dashboard'), 'ControllerDashboard')
const Pastos = laz(() => import('./pages/controller/Pastos'), 'Pastos')
const ModulosPastos = laz(() => import('./pages/controller/ModulosPastos'), 'ModulosPastos')
const Lotes = laz(() => import('./pages/controller/Lotes'), 'Lotes')
const HistoricoOcupacao = laz(() => import('./pages/controller/HistoricoOcupacao'), 'HistoricoOcupacao')
const HistoricoPlanos = laz(() => import('./pages/controller/HistoricoPlanos'), 'HistoricoPlanos')
const Funcionarios = laz(() => import('./pages/controller/Funcionarios'), 'Funcionarios')
const Medicamentos = laz(() => import('./pages/controller/Medicamentos'), 'Medicamentos')
const Insumos = laz(() => import('./pages/controller/Insumos'), 'Insumos')
const ItensSupermercado = laz(() => import('./pages/controller/ItensSupermercado'), 'ItensSupermercado')
const Formulacoes = laz(() => import('./pages/controller/Formulacoes'), 'Formulacoes')
const Fornecedores = laz(() => import('./pages/controller/Fornecedores'), 'Fornecedores')
const Frigorificos = laz(() => import('./pages/controller/Frigorificos'), 'Frigorificos')
const CausasMorte = laz(() => import('./pages/controller/CausasMorte'), 'CausasMorte')
const Racas = laz(() => import('./pages/controller/Racas'), 'Racas')
const CadastrosAuxiliares = laz(() => import('./pages/controller/CadastrosAuxiliares'), 'CadastrosAuxiliares')
const Rotinas = laz(() => import('./pages/controller/Rotinas'), 'Rotinas')
const AuditoriaRotinas = laz(() => import('./pages/controller/AuditoriaRotinas'), 'AuditoriaRotinas')
const Atividades = laz(() => import('./pages/controller/Atividades'), 'Atividades')
const MonitoramentoAtividades = laz(() => import('./pages/controller/MonitoramentoAtividades'), 'MonitoramentoAtividades')
const Currais = laz(() => import('./pages/controller/Currais'), 'Currais')
const ConfiguracaoTratos = laz(() => import('./pages/controller/ProgramacaoTratos'), 'ConfiguracaoTratos')
const AcompanhamentoTratos = laz(() => import('./pages/controller/AcompanhamentoTratos'), 'AcompanhamentoTratos')
const HistoricoDietas = laz(() => import('./pages/controller/HistoricoDietas'), 'HistoricoDietas')
const BebedourosCadastro = laz(() => import('./pages/controller/BebedourosCadastro'), 'BebedourosCadastro')

// Controller - cadernetas
const Cadernetas = laz(() => import('./pages/controller/Cadernetas'), 'Cadernetas')
const Maternidade = laz(() => import('./pages/controller/Maternidade'), 'Maternidade')
const MaternidadeDetalhes = laz(() => import('./pages/controller/MaternidadeDetalhes'), 'MaternidadeDetalhes')
const Enfermaria = laz(() => import('./pages/controller/Enfermaria'), 'Enfermaria')
const EnfermariaDetalhes = laz(() => import('./pages/controller/EnfermariaDetalhes'), 'EnfermariaDetalhes')
const PastagensCaderneta = laz(() => import('./pages/controller/PastagensCaderneta'), 'PastagensCaderneta')
const PastagensDetalhes = laz(() => import('./pages/controller/PastagensDetalhes'), 'PastagensDetalhes')
const Rodeio = laz(() => import('./pages/controller/Rodeio'), 'Rodeio')
const RodeioDetalhes = laz(() => import('./pages/controller/RodeioDetalhes'), 'RodeioDetalhes')
const Suplementacao = laz(() => import('./pages/controller/Suplementacao'), 'Suplementacao')
const SuplementacaoDetalhes = laz(() => import('./pages/controller/SuplementacaoDetalhes'), 'SuplementacaoDetalhes')
const Bebedouros = laz(() => import('./pages/controller/Bebedouros'), 'Bebedouros')
const BebedourosDetalhes = laz(() => import('./pages/controller/BebedourosDetalhes'), 'BebedourosDetalhes')
const Movimentacao = laz(() => import('./pages/controller/Movimentacao'), 'Movimentacao')
const MovimentacaoDetalhes = laz(() => import('./pages/controller/MovimentacaoDetalhes'), 'MovimentacaoDetalhes')
const RegistrosMorte = laz(() => import('./pages/controller/RegistrosMorte'), 'RegistrosMorte')
const RegistrosMorteDetalhes = laz(() => import('./pages/controller/RegistrosMorteDetalhes'), 'RegistrosMorteDetalhes')
const Pluviometros = laz(() => import('./pages/controller/Pluviometros'), 'Pluviometros')
const RegistrosClima = laz(() => import('./pages/controller/RegistrosClima'), 'RegistrosClima')
const RegistrosClimaDetalhes = laz(() => import('./pages/controller/RegistrosClimaDetalhes'), 'RegistrosClimaDetalhes')
const RegistrosAbastecimento = laz(() => import('./pages/controller/RegistrosAbastecimento'), 'RegistrosAbastecimento')
const RegistrosAbastecimentoDetalhes = laz(() => import('./pages/controller/RegistrosAbastecimentoDetalhes'), 'RegistrosAbastecimentoDetalhes')
const RegistrosAlimentacao = laz(() => import('./pages/controller/RegistrosAlimentacao'), 'RegistrosAlimentacao')
const RegistrosAlimentacaoDetalhes = laz(() => import('./pages/controller/RegistrosAlimentacaoDetalhes'), 'RegistrosAlimentacaoDetalhes')
const RegistrosLimpeza = laz(() => import('./pages/controller/RegistrosLimpeza'), 'RegistrosLimpeza')
const RegistrosLimpezaDetalhes = laz(() => import('./pages/controller/RegistrosLimpezaDetalhes'), 'RegistrosLimpezaDetalhes')
const RegistrosOperacoesMaquinas = laz(() => import('./pages/controller/RegistrosOperacoesMaquinas'), 'RegistrosOperacoesMaquinas')
const RegistrosOperacoesMaquinasDetalhes = laz(() => import('./pages/controller/RegistrosOperacoesMaquinasDetalhes'), 'RegistrosOperacoesMaquinasDetalhes')
const Almoxarifado = laz(() => import('./pages/controller/Almoxarifado'), 'Almoxarifado')
const AlmoxarifadoDetalhes = laz(() => import('./pages/controller/AlmoxarifadoDetalhes'), 'AlmoxarifadoDetalhes')
const ManutencaoMaquinas = laz(() => import('./pages/controller/ManutencaoMaquinas'), 'ManutencaoMaquinas')
const ManutencaoMaquinasDetalhes = laz(() => import('./pages/controller/ManutencaoMaquinasDetalhes'), 'ManutencaoMaquinasDetalhes')
const Problemas = laz(() => import('./pages/controller/Problemas'), 'Problemas')
const ProblemasDetalhes = laz(() => import('./pages/controller/ProblemasDetalhes'), 'ProblemasDetalhes')

// Controller - outros
const RelatorioGado = laz(() => import('./pages/controller/RelatorioGado'), 'RelatorioGado')
const RelatorioSaude = laz(() => import('./pages/controller/RelatorioSaude'), 'RelatorioSaude')
const MaquinasVeiculos = laz(() => import('./pages/controller/MaquinasVeiculos'), 'MaquinasVeiculos')
const Setores = laz(() => import('./pages/controller/Setores'), 'Setores')
const Locais = laz(() => import('./pages/controller/Locais'), 'Locais')
const ItensAlmoxarifado = laz(() => import('./pages/controller/ItensAlmoxarifado'), 'ItensAlmoxarifado')
const Implementos = laz(() => import('./pages/controller/Implementos'), 'Implementos')
const TratamentosMaternidade = laz(() => import('./pages/controller/TratamentosMaternidade'), 'TratamentosMaternidade')
const Individuos = laz(() => import('./pages/controller/Individuos'), 'Individuos')
const IndividuoNovo = laz(() => import('./pages/controller/IndividuoNovo'), 'IndividuoNovo')
const FaixasCategorias = laz(() => import('./pages/controller/FaixasCategorias'), 'FaixasCategorias')
const MapaFazenda = laz(() => import('./pages/controller/MapaFazenda'), 'MapaFazenda')
const RastreioCadernetas = laz(() => import('./pages/controller/RastreioCadernetas'), 'RastreioCadernetas')
const Notificacoes = laz(() => import('./pages/controller/Notificacoes'), 'Notificacoes')
const AssistenteIA = laz(() => import('./pages/controller/AssistenteIA'), 'AssistenteIA')
const Relatorios = laz(() => import('./pages/controller/Relatorios'), 'Relatorios')

// Redirecionamento baseado no papel do usuário
function RoleRedirect() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-600">Carregando...</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (user.papel === 'super_admin') {
    return <Navigate to="/super-admin/gerenciamento-ia" replace />
  }

  if (user.papel === 'admin') {
    return <Navigate to="/admin/dashboard" replace />
  }

  if (user.papel === 'controller') {
    return <Navigate to="/controller/dashboard" replace />
  }

  return <Navigate to="/login" replace />
}

function NotFound() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl p-8 shadow-lg border-2 border-gray-200 max-w-md w-full text-center">
        <p className="text-6xl font-bold text-gray-300 mb-4">404</p>
        <h1 className="text-xl font-semibold text-gray-800 mb-2">Página não encontrada</h1>
        <p className="text-gray-600 mb-6">A página que você procura não existe ou foi movida.</p>
        <a
          href="/"
          className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Voltar ao início
        </a>
      </div>
    </div>
  )
}

function App() {
  return (
    <Router>
      <Suspense fallback={<PageSkeleton />}>
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* Rota pública de relatório (sem auth) */}
          <Route path="/r/:token" element={<RelatorioPublico />} />

          {/* Rotas Admin */}
          <Route
            path="/admin/dashboard"
            element={
              <AdminRoute>
                <AdminLayout>
                  <AdminDashboard />
                </AdminLayout>
              </AdminRoute>
            }
          />
          <Route
            path="/admin/fazendas"
            element={
              <AdminRoute>
                <AdminLayout>
                  <FazendasList />
                </AdminLayout>
              </AdminRoute>
            }
          />
          <Route
            path="/admin/fazendas/nova"
            element={
              <AdminRoute>
                <AdminLayout>
                  <NovaFazenda />
                </AdminLayout>
              </AdminRoute>
            }
          />
          <Route
            path="/admin/fazendas/:id"
            element={
              <AdminRoute>
                <AdminLayout>
                  <EditarFazenda />
                </AdminLayout>
              </AdminRoute>
            }
          />
          <Route
            path="/admin/fazendas/:id/detalhes"
            element={
              <AdminRoute>
                <AdminLayout>
                  <DetalhesFazenda />
                </AdminLayout>
              </AdminRoute>
            }
          />
          <Route
            path="/admin/grupos"
            element={
              <AdminRoute>
                <AdminLayout>
                  <GruposList />
                </AdminLayout>
              </AdminRoute>
            }
          />
          <Route
            path="/admin/usuarios"
            element={
              <AdminRoute>
                <AdminLayout>
                  <UsuariosList />
                </AdminLayout>
              </AdminRoute>
            }
          />
          <Route
            path="/admin/usuarios/novo"
            element={
              <AdminRoute>
                <AdminLayout>
                  <NovoUsuario />
                </AdminLayout>
              </AdminRoute>
            }
          />
          <Route
            path="/admin/usuarios/:id"
            element={
              <AdminRoute>
                <AdminLayout>
                  <EditarUsuario />
                </AdminLayout>
              </AdminRoute>
            }
          />
          <Route
            path="/admin/relatorio-atividades"
            element={
              <AdminRoute>
                <AdminLayout>
                  <RelatorioAtividades />
                </AdminLayout>
              </AdminRoute>
            }
          />
          <Route
            path="/super-admin/gerenciamento-ia"
            element={
              <SuperAdminRoute>
                <SuperAdminLayout>
                  <GerenciamentoIA />
                </SuperAdminLayout>
              </SuperAdminRoute>
            }
          />
          <Route
            path="/super-admin/saude-sistema"
            element={
              <SuperAdminRoute>
                <SuperAdminLayout>
                  <SystemHealth />
                </SuperAdminLayout>
              </SuperAdminRoute>
            }
          />
          <Route
            path="/super-admin/usuarios"
            element={
              <SuperAdminRoute>
                <SuperAdminLayout>
                  <UserManagement />
                </SuperAdminLayout>
              </SuperAdminRoute>
            }
          />
          <Route
            path="/super-admin/auditoria"
            element={
              <SuperAdminRoute>
                <SuperAdminLayout>
                  <AuditLog />
                </SuperAdminLayout>
              </SuperAdminRoute>
            }
          />
          <Route
            path="/super-admin/metricas-fazendas"
            element={
              <SuperAdminRoute>
                <SuperAdminLayout>
                  <FarmMetrics />
                </SuperAdminLayout>
              </SuperAdminRoute>
            }
          />

          {/* Rotas Controller */}
          <Route
            path="/controller/dashboard"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <ControllerDashboard />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/pastos"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <Pastos />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/modulos-pastos"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <ModulosPastos />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/lotes"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <Lotes />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/historico-ocupacao"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <HistoricoOcupacao />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/historico-planos"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <HistoricoPlanos />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/funcionarios"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <Funcionarios />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/medicamentos"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <Medicamentos />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/insumos"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <Insumos />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/itens-supermercado"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <ItensSupermercado />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/formulacoes"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <Formulacoes />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/fornecedores"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <Fornecedores />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/frigorificos"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <Frigorificos />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/causas-morte"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <CausasMorte />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/racas"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <Racas />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/cadastros-auxiliares"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <CadastrosAuxiliares />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/rotinas"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <Rotinas />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/auditoria-rotinas"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <AuditoriaRotinas />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/atividades"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <Atividades />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/monitoramento-atividades"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <MonitoramentoAtividades />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/currais"
            element={
              <ControllerRoute>
                <ConfinamentoRoute>
                  <ControllerLayout>
                    <Currais />
                  </ControllerLayout>
                </ConfinamentoRoute>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/configuracao-tratos"
            element={
              <ControllerRoute>
                <ConfinamentoRoute>
                  <ControllerLayout>
                    <ConfiguracaoTratos />
                  </ControllerLayout>
                </ConfinamentoRoute>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/acompanhamento-tratos"
            element={
              <ControllerRoute>
                <ConfinamentoRoute>
                  <ControllerLayout>
                    <AcompanhamentoTratos />
                  </ControllerLayout>
                </ConfinamentoRoute>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/historico-dietas"
            element={
              <ControllerRoute>
                <ConfinamentoRoute>
                  <ControllerLayout>
                    <HistoricoDietas />
                  </ControllerLayout>
                </ConfinamentoRoute>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/bebedouros-cadastro"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <BebedourosCadastro />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/cadernetas"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <Cadernetas />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/cadernetas/maternidade"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <Maternidade />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/cadernetas/maternidade/:id"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <MaternidadeDetalhes />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/cadernetas/enfermaria"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <Enfermaria />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/cadernetas/enfermaria/:id"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <EnfermariaDetalhes />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/cadernetas/pastagens"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <PastagensCaderneta />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/cadernetas/pastagens/:id"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <PastagensDetalhes />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/cadernetas/rodeio"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <Rodeio />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/cadernetas/rodeio/:id"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <RodeioDetalhes />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/cadernetas/suplementacao"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <Suplementacao />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/cadernetas/suplementacao/:id"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <SuplementacaoDetalhes />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/cadernetas/bebedouros"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <Bebedouros />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/cadernetas/bebedouros/:id"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <BebedourosDetalhes />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/cadernetas/movimentacao"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <Movimentacao />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/cadernetas/movimentacao/:id"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <MovimentacaoDetalhes />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/cadernetas/morte"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <RegistrosMorte />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/cadernetas/morte/:id"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <RegistrosMorteDetalhes />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/pluviometros"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <Pluviometros />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/cadernetas/clima"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <RegistrosClima />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/cadernetas/clima/:id"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <RegistrosClimaDetalhes />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/cadernetas/abastecimento"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <RegistrosAbastecimento />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/cadernetas/abastecimento/:id"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <RegistrosAbastecimentoDetalhes />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/cadernetas/alimentacao"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <RegistrosAlimentacao />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/cadernetas/alimentacao/:id"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <RegistrosAlimentacaoDetalhes />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/cadernetas/limpeza"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <RegistrosLimpeza />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/cadernetas/limpeza/:id"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <RegistrosLimpezaDetalhes />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/cadernetas/operacoes-maquinas"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <RegistrosOperacoesMaquinas />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/cadernetas/operacoes-maquinas/:id"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <RegistrosOperacoesMaquinasDetalhes />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/relatorios/gado"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <RelatorioGado />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/relatorios/saude"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <RelatorioSaude />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/maquinas-veiculos"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <MaquinasVeiculos />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/setores"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <Setores />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/locais"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <Locais />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/itens-almoxarifado"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <ItensAlmoxarifado />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/implementos"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <Implementos />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/tratamentos-maternidade"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <TratamentosMaternidade />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/cadernetas/almoxarifado"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <Almoxarifado />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/cadernetas/almoxarifado/:id"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <AlmoxarifadoDetalhes />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/cadernetas/manutencao-maquinas"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <ManutencaoMaquinas />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/cadernetas/manutencao-maquinas/:id"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <ManutencaoMaquinasDetalhes />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/cadernetas/problemas"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <Problemas />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/cadernetas/problemas/:id"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <ProblemasDetalhes />
                </ControllerLayout>
              </ControllerRoute>
            }
          />

          <Route
            path="/controller/individuos"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <Individuos />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/individuos/novo"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <IndividuoNovo />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/individuos/:id"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <IndividuoNovo />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/faixas-categorias"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <FaixasCategorias />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/mapa-fazenda"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <MapaFazenda />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/rastreio-cadernetas"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <RastreioCadernetas />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/notificacoes"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <Notificacoes />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/assistente-ia"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <AssistenteIA />
                </ControllerLayout>
              </ControllerRoute>
            }
          />
          <Route
            path="/controller/relatorios"
            element={
              <ControllerRoute>
                <ControllerLayout>
                  <Relatorios />
                </ControllerLayout>
              </ControllerRoute>
            }
          />

          {/* Redirecionamento padrão */}
          <Route path="/" element={<RoleRedirect />} />

          {/* 404 - rota não encontrada */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Router>
  )
}

export default App
