import { describe, expect, it } from 'vitest'
import { SECOES_ANUAIS } from './catalogo'
import exemploJson from '../../../scripts/fixtures/infografico-anual-exemplo.json'

const REGISTRY_PATH = '../../../api/pdf/_shared/anualRegistry.js'
const COMPOSER_PATH = '../../../api/pdf/_shared/reportComposer.js'
const SECOES_PATH = '../../../api/pdf/_relatorios/anual/secoes.js'
const HANDLER_PATH ='../../../api/pdf/_relatorios/anual.js'

// Retorno real das RPCs get_infografico_anual_* na fazenda de testes (2026, até novembro).
const exemplo = exemploJson as Record<string, any>
const marca = { fazendaNome: 'Fazenda Teste', logoGestao: '', logoFazenda: '' }

async function registry() {
  return (await import(REGISTRY_PATH)).ANUAL_REGISTRY as Record<string, { title: string; rpc: string; render: (d: unknown) => Promise<string>; hasData: (d: unknown) => boolean }>
}

describe('Infográfico Anual', () => {
  it('o catálogo do front e o registry do servidor têm as mesmas seções', async () => {
    expect(Object.keys(await registry()).sort()).toEqual([...SECOES_ANUAIS].sort())
  })

  it('toda seção do anual tem cartão na página "O Ano em Números"', async () => {
    const { RESUMOS } = await import(SECOES_PATH)
    expect(Object.keys(RESUMOS).sort()).toEqual([...SECOES_ANUAIS].sort())
  })

  it('Cantina mostra as refeições e o Estoque mostra produção e origem do consumo', async () => {
    const reg = await registry()
    const cantina = await reg.cantina.render({ ...exemplo.cantina, __marca: marca })
    expect(cantina).toContain('Refeições servidas')
    expect(cantina).toContain('Custo por refeição')
    expect(cantina).toContain('832')
    const estoque = await reg.estoque.render({ ...exemplo.estoque, __marca: marca })
    expect(estoque).toContain('Consumo por origem')
    expect(estoque).toContain('Produção de formulações')
    expect(estoque).toContain('Insumos × formulações')
  })

  it('cada seção chama a RPC anual própria', async () => {
    const reg = await registry()
    for (const secao of SECOES_ANUAIS) expect(reg[secao].rpc).toBe(`get_infografico_anual_${secao}`)
  })

  it('renderiza as seções sem dado diário: só meses e totais', async () => {
    const reg = await registry()
    for (const secao of SECOES_ANUAIS) {
      const dados = { ...exemplo[secao], __marca: marca }
      expect(reg[secao].hasData(dados)).toBe(true)
      const html = await reg[secao].render(dados)
      expect(html).toContain(reg[secao].title)
      expect(html).toContain('Jan–Nov 2026')
      // Nenhuma data dd/mm/aaaa no corpo além do rodapé do período.
      const datas = (html.match(/\b\d{2}\/\d{2}\/\d{4}\b/g) ?? []).filter((d) => d !== '01/01/2026' && !d.endsWith('/2026'))
      expect(datas).toEqual([])
      expect(html).not.toMatch(/\b\d{2}\/(0[1-9]|1[0-2])\b(?!\/)/)
    }
  })

  it('avisa quando o rebanho da taxa de mortalidade é estimado', async () => {
    const reg = await registry()
    const html = await reg.morte.render({ ...exemplo.morte, __marca: marca })
    expect(html).toContain('Rebanho estimado em 11 de 11 meses')
    expect(html).toContain('Rebanho (estimado)')
    const real = await reg.morte.render({ ...exemplo.morte, kpis: { ...exemplo.morte.kpis, rebanho_estimado: false }, __marca: marca })
    expect(real).not.toContain('Rebanho estimado em')
  })

  it('omite seção sem dados e usa o título anual na capa', async () => {
    const reg = await registry()
    const { composeReportParts } = await import(COMPOSER_PATH)
    const vazio = { ano: 2025, ultimo_mes: 12, kpis: { rodeios: 0 }, mensal: [], __marca: marca }
    expect(reg.rodeio.hasData(vazio)).toBe(false)
    const parts = await composeReportParts({
      reports: [{ tipo: 'rodeio', dados: vazio }, { tipo: 'clima', dados: { ...exemplo.clima, __marca: marca } }],
      registry: reg,
      titulo: 'Infográfico Anual',
      cover: { ...marca, logoEmpresa: '', imagemCapa: '', periodoLabel: 'Ano de 2026' },
    })
    expect(parts.map((p: { id: string }) => p.id)).toEqual(['capa', 'Clima', 'encerramento'])
    // Com uma seção só não há página de abertura (montarReportsAnuais filtra pelo hasData do resumo).
    expect(parts[0].html({ offset: 0, total: 5 })).toContain('Infográfico Anual')
    expect(parts[2].html({ offset: 4, total: 5 })).toContain("Gesta'Up · Infográfico Anual")
  })

  it('abre com O Ano em Números e o calendário quando há mais de uma seção', async () => {
    const mod = await import(REGISTRY_PATH)
    const reports = mod.montarReportsAnuais(SECOES_ANUAIS.map((s) => ({ secao: s, data: exemplo[s] })), marca)
    expect(reports[0].tipo).toBe('resumo')
    const html = await mod.REGISTRY_COMPOSICAO.resumo.render(reports[0].dados)
    expect(html).toContain('O Ano em Números')
    expect(html).toContain('Calendário do ano')
    expect(html).toContain('2/11 meses')
    const umaSo = mod.montarReportsAnuais([{ secao: 'clima', data: exemplo.clima }], marca)
    expect(mod.REGISTRY_COMPOSICAO.resumo.hasData(umaSo[0].dados)).toBe(false)
  })

  it('consumo usa os valores ponderados por cabeças × dias e a média de cada manejo no ano', async () => {
    const reg = await registry()
    const html = await reg.consumo.render({ ...exemplo.consumo, __marca: marca })
    expect(html).toContain('R$ 16.838,41')
    expect(html).toContain('6,59 kg')
    // Coluna Ano da linha de confinamento = média ponderada do confinamento (9,47), não a geral (6,59).
    const linhaConf = html.split('<tr>').find((tr) => tr.includes('kg MS/cab/dia · confinamento')) ?? ''
    expect(linhaConf).toMatch(/class="rg-ano"[^>]*>9,47</)
    expect(html).not.toContain('cada lote-dia pesa igual')
  })

  it('calendário conta registros e não trata mês sem morte como falta de lançamento', async () => {
    const mod = await import(REGISTRY_PATH)
    const reports = mod.montarReportsAnuais(SECOES_ANUAIS.map((s) => ({ secao: s, data: exemplo[s] })), marca)
    const html = await mod.REGISTRY_COMPOSICAO.resumo.render(reports[0].dados)
    expect(html).toContain('Clima · leituras')
    expect(html).toContain('Clima 7')
    expect(html).not.toMatch(/Meses sem registro[^<]*Mortalidade/)
  })

  it('rótulo da capa segue o período', async () => {
    const { rotuloPeriodoCapa } = await import(HANDLER_PATH)
    expect(rotuloPeriodoCapa(2026, 11)).toBe('Janeiro a Novembro de 2026')
    expect(rotuloPeriodoCapa(2025, 12)).toBe('Janeiro a Dezembro de 2025')
  })

  it('valida o corpo da requisição', async () => {
    const { validarBodyAnual } = await import(HANDLER_PATH)
    const ok = { fazendaId: 'f1', fazendaNome: 'F', ano: 2026, secoes: ['clima', 'morte'] }
    expect(validarBodyAnual(ok, 2026)).toBeNull()
    expect(validarBodyAnual({ ...ok, ano: 2027 }, 2026)).toMatch(/Ano inválido/)
    expect(validarBodyAnual({ ...ok, ano: 2019 }, 2026)).toMatch(/Ano inválido/)
    expect(validarBodyAnual({ ...ok, ano: '2026' }, 2026)).toMatch(/Ano inválido/)
    expect(validarBodyAnual({ ...ok, secoes: [] }, 2026)).toMatch(/ao menos uma/)
    expect(validarBodyAnual({ ...ok, secoes: ['clima', 'clima'] }, 2026)).toMatch(/duplicada/)
    expect(validarBodyAnual({ ...ok, secoes: ['boletim_rebanho'] }, 2026)).toMatch(/desconhecida/)
    expect(validarBodyAnual({ ...ok, imagemCapaPath: 'outra/capas/x.webp' }, 2026)).toMatch(/capa/)
  })
})
