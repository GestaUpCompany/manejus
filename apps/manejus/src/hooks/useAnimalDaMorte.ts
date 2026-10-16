import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@gestaup/supabase'
import { categoriasCompativeis } from '../utils/categoriasCompativeis'

export interface AnimalCandidatoMorte {
  id: string
  identificacao: string
}

export interface MorteParaAnimal {
  id: string
  fazenda_id: string
  lote_id?: string | null
  categoria?: string | null
}

interface LinhaIndividuo {
  id: string
  id_brinco?: string | null
  id_chip?: string | null
  id_manejo?: string | null
  id_provisorio_cria?: string | null
  categoria?: string | null
  lote_atual?: string | null
  localizacao_incerta_desde?: string | null
}

const rotulo = (i: LinhaIndividuo) => i.id_brinco || i.id_chip || i.id_manejo || i.id_provisorio_cria || 'Sem identificação'

/** Animais que podem ser o da morte: Vivos, da mesma categoria canônica, no lote da morte ou com localização incerta (mesma regra da RPC). */
export function useCandidatosMorte(morte: MorteParaAnimal, habilitado: boolean) {
  return useQuery({
    queryKey: ['morte-animal', 'candidatos', morte.id],
    enabled: habilitado && !!morte.categoria,
    queryFn: async (): Promise<AnimalCandidatoMorte[]> => {
      const { data, error } = await supabase
        .from('individuos')
        .select('id, id_brinco, id_chip, id_manejo, id_provisorio_cria, categoria, lote_atual, localizacao_incerta_desde')
        .eq('fazenda_id', morte.fazenda_id)
        .eq('status', 'Vivo')
        .is('deleted_at', null)
        .limit(1000)
      if (error) throw error
      const linhas = ((data ?? []) as LinhaIndividuo[]).filter(
        (l) => !morte.lote_id || !l.lote_atual || l.lote_atual === morte.lote_id || !!l.localizacao_incerta_desde
      )
      const compativeis = await categoriasCompativeis(
        morte.categoria!,
        linhas.map((l) => l.categoria).filter((c): c is string => !!c)
      )
      return linhas
        .filter((l) => !!l.categoria && compativeis.has(l.categoria))
        .map((l) => ({ id: l.id, identificacao: rotulo(l) }))
        .sort((a, b) => a.identificacao.localeCompare(b.identificacao, 'pt-BR', { numeric: true }))
    },
  })
}

function invalidar(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['morte-animal'] })
  queryClient.invalidateQueries({ queryKey: ['lotes'] })
  queryClient.invalidateQueries({ queryKey: ['individuos'] })
}

export function useVincularAnimalMorte(morte: MorteParaAnimal) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (individuoId: string) => {
      const { data, error } = await supabase.rpc('vincular_individuo_morte', {
        p_fazenda_id: morte.fazenda_id,
        p_morte_id: morte.id,
        p_individuo_id: individuoId,
      })
      if (error) throw new Error(error.message)
      const resposta = data as { success: boolean; error?: string } | null
      if (!resposta?.success) throw new Error(resposta?.error || 'Não foi possível informar o animal.')
    },
    onSuccess: () => invalidar(queryClient),
  })
}

export function useDesvincularAnimalMorte(morte: MorteParaAnimal) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('desvincular_individuo_morte', {
        p_fazenda_id: morte.fazenda_id,
        p_morte_id: morte.id,
      })
      if (error) throw new Error(error.message)
      const resposta = data as { success: boolean; error?: string } | null
      if (!resposta?.success) throw new Error(resposta?.error || 'Não foi possível desfazer a ligação.')
    },
    onSuccess: () => invalidar(queryClient),
  })
}
