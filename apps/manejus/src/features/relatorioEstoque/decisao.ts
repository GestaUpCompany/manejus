// Regras de decisão do relatório de Estoque de Insumos e Formulações. Funções
// puras compartilhadas entre a página pública, o loader do Infográfico Mensal
// e o payload do PDF (api/pdf/estoque.js não importa TS do front: o cliente
// calcula tudo aqui e envia pronto, como já faz com a curva ABC).
//
// Tudo é derivado de campos que a RPC get_dados_relatorio_estoque já devolve.
// Sem período (links antigos) não há consumo: só valem ruptura por mínimo ou
// saldo negativo e a posição; programar, parado e estoque alto não se aplicam.
//
// Falta pesa mais que sobra: faltar comida custa na hora, estoque alto costuma
// ser escolha (compra em lote, safra, entressafra). Por isso "repor" e
// "programar" vêm primeiro e "estoque alto" é só informação; "parado" (sem
// nenhuma saída) é a única sobra tratada como atenção.
//
// Formulações são produzidas na fábrica, não compradas: a sugestão delas é de
// produção e não entra nos valores de compra.

import { ROTULO_ORIGEM, chaveItem, type ClasseABC, type ItemEstoque } from './agregacao'

// Limites fixos, explicados no próprio relatório.
export const COBERTURA_RUPTURA_DIAS = 15
export const COBERTURA_ALVO_DIAS = 30
export const COBERTURA_ALTA_DIAS = 90

export type SituacaoItem = 'ruptura' | 'programar' | 'parado' | 'alto' | 'ok'

export const ROTULO_SITUACAO: Record<SituacaoItem, string> = {
  ruptura: 'Repor',
  programar: 'Programar',
  parado: 'Parado',
  alto: 'Estoque alto',
  ok: 'Ok',
}

const saldoDoItem = (i: ItemEstoque): number => i.saldo_final ?? i.estoque_atual

const pl = (n: number, singular: string, plural: string) => (n === 1 ? singular : plural)

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const pct = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

// Prioridade: ruptura > programar > parado > alto > ok.
export function classificarSituacao(item: ItemEstoque, comPeriodo: boolean): SituacaoItem {
  const cobertura = item.cobertura_dias
  if (item.negativo || item.em_alerta) return 'ruptura'
  if (comPeriodo && cobertura != null && cobertura < COBERTURA_RUPTURA_DIAS) return 'ruptura'
  if (comPeriodo && cobertura != null && cobertura < COBERTURA_ALVO_DIAS) return 'programar'
  if (comPeriodo && saldoDoItem(item) > 0 && item.valor_estoque > 0 && (item.saidas ?? 0) === 0) return 'parado'
  if (comPeriodo && cobertura != null && cobertura > COBERTURA_ALTA_DIAS) return 'alto'
  return 'ok'
}

export interface SugestaoReposicao {
  quantidade: number
  // R$ da compra. Zero para formulação (é produzida, o custo já está nos insumos).
  valor: number
  // Insumo se compra; formulação se produz.
  acao: 'compra' | 'producao'
  // O que a quantidade cobre: o estoque mínimo ou os 30 dias de consumo (o que exigir mais).
  criterio: 'minimo' | 'cobertura' | null
  // Cobertura em dias com a compra feita (null sem consumo no período).
  coberturaApos: number | null
}

// Quantidade para chegar ao maior entre o estoque mínimo e a cobertura alvo
// (30 dias no ritmo do período). Item sem custo: quantidade sem valor.
export function sugestaoReposicao(item: ItemEstoque): SugestaoReposicao {
  const saldo = saldoDoItem(item)
  const ateMinimo = item.falta_para_minimo ?? 0
  const consumo = item.consumo_medio_dia ?? 0
  const ateAlvo = consumo > 0 ? consumo * COBERTURA_ALVO_DIAS - saldo : 0
  const quantidade = Math.max(ateMinimo, ateAlvo, 0)
  const acao = item.item_tipo === 'formulacao' ? 'producao' : 'compra'
  return {
    quantidade,
    valor: acao === 'producao' || item.sem_custo ? 0 : quantidade * item.custo_unitario,
    acao,
    criterio: quantidade <= 0 ? null : ateAlvo >= ateMinimo ? 'cobertura' : 'minimo',
    coberturaApos: consumo > 0 ? Math.max(saldo + quantidade, 0) / consumo : null,
  }
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
  pctParado: number
  pctAlto: number
  // Compra estimada de insumos: urgente (repor) e a programar. Formulação fica de fora.
  reposicaoValor: number
  programarValor: number
  // Formulações que pedem produção (repor ou programar).
  producaoItens: number
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
  const zerar = (): Record<SituacaoItem, number> => ({ ruptura: 0, programar: 0, parado: 0, alto: 0, ok: 0 })
  const contagem = zerar()
  const capital = zerar()
  let valorEstoque = 0
  let valorInicial = 0
  let consumoValor = 0
  let reposicaoValor = 0
  let programarValor = 0
  let producaoItens = 0
  const origens = new Map<string, number>()

  for (const item of itens) {
    const situacao = classificarSituacao(item, comPeriodo)
    contagem[situacao] += 1
    capital[situacao] += item.valor_estoque
    valorEstoque += item.valor_estoque
    if (situacao === 'ruptura' || situacao === 'programar') {
      if (item.item_tipo === 'formulacao') producaoItens += 1
      else if (comPeriodo || situacao === 'ruptura') {
        const valor = sugestaoReposicao(item).valor
        if (situacao === 'ruptura') reposicaoValor += valor
        else programarValor += valor
      }
    }
    if (!comPeriodo) continue
    valorInicial += Math.max(item.saldo_inicial ?? 0, 0) * item.custo_unitario
    consumoValor += item.saidas_valor ?? 0
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
    pctParado: valorEstoque > 0 ? (capital.parado / valorEstoque) * 100 : 0,
    pctAlto: valorEstoque > 0 ? (capital.alto / valorEstoque) * 100 : 0,
    reposicaoValor,
    programarValor,
    producaoItens,
    consumoPorOrigem: [...origens.entries()]
      .map(([origem, valor]) => ({ origem, rotulo: ROTULO_ORIGEM[origem] ?? origem, valor }))
      .filter((o) => o.valor > 0)
      .sort((a, b) => b.valor - a.valor),
    semCusto: itens.filter((i) => i.sem_custo).length,
    negativos: itens.filter((i) => i.negativo).length,
    comAjuste: comPeriodo ? itens.filter((i) => (i.qtd_ajustes ?? 0) > 0).length : 0,
  }
}

// Do mais urgente ao menos: saldo negativo primeiro, depois menor cobertura;
// sem cobertura (abaixo do mínimo sem consumo) por último.
function porUrgencia(itens: ItemEstoque[]): ItemEstoque[] {
  const urgencia = (i: ItemEstoque) => (i.negativo ? -1 : (i.cobertura_dias ?? Number.POSITIVE_INFINITY))
  return itens.sort((a, b) => urgencia(a) - urgencia(b) || b.valor_estoque - a.valor_estoque)
}

const porValor = (itens: ItemEstoque[]) => itens.sort((a, b) => b.valor_estoque - a.valor_estoque)

const daSituacao = (itens: ItemEstoque[], comPeriodo: boolean, situacao: SituacaoItem) =>
  itens.filter((i) => classificarSituacao(i, comPeriodo) === situacao)

// Repor agora: risco de ruptura.
export function listaRepor(itens: ItemEstoque[], comPeriodo: boolean): ItemEstoque[] {
  return porUrgencia(daSituacao(itens, comPeriodo, 'ruptura'))
}

// Programar compra: abaixo da meta de cobertura, mas ainda sem risco imediato.
export function listaProgramar(itens: ItemEstoque[], comPeriodo: boolean): ItemEstoque[] {
  return porUrgencia(daSituacao(itens, comPeriodo, 'programar'))
}

// Parados: saldo e valor sem nenhuma saída no período, do maior valor para o menor.
export function listaParados(itens: ItemEstoque[], comPeriodo: boolean): ItemEstoque[] {
  return porValor(daSituacao(itens, comPeriodo, 'parado'))
}

// Estoque alto: cobertura acima do limite, do maior valor para o menor. É informação.
export function listaAltos(itens: ItemEstoque[], comPeriodo: boolean): ItemEstoque[] {
  return porValor(daSituacao(itens, comPeriodo, 'alto'))
}

export interface ReposicaoPDF extends SugestaoReposicao {
  chave: string
}

export interface DecisaoPDF {
  resumo: ResumoDecisao
  concentracao: Concentracao
  leitura: string[]
  // Situação por chaveItem; as listas já vêm ordenadas para o endpoint só renderizar.
  situacoes: Record<string, SituacaoItem>
  repor: ReposicaoPDF[]
  programar: ReposicaoPDF[]
  parados: string[]
  altos: string[]
  limites: { ruptura: number; alvo: number; alta: number }
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
  const reposicao = (lista: ItemEstoque[]): ReposicaoPDF[] => lista.map((i) => ({ chave: chaveItem(i), ...sugestaoReposicao(i) }))
  return {
    resumo,
    concentracao,
    leitura: lerPeriodo(resumo, concentracao),
    situacoes: Object.fromEntries(dados.itens.map((i) => [chaveItem(i), classificarSituacao(i, comPeriodo)])),
    repor: reposicao(listaRepor(dados.itens, comPeriodo)),
    programar: reposicao(listaProgramar(dados.itens, comPeriodo)),
    parados: listaParados(dados.itens, comPeriodo).map(chaveItem),
    altos: listaAltos(dados.itens, comPeriodo).map(chaveItem),
    limites: { ruptura: COBERTURA_RUPTURA_DIAS, alvo: COBERTURA_ALVO_DIAS, alta: COBERTURA_ALTA_DIAS },
  }
}

// "Leitura do período": frases geradas por regra, na ordem em que o gestor decide
// (falta primeiro; sobra por último e só como informação).
export function lerPeriodo(resumo: ResumoDecisao, conc: Concentracao): string[] {
  const frases: string[] = []
  const { ruptura, programar, parado, alto } = resumo.contagem
  if (ruptura > 0) {
    const compra = resumo.comPeriodo && resumo.reposicaoValor > 0 ? `; compra estimada de insumos em ${moeda(resumo.reposicaoValor)}` : ''
    frases.push(`${ruptura} ${pl(ruptura, 'item pede', 'itens pedem')} reposição urgente (abaixo do mínimo, saldo negativo${resumo.comPeriodo ? ` ou cobertura menor que ${COBERTURA_RUPTURA_DIAS} dias` : ''})${compra}.`)
  } else {
    frases.push('Nenhum item com risco de ruptura.')
  }
  if (resumo.comPeriodo && programar > 0) {
    const estimativa = resumo.programarValor > 0 ? ` (estimativa de ${moeda(resumo.programarValor)} em insumos)` : ''
    frases.push(`${programar} ${pl(programar, 'item está', 'itens estão')} com cobertura entre ${COBERTURA_RUPTURA_DIAS} e ${COBERTURA_ALVO_DIAS} dias e ${pl(programar, 'deve', 'devem')} entrar na próxima compra${estimativa}.`)
  }
  if (resumo.producaoItens > 0) {
    const n = resumo.producaoItens
    frases.push(`${n} ${pl(n, 'formulação pede', 'formulações pedem')} produção na fábrica, não compra.`)
  }
  if (resumo.comPeriodo && parado > 0) {
    frases.push(`${moeda(resumo.capital.parado)} (${pct(resumo.pctParado)} do valor em estoque) está em ${parado} ${pl(parado, 'item parado', 'itens parados')}, sem nenhuma saída no período.`)
  }
  if (resumo.comPeriodo && alto > 0) {
    frases.push(`${moeda(resumo.capital.alto)} (${pct(resumo.pctAlto)} do valor em estoque) está em ${alto} ${pl(alto, 'item com', 'itens com')} cobertura acima de ${COBERTURA_ALTA_DIAS} dias: confirme se é estoque estratégico (compra em lote, safra ou entressafra).`)
  }
  if (conc.itensComValor > 0) {
    frases.push(`${conc.itensA} de ${conc.itensComValor} ${pl(conc.itensComValor, 'item', 'itens')} (${pct(conc.pctItensA)}) formam a classe A e concentram ${pct(conc.pctValorA)} do valor: é onde vale concentrar o controle.`)
  }
  return frases
}
