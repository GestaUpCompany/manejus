export interface PesagemIndividual {
  peso_atual_kg: number | null
  peso_atual_data: string | null
}

export interface AmostraDePeso {
  /** animais na amostra */
  animais: number
  /** média simples dos pesos, em kg por cabeça */
  media: number
  /** data da pesagem mais recente da amostra (AAAA-MM-DD) */
  dataReferencia: string
  /** data da pesagem mais antiga da amostra */
  dataMaisAntiga: string
  /** fração do lote/categoria coberta pela amostra (0 a 1), ou null quando a contagem do agregado é desconhecida */
  cobertura: number | null
}

const DIA_MS = 86_400_000

/**
 * Resume as pesagens individuais recentes de uma categoria numa amostra para sugerir o peso do agregado.
 * Só entram pesos positivos com data dentro da janela (padrão 30 dias, sem datas futuras). A média é simples:
 * é uma amostra, não o peso do lote inteiro. Devolve null quando não há pesagem utilizável.
 */
export function resumirAmostraDePeso(
  pesagens: PesagemIndividual[],
  hoje: string,
  quantAtual?: number | null,
  janelaDias = 30
): AmostraDePeso | null {
  const fim = Date.parse(`${hoje}T00:00:00Z`)
  const validas = pesagens.filter((p) => {
    if (p.peso_atual_kg == null || !(p.peso_atual_kg > 0) || !p.peso_atual_data) return false
    const t = Date.parse(`${p.peso_atual_data}T00:00:00Z`)
    if (Number.isNaN(t) || t > fim) return false
    return (fim - t) / DIA_MS <= janelaDias
  })
  if (validas.length === 0) return null

  const datas = validas.map((p) => p.peso_atual_data!).sort()
  const soma = validas.reduce((acc, p) => acc + (p.peso_atual_kg as number), 0)
  return {
    animais: validas.length,
    media: soma / validas.length,
    dataReferencia: datas[datas.length - 1],
    dataMaisAntiga: datas[0],
    cobertura: quantAtual && quantAtual > 0 ? Math.min(1, validas.length / quantAtual) : null,
  }
}
