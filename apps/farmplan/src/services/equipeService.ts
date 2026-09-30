import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@gestaup/supabase'
import type { FpAvaliacao, FpContratoItem } from '../types/farmplan'

export interface FpCriterio {
  id: string
  fazenda_id: string | null
  nome: string
  ordem: number
  ativo: boolean
}

export function useContratoItens(funcionarioId: string | undefined) {
  return useQuery({
    queryKey: ['fp_contrato', funcionarioId],
    enabled: !!funcionarioId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_contrato_itens')
        .select('*')
        .eq('funcionario_id', funcionarioId!)
        .is('deleted_at', null)
        .order('ordem', { ascending: true })
      if (error) throw error
      return data as FpContratoItem[]
    },
  })
}

/** Critérios globais (fazenda_id null) + customizações da fazenda. */
export function useCriterios(fazendaId: string | undefined) {
  return useQuery({
    queryKey: ['fp_criterios', fazendaId],
    enabled: !!fazendaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_criterios')
        .select('id, fazenda_id, nome, ordem, ativo')
        .or(`fazenda_id.is.null,fazenda_id.eq.${fazendaId}`)
        .eq('ativo', true)
        .order('ordem', { ascending: true })
      if (error) throw error
      return data as FpCriterio[]
    },
  })
}

/** Contratos de todos os funcionários da fazenda (uma query para a página de avaliação). */
export function useContratosFazenda(fazendaId: string | undefined) {
  return useQuery({
    queryKey: ['fp_contratos_fazenda', fazendaId],
    enabled: !!fazendaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_contrato_itens')
        .select('*')
        .eq('fazenda_id', fazendaId!)
        .eq('ativo', true)
        .is('deleted_at', null)
        .order('ordem', { ascending: true })
      if (error) throw error
      return data as FpContratoItem[]
    },
  })
}

export function useAvaliacoesSemana(
  fazendaId: string | undefined,
  ano: number | undefined,
  semana: number | undefined,
) {
  return useQuery({
    queryKey: ['fp_avaliacoes', fazendaId, ano, semana],
    enabled: !!fazendaId && !!ano && !!semana,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_avaliacoes')
        .select('*')
        .eq('fazenda_id', fazendaId!)
        .eq('ano', ano!)
        .eq('semana', semana!)
      if (error) throw error
      return data as FpAvaliacao[]
    },
  })
}

export function useSaveAvaliacao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      contratoItemId: string
      funcionarioId: string
      fazendaId: string
      ano: number
      semana: number
      nota: number | null
      nsa: boolean
      avaliadorUsuarioId: string
    }) => {
      const { error } = await supabase.from('fp_avaliacoes').upsert(
        {
          contrato_item_id: params.contratoItemId,
          funcionario_id: params.funcionarioId,
          fazenda_id: params.fazendaId,
          ano: params.ano,
          semana: params.semana,
          nota: params.nsa ? null : params.nota,
          nsa: params.nsa,
          avaliador_usuario_id: params.avaliadorUsuarioId,
          avaliado_at: new Date().toISOString(),
        },
        { onConflict: 'contrato_item_id,ano,semana' },
      )
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fp_avaliacoes'] })
      qc.invalidateQueries({ queryKey: ['fp_avaliacoes_ano'] })
    },
  })
}

export function useSaveContratoItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      id?: string
      funcionarioId: string
      fazendaId: string
      tipo: 'tarefa' | 'comportamento'
      descricao: string
      criterioId?: string | null
      ordem?: number
    }) => {
      if (params.id) {
        const { error } = await supabase
          .from('fp_contrato_itens')
          .update({ descricao: params.descricao, ordem: params.ordem })
          .eq('id', params.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('fp_contrato_itens').insert({
          funcionario_id: params.funcionarioId,
          fazenda_id: params.fazendaId,
          tipo: params.tipo,
          descricao: params.descricao,
          criterio_id: params.criterioId ?? null,
          ordem: params.ordem ?? 0,
        })
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fp_contrato'] })
      qc.invalidateQueries({ queryKey: ['fp_contratos_fazenda'] })
    },
  })
}

export function useDeleteContratoItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('fp_contrato_itens')
        .update({ deleted_at: new Date().toISOString(), ativo: false })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fp_contrato'] })
      qc.invalidateQueries({ queryKey: ['fp_contratos_fazenda'] })
    },
  })
}

export function useAvaliacoesAno(fazendaId: string | undefined, ano: number | undefined) {
  return useQuery({
    queryKey: ['fp_avaliacoes_ano', fazendaId, ano],
    enabled: !!fazendaId && !!ano,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_avaliacoes')
        .select('*')
        .eq('fazenda_id', fazendaId!)
        .eq('ano', ano!)
      if (error) throw error
      return data as FpAvaliacao[]
    },
  })
}

/** Escore semanal: média das notas (ignora NSA). null se não há avaliação na semana. */
export function escorePorSemana(avaliacoes: FpAvaliacao[]): Map<number, number> {
  const porSemana = new Map<number, { soma: number; n: number }>()
  for (const a of avaliacoes) {
    if (a.nsa || a.nota === null) continue
    const acc = porSemana.get(a.semana) ?? { soma: 0, n: 0 }
    acc.soma += Number(a.nota)
    acc.n += 1
    porSemana.set(a.semana, acc)
  }
  const out = new Map<number, number>()
  for (const [sem, acc] of porSemana) out.set(sem, acc.soma / acc.n)
  return out
}
