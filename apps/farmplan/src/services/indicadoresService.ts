import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@gestaup/supabase'
import type { FpIndicador, FpIndicadorValor } from '../types/farmplan'

export function useIndicadores(fazendaId: string | undefined) {
  return useQuery({
    queryKey: ['fp_indicadores', fazendaId],
    enabled: !!fazendaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_indicadores')
        .select('*')
        .eq('fazenda_id', fazendaId!)
        .eq('ativo', true)
        .is('deleted_at', null)
        .order('ordem', { ascending: true })
      if (error) throw error
      return data as FpIndicador[]
    },
  })
}

export function useIndicadorValores(fazendaId: string | undefined, ano: number | undefined) {
  return useQuery({
    queryKey: ['fp_indicador_valores', fazendaId, ano],
    enabled: !!fazendaId && !!ano,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_indicador_valores')
        .select('*')
        .eq('fazenda_id', fazendaId!)
        .eq('ano', ano!)
      if (error) throw error
      return data as FpIndicadorValor[]
    },
  })
}

export function useSaveIndicadorValor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      indicadorId: string
      fazendaId: string
      ano: number
      mes: number
      valor: number | null
      usuarioId: string
    }) => {
      const { error } = await supabase.from('fp_indicador_valores').upsert(
        {
          indicador_id: params.indicadorId,
          fazenda_id: params.fazendaId,
          ano: params.ano,
          mes: params.mes,
          valor: params.valor,
          lancado_por: params.usuarioId,
          lancado_at: new Date().toISOString(),
        },
        { onConflict: 'indicador_id,ano,mes' },
      )
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fp_indicador_valores'] }),
  })
}
