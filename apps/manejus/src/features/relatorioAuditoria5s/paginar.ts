// O PostgREST corta cada resposta em 1.000 linhas (max_rows). Com vários setores auditados, o histórico passa disso
// e uma consulta simples truncaria os dados em silêncio. Esta função percorre as páginas até esgotar.

export const TAMANHO_PAGINA = 1000

/** Limite de segurança: evita loop infinito se o servidor ignorar o `range`. */
const MAX_PAGINAS = 100

export async function buscarTodasAsPaginas<T>(
  buscarPagina: (de: number, ate: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
  tamanho: number = TAMANHO_PAGINA
): Promise<T[]> {
  const todas: T[] = []
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const de = pagina * tamanho
    const { data, error } = await buscarPagina(de, de + tamanho - 1)
    if (error) throw new Error(error.message)
    const linhas = data ?? []
    todas.push(...linhas)
    // Página incompleta = última
    if (linhas.length < tamanho) return todas
  }
  return todas
}
