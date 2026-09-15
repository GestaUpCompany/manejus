const DIA_MS = 86_400_000

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

function parseData(data: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return null
  const [ano, mes, dia] = data.split('-').map(Number)
  const parsed = new Date(Date.UTC(ano, mes - 1, dia))
  if (
    parsed.getUTCFullYear() !== ano ||
    parsed.getUTCMonth() !== mes - 1 ||
    parsed.getUTCDate() !== dia
  ) return null
  return parsed
}

export function contarDiasInclusivos(dataInicio: string, dataFim: string): number | null {
  const inicio = parseData(dataInicio)
  const fim = parseData(dataFim)
  if (!inicio || !fim || fim < inicio) return null
  return Math.floor((fim.getTime() - inicio.getTime()) / DIA_MS) + 1
}

export function validarPeriodoRelatorio(dataInicio: string, dataFim: string): string | null {
  if (!dataInicio || !dataFim) return 'Informe a data inicial e a data final.'
  const dias = contarDiasInclusivos(dataInicio, dataFim)
  if (dias === null) return 'A data final deve ser igual ou posterior à data inicial.'
  if (dias > 31) return 'O período não pode ultrapassar 31 dias.'
  return null
}

export function formatarPeriodoCapa(dataInicio: string, dataFim: string): string {
  const inicio = parseData(dataInicio)
  const fim = parseData(dataFim)
  if (!inicio || !fim) return ''

  const mesInicio = MESES[inicio.getUTCMonth()]
  const mesFim = MESES[fim.getUTCMonth()]
  const anoInicio = inicio.getUTCFullYear()
  const anoFim = fim.getUTCFullYear()

  if (anoInicio === anoFim && inicio.getUTCMonth() === fim.getUTCMonth()) {
    return `${mesInicio} de ${anoInicio}`
  }
  if (anoInicio === anoFim) return `${mesInicio} a ${mesFim} de ${anoInicio}`
  return `${mesInicio} de ${anoInicio} a ${mesFim} de ${anoFim}`
}
