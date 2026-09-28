import { supabase } from './supabaseClient'

export interface ExecucaoRotina {
  id: string
  fazenda_id: string
  funcionario_id: string
  funcionario_nome: string
  rotina_id: string | null
  caderneta_id: string
  data: string
  horario_programado: string | null
  primeiro_acesso: string | null
  primeiro_registro: string | null
  primeiro_acesso_local: string | null
  primeiro_registro_local: string | null
  status: StatusExecucao
  observacao: string | null
  concluido: boolean
  total?: number
}

export type StatusExecucao =
  | 'no_horario'
  | 'atrasado'
  | 'antecipado'
  | 'nao_executado'
  | 'dispensado'

export interface FiltrosExecucao {
  fazendaId: string
  dataInicio?: string
  dataFim?: string
  funcionarioId?: string
  cadernetaId?: string
  status?: StatusExecucao
  page?: number
  limit?: number
}

export interface PaginatedExecucoes {
  data: ExecucaoRotina[]
  total: number
  page: number
  limit: number
}

export interface ResumoDia {
  data: string
  programadas: number
  no_horario: number
  atrasadas: number
  antecipadas: number
  nao_executadas: number
  dispensadas: number
}

export interface HistoricoAlteracao {
  id: string
  execucao_rotina_id: string
  usuario_id: string
  acao: 'justificativa' | 'dispensa'
  motivo: string
  dados_anteriores: Record<string, any> | null
  created_at: string
}

export async function getExecucoes(filtros: FiltrosExecucao): Promise<PaginatedExecucoes> {
  const limit = filtros.limit || 20
  const page = filtros.page || 1
  const offset = (page - 1) * limit

  const { data, error } = await supabase.rpc('obter_execucoes_rotina', {
    p_fazenda_id: filtros.fazendaId,
    p_data_inicio: filtros.dataInicio || null,
    p_data_fim: filtros.dataFim || null,
    p_funcionario_id: filtros.funcionarioId || null,
    p_caderneta_id: filtros.cadernetaId || null,
    p_status: filtros.status || null,
    p_limit: limit,
    p_offset: offset,
  })

  if (error) {
    console.error('[AuditoriaRotinas] Erro ao buscar execuções:', error)
    return { data: [], total: 0, page, limit }
  }

  const rows = (data || []) as ExecucaoRotina[]
  const total = rows.length > 0 ? rows[0].total || 0 : 0

  return {
    data: rows.map((r) => ({
      ...r,
      status: r.status || 'nao_executado',
    })),
    total,
    page,
    limit,
  }
}

export async function getResumo(
  fazendaId: string,
  filtros: Omit<FiltrosExecucao, 'fazendaId' | 'page' | 'limit' | 'status'>
): Promise<ResumoDia[]> {
  const { data, error } = await supabase.rpc('resumo_execucoes_rotina', {
    p_fazenda_id: fazendaId,
    p_data_inicio: filtros.dataInicio || null,
    p_data_fim: filtros.dataFim || null,
    p_funcionario_id: filtros.funcionarioId || null,
    p_caderneta_id: filtros.cadernetaId || null,
  })

  if (error) {
    console.error('[AuditoriaRotinas] Erro ao buscar resumo:', error)
    return []
  }

  return (data || []) as ResumoDia[]
}

export async function justificarExecucao(
  execucaoId: string,
  motivo: string,
  dadosAnteriores?: Record<string, any>
): Promise<boolean> {
  const { data: userData } = await supabase.auth.getUser()
  const usuarioId = userData.user?.id
  if (!usuarioId) {
    console.error('[AuditoriaRotinas] Usuário não autenticado')
    return false
  }

  const { error: updateError } = await supabase
    .from('execucoes_rotina')
    .update({ observacao: motivo, updated_at: new Date().toISOString() })
    .eq('id', execucaoId)

  if (updateError) {
    console.error('[AuditoriaRotinas] Erro ao justificar execução:', updateError)
    return false
  }

  const { error: historyError } = await supabase.from('execucoes_rotina_historico').insert({
    execucao_rotina_id: execucaoId,
    usuario_id: usuarioId,
    acao: 'justificativa',
    motivo,
    dados_anteriores: dadosAnteriores || null,
  })

  if (historyError) {
    console.error('[AuditoriaRotinas] Erro ao registrar histórico:', historyError)
  }

  return true
}

export async function dispensarExecucao(
  payload: {
    fazenda_id: string
    funcionario_id: string
    caderneta_id: string
    data: string
    observacao: string
    rotina_id?: string | null
  },
  motivo: string
): Promise<boolean> {
  const { data: userData } = await supabase.auth.getUser()
  const usuarioId = userData.user?.id
  if (!usuarioId) {
    console.error('[AuditoriaRotinas] Usuário não autenticado')
    return false
  }

  const { data: inserida, error: insertError } = await supabase
    .from('execucoes_rotina')
    .insert({
      ...payload,
      status: 'dispensado',
    })
    .select()
    .single()

  if (insertError) {
    console.error('[AuditoriaRotinas] Erro ao dispensar execução:', insertError)
    return false
  }

  const { error: historyError } = await supabase.from('execucoes_rotina_historico').insert({
    execucao_rotina_id: inserida.id,
    usuario_id: usuarioId,
    acao: 'dispensa',
    motivo,
    dados_anteriores: null,
  })

  if (historyError) {
    console.error('[AuditoriaRotinas] Erro ao registrar histórico:', historyError)
  }

  return true
}

export async function getHistorico(execucaoId: string): Promise<HistoricoAlteracao[]> {
  const { data, error } = await supabase
    .from('execucoes_rotina_historico')
    .select('*')
    .eq('execucao_rotina_id', execucaoId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[AuditoriaRotinas] Erro ao buscar histórico:', error)
    return []
  }

  return (data || []) as HistoricoAlteracao[]
}
