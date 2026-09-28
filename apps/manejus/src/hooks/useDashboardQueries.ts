import { useQuery } from '@tanstack/react-query'
import { supabase } from '../services/supabaseClient'
import { getFazendaIdForUser } from '../utils/fazendaContext'
import { formatDateTime } from '../utils/formatDate'

async function getFazendaId(userId: string): Promise<string | null> {
  return getFazendaIdForUser(userId)
}

export function useFazenda(userId: string | undefined) {
  return useQuery({
    queryKey: ['fazenda', userId],
    enabled: !!userId,
    queryFn: async () => {
      const fazendaId = await getFazendaId(userId!)
      if (!fazendaId) return null

      const { data } = await supabase
        .from('fazendas')
        .select('*')
        .eq('id', fazendaId)
        .single()

      return data
    },
  })
}

export function useDashboardStats(userId: string | undefined) {
  return useQuery({
    queryKey: ['dashboard-stats', userId],
    enabled: !!userId,
    queryFn: async () => {
      const fazendaId = await getFazendaId(userId!)
      if (!fazendaId) return null

      const { data, error } = await supabase.rpc('get_dashboard_stats', { p_fazenda_id: fazendaId })
      if (error) throw error

      const result = data as {
        cadastroStats: { pastos: number; lotes: number; funcionarios: number; insumos: number; pluviometros: number; medicamentos: number }
        cadernetaStats: Record<string, number>
        registrosHoje: number
      }

      return {
        cadastroStats: result.cadastroStats,
        cadernetaStats: result.cadernetaStats,
        registrosHoje: result.registrosHoje,
      }
    },
  })
}

export function useGadoStats(userId: string | undefined) {
  return useQuery({
    queryKey: ['gado-stats', userId],
    enabled: !!userId,
    queryFn: async () => {
      const fazendaId = await getFazendaId(userId!)
      if (!fazendaId) return null

      const { data, error } = await supabase.rpc('get_gado_stats', { p_fazenda_id: fazendaId })
      if (error) throw error

      return data as {
        totalAnimais: number
        animaisPorLote: { nome: string; cabecas: number }[]
        pesoMedioLotes: number
        mortesMesAtual: number
        enfermariaMesAtual: number
        causasMorteFrequentes: { causa: string; total: number }[]
      }
    },
  })
}

export function useRecentActivities(userId: string | undefined) {
  return useQuery({
    queryKey: ['recent-activities', userId],
    enabled: !!userId,
    queryFn: async () => {
      const fazendaId = await getFazendaId(userId!)
      if (!fazendaId) return []

      const { data, error } = await supabase.rpc('get_recent_activities', { p_fazenda_id: fazendaId })
      if (error) throw error

      const activities = (data as { activities: { id: string; type: string; title: string; data: string }[] }).activities

      const typePaths: Record<string, string> = {
        Maternidade: '/controller/cadernetas/maternidade',
        Enfermaria: '/controller/cadernetas/enfermaria',
        Rodeio: '/controller/cadernetas/rodeio',
      }

      return activities.map(a => ({
        id: a.id,
        type: a.type,
        title: a.title,
        date: formatDateTime(a.data),
        path: `${typePaths[a.type]}/${a.id}`,
      }))
    },
  })
}

export function useFormulacoesBackfillAlert(userId: string | undefined) {
  return useQuery({
    queryKey: ['formulacoes-backfill-alert', userId],
    enabled: !!userId,
    queryFn: async () => {
      const fazendaId = await getFazendaId(userId!)
      if (!fazendaId) return [] as { id: string; nome: string; categoria: string | null; categoria_inferida_observacao: string | null }[]

      const { data, error } = await supabase
        .from('formulacoes')
        .select('id, nome, categoria, categoria_inferida_observacao')
        .eq('fazenda_id', fazendaId)
        .eq('ativo', true)
        .eq('categoria_inferida_automaticamente', true)
        .order('nome', { ascending: true })

      if (error) throw error
      return (data as { id: string; nome: string; categoria: string | null; categoria_inferida_observacao: string | null }[]) || []
    },
  })
}
