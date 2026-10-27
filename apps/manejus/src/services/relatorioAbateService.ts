import ExcelJS from 'exceljs'
import { supabase } from '@gestaup/supabase'
import { getDayBoundsInTimezone, toFarmDateOnly } from '@gestaup/shared'
import {
  montarLoteAbate,
  resumirLotes,
  tipoSaida,
  type CicloVidaRpc,
  type ConsumoConfinamentoDia,
  type DietaVersao,
  type ExtrasLote,
  type LocalBruto,
  type LoteAbate,
  type PesagemDia,
  type ResumoAbate,
  type SaidaLote,
  type TipoSaida,
} from '../features/relatorioAbate/agregacao'

export interface FiltroSaidas {
  tipos: TipoSaida[]
  inicio?: string
  fim?: string
}

export interface LoteElegivel {
  loteId: string
  nome: string
  ativo: boolean
  cabecasAbate: number
  cabecasVenda: number
  ultimaSaida: string
  criadoEm: string | null
  sistemaProducao: string | null
  pesoEntradaKg: number | null
}

export interface DadosRelatorioAbate {
  fazendaNome: string
  geradoEm: string
  periodo: { inicio: string; fim: string } | null
  tipos: TipoSaida[]
  resumo: ResumoAbate
  lotes: LoteAbate[]
  falhas: Array<{ nome: string; motivo: string }>
}

interface MovimentacaoRow {
  lote_origem_id: string | null
  data: string
  motivo_movimentacao: string
  subtipo: string | null
  numero_cabecas: number | null
  categoria: string | null
}

type Pagina<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

const PAGINA = 1000
const CHUNK_IDS = 100
const CONCORRENCIA = 3
const SECOES_CICLO_VIDA = [
  'cadastro',
  'estado_atual',
  'cronologia_categorias',
  'historico_nutricional',
  'linha_tempo_ocupacao',
  'movimentacoes',
  'mortalidade',
  'consumo_suplementacao',
  'indicadores_consolidados',
]

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

async function lerTudo<T>(pagina: (de: number, ate: number) => Pagina<T>): Promise<T[]> {
  const todas: T[] = []
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await pagina(de, de + PAGINA - 1)
    if (error) throw new Error(error.message)
    const linhas = data ?? []
    todas.push(...linhas)
    if (linhas.length < PAGINA) break
  }
  return todas
}

function condicaoTipos(tipos: TipoSaida[]): string {
  const c: string[] = []
  if (tipos.includes('Abate')) c.push('motivo_movimentacao.eq.Abate')
  if (tipos.includes('Venda')) c.push('and(motivo_movimentacao.eq.Saída,subtipo.eq.Venda)')
  return c.join(',')
}

// Abate = motivo 'Abate'; Venda = motivo 'Saída' com subtipo 'Venda'. Ambos saem do lote de origem.
async function consultarSaidas(fazendaId: string, filtro: FiltroSaidas, loteIds?: string[]): Promise<SaidaLote[]> {
  const condicao = condicaoTipos(filtro.tipos)
  if (!condicao) return []
  const linhas = await lerTudo<MovimentacaoRow>((de, ate) => {
    let q = supabase
      .from('registros_movimentacao')
      .select('lote_origem_id, data, motivo_movimentacao, subtipo, numero_cabecas, categoria')
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)
      .not('lote_origem_id', 'is', null)
      .or(condicao)
      .order('data', { ascending: true })
      .order('id', { ascending: true })
    if (filtro.inicio) q = q.gte('data', getDayBoundsInTimezone(filtro.inicio).start)
    if (filtro.fim) q = q.lt('data', getDayBoundsInTimezone(filtro.fim).end)
    if (loteIds) q = q.in('lote_origem_id', loteIds)
    return q.range(de, ate) as unknown as Pagina<MovimentacaoRow>
  })
  return linhas.flatMap((r) => {
    const tipo = tipoSaida(r.motivo_movimentacao, r.subtipo)
    const data = toFarmDateOnly(r.data)
    if (!tipo || !data || !r.lote_origem_id) return []
    return [{ loteId: r.lote_origem_id, data, tipo, cabecas: r.numero_cabecas ?? 0, categoria: r.categoria }]
  })
}

export async function listarLotesComSaida(fazendaId: string, filtro: FiltroSaidas): Promise<LoteElegivel[]> {
  const saidas = await consultarSaidas(fazendaId, filtro)
  const ids = [...new Set(saidas.map((s) => s.loteId))]
  const lotes = new Map<string, Pick<LoteElegivel, 'nome' | 'ativo' | 'criadoEm' | 'sistemaProducao' | 'pesoEntradaKg'>>()
  for (let i = 0; i < ids.length; i += CHUNK_IDS) {
    const { data, error } = await supabase
      .from('lotes')
      .select('id, nome, ativo, created_at, sistema_producao, peso_entrada_kg_cab')
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)
      .in('id', ids.slice(i, i + CHUNK_IDS))
    if (error) throw error
    for (const l of data ?? []) {
      lotes.set(l.id, {
        nome: l.nome,
        ativo: l.ativo !== false,
        criadoEm: toFarmDateOnly(l.created_at),
        sistemaProducao: l.sistema_producao ?? null,
        pesoEntradaKg: num(l.peso_entrada_kg_cab),
      })
    }
  }
  const porLote = new Map<string, LoteElegivel>()
  for (const s of saidas) {
    const lote = lotes.get(s.loteId)
    if (!lote) continue
    const atual = porLote.get(s.loteId) ?? { loteId: s.loteId, ...lote, cabecasAbate: 0, cabecasVenda: 0, ultimaSaida: s.data }
    if (s.tipo === 'Abate') atual.cabecasAbate += s.cabecas
    else atual.cabecasVenda += s.cabecas
    if (s.data > atual.ultimaSaida) atual.ultimaSaida = s.data
    porLote.set(s.loteId, atual)
  }
  return [...porLote.values()].sort((a, b) => b.ultimaSaida.localeCompare(a.ultimaSaida) || a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }))
}

// --- Históricos que a RPC do ciclo de vida não traz ---

// Pesagens do lote: uma linha por animal pesado; aqui viram a média por dia e categoria
async function carregarPesagens(fazendaId: string, loteId: string): Promise<PesagemDia[]> {
  type Linha = { data: string; categoria: string | null; peso_kg: number | string | null }
  const linhas = await lerTudo<Linha>(
    (de, ate) =>
      supabase
        .from('registros_pesagem')
        .select('data, categoria, peso_kg')
        .eq('fazenda_id', fazendaId)
        .eq('lote_id', loteId)
        .is('deleted_at', null)
        .not('peso_kg', 'is', null)
        .order('data', { ascending: true })
        .order('id', { ascending: true })
        .range(de, ate) as unknown as Pagina<Linha>,
  )
  const grupos = new Map<string, { data: string; categoria: string | null; soma: number; animais: number }>()
  for (const l of linhas) {
    const peso = num(l.peso_kg)
    const data = toFarmDateOnly(l.data)
    if (peso == null || peso <= 0 || !data) continue
    const chave = `${data}|${(l.categoria ?? '').trim().toLowerCase()}`
    const g = grupos.get(chave) ?? { data, categoria: l.categoria, soma: 0, animais: 0 }
    g.soma += peso
    g.animais += 1
    grupos.set(chave, g)
  }
  return [...grupos.values()].map((g) => ({ data: g.data, categoria: g.categoria, pesoMedioKg: g.soma / g.animais, animais: g.animais }))
}

// Currais e módulos pelos quais o lote passou (os pastos já vêm na RPC)
async function carregarLocais(fazendaId: string, loteId: string): Promise<LocalBruto[]> {
  const [currais, modulos] = await Promise.all([
    supabase
      .from('lote_curral_historico')
      .select('curral_id, data_hora_entrada, data_hora_saida, data_inicial, data_final, cabecas_entrada, cabecas_saida, peso_vivo_medio_entrada_kg, peso_vivo_medio_saida_kg')
      .eq('fazenda_id', fazendaId)
      .eq('lote_id', loteId),
    supabase
      .from('lote_modulo_historico')
      .select('modulo_id, data_hora_entrada, data_hora_saida, cabecas_entrada, cabecas_saida, peso_vivo_medio_entrada_kg, peso_vivo_medio_saida_kg')
      .eq('lote_id', loteId),
  ])
  if (currais.error) throw currais.error
  if (modulos.error) throw modulos.error

  const idsCurral = [...new Set((currais.data ?? []).map((c) => c.curral_id).filter((id): id is string => !!id))]
  const idsModulo = [...new Set((modulos.data ?? []).map((m) => m.modulo_id).filter((id): id is string => !!id))]
  const [nomesCurral, nomesModulo] = await Promise.all([
    idsCurral.length ? supabase.from('currais').select('id, nome').eq('fazenda_id', fazendaId).in('id', idsCurral) : Promise.resolve({ data: [], error: null }),
    idsModulo.length ? supabase.from('modulos_pastos').select('id, nome').eq('fazenda_id', fazendaId).in('id', idsModulo) : Promise.resolve({ data: [], error: null }),
  ])
  if (nomesCurral.error) throw nomesCurral.error
  if (nomesModulo.error) throw nomesModulo.error
  const nomeCurral = new Map((nomesCurral.data ?? []).map((c) => [c.id, c.nome]))
  const nomeModulo = new Map((nomesModulo.data ?? []).map((m) => [m.id, m.nome]))

  const locais: LocalBruto[] = []
  for (const c of currais.data ?? []) {
    const entrada = toFarmDateOnly(c.data_hora_entrada) ?? c.data_inicial
    if (!entrada) continue
    locais.push({
      tipo: 'Curral',
      local: nomeCurral.get(c.curral_id) ?? 'Curral removido',
      entrada,
      saida: toFarmDateOnly(c.data_hora_saida) ?? c.data_final ?? null,
      cabecasEntrada: c.cabecas_entrada,
      cabecasSaida: c.cabecas_saida,
      pesoEntradaKg: num(c.peso_vivo_medio_entrada_kg),
      pesoSaidaKg: num(c.peso_vivo_medio_saida_kg),
    })
  }
  for (const m of modulos.data ?? []) {
    const entrada = toFarmDateOnly(m.data_hora_entrada)
    if (!entrada) continue
    locais.push({
      tipo: 'Módulo',
      local: nomeModulo.get(m.modulo_id) ?? 'Módulo removido',
      entrada,
      saida: toFarmDateOnly(m.data_hora_saida),
      cabecasEntrada: m.cabecas_entrada,
      cabecasSaida: m.cabecas_saida,
      pesoEntradaKg: num(m.peso_vivo_medio_entrada_kg),
      pesoSaidaKg: num(m.peso_vivo_medio_saida_kg),
    })
  }
  return locais
}

const ROTULO_ORIGEM_DIETA: Record<string, string> = {
  edicao_dieta: 'Edição da dieta',
  alteracao_insumo: 'Alteração de insumo',
  backfill: 'Registro inicial',
}

// Versões da dieta vigentes em cada intervalo do lote (mesma fonte da tela Histórico de Dietas)
async function carregarVersoesDieta(fazendaId: string, loteId: string): Promise<DietaVersao[]> {
  const { data, error } = await supabase.rpc('linha_nutricional_lote', { p_fazenda_id: fazendaId, p_lote_id: loteId })
  if (error) throw error
  type Segmento = {
    plano_nome: string
    versao: number
    segmento_inicio: string
    segmento_fim: string | null
    origem: string
    motivo: string | null
    dados: Record<string, unknown> | null
    composicao: Array<{ nome: string }> | null
  }
  return ((data ?? []) as unknown as Segmento[]).flatMap((s): DietaVersao[] => {
    const inicio = toFarmDateOnly(s.segmento_inicio)
    if (!inicio) return []
    return [
      {
        dieta: typeof s.dados?.nome === 'string' ? s.dados.nome : s.plano_nome,
        versao: s.versao,
        inicio,
        fim: toFarmDateOnly(s.segmento_fim),
        origem: ROTULO_ORIGEM_DIETA[s.origem] ?? s.origem,
        motivo: s.motivo,
        insumos: (s.composicao ?? []).map((i) => i.nome),
      },
    ]
  })
}

// Consumo diário do confinamento (lotes a pasto não têm: o consumo deles vem da suplementação na RPC)
async function carregarConsumoConfinamento(fazendaId: string, loteId: string): Promise<ConsumoConfinamentoDia[]> {
  type Linha = {
    data: string
    kg_ofertado_mn: number | string | null
    kg_consumido_mn: number | string | null
    kg_ms_cab_dia: number | string | null
    consumo_percent_pv: number | string | null
    custo_reais_cab_dia: number | string | null
    dia_incompleto: boolean | null
  }
  const linhas = await lerTudo<Linha>(
    (de, ate) =>
      supabase
        .from('consumo_confinamento_dia')
        .select('data, kg_ofertado_mn, kg_consumido_mn, kg_ms_cab_dia, consumo_percent_pv, custo_reais_cab_dia, dia_incompleto')
        .eq('fazenda_id', fazendaId)
        .eq('lote_id', loteId)
        .order('data', { ascending: true })
        .range(de, ate) as unknown as Pagina<Linha>,
  )
  return linhas.map((l) => ({
    data: l.data,
    kgOfertadoMn: num(l.kg_ofertado_mn),
    kgConsumidoMn: num(l.kg_consumido_mn),
    kgMsCabDia: num(l.kg_ms_cab_dia),
    percentPv: num(l.consumo_percent_pv),
    custoCabDia: num(l.custo_reais_cab_dia),
    diaIncompleto: l.dia_incompleto === true,
  }))
}

// Falha numa fonte extra não derruba o relatório: o lote sai sem aquela seção e com um aviso
async function opcional<T>(fonte: string, avisos: string[], vazio: T, carregar: () => Promise<T>): Promise<T> {
  try {
    return await carregar()
  } catch (err) {
    console.error(`[Relatório de Abate] ${fonte}:`, err)
    avisos.push(`${fonte} não puderam ser carregados; esta parte do histórico pode estar incompleta.`)
    return vazio
  }
}

async function emLotes<T, R>(itens: T[], tamanho: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < itens.length; i += tamanho) {
    out.push(...(await Promise.all(itens.slice(i, i + tamanho).map(fn))))
  }
  return out
}

export async function carregarRelatorioAbate(
  fazendaId: string,
  fazendaNome: string,
  lotes: LoteElegivel[],
  filtro: FiltroSaidas,
): Promise<DadosRelatorioAbate> {
  const hoje = toFarmDateOnly(new Date().toISOString()) ?? new Date().toISOString().slice(0, 10)
  // Histórico completo: todas as saídas Abate/Venda do lote, não só as do período filtrado
  const saidas = await consultarSaidas(fazendaId, { tipos: ['Abate', 'Venda'] }, lotes.map((l) => l.loteId))
  const saidasPorLote = new Map<string, SaidaLote[]>()
  for (const s of saidas) saidasPorLote.set(s.loteId, [...(saidasPorLote.get(s.loteId) ?? []), s])

  const falhas: DadosRelatorioAbate['falhas'] = []
  const montados = await emLotes(lotes, CONCORRENCIA, async (lote) => {
    const avisos: string[] = []
    const [rpc, pesagens, locais, versoesDieta, consumoConfinamento] = await Promise.all([
      supabase.rpc('get_relatorio_lote_ciclo_vida', { p_fazenda_id: fazendaId, p_lote_id: lote.loteId, p_secoes: SECOES_CICLO_VIDA }),
      opcional('Pesagens', avisos, [] as PesagemDia[], () => carregarPesagens(fazendaId, lote.loteId)),
      opcional('Currais e módulos', avisos, [] as LocalBruto[], () => carregarLocais(fazendaId, lote.loteId)),
      opcional('Versões da dieta', avisos, [] as DietaVersao[], () => carregarVersoesDieta(fazendaId, lote.loteId)),
      opcional('Consumo do confinamento', avisos, [] as ConsumoConfinamentoDia[], () => carregarConsumoConfinamento(fazendaId, lote.loteId)),
    ])
    const ciclo = rpc.data as unknown as CicloVidaRpc | null
    if (rpc.error || !ciclo || ciclo.success === false) {
      falhas.push({ nome: lote.nome, motivo: rpc.error?.message ?? ciclo?.error ?? 'Sem retorno do banco' })
      return null
    }
    // A RPC devolve `cadastro` vazio para lote sem pasto (todo lote desativado é desvinculado): a tabela lotes é a fonte
    const cicloCompleto: CicloVidaRpc = {
      ...ciclo,
      cadastro: {
        ...ciclo.cadastro,
        nome: lote.nome,
        ativo: lote.ativo,
        created_at: lote.criadoEm ?? ciclo.cadastro?.created_at,
        sistema_producao: lote.sistemaProducao ?? ciclo.cadastro?.sistema_producao,
      },
      indicadores_consolidados: {
        ...ciclo.indicadores_consolidados,
        peso_entrada_medio_kg: ciclo.indicadores_consolidados?.peso_entrada_medio_kg ?? lote.pesoEntradaKg,
      },
    }
    const extras: ExtrasLote = { pesagens, locais, versoesDieta, consumoConfinamento, avisos }
    return montarLoteAbate(lote.loteId, cicloCompleto, saidasPorLote.get(lote.loteId) ?? [], hoje, extras)
  })
  const lotesAbate = montados
    .filter((l): l is LoteAbate => l !== null)
    .sort((a, b) => (b.ultimaSaida ?? '').localeCompare(a.ultimaSaida ?? '') || a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }))

  return {
    fazendaNome,
    geradoEm: hoje,
    periodo: filtro.inicio && filtro.fim ? { inicio: filtro.inicio, fim: filtro.fim } : null,
    tipos: filtro.tipos,
    resumo: resumirLotes(lotesAbate),
    lotes: lotesAbate,
    falhas,
  }
}

// --- Excel ---

const dataExcel = (iso: string | null): Date | null => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`) : null)

function estiloCabecalho(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14532D' } }
  })
  row.height = 30
}

function abaComCabecalho(wb: ExcelJS.Workbook, nome: string, colunas: Array<{ header: string; width: number; fmt?: string }>) {
  const ws = wb.addWorksheet(nome, { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = colunas.map((c) => ({ width: c.width }))
  const cab = ws.addRow(colunas.map((c) => c.header))
  estiloCabecalho(cab)
  colunas.forEach((c, i) => {
    if (c.fmt) ws.getColumn(i + 1).numFmt = c.fmt
  })
  return ws
}

const FMT_DATA = 'dd/mm/yyyy'
const FMT_KG = '#,##0.0'
const FMT_GMD = '0.000'
const FMT_BRL = '"R$" #,##0.00'
const FMT_PCT = '0.00'

export async function gerarExcelAbate(dados: DadosRelatorioAbate): Promise<Blob> {
  const wb = new ExcelJS.Workbook()

  const resumo = abaComCabecalho(wb, 'Resumo', [
    { header: 'Lote', width: 28 },
    { header: 'Situação', width: 12 },
    { header: 'Início', width: 12, fmt: FMT_DATA },
    { header: 'Última saída', width: 13, fmt: FMT_DATA },
    { header: 'Ciclo (dias)', width: 11 },
    { header: 'Cab. abatidas', width: 12 },
    { header: 'Cab. vendidas', width: 12 },
    { header: 'Peso entrada (kg/cab)', width: 14, fmt: FMT_KG },
    { header: 'Último peso (kg/cab)', width: 14, fmt: FMT_KG },
    { header: 'Ganho (kg/cab)', width: 12, fmt: FMT_KG },
    { header: 'GMD (kg/dia)', width: 11, fmt: FMT_GMD },
    { header: 'Mortes', width: 9 },
    { header: 'Custo médio (R$/cab/dia)', width: 15, fmt: FMT_BRL },
  ])
  for (const l of dados.lotes) {
    const i = l.indicadores
    resumo.addRow([
      l.nome, l.ativo ? 'Ativo' : 'Desativado', dataExcel(l.inicio), dataExcel(l.ultimaSaida), i.diasCiclo,
      i.cabecasAbate, i.cabecasVenda, i.pesoEntradaKg, i.pesoFinalKg, i.ganhoKgCab, i.gmdKgDia, i.totalMortes, i.custoMedioCabDia,
    ])
  }

  const linha = abaComCabecalho(wb, 'Linha do tempo', [
    { header: 'Lote', width: 28 },
    { header: 'Data', width: 12, fmt: FMT_DATA },
    { header: 'Evento', width: 46 },
    { header: 'Detalhe', width: 44 },
  ])
  for (const l of dados.lotes) for (const e of l.eventos) linha.addRow([l.nome, dataExcel(e.data), e.titulo, e.detalhe])

  const cats = abaComCabecalho(wb, 'Categorias', [
    { header: 'Lote', width: 28 },
    { header: 'Categoria', width: 22 },
    { header: 'Início', width: 12, fmt: FMT_DATA },
    { header: 'Fim', width: 12, fmt: FMT_DATA },
    { header: 'Cabeças no início', width: 13 },
    { header: 'Cabeças no fim', width: 13 },
    { header: 'Peso entrada (kg/cab)', width: 14, fmt: FMT_KG },
    { header: 'Peso saída (kg/cab)', width: 14, fmt: FMT_KG },
    { header: 'GMD (kg/dia)', width: 11, fmt: FMT_GMD },
  ])
  for (const l of dados.lotes) {
    for (const c of l.categorias) {
      cats.addRow([l.nome, c.categoria, dataExcel(c.inicio), dataExcel(c.fim), c.cabecasInicio, c.cabecasFim, c.pesoEntradaKg, c.pesoSaidaKg, c.gmdKgDia])
    }
  }

  const peso = abaComCabecalho(wb, 'Peso e GMD', [
    { header: 'Lote', width: 28 },
    { header: 'Categoria', width: 22 },
    { header: 'Data', width: 12, fmt: FMT_DATA },
    { header: 'Origem', width: 12 },
    { header: 'Peso médio (kg/cab)', width: 14, fmt: FMT_KG },
    { header: 'Animais', width: 10 },
    { header: 'Dias desde o anterior', width: 12 },
    { header: 'GMD do período (kg/dia)', width: 14, fmt: FMT_GMD },
    { header: 'GMD acumulado (kg/dia)', width: 14, fmt: FMT_GMD },
  ])
  for (const l of dados.lotes) {
    for (const s of l.evolucaoPeso) {
      for (const p of s.pontos) peso.addRow([l.nome, p.categoria, dataExcel(p.data), p.origem, p.pesoKg, p.animais, p.dias, p.gmdPeriodo, p.gmdAcumulado])
    }
  }

  const ocup = abaComCabecalho(wb, 'Ocupação', [
    { header: 'Lote', width: 28 },
    { header: 'Tipo', width: 10 },
    { header: 'Local', width: 28 },
    { header: 'Entrada', width: 12, fmt: FMT_DATA },
    { header: 'Saída', width: 12, fmt: FMT_DATA },
    { header: 'Dias', width: 8 },
    { header: 'Cab. entrada', width: 12 },
    { header: 'Cab. saída', width: 12 },
    { header: 'Peso entrada (kg/cab)', width: 14, fmt: FMT_KG },
    { header: 'Peso saída (kg/cab)', width: 14, fmt: FMT_KG },
  ])
  for (const l of dados.lotes) {
    for (const o of l.ocupacao) {
      ocup.addRow([l.nome, o.tipo, o.local, dataExcel(o.entrada), dataExcel(o.saida), o.dias, o.cabecasEntrada, o.cabecasSaida, o.pesoEntradaKg, o.pesoSaidaKg])
    }
  }

  const dietas = abaComCabecalho(wb, 'Dietas', [
    { header: 'Lote', width: 28 },
    { header: 'Dieta', width: 30 },
    { header: 'Versão', width: 9 },
    { header: 'Vigente desde', width: 14, fmt: FMT_DATA },
    { header: 'Vigente até', width: 14, fmt: FMT_DATA },
    { header: 'Origem', width: 20 },
    { header: 'Motivo', width: 30 },
    { header: 'Insumos', width: 60 },
  ])
  for (const l of dados.lotes) {
    for (const v of l.versoesDieta) dietas.addRow([l.nome, v.dieta, v.versao, dataExcel(v.inicio), dataExcel(v.fim), v.origem, v.motivo ?? '', v.insumos.join(', ')])
    // Sem versões gravadas, o plano nutricional do lote é o que existe
    if (l.versoesDieta.length === 0) for (const d of l.dietas) dietas.addRow([l.nome, d.nome, null, dataExcel(d.inicio), dataExcel(d.fim), 'Plano nutricional', '', ''])
  }

  const consumo = abaComCabecalho(wb, 'Consumo', [
    { header: 'Lote', width: 28 },
    { header: 'Mês', width: 10 },
    { header: 'Origem', width: 14 },
    { header: 'Registros', width: 10 },
    { header: 'Consumo (% PV)', width: 13, fmt: FMT_PCT },
    { header: 'Consumo (kg MS/cab)', width: 14, fmt: FMT_PCT },
    { header: 'Custo (R$/cab/dia)', width: 14, fmt: FMT_BRL },
    { header: 'Ofertado (kg MN)', width: 14, fmt: '#,##0' },
    { header: 'Consumido (kg MN)', width: 14, fmt: '#,##0' },
  ])
  for (const l of dados.lotes) {
    for (const c of l.consumo) {
      consumo.addRow([l.nome, `${c.mes.slice(5, 7)}/${c.mes.slice(0, 4)}`, c.origem, c.registros, c.percentPv, c.kgMs, c.custoCabDia, c.kgOfertadoMn, c.kgConsumidoMn])
    }
  }

  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
