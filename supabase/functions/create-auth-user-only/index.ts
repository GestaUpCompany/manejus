import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { canManageAuthUsers } from '../_shared/authz.ts'
import { corsHeaders, json, requireCaller } from '../_shared/requireCaller.ts'

// Cria apenas a conta no Auth (usada para o peão da fazenda). Chamador admin/super_admin.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const caller = await requireCaller(req)
    if (caller instanceof Response) return caller
    if (!canManageAuthUsers(caller.papel)) return json({ error: 'Forbidden' }, 403)

    const { email, password, nome } = await req.json()
    if (!email || !password || !nome) return json({ error: 'Missing required fields' }, 400)

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

    return json({ success: true, user: { id: authData.user.id, email, nome } })
  } catch (error) {
    console.error('Error:', error)
    return json({ error: (error as Error).message }, 500)
  }
})
