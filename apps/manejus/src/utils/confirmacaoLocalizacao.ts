export interface AnimalParaConfirmar {
  id: string
  lote_atual?: string | null
  localizacao_incerta_desde?: string | null
}

export interface GrupoConfirmacao {
  loteId: string
  ids: string[]
}

export interface PlanoConfirmacao {
  grupos: GrupoConfirmacao[]
  /** selecionados que não têm lote: não dá para confirmar onde estão */
  semLote: number
  /** selecionados que não estão com localização incerta (nada a confirmar) */
  jaConfirmados: number
}

/**
 * Agrupa por lote atual os animais selecionados que estão com localização incerta, para confirmar que continuam
 * no lote em que constam. A RPC recebe um lote por chamada.
 */
export function planejarConfirmacao(animais: AnimalParaConfirmar[]): PlanoConfirmacao {
  const porLote = new Map<string, string[]>()
  let semLote = 0
  let jaConfirmados = 0
  for (const a of animais) {
    if (!a.localizacao_incerta_desde) {
      jaConfirmados += 1
    } else if (!a.lote_atual) {
      semLote += 1
    } else {
      porLote.set(a.lote_atual, [...(porLote.get(a.lote_atual) ?? []), a.id])
    }
  }
  return { grupos: [...porLote.entries()].map(([loteId, ids]) => ({ loteId, ids })), semLote, jaConfirmados }
}
