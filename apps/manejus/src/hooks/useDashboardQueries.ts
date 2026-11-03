import { useQuery } from '@tanstack/react-query'
import { supabase } from '@gestaup/supabase'
import { getFazendaIdForUser } from '@gestaup/shared'
import { formatDateTime } from '@gestaup/shared'

async function getFazendaId(userId: string): Promise<string | null> {
  return getFazendaIdForUser(userId)
}

export { useFazenda } from '@gestaup/shared'

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

export type RebanhoFaixaEtariaItem = { faixa: string; sexo: string; cabecas: number }

export function useRebanhoFaixaEtaria(userId: string | undefined) {
  return useQuery({
    queryKey: ['rebanho-faixa-etaria', userId],
    enabled: !!userId,
    queryFn: async () => {
      const fazendaId = await getFazendaId(userId!)
      if (!fazendaId) return [] as RebanhoFaixaEtariaItem[]

      const { data, error } = await supabase.rpc('get_rebanho_faixa_etaria', { p_fazenda_id: fazendaId })
      if (error) throw error

      return (data as RebanhoFaixaEtariaItem[]) ?? []
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

      // Só maternidade, enfermaria e rodeio têm tela de detalhe; as demais levam à lista da caderneta.
      const detailPaths: Record<string, string> = {
        Maternidade: '/controller/cadernetas/maternidade',
        Enfermaria: '/controller/cadernetas/enfermaria',
        Rodeio: '/controller/cadernetas/rodeio',
      }
      const listPaths: Record<string, string> = {
        Pastagens: '/controller/cadernetas/pastagens',
        'Suplementação': '/controller/cadernetas/suplementacao',
        Bebedouros: '/controller/cadernetas/bebedouros',
        'Movimentação': '/controller/cadernetas/movimentacao',
        Morte: '/controller/cadernetas/morte',
        Pesagem: '/controller/cadernetas/pesagem',
        'Leitura de cocho': '/controller/cadernetas/leitura-cocho',
        Trato: '/controller/cadernetas/trato-confinamento',
        'Fábrica de confinamento': '/controller/cadernetas/fabrica-confinamento',
        'Manejo de curral': '/controller/cadernetas/manejo-curral',
        Clima: '/controller/cadernetas/clima',
        Limpeza: '/controller/cadernetas/limpeza',
        Problemas: '/controller/cadernetas/problemas',
        'Operações de máquinas': '/controller/cadernetas/operacoes-maquinas',
        'Manutenção de máquinas': '/controller/cadernetas/manutencao-maquinas',
        Abastecimento: '/controller/cadernetas/abastecimento',
        Almoxarifado: '/controller/cadernetas/almoxarifado',
        Cantina: '/controller/cadernetas/alimentacao',
        'Entrada de insumos': '/controller/cadernetas/entrada-insumos',
        'Saída de insumos': '/controller/cadernetas/saida-insumos',
      }

      return activities.map(a => ({
        id: a.id,
        type: a.type,
        title: a.title,
        date: formatDateTime(a.data),
        path: detailPaths[a.type] ? `${detailPaths[a.type]}/${a.id}` : (listPaths[a.type] ?? '/controller'),
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
