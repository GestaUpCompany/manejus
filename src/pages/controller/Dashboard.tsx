import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Card, Button, ErrorState, PageSkeleton } from '../../components/ui'
import { CADERNETA_IMAGES, CADERNETA_TITLES } from '../../types/images'
import { useFazenda, useDashboardStats, useGadoStats, useRecentActivities, useFormulacoesBackfillAlert } from '../../hooks/useDashboardQueries'


export function ControllerDashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const { data: fazenda, isLoading: loadingFazenda, isError: fazendaError, error: fazendaErr, refetch: refetchFazenda } = useFazenda(user?.id)
  const { data: stats, isLoading: loadingStats, isError: statsError, error: statsErr, refetch: refetchStats } = useDashboardStats(user?.id)
  const { data: gadoStats } = useGadoStats(user?.id)
  const { data: recentActivities } = useRecentActivities(user?.id)
  const { data: formulacoesBackfill } = useFormulacoesBackfillAlert(user?.id)

  const loading = loadingFazenda || loadingStats
  const loadError = fazendaError || statsError

  const cadastroStats = stats?.cadastroStats ?? { pastos: 0, lotes: 0, funcionarios: 0, insumos: 0, pluviometros: 0, medicamentos: 0 }
  const cadernetaStats = stats?.cadernetaStats ?? {
    maternidade: 0, enfermaria: 0, pastagens: 0, rodeio: 0, suplementacao: 0,
    bebedouros: 0, movimentacao: 0, morte: 0, clima: 0, abastecimento: 0,
    cantina: 0, limpeza: 0, 'operacoes-maquinas': 0, almoxarifado: 0, 'manutencao-maquinas': 0, problemas: 0,
  }
  const registrosHoje = stats?.registrosHoje ?? 0
  const gadoData = gadoStats ?? {
    totalAnimais: 0, animaisPorLote: [], mortesMesAtual: 0,
    pesoMedioLotes: 0, enfermariaMesAtual: 0, causasMorteFrequentes: [],
  }

  if (loading) {
    return <PageSkeleton variant="grid" />
  }

  if (loadError) {
    const errMsg = (fazendaErr as Error)?.message || (statsErr as Error)?.message
    return (
      <ErrorState
        message="Erro ao carregar dados do dashboard"
        detail={errMsg}
        onRetry={() => { refetchFazenda(); refetchStats() }}
      />
    )
  }

  if (!fazenda) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 mb-4">Nenhuma fazenda vinculada ao seu usuário</p>
        <p className="text-sm text-gray-500">Entre em contato com o administrador</p>
      </div>
    )
  }

  return (
    <div className="space-y-8 page-transition">
      {/* Header da Fazenda */}
      <div className="bg-white rounded-xl p-4 sm:p-6 shadow-md border border-gray-100">
        <div className="flex items-center gap-3 sm:gap-4">
          {fazenda.logo_url ? (
            <img
              src={fazenda.logo_url}
              alt={fazenda.nome}
              loading="eager"
              className="w-20 h-12 sm:w-32 sm:h-16 rounded-xl object-contain"
            />
          ) : (
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl bg-gray-100 flex items-center justify-center border border-gray-200">
              <span className="text-2xl sm:text-3xl text-gray-400">F</span>
            </div>
          )}
          <div>
            <h2 className="text-lg sm:text-2xl font-bold text-gray-800">{fazenda.nome}</h2>
            <p className="text-xs sm:text-sm text-gray-500">ID: {fazenda.acesso_id}</p>
          </div>
        </div>
      </div>

      {/* Avisos: formulações com categoria a confirmar */}
      {formulacoesBackfill && formulacoesBackfill.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 sm:p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1 min-w-0">
              <h3 className="text-base sm:text-lg font-semibold text-amber-900 mb-1">
                {formulacoesBackfill.length} formulaç{formulacoesBackfill.length > 1 ? 'ões' : ''} com categoria a confirmar
              </h3>
              <p className="text-xs sm:text-sm text-amber-800 mb-3">
                A categoria destas formulações foi inferida automaticamente e precisa ser revisada. Clique para editar e confirmar o valor correto.
              </p>
              <ul className="space-y-1">
                {formulacoesBackfill.map((f) => (
                  <li key={f.id}>
                    <button
                      onClick={() => navigate(`/controller/formulacoes?edit=${f.id}`)}
                      className="text-sm text-amber-900 hover:text-amber-700 underline underline-offset-2 text-left"
                    >
                      {f.nome}
                      {f.categoria && <span className="text-amber-700"> (sugerida: {f.categoria})</span>}
                      {f.categoria_inferida_observacao && <span className="text-amber-600 italic"> — {f.categoria_inferida_observacao}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Resumo Consolidado */}
      <div>
        <h3 className="text-lg sm:text-xl font-semibold text-gray-800 mb-4 sm:mb-6">Resumo Consolidado</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
          <Card className="bg-white p-4 sm:p-6 shadow-md rounded-xl border border-gray-100 border-l-4 border-l-blue-500 hover:shadow-lg transition-shadow">
            <p className="text-xs sm:text-sm text-gray-500 mb-1 sm:mb-2">Registros Hoje</p>
            <p className="text-3xl sm:text-4xl font-bold text-blue-600">
              {registrosHoje}
            </p>
          </Card>
          <Card className="bg-white p-4 sm:p-6 shadow-md rounded-xl border border-gray-100 border-l-4 border-l-green-500 hover:shadow-lg transition-shadow">
            <p className="text-xs sm:text-sm text-gray-500 mb-1 sm:mb-2">Total Cadastros</p>
            <p className="text-3xl sm:text-4xl font-bold text-green-600">
              {cadastroStats.pastos + cadastroStats.lotes + cadastroStats.funcionarios + cadastroStats.insumos + cadastroStats.pluviometros + cadastroStats.medicamentos}
            </p>
          </Card>
          <Card className="bg-white p-4 sm:p-6 shadow-md rounded-xl border border-gray-100 border-l-4 border-l-purple-500 hover:shadow-lg transition-shadow">
            <p className="text-xs sm:text-sm text-gray-500 mb-1 sm:mb-2">Total Registros</p>
            <p className="text-3xl sm:text-4xl font-bold text-purple-600">
              {cadernetaStats.maternidade + cadernetaStats.enfermaria + cadernetaStats.pastagens + cadernetaStats.rodeio + cadernetaStats.suplementacao + cadernetaStats.bebedouros + cadernetaStats.movimentacao + cadernetaStats.morte + cadernetaStats.clima + cadernetaStats.abastecimento + cadernetaStats.cantina + cadernetaStats.limpeza + cadernetaStats['operacoes-maquinas'] + cadernetaStats.almoxarifado + cadernetaStats['manutencao-maquinas'] + cadernetaStats.problemas}
            </p>
          </Card>
        </div>
      </div>

      {/* Métricas de Produção (Gado + Saúde) */}
      <div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 sm:mb-6 gap-4">
          <h3 className="text-lg sm:text-xl font-semibold text-gray-800">Métricas de Produção</h3>
          <div className="flex gap-2 w-full md:w-auto">
            <Button variant="secondary" onClick={() => navigate('/controller/relatorios/gado')} className="flex-1 md:flex-none text-xs sm:text-sm">
              Relatório Rebanho
            </Button>
            <Button variant="secondary" onClick={() => navigate('/controller/relatorios/saude')} className="flex-1 md:flex-none text-xs sm:text-sm">
              Relatório Saúde
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
          <Card className="bg-white p-4 sm:p-6 shadow-md rounded-xl border border-gray-100 border-l-4 border-l-green-500 hover:shadow-lg transition-shadow">
            <p className="text-xs sm:text-sm text-gray-500 mb-1 sm:mb-2">Total de Animais</p>
            <p className="text-3xl sm:text-4xl font-bold text-green-600">{gadoData.totalAnimais}</p>
            <p className="text-xs text-gray-400 mt-1 sm:mt-2">Cabeças</p>
          </Card>
          <Card className="bg-white p-4 sm:p-6 shadow-md rounded-xl border border-gray-100 border-l-4 border-l-red-500 hover:shadow-lg transition-shadow">
            <p className="text-xs sm:text-sm text-gray-500 mb-1 sm:mb-2">Mortes Totais</p>
            <p className="text-3xl sm:text-4xl font-bold text-red-600">{gadoData.mortesMesAtual}</p>
            <p className="text-xs text-gray-400 mt-1 sm:mt-2">Registros totais</p>
          </Card>
          <Card className="bg-white p-4 sm:p-6 shadow-md rounded-xl border border-gray-100 border-l-4 border-l-blue-500 hover:shadow-lg transition-shadow">
            <p className="text-xs sm:text-sm text-gray-500 mb-1 sm:mb-2">Peso Vivo Médio</p>
            <p className="text-3xl sm:text-4xl font-bold text-blue-600">{gadoData.pesoMedioLotes.toFixed(0)}</p>
            <p className="text-xs text-gray-400 mt-1 sm:mt-2">kg por animal</p>
          </Card>
          <Card className="bg-white p-4 sm:p-6 shadow-md rounded-xl border border-gray-100 border-l-4 border-l-orange-500 hover:shadow-lg transition-shadow">
            <p className="text-xs sm:text-sm text-gray-500 mb-1 sm:mb-2">Casos Enfermaria</p>
            <p className="text-3xl sm:text-4xl font-bold text-orange-600">{gadoData.enfermariaMesAtual}</p>
            <p className="text-xs text-gray-400 mt-1 sm:mt-2">Registros totais</p>
          </Card>
        </div>
      </div>

      {/* Animais por Lote */}
      {gadoData.animaisPorLote.length > 0 && (
        <div>
          <h3 className="text-lg sm:text-xl font-semibold text-gray-800 mb-4 sm:mb-6">Animais por Lote</h3>
          <Card className="bg-white p-4 sm:p-6 shadow-md rounded-xl border border-gray-100">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {gadoData.animaisPorLote.map((item) => (
                <div key={item.nome} className="flex justify-between items-center p-4 bg-gray-50 rounded-xl border border-gray-100 hover:bg-gray-100 transition-colors">
                  <p className="font-medium text-gray-800">{item.nome}</p>
                  <p className="text-lg font-bold text-gray-800">{item.cabecas}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Estatísticas de Cadastros */}
      <div>
        <h3 className="text-lg sm:text-xl font-semibold text-gray-800 mb-4 sm:mb-6">Resumo</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 md:gap-6">
          <Card className="bg-white p-4 sm:p-6 shadow-md rounded-xl border border-gray-100 hover:shadow-lg transition-shadow">
            <p className="text-xs sm:text-sm text-gray-500 mb-1 sm:mb-2">Pastos</p>
            <p className="text-3xl sm:text-4xl font-bold text-gray-800">{cadastroStats.pastos}</p>
            <Button
              variant="secondary"
              className="mt-3 sm:mt-4 w-full text-xs sm:text-sm"
              onClick={() => navigate('/controller/pastos')}
            >
              Gerenciar
            </Button>
          </Card>
          <Card className="bg-white p-4 sm:p-6 shadow-md rounded-xl border border-gray-100 hover:shadow-lg transition-shadow">
            <p className="text-xs sm:text-sm text-gray-500 mb-1 sm:mb-2">Lotes</p>
            <p className="text-3xl sm:text-4xl font-bold text-gray-800">{cadastroStats.lotes}</p>
            <Button
              variant="secondary"
              className="mt-3 sm:mt-4 w-full text-xs sm:text-sm"
              onClick={() => navigate('/controller/lotes')}
            >
              Gerenciar
            </Button>
          </Card>
          <Card className="bg-white p-4 sm:p-6 shadow-md rounded-xl border border-gray-100 hover:shadow-lg transition-shadow">
            <p className="text-xs sm:text-sm text-gray-500 mb-1 sm:mb-2">Funcionários</p>
            <p className="text-3xl sm:text-4xl font-bold text-gray-800">{cadastroStats.funcionarios}</p>
            <Button
              variant="secondary"
              className="mt-3 sm:mt-4 w-full text-xs sm:text-sm"
              onClick={() => navigate('/controller/funcionarios')}
            >
              Gerenciar
            </Button>
          </Card>
          <Card className="bg-white p-4 sm:p-6 shadow-md rounded-xl border border-gray-100 hover:shadow-lg transition-shadow">
            <p className="text-xs sm:text-sm text-gray-500 mb-1 sm:mb-2">Insumos</p>
            <p className="text-3xl sm:text-4xl font-bold text-gray-800">{cadastroStats.insumos}</p>
            <Button
              variant="secondary"
              className="mt-3 sm:mt-4 w-full text-xs sm:text-sm"
              onClick={() => navigate('/controller/insumos')}
            >
              Gerenciar
            </Button>
          </Card>
          <Card className="bg-white p-4 sm:p-6 shadow-md rounded-xl border border-gray-100 hover:shadow-lg transition-shadow">
            <p className="text-xs sm:text-sm text-gray-500 mb-1 sm:mb-2">Pluviômetros</p>
            <p className="text-3xl sm:text-4xl font-bold text-gray-800">{cadastroStats.pluviometros}</p>
            <Button
              variant="secondary"
              className="mt-3 sm:mt-4 w-full text-xs sm:text-sm"
              onClick={() => navigate('/controller/pluviometros')}
            >
              Gerenciar
            </Button>
          </Card>
          <Card className="bg-white p-4 sm:p-6 shadow-md rounded-xl border border-gray-100 hover:shadow-lg transition-shadow">
            <p className="text-xs sm:text-sm text-gray-500 mb-1 sm:mb-2">Medicamentos</p>
            <p className="text-3xl sm:text-4xl font-bold text-gray-800">{cadastroStats.medicamentos}</p>
            <Button
              variant="secondary"
              className="mt-3 sm:mt-4 w-full text-xs sm:text-sm"
              onClick={() => navigate('/controller/medicamentos')}
            >
              Gerenciar
            </Button>
          </Card>
        </div>
      </div>

      {/* Estatísticas de Cadernetas */}
      <div>
        <h3 className="text-lg sm:text-xl font-semibold text-gray-800 mb-4 sm:mb-6">Cadernetas</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
          <Card 
            className="bg-white p-3 sm:p-6 shadow-md rounded-xl border border-gray-100 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate('/controller/cadernetas/maternidade')}
          >
            <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-3">
              <img src={CADERNETA_IMAGES.maternidade} alt={CADERNETA_TITLES.maternidade} loading="lazy" className="w-12 h-12 sm:w-16 sm:h-16 rounded-[24px] sm:rounded-[32px]" />
              <div>
                <p className="text-xs sm:text-sm text-gray-500 mb-0.5 sm:mb-1">{CADERNETA_TITLES.maternidade}</p>
                <p className="text-2xl sm:text-4xl font-bold text-gray-800">{cadernetaStats.maternidade}</p>
              </div>
            </div>
          </Card>
          <Card 
            className="bg-white p-3 sm:p-6 shadow-md rounded-xl border border-gray-100 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate('/controller/cadernetas/pastagens')}
          >
            <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-3">
              <img src={CADERNETA_IMAGES.pastagens} alt={CADERNETA_TITLES.pastagens} loading="lazy" className="w-12 h-12 sm:w-16 sm:h-16 rounded-[24px] sm:rounded-[32px]" />
              <div>
                <p className="text-xs sm:text-sm text-gray-500 mb-0.5 sm:mb-1">{CADERNETA_TITLES.pastagens}</p>
                <p className="text-2xl sm:text-4xl font-bold text-gray-800">{cadernetaStats.pastagens}</p>
              </div>
            </div>
          </Card>
          <Card 
            className="bg-white p-3 sm:p-6 shadow-md rounded-xl border border-gray-100 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate('/controller/cadernetas/rodeio')}
          >
            <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-3">
              <img src={CADERNETA_IMAGES.rodeio} alt={CADERNETA_TITLES.rodeio} loading="lazy" className="w-12 h-12 sm:w-16 sm:h-16 rounded-[24px] sm:rounded-[32px]" />
              <div>
                <p className="text-xs sm:text-sm text-gray-500 mb-0.5 sm:mb-1">{CADERNETA_TITLES.rodeio}</p>
                <p className="text-2xl sm:text-4xl font-bold text-gray-800">{cadernetaStats.rodeio}</p>
              </div>
            </div>
          </Card>
          <Card 
            className="bg-white p-3 sm:p-6 shadow-md rounded-xl border border-gray-100 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate('/controller/cadernetas/suplementacao')}
          >
            <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-3">
              <img src={CADERNETA_IMAGES.suplementacao} alt={CADERNETA_TITLES.suplementacao} loading="lazy" className="w-12 h-12 sm:w-16 sm:h-16 rounded-[24px] sm:rounded-[32px]" />
              <div>
                <p className="text-xs sm:text-sm text-gray-500 mb-0.5 sm:mb-1">{CADERNETA_TITLES.suplementacao}</p>
                <p className="text-2xl sm:text-4xl font-bold text-gray-800">{cadernetaStats.suplementacao}</p>
              </div>
            </div>
          </Card>
          <Card 
            className="bg-white p-3 sm:p-6 shadow-md rounded-xl border border-gray-100 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate('/controller/cadernetas/bebedouros')}
          >
            <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-3">
              <img src={CADERNETA_IMAGES.bebedouros} alt={CADERNETA_TITLES.bebedouros} loading="lazy" className="w-12 h-12 sm:w-16 sm:h-16 rounded-[24px] sm:rounded-[32px]" />
              <div>
                <p className="text-xs sm:text-sm text-gray-500 mb-0.5 sm:mb-1">{CADERNETA_TITLES.bebedouros}</p>
                <p className="text-2xl sm:text-4xl font-bold text-gray-800">{cadernetaStats.bebedouros}</p>
              </div>
            </div>
          </Card>
          <Card 
            className="bg-white p-3 sm:p-6 shadow-md rounded-xl border border-gray-100 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate('/controller/cadernetas/movimentacao')}
          >
            <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-3">
              <img src={CADERNETA_IMAGES.movimentacao} alt={CADERNETA_TITLES.movimentacao} loading="lazy" className="w-12 h-12 sm:w-16 sm:h-16 rounded-[24px] sm:rounded-[32px]" />
              <div>
                <p className="text-xs sm:text-sm text-gray-500 mb-0.5 sm:mb-1">{CADERNETA_TITLES.movimentacao}</p>
                <p className="text-2xl sm:text-4xl font-bold text-gray-800">{cadernetaStats.movimentacao}</p>
              </div>
            </div>
          </Card>
          <Card 
            className="bg-white p-3 sm:p-6 shadow-md rounded-xl border border-gray-100 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate('/controller/cadernetas/enfermaria')}
          >
            <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-3">
              <img src={CADERNETA_IMAGES.enfermaria} alt={CADERNETA_TITLES.enfermaria} loading="lazy" className="w-12 h-12 sm:w-16 sm:h-16 rounded-[24px] sm:rounded-[32px]" />
              <div>
                <p className="text-xs sm:text-sm text-gray-500 mb-0.5 sm:mb-1">{CADERNETA_TITLES.enfermaria}</p>
                <p className="text-2xl sm:text-4xl font-bold text-gray-800">{cadernetaStats.enfermaria}</p>
              </div>
            </div>
          </Card>
          <Card 
            className="bg-white p-3 sm:p-6 shadow-md rounded-xl border border-gray-100 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate('/controller/cadernetas/morte')}
          >
            <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-3">
              <img src={CADERNETA_IMAGES.morte} alt={CADERNETA_TITLES.morte} loading="lazy" className="w-12 h-12 sm:w-16 sm:h-16 rounded-[24px] sm:rounded-[32px]" />
              <div>
                <p className="text-xs sm:text-sm text-gray-500 mb-0.5 sm:mb-1">{CADERNETA_TITLES.morte}</p>
                <p className="text-2xl sm:text-4xl font-bold text-gray-800">{cadernetaStats.morte}</p>
              </div>
            </div>
          </Card>
          <Card 
            className="bg-white p-3 sm:p-6 shadow-md rounded-xl border border-gray-100 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate('/controller/cadernetas/clima')}
          >
            <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-3">
              <img src={CADERNETA_IMAGES.clima} alt={CADERNETA_TITLES.clima} loading="lazy" className="w-12 h-12 sm:w-16 sm:h-16 rounded-[24px] sm:rounded-[32px]" />
              <div>
                <p className="text-xs sm:text-sm text-gray-500 mb-0.5 sm:mb-1">{CADERNETA_TITLES.clima}</p>
                <p className="text-2xl sm:text-4xl font-bold text-gray-800">{cadernetaStats.clima}</p>
              </div>
            </div>
          </Card>
          <Card 
            className="bg-white p-3 sm:p-6 shadow-md rounded-xl border border-gray-100 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate('/controller/cadernetas/abastecimento')}
          >
            <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-3">
              <img src={CADERNETA_IMAGES.abastecimento} alt={CADERNETA_TITLES.abastecimento} loading="lazy" className="w-12 h-12 sm:w-16 sm:h-16 rounded-[24px] sm:rounded-[32px]" />
              <div>
                <p className="text-xs sm:text-sm text-gray-500 mb-0.5 sm:mb-1">{CADERNETA_TITLES.abastecimento}</p>
                <p className="text-2xl sm:text-4xl font-bold text-gray-800">{cadernetaStats.abastecimento}</p>
              </div>
            </div>
          </Card>
          <Card 
            className="bg-white p-3 sm:p-6 shadow-md rounded-xl border border-gray-100 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate('/controller/cadernetas/alimentacao')}
          >
            <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-3">
              <img src={CADERNETA_IMAGES.cantina} alt={CADERNETA_TITLES.cantina} loading="lazy" className="w-12 h-12 sm:w-16 sm:h-16 rounded-[24px] sm:rounded-[32px]" />
              <div>
                <p className="text-xs sm:text-sm text-gray-500 mb-0.5 sm:mb-1">{CADERNETA_TITLES.cantina}</p>
                <p className="text-2xl sm:text-4xl font-bold text-gray-800">{cadernetaStats.cantina}</p>
              </div>
            </div>
          </Card>
          <Card 
            className="bg-white p-3 sm:p-6 shadow-md rounded-xl border border-gray-100 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate('/controller/cadernetas/limpeza')}
          >
            <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-3">
              <img src={CADERNETA_IMAGES.limpeza} alt={CADERNETA_TITLES.limpeza} loading="lazy" className="w-12 h-12 sm:w-16 sm:h-16 rounded-[24px] sm:rounded-[32px]" />
              <div>
                <p className="text-xs sm:text-sm text-gray-500 mb-0.5 sm:mb-1">{CADERNETA_TITLES.limpeza}</p>
                <p className="text-2xl sm:text-4xl font-bold text-gray-800">{cadernetaStats.limpeza}</p>
              </div>
            </div>
          </Card>
          <Card
            className="bg-white p-3 sm:p-6 shadow-md rounded-xl border border-gray-100 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate('/controller/cadernetas/operacoes-maquinas')}
          >
            <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-3">
              <img src={CADERNETA_IMAGES['operacoes-maquinas']} alt={CADERNETA_TITLES['operacoes-maquinas']} loading="lazy" className="w-12 h-12 sm:w-16 sm:h-16 rounded-[24px] sm:rounded-[32px]" />
              <div>
                <p className="text-xs sm:text-sm text-gray-500 mb-0.5 sm:mb-1">{CADERNETA_TITLES['operacoes-maquinas']}</p>
                <p className="text-2xl sm:text-4xl font-bold text-gray-800">{cadernetaStats['operacoes-maquinas']}</p>
              </div>
            </div>
          </Card>
          <Card
            className="bg-white p-3 sm:p-6 shadow-md rounded-xl border border-gray-100 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate('/controller/cadernetas/almoxarifado')}
          >
            <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-3">
              <img src={CADERNETA_IMAGES.almoxarifado} alt={CADERNETA_TITLES.almoxarifado} loading="lazy" className="w-12 h-12 sm:w-16 sm:h-16 rounded-[24px] sm:rounded-[32px]" />
              <div>
                <p className="text-xs sm:text-sm text-gray-500 mb-0.5 sm:mb-1">{CADERNETA_TITLES.almoxarifado}</p>
                <p className="text-2xl sm:text-4xl font-bold text-gray-800">{cadernetaStats.almoxarifado}</p>
              </div>
            </div>
          </Card>
          <Card
            className="bg-white p-3 sm:p-6 shadow-md rounded-xl border border-gray-100 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate('/controller/cadernetas/manutencao-maquinas')}
          >
            <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-3">
              <img src={CADERNETA_IMAGES['manutencao-maquinas']} alt={CADERNETA_TITLES['manutencao-maquinas']} loading="lazy" className="w-12 h-12 sm:w-16 sm:h-16 rounded-[24px] sm:rounded-[32px]" />
              <div>
                <p className="text-xs sm:text-sm text-gray-500 mb-0.5 sm:mb-1">{CADERNETA_TITLES['manutencao-maquinas']}</p>
                <p className="text-2xl sm:text-4xl font-bold text-gray-800">{cadernetaStats['manutencao-maquinas']}</p>
              </div>
            </div>
          </Card>
          <Card
            className="bg-white p-3 sm:p-6 shadow-md rounded-xl border border-gray-100 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate('/controller/cadernetas/problemas')}
          >
            <div className="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-3">
              <img src={CADERNETA_IMAGES.problemas} alt={CADERNETA_TITLES.problemas} loading="lazy" className="w-12 h-12 sm:w-16 sm:h-16 rounded-[24px] sm:rounded-[32px]" />
              <div>
                <p className="text-xs sm:text-sm text-gray-500 mb-0.5 sm:mb-1">{CADERNETA_TITLES.problemas}</p>
                <p className="text-2xl sm:text-4xl font-bold text-gray-800">{cadernetaStats.problemas}</p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Atividades Recentes */}
      {(recentActivities ?? []).length > 0 && (
        <Card className="bg-white p-4 sm:p-6 border-0 shadow-sm">
          <h3 className="text-lg sm:text-xl font-semibold text-gray-800 mb-3 sm:mb-4">Atividades Recentes</h3>
          <div className="space-y-2 sm:space-y-3">
            {(recentActivities ?? []).slice(0, 10).map((activity) => (
              <div
                key={activity.id}
                className="flex items-center justify-between p-3 sm:p-4 bg-gray-50 rounded-lg cursor-pointer"
                onClick={() => navigate(activity.path)}
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
                    <span className="text-sm sm:text-lg">📝</span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-800 text-sm sm:text-base truncate">{activity.title}</p>
                    <p className="text-xs sm:text-sm text-gray-500 truncate">{activity.type}</p>
                  </div>
                </div>
                <p className="text-xs sm:text-sm text-gray-500 flex-shrink-0">{activity.date}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Ações Rápidas */}
      <Card className="bg-white p-4 sm:p-6 border-0 shadow-sm">
        <h3 className="text-lg sm:text-xl font-semibold text-gray-800 mb-3 sm:mb-4">Ações Rápidas</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Button onClick={() => navigate('/controller/pastos')} className="text-sm">
            Novo Pasto
          </Button>
          <Button onClick={() => navigate('/controller/lotes')} className="text-sm">
            Novo Lote
          </Button>
          <Button onClick={() => navigate('/controller/funcionarios')} className="text-sm">
            Novo Funcionário
          </Button>
          <Button onClick={() => navigate('/controller/insumos')} className="text-sm">
            Novo Insumo
          </Button>
        </div>
      </Card>
    </div>
  )
}
