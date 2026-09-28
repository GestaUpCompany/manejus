export interface Rotina {
  id: string
  fazenda_id: string
  funcionario_id: string
  cadernetas: string[]
  dias_semana: number[]
  horarios: Record<string, string | null>
  data_inicio: string
  data_fim: string | null
  ativo: boolean
  created_at: string
  updated_at: string
}

export function rotinaEstaAtivaHoje(rotina: Rotina, dataIso: string): boolean {
  if (!rotina.ativo) return false
  if (dataIso < rotina.data_inicio) return false
  if (rotina.data_fim && dataIso > rotina.data_fim) return false

  const [y, m, d] = dataIso.split('-').map(Number)
  const diaSemana = new Date(y, m - 1, d).getDay()
  return rotina.dias_semana.includes(diaSemana)
}

export function getRotinasDoDia(rotinas: Rotina[], dataIso: string): Rotina[] {
  return rotinas.filter((r) => rotinaEstaAtivaHoje(r, dataIso))
}

export function getProgramacaoPorFuncionario(
  rotinas: Rotina[],
  dataIso: string
): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  getRotinasDoDia(rotinas, dataIso).forEach((r) => {
    const atual = map[r.funcionario_id] || []
    map[r.funcionario_id] = [...new Set([...atual, ...r.cadernetas])]
  })
  return map
}
