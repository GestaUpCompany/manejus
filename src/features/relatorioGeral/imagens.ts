const TIPOS_ACEITOS = new Set(['image/png', 'image/jpeg', 'image/webp'])
const MAX_ORIGINAL_BYTES = 10_000_000
const LARGURA = 1920
const ALTURA = 1358

export function validarImagemCapa(file: File): string | null {
  if (!TIPOS_ACEITOS.has(file.type)) return 'Use uma imagem PNG, JPEG ou WebP.'
  if (file.size > MAX_ORIGINAL_BYTES) return 'A imagem original deve ter no máximo 10 MB.'
  return null
}

export async function normalizarImagemCapa(file: File): Promise<Blob> {
  const erro = validarImagemCapa(file)
  if (erro) throw new Error(erro)
  const url = URL.createObjectURL(file)
  try {
    const imagem = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('Não foi possível ler a imagem.'))
      element.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = LARGURA
    canvas.height = ALTURA
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Não foi possível processar a imagem.')
    const escala = Math.max(LARGURA / imagem.naturalWidth, ALTURA / imagem.naturalHeight)
    const largura = imagem.naturalWidth * escala
    const altura = imagem.naturalHeight * escala
    ctx.drawImage(imagem, (LARGURA - largura) / 2, (ALTURA - altura) / 2, largura, altura)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Não foi possível comprimir a imagem.')), 'image/webp', 0.84)
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function sanitizarNomeImagem(nome: string): string {
  const base = nome.replace(/\.[^.]+$/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'capa'
}
