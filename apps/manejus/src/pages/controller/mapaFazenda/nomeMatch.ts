// Motor de match entre nomes de features importadas (KML/KMZ) e pastos cadastrados.
// Puro: sem dependências de React/Supabase, para permitir teste unitário.
import type { FeatureImportadaItem } from './importKml'

export interface PastoCandidato {
  id: string
  nome: string
  temGeo: boolean
}

export type MatchStatus = 'auto' | 'sugestao' | 'ambiguo' | 'sem_match' | 'sem_nome'

export interface MatchRow {
  item: FeatureImportadaItem
  status: MatchStatus
  score: number
  pastoSugerido: PastoCandidato | null
  /** id do pasto escolhido ('' = não associar) */
  pastoSelecionado: string
  /** candidatos rankeados para exibir no topo do select */
  candidatos: PastoCandidato[]
  /** marcado pelo usuário para não associar (mantém status original para restaurar) */
  ignorado: boolean
  /** erro do último apply, se houve */
  applyErro?: string
}

/**
 * Normalização canônica de nomes para comparação resiliente:
 * uppercase, sem diacríticos, dígitos zero-padded, só [A-Z0-9].
 * "1. TIP 01" → "01TIP01" | "MI-09 A" → "MI09A" | "SR-22.A" → "SR22A"
 */
export function normalizarNome(s: string): string {
  const semAcento = s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  const upper = semAcento.toUpperCase()
  const padded = upper.replace(/\d+/g, (d) => d.padStart(2, '0'))
  return padded.replace(/[^A-Z0-9]/g, '')
}

/**
 * Extrai o nome útil de um placemark KML, removendo sufixo de medida
 * ("  66,02 ha", " 55876,19"). Só remove número final se tiver parte
 * decimal ou unidade — evita cortar números que fazem parte do nome
 * ("LOTE 5" continua "LOTE 5"). Retorna null quando o nome é
 * puramente numérico (área/comprimento sem código de pasto).
 */
export function extrairNomeUtil(name: string | null | undefined): string | null {
  const n = (name || '').trim()
  if (!n) return null
  const stripped = n
    .replace(/\s+\d+[.,]\d+\s*(ha|m2|m²|km2|a)?\s*$/i, '')
    .replace(/\s+\d+\s+(ha|m2|m²|km2|a)\s*$/i, '')
    .trim()
  if (!stripped) return null
  if (/^[\d.,\s]+$/.test(stripped)) return null
  return stripped
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[n]
}

/**
 * Sugere matches entre itens importados (polígonos) e pastos da fazenda.
 *
 * Tiers, em ordem de confiança:
 *  1. canonical exato → 'auto' (pré-selecionado)
 *  2. contenção única (includes bidirecional, len menor >= 3) → 'sugestao'
 *  3. Levenshtein >= 0.85 em strings de len >= 5 → 'sugestao' (1 cand) ou 'ambiguo'
 * Qualquer tier com mais de 1 candidato → 'ambiguo' (sem pré-seleção).
 * Candidato que já tem geometria nunca vira 'auto' (vai como 'sugestao' com aviso).
 */
export function sugerirMatches(itens: FeatureImportadaItem[], pastos: PastoCandidato[]): MatchRow[] {
  const pool = pastos.map((p) => ({ ...p, canon: normalizarNome(p.nome) }))

  const rows = itens.map((item) => {
    const base: MatchRow = {
      item,
      status: 'sem_match',
      score: 0,
      pastoSugerido: null,
      pastoSelecionado: '',
      candidatos: [],
      ignorado: false,
    }

    if (!item.nomeLimpo) {
      base.status = 'sem_nome'
      return base
    }
    const canon = normalizarNome(item.nomeLimpo)
    if (!canon) {
      base.status = 'sem_nome'
      return base
    }

    // Tier 1: exato
    const exatos = pool.filter((p) => p.canon === canon)
    if (exatos.length === 1) {
      const c = exatos[0]
      base.status = c.temGeo ? 'sugestao' : 'auto'
      base.score = 1
      base.pastoSugerido = c
      base.pastoSelecionado = c.id
      base.candidatos = exatos
      return base
    }
    if (exatos.length > 1) {
      base.status = 'ambiguo'
      base.candidatos = exatos
      return base
    }

    // Tier 2: contenção única
    const cont = pool.filter(
      (p) =>
        Math.min(p.canon.length, canon.length) >= 3 &&
        (p.canon.includes(canon) || canon.includes(p.canon))
    )
    if (cont.length === 1) {
      base.status = 'sugestao'
      base.score = 0.8
      base.pastoSugerido = cont[0]
      base.pastoSelecionado = cont[0].id
      base.candidatos = cont
      return base
    }
    if (cont.length > 1) {
      base.status = 'ambiguo'
      base.candidatos = cont
      return base
    }

    // Tier 3: Levenshtein (só strings razoavelmente longas; em códigos curtos
    // distância 1 é ruído — "MI05" vs "MI06")
    if (canon.length >= 5) {
      const lev = pool
        .map((p) => ({ p, sim: 1 - levenshtein(canon, p.canon) / Math.max(canon.length, p.canon.length) }))
        .filter((x) => x.p.canon.length >= 5 && x.sim >= 0.85)
        .sort((a, b) => b.sim - a.sim)
      if (lev.length === 1) {
        base.status = 'sugestao'
        base.score = 0.7
        base.pastoSugerido = lev[0].p
        base.pastoSelecionado = lev[0].p.id
        base.candidatos = lev.map((x) => x.p)
        return base
      }
      if (lev.length > 1) {
        base.status = 'ambiguo'
        base.candidatos = lev.map((x) => x.p)
        return base
      }
    }

    return base
  })

  desempatarPartes(rows)
  return rows
}

function areaAnel(coords: number[][]): number {
  let s = 0
  for (let i = 0; i < coords.length - 1; i++) {
    s += coords[i][0] * coords[i + 1][1] - coords[i + 1][0] * coords[i][1]
  }
  return Math.abs(s / 2)
}

function areaGeometria(g: GeoJSON.Geometry): number {
  if (g.type === 'Polygon') return areaAnel(g.coordinates[0] || [])
  return 0
}

/**
 * Placemarks multi-parte cujas partes casam no mesmo pasto virariam conflito
 * genérico. Mantém pré-selecionada só a maior parte (anel externo); as demais
 * ficam sem seleção, revisáveis manualmente.
 */
function desempatarPartes(rows: MatchRow[]): void {
  const porGrupo = new Map<number, MatchRow[]>()
  rows.forEach((r) => {
    if (!r.item.parteInfo) return
    const arr = porGrupo.get(r.item.grupoPlacemark) || []
    arr.push(r)
    porGrupo.set(r.item.grupoPlacemark, arr)
  })
  porGrupo.forEach((grupo) => {
    const porPasto = new Map<string, MatchRow[]>()
    grupo.forEach((r) => {
      if (!r.pastoSelecionado) return
      const arr = porPasto.get(r.pastoSelecionado) || []
      arr.push(r)
      porPasto.set(r.pastoSelecionado, arr)
    })
    porPasto.forEach((mesmoPasto) => {
      if (mesmoPasto.length < 2) return
      const maior = mesmoPasto.reduce((a, b) =>
        areaGeometria(a.item.feature.geometry) >= areaGeometria(b.item.feature.geometry) ? a : b
      )
      mesmoPasto.forEach((r) => {
        if (r !== maior) r.pastoSelecionado = ''
      })
    })
  })
}

/**
 * IDs de linhas em conflito: mesmo pasto selecionado em 2+ linhas ativas.
 * Calculado em tempo de render na tela de revisão (cobre edições do usuário).
 */
export function linhasEmConflito(rows: MatchRow[]): Set<string> {
  const porPasto = new Map<string, string[]>()
  rows.forEach((r) => {
    if (r.ignorado || !r.pastoSelecionado) return
    const arr = porPasto.get(r.pastoSelecionado) || []
    arr.push(r.item.importId)
    porPasto.set(r.pastoSelecionado, arr)
  })
  const conflito = new Set<string>()
  porPasto.forEach((ids) => {
    if (ids.length > 1) ids.forEach((id) => conflito.add(id))
  })
  return conflito
}
