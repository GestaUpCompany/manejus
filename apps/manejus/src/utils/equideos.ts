export type EspecieEquideo = 'Equino' | 'Asinino' | 'Muar'

export interface Equideo {
  slug: string
  rotulo: string
  especie: EspecieEquideo
  sexo: 'macho' | 'fêmea'
}

/** Categorias de tropa: uma por espécie e sexo (mesmo slug de lote_categorias.categoria e categorias_animais). */
export const EQUIDEOS: Equideo[] = [
  { slug: 'cavalo', rotulo: 'Cavalo', especie: 'Equino', sexo: 'macho' },
  { slug: 'égua', rotulo: 'Égua', especie: 'Equino', sexo: 'fêmea' },
  { slug: 'jumento', rotulo: 'Jumento', especie: 'Asinino', sexo: 'macho' },
  { slug: 'jumenta', rotulo: 'Jumenta', especie: 'Asinino', sexo: 'fêmea' },
  { slug: 'burro', rotulo: 'Burro', especie: 'Muar', sexo: 'macho' },
  { slug: 'mula', rotulo: 'Mula', especie: 'Muar', sexo: 'fêmea' },
]

export const ESPECIES_EQUIDEOS: EspecieEquideo[] = ['Equino', 'Asinino', 'Muar']

const normalizar = (categoria: string) => categoria.trim().toLowerCase()

export const isEquideo = (categoria: string): boolean =>
  EQUIDEOS.some((e) => e.slug === normalizar(categoria))

export const sexoDoEquideo = (categoria: string): Equideo['sexo'] | undefined =>
  EQUIDEOS.find((e) => e.slug === normalizar(categoria))?.sexo

/** Categoria "tropa" genérica, de antes da divisão por espécie e sexo. */
export const isTropaLegada = (categoria: string): boolean => normalizar(categoria) === 'tropa'

export interface ResultadoDivisaoTropa {
  soma: number
  /** Positivo: ainda falta distribuir. Negativo: passou do saldo. */
  faltam: number
  valida: boolean
}

/** Soma os campos preenchidos e confere com o saldo da tropa (inteiros >= 0, soma = saldo). */
export function validarDivisaoTropa(divisao: Record<string, string>, saldo: number): ResultadoDivisaoTropa {
  const quantidades = Object.values(divisao).map((v) => (v.trim() === '' ? 0 : Number(v)))
  const soma = quantidades.reduce((acc, q) => acc + (Number.isInteger(q) && q > 0 ? q : 0), 0)
  const todasInteiras = quantidades.every((q) => Number.isInteger(q) && q >= 0)
  return { soma, faltam: saldo - soma, valida: todasInteiras && soma === saldo && saldo > 0 }
}

/** Monta o jsonb da RPC detalhar_tropa só com as categorias de quantidade > 0. */
export function montarDivisaoTropa(divisao: Record<string, string>): Record<string, number> {
  const resultado: Record<string, number> = {}
  for (const e of EQUIDEOS) {
    const q = Number(divisao[e.slug])
    if (Number.isInteger(q) && q > 0) resultado[e.slug] = q
  }
  return resultado
}
