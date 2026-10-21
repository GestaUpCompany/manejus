import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@gestaup/supabase'
import { BarChart, Bar, Cell, ComposedChart, Area, Line, LabelList, ReferenceLine, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import logoManejus from '/images/manejus360.png'
import { ordenarPeriodo } from '../../features/relatorioGeral/periodo'
import { gerarRelatorioClimaPDFPuppeteer } from '../../utils/relatorioClimaPDFPuppeteer'

const GREEN_DARK = '#0F6437'
const COR_ACIMA_MEDIA = '#1E3A5F'
const COR_ABAIXO_MEDIA = '#8FB3A0'
const TEMP_COLOR = '#EF4444'

const CHART_NO_FOCUS_CSS = `
.recharts-surface {
  outline: none !important;
  box-shadow: none !important;
  border: none !important;
  -webkit-tap-highlight-color: transparent !important;
}
.recharts-surface:focus,
.recharts-surface:focus-visible,
.recharts-surface *:focus,
.recharts-surface *:focus-visible {
  outline: none !important;
  box-shadow: none !important;
}
.recharts-wrapper, .recharts-bar-rectangle, .recharts-bar-rectangle * {
  outline: none !important;
}
.recharts-active-dot { display: none !important; }
`

interface RelatorioInfo {
  fazenda_id: string
  titulo: string
  tipo: string
  fazenda_nome?: string
  fazenda_logo_url?: string | null
}

export interface PluviometroDisponivel {
  pluviometro_id: string
  pluviometro_nome: string
  pluviometro_localizacao: string | null
}

export interface LeituraClima {
  registro_id: string
  data: string
  horario: string | null
  pluviometro_id: string | null
  pluviometro_nome: string | null
  pluviometro_localizacao: string | null
  medicao_mm: number | null
  temperatura: number | null
  temperatura_media: number | null
  umidade_relativa: number | null
  responsavel: string | null
  nome_usuario: string | null
  observacao: string | null
}

interface DadosRelatorioClima {
  fazenda_nome?: string
  fazenda_logo_url?: string | null
  timezone?: string
  pluviometros_disponiveis: PluviometroDisponivel[]
  registros: LeituraClima[]
}

export interface ResumoPluviometro {
  pluviometro_id: string
  pluviometro_nome: string
  pluviometro_localizacao: string | null
  n_medicoes: number
  mm_total: number
  mm_medio: number | null
  maior_leitura: number | null
  temp_min: number | null
  temp_max: number | null
}

export interface PontoSerieClima {
  data: string
  data_label: string
  temp_media: number | null
  // Acumulado até a data: média dos pluviômetros (fazenda) e menor/maior região
  acum_fazenda: number
  acum_min: number
  acum_max: number
}

// Cada pluviômetro representa uma região: a visão geral da fazenda é a média
// dos pluviômetros, nunca a soma.
export interface KpisClima {
  // Chuva acumulada da fazenda: média das acumuladas dos pluviômetros com leitura no período
  mm_total: number
  n_pluviometros: number
  n_leituras: number
  dias_com_chuva: number
  temp_media: number | null
  temp_min: number | null
  temp_max: number | null
  umidade_media: number | null
}

interface Props {
  token: string
  relatorioInfo: RelatorioInfo
}

function formatarData(iso: string): string {
  if (!iso) return '—'
  const partes = iso.split('T')[0].split('-')
  if (partes.length === 3) return `${partes[2]}/${partes[1]}/${partes[0]}`
  return iso
}

function dataLabel(iso: string): string {
  const partes = iso.split('-')
  return partes.length === 3 ? `${partes[2]}/${partes[1]}` : iso
}

function fmtNum(v: number | null | undefined, casas = 1): string {
  if (v === null || v === undefined || isNaN(v)) return '—'
  return v.toFixed(casas).replace('.', ',')
}

function chavePluviometro(r: LeituraClima): string {
  return r.pluviometro_id || r.pluviometro_nome || 'desconhecido'
}

export function calcularKpis(registros: LeituraClima[]): KpisClima {
  const acumuladoPorPluviometro = new Map<string, number>()
  for (const r of registros) {
    const key = chavePluviometro(r)
    acumuladoPorPluviometro.set(key, (acumuladoPorPluviometro.get(key) ?? 0) + (Number(r.medicao_mm) || 0))
  }
  const nPluviometros = acumuladoPorPluviometro.size
  const mmTotal = nPluviometros
    ? Array.from(acumuladoPorPluviometro.values()).reduce((s, v) => s + v, 0) / nPluviometros
    : 0
  const diasComChuva = new Set(
    registros.filter((r) => (Number(r.medicao_mm) || 0) > 0).map((r) => r.data),
  ).size
  const temps = registros.map((r) => r.temperatura).filter((t): t is number => t !== null && t !== undefined)
  const umidades = registros.map((r) => r.umidade_relativa).filter((u): u is number => u !== null && u !== undefined)
  return {
    mm_total: mmTotal,
    n_pluviometros: nPluviometros,
    n_leituras: registros.length,
    dias_com_chuva: diasComChuva,
    temp_media: temps.length ? temps.reduce((s, t) => s + t, 0) / temps.length : null,
    temp_min: temps.length ? Math.min(...temps) : null,
    temp_max: temps.length ? Math.max(...temps) : null,
    umidade_media: umidades.length ? umidades.reduce((s, u) => s + u, 0) / umidades.length : null,
  }
}

export function resumirPorPluviometro(registros: LeituraClima[]): ResumoPluviometro[] {
  const map = new Map<string, LeituraClima[]>()
  for (const r of registros) {
    const key = chavePluviometro(r)
    const arr = map.get(key) || []
    arr.push(r)
    map.set(key, arr)
  }
  return Array.from(map.entries()).map(([key, regs]) => {
    const mms = regs.map((r) => Number(r.medicao_mm)).filter((v) => !isNaN(v))
    const temps = regs.map((r) => r.temperatura).filter((t): t is number => t !== null && t !== undefined)
    const first = regs[0]
    return {
      pluviometro_id: key,
      pluviometro_nome: first.pluviometro_nome || '—',
      pluviometro_localizacao: first.pluviometro_localizacao,
      n_medicoes: regs.length,
      mm_total: mms.reduce((s, v) => s + v, 0),
      mm_medio: mms.length ? mms.reduce((s, v) => s + v, 0) / mms.length : null,
      maior_leitura: mms.length ? Math.max(...mms) : null,
      temp_min: temps.length ? Math.min(...temps) : null,
      temp_max: temps.length ? Math.max(...temps) : null,
    }
  }).sort((a, b) => b.mm_total - a.mm_total)
}

// Linha "Fazenda" do resumo: média dos pluviômetros (a soma dos totais não
// representa a fazenda, cada pluviômetro é uma região).
// "279,0 mm  ▲ +38,7" / "204,0 mm  ▼ -36,3": a posição em relação à média vai no
// texto (símbolo + sinal), não só na cor da barra.
export function rotuloBarra(mm: number, media: number, comparar: boolean): string {
  const base = `${fmtNum(mm)} mm`
  if (!comparar) return base
  const dif = mm - media
  if (Math.abs(dif) < 0.05) return `${base}  = média`
  return `${base}  ${dif > 0 ? '▲ +' : '▼ -'}${fmtNum(Math.abs(dif))}`
}

export function resumirFazenda(resumo: ResumoPluviometro[]) {
  const n = resumo.length
  const media = (vals: number[]) => (vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null)
  return {
    n_pluviometros: n,
    n_medicoes: resumo.reduce((s, r) => s + r.n_medicoes, 0),
    mm_total: media(resumo.map((r) => r.mm_total)) ?? 0,
    mm_medio: media(resumo.map((r) => r.mm_medio).filter((v): v is number => v !== null)),
    maior_leitura: resumo.reduce<number | null>(
      (m, r) => (r.maior_leitura === null ? m : m === null ? r.maior_leitura : Math.max(m, r.maior_leitura)),
      null,
    ),
  }
}

// Evolução da chuva acumulada: um ponto por data com leitura. O acumulado de
// cada pluviômetro vai somando (e é carregado nos dias sem leitura dele); a
// fazenda é a média sobre os pluviômetros com leitura no período, o mesmo
// denominador do KPI, então o último ponto é igual à "Chuva acumulada".
export function serieDiaria(registros: LeituraClima[]): PontoSerieClima[] {
  const acumulado = new Map<string, number>()
  for (const r of registros) acumulado.set(chavePluviometro(r), 0)
  const byDia = new Map<string, LeituraClima[]>()
  for (const r of registros) {
    const arr = byDia.get(r.data) || []
    arr.push(r)
    byDia.set(r.data, arr)
  }
  const arred = (v: number) => Number(v.toFixed(2))
  return Array.from(byDia.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, regs]) => {
      for (const r of regs) {
        const key = chavePluviometro(r)
        acumulado.set(key, (acumulado.get(key) ?? 0) + (Number(r.medicao_mm) || 0))
      }
      const valores = Array.from(acumulado.values())
      const temps = regs.map((r) => r.temperatura_media ?? r.temperatura).filter((t): t is number => t !== null && t !== undefined)
      return {
        data,
        data_label: dataLabel(data),
        temp_media: temps.length ? arred(temps.reduce((s, t) => s + t, 0) / temps.length) : null,
        acum_fazenda: arred(valores.reduce((s, v) => s + v, 0) / valores.length),
        acum_min: arred(Math.min(...valores)),
        acum_max: arred(Math.max(...valores)),
      }
    })
}

// Limites de intensidade (mm em um dia, num mesmo pluviômetro). Ajustáveis aqui.
export const LIMITE_CHUVA_FORTE_MM = 25
export const LIMITE_CHUVA_TORRENCIAL_MM = 50

export type NivelChuva = 'normal' | 'forte' | 'torrencial'

// Cores do calendário: três tons de azul com luminosidade bem diferente (e símbolo no
// próprio quadrado), para continuar legível em impressão preto e branco.
export const ESTILO_NIVEL: Record<NivelChuva, { fundo: string; texto: string; borda: string }> = {
  normal: { fundo: '#DCE8F2', texto: '#1F2937', borda: '#9DB7CE' },
  forte: { fundo: '#6F9BC8', texto: '#0F172A', borda: '#1E3A5F' },
  torrencial: { fundo: '#1E3A5F', texto: '#FFFFFF', borda: '#0F172A' },
}

export interface PontoChuvaDiaria {
  data: string
  data_label: string
  // Soma do dia dividida pelos pluviômetros do período (as barras somam o acumulado da fazenda)
  mm_fazenda: number
  // Maior total do dia em UMA região: é ele que revela chuva localizada e torrencial
  mm_max_regiao: number
  regiao_max: string
  nivel: NivelChuva
}

export interface ResumoEventosChuva {
  dias_forte: number
  dias_torrencial: number
  maior: { mm: number; regiao: string; data: string } | null
}

export function nivelDaChuva(mm: number): NivelChuva {
  if (mm >= LIMITE_CHUVA_TORRENCIAL_MM) return 'torrencial'
  if (mm >= LIMITE_CHUVA_FORTE_MM) return 'forte'
  return 'normal'
}

// Distribuição diária: uma barra por data com leitura (média da fazenda) e um
// marcador com a maior leitura de uma região, classificada por intensidade.
export function serieChuvaDiaria(registros: LeituraClima[]): PontoChuvaDiaria[] {
  const nPluviometros = new Set(registros.map(chavePluviometro)).size
  const porDia = new Map<string, Map<string, { mm: number; nome: string }>>()
  for (const r of registros) {
    const regioes = porDia.get(r.data) ?? new Map<string, { mm: number; nome: string }>()
    const key = chavePluviometro(r)
    const atual = regioes.get(key) ?? { mm: 0, nome: r.pluviometro_nome || '—' }
    atual.mm += Number(r.medicao_mm) || 0
    regioes.set(key, atual)
    porDia.set(r.data, regioes)
  }
  const arred = (v: number) => Number(v.toFixed(2))
  return Array.from(porDia.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, regioes]) => {
      const lista = Array.from(regioes.values())
      const maior = lista.reduce((m, r) => (r.mm > m.mm ? r : m), lista[0])
      return {
        data,
        data_label: dataLabel(data),
        mm_fazenda: nPluviometros ? arred(lista.reduce((s, r) => s + r.mm, 0) / nPluviometros) : 0,
        mm_max_regiao: arred(maior.mm),
        regiao_max: maior.nome,
        nivel: nivelDaChuva(maior.mm),
      }
    })
}

export function resumirEventosChuva(diaria: PontoChuvaDiaria[]): ResumoEventosChuva {
  const maior = diaria.reduce<PontoChuvaDiaria | null>((m, p) => (m === null || p.mm_max_regiao > m.mm_max_regiao ? p : m), null)
  return {
    dias_forte: diaria.filter((p) => p.nivel === 'forte').length,
    dias_torrencial: diaria.filter((p) => p.nivel === 'torrencial').length,
    maior: maior && maior.mm_max_regiao > 0 ? { mm: maior.mm_max_regiao, regiao: maior.regiao_max, data: maior.data } : null,
  }
}

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const MESES_NOME = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

export interface PontoChuvaMensal {
  mes: string // YYYY-MM
  mes_label: string // abr/26
  // Média dos pluviômetros no mês (mesmo denominador do KPI: as barras somam o acumulado da fazenda)
  mm_fazenda: number
  // Região que menos e que mais acumulou no mês (pluviômetro sem leitura no mês conta 0)
  mm_min: number
  mm_max: number
}

// Chuva por mês, do primeiro ao último mês com leitura; meses sem leitura entram
// com 0 para a distribuição ao longo do ano ficar contínua no gráfico.
export function serieChuvaMensal(registros: LeituraClima[]): PontoChuvaMensal[] {
  if (registros.length === 0) return []
  const chaves = Array.from(new Set(registros.map(chavePluviometro)))
  const porMes = new Map<string, Map<string, number>>()
  for (const r of registros) {
    const mes = r.data.slice(0, 7)
    const regioes = porMes.get(mes) ?? new Map<string, number>()
    const key = chavePluviometro(r)
    regioes.set(key, (regioes.get(key) ?? 0) + (Number(r.medicao_mm) || 0))
    porMes.set(mes, regioes)
  }
  const meses = Array.from(porMes.keys()).sort()
  const [anoIni, mesIni] = meses[0].split('-').map(Number)
  const [anoFim, mesFim] = meses[meses.length - 1].split('-').map(Number)
  const arred = (v: number) => Number(v.toFixed(2))
  const pontos: PontoChuvaMensal[] = []
  let a = anoIni
  let m = mesIni
  while (a < anoFim || (a === anoFim && m <= mesFim)) {
    const mes = `${a}-${String(m).padStart(2, '0')}`
    const regioes = porMes.get(mes)
    const valores = chaves.map((k) => regioes?.get(k) ?? 0)
    pontos.push({
      mes,
      mes_label: `${MESES_ABREV[m - 1]}/${String(a).slice(2)}`,
      mm_fazenda: arred(valores.reduce((s, v) => s + v, 0) / valores.length),
      mm_min: arred(Math.min(...valores)),
      mm_max: arred(Math.max(...valores)),
    })
    if (m === 12) {
      a += 1
      m = 1
    } else {
      m += 1
    }
  }
  return pontos
}

export interface CelulaCalendario {
  dia: number
  ponto: PontoChuvaDiaria | null // null = sem leitura registrada nesse dia
}

export interface MesCalendario {
  chave: string // YYYY-MM
  titulo: string // Outubro de 2026
  semanas: (CelulaCalendario | null)[][] // semanas de domingo a sábado; null = fora do mês
}

// Um calendário por mês, do primeiro ao último dia com leitura. Se passar de
// `maxMeses`, ficam os mais recentes e `omitidos` diz quantos ficaram de fora.
export function montarCalendario(diaria: PontoChuvaDiaria[], maxMeses = 12): { meses: MesCalendario[]; omitidos: number } {
  if (diaria.length === 0) return { meses: [], omitidos: 0 }
  const porData = new Map(diaria.map((p) => [p.data, p]))
  const [anoIni, mesIni] = diaria[0].data.slice(0, 7).split('-').map(Number)
  const [anoFim, mesFim] = diaria[diaria.length - 1].data.slice(0, 7).split('-').map(Number)
  const todos: MesCalendario[] = []
  let a = anoIni
  let m = mesIni
  while (a < anoFim || (a === anoFim && m <= mesFim)) {
    const diasNoMes = new Date(Date.UTC(a, m, 0)).getUTCDate()
    const primeiroDiaSemana = new Date(Date.UTC(a, m - 1, 1)).getUTCDay() // 0 = domingo
    const celulas: (CelulaCalendario | null)[] = Array.from({ length: primeiroDiaSemana }, () => null)
    for (let dia = 1; dia <= diasNoMes; dia++) {
      const iso = `${a}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
      celulas.push({ dia, ponto: porData.get(iso) ?? null })
    }
    while (celulas.length % 7 !== 0) celulas.push(null)
    const semanas: (CelulaCalendario | null)[][] = []
    for (let i = 0; i < celulas.length; i += 7) semanas.push(celulas.slice(i, i + 7))
    todos.push({ chave: `${a}-${String(m).padStart(2, '0')}`, titulo: `${MESES_NOME[m - 1]} de ${a}`, semanas })
    if (m === 12) {
      a += 1
      m = 1
    } else {
      m += 1
    }
  }
  const omitidos = Math.max(0, todos.length - maxMeses)
  return { meses: todos.slice(omitidos), omitidos }
}

export function RelatorioClimaPublico({ token, relatorioInfo }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dados, setDados] = useState<DadosRelatorioClima | null>(null)
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [filtroPluviometro, setFiltroPluviometro] = useState<Set<string>>(new Set())
  const [dropdownAberto, setDropdownAberto] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [exportandoPDF, setExportandoPDF] = useState(false)

  const carregarDados = useCallback(async () => {
    if (!token) return
    try {
      setLoading(true)
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('get_dados_relatorio_clima', {
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

      setDados(rpcData?.dados as DadosRelatorioClima)
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
    if (!dropdownAberto) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownAberto(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownAberto])

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
  }, [dados, filtroPluviometro, dataInicio, dataFim])

  const registrosFiltrados = useMemo(() => {
    if (!dados) return []
    if (filtroPluviometro.size === 0) return dados.registros
    return dados.registros.filter((r) => r.pluviometro_id && filtroPluviometro.has(r.pluviometro_id))
  }, [dados, filtroPluviometro])

  const pluviometrosSelecionados = useMemo(() => {
    const disponiveis = dados?.pluviometros_disponiveis || []
    if (filtroPluviometro.size === 0) return disponiveis
    return disponiveis.filter((p) => filtroPluviometro.has(p.pluviometro_id))
  }, [dados, filtroPluviometro])

  const nomesPluviometros = useMemo(
    () => pluviometrosSelecionados.map((p) => p.pluviometro_nome || '—'),
    [pluviometrosSelecionados],
  )

  const kpis = useMemo(() => calcularKpis(registrosFiltrados), [registrosFiltrados])
  const resumo = useMemo(() => resumirPorPluviometro(registrosFiltrados), [registrosFiltrados])
  const resumoFazenda = useMemo(() => resumirFazenda(resumo), [resumo])
  const serie = useMemo(() => serieDiaria(registrosFiltrados), [registrosFiltrados])
  // A faixa (mín. a máx. entre pluviômetros) vira um par para o <Area> do recharts
  // `ts` posiciona cada data na proporção real do tempo (o eixo não espaça por igual)
  const diaria = useMemo(() => serieChuvaDiaria(registrosFiltrados), [registrosFiltrados])
  const eventos = useMemo(() => resumirEventosChuva(diaria), [diaria])
  const mensal = useMemo(() => serieChuvaMensal(registrosFiltrados), [registrosFiltrados])
  const calendario = useMemo(() => montarCalendario(diaria), [diaria])
  const serieGrafico = useMemo(
    () => serie.map((p) => ({ ...p, ts: Date.parse(`${p.data}T00:00:00Z`), faixa: [p.acum_min, p.acum_max] })),
    [serie],
  )
  // Rótulo com a diferença para a média (▲/▼ + sinal), para não depender de cor em impressão P&B
  const dadosBarras = useMemo(
    () => resumo.map((r) => ({ ...r, rotulo: rotuloBarra(r.mm_total, kpis.mm_total, resumo.length > 1) })),
    [resumo, kpis.mm_total],
  )

  // Sem registros de temperatura/umidade no período, os cards, a linha do
  // gráfico e as colunas correspondentes ficam ocultos.
  const temTemperatura = useMemo(
    () => registrosFiltrados.some((r) => r.temperatura != null || r.temperatura_media != null),
    [registrosFiltrados],
  )
  const temUmidade = useMemo(
    () => registrosFiltrados.some((r) => r.umidade_relativa != null),
    [registrosFiltrados],
  )

  const kpiCards = [
    {
      label: kpis.n_pluviometros > 1 ? `Chuva acumulada (média de ${kpis.n_pluviometros} pluviômetros)` : 'Chuva acumulada',
      value: `${fmtNum(kpis.mm_total, 1)} mm`,
    },
    { label: 'Leituras', value: kpis.n_leituras.toString() },
    { label: 'Dias com chuva', value: kpis.dias_com_chuva.toString() },
    ...(temTemperatura
      ? [
          { label: 'Temp. média', value: kpis.temp_media !== null ? `${fmtNum(kpis.temp_media)}°C` : '—' },
          { label: 'Temp. mínima', value: kpis.temp_min !== null ? `${fmtNum(kpis.temp_min)}°C` : '—' },
          { label: 'Temp. máxima', value: kpis.temp_max !== null ? `${fmtNum(kpis.temp_max)}°C` : '—' },
        ]
      : []),
    ...(temUmidade
      ? [{ label: 'Umidade média', value: kpis.umidade_media !== null ? `${fmtNum(kpis.umidade_media, 0)}%` : '—' }]
      : []),
  ]
  const kpiGridCols =
    ({ 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 6: 'lg:grid-cols-6', 7: 'lg:grid-cols-7' } as Record<number, string>)[
      kpiCards.length
    ] || 'lg:grid-cols-7'

  const temFiltrosAtivos = filtroPluviometro.size > 0 || dataInicio || dataFim

  const limparFiltros = () => {
    setDataInicio('')
    setDataFim('')
    setFiltroPluviometro(new Set())
  }

  const togglePluviometro = (id: string) => {
    setFiltroPluviometro((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllPluviometros = () => {
    if (!dados) return
    if (filtroPluviometro.size === dados.pluviometros_disponiveis.length) {
      setFiltroPluviometro(new Set())
    } else {
      setFiltroPluviometro(new Set(dados.pluviometros_disponiveis.map((p) => p.pluviometro_id)))
    }
  }

  const exportarPDF = async () => {
    if (!dados || registrosFiltrados.length === 0) return
    try {
      setExportandoPDF(true)
      const datas = serie.map((p) => p.data).sort()
      const blob = await gerarRelatorioClimaPDFPuppeteer({
        dataInicio: dataInicio || datas[0] || '',
        dataFim: dataFim || datas[datas.length - 1] || '',
        fazendaNome: relatorioInfo.fazenda_nome || '',
        fazendaLogoUrl: relatorioInfo.fazenda_logo_url,
        kpis,
        pluviometros: nomesPluviometros,
        serie,
        diaria,
        mensal,
        limites: { forte: LIMITE_CHUVA_FORTE_MM, torrencial: LIMITE_CHUVA_TORRENCIAL_MM },
        resumo,
        registros: registrosFiltrados,
      })

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const nomeFazenda = relatorioInfo.fazenda_nome || 'Fazenda'
      link.download = `Gesta'Up - Relatório de Clima ${nomeFazenda}.pdf`
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
            <img src={logoManejus} alt="Manejus 360" loading="eager" className="h-12" />
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
            <img src={logoManejus} alt="Manejus 360" loading="eager" className="h-12 mx-auto" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Relatório indisponível</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F5' }}>
      <style>{CHART_NO_FOCUS_CSS}</style>
      <header className="sticky top-0 z-10" style={{ backgroundColor: GREEN_DARK }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="bg-white rounded-lg p-1 flex items-center justify-center">
                <img src={logoManejus} alt="Manej'Us 360" loading="eager" className="h-8 w-auto" />
              </div>
              <h1 className="text-sm sm:text-base font-bold text-white hidden sm:block">
                Manej'Us <span className="text-yellow-500">360</span>
              </h1>
            </div>

            <div className="bg-white rounded-full px-5 py-1.5 shadow-sm flex-1 max-w-md text-center">
              <h2 className="text-sm font-bold leading-tight" style={{ color: GREEN_DARK }}>
                {relatorioInfo?.titulo || 'Relatório de Clima'}
              </h2>
              {relatorioInfo?.fazenda_nome && (
                <p className="text-[10px] text-gray-500 leading-tight">{relatorioInfo.fazenda_nome}</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {relatorioInfo?.fazenda_logo_url && (
                <div className="bg-white rounded-lg p-1 flex items-center justify-center">
                  <img src={relatorioInfo.fazenda_logo_url} alt={relatorioInfo?.fazenda_nome || 'Fazenda'} loading="eager" className="h-8 w-auto max-w-[80px] object-contain" />
                </div>
              )}
              <button
                onClick={exportarPDF}
                disabled={exportandoPDF || registrosFiltrados.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                style={{ color: GREEN_DARK }}
                title="Exportar PDF com os filtros atuais"
              >
                {exportandoPDF ? (
                  <>
                    <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2" style={{ borderColor: GREEN_DARK }}></div>
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

      {/* KPIs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className={`grid grid-cols-2 sm:grid-cols-3 ${kpiGridCols} gap-2 sm:gap-3`}>
          {kpiCards.map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-lg p-2.5 text-center text-white shadow-sm"
              style={{ backgroundColor: GREEN_DARK }}
            >
              <p className="text-base sm:text-lg font-bold leading-tight">{kpi.value}</p>
              <p className="text-[10px] sm:text-xs opacity-90 leading-tight mt-0.5">{kpi.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Slicers */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data início</label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => {
                  const [ini, fim] = ordenarPeriodo(e.target.value, dataFim)
                  setDataInicio(ini)
                  setDataFim(fim)
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:ring-1 focus:ring-green-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Data fim</label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => {
                  const [ini, fim] = ordenarPeriodo(dataInicio, e.target.value)
                  setDataInicio(ini)
                  setDataFim(fim)
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:ring-1 focus:ring-green-600"
              />
            </div>
            <div className="relative" ref={dropdownRef}>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Pluviômetro {filtroPluviometro.size > 0 && <span className="text-green-600">● {filtroPluviometro.size}</span>}
              </label>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setDropdownAberto(!dropdownAberto)
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-left bg-white focus:border-green-600 focus:ring-1 focus:ring-green-600 flex items-center justify-between"
              >
                <span className={filtroPluviometro.size > 0 ? 'text-gray-900' : 'text-gray-400'}>
                  {filtroPluviometro.size === 0
                    ? 'Todos'
                    : filtroPluviometro.size === 1
                      ? pluviometrosSelecionados[0]?.pluviometro_nome || '—'
                      : `${filtroPluviometro.size} selecionados`}
                </span>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {dropdownAberto && (
                <div
                  className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg p-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-100">
                    <button
                      onClick={toggleAllPluviometros}
                      className="text-xs text-green-700 hover:text-green-800 font-medium"
                    >
                      {filtroPluviometro.size === (dados?.pluviometros_disponiveis.length ?? 0) ? 'Desmarcar todos' : 'Selecionar todos'}
                    </button>
                  </div>
                  {(dados?.pluviometros_disponiveis || []).map((p) => (
                    <label
                      key={p.pluviometro_id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={filtroPluviometro.has(p.pluviometro_id)}
                        onChange={() => togglePluviometro(p.pluviometro_id)}
                        className="rounded border-gray-300 text-green-600 focus:ring-green-600"
                      />
                      <span className="text-gray-700">
                        {p.pluviometro_nome}
                        {p.pluviometro_localizacao && <span className="text-gray-400"> · {p.pluviometro_localizacao}</span>}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          {temFiltrosAtivos ? (
            <div className="flex items-center justify-end mt-2">
              <button
                onClick={limparFiltros}
                className="text-xs text-gray-500 hover:text-gray-700 underline"
              >
                Limpar filtros
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Gráfico 1: acumulado de cada pluviômetro (região) x média da fazenda */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900">Chuva acumulada por pluviômetro × média da fazenda</h2>
          <p className="text-xs text-gray-500 mb-4">
            Cada barra é uma região; a linha tracejada é a média da fazenda ({fmtNum(kpis.mm_total, 1)} mm).
          </p>
          {resumo.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(200, resumo.length * 34 + 80)}>
              <BarChart data={dadosBarras} layout="vertical" margin={{ top: 32, right: 10, left: 0, bottom: 5 }} style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#666' }} unit=" mm" domain={[0, (max: number) => Math.ceil(max * 1.1)]} />
                <YAxis yAxisId="nome" type="category" dataKey="pluviometro_nome" width={90} tick={{ fontSize: 12, fill: '#374151' }} />
                {/* valores numa coluna à direita: a linha da média nunca passa por cima deles */}
                <YAxis yAxisId="valor" orientation="right" type="category" dataKey="rotulo" width={150} axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 600, fill: '#111827' }} />
                <Tooltip
                  formatter={((value: any) => [`${fmtNum(Number(value))} mm`, 'Acumulado']) as any}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                />
                <Bar yAxisId="nome" dataKey="mm_total" name="Acumulado" radius={[0, 4, 4, 0]} barSize={20}>
                  {resumo.map((r) => (
                    <Cell key={r.pluviometro_id} fill={r.mm_total >= kpis.mm_total ? COR_ACIMA_MEDIA : COR_ABAIXO_MEDIA} />
                  ))}
                </Bar>
                {resumo.length > 1 && (
                  <ReferenceLine
                    yAxisId="nome"
                    x={kpis.mm_total}
                    stroke="#111827"
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    label={{ value: `Média ${fmtNum(kpis.mm_total, 1)} mm`, position: 'top', fontSize: 12, fontWeight: 700, fill: '#111827' }}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-gray-400 text-sm">
              Sem dados para os filtros selecionados
            </div>
          )}
          {resumo.length > 1 && (
            <p className="mt-2 text-xs text-gray-600">
              ▲ acima da média da fazenda · ▼ abaixo da média (diferença em mm, ao lado de cada valor)
            </p>
          )}
        </div>

        {/* Gráfico 2: evolução da chuva acumulada da fazenda (+ faixa entre regiões) */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900">
            {temTemperatura ? 'Evolução da chuva acumulada da fazenda e temperatura média' : 'Evolução da chuva acumulada da fazenda'}
          </h2>
          <div className="text-xs text-gray-600 mb-4 space-y-1">
            <p>
              <strong>Linha:</strong> a média da fazenda, quanto choveu em média até cada data. Só sobe: quanto mais inclinada, mais choveu naquele intervalo. O último ponto é o acumulado do período.
            </p>
            {resumo.length > 1 && (
              <p>
                <strong>Faixa cinza:</strong> mostra só as duas regiões extremas. Borda de cima = a que mais choveu; borda de baixo = a que menos choveu. Borda de cima longe da linha: há uma região bem mais molhada que a média. Borda de baixo longe da linha: há uma região bem atrás da média. Bordas coladas na linha: chuva parecida em toda a fazenda. A faixa não mostra quantas regiões estão perto de cada borda; para isso, veja o gráfico acima.
              </p>
            )}
          </div>
          {serieGrafico.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={serieGrafico} margin={{ top: 20, right: 25, left: 0, bottom: 10 }} style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="ts"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  ticks={serieGrafico.length <= 12 ? serieGrafico.map((p) => p.ts) : undefined}
                  padding={{ left: 24, right: 30 }}
                  tickFormatter={(ts: number) => dataLabel(new Date(ts).toISOString().slice(0, 10))}
                  tick={{ fontSize: 11, fill: '#666' }}
                />
                <YAxis
                  yAxisId="mm"
                  tick={{ fontSize: 11, fill: '#666' }}
                  label={{ value: 'mm acumulados', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#666' } }}
                />
                {temTemperatura && (
                  <YAxis
                    yAxisId="temp"
                    orientation="right"
                    tick={{ fontSize: 11, fill: TEMP_COLOR }}
                    label={{ value: '°C', angle: 90, position: 'insideRight', style: { fontSize: 11, fill: TEMP_COLOR } }}
                  />
                )}
                <Tooltip
                  formatter={((value: any, name: any) => {
                    if (Array.isArray(value)) return [`${fmtNum(Number(value[0]))} a ${fmtNum(Number(value[1]))} mm`, name]
                    return [name === 'Temperatura média' ? `${fmtNum(Number(value))}°C` : `${fmtNum(Number(value))} mm`, name]
                  }) as any}
                  labelFormatter={((ts: any) => formatarData(new Date(Number(ts)).toISOString())) as any}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                {resumo.length > 1 && (
                  <Area yAxisId="mm" type="linear" dataKey="faixa" name="Entre pluviômetros (mín. a máx.)" stroke="none" fill={COR_ACIMA_MEDIA} fillOpacity={0.15} isAnimationActive={false} />
                )}
                <Line yAxisId="mm" type="linear" dataKey="acum_fazenda" name="Média da fazenda" stroke={COR_ACIMA_MEDIA} strokeWidth={3} dot={{ r: 4 }} isAnimationActive={false}>
                  {/* com muitas datas os valores se sobrepõem: nesse caso só o primeiro e o último ponto */}
                  <LabelList
                    dataKey="acum_fazenda"
                    content={((p: any) => {
                      const ultimo = serieGrafico.length - 1
                      if (serieGrafico.length > 8 && p.index !== 0 && p.index !== ultimo) return null
                      return (
                        <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize={12} fontWeight={700} fill="#111827" style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 4, strokeLinejoin: 'round' }}>
                          {fmtNum(Number(p.value), 1)}
                        </text>
                      )
                    }) as any}
                  />
                </Line>
                {temTemperatura && (
                  <Line yAxisId="temp" type="monotone" dataKey="temp_media" name="Temperatura média" stroke={TEMP_COLOR} strokeWidth={1.5} dot={{ r: 2 }} connectNulls isAnimationActive={false} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[320px] flex items-center justify-center text-gray-400 text-sm">
              Sem dados para os filtros selecionados
            </div>
          )}
        </div>

        {/* Resumo por pluviômetro */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Resumo por pluviômetro</h2>
          {resumo.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Pluviômetro</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Localização</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Leituras</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Total (mm)</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Média/leitura</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Maior leitura</th>
                    {temTemperatura && (
                      <>
                        <th className="text-right py-2 px-3 font-semibold text-gray-700">Temp. mín</th>
                        <th className="text-right py-2 px-3 font-semibold text-gray-700">Temp. máx</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {resumo.map((r) => (
                    <tr key={r.pluviometro_id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3 font-medium text-gray-900">{r.pluviometro_nome}</td>
                      <td className="py-2 px-3 text-gray-600">{r.pluviometro_localizacao || '—'}</td>
                      <td className="py-2 px-3 text-right text-gray-700">{r.n_medicoes}</td>
                      <td className="py-2 px-3 text-right font-semibold" style={{ color: GREEN_DARK }}>{fmtNum(r.mm_total)} mm</td>
                      <td className="py-2 px-3 text-right text-gray-700">{fmtNum(r.mm_medio)} mm</td>
                      <td className="py-2 px-3 text-right text-gray-700">{fmtNum(r.maior_leitura)} mm</td>
                      {temTemperatura && (
                        <>
                          <td className="py-2 px-3 text-right text-gray-700">{r.temp_min !== null ? `${fmtNum(r.temp_min)}°C` : '—'}</td>
                          <td className="py-2 px-3 text-right text-gray-700">{r.temp_max !== null ? `${fmtNum(r.temp_max)}°C` : '—'}</td>
                        </>
                      )}
                    </tr>
                  ))}
                  {resumo.length > 1 && (
                    <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                      <td className="py-2 px-3 text-gray-900" colSpan={2}>Fazenda (média de {resumoFazenda.n_pluviometros} pluviômetros)</td>
                      <td className="py-2 px-3 text-right text-gray-700">{resumoFazenda.n_medicoes}</td>
                      <td className="py-2 px-3 text-right" style={{ color: GREEN_DARK }}>{fmtNum(resumoFazenda.mm_total)} mm</td>
                      <td className="py-2 px-3 text-right text-gray-700">{fmtNum(resumoFazenda.mm_medio)} mm</td>
                      <td className="py-2 px-3 text-right text-gray-700">{fmtNum(resumoFazenda.maior_leitura)} mm</td>
                      {temTemperatura && <td className="py-2 px-3" colSpan={2}></td>}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Sem dados para os filtros selecionados</p>
          )}
        </div>

        {/* Chuva por mês: como a chuva se distribui ao longo do ano */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900">Chuva por mês</h2>
          <p className="text-xs text-gray-600 mb-3">
            Cada barra é a média da fazenda no mês (a soma das barras é a chuva acumulada do período). Meses sem leitura aparecem zerados.
          </p>
          {mensal.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={mensal} margin={{ top: 24, right: 20, left: 0, bottom: 5 }} style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="mes_label" tick={{ fontSize: 11, fill: '#666' }} />
                <YAxis tick={{ fontSize: 11, fill: '#666' }} label={{ value: 'mm no mês', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#666' } }} />
                <Tooltip
                  content={((p: any) => {
                    if (!p.active || !p.payload?.length) return null
                    const d = p.payload[0].payload as PontoChuvaMensal
                    return (
                      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow">
                        <p className="font-semibold text-gray-900">{d.mes_label}</p>
                        <p>Média da fazenda: {fmtNum(d.mm_fazenda)} mm</p>
                        <p>Região que mais choveu: {fmtNum(d.mm_max)} mm</p>
                        <p>Região que menos choveu: {fmtNum(d.mm_min)} mm</p>
                      </div>
                    )
                  }) as any}
                />
                <Bar dataKey="mm_fazenda" name="Média da fazenda" fill={COR_ACIMA_MEDIA} maxBarSize={56} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  <LabelList dataKey="mm_fazenda" position="top" formatter={((v: any) => fmtNum(Number(v), 1)) as any} style={{ fontSize: 12, fontWeight: 700, fill: '#111827' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[160px] flex items-center justify-center text-gray-400 text-sm">
              Sem dados para os filtros selecionados
            </div>
          )}
        </div>

        {/* Calendário de chuva: em que dias choveu e quais foram fortes/torrenciais */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900">Calendário de chuva</h2>
          <p className="text-xs text-gray-600 mb-3">
            Cada quadrado é um dia. O número grande é a <strong>média da fazenda</strong> no dia. O tom e o símbolo mostram a <strong>maior chuva do dia em alguma região</strong>: ◆ forte ({LIMITE_CHUVA_FORTE_MM} a {LIMITE_CHUVA_TORRENCIAL_MM} mm) e ▲ torrencial ({LIMITE_CHUVA_TORRENCIAL_MM} mm ou mais), com o valor dessa região logo abaixo. A fazenda toda pode ter recebido bem menos que essa região. Dia em branco = sem leitura registrada.
          </p>
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-700">
            {[
              { rotulo: 'Sem leitura', fundo: '#FFFFFF', borda: '#D1D5DB' },
              { rotulo: 'Leitura sem chuva forte (abaixo de 25 mm em todas as regiões)', fundo: ESTILO_NIVEL.normal.fundo, borda: ESTILO_NIVEL.normal.borda },
              { rotulo: '◆ Forte (25 a 50 mm em alguma região)', fundo: ESTILO_NIVEL.forte.fundo, borda: ESTILO_NIVEL.forte.borda },
              { rotulo: '▲ Torrencial (50 mm ou mais em alguma região)', fundo: ESTILO_NIVEL.torrencial.fundo, borda: ESTILO_NIVEL.torrencial.borda },
            ].map((l) => (
              <span key={l.rotulo} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3.5 w-3.5 rounded-sm" style={{ backgroundColor: l.fundo, border: `1.5px solid ${l.borda}` }} />
                {l.rotulo}
              </span>
            ))}
          </div>
          {calendario.meses.length > 0 ? (
            <>
              {calendario.omitidos > 0 && (
                <p className="mb-2 text-xs text-amber-700">
                  Mostrando os {calendario.meses.length} meses mais recentes; {calendario.omitidos} mês(es) anterior(es) ficaram de fora. Ajuste as datas no topo da página para ver outro período.
                </p>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {calendario.meses.map((mes) => (
                  <div key={mes.chave} className="rounded-lg border border-gray-200 p-3">
                    <h3 className="mb-2 text-sm font-semibold text-gray-900">{mes.titulo}</h3>
                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-gray-500">
                      {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => (
                        <span key={i}>{d}</span>
                      ))}
                    </div>
                    <div className="mt-1 grid grid-cols-7 gap-1">
                      {mes.semanas.flat().map((c, i) => {
                        if (!c) return <span key={i} />
                        const p = c.ponto
                        const est = p ? ESTILO_NIVEL[p.nivel] : null
                        return (
                          <div
                            key={i}
                            title={
                              p
                                ? `${formatarData(p.data)}: média da fazenda ${fmtNum(p.mm_fazenda)} mm; maior região ${p.regiao_max}: ${fmtNum(p.mm_max_regiao)} mm`
                                : 'Sem leitura registrada'
                            }
                            className="flex min-h-[52px] flex-col rounded px-1 py-0.5 leading-tight"
                            style={{
                              backgroundColor: est ? est.fundo : '#FFFFFF',
                              color: est ? est.texto : '#9CA3AF',
                              border: `${p && p.nivel !== 'normal' ? 2 : 1}px solid ${est ? est.borda : '#E5E7EB'}`,
                            }}
                          >
                            <span className="text-[10px] opacity-80">{c.dia}</span>
                            {p && (
                              <>
                                {/* número grande = média da fazenda no dia; nos eventos, símbolo + maior chuva em alguma região */}
                                <span className="text-center text-sm font-bold">{fmtNum(p.mm_fazenda, 0)}</span>
                                {p.nivel !== 'normal' && (
                                  <span className="text-center text-[10px] font-bold">
                                    {p.nivel === 'torrencial' ? '▲' : '◆'} {fmtNum(p.mm_max_regiao, 0)}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-gray-700">
                <strong>No período:</strong> {eventos.dias_torrencial} dia(s) com chuva torrencial (≥ {LIMITE_CHUVA_TORRENCIAL_MM} mm) · {eventos.dias_forte} dia(s) com chuva forte ({LIMITE_CHUVA_FORTE_MM} a {LIMITE_CHUVA_TORRENCIAL_MM} mm)
                {eventos.maior && <> · maior chuva: {fmtNum(eventos.maior.mm)} mm na região {eventos.maior.regiao} em {formatarData(eventos.maior.data)}</>}.
              </p>
            </>
          ) : (
            <div className="h-[160px] flex items-center justify-center text-gray-400 text-sm">
              Sem dados para os filtros selecionados
            </div>
          )}
        </div>

        {/* Leituras detalhadas (recolhidas: o gráfico acima é a leitura principal) */}
        <details className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <summary className="cursor-pointer text-sm font-semibold text-gray-900">
            Ver leituras detalhadas <span className="text-gray-400 font-normal">({registrosFiltrados.length})</span>
          </summary>
          <div className="mt-4">
          {registrosFiltrados.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Data</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Horário</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Pluviômetro</th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700">Chuva (mm)</th>
                    {temTemperatura && <th className="text-right py-2 px-3 font-semibold text-gray-700">Temp. (°C)</th>}
                    {temUmidade && <th className="text-right py-2 px-3 font-semibold text-gray-700">Umidade</th>}
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Responsável</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-700">Observação</th>
                  </tr>
                </thead>
                <tbody>
                  {registrosFiltrados.map((r, idx) => (
                    <tr key={`${r.registro_id}-${r.pluviometro_id}-${idx}`} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3 text-gray-900 whitespace-nowrap">{formatarData(r.data)}</td>
                      <td className="py-2 px-3 text-gray-600">{r.horario || '—'}</td>
                      <td className="py-2 px-3 text-gray-900">{r.pluviometro_nome || '—'}</td>
                      <td className="py-2 px-3 text-right font-semibold" style={{ color: GREEN_DARK }}>{fmtNum(r.medicao_mm)}</td>
                      {temTemperatura && <td className="py-2 px-3 text-right text-gray-700">{r.temperatura !== null ? fmtNum(r.temperatura) : '—'}</td>}
                      {temUmidade && <td className="py-2 px-3 text-right text-gray-700">{r.umidade_relativa !== null ? `${fmtNum(r.umidade_relativa, 0)}%` : '—'}</td>}
                      <td className="py-2 px-3 text-gray-700">{r.responsavel || r.nome_usuario || '—'}</td>
                      <td className="py-2 px-3 text-gray-600 max-w-[240px] truncate" title={r.observacao || ''}>{r.observacao || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Sem leituras para os filtros selecionados</p>
          )}
          </div>
        </details>
      </main>
    </div>
  )
}
