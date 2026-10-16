import { useQuery } from '@tanstack/react-query'
import { supabase } from '@gestaup/supabase'
import { toFarmDateOnly } from '@gestaup/shared'
import { categoriasCompativeis } from '../utils/categoriasCompativeis'
import { resumirAmostraDePeso, type AmostraDePeso } from '../utils/pesoAmostraCategoria'

interface LinhaPeso {
  categoria: string | null
  peso_atual_kg: number | null
  peso_atual_data: string | null
}

interface Params {
  fazendaId: string | undefined
  loteId: string | undefined
  categoria: string
  quantAtual?: number | null
  habilitado: boolean
}

/**
 * Amostra de peso da categoria a partir das pesagens individuais recentes (peso_atual_origem = 'pesagem') dos
 * animais Vivos, com localização confirmada, no lote. Só sugere: o peso do agregado muda apenas se o gestor
 * confirmar em corrigir_peso_categoria.
 */
export function useAmostraDePesoCategoria({ fazendaId, loteId, categoria, quantAtual, habilitado }: Params) {
  return useQuery({
    queryKey: ['lotes', 'amostra-peso', loteId, categoria, quantAtual ?? null],
    enabled: habilitado && !!fazendaId && !!loteId,
    queryFn: async (): Promise<AmostraDePeso | null> => {
      const { data, error } = await supabase
        .from('individuos')
        .select('categoria, peso_atual_kg, peso_atual_data')
        .eq('fazenda_id', fazendaId!)
        .eq('lote_atual', loteId!)
        .eq('status', 'Vivo')
        .eq('peso_atual_origem', 'pesagem')
        .is('deleted_at', null)
        .is('localizacao_incerta_desde', null)
        .not('peso_atual_kg', 'is', null)
        .limit(1000)
      if (error) throw error
      const linhas = (data ?? []) as LinhaPeso[]
      if (linhas.length === 0) return null

      const compativeis = await categoriasCompativeis(
        categoria,
        linhas.map((l) => l.categoria).filter((c): c is string => !!c)
      )

      const hoje = toFarmDateOnly(new Date().toISOString()) ?? new Date().toISOString().split('T')[0]
      return resumirAmostraDePeso(
        linhas.filter((l) => !!l.categoria && compativeis.has(l.categoria)),
        hoje,
        quantAtual
      )
    },
  })
}
