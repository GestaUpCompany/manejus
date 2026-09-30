import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@gestaup/supabase'
import type { FpAtividade } from '../types/farmplan'

// ============ Leituras de apoio ============

export interface SetorFp {
  id: string
  fazenda_id: string
  nome: string
  ativo: boolean
  responsavel_id: string | null
}

export function useSetores(fazendaId: string | undefined) {
  return useQuery({
    queryKey: ['setores', fazendaId],
    enabled: !!fazendaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('setores')
        .select('id, fazenda_id, nome, ativo, responsavel_id')
        .eq('fazenda_id', fazendaId!)
        .is('deleted_at', null)
        .order('nome', { ascending: true })
      if (error) throw error
      return data as SetorFp[]
    },
  })
}

export function useAtividades(planoId: string | undefined) {
  return useQuery({
    queryKey: ['fp_atividades', planoId],
    enabled: !!planoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_atividades')
        .select('*')
        .eq('plano_id', planoId!)
        .is('deleted_at', null)
        .order('nome', { ascending: true })
      if (error) throw error
      return data as FpAtividade[]
    },
  })
}

// ============ Plano anual ============

export function useSavePlano() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      id?: string
      fazendaId: string
      ano: number
      semana1Inicio: string
    }) => {
      if (params.id) {
        const { error } = await supabase
          .from('fp_planos')
          .update({ ano: params.ano, semana1_inicio: params.semana1Inicio })
          .eq('id', params.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('fp_planos').insert({
          fazenda_id: params.fazendaId,
          ano: params.ano,
          semana1_inicio: params.semana1Inicio,
        })
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fp_plano_ativo'] }),
  })
}

// ============ Atividades ============

export interface AtividadeInput {
  id?: string
  plano_id: string
  fazenda_id: string
  nome: string
  local: string | null
  coordenador_id: string | null
  executor_funcionario_id: string | null
  executor_equipe_id: string | null
  setor_id: string | null
  tipo: number
  urgencia: number
  dias_semana: boolean[]
  metodologia: string | null
  maquinas: string | null
  materiais: string | null
  meta: string | null
  exige_sessao: boolean
}

export function useSaveAtividade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: AtividadeInput) => {
      const { id, ...dados } = input
      if (id) {
        const { error } = await supabase.from('fp_atividades').update(dados).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('fp_atividades').insert(dados)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fp_atividades'] })
      qc.invalidateQueries({ queryKey: ['fp_semana'] })
    },
  })
}

export function useDeleteAtividade() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('fp_atividades')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fp_atividades'] })
      qc.invalidateQueries({ queryKey: ['fp_semana'] })
    },
  })
}

// ============ Pessoas ============

export interface FuncionarioInput {
  id?: string
  fazenda_id: string
  nome: string
  apelido: string | null
  cargo: string | null
  setor_id: string | null
  superior_id: string | null
  farmplan_papel: string
  ativo: boolean
}

export function useSaveFuncionario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: FuncionarioInput) => {
      const { id, ...dados } = input
      if (id) {
        const { error } = await supabase.from('funcionarios').update(dados).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('funcionarios').insert(dados)
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fp_funcionarios'] }),
  })
}

export function useDeleteFuncionario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('funcionarios')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fp_funcionarios'] }),
  })
}

// ============ Equipes ============

export function useSaveEquipe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      id?: string
      fazendaId: string
      nome: string
      membroIds: string[]
    }) => {
      let equipeId = params.id
      if (equipeId) {
        const { error } = await supabase
          .from('fp_equipes')
          .update({ nome: params.nome })
          .eq('id', equipeId)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('fp_equipes')
          .insert({ fazenda_id: params.fazendaId, nome: params.nome })
          .select('id')
          .single()
        if (error) throw error
        equipeId = data.id
      }

      const { data: atuais, error: rErr } = await supabase
        .from('fp_equipe_membros')
        .select('funcionario_id')
        .eq('equipe_id', equipeId)
      if (rErr) throw rErr
      const atuaisSet = new Set((atuais ?? []).map((m) => m.funcionario_id))
      const novosSet = new Set(params.membroIds)

      const paraRemover = [...atuaisSet].filter((id) => !novosSet.has(id))
      const paraAdicionar = [...novosSet].filter((id) => !atuaisSet.has(id))

      if (paraRemover.length) {
        const { error } = await supabase
          .from('fp_equipe_membros')
          .delete()
          .eq('equipe_id', equipeId)
          .in('funcionario_id', paraRemover)
        if (error) throw error
      }
      if (paraAdicionar.length) {
        const { error } = await supabase.from('fp_equipe_membros').insert(
          paraAdicionar.map((funcionario_id) => ({
            equipe_id: equipeId,
            funcionario_id,
            fazenda_id: params.fazendaId,
          })),
        )
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fp_equipes'] }),
  })
}

export function useDeleteEquipe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('fp_equipes')
        .update({ deleted_at: new Date().toISOString(), ativo: false })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fp_equipes'] }),
  })
}

// ============ Setores ============

export function useSaveSetor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      id?: string
      fazendaId: string
      nome: string
      responsavel_id: string | null
    }) => {
      if (params.id) {
        const { error } = await supabase
          .from('setores')
          .update({ nome: params.nome, responsavel_id: params.responsavel_id })
          .eq('id', params.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('setores')
          .insert({ fazenda_id: params.fazendaId, nome: params.nome, responsavel_id: params.responsavel_id })
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['setores'] }),
  })
}
