import { supabase } from './supabaseClient'
import { signUp } from './authService'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL

async function rollbackUserCreation(userId: string, fazendaId?: string): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      console.error('No session found for rollback')
      return false
    }

    const response = await fetch(
      `${supabaseUrl}/functions/v1/rollback-user-creation`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, fazendaId }),
      }
    )

    if (!response.ok) {
      const error = await response.json()
      console.error('Error calling rollback function:', error)
      return false
    }

    const result = await response.json()
    console.log('Rollback result:', result)
    return result.success || false
  } catch (error) {
    console.error('Exception in rollback:', error)
    return false
  }
}

export interface Fazenda {
  id: string
  acesso_id: string
  nome: string
  cnpj?: string
  endereco?: string
  telefone?: string
  email?: string
  logo_url?: string
  planilha_id?: string
  ativo: boolean
  controle_acesso_habilitado: boolean
  acesso_confinamento: boolean
  expediente_habilitado?: boolean
  expediente_timezone?: string
  expediente_dias?: ExpedienteDias | null
  grupo_id?: string | null
  created_at: string
  updated_at: string
}

export interface ExpedienteDia {
  ativo: boolean
  inicio: string
  fim: string
}

export type ExpedienteDias = Record<number, ExpedienteDia>

export async function getFazendas(): Promise<Fazenda[]> {
  const { data, error } = await supabase
    .from('fazendas')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Erro ao buscar fazendas:', error)
    return []
  }

  return data || []
}

export async function getFazendaById(id: string): Promise<Fazenda | null> {
  const { data, error } = await supabase
    .from('fazendas')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Erro ao buscar fazenda:', error)
    return null
  }

  return data
}

export async function createFazenda(fazenda: Omit<Fazenda, 'id' | 'created_at' | 'updated_at'>): Promise<Fazenda | null> {
  const { data, error } = await supabase
    .from('fazendas')
    .insert(fazenda)
    .select()
    .single()

  if (error) {
    console.error('Erro ao criar fazenda:', error)
    return null
  }

  return data
}

export async function updateFazenda(id: string, fazenda: Partial<Fazenda>): Promise<Fazenda | null> {
  const { data, error } = await supabase
    .from('fazendas')
    .update(fazenda)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Erro ao atualizar fazenda:', error)
    return null
  }

  return data
}

export async function deleteFazenda(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('fazendas')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Erro ao deletar fazenda:', error)
    return false
  }

  return true
}

export interface CreateFazendaWithControllerParams {
  acesso_id: string
  nome: string
  cnpj?: string
  endereco?: string
  telefone?: string
  email?: string
  logo_url?: string
  ativo: boolean
  acesso_confinamento: boolean
  controller_email: string
  controller_nome?: string
  grupo_id?: string
}

export interface CreateFazendaWithControllerResult {
  fazenda: Fazenda | null
  controller: { email: string; senha: string } | null
  error?: string
}

export async function createFazendaWithController(
  params: CreateFazendaWithControllerParams
): Promise<CreateFazendaWithControllerResult> {
  const { controller_email, controller_nome } = params

  // Passo 1: Criar fazenda primeiro
  const fazenda = await createFazenda({
    acesso_id: params.acesso_id,
    nome: params.nome,
    cnpj: params.cnpj,
    endereco: params.endereco,
    telefone: params.telefone,
    email: params.email,
    logo_url: params.logo_url,
    ativo: params.ativo,
    controle_acesso_habilitado: false,
    acesso_confinamento: params.acesso_confinamento,
    grupo_id: params.grupo_id,
  })

  if (!fazenda) {
    return {
      fazenda: null,
      controller: null,
      error: 'Erro ao criar fazenda'
    }
  }

  // Passo 2: Criar controller
  const senha = `${params.acesso_id}2026`
  const nomeController = controller_nome || `Controller ${params.nome}`

  const user = await signUp(controller_email, senha, nomeController, undefined, 'controller')

  if (!user) {
    // Rollback: deletar fazenda criada
    await deleteFazenda(fazenda.id)
    return {
      fazenda: null,
      controller: null,
      error: 'Erro ao criar usuário controller'
    }
  }

  // Passo 3: Associar usuário à fazenda na tabela usuario_fazenda
  const { error: associationError } = await supabase
    .from('usuario_fazenda')
    .insert({
      usuario_id: user.id,
      fazenda_id: fazenda.id,
      papel: 'controller',
      ativo: true,
    })

  if (associationError) {
    console.error('Erro ao associar usuário à fazenda:', associationError)
    // Rollback: deletar usuário e fazenda
    await rollbackUserCreation(user.id)
    await deleteFazenda(fazenda.id)
    return {
      fazenda: null,
      controller: null,
      error: 'Erro ao associar usuário à fazenda'
    }
  }

  // Passo 4: Criar peão para acesso do app mobile
  const peaoEmail = `peao.${params.acesso_id}@gestaup.internal`
  const peaoPassword = `${params.acesso_id}2026!`

  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      console.error('No session found for peão creation')
      return {
        fazenda,
        controller: {
          email: controller_email,
          senha,
        }
      }
    }

    const peaoResponse = await fetch(
      `${supabaseUrl}/functions/v1/create-auth-user-only`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: peaoEmail,
          password: peaoPassword,
          nome: `Peão ${params.nome}`,
        }),
      }
    )

    if (peaoResponse.ok) {
      const peaoResult = await peaoResponse.json()
      if (peaoResult.success && peaoResult.user?.id) {
        const peaoAuthId = peaoResult.user.id

        // Inserir peão na tabela peoes
        const { error: peaoError } = await supabase
          .from('peoes')
          .insert({
            email: peaoEmail,
            password: peaoPassword,
            fazenda_id: params.acesso_id,
            ativo: true,
          })

        if (peaoError) {
          console.error('Erro ao inserir peão na tabela peoes:', peaoError)
        }

        // Inserir peão na tabela usuarios (necessário para RLS de lote_categorias)
        // A Edge Function create-auth-user-only cria apenas em auth.users, não em usuarios.
        // Sem este registro, a RLS bloqueia SELECT em lote_categorias e o PWA exibe
        // categorias/peso/cabeças zerados mesmo com dados válidos no banco.
        const { error: peaoUsuarioError } = await supabase
          .from('usuarios')
          .insert({
            id: peaoAuthId,
            auth_id: peaoAuthId,
            email: peaoEmail,
            nome: `Peão ${params.nome}`,
            papel: 'controller',
            ativo: true,
          })

        if (peaoUsuarioError) {
          console.error('Erro ao inserir peão na tabela usuarios:', peaoUsuarioError)
        }

        // Associar peão à fazenda na tabela usuario_fazenda
        const { error: peaoAssociacaoError } = await supabase
          .from('usuario_fazenda')
          .insert({
            usuario_id: peaoAuthId,
            fazenda_id: fazenda.id,
            papel: 'controller',
            ativo: true,
          })

        if (peaoAssociacaoError) {
          console.error('Erro ao associar peão à fazenda:', peaoAssociacaoError)
        }
      }
    } else {
      console.error('Erro ao criar usuário peão no Auth')
    }
  } catch (error) {
    console.error('Exception ao criar peão:', error)
  }

  return {
    fazenda,
    controller: {
      email: controller_email,
      senha,
    }
  }
}
