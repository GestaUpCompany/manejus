import { useQuery } from '@tanstack/react-query'
import { supabase } from '@gestaup/supabase'
import type { FpAvaliacao, FpContratoItem } from '../types/farmplan'

export function useContratoItens(funcionarioId: string | undefined) {
  return useQuery({
    queryKey: ['fp_contrato', funcionarioId],
    enabled: !!funcionarioId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_contrato_itens')
        .select('*')
        .eq('funcionario_id', funcionarioId!)
        .is('deleted_at', null)
        .order('ordem', { ascending: true })
      if (error) throw error
      return data as FpContratoItem[]
    },
  })
}

export function useAvaliacoesAno(fazendaId: string | undefined, ano: number | undefined) {
  return useQuery({
    queryKey: ['fp_avaliacoes_ano', fazendaId, ano],
    enabled: !!fazendaId && !!ano,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_avaliacoes')
        .select('*')
        .eq('fazenda_id', fazendaId!)
        .eq('ano', ano!)
      if (error) throw error
      return data as FpAvaliacao[]
    },
  })
}

/** Escore semanal: média das notas (ignora NSA). null se não há avaliação na semana. */
export function escorePorSemana(avaliacoes: FpAvaliacao[]): Map<number, number> {
  const porSemana = new Map<number, { soma: number; n: number }>()
  for (const a of avaliacoes) {
    if (a.nsa || a.nota === null) continue
    const acc = porSemana.get(a.semana) ?? { soma: 0, n: 0 }
    acc.soma += Number(a.nota)
    acc.n += 1
    porSemana.set(a.semana, acc)
  }
  const out = new Map<number, number>()
  for (const [sem, acc] of porSemana) out.set(sem, acc.soma / acc.n)
  return out
}
