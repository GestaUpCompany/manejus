import { supabase } from '@gestaup/supabase'
import { toFarmDateOnly } from '@gestaup/shared'

/**
 * Auditoria produção × consumo da suplementação a pasto, em um dia ou intervalo.
 * kg_cocho é tratado como consumo real (estimado). Desvio = produzido − consumido.
 */

export interface ConsumoForm { formulacao_id: string | null; formulacao: string | null; kg_cocho: number | null; escopo: string | null; dia?: string | null }
export interface ProducaoForm { id: string; formulacao_id: string | null; dieta_produzida: string | null; total_produzido: number | null; destino_producao?: string | null; dia?: string | null }
export interface ItemProducao { saida_id: string; insumo_id: string; quantidade: number | null }
export interface ComposicaoItem { formulacao_id: string; insumo_id: string; mn_percent: number }

export interface DadosAuditoria {
  consumo: ConsumoForm[]
  producao: ProducaoForm[]
  itens: ItemProducao[]
  composicao: ComposicaoItem[]
  nomesFormulacao: Record<string, string>
  nomesInsumo: Record<string, string>
}

export interface LinhaFormulacao {
  formulacao: string
  destinos: string
  produzidoKg: number
  consumidoKg: number
  consumidoCreepKg: number
  desvioKg: number
  desvioPercent: number | null
}

export interface LinhaDestino { formulacao: string; destino: string; produzidoKg: number }

export interface LinhaInsumo {
  insumo: string
  usadoProducaoKg: number
  consumoEstimadoKg: number
  desvioKg: number
  desvioPercent: number | null
}

export interface Auditoria {
  formulacoes: LinhaFormulacao[]
  destinos: LinhaDestino[]
  insumos: LinhaInsumo[]
}

const SEM_DESTINO = 'Sem destino'
const r2 = (n: number) => Math.round(n * 100) / 100
const pct = (desvio: number, base: number) => (base > 0 ? r2((desvio / base) * 100) : null)
const cmp = (a: string, b: string) => a.localeCompare(b, 'pt-BR')

/** Função pura: cruza produção e consumo. Desvio positivo = produzido e não consumido. */
export function montarAuditoria(d: DadosAuditoria): Auditoria {
  const chave = (id: string | null, nome: string | null) => id ?? `nome:${nome ?? 'sem formulação'}`
  const nomeForm = (id: string | null, nome: string | null) => (id && d.nomesFormulacao[id]) || nome || 'Sem formulação'

  const porForm = new Map<string, { nome: string; id: string | null; prod: number; cons: number; creep: number; destinos: Map<string, number> }>()
  const obter = (id: string | null, nome: string | null) => {
    const k = chave(id, nome)
    if (!porForm.has(k)) porForm.set(k, { nome: nomeForm(id, nome), id, prod: 0, cons: 0, creep: 0, destinos: new Map() })
    return porForm.get(k)!
  }

  for (const p of d.producao) {
    const o = obter(p.formulacao_id, p.dieta_produzida)
    const kg = Number(p.total_produzido) || 0
    const destino = p.destino_producao?.trim() || SEM_DESTINO
    o.prod += kg
    o.destinos.set(destino, (o.destinos.get(destino) || 0) + kg)
  }
  for (const c of d.consumo) {
    const o = obter(c.formulacao_id, c.formulacao)
    const kg = Number(c.kg_cocho) || 0
    if (c.escopo === 'creep') o.creep += kg
    o.cons += kg
  }

  const lista = [...porForm.values()].sort((a, b) => cmp(a.nome, b.nome))

  const formulacoes: LinhaFormulacao[] = lista.map((o) => {
    const desvio = o.prod - o.cons
    const destinos = [...o.destinos.entries()].sort((a, b) => cmp(a[0], b[0])).map(([n, kg]) => `${n} (${r2(kg)} kg)`).join('; ')
    return { formulacao: o.nome, destinos, produzidoKg: r2(o.prod), consumidoKg: r2(o.cons), consumidoCreepKg: r2(o.creep), desvioKg: r2(desvio), desvioPercent: pct(desvio, o.prod) }
  })

  const destinos: LinhaDestino[] = lista.flatMap((o) =>
    [...o.destinos.entries()].sort((a, b) => cmp(a[0], b[0])).map(([destino, kg]) => ({ formulacao: o.nome, destino, produzidoKg: r2(kg) })),
  )

  // Insumos: usado na produção (itens) × consumo implícito (consumo da formulação × % MN da composição).
  const usado = new Map<string, number>()
  for (const i of d.itens) usado.set(i.insumo_id, (usado.get(i.insumo_id) || 0) + (Number(i.quantidade) || 0))

  const implicito = new Map<string, number>()
  for (const o of porForm.values()) {
    if (!o.id || o.cons <= 0) continue
    for (const comp of d.composicao.filter((c) => c.formulacao_id === o.id)) {
      implicito.set(comp.insumo_id, (implicito.get(comp.insumo_id) || 0) + o.cons * (comp.mn_percent / 100))
    }
  }

  const insumos: LinhaInsumo[] = [...new Set([...usado.keys(), ...implicito.keys()])]
    .map((id) => {
      const u = usado.get(id) || 0
      const c = implicito.get(id) || 0
      return { insumo: d.nomesInsumo[id] || id, usadoProducaoKg: r2(u), consumoEstimadoKg: r2(c), desvioKg: r2(u - c), desvioPercent: pct(u - c, u) }
    })
    .sort((a, b) => cmp(a.insumo, b.insumo))

  return { formulacoes, destinos, insumos }
}

/** Converte formula_teor_ms em % de matéria natural por formulação (mesma regra da tela de Suplementação). */
export function composicaoMN(
  rows: { formulacao_id: string; insumo_id: string; formula_teor_ms: number | null; teor_ms: number | null }[],
): ComposicaoItem[] {
  const porForm = new Map<string, { insumo_id: string; bruta: number }[]>()
  for (const r of rows) {
    const teor = Number(r.teor_ms) || 0
    const bruta = teor > 0 ? (Number(r.formula_teor_ms) || 0) / (teor / 100) : 0
    if (!porForm.has(r.formulacao_id)) porForm.set(r.formulacao_id, [])
    porForm.get(r.formulacao_id)!.push({ insumo_id: r.insumo_id, bruta })
  }
  const out: ComposicaoItem[] = []
  for (const [formulacao_id, itens] of porForm) {
    const total = itens.reduce((s, i) => s + i.bruta, 0)
    if (total <= 0) continue
    for (const i of itens) out.push({ formulacao_id, insumo_id: i.insumo_id, mn_percent: (i.bruta / total) * 100 })
  }
  return out
}

/** Dia seguinte (YYYY-MM-DD), em calendário puro. */
export function diaSeguinte(dia: string): string {
  const d = new Date(`${dia}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** Limite do intervalo: o PostgREST devolve no máximo 1000 linhas por consulta, e o consumo tem várias por dia. */
export const MAX_DIAS_AUDITORIA = 62

/** Nº de dias do intervalo, inclusive. */
export function diasNoIntervalo(inicio: string, fim: string): number {
  return Math.round((new Date(`${fim}T00:00:00Z`).getTime() - new Date(`${inicio}T00:00:00Z`).getTime()) / 86400000) + 1
}

// registros_suplementacao.data e registros_saida_insumos.data_producao são timestamptz; o dia da fazenda é o de Cuiabá (UTC−4, sem horário de verão).
const OFFSET_FAZENDA = '-04:00'

export async function buscarDadosAuditoria(fazendaId: string, inicio: string, fim: string): Promise<DadosAuditoria> {
  const [consumoRes, producaoRes] = await Promise.all([
    supabase
      .from('registros_suplementacao')
      .select('formulacao_id, formulacao, kg_cocho, escopo, data')
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)
      .gte('data', `${inicio}T00:00:00${OFFSET_FAZENDA}`)
      .lt('data', `${diaSeguinte(fim)}T00:00:00${OFFSET_FAZENDA}`),
    supabase
      .from('registros_saida_insumos')
      .select('id, formulacao_id, dieta_produzida, total_produzido, destino_producao, data_producao')
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)
      .gte('data_producao', `${inicio}T00:00:00${OFFSET_FAZENDA}`)
      .lt('data_producao', `${diaSeguinte(fim)}T00:00:00${OFFSET_FAZENDA}`),
  ])
  if (consumoRes.error) throw consumoRes.error
  if (producaoRes.error) throw producaoRes.error

  const consumo = ((consumoRes.data || []) as (ConsumoForm & { data: string })[]).map((c) => ({ ...c, dia: toFarmDateOnly(c.data) }))
  const producao = ((producaoRes.data || []) as (ProducaoForm & { data_producao: string })[]).map((p) => ({ ...p, dia: toFarmDateOnly(p.data_producao) }))

  const saidaIds = producao.map((p) => p.id)
  const formIds = [...new Set([...consumo, ...producao].map((r) => r.formulacao_id).filter((x): x is string => !!x))]

  // Lotes de 100 ids por requisição: listas longas estouram o tamanho da URL do PostgREST.
  const buscarItens = async () => {
    const out: ItemProducao[] = []
    for (let i = 0; i < saidaIds.length; i += 100) {
      const { data, error } = await supabase.from('saida_insumos_itens').select('saida_id, insumo_id, quantidade').in('saida_id', saidaIds.slice(i, i + 100))
      if (error) return { data: null, error }
      out.push(...((data || []) as ItemProducao[]))
    }
    return { data: out, error: null }
  }

  const [itensRes, compRes, formRes] = await Promise.all([
    saidaIds.length ? buscarItens() : Promise.resolve({ data: [], error: null }),
    formIds.length
      ? supabase.from('formulacao_insumos').select('formulacao_id, insumo_id, formula_teor_ms, insumos!inner(teor_ms)').in('formulacao_id', formIds)
      : Promise.resolve({ data: [], error: null }),
    formIds.length ? supabase.from('formulacoes').select('id, nome').in('id', formIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (itensRes.error) throw itensRes.error
  if (compRes.error) throw compRes.error
  if (formRes.error) throw formRes.error

  const itens = (itensRes.data || []) as ItemProducao[]
  const compRows = ((compRes.data || []) as unknown as {
    formulacao_id: string; insumo_id: string; formula_teor_ms: number | null; insumos: { teor_ms: number | null }
  }[]).map((r) => ({ formulacao_id: r.formulacao_id, insumo_id: r.insumo_id, formula_teor_ms: r.formula_teor_ms, teor_ms: r.insumos?.teor_ms ?? null }))
  const composicao = composicaoMN(compRows)

  const insumoIds = [...new Set([...itens.map((i) => i.insumo_id), ...composicao.map((c) => c.insumo_id)])]
  const insRes = insumoIds.length ? await supabase.from('insumos').select('id, nome').in('id', insumoIds) : { data: [], error: null }
  if (insRes.error) throw insRes.error

  return {
    consumo,
    producao,
    itens,
    composicao,
    nomesFormulacao: Object.fromEntries(((formRes.data || []) as { id: string; nome: string }[]).map((f) => [f.id, f.nome])),
    nomesInsumo: Object.fromEntries(((insRes.data || []) as { id: string; nome: string }[]).map((i) => [i.id, i.nome])),
  }
}

const ddmmaaaa = (dia: string) => dia.split('-').reverse().join('-')

export async function exportarAuditoriaProducaoConsumo(
  fazendaId: string,
  inicio: string,
  fim: string,
  fazendaNome?: string | null,
): Promise<void> {
  const { formulacoes, destinos, insumos } = montarAuditoria(await buscarDadosAuditoria(fazendaId, inicio, fim))
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const periodo = inicio === fim ? ddmmaaaa(inicio) : `${ddmmaaaa(inicio)} a ${ddmmaaaa(fim)}`

  const aba = (nome: string, cabecalho: string[], linhas: (string | number | null)[][], larguras: number[] = []) => {
    const ws = wb.addWorksheet(nome, { views: [{ state: 'frozen', ySplit: 1 }] })
    const cab = ws.addRow(cabecalho)
    cab.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cab.alignment = { vertical: 'middle', wrapText: true }
    cab.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14532D' } } })
    linhas.forEach((l) => ws.addRow(l))
    ws.columns.forEach((c, i) => { c.width = larguras[i] ?? (i === 0 ? 30 : 20) })
    const colDesvio = cabecalho.findIndex((h) => h.startsWith('Desvio (kg')) + 1
    if (colDesvio > 0) {
      ws.eachRow((row, n) => {
        if (n === 1) return
        const cell = row.getCell(colDesvio)
        const v = Number(cell.value) || 0
        if (v !== 0) cell.font = { bold: true, color: { argb: v > 0 ? 'FFB45309' : 'FFB91C1C' } }
      })
    }
  }

  aba('Por formulação',
    ['Formulação', 'Destino da produção', 'Produzido (kg)', 'Consumo estimado (kg)', 'Dos quais creep (kg)', 'Desvio (kg) produzido − consumido', 'Desvio (% do produzido)'],
    formulacoes.map((l) => [l.formulacao, l.destinos, l.produzidoKg, l.consumidoKg, l.consumidoCreepKg, l.desvioKg, l.desvioPercent]),
    [30, 36, 18, 20, 18, 22, 18])
  aba('Produção por destino',
    ['Formulação', 'Destino', 'Produzido (kg)'],
    destinos.map((l) => [l.formulacao, l.destino, l.produzidoKg]))
  aba('Por insumo',
    ['Insumo', 'Usado na produção (kg)', 'Consumo estimado (kg)', 'Desvio (kg) usado − consumido', 'Desvio (% do usado)'],
    insumos.map((l) => [l.insumo, l.usadoProducaoKg, l.consumoEstimadoKg, l.desvioKg, l.desvioPercent]))

  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `Auditoria produção x consumo${fazendaNome ? ` - ${fazendaNome}` : ''} - ${periodo}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
