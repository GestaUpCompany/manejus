import { Link } from 'react-router-dom'

interface RelatorioEmBreve {
  tipo: string
  titulo: string
  descricao: string
  icone: string
}

// Mesmos passos da tela /relatorios/vision (1. Fazenda e dados, 2. Período e páginas, 3. Conferir e gerar)
const PASSOS = [
  { titulo: 'Fazenda e dados', descricao: 'Escolha a fazenda e envie a planilha Vision (.xlsm).' },
  { titulo: 'Período e páginas', descricao: 'Defina o intervalo e oculte as páginas que não quiser.' },
  { titulo: 'Conferir e gerar', descricao: 'Veja a prévia e então gere o link público ou o PDF.' },
]

const RELATORIOS_EM_BREVE: RelatorioEmBreve[] = [
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
    <div className="space-y-8 max-w-6xl">
      <header className="flex flex-col gap-1 border-b border-border-base pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-content-faint">Central de relatórios</p>
        <h1 className="text-3xl font-bold tracking-tight text-content-strong">Relatórios</h1>
        <p className="max-w-2xl text-sm text-content-muted">
          Gere relatórios financeiros da fazenda em PDF ou em link público para análise e compartilhamento.
        </p>
      </header>

      <section aria-labelledby="titulo-vision" className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-green-900 via-green-800 to-blue-900 p-6 text-white shadow-sm">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full border-[28px] border-white/5" />
        <div aria-hidden className="pointer-events-none absolute -bottom-14 right-16 h-36 w-36 rounded-full border-[20px] border-white/5" />
        <div className="relative grid gap-6 lg:grid-cols-5 lg:items-center">
          <div className="lg:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-green-100">Disponível agora</p>
            <h2 id="titulo-vision" className="mt-2 text-2xl font-bold">Relatório Vision</h2>
            <p className="mt-2 text-sm text-green-50/90">
              Relatório financeiro completo a partir da planilha Vision, em link público interativo ou PDF.
            </p>
            <Link
              to="/relatorios/vision"
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-green-900 shadow-sm transition-colors hover:bg-green-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Gerar relatório
              <span aria-hidden>→</span>
            </Link>
          </div>

          <ol className="grid gap-3 sm:grid-cols-3 lg:col-span-3">
            {PASSOS.map((passo, i) => (
              <li key={passo.titulo} className="rounded-xl bg-white/10 p-4 ring-1 ring-inset ring-white/15">
                <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-sm font-bold text-green-900">
                  {i + 1}
                </span>
                <h3 className="mt-3 text-sm font-semibold">{passo.titulo}</h3>
                <p className="mt-1 text-xs leading-relaxed text-green-50/90">{passo.descricao}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="titulo-em-breve">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <div>
            <h2 id="titulo-em-breve" className="text-lg font-bold text-content-strong">Em breve</h2>
            <p className="text-sm text-content-muted">Relatórios em desenvolvimento. Ainda não podem ser gerados.</p>
          </div>
          <span className="text-xs tabular-nums text-content-faint">{RELATORIOS_EM_BREVE.length} planejados</span>
        </div>
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {RELATORIOS_EM_BREVE.map((rel) => (
            <li key={rel.tipo} className="flex items-start gap-4 rounded-xl border border-border-base bg-surface-2/60 p-4">
              <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-1 text-xl">
                {rel.icone}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-content-strong">
                  {rel.titulo}
                  <span className="rounded-full bg-surface-1 px-2 py-0.5 text-[11px] font-medium text-content-muted ring-1 ring-inset ring-border-base">
                    Em breve
                  </span>
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-content-muted">{rel.descricao}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
