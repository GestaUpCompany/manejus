export type TipoRelatorioGeral = 'combustivel' | 'consumo' | 'bebedouros' | 'morte' | 'rodeio' | 'pastagens' | 'estoque' | 'cantina' | 'boletim_rebanho'

export interface RelatorioGeralCatalogoItem {
  id: TipoRelatorioGeral
  titulo: string
  descricao: string
}

export const RELATORIOS_GERAIS: RelatorioGeralCatalogoItem[] = [
  {
    id: 'combustivel',
    titulo: 'Combustível',
    descricao: 'Abastecimento por máquina, combustível e operação, e estoque por tanque com extrato, no mesmo período.',
  },
  {
    id: 'consumo',
    titulo: 'Consumo',
    descricao: 'Consumo, custo, leitura de cocho e evolução por lote.',
  },
  {
    id: 'bebedouros',
    titulo: 'Bebedouros',
    descricao: 'Limpezas, metas, qualidade da água e ocorrências.',
  },
  {
    id: 'morte',
    titulo: 'Mortes',
    descricao: 'Mortalidade, causas, categorias e impacto financeiro.',
  },
  {
    id: 'rodeio',
    titulo: 'Rodeio de Gado',
    descricao: 'Contagem por categoria, escores do gado e alertas de diagnóstico por pasto e lote.',
  },
  {
    id: 'pastagens',
    titulo: 'Manejo de Pastagens',
    descricao: 'Movimentações entre pastos, avaliações, ocupação em dias e taxa de lotação (UA/ha).',
  },
  {
    id: 'estoque',
    titulo: 'Estoque de Insumos',
    descricao: 'Insumos e formulações no período: o que repor, capital parado ou em excesso, cobertura, consumo, valor em estoque e curva ABC.',
  },
  {
    id: 'cantina',
    titulo: 'Cantina',
    descricao: 'Estoque da cozinha por item no período, refeições servidas, custo por refeição, marmitas e extrato.',
  },
  {
    id: 'boletim_rebanho',
    titulo: 'Boletim de Rebanho',
    descricao: 'Resumo geral e composição do rebanho por local no mês de referência.',
  },
]

export function moverRelatorio(
  itens: TipoRelatorioGeral[],
  id: TipoRelatorioGeral,
  direcao: -1 | 1,
): TipoRelatorioGeral[] {
  const indice = itens.indexOf(id)
  const destino = indice + direcao
  if (indice < 0 || destino < 0 || destino >= itens.length) return itens
  const resultado = [...itens]
  ;[resultado[indice], resultado[destino]] = [resultado[destino], resultado[indice]]
  return resultado
}
