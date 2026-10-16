import { supabase } from '@gestaup/supabase'

/**
 * Dos nomes de categoria informados, devolve os que têm a mesma categoria canônica de `alvo`
 * (domínio categorias_animais + aliases, via função categoria_canonica do banco).
 * Se `alvo` não está no domínio, devolve um conjunto vazio.
 */
export async function categoriasCompativeis(alvo: string, nomes: string[]): Promise<Set<string>> {
  const canonicaDe = async (categoria: string): Promise<string | null> => {
    const { data, error } = await supabase.rpc('categoria_canonica', { p_categoria: categoria })
    if (error) throw error
    return (data as string | null) ?? null
  }
  const compativeis = new Set<string>()
  const slugAlvo = await canonicaDe(alvo)
  if (!slugAlvo) return compativeis
  for (const nome of [...new Set(nomes)]) {
    if ((await canonicaDe(nome)) === slugAlvo) compativeis.add(nome)
  }
  return compativeis
}
