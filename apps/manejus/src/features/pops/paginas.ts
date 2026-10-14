import {
  POP_LARGURA,
  POP_MAX_ORIGINAL_BYTES,
  POP_MAX_PAGINAS,
  ordenarArquivosPop,
  tipoEntradaPop,
  validarProporcaoPop,
} from './pops'

function canvasParaJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível comprimir a página.'))), 'image/jpeg', 0.82)
  })
}

function desenharNormalizado(origem: CanvasImageSource, larguraOrigem: number, alturaOrigem: number): HTMLCanvasElement {
  const erro = validarProporcaoPop(larguraOrigem, alturaOrigem)
  if (erro) throw new Error(erro)
  const canvas = document.createElement('canvas')
  canvas.width = POP_LARGURA
  canvas.height = Math.round((alturaOrigem / larguraOrigem) * POP_LARGURA)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não foi possível processar a página.')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(origem, 0, 0, canvas.width, canvas.height)
  return canvas
}

async function paginasDeImagem(file: File): Promise<Blob[]> {
  const url = URL.createObjectURL(file)
  try {
    const imagem = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error(`Não foi possível ler a imagem ${file.name}.`))
      element.src = url
    })
    const canvas = desenharNormalizado(imagem, imagem.naturalWidth, imagem.naturalHeight)
    return [await canvasParaJpeg(canvas)]
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function paginasDePdf(file: File): Promise<Blob[]> {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const documento = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  try {
    if (documento.numPages > POP_MAX_PAGINAS) throw new Error(`O PDF tem ${documento.numPages} páginas; o máximo é ${POP_MAX_PAGINAS}.`)
    const blobs: Blob[] = []
    for (let n = 1; n <= documento.numPages; n++) {
      const pagina = await documento.getPage(n)
      const base = pagina.getViewport({ scale: 1 })
      const erro = validarProporcaoPop(base.width, base.height)
      if (erro) throw new Error(`Página ${n} do PDF: ${erro}`)
      const viewport = pagina.getViewport({ scale: POP_LARGURA / base.width })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Não foi possível processar o PDF.')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await pagina.render({ canvasContext: ctx, viewport }).promise
      blobs.push(await canvasParaJpeg(canvas))
    }
    return blobs
  } finally {
    await documento.destroy()
  }
}

/** Converte PDF (todas as páginas) ou imagens (ordenadas pelo nome) em JPEGs de 1240 px de largura. */
export async function prepararPaginasPop(arquivos: File[]): Promise<Blob[]> {
  if (arquivos.length === 0) throw new Error('Selecione ao menos um arquivo.')
  const paginas: Blob[] = []
  for (const file of ordenarArquivosPop(arquivos)) {
    const tipo = tipoEntradaPop(file)
    if (!tipo) throw new Error(`${file.name}: use PDF, JPG, PNG ou WebP.`)
    if (file.size > POP_MAX_ORIGINAL_BYTES) throw new Error(`${file.name}: o arquivo deve ter no máximo 20 MB.`)
    paginas.push(...(tipo === 'pdf' ? await paginasDePdf(file) : await paginasDeImagem(file)))
  }
  if (paginas.length > POP_MAX_PAGINAS) throw new Error(`O POP pode ter no máximo ${POP_MAX_PAGINAS} páginas.`)
  return paginas
}
