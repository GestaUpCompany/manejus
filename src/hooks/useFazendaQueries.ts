import { useQuery } from '@tanstack/react-query'
import { supabase } from '../services/supabaseClient'

/**
 * Hook para listar lotes de uma fazenda.
 * Retorna todos os lotes não deletados (id, nome, ativo) ordenados por nome.
 * Pages podem filtrar por ativo client-side: `lotes.filter(l => l.ativo)`.
 */
export function useLotes(fazendaId: string | undefined) {
  return useQuery({
    queryKey: ['lotes', fazendaId],
    enabled: !!fazendaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lotes')
        .select('id, nome, ativo')
        .eq('fazenda_id', fazendaId!)
        .is('deleted_at', null)
        .order('nome', { ascending: true })
      if (error) throw error
      return data as { id: string; nome: string; ativo: boolean }[]
    },
  })
}

/**
 * Hook para listar pastos de uma fazenda.
 * Retorna todos os pastos não deletados (id, nome, ativo) ordenados por nome.
 * Pages podem filtrar por ativo client-side: `pastos.filter(p => p.ativo)`.
 */
export function usePastos(fazendaId: string | undefined) {
  return useQuery({
    queryKey: ['pastos', fazendaId],
    enabled: !!fazendaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pastos')
        .select('id, nome, ativo')
        .eq('fazenda_id', fazendaId!)
        .is('deleted_at', null)
        .order('nome', { ascending: true })
      if (error) throw error
      return data as { id: string; nome: string; ativo: boolean }[]
    },
  })
}

/**
 * Hook para listar currais de uma fazenda.
 * Retorna todos os currais não deletados (id, nome, linha_id, ativo) ordenados por nome.
 * Pages podem filtrar por ativo client-side: `currais.filter(c => c.ativo)`.
 */
export function useCurrais(fazendaId: string | undefined) {
  return useQuery({
    queryKey: ['currais', fazendaId],
    enabled: !!fazendaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('currais')
        .select('id, nome, linha_id, ativo')
        .eq('fazenda_id', fazendaId!)
        .is('deleted_at', null)
        .order('nome', { ascending: true })
      if (error) throw error
      return data as { id: string; nome: string; linha_id: string | null; ativo: boolean }[]
    },
  })
}
