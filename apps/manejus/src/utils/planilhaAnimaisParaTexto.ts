/**
 * Converte a 1ª aba de uma planilha XLSX/XLS no texto `;`-separado lido por `parseListaAnimais`
 * (identificação de lote). Usa os valores crus das células: número vira texto inteiro (chip de 15 dígitos
 * não vira notação científica), decimal usa vírgula e data vira AAAA-MM-DD.
 */
import type * as XLSXType from 'xlsx'

export function celulaParaTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return ''
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return ''
    // O SheetJS entrega a data da célula como meia-noite no fuso local, com folga de segundos para menos;
    // somar 1 minuto e ler os campos locais evita cair no dia anterior
    const d = new Date(valor.getTime() + 60_000)
    const dois = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`
  }
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) return ''
    return Number.isInteger(valor) ? String(valor) : String(valor).replace('.', ',')
  }
  return String(valor).replace(/[;\t\r\n]+/g, ' ').trim()
}

export function linhasParaTexto(linhas: unknown[][]): string {
  return linhas
    .map((linha) => linha.map(celulaParaTexto).join(';').replace(/;+$/, ''))
    .filter((linha) => linha.length > 0)
    .join('\n')
}

export async function planilhaAnimaisParaTexto(buffer: ArrayBuffer): Promise<string> {
  const XLSX: typeof XLSXType = await import('xlsx')
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const aba = wb.Sheets[wb.SheetNames[0]]
  if (!aba) return ''
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(aba, { header: 1, raw: true, defval: '', blankrows: false })
  return linhasParaTexto(linhas)
}
