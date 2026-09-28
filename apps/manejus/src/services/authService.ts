import { supabase } from './supabaseClient'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

export interface User {
  id: string
  auth_id?: string
  email: string
  nome: string
  telefone?: string
  papel: 'admin' | 'super_admin' | 'controller'
  ativo: boolean
}

export interface Session {
  user: User
  token: string
}

// Erro lançado quando o usuário autentica com sucesso no Auth, mas não tem
// permissão de acesso ao sistema (conta desativada ou fazenda desativada).
export class AccessDeniedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AccessDeniedError'
  }
}

// Verifica se o usuário possui vínculo ativo com ao menos uma fazenda ativa.
async function hasActiveFazenda(usuarioId: string): Promise<boolean> {
  const { data: vinculos, error: vinculosError } = await supabase
    .from('usuario_fazenda')
    .select('fazenda_id')
    .eq('usuario_id', usuarioId)
    .eq('ativo', true)

  if (vinculosError) {
    console.error('Erro ao buscar vínculos do usuário:', vinculosError)
    return false
  }

  const fazendaIds = (vinculos ?? []).map((v) => v.fazenda_id)
  if (fazendaIds.length === 0) return false

  const { data: fazendas, error: fazendasError } = await supabase
    .from('fazendas')
    .select('id')
    .in('id', fazendaIds)
    .eq('ativo', true)

  if (fazendasError) {
    console.error('Erro ao verificar status das fazendas:', fazendasError)
    return false
  }

  return (fazendas?.length ?? 0) > 0
}

// Garante que o usuário tem permissão de acesso ao sistema.
// Retorna null se permitido; caso contrário retorna a mensagem do motivo do bloqueio.
async function getAccessDeniedReason(userData: User): Promise<string | null> {
  if (!userData.ativo) {
    return 'Usuário desativado. Entre em contato com o administrador.'
  }

  // Admins e super_admins não dependem de vínculo com fazenda.
  if (userData.papel === 'admin' || userData.papel === 'super_admin') return null

  const fazendaAtiva = await hasActiveFazenda(userData.id)
  if (!fazendaAtiva) {
    return 'Acesso indisponível: nenhuma fazenda ativa associada a este usuário. Entre em contato com o administrador.'
  }

  return null
}

export async function signIn(email: string, password: string): Promise<Session | null> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    console.error('Erro ao fazer login (Auth):', error)
    return null
  }

  // Buscar dados adicionais do usuário
  const { data: userData, error: userError } = await supabase
    .from('usuarios')
    .select('*')
    .eq('email', email)
    .maybeSingle()

  if (userError) {
    console.error('Erro ao buscar dados do usuário (DB):', userError)
    return null
  }

  if (!userData) {
    console.error('Usuário não encontrado na tabela usuarios')
    return null
  }

  // Bloquear login de usuários desativados ou de fazendas desativadas.
  const deniedReason = await getAccessDeniedReason(userData as User)
  if (deniedReason) {
    await supabase.auth.signOut()
    throw new AccessDeniedError(deniedReason)
  }

  return {
    user: userData as User,
    token: data.session.access_token,
  }
}

export async function signUp(email: string, password: string, nome: string, telefone?: string, papel: 'admin' | 'controller' = 'controller'): Promise<User | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      console.error('No session found for user creation')
      return null
    }

    const response = await fetch(
      `${supabaseUrl}/functions/v1/create-user-without-confirmation`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, nome, telefone, papel }),
      }
    )

    if (!response.ok) {
      const error = await response.json()
      console.error('Error calling create user function:', error)
      return null
    }

    const result = await response.json()
    return result.user
  } catch (error) {
    console.error('Exception in signUp:', error)
    return null
  }
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) {
    console.error('Erro ao fazer logout:', error)
  }
}

export async function updateUltimoAcesso(authId?: string): Promise<void> {
  let userId = authId

  if (!userId) {
    const { data: { session } } = await supabase.auth.getSession()
    userId = session?.user?.id
  }

  if (!userId) return

  const { error } = await supabase
    .from('usuarios')
    .update({ ultimo_acesso: new Date().toISOString() })
    .eq('auth_id', userId)

  if (error) {
    console.error('Erro ao atualizar último acesso:', error)
  }
}

export async function getCurrentUser(): Promise<User | null> {
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error) {
    console.error('Erro ao buscar usuário do Auth:', error)
    return null
  }

  if (!user) {
    return null
  }

  // Tentar buscar por auth_id primeiro
  const { data: userDataByAuthId } = await supabase
    .from('usuarios')
    .select('*')
    .eq('auth_id', user.id)
    .maybeSingle()

  let userData = userDataByAuthId as User | null

  // Se não encontrar por auth_id, tentar buscar por email
  if (!userData) {
    const { data: userDataByEmail, error: emailError } = await supabase
      .from('usuarios')
      .select('*')
      .eq('email', user.email)
      .maybeSingle()

    if (emailError) {
      console.error('Erro ao buscar dados do usuário (DB):', emailError)
      return null
    }

    if (!userDataByEmail) {
      console.error('Usuário não encontrado na tabela usuarios')
      return null
    }

    userData = userDataByEmail as User
  }

  // Revalidar acesso: encerra a sessão de usuários desativados ou de fazendas
  // desativadas, mesmo que já estivessem logados.
  const deniedReason = await getAccessDeniedReason(userData)
  if (deniedReason) {
    console.warn('Acesso negado ao usuário:', deniedReason)
    await supabase.auth.signOut()
    return null
  }

  return userData
}

export async function onAuthStateChange(callback: (user: User | null) => void) {
  return supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session) {
      // Try to get user from database, but don't fail if it doesn't work
      try {
        const user = await getCurrentUser()
        callback(user)
      } catch (error) {
        console.error('Error fetching user from database:', error)
        // Still set user as logged in even if DB lookup fails
        callback(null)
      }
    } else {
      callback(null)
    }
  })
}

export async function changeUserPassword(usuarioId: string, newPassword: string): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return false
    }

    // Buscar o auth_id do usuário
    const { data: userData, error: userError } = await supabase
      .from('usuarios')
      .select('auth_id, id')
      .eq('id', usuarioId)
      .single()

    if (userError || !userData) {
      console.error('Erro ao buscar auth_id do usuário:', userError)
      return false
    }

    // Usar auth_id se existir, senão usar o próprio id
    const authId = userData.auth_id || userData.id

    const response = await fetch(
      `${supabaseUrl}/functions/v1/change-user-password`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: authId, newPassword }),
      }
    )

    if (!response.ok) {
      const error = await response.json()
      console.error('Erro ao alterar senha:', error)
      return false
    }

    return true
  } catch (error) {
    console.error('Erro ao alterar senha:', error)
    return false
  }
}
