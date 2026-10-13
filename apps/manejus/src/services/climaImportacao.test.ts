import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { createRequire } from 'node:module'
import {
  chaveDataHoraFazenda,
  fazendaDataHoraParaIso,
  parseHora,
  parseLinhasClima,
  parseSimNao,
  validarLinhasClima,
  type ContextoClima,
} from './climaImportacao'
import { colunasModeloClima, gerarWorkbookModeloClima } from '../utils/modeloImportacaoClima'

const pluviometros = [
  { id: 'p1', nome: 'Retiro', localizacao: 'Retiro Ponte Branca' },
  { id: 'p2', nome: 'Sede', localizacao: null },
]

const ctx = (existentes: string[] = []): ContextoClima => ({
  fazendaId: 'faz-1',
  pluviometros,
  responsaveis: ['João', 'Maria Souza'],
  existentes: new Set(existentes),
})

const AGORA = new Date('2026-10-13T16:00:00Z') // 12:00 em Cuiabá
const linha = (n: number, valores: Record<string, unknown>) => ({ linha: n, valores })

describe('parsers', () => {
  it('parseHora aceita texto, fração de dia e rejeita inválidas', () => {
    expect(parseHora('7:30')).toBe('07:30')
    expect(parseHora('07h05')).toBe('07:05')
    expect(parseHora(0.5)).toBe('12:00')
    expect(parseHora('')).toBeNull()
    expect(parseHora('25:00')).toBeNaN()
    expect(parseHora('abc')).toBeNaN()
  })

  it('parseSimNao normaliza variações e sinaliza inválidos', () => {
    expect(parseSimNao('Sim')).toBe(true)
    expect(parseSimNao('VERDADEIRO')).toBe(true)
    expect(parseSimNao('Não')).toBe(false)
    expect(parseSimNao('nao')).toBe(false)
    expect(parseSimNao('')).toBeNull()
    expect(parseSimNao('talvez')).toBeUndefined()
  })

  it('converte data/hora de Cuiabá para UTC e volta à mesma chave', () => {
    const iso = fazendaDataHoraParaIso('2026-10-05', '15:02')
    expect(iso).toBe('2026-10-05T19:02:00.000Z')
    expect(chaveDataHoraFazenda(iso)).toBe('2026-10-05 15:02')
  })
})

describe('parseLinhasClima', () => {
  it('acha o cabeçalho e ignora linhas vazias', () => {
    const r = parseLinhasClima([
      ['Data', 'Hora', 'Responsável', 'Retiro (mm)'],
      ['05/10/2026', '07:30', 'João', 12],
      [],
      [null, null, null, null],
    ])
    expect(r.erro).toBeUndefined()
    expect(r.linhas).toHaveLength(1)
    expect(r.linhas[0].linha).toBe(2)
    expect(r.linhas[0].valores['retiro mm']).toBe(12)
  })

  it('lê o cabeçalho do modelo com asterisco de obrigatório', () => {
    const r = parseLinhasClima([
      ['Data *', 'Hora *', 'Responsável *', 'Tempo atual'],
      ['05/10/2026', '07:30', 'João', 'Sol'],
    ])
    expect(r.erro).toBeUndefined()
    expect(r.linhas[0].valores['data']).toBe('05/10/2026')
    expect(r.linhas[0].valores['responsavel']).toBe('João')
  })

  it('erra quando o cabeçalho não existe', () => {
    expect(parseLinhasClima([['a', 'b'], ['1', '2']]).erro).toMatch(/Cabeçalho não encontrado/)
  })
})

describe('validarLinhasClima', () => {
  const valida = {
    data: '05/10/2026',
    hora: '07:30',
    responsavel: 'João',
    'tempo atual': 'Chuva fraca',
    choveu: 'Sim',
    'esvaziou pluviometros': 'Não',
    'temperatura c': 20,
    'umidade relativa': 80,
    'retiro mm': 12.5,
    'sede mm': '1,5',
    observacao: 'ok',
  }

  it('monta o registro com medições por pluviômetro e local_id determinístico', () => {
    const r = validarLinhasClima([linha(2, valida)], ctx(), AGORA)
    expect(r.errosLinhas).toEqual([])
    expect(r.registros).toHaveLength(1)
    const reg = r.registros[0]
    expect(reg.tempoAtual).toBe('chuva_fraca')
    expect(reg.choveu).toBe(true)
    expect(reg.esvaziouPluviometros).toBe(false)
    expect(reg.localId).toBe('painel-clima-faz-1-2026-10-05T07:30')
    expect(reg.data).toBe('2026-10-05T11:30:00.000Z')
    expect(reg.medicoes.map((m) => [m.pluviometro_nome, m.medicao])).toEqual([
      ['Retiro', 12.5],
      ['Sede', 1.5],
    ])
  })

  it('pula linhas cuja data e hora já existem', () => {
    const r = validarLinhasClima([linha(2, valida)], ctx(['2026-10-05 07:30']), AGORA)
    expect(r.registros).toHaveLength(0)
    expect(r.duplicados).toEqual([{ linha: 2, chave: '2026-10-05 07:30' }])
  })

  it('rejeita repetição de data e hora dentro da própria planilha', () => {
    const r = validarLinhasClima([linha(2, valida), linha(3, valida)], ctx(), AGORA)
    expect(r.registros).toHaveLength(1)
    expect(r.errosLinhas[0]).toEqual({ linha: 3, erros: ['Mesma data e hora da linha 2'] })
  })

  it('valida obrigatórios, listas e limites', () => {
    const r = validarLinhasClima(
      [
        linha(2, { ...valida, data: '', hora: '99:00', responsavel: '', 'tempo atual': 'Granizo', choveu: 'talvez', 'temperatura c': 99, 'umidade relativa': 101, 'retiro mm': -1 }),
      ],
      ctx(),
      AGORA
    )
    expect(r.registros).toHaveLength(0)
    const erros = r.errosLinhas[0].erros.join(' | ')
    expect(erros).toMatch(/Data é obrigatória/)
    expect(erros).toMatch(/Hora inválida/)
    expect(erros).toMatch(/Responsável é obrigatório/)
    expect(erros).toMatch(/Tempo atual inválido/)
    expect(erros).toMatch(/Choveu deve ser Sim ou Não/)
    expect(erros).toMatch(/Temperatura/)
    expect(erros).toMatch(/Umidade/)
    expect(erros).toMatch(/Retiro \(mm\)/)
  })

  it('aceita campos opcionais vazios', () => {
    const r = validarLinhasClima([linha(2, { data: '05/10/2026', hora: '07:30', responsavel: 'João' })], ctx(), AGORA)
    expect(r.errosLinhas).toEqual([])
    expect(r.registros[0]).toMatchObject({ tempoAtual: null, choveu: null, esvaziouPluviometros: null, medicoes: [] })
  })
})


describe('validações preventivas', () => {
  const base = { data: '05/10/2026', hora: '07:30', responsavel: 'joão' }
  const erros = (valores: Record<string, unknown>, c = ctx()) =>
    validarLinhasClima([linha(2, { ...base, ...valores })], c, AGORA).errosLinhas.flatMap((e) => e.erros).join(' | ')

  it('normaliza o responsável para o nome cadastrado e rejeita quem não está na lista', () => {
    const ok = validarLinhasClima([linha(2, base)], ctx(), AGORA)
    expect(ok.registros[0].responsavel).toBe('João')
    expect(erros({ responsavel: 'Zé' })).toMatch(/não está cadastrado em Funcionários/)
  })

  it('aceita responsável livre quando não há funcionários cadastrados', () => {
    const livre: ContextoClima = { ...ctx(), responsaveis: [] }
    expect(validarLinhasClima([linha(2, { ...base, responsavel: 'Zé' })], livre, AGORA).registros).toHaveLength(1)
  })

  it('rejeita data inexistente, futura e hora futura de hoje', () => {
    expect(erros({ data: '31/02/2026' })).toMatch(/não existe no calendário/)
    expect(erros({ data: '14/10/2026' })).toMatch(/Data no futuro/)
    expect(erros({ data: '13/10/2026', hora: '12:01' })).toMatch(/Hora no futuro/)
    expect(erros({ data: '13/10/2026', hora: '11:59' })).toBe('')
    expect(erros({ data: '01/01/1999' })).toMatch(/anterior a 2000/)
  })

  it('aceita hora como fração de dia do Excel e data como serial', () => {
    // 46298 = 2026-10-03 no calendário do Excel
    const r = validarLinhasClima([linha(2, { ...base, data: 46298, hora: 0.3125 })], ctx(), AGORA)
    expect(r.errosLinhas).toEqual([])
    expect(r.registros[0].chave).toBe('2026-10-03 07:30')
  })

  it('protege os mm: máximo, casas decimais e consistência com Choveu', () => {
    expect(erros({ 'retiro mm': 501 })).toMatch(/passa do máximo/)
    expect(erros({ 'retiro mm': 500 })).toBe('')
    expect(erros({ 'retiro mm': 1.234 })).toMatch(/2 casas decimais/)
    expect(erros({ 'retiro mm': 'abc' })).toMatch(/maior ou igual a zero/)
    expect(erros({ choveu: 'Não', 'retiro mm': 3 })).toMatch(/Choveu está como Não/)
    expect(erros({ choveu: 'Não', 'retiro mm': 0 })).toBe('')
  })

  it('limita temperatura a 1 casa e observação a 500 caracteres', () => {
    expect(erros({ 'temperatura c': 20.55 })).toMatch(/1 casa decimal/)
    expect(erros({ observacao: 'x'.repeat(501) })).toMatch(/Observação muito longa/)
  })

  it('aponta colunas (mm) que não são pluviômetros ativos da fazenda', () => {
    const r = validarLinhasClima([linha(2, { ...base, 'antigo mm': 1 })], ctx(), AGORA)
    expect(r.colunasDesconhecidas).toEqual(['antigo mm'])
  })
})

describe('gerarWorkbookModeloClima', () => {
  it('gera cabeçalho com colunas por pluviômetro, listas ocultas e validações', async () => {
    const wb = await gerarWorkbookModeloClima({ pluviometros, responsaveis: ['João', 'Maria Souza'] })
    const ws = wb.getWorksheet('Importação')!
    const colunas = colunasModeloClima(pluviometros)

    expect(colunas.slice(8)).toEqual(['Retiro (mm)', 'Sede (mm)', 'Observação'])
    const esperado = colunas.map((c) => (['Data', 'Hora', 'Responsável'].includes(c) ? `${c} *` : c))
    expect(ws.getRow(1).values as string[]).toEqual([undefined, ...esperado])
    // obrigatórias em vermelho, opcionais em verde
    expect((ws.getCell('A1').fill as any).fgColor.argb).toBe('FFC62828')
    expect((ws.getCell('C1').fill as any).fgColor.argb).toBe('FFC62828')
    expect((ws.getCell('D1').fill as any).fgColor.argb).toBe('FF2E7D32')
    expect(wb.getWorksheet('Instruções')).toBeDefined()
    expect(wb.getWorksheet('Listas')!.state).toBe('hidden')

    const dvs = (ws as any).dataValidations.model as Record<string, any>
    expect(dvs['D2:D501'].formulae).toEqual(['ListaTempo'])
    expect(dvs['E2:E501'].formulae).toEqual(['ListaSimNao'])
    expect(dvs['A2:A501'].type).toBe('custom')
    expect(dvs['I2:I501'].type).toBe('decimal')
    expect(dvs['I2:I501'].formulae).toEqual([0, 500])
    expect(dvs['C2:C501'].formulae).toEqual(['ListaResponsaveis'])
    expect(dvs['B2:B501'].type).toBe('decimal')
    expect(dvs['K2:K501'].type).toBe('textLength')
  })

  it('round-trip: relido pelo exceljs mantém listas e defined names', async () => {
    const wb = await gerarWorkbookModeloClima({ pluviometros, responsaveis: ['João', 'Maria Souza'] })
    const buffer = await wb.xlsx.writeBuffer()
    const wb2 = new ExcelJS.Workbook()
    await wb2.xlsx.load(buffer as ArrayBuffer)
    expect(wb2.getWorksheet('Listas')!.getCell('A2').value).toBe('Sol')
    const nomes = Object.keys((wb2.definedNames as any).matrixMap)
    expect(nomes).toEqual(expect.arrayContaining(['ListaTempo', 'ListaSimNao']))
  })

  it('XML gerado: data com limite dinâmico, hora de 0 a 23:59 e cabeçalho protegido', async () => {
    const wb = await gerarWorkbookModeloClima({ pluviometros, responsaveis: ['João'] })
    const buffer = await wb.xlsx.writeBuffer()
    // jszip é dependência do exceljs (não direta do app): resolve a partir dele
    const JSZip = createRequire(createRequire(import.meta.url).resolve('exceljs'))('jszip')
    const zip = await JSZip.loadAsync(buffer)
    const xml: string = await zip.file('xl/worksheets/sheet1.xml').async('string')
    const styles: string = await zip.file('xl/styles.xml').async('string')

    expect(xml).toMatch(
      /type="custom"[^>]*sqref="A2:A501"[^>]*><formula1>AND\(ISNUMBER\(A2\),A2&gt;=DATE\(2000,1,1\),A2&lt;=TODAY\(\)\+1\)<\/formula1>/
    )
    expect(xml).toMatch(/sqref="B2:B501"[^>]*><formula1>0<\/formula1><formula2>0\.99930/)
    expect(xml).toMatch(/<sheetProtection[^>]*sheet="1"/)
    expect(styles).toMatch(/<protection locked="0"/)
  })
})
