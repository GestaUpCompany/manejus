export interface SerieConsumoDia {
  trato_kg_cab_dia: number | null
  consumo_percent_pv: number | null
  custo_reais_cab_dia: number | null
}

export interface CategoriaZootecnica {
  loteNome: string
  pastoNome: string | null
  areaUtilHa: number | null
  taxaLotacaoUaHa: number | null
  categoria: string | null
  raca: string | null
  sexo: string | null
  estrategia: string | null
  cabecas: number
  dataPesagem: string | null
  pesoEntradaKg: number | null
  pesoAtualKg: number | null
  pesoMetaKg: number | null
  dataMeta: string | null
  periodoDias: number | null
  rcPercent: number | null
  precoVendaArroba: number | null
  precoCustoCab: number | null
  consumoMetaPercentPv: number | null
  teorMsPercent: number | null
  serieGeral: SerieConsumoDia[]
  serieJanela: SerieConsumoDia[]
}

export interface ResumoConsumo {
  mnKgCabDia: number | null
  msKgCabDia: number | null
  percentPv: number | null
  custoCabDia: number | null
}

export interface LinhaZootecnica {
  loteNome: string
  pastoNome: string | null
  areaUtilHa: number | null
  taxaLotacaoUaHa: number | null
  categoria: string | null
  raca: string | null
  sexo: string | null
  estrategia: string | null
  cabecas: number
  dataPesagem: string | null
  pesoEntradaKg: number | null
  pesoEntradaArroba: number | null
  pesoAtualKg: number | null
  pesoMetaKg: number | null
  dataMeta: string | null
  periodoDias: number | null
  rcPercent: number | null
  precoVendaArroba: number | null
  valorEstoque: number | null
  capitalAtual: number | null
  consumoMetaPercentPv: number | null
  geral: ResumoConsumo
  janela: ResumoConsumo
}

const KG_POR_ARROBA_VIVA = 30
const KG_POR_ARROBA_CARCACA = 15

function media(valores: Array<number | null | undefined>): number | null {
  const validos = valores.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (validos.length === 0) return null
  return validos.reduce((soma, v) => soma + v, 0) / validos.length
}

/** Aceita RC em fração (0,5) ou em % (50) e devolve em %. */
function normalizarRc(rc: number | null): number | null {
  if (rc === null || !Number.isFinite(rc) || rc <= 0) return null
  return rc <= 1 ? rc * 100 : rc
}

export function resumirConsumo(serie: SerieConsumoDia[], teorMsPercent: number | null): ResumoConsumo {
  const mn = media(serie.map((d) => d.trato_kg_cab_dia))
  return {
    mnKgCabDia: mn,
    msKgCabDia: mn !== null && teorMsPercent ? (mn * teorMsPercent) / 100 : null,
    percentPv: media(serie.map((d) => d.consumo_percent_pv)),
    // custo 0 = dieta sem preço de insumo cadastrado: não é custo real, fica vazio
    custoCabDia: media(serie.map((d) => (d.custo_reais_cab_dia && d.custo_reais_cab_dia > 0 ? d.custo_reais_cab_dia : null))),
  }
}

export function montarLinha(cat: CategoriaZootecnica): LinhaZootecnica {
  const rc = normalizarRc(cat.rcPercent)
  const arrobasCarcaca =
    cat.pesoAtualKg !== null && rc !== null ? (cat.pesoAtualKg * rc) / 100 / KG_POR_ARROBA_CARCACA : null
  const valorEstoque =
    arrobasCarcaca !== null && cat.precoVendaArroba ? arrobasCarcaca * cat.precoVendaArroba * cat.cabecas : null
  return {
    loteNome: cat.loteNome,
    pastoNome: cat.pastoNome,
    areaUtilHa: cat.areaUtilHa,
    taxaLotacaoUaHa: cat.taxaLotacaoUaHa,
    categoria: cat.categoria,
    raca: cat.raca,
    sexo: cat.sexo,
    estrategia: cat.estrategia,
    cabecas: cat.cabecas,
    dataPesagem: cat.dataPesagem,
    pesoEntradaKg: cat.pesoEntradaKg,
    pesoEntradaArroba: cat.pesoEntradaKg !== null ? cat.pesoEntradaKg / KG_POR_ARROBA_VIVA : null,
    pesoAtualKg: cat.pesoAtualKg,
    pesoMetaKg: cat.pesoMetaKg,
    dataMeta: cat.dataMeta,
    periodoDias: cat.periodoDias,
    rcPercent: rc,
    precoVendaArroba: cat.precoVendaArroba,
    valorEstoque,
    capitalAtual: cat.precoCustoCab !== null ? cat.precoCustoCab * cat.cabecas : null,
    consumoMetaPercentPv: cat.consumoMetaPercentPv,
    geral: resumirConsumo(cat.serieGeral, cat.teorMsPercent),
    janela: resumirConsumo(cat.serieJanela, cat.teorMsPercent),
  }
}

function mediaPonderada(linhas: LinhaZootecnica[], valor: (l: LinhaZootecnica) => number | null): number | null {
  let soma = 0
  let peso = 0
  for (const l of linhas) {
    const v = valor(l)
    if (v === null || !Number.isFinite(v) || l.cabecas <= 0) continue
    soma += v * l.cabecas
    peso += l.cabecas
  }
  return peso > 0 ? soma / peso : null
}

function somar(linhas: LinhaZootecnica[], valor: (l: LinhaZootecnica) => number | null): number | null {
  const validos = linhas.map(valor).filter((v): v is number => v !== null && Number.isFinite(v))
  return validos.length > 0 ? validos.reduce((a, b) => a + b, 0) : null
}

/** Um pasto com várias categorias aparece em várias linhas: a área conta uma vez só. */
function somarAreaPorPasto(linhas: LinhaZootecnica[]): number | null {
  const porPasto = new Map<string, number>()
  for (const l of linhas) {
    if (l.areaUtilHa === null || !l.pastoNome) continue
    porPasto.set(l.pastoNome, l.areaUtilHa)
  }
  return porPasto.size > 0 ? [...porPasto.values()].reduce((a, b) => a + b, 0) : null
}

function resumoGeral(linhas: LinhaZootecnica[], pick: (l: LinhaZootecnica) => ResumoConsumo): ResumoConsumo {
  return {
    mnKgCabDia: mediaPonderada(linhas, (l) => pick(l).mnKgCabDia),
    msKgCabDia: mediaPonderada(linhas, (l) => pick(l).msKgCabDia),
    percentPv: mediaPonderada(linhas, (l) => pick(l).percentPv),
    custoCabDia: mediaPonderada(linhas, (l) => pick(l).custoCabDia),
  }
}

export function montarLinhaGeral(linhas: LinhaZootecnica[]): LinhaZootecnica {
  return {
    loteNome: 'Geral',
    pastoNome: null,
    areaUtilHa: somarAreaPorPasto(linhas),
    taxaLotacaoUaHa: mediaPonderada(linhas, (l) => l.taxaLotacaoUaHa),
    categoria: null,
    raca: null,
    sexo: null,
    estrategia: null,
    cabecas: linhas.reduce((soma, l) => soma + l.cabecas, 0),
    dataPesagem: null,
    pesoEntradaKg: mediaPonderada(linhas, (l) => l.pesoEntradaKg),
    pesoEntradaArroba: mediaPonderada(linhas, (l) => l.pesoEntradaArroba),
    pesoAtualKg: mediaPonderada(linhas, (l) => l.pesoAtualKg),
    pesoMetaKg: mediaPonderada(linhas, (l) => l.pesoMetaKg),
    dataMeta: null,
    periodoDias: null,
    rcPercent: mediaPonderada(linhas, (l) => l.rcPercent),
    precoVendaArroba: mediaPonderada(linhas, (l) => l.precoVendaArroba),
    valorEstoque: somar(linhas, (l) => l.valorEstoque),
    capitalAtual: somar(linhas, (l) => l.capitalAtual),
    consumoMetaPercentPv: mediaPonderada(linhas, (l) => l.consumoMetaPercentPv),
    geral: resumoGeral(linhas, (l) => l.geral),
    janela: resumoGeral(linhas, (l) => l.janela),
  }
}
