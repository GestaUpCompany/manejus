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

/** Janela de idade (dias) em que uma pesagem serve para estimar o peso aos 205 dias */
export const P205_IDADE_MIN_DIAS = 120
export const P205_IDADE_MAX_DIAS = 300

export interface PesoAjustado205 {
  /** Peso estimado aos 205 dias (kg) */
  pesoKg: number
  /** Ganho médio diário do nascimento até a pesagem usada (kg/dia) */
  gmdNascimentoKgDia: number
  /** Pesagem usada no cálculo */
  pesagem: { data: string; pesoKg: number; idadeDias: number }
}

/**
 * Peso ajustado aos 205 dias (P205): peso ao nascer + (peso da pesagem - peso ao nascer) / idade na pesagem × 205.
 * Usa a pesagem feita entre 120 e 300 dias de vida que fica mais perto dos 205 dias. É a fórmula simples, sem os
 * fatores de correção por sexo e idade da mãe (não há tabela de referência cadastrada). Null se faltar data ou peso
 * ao nascer, se nenhuma pesagem cair na janela ou se o peso da pesagem não for maior que o do nascimento.
 */
export function pesoAjustado205(
  pesoNascimentoKg: number | string | null | undefined,
  dataNascimento: string | null | undefined,
  pesagens: PesagemEvolucao[]
): PesoAjustado205 | null {
  const pn = Number(pesoNascimentoKg)
  if (!dataNascimento || !Number.isFinite(pn) || pn <= 0) return null
  const nascimento = dataNascimento.slice(0, 10)

  const candidatas = pesagens
    .map((p) => ({ data: p.data, pesoKg: p.pesoKg, idadeDias: diasEntre(nascimento, p.data.slice(0, 10)) }))
    .filter((p) => p.idadeDias >= P205_IDADE_MIN_DIAS && p.idadeDias <= P205_IDADE_MAX_DIAS && p.pesoKg > pn)
    .sort((a, b) => Math.abs(a.idadeDias - 205) - Math.abs(b.idadeDias - 205))

  const escolhida = candidatas[0]
  if (!escolhida) return null
  const gmd = (escolhida.pesoKg - pn) / escolhida.idadeDias
  return { pesoKg: pn + gmd * 205, gmdNascimentoKgDia: gmd, pesagem: escolhida }
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
