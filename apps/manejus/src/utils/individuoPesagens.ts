export interface PesagemBruta {
  id: string
  data: string
  peso_kg: number | string | null
}

export interface PesagemEvolucao {
  id: string
  data: string
  pesoKg: number
  /** Dias desde a pesagem anterior (null na primeira) */
  dias: number | null
  /** Ganho em kg desde a pesagem anterior (null na primeira) */
  ganhoKg: number | null
  /** Ganho médio diário em kg/dia desde a pesagem anterior (null se dias <= 0) */
  gmdKgDia: number | null
}

const MS_DIA = 24 * 60 * 60 * 1000

function diasEntre(inicio: string, fim: string): number {
  return Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / MS_DIA)
}

/**
 * Ordena as pesagens por data e calcula ganho e GMD entre pesagens consecutivas.
 * Pesagens sem peso válido são descartadas.
 */
export function calcularEvolucaoPeso(pesagens: PesagemBruta[]): PesagemEvolucao[] {
  const validas = pesagens
    .map((p) => ({ id: p.id, data: p.data, pesoKg: Number(p.peso_kg) }))
    .filter((p) => p.data && Number.isFinite(p.pesoKg) && p.pesoKg > 0)
    .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime())

  return validas.map((p, i) => {
    if (i === 0) return { ...p, dias: null, ganhoKg: null, gmdKgDia: null }
    const anterior = validas[i - 1]
    const dias = diasEntre(anterior.data, p.data)
    const ganhoKg = p.pesoKg - anterior.pesoKg
    return { ...p, dias, ganhoKg, gmdKgDia: dias > 0 ? ganhoKg / dias : null }
  })
}

/** GMD médio do período todo (primeira até a última pesagem). Null com menos de 2 pesagens ou sem intervalo. */
export function gmdPeriodo(evolucao: PesagemEvolucao[]): number | null {
  if (evolucao.length < 2) return null
  const primeira = evolucao[0]
  const ultima = evolucao[evolucao.length - 1]
  const dias = diasEntre(primeira.data, ultima.data)
  return dias > 0 ? (ultima.pesoKg - primeira.pesoKg) / dias : null
}

/** Idade em dias e meses a partir da data de nascimento (YYYY-MM-DD). Null se ausente ou futura. */
export function calcularIdade(dataNascimento: string | null | undefined, hoje: Date = new Date()): { dias: number; meses: number } | null {
  if (!dataNascimento) return null
  const nascimento = new Date(`${dataNascimento.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(nascimento.getTime()) || nascimento > hoje) return null
  const dias = Math.floor((hoje.getTime() - nascimento.getTime()) / MS_DIA)
  const meses =
    (hoje.getFullYear() - nascimento.getFullYear()) * 12 +
    (hoje.getMonth() - nascimento.getMonth()) -
    (hoje.getDate() < nascimento.getDate() ? 1 : 0)
  return { dias, meses }
}

/** Escala com marcas redondas (1, 2, 5 × 10^n) cobrindo [min, max]. */
export function escalaPeso(min: number, max: number, marcasAlvo = 4): { min: number; max: number; marcas: number[] } {
  const amplitude = Math.max(max - min, 1)
  const bruto = amplitude / Math.max(marcasAlvo - 1, 1)
  const potencia = Math.pow(10, Math.floor(Math.log10(bruto)))
  const fracao = bruto / potencia
  const passo = (fracao <= 1.5 ? 1 : fracao <= 3 ? 2 : fracao <= 7 ? 5 : 10) * potencia
  const inicio = Math.max(0, Math.floor(min / passo) * passo)
  const fim = Math.max(Math.ceil(max / passo) * passo, inicio + passo)
  const marcas: number[] = []
  for (let v = inicio; v <= fim + passo / 1000; v += passo) marcas.push(Math.round(v * 1000) / 1000)
  return { min: inicio, max: fim, marcas }
}
