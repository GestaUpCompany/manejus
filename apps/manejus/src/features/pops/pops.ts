export const POP_SLUGS = ['maternidade', 'pastagens', 'cocho', 'bebedouros', 'fezes', 'escore'] as const
export type PopSlug = (typeof POP_SLUGS)[number]

export const POPS_INFO: Record<PopSlug, { titulo: string; cadernetas: string }> = {
  maternidade: { titulo: 'POP Maternidade', cadernetas: 'Maternidade' },
  pastagens: { titulo: 'POP Pastagens', cadernetas: 'Pastagens' },
  cocho: { titulo: 'POP Cocho', cadernetas: 'Suplementação e Leitura de Cocho' },
  bebedouros: { titulo: 'POP Bebedouros', cadernetas: 'Bebedouros' },
  fezes: { titulo: 'POP Fezes', cadernetas: 'Pastagens, Rodeio e Suplementação' },
  escore: { titulo: 'POP Escore', cadernetas: 'Maternidade e Pastagens' },
}

export const POP_LARGURA = 1240
export const POP_MAX_PAGINAS = 20
export const POP_MAX_ORIGINAL_BYTES = 20_000_000
// Retrato aproximado de A4 (altura/largura = 1,414), com tolerância.
export const POP_PROPORCAO_MIN = 1.25
export const POP_PROPORCAO_MAX = 1.6

export type TipoEntradaPop = 'pdf' | 'imagem'

export function tipoEntradaPop(file: { type: string; name: string }): TipoEntradaPop | null {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return 'pdf'
  if (['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'imagem'
  return null
}

export function validarProporcaoPop(largura: number, altura: number): string | null {
  if (!largura || !altura) return 'Não foi possível ler as dimensões da página.'
  const proporcao = altura / largura
  if (proporcao < POP_PROPORCAO_MIN || proporcao > POP_PROPORCAO_MAX) {
    return 'A página deve estar em formato retrato, proporção de folha A4 (ex.: 1240 × 1755 px).'
  }
  return null
}

export function ordenarArquivosPop<T extends { name: string }>(files: T[]): T[] {
  return [...files].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }))
}
