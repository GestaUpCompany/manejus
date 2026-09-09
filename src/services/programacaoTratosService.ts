import { supabase } from './supabaseClient'

export type TipoProgramacao = 'engorda' | 'sequestro' | 'tip'

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

export interface ProgramacaoCurral {
  id: string
  programacao_id: string
  curral_id: string
  lote_id: string | null
  kg_mn_dia: number
  n_cabecas_snapshot: number | null
  peso_vivo_medio_snapshot: number | null
}

export interface CurralComKg {
  curral_id: string
  curral_nome: string
  lote_id: string | null
  lote_nome: string | null
  kg_mn_dia: string
}

export interface ProgramacaoCompleta {
  programacao: ProgramacaoTratos | null
  percentuais: ProgramacaoPercentual[]
  currais: ProgramacaoCurral[]
}

function dataHojeISO(): string {
  return new Date().toISOString().slice(0, 10)
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
    return { programacao: null, percentuais: [], currais: [] }
  }

  if (!prog) {
    return { programacao: null, percentuais: [], currais: [] }
  }

  const { data: percentuais, error: percError } = await supabase
    .from('programacao_tratos_percentuais')
    .select('*')
    .eq('programacao_id', prog.id)
    .order('ordem_trato', { ascending: true })

  if (percError) {
    console.error('Erro ao buscar percentuais:', percError)
  }

  const { data: currais, error: curraisError } = await supabase
    .from('programacao_tratos_currais')
    .select('*')
    .eq('programacao_id', prog.id)

  if (curraisError) {
    console.error('Erro ao buscar currais da programação:', curraisError)
  }

  return {
    programacao: prog as ProgramacaoTratos,
    percentuais: (percentuais || []) as ProgramacaoPercentual[],
    currais: (currais || []) as ProgramacaoCurral[],
  }
}

/**
 * Carrega quais tipos de programação (engorda, sequestro ou TIP) já existem para a fazenda.
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
  return data.map((d) => d.tipo as TipoProgramacao)
}

/**
 * Carrega os currais ativos da fazenda com nome e lote associado.
 */
export async function getCurraisFazenda(
  fazendaId: string
): Promise<{ id: string; nome: string; lote_id: string | null; lote_nome: string | null }[]> {
  const { data, error } = await supabase
    .from('currais')
    .select('id, nome, lote_id, lotes(nome)')
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
  }))
}

/**
 * Salva a programação de tratos de um tipo específico.
 * Se já existe uma programação ativa para o tipo, atualiza; senão, cria nova.
 * Percentuais e currais são reescritos (delete + insert) a cada salvamento.
 */
export async function saveProgramacaoTratos(
  fazendaId: string,
  tipo: TipoProgramacao,
  config: {
    quantidade_tratos: number
    data_inicio: string
    data_fim: string
    percentuais: { ordem_trato: number; percentual: number; horario_sugerido: string | null }[]
    currais: { curral_id: string; lote_id: string | null; kg_mn_dia: number }[]
  }
): Promise<{ success: boolean; error: string | null }> {
  // Atualiza somente a programação que tem exatamente esta vigência.
  // Vigências diferentes são preservadas para histórico e futuro.
  const { data: existing } = await supabase
    .from('programacao_tratos')
    .select('id')
    .eq('fazenda_id', fazendaId)
    .eq('ativo', true)
    .eq('tipo', tipo)
    .eq('data_inicio', config.data_inicio)
    .eq('data_fim', config.data_fim)
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
    // Limpa currais antigos
    await supabase.from('programacao_tratos_currais').delete().eq('programacao_id', programacaoId)
  } else {
    const { data: newProg, error: insertError } = await supabase
      .from('programacao_tratos')
      .insert({
        fazenda_id: fazendaId,
        tipo,
        quantidade_tratos: config.quantidade_tratos,
        data_inicio: config.data_inicio,
        data_fim: config.data_fim,
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

  // Insere currais com kg MN do dia 1
  if (config.currais.length > 0) {
    const { error: curraisError } = await supabase
      .from('programacao_tratos_currais')
      .insert(
        config.currais.map((c) => ({
          programacao_id: programacaoId,
          curral_id: c.curral_id,
          lote_id: c.lote_id,
          kg_mn_dia: c.kg_mn_dia,
        }))
      )

    if (curraisError) {
      return { success: false, error: curraisError.message }
    }
  }

  return { success: true, error: null }
}
