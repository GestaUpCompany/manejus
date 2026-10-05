import { describe, expect, it } from 'vitest'
import {
  norm,
  parseData,
  parseLinhasPlanilha,
  validarLinhas,
  type ContextoImportacao,
  type LinhaBruta,
} from './lotesImportacao'

const ctxBase: ContextoImportacao = {
  lotesNomesExistentes: new Set(),
  pastos: new Map([
    ['baixa verde', { id: 'pasto-1', nome: 'Baixa Verde' }],
    ['baixa grande', { id: 'pasto-2', nome: 'Baixa Grande' }],
  ]),
  currais: new Map([['curral 3', { id: 'curral-3', nome: 'Curral 3' }]]),
}

function linha(l: number, valores: Record<string, unknown>): LinhaBruta {
  return { linha: l, valores }
}

const linhaBase = {
  lote: 'Lote 01',
  'sistema de producao': 'Engorda',
  pasto: 'Baixa Verde',
  curral: '',
  destino: 'corte',
  categoria: 'boi magro',
  'quantidade cab': 40,
}

describe('norm', () => {
  it('normaliza caixa, acentos e espaços', () => {
    expect(norm('  Baixa  Vérde ')).toBe('baixa verde')
    expect(norm('Bezerro ao Pé')).toBe('bezerro ao pe')
    expect(norm(null)).toBe('')
  })
})

describe('parseData', () => {
  it('aceita dd/mm/aaaa', () => {
    expect(parseData('01/10/2026')).toBe('2026-10-01')
    expect(parseData('5/3/26')).toBe('2026-03-05')
  })
  it('aceita objeto Date e serial do Excel', () => {
    expect(parseData(new Date('2026-10-01T12:00:00Z'))).toBe('2026-10-01')
    expect(parseData(45992)).toBe('2025-12-01')
  })
  it('aceita ISO e retorna NaN para inválido', () => {
    expect(parseData('2026-10-01T00:00:00Z')).toBe('2026-10-01')
    expect(Number.isNaN(parseData('amanhã') as number)).toBe(true)
    expect(parseData('')).toBeNull()
  })
})

describe('parseLinhasPlanilha', () => {
  const header = ['Lote', 'Sistema de Produção', 'Pasto', 'Curral', 'Destino', 'Categoria', 'Quantidade (cab)']

  it('extrai linhas a partir do cabeçalho e ignora linhas vazias', () => {
    const res = parseLinhasPlanilha([
      header,
      ['Lote 01', 'Engorda', 'Baixa Verde', '', 'corte', 'boi magro', 40],
      [],
      ['Lote 01', '', '', '', '', 'bezerro', 10],
    ])
    expect(res.erro).toBeUndefined()
    expect(res.linhas).toHaveLength(2)
    expect(res.linhas[0].linha).toBe(2)
    expect(res.linhas[0].valores['categoria']).toBe('boi magro')
  })

  it('falha quando falta coluna obrigatória', () => {
    const res = parseLinhasPlanilha([header.slice(0, 4), ['x']])
    expect(res.erro).toContain('Cabeçalho não encontrado')
  })
})

describe('validarLinhas', () => {
  it('agrupa categorias do mesmo lote e resolve pasto por nome', () => {
    const res = validarLinhas(
      [
        linha(2, { ...linhaBase }),
        linha(3, { ...linhaBase, categoria: 'Bezerro', 'quantidade cab': 12, pasto: '', sistema: '', destino: '' }),
      ],
      ctxBase
    )
    expect(res.errosLinhas).toHaveLength(0)
    expect(res.lotes).toHaveLength(1)
    expect(res.lotes[0].nome).toBe('Lote 01')
    expect(res.lotes[0].pastoId).toBe('pasto-1')
    expect(res.lotes[0].categorias.map((c) => c.categoria)).toEqual(['boi magro', 'bezerro'])
  })

  it('exige curral para confinamento e resolve pelo nome', () => {
    const res = validarLinhas(
      [linha(2, { ...linhaBase, 'sistema de producao': 'Confinamento', pasto: '', curral: 'Curral 3' })],
      ctxBase
    )
    expect(res.errosLinhas).toHaveLength(0)
    expect(res.lotes[0].curralId).toBe('curral-3')
    expect(res.lotes[0].pastoId).toBeNull()

    const semCurral = validarLinhas(
      [linha(2, { ...linhaBase, 'sistema de producao': 'TIP', pasto: '', curral: '' })],
      ctxBase
    )
    expect(semCurral.lotes).toHaveLength(0)
    expect(semCurral.errosLinhas[0].erros[0]).toContain('Curral')
  })

  it('marca duplicado quando o nome do lote já existe no banco', () => {
    const ctx: ContextoImportacao = {
      ...ctxBase,
      lotesNomesExistentes: new Set(['lote 01']),
    }
    const res = validarLinhas([linha(2, { ...linhaBase })], ctx)
    expect(res.lotes).toHaveLength(0)
    expect(res.duplicadosBanco[0].nome).toBe('Lote 01')
  })

  it('rejeita grupo inteiro quando uma linha tem erro', () => {
    const res = validarLinhas(
      [
        linha(2, { ...linhaBase }),
        linha(3, { ...linhaBase, categoria: 'bezerro', 'quantidade cab': '' }),
      ],
      ctxBase
    )
    expect(res.lotes).toHaveLength(0)
    expect(res.errosLinhas[0].linha).toBe(3)
  })

  it('detecta categoria duplicada e categoria inválida', () => {
    const res = validarLinhas(
      [
        linha(2, { ...linhaBase }),
        linha(3, { ...linhaBase, categoria: 'Boi Magro', 'quantidade cab': 5 }),
        linha(4, { ...linhaBase, categoria: 'dinossauro', 'quantidade cab': 1 }),
      ],
      ctxBase
    )
    const msgs = res.errosLinhas.flatMap((e) => e.erros).join(' | ')
    expect(msgs).toContain('duplicada')
    expect(msgs).toContain('inválida')
  })

  it('detecta divergência de atributos do lote entre linhas', () => {
    const res = validarLinhas(
      [
        linha(2, { ...linhaBase }),
        linha(3, { ...linhaBase, categoria: 'bezerro', pasto: 'Baixa Grande' }),
      ],
      ctxBase
    )
    expect(res.lotes).toHaveLength(0)
    expect(res.errosLinhas[0].erros[0]).toContain('Diverge')
  })

  it('normaliza destino por alias (abate → corte) e valida valor inválido', () => {
    const ok = validarLinhas([linha(2, { ...linhaBase, destino: 'Abate' })], ctxBase)
    expect(ok.lotes[0].destino).toBe('corte')

    const ruim = validarLinhas([linha(2, { ...linhaBase, destino: 'lazer' })], ctxBase)
    expect(ruim.lotes).toHaveLength(0)
  })

  it('erro quando pasto não existe no cadastro', () => {
    const res = validarLinhas([linha(2, { ...linhaBase, pasto: 'Pasto Fantasma' })], ctxBase)
    expect(res.lotes).toHaveLength(0)
    expect(res.errosLinhas[0].erros[0]).toContain('não encontrado')
  })
})
