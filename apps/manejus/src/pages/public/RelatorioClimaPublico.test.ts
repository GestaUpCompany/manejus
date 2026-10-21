import { describe, expect, it } from 'vitest'
import {
  LIMITE_CHUVA_FORTE_MM,
  LIMITE_CHUVA_TORRENCIAL_MM,
  calcularKpis,
  montarCalendario,
  nivelDaChuva,
  resumirEventosChuva,
  serieChuvaMensal,
  resumirFazenda,
  resumirPorPluviometro,
  rotuloBarra,
  serieChuvaDiaria,
  serieDiaria,
  type LeituraClima,
} from './RelatorioClimaPublico'

function leitura(pluv: string, data: string, mm: number | null): LeituraClima {
  return {
    registro_id: `${pluv}-${data}-${mm}`,
    data,
    horario: null,
    pluviometro_id: pluv,
    pluviometro_nome: `Pluv ${pluv}`,
    pluviometro_localizacao: null,
    medicao_mm: mm,
    temperatura: null,
    temperatura_media: null,
    umidade_relativa: null,
    responsavel: null,
    nome_usuario: null,
    observacao: null,
  }
}

describe('relatório de clima: visão geral = média dos pluviômetros', () => {
  const registros = [leitura('a', '2026-10-01', 10), leitura('b', '2026-10-01', 20), leitura('c', '2026-10-02', 30)]

  it('chuva acumulada da fazenda é a média das acumuladas, não a soma', () => {
    const kpis = calcularKpis(registros)
    expect(kpis.mm_total).toBe(20)
    expect(kpis.n_pluviometros).toBe(3)
  })

  it('soma várias leituras do mesmo pluviômetro antes de tirar a média', () => {
    const kpis = calcularKpis([leitura('a', '2026-10-01', 10), leitura('a', '2026-10-02', 10), leitura('b', '2026-10-01', 20)])
    expect(kpis.mm_total).toBe(20)
  })

  it('filtro de um pluviômetro devolve o acumulado dele', () => {
    expect(calcularKpis([leitura('b', '2026-10-01', 20)]).mm_total).toBe(20)
  })

  it('sem leituras, acumulado é 0', () => {
    expect(calcularKpis([]).mm_total).toBe(0)
  })

  it('resumo por pluviômetro continua com o acumulado de cada região e a linha da fazenda é a média', () => {
    const resumo = resumirPorPluviometro(registros)
    expect(resumo.map((r) => r.mm_total)).toEqual([30, 20, 10])
    const fazenda = resumirFazenda(resumo)
    expect(fazenda.mm_total).toBe(20)
    expect(fazenda.n_pluviometros).toBe(3)
    expect(fazenda.n_medicoes).toBe(3)
    expect(fazenda.maior_leitura).toBe(30)
  })

  it('evolução do acumulado: média, menor e maior região por data, terminando no KPI', () => {
    const serie = serieDiaria(registros)
    expect(serie.map((p) => p.data)).toEqual(['2026-10-01', '2026-10-02'])
    // 01/10: a=10, b=20, c ainda 0 (entra no denominador)
    expect(serie[0]).toMatchObject({ acum_fazenda: 10, acum_min: 0, acum_max: 20 })
    // 02/10: a=10, b=20, c=30
    expect(serie[1]).toMatchObject({ acum_fazenda: 20, acum_min: 10, acum_max: 30 })
    expect(serie[serie.length - 1].acum_fazenda).toBe(calcularKpis(registros).mm_total)
  })

  it('evolução acumula leituras repetidas e carrega o valor nos dias sem leitura do pluviômetro', () => {
    const serie = serieDiaria([
      leitura('a', '2026-10-01', 10),
      leitura('a', '2026-10-01', 5),
      leitura('b', '2026-10-02', 20),
    ])
    expect(serie[0]).toMatchObject({ acum_fazenda: 7.5, acum_min: 0, acum_max: 15 })
    expect(serie[1]).toMatchObject({ acum_fazenda: 17.5, acum_min: 15, acum_max: 20 })
  })

  it('rótulo da barra traz símbolo e sinal da diferença para a média (não depende de cor)', () => {
    expect(rotuloBarra(279, 240.3, true)).toBe('279,0 mm  ▲ +38,7')
    expect(rotuloBarra(204, 240.3, true)).toBe('204,0 mm  ▼ -36,3')
    expect(rotuloBarra(240.3, 240.3, true)).toBe('240,3 mm  = média')
    expect(rotuloBarra(50, 50, false)).toBe('50,0 mm')
  })

  it('distribuição diária: barra é a média da fazenda e o marcador a maior região, classificada por intensidade', () => {
    // 3 pluviômetros no período; em 01/10 só a e b leram (a=10, b=60), em 02/10 só c leu (30)
    const diaria = serieChuvaDiaria([leitura('a', '2026-10-01', 10), leitura('b', '2026-10-01', 60), leitura('c', '2026-10-02', 30)])
    expect(diaria).toHaveLength(2)
    // média = soma do dia / 3 pluviômetros do período: a média esconde a chuva localizada, o marcador mostra
    expect(diaria[0]).toMatchObject({ data: '2026-10-01', mm_fazenda: 23.33, mm_max_regiao: 60, regiao_max: 'Pluv b', nivel: 'torrencial' })
    expect(diaria[1]).toMatchObject({ mm_fazenda: 10, mm_max_regiao: 30, nivel: 'forte' })
  })

  it('distribuição diária soma leituras do mesmo pluviômetro no dia antes de classificar', () => {
    const diaria = serieChuvaDiaria([leitura('a', '2026-10-01', 20), leitura('a', '2026-10-01', 10)])
    expect(diaria[0]).toMatchObject({ mm_max_regiao: 30, nivel: 'forte' })
  })

  it('limites de intensidade: 25 mm é forte, 50 mm é torrencial, abaixo disso é normal', () => {
    expect(nivelDaChuva(24.9)).toBe('normal')
    expect(nivelDaChuva(LIMITE_CHUVA_FORTE_MM)).toBe('forte')
    expect(nivelDaChuva(49.9)).toBe('forte')
    expect(nivelDaChuva(LIMITE_CHUVA_TORRENCIAL_MM)).toBe('torrencial')
  })

  it('resume os eventos do período: dias fortes, dias torrenciais e a maior chuva', () => {
    const diaria = serieChuvaDiaria([
      leitura('a', '2026-10-01', 5), leitura('a', '2026-10-02', 30), leitura('b', '2026-10-03', 90), leitura('a', '2026-10-04', 55),
    ])
    expect(resumirEventosChuva(diaria)).toEqual({ dias_forte: 1, dias_torrencial: 2, maior: { mm: 90, regiao: 'Pluv b', data: '2026-10-03' } })
    expect(resumirEventosChuva([])).toEqual({ dias_forte: 0, dias_torrencial: 0, maior: null })
  })

  it('chuva por mês: média da fazenda, meses sem leitura zerados e soma igual ao acumulado do KPI', () => {
    // 2 pluviômetros; leituras em jan e mar, nenhuma em fev
    const regs = [leitura('a', '2026-01-10', 40), leitura('b', '2026-01-10', 20), leitura('a', '2026-03-05', 10)]
    const mensal = serieChuvaMensal(regs)
    expect(mensal.map((p) => p.mes)).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(mensal.map((p) => p.mes_label)).toEqual(['jan/26', 'fev/26', 'mar/26'])
    expect(mensal[0]).toMatchObject({ mm_fazenda: 30, mm_min: 20, mm_max: 40 })
    expect(mensal[1]).toMatchObject({ mm_fazenda: 0, mm_min: 0, mm_max: 0 })
    expect(mensal[2]).toMatchObject({ mm_fazenda: 5, mm_min: 0, mm_max: 10 })
    expect(mensal.reduce((s, p) => s + p.mm_fazenda, 0)).toBe(calcularKpis(regs).mm_total)
    expect(serieChuvaMensal([])).toEqual([])
  })

  it('chuva por mês atravessa a virada do ano sem pular mês', () => {
    const mensal = serieChuvaMensal([leitura('a', '2025-11-20', 5), leitura('a', '2026-02-02', 5)])
    expect(mensal.map((p) => p.mes)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })

  it('calendário: um mês por bloco, semanas de domingo a sábado e dias com e sem leitura', () => {
    // 01/10/2026 é quinta-feira; outubro tem 31 dias
    const diaria = serieChuvaDiaria([leitura('a', '2026-10-04', 60), leitura('a', '2026-10-15', 30)])
    const { meses, omitidos } = montarCalendario(diaria)
    expect(omitidos).toBe(0)
    expect(meses).toHaveLength(1)
    expect(meses[0].titulo).toBe('Outubro de 2026')
    const semanas = meses[0].semanas
    expect(semanas.every((s) => s.length === 7)).toBe(true)
    // quinta-feira é o índice 4: dom, seg, ter e qua ficam vazios antes do dia 1
    expect(semanas[0].slice(0, 4)).toEqual([null, null, null, null])
    expect(semanas[0][4]?.dia).toBe(1)
    const dias = semanas.flat().filter((c) => c !== null)
    expect(dias).toHaveLength(31)
    expect(dias.find((c) => c!.dia === 4)?.ponto?.nivel).toBe('torrencial')
    expect(dias.find((c) => c!.dia === 15)?.ponto?.nivel).toBe('forte')
    expect(dias.find((c) => c!.dia === 5)?.ponto).toBeNull() // sem leitura
  })

  it('calendário cobre os meses entre a primeira e a última leitura e limita aos mais recentes', () => {
    const diaria = serieChuvaDiaria([leitura('a', '2026-01-10', 5), leitura('a', '2026-05-10', 5)])
    expect(montarCalendario(diaria).meses.map((m) => m.chave)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05'])
    const limitado = montarCalendario(diaria, 2)
    expect(limitado.meses.map((m) => m.chave)).toEqual(['2026-04', '2026-05'])
    expect(limitado.omitidos).toBe(3)
    expect(montarCalendario([])).toEqual({ meses: [], omitidos: 0 })
  })

  it('com um só pluviômetro a faixa colapsa na linha da fazenda', () => {
    const serie = serieDiaria([leitura('a', '2026-10-01', 10), leitura('a', '2026-10-02', 5)])
    expect(serie.map((p) => [p.acum_fazenda, p.acum_min, p.acum_max])).toEqual([
      [10, 10, 10],
      [15, 15, 15],
    ])
  })
})
