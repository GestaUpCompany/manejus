// Regras de autorização das Edge Functions de usuário (funções PURAS, sem Deno/Supabase,
// para poderem ser testadas com `node --test`). Decisões do usuário (07/10/2026):
//   - admin e super_admin gerenciam usuários;
//   - só super_admin cria/altera admin e super_admin; admin cria apenas controller;
//   - só super_admin troca a senha de admin/super_admin (admin troca a própria e a de controller).

export type Papel = 'controller' | 'admin' | 'super_admin'

export const PAPEIS: readonly Papel[] = ['controller', 'admin', 'super_admin']

export function isPapel(valor: unknown): valor is Papel {
  return typeof valor === 'string' && (PAPEIS as readonly string[]).includes(valor)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Ids vindos do corpo da requisição entram em filtros PostgREST: só UUID puro. */
export function isUuid(valor: unknown): valor is string {
  return typeof valor === 'string' && UUID_RE.test(valor)
}

export function isAdminPapel(papel: Papel | null | undefined): boolean {
  return papel === 'admin' || papel === 'super_admin'
}

/** Quem pode criar contas (Auth) e linhas de usuarios. */
export function canManageAuthUsers(caller: Papel): boolean {
  return isAdminPapel(caller)
}

/** Papel pedido na criação: validado contra a lista e contra o papel do chamador. */
export function canCreateUserWithPapel(caller: Papel, requested: unknown): boolean {
  if (!isPapel(requested)) return false
  if (caller === 'super_admin') return true
  if (caller === 'admin') return requested === 'controller'
  return false
}

/** Troca de senha: targetPapel null = alvo sem linha em usuarios (conta só do Auth). */
export function canChangePassword(
  caller: Papel,
  callerId: string,
  targetId: string,
  targetPapel: Papel | null,
): boolean {
  if (caller === 'super_admin') return true
  if (caller === 'admin') return callerId === targetId || !isAdminPapel(targetPapel)
  return false
}

/** Rollback de criação: nunca remove admin/super_admin. */
export function canRollbackTarget(caller: Papel, targetPapel: Papel | null): boolean {
  return isAdminPapel(caller) && !isAdminPapel(targetPapel)
}

/** Recente = criado há no máximo `maxMinutos` (limita o alcance do rollback). */
export function isRecent(createdAtIso: string | null | undefined, nowMs: number, maxMinutos = 30): boolean {
  if (!createdAtIso) return false
  const t = Date.parse(createdAtIso)
  if (Number.isNaN(t)) return false
  const idadeMs = nowMs - t
  return idadeMs >= 0 && idadeMs <= maxMinutos * 60_000
}
