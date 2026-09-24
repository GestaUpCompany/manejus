import { supabase } from './supabaseClient'
import { SISTEMA_POR_TIPO, type TipoProgramacao } from './programacaoTratosService'
import { getDayBoundsInTimezone, toFarmDateOnly } from '../utils/formatDate'

export interface LancamentoTratoLinha {
  curralId: string
  curralNome: string
  linhaNome: string | null
  loteId: string | null
  loteNome: string
  dietaNome: string | null
  quantidadeCabecas: number | null
  pesoVivoKg: number | null
  categorias: string
  tratoAnteriorKg: number | null
  leituraDia: number | null
  ajusteLeituraPct: number | null
  kgBaseDia: number | null
  consumoKgCabDia: number | null
  quantidadeTratos: number
  tratos: LancamentoTrato[]
}

export interface LancamentoTrato {
  ordemTrato: number
  percentual: number
  horarioSugerido: string | null
  kgPlanejado: number | null
  kgReal: number | null
  registroId: string | null
}

export interface LancamentoTratosData {
  fazendaId: string
  data: string
  tipo: TipoProgramacao
  programacaoId: string
  linhas: LancamentoTratoLinha[]
}

interface RegistroOferta {
  id: string
  curral_id: string | null
  lote_id: string | null
  data: string
  ordem_trato: number
  kg_planejado: number | null
  kg_ofertado_real: number | null
}

interface LeituraCocho {
  lote_id: string | null
  data: string
  leitura_cocho: number | null
  nota_config_id: string | null
}

function numero(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function agruparAnterioresPorCurral(registros: RegistroOferta[]): Map<string, RegistroOferta[]> {
  const porCurral = new Map<string, RegistroOferta[]>()
  for (const registro of registros) {
    if (!registro.curral_id || registro.kg_ofertado_real == null) continue
    const lista = porCurral.get(registro.curral_id) || []
    lista.push(registro)
    porCurral.set(registro.curral_id, lista)
  }
  return porCurral
}

/**
 * Total real do último dia com registros dentro da ocupação atual (desde a
 * data de entrada). Registros de ocupações anteriores do mesmo curral não
 * contam: lote novo = dia 1, conforme semântica de feed target por ocupação.
 */
function totalUltimoDiaDaOcupacao(registros: RegistroOferta[], desdeData: string): number | null {
  const elegiveis = registros.filter(
    (registro) => (toFarmDateOnly(registro.data) || registro.data.slice(0, 10)) >= desdeData
  )
  if (elegiveis.length === 0) return null
  const diaMaisRecente = elegiveis
    .map((registro) => toFarmDateOnly(registro.data) || registro.data.slice(0, 10))
    .sort((a, b) => b.localeCompare(a))[0]
  return elegiveis
    .filter((registro) => (toFarmDateOnly(registro.data) || registro.data.slice(0, 10)) === diaMaisRecente)
    .reduce((sum, registro) => sum + (Number(registro.kg_ofertado_real) || 0), 0)
}

function ultimaLeituraPorLote(leituras: LeituraCocho[], data: string): Map<string, LeituraCocho> {
  const resultado = new Map<string, LeituraCocho>()
  for (const leitura of leituras) {
    const dia = toFarmDateOnly(leitura.data) || leitura.data.slice(0, 10)
    if (!leitura.lote_id || dia > data || resultado.has(leitura.lote_id)) continue
    resultado.set(leitura.lote_id, leitura)
  }
  return resultado
}

export function calcularTratosDoDia(params: {
  quantidadeTratos: number
  percentuais: { ordem_trato: number; percentual: number; horario_sugerido: string | null }[]
  kgMnDia: number | null
  totalRealDiaAnterior: number | null
  leituraDia: number | null
  ajusteLeituraPct: number | null
  registrosDoDia: RegistroOferta[]
  programacaoId: string
}): { kgBaseDia: number | null; tratos: LancamentoTrato[] } {
  const registrosPorOrdem = new Map(params.registrosDoDia.map((registro) => [registro.ordem_trato, registro]))
  const kgBaseDia = params.totalRealDiaAnterior == null || params.totalRealDiaAnterior <= 0
    ? params.kgMnDia
    : params.totalRealDiaAnterior * (1 + (params.ajusteLeituraPct || 0) / 100)

  const tratos: LancamentoTrato[] = []
  let totalRealAnteriorNoDia = 0
  for (let ordem = 1; ordem <= params.quantidadeTratos; ordem += 1) {
    const percentual = Number(params.percentuais.find((item) => item.ordem_trato === ordem)?.percentual || 0)
    const percentualInfo = params.percentuais.find((item) => item.ordem_trato === ordem)
    const registro = registrosPorOrdem.get(ordem)
    let kgPlanejado = kgBaseDia != null && kgBaseDia > 0 ? kgBaseDia * percentual / 100 : null

    if (ordem === params.quantidadeTratos && params.totalRealDiaAnterior != null && params.registrosDoDia.length > 0 && kgBaseDia !== null) {
      kgPlanejado = Math.max(0, kgBaseDia - totalRealAnteriorNoDia)
    }

    totalRealAnteriorNoDia += registro?.kg_ofertado_real != null ? Number(registro.kg_ofertado_real) || 0 : 0
    tratos.push({
      ordemTrato: ordem,
      percentual,
      horarioSugerido: percentualInfo?.horario_sugerido || null,
      kgPlanejado,
      kgReal: registro?.kg_ofertado_real == null ? null : Number(registro.kg_ofertado_real),
      registroId: registro?.id || null,
    })
  }

  return { kgBaseDia, tratos }
}

export async function carregarLancamentoTratos(
  fazendaId: string,
  data: string,
  tipo: TipoProgramacao
): Promise<LancamentoTratosData | null> {
  const programacaoResult = await supabase
    .from('programacao_tratos')
    .select('id, quantidade_tratos, data_inicio, data_fim')
    .eq('fazenda_id', fazendaId)
    .eq('ativo', true)
    .eq('tipo', tipo)
    .lte('data_inicio', data)
    .gte('data_fim', data)
    .order('data_inicio', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (programacaoResult.error) throw programacaoResult.error
  if (!programacaoResult.data) return null

  const programacao = programacaoResult.data as { id: string; quantidade_tratos: number }
  const [percentuaisResult, ocupacoesResult] = await Promise.all([
    supabase
      .from('programacao_tratos_percentuais')
      .select('ordem_trato, percentual, horario_sugerido')
      .eq('programacao_id', programacao.id)
      .order('ordem_trato'),
    supabase
      .from('lote_curral_historico')
      .select('id, curral_id, lote_id, data_inicial, kg_mn_dia_dia1, lotes(id, nome, sistema_producao)')
      .eq('fazenda_id', fazendaId)
      .lte('data_inicial', data)
      .or(`data_final.is.null,data_final.gte.${data}`),
  ])
  if (percentuaisResult.error) throw percentuaisResult.error
  if (ocupacoesResult.error) throw ocupacoesResult.error

  // Participação vem da ocupação do curral na data, não do cronograma:
  // para cada curral, a ocupação de maior data_inicial que cobre a data.
  const ocupacaoPorCurral = new Map<string, any>()
  for (const o of (ocupacoesResult.data || []) as any[]) {
    const atual = ocupacaoPorCurral.get(o.curral_id)
    if (!atual || o.data_inicial > atual.data_inicial) {
      ocupacaoPorCurral.set(o.curral_id, o)
    }
  }
  const ocupacoes = [...ocupacaoPorCurral.values()].filter(
    (o) => o.lotes?.sistema_producao === SISTEMA_POR_TIPO[tipo]
  )
  if (ocupacoes.length === 0) {
    return { fazendaId, data, tipo, programacaoId: programacao.id, linhas: [] }
  }

  const curralIds = ocupacoes.map((o) => o.curral_id)
  const curraisResult2 = await supabase
    .from('currais')
    .select('id, nome, linha_id')
    .in('id', curralIds)
  if (curraisResult2.error) throw curraisResult2.error

  const loteIds = ocupacoes.map((o) => o.lote_id).filter(Boolean)
  const boundsDia = getDayBoundsInTimezone(data)
  const [categoriasResult, planosResult, leiturasResult, registrosDiaResult, registrosAnterioresResult] = await Promise.all([
    loteIds.length > 0
      ? supabase.from('lote_categorias').select('lote_id, categoria, quant_atual, peso_vivo_atual_kg_cab').in('lote_id', loteIds).eq('ativo', true).is('data_fim', null)
      : Promise.resolve({ data: [], error: null } as any),
    loteIds.length > 0
      ? supabase.from('planos_nutricionais').select('lote_id, formulacao_id, formulacoes(nome)').in('lote_id', loteIds).eq('ativo', true).is('data_fim', null)
      : Promise.resolve({ data: [], error: null } as any),
    loteIds.length > 0
      ? supabase.from('registros_leitura_cocho').select('lote_id, data, leitura_cocho, nota_config_id').eq('fazenda_id', fazendaId).in('lote_id', loteIds).is('deleted_at', null).order('data', { ascending: false })
      : Promise.resolve({ data: [], error: null } as any),
    supabase.from('registros_oferta_trato').select('id, curral_id, lote_id, data, ordem_trato, kg_planejado, kg_ofertado_real').eq('fazenda_id', fazendaId).is('deleted_at', null).gte('data', boundsDia.start).lt('data', boundsDia.end).order('ordem_trato'),
    supabase.from('registros_oferta_trato').select('id, curral_id, lote_id, data, ordem_trato, kg_planejado, kg_ofertado_real').eq('fazenda_id', fazendaId).is('deleted_at', null).lt('data', boundsDia.start).order('data', { ascending: false }),
  ])
  for (const result of [categoriasResult, planosResult, leiturasResult, registrosDiaResult, registrosAnterioresResult]) {
    if (result.error) throw result.error
  }

  const currais = new Map((curraisResult2.data || []).map((curral: any) => [curral.id, curral]))
  const categoriasPorLote = new Map<string, any[]>()
  for (const categoria of (categoriasResult.data || []) as any[]) {
    const lista = categoriasPorLote.get(categoria.lote_id) || []
    lista.push(categoria)
    categoriasPorLote.set(categoria.lote_id, lista)
  }
  const planosPorLote = new Map<string, string>()
  for (const plano of (planosResult.data || []) as any[]) {
    if (plano.lote_id && !planosPorLote.has(plano.lote_id)) planosPorLote.set(plano.lote_id, plano.formulacoes?.nome || null)
  }
  const leituras = ultimaLeituraPorLote((leiturasResult.data || []) as LeituraCocho[], data)
  const ajustesResult = await supabase.from('notas_leitura_cocho_config').select('nota, percentual_ajuste').eq('fazenda_id', fazendaId)
  if (ajustesResult.error) throw ajustesResult.error
  const ajustesPorNota = new Map((ajustesResult.data || []).map((item: any) => [Number(item.nota), Number(item.percentual_ajuste) || 0]))
  const anterioresPorCurral = agruparAnterioresPorCurral((registrosAnterioresResult.data || []) as RegistroOferta[])
  const registrosPorCurral = new Map<string, RegistroOferta[]>()
  for (const registro of (registrosDiaResult.data || []) as RegistroOferta[]) {
    if (!registro.curral_id) continue
    const lista = registrosPorCurral.get(registro.curral_id) || []
    lista.push(registro)
    registrosPorCurral.set(registro.curral_id, lista)
  }

  const linhas: LancamentoTratoLinha[] = []
  for (const ocupacao of ocupacoes) {
    const curral = currais.get(ocupacao.curral_id)
    if (!curral) continue
    const loteId = ocupacao.lote_id
    const lote = ocupacao.lotes
    const categorias = categoriasPorLote.get(loteId || '') || []
    const quantidadeCabecas = categorias.reduce((sum, item) => sum + (Number(item.quant_atual) || 0), 0)
    const pesoTotal = categorias.reduce((sum, item) => sum + (Number(item.quant_atual) || 0) * (Number(item.peso_vivo_atual_kg_cab) || 0), 0)
    const leitura = loteId ? leituras.get(loteId) : undefined
    const ajuste = leitura?.leitura_cocho == null ? null : ajustesPorNota.get(Number(leitura.leitura_cocho)) ?? 0
    const totalAnterior = totalUltimoDiaDaOcupacao(
      anterioresPorCurral.get(ocupacao.curral_id) || [],
      ocupacao.data_inicial
    )
    const calculo = calcularTratosDoDia({
      quantidadeTratos: Number(programacao.quantidade_tratos),
      percentuais: (percentuaisResult.data || []).map((item: any) => ({ ...item, percentual: Number(item.percentual) || 0 })),
      kgMnDia: ocupacao.kg_mn_dia_dia1 != null ? Number(ocupacao.kg_mn_dia_dia1) : null,
      totalRealDiaAnterior: totalAnterior,
      leituraDia: leitura?.leitura_cocho == null ? null : Number(leitura.leitura_cocho),
      ajusteLeituraPct: ajuste,
      registrosDoDia: registrosPorCurral.get(ocupacao.curral_id) || [],
      programacaoId: programacao.id,
    })
    const consumo = quantidadeCabecas > 0 && calculo.kgBaseDia != null ? calculo.kgBaseDia / quantidadeCabecas : null
    linhas.push({
      curralId: curral.id,
      curralNome: curral.nome,
      linhaNome: null,
      loteId,
      loteNome: lote?.nome || 'Sem lote',
      dietaNome: planosPorLote.get(loteId || '') || null,
      quantidadeCabecas: quantidadeCabecas || null,
      pesoVivoKg: quantidadeCabecas > 0 ? pesoTotal / quantidadeCabecas : null,
      categorias: categorias.map((item) => item.categoria).filter(Boolean).join(', '),
      tratoAnteriorKg: totalAnterior,
      leituraDia: leitura?.leitura_cocho == null ? null : Number(leitura.leitura_cocho),
      ajusteLeituraPct: ajuste,
      kgBaseDia: calculo.kgBaseDia,
      consumoKgCabDia: consumo,
      quantidadeTratos: Number(programacao.quantidade_tratos),
      tratos: calculo.tratos,
    })
  }

  linhas.sort((a, b) => a.loteNome.localeCompare(b.loteNome, 'pt-BR') || a.curralNome.localeCompare(b.curralNome, 'pt-BR'))
  return { fazendaId, data, tipo, programacaoId: programacao.id, linhas }
}

export function validarLancamentosTratos(linhas: LancamentoTratoLinha[]): string[] {
  const problemas: string[] = []
  for (const linha of linhas) {
    const preenchidos = linha.tratos.filter((trato) => trato.kgReal !== null)
    if (preenchidos.length === 0) continue
    if (!linha.loteId) {
      problemas.push(`${linha.curralNome}: sem lote vinculado`)
    }
    for (const trato of preenchidos) {
      if ((trato.kgReal ?? 0) < 0) {
        problemas.push(`${linha.loteNome} (${linha.curralNome}), trato ${trato.ordemTrato}: valor negativo`)
      }
    }
  }
  return problemas
}

export async function salvarLancamentosTratos(params: {
  fazendaId: string
  data: string
  programacaoId: string
  nomeUsuario: string
  linhas: LancamentoTratoLinha[]
}): Promise<void> {
  const problemas = validarLancamentosTratos(params.linhas)
  if (problemas.length > 0) {
    throw new Error(problemas.join('; '))
  }

  const registros = params.linhas.flatMap((linha) => linha.tratos
    .filter((trato) => trato.kgReal !== null)
    .map((trato) => ({
      id: trato.registroId || undefined,
      fazenda_id: params.fazendaId,
      data: new Date(`${params.data}T12:00:00-04:00`).toISOString(),
      nome_usuario: params.nomeUsuario,
      curral_id: linha.curralId,
      lote_id: linha.loteId,
      ordem_trato: trato.ordemTrato,
      kg_planejado: trato.kgPlanejado,
      kg_ofertado_real: trato.kgReal,
      leitura_cocho_nota: linha.leituraDia,
      programacao_id: params.programacaoId,
      origem: 'painel',
      local_id: `painel-${linha.curralId}-${params.data}-${trato.ordemTrato}`,
    })))
  if (registros.length === 0) return

  const { error } = await supabase.rpc('lancar_tratos_folha', { p_registros: registros })
  if (error) throw error
}

export function limparReaisLancamento(linhas: LancamentoTratoLinha[]): LancamentoTratoLinha[] {
  return linhas.map((linha) => ({
    ...linha,
    tratos: linha.tratos.map((trato) => ({ ...trato, kgReal: null })),
  }))
}

export function parseKgLancamento(value: string): number | null {
  return numero(value)
}