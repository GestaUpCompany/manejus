// Agregação do relatório de Farmácia. A RPC (get_dados_relatorio_farmacia) devolve o catálogo dos medicamentos
// com controle de estoque e o ledger de movimentacoes_farmacia até a data final; aqui viram saldo inicial/final,
// entradas, baixas, validade por lote, reposição, curva ABC e extrato. É a fonte única das regras: a página
// pública, o PDF individual e o Infográfico usam o mesmo resumo (o endpoint de PDF não importa o front).
//
// Regras (reaproveitam features/estoqueFarmacia/logica.ts, as mesmas da tela de gestão):
//  - Ledger em ordem (data, created_at, id); entrada soma, baixa/estorno subtraem, ajuste define o saldo,
//    reclassificação não mexe no saldo.
//  - Saldo inicial = saldo após o último lançamento anterior ao período. Entradas/baixas/ajustes só do período.
//  - Consumo do período = baixas − estornos, nunca negativo por item. Valor em estoque = max(0, saldo) × custo médio atual.
//  - Validade por lote em FEFO (lotesComSaldo), avaliada na data de hoje.
//  - Divergência com o saldo gravado só quando o relatório vai até hoje.

import {
  divergenciaDeSaldo,
  lotesComSaldo,
  movimentosComSaldo,
  situacaoValidade,
  valorDoMovimento,
  DIAS_ALERTA_VALIDADE,
  type ItemEstoqueFarmacia,
  type MovimentoFarmacia,
} from '../estoqueFarmacia/logica'

export type ItemFarmacia = ItemEstoqueFarmacia & { carencia_abate_dias?: number | null }

export interface DadosRelatorioFarmacia {
  fazenda_nome?: string
  fazenda_logo_url?: string | null
  gerado_em?: string
  hoje?: string
  data_inicio?: string | null
  data_fim?: string | null
  itens: ItemFarmacia[]
  movimentacoes: MovimentoFarmacia[]
  movimentacoes_total: number
}

export const DADOS_FARMACIA_VAZIO: DadosRelatorioFarmacia = { itens: [], movimentacoes: [], movimentacoes_total: 0 }

const num = (v: unknown) => Number(v) || 0
const arred = (v: number, casas = 2) => Math.round(v * 10 ** casas) / 10 ** casas

export interface LoteResumo {
  lote: string | null
  validade: string | null
  saldo: number
  situacao: 'vencido' | 'vence_em_breve' | 'ok' | 'sem_validade'
  dias: number | null
}

export interface ItemResumoFarmacia {
  id: string
  nome: string
  tipo: string
  unidade: string
  estoque_minimo: number
  saldo_inicial: number
  entradas: number
  entradas_valor: number
  baixas: number
  baixas_valor: number
  ajustes: number
  saldo_final: number
  custo_unitario: number
  valor_estoque: number
  em_alerta: boolean
  falta_para_minimo: number
  consumo_medio_dia: number | null
  cobertura_dias: number | null
  sem_custo: boolean
  divergencia: number | null
  curva: 'A' | 'B' | 'C' | null
  lotes: LoteResumo[]
}

export interface ItemDistribuicao {
  label: string
  valor: number
}

export interface ResumoFarmacia {
  tem_periodo: boolean
  dias_periodo: number | null
  total_itens: number
  valor_total: number
  em_alerta: number
  a_repor: number
  sem_custo: number
  divergencias: number
  valor_entradas: number
  valor_baixas: number
  lotes_vencidos: number
  lotes_a_vencer: number
  dias_alerta_validade: number
  itens: ItemResumoFarmacia[]
  por_tipo: ItemDistribuicao[]
  baixas_por_origem: ItemDistribuicao[]
  itens_repor: ItemResumoFarmacia[]
  validade: Array<LoteResumo & { item: string; unidade: string }>
  maiores_consumos: ItemResumoFarmacia[]
}

export interface LinhaExtratoFarmacia extends MovimentoFarmacia {
  item: string
  unidade_item: string
  variacao: number
  saldo_apos: number
  valor: number | null
}

const ROTULO_ORIGEM_AGG: Record<string, string> = {
  enfermaria: 'Enfermaria',
  pwa_farmacia: 'Aplicativo',
  painel_entrada: 'Entrada manual',
  painel_ajuste: 'Ajuste manual',
  estoque_inicial: 'Estoque inicial',
}

function diasDoPeriodo(ini?: string | null, fim?: string | null): number | null {
  if (!ini || !fim) return null
  const d = Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${ini}T00:00:00Z`)) / 86_400_000) + 1
  return Math.max(d, 1)
}

function curvaAbc(itens: ItemResumoFarmacia[]): void {
  const total = itens.reduce((s, i) => s + i.valor_estoque, 0)
  if (total <= 0) return
  let acum = 0
  for (const i of [...itens].filter((x) => x.valor_estoque > 0).sort((a, b) => b.valor_estoque - a.valor_estoque)) {
    // Classe pelo acumulado ANTES do item: o que cruza o limiar ainda pertence à classe corrente.
    const pct = acum / total
    i.curva = pct < 0.8 ? 'A' : pct < 0.95 ? 'B' : 'C'
    acum += i.valor_estoque
  }
}

function agruparMovimentos(dados: DadosRelatorioFarmacia) {
  const porItem = new Map<string, MovimentoFarmacia[]>()
  for (const m of dados.movimentacoes) {
    const l = porItem.get(m.medicamento_id) ?? []
    l.push(m)
    porItem.set(m.medicamento_id, l)
  }
  return porItem
}

function resumirItem(item: ItemFarmacia, movs: MovimentoFarmacia[], dados: DadosRelatorioFarmacia, hoje: string, dias: number | null): ItemResumoFarmacia {
  const { data_inicio: ini, data_fim: fim } = dados
  const comSaldo = movimentosComSaldo(movs)
  const saldoFinal = comSaldo.length ? comSaldo[comSaldo.length - 1].saldo_apos : 0
  let saldoInicial = 0
  let ent = 0, entV = 0, baixa = 0, baixaV = 0, estorno = 0, estornoV = 0, ajuste = 0
  for (const m of comSaldo) {
    if (ini && m.data < ini) { saldoInicial = m.saldo_apos; continue }
    const v = valorDoMovimento(m) ?? 0
    if (m.tipo_movimentacao === 'entrada') { ent += num(m.quantidade); entV += v }
    else if (m.tipo_movimentacao === 'baixa') { baixa += num(m.quantidade); baixaV += v }
    else if (m.tipo_movimentacao === 'estorno') { estorno += num(m.quantidade); estornoV += v }
    else if (m.tipo_movimentacao === 'ajuste') ajuste += m.variacao
  }
  const consumo = Math.max(baixa - estorno, 0)
  const consumoV = Math.max(baixaV - estornoV, 0)
  const consumoDia = dias ? consumo / dias : null
  const custo = num(item.custo_unitario)
  const minimo = num(item.estoque_minimo)
  const ateHoje = !fim || fim >= hoje
  const lotes = lotesComSaldo(movs).map((l) => ({ lote: l.lote, validade: l.validade, saldo: arred(l.saldo, 3), ...situacaoValidade(l.validade, hoje) }))
  return {
    id: item.id,
    nome: item.nome_comercial,
    tipo: item.tipo,
    unidade: item.unidade,
    estoque_minimo: minimo,
    saldo_inicial: arred(saldoInicial, 3),
    entradas: arred(ent, 3),
    entradas_valor: arred(entV),
    baixas: arred(consumo, 3),
    baixas_valor: arred(consumoV),
    ajustes: arred(ajuste, 3),
    saldo_final: arred(saldoFinal, 3),
    custo_unitario: custo,
    valor_estoque: arred(Math.max(saldoFinal, 0) * custo),
    em_alerta: saldoFinal < 0 || (minimo > 0 && saldoFinal <= minimo),
    falta_para_minimo: minimo > 0 ? arred(Math.max(minimo - saldoFinal, 0), 3) : 0,
    consumo_medio_dia: consumoDia,
    cobertura_dias: consumoDia && consumoDia > 0 ? Math.max(saldoFinal, 0) / consumoDia : null,
    sem_custo: custo <= 0 && (saldoFinal > 0 || baixa > 0 || ent > 0),
    divergencia: ateHoje ? divergenciaDeSaldo(comSaldo, num(item.estoque_atual)) : null,
    curva: null,
    lotes,
  }
}

export function calcularResumoFarmacia(dados: DadosRelatorioFarmacia): ResumoFarmacia {
  const hoje = dados.hoje ?? new Date().toISOString().slice(0, 10)
  const dias = diasDoPeriodo(dados.data_inicio, dados.data_fim)
  const porItem = agruparMovimentos(dados)
  const itens = dados.itens.map((i) => resumirItem(i, porItem.get(i.id) ?? [], dados, hoje, dias))
  curvaAbc(itens)

  const porTipo = new Map<string, number>()
  for (const i of itens) porTipo.set(i.tipo || 'Outro', (porTipo.get(i.tipo || 'Outro') ?? 0) + i.valor_estoque)

  const origem = new Map<string, number>()
  for (const m of dados.movimentacoes) {
    if ((m.tipo_movimentacao !== 'baixa' && m.tipo_movimentacao !== 'estorno') || (dados.data_inicio && m.data < dados.data_inicio)) continue
    const rot = ROTULO_ORIGEM_AGG[m.origem ?? ''] ?? (m.origem || 'Não informada')
    // Estorno desconta da origem, como no consumo por item (baixas − estornos).
    const v = valorDoMovimento(m) ?? 0
    origem.set(rot, (origem.get(rot) ?? 0) + (m.tipo_movimentacao === 'estorno' ? -v : v))
  }
  const dist = (mapa: Map<string, number>): ItemDistribuicao[] =>
    [...mapa.entries()].map(([label, valor]) => ({ label, valor: arred(valor) })).filter((d) => d.valor > 0).sort((a, b) => b.valor - a.valor)

  const validade = itens
    .flatMap((i) => i.lotes.filter((l) => l.situacao === 'vencido' || l.situacao === 'vence_em_breve').map((l) => ({ ...l, item: i.nome, unidade: i.unidade })))
    .sort((a, b) => (a.dias ?? 0) - (b.dias ?? 0))

  return {
    tem_periodo: dias != null,
    dias_periodo: dias,
    total_itens: itens.length,
    valor_total: arred(itens.reduce((s, i) => s + i.valor_estoque, 0)),
    em_alerta: itens.filter((i) => i.em_alerta).length,
    a_repor: itens.filter((i) => i.falta_para_minimo > 0).length,
    sem_custo: itens.filter((i) => i.sem_custo).length,
    divergencias: itens.filter((i) => i.divergencia != null).length,
    valor_entradas: arred(itens.reduce((s, i) => s + i.entradas_valor, 0)),
    valor_baixas: arred(itens.reduce((s, i) => s + i.baixas_valor, 0)),
    lotes_vencidos: validade.filter((l) => l.situacao === 'vencido').length,
    lotes_a_vencer: validade.filter((l) => l.situacao === 'vence_em_breve').length,
    dias_alerta_validade: DIAS_ALERTA_VALIDADE,
    itens,
    por_tipo: dist(porTipo),
    baixas_por_origem: dist(origem),
    itens_repor: itens.filter((i) => i.falta_para_minimo > 0 || i.saldo_final < 0).sort((a, b) => b.falta_para_minimo - a.falta_para_minimo).slice(0, 10),
    validade: validade.slice(0, 10),
    maiores_consumos: [...itens].filter((i) => i.baixas_valor > 0).sort((a, b) => b.baixas_valor - a.baixas_valor).slice(0, 10),
  }
}

// Extrato do período (mais recente primeiro), com saldo após cada lançamento.
export function extratoFarmacia(dados: DadosRelatorioFarmacia): LinhaExtratoFarmacia[] {
  const porItem = agruparMovimentos(dados)
  const linhas: LinhaExtratoFarmacia[] = []
  for (const item of dados.itens) {
    for (const m of movimentosComSaldo(porItem.get(item.id) ?? [])) {
      if (dados.data_inicio && m.data < dados.data_inicio) continue
      linhas.push({ ...m, item: item.nome_comercial, unidade_item: item.unidade, valor: valorDoMovimento(m) })
    }
  }
  return linhas.sort((a, b) => b.data.localeCompare(a.data) || b.created_at.localeCompare(a.created_at))
}

export function formatarDecimal(v: number | null | undefined, casas = 1): string {
  return v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

export function formatarMoeda(v: number | null | undefined): string {
  return v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
