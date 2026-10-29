import { describe, expect, it } from 'vitest'
import { isEquideo, isTropaLegada, montarDivisaoTropa, sexoDoEquideo, validarDivisaoTropa } from './equideos'

describe('equideos', () => {
  it('reconhece as seis categorias e a tropa legada', () => {
    expect(isEquideo('Égua')).toBe(true)
    expect(isEquideo('mula')).toBe(true)
    expect(isEquideo('vaca')).toBe(false)
    expect(isTropaLegada(' Tropa ')).toBe(true)
    expect(isEquideo('tropa')).toBe(false)
  })

  it('deriva o sexo da categoria', () => {
    expect(sexoDoEquideo('cavalo')).toBe('macho')
    expect(sexoDoEquideo('jumenta')).toBe('fêmea')
    expect(sexoDoEquideo('boi gordo')).toBeUndefined()
  })

  it('valida a divisão contra o saldo', () => {
    expect(validarDivisaoTropa({ cavalo: '20', mula: '10' }, 30)).toEqual({ soma: 30, faltam: 0, valida: true })
    expect(validarDivisaoTropa({ cavalo: '20', mula: '5' }, 30)).toEqual({ soma: 25, faltam: 5, valida: false })
    expect(validarDivisaoTropa({ cavalo: '20', mula: '15' }, 30)).toEqual({ soma: 35, faltam: -5, valida: false })
  })

  it('ignora campos vazios e rejeita quantidade fracionada ou negativa', () => {
    expect(validarDivisaoTropa({ cavalo: '', égua: '30' }, 30).valida).toBe(true)
    expect(validarDivisaoTropa({ cavalo: '2,5', égua: '27,5' }, 30).valida).toBe(false)
    expect(validarDivisaoTropa({ cavalo: '-1', égua: '31' }, 30).valida).toBe(false)
    expect(validarDivisaoTropa({}, 0).valida).toBe(false)
  })

  it('monta a divisão enviada à RPC só com quantidades positivas', () => {
    expect(montarDivisaoTropa({ cavalo: '12', égua: '', burro: '0', mula: '18' })).toEqual({ cavalo: 12, mula: 18 })
  })
})
