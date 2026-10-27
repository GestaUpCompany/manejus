// Agregações do relatório de Cantina. Funções puras compartilhadas entre a
// página pública (RelatorioCantinaPublico.tsx) e o loader do Infográfico Mensal
// (features/relatorioGeral/loaders.ts), para que os dois caminhos produzam o
// mesmo payload para api/pdf/cantina.js.
//
// A RPC devolve, por item com controle de estoque, o saldo inicial/final
// reconstruído pelo ledger movimentacoes_cantina. valor_estoque usa
// max(0, saldo final) * custo médio ATUAL do item: saldo negativo é flag de
// saneamento (campo `negativo`), não ativo de valor negativo.

export type ClasseABC = 'A' | 'B' | 'C'

export type TipoMovimentacaoCantina = 'entrada' | 'baixa' | 'ajuste' | 'estorno'

export interface ItemCantina {
  id: string
  nome: string
  classificacao: string | null
  unidade: string | null
  estoque_minimo: number
  saldo_inicial: number
  entradas: number
  entradas_valor: number
  baixas: number
  baixas_valor: number
  ajustes: number
  qtd_ajustes: number
  saldo_final: number
  estoque_atual: number
  custo_unitario: number
  valor_estoque: number
  negativo: boolean
  em_alerta: boolean
  falta_para_minimo: number
  consumo_medio_dia: number | null
  cobertura_dias: number | null
  sem_custo: boolean
  divergencia: number | null
}

export interface MovimentacaoCantina {
  item_id: string
  item: string
  classificacao: string | null
  unidade: string | null
  data: string
  tipo: TipoMovimentacaoCantina
  origem: string | null
  quantidade: number
  variacao: number
  custo_unitario: number | null
  valor: number | null
  saldo_apos: number
  fornecedor: string | null
  observacao: string | null
}

export interface TotaisCantina {
  valor_total: number
  total_itens: number
  em_alerta: number
  negativos: number
  sem_custo: number
  a_repor: number
  divergencias: number
  valor_entradas: number
  valor_baixas: number
}

export interface OperacaoCantina {
  registros: number
  cafe_manha: number
  lanches: number
  almocos: number
  jantares: number
  refeicoes_total: number
  custo_baixas: number
  custo_por_refeicao: number | null
}

export interface MarmitaCantina {
  data: string
  fornecedor: string | null
  destinatario: string | null
  quantidade: number | null
  preco_unitario: number | null
  valor: number
}

export interface ResumoTipoMarmita {
  quantidade: number
  valor: number
}

export interface EmpresaMarmita {
  empresa: string
  quantidade: number
  valor: number
}

export type RefeicaoMarmita = 'cafe_manha' | 'lanche' | 'almoco' | 'jantar' | 'nao_informada'

export interface MarmitasCantina {
  registros: number
  quantidade: number
  valor: number
  sem_preco: number
  lista: MarmitaCantina[]
  /** Só nas marmitas (não nos pratos feitos). Registros antigos, sem divisão, contam como internas. */
  por_tipo?: { interna: ResumoTipoMarmita; terceirizada: ResumoTipoMarmita }
  por_refeicao?: Record<RefeicaoMarmita, number>
  por_empresa?: EmpresaMarmita[]
}

export interface QualidadeCantina {
  registros_sem_itens: number
  itens_sem_controle: number
  nomes_duplicados: number
}

export interface DadosRelatorioCantina {
  gerado_em: string
  data_inicio: string | null
  data_fim: string | null
  tem_periodo: boolean
  itens: ItemCantina[]
  totais: TotaisCantina
  operacao: OperacaoCantina
  marmitas: MarmitasCantina
  /** Mesma estrutura de marmitas, para o modo prato_feito (relatório separado). */
  pratos_feitos: MarmitasCantina
  qualidade: QualidadeCantina
  movimentacoes: MovimentacaoCantina[]
  movimentacoes_total: number
}

export const ROTULO_TIPO_MOVIMENTACAO: Record<TipoMovimentacaoCantina, string> = {
  entrada: 'Entrada',
  baixa: 'Baixa',
  ajuste: 'Ajuste',
  estorno: 'Estorno',
}

export const ROTULO_ORIGEM: Record<string, string> = {
  pwa_entrada: 'Entrada (app)',
  pwa_cantina: 'Saída (app)',
}

export const DADOS_CANTINA_VAZIO: DadosRelatorioCantina = {
  gerado_em: '',
  data_inicio: null,
  data_fim: null,
  tem_periodo: false,
  itens: [],
  totais: {
    valor_total: 0, total_itens: 0, em_alerta: 0, negativos: 0, sem_custo: 0,
    a_repor: 0, divergencias: 0, valor_entradas: 0, valor_baixas: 0,
  },
  operacao: {
    registros: 0, cafe_manha: 0, lanches: 0, almocos: 0, jantares: 0,
    refeicoes_total: 0, custo_baixas: 0, custo_por_refeicao: null,
  },
  marmitas: { registros: 0, quantidade: 0, valor: 0, sem_preco: 0, lista: [] },
  pratos_feitos: { registros: 0, quantidade: 0, valor: 0, sem_preco: 0, lista: [] },
  qualidade: { registros_sem_itens: 0, itens_sem_controle: 0, nomes_duplicados: 0 },
  movimentacoes: [],
  movimentacoes_total: 0,
}

const soma = (valores: Array<number | null | undefined>) => valores.reduce<number>((s, v) => s + (Number(v) || 0), 0)

export function totaisDosItens(itens: ItemCantina[]): TotaisCantina {
  return {
    valor_total: soma(itens.map((i) => i.valor_estoque)),
    total_itens: itens.length,
    em_alerta: itens.filter((i) => i.em_alerta).length,
    negativos: itens.filter((i) => i.negativo).length,
    sem_custo: itens.filter((i) => i.sem_custo).length,
    a_repor: itens.filter((i) => (i.falta_para_minimo ?? 0) > 0).length,
    divergencias: itens.filter((i) => i.divergencia != null).length,
    valor_entradas: soma(itens.map((i) => i.entradas_valor)),
    valor_baixas: soma(itens.map((i) => i.baixas_valor)),
  }
}

// Curva ABC por valor em estoque: A até 80% do valor acumulado, B até 95%, C o
// resto. Itens sem valor (saldo zero/negativo ou sem custo) ficam fora.
export function classificarABC(itens: ItemCantina[]): Map<string, ClasseABC> {
  const resultado = new Map<string, ClasseABC>()
  const ordenados = itens.filter((i) => i.valor_estoque > 0).sort((a, b) => b.valor_estoque - a.valor_estoque)
  const total = soma(ordenados.map((i) => i.valor_estoque))
  let acumulado = 0
  for (const item of ordenados) {
    const antes = total > 0 ? acumulado / total : 0
    acumulado += item.valor_estoque
    resultado.set(item.id, antes < 0.8 ? 'A' : antes < 0.95 ? 'B' : 'C')
  }
  return resultado
}

export type FiltroCantina = 'todos' | 'alerta' | 'a_repor' | 'negativo' | 'sem_custo' | 'divergencia'

export const FILTROS_CANTINA: { key: FiltroCantina; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'alerta', label: 'Abaixo do mínimo' },
  { key: 'a_repor', label: 'A repor' },
  { key: 'negativo', label: 'Saldo negativo' },
  { key: 'sem_custo', label: 'Sem custo' },
  { key: 'divergencia', label: 'Divergência' },
]

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function filtrarItens(itens: ItemCantina[], busca: string, filtro: FiltroCantina): ItemCantina[] {
  const termo = semAcento(busca.trim())
  return itens.filter((i) => {
    if (termo && !semAcento(`${i.nome} ${i.classificacao ?? ''}`).includes(termo)) return false
    switch (filtro) {
      case 'alerta': return i.em_alerta
      case 'a_repor': return (i.falta_para_minimo ?? 0) > 0
      case 'negativo': return i.negativo
      case 'sem_custo': return i.sem_custo
      case 'divergencia': return i.divergencia != null
      default: return true
    }
  })
}

export type CampoOrdenacaoCantina =
  | 'nome' | 'saldo_final' | 'entradas' | 'baixas' | 'cobertura_dias' | 'custo_unitario' | 'valor_estoque'

function valorOrdenacao(item: ItemCantina, campo: CampoOrdenacaoCantina): string | number | null {
  switch (campo) {
    case 'nome': return item.nome
    case 'saldo_final': return item.saldo_final
    case 'entradas': return item.entradas
    case 'baixas': return item.baixas
    case 'cobertura_dias': return item.cobertura_dias
    case 'custo_unitario': return item.custo_unitario
    case 'valor_estoque': return item.valor_estoque
  }
}

// Valores nulos (ex.: cobertura de item sem consumo) vão sempre para o fim.
export function ordenarItens(itens: ItemCantina[], campo: CampoOrdenacaoCantina, direcao: 'asc' | 'desc'): ItemCantina[] {
  const fator = direcao === 'asc' ? 1 : -1
  return [...itens].sort((a, b) => {
    const va = valorOrdenacao(a, campo)
    const vb = valorOrdenacao(b, campo)
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb, 'pt-BR') * fator
    return ((va as number) - (vb as number)) * fator
  })
}

// Cobertura em dias pelo consumo médio do período. Sem baixas a RPC devolve
// cobertura nula: com saldo é "Sem consumo", sem saldo é "Sem saldo".
export function textoCobertura(item: Pick<ItemCantina, 'cobertura_dias' | 'saldo_final'>): string {
  if (item.saldo_final <= 0) return 'Sem saldo'
  if (item.cobertura_dias == null) return 'Sem consumo'
  if (item.cobertura_dias >= 365) return '1 ano ou mais'
  return `${Math.round(item.cobertura_dias)} d`
}

export function rotuloUnidadeCusto(item: Pick<ItemCantina, 'unidade'>): string {
  return `R$/${item.unidade || 'un'}`
}

// Unidades contáveis (unidade, pacote...) saem sem casas decimais, a menos que o valor seja
// fracionário; medidas contínuas (kg, L) mantêm duas casas. Mesma regra do PDF
// (api/pdf/_relatorios/cantina.js): manter as duas em sincronia.
const UNIDADES_CONTINUAS = new Set(['kg', 'g', 'L', 'l', 'ml', 'mL'])
const PLURAL_UNIDADE: Record<string, string> = {
  Unidade: 'Unidades', Pacote: 'Pacotes', Caixa: 'Caixas', Saco: 'Sacos', Lata: 'Latas',
  Garrafa: 'Garrafas', Fardo: 'Fardos', Rolo: 'Rolos', Frasco: 'Frascos',
}

export function numeroComUnidade(valor: number | null | undefined, unidade: string | null | undefined): string {
  const n = Number(valor) || 0
  const casas = (unidade && UNIDADES_CONTINUAS.has(unidade)) || !Number.isInteger(n) ? 2 : 0
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

export function quantidadeComUnidade(valor: number | null | undefined, unidade: string | null | undefined): string {
  const u = unidade ?? ''
  const rotulo = !u || UNIDADES_CONTINUAS.has(u) || Math.abs(Number(valor)) === 1
    ? u
    : PLURAL_UNIDADE[u] ?? (u.endsWith('s') ? u : `${u}s`)
  return `${numeroComUnidade(valor, unidade)}${rotulo ? ` ${rotulo}` : ''}`
}

// Itens para repor: saldo negativo primeiro, depois quem acaba antes (menor cobertura).
export function itensParaRepor(itens: ItemCantina[]): ItemCantina[] {
  const dias = (i: ItemCantina) => (i.cobertura_dias == null ? Number.MAX_SAFE_INTEGER : Number(i.cobertura_dias))
  return itens
    .filter((i) => i.negativo || i.em_alerta)
    .sort((a, b) => (b.negativo ? 1 : 0) - (a.negativo ? 1 : 0) || dias(a) - dias(b))
}

function gravidade(item: ItemCantina): number {
  if (item.negativo) return 0
  if (item.em_alerta) return 1
  if (item.divergencia != null) return 2
  return 3
}

// Itens que pedem atenção, do mais grave ao menos grave: saldo negativo,
// abaixo do mínimo, divergência de saldo e, por último, sem custo.
export function itensDeAtencao(itens: ItemCantina[]): ItemCantina[] {
  return itens
    .filter((i) => i.negativo || i.em_alerta || i.sem_custo || i.divergencia != null)
    .sort((a, b) => gravidade(a) - gravidade(b))
}
