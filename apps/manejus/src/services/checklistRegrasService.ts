import { supabase } from './supabaseClient'

export type ChecklistRegraTipo = 'periodo' | 'excecao'

export interface ChecklistRegra {
  id: string
  fazenda_id: string
  cadernetas: string[]
  tipo: ChecklistRegraTipo
  data_inicio: string
  data_fim: string | null
  ativo: boolean
  created_at: string
  updated_at: string
}

export async function getChecklistRegras(fazendaId: string): Promise<ChecklistRegra[]> {
  const { data, error } = await supabase
    .from('checklist_regras')
    .select('*')
    .eq('fazenda_id', fazendaId)
    .order('data_inicio', { ascending: false })

  if (error) {
    console.error('Erro ao buscar regras de checklist:', error)
    return []
  }

  return data || []
}

export async function getChecklistRegraById(id: string): Promise<ChecklistRegra | null> {
  const { data, error } = await supabase
    .from('checklist_regras')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Erro ao buscar regra de checklist:', error)
    return null
  }

  return data
}

export async function createChecklistRegra(
  regra: Omit<ChecklistRegra, 'id' | 'created_at' | 'updated_at'>
): Promise<ChecklistRegra | null> {
  const { data, error } = await supabase
    .from('checklist_regras')
    .insert(regra)
    .select()
    .single()

  if (error) {
    console.error('Erro ao criar regra de checklist:', error)
    return null
  }

  return data
}

export async function updateChecklistRegra(
  id: string,
  regra: Partial<Omit<ChecklistRegra, 'id' | 'fazenda_id' | 'created_at' | 'updated_at'>>
): Promise<ChecklistRegra | null> {
  const { data, error } = await supabase
    .from('checklist_regras')
    .update(regra)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Erro ao atualizar regra de checklist:', error)
    return null
  }

  return data
}

export async function deleteChecklistRegra(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('checklist_regras')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Erro ao deletar regra de checklist:', error)
    return false
  }

  return true
}
