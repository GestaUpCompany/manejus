import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { canChangePassword, isUuid } from '../_shared/authz.ts'
import { corsHeaders, json, papelDoUsuario, requireCaller } from '../_shared/requireCaller.ts'

// Troca a senha de um usuário. Chamador admin/super_admin; só super_admin troca a senha de
// admin/super_admin (admin troca a própria e a de controller).
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const caller = await requireCaller(req)
    if (caller instanceof Response) return caller

    const { userId, newPassword } = await req.json()
    if (!userId || !newPassword) return json({ error: 'Missing userId or newPassword' }, 400)
    if (!isUuid(userId)) return json({ error: 'Invalid userId' }, 400)
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return json({ error: 'Senha deve ter pelo menos 6 caracteres' }, 400)
    }

    const alvoPapel = await papelDoUsuario(caller.admin, userId)
    if (!canChangePassword(caller.papel, caller.userId, userId, alvoPapel)) {
      return json({ error: 'Forbidden' }, 403)
    }

    const { error } = await caller.admin.auth.admin.updateUserById(userId, { password: newPassword })
    if (error) return json({ error: error.message }, 500)

    return json({ success: true })
  } catch (error) {
    return json({ error: (error as Error).message }, 500)
  }
})
