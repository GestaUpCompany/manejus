import { supabase } from './supabaseClient'

export type PeriodoAtividade = 'day' | 'week' | 'month'

export interface AtividadeRegistro {
  caderneta: string
  fazenda_id: string
  fazenda_nome: string
  periodo_inicio: string
  quantidade: number
}

export interface ResumoAtividade {
  caderneta: string
  total: number
  fazendas: { id: string; nome: string; quantidade: number }[]
}

export async function getAtividadesRegistros(periodo: PeriodoAtividade = 'day'): Promise<AtividadeRegistro[]> {
  const { data, error } = await supabase.rpc('get_registros_atividades', {
    periodo,
  })

  if (error) {
    console.error('Erro ao buscar atividades de registros:', error)
    return []
  }

  return (data || []).map((row: any) => ({
    caderneta: row.caderneta,
    fazenda_id: row.fazenda_id,
    fazenda_nome: row.fazenda_nome,
    periodo_inicio: row.periodo_inicio,
    quantidade: Number(row.quantidade),
  }))
}

export function agruparPorCaderneta(atividades: AtividadeRegistro[]): ResumoAtividade[] {
  const map = new Map<string, ResumoAtividade>()

  for (const item of atividades) {
    const existente = map.get(item.caderneta)
    if (existente) {
      existente.total += item.quantidade
      const fazenda = existente.fazendas.find((f) => f.id === item.fazenda_id)
      if (fazenda) {
        fazenda.quantidade += item.quantidade
      } else {
        existente.fazendas.push({
          id: item.fazenda_id,
          nome: item.fazenda_nome,
          quantidade: item.quantidade,
        })
      }
    } else {
      map.set(item.caderneta, {
        caderneta: item.caderneta,
        total: item.quantidade,
        fazendas: [
          {
            id: item.fazenda_id,
            nome: item.fazenda_nome,
            quantidade: item.quantidade,
          },
        ],
      })
    }
  }

  return Array.from(map.values()).sort((a, b) => b.total - a.total)
}

export function formatarPeriodo(periodoInicio: string, periodo: PeriodoAtividade): string {
  const date = new Date(periodoInicio + 'T00:00:00')
  const formatter = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' })

  switch (periodo) {
    case 'day':
      return formatter.format(date)
    case 'week': {
      const end = new Date(date)
      end.setUTCDate(end.getUTCDate() + 6)
      return `${formatter.format(date)} - ${formatter.format(end)}`
    }
    case 'month':
      return formatter.format(date)
    default:
      return periodoInicio
  }
}
