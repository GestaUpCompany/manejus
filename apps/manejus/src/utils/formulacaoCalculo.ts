/** Campos mínimos de um insumo dentro da fórmula (base dos cálculos de %MN, custo e consumo). */
export interface InsumoFormulaBase {
  teor_ms: number
  preco_ton_mn: number
  formula_teor_ms: number
}

export interface InsumoFormulaCalc extends InsumoFormulaBase {
  formula_mn_bruta?: number
  formula_mn_percent?: number
  custo_kg_mn?: number
  custo_kg_ms?: number
  consumo_kg_mn_por_kg_pv?: number
  consumo_kg_ms_por_kg_pv?: number
}

/** Calcula %MN normalizada, custo e consumo por kg de PV de cada insumo (independente de categoria). */
export function calcularFormulacao<T extends InsumoFormulaBase>(
  items: T[],
  metaPV: number,
): (T & InsumoFormulaCalc)[] {
  // Passo 1: MN bruta de cada insumo (precisão total)
  const withBruta = items.map(item => {
    const ms = item.teor_ms / 100
    const mnBruta = ms > 0 ? (item.formula_teor_ms / ms) : 0
    return { ...item, formula_mn_bruta: mnBruta }
  })

  // Passo 2: normaliza para 100%
  const totalBruta = withBruta.reduce((sum, i) => sum + (i.formula_mn_bruta || 0), 0)
  const withNormalized = withBruta.map(item => {
    const mnPercent = totalBruta > 0 ? ((item.formula_mn_bruta || 0) / totalBruta) * 100 : 0
    return { ...item, formula_mn_percent: mnPercent }
  })

  // Passo 3: custo e consumo por kg de peso vivo
  const consumoMSBase = (metaPV / 100)
  return withNormalized.map(item => {
    const ms = item.teor_ms / 100
    const custoTonelada = (item.formula_mn_percent || 0) * item.preco_ton_mn / 100
    const custoKgMN = custoTonelada / 1000
    const custoKgMS = ms > 0 ? custoKgMN / ms : 0
    const consumoMNporKgPV = consumoMSBase * ((item.formula_mn_percent || 0) / 100)
    const consumoMSporKgPV = consumoMNporKgPV * ms
    return {
      ...item,
      custo_kg_mn: custoKgMN,
      custo_kg_ms: custoKgMS,
      consumo_kg_mn_por_kg_pv: consumoMNporKgPV,
      consumo_kg_ms_por_kg_pv: consumoMSporKgPV,
    }
  })
}
