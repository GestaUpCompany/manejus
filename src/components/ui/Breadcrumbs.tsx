import { useLocation, useNavigate } from 'react-router-dom'

interface BreadcrumbItem {
  label: string
  path: string
}

interface BreadcrumbsProps {
  maxItems?: number
}

export function Breadcrumbs({ maxItems = 3 }: BreadcrumbsProps) {
  const location = useLocation()
  const navigate = useNavigate()

  const generateBreadcrumbs = (): BreadcrumbItem[] => {
    const pathnames = location.pathname.split('/').filter((x) => x)
    const breadcrumbs: BreadcrumbItem[] = []

    // Não mostrar breadcrumbs se estiver na home
    if (location.pathname === '/controller/dashboard' || location.pathname === '/controller') {
      return []
    }

    // Adicionar Home
    breadcrumbs.push({ label: 'Home', path: '/controller/dashboard' })

    // Se estiver em uma rota de caderneta, adicionar Cadernetas como breadcrumb
    if (pathnames.includes('cadernetas') && pathnames.length > 2) {
      breadcrumbs.push({ label: 'Cadernetas', path: '/controller/cadernetas' })
    }

    pathnames.forEach((path, index) => {
      const routePath = `/${pathnames.slice(0, index + 1).join('/')}`
      
      // Pular breadcrumbs intermediários que não são rotas válidas
      // Mas incluir o último item (página atual)
      if (index < pathnames.length - 1) {
        // Se for 'cadernetas' e já adicionamos acima, pular
        if (path === 'cadernetas' && pathnames.length > 2) {
          return
        }
        // Para outros casos, pular intermediários
        return
      }
      
      // Converter rota para label amigável
      let label = path
        .replace(/-/g, ' ')
        .replace(/caderneta/g, 'Caderneta')
        .replace(/detalhes/g, 'Detalhes')
        .replace(/cadastro/g, 'Cadastro')
        .replace(/configuracoes/g, 'Configurações')
        .replace(/abastecimento/g, 'Abastecimento')
        .replace(/alimentacao/g, 'Alimentação')
        .replace(/almoxarifado/g, 'Almoxarifado')
        .replace(/cantina/g, 'Cantina')
        .replace(/clima/g, 'Clima')
        .replace(/enfermaria/g, 'Enfermaria')
        .replace(/individuo/g, 'Indivíduo')
        .replace(/individuos/g, 'Indivíduos')
        .replace(/limpeza/g, 'Limpeza')
        .replace(/marmita/g, 'Marmita')
        .replace(/materiais/g, 'Materiais')
        .replace(/maternidade/g, 'Maternidade')
        .replace(/medicamentos/g, 'Medicamentos')
        .replace(/monitoramento/g, 'Monitoramento')
        .replace(/morte/g, 'Morte')
        .replace(/movimentacao/g, 'Movimentação')
        .replace(/operacoes/g, 'Operações')
        .replace(/pastagens/g, 'Pastagens')
        .replace(/pasto/g, 'Pasto')
        .replace(/pastos/g, 'Pastos')
        .replace(/problemas/g, 'Problemas')
        .replace(/programacao/g, 'Programação')
        .replace(/relatorios/g, 'Relatórios')
        .replace(/reproducao/g, 'Reprodução')
        .replace(/rodeio/g, 'Rodeio')
        .replace(/suplementacao/g, 'Suplementação')
        .replace(/tratos/g, 'Tratos')
        .replace(/usuario/g, 'Usuário')
        .replace(/usuarios/g, 'Usuários')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')

      breadcrumbs.push({ label, path: routePath })
    })

    return breadcrumbs
  }

  const breadcrumbs = generateBreadcrumbs()
  const displayBreadcrumbs = maxItems > 0 && breadcrumbs.length > maxItems
    ? [
        breadcrumbs[0],
        { label: '...', path: '' },
        ...breadcrumbs.slice(-maxItems + 1)
      ]
    : breadcrumbs

  return (
    <nav className="flex items-center space-x-2 text-xs sm:text-sm text-content-muted py-2 px-4 md:px-6 bg-surface-2 border-b border-border-base breadcrumb-fade-in overflow-x-auto whitespace-nowrap scrollbar-hide">
      {displayBreadcrumbs.map((breadcrumb, index) => (
        <div key={breadcrumb.path} className="flex items-center flex-shrink-0">
          {index > 0 && (
            <svg className="w-3 h-3 sm:w-4 sm:h-4 mx-1 sm:mx-2 text-content-faint flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          )}
          {breadcrumb.label === '...' ? (
            <span className="text-content-faint">{breadcrumb.label}</span>
          ) : (
            <button
              onClick={() => navigate(breadcrumb.path)}
              className={`link-hover ${
                index === displayBreadcrumbs.length - 1 ? 'text-content-strong font-medium cursor-default' : ''
              }`}
              disabled={index === displayBreadcrumbs.length - 1}
            >
              {breadcrumb.label}
            </button>
          )}
        </div>
      ))}
    </nav>
  )
}
