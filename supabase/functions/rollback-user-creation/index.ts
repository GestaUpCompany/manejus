import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { canRollbackTarget, isRecent, isUuid } from '../_shared/authz.ts'
import { corsHeaders, json, papelDoUsuario, requireCaller } from '../_shared/requireCaller.ts'

// Desfaz uma criação de usuário/fazenda que falhou no meio. Como apaga com service role (e a
// exclusão de fazenda cascateia), é restrito: chamador admin/super_admin, alvo NUNCA admin,
// conta criada há <= 30 min, e fazenda recém-criada e SEM lotes. Todas as checagens ocorrem
// antes de qualquer exclusão.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const caller = await requireCaller(req)
    if (caller instanceof Response) return caller

    const { userId, fazendaId } = await req.json()
    if (!userId) return json({ error: 'userId is required' }, 400)
    if (!isUuid(userId) || (fazendaId && !isUuid(fazendaId))) return json({ error: 'Invalid id' }, 400)
    if (userId === caller.userId) return json({ error: 'Forbidden: não é possível remover a si mesmo' }, 403)

    const alvoPapel = await papelDoUsuario(caller.admin, userId)
    if (!canRollbackTarget(caller.papel, alvoPapel)) return json({ error: 'Forbidden' }, 403)

    const { data: alvoAuth, error: alvoErr } = await caller.admin.auth.admin.getUserById(userId)
    if (alvoErr || !alvoAuth.user) return json({ error: 'Usuário não encontrado' }, 404)
    if (!isRecent(alvoAuth.user.created_at, Date.now())) {
      return json({ error: 'Forbidden: só é possível desfazer contas criadas há menos de 30 minutos' }, 403)
    }

    if (fazendaId) {
      const { data: fazenda } = await caller.admin
        .from('fazendas')
        .select('created_at')
        .eq('id', fazendaId)
        .maybeSingle()
      if (!fazenda) return json({ error: 'Fazenda não encontrada' }, 404)
      if (!isRecent(fazenda.created_at, Date.now())) {
        return json({ error: 'Forbidden: só é possível desfazer fazendas criadas há menos de 30 minutos' }, 403)
      }
      const { count } = await caller.admin
        .from('lotes')
        .select('id', { count: 'exact', head: true })
        .eq('fazenda_id', fazendaId)
      if ((count ?? 0) > 0) return json({ error: 'Forbidden: a fazenda já possui lotes' }, 403)
    }

    const errors: string[] = []

    try {
      const { error } = await caller.admin.auth.admin.deleteUser(userId)
      if (error) errors.push(`Failed to delete user: ${error.message}`)
    } catch (e) {
      errors.push(`Exception deleting user: ${(e as Error).message}`)
    }

    if (fazendaId) {
      try {
        const { error } = await caller.admin.from('fazendas').delete().eq('id', fazendaId)
        if (error) errors.push(`Failed to delete fazenda: ${error.message}`)
      } catch (e) {
        errors.push(`Exception deleting fazenda: ${(e as Error).message}`)
      }
    }

    if (errors.length > 0) {
      return json({ success: false, errors, message: 'Rollback partially failed. Manual intervention required.' }, 500)
    }
    return json({ success: true, message: 'Rollback completed successfully' })
  } catch (error) {
    console.error('Error in rollback function:', error)
    return json({ error: (error as Error).message }, 500)
  }
})
