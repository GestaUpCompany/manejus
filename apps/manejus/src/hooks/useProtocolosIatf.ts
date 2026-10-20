import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@gestaup/supabase'
import type { FormProtocoloIatf, TipoPassoIatf } from '../utils/protocoloIatf'
import type { EventoDaFemeaIatf, InseminacaoIatf } from '../utils/relatorioIatf'

export interface PassoProtocolo {
  id: string
  protocolo_id: string
  dia: number
  ordem: number
  rotulo: string
  tipo: TipoPassoIatf
  medicamento_nome: string | null
  dose: string | null
}

export interface ProtocoloIatf {
  id: string
  nome: string
  descricao: string | null
  ativo: boolean
  passos: PassoProtocolo[]
}

export interface TarefaLoteIatf {
  id: string
  dia: number
  ordem: number
  rotulo: string
  tipo: TipoPassoIatf
  medicamento_nome: string | null
  dose: string | null
  data_prevista: string
  feita_em: string | null
  feita_por: string | null
  observacao: string | null
}

export interface FemeaLoteIatf {
  id: string
  individuo_id: string
  status: 'Ativa' | 'Descartada'
  motivo_descarte: string | null
  individuo: { id_brinco: string | null; id_manejo: string | null; id_chip: string | null; categoria: string | null } | null
}

/** Evento reprodutivo ligado ao lote; serve para saber quais fêmeas já têm a Inseminação registrada. */
export interface EventoDoLoteIatf {
  individuo_id: string
  tipo: string
  touro_nome: string | null
  deleted_at: string | null
}

export interface LoteProtocoloIatf {
  id: string
  nome: string
  data_d0: string
  status: 'Em andamento' | 'Concluído' | 'Cancelado'
  responsavel: string | null
  protocolo: { nome: string } | null
  femeas: FemeaLoteIatf[]
  tarefas: TarefaLoteIatf[]
  eventos: EventoDoLoteIatf[]
}

const CHAVE = ['protocolos-iatf'] as const

export function useProtocolosIatf(fazendaId: string | undefined) {
  return useQuery({
    queryKey: [...CHAVE, 'protocolos', fazendaId],
    enabled: !!fazendaId,
    queryFn: async (): Promise<ProtocoloIatf[]> => {
      const { data, error } = await supabase
        .from('protocolos_iatf')
        .select('id, nome, descricao, ativo, passos:protocolos_iatf_passos(id, protocolo_id, dia, ordem, rotulo, tipo, medicamento_nome, dose)')
        .eq('fazenda_id', fazendaId!)
        .is('deleted_at', null)
        .order('nome', { ascending: true })
      if (error) throw error
      return ((data ?? []) as unknown as ProtocoloIatf[]).map((p) => ({
        ...p,
        passos: [...p.passos].sort((a, b) => a.dia - b.dia || a.ordem - b.ordem),
      }))
    },
  })
}

export function useLotesProtocoloIatf(fazendaId: string | undefined) {
  return useQuery({
    queryKey: [...CHAVE, 'lotes', fazendaId],
    enabled: !!fazendaId,
    queryFn: async (): Promise<LoteProtocoloIatf[]> => {
      const { data, error } = await supabase
        .from('lotes_protocolo_iatf')
        .select(
          'id, nome, data_d0, status, responsavel, protocolo:protocolos_iatf(nome), femeas:lotes_protocolo_iatf_femeas(id, individuo_id, status, motivo_descarte, individuo:individuos(id_brinco, id_manejo, id_chip, categoria)), tarefas:lotes_protocolo_iatf_tarefas(id, dia, ordem, rotulo, tipo, medicamento_nome, dose, data_prevista, feita_em, feita_por, observacao), eventos:eventos_reprodutivos(individuo_id, tipo, touro_nome, deleted_at)'
        )
        .eq('fazenda_id', fazendaId!)
        .is('deleted_at', null)
        .order('data_d0', { ascending: false })
      if (error) throw error
      return ((data ?? []) as unknown as LoteProtocoloIatf[]).map((l) => ({
        ...l,
        tarefas: [...l.tarefas].sort((a, b) => a.data_prevista.localeCompare(b.data_prevista) || a.ordem - b.ordem),
      }))
    },
  })
}

/** Passo do formulário no formato que a RPC salvar_protocolo_iatf espera (a ordem do array vira o campo `ordem`). */
const passoParaServidor = (p: FormProtocoloIatf['passos'][number]) => ({
  dia: Number(p.dia),
  rotulo: p.rotulo.trim(),
  tipo: p.tipo,
  medicamento_nome: p.medicamentoNome.trim() === '' ? null : p.medicamentoNome.trim(),
  dose: p.dose.trim() === '' ? null : p.dose.trim(),
})

/** Cria ou edita um protocolo e troca os passos numa única transação (RPC): se algo falhar, nada muda. */
export function useSalvarProtocoloIatf(fazendaId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, form }: { id?: string; form: FormProtocoloIatf }): Promise<string> => {
      const { data, error } = await supabase.rpc('salvar_protocolo_iatf', {
        p_fazenda_id: fazendaId!,
        p_protocolo_id: id ?? null,
        p_nome: form.nome.trim(),
        p_descricao: form.descricao.trim() === '' ? null : form.descricao.trim(),
        p_passos: form.passos.map(passoParaServidor),
      })
      if (error) throw new Error(error.message)
      return data as string
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CHAVE }),
  })
}

export function useAlternarProtocoloIatf() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from('protocolos_iatf').update({ ativo }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CHAVE }),
  })
}

export function useExcluirProtocoloIatf() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('protocolos_iatf').update({ deleted_at: new Date().toISOString() }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CHAVE }),
  })
}

export function useCopiarModeloIatf(fazendaId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<string> => {
      const { data, error } = await supabase.rpc('copiar_modelo_protocolo_iatf', { p_fazenda_id: fazendaId! })
      if (error) throw new Error(error.message)
      return data as string
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CHAVE }),
  })
}

export function useCriarLoteIatf(fazendaId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (v: { protocoloId: string; nome: string; dataD0: string; individuos: string[]; responsavel: string }) => {
      const { data, error } = await supabase.rpc('criar_lote_protocolo_iatf', {
        p_fazenda_id: fazendaId!,
        p_protocolo_id: v.protocoloId,
        p_nome: v.nome,
        p_data_d0: v.dataD0,
        p_individuos: v.individuos,
        p_responsavel: v.responsavel.trim() === '' ? null : v.responsavel.trim(),
      })
      if (error) throw new Error(error.message)
      return data as string
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CHAVE }),
  })
}

/** Marca (data) ou desmarca (null) um passo que não é a IA. */
export function useMarcarTarefaIatf(fazendaId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (v: { tarefaId: string; feitaEm: string | null; observacao?: string; responsavel?: string }) => {
      const { error } = await supabase.rpc('marcar_tarefa_protocolo_iatf', {
        p_fazenda_id: fazendaId!,
        p_tarefa_id: v.tarefaId,
        p_feita_em: v.feitaEm,
        p_observacao: v.observacao?.trim() || null,
        p_responsavel: v.responsavel?.trim() || null,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CHAVE }),
  })
}

/**
 * Registra a Inseminação das fêmeas escolhidas (touro/sêmen próprios do grupo). Sem `individuos`, vale para todas as ativas
 * que ainda não têm IA. O passo só é concluído quando todas as ativas do lote têm IA. Devolve quantas foram gravadas.
 */
export function useRegistrarIaIatf(fazendaId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (v: {
      tarefaId: string
      data: string
      touro: string
      semen: string
      tecnico: string
      observacao: string
      individuos?: string[]
    }) => {
      const { data, error } = await supabase.rpc('registrar_ia_lote_protocolo', {
        p_fazenda_id: fazendaId!,
        p_tarefa_id: v.tarefaId,
        p_data: v.data,
        p_individuos: v.individuos ?? null,
        p_touro_nome: v.touro.trim() || null,
        p_semen_partida: v.semen.trim() || null,
        p_tecnico: v.tecnico.trim() || null,
        p_observacao: v.observacao.trim() || null,
      })
      if (error) throw new Error(error.message)
      return data as number
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHAVE })
      queryClient.invalidateQueries({ queryKey: ['reproducao'] })
    },
  })
}

/**
 * Desfaz a Inseminação do lote de protocolo: de todas as fêmeas, ou só das informadas. Exclui as IAs (logicamente), reabre o
 * passo e devolve quantas foram removidas. O banco recusa se já há diagnóstico de gestação depois da IA.
 */
export function useDesfazerIaIatf(fazendaId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (v: { tarefaId: string; individuos?: string[] }) => {
      const { data, error } = await supabase.rpc('desfazer_ia_lote_protocolo', {
        p_fazenda_id: fazendaId!,
        p_tarefa_id: v.tarefaId,
        p_individuos: v.individuos ?? null,
      })
      if (error) throw new Error(error.message)
      return data as number
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CHAVE })
      queryClient.invalidateQueries({ queryKey: ['reproducao'] })
    },
  })
}

/**
 * Descarta a fêmea do lote (RPC: conclui o passo de IA se ela era a última sem IA) ou a reativa (escrita direta, só gestão;
 * o banco recusa se ela já está ativa em outro lote em andamento).
 */
export function useDescartarFemeaIatf(fazendaId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; loteId: string; individuoId: string; descartar: boolean; motivo?: string }) => {
      if (v.descartar) {
        const { error } = await supabase.rpc('descartar_femea_lote_protocolo', {
          p_fazenda_id: fazendaId!,
          p_lote_id: v.loteId,
          p_individuo_id: v.individuoId,
          p_motivo: v.motivo?.trim() || null,
        })
        if (error) throw new Error(error.message)
        return
      }
      const { error } = await supabase.from('lotes_protocolo_iatf_femeas').update({ status: 'Ativa', motivo_descarte: null }).eq('id', v.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CHAVE }),
  })
}

export function useCancelarLoteIatf() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('lotes_protocolo_iatf').update({ status: 'Cancelado' }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CHAVE }),
  })
}

/**
 * Inseminações ligadas a lotes de protocolo e os eventos das mesmas fêmeas (diagnósticos e coberturas), para a taxa de
 * prenhez. Só leitura. As fêmeas vão em blocos para não estourar o tamanho da URL.
 */
export function useRelatorioIatf(fazendaId: string | undefined) {
  return useQuery({
    queryKey: [...CHAVE, 'relatorio', fazendaId],
    enabled: !!fazendaId,
    queryFn: async (): Promise<{ inseminacoes: InseminacaoIatf[]; eventos: EventoDaFemeaIatf[] }> => {
      const inseminacoes: InseminacaoIatf[] = []
      for (let inicio = 0; ; inicio += 1000) {
        const { data, error } = await supabase
          .from('eventos_reprodutivos')
          .select('id, individuo_id, data, touro_nome, semen_partida, tecnico, protocolo_lote_id, lote:lotes_protocolo_iatf(nome, protocolo:protocolos_iatf(nome))')
          .eq('fazenda_id', fazendaId!)
          .eq('tipo', 'Inseminação')
          .not('protocolo_lote_id', 'is', null)
          .is('deleted_at', null)
          .order('id', { ascending: true })
          .range(inicio, inicio + 999)
        if (error) throw error
        const pagina = (data ?? []) as unknown as (Omit<InseminacaoIatf, 'lote_nome' | 'protocolo_nome'> & {
          lote: { nome: string; protocolo: { nome: string } | null } | null
        })[]
        for (const r of pagina) {
          inseminacoes.push({
            id: r.id,
            individuo_id: r.individuo_id,
            data: r.data,
            touro_nome: r.touro_nome,
            semen_partida: r.semen_partida,
            tecnico: r.tecnico,
            protocolo_lote_id: r.protocolo_lote_id,
            lote_nome: r.lote?.nome ?? 'Lote removido',
            protocolo_nome: r.lote?.protocolo?.nome ?? 'Protocolo removido',
          })
        }
        if (pagina.length < 1000) break
      }

      const femeas = [...new Set(inseminacoes.map((i) => i.individuo_id))]
      const eventos: EventoDaFemeaIatf[] = []
      for (let i = 0; i < femeas.length; i += 150) {
        const bloco = femeas.slice(i, i + 150)
        const { data, error } = await supabase
          .from('eventos_reprodutivos')
          .select('id, individuo_id, tipo, data, created_at, resultado')
          .eq('fazenda_id', fazendaId!)
          .in('individuo_id', bloco)
          .in('tipo', ['Cobertura', 'Inseminação', 'Diagnóstico de gestação'])
          .is('deleted_at', null)
          .limit(5000)
        if (error) throw error
        eventos.push(...((data ?? []) as unknown as EventoDaFemeaIatf[]))
      }
      return { inseminacoes, eventos }
    },
  })
}
