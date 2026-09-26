// Converte valor monetário digitado no formato brasileiro ("152.340,50",
// "1.500", "R$ 980,00") para número. Retorna NaN quando não é um número
// válido. Ponto sem vírgula só é separador de milhar quando segue o padrão
// 1.234 / 12.345.678; caso contrário é tratado como decimal ("1500.5").
export function parseValorBR(input: string): number {
  const s = input.replace(/R\$/gi, '').replace(/\s/g, '')
  if (!s) return NaN
  let normalizado: string
  if (s.includes(',')) {
    normalizado = s.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    normalizado = s.replace(/\./g, '')
  } else {
    normalizado = s
  }
  if (!/^-?\d+(\.\d+)?$/.test(normalizado)) return NaN
  return Number(normalizado)
}
