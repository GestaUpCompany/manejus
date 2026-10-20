// Agregações do relatório de Estoque de Combustível. Funções puras
// compartilhadas entre a página pública (RelatorioEstoqueCombustivelPublico.tsx)
// e o loader do Infográfico Mensal (features/relatorioGeral/loaders.ts), para
// que os dois caminhos produzam o mesmo payload para api/pdf/estoqueCombustivel.js.
//
// A RPC devolve, por tanque, o saldo inicial/final reconstruído pelo histórico
// de movimentações do período. valor_estoque usa max(0, saldo) * custo médio
// ATUAL do tanque: saldo negativo é flag de saneamento (campo `negativo`).

export type TipoMovimentacaoCombustivel = 'entrada' | 'baixa' | 'ajuste'

export interface TanqueEstoqueCombustivel {
  id: string
  nome: string
  combustivel: string
  capacidade_l: number | null
  limite_alerta_l: number | null
  saldo_inicial_l: number
  entradas_l: number
  entradas_valor: number
  baixas_l: number
  baixas_valor: number
  ajustes_l: number
  qtd_ajustes: number
  saldo_final_l: number
  saldo_atual_l: number
  custo_medio_l: number
  valor_estoque: number
  pct_capacidade: number | null
  negativo: boolean
  abaixo_limite: boolean
}

export interface MovimentacaoEstoqueCombustivel {
  tanque_id: string
  tanque: string
  combustivel: string
  data: string
  tipo: TipoMovimentacaoCombustivel
  origem: string | null
  quantidade_l: number
  variacao_l: number
  preco_por_litro: number | null
  valor: number | null
  saldo_apos_l: number
  fornecedor: string | null
  nota_fiscal: string | null
  maquina: string | null
  placa: string | null
  motorista: string | null
  observacao: string | null
}

export interface DadosRelatorioEstoqueCombustivel {
  gerado_em: string
  data_inicio: string | null
  data_fim: string | null
  tanques: TanqueEstoqueCombustivel[]
  movimentacoes: MovimentacaoEstoqueCombustivel[]
}

export interface TotaisEstoqueCombustivel {
  saldo_inicial_l: number
  entradas_l: number
  entradas_valor: number
  baixas_l: number
  baixas_valor: number
  ajustes_l: number
  saldo_final_l: number
  valor_estoque: number
  total_tanques: number
  abaixo_limite: number
  negativos: number
}

const soma = (valores: number[]) => valores.reduce((s, v) => s + (Number(v) || 0), 0)

export function totaisDosTanques(tanques: TanqueEstoqueCombustivel[]): TotaisEstoqueCombustivel {
  return {
    saldo_inicial_l: soma(tanques.map((t) => t.saldo_inicial_l)),
    entradas_l: soma(tanques.map((t) => t.entradas_l)),
    entradas_valor: soma(tanques.map((t) => t.entradas_valor)),
    baixas_l: soma(tanques.map((t) => t.baixas_l)),
    baixas_valor: soma(tanques.map((t) => t.baixas_valor)),
    ajustes_l: soma(tanques.map((t) => t.ajustes_l)),
    saldo_final_l: soma(tanques.map((t) => t.saldo_final_l)),
    valor_estoque: soma(tanques.map((t) => t.valor_estoque)),
    total_tanques: tanques.length,
    abaixo_limite: tanques.filter((t) => t.abaixo_limite).length,
    negativos: tanques.filter((t) => t.negativo).length,
  }
}

export interface GrupoCombustivel {
  combustivel: string
  tanques: TanqueEstoqueCombustivel[]
  totais: TotaisEstoqueCombustivel
}

export function agruparPorCombustivel(tanques: TanqueEstoqueCombustivel[]): GrupoCombustivel[] {
  const mapa = new Map<string, TanqueEstoqueCombustivel[]>()
  for (const t of tanques) {
    mapa.set(t.combustivel, [...(mapa.get(t.combustivel) ?? []), t])
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    .map(([combustivel, lista]) => ({ combustivel, tanques: lista, totais: totaisDosTanques(lista) }))
}

export const ROTULO_MOVIMENTACAO: Record<TipoMovimentacaoCombustivel, string> = {
  entrada: 'Entrada',
  baixa: 'Baixa',
  ajuste: 'Ajuste',
}

export const DADOS_ESTOQUE_COMBUSTIVEL_VAZIO: DadosRelatorioEstoqueCombustivel = {
  gerado_em: '',
  data_inicio: null,
  data_fim: null,
  tanques: [],
  movimentacoes: [],
}
