// Autenticação mínima para o endpoint de PDF do Vision: valida o JWT do
// Supabase do usuário logado. O handler não toca o banco — só renderiza o
// HTML recebido — mas exigir sessão impede uso anônimo do endpoint como
// serviço gratuito de renderização de HTML arbitrário.
import { createClient } from '@supabase/supabase-js'

export function getBearerToken(req) {
  const header = req.headers?.authorization ?? req.headers?.Authorization ?? ''
  return header.startsWith('Bearer ') ? header.slice(7) : ''
}

export async function requireSession(req) {
  const token = getBearerToken(req)
  if (!token) throw new Error('Sessão não informada')
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Configuração do Supabase indisponível')
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) throw new Error('Sessão inválida')
  return data.user
}
