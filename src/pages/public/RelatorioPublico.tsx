import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../services/supabaseClient'
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts'
import logoManejus from '/images/manejus360.png'
import { gerarRelatorioAbastecimentoPDFPuppeteer } from '../../utils/relatorioAbastecimentoPDFPuppeteer'
import { RelatorioConsumoPublico } from './RelatorioConsumoPublico'
import { RelatorioTratosPublico } from './RelatorioTratosPublico'
import { RelatorioMortePublico } from './RelatorioMortePublico'
import { RelatorioAtividadesPublico } from './RelatorioAtividadesPublico'
import { RelatorioBebedourosPublico } from './RelatorioBebedourosPublico'

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

interface RegistroBruto {
  maquina: string
  marca?: string
  modelo?: string
  combustivel: string
  operacao: string
  litros: number
  data: string
  operador?: string
  quem_abasteceu?: string
  placa?: string
  total_bomba?: number
  observacao?: string
}

interface DadosRelatorio {
  registros: RegistroBruto[]
  maquinas_disponiveis: string[]
  combustiveis_disponiveis: string[]
  operacoes_disponiveis: string[]
}

interface RelatorioInfo {
  fazenda_id: string
  titulo: string
  tipo: string
  fazenda_nome?: string
  fazenda_logo_url?: string | null
}

interface Agregado {
  label: string
  valor: number
}

// Paleta de cores (identidade visual Manejus 360)
const GREEN_DARK = '#0F6437'
const BLUE_BAR = '#1E3A5F'
const COLORS = ['#0F6437', '#1E3A5F', '#10B981', '#34b87c', '#5ccf94', '#7fdca8', '#a2e9bc', '#c5f0d0', '#0F6437', '#1E3A5F']

function formatarData(d: string): string {
  if (!d || d === '—') return '—'
  const parts = d.split('-')
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
  return d
}

// Abreviacao de marcas no frontend (mesmo mapa do endpoint do PDF).
const MARCA_ABREV: Record<string, string> = {
  'John Deere': 'JD',
  'Jonh Deere': 'JD',
  'Deere': 'JD',
  'JohnDeere': 'JD',
  'Volkswagen': 'VW',
  'Volks': 'VW',
  'Massey Ferguson': 'MF',
  'New Holland': 'NH',
  'Case': 'Case',
  'Ford': 'Ford',
  'JCB': 'JCB',
  'Honda': 'Honda',
  'Liugong': 'Liugong',
}

function normalizarMarca(value: string): string {
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ')
}

function tokensDaMarca(value: string): string[] {
  return normalizarMarca(value).split(' ')
}

function abreviarMarca(value: string): string {
  if (!value) return ''
  const tokens = tokensDaMarca(value)
  for (const [marca, abrev] of Object.entries(MARCA_ABREV)) {
    const alvo = tokensDaMarca(marca)
    let idx = 0
    for (const t of tokens) {
      if (t === alvo[idx]) idx++
      if (idx === alvo.length) return abrev
    }
  }
  const partes = value.trim().split(/\s+/)
  return partes[0] || value
}

function formatarMaquina(d: DetalheMaquina | RegistroBruto): string {
  if (d.marca) {
    const modelo = d.modelo ? String(d.modelo).trim() : ''
    const marca = abreviarMarca(d.marca)
    if (marca && modelo) return `${marca} ${modelo}`
    if (modelo) return modelo
    return marca
  }
  // Fallback: procura a marca no inicio da string maquina.
  const raw = d.maquina || ''
  if (!raw) return '—'
  const tokens = tokensDaMarca(raw)
  const rawLower = raw.toLowerCase()
  for (const [marca, abrev] of Object.entries(MARCA_ABREV)) {
    const alvo = tokensDaMarca(marca)
    let idx = 0
    let alvoPos = 0
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i] === alvo[idx]) {
        if (idx === 0) alvoPos = i
        idx++
      }
      if (idx === alvo.length) {
        const posFim = rawLower.indexOf(alvo.join(' '), rawLower.indexOf(tokens[alvoPos])) + alvo.join(' ').length
        const resto = raw.slice(posFim).trim()
        return resto ? `${abrev} ${resto}` : abrev
      }
    }
  }
  return raw
}

function agregar(registros: RegistroBruto[], chave: (r: RegistroBruto) => string): Agregado[] {
  const map = new Map<string, number>()
  for (const r of registros) {
    const k = chave(r)
    if (!k) continue
    map.set(k, (map.get(k) || 0) + Number(r.litros))
  }
  return Array.from(map.entries())
    .map(([label, valor]) => ({ label, valor }))
    .sort((a, b) => b.valor - a.valor)
}

interface DetalheMaquina {
  maquina: string
  marca?: string
  modelo?: string
  totalLitros: number
  numAbastecimentos: number
  mediaLitros: number
  maiorAbastecimento: number
  primeiraData: string
  ultimaData: string
  combustiveis: string[]
  operadores: string[]
  placas: string[]
}

type Dimensao = 'maquina' | 'combustivel' | 'operacao'

export function RelatorioPublico() {
  const { token } = useParams<{ token: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [relatorioInfo, setRelatorioInfo] = useState<RelatorioInfo | null>(null)
  const [dados, setDados] = useState<DadosRelatorio | null>(null)

  // Slicers (data vai ao banco; os demais sao cross-filters multi-select no frontend)
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [filtroMaquina, setFiltroMaquina] = useState<Set<string>>(new Set())
  const [filtroCombustivel, setFiltroCombustivel] = useState<Set<string>>(new Set())
  const [filtroOperacao, setFiltroOperacao] = useState<Set<string>>(new Set())
  const [exportandoPDF, setExportandoPDF] = useState(false)

  // CTRL+clique: seleção pendente que só é aplicada quando o CTRL é solto
  const [ctrlHeld, setCtrlHeld] = useState(false)
  const [pending, setPending] = useState<Partial<Record<Dimensao, Set<string>>>>({})

  // Popovers de multi-select abertos
  const [popoverAberto, setPopoverAberto] = useState<Dimensao | null>(null)

  const carregarDados = useCallback(async () => {
    if (!token) return

    try {
      setLoading(true)

      const { data: relData, error: relError } = await supabase
        .from('relatorios_publicos')
        .select('fazenda_id, titulo, tipo')
        .eq('id', token)
        .eq('ativo', true)
        .single()

      if (relError || !relData) {
        setError('Relatório não encontrado ou inativo.')
        setLoading(false)
        return
      }

      // Buscar nome e logo da fazenda
      const { data: fazendaData } = await supabase
        .from('fazendas')
        .select('nome, logo_url')
        .eq('id', relData.fazenda_id)
        .maybeSingle()

      setRelatorioInfo({
        ...relData,
        fazenda_nome: fazendaData?.nome,
        fazenda_logo_url: fazendaData?.logo_url,
      })

      // Se for relatório de consumo, tratos ou morte, o componente filho busca seus próprios dados
      if (relData.tipo === 'consumo' || relData.tipo === 'tratos' || relData.tipo === 'morte' || relData.tipo === 'atividades' || relData.tipo === 'bebedouros') {
        setError(null)
        setLoading(false)
        return
      }

      const { data: rpcData, error: rpcError } = await supabase
        .rpc('get_dados_relatorio_abastecimento', {
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

      setDados(rpcData?.dados as DadosRelatorio)
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

  // Display filters: durante CTRL, mostra o pending; fora do CTRL, mostra o filtro real
  const displayMaquina = ctrlHeld && pending.maquina ? pending.maquina : filtroMaquina
  const displayCombustivel = ctrlHeld && pending.combustivel ? pending.combustivel : filtroCombustivel
  const displayOperacao = ctrlHeld && pending.operacao ? pending.operacao : filtroOperacao

  // Remove tabindex e role do SVG do recharts para evitar a caixa de foco acinzentada
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
  }, [dados, displayMaquina, displayCombustivel, displayOperacao, dataInicio, dataFim])

  // Fechar popover ao clicar fora
  useEffect(() => {
    if (!popoverAberto) return
    const handler = () => setPopoverAberto(null)
    setTimeout(() => document.addEventListener('click', handler), 0)
    return () => document.removeEventListener('click', handler)
  }, [popoverAberto])

  // Listeners de CTRL: rastreia quando o usuário segura/solta para batch de seleção
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') setCtrlHeld(true)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') setCtrlHeld(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  // Commit do pending quando o CTRL é solto: aplica os Sets acumulados aos filtros reais
  useEffect(() => {
    if (!ctrlHeld && Object.keys(pending).length > 0) {
      if (pending.maquina) setFiltroMaquina(pending.maquina)
      if (pending.combustivel) setFiltroCombustivel(pending.combustivel)
      if (pending.operacao) setFiltroOperacao(pending.operacao)
      setPending({})
    }
  }, [ctrlHeld, pending])

  // Registros filtrados por cross-filters multi-select
  const registrosFiltrados = useMemo(() => {
    if (!dados) return []
    return dados.registros.filter((r) => {
      if (filtroMaquina.size > 0 && !filtroMaquina.has(r.maquina)) return false
      if (filtroCombustivel.size > 0 && !filtroCombustivel.has(r.combustivel)) return false
      if (filtroOperacao.size > 0 && !filtroOperacao.has(r.operacao)) return false
      return true
    })
  }, [dados, filtroMaquina, filtroCombustivel, filtroOperacao])

  // Agregacoes a partir dos registros filtrados
  const porCombustivel = useMemo(() => agregar(registrosFiltrados, (r) => r.combustivel), [registrosFiltrados])
  const porOperacao = useMemo(() => agregar(registrosFiltrados, (r) => r.operacao), [registrosFiltrados])

  const totalLitros = useMemo(() => registrosFiltrados.reduce((s, r) => s + Number(r.litros), 0), [registrosFiltrados])
  const totalRegistros = registrosFiltrados.length

  // Detalhamento por máquina com todas as métricas (colunas 1-9)
  const detalhesPorMaquina = useMemo<DetalheMaquina[]>(() => {
    const map = new Map<string, RegistroBruto[]>()
    for (const r of registrosFiltrados) {
      if (!r.maquina) continue
      const arr = map.get(r.maquina) || []
      arr.push(r)
      map.set(r.maquina, arr)
    }
    const result: DetalheMaquina[] = []
    for (const [maquina, regs] of map.entries()) {
      const totalLitrosMaq = regs.reduce((s, r) => s + Number(r.litros), 0)
      const numAbast = regs.length
      const media = numAbast > 0 ? totalLitrosMaq / numAbast : 0
      const maior = regs.reduce((max, r) => Math.max(max, Number(r.litros)), 0)
      const datas = regs.map((r) => r.data).filter(Boolean).sort()
      const combustiveis = Array.from(new Set(regs.map((r) => r.combustivel).filter((v): v is string => !!v))).sort()
      const operadores = Array.from(new Set(regs.map((r) => r.operador).filter((v): v is string => !!v))).sort()
      const placas = Array.from(new Set(regs.map((r) => r.placa).filter((v): v is string => !!v && v.replace(/0/g, '').trim() !== ''))).sort()
      const first = regs[0]

      result.push({
        maquina,
        marca: first?.marca,
        modelo: first?.modelo,
        totalLitros: totalLitrosMaq,
        numAbastecimentos: numAbast,
        mediaLitros: media,
        maiorAbastecimento: maior,
        primeiraData: datas[0] || '—',
        ultimaData: datas[datas.length - 1] || '—',
        combustiveis,
        operadores,
        placas,
      })
    }
    return result.sort((a, b) => b.totalLitros - a.totalLitros)
  }, [registrosFiltrados])

  // Agregacao por maquina a partir dos detalhes (inclui marca/modelo para o PDF)
  const porMaquina = useMemo(() => detalhesPorMaquina.map((d) => ({ label: d.maquina, valor: d.totalLitros, marca: d.marca, modelo: d.modelo })), [detalhesPorMaquina])

  // Opcoes de filtro dinamicas: refletem apenas o subconjunto de dados das OUTRAS dimensoes
  const opcoesMaquina = useMemo(() => {
    if (!dados) return []
    const subset = dados.registros.filter((r) => {
      if (filtroCombustivel.size > 0 && !filtroCombustivel.has(r.combustivel)) return false
      if (filtroOperacao.size > 0 && !filtroOperacao.has(r.operacao)) return false
      return true
    })
    return Array.from(new Set(subset.map((r) => r.maquina).filter(Boolean))).sort()
  }, [dados, filtroCombustivel, filtroOperacao])

  const opcoesCombustivel = useMemo(() => {
    if (!dados) return []
    const subset = dados.registros.filter((r) => {
      if (filtroMaquina.size > 0 && !filtroMaquina.has(r.maquina)) return false
      if (filtroOperacao.size > 0 && !filtroOperacao.has(r.operacao)) return false
      return true
    })
    return Array.from(new Set(subset.map((r) => r.combustivel).filter(Boolean))).sort()
  }, [dados, filtroMaquina, filtroOperacao])

  const opcoesOperacao = useMemo(() => {
    if (!dados) return []
    const subset = dados.registros.filter((r) => {
      if (filtroMaquina.size > 0 && !filtroMaquina.has(r.maquina)) return false
      if (filtroCombustivel.size > 0 && !filtroCombustivel.has(r.combustivel)) return false
      return true
    })
    return Array.from(new Set(subset.map((r) => r.operacao).filter(Boolean))).sort()
  }, [dados, filtroMaquina, filtroCombustivel])

  const temFiltrosAtivos = displayMaquina.size > 0 || displayCombustivel.size > 0 || displayOperacao.size > 0 || dataInicio || dataFim

  const limparFiltros = () => {
    setDataInicio('')
    setDataFim('')
    setFiltroMaquina(new Set())
    setFiltroCombustivel(new Set())
    setFiltroOperacao(new Set())
    setPending({})
  }

  const limparDimensao = (dim: Dimensao) => {
    if (dim === 'maquina') setFiltroMaquina(new Set())
    if (dim === 'combustivel') setFiltroCombustivel(new Set())
    if (dim === 'operacao') setFiltroOperacao(new Set())
    setPending((prev) => { const next = { ...prev }; delete next[dim]; return next })
  }

  const exportarPDF = async () => {
    if (!relatorioInfo || !dados) return
    try {
      setExportandoPDF(true)
      const blob = await gerarRelatorioAbastecimentoPDFPuppeteer({
        titulo: relatorioInfo.titulo,
        fazendaNome: relatorioInfo.fazenda_nome,
        fazendaLogoUrl: relatorioInfo.fazenda_logo_url,
        filtros: {
          dataInicio,
          dataFim,
          maquinas: Array.from(filtroMaquina),
          combustiveis: Array.from(filtroCombustivel),
          operacoes: Array.from(filtroOperacao),
        },
        porMaquina,
        porCombustivel,
        porOperacao,
        totalLitros,
        totalRegistros,
        detalhesPorMaquina,
      })

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const nomeFazenda = relatorioInfo.fazenda_nome || 'Fazenda'
      link.download = `Gesta'Up - Relatório de Abastecimento ${nomeFazenda}.pdf`
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

  // Cross-filter click: toggle individual dentro do Set (usado por checkboxes/popover)
  // Aplica imediatamente no filtro real (não passa pelo buffer pendente do CTRL)
  const toggleFiltro = (dim: Dimensao, valor: string) => {
    const clearPending = () => setPending((prev) => { const next = { ...prev }; delete next[dim]; return next })
    if (dim === 'maquina') { setFiltroMaquina((prev) => {
      const next = new Set(prev)
      if (next.has(valor)) next.delete(valor)
      else next.add(valor)
      return next
    }); clearPending() }
    if (dim === 'combustivel') { setFiltroCombustivel((prev) => {
      const next = new Set(prev)
      if (next.has(valor)) next.delete(valor)
      else next.add(valor)
      return next
    }); clearPending() }
    if (dim === 'operacao') { setFiltroOperacao((prev) => {
      const next = new Set(prev)
      if (next.has(valor)) next.delete(valor)
      else next.add(valor)
      return next
    }); clearPending() }
  }

  // Click em barras/chips/tabela: CTRL+clique acumula no buffer pendente (só aplica
  // quando o CTRL for solto), clique simples substitui imediatamente.
  // Padrão Power BI / Tableau: segura CTRL, clica N itens, solta CTRL → filtro aplicado.
  const clickFiltro = (dim: Dimensao, valor: string, ctrl: boolean) => {
    const setter = dim === 'maquina' ? setFiltroMaquina : dim === 'combustivel' ? setFiltroCombustivel : setFiltroOperacao
    const atual = dim === 'maquina' ? filtroMaquina : dim === 'combustivel' ? filtroCombustivel : filtroOperacao
    if (ctrl) {
      // Modo acumulativo: toggle dentro do pending, NÃO toca no filtro real ainda
      setPending((prev) => {
        const base = prev[dim] ?? atual
        const next = new Set(base)
        if (next.has(valor)) next.delete(valor)
        else next.add(valor)
        return { ...prev, [dim]: next }
      })
    } else {
      // Clique simples: substitui seleção por este item, ou limpa se já era o único
      if (atual.size === 1 && atual.has(valor)) {
        setter(new Set())
      } else {
        setter(new Set([valor]))
      }
    }
  }

  // Toggle all em popover
  const toggleAll = (dim: Dimensao, valores: string[]) => {
    const setter = dim === 'maquina' ? setFiltroMaquina : dim === 'combustivel' ? setFiltroCombustivel : setFiltroOperacao
    const atual = dim === 'maquina' ? filtroMaquina : dim === 'combustivel' ? filtroCombustivel : filtroOperacao
    if (atual.size === valores.length) {
      setter(new Set())
    } else {
      setter(new Set(valores))
    }
    setPending((prev) => { const next = { ...prev }; delete next[dim]; return next })
  }

  const getFiltroSet = (dim: Dimensao): Set<string> => {
    if (dim === 'maquina') return displayMaquina
    if (dim === 'combustivel') return displayCombustivel
    return displayOperacao
  }

  const getOpcoes = (dim: Dimensao): string[] => {
    if (dim === 'maquina') return opcoesMaquina
    if (dim === 'combustivel') return opcoesCombustivel
    return opcoesOperacao
  }

  const getLabelDim = (dim: Dimensao): string => {
    if (dim === 'maquina') return 'Máquina/Veículo'
    if (dim === 'combustivel') return 'Combustível'
    return 'Operação'
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

  // Switch por tipo de relatório
  if (relatorioInfo?.tipo === 'consumo') {
    return <RelatorioConsumoPublico token={token!} relatorioInfo={relatorioInfo} />
  }

  if (relatorioInfo?.tipo === 'tratos') {
    return <RelatorioTratosPublico token={token!} relatorioInfo={relatorioInfo} />
  }

  if (relatorioInfo?.tipo === 'morte') {
    return <RelatorioMortePublico token={token!} relatorioInfo={relatorioInfo} />
  }

  if (relatorioInfo?.tipo === 'atividades') {
    return <RelatorioAtividadesPublico token={token!} relatorioInfo={relatorioInfo} />
  }

  if (relatorioInfo?.tipo === 'bebedouros') {
    return <RelatorioBebedourosPublico token={token!} relatorioInfo={relatorioInfo} />
  }

  // Componente de popover multi-select
  const renderPopover = (dim: Dimensao) => {
    const opcoes = getOpcoes(dim)
    const selecionados = getFiltroSet(dim)
    return (
      <div
        className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-100">
          <button
            onClick={() => toggleAll(dim, opcoes)}
            className="text-xs text-green-700 hover:text-green-800 font-medium"
          >
            {selecionados.size === opcoes.length && opcoes.length > 0 ? 'Desmarcar todas' : 'Selecionar todas'}
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
        {opcoes.map((val) => (
          <label
            key={val}
            className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-sm"
          >
            <input
              type="checkbox"
              checked={selecionados.has(val)}
              onChange={() => toggleFiltro(dim, val)}
              className="rounded border-gray-300 text-green-600 focus:ring-green-600"
            />
            <span className="text-gray-700">{val}</span>
          </label>
        ))}
      </div>
    )
  }

  // Componente de select multi no header
  const renderMultiSelect = (dim: Dimensao) => {
    const selecionados = getFiltroSet(dim)
    const label = getLabelDim(dim)
    return (
      <div className="relative">
        <label className="block text-xs font-medium text-gray-600 mb-1">
          {label} {selecionados.size > 0 && <span className="text-green-600">● {selecionados.size}</span>}
        </label>
        <button
          onClick={(e) => {
            e.stopPropagation()
            setPopoverAberto(popoverAberto === dim ? null : dim)
          }}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-left bg-white focus:border-green-600 focus:ring-1 focus:ring-green-600 flex items-center justify-between"
        >
          <span className={selecionados.size > 0 ? 'text-gray-900' : 'text-gray-400'}>
            {selecionados.size === 0
              ? 'Todas'
              : selecionados.size === 1
                ? Array.from(selecionados)[0]
                : `${selecionados.size} selecionadas`}
          </span>
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {popoverAberto === dim && renderPopover(dim)}
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F5' }}>
      <style>{CHART_NO_FOCUS_CSS}</style>
      {/* Header verde (identidade visual Manejus 360) */}
      <header className="sticky top-0 z-10" style={{ backgroundColor: GREEN_DARK }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
          <div className="flex items-center justify-between gap-3">
            {/* Logo GestaUp + nome do sistema */}
            <div className="flex items-center gap-2">
              <div className="bg-white rounded-lg p-1 flex items-center justify-center">
                <img src={logoManejus} alt="Manej'Us 360" loading="eager" className="h-8 w-auto" />
              </div>
              <h1 className="text-sm sm:text-base font-bold text-white hidden sm:block">
                Manej'Us <span className="text-yellow-500">360</span>
              </h1>
            </div>

            {/* Título em card branco centralizado */}
            <div className="bg-white rounded-full px-5 py-1.5 shadow-sm flex-1 max-w-md text-center">
              <h2 className="text-sm font-bold leading-tight" style={{ color: GREEN_DARK }}>
                {relatorioInfo?.titulo || 'Relatório de Abastecimento'}
              </h2>
              {relatorioInfo?.fazenda_nome && (
                <p className="text-[10px] text-gray-500 leading-tight">{relatorioInfo.fazenda_nome}</p>
              )}
            </div>

            {/* Logo da fazenda + botão PDF */}
            <div className="flex items-center gap-2">
              {relatorioInfo?.fazenda_logo_url && (
                <div className="bg-white rounded-lg p-1 flex items-center justify-center">
                  <img src={relatorioInfo.fazenda_logo_url} alt={relatorioInfo?.fazenda_nome || 'Fazenda'} loading="eager" className="h-8 w-auto max-w-[80px] object-contain" />
                </div>
              )}
              <button
                onClick={exportarPDF}
                disabled={exportandoPDF || totalRegistros === 0}
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

      {/* KPIs (cards verdes, identidade visual Manejus 360) */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
          {[
            { label: 'Total Litros', value: `${totalLitros.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} L` },
            { label: 'Registros', value: totalRegistros.toLocaleString('pt-BR') },
            { label: 'Maior Consumidor', value: detalhesPorMaquina.length > 0 ? formatarMaquina(detalhesPorMaquina[0]) : '—' },
            { label: 'Máquinas', value: porMaquina.length.toString() },
            { label: 'Tipos de combustível', value: porCombustivel.length.toString() },
            { label: 'Operações', value: porOperacao.length.toString() },
          ].map((kpi) => (
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
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
            {renderMultiSelect('maquina')}
            {renderMultiSelect('combustivel')}
            {renderMultiSelect('operacao')}
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-gray-400">
              Dica: Para filtrar mais de 1 item, segure CTRL e clique em vários itens para selecionar; solte CTRL para aplicar.
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

      {/* Painéis */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Filtros ativos (chips) */}
        {temFiltrosAtivos && (displayMaquina.size > 0 || displayCombustivel.size > 0 || displayOperacao.size > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500">Filtros ativos:</span>
            {Array.from(displayMaquina).map((v) => (
              <button
                key={`m-${v}`}
                onClick={(e) => clickFiltro('maquina', v, e.ctrlKey || e.metaKey)}
                className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-800 px-3 py-1 text-xs font-medium hover:bg-green-200"
              >
                {v}
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            ))}
            {Array.from(displayCombustivel).map((v) => (
              <button
                key={`c-${v}`}
                onClick={(e) => clickFiltro('combustivel', v, e.ctrlKey || e.metaKey)}
                className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-800 px-3 py-1 text-xs font-medium hover:bg-green-200"
              >
                {v}
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            ))}
            {Array.from(displayOperacao).map((v) => (
              <button
                key={`o-${v}`}
                onClick={(e) => clickFiltro('operacao', v, e.ctrlKey || e.metaKey)}
                className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-800 px-3 py-1 text-xs font-medium hover:bg-green-200"
              >
                {v}
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            ))}
            {ctrlHeld && (
              <span className="text-xs text-blue-600 font-medium animate-pulse">
                Solte CTRL para aplicar ({(pending.maquina?.size ?? 0) + (pending.combustivel?.size ?? 0) + (pending.operacao?.size ?? 0)} itens)
              </span>
            )}
          </div>
        )}

        {/* Painel 1: Litros por máquina/veículo */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Litros por Máquina/Veículo</h2>
            {displayMaquina.size > 0 && (
              <button
                onClick={() => limparDimensao('maquina')}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Remover filtro{displayMaquina.size > 1 ? `s (${displayMaquina.size})` : ''}
              </button>
            )}
          </div>
          {porMaquina.length > 0 ? (
            <>
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={porMaquina} margin={{ top: 10, right: 25, left: 0, bottom: 55 }} style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#666' }}
                  angle={-35}
                  textAnchor="end"
                  height={65}
                />
                <YAxis tick={{ fontSize: 11, fill: '#666' }} />
                <Tooltip
                  formatter={((value: any) => [`${Number(value).toLocaleString('pt-BR')} L`, 'Litros']) as any}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                />
                <Bar
                  dataKey="valor"
                  barSize={80}
                  maxBarSize={96}
                  radius={[4, 4, 0, 0]}
                  activeBar={false}
                  cursor="pointer"
                  onMouseDown={(e: any) => e?.stopPropagation?.()}
                  onClick={(data: any, _idx: number, event: any) => clickFiltro('maquina', data.label, !!(event?.ctrlKey || event?.metaKey))}
                >
                  {porMaquina.map((entry, idx) => (
                    <Cell
                      key={idx}
                      stroke="transparent"
                      fill={displayMaquina.size > 0 && !displayMaquina.has(entry.label) ? '#d1d5db' : GREEN_DARK}
                    />
                  ))}
                  <LabelList
                    dataKey="valor"
                    position="top"
                    formatter={(value: any) => `${Number(value).toLocaleString('pt-BR')}L`}
                    style={{ fontSize: 11, fontWeight: 600, fill: '#1F2937' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              {porMaquina.map((item) => {
                const ativo = displayMaquina.has(item.label)
                return (
                  <button
                    key={item.label}
                    onClick={(e) => clickFiltro('maquina', item.label, e.ctrlKey || e.metaKey)}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                      ativo
                        ? 'border-green-600 bg-green-50 text-green-800'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: GREEN_DARK }} />
                    <span className="font-medium">{item.label}</span>
                    <span className="text-gray-500">{item.valor.toLocaleString('pt-BR')}L</span>
                  </button>
                )
              })}
            </div>
            </>
          ) : (
            <div className="h-[360px] flex items-center justify-center text-gray-400 text-sm">
              Sem dados para os filtros selecionados
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Painel 2: Litros por tipo de combustível */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">Litros por Tipo de Combustível</h2>
              {displayCombustivel.size > 0 && (
                <button
                  onClick={() => limparDimensao('combustivel')}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Remover filtro{displayCombustivel.size > 1 ? `s (${displayCombustivel.size})` : ''}
                </button>
              )}
            </div>
            {porCombustivel.length > 0 ? (
              <>
              <ResponsiveContainer width="100%" height={380}>
                <BarChart data={porCombustivel} layout="vertical" margin={{ top: 5, right: 55, left: 80, bottom: 5 }} style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#666' }} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    tick={{ fontSize: 10, fill: '#666' }}
                    width={80}
                  />
                  <Tooltip
                    formatter={((value: any) => [`${Number(value).toLocaleString('pt-BR')} L`, 'Litros']) as any}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                  />
                  <Bar
                    dataKey="valor"
                    radius={[0, 4, 4, 0]}
                    activeBar={false}
                    cursor="pointer"
                    onMouseDown={(e: any) => e?.stopPropagation?.()}
                    onClick={(data: any, _idx: number, event: any) => clickFiltro('combustivel', data.label, !!(event?.ctrlKey || event?.metaKey))}
                  >
                    {porCombustivel.map((entry, idx) => (
                      <Cell
                        key={idx}
                        stroke="transparent"
                        fill={displayCombustivel.size > 0 && !displayCombustivel.has(entry.label) ? '#d1d5db' : COLORS[idx % COLORS.length]}
                      />
                    ))}
                    <LabelList
                      dataKey="valor"
                      position="right"
                      formatter={(value: any) => `${Number(value).toLocaleString('pt-BR')}L`}
                      style={{ fontSize: 11, fontWeight: 600, fill: '#1F2937' }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <div className="mt-4 flex flex-wrap gap-2 justify-center">
                {porCombustivel.map((item, idx) => {
                  const ativo = displayCombustivel.has(item.label)
                  return (
                    <button
                      key={item.label}
                      onClick={(e) => clickFiltro('combustivel', item.label, e.ctrlKey || e.metaKey)}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                        ativo
                          ? 'border-green-600 bg-green-50 text-green-800'
                          : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                      />
                      <span className="font-medium">{item.label}</span>
                      <span className="text-gray-500">{item.valor.toLocaleString('pt-BR')}L</span>
                    </button>
                  )
                })}
              </div>
              </>
            ) : (
              <div className="h-[380px] flex items-center justify-center text-gray-400 text-sm">
                Sem dados para os filtros selecionados
              </div>
            )}
          </div>

          {/* Painel 3: Litros por tipo de operação */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">Litros por Tipo de Operação</h2>
              {displayOperacao.size > 0 && (
                <button
                  onClick={() => limparDimensao('operacao')}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Remover filtro{displayOperacao.size > 1 ? `s (${displayOperacao.size})` : ''}
                </button>
              )}
            </div>
            {porOperacao.length > 0 ? (
              <>
              <ResponsiveContainer width="100%" height={380}>
                <BarChart data={porOperacao} layout="vertical" margin={{ top: 10, right: 55, left: 55, bottom: 5 }} style={{ outline: 'none', WebkitTapHighlightColor: 'transparent' }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#666' }} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    tick={{ fontSize: 10, fill: '#666' }}
                    width={55}
                  />
                  <Tooltip
                    formatter={((value: any) => [`${Number(value).toLocaleString('pt-BR')} L`, 'Litros']) as any}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                  />
                  <Bar
                    dataKey="valor"
                    radius={[0, 4, 4, 0]}
                    activeBar={false}
                    cursor="pointer"
                    onMouseDown={(e: any) => e?.stopPropagation?.()}
                    onClick={(data: any, _idx: number, event: any) => clickFiltro('operacao', data.label, !!(event?.ctrlKey || event?.metaKey))}
                  >
                    {porOperacao.map((entry, idx) => (
                      <Cell
                        key={idx}
                        stroke="transparent"
                        fill={displayOperacao.size > 0 && !displayOperacao.has(entry.label) ? '#d1d5db' : BLUE_BAR}
                      />
                    ))}
                    <LabelList
                      dataKey="valor"
                      position="right"
                      formatter={(value: any) => `${Number(value).toLocaleString('pt-BR')}L`}
                      style={{ fontSize: 11, fontWeight: 600, fill: '#1F2937' }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              <div className="mt-4 flex flex-wrap gap-2 justify-center">
                {porOperacao.map((item) => {
                  const ativo = displayOperacao.has(item.label)
                  return (
                    <button
                      key={item.label}
                      onClick={(e) => clickFiltro('operacao', item.label, e.ctrlKey || e.metaKey)}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                        ativo
                          ? 'border-green-600 bg-green-50 text-green-800'
                          : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: BLUE_BAR }} />
                      <span className="font-medium">{item.label}</span>
                      <span className="text-gray-500">{item.valor.toLocaleString('pt-BR')}L</span>
                    </button>
                  )
                })}
              </div>
              </>
            ) : (
              <div className="h-[380px] flex items-center justify-center text-gray-400 text-sm">
                Sem dados para os filtros selecionados
              </div>
            )}
          </div>
        </div>

        {/* Painel 1: Detalhamento por máquina (colunas 1-5) */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Detalhamento por Máquina/Veículo</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Máquina/Veículo</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">Litros</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">% do total</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">Nº abast.</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">Média/abast. (L)</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">Maior abast. (L)</th>
                  <th className="text-center py-2 px-3 font-medium text-gray-600">Período</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Combustíveis</th>
                </tr>
              </thead>
              <tbody>
                {detalhesPorMaquina.map((d, idx) => {
                  const pct = totalLitros > 0 ? (d.totalLitros / totalLitros) * 100 : 0
                  return (
                    <tr
                      key={idx}
                      className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${displayMaquina.has(d.maquina) ? 'bg-green-50' : ''}`}
                      onClick={(e) => clickFiltro('maquina', d.maquina, e.ctrlKey || e.metaKey)}
                    >
                      <td className="py-2 px-3 text-gray-900 font-medium">{d.maquina}</td>
                      <td className="py-2 px-3 text-right text-gray-900">{d.totalLitros.toLocaleString('pt-BR')} L</td>
                      <td className="py-2 px-3 text-right text-gray-500">{pct.toFixed(1)}%</td>
                      <td className="py-2 px-3 text-right text-gray-700">{d.numAbastecimentos}</td>
                      <td className="py-2 px-3 text-right text-gray-700">{d.mediaLitros.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</td>
                      <td className="py-2 px-3 text-right text-gray-700">{d.maiorAbastecimento.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</td>
                      <td className="py-2 px-3 text-center text-gray-600 text-xs whitespace-nowrap">
                        {d.primeiraData !== '—' ? `${formatarData(d.primeiraData)} a ${formatarData(d.ultimaData)}` : '—'}
                      </td>
                      <td className="py-2 px-3 text-gray-600 text-xs">{d.combustiveis.join(', ') || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
              {detalhesPorMaquina.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-200 font-semibold">
                    <td className="py-2 px-3 text-gray-900">Total</td>
                    <td className="py-2 px-3 text-right text-gray-900">{totalLitros.toLocaleString('pt-BR')} L</td>
                    <td className="py-2 px-3 text-right text-gray-500">100%</td>
                    <td className="py-2 px-3 text-right text-gray-700">{totalRegistros}</td>
                    <td colSpan={4}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Painel 2: Detalhamento operacional (colunas 6-7) */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Detalhamento Operacional</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Máquina/Veículo</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Operador(es)</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Placa(s)</th>
                </tr>
              </thead>
              <tbody>
                {detalhesPorMaquina.map((d, idx) => (
                  <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 px-3 text-gray-900 font-medium">{d.maquina}</td>
                    <td className="py-2 px-3 text-gray-600 text-xs">{d.operadores.join(', ') || '—'}</td>
                    <td className="py-2 px-3 text-gray-600 text-xs">{d.placas.join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Footer (identidade visual Manejus 360) */}
      <footer style={{ backgroundColor: GREEN_DARK }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-white rounded-lg p-1">
              <img src={logoManejus} alt="Manej'Us 360" loading="lazy" className="h-5 w-auto" />
            </div>
            <span className="text-sm font-bold text-white">
              Manej'Us <span className="text-yellow-500">360</span>
            </span>
          </div>
          <p className="text-xs text-white opacity-80">
            Relatório interativo · Dados em tempo real
          </p>
        </div>
      </footer>
    </div>
  )
}
