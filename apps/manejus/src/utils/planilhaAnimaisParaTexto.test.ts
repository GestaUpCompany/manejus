import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { celulaParaTexto, linhasParaTexto, planilhaAnimaisParaTexto } from './planilhaAnimaisParaTexto'
import { parseListaAnimais } from './listaAnimaisIdentificacao'

describe('planilhaAnimaisParaTexto', () => {
  it('converte células cruas', () => {
    expect(celulaParaTexto(982000123456789)).toBe('982000123456789')
    expect(celulaParaTexto(310.5)).toBe('310,5')
    expect(celulaParaTexto(new Date(2025, 2, 9))).toBe('2025-03-09')
    expect(celulaParaTexto(null)).toBe('')
    expect(celulaParaTexto(' A;B ')).toBe('A B')
  })

  it('descarta linhas vazias e células vazias no fim', () => {
    expect(linhasParaTexto([['brinco', 'chip', ''], ['', '', ''], [1001, '', 300]])).toBe('brinco;chip\n1001;;300')
  })

  it('lê uma planilha real e alimenta o parser de lista', async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Brinco', 'Chip', 'Peso', 'Nascimento'],
      [1001, 982000123456789, 310.5, new Date(2025, 2, 9)],
      ['A-2', '', 280, ''],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Animais')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellDates: true }) as ArrayBuffer
    const texto = await planilhaAnimaisParaTexto(buf)
    const animais = parseListaAnimais(texto)
    expect(animais).toEqual([
      { id_brinco: '1001', id_chip: '982000123456789', peso_atual_kg: '310,5', data_nascimento: '2025-03-09' },
      { id_brinco: 'A-2', peso_atual_kg: '280' },
    ])
  })
})
