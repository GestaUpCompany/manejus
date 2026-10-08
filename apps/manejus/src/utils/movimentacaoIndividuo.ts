export interface LoteCategoria {
  loteId: string | null | undefined
  categoria: string | null | undefined
}

export interface MovimentacaoIndividuoInput {
  fazendaId: string
  individuoId: string
  identificacao: string
  origem: LoteCategoria
  destino: LoteCategoria
  /** Data da movimentação (YYYY-MM-DD, fuso da fazenda) */
  data: string
  /** Peso informado do animal. Nulo quando o formulário não tem peso. */
  pesoKg: number | null
  /** Peso médio atual da categoria no lote de destino, usado quando o animal não tem peso informado. */
  pesoMedioDestinoKg?: number | null
  /** Rótulo da operação nas observações, ex.: "realocação" ou "cadastro" */
  contexto: 'realocacao' | 'cadastro'
}

export interface LinhaMovimentacao {
  fazenda_id: string
  lote_origem_id: string
  lote_destino_id: null
  categoria: string
  numero_cabecas: 1
  data: string
  peso_vivo_atual_kg: number | null
  motivo_movimentacao: 'Entrada' | 'Saída'
  causa_observacao: string
  individuo_id: string
}

const temLocal = (l: LoteCategoria): l is { loteId: string; categoria: string } => !!l.loteId && !!l.categoria

/** True quando o animal mudou de lote ou de categoria (inclui entrar em ou sair de um lote). */
export function mudouLocal(origem: LoteCategoria, destino: LoteCategoria): boolean {
  if (!temLocal(origem) && !temLocal(destino)) return false
  return origem.loteId !== destino.loteId || origem.categoria !== destino.categoria
}

/**
 * Monta as linhas de registros_movimentacao para um animal que entra, sai ou troca de lote/categoria.
 *
 * Segue a convenção que o trigger update_quant_atual_movimentacao e calculate_quant_atual esperam:
 * em Entrada, `lote_origem_id` é o lote que RECEBE o animal (e `lote_destino_id` fica nulo);
 * em Saída, `lote_origem_id` é o lote de onde o animal sai. O trigger recalcula `quant_atual`
 * do lote/categoria afetado, então o cliente nunca deve escrever `quant_atual`.
 *
 * Uma Entrada com peso nulo faria o trigger anular o peso médio da categoria no lote; por isso,
 * sem peso do animal, usa-se o peso médio atual da categoria (a média ponderada não muda).
 */
export function montarMovimentacoesIndividuo(input: MovimentacaoIndividuoInput): LinhaMovimentacao[] {
  const { fazendaId, individuoId, identificacao, origem, destino, data, pesoKg, pesoMedioDestinoKg, contexto } = input
  if (!mudouLocal(origem, destino)) return []

  const linhas: LinhaMovimentacao[] = []
  const base = { fazenda_id: fazendaId, lote_destino_id: null, numero_cabecas: 1 as const, data, individuo_id: individuoId }

  if (temLocal(origem)) {
    linhas.push({
      ...base,
      lote_origem_id: origem.loteId,
      categoria: origem.categoria,
      peso_vivo_atual_kg: pesoKg,
      motivo_movimentacao: 'Saída',
      causa_observacao: `Saída por ${contexto === 'realocacao' ? 'realocação' : 'cadastro'} de ${identificacao}`,
    })
  }

  if (temLocal(destino)) {
    linhas.push({
      ...base,
      lote_origem_id: destino.loteId,
      categoria: destino.categoria,
      peso_vivo_atual_kg: pesoKg ?? pesoMedioDestinoKg ?? null,
      motivo_movimentacao: 'Entrada',
      causa_observacao: contexto === 'realocacao' ? `Entrada por realocação de ${identificacao}` : `Entrada de indivíduo: ${identificacao}`,
    })
  }

  return linhas
}
