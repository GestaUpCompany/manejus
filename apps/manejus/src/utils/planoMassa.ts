// Lógica pura da atribuição de dieta em massa (modal PlanoNutricionalMassaModal).
// Monta e valida o payload da RPC atribuir_plano_em_massa.

/** Teto plausível de peso meta (kg). Espelha public._peso_meta_maximo() no banco. */
export const PESO_META_MAXIMO_KG = 1500

export type ModoAtribuicao = 'iniciar' | 'migrar' | 'enfileirar'

export interface CategoriaLinha {
  id: string
  categoria: string
  quantAtual: number | null
  pesoAtual: number | null
  /** GMD da formulação escolhida para a categoria (já com o desconto de enfermaria); null = formulação não contempla. */
  gmd: number | null
  /** Texto digitado; vazio herda o valor do lote. */
  periodo: string
  pesoMeta: string
}

export interface LoteLinha {
  loteId: string
  nome: string
  enfermaria: boolean
  vigenteNome: string | null
  modo: ModoAtribuicao
  retroativo: boolean
  nomePlano: string
  periodo: string
  pesoMeta: string
  categorias: CategoriaLinha[]
}

export interface ItemPayload {
  lote_id: string
  nome: string
  periodo_dias: number
  peso_meta_kg: number
  modo: ModoAtribuicao
  retroativo: boolean
  categorias: { lote_categoria_id: string; periodo_dias: number; peso_meta_kg: number }[]
}

export interface ValidacaoLinha {
  erros: string[]
  avisos: string[]
}

export const isBezerroAoPe = (categoria: string): boolean =>
  ['bezerro ao pe', 'bezerra ao pe'].includes(
    categoria.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(),
  )

export const parseNumero = (texto: string): number | null => {
  const n = parseFloat(String(texto).replace(',', '.').trim())
  return Number.isNaN(n) ? null : n
}

export const modoPadrao = (temVigente: boolean): ModoAtribuicao => (temVigente ? 'migrar' : 'iniciar')

/** Dias entre hoje e a data final (AAAA-MM-DD); null se a data for inválida. */
export function periodoPorDataFinal(dataFinal: string, hoje: Date = new Date()): number | null {
  if (!dataFinal) return null
  const fim = new Date(`${dataFinal}T00:00:00`)
  if (Number.isNaN(fim.getTime())) return null
  const base = new Date(hoje)
  base.setHours(0, 0, 0, 0)
  return Math.ceil((fim.getTime() - base.getTime()) / 86_400_000)
}

/** Categorias que recebem plano (bezerro/bezerra ao pé ficam de fora). */
export const categoriasDoPlano = (linha: LoteLinha): CategoriaLinha[] =>
  linha.categorias.filter((c) => !isBezerroAoPe(c.categoria))

export function valorEfetivo(linha: LoteLinha, cat: CategoriaLinha): { periodo: number | null; pesoMeta: number | null } {
  return {
    periodo: parseNumero(cat.periodo) ?? parseNumero(linha.periodo),
    pesoMeta: parseNumero(cat.pesoMeta) ?? parseNumero(linha.pesoMeta),
  }
}

export function validarLinha(linha: LoteLinha): ValidacaoLinha {
  const erros: string[] = []
  const avisos: string[] = []

  if (!linha.nomePlano.trim()) erros.push('Informe o nome do plano.')
  const periodo = parseNumero(linha.periodo)
  if (periodo == null || periodo <= 0 || !Number.isInteger(periodo)) erros.push('Período deve ser um número inteiro de dias maior que zero.')
  const pesoMeta = parseNumero(linha.pesoMeta)
  if (pesoMeta == null || pesoMeta <= 0) erros.push('Peso meta deve ser maior que zero.')
  else if (pesoMeta > PESO_META_MAXIMO_KG) erros.push(`Peso meta acima do máximo permitido (${PESO_META_MAXIMO_KG} kg).`)

  if (linha.modo === 'migrar' && !linha.vigenteNome) erros.push('Lote sem plano vigente: não há o que migrar.')
  if (linha.modo === 'iniciar' && linha.vigenteNome) erros.push('Lote já tem plano vigente: escolha migrar ou enfileirar.')

  const cats = categoriasDoPlano(linha)
  if (cats.length === 0) erros.push('Lote sem categorias que aceitem plano.')

  const iniciaAgora = linha.modo !== 'enfileirar'
  for (const cat of cats) {
    const nome = cat.categoria
    if (iniciaAgora && (cat.pesoAtual == null || cat.pesoAtual <= 0)) {
      erros.push(`${nome}: sem peso vivo atual.`)
    }
    const { periodo: p, pesoMeta: m } = valorEfetivo(linha, cat)
    if (iniciaAgora) {
      if (p == null || p <= 0 || !Number.isInteger(p)) erros.push(`${nome}: período inválido.`)
      if (m == null || m <= 0) erros.push(`${nome}: peso meta inválido.`)
      else if (m > PESO_META_MAXIMO_KG) erros.push(`${nome}: peso meta acima do máximo permitido (${PESO_META_MAXIMO_KG} kg).`)
      else if (cat.pesoAtual != null && m <= cat.pesoAtual) {
        erros.push(`${nome}: peso meta (${m}) deve ser maior que o peso atual (${cat.pesoAtual}).`)
      }
    } else if (m != null && cat.pesoAtual != null && m <= cat.pesoAtual) {
      avisos.push(`${nome}: peso meta (${m}) não é maior que o peso atual (${cat.pesoAtual}).`)
    }
    if (cat.gmd == null) avisos.push(`${nome}: a formulação não tem GMD para esta categoria; o peso não evolui.`)
  }

  if (linha.enfermaria) avisos.push('Lote de enfermaria: GMD reduzido em 50%.')
  if (linha.modo === 'enfileirar' && cats.some((c) => c.periodo.trim() || c.pesoMeta.trim())) {
    avisos.push('Valores por categoria são ignorados ao só enfileirar; ajuste depois de iniciar o plano.')
  }
  return { erros, avisos }
}

export function montarItens(linhas: LoteLinha[]): ItemPayload[] {
  return linhas.map((linha) => {
    const base = {
      lote_id: linha.loteId,
      nome: linha.nomePlano.trim(),
      periodo_dias: parseNumero(linha.periodo) as number,
      peso_meta_kg: parseNumero(linha.pesoMeta) as number,
      modo: linha.modo,
      retroativo: linha.modo === 'iniciar' && linha.retroativo,
    }
    if (linha.modo === 'enfileirar') return { ...base, categorias: [] }
    return {
      ...base,
      categorias: categoriasDoPlano(linha).map((cat) => {
        const { periodo, pesoMeta } = valorEfetivo(linha, cat)
        return { lote_categoria_id: cat.id, periodo_dias: periodo as number, peso_meta_kg: pesoMeta as number }
      }),
    }
  })
}
