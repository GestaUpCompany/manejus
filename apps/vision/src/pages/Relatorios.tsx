import { useNavigate } from 'react-router-dom'

interface RelatorioDisponivel {
  tipo: string
  titulo: string
  descricao: string
  icone: string
}

const RELATORIOS_DISPONIVEIS: RelatorioDisponivel[] = [
  {
    tipo: 'fluxo-caixa',
    titulo: 'Fluxo de Caixa',
    descricao: 'Entradas e saídas realizadas e previstas por período, com saldo acumulado diário, mensal e anual.',
    icone: '💸',
  },
  {
    tipo: 'dre',
    titulo: 'DRE / DGR',
    descricao: 'Demonstrativo de resultados da fazenda por período, com receitas, desembolsos e margens por atividade.',
    icone: '📊',
  },
  {
    tipo: 'contas-pagar',
    titulo: 'Contas a Pagar',
    descricao: 'Obrigações por fornecedor, categoria e vencimento, com posição de pagamentos realizados e previstos.',
    icone: '📤',
  },
  {
    tipo: 'contas-receber',
    titulo: 'Contas a Receber',
    descricao: 'Recebíveis de vendas por comprador e vencimento, com posição de recebimentos realizados e previstos.',
    icone: '📥',
  },
  {
    tipo: 'orcamento',
    titulo: 'Orçamento vs Realizado',
    descricao: 'Comparativo mensal entre o orçado e o realizado por plano de contas e centro de custo.',
    icone: '🎯',
  },
  {
    tipo: 'custo-cabeca',
    titulo: 'Custo por Cabeça',
    descricao: 'Desembolso por cabeça de gado e por categoria, cruzando financeiro com o rebanho do Manejus.',
    icone: '🐄',
  },
]

export function Relatorios() {
  const navigate = useNavigate()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-content-strong">Relatórios</h1>
        <p className="text-content-muted mt-1">
          Gere relatórios financeiros da fazenda em PDF para análise e compartilhamento.
        </p>
      </div>

      <div
        onClick={() => navigate('/relatorios/vision')}
        className="bg-surface-1 rounded-xl shadow-sm border-2 border-green-600 p-5 hover:shadow-md transition-shadow cursor-pointer flex items-center gap-4"
      >
        <div className="w-12 h-12 rounded-xl bg-green-700 text-white flex items-center justify-center flex-shrink-0">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-content-strong">Relatório Vision</h3>
          <p className="text-sm text-content-muted">
            Relatório financeiro completo a partir da planilha Vision — Link público interativo ou PDF.
          </p>
        </div>
        <span className="text-sm font-medium text-green-700 whitespace-nowrap">Gerar →</span>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-content mb-3 uppercase tracking-wide">Relatórios disponíveis</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {RELATORIOS_DISPONIVEIS.map((rel) => (
            <div
              key={rel.tipo}
              className="bg-surface-1 rounded-xl shadow-sm border border-border-base p-5 hover:shadow-md transition-shadow flex flex-col"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="text-3xl">{rel.icone}</div>
                <span className="inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-content-muted">
                  Em breve
                </span>
              </div>
              <h3 className="font-semibold text-content-strong mb-1">{rel.titulo}</h3>
              <p className="text-sm text-content-muted mb-4 flex-1">{rel.descricao}</p>
              <button
                disabled
                className="w-full rounded-lg bg-green-700 px-3 py-2 text-sm font-medium text-white opacity-50 cursor-not-allowed"
              >
                Gerar relatório PDF
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
