import { supabase } from './supabaseClient'

export interface UsuarioFazenda {
  id?: string
  usuario_id: string
  fazenda_id: string
  papel: 'admin' | 'controller'
  created_at?: string
}

export async function getFazendasDoUsuario(usuarioId: string): Promise<UsuarioFazenda[]> {
  const { data, error } = await supabase
    .from('usuario_fazenda')
    .select('*')
    .eq('usuario_id', usuarioId)

  if (error) {
    console.error('Erro ao buscar fazendas do usuário:', error)
    return []
  }

  return data || []
}

export async function getUsuariosDaFazenda(fazendaId: string): Promise<UsuarioFazenda[]> {
  const { data, error } = await supabase
    .from('usuario_fazenda')
    .select('*')
    .eq('fazenda_id', fazendaId)

  if (error) {
    console.error('Erro ao buscar usuários da fazenda:', error)
    return []
  }

  return data || []
}

export async function vincularFazendaAoUsuario(usuarioFazenda: Omit<UsuarioFazenda, 'id' | 'created_at'>): Promise<UsuarioFazenda | null> {
  const { data, error } = await supabase
    .from('usuario_fazenda')
    .insert(usuarioFazenda)
    .select()
    .single()

  if (error) {
    console.error('Erro ao vincular fazenda ao usuário:', error)
    return null
  }

  return data
}

export async function desvincularFazendaDoUsuario(usuarioId: string, fazendaId: string): Promise<boolean> {
  const { error } = await supabase
    .from('usuario_fazenda')
    .delete()
    .eq('usuario_id', usuarioId)
    .eq('fazenda_id', fazendaId)

  if (error) {
    console.error('Erro ao desvincular fazenda do usuário:', error)
    return false
  }

  return true
}

export async function atualizarVinculo(usuarioId: string, fazendaId: string, papel: 'admin' | 'controller'): Promise<boolean> {
  const { error } = await supabase
    .from('usuario_fazenda')
    .update({ papel })
    .eq('usuario_id', usuarioId)
    .eq('fazenda_id', fazendaId)

  if (error) {
    console.error('Erro ao atualizar vínculo:', error)
    return false
  }

  return true
}
