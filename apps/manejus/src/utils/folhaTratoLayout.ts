export interface LayoutFolhaTrato {
  /** Altura de cada linha de curral, em mm. */
  alturaLinhaMm: number
  /** Tamanho da fonte da tabela, em pt (diminui junto com a altura da linha). */
  fonteTabelaPt: number
  /** Fator (≤ 1) aplicado às colunas informativas para sobrar largura aos campos Real. */
  escalaColunas: number
  /** Quantidade de currais em cada página (já equilibrada). */
  currais: number[]
}

export const LINHA_MAX_MM = 13
// A folha é sempre em retrato e comporta até 50 currais numa página; por isso a linha pode chegar a 5 mm.
export const LINHA_MIN_MM = 5
export const CURRAIS_POR_FOLHA_ALVO = 50

// A4 em retrato com margem de 5 mm: área útil em mm.
export const MARGEM_FOLHA_MM = 5
const ALTURA_UTIL_MM = 297 - 2 * MARGEM_FOLHA_MM
export const LARGURA_UTIL_MM = 210 - 2 * MARGEM_FOLHA_MM
// Logos + título + faixa da data (só na primeira página), cabeçalho da tabela (2 linhas) e folga de segurança.
const CABECALHO_PRIMEIRA_MM = 18
const CABECALHO_DEMAIS_MM = 6
const THEAD_MM = 9
const FOLGA_MM = 3

// Larguras (mm) das colunas informativas, na escala 1, e do Previsto de cada trato.
const COLUNAS_INFO_MM = 22 + 13 + 30 + 8 + 11 + 8 + 11 + 9 + 11
const COLUNA_PREVISTO_MM = 11
// Menor largura aceitável para escrever à mão no campo Real.
const REAL_MIN_MM = 10

function capacidade(alturaLinhaMm: number, primeira: boolean): number {
  const cabecalho = primeira ? CABECALHO_PRIMEIRA_MM : CABECALHO_DEMAIS_MM
  return Math.max(1, Math.floor((ALTURA_UTIL_MM - cabecalho - THEAD_MM - FOLGA_MM) / alturaLinhaMm))
}

function fonteParaLinha(alturaLinhaMm: number): number {
  if (alturaLinhaMm >= 8) return 7.5
  if (alturaLinhaMm >= 6) return 7
  return 6.5
}

/**
 * Colunas informativas encolhem quando há muitos tratos, para o campo Real de cada trato
 * nunca ficar menor que REAL_MIN_MM. Até 4 tratos não precisa encolher.
 */
export function escalaColunasInfo(quantidadeTratos: number): number {
  const reservado = quantidadeTratos * (COLUNA_PREVISTO_MM + REAL_MIN_MM)
  const sobraParaInfo = LARGURA_UTIL_MM - reservado
  return Math.max(0.5, Math.min(1, sobraParaInfo / COLUNAS_INFO_MM))
}

/**
 * Escolhe a maior altura de linha (até 13 mm) em que os currais cabem na menor quantidade de páginas,
 * sem ir abaixo de 5 mm (50 currais cabem numa página). Quando precisa de mais de uma página,
 * divide os currais de forma equilibrada.
 */
export function calcularLayoutFolhaTrato(totalCurrais: number, quantidadeTratos: number): LayoutFolhaTrato {
  const total = Math.max(0, totalCurrais)
  const escalaColunas = escalaColunasInfo(quantidadeTratos)
  const montar = (alturaLinhaMm: number, currais: number[]): LayoutFolhaTrato => ({
    alturaLinhaMm,
    fonteTabelaPt: fonteParaLinha(alturaLinhaMm),
    escalaColunas,
    currais,
  })

  let alturaLinhaMm = LINHA_MIN_MM
  for (let h = LINHA_MAX_MM; h >= LINHA_MIN_MM; h -= 0.5) {
    if (total <= capacidade(h, true)) {
      alturaLinhaMm = h
      break
    }
  }

  const capPrimeira = capacidade(alturaLinhaMm, true)
  if (total <= capPrimeira) return montar(alturaLinhaMm, total > 0 ? [total] : [])

  // A primeira página tem o cabeçalho maior, então é ela que limita; as demais comportam ao menos o mesmo.
  let paginas = 2
  while (Math.ceil(total / paginas) > capPrimeira) paginas++
  const porPagina = Math.ceil(total / paginas)

  // Com páginas equilibradas sobra espaço: devolve a altura da linha ao maior valor que ainda comporta `porPagina`.
  for (let h = LINHA_MAX_MM; h > alturaLinhaMm; h -= 0.5) {
    if (porPagina <= capacidade(h, true)) {
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
  return montar(alturaLinhaMm, currais)
}
