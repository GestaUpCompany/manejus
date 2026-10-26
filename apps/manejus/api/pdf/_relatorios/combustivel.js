// Relatório de combustível (abastecimento + estoque) em um único PDF.
// Cada parte é renderizada pelo próprio módulo (abastecimento.js e estoqueCombustivel.js)
// e as páginas são juntadas com pdf-lib. A numeração "Página X de Y" é contínua no arquivo inteiro.

import { PDFDocument } from 'pdf-lib'
import { generatePdf } from '../_shared/puppeteer.js'
import { isPDFData as isAbastecimentoData, renderAbastecimentoHtml } from './abastecimento.js'
import { isPDFData as isEstoqueData, renderEstoqueCombustivelHtml } from './estoqueCombustivel.js'

const MAX_BODY_BYTES = 8_000_000
const MAX_MAQUINAS = 5000
const MAX_TANQUES = 500
const MAX_MOVIMENTACOES = 5000

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Método não permitido' })
  }
  const { abastecimento, estoque } = req.body ?? {}
  if (
    !isAbastecimentoData(abastecimento) ||
    !isEstoqueData(estoque) ||
    abastecimento.detalhesPorMaquina.length > MAX_MAQUINAS ||
    estoque.tanques.length > MAX_TANQUES ||
    (estoque.movimentacoes?.length ?? 0) > MAX_MOVIMENTACOES
  ) {
    return res.status(400).json({ error: 'Payload de relatório inválido ou grande demais' })
  }
  if (Buffer.byteLength(JSON.stringify(req.body), 'utf8') > MAX_BODY_BYTES) {
    return res.status(413).json({ error: 'Payload do relatório excede o limite permitido' })
  }

  try {
    // Numeração contínua: conta as páginas de cada parte no HTML (sem Chromium) e renderiza com o total geral
    // O PDF combinado é um resumo: sem tabelas de lançamentos (máquina, operador, placa e extrato)
    const opcoesAbastecimento = { incluirDetalhes: false }
    const opcoesEstoque = { incluirExtrato: false }
    const contarPaginas = (html) => (html.match(/<section class="page">/g) || []).length
    const totalAbastecimento = contarPaginas(await renderAbastecimentoHtml(abastecimento, opcoesAbastecimento))
    const totalEstoque = contarPaginas(await renderEstoqueCombustivelHtml(estoque, opcoesEstoque))
    const totalPaginas = totalAbastecimento + totalEstoque

    const htmlAbastecimento = await renderAbastecimentoHtml(abastecimento, { ...opcoesAbastecimento, grandTotal: totalPaginas })
    const pdfAbastecimento = await generatePdf({
      html: htmlAbastecimento,
      format: 'A4',
      landscape: true,
      beforePdf: async (page) => {
        await page.waitForFunction('window.__chartsReady === true', { timeout: 15000 }).catch(() => {})
      },
    })
    const htmlEstoque = await renderEstoqueCombustivelHtml(estoque, { ...opcoesEstoque, pageOffset: totalAbastecimento, grandTotal: totalPaginas })
    const pdfEstoque = await generatePdf({ html: htmlEstoque, format: 'A4', landscape: true })

    const merged = await PDFDocument.create()
    for (const buffer of [pdfAbastecimento, pdfEstoque]) {
      const doc = await PDFDocument.load(buffer)
      const paginas = await merged.copyPages(doc, doc.getPageIndices())
      for (const pagina of paginas) merged.addPage(pagina)
    }
    const pdf = Buffer.from(await merged.save())

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio-combustivel.pdf"')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-PDF-Renderer', 'puppeteer')
    return res.status(200).send(pdf)
  } catch (error) {
    console.error('[PDF Combustível] Erro ao gerar relatório:', error)
    return res.status(500).json({ error: 'Não foi possível gerar o PDF', detail: String(error) })
  }
}
