import { useQuery } from '@tanstack/react-query'
import { supabase } from '@gestaup/supabase'

export interface IdentificacaoLote {
  /** Indivíduos vivos cadastrados neste lote (subconjunto das cabeças contadas pelo agregado). */
  identificados: number
  /** Dos identificados, os que não têm localização confirmada (movimentação por contagem). */
  incertos: number
}

interface LinhaIndividuoLote {
  lote_atual: string | null
  localizacao_incerta_desde: string | null
}

/** Conta identificados e incertos por lote. Linhas sem lote são ignoradas. */
export function agruparIdentificadosPorLote(linhas: LinhaIndividuoLote[]): Record<string, IdentificacaoLote> {
  const porLote: Record<string, IdentificacaoLote> = {}
  for (const linha of linhas) {
    if (!linha.lote_atual) continue
    const atual = porLote[linha.lote_atual] ?? { identificados: 0, incertos: 0 }
    atual.identificados += 1
    if (linha.localizacao_incerta_desde) atual.incertos += 1
    porLote[linha.lote_atual] = atual
  }
  return porLote
}

const TAMANHO_PAGINA = 1000

/** Identificados por lote da fazenda (animais vivos). Pagina porque o PostgREST limita a 1000 linhas por consulta. */
export function useIdentificadosPorLote(fazendaId: string | undefined) {
  return useQuery({
    // começa com 'lotes' para ser invalidada junto com os lotes (baixa, exclusão, confirmação de localização)
    queryKey: ['lotes', 'identificados', fazendaId],
    enabled: !!fazendaId,
    queryFn: async () => {
      const linhas: LinhaIndividuoLote[] = []
      for (let inicio = 0; ; inicio += TAMANHO_PAGINA) {
        const { data, error } = await supabase
          .from('individuos')
          .select('lote_atual, localizacao_incerta_desde')
          .eq('fazenda_id', fazendaId!)
          .eq('status', 'Vivo')
          .is('deleted_at', null)
          .not('lote_atual', 'is', null)
          .order('id', { ascending: true })
          .range(inicio, inicio + TAMANHO_PAGINA - 1)
        if (error) throw error
        const pagina = (data ?? []) as LinhaIndividuoLote[]
        linhas.push(...pagina)
        if (pagina.length < TAMANHO_PAGINA) break
      }
      return agruparIdentificadosPorLote(linhas)
    },
  })
}
