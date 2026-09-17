import { supabase } from './supabaseClient'
import type { TipoProgramacao } from './programacaoTratosService'

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

function proximaData(data: string): string {
  const date = new Date(`${data}T00:00:00`)
  date.setDate(date.getDate() + 1)
  return date.toISOString().slice(0, 10)
}

function numero(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function agruparUltimoDiaPorCurral(registros: RegistroOferta[]): Map<string, number> {
  const porCurral = new Map<string, RegistroOferta[]>()
  for (const registro of registros) {
    if (!registro.curral_id || registro.kg_ofertado_real == null) continue
    const lista = porCurral.get(registro.curral_id) || []
    lista.push(registro)
    porCurral.set(registro.curral_id, lista)
  }

  const resultado = new Map<string, number>()
  for (const [curralId, lista] of porCurral) {
    const diaMaisRecente = lista
      .map((registro) => registro.data.slice(0, 10))
      .sort((a, b) => b.localeCompare(a))[0]
    const total = lista
      .filter((registro) => registro.data.slice(0, 10) === diaMaisRecente)
      .reduce((sum, registro) => sum + (Number(registro.kg_ofertado_real) || 0), 0)
    resultado.set(curralId, total)
  }
  return resultado
}

function ultimaLeituraPorLote(leituras: LeituraCocho[], data: string): Map<string, LeituraCocho> {
  const resultado = new Map<string, LeituraCocho>()
  for (const leitura of leituras) {
    if (!leitura.lote_id || leitura.data.slice(0, 10) >= data || resultado.has(leitura.lote_id)) continue
    resultado.set(leitura.lote_id, leitura)
  }
  return resultado
}

export function calcularTratosDoDia(params: {
  quantidadeTratos: number
  percentuais: { ordem_trato: number; percentual: number; horario_sugerido: string | null }[]
  kgMnDia: number
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
    let kgPlanejado = kgBaseDia > 0 ? kgBaseDia * percentual / 100 : null

    if (ordem === params.quantidadeTratos && params.totalRealDiaAnterior != null && kgBaseDia !== null) {
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
  const [percentuaisResult, curraisResult] = await Promise.all([
    supabase
      .from('programacao_tratos_percentuais')
      .select('ordem_trato, percentual, horario_sugerido')
      .eq('programacao_id', programacao.id)
      .order('ordem_trato'),
    supabase
      .from('programacao_tratos_currais')
      .select('curral_id, lote_id, kg_mn_dia')
      .eq('programacao_id', programacao.id),
  ])
  if (percentuaisResult.error) throw percentuaisResult.error
  if (curraisResult.error) throw curraisResult.error

  const curralIds = (curraisResult.data || []).map((item: any) => item.curral_id).filter(Boolean)
  const loteIds = (curraisResult.data || []).map((item: any) => item.lote_id).filter(Boolean)
  if (curralIds.length === 0) {
    return { fazendaId, data, tipo, programacaoId: programacao.id, linhas: [] }
  }

  const dataSeguinte = proximaData(data)
  const [curraisResult2, categoriasResult, planosResult, leiturasResult, registrosDiaResult, registrosAnterioresResult] = await Promise.all([
    supabase.from('currais').select('id, nome, linha_id, lote_id, lotes(id, nome)').in('id', curralIds),
    loteIds.length > 0
      ? supabase.from('lote_categorias').select('lote_id, categoria, quant_atual, peso_vivo_atual_kg_cab').in('lote_id', loteIds).eq('ativo', true).is('data_fim', null)
      : Promise.resolve({ data: [], error: null } as any),
    loteIds.length > 0
      ? supabase.from('planos_nutricionais').select('lote_id, formulacao_id, formulacoes(nome)').in('lote_id', loteIds).eq('ativo', true).is('data_fim', null)
      : Promise.resolve({ data: [], error: null } as any),
    loteIds.length > 0
      ? supabase.from('registros_leitura_cocho').select('lote_id, data, leitura_cocho, nota_config_id').eq('fazenda_id', fazendaId).in('lote_id', loteIds).is('deleted_at', null).order('data', { ascending: false })
      : Promise.resolve({ data: [], error: null } as any),
    supabase.from('registros_oferta_trato').select('id, curral_id, lote_id, data, ordem_trato, kg_planejado, kg_ofertado_real').eq('fazenda_id', fazendaId).is('deleted_at', null).gte('data', data).lt('data', dataSeguinte).order('ordem_trato'),
    supabase.from('registros_oferta_trato').select('id, curral_id, lote_id, data, ordem_trato, kg_planejado, kg_ofertado_real').eq('fazenda_id', fazendaId).is('deleted_at', null).lt('data', data).order('data', { ascending: false }),
  ])
  for (const result of [curraisResult2, categoriasResult, planosResult, leiturasResult, registrosDiaResult, registrosAnterioresResult]) {
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
  const totalAnteriorPorCurral = agruparUltimoDiaPorCurral((registrosAnterioresResult.data || []) as RegistroOferta[])
  const registrosPorCurral = new Map<string, RegistroOferta[]>()
  for (const registro of (registrosDiaResult.data || []) as RegistroOferta[]) {
    if (!registro.curral_id) continue
    const lista = registrosPorCurral.get(registro.curral_id) || []
    lista.push(registro)
    registrosPorCurral.set(registro.curral_id, lista)
  }

  const linhas: LancamentoTratoLinha[] = []
  for (const programacaoCurral of (curraisResult.data || []) as any[]) {
    const curral = currais.get(programacaoCurral.curral_id)
    if (!curral) continue
    const loteId = programacaoCurral.lote_id || curral.lote_id || null
    const lote = curral.lotes
    const categorias = categoriasPorLote.get(loteId || '') || []
    const quantidadeCabecas = categorias.reduce((sum, item) => sum + (Number(item.quant_atual) || 0), 0)
    const pesoTotal = categorias.reduce((sum, item) => sum + (Number(item.quant_atual) || 0) * (Number(item.peso_vivo_atual_kg_cab) || 0), 0)
    const leitura = loteId ? leituras.get(loteId) : undefined
    const ajuste = leitura?.leitura_cocho == null ? null : ajustesPorNota.get(Number(leitura.leitura_cocho)) ?? 0
    const calculo = calcularTratosDoDia({
      quantidadeTratos: Number(programacao.quantidade_tratos),
      percentuais: (percentuaisResult.data || []).map((item: any) => ({ ...item, percentual: Number(item.percentual) || 0 })),
      kgMnDia: Number(programacaoCurral.kg_mn_dia) || 0,
      totalRealDiaAnterior: totalAnteriorPorCurral.get(programacaoCurral.curral_id) ?? null,
      leituraDia: leitura?.leitura_cocho == null ? null : Number(leitura.leitura_cocho),
      ajusteLeituraPct: ajuste,
      registrosDoDia: registrosPorCurral.get(programacaoCurral.curral_id) || [],
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
      tratoAnteriorKg: totalAnteriorPorCurral.get(programacaoCurral.curral_id) ?? null,
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

export async function salvarLancamentosTratos(params: {
  fazendaId: string
  data: string
  programacaoId: string
  nomeUsuario: string
  linhas: LancamentoTratoLinha[]
}): Promise<void> {
  const registros = params.linhas.flatMap((linha) => linha.tratos
    .filter((trato) => trato.kgReal !== null)
    .map((trato) => ({
      id: trato.registroId || undefined,
      fazenda_id: params.fazendaId,
      data: new Date(`${params.data}T12:00:00`).toISOString(),
      nome_usuario: params.nomeUsuario,
      curral_id: linha.curralId,
      lote_id: linha.loteId,
      ordem_trato: trato.ordemTrato,
      kg_planejado: trato.kgPlanejado,
      kg_ofertado_real: trato.kgReal,
      leitura_cocho_nota: linha.leituraDia,
      programacao_id: params.programacaoId,
    })))
  if (registros.length === 0) return

  for (const registro of registros) {
    const { id, ...payload } = registro
    const result = id
      ? await supabase.from('registros_oferta_trato').update(payload).eq('id', id)
      : await supabase.from('registros_oferta_trato').insert(payload)
    if (result.error) throw result.error
  }
}

export function parseKgLancamento(value: string): number | null {
  return numero(value)
}