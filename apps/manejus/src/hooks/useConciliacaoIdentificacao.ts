import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@gestaup/supabase'
import type { LinhaConciliacao } from '../utils/conciliacaoIdentificacao'

export interface IndividuoSemCategoria {
  individuo_id: string
  lote_id: string
  categoria: string
  motivo: string
  identificacao: string
}

const TAMANHO_PAGINA = 1000

/** Conciliação por lote/categoria (identificados × agregado). Pagina por causa do limite de 1000 linhas do PostgREST. */
export function useConciliacaoLotes(fazendaId: string | undefined) {
  return useQuery({
    // começa com 'lotes' para ser invalidada junto com baixa, exclusão e confirmação de localização
    queryKey: ['lotes', 'conciliacao', fazendaId],
    enabled: !!fazendaId,
    queryFn: async (): Promise<LinhaConciliacao[]> => {
      const linhas: LinhaConciliacao[] = []
      for (let inicio = 0; ; inicio += TAMANHO_PAGINA) {
        const { data, error } = await supabase
          .from('vw_lote_categoria_identificacao')
          .select('lote_categoria_id, lote_id, lote_nome, categoria, quant_atual, identificados, incertos, nao_identificados, confirmados, divergencia')
          .eq('fazenda_id', fazendaId!)
          .gt('identificados', 0)
          .order('lote_categoria_id', { ascending: true })
          .range(inicio, inicio + TAMANHO_PAGINA - 1)
        if (error) throw error
        const pagina = (data ?? []) as LinhaConciliacao[]
        linhas.push(...pagina)
        if (pagina.length < TAMANHO_PAGINA) break
      }
      return linhas
    },
  })
}

/** Animais Vivos cujo lote não tem a categoria deles (fila de pendências). */
export function useIndividuosSemCategoria(fazendaId: string | undefined) {
  return useQuery({
    queryKey: ['lotes', 'sem-categoria', fazendaId],
    enabled: !!fazendaId,
    queryFn: async (): Promise<IndividuoSemCategoria[]> => {
      const { data, error } = await supabase
        .from('vw_individuos_sem_categoria_resolvida')
        .select('individuo_id, lote_id, categoria, motivo')
        .eq('fazenda_id', fazendaId!)
        .limit(200)
      if (error) throw error
      const linhas = (data ?? []) as Omit<IndividuoSemCategoria, 'identificacao'>[]
      if (linhas.length === 0) return []
      const { data: inds, error: erroInds } = await supabase
        .from('individuos')
        .select('id, id_brinco, id_chip, id_manejo, id_provisorio_cria')
        .in('id', linhas.map((l) => l.individuo_id))
      if (erroInds) throw erroInds
      const rotulos = new Map(
        ((inds ?? []) as { id: string; id_brinco?: string | null; id_chip?: string | null; id_manejo?: string | null; id_provisorio_cria?: string | null }[]).map((i) => [
          i.id,
          i.id_brinco || i.id_chip || i.id_manejo || i.id_provisorio_cria || 'Sem identificação',
        ])
      )
      return linhas.map((l) => ({ ...l, identificacao: rotulos.get(l.individuo_id) ?? 'Sem identificação' }))
    },
  })
}

export type ModoIdentificacao = 'agregado' | 'parcial' | 'individual'

export interface LoteModo {
  id: string
  nome: string
  modo_identificacao: ModoIdentificacao
}

/** Modo de identificação dos lotes ativos da fazenda. */
export function useModosIdentificacao(fazendaId: string | undefined) {
  return useQuery({
    queryKey: ['lotes', 'modos-identificacao', fazendaId],
    enabled: !!fazendaId,
    queryFn: async (): Promise<LoteModo[]> => {
      const { data, error } = await supabase
        .from('lotes')
        .select('id, nome, modo_identificacao')
        .eq('fazenda_id', fazendaId!)
        .eq('ativo', true)
        .order('nome', { ascending: true })
      if (error) throw error
      return (data ?? []) as LoteModo[]
    },
  })
}

/** Define o modo; o banco recusa 'individual' enquanto houver animal sem identificação/confirmação no lote. */
export function useDefinirModoIdentificacao(fazendaId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ loteId, modo }: { loteId: string; modo: ModoIdentificacao }) => {
      const { data, error } = await supabase.rpc('definir_modo_identificacao', {
        p_fazenda_id: fazendaId!,
        p_lote_id: loteId,
        p_modo: modo,
      })
      if (error) throw new Error(error.message)
      const resposta = data as { success: boolean; error?: string } | null
      if (!resposta?.success) throw new Error(resposta?.error || 'Não foi possível definir o modo.')
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['lotes'] }),
  })
}
