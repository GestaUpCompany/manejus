export type TipoRelatorioGeral = 'abastecimento' | 'consumo' | 'bebedouros' | 'morte' | 'boletim_rebanho'

export interface RelatorioGeralCatalogoItem {
  id: TipoRelatorioGeral
  titulo: string
  descricao: string
}

export const RELATORIOS_GERAIS: RelatorioGeralCatalogoItem[] = [
  {
    id: 'abastecimento',
    titulo: 'Abastecimento',
    descricao: 'Consumo de combustível por máquina, combustível e operação.',
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
