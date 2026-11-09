import { describe, expect, it } from 'vitest'
import { RELATORIOS_GERAIS } from './catalogo'
import {
  LIMITE_CHUVA_FORTE_MM,
  LIMITE_CHUVA_TORRENCIAL_MM,
  calcularKpis,
  resumirPorPluviometro,
  serieChuvaDiaria,
  serieChuvaMensal,
  serieDiaria,
  type LeituraClima,
} from '../../pages/public/RelatorioClimaPublico'

const REGISTRY_PATH = '../../../api/pdf/_shared/reportRegistry.js'

// Todo relatório do catálogo do Infográfico precisa ter renderizador no servidor. Sem isso, o item aparece na tela
// de seleção e a geração falha com "Relatório desconhecido ou duplicado".
describe('Infográfico: catálogo e renderizadores', () => {
  it('cada item do catálogo tem renderizador registrado (combustível vira abastecimento + estoque)', async () => {
    const { isReportType } = await import(REGISTRY_PATH)
    for (const item of RELATORIOS_GERAIS) {
      const tipos = item.id === 'combustivel' ? ['abastecimento', 'estoque_combustivel'] : [item.id]
      for (const tipo of tipos) expect(isReportType(tipo), `${item.id} -> ${tipo}`).toBe(true)
    }
  })

  it('clima: omite a seção sem leituras e renderiza a posição com leituras', async () => {
    const { REPORT_REGISTRY } = await import(REGISTRY_PATH)
    const leitura = (pluv: string, data: string, mm: number): LeituraClima => ({
      registro_id: `${pluv}-${data}`, data, horario: null, pluviometro_id: pluv, pluviometro_nome: `Pluv ${pluv}`, pluviometro_localizacao: null,
      medicao_mm: mm, temperatura: null, temperatura_media: null, umidade_relativa: null, responsavel: null, nome_usuario: null, observacao: null,
    })
    const registros = [leitura('a', '2026-11-02', 12), leitura('b', '2026-11-02', 30), leitura('a', '2026-11-05', 8)]
    expect(REPORT_REGISTRY.clima.hasData({ registros: [] })).toBe(false)
    expect(REPORT_REGISTRY.clima.hasData({ registros })).toBe(true)

    const html: string = await REPORT_REGISTRY.clima.render({
      dataInicio: '2026-11-01',
      dataFim: '2026-11-09',
      fazendaNome: 'Fazenda Teste',
      logoGestao: '',
      logoFazenda: '',
      kpis: calcularKpis(registros),
      pluviometros: ['Pluv a', 'Pluv b'],
      serie: serieDiaria(registros),
      diaria: serieChuvaDiaria(registros),
      mensal: serieChuvaMensal(registros),
      limites: { forte: LIMITE_CHUVA_FORTE_MM, torrencial: LIMITE_CHUVA_TORRENCIAL_MM },
      resumo: resumirPorPluviometro(registros),
      registros,
    })
    expect(html).toContain('Pluv a')
    expect(html).toContain('Pluv b')
  })
})
