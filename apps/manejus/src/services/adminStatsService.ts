import { supabase } from './supabaseClient'

export interface AdminStats {
  totalFazendas: number
  fazendasAtivas: number
  fazendasInativas: number
  totalUsuarios: number
  usuariosAtivos: number
  totalLotes: number
  totalPastos: number
  totalIndividuos: number
}

export interface EvolutionData {
  month: string
  label: string
  fazendas: number
  usuarios: number
  individuos: number
}

export async function getAdminStats(): Promise<AdminStats> {
  const [
    { count: totalFazendas, error: fazendasError },
    { count: fazendasAtivas, error: fazendasAtivasError },
    { count: fazendasInativas, error: fazendasInativasError },
    { count: totalUsuarios, error: usuariosError },
    { count: usuariosAtivos, error: usuariosAtivosError },
    { count: totalLotes, error: lotesError },
    { count: totalPastos, error: pastosError },
    { count: totalIndividuos, error: individuosError },
  ] = await Promise.all([
    supabase.from('fazendas').select('*', { count: 'exact', head: true }),
    supabase.from('fazendas').select('*', { count: 'exact', head: true }).eq('ativo', true),
    supabase.from('fazendas').select('*', { count: 'exact', head: true }).eq('ativo', false),
    supabase.from('usuarios').select('*', { count: 'exact', head: true }),
    supabase.from('usuarios').select('*', { count: 'exact', head: true }).eq('ativo', true),
    supabase.from('lotes').select('*', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('pastos').select('*', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('individuos').select('*', { count: 'exact', head: true }).is('deleted_at', null),
  ])

  if (fazendasError) console.error('Erro ao buscar total de fazendas:', fazendasError)
  if (fazendasAtivasError) console.error('Erro ao buscar fazendas ativas:', fazendasAtivasError)
  if (fazendasInativasError) console.error('Erro ao buscar fazendas inativas:', fazendasInativasError)
  if (usuariosError) console.error('Erro ao buscar total de usuários:', usuariosError)
  if (usuariosAtivosError) console.error('Erro ao buscar usuários ativos:', usuariosAtivosError)
  if (lotesError) console.error('Erro ao buscar total de lotes:', lotesError)
  if (pastosError) console.error('Erro ao buscar total de pastos:', pastosError)
  if (individuosError) console.error('Erro ao buscar total de indivíduos:', individuosError)

  return {
    totalFazendas: totalFazendas || 0,
    fazendasAtivas: fazendasAtivas || 0,
    fazendasInativas: fazendasInativas || 0,
    totalUsuarios: totalUsuarios || 0,
    usuariosAtivos: usuariosAtivos || 0,
    totalLotes: totalLotes || 0,
    totalPastos: totalPastos || 0,
    totalIndividuos: totalIndividuos || 0,
  }
}

export async function getAdminEvolutionData(months = 6): Promise<EvolutionData[]> {
  const startDate = new Date()
  startDate.setMonth(startDate.getMonth() - (months - 1))
  startDate.setDate(1)
  startDate.setHours(0, 0, 0, 0)

  const { data, error } = await supabase.rpc('get_admin_evolution', {
    start_date: startDate.toISOString(),
  })

  if (error) {
    console.error('Erro ao buscar evolução:', error)
    return []
  }

  return (data || []).map((row: any) => {
    const [year, month] = row.month.split('-')
    const date = new Date(Number(year), Number(month) - 1, 1)
    const label = date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
    return {
      month: row.month,
      label,
      fazendas: row.fazendas || 0,
      usuarios: row.usuarios || 0,
      individuos: row.individuos || 0,
    }
  })
}
