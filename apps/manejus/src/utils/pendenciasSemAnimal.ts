import type { LinhaConciliacao } from './conciliacaoIdentificacao'

export interface MortePendente {
  id: string
  data: string
  lote_id: string | null
  lote?: string | null
  categoria: string | null
  individuo_id: string | null
}

export interface MovimentacaoPendente {
  id: string
  data: string
  lote_origem_id: string | null
  lote_destino_id: string | null
  categoria: string | null
  numero_cabecas: number | null
}

const chave = (loteId: string | null | undefined, categoria: string | null | undefined) =>
  `${loteId ?? ''}|${(categoria ?? '').trim().toLowerCase()}`

/**
 * Mortes sem animal informado que poderiam ter um: o lote da morte tem animais identificados daquela categoria.
 * É uma sugestão (o agregado já foi descontado), nunca um erro.
 */
export function mortesSemAnimalSugeridas(mortes: MortePendente[], linhas: LinhaConciliacao[]): MortePendente[] {
  const comIdentificados = new Set(linhas.filter((l) => l.identificados > 0).map((l) => chave(l.lote_id, l.categoria)))
  return mortes.filter((m) => !m.individuo_id && comIdentificados.has(chave(m.lote_id, m.categoria)))
}

/**
 * Apartações por contagem que ainda deixam animais com localização incerta: origem ou destino tem incertos na
 * categoria da movimentação e a movimentação tem menos animais informados (ponte) do que cabeças.
 */
export function apartacoesSemAnimalSugeridas(
  movimentacoes: MovimentacaoPendente[],
  linhas: LinhaConciliacao[],
  animaisInformadosPorMovimentacao: Map<string, number>
): MovimentacaoPendente[] {
  const comIncertos = new Set(linhas.filter((l) => l.incertos > 0).map((l) => chave(l.lote_id, l.categoria)))
  return movimentacoes.filter((m) => {
    if (!m.lote_origem_id || !m.lote_destino_id || m.lote_origem_id === m.lote_destino_id) return false
    if ((m.numero_cabecas ?? 0) <= 0) return false
    if ((animaisInformadosPorMovimentacao.get(m.id) ?? 0) >= (m.numero_cabecas ?? 0)) return false
    return comIncertos.has(chave(m.lote_origem_id, m.categoria)) || comIncertos.has(chave(m.lote_destino_id, m.categoria))
  })
}
