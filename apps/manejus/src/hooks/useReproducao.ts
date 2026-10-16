import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@gestaup/supabase'
import {
  montarDiagnosticosEmGrupo,
  montarEventoParaGravar,
  type DadosComunsDiagnostico,
  type EventoParaResumo,
  type FormEstacao,
  type FormEventoReprodutivo,
  type LinhaDiagnosticoGrupo,
  type StatusFemeaFazenda,
  type StatusReprodutivo,
  type TipoEventoReprodutivo,
} from '../utils/reproducao'

export interface StatusReprodutivoRow {
  individuo_id: string
  status_reprodutivo: StatusReprodutivo
  ultimo_parto: string | null
  parto_anterior: string | null
  intervalo_entre_partos_dias: number | null
  dias_desde_ultimo_parto: number | null
  ultimo_aborto: string | null
  ultima_cobertura_id: string | null
  ultima_cobertura_data: string | null
  ultima_cobertura_tipo: string | null
  ultima_cobertura_touro: string | null
  ultima_cobertura_estacao_id: string | null
  dias_desde_cobertura: number | null
  ultimo_diagnostico_data: string | null
  ultimo_diagnostico_resultado: string | null
  previsao_parto: string | null
  previsao_confirmada: boolean
}

export interface EventoReprodutivo {
  id: string
  tipo: TipoEventoReprodutivo
  data: string
  estacao_id: string | null
  touro_nome: string | null
  semen_partida: string | null
  tecnico: string | null
  metodo_diagnostico: string | null
  resultado: string | null
  idade_gestacao_dias: number | null
  evento_cobertura_id: string | null
  observacao: string | null
  responsavel: string | null
  created_at: string
  estacao: { nome: string } | null
}

export interface EstacaoMonta {
  id: string
  nome: string
  data_inicio: string
  data_fim: string
  observacao: string | null
}

/** Status reprodutivo derivado da fêmea (a view só tem fêmeas vivas; macho ou baixado volta sem linha). */
export function useStatusReprodutivo(individuoId: string | undefined, habilitado = true) {
  return useQuery({
    queryKey: ['reproducao', 'status', individuoId],
    enabled: !!individuoId && habilitado,
    queryFn: async (): Promise<StatusReprodutivoRow | null> => {
      const { data, error } = await supabase.from('v_status_reprodutivo').select('*').eq('individuo_id', individuoId!).maybeSingle()
      if (error) throw error
      return (data as StatusReprodutivoRow | null) ?? null
    },
  })
}

export function useEventosReprodutivos(individuoId: string | undefined, habilitado = true) {
  return useQuery({
    queryKey: ['reproducao', 'eventos', individuoId],
    enabled: !!individuoId && habilitado,
    queryFn: async (): Promise<EventoReprodutivo[]> => {
      const { data, error } = await supabase
        .from('eventos_reprodutivos')
        .select(
          'id, tipo, data, estacao_id, touro_nome, semen_partida, tecnico, metodo_diagnostico, resultado, idade_gestacao_dias, evento_cobertura_id, observacao, responsavel, created_at, estacao:estacoes_monta(nome)'
        )
        .eq('individuo_id', individuoId!)
        .is('deleted_at', null)
        .order('data', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as EventoReprodutivo[]
    },
  })
}

export function useEstacoesMonta(fazendaId: string | undefined) {
  return useQuery({
    queryKey: ['reproducao', 'estacoes', fazendaId],
    enabled: !!fazendaId,
    queryFn: async (): Promise<EstacaoMonta[]> => {
      const { data, error } = await supabase
        .from('estacoes_monta')
        .select('id, nome, data_inicio, data_fim, observacao')
        .eq('fazenda_id', fazendaId!)
        .is('deleted_at', null)
        .order('data_inicio', { ascending: false })
      if (error) throw error
      return (data ?? []) as EstacaoMonta[]
    },
  })
}

export function useLancarEventoReprodutivo(fazendaId: string | undefined, individuoId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (form: FormEventoReprodutivo) => {
      const linha = montarEventoParaGravar(form, fazendaId!, individuoId!, null)
      const { error } = await supabase.from('eventos_reprodutivos').insert(linha)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reproducao'] }),
  })
}

export function useExcluirEventoReprodutivo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (eventoId: string) => {
      const { error } = await supabase.from('eventos_reprodutivos').update({ deleted_at: new Date().toISOString() }).eq('id', eventoId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reproducao'] }),
  })
}

/** Cria ou edita uma estação de monta (com `id`, edita). */
export function useSalvarEstacao(fazendaId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, form }: { id?: string; form: FormEstacao }) => {
      const linha = {
        nome: form.nome.trim(),
        data_inicio: form.dataInicio,
        data_fim: form.dataFim,
        observacao: form.observacao.trim() === '' ? null : form.observacao.trim(),
      }
      const { error } = id
        ? await supabase.from('estacoes_monta').update(linha).eq('id', id)
        : await supabase.from('estacoes_monta').insert({ ...linha, fazenda_id: fazendaId! })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reproducao'] }),
  })
}

export function useExcluirEstacao() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (estacaoId: string) => {
      const { error } = await supabase.from('estacoes_monta').update({ deleted_at: new Date().toISOString() }).eq('id', estacaoId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reproducao'] }),
  })
}

export interface FemeaDoLote {
  individuo_id: string
  id_brinco: string | null
  id_chip: string | null
  id_manejo: string | null
  categoria: string | null
  status_reprodutivo: StatusReprodutivo
  ultima_cobertura_id: string | null
  ultima_cobertura_data: string | null
  dias_desde_cobertura: number | null
  previsao_parto: string | null
}

/** Fêmeas vivas de um lote com o status reprodutivo derivado (base do diagnóstico em grupo). */
export function useFemeasDoLote(fazendaId: string | undefined, loteId: string | undefined) {
  return useQuery({
    queryKey: ['reproducao', 'femeas-do-lote', fazendaId, loteId],
    enabled: !!fazendaId && !!loteId,
    queryFn: async (): Promise<FemeaDoLote[]> => {
      const { data, error } = await supabase
        .from('v_status_reprodutivo')
        .select('individuo_id, id_brinco, id_chip, id_manejo, categoria, status_reprodutivo, ultima_cobertura_id, ultima_cobertura_data, dias_desde_cobertura, previsao_parto')
        .eq('fazenda_id', fazendaId!)
        .eq('lote_atual', loteId!)
        .order('id_brinco', { ascending: true })
        .limit(2000)
      if (error) throw error
      return (data ?? []) as FemeaDoLote[]
    },
  })
}

/** Grava os diagnósticos de várias fêmeas num único insert (tudo ou nada). */
export function useDiagnosticoEmGrupo(fazendaId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ linhas, comuns }: { linhas: LinhaDiagnosticoGrupo[]; comuns: DadosComunsDiagnostico }): Promise<number> => {
      const registros = montarDiagnosticosEmGrupo(linhas, comuns, fazendaId!)
      const { error } = await supabase.from('eventos_reprodutivos').insert(registros)
      if (error) throw new Error(error.message)
      return registros.length
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reproducao'] }),
  })
}

/** Eventos da fazenda para o resumo por estação (paginado pelo limite de 1000 linhas do PostgREST). */
export function useEventosParaResumo(fazendaId: string | undefined) {
  return useQuery({
    queryKey: ['reproducao', 'eventos-resumo', fazendaId],
    enabled: !!fazendaId,
    queryFn: async (): Promise<EventoParaResumo[]> => {
      const todos: EventoParaResumo[] = []
      for (let inicio = 0; ; inicio += 1000) {
        const { data, error } = await supabase
          .from('eventos_reprodutivos')
          .select('id, individuo_id, tipo, data, estacao_id, resultado')
          .eq('fazenda_id', fazendaId!)
          .is('deleted_at', null)
          .order('id', { ascending: true })
          .range(inicio, inicio + 999)
        if (error) throw error
        const pagina = (data ?? []) as unknown as EventoParaResumo[]
        todos.push(...pagina)
        if (pagina.length < 1000) break
      }
      return todos
    },
  })
}

/** Status reprodutivo de todas as fêmeas vivas da fazenda (pendências e relatório), paginado em 1000 linhas. */
export function useStatusReprodutivoDaFazenda(fazendaId: string | undefined) {
  return useQuery({
    queryKey: ['reproducao', 'status-fazenda', fazendaId],
    enabled: !!fazendaId,
    queryFn: async (): Promise<StatusFemeaFazenda[]> => {
      const todas: StatusFemeaFazenda[] = []
      for (let inicio = 0; ; inicio += 1000) {
        const { data, error } = await supabase
          .from('v_status_reprodutivo')
          .select(
            'individuo_id, id_brinco, id_chip, id_manejo, categoria, lote_atual, status_reprodutivo, ultimo_parto, intervalo_entre_partos_dias, dias_desde_ultimo_parto, ultima_cobertura_data, ultima_cobertura_touro, dias_desde_cobertura, ultimo_diagnostico_data, ultimo_diagnostico_resultado, previsao_parto, previsao_confirmada'
          )
          .eq('fazenda_id', fazendaId!)
          .order('individuo_id', { ascending: true })
          .range(inicio, inicio + 999)
        if (error) throw error
        const pagina = (data ?? []) as StatusFemeaFazenda[]
        todas.push(...pagina)
        if (pagina.length < 1000) break
      }
      return todas
    },
  })
}
