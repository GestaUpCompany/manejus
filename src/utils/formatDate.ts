export const FARM_TIMEZONE = 'America/Cuiaba'

function getPartsInTimezone(dateStr: string): { year: string; month: string; day: string; hours: string; minutes: string } | null {
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: FARM_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00'
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hours: get('hour'),
    minutes: get('minute'),
  }
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  // Handle date-only strings (YYYY-MM-DD) without timezone conversion
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [year, month, day] = dateStr.split('-')
    return `${day}/${month}/${year}`
  }
  const parts = getPartsInTimezone(dateStr)
  if (!parts) return '-'
  return `${parts.day}/${parts.month}/${parts.year}`
}

/**
 * Retorna a data (YYYY-MM-DD) de um timestamp no fuso da fazenda.
 * Como o resultado é date-only, formatDate o exibe sem conversão de fuso,
 * o que evita o shift de -1 dia ao exportar datas derivadas de timestamptz.
 */
export function toFarmDateOnly(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null
  const parts = getPartsInTimezone(dateStr)
  if (!parts) return null
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  const parts = getPartsInTimezone(dateStr)
  if (!parts) return '-'
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hours}:${parts.minutes}`
}

/**
 * Retorna o intervalo [inicio, fim) do dia atual no fuso da fazenda,
 * expresso em ISO UTC para uso em queries Supabase (.gte/.lt).
 *
 * Ex: para America/Cuiaba no inverno (UTC-04), se hoje em Cuiabá for
 * 2026-08-05, retorna { start: '2026-08-05T04:00:00Z', end: '2026-08-06T04:00:00Z' }.
 */
export function getTodayBoundsInTimezone(timezone: string = FARM_TIMEZONE): { start: string; end: string } {
  const now = new Date()
  const parts = getPartsInTimezone(now.toISOString())
  if (!parts) {
    // fallback: meia-noite UTC
    const todayStr = now.toISOString().slice(0, 10)
    return { start: `${todayStr}T00:00:00Z`, end: `${todayStr}T23:59:59Z` }
  }
  const todayStr = `${parts.year}-${parts.month}-${parts.day}`
  // Construir meia-noite no fuso da fazenda e converter para UTC
  // Usando o offset atual do fuso
  const offsetParts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'longOffset',
  }).formatToParts(now)
  const offsetName = offsetParts.find((p) => p.type === 'timeZoneName')?.value || 'GMT+00:00'
  const offset = offsetName.replace('GMT', '') // ex: "-04:00" ou "+00:00"
  const startUtc = new Date(`${todayStr}T00:00:00${offset}`).toISOString()
  // Fim = inicio + 1 dia
  const endDate = new Date(`${todayStr}T00:00:00${offset}`)
  endDate.setDate(endDate.getDate() + 1)
  const endUtc = endDate.toISOString()
  return { start: startUtc, end: endUtc }
}
