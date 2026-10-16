import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@gestaup/supabase'
import { montarAplicacaoParaGravar, type FormAplicacao, type LinhaHistoricoSanitario, type MedicamentoCatalogo } from '../utils/sanidade'

export interface HistoricoSanitarioRow extends LinhaHistoricoSanitario {
  origem_id: string
  tipo: string | null
  principio_ativo: string | null
  dose: string | null
  diagnostico: string | null
}

/** Histórico sanitário unificado do animal (aplicações, enfermaria e maternidade), do mais recente ao mais antigo. */
export function useHistoricoSanitario(individuoId: string | undefined) {
  return useQuery({
    queryKey: ['sanidade', 'historico', individuoId],
    enabled: !!individuoId,
    queryFn: async (): Promise<HistoricoSanitarioRow[]> => {
      const { data, error } = await supabase
        .from('v_historico_sanitario_individuo')
        .select('origem, origem_id, data, tipo, medicamento_nome, principio_ativo, dose, diagnostico, liberacao_abate_em, proxima_aplicacao_em')
        .eq('individuo_id', individuoId!)
        .order('data', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as HistoricoSanitarioRow[]
    },
  })
}

/** Catálogo de medicamentos ativos da fazenda. */
export function useMedicamentosCatalogo(fazendaId: string | undefined) {
  return useQuery({
    queryKey: ['sanidade', 'catalogo', fazendaId],
    enabled: !!fazendaId,
    queryFn: async (): Promise<MedicamentoCatalogo[]> => {
      const { data, error } = await supabase
        .from('medicamentos')
        .select('id, nome_comercial, principio_ativo, dose_recomendada, carencia_abate_dias, intervalo_reaplicacao_dias')
        .eq('fazenda_id', fazendaId!)
        .eq('ativo', true)
        .is('deleted_at', null)
        .order('nome_comercial')
      if (error) throw error
      return (data ?? []) as MedicamentoCatalogo[]
    },
  })
}

export function useLancarAplicacao(fazendaId: string | undefined, individuoId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (form: FormAplicacao) => {
      const { error } = await supabase.from('aplicacoes_sanitarias').insert(montarAplicacaoParaGravar(form, fazendaId!, individuoId!))
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sanidade'] }),
  })
}

export function useExcluirAplicacao() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('aplicacoes_sanitarias').update({ deleted_at: new Date().toISOString() }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sanidade'] }),
  })
}
