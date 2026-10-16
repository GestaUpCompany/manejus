/** Escapa os curingas do LIKE (barra invertida, % e _) para o termo digitado valer como texto literal. */
export function escapeLikeTerm(term: string): string {
  return term.replace(/[\\%_]/g, (caractere) => `\\${caractere}`)
}

/**
 * Valor entre aspas para uso dentro de `.or(...)` do PostgREST. Sem isso, vírgula, ponto, parêntese ou
 * aspas no termo digitado quebram o filtro (ou viram outra condição).
 */
export function quotePostgrestValue(value: string): string {
  return `"${value.replace(/[\\"]/g, (caractere) => `\\${caractere}`)}"`
}

/** Condição `coluna.ilike."%termo%"` com o termo escapado, contendo o texto digitado em qualquer posição. */
export function ilikeContainsCondition(column: string, term: string): string {
  return `${column}.ilike.${quotePostgrestValue(`%${escapeLikeTerm(term)}%`)}`
}
