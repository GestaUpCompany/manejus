/** Linha de vw_lote_categoria_identificacao: o indivíduo é subconjunto do agregado (quant_atual). */
export interface LinhaConciliacao {
  lote_categoria_id: string
  lote_id: string
  lote_nome: string
  categoria: string
  quant_atual: number
  identificados: number
  incertos: number
  nao_identificados: number
  confirmados: number
  divergencia: boolean
}

export type FiltroConciliacao = 'todos' | 'divergentes' | 'incertos'
export type SituacaoConciliacao = 'divergente' | 'incerta' | 'ok'

/** Divergência pesa mais que incerteza: confirmados acima do agregado precisam de decisão do gestor. */
export function situacaoConciliacao(linha: LinhaConciliacao): SituacaoConciliacao {
  if (linha.divergencia) return 'divergente'
  if (linha.incertos > 0) return 'incerta'
  return 'ok'
}

/** Só linhas com algum identificado interessam; o filtro restringe a divergentes ou a com incertos. */
export function filtrarConciliacao(linhas: LinhaConciliacao[], filtro: FiltroConciliacao): LinhaConciliacao[] {
  return linhas
    .filter((l) => l.identificados > 0)
    .filter((l) => (filtro === 'divergentes' ? l.divergencia : filtro === 'incertos' ? l.incertos > 0 : true))
    .sort(
      (a, b) =>
        Number(b.divergencia) - Number(a.divergencia) ||
        b.incertos - a.incertos ||
        a.lote_nome.localeCompare(b.lote_nome, 'pt-BR') ||
        a.categoria.localeCompare(b.categoria, 'pt-BR')
    )
}

export interface ResumoConciliacao {
  categoriasComIdentificados: number
  identificados: number
  divergentes: number
  incertos: number
}

export function resumirConciliacao(linhas: LinhaConciliacao[]): ResumoConciliacao {
  const comIdentificados = linhas.filter((l) => l.identificados > 0)
  return {
    categoriasComIdentificados: comIdentificados.length,
    identificados: comIdentificados.reduce((s, l) => s + l.identificados, 0),
    divergentes: comIdentificados.filter((l) => l.divergencia).length,
    incertos: comIdentificados.reduce((s, l) => s + l.incertos, 0),
  }
}

export type NivelQualificacao = 'agregado' | 'parcial' | 'completo'

export interface QualificacaoLote {
  lote_id: string
  lote_nome: string
  nivel: NivelQualificacao
  /** cabeças contadas pelo agregado (categorias com cabeças) */
  cabecas: number
  /** identificados com localização confirmada, limitados à contagem de cada categoria */
  qualificadas: number
  identificados: number
  incertos: number
  divergente: boolean
}

/**
 * Nível de qualificação por lote, calculado a partir das linhas por categoria (não é um estado declarado):
 *  - agregado: nenhum animal identificado, só contagem;
 *  - parcial: há identificados, mas nem toda categoria com cabeças está inteiramente confirmada;
 *  - completo: toda categoria com cabeças tem confirmados >= quant_atual e não há divergência (excesso de identificados);
 * Incerteza e divergência são sinalizações separadas, não níveis. Categorias com 0 cabeças não entram no cálculo.
 */
export function qualificacaoPorLote(linhas: LinhaConciliacao[]): QualificacaoLote[] {
  const porLote = new Map<string, LinhaConciliacao[]>()
  for (const l of linhas) porLote.set(l.lote_id, [...(porLote.get(l.lote_id) ?? []), l])

  return [...porLote.entries()].map(([lote_id, cats]) => {
    const comCabecas = cats.filter((c) => c.quant_atual > 0)
    const identificados = cats.reduce((s, c) => s + c.identificados, 0)
    const divergente = cats.some((c) => c.divergencia)
    const completo = comCabecas.length > 0 && !divergente && comCabecas.every((c) => c.confirmados >= c.quant_atual)
    return {
      lote_id,
      lote_nome: cats[0].lote_nome,
      nivel: identificados === 0 ? 'agregado' : completo ? 'completo' : 'parcial',
      cabecas: comCabecas.reduce((s, c) => s + c.quant_atual, 0),
      qualificadas: comCabecas.reduce((s, c) => s + Math.min(c.confirmados, c.quant_atual), 0),
      identificados,
      incertos: cats.reduce((s, c) => s + c.incertos, 0),
      divergente,
    } satisfies QualificacaoLote
  })
}

export interface ResumoQualificacao {
  cabecas: number
  qualificadas: number
  /** fração 0..1 de cabeças com animal identificado e localização confirmada */
  fracao: number
  lotesPorNivel: Record<NivelQualificacao, number>
}

export function resumirQualificacao(lotes: QualificacaoLote[]): ResumoQualificacao {
  const cabecas = lotes.reduce((s, l) => s + l.cabecas, 0)
  const qualificadas = lotes.reduce((s, l) => s + l.qualificadas, 0)
  const lotesPorNivel: Record<NivelQualificacao, number> = { agregado: 0, parcial: 0, completo: 0 }
  for (const l of lotes) lotesPorNivel[l.nivel] += 1
  return { cabecas, qualificadas, fracao: cabecas > 0 ? qualificadas / cabecas : 0, lotesPorNivel }
}
