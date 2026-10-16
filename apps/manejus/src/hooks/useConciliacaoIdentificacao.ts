import { useQuery } from '@tanstack/react-query'
import { supabase } from '@gestaup/supabase'
import type { LinhaConciliacao } from '../utils/conciliacaoIdentificacao'
import {
  apartacoesSemAnimalSugeridas,
  mortesSemAnimalSugeridas,
  type MortePendente,
  type MovimentacaoPendente,
} from '../utils/pendenciasSemAnimal'

export interface IndividuoSemCategoria {
  individuo_id: string
  lote_id: string
  categoria: string
  motivo: string
  identificacao: string
}

const TAMANHO_PAGINA = 1000

/**
 * Conciliação por lote/categoria (identificados × agregado), com TODAS as categorias dos lotes (inclusive sem identificados),
 * porque o nível de qualificação do lote depende de todas as categorias com cabeças. Pagina pelo limite de 1000 linhas do PostgREST.
 */
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

const JANELA_DIAS = 90

export interface PendenciasSemAnimal {
  mortes: MortePendente[]
  apartacoes: MovimentacaoPendente[]
}

/**
 * Sugestões de "informar o animal": mortes e apartações recentes (90 dias) de lotes que já têm animais identificados e
 * ficaram sem animal informado. São sugestões; o agregado já foi descontado e nada disso bloqueia a operação.
 */
export function usePendenciasSemAnimal(fazendaId: string | undefined, linhas: LinhaConciliacao[]) {
  const lotesComIdentificados = [...new Set(linhas.filter((l) => l.identificados > 0).map((l) => l.lote_id))].sort()
  return useQuery({
    queryKey: ['lotes', 'pendencias-sem-animal', fazendaId, lotesComIdentificados.join(',')],
    enabled: !!fazendaId && lotesComIdentificados.length > 0,
    queryFn: async (): Promise<PendenciasSemAnimal> => {
      const desde = new Date(Date.now() - JANELA_DIAS * 86_400_000).toISOString()

      const { data: mortes, error: erroMortes } = await supabase
        .from('registros_morte')
        .select('id, data, lote_id, lote, categoria, individuo_id')
        .eq('fazenda_id', fazendaId!)
        .is('deleted_at', null)
        .is('individuo_id', null)
        .in('lote_id', lotesComIdentificados)
        .gte('data', desde)
        .order('data', { ascending: false })
        .limit(200)
      if (erroMortes) throw erroMortes

      const { data: movs, error: erroMovs } = await supabase
        .from('registros_movimentacao')
        .select('id, data, lote_origem_id, lote_destino_id, categoria, numero_cabecas')
        .eq('fazenda_id', fazendaId!)
        .is('deleted_at', null)
        .is('os_id', null)
        .is('individuo_id', null)
        .in('motivo_movimentacao', ['Saída', 'Entrevero'])
        .gte('data', desde)
        .order('data', { ascending: false })
        .limit(300)
      if (erroMovs) throw erroMovs

      const candidatas = (movs ?? []) as MovimentacaoPendente[]
      const informados = new Map<string, number>()
      if (candidatas.length > 0) {
        const { data: ponte, error: erroPonte } = await supabase
          .from('evento_individuos')
          .select('evento_id')
          .in('evento_id', candidatas.map((m) => m.id))
        if (erroPonte) throw erroPonte
        for (const l of (ponte ?? []) as { evento_id: string }[]) informados.set(l.evento_id, (informados.get(l.evento_id) ?? 0) + 1)
      }

      return {
        mortes: mortesSemAnimalSugeridas((mortes ?? []) as MortePendente[], linhas),
        apartacoes: apartacoesSemAnimalSugeridas(candidatas, linhas, informados),
      }
    },
  })
}
