import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY são obrigatórios')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ============================================================
// Contexto de auditoria para triggers
// ============================================================
// O Postgres mantém variáveis de sessão (set_config) que os
// triggers de audit_log leem para registrar quem fez cada
// operação. Como o Supabase usa connection pooling, essas
// variáveis precisam ser re-setadas antes de cada batch de
// mutations. O helper abaixo lê o usuário atual do AuthContext
// e os dados de impersonação do localStorage, e chama a RPC
// set_audit_context para configurar as variáveis na conexão
// atual do pool.
//
// Uso: chamar setAuditContext() antes de fazer mutations
// (insert/update/delete) em tabelas auditadas.

interface ImpersonationSession {
  sessionId: string
  superAdminId: string
  superAdminEmail: string
  targetUserId: string
  targetUserEmail: string
  targetUserNome: string
  targetFazendaId: string | null
  targetFazendaNome: string | null
  startedAt: string
  expiresAt: string
}

function getImpersonation(): ImpersonationSession | null {
  try {
    const stored = localStorage.getItem('impersonation_session')
    if (!stored) return null
    const data = JSON.parse(stored) as ImpersonationSession
    // Verificar se não expirou
    if (new Date(data.expiresAt) <= new Date()) {
      localStorage.removeItem('impersonation_session')
      return null
    }
    return data
  } catch {
    return null
  }
}

/**
 * Seta o contexto de auditoria na conexão atual do pool.
 * Deve ser chamado antes de operações de escrita (insert/update/delete)
 * em tabelas auditadas, para que os triggers capturem quem fez a operação.
 *
 * @param user O usuário atual logado (do AuthContext)
 * @param originPage Tela/feature que originou a operação (ex: "Lotes.tsx")
 */
export async function setAuditContext(user: {
  id: string
  email: string
  nome: string
} | null, originPage?: string): Promise<void> {
  if (!user) return

  const impersonation = getImpersonation()

  // Detectar app de origem: PWA vs web
  const isPWA = window.matchMedia('(display-mode: standalone)').matches
  const sourceApp = isPWA ? 'pwa' : 'web'

  // User agent do navegador/dispositivo
  const userAgent = navigator.userAgent

  try {
    await supabase.rpc('set_audit_context', {
      p_user_id: user.id,
      p_user_email: user.email,
      p_user_nome: user.nome,
      p_is_impersonation: !!impersonation,
      p_impersonated_by: impersonation?.superAdminId || null,
      p_ip_address: null, // IP é capturado pelo Supabase no header da requisição
      p_user_agent: userAgent,
      p_source_app: sourceApp,
      p_origin_page: originPage || null,
    })
  } catch (e) {
    // Falha silenciosa: não bloquear a operação principal
    // se o contexto de auditoria não puder ser setado
    console.warn('Falha ao setar contexto de auditoria:', e)
  }
}

/**
 * Limpa o contexto de auditoria (remove variáveis de sessão).
 * Deve ser chamado após operações de escrita para evitar que
 * variáveis stale persistam na conexão do pool.
 */
export async function clearAuditContext(): Promise<void> {
  try {
    await supabase.rpc('set_audit_context', {
      p_user_id: null,
      p_user_email: null,
      p_user_nome: null,
      p_is_impersonation: false,
      p_impersonated_by: null,
      p_ip_address: null,
      p_user_agent: null,
      p_source_app: null,
      p_origin_page: null,
    })
  } catch {
    // Silencioso
  }
}
