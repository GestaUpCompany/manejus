/**
 * Mapa de paths para funções de dynamic import.
 * Permite prefetch de chunks de rota on-hover, antes do clique.
 * O browser cacheia o chunk; quando o usuário clica, a navegação é instantânea.
 */
const routeImporters: Record<string, () => Promise<unknown>> = {
  // Controller - core
  '/controller/dashboard': () => import('../pages/controller/Dashboard'),
  '/controller/lotes': () => import('../pages/controller/Lotes'),
  '/controller/individuos': () => import('../pages/controller/Individuos'),
  '/controller/individuos/novo': () => import('../pages/controller/IndividuoNovo'),
  '/controller/cadastros-auxiliares': () => import('../pages/controller/CadastrosAuxiliares'),
  '/controller/faixas-categorias': () => import('../pages/controller/FaixasCategorias'),
  '/controller/mapa-fazenda': () => import('../pages/controller/MapaFazenda'),

  // Pastagem e Ocupação
  '/controller/pastos': () => import('../pages/controller/Pastos'),
  '/controller/modulos-pastos': () => import('../pages/controller/ModulosPastos'),
  '/controller/historico-ocupacao': () => import('../pages/controller/HistoricoOcupacao'),

  // Confinamento e TIP
  '/controller/currais': () => import('../pages/controller/Currais'),
  '/controller/configuracao-tratos': () => import('../pages/controller/ProgramacaoTratos'),
  '/controller/acompanhamento-tratos': () => import('../pages/controller/AcompanhamentoTratos'),
  '/controller/historico-dietas': () => import('../pages/controller/HistoricoDietas'),

  // Insumos e Nutrição
  '/controller/insumos': () => import('../pages/controller/Insumos'),
  '/controller/formulacoes': () => import('../pages/controller/Formulacoes'),
  '/controller/historico-planos': () => import('../pages/controller/HistoricoPlanos'),

  // Parceiros
  '/controller/fornecedores': () => import('../pages/controller/Fornecedores'),
  '/controller/frigorificos': () => import('../pages/controller/Frigorificos'),

  // Aplicativo
  '/controller/cadernetas': () => import('../pages/controller/Cadernetas'),
  '/controller/rotinas': () => import('../pages/controller/Rotinas'),
  '/controller/auditoria-rotinas': () => import('../pages/controller/AuditoriaRotinas'),
  '/controller/rastreio-cadernetas': () => import('../pages/controller/RastreioCadernetas'),

  // Notificações
  '/controller/notificacoes': () => import('../pages/controller/Notificacoes'),

  // Planejamento
  '/controller/atividades': () => import('../pages/controller/Atividades'),
  '/controller/monitoramento-atividades': () => import('../pages/controller/MonitoramentoAtividades'),

  // Relatórios
  '/controller/relatorios': () => import('../pages/controller/Relatorios'),

  // Assistente IA
  '/controller/assistente-ia': () => import('../pages/controller/AssistenteIA'),
}

const prefetched = new Set<string>()

/**
 * Faz prefetch do chunk de uma rota via dynamic import.
 * Seguro chamar múltiplas vezes: só executa o import na primeira vez.
 */
export function prefetchRoute(path: string): void {
  if (prefetched.has(path)) return
  const importer = routeImporters[path]
  if (!importer) return
  prefetched.add(path)
  importer().catch(() => {
    // Se falhar, remove do set para permitir retry
    prefetched.delete(path)
  })
}
