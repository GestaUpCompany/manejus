import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@gestaup/supabase'
import { linhasParaDesignacoes, type DesignacaoPendente, type LinhaDesignacao } from '../utils/designacoesLote'

const TAMANHO_PAGINA = 1000

/** Pendências de designação de lote abertas (manejo de curral), com o animal e os nomes dos lotes. */
export function useDesignacoesLote(fazendaId: string | undefined) {
  return useQuery({
    queryKey: ['lotes', 'designacoes', fazendaId],
    enabled: !!fazendaId,
    queryFn: async (): Promise<DesignacaoPendente[]> => {
      const linhas: LinhaDesignacao[] = []
      for (let inicio = 0; ; inicio += TAMANHO_PAGINA) {
        const { data, error } = await supabase
          .from('pendencias_designacao_lote')
          .select(
            'id, individuo_id, lote_origem_id, lote_destino_id, created_at, individuo:individuos(id_brinco, id_chip, id_manejo, id_provisorio_cria, categoria), origem:lotes!pendencias_designacao_lote_lote_origem_id_fkey(nome), destino:lotes!pendencias_designacao_lote_lote_destino_id_fkey(nome)'
          )
          .eq('fazenda_id', fazendaId!)
          .eq('status', 'aberta')
          .order('created_at', { ascending: true })
          .range(inicio, inicio + TAMANHO_PAGINA - 1)
        if (error) throw error
        const pagina = (data ?? []) as unknown as LinhaDesignacao[]
        linhas.push(...pagina)
        if (pagina.length < TAMANHO_PAGINA) break
      }
      return linhasParaDesignacoes(linhas)
    },
  })
}

function invalidar(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['lotes'] })
  queryClient.invalidateQueries({ queryKey: ['individuos'] })
  queryClient.invalidateQueries({ queryKey: ['movimentacao-animais'] })
}

interface ResultadoRpc {
  success: boolean
  error?: string
  movimentados?: number
  descartadas?: number
}

/** Confirma um grupo (mesma origem, destino e categoria): gera a movimentação agregada e liga os animais a ela. */
export function useConfirmarDesignacoes(fazendaId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (pendenciaIds: string[]): Promise<number> => {
      const { data, error } = await supabase.rpc('confirmar_designacao_lote', {
        p_fazenda_id: fazendaId!,
        p_pendencia_ids: pendenciaIds,
      })
      if (error) throw new Error(error.message)
      const r = data as ResultadoRpc | null
      if (!r?.success) throw new Error(r?.error || 'Não foi possível confirmar a designação.')
      return r.movimentados ?? 0
    },
    onSuccess: () => invalidar(queryClient),
  })
}

/** Descarta as pendências sem mexer em lote, contagem nem animais. */
export function useDescartarDesignacoes(fazendaId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (pendenciaIds: string[]): Promise<number> => {
      const { data, error } = await supabase.rpc('descartar_designacao_lote', {
        p_fazenda_id: fazendaId!,
        p_pendencia_ids: pendenciaIds,
      })
      if (error) throw new Error(error.message)
      const r = data as ResultadoRpc | null
      if (!r?.success) throw new Error(r?.error || 'Não foi possível descartar a designação.')
      return r.descartadas ?? 0
    },
    onSuccess: () => invalidar(queryClient),
  })
}
