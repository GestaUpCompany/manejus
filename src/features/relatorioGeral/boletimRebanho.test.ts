import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { agruparBoletim, normalizarPlanilhaBoletim } from './boletimRebanho'

const header = ['Descrição', 'Inic.', 'Com.', 'Vend.', 'Mort.', 'Cons.', 'Nasc.', 'Ent.', 'Saí.', 'Evol +', 'Evol -', 'Final', 'Peso Médio (kg)', 'Peso Total (kg)', 'Total UA', 'Valor (kg)', 'Valor Total']
const categories = [
  '0 a 4 meses - Fêmea',
  '0 a 4 meses - Macho',
  '5 a 12 meses - Fêmea',
  '5 a 12 meses - Macho',
  '13 a 24 meses - Fêmea',
  '13 a 24 meses - Macho',
  '25 a 36 meses - Fêmea',
  '25 a 36 meses - Macho',
  'Acima 36 meses - Fêmea',
  'Acima 36 meses - Macho',
]

function bloco(nome: string, final: number) {
  return [['', nome], ['', ...header], ...categories.map((categoria, index) => ['', categoria, index === 0 ? final : 0, '', '', '', '', '', '', '', '', '', index === 0 ? final : 0])]
}

function workbookBytes() {
  const wb = XLSX.utils.book_new()
  const geral = [[''], ...bloco('Consolidado', 42)]
  const julho = [[''], ...bloco('Fazenda Sede', 21)]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(geral), 'GERAL')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(julho), 'Julho')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}

function workbookComLinhasOcultas() {
  const wb = XLSX.utils.book_new()
  const geral = XLSX.utils.aoa_to_sheet([[''], ...bloco('Fazenda Chibata', 10), [''], ...bloco('LC 1', 99), [''], ...bloco('GRUPO AGRO GENTILIN', 30)])
  const julho = XLSX.utils.aoa_to_sheet([[''], ...bloco('Fazenda Chibata', 10), [''], ...bloco('LC 1', 99), [''], ...bloco('GRUPO AGRO GENTILIN', 30)])
  for (const sheet of [geral, julho]) {
    const linhas: XLSX.RowInfo[] = []
    for (let index = 14; index <= 25; index += 1) linhas[index] = { hidden: true }
    sheet['!rows'] = linhas
  }
  XLSX.utils.book_append_sheet(wb, geral, 'GERAL')
  XLSX.utils.book_append_sheet(wb, julho, 'Julho')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}

function workbookComLocalZerado() {
  const wb = XLSX.utils.book_new()
  const geral = [[''], ...bloco('Consolidado', 42)]
  const julho = [[''], ...bloco('Fazenda Sede', 21), [''], ...bloco('0', 0)]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(geral), 'GERAL')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(julho), 'Julho')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}

describe('normalizador do Boletim de Rebanho', () => {
  it('lê consolidado anual, meses e categorias sem depender de posições fixas', () => {
    const resultado = normalizarPlanilhaBoletim(workbookBytes())
    expect(resultado.mesesDisponiveis).toEqual([{ nome: 'Julho', numero: 7 }])
    expect(resultado.registros).toHaveLength(20)
    expect(resultado.registros.find((registro) => registro.mes === 'GERAL' && registro.fazenda === 'Consolidado')?.final).toBe(42)
  })

  it('separa a página geral dos locais do mês escolhido', () => {
    const resultado = normalizarPlanilhaBoletim(workbookBytes())
    const agrupado = agruparBoletim(resultado.registros, 7)
    expect(agrupado.geral).toHaveLength(10)
    expect(agrupado.locais).toHaveLength(1)
    expect(agrupado.locais[0]?.fazenda).toBe('Fazenda Sede')
    expect(agrupado.locais[0]?.registros[0]?.final).toBe(21)
  })

  it('ignora blocos em linhas ocultas e usa o último bloco como consolidado', () => {
    const resultado = normalizarPlanilhaBoletim(workbookComLinhasOcultas())
    expect(resultado.registros.every((registro) => registro.fazenda !== 'LC 1')).toBe(true)
    const agrupado = agruparBoletim(resultado.registros, 7)
    expect(agrupado.geral).toHaveLength(10)
    expect(agrupado.geral[0]?.final).toBe(30)
    expect(agrupado.locais.map((local) => local.fazenda)).toEqual(['Fazenda Chibata'])
    expect(agrupado.locaisGeral.map((local) => local.fazenda)).toEqual(['Fazenda Chibata'])
  })

  it('omite locais com todas as movimentações zeradas', () => {
    const resultado = normalizarPlanilhaBoletim(workbookComLocalZerado())
    const agrupado = agruparBoletim(resultado.registros, 7)
    expect(agrupado.locais.map((local) => local.fazenda)).toEqual(['Fazenda Sede'])
  })

  it('renderiza uma tabela para o consolidado e outra para cada local', async () => {
    const resultado = normalizarPlanilhaBoletim(workbookBytes())
    const agrupado = agruparBoletim(resultado.registros, 7)
    const rendererPath = '../../../api/pdf/boletimRebanho.js'
    const { renderBoletimRebanhoHtml } = await import(rendererPath)
    const html = renderBoletimRebanhoHtml({ ano: 2026, mesReferencia: 'Julho', mesNumero: 7, ...agrupado, fazendaNome: 'Fazenda Teste' })
    expect(html.match(/<section class="page"/g)).toHaveLength(2)
    expect(html).toContain('Consolidado anual')
    expect(html).toContain('Fazenda Sede')
    expect(html).toContain('Saldo final geral')
    expect(html).toContain('Saldo final por local')
    expect(html).toContain('>-</td>')
  })
})
