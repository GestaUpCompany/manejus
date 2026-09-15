// Formatadores compartilhados para relatórios PDF gerados no servidor.
// Espelham os helpers usados pelos relatórios jsPDF (src/utils/relatorio*PDF.ts)
// para manter consistência visual e numérica entre client-side e server-side.

export const escapeHtml = (value) =>
  String(value ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')

export const dateFmt = (value) => {
  if (!value) return '—'
  if (value instanceof Date) {
    const day = String(value.getUTCDate()).padStart(2, '0')
    const month = String(value.getUTCMonth() + 1).padStart(2, '0')
    const year = value.getUTCFullYear()
    return `${day}/${month}/${year}`
  }
  const str = String(value)
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) return `${match[3]}/${match[2]}/${match[1]}`
  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return str
  const day = String(d.getUTCDate()).padStart(2, '0')
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const year = d.getUTCFullYear()
  return `${day}/${month}/${year}`
}

export const numFmt = (value, digits = 2) =>
  value == null || Number.isNaN(value) ? '—' : Number(value).toFixed(digits).replace('.', ',')

export const intFmt = (value) =>
  value == null || Number.isNaN(value) ? '—' : String(Math.round(Number(value)))

export const moneyFmt = (value) =>
  value == null || Number.isNaN(value)
    ? '—'
    : Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const titleCase = (value) =>
  value
    ? String(value)
        .trim()
        .split(/\s+/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    : value
