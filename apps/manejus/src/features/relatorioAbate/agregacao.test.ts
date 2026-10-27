import { describe, expect, it } from 'vitest'
import { diasEntre, montarLoteAbate, resumirLotes, tipoSaida, type CicloVidaRpc, type SaidaLote } from './agregacao'

const HOJE = '2026-10-27'

const saida = (data: string, tipo: 'Abate' | 'Venda', cabecas: number, categoria = 'boi gordo'): SaidaLote => ({
  loteId: 'l1',
  data,
  tipo,
  cabecas,
  categoria,
})

const cicloBase = (ativo: boolean): CicloVidaRpc => ({
  success: true,
  cadastro: { nome: 'Lote 10', ativo, created_at: '2026-03-01T12:00:00Z', sistema_producao: 'Terminação' },
  indicadores_consolidados: { peso_entrada_medio_kg: 300 },
  estado_atual: { peso_medio_ponderado: null, categorias_ativas: [] },
  cronologia_categorias: {
    transicoes: [{ data_transicao: '2026-06-01', categoria_origem: 'boi magro', categoria_destino: 'boi gordo', peso_na_transicao_kg: 420 }],
    categorias_encerradas: [
      { categoria: 'boi magro', quant_inicial: 100, quant_atual: 98, peso_entrada_kg: 300, peso_vivo_atual_kg: 420, data_inicio: '2026-03-01', data_fim: '2026-06-01' },
      { categoria: 'boi gordo', quant_inicial: 98, quant_atual: 0, peso_entrada_kg: 420, peso_vivo_atual_kg: 540, data_inicio: '2026-06-01', data_fim: '2026-09-29' },
    ],
  },
  linha_tempo_ocupacao: [{ pasto_nome: 'Pasto 1', data_entrada: '2026-03-02 08:00', data_saida: '2026-09-28 08:00', cabecas_entrada: 100, cabecas_saida: 98 }],
  historico_nutricional: [{ nome: 'Plano A', formulacao_nome: 'Terminação 1', data_inicio: '2026-06-01', data_fim: null }],
  movimentacoes: [
    { data: '2026-03-01', tipo: 'entrada', lote_origem_nome: null, lote_destino_nome: 'Lote 10', numero_cabecas: 100, categoria: 'boi magro', motivo_movimentacao: 'Entrada', subtipo: 'Compras', fazenda_destino_nome: null },
    { data: '2026-09-29', tipo: 'saida', lote_origem_nome: 'Lote 10', lote_destino_nome: null, numero_cabecas: 98, categoria: 'boi gordo', motivo_movimentacao: 'Saída', subtipo: 'Venda', fazenda_destino_nome: null },
  ],
  mortalidade: {
    total: 2,
    linhas: [
      { data: '2026-04-10', causa_morte: 'Timpanismo' },
      { data: '2026-04-10', causa_morte: 'Timpanismo' },
    ],
  },
  consumo_suplementacao: [
    { data: '2026-07-05', consumo_medio_geral_percent_pv: 2, consumo_medio_geral_kg_ms: 10, custo_medio_reais_cab_dia: 8 },
    { data: '2026-07-20', consumo_medio_geral_percent_pv: 2.2, consumo_medio_geral_kg_ms: 12, custo_medio_reais_cab_dia: 10 },
  ],
})

describe('tipoSaida', () => {
  it('reconhece Abate e Venda e ignora as demais saídas', () => {
    expect(tipoSaida('Abate', null)).toBe('Abate')
    expect(tipoSaida('Saída', 'Venda')).toBe('Venda')
    expect(tipoSaida('Saída', 'Apartação')).toBeNull()
    expect(tipoSaida('Transferencia', 'Saida')).toBeNull()
    expect(tipoSaida('Entrada', 'Venda')).toBeNull()
  })
})

describe('montarLoteAbate', () => {
  it('lote desativado termina na última saída e calcula o ciclo e o GMD', () => {
    const lote = montarLoteAbate('l1', cicloBase(false), [saida('2026-09-29', 'Venda', 98)], HOJE)
    expect(lote.inicio).toBe('2026-03-01')
    expect(lote.fim).toBe('2026-09-29')
    expect(lote.indicadores.diasCiclo).toBe(diasEntre('2026-03-01', '2026-09-29'))
    expect(lote.indicadores.cabecasVenda).toBe(98)
    expect(lote.indicadores.cabecasAbate).toBe(0)
    // 300 kg na entrada, 540 kg na última categoria
    expect(lote.indicadores.pesoFinalKg).toBe(540)
    expect(lote.indicadores.ganhoKgCab).toBe(240)
    expect(lote.indicadores.gmdKgDia).toBeCloseTo(240 / 212, 3)
  })

  it('lote ativo (venda parcial) segue até hoje', () => {
    const lote = montarLoteAbate('l1', cicloBase(true), [saida('2026-09-29', 'Venda', 50)], HOJE)
    expect(lote.fim).toBe(HOJE)
    expect(lote.ultimaSaida).toBe('2026-09-29')
  })

  it('ordena categorias por início e calcula o GMD de cada uma', () => {
    const lote = montarLoteAbate('l1', cicloBase(false), [saida('2026-09-29', 'Venda', 98)], HOJE)
    expect(lote.categorias.map((c) => c.categoria)).toEqual(['boi magro', 'boi gordo'])
    expect(lote.categorias[0].gmdKgDia).toBeCloseTo(120 / 92, 3)
  })

  it('monta a linha do tempo em ordem, com a saída destacada e sem duplicar a venda da RPC', () => {
    const lote = montarLoteAbate('l1', cicloBase(false), [saida('2026-09-29', 'Venda', 98)], HOJE)
    const tipos = lote.eventos.map((e) => e.tipo)
    expect(tipos[0]).toBe('criacao')
    expect(tipos[tipos.length - 1]).toBe('venda')
    expect(tipos.filter((t) => t === 'venda')).toHaveLength(1)
    expect([...lote.eventos].map((e) => e.data)).toEqual([...lote.eventos].map((e) => e.data).sort())
  })

  it('agrupa mortes do mesmo dia e causa em um evento', () => {
    const lote = montarLoteAbate('l1', cicloBase(false), [saida('2026-09-29', 'Venda', 98)], HOJE)
    const mortes = lote.eventos.filter((e) => e.tipo === 'morte')
    expect(mortes).toHaveLength(1)
    expect(mortes[0].titulo).toBe('2 mortes')
    expect(lote.mortesPorCausa).toEqual([{ causa: 'Timpanismo', total: 2 }])
  })

  it('consumo mensal é a média dos registros do mês', () => {
    const lote = montarLoteAbate('l1', cicloBase(false), [saida('2026-09-29', 'Venda', 98)], HOJE)
    expect(lote.consumo).toHaveLength(1)
    expect(lote.consumo[0]).toMatchObject({ mes: '2026-07', registros: 2, custoCabDia: 9, kgMs: 11 })
    expect(lote.indicadores.custoMedioCabDia).toBe(9)
  })

  it('lote desativado ignora eventos posteriores à última saída', () => {
    const ciclo = cicloBase(false)
    ciclo.mortalidade = { total: 1, linhas: [{ data: '2026-10-15', causa_morte: 'Outra' }] }
    const lote = montarLoteAbate('l1', ciclo, [saida('2026-09-29', 'Venda', 98)], HOJE)
    expect(lote.eventos.some((e) => e.tipo === 'morte')).toBe(false)
  })

  it('soma abate e venda separadamente quando o lote tem os dois', () => {
    const lote = montarLoteAbate('l1', cicloBase(false), [saida('2026-09-20', 'Venda', 30), saida('2026-09-29', 'Abate', 68)], HOJE)
    expect(lote.indicadores).toMatchObject({ cabecasVenda: 30, cabecasAbate: 68, cabecasSaidas: 98 })
    expect(lote.ultimaSaida).toBe('2026-09-29')
  })
})

describe('montarLoteAbate: lote desativado já zerado (caso real do Lote 2)', () => {
  // Duas categorias paralelas, sem cabeças restantes, peso de entrada ausente no lote e dieta anterior à criação
  const ciclo = (): CicloVidaRpc => ({
    success: true,
    cadastro: { nome: 'Lote 2', ativo: false, created_at: '2026-08-07T19:34:44Z' },
    estado_atual: {
      peso_medio_ponderado: null,
      categorias_ativas: [
        { categoria: 'boi magro', quant_atual: 0, peso_vivo_atual_kg: 610, peso_entrada_kg: 470 },
        { categoria: 'garrote', quant_atual: 0, peso_vivo_atual_kg: 590, peso_entrada_kg: 370 },
      ],
    },
    historico_nutricional: [{ nome: 'Plano', formulacao_nome: 'ENGORDA 2,2%', data_inicio: '2026-07-16', data_fim: null }],
  })
  const saidas = [saida('2026-10-19', 'Venda', 46, 'boi magro'), saida('2026-10-19', 'Venda', 1, 'garrote')]

  it('termina na última saída e pondera os pesos pelas cabeças que saíram', () => {
    const lote = montarLoteAbate('l1', ciclo(), saidas, HOJE)
    expect(lote.ativo).toBe(false)
    expect(lote.fim).toBe('2026-10-19')
    expect(lote.indicadores.pesoEntradaKg).toBeCloseTo((470 * 46 + 370) / 47, 1)
    expect(lote.indicadores.pesoFinalKg).toBeCloseTo((610 * 46 + 590) / 47, 1)
    expect(lote.indicadores.gmdKgDia).not.toBeNull()
  })

  it('categorias paralelas ficam as duas na lista, ambas encerradas na saída', () => {
    const lote = montarLoteAbate('l1', ciclo(), saidas, HOJE)
    expect(lote.categorias.map((c) => c.categoria).sort()).toEqual(['boi magro', 'garrote'])
    expect(lote.categorias.every((c) => c.fim === '2026-10-19')).toBe(true)
  })

  it('categoria que entrou depois (apartação) começa na data da entrada, não na criação do lote', () => {
    const c = ciclo()
    c.movimentacoes = [
      { data: '2026-08-27', tipo: 'entrada', lote_origem_nome: 'Lote 3', lote_destino_nome: 'Lote 2', numero_cabecas: 1, categoria: 'garrote', motivo_movimentacao: 'Entrada', subtipo: 'Apartação', fazenda_destino_nome: null },
    ]
    const lote = montarLoteAbate('l1', c, saidas, HOJE)
    expect(lote.categorias.find((x) => x.categoria === 'garrote')?.inicio).toBe('2026-08-27')
    expect(lote.categorias.find((x) => x.categoria === 'boi magro')?.inicio).toBe(lote.inicio)
  })

  it('dieta herdada vira evento no dia da criação, com a data original no detalhe', () => {
    const lote = montarLoteAbate('l1', ciclo(), saidas, HOJE)
    const dieta = lote.eventos.find((e) => e.tipo === 'dieta')
    expect(dieta?.data).toBe(lote.inicio)
    expect(dieta?.detalhe).toBe('em uso desde 16/07/2026')
    expect(lote.dietas[0].inicio).toBe('2026-07-16')
  })
})

describe('históricos extras: peso, ocupação, dieta e consumo do confinamento', () => {
  const extras = {
    pesagens: [
      { data: '2026-04-15', categoria: 'boi magro', pesoMedioKg: 345, animais: 99 },
      { data: '2026-05-20', categoria: 'Boi Magro', pesoMedioKg: 398, animais: 98 },
    ],
    locais: [
      { tipo: 'Curral' as const, local: 'Curral 4', entrada: '2026-06-02', saida: '2026-07-01', cabecasEntrada: 98, cabecasSaida: 98, pesoEntradaKg: 420, pesoSaidaKg: 470 },
      { tipo: 'Módulo' as const, local: 'Módulo Norte', entrada: '2026-07-01', saida: null, cabecasEntrada: 98, cabecasSaida: null, pesoEntradaKg: 470, pesoSaidaKg: null },
    ],
    versoesDieta: [
      { dieta: 'Terminação 1', versao: 1, inicio: '2026-06-01', fim: '2026-08-01', origem: 'Registro inicial', motivo: null, insumos: ['Milho'] },
      { dieta: 'Terminação 1', versao: 2, inicio: '2026-08-01', fim: null, origem: 'Alteração de insumo', motivo: 'Preço do milho', insumos: ['Milho', 'Ureia'] },
    ],
    consumoConfinamento: [
      { data: '2026-07-01', kgOfertadoMn: 1000, kgConsumidoMn: 950, kgMsCabDia: 10, percentPv: 2, custoCabDia: 10, diaIncompleto: false },
      { data: '2026-07-02', kgOfertadoMn: 1000, kgConsumidoMn: 900, kgMsCabDia: 12, percentPv: 2.2, custoCabDia: 12, diaIncompleto: false },
      { data: '2026-07-03', kgOfertadoMn: 500, kgConsumidoMn: 400, kgMsCabDia: 2, percentPv: 0.4, custoCabDia: 2, diaIncompleto: true },
    ],
  }
  const lote = () => montarLoteAbate('l1', cicloBase(false), [saida('2026-09-29', 'Venda', 98)], HOJE, extras)

  it('evolução do peso junta entrada, pesagens (categoria sem diferenciar caixa) e saída, com GMD de cada trecho', () => {
    const serie = lote().evolucaoPeso.find((s) => s.categoria === 'boi magro')!
    expect(serie.pontos.map((p) => p.origem)).toEqual(['Entrada', 'Pesagem', 'Pesagem', 'Saída'])
    expect(serie.pontos[1]).toMatchObject({ pesoKg: 345, dias: 45, gmdPeriodo: 1 })
    expect(serie.pontos[2].gmdPeriodo).toBeCloseTo((398 - 345) / 35, 3)
    expect(serie.pontos[3].gmdAcumulado).toBeCloseTo(120 / 92, 3)
    expect(lote().indicadores.totalPesagens).toBe(197)
  })

  it('ocupação reúne pasto, curral e módulo em ordem de entrada', () => {
    const ocupacao = lote().ocupacao
    // o ciclo base já traz o Pasto 1 (03/2026); curral e módulo vêm dos extras
    expect(ocupacao.map((o) => o.tipo)).toEqual(['Pasto', 'Curral', 'Módulo'])
    expect(ocupacao[2]).toMatchObject({ local: 'Módulo Norte', saida: null, dias: diasEntre('2026-07-01', '2026-09-29') })
  })

  it('cada versão da dieta vira evento e substitui os eventos dos planos', () => {
    const eventos = lote().eventos.filter((e) => e.tipo === 'dieta')
    expect(eventos.map((e) => e.titulo)).toEqual(['Dieta · Terminação 1 · versão 1', 'Dieta · Terminação 1 · versão 2'])
    expect(eventos[1].detalhe).toBe('Preço do milho')
  })

  it('consumo do confinamento: dia incompleto fica fora das médias, mas entra nos totais', () => {
    const conf = lote().consumo.find((c) => c.origem === 'Confinamento')!
    expect(conf).toMatchObject({ mes: '2026-07', registros: 3, kgMs: 11, percentPv: 2.1, custoCabDia: 11, kgOfertadoMn: 2500, kgConsumidoMn: 2250 })
  })

  it('sem nenhuma pesagem, o gráfico usa só entrada e saída das categorias', () => {
    const sem = montarLoteAbate('l1', cicloBase(false), [saida('2026-09-29', 'Venda', 98)], HOJE)
    expect(sem.evolucaoPeso.every((s) => s.pontos.every((p) => p.origem !== 'Pesagem'))).toBe(true)
    expect(sem.evolucaoPeso).toHaveLength(2)
  })
})

describe('resumirLotes', () => {
  it('totaliza cabeças e tira o ciclo médio', () => {
    const a = montarLoteAbate('l1', cicloBase(false), [saida('2026-09-29', 'Abate', 98)], HOJE)
    const b = montarLoteAbate('l2', cicloBase(false), [saida('2026-08-01', 'Venda', 20)], HOJE)
    const r = resumirLotes([a, b])
    expect(r).toMatchObject({ lotes: 2, cabecasSaidas: 118, cabecasAbate: 98, cabecasVenda: 20 })
    expect(r.cicloMedioDias).toBe(Math.round((a.indicadores.diasCiclo + b.indicadores.diasCiclo) / 2))
  })

  it('sem lotes não inventa ciclo médio', () => {
    expect(resumirLotes([]).cicloMedioDias).toBeNull()
  })
})
