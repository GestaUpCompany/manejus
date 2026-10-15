import { montarLinhaGeral, type LinhaZootecnica } from './agregacao'

export type TipoColuna = 'texto' | 'num2' | 'int' | 'pct1' | 'pct2' | 'brl' | 'data'

export interface ColunaZootecnica {
  id: string
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
    { id: 'lote', grupo: 'Identificação', header: 'Lote', width: 28, tipo: 'texto', valor: (l) => l.loteNome },
    { id: 'pasto', grupo: 'Identificação', header: 'Pasto', width: 14, tipo: 'texto', valor: (l) => l.pastoNome },
    { id: 'curral', grupo: 'Identificação', header: 'Curral', width: 12, tipo: 'texto', valor: (l) => l.curralNome },
    { id: 'area', grupo: 'Identificação', header: 'Área útil (ha)', width: 11, tipo: 'num2', valor: (l) => l.areaUtilHa },
    { id: 'lotacao', grupo: 'Identificação', header: 'Tx. lotação (UA/ha)', width: 12, tipo: 'num2', valor: (l) => l.taxaLotacaoUaHa },
    { id: 'cabecas', grupo: 'Identificação', header: 'Cabeças', width: 9, tipo: 'int', valor: (l) => l.cabecas },
    { id: 'categoria', grupo: 'Identificação', header: 'Categoria', width: 14, tipo: 'texto', valor: (l) => l.categoria },
    { id: 'raca', grupo: 'Identificação', header: 'Raça', width: 12, tipo: 'texto', valor: (l) => l.raca },
    { id: 'sexo', grupo: 'Identificação', header: 'Sexo', width: 8, tipo: 'texto', valor: (l) => l.sexo },
    { id: 'estrategia', grupo: 'Identificação', header: 'Estratégia nutricional', width: 20, tipo: 'texto', valor: (l) => l.estrategia },
    { id: 'dataPesagem', grupo: 'Desempenho', header: 'Data pesagem', width: 12, tipo: 'data', valor: (l) => l.dataPesagem },
    { id: 'pesoEntradaKg', grupo: 'Desempenho', header: 'Peso entrada (kg)', width: 12, tipo: 'num2', valor: (l) => l.pesoEntradaKg },
    { id: 'pesoEntradaArroba', grupo: 'Desempenho', header: 'Peso entrada (@)', width: 12, tipo: 'num2', valor: (l) => l.pesoEntradaArroba },
    { id: 'pesoAtual', grupo: 'Desempenho', header: 'Peso atual (kg)', width: 12, tipo: 'num2', valor: (l) => l.pesoAtualKg },
    { id: 'pesoMeta', grupo: 'Desempenho', header: 'Peso meta (kg)', width: 12, tipo: 'num2', valor: (l) => l.pesoMetaKg },
    { id: 'dataMeta', grupo: 'Desempenho', header: 'Data meta', width: 12, tipo: 'data', valor: (l) => l.dataMeta },
    { id: 'periodo', grupo: 'Desempenho', header: 'Período (dias)', width: 10, tipo: 'int', valor: (l) => l.periodoDias },
    { id: 'rc', grupo: 'Desempenho', header: 'Rend. carcaça', width: 10, tipo: 'pct1', valor: (l) => l.rcPercent },
    { id: 'precoArroba', grupo: 'Financeiro', header: 'Valor carcaça (R$/@)', width: 13, tipo: 'brl', valor: (l) => l.precoVendaArroba },
    { id: 'valorEstoque', grupo: 'Financeiro', header: 'Valor estoque (R$)', width: 15, tipo: 'brl', valor: (l) => l.valorEstoque },
    { id: 'capital', grupo: 'Financeiro', header: 'Capital atual (R$)', width: 15, tipo: 'brl', valor: (l) => l.capitalAtual },
    { id: 'geralMn', grupo: 'Consumo geral', header: 'MN (kg/cab/dia)', width: 11, tipo: 'num2', valor: (l) => l.geral.mnKgCabDia },
    { id: 'geralMs', grupo: 'Consumo geral', header: 'MS (kg/cab/dia)', width: 11, tipo: 'num2', valor: (l) => l.geral.msKgCabDia },
    { id: 'geralPv', grupo: 'Consumo geral', header: '%PV', width: 8, tipo: 'pct2', valor: (l) => l.geral.percentPv },
    { id: 'janMn', grupo: `Consumo ${j}`, header: 'MN (kg/cab/dia)', width: 11, tipo: 'num2', valor: (l) => l.janela.mnKgCabDia },
    { id: 'janMs', grupo: `Consumo ${j}`, header: 'MS (kg/cab/dia)', width: 11, tipo: 'num2', valor: (l) => l.janela.msKgCabDia },
    { id: 'janPv', grupo: `Consumo ${j}`, header: '%PV', width: 8, tipo: 'pct2', valor: (l) => l.janela.percentPv },
    { id: 'consumoMeta', grupo: 'Meta e custo', header: 'Consumo meta (%PV)', width: 12, tipo: 'pct2', valor: (l) => l.consumoMetaPercentPv },
    { id: 'custo', grupo: 'Meta e custo', header: 'Custo alimentar (R$/cab/dia)', width: 15, tipo: 'brl', valor: (l) => l.janela.custoCabDia ?? l.geral.custoCabDia },
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

export interface SecaoZootecnica {
  titulo: string
  linhas: LinhaZootecnica[]
  total: LinhaZootecnica
}

// Ordem alfabética pelo curral; sem curral, pelo pasto. Sem nenhum dos dois, vai ao fim.
function ordenarPorLocal(linhas: LinhaZootecnica[]): LinhaZootecnica[] {
  const cmp = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true })
  return [...linhas].sort((a, b) => {
    const ca = a.curralNome ?? a.pastoNome
    const cb = b.curralNome ?? b.pastoNome
    if (!ca !== !cb) return ca ? -1 : 1
    return cmp(ca ?? '', cb ?? '') || cmp(a.loteNome, b.loteNome)
  })
}

// Lote com curral vinculado é confinamento; sem curral, está a pasto. Seções vazias são omitidas.
export function dividirPorManejo(linhas: LinhaZootecnica[]): SecaoZootecnica[] {
  const pasto = ordenarPorLocal(linhas.filter((l) => !l.curralNome))
  const curral = ordenarPorLocal(linhas.filter((l) => !!l.curralNome))
  return [
    { titulo: 'Lotes a pasto', rotulo: 'Total a pasto', linhas: pasto },
    { titulo: 'Lotes em currais (confinamento)', rotulo: 'Total em currais', linhas: curral },
  ]
    .filter((s) => s.linhas.length > 0)
    .map(({ titulo, rotulo, linhas }) => ({ titulo, linhas, total: { ...montarLinhaGeral(linhas), loteNome: rotulo } }))
}

export interface TabelaZootecnica {
  colunas: { id: string; grupo: string; header: string; tipo: TipoColuna }[]
  geral: string[]
  // total é null quando há uma seção só (seria idêntico à linha Geral)
  secoes: { titulo: string; total: string[] | null; linhas: string[][] }[]
}

// Tabela já formatada, usada pela tela e pelo PDF (o endpoint só desenha)
export function montarTabelaZootecnica(geral: LinhaZootecnica, linhas: LinhaZootecnica[], dias: number): TabelaZootecnica {
  const cols = colunasZootecnicas(dias)
  const fmt = (l: LinhaZootecnica) => cols.map((c) => formatarCelula(c.tipo, c.valor(l)))
  const secoes = dividirPorManejo(linhas)
  return {
    colunas: cols.map(({ id, grupo, header, tipo }) => ({ id, grupo, header, tipo })),
    geral: fmt(geral),
    secoes: secoes.map((s) => ({ titulo: s.titulo, total: secoes.length > 1 ? fmt(s.total) : null, linhas: s.linhas.map(fmt) })),
  }
}
