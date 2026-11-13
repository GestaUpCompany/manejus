export type TipoRelatorioGeral = 'combustivel' | 'consumo' | 'bebedouros' | 'clima' | 'morte' | 'rodeio' | 'pastagens' | 'estoque' | 'estoque_formulacoes' | 'cantina' | 'almoxarifado' | 'maternidade' | 'farmacia' | 'boletim_rebanho'

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
    id: 'clima',
    titulo: 'Clima',
    descricao: 'Chuva acumulada média da fazenda e por pluviômetro, dias de chuva forte, calendário de chuvas, temperatura e umidade.',
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
    descricao: 'Insumos no período: o que repor, capital parado ou em excesso, cobertura, consumo, valor em estoque e curva ABC.',
  },
  {
    id: 'estoque_formulacoes',
    titulo: 'Estoque de Formulações',
    descricao: 'Formulações (dietas) no período: o que repor, capital parado ou em excesso, cobertura, consumo, valor em estoque e curva ABC.',
  },
  {
    id: 'cantina',
    titulo: 'Cantina',
    descricao: 'Estoque da cozinha por item no período, refeições servidas, custo por refeição, marmitas, pratos feitos e extrato.',
  },
  {
    id: 'almoxarifado',
    titulo: 'Almoxarifado',
    descricao: 'Estoque do almoxarifado por item no período, itens para repor, consumo líquido (retiradas menos devoluções), retiradas por responsável e setor.',
  },
  {
    id: 'maternidade',
    titulo: 'Maternidade',
    descricao: 'Partos e crias no período, perda de crias, peso ao nascer, tipo de parto, matrizes com intercorrências, tratamentos e medicamentos.',
  },
  {
    id: 'farmacia',
    titulo: 'Farmácia',
    descricao: 'Estoque de medicamentos e vacinas (saldo inicial, entradas, baixas e saldo final), itens a repor, validade dos lotes, valor em estoque e curva ABC.',
  },
  {
    id: 'boletim_rebanho',
    titulo: 'Boletim de Rebanho',
    descricao: 'Resumo geral e composição do rebanho por local no mês de referência.',
  },
]

// Seções com versão anual (RPCs get_infografico_anual_*, api/pdf/_shared/anualRegistry.js).
// Fase 1: combustível, consumo, clima, mortes e rodeio. Fase 2A: pastagens e maternidade. Fase 2B: bebedouros. Fase 2C: almoxarifado, farmácia e cantina. Fase 2D: estoque de insumos e formulações.
// As demais entram conforme ganharem RPC e renderer anuais.
export const SECOES_ANUAIS = ['combustivel', 'consumo', 'clima', 'morte', 'rodeio', 'pastagens', 'maternidade', 'bebedouros', 'almoxarifado', 'farmacia', 'cantina', 'estoque'] as const
export type SecaoAnual = (typeof SECOES_ANUAIS)[number]

export function ehSecaoAnual(id: TipoRelatorioGeral): id is SecaoAnual {
  return (SECOES_ANUAIS as readonly string[]).includes(id)
}

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
