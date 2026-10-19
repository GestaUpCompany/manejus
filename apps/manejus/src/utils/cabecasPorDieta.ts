/** Plano nutricional vigente (ativo e sem data_fim), por lote inteiro ou por categoria. */
export interface PlanoVigenteCabecas {
  lote_id: string | null
  lote_categoria_id: string | null
  formulacao_id: string | null
}

/** Categoria ativa (data_fim nulo) de um lote ativo. */
export interface CategoriaCabecas {
  id: string
  lote_id: string
  lote_nome: string
  categoria: string
  quant_atual: number | null
  /** lote_categorias.formulacao_id: dieta creep das categorias ao pé */
  formulacao_id: string | null
}

export interface CabecasPorDieta {
  total: number
  lotes: { lote_id: string; nome: string; cabecas: number; categorias: string[] }[]
}

const normaliza = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function ehCategoriaAoPe(categoria: string): boolean {
  const c = normaliza(categoria)
  return c === 'bezerro ao pe' || c === 'bezerra ao pe'
}

/**
 * Cabeças que recebem a formulação como dieta ativa hoje.
 * - Creep: categorias ao pé com lote_categorias.formulacao_id = formulação (creep nunca entra em plano).
 * - Demais: plano por categoria (precedência) ou, sem plano próprio, o plano vigente do lote,
 *   exceto categorias ao pé, que não herdam o plano do lote.
 * Cada categoria conta uma única vez.
 */
export function contarCabecasPorDieta(
  formulacaoId: string,
  eCreep: boolean,
  planos: PlanoVigenteCabecas[],
  categorias: CategoriaCabecas[],
): CabecasPorDieta {
  const planoDaCategoria = new Map<string, string | null>()
  const planoDoLote = new Map<string, string | null>()
  for (const p of planos) {
    if (p.lote_categoria_id) planoDaCategoria.set(p.lote_categoria_id, p.formulacao_id)
    else if (p.lote_id) planoDoLote.set(p.lote_id, p.formulacao_id)
  }

  const porLote = new Map<string, CabecasPorDieta['lotes'][number]>()
  for (const cat of categorias) {
    const aoPe = ehCategoriaAoPe(cat.categoria)
    let recebe: boolean
    if (eCreep) {
      recebe = aoPe && cat.formulacao_id === formulacaoId
    } else if (aoPe) {
      recebe = false
    } else if (planoDaCategoria.has(cat.id)) {
      recebe = planoDaCategoria.get(cat.id) === formulacaoId
    } else {
      recebe = planoDoLote.get(cat.lote_id) === formulacaoId
    }
    const cabecas = Number(cat.quant_atual) || 0
    if (!recebe || cabecas <= 0) continue

    const entrada = porLote.get(cat.lote_id) ?? { lote_id: cat.lote_id, nome: cat.lote_nome, cabecas: 0, categorias: [] }
    entrada.cabecas += cabecas
    entrada.categorias.push(cat.categoria)
    porLote.set(cat.lote_id, entrada)
  }

  const lotes = [...porLote.values()].sort((a, b) => b.cabecas - a.cabecas || a.nome.localeCompare(b.nome, 'pt-BR'))
  return { total: lotes.reduce((s, l) => s + l.cabecas, 0), lotes }
}
