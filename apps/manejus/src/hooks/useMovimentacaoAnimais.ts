import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@gestaup/supabase'
import { categoriasCompativeis } from '../utils/categoriasCompativeis'

export interface AnimalDaMovimentacao {
  id: string
  identificacao: string
}

interface LinhaIndividuo {
  id: string
  id_brinco?: string | null
  id_chip?: string | null
  id_manejo?: string | null
  id_provisorio_cria?: string | null
  categoria?: string | null
}

const rotulo = (i: LinhaIndividuo) => i.id_brinco || i.id_chip || i.id_manejo || i.id_provisorio_cria || 'Sem identificação'

export interface MovimentacaoParaAnimais {
  id: string
  fazenda_id: string
  os_id?: string | null
  individuo_id?: string | null
  motivo_movimentacao?: string | null
  lote_origem_id?: string | null
  lote_destino_id?: string | null
  categoria?: string | null
  numero_cabecas?: number | null
}

/** Mesma regra da RPC vincular_individuos_movimentacao: só apartação por contagem entre lotes aceita informar os animais. */
export function movimentacaoAceitaAnimais(m: MovimentacaoParaAnimais): boolean {
  return (
    !m.os_id &&
    !m.individuo_id &&
    (m.motivo_movimentacao === 'Saída' || m.motivo_movimentacao === 'Entrevero') &&
    !!m.lote_origem_id &&
    !!m.lote_destino_id &&
    m.lote_origem_id !== m.lote_destino_id &&
    !!m.categoria &&
    (m.numero_cabecas ?? 0) > 0
  )
}

/** Animais já ligados à movimentação (tabela-ponte evento_individuos). */
export function useAnimaisDaMovimentacao(movimentacaoId: string | undefined) {
  return useQuery({
    queryKey: ['movimentacao-animais', 'ligados', movimentacaoId],
    enabled: !!movimentacaoId,
    queryFn: async (): Promise<AnimalDaMovimentacao[]> => {
      const { data, error } = await supabase
        .from('evento_individuos')
        .select('individuo_id')
        .eq('evento_id', movimentacaoId!)
      if (error) throw error
      const ids = ((data ?? []) as { individuo_id: string }[]).map((l) => l.individuo_id)
      if (ids.length === 0) return []
      const { data: inds, error: erroInds } = await supabase
        .from('individuos')
        .select('id, id_brinco, id_chip, id_manejo, id_provisorio_cria')
        .in('id', ids)
      if (erroInds) throw erroInds
      return ((inds ?? []) as LinhaIndividuo[])
        .map((i) => ({ id: i.id, identificacao: rotulo(i) }))
        .sort((a, b) => a.identificacao.localeCompare(b.identificacao, 'pt-BR', { numeric: true }))
    },
  })
}

/** Animais que podem ser ligados: Vivos, no lote de origem ou destino, da mesma categoria (pelo domínio) e ainda não ligados. */
export function useCandidatosMovimentacao(m: MovimentacaoParaAnimais, ligados: AnimalDaMovimentacao[] | undefined, habilitado: boolean) {
  return useQuery({
    queryKey: ['movimentacao-animais', 'candidatos', m.id, ligados?.length ?? 0],
    enabled: habilitado && !!ligados,
    queryFn: async (): Promise<AnimalDaMovimentacao[]> => {
      const { data, error } = await supabase
        .from('individuos')
        .select('id, id_brinco, id_chip, id_manejo, id_provisorio_cria, categoria')
        .eq('fazenda_id', m.fazenda_id)
        .eq('status', 'Vivo')
        .is('deleted_at', null)
        .in('lote_atual', [m.lote_origem_id!, m.lote_destino_id!])
        .limit(1000)
      if (error) throw error
      const linhas = (data ?? []) as LinhaIndividuo[]

      const compativeis = await categoriasCompativeis(
        m.categoria!,
        linhas.map((l) => l.categoria).filter((c): c is string => !!c)
      )

      const jaLigados = new Set((ligados ?? []).map((a) => a.id))
      return linhas
        .filter((l) => !jaLigados.has(l.id) && !!l.categoria && compativeis.has(l.categoria))
        .map((l) => ({ id: l.id, identificacao: rotulo(l) }))
        .sort((a, b) => a.identificacao.localeCompare(b.identificacao, 'pt-BR', { numeric: true }))
    },
  })
}

function invalidar(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['movimentacao-animais'] })
  queryClient.invalidateQueries({ queryKey: ['lotes'] })
  queryClient.invalidateQueries({ queryKey: ['individuos'] })
}

export function useVincularAnimais(m: MovimentacaoParaAnimais) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, confirmarRestantes }: { ids: string[]; confirmarRestantes: boolean }) => {
      const { data, error } = await supabase.rpc('vincular_individuos_movimentacao', {
        p_fazenda_id: m.fazenda_id,
        p_movimentacao_id: m.id,
        p_individuo_ids: ids,
        p_confirmar_restantes: confirmarRestantes,
      })
      if (error) throw new Error(error.message)
      const resposta = data as { success: boolean; error?: string; vinculados?: number; restantes_confirmados?: number } | null
      if (!resposta?.success) throw new Error(resposta?.error || 'Não foi possível informar os animais.')
      return resposta
    },
    onSuccess: () => invalidar(queryClient),
  })
}

export function useDesvincularAnimal(m: MovimentacaoParaAnimais) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (individuoId: string) => {
      const { data, error } = await supabase.rpc('desvincular_individuo_movimentacao', {
        p_fazenda_id: m.fazenda_id,
        p_movimentacao_id: m.id,
        p_individuo_id: individuoId,
      })
      if (error) throw new Error(error.message)
      const resposta = data as { success: boolean; error?: string } | null
      if (!resposta?.success) throw new Error(resposta?.error || 'Não foi possível desfazer a ligação.')
    },
    onSuccess: () => invalidar(queryClient),
  })
}
