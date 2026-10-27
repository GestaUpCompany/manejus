// Modos de registros_alimentacao (coluna `modo`):
//   cantina      refeições servidas + itens usados (baixa estoque)
//   entrada      entrada de itens no estoque da cozinha
//   marmita      refeição comprada pronta (fornecedor, quantidade, preço, destinatário)
//   prato_feito  mesmos campos da marmita, em modo próprio (relatório separado)
// Marmita e prato feito guardam a quantidade em `quantidade_marmitas`.

export type ModoCantina = 'cantina' | 'entrada' | 'marmita' | 'prato_feito'

type ModoEntrada = string | null | undefined

export const ehModoRefeicaoPronta = (modo: ModoEntrada): boolean =>
  modo === 'marmita' || modo === 'prato_feito'

export const rotuloModoCantina = (modo: ModoEntrada): string => {
  if (modo === 'marmita') return 'Marmita'
  if (modo === 'prato_feito') return 'Prato Feito'
  if (modo === 'entrada') return 'Entrada'
  return 'Cantina'
}

// Plural em minúsculas para frases ("12 marmitas", "8 pratos")
export const unidadeRefeicaoPronta = (modo: ModoEntrada): string =>
  modo === 'prato_feito' ? 'pratos' : 'marmitas'
