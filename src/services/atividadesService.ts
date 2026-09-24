import { supabase } from './supabaseClient'

export interface Atividade {
  id: string
  fazenda_id: string
  titulo: string
  descricao: string | null
  local: string | null
  local_tipo: string | null
  local_id: string | null
  setor_id: string | null
  data_inicio: string
  data_fim: string
  prioridade: number
  status: string
  atrasada: boolean
  nao_prevista: boolean
  ativo: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  // Joined
  setor_nome?: string | null
  funcionarios?: AtividadeFuncionario[]
}

export interface AtividadeFuncionario {
  id: string
  atividade_id: string
  funcionario_id: string
  status_individual: string
  inicio_at: string | null
  fim_at: string | null
  detalhamento: string | null
  justificativa: string | null
  justificada_at: string | null
  tempo_gasto_segundos: number | null
  foto_url: string | null
  latitude: number | null
  longitude: number | null
  gps_accuracy: number | null
  // Joined
  funcionario_nome?: string | null
  setor_nomes?: string[]
}

export interface PrioridadeAtividade {
  id: string
  fazenda_id: string
  nivel: number
  nome: string
}

export interface FuncionarioComSetor {
  id: string
  nome: string
  setor_ids: string[]
  setor_nomes: string[]
  cargo: string | null
  ativo: boolean
}

export async function getAtividades(
  fazendaId: string,
  filtros?: { dataInicio?: string; dataFim?: string; status?: string; prioridade?: number; setorId?: string },
  incluirNaoPrevistas = false
): Promise<Atividade[]> {
  let query = supabase
    .from('atividades')
    .select(`
      *,
      setor:setores(nome)
    `)
    .eq('fazenda_id', fazendaId)
    .is('deleted_at', null)
    .order('data_inicio', { ascending: false })
    .order('prioridade', { ascending: true })

  if (!incluirNaoPrevistas) {
    query = query.eq('nao_prevista', false)
  }

  if (filtros?.dataInicio) {
    query = query.gte('data_inicio', filtros.dataInicio)
  }
  if (filtros?.dataFim) {
    query = query.lte('data_inicio', filtros.dataFim)
  }
  if (filtros?.status) {
    query = query.eq('status', filtros.status)
  }
  if (filtros?.prioridade) {
    query = query.eq('prioridade', filtros.prioridade)
  }
  if (filtros?.setorId) {
    query = query.eq('setor_id', filtros.setorId)
  }

  const { data, error } = await query

  if (error) {
    console.error('[Atividades] Erro ao buscar atividades:', error)
    return []
  }

  const atividades = (data || []).map((a: any) => ({
    ...a,
    setor_nome: a.setor?.nome || null,
  })) as Atividade[]

  // Buscar funcionários associados
  const atividadeIds = atividades.map((a) => a.id)
  if (atividadeIds.length === 0) return atividades

  const { data: afs, error: afError } = await supabase
    .from('atividade_funcionarios')
    .select(`
      *,
      funcionario:funcionarios(nome)
    `)
    .in('atividade_id', atividadeIds)

  if (afError) {
    console.error('[Atividades] Erro ao buscar funcionários das atividades:', afError)
    return atividades
  }

  // Buscar setores de cada funcionario via junction (N:N)
  const funcIds = [...new Set((afs || []).map((af: any) => af.funcionario_id))]
  let setoresByFuncId: Record<string, string[]> = {}
  if (funcIds.length > 0) {
    const { data: fsData } = await supabase
      .from('funcionario_setores')
      .select('funcionario_id, setor:setores(nome)')
      .in('funcionario_id', funcIds)
    for (const fs of (fsData || []) as any[]) {
      const nome = fs.setor?.nome
      if (nome) {
        if (!setoresByFuncId[fs.funcionario_id]) setoresByFuncId[fs.funcionario_id] = []
        if (!setoresByFuncId[fs.funcionario_id].includes(nome)) {
          setoresByFuncId[fs.funcionario_id].push(nome)
        }
      }
    }
  }

  // Fallback: se o join voltar null (RLS no join aninhado), buscar nomes separadamente
  const funcIdsSemNome = (afs || []).filter((af: any) => !af.funcionario?.nome).map((af: any) => af.funcionario_id)
  let nomesByFuncId: Record<string, string> = {}
  if (funcIdsSemNome.length > 0) {
    const uniqueIds = [...new Set(funcIdsSemNome)]
    const { data: funcs } = await supabase
      .from('funcionarios')
      .select('id, nome')
      .in('id', uniqueIds)
    for (const f of funcs || []) {
      nomesByFuncId[f.id] = f.nome
    }
  }

  const afsByAtividade: Record<string, AtividadeFuncionario[]> = {}
  for (const af of afs || []) {
    const fallbackNome = nomesByFuncId[af.funcionario_id]
    const mapped: AtividadeFuncionario = {
      ...af,
      funcionario_nome: af.funcionario?.nome || fallbackNome || null,
      setor_nomes: setoresByFuncId[af.funcionario_id] || [],
    }
    if (!afsByAtividade[af.atividade_id]) afsByAtividade[af.atividade_id] = []
    afsByAtividade[af.atividade_id].push(mapped)
  }

  return atividades.map((a) => ({
    ...a,
    funcionarios: afsByAtividade[a.id] || [],
  }))
}

export async function createAtividade(
  payload: Omit<Atividade, 'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'setor_nome' | 'funcionarios' | 'atrasada' | 'nao_prevista'> & {
    funcionario_ids: string[]
  }
): Promise<Atividade | null> {
  const { funcionario_ids, ...atividadeData } = payload

  const { data, error } = await supabase
    .from('atividades')
    .insert(atividadeData)
    .select()
    .single()

  if (error) {
    console.error('[Atividades] Erro ao criar atividade:', error)
    return null
  }

  const atividadeId = data.id

  if (funcionario_ids.length > 0) {
    const afInserts = funcionario_ids.map((fid) => ({
      atividade_id: atividadeId,
      funcionario_id: fid,
      status_individual: 'pendente',
    }))

    const { error: afError } = await supabase
      .from('atividade_funcionarios')
      .insert(afInserts)

    if (afError) {
      console.error('[Atividades] Erro ao inserir funcionários da atividade:', afError)
    }
  }

  return data as Atividade
}

export async function updateAtividade(
  id: string,
  payload: Partial<Omit<Atividade, 'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'setor_nome' | 'funcionarios' | 'atrasada' | 'nao_prevista'>> & {
    funcionario_ids?: string[]
  }
): Promise<Atividade | null> {
  const { funcionario_ids, ...atividadeData } = payload

  if (Object.keys(atividadeData).length > 0) {
    const { error } = await supabase
      .from('atividades')
      .update(atividadeData)
      .eq('id', id)

    if (error) {
      console.error('[Atividades] Erro ao atualizar atividade:', error)
      return null
    }
  }

  // Sincronizar funcionários se fornecido
  if (funcionario_ids) {
    // Buscar registros existentes
    const { data: existing, error: fetchError } = await supabase
      .from('atividade_funcionarios')
      .select('id, funcionario_id, status_individual')
      .eq('atividade_id', id)

    if (fetchError) {
      console.error('[Atividades] Erro ao buscar funcionários existentes:', fetchError)
      return null
    }

    const existingMap = new Map((existing || []).map((e) => [e.funcionario_id, e]))
    const newIds = funcionario_ids.filter((fid) => !existingMap.has(fid))
    const removedIds = (existing || [])
      .filter((e) => !funcionario_ids.includes(e.funcionario_id) && e.status_individual === 'pendente')
      .map((e) => e.id)

    // Adicionar novos
    if (newIds.length > 0) {
      const { error: insertError } = await supabase
        .from('atividade_funcionarios')
        .insert(newIds.map((fid) => ({
          atividade_id: id,
          funcionario_id: fid,
          status_individual: 'pendente',
        })))
      if (insertError) console.error('[Atividades] Erro ao adicionar funcionários:', insertError)
    }

    // Remover apenas os que ainda estão pendentes
    if (removedIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('atividade_funcionarios')
        .delete()
        .in('id', removedIds)
      if (deleteError) console.error('[Atividades] Erro ao remover funcionários:', deleteError)
    }
  }

  // Buscar atividade atualizada
  const { data: updated, error: updateError } = await supabase
    .from('atividades')
    .select('*')
    .eq('id', id)
    .single()

  if (updateError) {
    console.error('[Atividades] Erro ao buscar atividade atualizada:', updateError)
    return null
  }

  return updated as Atividade
}

export async function deleteAtividade(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('atividades')
    .update({ deleted_at: new Date().toISOString(), ativo: false })
    .eq('id', id)

  if (error) {
    console.error('[Atividades] Erro ao excluir atividade:', error)
    return false
  }

  return true
}

export async function getPrioridades(fazendaId: string): Promise<PrioridadeAtividade[]> {
  const { data, error } = await supabase
    .from('prioridades_atividades')
    .select('*')
    .eq('fazenda_id', fazendaId)
    .order('nivel', { ascending: true })

  if (error) {
    console.error('[Atividades] Erro ao buscar prioridades:', error)
    return []
  }

  return data as PrioridadeAtividade[]
}

export async function updatePrioridade(
  fazendaId: string,
  nivel: number,
  nome: string
): Promise<boolean> {
  const { error } = await supabase
    .from('prioridades_atividades')
    .update({ nome })
    .eq('fazenda_id', fazendaId)
    .eq('nivel', nivel)

  if (error) {
    console.error('[Atividades] Erro ao atualizar prioridade:', error)
    return false
  }

  return true
}

export async function getFuncionariosComSetor(fazendaId: string): Promise<FuncionarioComSetor[]> {
  const { data, error } = await supabase
    .from('v_funcionarios_com_setores')
    .select('funcionario_id, nome, cargo, ativo, setor_ids, setor_nomes')
    .eq('fazenda_id', fazendaId)
    .is('deleted_at', null)
    .order('nome', { ascending: true })

  if (error) {
    console.error('[Atividades] Erro ao buscar funcionários com setor:', error)
    return []
  }

  return (data || []).map((f: any) => ({
    id: f.funcionario_id,
    nome: f.nome,
    setor_ids: f.setor_ids || [],
    setor_nomes: f.setor_nomes || [],
    cargo: f.cargo || null,
    ativo: f.ativo,
  })) as FuncionarioComSetor[]
}

export async function getMonitoramentoData(
  fazendaId: string,
  dataInicio?: string,
  dataFim?: string
): Promise<Atividade[]> {
  return getAtividades(fazendaId, { dataInicio, dataFim }, true)
}

export async function getControleAcessoHabilitado(fazendaId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('fazendas')
    .select('controle_acesso_habilitado')
    .eq('id', fazendaId)
    .single()

  if (error) {
    console.error('[Atividades] Erro ao buscar controle de acesso:', error)
    return false
  }

  return !!data?.controle_acesso_habilitado
}

// === Atividade Templates (Padrão) ===

export interface AtividadeTemplate {
  id: string
  fazenda_id: string
  titulo: string
  descricao: string | null
  local: string | null
  local_tipo: string | null
  local_id: string | null
  setor_id: string | null
  prioridade: number
  ativo: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  // Joined
  setor_nome?: string | null
  funcionario_ids?: string[]
  funcionarios?: { id: string; nome: string }[]
}

export async function getAtividadeTemplates(fazendaId: string): Promise<AtividadeTemplate[]> {
  const { data, error } = await supabase
    .from('atividade_templates')
    .select(`
      *,
      setor:setores(nome),
      funcionarios:atividade_template_funcionarios(funcionario_id)
    `)
    .eq('fazenda_id', fazendaId)
    .is('deleted_at', null)
    .eq('ativo', true)
    .order('titulo', { ascending: true })

  if (error) {
    console.error('[Atividades] Erro ao buscar templates:', error)
    return []
  }

  return (data || []).map((t: any) => ({
    ...t,
    setor_nome: t.setor?.nome || null,
    funcionario_ids: (t.funcionarios || []).map((f: any) => f.funcionario_id),
    funcionarios: undefined,
  })) as AtividadeTemplate[]
}

export async function createAtividadeTemplate(
  payload: Omit<AtividadeTemplate, 'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'setor_nome' | 'funcionarios' | 'funcionario_ids'> & {
    funcionario_ids: string[]
  }
): Promise<AtividadeTemplate | null> {
  const { funcionario_ids, ...templateData } = payload

  const { data, error } = await supabase
    .from('atividade_templates')
    .insert(templateData)
    .select()
    .single()

  if (error) {
    console.error('[Atividades] Erro ao criar template:', error)
    return null
  }

  const templateId = data.id

  if (funcionario_ids.length > 0) {
    const inserts = funcionario_ids.map((fid) => ({
      template_id: templateId,
      funcionario_id: fid,
    }))
    const { error: afError } = await supabase
      .from('atividade_template_funcionarios')
      .insert(inserts)
    if (afError) console.error('[Atividades] Erro ao inserir funcionários do template:', afError)
  }

  return data as AtividadeTemplate
}

export async function updateAtividadeTemplate(
  id: string,
  payload: Partial<Omit<AtividadeTemplate, 'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'setor_nome' | 'funcionarios' | 'funcionario_ids'>> & {
    funcionario_ids?: string[]
  }
): Promise<AtividadeTemplate | null> {
  const { funcionario_ids, ...templateData } = payload

  if (Object.keys(templateData).length > 0) {
    const { error } = await supabase
      .from('atividade_templates')
      .update(templateData)
      .eq('id', id)
    if (error) {
      console.error('[Atividades] Erro ao atualizar template:', error)
      return null
    }
  }

  if (funcionario_ids) {
    // Deletar todos e recriar (simples e robusto)
    await supabase
      .from('atividade_template_funcionarios')
      .delete()
      .eq('template_id', id)

    if (funcionario_ids.length > 0) {
      const inserts = funcionario_ids.map((fid) => ({
        template_id: id,
        funcionario_id: fid,
      }))
      const { error: afError } = await supabase
        .from('atividade_template_funcionarios')
        .insert(inserts)
      if (afError) console.error('[Atividades] Erro ao atualizar funcionários do template:', afError)
    }
  }

  return await getAtividadeTemplateById(id)
}

export async function getAtividadeTemplateById(id: string): Promise<AtividadeTemplate | null> {
  const { data, error } = await supabase
    .from('atividade_templates')
    .select(`
      *,
      setor:setores(nome),
      funcionarios:atividade_template_funcionarios(funcionario_id)
    `)
    .eq('id', id)
    .single()

  if (error) {
    console.error('[Atividades] Erro ao buscar template:', error)
    return null
  }

  return {
    ...data,
    setor_nome: (data as any).setor?.nome || null,
    funcionario_ids: ((data as any).funcionarios || []).map((f: any) => f.funcionario_id),
  } as AtividadeTemplate
}

export async function deleteAtividadeTemplate(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('atividade_templates')
    .update({ deleted_at: new Date().toISOString(), ativo: false })
    .eq('id', id)

  if (error) {
    console.error('[Atividades] Erro ao excluir template:', error)
    return false
  }

  return true
}

// ============================================================
// Sessoes de tempo (atividade_sessoes)
// ============================================================

export interface AtividadeSessao {
  id: string
  atividade_funcionario_id: string
  inicio_at: string
  fim_at: string | null
  duracao_segundos: number | null
  trabalhada: boolean
  motivo_pausa: string | null
  created_at: string
  // Joined (via RPC)
  funcionario_nome?: string | null
  funcionario_id?: string | null
  atividade_id?: string | null
  atividade_titulo?: string | null
}

export async function getSessoesByAtividade(atividadeId: string): Promise<AtividadeSessao[]> {
  const { data: afs, error: afError } = await supabase
    .from('atividade_funcionarios')
    .select('id, funcionario_id, funcionario:funcionarios(nome)')
    .eq('atividade_id', atividadeId)

  if (afError) {
    console.error('[Atividades] Erro ao buscar afs para sessoes:', afError)
    return []
  }

  if (!afs || afs.length === 0) return []

  const afIds = afs.map((af) => af.id)
  const nomeByAf: Record<string, { nome: string | null; fid: string | null }> = {}
  for (const af of afs as any[]) {
    nomeByAf[af.id] = { nome: af.funcionario?.nome || null, fid: af.funcionario_id || null }
  }

  const { data: sessoes, error: sError } = await supabase
    .from('atividade_sessoes')
    .select('*')
    .in('atividade_funcionario_id', afIds)
    .order('inicio_at', { ascending: true })

  if (sError) {
    console.error('[Atividades] Erro ao buscar sessoes:', sError)
    return []
  }

  return (sessoes || []).map((s: any) => ({
    ...s,
    funcionario_nome: nomeByAf[s.atividade_funcionario_id]?.nome || null,
    funcionario_id: nomeByAf[s.atividade_funcionario_id]?.fid || null,
  })) as AtividadeSessao[]
}

export async function getSessoesAbertasByFazenda(fazendaId: string): Promise<AtividadeSessao[]> {
  const { data, error } = await supabase
    .rpc('get_sessoes_abertas_by_fazenda', { p_fazenda_id: fazendaId })

  if (error) {
    console.error('[Atividades] Erro ao buscar sessoes abertas:', error)
    return []
  }

  return (data || []) as AtividadeSessao[]
}

// ============================================================
// Imprevistos (atividade_imprevistos)
// ============================================================

export interface AtividadeImprevisto {
  id: string
  atividade_funcionario_id: string
  tipo: string
  descricao: string | null
  ocorrido_at: string
  impacto_minutos: number | null
  created_at: string
  // Joined (via RPC)
  funcionario_nome?: string | null
  funcionario_id?: string | null
  atividade_id?: string | null
  atividade_titulo?: string | null
}

export async function getImprevistosByAtividade(atividadeId: string): Promise<AtividadeImprevisto[]> {
  const { data: afs, error: afError } = await supabase
    .from('atividade_funcionarios')
    .select('id, funcionario_id, funcionario:funcionarios(nome)')
    .eq('atividade_id', atividadeId)

  if (afError) {
    console.error('[Atividades] Erro ao buscar afs para imprevistos:', afError)
    return []
  }

  if (!afs || afs.length === 0) return []

  const afIds = afs.map((af) => af.id)
  const nomeByAf: Record<string, { nome: string | null; fid: string | null }> = {}
  for (const af of afs as any[]) {
    nomeByAf[af.id] = { nome: af.funcionario?.nome || null, fid: af.funcionario_id || null }
  }

  const { data: imprevistos, error: iError } = await supabase
    .from('atividade_imprevistos')
    .select('*')
    .in('atividade_funcionario_id', afIds)
    .order('ocorrido_at', { ascending: false })

  if (iError) {
    console.error('[Atividades] Erro ao buscar imprevistos:', iError)
    return []
  }

  return (imprevistos || []).map((i: any) => ({
    ...i,
    funcionario_nome: nomeByAf[i.atividade_funcionario_id]?.nome || null,
    funcionario_id: nomeByAf[i.atividade_funcionario_id]?.fid || null,
  })) as AtividadeImprevisto[]
}

export async function getImprevistosRecentesByFazenda(
  fazendaId: string,
  dias = 7
): Promise<AtividadeImprevisto[]> {
  const dataInicio = new Date()
  dataInicio.setDate(dataInicio.getDate() - dias)

  const { data, error } = await supabase
    .rpc('get_imprevistos_recentes_by_fazenda', {
      p_fazenda_id: fazendaId,
      p_data_inicio: dataInicio.toISOString(),
    })

  if (error) {
    console.error('[Atividades] Erro ao buscar imprevistos recentes:', error)
    return []
  }

  return (data || []) as AtividadeImprevisto[]
}

// ============================================================
// Categorias de imprevisto (atividade_imprevisto_categorias)
// ============================================================

export interface ImprevistoCategoria {
  id: string
  nome: string
  ativo: boolean
}

export async function getImprevistoCategorias(fazendaId: string): Promise<ImprevistoCategoria[]> {
  const { data, error } = await supabase
    .from('atividade_imprevisto_categorias')
    .select('id, nome, ativo')
    .eq('fazenda_id', fazendaId)
    .order('nome', { ascending: true })

  if (error) {
    console.error('[Atividades] Erro ao buscar categorias de imprevisto:', error)
    return []
  }

  return (data || []) as ImprevistoCategoria[]
}

export async function createImprevistoCategoria(
  fazendaId: string,
  nome: string
): Promise<ImprevistoCategoria | null> {
  const { data, error } = await supabase
    .from('atividade_imprevisto_categorias')
    .insert({ fazenda_id: fazendaId, nome: nome.trim() })
    .select('id, nome, ativo')
    .single()

  if (error) {
    console.error('[Atividades] Erro ao criar categoria de imprevisto:', error)
    return null
  }

  return data as ImprevistoCategoria
}

export async function updateImprevistoCategoria(
  id: string,
  payload: Partial<{ nome: string; ativo: boolean }>
): Promise<boolean> {
  const { error } = await supabase
    .from('atividade_imprevisto_categorias')
    .update(payload)
    .eq('id', id)

  if (error) {
    console.error('[Atividades] Erro ao atualizar categoria de imprevisto:', error)
    return false
  }

  return true
}

export async function deleteImprevistoCategoria(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('atividade_imprevisto_categorias')
    .update({ ativo: false })
    .eq('id', id)

  if (error) {
    console.error('[Atividades] Erro ao desativar categoria de imprevisto:', error)
    return false
  }

  return true
}
