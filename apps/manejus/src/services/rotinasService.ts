import { supabase } from './supabaseClient'
import { Rotina } from '../utils/rotinas'

export type { Rotina }

export async function getRotinas(fazendaId: string): Promise<Rotina[]> {
  const { data, error } = await supabase
    .from('rotinas')
    .select('*')
    .eq('fazenda_id', fazendaId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[Rotinas] Erro ao buscar rotinas:', error)
    return []
  }

  return (data || []).map((r) => ({
    ...r,
    dias_semana: Array.isArray(r.dias_semana) ? r.dias_semana.map(Number) : [],
    cadernetas: Array.isArray(r.cadernetas) ? r.cadernetas : [],
  })) as Rotina[]
}

export async function createRotina(
  payload: Omit<Rotina, 'id' | 'created_at' | 'updated_at'>
): Promise<Rotina | null> {
  const { data, error } = await supabase
    .from('rotinas')
    .insert(payload)
    .select()
    .single()

  if (error) {
    console.error('[Rotinas] Erro ao criar rotina:', error)
    return null
  }

  return data as Rotina
}

export async function updateRotina(
  id: string,
  payload: Partial<Omit<Rotina, 'id' | 'created_at' | 'updated_at'>>
): Promise<Rotina | null> {
  const { data, error } = await supabase
    .from('rotinas')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[Rotinas] Erro ao atualizar rotina:', error)
    return null
  }

  return data as Rotina
}

export async function deleteRotina(id: string): Promise<boolean> {
  const { error } = await supabase.from('rotinas').delete().eq('id', id)

  if (error) {
    console.error('[Rotinas] Erro ao excluir rotina:', error)
    return false
  }

  return true
}
