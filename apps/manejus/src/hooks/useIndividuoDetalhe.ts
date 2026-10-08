import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@gestaup/supabase'
import type { DadosBaixa } from '../utils/baixaIndividuo'

export interface IndividuoDetalhe {
  id: string
  fazenda_id: string
  id_manejo?: string | null
  id_brinco?: string | null
  id_chip?: string | null
  id_provisorio_cria?: string | null
  sexo: string
  categoria: string
  raca: string
  status: string
  origem?: string | null
  sync_status?: string | null
  data_nascimento?: string | null
  peso_nascimento_kg?: number | string | null
  peso_atual_kg?: number | string | null
  data_desmama?: string | null
  peso_desmama_kg?: number | string | null
  data_entrada_fazenda?: string | null
  pv_entrada_kg?: number | string | null
  preco_entrada_reais_kg?: number | string | null
  preco_entrada_reais_arroba?: number | string | null
  preco_entrada_reais_cabeca?: number | string | null
  preco_arroba_boi_gordo?: number | string | null
  agio_desagio?: number | string | null
  propriedade_origem?: string | null
  propriedade_atual?: string | null
  fornecedor?: string | null
  lote_atual?: string | null
  pasto_atual?: string | null
  setor_atual?: string | null
  pai?: string | null
  mae?: string | null
  mae_adotiva_id?: string | null
  classificacao_matriz?: string | null
  numero_partos?: number | null
  idade_era?: string | null
  estrategia_nutricional_nome?: string | null
  gmd_kg_cab_dia?: number | string | null
  peso_meta_kg?: number | string | null
  data_insercao_rastreabilidade?: string | null
  data_liberacao_sisbov?: string | null
  data_saida?: string | null
  motivo_saida?: string | null
  destino_saida?: string | null
  created_at: string
  updated_at: string
}

export interface IndividuoResumo {
  id: string
  id_brinco?: string | null
  id_chip?: string | null
  id_manejo?: string | null
  id_provisorio_cria?: string | null
  sexo?: string | null
  categoria?: string | null
  status?: string | null
  data_nascimento?: string | null
}

export interface ReferenciasIndividuo {
  lote?: string
  pasto?: string
  setor?: string
  fornecedor?: string
  pai?: IndividuoResumo | null
  mae?: IndividuoResumo | null
  maeAdotiva?: IndividuoResumo | null
}

export interface PesagemIndividuo {
  id: string
  data: string
  peso_kg: number | string | null
  tipo_manejo?: string | null
  lote?: string | null
  categoria?: string | null
  individuo_status_anterior?: string | null
}

export interface MovimentacaoIndividuo {
  id: string
  data: string
  motivo_movimentacao?: string | null
  subtipo?: string | null
  tipo_saida?: string | null
  tipo_entrada?: string | null
  lote_origem_id?: string | null
  lote_destino_id?: string | null
  numero_cabecas?: number | null
  peso_vivo_atual_kg?: number | string | null
  causa_observacao?: string | null
  observacao?: string | null
  categoria?: string | null
}

export interface PartoIndividuo {
  id: string
  data: string
  individuo_id_mae?: string | null
  individuo_id_cria?: string | null
  individuo_id_mae_adotiva?: string | null
  id_brinco_cria?: string | null
  id_provisorio_cria?: string | null
  id_brinco_mae?: string | null
  sexo?: string | null
  peso_cria_kg?: number | string | null
  tipo_parto?: unknown
  categoria_mae?: string | null
  escore_matriz?: string | null
}

const RESUMO_COLS = 'id, id_brinco, id_chip, id_manejo, id_provisorio_cria, sexo, categoria, status, data_nascimento'

/** Rótulo curto de um indivíduo: brinco, chip, manejo ou provisório. */
export function rotuloIndividuo(ind?: IndividuoResumo | null): string {
  if (!ind) return '-'
  return ind.id_brinco || ind.id_chip || ind.id_manejo || ind.id_provisorio_cria || 'Sem identificação'
}

export function useIndividuoDetalhe(id: string | undefined) {
  const individuo = useQuery({
    queryKey: ['individuo', id],
    enabled: !!id,
    queryFn: async (): Promise<IndividuoDetalhe | null> => {
      const { data, error } = await supabase
        .from('individuos')
        .select('*')
        .eq('id', id!)
        .is('deleted_at', null)
        .maybeSingle()
      if (error) throw error
      return data as IndividuoDetalhe | null
    },
  })

  const ind = individuo.data
  const habilitado = !!ind

  const referencias = useQuery({
    queryKey: ['individuo', id, 'referencias', ind?.lote_atual, ind?.pasto_atual, ind?.setor_atual, ind?.fornecedor, ind?.pai, ind?.mae, ind?.mae_adotiva_id],
    enabled: habilitado,
    queryFn: async (): Promise<ReferenciasIndividuo> => {
      const nome = async (tabela: string, refId?: string | null) => {
        if (!refId) return undefined
        const { data } = await supabase.from(tabela).select('nome').eq('id', refId).maybeSingle()
        return (data as { nome?: string } | null)?.nome
      }
      const resumo = async (refId?: string | null) => {
        if (!refId) return null
        const { data } = await supabase.from('individuos').select(RESUMO_COLS).eq('id', refId).maybeSingle()
        return data as IndividuoResumo | null
      }
      const [lote, pasto, setor, fornecedor, pai, mae, maeAdotiva] = await Promise.all([
        nome('lotes', ind!.lote_atual),
        nome('pastos', ind!.pasto_atual),
        nome('setores', ind!.setor_atual),
        nome('fornecedores', ind!.fornecedor),
        resumo(ind!.pai),
        resumo(ind!.mae),
        resumo(ind!.mae_adotiva_id),
      ])
      return { lote, pasto, setor, fornecedor, pai, mae, maeAdotiva }
    },
  })

  const pesagens = useQuery({
    queryKey: ['individuo', id, 'pesagens'],
    enabled: habilitado,
    queryFn: async (): Promise<PesagemIndividuo[]> => {
      const { data, error } = await supabase
        .from('registros_pesagem')
        .select('id, data, peso_kg, tipo_manejo, lote, categoria, individuo_status_anterior')
        .eq('individuo_id', id!)
        .is('deleted_at', null)
        .order('data', { ascending: false })
      if (error) throw error
      return (data || []) as PesagemIndividuo[]
    },
  })

  const movimentacoes = useQuery({
    queryKey: ['individuo', id, 'movimentacoes'],
    enabled: habilitado,
    queryFn: async (): Promise<{ itens: MovimentacaoIndividuo[]; lotes: Record<string, string> }> => {
      const { data, error } = await supabase
        .from('registros_movimentacao')
        .select('id, data, motivo_movimentacao, subtipo, tipo_saida, tipo_entrada, lote_origem_id, lote_destino_id, numero_cabecas, peso_vivo_atual_kg, causa_observacao, observacao, categoria')
        .eq('individuo_id', id!)
        .is('deleted_at', null)
        .order('data', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      const itens = (data || []) as MovimentacaoIndividuo[]
      const ids = [...new Set(itens.flatMap((m) => [m.lote_origem_id, m.lote_destino_id]).filter(Boolean))] as string[]
      const lotes: Record<string, string> = {}
      if (ids.length > 0) {
        const { data: lotesData } = await supabase.from('lotes').select('id, nome').in('id', ids)
        for (const l of (lotesData || []) as { id: string; nome: string }[]) lotes[l.id] = l.nome
      }
      return { itens, lotes }
    },
  })

  const descendentes = useQuery({
    queryKey: ['individuo', id, 'descendentes'],
    enabled: habilitado,
    queryFn: async (): Promise<IndividuoResumo[]> => {
      const { data, error } = await supabase
        .from('individuos')
        .select(RESUMO_COLS)
        .or(`pai.eq.${id},mae.eq.${id}`)
        .is('deleted_at', null)
        .order('data_nascimento', { ascending: false })
      if (error) throw error
      return (data || []) as IndividuoResumo[]
    },
  })

  const partos = useQuery({
    queryKey: ['individuo', id, 'partos'],
    enabled: habilitado,
    queryFn: async (): Promise<PartoIndividuo[]> => {
      const { data, error } = await supabase
        .from('registros_maternidade')
        .select('id, data, individuo_id_mae, individuo_id_cria, individuo_id_mae_adotiva, id_brinco_cria, id_provisorio_cria, id_brinco_mae, sexo, peso_cria_kg, tipo_parto, categoria_mae, escore_matriz')
        .or(`individuo_id_mae.eq.${id},individuo_id_cria.eq.${id},individuo_id_mae_adotiva.eq.${id}`)
        .is('deleted_at', null)
        .order('data', { ascending: false })
      if (error) throw error
      return (data || []) as PartoIndividuo[]
    },
  })

  return { individuo, referencias, pesagens, movimentacoes, descendentes, partos }
}

/** Ações do detalhe. Sempre filtram pela fazenda do animal para não escapar do escopo. */
export function useIndividuoAcoes(individuo: IndividuoDetalhe | null | undefined) {
  const queryClient = useQueryClient()
  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['individuo', individuo?.id] })

  const alterarStatus = useMutation({
    mutationFn: async (dados: DadosBaixa) => {
      if (!individuo) throw new Error('Indivíduo não carregado')
      const { error } = await supabase
        .from('individuos')
        .update(dados)
        .eq('id', individuo.id)
        .eq('fazenda_id', individuo.fazenda_id)
      if (error) throw error
    },
    onSuccess: invalidar,
  })

  const excluir = useMutation({
    mutationFn: async () => {
      if (!individuo) throw new Error('Indivíduo não carregado')
      const { error } = await supabase
        .from('individuos')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', individuo.id)
        .eq('fazenda_id', individuo.fazenda_id)
      if (error) throw error
    },
    onSuccess: invalidar,
  })

  return { alterarStatus, excluir }
}
