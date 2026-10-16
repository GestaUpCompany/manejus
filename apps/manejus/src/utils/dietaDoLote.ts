import { planoVigenteNaData } from '../services/lancamentoTratosService'

/** Plano nutricional do lote (por lote inteiro ou por categoria do lote), com o nome da formulação. */
export interface PlanoDoLote {
  id: string
  nome: string | null
  lote_id: string | null
  lote_categoria_id: string | null
  ativo: boolean | null
  data_inicio: string | null
  data_fim: string | null
  gmd_planejado: number | string | null
  peso_meta_kg: number | string | null
  formulacao: string | null
}

const dia = (d: string | null) => (d ? d.slice(0, 10) : null)

/** Dieta em vigor na data (a mais recente, se houver mais de uma). A dieta é do lote: vale para todos os animais dele. */
export function dietaAtual(planos: PlanoDoLote[], hoje: string): PlanoDoLote | null {
  const vigentes = planos.filter((p) => planoVigenteNaData({ ...p, formulacoes: null }, hoje))
  if (vigentes.length === 0) return null
  return [...vigentes].sort((a, b) => (dia(b.data_inicio) ?? '').localeCompare(dia(a.data_inicio) ?? ''))[0]
}

/** Dietas que já terminaram (têm data de fim passada), da mais recente para a mais antiga. */
export function dietasAnteriores(planos: PlanoDoLote[], hoje: string): PlanoDoLote[] {
  return planos
    .filter((p) => !!dia(p.data_fim) && dia(p.data_fim)! < hoje)
    .sort((a, b) => (dia(b.data_fim) ?? '').localeCompare(dia(a.data_fim) ?? ''))
}

export interface EventoDoLote {
  /** AAAA-MM-DD */
  data: string
  titulo: string
  detalhe: string | null
}

/**
 * Mudanças de dieta do lote que o animal "viveu": início e fim de plano entre `desde` (quando entrou neste lote, tanto
 * quanto se sabe) e `ate` (saída do animal ou hoje). São eventos do lote, não do animal; planos sem data não geram evento.
 */
export function eventosDeDietaDoLote(planos: PlanoDoLote[], desde: string | null, ate: string): EventoDoLote[] {
  const dentro = (d: string) => (!desde || d >= desde) && d <= ate
  const eventos: EventoDoLote[] = []
  for (const p of planos) {
    const nome = p.nome ?? p.formulacao ?? 'Plano nutricional'
    const inicio = dia(p.data_inicio)
    const fim = dia(p.data_fim)
    if (inicio && dentro(inicio)) eventos.push({ data: inicio, titulo: `Dieta do lote iniciada: ${nome}`, detalhe: p.formulacao && p.formulacao !== nome ? `Formulação ${p.formulacao}` : null })
    if (fim && dentro(fim)) eventos.push({ data: fim, titulo: `Dieta do lote encerrada: ${nome}`, detalhe: null })
  }
  // no mesmo dia, o início da nova dieta aparece acima do encerramento da anterior
  return eventos.sort((a, b) => b.data.localeCompare(a.data) || Number(b.titulo.includes('iniciada')) - Number(a.titulo.includes('iniciada')))
}
