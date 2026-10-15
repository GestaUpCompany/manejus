export type OrientacaoFolhaTrato = 'portrait' | 'landscape'

export interface LayoutFolhaTrato {
  orientacao: OrientacaoFolhaTrato
  /** Altura de cada linha de curral, em mm. */
  alturaLinhaMm: number
  /** Quantidade de currais em cada página (já equilibrada). */
  currais: number[]
}

export const LINHA_MAX_MM = 13
// Abaixo disso o peão não escreve com clareza no campo Real.
export const LINHA_MIN_MM = 8

// A4 com margem de 8 mm: área útil em mm.
const ALTURA_UTIL_MM = { portrait: 281, landscape: 194 }
// Logos + título + faixa da data (só na primeira página), cabeçalho da tabela (2 linhas) e folga de segurança.
const CABECALHO_PRIMEIRA_MM = 30
const CABECALHO_DEMAIS_MM = 8
const THEAD_MM = 11
const FOLGA_MM = 4

// Até 2 tratos em retrato; acima disso, paisagem, para o campo Real (preenchido à mão) ficar o maior possível.
export function orientacaoFolhaTrato(quantidadeTratos: number): OrientacaoFolhaTrato {
  return quantidadeTratos <= 2 ? 'portrait' : 'landscape'
}

function capacidade(orientacao: OrientacaoFolhaTrato, alturaLinhaMm: number, primeira: boolean): number {
  const cabecalho = primeira ? CABECALHO_PRIMEIRA_MM : CABECALHO_DEMAIS_MM
  return Math.max(1, Math.floor((ALTURA_UTIL_MM[orientacao] - cabecalho - THEAD_MM - FOLGA_MM) / alturaLinhaMm))
}

/**
 * Escolhe a maior altura de linha (até 13 mm) em que os currais cabem na menor quantidade de páginas,
 * sem ir abaixo de 8 mm. Quando precisa de mais de uma página, divide os currais de forma equilibrada.
 */
export function calcularLayoutFolhaTrato(totalCurrais: number, quantidadeTratos: number): LayoutFolhaTrato {
  const orientacao = orientacaoFolhaTrato(quantidadeTratos)
  const total = Math.max(0, totalCurrais)

  let alturaLinhaMm = LINHA_MIN_MM
  for (let h = LINHA_MAX_MM; h >= LINHA_MIN_MM; h -= 0.5) {
    if (total <= capacidade(orientacao, h, true)) {
      alturaLinhaMm = h
      break
    }
  }

  const capPrimeira = capacidade(orientacao, alturaLinhaMm, true)
  if (total <= capPrimeira) return { orientacao, alturaLinhaMm, currais: total > 0 ? [total] : [] }

  // A primeira página tem o cabeçalho maior, então é ela que limita; as demais comportam ao menos o mesmo.
  let paginas = 2
  while (Math.ceil(total / paginas) > capPrimeira) paginas++
  const porPagina = Math.ceil(total / paginas)

  // Com páginas equilibradas sobra espaço: devolve a altura da linha ao maior valor que ainda comporta `porPagina`.
  for (let h = LINHA_MAX_MM; h > alturaLinhaMm; h -= 0.5) {
    if (porPagina <= capacidade(orientacao, h, true)) {
      alturaLinhaMm = h
      break
    }
  }

  const currais: number[] = []
  let restante = total
  while (restante > 0) {
    const n = Math.min(porPagina, restante)
    currais.push(n)
    restante -= n
  }
  return { orientacao, alturaLinhaMm, currais }
}
