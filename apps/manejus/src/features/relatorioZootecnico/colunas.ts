import type { LinhaZootecnica } from './agregacao'

export type TipoColuna = 'texto' | 'num2' | 'int' | 'pct1' | 'pct2' | 'brl' | 'data'

export interface ColunaZootecnica {
  header: string
  grupo: string
  width: number
  tipo: TipoColuna
  // Valor cru: datas em ISO (yyyy-mm-dd) e rendimento de carcaça em pontos percentuais (ex.: 54.5)
  valor: (l: LinhaZootecnica) => string | number | null
}

// Formato do Excel por tipo de coluna
export const FORMATO_EXCEL: Record<TipoColuna, string | undefined> = {
  texto: undefined,
  num2: '#,##0.00',
  int: '#,##0',
  pct1: '0.0%',
  pct2: '0.00"%"',
  brl: '"R$" #,##0.00',
  data: 'dd/mm/yyyy',
}

export function colunasZootecnicas(dias: number): ColunaZootecnica[] {
  const j = `${dias} dias`
  return [
    { grupo: 'Identificação', header: 'Lote', width: 28, tipo: 'texto', valor: (l) => l.loteNome },
    { grupo: 'Identificação', header: 'Pasto', width: 14, tipo: 'texto', valor: (l) => l.pastoNome },
    { grupo: 'Identificação', header: 'Área útil (ha)', width: 11, tipo: 'num2', valor: (l) => l.areaUtilHa },
    { grupo: 'Identificação', header: 'Tx. lotação (UA/ha)', width: 12, tipo: 'num2', valor: (l) => l.taxaLotacaoUaHa },
    { grupo: 'Identificação', header: 'Cabeças', width: 9, tipo: 'int', valor: (l) => l.cabecas },
    { grupo: 'Identificação', header: 'Categoria', width: 14, tipo: 'texto', valor: (l) => l.categoria },
    { grupo: 'Identificação', header: 'Raça', width: 12, tipo: 'texto', valor: (l) => l.raca },
    { grupo: 'Identificação', header: 'Sexo', width: 8, tipo: 'texto', valor: (l) => l.sexo },
    { grupo: 'Identificação', header: 'Estratégia nutricional', width: 20, tipo: 'texto', valor: (l) => l.estrategia },
    { grupo: 'Desempenho', header: 'Data pesagem', width: 12, tipo: 'data', valor: (l) => l.dataPesagem },
    { grupo: 'Desempenho', header: 'Peso entrada (kg)', width: 12, tipo: 'num2', valor: (l) => l.pesoEntradaKg },
    { grupo: 'Desempenho', header: 'Peso entrada (@)', width: 12, tipo: 'num2', valor: (l) => l.pesoEntradaArroba },
    { grupo: 'Desempenho', header: 'Peso atual (kg)', width: 12, tipo: 'num2', valor: (l) => l.pesoAtualKg },
    { grupo: 'Desempenho', header: 'Peso meta (kg)', width: 12, tipo: 'num2', valor: (l) => l.pesoMetaKg },
    { grupo: 'Desempenho', header: 'Data meta', width: 12, tipo: 'data', valor: (l) => l.dataMeta },
    { grupo: 'Desempenho', header: 'Período (dias)', width: 10, tipo: 'int', valor: (l) => l.periodoDias },
    { grupo: 'Desempenho', header: 'Rend. carcaça', width: 10, tipo: 'pct1', valor: (l) => l.rcPercent },
    { grupo: 'Financeiro', header: 'Valor carcaça (R$/@)', width: 13, tipo: 'brl', valor: (l) => l.precoVendaArroba },
    { grupo: 'Financeiro', header: 'Valor estoque (R$)', width: 15, tipo: 'brl', valor: (l) => l.valorEstoque },
    { grupo: 'Financeiro', header: 'Capital atual (R$)', width: 15, tipo: 'brl', valor: (l) => l.capitalAtual },
    { grupo: 'Consumo geral', header: 'MN (kg/cab/dia)', width: 11, tipo: 'num2', valor: (l) => l.geral.mnKgCabDia },
    { grupo: 'Consumo geral', header: 'MS (kg/cab/dia)', width: 11, tipo: 'num2', valor: (l) => l.geral.msKgCabDia },
    { grupo: 'Consumo geral', header: '%PV', width: 8, tipo: 'pct2', valor: (l) => l.geral.percentPv },
    { grupo: `Consumo ${j}`, header: 'MN (kg/cab/dia)', width: 11, tipo: 'num2', valor: (l) => l.janela.mnKgCabDia },
    { grupo: `Consumo ${j}`, header: 'MS (kg/cab/dia)', width: 11, tipo: 'num2', valor: (l) => l.janela.msKgCabDia },
    { grupo: `Consumo ${j}`, header: '%PV', width: 8, tipo: 'pct2', valor: (l) => l.janela.percentPv },
    { grupo: 'Meta e custo', header: 'Consumo meta (%PV)', width: 12, tipo: 'pct2', valor: (l) => l.consumoMetaPercentPv },
    { grupo: 'Meta e custo', header: 'Custo alimentar (R$/cab/dia)', width: 15, tipo: 'brl', valor: (l) => l.janela.custoCabDia ?? l.geral.custoCabDia },
  ]
}

const nf = (min: number, max: number) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: max })
const NUM2 = nf(2, 2)
const NUM0 = nf(0, 0)
const NUM1 = nf(1, 1)

export function formatarCelula(tipo: TipoColuna, v: string | number | null): string {
  if (v === null || v === undefined || v === '') return '—'
  if (tipo === 'texto') return String(v)
  if (tipo === 'data') return String(v).slice(0, 10).split('-').reverse().join('/')
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  switch (tipo) {
    case 'int': return NUM0.format(n)
    case 'num2': return NUM2.format(n)
    case 'pct1': return `${NUM1.format(n)}%`
    case 'pct2': return `${NUM2.format(n)}%`
    case 'brl': return `R$ ${NUM2.format(n)}`
  }
}

export interface TabelaZootecnica {
  colunas: { grupo: string; header: string; tipo: TipoColuna }[]
  geral: string[]
  linhas: string[][]
}

// Tabela já formatada, usada pela tela e pelo PDF (o endpoint só desenha)
export function montarTabelaZootecnica(geral: LinhaZootecnica, linhas: LinhaZootecnica[], dias: number): TabelaZootecnica {
  const cols = colunasZootecnicas(dias)
  const fmt = (l: LinhaZootecnica) => cols.map((c) => formatarCelula(c.tipo, c.valor(l)))
  return {
    colunas: cols.map(({ grupo, header, tipo }) => ({ grupo, header, tipo })),
    geral: fmt(geral),
    linhas: linhas.map(fmt),
  }
}
