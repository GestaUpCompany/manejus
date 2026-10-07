// Autenticação do CHAMADOR das Edge Functions de usuário (rodam com service role, então a
// autorização tem de ser feita aqui: o verify_jwt só garante que o token é válido, não quem é).
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { isPapel, isUuid, type Papel } from './authz.ts'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export interface Caller {
  userId: string
  papel: Papel
  /** Cliente com service role: usar só depois de autorizar. */
  admin: SupabaseClient
}

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Papel em public.usuarios (por auth_id ou id); null = conta sem linha em usuarios. */
export async function papelDoUsuario(admin: SupabaseClient, id: string): Promise<Papel | null> {
  if (!isUuid(id)) throw new Error('id inválido') // nunca interpolar valor não validado no filtro
  const { data } = await admin
    .from('usuarios')
    .select('papel')
    .or(`auth_id.eq.${id},id.eq.${id}`)
    .limit(1)
  const papel = data?.[0]?.papel
  return isPapel(papel) ? papel : null
}

/**
 * Valida o JWT no servidor de Auth e carrega o papel do chamador.
 * Devolve Response (401/403) quando não autenticado, desativado ou sem papel válido.
 */
export async function requireCaller(req: Request): Promise<Caller | Response> {
  const match = (req.headers.get('Authorization') ?? '').match(/^Bearer\s+(.+)$/i)
  if (!match) return json({ error: 'Missing or invalid authorization header' }, 401)

  const admin = adminClient()
  const { data, error } = await admin.auth.getUser(match[1])
  if (error || !data.user) return json({ error: 'Unauthorized' }, 401)

  const { data: rows, error: dbError } = await admin
    .from('usuarios')
    .select('papel, ativo')
    .or(`auth_id.eq.${data.user.id},id.eq.${data.user.id}`)
    .limit(1)
  const row = rows?.[0]
  if (dbError || !row || row.ativo !== true || !isPapel(row.papel)) {
    return json({ error: 'Forbidden' }, 403)
  }

  return { userId: data.user.id, papel: row.papel, admin }
}
