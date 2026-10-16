import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@gestaup/supabase'
import {
  dosesPendentesDaFazenda,
  montarAplicacaoLoteParaGravar,
  montarAplicacaoParaGravar,
  type FormAplicacao,
  type DosePendente,
  type FormAplicacaoLote,
  type LinhaHistoricoSanitario,
  type MedicamentoCatalogo,
} from '../utils/sanidade'

export interface AplicacaoDeLote {
  id: string
  data: string
  tipo: string
  categoria: string | null
  numero_cabecas: number | null
  medicamento_nome: string
  dose_aplicada: string | null
  liberacao_abate_em: string | null
  proxima_aplicacao_em: string | null
  lote: { nome: string } | null
}

export interface LoteEmCarencia {
  lote_id: string
  categoria: string | null
  liberacao_abate_em: string
  medicamento_nome: string
}

export interface CategoriaDoLote {
  categoria: string
  quant_atual: number
}

/** Categorias ativas do lote com a contagem atual (referência para o número de cabeças da aplicação). */
export function useCategoriasDoLote(loteId: string | undefined) {
  return useQuery({
    queryKey: ['sanidade', 'categorias-do-lote', loteId],
    enabled: !!loteId,
    queryFn: async (): Promise<CategoriaDoLote[]> => {
      const { data, error } = await supabase
        .from('lote_categorias')
        .select('categoria, quant_atual')
        .eq('lote_id', loteId!)
        .eq('ativo', true)
        .order('categoria')
      if (error) throw error
      return (data ?? []) as CategoriaDoLote[]
    },
  })
}

/** Aplicações feitas em lote (sem animal), das mais recentes. */
export function useAplicacoesDeLote(fazendaId: string | undefined) {
  return useQuery({
    queryKey: ['sanidade', 'aplicacoes-de-lote', fazendaId],
    enabled: !!fazendaId,
    queryFn: async (): Promise<AplicacaoDeLote[]> => {
      const { data, error } = await supabase
        .from('aplicacoes_sanitarias')
        .select('id, data, tipo, categoria, numero_cabecas, medicamento_nome, dose_aplicada, liberacao_abate_em, proxima_aplicacao_em, lote:lotes(nome)')
        .eq('fazenda_id', fazendaId!)
        .is('individuo_id', null)
        .not('lote_id', 'is', null)
        .is('deleted_at', null)
        .order('data', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as unknown as AplicacaoDeLote[]
    },
  })
}

/** Lotes (e categorias) com carência ainda ativa hoje, pela função do banco. */
export function useLotesEmCarencia(fazendaId: string | undefined) {
  return useQuery({
    queryKey: ['sanidade', 'lotes-em-carencia', fazendaId],
    enabled: !!fazendaId,
    queryFn: async (): Promise<LoteEmCarencia[]> => {
      const { data, error } = await supabase.rpc('lotes_em_carencia', { p_fazenda_id: fazendaId! })
      if (error) throw error
      return (data ?? []) as LoteEmCarencia[]
    },
  })
}

export function useLancarAplicacaoLote(fazendaId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (form: FormAplicacaoLote) => {
      const { error } = await supabase.from('aplicacoes_sanitarias').insert(montarAplicacaoLoteParaGravar(form, fazendaId!))
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sanidade'] }),
  })
}

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

interface Identificacao {
  id_brinco: string | null
  id_manejo: string | null
  id_chip: string | null
  id_provisorio_cria: string | null
}

/** Mesma ordem de rotuloIndividuo: brinco, chip, manejo, provisório. */
function rotuloIndividuo(i: Identificacao | null | undefined): string {
  return i?.id_brinco || i?.id_chip || i?.id_manejo || i?.id_provisorio_cria || 'Sem identificação'
}

interface AplicacaoComIntervaloRow {
  data: string
  medicamento_nome: string
  proxima_aplicacao_em: string | null
  categoria: string | null
  individuo_id: string | null
  lote_id: string | null
  individuo: Identificacao | null
  lote: { nome: string } | null
}

/** Doses atrasadas ou previstas nos próximos 15 dias (aplicação mais recente de cada produto em cada animal ou lote). */
export function useDosesPendentes(fazendaId: string | undefined, hoje: string) {
  return useQuery({
    queryKey: ['sanidade', 'doses-pendentes', fazendaId, hoje],
    enabled: !!fazendaId,
    queryFn: async (): Promise<DosePendente[]> => {
      const { data, error } = await supabase
        .from('aplicacoes_sanitarias')
        .select(
          'data, medicamento_nome, proxima_aplicacao_em, categoria, individuo_id, lote_id, individuo:individuos(id_brinco, id_manejo, id_chip, id_provisorio_cria), lote:lotes(nome)'
        )
        .eq('fazenda_id', fazendaId!)
        .not('proxima_aplicacao_em', 'is', null)
        .is('deleted_at', null)
        .limit(5000)
      if (error) throw error
      const linhas = ((data ?? []) as unknown as AplicacaoComIntervaloRow[]).map((a) => ({
        alvoChave: a.individuo_id ?? `${a.lote_id}|${(a.categoria ?? '').trim().toLowerCase()}`,
        alvoRotulo: a.individuo_id
          ? rotuloIndividuo(a.individuo)
          : `${a.lote?.nome ?? 'Lote'}${a.categoria ? ` (${a.categoria})` : ''}`,
        medicamento_nome: a.medicamento_nome,
        data: a.data,
        proxima_aplicacao_em: a.proxima_aplicacao_em,
      }))
      return dosesPendentesDaFazenda(linhas, hoje)
    },
  })
}

export interface AnimalEmCarencia {
  individuo_id: string
  liberacao_abate_em: string
  medicamento_nome: string
  rotulo: string
}

/** Animais vivos em carência hoje (função do banco), com a identificação para exibir. */
export function useAnimaisEmCarencia(fazendaId: string | undefined) {
  return useQuery({
    queryKey: ['sanidade', 'animais-em-carencia', fazendaId],
    enabled: !!fazendaId,
    queryFn: async (): Promise<AnimalEmCarencia[]> => {
      const { data, error } = await supabase.rpc('animais_em_carencia', { p_fazenda_id: fazendaId! })
      if (error) throw error
      const linhas = (data ?? []) as Omit<AnimalEmCarencia, 'rotulo'>[]
      if (linhas.length === 0) return []
      const { data: inds, error: erroInds } = await supabase
        .from('individuos')
        .select('id, id_brinco, id_manejo, id_chip, id_provisorio_cria')
        .in('id', linhas.map((l) => l.individuo_id))
      if (erroInds) throw erroInds
      const rotulo = new Map(
        ((inds ?? []) as (Identificacao & { id: string })[]).map((i) => [i.id, rotuloIndividuo(i)])
      )
      return linhas
        .map((l) => ({ ...l, rotulo: rotulo.get(l.individuo_id) ?? 'Sem identificação' }))
        .sort((a, b) => (a.liberacao_abate_em < b.liberacao_abate_em ? -1 : 1))
    },
  })
}
