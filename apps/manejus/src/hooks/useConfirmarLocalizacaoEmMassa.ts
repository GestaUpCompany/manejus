import { useMutation } from '@tanstack/react-query'
import { supabase } from '@gestaup/supabase'
import type { GrupoConfirmacao } from '../utils/confirmacaoLocalizacao'

export interface ResultadoConfirmacao {
  atualizados: number
  ignorados: number
}

/** Confirma que os animais continuam no lote em que constam (um lote por chamada da RPC confirmar_localizacao_individuos). */
export function useConfirmarLocalizacaoEmMassa(fazendaId: string | undefined) {
  return useMutation({
    mutationFn: async (grupos: GrupoConfirmacao[]): Promise<ResultadoConfirmacao> => {
      let atualizados = 0
      let ignorados = 0
      for (const g of grupos) {
        const { data, error } = await supabase.rpc('confirmar_localizacao_individuos', {
          p_fazenda_id: fazendaId!,
          p_lote_id: g.loteId,
          p_individuo_ids: g.ids,
        })
        if (error) throw new Error(error.message)
        const r = data as { success: boolean; error?: string; atualizados?: number; ignorados?: number } | null
        if (!r?.success) throw new Error(r?.error || 'Não foi possível confirmar a localização.')
        atualizados += r.atualizados ?? 0
        ignorados += r.ignorados ?? 0
      }
      return { atualizados, ignorados }
    },
  })
}
