// Categorias do relatório de Mortalidade. O PWA grava a categoria como texto
// ("bezerro", "Bezerro", "boi gordo", "bezerro ao pé"), enquanto precos_categorias
// usa "Bezerro", "Boi Gordo". Comparar o texto exato fazia a perda estimada cair
// quase sempre no preço de reserva. Aqui a comparação é pela forma normalizada
// (minúsculas, sem acento, espaços colapsados), sem alterar os registros gravados.
// A RPC get_infografico_anual_morte aplica as mesmas regras em SQL.

export const PRECOS_KG_DEFAULT: Record<string, number> = {
  Bezerro: 12.0,
  Bezerra: 11.5,
  Novilha: 11.0,
  Garrote: 9.5,
  'Boi Magro': 10.0,
  'Boi Gordo': 11.67,
  Vaca: 10.83,
  Touro: 15.0,
}

export const PRECO_KG_FALLBACK = 10.0

export function normalizarCategoria(categoria: string | null | undefined): string {
  return String(categoria ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const ROTULOS: Record<string, string> = {
  bezerro: 'Bezerro',
  bezerra: 'Bezerra',
  'bezerro ao pe': 'Bezerro ao pé',
  'bezerra ao pe': 'Bezerra ao pé',
  novilha: 'Novilha',
  garrote: 'Garrote',
  'boi magro': 'Boi Magro',
  'boi gordo': 'Boi Gordo',
  vaca: 'Vaca',
  touro: 'Touro',
}

// Rótulo único para agrupar "bezerro" e "Bezerro" na mesma linha dos gráficos e tabelas.
export function rotuloCategoria(categoria: string | null | undefined): string | null {
  const chave = normalizarCategoria(categoria)
  if (!chave) return null
  if (ROTULOS[chave]) return ROTULOS[chave]
  const limpo = String(categoria).replace(/\s+/g, ' ').trim()
  return limpo.charAt(0).toUpperCase() + limpo.slice(1)
}

// Categoria usada para buscar o preço. Não existe cotação de bezerro(a) ao pé em
// precos_categorias nem nos preços de entrada dos lotes: vale o preço de bezerro(a).
export function chavePrecoCategoria(categoria: string | null | undefined): string {
  const chave = normalizarCategoria(categoria)
  if (chave === 'bezerro ao pe') return 'bezerro'
  if (chave === 'bezerra ao pe') return 'bezerra'
  return chave
}

export function precoKgCategoria(categoria: string | null | undefined, precosFazenda: Record<string, number>): number {
  const chave = chavePrecoCategoria(categoria)
  const busca = (tabela: Record<string, number>) => {
    for (const [nome, preco] of Object.entries(tabela)) {
      if (normalizarCategoria(nome) === chave && Number.isFinite(preco)) return preco
    }
    return undefined
  }
  return busca(precosFazenda) ?? busca(PRECOS_KG_DEFAULT) ?? PRECO_KG_FALLBACK
}
