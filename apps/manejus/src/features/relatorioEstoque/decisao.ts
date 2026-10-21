// Regras de decisão do relatório de Estoque de Insumos e Formulações. Funções
// puras compartilhadas entre a página pública, o loader do Infográfico Mensal
// e o payload do PDF (api/pdf/estoque.js não importa TS do front: o cliente
// calcula tudo aqui e envia pronto, como já faz com a curva ABC).
//
// Tudo é derivado de campos que a RPC get_dados_relatorio_estoque já devolve.
// Sem período (links antigos) não há consumo: só valem ruptura por mínimo ou
// saldo negativo e a posição; cobertura, parado e excesso não se aplicam.

import { ROTULO_ORIGEM, chaveItem, type ClasseABC, type ItemEstoque } from './agregacao'

// Limites fixos, explicados no próprio relatório.
export const COBERTURA_RUPTURA_DIAS = 15
export const COBERTURA_ALVO_DIAS = 30
export const COBERTURA_EXCESSO_DIAS = 90

export type SituacaoItem = 'ruptura' | 'parado' | 'excesso' | 'ok'

export const ROTULO_SITUACAO: Record<SituacaoItem, string> = {
  ruptura: 'Repor',
  parado: 'Parado',
  excesso: 'Excesso',
  ok: 'Ok',
}

const saldoDoItem = (i: ItemEstoque): number => i.saldo_final ?? i.estoque_atual

const pl = (n: number, singular: string, plural: string) => (n === 1 ? singular : plural)

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const pct = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

// Prioridade: ruptura > parado > excesso > ok.
export function classificarSituacao(item: ItemEstoque, comPeriodo: boolean): SituacaoItem {
  const cobertura = item.cobertura_dias
  if (item.negativo || item.em_alerta) return 'ruptura'
  if (comPeriodo && cobertura != null && cobertura < COBERTURA_RUPTURA_DIAS) return 'ruptura'
  if (comPeriodo && saldoDoItem(item) > 0 && item.valor_estoque > 0 && (item.saidas ?? 0) === 0) return 'parado'
  if (comPeriodo && cobertura != null && cobertura > COBERTURA_EXCESSO_DIAS) return 'excesso'
  return 'ok'
}

export interface SugestaoReposicao {
  quantidade: number
  valor: number
}

// Quantidade para chegar ao maior entre o estoque mínimo e a cobertura alvo
// (30 dias no ritmo do período). Item sem custo: quantidade sem valor.
export function sugestaoReposicao(item: ItemEstoque): SugestaoReposicao {
  const saldo = saldoDoItem(item)
  const ateMinimo = item.falta_para_minimo ?? 0
  const ateAlvo = item.consumo_medio_dia != null ? item.consumo_medio_dia * COBERTURA_ALVO_DIAS - saldo : 0
  const quantidade = Math.max(ateMinimo, ateAlvo, 0)
  return { quantidade, valor: item.sem_custo ? 0 : quantidade * item.custo_unitario }
}

// Dias do período (inclusivo). Sem data de início não há média diária.
export function diasDoPeriodo(inicio?: string | null, fim?: string | null, geradoEm?: string | null): number | null {
  const ini = inicio?.slice(0, 10)
  if (!ini) return null
  let fimStr = fim?.slice(0, 10)
  if (!fimStr) {
    const ref = geradoEm ? new Date(geradoEm) : new Date()
    if (isNaN(ref.getTime())) return null
    // Cuiabá (UTC-4): evita virar o dia por fuso.
    fimStr = new Date(ref.getTime() - 4 * 3600 * 1000).toISOString().slice(0, 10)
  }
  const ms = Date.parse(`${fimStr}T00:00:00Z`) - Date.parse(`${ini}T00:00:00Z`)
  if (isNaN(ms)) return null
  return Math.max(1, Math.round(ms / 86400000) + 1)
}

export interface ConsumoOrigem {
  origem: string
  rotulo: string
  valor: number
}

export interface ResumoDecisao {
  comPeriodo: boolean
  dias: number | null
  valorEstoque: number
  // Aproximação: saldo inicial × custo médio atual.
  valorInicial: number | null
  variacaoValor: number | null
  variacaoPct: number | null
  consumoValor: number | null
  consumoDiaValor: number | null
  giro: number | null
  contagem: Record<SituacaoItem, number>
  capital: Record<SituacaoItem, number>
  capitalParadoExcesso: number
  pctParadoExcesso: number
  reposicaoValor: number
  consumoPorOrigem: ConsumoOrigem[]
  semCusto: number
  negativos: number
  comAjuste: number
}

export interface Concentracao {
  itensA: number
  itensComValor: number
  pctItensA: number
  pctValorA: number
}

export function concentracaoABC(itens: ItemEstoque[], abc: Map<string, ClasseABC> | Record<string, ClasseABC>): Concentracao {
  const classe = (i: ItemEstoque) => (abc instanceof Map ? abc.get(chaveItem(i)) : abc[chaveItem(i)])
  const comValor = itens.filter((i) => classe(i) != null)
  const total = comValor.reduce((s, i) => s + i.valor_estoque, 0)
  const a = comValor.filter((i) => classe(i) === 'A')
  const valorA = a.reduce((s, i) => s + i.valor_estoque, 0)
  return {
    itensA: a.length,
    itensComValor: comValor.length,
    pctItensA: comValor.length > 0 ? (a.length / comValor.length) * 100 : 0,
    pctValorA: total > 0 ? (valorA / total) * 100 : 0,
  }
}

export function resumirDecisao(itens: ItemEstoque[], comPeriodo: boolean, dias: number | null): ResumoDecisao {
  const contagem: Record<SituacaoItem, number> = { ruptura: 0, parado: 0, excesso: 0, ok: 0 }
  const capital: Record<SituacaoItem, number> = { ruptura: 0, parado: 0, excesso: 0, ok: 0 }
  let valorEstoque = 0
  let valorInicial = 0
  let consumoValor = 0
  let reposicaoValor = 0
  const origens = new Map<string, number>()

  for (const item of itens) {
    const situacao = classificarSituacao(item, comPeriodo)
    contagem[situacao] += 1
    capital[situacao] += item.valor_estoque
    valorEstoque += item.valor_estoque
    if (!comPeriodo) continue
    valorInicial += Math.max(item.saldo_inicial ?? 0, 0) * item.custo_unitario
    consumoValor += item.saidas_valor ?? 0
    if (situacao === 'ruptura') reposicaoValor += sugestaoReposicao(item).valor
    // consumo_origem vem em quantidade: converte para R$ no custo médio do consumo do item.
    const saidas = item.saidas ?? 0
    if (saidas > 0 && item.consumo_origem) {
      const custoMedioSaida = (item.saidas_valor ?? 0) / saidas
      for (const [origem, qtd] of Object.entries(item.consumo_origem)) {
        origens.set(origem, (origens.get(origem) ?? 0) + qtd * custoMedioSaida)
      }
    }
  }

  const consumoDiaValor = comPeriodo && dias ? consumoValor / dias : null
  const mediaEstoque = (valorInicial + valorEstoque) / 2
  const capitalParadoExcesso = capital.parado + capital.excesso
  return {
    comPeriodo,
    dias,
    valorEstoque,
    valorInicial: comPeriodo ? valorInicial : null,
    variacaoValor: comPeriodo ? valorEstoque - valorInicial : null,
    variacaoPct: comPeriodo && valorInicial > 0 ? ((valorEstoque - valorInicial) / valorInicial) * 100 : null,
    consumoValor: comPeriodo ? consumoValor : null,
    consumoDiaValor,
    giro: comPeriodo && mediaEstoque > 0 ? consumoValor / mediaEstoque : null,
    contagem,
    capital,
    capitalParadoExcesso,
    pctParadoExcesso: valorEstoque > 0 ? (capitalParadoExcesso / valorEstoque) * 100 : 0,
    reposicaoValor,
    consumoPorOrigem: [...origens.entries()]
      .map(([origem, valor]) => ({ origem, rotulo: ROTULO_ORIGEM[origem] ?? origem, valor }))
      .filter((o) => o.valor > 0)
      .sort((a, b) => b.valor - a.valor),
    semCusto: itens.filter((i) => i.sem_custo).length,
    negativos: itens.filter((i) => i.negativo).length,
    comAjuste: comPeriodo ? itens.filter((i) => (i.qtd_ajustes ?? 0) > 0).length : 0,
  }
}

// Itens a repor, do mais urgente ao menos: saldo negativo primeiro, depois
// menor cobertura; sem cobertura (abaixo do mínimo sem consumo) por último.
export function listaRepor(itens: ItemEstoque[], comPeriodo: boolean): ItemEstoque[] {
  const urgencia = (i: ItemEstoque) => (i.negativo ? -1 : (i.cobertura_dias ?? Number.POSITIVE_INFINITY))
  return itens
    .filter((i) => classificarSituacao(i, comPeriodo) === 'ruptura')
    .sort((a, b) => urgencia(a) - urgencia(b) || b.valor_estoque - a.valor_estoque)
}

// Capital imobilizado (parado e excesso), do maior valor para o menor.
export function listaImobilizado(itens: ItemEstoque[], comPeriodo: boolean): ItemEstoque[] {
  return itens
    .filter((i) => {
      const s = classificarSituacao(i, comPeriodo)
      return s === 'parado' || s === 'excesso'
    })
    .sort((a, b) => b.valor_estoque - a.valor_estoque)
}

export interface DecisaoPDF {
  resumo: ResumoDecisao
  concentracao: Concentracao
  leitura: string[]
  // Situação por chaveItem; as listas já vêm ordenadas para o endpoint só renderizar.
  situacoes: Record<string, SituacaoItem>
  repor: { chave: string; quantidade: number; valor: number }[]
  imobilizado: string[]
  limites: { ruptura: number; alvo: number; excesso: number }
}

export interface EntradaDecisao {
  itens: ItemEstoque[]
  tem_periodo?: boolean
  data_inicio?: string | null
  data_fim?: string | null
  gerado_em?: string | null
}

// Payload de decisão enviado a api/pdf/estoque.js (PDF do link público e Infográfico).
export function montarDecisao(dados: EntradaDecisao, abc: Map<string, ClasseABC>): DecisaoPDF {
  const comPeriodo = dados.tem_periodo === true
  const dias = comPeriodo ? diasDoPeriodo(dados.data_inicio, dados.data_fim, dados.gerado_em) : null
  const resumo = resumirDecisao(dados.itens, comPeriodo, dias)
  const concentracao = concentracaoABC(dados.itens, abc)
  return {
    resumo,
    concentracao,
    leitura: lerPeriodo(resumo, concentracao),
    situacoes: Object.fromEntries(dados.itens.map((i) => [chaveItem(i), classificarSituacao(i, comPeriodo)])),
    repor: listaRepor(dados.itens, comPeriodo).map((i) => ({ chave: chaveItem(i), ...sugestaoReposicao(i) })),
    imobilizado: listaImobilizado(dados.itens, comPeriodo).map(chaveItem),
    limites: { ruptura: COBERTURA_RUPTURA_DIAS, alvo: COBERTURA_ALVO_DIAS, excesso: COBERTURA_EXCESSO_DIAS },
  }
}

// "Leitura do período": frases geradas por regra, na ordem em que o gestor decide.
export function lerPeriodo(resumo: ResumoDecisao, conc: Concentracao): string[] {
  const frases: string[] = []
  const n = resumo.contagem.ruptura
  if (n > 0) {
    const reposicao = resumo.comPeriodo && resumo.reposicaoValor > 0 ? `; reposição estimada em ${moeda(resumo.reposicaoValor)}` : ''
    frases.push(`${n} ${pl(n, 'item pede', 'itens pedem')} reposição (abaixo do mínimo, saldo negativo${resumo.comPeriodo ? ` ou cobertura menor que ${COBERTURA_RUPTURA_DIAS} dias` : ''})${reposicao}.`)
  } else {
    frases.push('Nenhum item com risco de ruptura.')
  }
  if (resumo.comPeriodo) {
    const { parado, excesso } = resumo.contagem
    if (parado + excesso > 0) {
      const partes = [
        parado > 0 ? `${parado} ${pl(parado, 'item sem saída', 'itens sem saída')} no período` : '',
        excesso > 0 ? `${excesso} ${pl(excesso, 'item', 'itens')} com cobertura acima de ${COBERTURA_EXCESSO_DIAS} dias` : '',
      ].filter(Boolean)
      frases.push(`${moeda(resumo.capitalParadoExcesso)} (${pct(resumo.pctParadoExcesso)} do valor em estoque) está parado ou em excesso: ${partes.join(' e ')}.`)
    } else {
      frases.push('Nenhum capital parado ou em excesso no período.')
    }
  }
  if (conc.itensComValor > 0) {
    frases.push(`${conc.itensA} de ${conc.itensComValor} ${pl(conc.itensComValor, 'item', 'itens')} (${pct(conc.pctItensA)}) formam a classe A e concentram ${pct(conc.pctValorA)} do valor: é onde vale concentrar o controle.`)
  }
  return frases
}
