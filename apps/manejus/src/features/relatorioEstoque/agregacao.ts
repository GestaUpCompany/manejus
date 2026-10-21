// Agregações do relatório de Estoque de Insumos e Formulações. Funções puras
// compartilhadas entre a página pública (RelatorioEstoquePublico.tsx) e o
// loader do Infográfico Mensal (features/relatorioGeral/loaders.ts), para
// que os dois caminhos produzam o mesmo payload para api/pdf/estoque.js.
//
// Sem período (links antigos) a RPC devolve a posição atual e os campos de
// movimento vêm nulos (tem_periodo = false). Com período, o saldo é
// reconstruído pelo ledger movimentacoes_estoque_suplementos. As regras de
// decisão (ruptura, parado, excesso, reposição) vivem em decisao.ts.
// valor_estoque usa max(0, saldo final) * custo médio ATUAL: saldo negativo é
// flag de saneamento (campo `negativo`), não ativo de valor negativo.

import type { SituacaoItem } from './decisao'

export type EscopoEstoque = 'insumos' | 'formulacoes' | 'todos'

export type ItemTipoEstoque = 'insumo' | 'formulacao'

export type ClasseABC = 'A' | 'B' | 'C'

export interface ItemEstoque {
  item_tipo: ItemTipoEstoque
  nome: string
  tipo: string | null
  unidade: string | null
  estoque_atual: number
  custo_unitario: number
  estoque_minimo: number
  valor_estoque: number
  negativo: boolean
  em_alerta: boolean
  // Campos abaixo: nulos quando o relatório não tem período.
  saldo_inicial?: number | null
  entradas?: number | null
  entradas_valor?: number | null
  saidas?: number | null
  saidas_valor?: number | null
  ajustes?: number | null
  qtd_ajustes?: number | null
  saldo_final?: number | null
  ultima_entrada?: string | null
  consumo_origem?: Record<string, number> | null
  falta_para_minimo?: number | null
  consumo_medio_dia?: number | null
  cobertura_dias?: number | null
  data_esgotamento?: string | null
  sem_custo?: boolean
  qtd_negativa?: number | null
  valor_negativo?: number | null
}

export interface TotaisEstoque {
  valor_total: number
  total_itens: number
  em_alerta: number
  negativos: number
  sem_custo?: number
  a_repor?: number
  valor_entradas?: number
  valor_saidas?: number
}

export interface DadosRelatorioEstoque {
  escopo: EscopoEstoque
  gerado_em: string
  data_inicio?: string | null
  data_fim?: string | null
  tem_periodo?: boolean
  itens: ItemEstoque[]
  totais: TotaisEstoque
}

export const GRUPOS_ESTOQUE: { key: ItemTipoEstoque; label: string }[] = [
  { key: 'insumo', label: 'Insumos' },
  { key: 'formulacao', label: 'Formulações' },
]

export const ESCOPO_LABEL: Record<EscopoEstoque, string> = {
  insumos: 'Somente insumos',
  formulacoes: 'Somente formulações',
  todos: 'Insumos e formulações',
}

export const ROTULO_ORIGEM: Record<string, string> = {
  entrada_insumos: 'Entrada de insumos',
  saida_insumos: 'Saída de insumos',
  fabrica_confinamento: 'Fábrica do confinamento',
  suplementacao: 'Suplementação',
  painel_entrada: 'Painel (entrada)',
  painel_ajuste: 'Painel (ajuste)',
  estoque_inicial: 'Saldo inicial',
  outros: 'Outros',
}

export function itensPorGrupo(itens: ItemEstoque[], grupo: ItemTipoEstoque): ItemEstoque[] {
  return itens.filter((i) => i.item_tipo === grupo)
}

const soma = (valores: Array<number | null | undefined>) => valores.reduce<number>((s, v) => s + (Number(v) || 0), 0)

// Totais recalculados por grupo: a RPC devolve o consolidado do payload,
// mas a página e o PDF precisam dos parciais quando o escopo cobre os dois.
export function totaisDoGrupo(itens: ItemEstoque[]): TotaisEstoque {
  return {
    valor_total: soma(itens.map((i) => i.valor_estoque)),
    total_itens: itens.length,
    em_alerta: itens.filter((i) => i.em_alerta).length,
    negativos: itens.filter((i) => i.negativo).length,
    sem_custo: itens.filter((i) => i.sem_custo).length,
    a_repor: itens.filter((i) => (i.falta_para_minimo ?? 0) > 0).length,
    valor_entradas: soma(itens.map((i) => i.entradas_valor)),
    valor_saidas: soma(itens.map((i) => i.saidas_valor)),
  }
}

export function chaveItem(item: Pick<ItemEstoque, 'item_tipo' | 'nome'>): string {
  return `${item.item_tipo}:${item.nome}`
}

// Curva ABC por valor em estoque, calculada por grupo (insumo e formulação
// não se misturam). A: até 80% do valor acumulado, B: até 95%, C: o resto.
// Itens sem valor (saldo zero/negativo ou sem custo) ficam fora da curva.
export function classificarABC(itens: ItemEstoque[]): Map<string, ClasseABC> {
  const resultado = new Map<string, ClasseABC>()
  for (const grupo of GRUPOS_ESTOQUE) {
    const doGrupo = itensPorGrupo(itens, grupo.key)
      .filter((i) => i.valor_estoque > 0)
      .sort((a, b) => b.valor_estoque - a.valor_estoque)
    const total = soma(doGrupo.map((i) => i.valor_estoque))
    let acumulado = 0
    for (const item of doGrupo) {
      const antes = total > 0 ? acumulado / total : 0
      acumulado += item.valor_estoque
      resultado.set(chaveItem(item), antes < 0.8 ? 'A' : antes < 0.95 ? 'B' : 'C')
    }
  }
  return resultado
}

export type FiltroEstoque = 'todos' | 'ruptura' | 'parado' | 'excesso' | 'negativo' | 'sem_custo'

export const FILTROS_ESTOQUE: { key: FiltroEstoque; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'ruptura', label: 'A repor' },
  { key: 'parado', label: 'Parados' },
  { key: 'excesso', label: 'Em excesso' },
  { key: 'negativo', label: 'Saldo negativo' },
  { key: 'sem_custo', label: 'Sem custo' },
]

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// `situacaoDe` vem de decisao.ts (classificarSituacao já amarrada ao período).
export function filtrarItens(
  itens: ItemEstoque[],
  busca: string,
  filtro: FiltroEstoque,
  situacaoDe?: (item: ItemEstoque) => SituacaoItem,
): ItemEstoque[] {
  const termo = semAcento(busca.trim())
  return itens.filter((i) => {
    if (termo && !semAcento(`${i.nome} ${i.tipo ?? ''}`).includes(termo)) return false
    switch (filtro) {
      case 'ruptura':
      case 'parado':
      case 'excesso': return situacaoDe?.(i) === filtro
      case 'negativo': return i.negativo
      case 'sem_custo': return !!i.sem_custo
      default: return true
    }
  })
}

export type CampoOrdenacaoEstoque =
  | 'nome' | 'saldo_final' | 'entradas' | 'saidas' | 'cobertura_dias' | 'custo_unitario' | 'valor_estoque'

export function valorOrdenacao(item: ItemEstoque, campo: CampoOrdenacaoEstoque): string | number | null {
  switch (campo) {
    case 'nome': return item.nome
    case 'saldo_final': return item.saldo_final ?? item.estoque_atual
    case 'entradas': return item.entradas ?? null
    case 'saidas': return item.saidas ?? null
    case 'cobertura_dias': return item.cobertura_dias ?? null
    case 'custo_unitario': return item.custo_unitario
    case 'valor_estoque': return item.valor_estoque
  }
}

// Valores nulos (ex.: cobertura de item sem consumo) vão sempre para o fim,
// independente da direção.
export function ordenarItens(
  itens: ItemEstoque[],
  campo: CampoOrdenacaoEstoque,
  direcao: 'asc' | 'desc',
): ItemEstoque[] {
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

export function rotuloUnidadeCusto(item: Pick<ItemEstoque, 'unidade'>): string {
  return `R$/${item.unidade || 'kg'}`
}

export function textoCobertura(item: Pick<ItemEstoque, 'cobertura_dias' | 'consumo_medio_dia'>): string {
  if (item.cobertura_dias == null) return item.consumo_medio_dia == null ? '—' : 'Sem saldo'
  if (item.cobertura_dias <= 0) return 'Sem saldo'
  if (item.cobertura_dias >= 365) return 'mais de 1 ano'
  return `${Math.round(item.cobertura_dias)} d`
}

