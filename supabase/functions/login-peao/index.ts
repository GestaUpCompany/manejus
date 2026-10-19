import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req: Request) => {
  // Habilitar CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }

  try {
    const { acesso_id } = await req.json()

    if (!acesso_id) {
      return new Response(JSON.stringify({ error: 'acesso_id é obrigatório' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Buscar peão pelo acesso_id da fazenda
    const { data: peao, error: peaoError } = await supabase
      .from('peoes')
      .select('*')
      .eq('fazenda_id', acesso_id)
      .eq('ativo', true)
      .single()

    if (peaoError || !peao) {
      return new Response(JSON.stringify({ error: 'Peão não encontrado para esta fazenda' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Fazer login no Supabase Auth com email/senha do peão
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: peao.email,
      password: peao.password,
    })

    if (authError) {
      return new Response(JSON.stringify({ error: 'Erro ao fazer login: ' + authError.message }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    if (!authData.user) {
      return new Response(JSON.stringify({ error: 'Usuário não retornado pelo login' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Sincronizar usuário e vínculo com a fazenda
    const userId = authData.user.id
    const email = authData.user.email || peao.email
    const nome = (authData.user.user_metadata?.nome as string) || email.split('@')[0]

    try {
      // Buscar fazenda ativa pelo acesso_id
      const { data: fazenda, error: fazendaError } = await supabase
        .from('fazendas')
        .select('id')
        .eq('acesso_id', acesso_id)
        .eq('ativo', true)
        .limit(1)

      if (fazendaError || !fazenda || fazenda.length === 0) {
        console.error('Fazenda não encontrada para sincronização:', fazendaError)
      } else {
        const fazendaId = fazenda[0].id

        // Verificar se usuario existe em public.usuarios
        const { data: usuarioExistente } = await supabase
          .from('usuarios')
          .select('id')
          .eq('auth_id', userId)
          .limit(1)

        if (!usuarioExistente || usuarioExistente.length === 0) {
          const { error: insertUsuarioError } = await supabase
            .from('usuarios')
            .insert({
              id: userId,
              auth_id: userId,
              email,
              nome,
              ativo: true,
              papel: 'controller',
            })

          if (insertUsuarioError) {
            console.error('Erro ao sincronizar usuario:', insertUsuarioError)
          } else {
            console.log('Usuario sincronizado:', userId)
          }
        }

        // Verificar se vinculo existe em usuario_fazenda
        const { data: vinculoExistente } = await supabase
          .from('usuario_fazenda')
          .select('id')
          .eq('usuario_id', userId)
          .eq('fazenda_id', fazendaId)
          .limit(1)

        if (!vinculoExistente || vinculoExistente.length === 0) {
          const { error: insertVinculoError } = await supabase
            .from('usuario_fazenda')
            .insert({
              usuario_id: userId,
              fazenda_id: fazendaId,
              papel: 'controller',
              ativo: true,
            })

          if (insertVinculoError) {
            console.error('Erro ao sincronizar vinculo:', insertVinculoError)
          } else {
            console.log('Vinculo sincronizado:', userId, fazendaId)
          }
        }
      }
    } catch (syncError) {
      console.error('Erro inesperado na sincronizacao:', syncError)
    }

    // Retornar o token JWT e dados da sessão
    return new Response(JSON.stringify({
      success: true,
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token,
      user: authData.user,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: 'Erro interno: ' + (error as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
