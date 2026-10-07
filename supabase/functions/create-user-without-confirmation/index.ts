import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { canCreateUserWithPapel, canManageAuthUsers } from '../_shared/authz.ts'
import { corsHeaders, json, requireCaller } from '../_shared/requireCaller.ts'

// Cria conta no Auth (email auto-confirmado) + linha em public.usuarios.
// Autorização: chamador admin/super_admin; só super_admin cria admin/super_admin.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const caller = await requireCaller(req)
    if (caller instanceof Response) return caller
    if (!canManageAuthUsers(caller.papel)) return json({ error: 'Forbidden' }, 403)

    const { email, password, nome, telefone, papel } = await req.json()
    if (!email || !password || !nome || !papel) {
      return json({ error: 'Missing required fields' }, 400)
    }
    if (!canCreateUserWithPapel(caller.papel, papel)) {
      return json({ error: 'Forbidden: papel não permitido para o seu perfil' }, 403)
    }

    const { data: authData, error: authError } = await caller.admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome },
    })
    if (authError) {
      console.error('Error creating user in Auth:', authError)
      return json({ error: authError.message }, 400)
    }
    if (!authData.user) return json({ error: 'Failed to create user' }, 500)

    const { data: userData, error: dbError } = await caller.admin
      .from('usuarios')
      .insert({
        id: authData.user.id,
        auth_id: authData.user.id,
        email,
        nome,
        telefone,
        papel,
        ativo: true,
      })
      .select()
      .single()

    if (dbError) {
      console.error('Error creating user in database:', dbError)
      // Rollback: remove a conta criada no Auth
      await caller.admin.auth.admin.deleteUser(authData.user.id)
      return json({ error: dbError.message }, 500)
    }

    return json({ success: true, user: userData })
  } catch (error) {
    console.error('Error in create user function:', error)
    return json({ error: (error as Error).message }, 500)
  }
})
