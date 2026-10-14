import ExcelJS from 'exceljs'
import { supabase } from '@gestaup/supabase'
import {
  montarLinha,
  montarLinhaGeral,
  type CategoriaZootecnica,
  type LinhaZootecnica,
  type SerieConsumoDia,
} from '../features/relatorioZootecnico/agregacao'
import { colunasZootecnicas, FORMATO_EXCEL, type TipoColuna } from '../features/relatorioZootecnico/colunas'

export interface DadosRelatorioZootecnico {
  fazendaNome: string
  janelaInicio: string
  janelaFim: string
  linhas: LinhaZootecnica[]
  geral: LinhaZootecnica
}

interface LoteRow {
  id: string
  nome: string
  pasto_id: string | null
}

interface CategoriaRow {
  lote_id: string
  categoria: string | null
  raca: string | null
  sexo: string | null
  estrategia_nutricional: string | null
  quant_atual: number | null
  data_pesagem: string | null
  peso_entrada_kg_cab: number | null
  peso_vivo_atual_kg_cab: number | null
  peso_vivo_meta_kg_cab: number | null
  data_meta_projetada: string | null
  periodo: number | null
  rc_atual: number | null
  preco_venda_projetado_reais_arroba: number | null
  preco_custo_cab: number | null
  consumo_meta_porcentagem_pesovivo: number | null
  formulacao_id: string | null
}

interface ConsumoRpcLote {
  info: { lote_id: string; escopo?: string }
  dados: SerieConsumoDia[] | null
}

const ehCreep = (categoria: string | null) => /^bezerr[oa] ao p[eé]$/i.test((categoria ?? '').trim())

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function isoHoje(): string {
  return new Date().toISOString().slice(0, 10)
}

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

async function consumoPorLote(fazendaId: string, ini: string, fim: string): Promise<Map<string, SerieConsumoDia[]>> {
  const { data, error } = await supabase.rpc('get_dados_relatorio_consumo_fazenda', {
    p_fazenda_id: fazendaId,
    p_data_inicio: ini,
    p_data_fim: fim,
  })
  if (error) throw error
  const mapa = new Map<string, SerieConsumoDia[]>()
  for (const l of (data?.dados?.lotes ?? []) as ConsumoRpcLote[]) {
    mapa.set(`${l.info.lote_id}|${l.info.escopo ?? 'lote'}`, l.dados ?? [])
  }
  return mapa
}

export async function carregarRelatorioZootecnico(
  fazendaId: string,
  fazendaNome: string,
  diasJanela: number,
): Promise<DadosRelatorioZootecnico> {
  const janelaFim = isoHoje()
  const janelaInicio = somarDias(janelaFim, -(diasJanela - 1))

  const { data: lotesData, error: lotesErr } = await supabase
    .from('lotes')
    .select('id, nome, pasto_id')
    .eq('fazenda_id', fazendaId)
    .eq('ativo', true)
    .is('deleted_at', null)
    .order('nome')
  if (lotesErr) throw lotesErr
  const lotes = (lotesData ?? []) as LoteRow[]
  const loteIds = lotes.map((l) => l.id)
  if (loteIds.length === 0) {
    const geral = montarLinhaGeral([])
    return { fazendaNome, janelaInicio, janelaFim, linhas: [], geral }
  }

  const [catRes, pastosRes, formRes, ocupRes, planosRes] = await Promise.all([
    supabase
      .from('lote_categorias')
      .select(
        'lote_id, categoria, raca, sexo, estrategia_nutricional, quant_atual, data_pesagem, peso_entrada_kg_cab, peso_vivo_atual_kg_cab, peso_vivo_meta_kg_cab, data_meta_projetada, periodo, rc_atual, preco_venda_projetado_reais_arroba, preco_custo_cab, consumo_meta_porcentagem_pesovivo, formulacao_id',
      )
      .in('lote_id', loteIds)
      .eq('ativo', true),
    supabase.from('pastos').select('id, nome, area_util_ha').eq('fazenda_id', fazendaId),
    supabase.from('formulacoes').select('id, teor_ms_dieta').eq('fazenda_id', fazendaId),
    supabase.from('v_lote_pasto_ocupacao_atual').select('lote_id, taxa_lotacao_ua_ha').in('lote_id', loteIds),
    supabase
      .from('planos_nutricionais')
      .select('lote_id, formulacao_id, data_inicio')
      .eq('fazenda_id', fazendaId)
      .eq('ativo', true)
      .is('lote_categoria_id', null)
      .in('lote_id', loteIds)
      .order('data_inicio', { ascending: false, nullsFirst: false }),
  ])
  for (const r of [catRes, pastosRes, formRes, ocupRes, planosRes]) if (r.error) throw r.error

  const categorias = ((catRes.data ?? []) as CategoriaRow[]).filter((c) => (c.quant_atual ?? 0) > 0)
  const pastos = new Map((pastosRes.data ?? []).map((p) => [p.id as string, p]))
  const teor = new Map((formRes.data ?? []).map((f) => [f.id as string, num(f.teor_ms_dieta)]))
  const lotacao = new Map((ocupRes.data ?? []).map((o) => [o.lote_id as string, num(o.taxa_lotacao_ua_ha)]))
  // dieta do lote pelo plano ativo mais recente (a categoria nem sempre tem formulacao_id próprio)
  const formulacaoDoPlano = new Map<string, string>()
  for (const p of planosRes.data ?? []) {
    if (p.lote_id && p.formulacao_id && !formulacaoDoPlano.has(p.lote_id as string)) formulacaoDoPlano.set(p.lote_id as string, p.formulacao_id as string)
  }
  const loteMap = new Map(lotes.map((l) => [l.id, l]))

  const inicioGeral =
    categorias.map((c) => c.data_pesagem).filter((d): d is string => !!d).sort()[0] ?? somarDias(janelaFim, -365)
  const [serieGeral, serieJanela] = await Promise.all([
    consumoPorLote(fazendaId, inicioGeral, janelaFim),
    consumoPorLote(fazendaId, janelaInicio, janelaFim),
  ])

  const linhas = categorias
    .map((c): LinhaZootecnica => {
      const lote = loteMap.get(c.lote_id)!
      const escopo = ehCreep(c.categoria) ? 'creep' : 'lote'
      const pasto = lote.pasto_id ? pastos.get(lote.pasto_id) : undefined
      const cat: CategoriaZootecnica = {
        loteNome: lote.nome,
        pastoNome: (pasto?.nome as string | undefined) ?? null,
        areaUtilHa: num(pasto?.area_util_ha),
        taxaLotacaoUaHa: lotacao.get(c.lote_id) ?? null,
        categoria: c.categoria,
        raca: c.raca,
        sexo: c.sexo,
        estrategia: c.estrategia_nutricional,
        cabecas: c.quant_atual ?? 0,
        dataPesagem: c.data_pesagem,
        pesoEntradaKg: num(c.peso_entrada_kg_cab),
        pesoAtualKg: num(c.peso_vivo_atual_kg_cab),
        pesoMetaKg: num(c.peso_vivo_meta_kg_cab),
        dataMeta: c.data_meta_projetada,
        periodoDias: c.periodo,
        rcPercent: num(c.rc_atual),
        precoVendaArroba: num(c.preco_venda_projetado_reais_arroba),
        precoCustoCab: num(c.preco_custo_cab),
        consumoMetaPercentPv: num(c.consumo_meta_porcentagem_pesovivo),
        teorMsPercent: teor.get(c.formulacao_id ?? formulacaoDoPlano.get(c.lote_id) ?? '') ?? null,
        serieGeral: serieGeral.get(`${c.lote_id}|${escopo}`) ?? [],
        serieJanela: serieJanela.get(`${c.lote_id}|${escopo}`) ?? [],
      }
      return montarLinha(cat)
    })
    .sort((a, b) => a.loteNome.localeCompare(b.loteNome, 'pt-BR', { numeric: true }))

  return { fazendaNome, janelaInicio, janelaFim, linhas, geral: montarLinhaGeral(linhas) }
}

const valorExcel = (tipo: TipoColuna, v: string | number | null): string | number | Date | null => {
  if (v === null || v === undefined) return null
  if (tipo === 'data') return new Date(`${String(v).slice(0, 10)}T00:00:00Z`)
  if (tipo === 'pct1') return Number(v) / 100
  return v
}

export async function gerarExcelZootecnico(dados: DadosRelatorioZootecnico, dias: number): Promise<Blob> {
  const cols = colunasZootecnicas(dias)
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Controle de Lotes', { views: [{ state: 'frozen', xSplit: 1, ySplit: 4 }] })
  ws.columns = cols.map((c) => ({ width: c.width }))

  const fmtBr = (iso: string) => iso.split('-').reverse().join('/')
  ws.getCell('A1').value = `Relatório Zootécnico dos Lotes - ${dados.fazendaNome}`
  ws.getCell('A1').font = { bold: true, size: 14 }
  ws.getCell('A2').value = `Intervalo de avaliação de consumo: ${fmtBr(dados.janelaInicio)} a ${fmtBr(dados.janelaFim)} (${dias} dias)`

  // Linha 3: grupos mesclados; linha 4: cabeçalhos
  let ini = 0
  for (let i = 1; i <= cols.length; i++) {
    if (i === cols.length || cols[i].grupo !== cols[ini].grupo) {
      ws.getCell(3, ini + 1).value = cols[ini].grupo
      if (i - ini > 1) ws.mergeCells(3, ini + 1, 3, i)
      ini = i
    }
  }
  const estiloCab = (row: ExcelJS.Row) => {
    row.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14532D' } }
    })
  }
  estiloCab(ws.getRow(3))
  const cab = ws.getRow(4)
  cols.forEach((c, i) => (cab.getCell(i + 1).value = c.header))
  estiloCab(cab)
  cab.height = 32

  const escrever = (l: LinhaZootecnica, destaque: boolean) => {
    const row = ws.addRow(cols.map((c) => valorExcel(c.tipo, c.valor(l))))
    cols.forEach((c, i) => {
      const fmt = FORMATO_EXCEL[c.tipo]
      if (fmt) row.getCell(i + 1).numFmt = fmt
    })
    if (destaque) {
      row.font = { bold: true }
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } }
      })
    }
  }
  escrever(dados.geral, true)
  dados.linhas.forEach((l) => escrever(l, false))

  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
