import { useQuery } from '@tanstack/react-query'
import { supabase } from '@gestaup/supabase'
import { getFazendaIdForUser } from '../utils/fazendaContext'

export function useFazenda(userId: string | undefined) {
  return useQuery({
    queryKey: ['fazenda', userId],
    enabled: !!userId,
    queryFn: async () => {
      const fazendaId = await getFazendaIdForUser(userId!)
      if (!fazendaId) return null

      const { data } = await supabase
        .from('fazendas')
        .select('*')
        .eq('id', fazendaId)
        .single()

      return data
    },
  })
}
