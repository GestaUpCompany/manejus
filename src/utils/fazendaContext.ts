import { supabase } from '../services/supabaseClient'

const SELECTED_FAZENDA_KEY = 'selectedFazendaId'

export function getSelectedFazendaId(): string | null {
  return localStorage.getItem(SELECTED_FAZENDA_KEY)
}

export function setSelectedFazendaId(fazendaId: string | null) {
  if (fazendaId) {
    localStorage.setItem(SELECTED_FAZENDA_KEY, fazendaId)
  } else {
    localStorage.removeItem(SELECTED_FAZENDA_KEY)
  }
}

export async function getFazendaIdForUser(userId: string): Promise<string | null> {
  const selectedId = getSelectedFazendaId()

  const { data: vinculos } = await supabase
    .from('usuario_fazenda')
    .select('fazenda_id')
    .eq('usuario_id', userId)
    .eq('ativo', true)

  if (!vinculos || vinculos.length === 0) return null

  if (selectedId && vinculos.some((v) => v.fazenda_id === selectedId)) {
    return selectedId
  }

  return vinculos[0].fazenda_id
}

export async function getFazendaNome(fazendaId: string): Promise<string | null> {
  const { data } = await supabase
    .from('fazendas')
    .select('nome')
    .eq('id', fazendaId)
    .single()
  return data?.nome || null
}
