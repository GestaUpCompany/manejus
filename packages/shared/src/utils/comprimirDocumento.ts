// Compressão client-side dos documentos de OS (romaneio/acerto) antes do
// upload para o bucket privado 'documentos-os'. Fotos de documentos chegam a
// 5-10 MB em celulares; depois do canvas ficam em ~300-600 KB mantendo
// legibilidade (JPEG 1920px/q0.8). PDFs não passam por canvas (perderiam
// texto/vetor) e sobem como estão, limitados pelos 15 MB do bucket.

const TIPOS_ACEITOS = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
const MAX_ORIGINAL_BYTES = 15 * 1024 * 1024
const MAX_DIM = 1920
const QUALIDADE_JPEG = 0.8

export interface DocumentoComprimido {
  blob: Blob
  fileName: string
  contentType: string
}

export function validarDocumento(file: File): string | null {
  if (!TIPOS_ACEITOS.has(file.type)) return 'Use imagem (JPEG, PNG, WebP) ou PDF.'
  if (file.size > MAX_ORIGINAL_BYTES) return 'O arquivo deve ter no máximo 15 MB.'
  return null
}

export function sanitizarNomeArquivo(nome: string): string {
  const semExt = nome.includes('.') ? nome.slice(0, nome.lastIndexOf('.')) : nome
  const base = semExt.normalize('NFD').replace(/[̀-ͯ]/g, '') // U+0300–U+036F
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'documento'
}

export async function comprimirDocumento(file: File): Promise<DocumentoComprimido> {
  const erro = validarDocumento(file)
  if (erro) throw new Error(erro)

  const nomeBase = sanitizarNomeArquivo(file.name)

  if (file.type === 'application/pdf') {
    return { blob: file, fileName: `${nomeBase}.pdf`, contentType: 'application/pdf' }
  }

  const url = URL.createObjectURL(file)
  try {
    const imagem = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('Não foi possível ler a imagem.'))
      element.src = url
    })

    const escala = Math.min(1, MAX_DIM / Math.max(imagem.naturalWidth, imagem.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(imagem.naturalWidth * escala)
    canvas.height = Math.round(imagem.naturalHeight * escala)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Não foi possível processar a imagem.')
    // Fundo branco: PNG/WebP com transparência virariam fundo preto em JPEG
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(imagem, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Não foi possível comprimir a imagem.'))),
        'image/jpeg',
        QUALIDADE_JPEG,
      )
    })
    return { blob, fileName: `${nomeBase}.jpg`, contentType: 'image/jpeg' }
  } finally {
    URL.revokeObjectURL(url)
  }
}
