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
