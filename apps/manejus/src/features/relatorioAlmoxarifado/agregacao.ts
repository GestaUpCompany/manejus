// Tipos do relatório de Almoxarifado. O item tem o mesmo formato do item da Cantina (saldo, entradas,
// consumo, cobertura, curva ABC...), então os helpers genéricos de lá (filtro, ordenação, ABC,
// cobertura, formatação de unidade) são reaproveitados. Aqui entram só as diferenças do almoxarifado:
// devoluções, retiradas por responsável e por setor.
//
// No item, `baixas`/`baixas_valor` é o consumo LÍQUIDO do período (retiradas - devoluções aprovadas,
// nunca negativo); `retiradas` e `devolucoes` trazem os brutos. O saldo segue a mesma regra de
// recalcular_estoque_almoxarifado (entrada e devolução somam, baixa e estorno subtraem, ajuste define).

import { numeroComUnidade, type ItemCantina, type TotaisCantina } from '../relatorioCantina/agregacao'

export {
  classificarABC,
  filtrarItens,
  itensDeAtencao,
  itensParaRepor,
  numeroComUnidade,
  ordenarItens,
  rotuloUnidadeCusto,
  textoCobertura,
  totaisDosItens,
  type CampoOrdenacaoCantina,
  type ClasseABC,
  type FiltroCantina,
} from '../relatorioCantina/agregacao'

// Unidades do almoxarifado são texto livre e em geral abreviadas (un, m, cx, kg): só unidades por
// extenso (Pacote, Caixa...) ganham plural; abreviações de até 3 letras ficam como estão ("27 m", "9 un").
// Mesma regra do PDF (api/pdf/_relatorios/almoxarifado.js): manter as duas em sincronia.
const CONTINUAS = new Set(['kg', 'g', 'L', 'l', 'ml', 'mL'])
const PLURAL_UNIDADE: Record<string, string> = {
  Unidade: 'Unidades', Pacote: 'Pacotes', Caixa: 'Caixas', Saco: 'Sacos', Lata: 'Latas',
  Garrafa: 'Garrafas', Fardo: 'Fardos', Rolo: 'Rolos', Frasco: 'Frascos',
}

// "par" e "kit" são as únicas abreviações do cadastro que levam plural (8 pares, 2 kits).
const PLURAL_ABREVIADA: Record<string, string> = { par: 'pares', kit: 'kits' }

export function quantidadeComUnidade(valor: number | null | undefined, unidade: string | null | undefined): string {
  const u = unidade ?? ''
  const rotulo = !u || CONTINUAS.has(u) || Math.abs(Number(valor)) === 1
    ? u
    : PLURAL_ABREVIADA[u] ?? (u.length <= 3 ? u : PLURAL_UNIDADE[u] ?? (u.endsWith('s') ? u : `${u}s`))
  return `${numeroComUnidade(valor, unidade)}${rotulo ? ` ${rotulo}` : ''}`
}

export type TipoMovimentacaoAlmoxarifado = 'entrada' | 'baixa' | 'devolucao' | 'ajuste' | 'estorno'

export interface ItemAlmoxarifado extends ItemCantina {
  retiradas: number
  retiradas_valor: number
  devolucoes: number
  devolucoes_valor: number
}

export interface MovimentacaoAlmoxarifado {
  item_id: string
  item: string
  classificacao: string | null
  unidade: string | null
  data: string
  tipo: TipoMovimentacaoAlmoxarifado
  origem: string | null
  quantidade: number
  variacao: number
  custo_unitario: number | null
  valor: number | null
  saldo_apos: number
  fornecedor: string | null
  responsavel: string | null
  setor: string | null
  observacao: string | null
}

export interface TotaisAlmoxarifado extends TotaisCantina {
  valor_retiradas: number
  valor_devolucoes: number
}

export interface RetiradaPorGrupo {
  nome: string
  retiradas: number
  valor_retirado: number
  valor_devolvido: number
  valor_liquido: number
}

export interface QualidadeAlmoxarifado {
  registros_sem_itens: number
  itens_sem_controle: number
  nomes_duplicados: number
  devolucoes_em_revisao: number
}

export interface DadosRelatorioAlmoxarifado {
  gerado_em: string
  data_inicio: string | null
  data_fim: string | null
  tem_periodo: boolean
  itens: ItemAlmoxarifado[]
  totais: TotaisAlmoxarifado
  por_responsavel: RetiradaPorGrupo[]
  por_setor: RetiradaPorGrupo[]
  qualidade: QualidadeAlmoxarifado
  movimentacoes: MovimentacaoAlmoxarifado[]
  movimentacoes_total: number
}

export const ROTULO_TIPO_MOVIMENTACAO_ALMOXARIFADO: Record<TipoMovimentacaoAlmoxarifado, string> = {
  entrada: 'Entrada',
  baixa: 'Retirada',
  devolucao: 'Devolução',
  ajuste: 'Ajuste',
  estorno: 'Estorno',
}

export const DADOS_ALMOXARIFADO_VAZIO: DadosRelatorioAlmoxarifado = {
  gerado_em: '',
  data_inicio: null,
  data_fim: null,
  tem_periodo: false,
  itens: [],
  totais: {
    valor_total: 0, total_itens: 0, em_alerta: 0, negativos: 0, sem_custo: 0,
    a_repor: 0, divergencias: 0, valor_entradas: 0, valor_baixas: 0,
    valor_retiradas: 0, valor_devolucoes: 0,
  },
  por_responsavel: [],
  por_setor: [],
  qualidade: { registros_sem_itens: 0, itens_sem_controle: 0, nomes_duplicados: 0, devolucoes_em_revisao: 0 },
  movimentacoes: [],
  movimentacoes_total: 0,
}

// As funções genéricas de totais calculam a partir dos itens; devoluções e retiradas brutas são somadas aqui.
export function totaisAlmoxarifado(itens: ItemAlmoxarifado[], base: TotaisCantina): TotaisAlmoxarifado {
  const soma = (campo: 'retiradas_valor' | 'devolucoes_valor') => itens.reduce((s, i) => s + (Number(i[campo]) || 0), 0)
  return { ...base, valor_retiradas: soma('retiradas_valor'), valor_devolucoes: soma('devolucoes_valor') }
}
