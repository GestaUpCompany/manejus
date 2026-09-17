import type ExcelJS from 'exceljs'
import type { LancamentoTratosData } from '../services/lancamentoTratosService'

const CABECALHOS_FIXOS = [
  'Lote',
  'Curral',
  'Dieta em Uso',
  'Qtd. Cab.',
  'Trato Anterior (kg)',
  'Leitura do Dia',
  'Trato Diário Previsto (kg)',
  'Consumo Dia (kg/cab/dia)',
]

function numero(valor: number | null, casas = 2): string {
  if (valor == null || !Number.isFinite(valor)) return ''
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

function dataBR(data: string): string {
  const [ano, mes, dia] = data.split('-')
  return `${dia}/${mes}/${ano}`
}

function sanitizarNome(nome: string): string {
  return nome.replace(/[\\/:*?"<>|]/g, '-').trim()
}

function estilizarCelula(cell: ExcelJS.Cell, fill: string, fontColor = 'FFFFFF', bold = false) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
  cell.font = { name: 'Arial', size: 9, bold, color: { argb: fontColor } }
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  cell.border = {
    top: { style: 'thin', color: { argb: '808080' } },
    left: { style: 'thin', color: { argb: '808080' } },
    bottom: { style: 'thin', color: { argb: '808080' } },
    right: { style: 'thin', color: { argb: '808080' } },
  }
}

export async function criarPlanilhaTratosCampo(data: LancamentoTratosData, fazendaNome: string): Promise<ExcelJS.Workbook> {
  const ExcelJSMod = await import('exceljs')
  const workbook = new ExcelJSMod.default.Workbook()
  const worksheet = workbook.addWorksheet('Trato de Campo')
  const quantidadeTratos = data.linhas.reduce((maior, linha) => Math.max(maior, linha.quantidadeTratos), 0)
  const ultimaColuna = CABECALHOS_FIXOS.length + quantidadeTratos * 2 + 1

  worksheet.mergeCells(1, 1, 1, ultimaColuna)
  worksheet.getCell(1, 1).value = `Trato Projetado Confinamento - ${fazendaNome}`
  worksheet.getCell(1, 1).font = { name: 'Arial', size: 16, bold: true, italic: true, color: { argb: '1A1A1A' } }
  worksheet.getCell(1, 1).alignment = { horizontal: 'center', vertical: 'middle' }
  worksheet.getRow(1).height = 28

  worksheet.mergeCells(2, 1, 2, 3)
  worksheet.getCell(2, 1).value = `Data do Trato: ${dataBR(data.data)}`
  worksheet.mergeCells(2, 4, 2, ultimaColuna)
  worksheet.getCell(2, 4).value = `Tipo de programação: ${data.tipo}`
  for (let coluna = 1; coluna <= ultimaColuna; coluna += 1) {
    const cell = worksheet.getCell(2, coluna)
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D9E2F3' } }
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: '1A1A1A' } }
    cell.alignment = { vertical: 'middle', horizontal: coluna === 1 ? 'left' : 'right' }
  }
  worksheet.getRow(2).height = 22

  let coluna = 1
  for (const cabecalho of CABECALHOS_FIXOS) {
    worksheet.mergeCells(4, coluna, 5, coluna)
    worksheet.getCell(4, coluna).value = cabecalho
    estilizarCelula(worksheet.getCell(4, coluna), '0F6437', 'FFFFFF', true)
    coluna += 1
  }
  for (let ordem = 1; ordem <= quantidadeTratos; ordem += 1) {
    worksheet.mergeCells(4, coluna, 4, coluna + 1)
    worksheet.getCell(4, coluna).value = `${ordem}º Trato`
    estilizarCelula(worksheet.getCell(4, coluna), '0F6437', 'FFFFFF', true)
    worksheet.getCell(5, coluna).value = 'Previsto'
    worksheet.getCell(5, coluna + 1).value = 'Real'
    estilizarCelula(worksheet.getCell(5, coluna), 'D9E2F3', '1A1A1A', true)
    estilizarCelula(worksheet.getCell(5, coluna + 1), 'E7E6E6', '1A1A1A', true)
    coluna += 2
  }
  worksheet.mergeCells(4, coluna, 5, coluna)
  worksheet.getCell(4, coluna).value = 'Total Projetado (kg)'
  estilizarCelula(worksheet.getCell(4, coluna), '0F6437', 'FFFFFF', true)
  worksheet.getRow(4).height = 30
  worksheet.getRow(5).height = 24

  for (const linha of data.linhas) {
    const valores: (string | number)[] = [
      linha.loteNome,
      linha.curralNome,
      linha.dietaNome || '',
      linha.quantidadeCabecas ?? '',
      numero(linha.tratoAnteriorKg, 1),
      linha.leituraDia ?? '',
      numero(linha.kgBaseDia, 1),
      numero(linha.consumoKgCabDia, 2),
    ]
    for (const trato of linha.tratos) valores.push(numero(trato.kgPlanejado, 1), '')
    for (let ordem = linha.tratos.length + 1; ordem <= quantidadeTratos; ordem += 1) valores.push('', '')
    valores.push(numero(linha.tratos.reduce((sum, trato) => sum + (trato.kgPlanejado || 0), 0), 1))
    const row = worksheet.addRow(valores)
    row.height = 30
    row.eachCell((cell, index) => {
      const isReal = index > CABECALHOS_FIXOS.length && (index - CABECALHOS_FIXOS.length) % 2 === 0
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isReal ? 'F2F2F2' : 'FFFFFF' } }
      cell.font = { name: 'Arial', size: 9, bold: index === 1 || index === 2 }
      cell.alignment = { vertical: 'middle', horizontal: index <= 3 ? 'left' : 'center', wrapText: true }
      cell.border = {
        top: { style: 'thin', color: { argb: 'A6A6A6' } },
        left: { style: 'thin', color: { argb: 'A6A6A6' } },
        bottom: { style: 'thin', color: { argb: 'A6A6A6' } },
        right: { style: 'thin', color: { argb: 'A6A6A6' } },
      }
    })
  }

  const larguras = [24, 12, 20, 9, 16, 12, 19, 18]
  for (let index = 0; index < quantidadeTratos * 2; index += 1) larguras.push(index % 2 === 0 ? 17 : 14)
  larguras.push(17)
  larguras.forEach((largura, index) => { worksheet.getColumn(index + 1).width = largura })
  worksheet.views = [{ state: 'frozen', ySplit: 5 }]
  worksheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(5, worksheet.rowCount), column: ultimaColuna } }
  worksheet.pageSetup = {
    orientation: 'landscape',
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalDpi: 300,
    verticalDpi: 300,
  }
  worksheet.headerFooter.oddFooter = 'Página &P de &N'
  worksheet.headerFooter.oddHeader = `&B${fazendaNome} | Trato ${dataBR(data.data)}&B`

  return workbook
}

export async function baixarPlanilhaTratosCampo(data: LancamentoTratosData, fazendaNome: string): Promise<void> {
  const workbook = await criarPlanilhaTratosCampo(data, fazendaNome)
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `Trato Projetado Confinamento - ${sanitizarNome(fazendaNome)} - ${dataBR(data.data).replace(/\//g, '-')} - ${data.tipo}.xlsx`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
