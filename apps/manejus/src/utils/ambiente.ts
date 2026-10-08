/**
 * Ambiente de staging do Painel: mesmo banco da produção, publicado em outro projeto da Vercel.
 * Ligado por VITE_APP_ENV=staging no projeto de staging; sem a variável o app se comporta como produção.
 */
export function isStaging(env: string | undefined = import.meta.env.VITE_APP_ENV): boolean {
  return env === 'staging'
}

/** Prefixa o título da aba em staging para distinguir as abas de produção. */
export function tituloComAmbiente(
  titulo: string,
  env: string | undefined = import.meta.env.VITE_APP_ENV
): string {
  return isStaging(env) ? `[STAGING] ${titulo}` : titulo
}
