// Agregações do relatório de Estoque de Insumos. Funções puras
// compartilhadas entre a página pública (RelatorioEstoquePublico.tsx) e o
// loader do Infográfico Mensal (features/relatorioGeral/loaders.ts), para
// que os dois caminhos produzam o mesmo payload para api/pdf/estoque.js.
//
// Snapshot: o relatório não tem período, a RPC devolve a posição atual.
// valor_estoque usa max(0, saldo) * custo: saldo negativo é flag de
// saneamento (campo `negativo`), não ativo de valor negativo — mesma regra
// da tela EstoqueSuplementacao.

export type EscopoEstoque = 'insumos' | 'formulacoes' | 'todos'

export type ItemTipoEstoque = 'insumo' | 'formulacao'

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
}

export interface TotaisEstoque {
  valor_total: number
  total_itens: number
  em_alerta: number
  negativos: number
}

export interface DadosRelatorioEstoque {
  escopo: EscopoEstoque
  gerado_em: string
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

export function itensPorGrupo(itens: ItemEstoque[], grupo: ItemTipoEstoque): ItemEstoque[] {
  return itens.filter((i) => i.item_tipo === grupo)
}

// Totais recalculados por grupo: a RPC devolve o consolidado do payload,
// mas a página e o PDF precisam dos parciais quando o escopo cobre os dois.
export function totaisDoGrupo(itens: ItemEstoque[]): TotaisEstoque {
  return {
    valor_total: itens.reduce((s, i) => s + Number(i.valor_estoque || 0), 0),
    total_itens: itens.length,
    em_alerta: itens.filter((i) => i.em_alerta).length,
    negativos: itens.filter((i) => i.negativo).length,
  }
}
