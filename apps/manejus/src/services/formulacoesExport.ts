import ExcelJS from 'exceljs'
import { supabase } from '@gestaup/supabase'
import { contarCabecasPorDieta, type CabecasPorDieta, type CategoriaCabecas, type PlanoVigenteCabecas } from '../utils/cabecasPorDieta'
import { calcularFormulacao } from '../utils/formulacaoCalculo'

/** Campos da formulação usados na exportação (subconjunto de Dieta em Formulacoes.tsx). */
export interface FormulacaoExport {
  id: string
  nome: string
  tipo?: string
  categoria?: string
  ativo: boolean
  e_premix?: boolean
  e_creep?: boolean
  sistema_producao?: string
  consumo_ms_percent_pv?: number
  peso_vivo_medio?: number
  gmd?: number
  consumo_mn_kg_cab_dia?: number
  consumo_ms_kg_cab_dia?: number
  teor_ms_dieta?: number
  custo_dieta_reais_cab_dia?: number
  custo_ms_tonelada?: number
  custo_mn_tonelada?: number
  forma_fornecimento?: string
  kg_por_saco?: number | null
}

/** Insumo de uma formulação já com o JOIN em `insumos` (mesma forma de handleEdit). */
export interface FormulacaoInsumoRow {
  formulacao_id: string
  formula_teor_ms: number | null
  ordem: number | null
  insumo: { id: string; nome: string; teor_ms: number | null; preco_ton_mn: number | null } | null
}

export interface FormulacaoGmdRow {
  formulacao_id: string
  categoria: string
  gmd: number
  ordem: number
}

export interface DadosExportacaoFormulacoes {
  formulacoes: FormulacaoExport[]
  insumos: FormulacaoInsumoRow[]
  gmd: FormulacaoGmdRow[]
  planos: PlanoVigenteCabecas[]
  categorias: CategoriaCabecas[]
}

export type LinhaPlanilha = Record<string, string | number | null>

export interface AbasFormulacoes {
  resumo: LinhaPlanilha[]
  insumos: LinhaPlanilha[]
  categoriasGmd: LinhaPlanilha[]
  lotes: LinhaPlanilha[]
}

const TIPO_DIETA = (f: FormulacaoExport) => (f.e_premix ? 'Premix' : f.e_creep ? 'Creep' : 'TMR')

const SISTEMA = (f: FormulacaoExport) => f.sistema_producao ?? 'Ambos'

/**
 * Monta as quatro abas a partir dos dados já carregados. Função pura: não acessa o banco.
 * Cabeças só se contam para dietas que não são premix (o premix é ingrediente, não é consumido direto).
 */
export function montarAbasFormulacoes(dados: DadosExportacaoFormulacoes): AbasFormulacoes {
  const insumosPorForm = agrupar(dados.insumos, (r) => r.formulacao_id)
  const gmdPorForm = agrupar(dados.gmd, (r) => r.formulacao_id)

  const resumo: LinhaPlanilha[] = []
  const insumos: LinhaPlanilha[] = []
  const categoriasGmd: LinhaPlanilha[] = []
  const lotes: LinhaPlanilha[] = []

  for (const f of dados.formulacoes) {
    const cabecas: CabecasPorDieta | null = f.e_premix
      ? null
      : contarCabecasPorDieta(f.id, !!f.e_creep, dados.planos, dados.categorias)

    resumo.push({
      'Formulação': f.nome,
      'Tipo': f.tipo ?? null,
      'Tipo de dieta': TIPO_DIETA(f),
      'Sistema': SISTEMA(f),
      'Categoria': f.categoria ?? null,
      'Ativa': f.ativo ? 'Sim' : 'Não',
      'Meta MS (% PV)': f.consumo_ms_percent_pv ?? null,
      'Peso vivo médio (kg)': f.peso_vivo_medio ?? null,
      'GMD base (kg/cab/dia)': f.e_premix ? null : (f.gmd ?? null),
      'Consumo MN (kg/cab/dia)': f.consumo_mn_kg_cab_dia ?? null,
      'Consumo MS (kg/cab/dia)': f.consumo_ms_kg_cab_dia ?? null,
      'Teor de MS da dieta (%)': f.teor_ms_dieta ?? null,
      'Custo da dieta (R$/cab/dia)': f.custo_dieta_reais_cab_dia ?? null,
      'Custo MN (R$/t)': f.custo_mn_tonelada ?? null,
      'Custo MS (R$/t)': f.custo_ms_tonelada ?? null,
      'Forma de fornecimento': f.forma_fornecimento === 'sacaria'
        ? `Sacaria${f.kg_por_saco ? ` (${f.kg_por_saco} kg/saco)` : ''}`
        : 'Granel',
      'Nº de insumos': (insumosPorForm.get(f.id) ?? []).length,
      'Cabeças atendidas': cabecas ? cabecas.total : null,
      'Nº de lotes atendidos': cabecas ? cabecas.lotes.length : null,
    })

    const insumosDaForm = (insumosPorForm.get(f.id) ?? [])
      .slice()
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
    const calc = calcularFormulacao(
      insumosDaForm.map((r) => ({
        teor_ms: r.insumo?.teor_ms ?? 0,
        preco_ton_mn: r.insumo?.preco_ton_mn ?? 0,
        formula_teor_ms: r.formula_teor_ms ?? 0,
        nome: r.insumo?.nome ?? '',
      })),
      f.consumo_ms_percent_pv ?? 0,
    )
    calc.forEach((c, i) => {
      insumos.push({
        'Formulação': f.nome,
        'Ordem': i + 1,
        'Insumo': c.nome,
        'Teor de MS do insumo (%)': c.teor_ms,
        'Preço (R$/t MN)': c.preco_ton_mn,
        'Teor de MS na fórmula (%)': c.formula_teor_ms,
        'Participação na MN (%)': round(c.formula_mn_percent, 4),
        'Consumo MN (kg/kg PV)': round(c.consumo_kg_mn_por_kg_pv, 6),
        'Consumo MS (kg/kg PV)': round(c.consumo_kg_ms_por_kg_pv, 6),
        'Custo (R$/kg MN)': round(c.custo_kg_mn, 4),
        'Custo (R$/kg MS)': round(c.custo_kg_ms, 4),
      })
    })

    for (const g of (gmdPorForm.get(f.id) ?? []).slice().sort((a, b) => a.ordem - b.ordem)) {
      categoriasGmd.push({
        'Formulação': f.nome,
        'Categoria': g.categoria,
        'GMD (kg/cab/dia)': g.gmd,
      })
    }

    for (const lote of cabecas?.lotes ?? []) {
      lotes.push({
        'Formulação': f.nome,
        'Lote': lote.nome,
        'Categorias': lote.categorias.join(', '),
        'Cabeças': lote.cabecas,
      })
    }
  }

  return { resumo, insumos, categoriasGmd, lotes }
}

/** Lê do banco tudo que a exportação precisa, em consultas em lote (uma por tabela). */
export async function buscarDadosExportacaoFormulacoes(
  fazendaId: string,
  formulacoes: FormulacaoExport[],
): Promise<DadosExportacaoFormulacoes> {
  const ids = formulacoes.map((f) => f.id)
  const vazio = { formulacoes, insumos: [], gmd: [], planos: [], categorias: [] }
  if (ids.length === 0) return vazio

  const [insumosRes, gmdRes, planosRes, catsRes] = await Promise.all([
    supabase
      .from('formulacao_insumos')
      .select('formulacao_id, formula_teor_ms, ordem, insumo:insumos!insumo_id(id, nome, teor_ms, preco_ton_mn)')
      .in('formulacao_id', ids),
    supabase
      .from('formulacao_categorias_gmd')
      .select('formulacao_id, categoria, gmd, ordem')
      .in('formulacao_id', ids),
    supabase
      .from('planos_nutricionais')
      .select('lote_id, lote_categoria_id, formulacao_id')
      .eq('fazenda_id', fazendaId)
      .eq('ativo', true)
      .is('data_fim', null),
    supabase
      .from('lote_categorias')
      .select('id, lote_id, categoria, quant_atual, formulacao_id, lotes!inner(nome, ativo)')
      .eq('lotes.fazenda_id', fazendaId)
      .eq('ativo', true)
      .is('data_fim', null)
      .eq('lotes.ativo', true),
  ])

  const erro = insumosRes.error || gmdRes.error || planosRes.error || catsRes.error
  if (erro) throw erro

  const categorias: CategoriaCabecas[] = ((catsRes.data || []) as any[]).map((c) => ({
    id: c.id,
    lote_id: c.lote_id,
    lote_nome: c.lotes?.nome ?? '',
    categoria: c.categoria,
    quant_atual: c.quant_atual,
    formulacao_id: c.formulacao_id,
  }))

  return {
    formulacoes,
    insumos: (insumosRes.data || []) as unknown as FormulacaoInsumoRow[],
    gmd: (gmdRes.data || []) as FormulacaoGmdRow[],
    planos: (planosRes.data || []) as PlanoVigenteCabecas[],
    categorias,
  }
}

// --- Excel (mesmo padrão visual dos relatórios de Abate e Zootécnico) ---

const FMT_BRL = '"R$" #,##0.00'
const FMT_DEC2 = '#,##0.00'
const FMT_DEC3 = '0.000'
const FMT_DEC4 = '0.0000'
const FMT_DEC6 = '0.000000'

interface ColunaAba {
  header: string
  width: number
  fmt?: string
}

const COLUNAS_RESUMO: ColunaAba[] = [
  { header: 'Formulação', width: 28 },
  { header: 'Tipo', width: 14 },
  { header: 'Tipo de dieta', width: 13 },
  { header: 'Sistema', width: 14 },
  { header: 'Categoria', width: 16 },
  { header: 'Ativa', width: 8 },
  { header: 'Meta MS (% PV)', width: 12, fmt: FMT_DEC2 },
  { header: 'Peso vivo médio (kg)', width: 13, fmt: FMT_DEC2 },
  { header: 'GMD base (kg/cab/dia)', width: 14, fmt: FMT_DEC3 },
  { header: 'Consumo MN (kg/cab/dia)', width: 14, fmt: FMT_DEC2 },
  { header: 'Consumo MS (kg/cab/dia)', width: 14, fmt: FMT_DEC2 },
  { header: 'Teor de MS da dieta (%)', width: 13, fmt: FMT_DEC2 },
  { header: 'Custo da dieta (R$/cab/dia)', width: 16, fmt: FMT_BRL },
  { header: 'Custo MN (R$/t)', width: 13, fmt: FMT_BRL },
  { header: 'Custo MS (R$/t)', width: 13, fmt: FMT_BRL },
  { header: 'Forma de fornecimento', width: 22 },
  { header: 'Nº de insumos', width: 11 },
  { header: 'Cabeças atendidas', width: 13 },
  { header: 'Nº de lotes atendidos', width: 13 },
]

const COLUNAS_INSUMOS: ColunaAba[] = [
  { header: 'Formulação', width: 28 },
  { header: 'Ordem', width: 8 },
  { header: 'Insumo', width: 28 },
  { header: 'Teor de MS do insumo (%)', width: 14, fmt: FMT_DEC2 },
  { header: 'Preço (R$/t MN)', width: 13, fmt: FMT_BRL },
  { header: 'Teor de MS na fórmula (%)', width: 14, fmt: FMT_DEC2 },
  { header: 'Participação na MN (%)', width: 14, fmt: FMT_DEC4 },
  { header: 'Consumo MN (kg/kg PV)', width: 15, fmt: FMT_DEC6 },
  { header: 'Consumo MS (kg/kg PV)', width: 15, fmt: FMT_DEC6 },
  { header: 'Custo (R$/kg MN)', width: 13, fmt: FMT_DEC4 },
  { header: 'Custo (R$/kg MS)', width: 13, fmt: FMT_DEC4 },
]

const COLUNAS_GMD: ColunaAba[] = [
  { header: 'Formulação', width: 28 },
  { header: 'Categoria', width: 22 },
  { header: 'GMD (kg/cab/dia)', width: 14, fmt: FMT_DEC3 },
]

const COLUNAS_LOTES: ColunaAba[] = [
  { header: 'Formulação', width: 28 },
  { header: 'Lote', width: 28 },
  { header: 'Categorias', width: 36 },
  { header: 'Cabeças', width: 11 },
]

/** Gera o .xlsx com as quatro abas formatadas, no mesmo estilo dos relatórios do módulo. */
export async function gerarExcelFormulacoes(
  fazendaId: string,
  formulacoes: FormulacaoExport[],
): Promise<Blob> {
  const abas = montarAbasFormulacoes(await buscarDadosExportacaoFormulacoes(fazendaId, formulacoes))
  const wb = new ExcelJS.Workbook()

  adicionarAba(wb, 'Resumo', COLUNAS_RESUMO, abas.resumo)
  adicionarAba(wb, 'Insumos', COLUNAS_INSUMOS, abas.insumos)
  adicionarAba(wb, 'Categorias GMD', COLUNAS_GMD, abas.categoriasGmd)
  adicionarAba(wb, 'Cabeças por lote', COLUNAS_LOTES, abas.lotes)

  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

/** Nome do arquivo: uma formulação usa o nome dela; várias usam a contagem. */
export function nomeArquivoFormulacoes(formulacoes: FormulacaoExport[], hoje: Date = new Date()): string {
  const dd = String(hoje.getDate()).padStart(2, '0')
  const mm = String(hoje.getMonth() + 1).padStart(2, '0')
  const sufixo = formulacoes.length === 1
    ? formulacoes[0].nome.replace(/[\\/:*?"<>|]/g, '-')
    : `${formulacoes.length} formulações`
  return `Formulações - ${sufixo} - ${dd}-${mm}-${hoje.getFullYear()}.xlsx`
}

function adicionarAba(wb: ExcelJS.Workbook, nome: string, colunas: ColunaAba[], linhas: LinhaPlanilha[]) {
  const ws = wb.addWorksheet(nome, { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = colunas.map((c) => ({ width: c.width }))

  const cab = ws.addRow(colunas.map((c) => c.header))
  cab.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  cab.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  cab.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14532D' } }
  })
  cab.height = 30

  colunas.forEach((c, i) => {
    if (c.fmt) ws.getColumn(i + 1).numFmt = c.fmt
  })

  for (const linha of linhas) {
    const row = ws.addRow(colunas.map((c) => linha[c.header] ?? null))
    // A primeira coluna (nome da formulação/lote) fica alinhada à esquerda; as demais, centralizadas
    row.eachCell((cell, numero) => {
      if (numero > 1) cell.alignment = { horizontal: 'center' }
    })
  }
}

function agrupar<T>(itens: T[], chave: (item: T) => string): Map<string, T[]> {
  const mapa = new Map<string, T[]>()
  for (const item of itens) {
    const k = chave(item)
    const lista = mapa.get(k) ?? []
    lista.push(item)
    mapa.set(k, lista)
  }
  return mapa
}

function round(valor: number | undefined, casas: number): number | null {
  return valor == null ? null : Number(valor.toFixed(casas))
}
