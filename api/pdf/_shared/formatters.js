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
  const parts = String(value).split('-')
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : String(value)
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
