import { useQuery } from '@tanstack/react-query'
import { supabase } from '@gestaup/supabase'
import { categoriasCompativeis } from '../utils/categoriasCompativeis'
import type { PlanoDoLote } from '../utils/dietaDoLote'

interface Params {
  fazendaId: string | undefined
  loteId: string | null | undefined
  categoria: string | null | undefined
  habilitado: boolean
}

interface LinhaPlano {
  id: string
  nome: string | null
  lote_id: string | null
  lote_categoria_id: string | null
  ativo: boolean | null
  data_inicio: string | null
  data_fim: string | null
  gmd_planejado: number | string | null
  peso_meta_kg: number | string | null
  formulacoes: { nome: string | null } | null
}

/**
 * Planos nutricionais do lote atual do animal: os do lote inteiro e os da categoria dele (mesma categoria canônica).
 * É a dieta do LOTE; o animal não tem dieta própria medida.
 */
export function useDietaDoLote({ fazendaId, loteId, categoria, habilitado }: Params) {
  return useQuery({
    queryKey: ['individuo', 'dieta-do-lote', fazendaId, loteId, categoria],
    enabled: habilitado && !!fazendaId && !!loteId,
    queryFn: async (): Promise<PlanoDoLote[]> => {
      const { data: cats, error: erroCats } = await supabase
        .from('lote_categorias')
        .select('id, categoria')
        .eq('lote_id', loteId!)
        .eq('ativo', true)
      if (erroCats) throw erroCats
      const linhasCat = (cats ?? []) as { id: string; categoria: string }[]
      const compativeis = categoria ? await categoriasCompativeis(categoria, linhasCat.map((c) => c.categoria)) : new Set<string>()
      const idsCategoria = linhasCat.filter((c) => compativeis.has(c.categoria)).map((c) => c.id)

      const filtro = idsCategoria.length > 0 ? `lote_id.eq.${loteId},lote_categoria_id.in.(${idsCategoria.join(',')})` : `lote_id.eq.${loteId}`
      const { data, error } = await supabase
        .from('planos_nutricionais')
        .select('id, nome, lote_id, lote_categoria_id, ativo, data_inicio, data_fim, gmd_planejado, peso_meta_kg, formulacoes(nome)')
        .eq('fazenda_id', fazendaId!)
        .or(filtro)
        .order('data_inicio', { ascending: false })
        .limit(100)
      if (error) throw error
      return ((data ?? []) as unknown as LinhaPlano[]).map((p) => ({
        id: p.id,
        nome: p.nome,
        lote_id: p.lote_id,
        lote_categoria_id: p.lote_categoria_id,
        ativo: p.ativo,
        data_inicio: p.data_inicio,
        data_fim: p.data_fim,
        gmd_planejado: p.gmd_planejado,
        peso_meta_kg: p.peso_meta_kg,
        formulacao: p.formulacoes?.nome ?? null,
      }))
    },
  })
}
