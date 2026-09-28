import { supabase } from './supabaseClient'

export interface Usuario {
  id: string
  email: string
  nome: string
  telefone?: string
  papel: 'admin' | 'controller'
  ativo: boolean
  ultimo_acesso?: string
  created_at: string
  updated_at: string
}

export async function getUsuarios(): Promise<Usuario[]> {
  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Erro ao buscar usuários:', error)
    return []
  }

  return data || []
}

export async function getUsuarioById(id: string): Promise<Usuario | null> {
  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Erro ao buscar usuário:', error)
    return null
  }

  return data
}

export async function createUsuario(usuario: Omit<Usuario, 'id' | 'created_at' | 'updated_at'>): Promise<Usuario | null> {
  const { data, error } = await supabase
    .from('usuarios')
    .insert(usuario)
    .select()
    .single()

  if (error) {
    console.error('Erro ao criar usuário:', error)
    return null
  }

  return data
}

export async function updateUsuario(id: string, usuario: Partial<Usuario>): Promise<Usuario | null> {
  const { data, error } = await supabase
    .from('usuarios')
    .update(usuario)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Erro ao atualizar usuário:', error)
    return null
  }

  return data
}

export async function deleteUsuario(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('usuarios')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Erro ao deletar usuário:', error)
    return false
  }

  return true
}
