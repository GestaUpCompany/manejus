import { supabase } from './supabaseClient'
import { toFarmDateOnly } from '../utils/formatDate'

export type TipoProgramacao = 'confinamento' | 'sequestro' | 'tip'

export const SISTEMA_POR_TIPO: Record<TipoProgramacao, string> = {
  confinamento: 'Confinamento',
  sequestro: 'Sequestro',
  tip: 'TIP',
}

export interface ProgramacaoTratos {
  id: string
  fazenda_id: string
  tipo: TipoProgramacao
  quantidade_tratos: number
  data_inicio: string
  data_fim: string
  ativo: boolean
}

export interface ProgramacaoPercentual {
  id: string
  programacao_id: string
  ordem_trato: number
  percentual: number
  horario_sugerido: string | null
}

export interface OcupacaoEmTrato {
  ocupacao_id: string
  curral_id: string
  curral_nome: string
  lote_id: string
  lote_nome: string | null
  lote_sistema: string | null
  data_inicial: string
  data_final: string | null
  kg_mn_dia_dia1: number | null
}

export interface ProgramacaoCompleta {
  programacao: ProgramacaoTratos | null
  percentuais: ProgramacaoPercentual[]
}

export interface VigenciaProgramacao {
  id: string
  tipo: TipoProgramacao
  data_inicio: string
  data_fim: string
}

function dataHojeISO(): string {
  return toFarmDateOnly(new Date().toISOString()) || new Date().toISOString().slice(0, 10)
}

function deslocarDataISO(dataISO: string, dias: number): string {
  const [ano, mes, dia] = dataISO.split('-').map(Number)
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10)
}

/**
 * Lista todas as vigências ativas de programação de tratos da fazenda,
 * ordenadas por data de início. Usado para exibir as vigências na UI.
 */
export async function getVigenciasProgramacao(fazendaId: string): Promise<VigenciaProgramacao[]> {
  const { data, error } = await supabase
    .from('programacao_tratos')
    .select('id, tipo, data_inicio, data_fim')
    .eq('fazenda_id', fazendaId)
    .eq('ativo', true)
    .order('data_inicio', { ascending: true })

  if (error || !data) return []
  return data as VigenciaProgramacao[]
}

/**
 * Carrega a programação vigente para a data informada.
 */
export async function getProgramacaoTratos(
  fazendaId: string,
  tipo: TipoProgramacao,
  dataReferencia = dataHojeISO()
): Promise<ProgramacaoCompleta> {
  const { data: prog, error: progError } = await supabase
    .from('programacao_tratos')
    .select('*')
    .eq('fazenda_id', fazendaId)
    .eq('ativo', true)
    .eq('tipo', tipo)
    .lte('data_inicio', dataReferencia)
    .gte('data_fim', dataReferencia)
    .order('data_inicio', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (progError) {
    console.error('Erro ao buscar programação de tratos:', progError)
    return { programacao: null, percentuais: [] }
  }

  if (!prog) {
    return { programacao: null, percentuais: [] }
  }

  const { data: percentuais, error: percError } = await supabase
    .from('programacao_tratos_percentuais')
    .select('*')
    .eq('programacao_id', prog.id)
    .order('ordem_trato', { ascending: true })

  if (percError) {
    console.error('Erro ao buscar percentuais:', percError)
  }

  return {
    programacao: prog as ProgramacaoTratos,
    percentuais: (percentuais || []) as ProgramacaoPercentual[],
  }
}

/**
 * Carrega quais tipos de programação (confinamento, sequestro ou TIP) já existem para a fazenda.
 */
export async function getTiposExistentes(fazendaId: string): Promise<TipoProgramacao[]> {
  const dataReferencia = dataHojeISO()
  const { data, error } = await supabase
    .from('programacao_tratos')
    .select('tipo')
    .eq('fazenda_id', fazendaId)
    .eq('ativo', true)
    .lte('data_inicio', dataReferencia)
    .gte('data_fim', dataReferencia)

  if (error || !data) return []
  return [...new Set(data.map((d) => d.tipo as TipoProgramacao))]
}

/**
 * Carrega os currais ativos da fazenda com nome e lote associado.
 */
export async function getCurraisFazenda(
  fazendaId: string
): Promise<{ id: string; nome: string; lote_id: string | null; lote_nome: string | null; lote_sistema: string | null }[]> {
  const { data, error } = await supabase
    .from('currais')
    .select('id, nome, lote_id, lotes(nome, sistema_producao)')
    .eq('fazenda_id', fazendaId)
    .is('deleted_at', null)
    .eq('ativo', true)
    .order('nome', { ascending: true })

  if (error || !data) return []
  return data.map((c: any) => ({
    id: c.id as string,
    nome: c.nome as string,
    lote_id: (c.lote_id as string | null) ?? null,
    lote_nome: (c.lotes?.nome as string | null) ?? null,
    lote_sistema: (c.lotes?.sistema_producao as string | null) ?? null,
  }))
}

/**
 * Lista as ocupações abertas de currais da fazenda (lote_curral_historico sem
 * data_final), com nome do curral e dados do lote. É a fonte da seção
 * "Currais em trato" da configuração e da participação na folha.
 */
export async function getOcupacoesEmTrato(fazendaId: string): Promise<OcupacaoEmTrato[]> {
  const { data, error } = await supabase
    .from('lote_curral_historico')
    .select('id, curral_id, lote_id, data_inicial, data_final, kg_mn_dia_dia1, currais(nome, ativo, deleted_at), lotes(nome, sistema_producao, deleted_at)')
    .eq('fazenda_id', fazendaId)
    .is('data_final', null)
    .order('data_inicial', { ascending: true })

  if (error || !data) return []
  return (data as any[])
    .filter((o) => o.currais && o.currais.ativo !== false && o.currais.deleted_at == null && o.lotes && o.lotes.deleted_at == null)
    .map((o) => ({
      ocupacao_id: o.id as string,
      curral_id: o.curral_id as string,
      curral_nome: o.currais.nome as string,
      lote_id: o.lote_id as string,
      lote_nome: (o.lotes?.nome as string | null) ?? null,
      lote_sistema: (o.lotes?.sistema_producao as string | null) ?? null,
      data_inicial: o.data_inicial as string,
      data_final: (o.data_final as string | null) ?? null,
      kg_mn_dia_dia1: o.kg_mn_dia_dia1 != null ? Number(o.kg_mn_dia_dia1) : null,
    }))
}

/**
 * Resolve as ocupações que cobrem uma data específica: para cada curral, a
 * ocupação de maior data_inicial com data_inicial <= data e
 * (data_final null ou >= data). Troca de lote no mesmo dia resolve para a mais
 * recente.
 */
export async function getOcupacoesNaData(
  fazendaId: string,
  data: string
): Promise<OcupacaoEmTrato[]> {
  const { data: rows, error } = await supabase
    .from('lote_curral_historico')
    .select('id, curral_id, lote_id, data_inicial, data_final, kg_mn_dia_dia1, currais(nome), lotes(nome, sistema_producao)')
    .eq('fazenda_id', fazendaId)
    .lte('data_inicial', data)
    .or(`data_final.is.null,data_final.gte.${data}`)

  if (error || !rows) return []

  const porCurral = new Map<string, any>()
  for (const row of rows as any[]) {
    const atual = porCurral.get(row.curral_id)
    if (!atual || row.data_inicial > atual.data_inicial) {
      porCurral.set(row.curral_id, row)
    }
  }

  return [...porCurral.values()].map((o) => ({
    ocupacao_id: o.id as string,
    curral_id: o.curral_id as string,
    curral_nome: (o.currais?.nome as string) ?? '—',
    lote_id: o.lote_id as string,
    lote_nome: (o.lotes?.nome as string | null) ?? null,
    lote_sistema: (o.lotes?.sistema_producao as string | null) ?? null,
    data_inicial: o.data_inicial as string,
    data_final: (o.data_final as string | null) ?? null,
    kg_mn_dia_dia1: o.kg_mn_dia_dia1 != null ? Number(o.kg_mn_dia_dia1) : null,
  }))
}

/**
 * Atualiza o feed target (kg MN do dia 1) de uma ocupação.
 */
export async function setOcupacaoKgDia1(
  ocupacaoId: string,
  kgMnDia1: number | null
): Promise<{ success: boolean; error: string | null }> {
  const { error } = await supabase
    .from('lote_curral_historico')
    .update({ kg_mn_dia_dia1: kgMnDia1, updated_at: new Date().toISOString() })
    .eq('id', ocupacaoId)

  return { success: !error, error: error?.message ?? null }
}

/**
 * Atualiza a data de entrada de uma ocupação (correção de backfill/dado).
 */
export async function setOcupacaoDataInicial(
  ocupacaoId: string,
  dataInicial: string
): Promise<{ success: boolean; error: string | null }> {
  const { error } = await supabase
    .from('lote_curral_historico')
    .update({ data_inicial: dataInicial, updated_at: new Date().toISOString() })
    .eq('id', ocupacaoId)

  return { success: !error, error: error?.message ?? null }
}

/**
 * Clona uma programação (percentuais e currais) para uma nova vigência.
 * Usado ao dividir uma vigência que contém o intervalo salvo.
 */
async function clonarVigencia(origemId: string, dataInicio: string, dataFim: string): Promise<void> {
  const [{ data: origem }, { data: percentuais }, { data: currais }] = await Promise.all([
    supabase.from('programacao_tratos').select('fazenda_id, tipo, quantidade_tratos').eq('id', origemId).single(),
    supabase.from('programacao_tratos_percentuais').select('ordem_trato, percentual, horario_sugerido').eq('programacao_id', origemId),
    supabase.from('programacao_tratos_currais').select('curral_id, lote_id, kg_mn_dia').eq('programacao_id', origemId),
  ])
  if (!origem) return

  const { data: novo } = await supabase
    .from('programacao_tratos')
    .insert({
      fazenda_id: origem.fazenda_id,
      tipo: origem.tipo,
      quantidade_tratos: origem.quantidade_tratos,
      data_inicio: dataInicio,
      data_fim: dataFim,
      ativo: true,
    })
    .select('id')
    .single()
  if (!novo) return

  if (percentuais?.length) {
    await supabase.from('programacao_tratos_percentuais').insert(
      percentuais.map((p) => ({ programacao_id: novo.id, ordem_trato: p.ordem_trato, percentual: p.percentual, horario_sugerido: p.horario_sugerido }))
    )
  }
  if (currais?.length) {
    await supabase.from('programacao_tratos_currais').insert(
      currais.map((c) => ({ programacao_id: novo.id, curral_id: c.curral_id, lote_id: c.lote_id, kg_mn_dia: c.kg_mn_dia }))
    )
  }
}

/**
 * Garante que nenhuma outra vigência ativa do mesmo tipo se sobreponha a
 * [novaInicio, novaFim]. Vigências anteriores são truncadas, posteriores têm o
 * início adiado, vigências contidas são desativadas e vigências que contêm o
 * intervalo são divididas em duas.
 */
async function resolverSobreposicoes(
  fazendaId: string,
  tipo: TipoProgramacao,
  novaInicio: string,
  novaFim: string,
  excluirId?: string
): Promise<void> {
  let query = supabase
    .from('programacao_tratos')
    .select('id, data_inicio, data_fim')
    .eq('fazenda_id', fazendaId)
    .eq('tipo', tipo)
    .eq('ativo', true)
    .lte('data_inicio', novaFim)
    .gte('data_fim', novaInicio)
  if (excluirId) query = query.neq('id', excluirId)

  const { data: sobrepostas } = await query

  for (const vig of sobrepostas || []) {
    const temEsquerda = vig.data_inicio < novaInicio
    const temDireita = vig.data_fim > novaFim

    if (temEsquerda) {
      await supabase
        .from('programacao_tratos')
        .update({ data_fim: deslocarDataISO(novaInicio, -1), updated_at: new Date().toISOString() })
        .eq('id', vig.id)
      if (temDireita) {
        await clonarVigencia(vig.id, deslocarDataISO(novaFim, 1), vig.data_fim)
      }
    } else if (temDireita) {
      await supabase
        .from('programacao_tratos')
        .update({ data_inicio: deslocarDataISO(novaFim, 1), updated_at: new Date().toISOString() })
        .eq('id', vig.id)
    } else {
      await supabase
        .from('programacao_tratos')
        .update({ ativo: false, updated_at: new Date().toISOString() })
        .eq('id', vig.id)
    }
  }
}

/**
 * Salva o cronograma de tratos de um tipo (quantidade de tratos, percentuais e
 * horários). A vigência funciona como versionamento do cronograma:
 * - se já existe vigência ativa com a mesma data_inicio, atualiza seu conteúdo;
 * - senão, cria uma nova versão cuja data_fim é derivada (véspera da próxima
 *   vigência, ou "sem fim") e ajusta as sobrepostas.
 * Currais não fazem mais parte do save: a participação vem da ocupação
 * (lote_curral_historico), mantida pelo trigger em currais.lote_id.
 */
export async function saveProgramacaoTratos(
  fazendaId: string,
  tipo: TipoProgramacao,
  config: {
    quantidade_tratos: number
    data_inicio: string
    percentuais: { ordem_trato: number; percentual: number; horario_sugerido: string | null }[]
  }
): Promise<{ success: boolean; error: string | null }> {
  // A vigência é identificada pela data_inicio: a constraint de não-sobreposição
  // garante que no máximo uma vigência ativa do tipo começa nessa data.
  const { data: existing } = await supabase
    .from('programacao_tratos')
    .select('id, data_fim')
    .eq('fazenda_id', fazendaId)
    .eq('ativo', true)
    .eq('tipo', tipo)
    .eq('data_inicio', config.data_inicio)
    .maybeSingle()

  let programacaoId: string

  if (existing) {
    const { error: updateError } = await supabase
      .from('programacao_tratos')
      .update({
        quantidade_tratos: config.quantidade_tratos,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)

    if (updateError) {
      return { success: false, error: updateError.message }
    }
    programacaoId = existing.id

    // Limpa percentuais antigos
    await supabase.from('programacao_tratos_percentuais').delete().eq('programacao_id', programacaoId)
  } else {
    // data_fim derivada: véspera da próxima vigência, ou "sem fim".
    const { data: proxima } = await supabase
      .from('programacao_tratos')
      .select('data_inicio')
      .eq('fazenda_id', fazendaId)
      .eq('ativo', true)
      .eq('tipo', tipo)
      .gt('data_inicio', config.data_inicio)
      .order('data_inicio', { ascending: true })
      .limit(1)
      .maybeSingle()

    const dataFim = proxima ? deslocarDataISO(proxima.data_inicio, -1) : '9999-12-31'

    await resolverSobreposicoes(fazendaId, tipo, config.data_inicio, dataFim)

    const { data: newProg, error: insertError } = await supabase
      .from('programacao_tratos')
      .insert({
        fazenda_id: fazendaId,
        tipo,
        quantidade_tratos: config.quantidade_tratos,
        data_inicio: config.data_inicio,
        data_fim: dataFim,
        ativo: true,
      })
      .select()
      .single()

    if (insertError) {
      return { success: false, error: insertError.message }
    }
    programacaoId = newProg.id
  }

  // Insere percentuais
  if (config.percentuais.length > 0) {
    const { error: percError } = await supabase
      .from('programacao_tratos_percentuais')
      .insert(
        config.percentuais.map((p) => ({
          programacao_id: programacaoId,
          ordem_trato: p.ordem_trato,
          percentual: p.percentual,
          horario_sugerido: p.horario_sugerido,
        }))
      )

    if (percError) {
      return { success: false, error: percError.message }
    }
  }

  return { success: true, error: null }
}
