import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { gerarWorkbookModeloLotes } from './modeloImportacaoLotes'
import { COLUNAS_MODELO } from '../services/lotesImportacao'

const opcoes = {
  pastos: ['Baixa Verde', 'Baixa Grande'],
  currais: ['Curral 3'],
  racas: ['Nelore', 'Angus'],
}

describe('gerarWorkbookModeloLotes', () => {
  it('monta aba Importação com cabeçalho, validações e aba Listas oculta', async () => {
    const wb = await gerarWorkbookModeloLotes(opcoes)
    const ws = wb.getWorksheet('Importação')!
    const listas = wb.getWorksheet('Listas')!

    expect(ws.getRow(1).values as string[]).toEqual([undefined, ...COLUNAS_MODELO])
    expect(listas.state).toBe('hidden')

    const dvs = (ws as any).dataValidations.model as Record<string, any>
    expect(dvs['B2:B501'].formulae).toEqual(['ListaSistemas'])
    expect(dvs['C2:C501'].formulae).toEqual(['ListaPastos'])
    expect(dvs['F2:F501'].formulae).toEqual(['ListaCategorias'])
    expect(dvs['H2:H501'].type).toBe('date')
  })

  it('round-trip: validações e defined names sobrevivem à serialização xlsx', async () => {
    const wb = await gerarWorkbookModeloLotes(opcoes)
    const buffer = await wb.xlsx.writeBuffer()

    const wb2 = new ExcelJS.Workbook()
    await wb2.xlsx.load(buffer as ArrayBuffer)

    const ws2 = wb2.getWorksheet('Importação')!
    const dvs = (ws2 as any).dataValidations.model as Record<string, any>
    // Ao reler, o exceljs expande o sqref de cada validação em células
    // individuais; a cobertura deve ir de 2 a 501 nas colunas com dropdown.
    for (const coluna of ['B', 'C', 'D', 'E', 'F', 'H', 'K', 'L']) {
      expect(dvs[`${coluna}2`]).toBeDefined()
      expect(dvs[`${coluna}501`]).toBeDefined()
    }
    expect(dvs['C2'].formulae).toEqual(['ListaPastos'])
    expect(dvs['H2'].type).toBe('date')

    const listas2 = wb2.getWorksheet('Listas')!
    expect(listas2.state).toBe('hidden')
    expect(listas2.getCell('A2').value).toBe('Baixa Verde')
    expect(listas2.getCell('B2').value).toBe('Curral 3')

    // Defined names existem no workbook serializado (usados pelos dropdowns)
    const nomes = Object.keys((wb2.definedNames as any).matrixMap)
    expect(nomes).toEqual(
      expect.arrayContaining(['ListaPastos', 'ListaCurrais', 'ListaSistemas', 'ListaDestinos', 'ListaCategorias', 'ListaSexos', 'ListaRacas'])
    )
  })
})
