import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@gestaup/supabase'
import type {
  FpAtividade,
  FpAtividadeSemana,
  FpBaixa,
  FpEquipe,
  FpExtra,
  FpPlano,
  FuncionarioFp,
} from '../types/farmplan'

// ============ Plano anual ============

export function usePlanoAtivo(fazendaId: string | undefined) {
  return useQuery({
    queryKey: ['fp_plano_ativo', fazendaId],
    enabled: !!fazendaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_planos')
        .select('id, fazenda_id, ano, semana1_inicio, ativo')
        .eq('fazenda_id', fazendaId!)
        .eq('ativo', true)
        .is('deleted_at', null)
        .order('ano', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      if (!data) return null

      const { data: semanaAtual, error: semErr } = await supabase.rpc('fp_semana_atual', {
        p_plano_id: data.id,
      })
      if (semErr) throw semErr

      return { ...(data as FpPlano), semanaAtual: (semanaAtual as number) ?? 1 }
    },
  })
}

// ============ Pessoas / equipes ============

export function useFuncionariosFp(fazendaId: string | undefined) {
  return useQuery({
    queryKey: ['fp_funcionarios', fazendaId],
    enabled: !!fazendaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('funcionarios')
        .select('id, fazenda_id, nome, apelido, cargo, superior_id, setor_id, farmplan_papel, ativo')
        .eq('fazenda_id', fazendaId!)
        .is('deleted_at', null)
        .order('nome', { ascending: true })
      if (error) throw error
      return data as FuncionarioFp[]
    },
  })
}

export function useEquipesFp(fazendaId: string | undefined) {
  return useQuery({
    queryKey: ['fp_equipes', fazendaId],
    enabled: !!fazendaId,
    queryFn: async () => {
      const { data: equipes, error } = await supabase
        .from('fp_equipes')
        .select('id, fazenda_id, nome, ativo')
        .eq('fazenda_id', fazendaId!)
        .eq('ativo', true)
        .order('nome', { ascending: true })
      if (error) throw error

      const { data: membros, error: mErr } = await supabase
        .from('fp_equipe_membros')
        .select('equipe_id, funcionario_id')
      if (mErr) throw mErr

      const membrosPorEquipe = new Map<string, string[]>()
      for (const m of membros ?? []) {
        const arr = membrosPorEquipe.get(m.equipe_id) ?? []
        arr.push(m.funcionario_id)
        membrosPorEquipe.set(m.equipe_id, arr)
      }

      return (equipes as FpEquipe[]).map((e) => ({
        ...e,
        membros: membrosPorEquipe.get(e.id) ?? [],
      }))
    },
  })
}

// ============ Dados de uma semana ============

export interface SemanaDados {
  atividades: FpAtividade[]
  semanas: FpAtividadeSemana[]
  baixas: FpBaixa[]
  extras: FpExtra[]
}

export function useSemanaDados(
  fazendaId: string | undefined,
  planoId: string | undefined,
  semana: number,
) {
  return useQuery({
    queryKey: ['fp_semana', fazendaId, planoId, semana],
    enabled: !!fazendaId && !!planoId && semana >= 1,
    queryFn: async (): Promise<SemanaDados> => {
      const [ativos, semanas, baixas, extras] = await Promise.all([
        supabase
          .from('fp_atividades')
          .select('*')
          .eq('plano_id', planoId!)
          .eq('ativo', true)
          .is('deleted_at', null)
          .order('nome', { ascending: true }),
        supabase
          .from('fp_atividade_semanas')
          .select('*')
          .eq('fazenda_id', fazendaId!)
          .eq('semana', semana),
        supabase
          .from('fp_atividade_baixas')
          .select('*')
          .eq('fazenda_id', fazendaId!)
          .eq('semana', semana),
        supabase
          .from('fp_extras')
          .select('*')
          .eq('fazenda_id', fazendaId!)
          .eq('semana', semana),
      ])
      if (ativos.error) throw ativos.error
      if (semanas.error) throw semanas.error
      if (baixas.error) throw baixas.error
      if (extras.error) throw extras.error

      return {
        atividades: ativos.data as FpAtividade[],
        semanas: semanas.data as FpAtividadeSemana[],
        baixas: baixas.data as FpBaixa[],
        extras: extras.data as FpExtra[],
      }
    },
  })
}

/** Todas as linhas de semana das atividades de um plano (grade anual). */
export function usePlanoSemanas(
  fazendaId: string | undefined,
  planoId: string | undefined,
  atividadeIds: string[] | undefined,
) {
  return useQuery({
    queryKey: ['fp_plano_anual', fazendaId, planoId],
    enabled: !!fazendaId && !!planoId && !!atividadeIds && atividadeIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_atividade_semanas')
        .select('*')
        .eq('fazenda_id', fazendaId!)
        .in('atividade_id', atividadeIds!)
      if (error) throw error
      return data as FpAtividadeSemana[]
    },
  })
}

// ============ Mutations ============

export function useFpSetDia() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      atividadeId: string
      semana: number
      dia: number
      feita: boolean
      observacao?: string
      usuarioId?: string
    }) => {
      const { error } = await supabase.rpc('fp_set_dia', {
        p_atividade_id: params.atividadeId,
        p_semana: params.semana,
        p_dia: params.dia,
        p_feita: params.feita,
        p_observacao: params.observacao ?? null,
        p_feita_por_usuario_id: params.usuarioId ?? null,
      })
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['fp_semana'] })
      qc.invalidateQueries({ queryKey: ['fp_atividade', v.atividadeId] })
    },
  })
}

export function useFpSetStatusSemana() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      atividadeId: string
      semana: number
      status: number
      usuarioId?: string
    }) => {
      const { error } = await supabase.rpc('fp_set_status_semana', {
        p_atividade_id: params.atividadeId,
        p_semana: params.semana,
        p_status: params.status,
        p_feita_por_usuario_id: params.usuarioId ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fp_semana'] })
      qc.invalidateQueries({ queryKey: ['fp_plano_anual'] })
    },
  })
}

/** Observação da semana de uma atividade (RPC preserva o status existente). */
export function useSaveObsSemana() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      atividadeId: string
      semana: number
      observacao: string | null
    }) => {
      const { error } = await supabase.rpc('fp_set_obs_semana', {
        p_atividade_id: params.atividadeId,
        p_semana: params.semana,
        p_observacao: params.observacao,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fp_semana'] }),
  })
}
