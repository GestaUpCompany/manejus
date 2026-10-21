import { describe, expect, it } from 'vitest'
import { calcularKpis, resumirFazenda, resumirPorPluviometro, rotuloBarra, serieDiaria, type LeituraClima } from './RelatorioClimaPublico'

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

  it('com um só pluviômetro a faixa colapsa na linha da fazenda', () => {
    const serie = serieDiaria([leitura('a', '2026-10-01', 10), leitura('a', '2026-10-02', 5)])
    expect(serie.map((p) => [p.acum_fazenda, p.acum_min, p.acum_max])).toEqual([
      [10, 10, 10],
      [15, 15, 15],
    ])
  })
})
