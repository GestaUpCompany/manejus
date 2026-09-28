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
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-content-strong">Relatórios</h1>
        <p className="text-content-muted mt-1">
          Gere relatórios financeiros da fazenda em PDF para análise e compartilhamento.
        </p>
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
