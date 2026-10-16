import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@gestaup/supabase'
import type { AnimalLista } from '../utils/listaAnimaisIdentificacao'

export interface CategoriaDoLote {
  lote_categoria_id: string
  categoria: string
  quant_atual: number
  identificados: number
  confirmados: number
  incertos: number
}

export interface ErroLinha {
  linha: number
  mensagem: string
}

export interface ResultadoIdentificacao {
  success: boolean
  aplicado?: boolean
  error?: string
  erros?: ErroLinha[]
  criar?: number
  criados?: number
  quant_atual?: number
  confirmados_antes?: number
  confirmados_depois?: number
  excesso?: number
}

/** Categorias ativas do lote com a contagem do agregado e dos identificados (vw_lote_categoria_identificacao). */
export function useCategoriasDoLote(loteId: string | undefined) {
  return useQuery({
    queryKey: ['lotes', 'categorias-identificacao', loteId],
    enabled: !!loteId,
    queryFn: async (): Promise<CategoriaDoLote[]> => {
      const { data, error } = await supabase
        .from('vw_lote_categoria_identificacao')
        .select('lote_categoria_id, categoria, quant_atual, identificados, confirmados, incertos')
        .eq('lote_id', loteId!)
        .order('categoria', { ascending: true })
      if (error) throw error
      return (data ?? []) as CategoriaDoLote[]
    },
  })
}

/** Nomes das raças da fazenda (individuos.raca guarda o nome). */
export function useRacasFazenda(fazendaId: string | undefined) {
  return useQuery({
    queryKey: ['racas', 'nomes', fazendaId],
    enabled: !!fazendaId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('racas')
        .select('nome')
        .eq('fazenda_id', fazendaId!)
        .eq('ativo', true)
        .is('deleted_at', null)
        .order('nome', { ascending: true })
      if (error) throw error
      return ((data ?? []) as { nome: string }[]).map((r) => r.nome)
    },
  })
}

export interface ParametrosIdentificacao {
  loteId: string
  categoria: string
  animais: AnimalLista[]
  racaPadrao: string
  confirmar: boolean
  ajustarExcesso: boolean
  data?: string
}

/**
 * Valida (confirmar = false) ou grava (confirmar = true) a identificação de animais já contados no lote.
 * Não gera movimentação, exceto o ajuste do excesso quando explicitamente pedido.
 */
export function useIdentificarLote(fazendaId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (p: ParametrosIdentificacao): Promise<ResultadoIdentificacao> => {
      const { data, error } = await supabase.rpc('identificar_animais_lote', {
        p_fazenda_id: fazendaId!,
        p_lote_id: p.loteId,
        p_categoria: p.categoria,
        p_animais: p.animais,
        p_raca_padrao: p.racaPadrao || null,
        p_confirmar: p.confirmar,
        p_ajustar_excesso: p.ajustarExcesso,
        p_data: p.data || null,
      })
      if (error) throw new Error(error.message)
      return (data ?? { success: false, error: 'Resposta vazia do servidor' }) as ResultadoIdentificacao
    },
    onSuccess: (resultado, p) => {
      if (p.confirmar && resultado.success) {
        // identificados, conciliação e contagem dos lotes mudaram
        queryClient.invalidateQueries({ queryKey: ['lotes'] })
      }
    },
  })
}
