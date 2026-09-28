import { createClient } from '@supabase/supabase-js'

export function getBearerToken(req) {
  const header = req.headers?.authorization ?? req.headers?.Authorization ?? ''
  return header.startsWith('Bearer ') ? header.slice(7) : ''
}

export async function createAuthenticatedSupabase(req, fazendaId) {
  const token = getBearerToken(req)
  if (!token) throw new Error('Sessão não informada')
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Configuração do Supabase indisponível')
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: userData, error: userError } = await client.auth.getUser(token)
  if (userError || !userData.user) throw new Error('Sessão inválida')
  const { data: hasAccess, error: accessError } = await client.rpc('user_has_fazenda_access', {
    p_fazenda_id: fazendaId,
  })
  if (accessError || !hasAccess) throw new Error('Usuário sem acesso à fazenda')
  return client
}

export async function downloadImageDataUrl(client, path) {
  if (!path) return ''
  const { data, error } = await client.storage.from('relatorios-gerais').download(path)
  if (error || !data) throw error ?? new Error('Imagem não encontrada')
  const bytes = Buffer.from(await data.arrayBuffer())
  return `data:${data.type || 'image/webp'};base64,${bytes.toString('base64')}`
}
