import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../../services/supabaseClient'
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LabelList,
} from 'recharts'
import logoManejus from '/images/manejus360.png'
import {
  gerarRelatorioMortePDFReact,
} from '../../utils/relatorioMortePDFReact'
import { gerarRelatorioMortePDFPuppeteer } from '../../utils/relatorioMortePDFPuppeteer'
import {
  type LinhaMorte,
  type ResumoMorte,
  type AgregadoItem,
} from '../../utils/relatorioMortePDF'

const CHART_NO_FOCUS_CSS = `
.recharts-surface {
  outline: none !important;
  box-shadow: none !important;
  border: none !important;
  -webkit-tap-highlight-color: transparent !important;
  -webkit-focus-ring-color: transparent !important;
}
.recharts-surface:focus,
.recharts-surface:focus-visible,
.recharts-surface *:focus,
.recharts-surface *:focus-visible {
  outline: none !important;
  box-shadow: none !important;
  border: none !important;
}
.recharts-wrapper, .recharts-bar-rectangle, .recharts-bar-rectangle * {
  outline: none !important;
  -webkit-tap-highlight-color: transparent !important;
}
.recharts-active-dot { display: none !important; }
`

const GREEN_DARK = '#0F6437'
const CHART_COLORS = ['#0F6437', '#1E3A5F', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316']

// Preços por kg vivo por categoria (defaults baseados em cotações de agosto/2026)
// Fontes: Scot Consultoria, CEPEA/ESALQ, Agrifatto
// 1 arroba = 15 kg; rendimento carcaça ~50% → R$/kg vivo = (R$/@ ÷ 15) × 0,5
const PRECOS_KG_DEFAULT: Record<string, number> = {
  'Bezerro': 12.00,
  'Bezerra': 11.50,
  'Novilha': 11.00,
  'Garrote': 9.50,
  'Boi Magro': 10.00,
  'Boi Gordo': 11.67,
  'Vaca': 10.83,
  'Touro': 15.00,
}
const PRECO_KG_FALLBACK = 10.00

const DIAG_LABELS: Record<string, string> = {
  inchaco: 'Inchaço',
  fraturas: 'Fraturas',
  medicado: 'Foi medicado',
  morteSubita: 'Morte súbita',
  decomposicao: 'Decomposição',
  animalInchado: 'Animal inchado',
  animalSozinho: 'Animal sozinho',
  animalBicheira: 'Bicheira',
  apatiaFraqueza: 'Apatia/fragilidade',
  doencasPrevias: 'Doenças prévias',
  encontradoVivo: 'Encontrado vivo',
  carrapatosMoscas: 'Carrapatos/moscas',
  secrecaoOrificios: 'Secreção orifícios',
  sinaisIntoxicacao: 'Sinais intoxicação',
  sintomasPneumonia: 'Sintomas pneumonia',
  salivacaoExcessiva: 'Salivação excessiva',
  desordensDigestivas: 'Desordens digestivas',
  medicamentosRecentes: 'Medicamentos recentes',
  incoordenacaoTremores: 'Incoordenação/tremores',
}

function labelDiagnostico(chave: string): string {
  return DIAG_LABELS[chave] ?? chave
}

interface LoteDisponivel {
  lote_id: string
  lote_nome: string
}

interface PeriodoAnterior {
  total_mortes: number
  taxa_mortalidade: number | null
  peso_medio: number | null
  media_por_dia: number | null
  data_inicio: string
  data_fim: string
}

interface DadosRelatorioMorte {
  fazenda_nome?: string
  fazenda_logo_url?: string | null
  timezone?: string
  rebanho_total?: number
  lotes_disponiveis: LoteDisponivel[]
  causas_disponiveis: string[]
  categorias_disponiveis: string[]
  sexos_disponiveis: string[]
  pastos_disponiveis?: string[]
  linhas: LinhaMorte[]
  resumo: ResumoMorte
  periodo_anterior?: PeriodoAnterior
}

interface RelatorioInfo {
  fazenda_id: string
  titulo: string
  tipo: string
  fazenda_nome?: string
  fazenda_logo_url?: string | null
}

function formatarNumero(valor: number | null | undefined, casas = 2, padrao = '—'): string {
  if (valor === null || valor === undefined || isNaN(valor as number)) return padrao
  return (valor as number).toFixed(casas).replace('.', ',')
}

function formatarInteiro(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || isNaN(valor as number)) return '—'
  return Math.round(valor as number).toString()
}

function formatarData(d: string | null | undefined): string {
  if (!d || d === '—') return '—'
  const parts = d.split('-')
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
  return d
}

interface Props {
  token: string
  relatorioInfo: RelatorioInfo
}

type Dimensao = 'lote' | 'causa' | 'categoria' | 'sexo' | 'pasto'

export function RelatorioMortePublico({ token, relatorioInfo }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dados, setDados] = useState<DadosRelatorioMorte | null>(null)
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')

  // Slicers multi-select
  const [filtroLote, setFiltroLote] = useState<Set<string>>(new Set())
  const [filtroCausa, setFiltroCausa] = useState<Set<string>>(new Set())
  const [filtroCategoria, setFiltroCategoria] = useState<Set<string>>(new Set())
  const [filtroSexo, setFiltroSexo] = useState<Set<string>>(new Set())
  const [filtroPasto, setFiltroPasto] = useState<Set<string>>(new Set())

  const [dropdownAberto, setDropdownAberto] = useState<Dimensao | null>(null)
  const [exportandoPDF, setExportandoPDF] = useState(false)
  const [mostrarPrecos, setMostrarPrecos] = useState(false)
  const [precosKg, setPrecosKg] = useState<Record<string, number>>({ ...PRECOS_KG_DEFAULT })
  const dropdownRef = useRef<HTMLDivElement>(null)

  const carregarDados = useCallback(async () => {
    if (!token) return
    try {
      setLoading(true)
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('get_dados_relatorio_morte', {
          p_token: token,
          p_data_inicio: dataInicio || null,
          p_data_fim: dataFim || null,
        })

      if (rpcError) {
        console.error('Erro ao carregar dados:', rpcError)
        setError('Erro ao carregar dados do relatório.')
        setLoading(false)
        return
      }

      setDados(rpcData?.dados as DadosRelatorioMorte)

      // Carregar preços por categoria da fazenda
      const fazendaId = rpcData?.fazenda_id
      if (fazendaId) {
        const { data: precosData } = await supabase
          .from('precos_categorias')
          .select('categoria, preco_kg')
          .eq('fazenda_id', fazendaId)
        if (precosData && precosData.length > 0) {
          const mapa: Record<string, number> = {}
          for (const p of precosData) {
            mapa[p.categoria] = Number(p.preco_kg)
          }
          setPrecosKg(mapa)
        }
      }

      setError(null)
    } catch (err) {
      console.error('Erro:', err)
      setError('Erro inesperado ao carregar relatório.')
    } finally {
      setLoading(false)
    }
  }, [token, dataInicio, dataFim])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownAberto(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      document.querySelectorAll('.recharts-surface').forEach((svg) => {
        svg.removeAttribute('tabindex')
        svg.removeAttribute('role')
        ;(svg as HTMLElement).style.outline = 'none'
        ;(svg as HTMLElement).style.boxShadow = 'none'
      })
    }, 300)
    return () => clearTimeout(timer)
  }, [dados, filtroLote, filtroCausa, filtroCategoria, filtroSexo, filtroPasto, dataInicio, dataFim])

  // === Cross-filters: linhas filtradas por todos os slicers ===
  const linhasFiltradas = useMemo(() => {
    if (!dados) return []
    return dados.linhas.filter((l) => {
      if (filtroLote.size > 0 && (!l.lote_id || !filtroLote.has(l.lote_id))) return false
      if (filtroCausa.size > 0 && (!l.causa_morte || !filtroCausa.has(l.causa_morte))) return false
      if (filtroCategoria.size > 0 && (!l.categoria || !filtroCategoria.has(l.categoria))) return false
      if (filtroSexo.size > 0 && (!l.sexo || !filtroSexo.has(l.sexo))) return false
      if (filtroPasto.size > 0 && (!l.pasto || !filtroPasto.has(l.pasto))) return false
      return true
    })
  }, [dados, filtroLote, filtroCausa, filtroCategoria, filtroSexo, filtroPasto])

  // === Agregações dinâmicas a partir das linhas filtradas ===
  const agregar = (chave: (l: LinhaMorte) => string | null | undefined): AgregadoItem[] => {
    const map = new Map<string, number>()
    for (const l of linhasFiltradas) {
      const k = chave(l)
      if (!k) continue
      map.set(k, (map.get(k) || 0) + 1)
    }
    return Array.from(map.entries())
      .map(([label, valor]) => ({ label, valor }))
      .sort((a, b) => b.valor - a.valor)
  }

  const porCausa = useMemo(() => agregar((l) => l.causa_morte), [linhasFiltradas])
  const porCategoria = useMemo(() => agregar((l) => l.categoria), [linhasFiltradas])
  const porSexo = useMemo(() => agregar((l) => l.sexo), [linhasFiltradas])
  const porPasto = useMemo(() => agregar((l) => l.pasto), [linhasFiltradas])

  // === KPIs calculados das linhas filtradas ===
  const totalMortes = linhasFiltradas.length
  const diasDistintos = useMemo(() => new Set(linhasFiltradas.map((l) => l.data)).size, [linhasFiltradas])
  const mediaPorDia = diasDistintos > 0 ? totalMortes / diasDistintos : null
  const pesoMedio = useMemo(() => {
    const pesos = linhasFiltradas.map((l) => l.peso_vivo).filter((p): p is number => p != null)
    return pesos.length > 0 ? pesos.reduce((s, p) => s + p, 0) / pesos.length : null
  }, [linhasFiltradas])
  const causaMaisFrequente = porCausa[0]?.label ?? null
  const causaMaisFrequenteCount = porCausa[0]?.valor ?? null

  // === KPIs derivados: taxa de mortalidade, impacto financeiro, variação ===
  const rebanhoTotal = dados?.rebanho_total ?? 0
  const taxaMortalidade = rebanhoTotal > 0 ? (totalMortes / rebanhoTotal) * 100 : null
  const periodoAnterior = dados?.periodo_anterior
  const variacaoMortes = periodoAnterior && periodoAnterior.total_mortes > 0
    ? ((totalMortes - periodoAnterior.total_mortes) / periodoAnterior.total_mortes) * 100
    : null
  const variacaoTaxa = periodoAnterior && periodoAnterior.taxa_mortalidade != null && taxaMortalidade != null
    ? taxaMortalidade - periodoAnterior.taxa_mortalidade
    : null

  // === Impacto financeiro calculado no frontend com preços por categoria ===
  const impactoFinanceiro = useMemo(() => {
    let pesoTotal = 0
    let perdaTotal = 0
    const porCategoria: Record<string, { peso: number; perda: number; count: number }> = {}
    for (const l of linhasFiltradas) {
      if (l.peso_vivo == null) continue
      const cat = l.categoria ?? 'Outros'
      const preco = precosKg[cat] ?? PRECO_KG_FALLBACK
      const perda = l.peso_vivo * preco
      pesoTotal += l.peso_vivo
      perdaTotal += perda
      if (!porCategoria[cat]) porCategoria[cat] = { peso: 0, perda: 0, count: 0 }
      porCategoria[cat].peso += l.peso_vivo
      porCategoria[cat].perda += perda
      porCategoria[cat].count += 1
    }
    return {
      pesoTotal: Math.round(pesoTotal * 10) / 10,
      perdaTotal: Math.round(perdaTotal * 100) / 100,
      porCategoria,
    }
  }, [linhasFiltradas, precosKg])

  const perdaEstimada = impactoFinanceiro.perdaTotal
  const pesoTotalPerdido = impactoFinanceiro.pesoTotal

  // === Frequência de diagnósticos a partir das linhas filtradas ===
  const frequenciaDiagnosticos = useMemo(() => {
    const map = new Map<string, number>()
    for (const l of linhasFiltradas) {
      if (!l.diagnosticos) continue
      for (const [chave, item] of Object.entries(l.diagnosticos)) {
        if (item?.valor === 'S') {
          map.set(chave, (map.get(chave) || 0) + 1)
        }
      }
    }
    return Array.from(map.entries())
      .map(([label, valor]) => ({ label, valor }))
      .sort((a, b) => b.valor - a.valor)
  }, [linhasFiltradas])

  // === Heatmap causa × categoria ===
  const heatmapCausaCategoria = useMemo(() => {
    const causas = Array.from(new Set(linhasFiltradas.map((l) => l.causa_morte).filter(Boolean))) as string[]
    const categorias = Array.from(new Set(linhasFiltradas.map((l) => l.categoria).filter(Boolean))) as string[]
    const matriz: Record<string, Record<string, number>> = {}
    for (const causa of causas) {
      matriz[causa] = {}
      for (const cat of categorias) {
        matriz[causa][cat] = 0
      }
    }
    for (const l of linhasFiltradas) {
      if (l.causa_morte && l.categoria && matriz[l.causa_morte]) {
        matriz[l.causa_morte][l.categoria] = (matriz[l.causa_morte][l.categoria] || 0) + 1
      }
    }
    const maxVal = Math.max(1, ...causas.flatMap((c) => categorias.map((cat) => matriz[c][cat] || 0)))
    return { causas: causas.sort(), categorias: categorias.sort(), matriz, maxVal }
  }, [linhasFiltradas])

  // === Insights automáticos (narrativa) ===
  const insights = useMemo(() => {
    const partes: string[] = []
    if (totalMortes === 0) return 'Nenhuma morte registrada no período selecionado.'

    // Taxa de mortalidade
    if (taxaMortalidade != null) {
      partes.push(`A taxa de mortalidade no período foi ${formatarNumero(taxaMortalidade, 2)}% do rebanho (${formatarInteiro(rebanhoTotal)} cabeças).`)
    }

    // Comparação com período anterior
    if (variacaoMortes != null) {
      const direcao = variacaoMortes > 0 ? 'aumento' : 'redução'
      const absVal = Math.abs(variacaoMortes)
      partes.push(`Houve ${direcao} de ${formatarNumero(absVal, 1)}% nas mortes em relação ao período anterior (${periodoAnterior?.total_mortes ?? 0} mortes).`)
    } else if (periodoAnterior && periodoAnterior.total_mortes === 0) {
      partes.push(`Nenhuma morte foi registrada no período anterior (${formatarData(periodoAnterior.data_inicio)} a ${formatarData(periodoAnterior.data_fim)}).`)
    }

    // Causa principal
    if (causaMaisFrequente) {
      const pctCausa = totalMortes > 0 ? ((causaMaisFrequenteCount ?? 0) / totalMortes) * 100 : 0
      partes.push(`A causa principal foi ${causaMaisFrequente} (${formatarInteiro(causaMaisFrequenteCount)} ${causaMaisFrequenteCount === 1 ? 'caso' : 'casos'}, ${formatarNumero(pctCausa, 0)}% do total).`)
    }

    // Categoria mais afetada
    const catMaisAfetada = porCategoria[0]
    if (catMaisAfetada) {
      partes.push(`A categoria mais afetada foi ${catMaisAfetada.label} com ${formatarInteiro(catMaisAfetada.valor)} ${catMaisAfetada.valor === 1 ? 'morte' : 'mortes'}.`)
    }

    // Pasto mais crítico
    const pastoMaisCritico = porPasto[0]
    if (pastoMaisCritico && porPasto.length > 1) {
      const pctPasto = totalMortes > 0 ? (pastoMaisCritico.valor / totalMortes) * 100 : 0
      if (pctPasto >= 30) {
        partes.push(`O pasto ${pastoMaisCritico.label} concentrou ${formatarNumero(pctPasto, 0)}% das mortes (${formatarInteiro(pastoMaisCritico.valor)}), merecendo atenção prioritária.`)
      }
    }

    // Impacto financeiro
    if (perdaEstimada != null && perdaEstimada > 0) {
      partes.push(`A perda estimada é de R$ ${perdaEstimada.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${formatarNumero(pesoTotalPerdido, 0)} kg perdidos, precificados por categoria).`)
    }

    return partes.join(' ')
  }, [totalMortes, taxaMortalidade, rebanhoTotal, variacaoMortes, periodoAnterior, causaMaisFrequente, causaMaisFrequenteCount, porCategoria, porPasto, perdaEstimada, pesoTotalPerdido])

  // === Gráfico de mortes no tempo (granularidade adaptativa) ===
  const diasUnicos = useMemo(() => new Set(linhasFiltradas.map((l) => l.data)).size, [linhasFiltradas])
  const granularidade = useMemo<'dia' | 'semana' | 'mes'>(() => {
    if (diasUnicos <= 31) return 'dia'
    if (diasUnicos <= 84) return 'semana'
    return 'mes'
  }, [diasUnicos])
  const labelGranularidade = granularidade === 'dia' ? 'por dia' : granularidade === 'semana' ? 'por semana' : 'por mês'

  function chaveAgregacao(data: string, gran: 'dia' | 'semana' | 'mes'): { chave: string; label: string } {
    const [ano, mes, dia] = data.split('-').map(Number)
    if (gran === 'dia') return { chave: data, label: `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}` }
    if (gran === 'mes') {
      const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
      return { chave: `${ano}-${String(mes).padStart(2, '0')}`, label: `${nomes[mes - 1]}/${String(ano).slice(2)}` }
    }
    const d = new Date(ano, mes - 1, dia)
    const dayOfWeek = d.getDay()
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const monday = new Date(ano, mes - 1, dia + diff)
    return {
      chave: `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`,
      label: `${String(monday.getDate()).padStart(2, '0')}/${String(monday.getMonth() + 1).padStart(2, '0')}`,
    }
  }

  const dadosGraficoTempo = useMemo(() => {
    const porPeriodo = new Map<string, { chave: string; label: string; count: number }>()
    for (const l of linhasFiltradas) {
      const { chave, label } = chaveAgregacao(l.data, granularidade)
      const existing = porPeriodo.get(chave)
      if (existing) existing.count += 1
      else porPeriodo.set(chave, { chave, label, count: 1 })
    }
    return Array.from(porPeriodo.values())
      .sort((a, b) => a.chave.localeCompare(b.chave))
      .map((d) => ({ data: d.label, count: d.count }))
  }, [linhasFiltradas, granularidade])

  const temFiltrosAtivos = filtroLote.size > 0 || filtroCausa.size > 0 || filtroCategoria.size > 0 || filtroSexo.size > 0 || filtroPasto.size > 0 || dataInicio || dataFim

  const limparFiltros = () => {
    setDataInicio('')
    setDataFim('')
    setFiltroLote(new Set())
    setFiltroCausa(new Set())
    setFiltroCategoria(new Set())
    setFiltroSexo(new Set())
    setFiltroPasto(new Set())
  }

  const toggleItem = (dim: Dimensao, valor: string) => {
    const setter = dim === 'lote' ? setFiltroLote : dim === 'causa' ? setFiltroCausa : dim === 'categoria' ? setFiltroCategoria : dim === 'sexo' ? setFiltroSexo : setFiltroPasto
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(valor)) next.delete(valor)
      else next.add(valor)
      return next
    })
  }

  const toggleAll = (dim: Dimensao, valores: string[]) => {
    const setter = dim === 'lote' ? setFiltroLote : dim === 'causa' ? setFiltroCausa : dim === 'categoria' ? setFiltroCategoria : dim === 'sexo' ? setFiltroSexo : setFiltroPasto
    const atual = dim === 'lote' ? filtroLote : dim === 'causa' ? filtroCausa : dim === 'categoria' ? filtroCategoria : dim === 'sexo' ? filtroSexo : filtroPasto
    if (atual.size === valores.length) setter(new Set())
    else setter(new Set(valores))
  }

  const limparDimensao = (dim: Dimensao) => {
    if (dim === 'lote') setFiltroLote(new Set())
    if (dim === 'causa') setFiltroCausa(new Set())
    if (dim === 'categoria') setFiltroCategoria(new Set())
    if (dim === 'sexo') setFiltroSexo(new Set())
    if (dim === 'pasto') setFiltroPasto(new Set())
  }

  const getFiltroSet = (dim: Dimensao): Set<string> => {
    if (dim === 'lote') return filtroLote
    if (dim === 'causa') return filtroCausa
    if (dim === 'categoria') return filtroCategoria
    if (dim === 'sexo') return filtroSexo
    return filtroPasto
  }

  const getOpcoes = (dim: Dimensao): { id: string; label: string }[] => {
    if (!dados) return []
    if (dim === 'lote') return dados.lotes_disponiveis.map((l) => ({ id: l.lote_id, label: l.lote_nome }))
    if (dim === 'causa') return dados.causas_disponiveis.map((c) => ({ id: c, label: c }))
    if (dim === 'categoria') return dados.categorias_disponiveis.map((c) => ({ id: c, label: c }))
    if (dim === 'sexo') return dados.sexos_disponiveis.map((s) => ({ id: s, label: s }))
    return (dados.pastos_disponiveis ?? []).map((p) => ({ id: p, label: p }))
  }

  const getLabelDim = (dim: Dimensao): string => {
    if (dim === 'lote') return 'Lote'
    if (dim === 'causa') return 'Causa da morte'
    if (dim === 'categoria') return 'Categoria'
    if (dim === 'sexo') return 'Sexo'
    return 'Pasto'
  }

  const exportarPDF = async () => {
    if (!dados || linhasFiltradas.length === 0) return
    try {
      setExportandoPDF(true)

      const resumoParaPDF: ResumoMorte = {
        total_mortes: totalMortes,
        media_por_dia: mediaPorDia,
        peso_medio: pesoMedio,
        causa_mais_frequente: causaMaisFrequente,
        causa_mais_frequente_count: causaMaisFrequenteCount,
        por_causa: porCausa,
        por_categoria: porCategoria,
        por_sexo: porSexo,
        frequencia_diagnosticos: frequenciaDiagnosticos,
        taxa_mortalidade: taxaMortalidade,
        rebanho_total: rebanhoTotal,
        perda_estimada: perdaEstimada,
        peso_total_perdido: pesoTotalPerdido,
        perda_por_categoria: impactoFinanceiro.porCategoria,
        insights,
        periodo_anterior: periodoAnterior ? {
          total_mortes: periodoAnterior.total_mortes,
          taxa_mortalidade: periodoAnterior.taxa_mortalidade,
          data_inicio: periodoAnterior.data_inicio,
          data_fim: periodoAnterior.data_fim,
        } : null,
        variacao_mortes: variacaoMortes,
      }

      const periodoInicio = dataInicio || (linhasFiltradas[linhasFiltradas.length - 1]?.data ?? '')
      const periodoFim = dataFim || (linhasFiltradas[0]?.data ?? '')

      const parametrosPDF = {
        dataInicio: periodoInicio,
        dataFim: periodoFim,
        fazendaNome: relatorioInfo.fazenda_nome || '',
        fazendaLogoUrl: relatorioInfo.fazenda_logo_url,
        linhas: linhasFiltradas,
        resumo: resumoParaPDF,
      }

      let blob: Blob
      try {
        blob = await gerarRelatorioMortePDFPuppeteer(parametrosPDF)
      } catch (puppeteerError) {
        console.warn('Puppeteer indisponível; usando fallback React PDF:', puppeteerError)
        blob = await gerarRelatorioMortePDFReact(parametrosPDF)
      }

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const nomeFazenda = relatorioInfo.fazenda_nome || 'Fazenda'
      link.download = `Gesta'Up - Relatório de Mortalidade ${nomeFazenda}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Erro ao exportar PDF:', err)
      alert('Erro ao gerar PDF. Tente novamente.')
    } finally {
      setExportandoPDF(false)
    }
  }

  if (loading && !dados) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F5F5' }}>
        <div className="text-center flex flex-col items-center">
          <div className="bg-white rounded-xl p-4 shadow-sm mb-3">
            <img src={logoManejus} alt="Manejus 360" className="h-12" />
          </div>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 mb-3" style={{ borderColor: GREEN_DARK }}></div>
          <p className="text-gray-600">Carregando relatório...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F5F5' }}>
        <div className="text-center max-w-md">
          <div className="bg-white rounded-xl p-4 inline-block shadow-sm mb-4">
            <img src={logoManejus} alt="Manejus 360" className="h-12 mx-auto" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Relatório indisponível</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    )
  }

  // === Renderização do popover multi-select ===
  const renderDropdown = (dim: Dimensao) => {
    const opcoes = getOpcoes(dim)
    const selecionados = getFiltroSet(dim)
    return (
      <div
        className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-100">
          <button
            onClick={() => toggleAll(dim, opcoes.map((o) => o.id))}
            className="text-xs text-green-700 hover:text-green-800 font-medium"
          >
            {selecionados.size === opcoes.length && opcoes.length > 0 ? 'Desmarcar todos' : 'Selecionar todos'}
          </button>
          {selecionados.size > 0 && (
            <button
              onClick={() => limparDimensao(dim)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Limpar ({selecionados.size})
            </button>
          )}
        </div>
        {opcoes.length === 0 ? (
          <p className="text-xs text-gray-400 px-2 py-2">Nenhum disponível.</p>
        ) : (
          opcoes.map((o) => (
            <label
              key={o.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-sm"
            >
              <input
                type="checkbox"
                checked={selecionados.has(o.id)}
                onChange={() => toggleItem(dim, o.id)}
                className="rounded border-gray-300 text-green-600 focus:ring-green-600"
              />
              <span className="text-gray-700">{o.label}</span>
            </label>
          ))
        )}
      </div>
    )
  }

  const renderSlicer = (dim: Dimensao) => {
    const selecionados = getFiltroSet(dim)
    const opcoes = getOpcoes(dim)
    const label = getLabelDim(dim)
    const displayLabel = selecionados.size === 0
      ? 'Todos'
      : selecionados.size === 1
        ? opcoes.find((o) => selecionados.has(o.id))?.label ?? '1 selecionado'
        : `${selecionados.size} selecionados`
    return (
      <div key={dim} className="relative" ref={dropdownAberto === dim ? dropdownRef : undefined}>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          {label} {selecionados.size > 0 && <span style={{ color: GREEN_DARK }}>● {selecionados.size}</span>}
        </label>
        <button
          onClick={() => setDropdownAberto(dropdownAberto === dim ? null : dim)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-left bg-white focus:border-green-600 focus:ring-1 focus:ring-green-600 flex items-center justify-between"
        >
          <span className={selecionados.size > 0 ? 'text-gray-900' : 'text-gray-400'}>{displayLabel}</span>
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {dropdownAberto === dim && renderDropdown(dim)}
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F5' }}>
      <style>{CHART_NO_FOCUS_CSS}</style>

      {/* Header verde */}
      <header className="sticky top-0 z-10" style={{ backgroundColor: GREEN_DARK }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="bg-white rounded-lg p-1 flex items-center justify-center">
                <img src={logoManejus} alt="Manej'Us 360" className="h-8 w-auto" />
              </div>
              <h1 className="text-sm sm:text-base font-bold text-white hidden sm:block">
                Manej'Us <span className="text-yellow-500">360</span>
              </h1>
            </div>

            <div className="bg-white rounded-full px-5 py-1.5 shadow-sm flex-1 max-w-md text-center">
              <h2 className="text-sm font-bold leading-tight" style={{ color: GREEN_DARK }}>
                {relatorioInfo?.titulo || 'Mortalidade'}
              </h2>
              {relatorioInfo?.fazenda_nome && (
                <p className="text-[10px] text-gray-500 leading-tight">{relatorioInfo.fazenda_nome}</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {relatorioInfo?.fazenda_logo_url && (
                <div className="bg-white rounded-lg p-1 flex items-center justify-center">
                  <img src={relatorioInfo.fazenda_logo_url} alt={relatorioInfo?.fazenda_nome || 'Fazenda'} className="h-8 w-auto max-w-[80px] object-contain" />
                </div>
              )}
              <button
                onClick={exportarPDF}
                disabled={exportandoPDF || linhasFiltradas.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                style={{ color: GREEN_DARK }}
              >
                {exportandoPDF ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2" style={{ borderColor: GREEN_DARK }}></div>
                    Gerando...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13l3 3 3-3M12 16V9" />
                    </svg>
                    Exportar PDF
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Slicers */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data início</label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:ring-1 focus:ring-green-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data fim</label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:ring-1 focus:ring-green-600"
              />
            </div>
            {(['lote', 'causa', 'categoria', 'sexo', 'pasto'] as Dimensao[]).map(renderSlicer)}
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-gray-400">
              {linhasFiltradas.length} registro(s) no período.
            </p>
            {temFiltrosAtivos && (
              <button
                onClick={limparFiltros}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Limpar filtros
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {linhasFiltradas.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <p className="text-gray-500">Nenhum registro de morte encontrado para os filtros selecionados.</p>
          </div>
        ) : (
          <>
            {/* Insights automáticos */}
            {insights && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <svg className="w-5 h-5" style={{ color: GREEN_DARK }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{insights}</p>
                </div>
              </div>
            )}

            {/* KPIs: linha 1 (4 cards) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <p className="text-2xl font-bold" style={{ color: GREEN_DARK }}>{formatarInteiro(totalMortes)}</p>
                <p className="text-xs text-gray-600 mt-1">Total de mortes</p>
                {variacaoMortes != null && (
                  <p className="text-[10px] mt-1" style={{ color: variacaoMortes > 0 ? '#EF4444' : '#10B981' }}>
                    {variacaoMortes > 0 ? '↑' : '↓'} {formatarNumero(Math.abs(variacaoMortes), 1)}% vs período anterior
                  </p>
                )}
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <p className="text-2xl font-bold" style={{ color: GREEN_DARK }}>
                  {taxaMortalidade != null ? `${formatarNumero(taxaMortalidade, 2)}%` : '—'}
                </p>
                <p className="text-xs text-gray-600 mt-1">Taxa de mortalidade</p>
                {rebanhoTotal > 0 && (
                  <p className="text-[10px] text-gray-400 mt-1">
                    Rebanho: {formatarInteiro(rebanhoTotal)} cabeças
                    {variacaoTaxa != null && (
                      <span className="ml-1" style={{ color: variacaoTaxa > 0 ? '#EF4444' : '#10B981' }}>
                        ({variacaoTaxa > 0 ? '+' : ''}{formatarNumero(variacaoTaxa, 2)} p.p.)
                      </span>
                    )}
                  </p>
                )}
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <p className="text-2xl font-bold" style={{ color: GREEN_DARK }}>{formatarNumero(mediaPorDia, 2)}</p>
                <p className="text-xs text-gray-600 mt-1">Mortes/dia (média)</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <p className="text-2xl font-bold" style={{ color: GREEN_DARK }}>{formatarNumero(pesoMedio, 1)}</p>
                <p className="text-xs text-gray-600 mt-1">Peso médio (kg)</p>
              </div>
            </div>

            {/* KPIs: linha 2 (3 cards) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <p className="text-lg font-bold leading-tight" style={{ color: GREEN_DARK }}>
                  {causaMaisFrequente ?? '—'}
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  Causa mais frequente{causaMaisFrequenteCount != null ? ` (${causaMaisFrequenteCount})` : ''}
                </p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-2xl font-bold" style={{ color: '#EF4444' }}>
                    {perdaEstimada > 0 ? `R$ ${perdaEstimada.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                  </p>
                  <button
                    onClick={() => setMostrarPrecos(true)}
                    className="text-xs text-gray-400 hover:text-gray-600"
                    title="Editar preços por categoria"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  Perda estimada {pesoTotalPerdido > 0 && `(${formatarNumero(pesoTotalPerdido, 0)} kg, preço por categoria)`}
                </p>
                {Object.keys(impactoFinanceiro.porCategoria).length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <p className="text-[10px] text-gray-400 font-medium mb-1">Detalhamento</p>
                    {Object.entries(impactoFinanceiro.porCategoria)
                      .sort(([, a], [, b]) => b.perda - a.perda)
                      .map(([cat, dados]) => (
                        <div key={cat} className="flex items-center justify-between text-xs">
                          <span className="text-gray-600">{cat} ({dados.count})</span>
                          <span className="text-gray-700 font-medium">
                            R$ {dados.perda.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-medium text-gray-600">Comparativo com período anterior</p>
                  <div className="relative group">
                    <svg className="w-3.5 h-3.5 text-gray-400 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 leading-relaxed">
                      O período anterior tem a mesma duração do período selecionado, imediatamente antes dele. Ex: se o período atual &eacute; 01/07 a 31/08 (61 dias), o anterior &eacute; 01/05 a 31/05 (61 dias antes do in&iacute;cio). Permite comparar se a mortalidade est&aacute; aumentando ou diminuindo.
                    </div>
                  </div>
                </div>
                {periodoAnterior ? (
                  <>
                    <p className="text-sm font-bold mt-1" style={{ color: GREEN_DARK }}>
                      {formatarInteiro(periodoAnterior.total_mortes)} mortes
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      {formatarData(periodoAnterior.data_inicio)} a {formatarData(periodoAnterior.data_fim)}
                    </p>
                    {periodoAnterior.taxa_mortalidade != null && (
                      <p className="text-[10px] text-gray-400 mt-1">Taxa anterior: {formatarNumero(periodoAnterior.taxa_mortalidade, 2)}%</p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">Sem período anterior para comparação.</p>
                )}
              </div>
            </div>

            {/* Gráficos: 2 colunas */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Mortes no tempo */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Mortes {labelGranularidade}</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={dadosGraficoTempo} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="data" tick={{ fontSize: 11, fill: '#6B7280' }} angle={-45} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} allowDecimals={false} />
                    <Tooltip
                      formatter={(v: any) => [`${v} morte(s)`, '']}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} fill={GREEN_DARK} cursor="pointer">
                      <LabelList dataKey="count" position="top" style={{ fontSize: 11, fill: '#374151', fontWeight: 600 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Por causa */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-1">Mortes por causa</h3>
                <p className="text-[10px] text-gray-400 mb-3">Clique nas barras para filtrar</p>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={porCausa.slice(0, 12)} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#6B7280' }} allowDecimals={false} />
                    <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: '#6B7280' }} width={80} />
                    <Tooltip
                      formatter={(v: any) => [`${v} morte(s)`, '']}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}
                    />
                    <Bar dataKey="valor" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(d: any) => d?.label && toggleItem('causa', d.label)}>
                      {porCausa.slice(0, 12).map((item, i) => (
                        <Cell
                          key={`c-${i}`}
                          fill={CHART_COLORS[i % CHART_COLORS.length]}
                          opacity={filtroCausa.size === 0 || filtroCausa.has(item.label) ? 1 : 0.35}
                        />
                      ))}
                      <LabelList dataKey="valor" position="right" style={{ fontSize: 11, fill: '#374151', fontWeight: 600 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Por categoria */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-1">Mortes por categoria</h3>
                <p className="text-[10px] text-gray-400 mb-3">Clique nas barras para filtrar</p>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={porCategoria.slice(0, 12)} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#6B7280' }} allowDecimals={false} />
                    <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: '#6B7280' }} width={80} />
                    <Tooltip
                      formatter={(v: any) => [`${v} morte(s)`, '']}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}
                    />
                    <Bar dataKey="valor" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(d: any) => d?.label && toggleItem('categoria', d.label)}>
                      {porCategoria.slice(0, 12).map((item, i) => (
                        <Cell
                          key={`cat-${i}`}
                          fill={CHART_COLORS[i % CHART_COLORS.length]}
                          opacity={filtroCategoria.size === 0 || filtroCategoria.has(item.label) ? 1 : 0.35}
                        />
                      ))}
                      <LabelList dataKey="valor" position="right" style={{ fontSize: 11, fill: '#374151', fontWeight: 600 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Por sexo (donut via barras empilhadas não é ideal; usamos barras simples) */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-1">Mortes por sexo</h3>
                <p className="text-[10px] text-gray-400 mb-3">Clique nas barras para filtrar</p>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={porSexo} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#6B7280' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} allowDecimals={false} />
                    <Tooltip
                      formatter={(v: any) => [`${v} morte(s)`, '']}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}
                    />
                    <Bar dataKey="valor" radius={[4, 4, 0, 0]} cursor="pointer" onClick={(d: any) => d?.label && toggleItem('sexo', d.label)}>
                      {porSexo.map((item, i) => (
                        <Cell
                          key={`s-${i}`}
                          fill={CHART_COLORS[i % CHART_COLORS.length]}
                          opacity={filtroSexo.size === 0 || filtroSexo.has(item.label) ? 1 : 0.35}
                        />
                      ))}
                      <LabelList dataKey="valor" position="top" style={{ fontSize: 11, fill: '#374151', fontWeight: 600 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Por pasto */}
              {porPasto.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-1">Mortes por pasto</h3>
                  <p className="text-[10px] text-gray-400 mb-3">Clique nas barras para filtrar</p>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={porPasto.slice(0, 12)} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#6B7280' }} allowDecimals={false} />
                      <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: '#6B7280' }} width={80} />
                      <Tooltip
                        formatter={(v: any) => [`${v} morte(s)`, '']}
                        contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}
                      />
                      <Bar dataKey="valor" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(d: any) => d?.label && toggleItem('pasto', d.label)}>
                        {porPasto.slice(0, 12).map((item, i) => (
                          <Cell
                            key={`p-${i}`}
                            fill={CHART_COLORS[i % CHART_COLORS.length]}
                            opacity={filtroPasto.size === 0 || filtroPasto.has(item.label) ? 1 : 0.35}
                          />
                        ))}
                        <LabelList dataKey="valor" position="right" style={{ fontSize: 11, fill: '#374151', fontWeight: 600 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Heatmap causa × categoria */}
            {heatmapCausaCategoria.causas.length > 0 && heatmapCausaCategoria.categorias.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-5 py-3" style={{ backgroundColor: GREEN_DARK }}>
                  <h2 className="text-base font-bold text-white">Causa × Categoria</h2>
                </div>
                <div className="overflow-x-auto p-4">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr>
                        <th className="text-left py-2 px-3 font-medium text-gray-600 sticky left-0 bg-white">Causa \ Categoria</th>
                        {heatmapCausaCategoria.categorias.map((cat) => (
                          <th key={cat} className="text-center py-2 px-2 font-medium text-gray-600 whitespace-nowrap">{cat}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {heatmapCausaCategoria.causas.map((causa) => (
                        <tr key={causa} className="border-t border-gray-100">
                          <td className="py-2 px-3 text-gray-900 font-medium whitespace-nowrap sticky left-0 bg-white">{causa}</td>
                          {heatmapCausaCategoria.categorias.map((cat) => {
                            const val = heatmapCausaCategoria.matriz[causa]?.[cat] || 0
                            const intensidade = val / heatmapCausaCategoria.maxVal
                            const bg = val === 0 ? 'transparent' : `rgba(15, 100, 55, ${0.15 + intensidade * 0.7})`
                            const corTexto = intensidade > 0.5 ? '#FFFFFF' : '#374151'
                            return (
                              <td
                                key={cat}
                                className="text-center py-2 px-2 cursor-pointer transition-colors hover:ring-2 hover:ring-green-400"
                                style={{ backgroundColor: bg, color: corTexto, fontWeight: val > 0 ? 600 : 400 }}
                                onClick={() => toggleItem('causa', causa)}
                                title={`${causa} × ${cat}: ${val} morte(s)`}
                              >
                                {val > 0 ? val : ''}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-[10px] text-gray-400 mt-3">Intensidade da cor proporcional ao número de mortes. Clique numa linha para filtrar por causa.</p>
                </div>
              </div>
            )}

            {/* Tabela de frequência de diagnósticos */}
            {frequenciaDiagnosticos.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-5 py-3" style={{ backgroundColor: GREEN_DARK }}>
                  <h2 className="text-base font-bold text-white">Frequência de diagnósticos</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left py-2.5 px-4 font-medium text-gray-600">Diagnóstico</th>
                        <th className="text-right py-2.5 px-3 font-medium text-gray-600">Mortes</th>
                        <th className="text-right py-2.5 px-3 font-medium text-gray-600">% do total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {frequenciaDiagnosticos.map((d, i) => {
                        const total = frequenciaDiagnosticos.reduce((s, x) => s + x.valor, 0)
                        const pct = total > 0 ? (d.valor / total) * 100 : 0
                        return (
                          <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                            <td className="py-2 px-4 text-gray-900 font-medium">{labelDiagnostico(d.label)}</td>
                            <td className="py-2 px-3 text-right text-gray-700">{d.valor}</td>
                            <td className="py-2 px-3 text-right text-gray-700">{pct.toFixed(1).replace('.', ',')}%</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tabela detalhada */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-5 py-3" style={{ backgroundColor: GREEN_DARK }}>
                <h2 className="text-base font-bold text-white">Detalhamento</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left py-2.5 px-3 font-medium text-gray-600">Data</th>
                      <th className="text-left py-2.5 px-3 font-medium text-gray-600">Lote</th>
                      <th className="text-left py-2.5 px-3 font-medium text-gray-600">Pasto</th>
                      <th className="text-left py-2.5 px-3 font-medium text-gray-600">Sexo</th>
                      <th className="text-left py-2.5 px-3 font-medium text-gray-600">Idade</th>
                      <th className="text-right py-2.5 px-3 font-medium text-gray-600">Peso (kg)</th>
                      <th className="text-left py-2.5 px-3 font-medium text-gray-600">Categoria</th>
                      <th className="text-left py-2.5 px-3 font-medium text-gray-600">Causa</th>
                      <th className="text-left py-2.5 px-3 font-medium text-gray-600">Brinco</th>
                      <th className="text-left py-2.5 px-3 font-medium text-gray-600">Diagnósticos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhasFiltradas.slice(0, 200).map((l, i) => {
                      const diagS = l.diagnosticos
                        ? Object.entries(l.diagnosticos)
                            .filter(([, v]) => v?.valor === 'S')
                            .map(([k]) => labelDiagnostico(k))
                        : []
                      const diagTxt = diagS.length === 0 ? '—' : diagS.length > 3 ? `${diagS.slice(0, 3).join(', ')}...` : diagS.join(', ')
                      return (
                        <tr key={`${l.id}-${i}`} className="border-t border-gray-100 hover:bg-gray-50">
                          <td className="py-2 px-3 text-gray-700 whitespace-nowrap">{formatarData(l.data)}</td>
                          <td className="py-2 px-3 text-gray-900 font-medium">{l.lote_nome ?? '—'}</td>
                          <td className="py-2 px-3 text-gray-700">{l.pasto ?? '—'}</td>
                          <td className="py-2 px-3 text-gray-700">{l.sexo ?? '—'}</td>
                          <td className="py-2 px-3 text-gray-700">{l.idade ?? '—'}</td>
                          <td className="py-2 px-3 text-right text-gray-700">{formatarNumero(l.peso_vivo, 0)}</td>
                          <td className="py-2 px-3 text-gray-700">{l.categoria ?? '—'}</td>
                          <td className="py-2 px-3 text-gray-700">{l.causa_morte ?? '—'}</td>
                          <td className="py-2 px-3 text-gray-700">{l.brinco ?? '—'}</td>
                          <td className="py-2 px-3 text-gray-700 text-xs max-w-xs">{diagTxt}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {linhasFiltradas.length > 200 && (
                  <div className="px-4 py-3 text-center text-xs text-gray-500 bg-gray-50">
                    Mostrando 200 de {linhasFiltradas.length} registros. Exporte o PDF para ver todos.
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {/* Modal de preços por categoria */}
      {mostrarPrecos && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setMostrarPrecos(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header do modal */}
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white rounded-t-xl">
              <div>
                <h2 className="text-base font-bold text-gray-900">Preços por categoria</h2>
                <p className="text-xs text-gray-500 mt-0.5">Valor por kg vivo (R$/kg)</p>
              </div>
              <button
                onClick={() => setMostrarPrecos(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Corpo do modal */}
            <div className="px-5 py-4 space-y-4">
              {/* Tabela de preços editáveis */}
              <div>
                <p className="text-xs font-medium text-gray-700 mb-2">Preços por kg vivo (R$)</p>
                <div className="space-y-1.5">
                  {Object.entries(precosKg).map(([cat, preco]) => (
                    <div key={cat} className="flex items-center justify-between gap-2">
                      <span className="text-sm text-gray-700">{cat}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-400">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={preco}
                          onChange={(e) => setPrecosKg((prev) => ({ ...prev, [cat]: parseFloat(e.target.value) || 0 }))}
                          className="w-20 text-sm text-right rounded border border-gray-300 px-2 py-1 focus:border-green-600 focus:ring-1 focus:ring-green-600"
                        />
                        <span className="text-xs text-gray-400">/kg</span>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
                    <span className="text-sm text-gray-500 font-medium">Outras categorias</span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={PRECO_KG_FALLBACK}
                        disabled
                        className="w-20 text-sm text-right rounded border border-gray-200 px-2 py-1 bg-gray-50 text-gray-400"
                      />
                      <span className="text-xs text-gray-400">/kg</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setPrecosKg({ ...PRECOS_KG_DEFAULT })}
                  className="text-xs text-gray-400 hover:text-gray-600 mt-3"
                >
                  Restaurar defaults de mercado (não persiste)
                </button>
              </div>

              {/* Detalhamento do impacto por categoria */}
              {Object.keys(impactoFinanceiro.porCategoria).length > 0 && (
                <div className="pt-3 border-t border-gray-100">
                  <p className="text-xs font-medium text-gray-700 mb-2">Impacto por categoria</p>
                  <div className="space-y-1.5">
                    {Object.entries(impactoFinanceiro.porCategoria)
                      .sort(([, a], [, b]) => b.perda - a.perda)
                      .map(([cat, dados]) => (
                        <div key={cat} className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">{cat} ({dados.count} {dados.count === 1 ? 'morte' : 'mortes'}, {formatarNumero(dados.peso, 0)} kg)</span>
                          <span className="text-gray-900 font-medium">
                            R$ {dados.perda.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      ))}
                    <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-100">
                      <span className="text-gray-900 font-bold">Total</span>
                      <span className="font-bold" style={{ color: '#EF4444' }}>
                        R$ {perdaEstimada.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Fontes consultadas */}
              <div className="pt-3 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-700 mb-2">Fontes dos preços de referência</p>
                <div className="space-y-2 text-xs text-gray-500 leading-relaxed">
                  <p>
                    Padrões baseados em cotações de agosto/2026, convertidas para R$/kg vivo
                    (R$/arroba &divide; 15 kg &times; rendimento de carca&ccedil;a ~50%).
                  </p>
                  <ul className="space-y-1 pl-3">
                    <li>
                      <span className="font-medium text-gray-600">Scot Consultoria</span>
                      {' '}
                      <a href="https://www.scotconsultoria.com.br/cotacoes/boi-gordo/" target="_blank" rel="noopener noreferrer" className="text-green-700 hover:text-green-800 underline">
                        scotconsultoria.com.br/cotacoes/boi-gordo
                      </a>
                      {' '}
                      <span className="text-gray-400">cota&ccedil;&otilde;es boi gordo, novilha e vaca por estado</span>
                    </li>
                    <li>
                      <span className="font-medium text-gray-600">CEPEA/ESALQ-USP</span>
                      {' '}
                      <a href="https://www.cepea.esalq.usp.br/br/indicador/boi-gordo.aspx" target="_blank" rel="noopener noreferrer" className="text-green-700 hover:text-green-800 underline">
                        cepea.esalq.usp.br
                      </a>
                      {' '}
                      <span className="text-gray-400">indicador nacional boi gordo</span>
                    </li>
                    <li>
                      <span className="font-medium text-gray-600">Agrifatto</span>
                      {' '}
                      <span className="text-gray-400">cota&ccedil;&otilde;es di&aacute;rias em 17 pra&ccedil;as (via Portal DBO)</span>
                    </li>
                    <li>
                      <span className="font-medium text-gray-600">FarmNews</span>
                      {' '}
                      <a href="https://farmnews.com.br/mercado/preco-do-boi-gordo-e-do-bezerro-em-2026-analise-e-dados-em-agosto-10/" target="_blank" rel="noopener noreferrer" className="text-green-700 hover:text-green-800 underline">
                        farmnews.com.br
                      </a>
                      {' '}
                      <span className="text-gray-400">pre&ccedil;o do bezerro (reposi&ccedil;&atilde;o)</span>
                    </li>
                  </ul>
                  <p className="text-gray-400 pt-1">
                    Bezerro e bezerra usam valor de reposi&ccedil;&atilde;o (~R$ 500/@ ou R$ 3.355/cabe&ccedil;a).
                    Touro usa premium gen&eacute;tico. Garrote e boi magro s&atilde;o estimativas intermedi&aacute;rias
                    sem cota&ccedil;&atilde;o direta. Pre&ccedil;os variam por estado, semana e categoria; ajuste conforme sua realidade.
                  </p>
                </div>
              </div>
            </div>

            {/* Footer do modal */}
            <div className="px-5 py-3 border-t border-gray-200 flex justify-end sticky bottom-0 bg-white rounded-b-xl">
              <button
                onClick={() => setMostrarPrecos(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg text-white hover:opacity-90 transition-opacity"
                style={{ backgroundColor: GREEN_DARK }}
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
