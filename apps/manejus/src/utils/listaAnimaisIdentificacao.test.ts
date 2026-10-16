import { describe, expect, it } from 'vitest'
import { parseListaAnimais } from './listaAnimaisIdentificacao'

describe('parseListaAnimais', () => {
  it('lista vazia devolve vazio', () => {
    expect(parseListaAnimais('  \n\n')).toEqual([])
  })

  it('sem cabeçalho: um valor por linha é o brinco', () => {
    expect(parseListaAnimais('1001\n1002\r\n1003')).toEqual([{ id_brinco: '1001' }, { id_brinco: '1002' }, { id_brinco: '1003' }])
  })

  it('sem cabeçalho: colunas brinco, chip e peso (separador ; , ou tab)', () => {
    expect(parseListaAnimais('1001;CHIP1;310,5\n1002,,280\n1003\tCHIP3')).toEqual([
      { id_brinco: '1001', id_chip: 'CHIP1', peso_atual_kg: '310,5' },
      { id_brinco: '1002', peso_atual_kg: '280' },
      { id_brinco: '1003', id_chip: 'CHIP3' },
    ])
  })

  it('com cabeçalho segue as colunas, ignorando acento e caixa', () => {
    const texto = 'Brinco;Raça;Sexo;SISBOV\n1001;Nelore;Macho;076123456789012\n1002;;Fêmea;'
    expect(parseListaAnimais(texto)).toEqual([
      { id_brinco: '1001', raca: 'Nelore', sexo: 'Macho', codigo_sisbov: '076123456789012' },
      { id_brinco: '1002', sexo: 'Fêmea' },
    ])
  })

  it('remove aspas e ignora colunas desconhecidas', () => {
    expect(parseListaAnimais('brinco,cor\n"1001",preto')).toEqual([{ id_brinco: '1001' }])
  })
})
