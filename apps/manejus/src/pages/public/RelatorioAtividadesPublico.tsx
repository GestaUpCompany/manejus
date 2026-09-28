import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../../services/supabaseClient'
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, LabelList,
} from 'recharts'
import logoManejus from '/images/manejus360.png'

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

const STATUS_CORES: Record<string, string> = {
  pendente: '#6B7280',
  em_andamento: '#3B82F6',
  concluido: '#22C55E',
  concluida: '#22C55E',
}

const STATUS_LABELS: Record<string, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em Andamento',
  concluido: 'Concluído',
  concluida: 'Concluída',
}

const PRIORIDADE_LABELS: Record<number, string> = {
  1: 'Urgente',
  2: 'Importante',
  3: 'Planejada',
}

const PRIORIDADE_CORES: Record<number, string> = {
  1: '#EF4444',
  2: '#F59E0B',
  3: '#22C55E',
}

interface RelatorioInfo {
  fazenda_id: string
  titulo: string
  tipo: string
  fazenda_nome?: string
  fazenda_logo_url?: string | null
}

interface AtividadeRel {
  id: string
  titulo: string
  descricao: string | null
  local: string | null
  data_inicio: string
  data_fim: string
  prioridade: number | null
  status: string
  atrasada: boolean
  nao_prevista: boolean
  setor_nome: string | null
  funcionarios: {
    id: string
    funcionario_id: string
    funcionario_nome: string
    status_individual: string
    tempo_gasto_segundos: number | null
    inicio_at: string | null
    fim_at: string | null
  }[]
}

interface ImprevistoRel {
  id: string
  tipo: string
  descricao: string | null
  ocorrido_at: string
  impacto_minutos: number | null
  atividade_titulo: string
  funcionario_nome: string
}

interface FuncionarioRel {
  id: string
  nome: string
}

function formatarTempo(segundos: number): string {
  if (segundos <= 0) return '0min'
  const h = Math.floor(segundos / 3600)
  const m = Math.floor((segundos % 3600) / 60)
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}min`
  if (m > 0) return `${m}min`
  return `${segundos}s`
}

function formatarData(iso: string): string {
  if (!iso) return ''
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

function formatarDataHora(iso: string | null): string {
  if (!iso) return ''
  const dt = new Date(iso)
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' +
    dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function getIniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

const AVATAR_CORES = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500', 'bg-teal-500', 'bg-indigo-500']

function getCorAvatar(nome: string): string {
  let hash = 0
  for (let i = 0; i < nome.length; i++) hash = nome.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_CORES[Math.abs(hash) % AVATAR_CORES.length]
}

function getCorBarra(taxa: number): string {
  if (taxa >= 70) return '#22C55E'
  if (taxa >= 40) return '#F59E0B'
  return '#EF4444'
}

interface Props {
  token: string
  relatorioInfo: RelatorioInfo
}

export function RelatorioAtividadesPublico({ relatorioInfo }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [atividades, setAtividades] = useState<AtividadeRel[]>([])
  const [atividadesPeriodoAnterior, setAtividadesPeriodoAnterior] = useState<AtividadeRel[]>([])
  const [imprevistos, setImprevistos] = useState<ImprevistoRel[]>([])
  const [funcionarios, setFuncionarios] = useState<FuncionarioRel[]>([])
  const [setores, setSetores] = useState<string[]>([])

  // Filtros
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [funcionarioSelecionado, setFuncionarioSelecionado] = useState('')
  const [setorSelecionado, setSetorSelecionado] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState<'todas' | 'planejadas' | 'nao_previstas'>('todas')
  const [exportandoPDF, setExportandoPDF] = useState(false)

  const carregarDados = useCallback(async () => {
    if (!relatorioInfo?.fazenda_id) return
    try {
      setLoading(true)
      const fazendaId = relatorioInfo.fazenda_id

      // Default: últimos 30 dias
      let inicio = dataInicio
      let fim = dataFim
      if (!inicio) {
        const d = new Date()
        d.setDate(d.getDate() - 30)
        inicio = d.toISOString().split('T')[0]
      }
      if (!fim) {
        fim = new Date().toISOString().split('T')[0]
      }

      // Atividades com funcionários
      let query = supabase
        .from('atividades')
        .select(`
          id, titulo, descricao, local, data_inicio, data_fim, prioridade,
          status, atrasada, nao_prevista,
          setor:setores(nome),
          funcionarios:atividade_funcionarios(
            id, funcionario_id, status_individual, tempo_gasto_segundos,
            inicio_at, fim_at,
            funcionario:funcionarios(nome)
          )
        `)
        .eq('fazenda_id', fazendaId)
        .is('deleted_at', null)
        .gte('data_inicio', inicio)
        .lte('data_inicio', fim)
        .order('data_inicio', { ascending: false })

      const { data: atvData, error: atvError } = await query

      if (atvError) {
        console.error('Erro ao carregar atividades:', atvError)
        setError('Erro ao carregar dados do relatório.')
        setLoading(false)
        return
      }

      const mapped: AtividadeRel[] = (atvData || []).map((a: any) => ({
        id: a.id,
        titulo: a.titulo,
        descricao: a.descricao,
        local: a.local,
        data_inicio: a.data_inicio,
        data_fim: a.data_fim,
        prioridade: a.prioridade,
        status: a.status,
        atrasada: a.atrasada,
        nao_prevista: a.nao_prevista,
        setor_nome: a.setor?.nome || null,
        funcionarios: (a.funcionarios || []).map((af: any) => ({
          id: af.id,
          funcionario_id: af.funcionario_id,
          funcionario_nome: af.funcionario?.nome || 'Sem nome',
          status_individual: af.status_individual,
          tempo_gasto_segundos: af.tempo_gasto_segundos,
          inicio_at: af.inicio_at,
          fim_at: af.fim_at,
        })),
      }))

      setAtividades(mapped)

      // Imprevistos do período (busca simples, join com atividade_funcionarios para nome)
      const { data: impData } = await supabase
        .from('atividade_imprevistos')
        .select(`
          id, tipo, descricao, ocorrido_at, impacto_minutos,
          atividade_funcionario:atividade_funcionarios(
            funcionario:funcionarios(nome),
            atividade:atividades(titulo, fazenda_id)
          )
        `)
        .gte('ocorrido_at', inicio + 'T00:00:00')
        .lte('ocorrido_at', fim + 'T23:59:59')
        .order('ocorrido_at', { ascending: false })

      const impMapped: ImprevistoRel[] = (impData || [])
        .filter((i: any) => i.atividade_funcionario?.atividade?.fazenda_id === fazendaId)
        .map((i: any) => ({
          id: i.id,
          tipo: i.tipo,
          descricao: i.descricao,
          ocorrido_at: i.ocorrido_at,
          impacto_minutos: i.impacto_minutos,
          atividade_titulo: i.atividade_funcionario?.atividade?.titulo || '-',
          funcionario_nome: i.atividade_funcionario?.funcionario?.nome || '-',
        }))

      setImprevistos(impMapped)

      // Período anterior (mesma duração imediatamente antes do período atual)
      const duracaoMs = new Date(fim).getTime() - new Date(inicio).getTime()
      const inicioAnt = new Date(new Date(inicio).getTime() - duracaoMs - 86400000).toISOString().split('T')[0]
      const fimAnt = new Date(new Date(inicio).getTime() - 86400000).toISOString().split('T')[0]

      const { data: atvAntData } = await supabase
        .from('atividades')
        .select(`
          id, titulo, descricao, local, data_inicio, data_fim, prioridade,
          status, atrasada, nao_prevista,
          setor:setores(nome),
          funcionarios:atividade_funcionarios(
            id, funcionario_id, status_individual, tempo_gasto_segundos,
            inicio_at, fim_at,
            funcionario:funcionarios(nome)
          )
        `)
        .eq('fazenda_id', fazendaId)
        .is('deleted_at', null)
        .gte('data_inicio', inicioAnt)
        .lte('data_inicio', fimAnt)
        .order('data_inicio', { ascending: false })

      const mappedAnt: AtividadeRel[] = (atvAntData || []).map((a: any) => ({
        id: a.id,
        titulo: a.titulo,
        descricao: a.descricao,
        local: a.local,
        data_inicio: a.data_inicio,
        data_fim: a.data_fim,
        prioridade: a.prioridade,
        status: a.status,
        atrasada: a.atrasada,
        nao_prevista: a.nao_prevista,
        setor_nome: a.setor?.nome || null,
        funcionarios: (a.funcionarios || []).map((af: any) => ({
          id: af.id,
          funcionario_id: af.funcionario_id,
          funcionario_nome: af.funcionario?.nome || 'Sem nome',
          status_individual: af.status_individual,
          tempo_gasto_segundos: af.tempo_gasto_segundos,
          inicio_at: af.inicio_at,
          fim_at: af.fim_at,
        })),
      }))
      setAtividadesPeriodoAnterior(mappedAnt)

      // Funcionários ativos
      const { data: funcData } = await supabase
        .from('funcionarios')
        .select('id, nome')
        .eq('fazenda_id', fazendaId)
        .eq('ativo', true)
        .order('nome')

      setFuncionarios(funcData || [])

      // Setores com atividades (para filtro)
      const { data: setorData } = await supabase
        .from('setores')
        .select('nome')
        .eq('fazenda_id', fazendaId)
        .order('nome')

      setSetores((setorData || []).map((s: any) => s.nome).filter(Boolean))
      setError(null)
    } catch (err) {
      console.error('Erro:', err)
      setError('Erro inesperado ao carregar relatório.')
    } finally {
      setLoading(false)
    }
  }, [relatorioInfo, dataInicio, dataFim])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  // === Filtragem no frontend ===
  const atividadesFiltradas = useMemo(() => {
    let result = [...atividades]
    if (tipoFiltro === 'planejadas') result = result.filter((a) => !a.nao_prevista)
    if (tipoFiltro === 'nao_previstas') result = result.filter((a) => a.nao_prevista)
    if (funcionarioSelecionado) {
      result = result.filter((a) =>
        a.funcionarios.some((af) => af.funcionario_id === funcionarioSelecionado)
      )
    }
    if (setorSelecionado) {
      result = result.filter((a) => a.setor_nome === setorSelecionado)
    }
    return result
  }, [atividades, tipoFiltro, funcionarioSelecionado, setorSelecionado])

  const imprevistosFiltrados = useMemo(() => {
    if (!funcionarioSelecionado) return imprevistos
    return imprevistos.filter((i) => i.funcionario_nome === funcionarios.find((f) => f.id === funcionarioSelecionado)?.nome)
  }, [imprevistos, funcionarioSelecionado, funcionarios])

  // === KPIs ===
  const kpis = useMemo(() => {
    const total = atividadesFiltradas.length
    const concluidas = atividadesFiltradas.filter((a) => a.status === 'concluido' || a.status === 'concluida').length
    const taxaConclusao = total > 0 ? Math.round((concluidas / total) * 100) : 0
    const atrasadas = atividadesFiltradas.filter((a) => a.atrasada).length
    const taxaAtraso = total > 0 ? Math.round((atrasadas / total) * 100) : 0
    const tempoTotal = atividadesFiltradas.reduce((acc, a) =>
      acc + a.funcionarios.reduce((s, af) => s + (af.tempo_gasto_segundos || 0), 0), 0)
    const tempoMedio = concluidas > 0 ? Math.round(tempoTotal / concluidas) : 0
    const naoPrevistas = atividadesFiltradas.filter((a) => a.nao_prevista).length
    const imprevistosCount = imprevistosFiltrados.length
    return { total, concluidas, taxaConclusao, atrasadas, taxaAtraso, tempoTotal, tempoMedio, naoPrevistas, imprevistosCount }
  }, [atividadesFiltradas, imprevistosFiltrados])

  // === KPIs do período anterior ===
  const kpisAnterior = useMemo(() => {
    const total = atividadesPeriodoAnterior.length
    const concluidas = atividadesPeriodoAnterior.filter((a) => a.status === 'concluido' || a.status === 'concluida').length
    const taxaConclusao = total > 0 ? Math.round((concluidas / total) * 100) : 0
    const tempoTotal = atividadesPeriodoAnterior.reduce((acc, a) =>
      acc + a.funcionarios.reduce((s, af) => s + (af.tempo_gasto_segundos || 0), 0), 0)
    return { total, concluidas, taxaConclusao, tempoTotal }
  }, [atividadesPeriodoAnterior])

  // === Variação vs período anterior ===
  const variacoes = useMemo(() => {
    const calc = (atual: number, ant: number) => {
      if (ant === 0) return null
      return Math.round(((atual - ant) / ant) * 100)
    }
    return {
      total: calc(kpis.total, kpisAnterior.total),
      taxaConclusao: kpisAnterior.taxaConclusao > 0 ? kpis.taxaConclusao - kpisAnterior.taxaConclusao : null,
      tempoProdutivo: calc(kpis.tempoTotal, kpisAnterior.tempoTotal),
    }
  }, [kpis, kpisAnterior])

  // === Análise por setor ===
  const metricasSetor = useMemo(() => {
    const map: Record<string, { total: number; concluidas: number; pendentes: number; atrasadas: number; tempoProdutivo: number }> = {}
    atividadesFiltradas.forEach((a) => {
      const setor = a.setor_nome || 'Sem setor'
      if (!map[setor]) map[setor] = { total: 0, concluidas: 0, pendentes: 0, atrasadas: 0, tempoProdutivo: 0 }
      const m = map[setor]
      m.total++
      m.tempoProdutivo += a.funcionarios.reduce((s, af) => s + (af.tempo_gasto_segundos || 0), 0)
      if (a.status === 'concluido' || a.status === 'concluida') m.concluidas++
      else if (a.status === 'pendente') m.pendentes++
      if (a.atrasada) m.atrasadas++
    })
    return Object.entries(map)
      .map(([setor, v]) => ({ setor, ...v, taxaConclusao: v.total > 0 ? Math.round((v.concluidas / v.total) * 100) : 0 }))
      .sort((a, b) => b.total - a.total)
  }, [atividadesFiltradas])

  // === Distribuição por prioridade ===
  const distPrioridade = useMemo(() => {
    const map: Record<number, number> = {}
    atividadesFiltradas.forEach((a) => {
      if (a.prioridade != null) {
        map[a.prioridade] = (map[a.prioridade] || 0) + 1
      }
    })
    return Object.entries(map).map(([nivel, valor]) => ({
      name: PRIORIDADE_LABELS[Number(nivel)] || `Nível ${nivel}`,
      value: valor,
      color: PRIORIDADE_CORES[Number(nivel)] || '#9CA3AF',
    }))
  }, [atividadesFiltradas])

  // === Produtividade por funcionário ===
  const metricasFunc = useMemo(() => {
    const map: Record<string, { nome: string; atribuidas: number; concluidas: number; emAndamento: number; pendentes: number; naoPrevistas: number; tempoProdutivo: number }> = {}
    atividadesFiltradas.forEach((a) => {
      a.funcionarios.forEach((af) => {
        if (!map[af.funcionario_id]) {
          map[af.funcionario_id] = { nome: af.funcionario_nome, atribuidas: 0, concluidas: 0, emAndamento: 0, pendentes: 0, naoPrevistas: 0, tempoProdutivo: 0 }
        }
        const m = map[af.funcionario_id]
        m.atribuidas++
        m.tempoProdutivo += af.tempo_gasto_segundos || 0
        if (a.nao_prevista) m.naoPrevistas++
        if (af.status_individual === 'concluida') m.concluidas++
        else if (af.status_individual === 'em_andamento') m.emAndamento++
        else m.pendentes++
      })
    })
    const todos = Object.values(map).sort((a, b) => b.tempoProdutivo - a.tempoProdutivo)
    // Se houver filtro por funcionario, mostrar apenas ele na tabela
    if (funcionarioSelecionado) {
      return todos.filter((m) => funcionarios.find((f) => f.id === funcionarioSelecionado)?.nome === m.nome)
    }
    return todos
  }, [atividadesFiltradas, funcionarioSelecionado, funcionarios])

  // === Ranking visual de tempo produtivo (gráfico) ===
  const rankingTempo = useMemo(() => {
    return metricasFunc
      .filter((m) => m.tempoProdutivo > 0)
      .slice(0, 10)
      .map((m) => ({
        nome: m.nome.length > 18 ? m.nome.split(' ')[0] + ' ' + (m.nome.split(' ').slice(-1)[0][0] + '.') : m.nome,
        tempoMin: Math.round(m.tempoProdutivo / 60),
        tempoSeg: m.tempoProdutivo,
      }))
  }, [metricasFunc])

  // === Evolução diária ===
  const evolucaoDiaria = useMemo(() => {
    const map: Record<string, { concluidas: number; iniciadas: number }> = {}
    atividadesFiltradas.forEach((a) => {
      const dia = a.data_inicio
      if (!map[dia]) map[dia] = { concluidas: 0, iniciadas: 0 }
      map[dia].iniciadas++
      if (a.status === 'concluido' || a.status === 'concluida') {
        const diaFim = a.data_fim || a.data_inicio
        if (!map[diaFim]) map[diaFim] = { concluidas: 0, iniciadas: 0 }
        map[diaFim].concluidas++
      }
    })
    return Object.entries(map)
      .map(([dia, v]) => ({ dia: formatarData(dia), concluidas: v.concluidas, iniciadas: v.iniciadas }))
      .sort((a, b) => a.dia.localeCompare(b.dia))
  }, [atividadesFiltradas])

  // === Distribuição por status ===
  const distStatus = useMemo(() => {
    const map: Record<string, number> = {}
    atividadesFiltradas.forEach((a) => {
      const s = a.status === 'concluida' ? 'concluido' : a.status
      map[s] = (map[s] || 0) + 1
    })
    return Object.entries(map).map(([status, valor]) => ({
      name: STATUS_LABELS[status] || status,
      value: valor,
      color: STATUS_CORES[status] || '#9CA3AF',
    }))
  }, [atividadesFiltradas])

  const naoPrevistasLista = useMemo(() => atividadesFiltradas.filter((a) => a.nao_prevista), [atividadesFiltradas])

  const limparFiltros = () => {
    setDataInicio('')
    setDataFim('')
    setFuncionarioSelecionado('')
    setSetorSelecionado('')
    setTipoFiltro('todas')
  }

  const temFiltrosAtivos = dataInicio !== '' || dataFim !== '' || funcionarioSelecionado !== '' || setorSelecionado !== '' || tipoFiltro !== 'todas'

  const exportarPDF = async () => {
    if (atividadesFiltradas.length === 0) return
    try {
      setExportandoPDF(true)
      const { gerarRelatorioAtividadesPDF } = await import('../../utils/relatorioAtividadesPDF')
      const blob = await gerarRelatorioAtividadesPDF({
        titulo: relatorioInfo?.titulo || 'Relatório de Atividades',
        fazendaNome: relatorioInfo?.fazenda_nome || '',
        fazendaLogoUrl: relatorioInfo?.fazenda_logo_url,
        dataInicio,
        dataFim,
        setor: setorSelecionado,
        kpis,
        metricasFunc,
        metricasSetor,
        distStatus,
        distPrioridade,
        naoPrevistasLista,
        imprevistos: imprevistosFiltrados,
        atividades: atividadesFiltradas,
        variacoes,
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const nomeFazenda = relatorioInfo?.fazenda_nome || 'Fazenda'
      link.download = `Gesta'Up - Relatório de Atividades ${nomeFazenda}.pdf`
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

  if (loading && atividades.length === 0) {
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
                {relatorioInfo?.titulo || 'Atividades'}
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
                disabled={exportandoPDF || atividadesFiltradas.length === 0}
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Filtros */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex flex-col md:flex-row gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Data início</label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:ring-1 focus:ring-green-600"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Data fim</label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:ring-1 focus:ring-green-600"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Responsável</label>
              <select
                value={funcionarioSelecionado}
                onChange={(e) => setFuncionarioSelecionado(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:ring-1 focus:ring-green-600 bg-white"
              >
                <option value="">Todos</option>
                {funcionarios.map((f) => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Setor</label>
              <select
                value={setorSelecionado}
                onChange={(e) => setSetorSelecionado(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:ring-1 focus:ring-green-600 bg-white"
              >
                <option value="">Todos</option>
                {setores.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {(['todas', 'planejadas', 'nao_previstas'] as const).map((t) => {
              const labels = { todas: 'Todas', planejadas: 'Planejadas', nao_previstas: 'Não previstas' }
              const ativo = tipoFiltro === t
              return (
                <button
                  key={t}
                  onClick={() => setTipoFiltro(t)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    ativo ? 'bg-green-100 text-green-700 ring-2 ring-offset-1 ring-green-300' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {labels[t]}
                </button>
              )
            })}
            {temFiltrosAtivos && (
              <button
                onClick={limparFiltros}
                className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                Limpar filtros
              </button>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {
              label: 'Total',
              valor: String(kpis.total),
              cor: 'text-gray-800',
              variacao: variacoes.total,
              suffix: '',
            },
            {
              label: 'Taxa conclusão',
              valor: `${kpis.taxaConclusao}%`,
              cor: 'text-green-600',
              variacao: variacoes.taxaConclusao,
              suffix: 'p.p.',
            },
            {
              label: 'Taxa de atraso',
              valor: `${kpis.taxaAtraso}%`,
              cor: 'text-red-600',
              sub: `${kpis.atrasadas} atrasada(s)`,
              variacao: null,
              suffix: '',
            },
            {
              label: 'Tempo produtivo',
              valor: formatarTempo(kpis.tempoTotal),
              cor: 'text-blue-600',
              variacao: variacoes.tempoProdutivo,
              suffix: '',
            },
            {
              label: 'Tempo médio',
              valor: kpis.concluidas > 0 ? formatarTempo(kpis.tempoMedio) : '-',
              cor: 'text-blue-600',
              variacao: null,
              suffix: '',
            },
            {
              label: 'Não previstas',
              valor: String(kpis.naoPrevistas),
              cor: 'text-purple-600',
              variacao: null,
              suffix: '',
            },
            {
              label: 'Imprevistos',
              valor: String(kpis.imprevistosCount),
              cor: 'text-red-600',
              variacao: null,
              suffix: '',
            },
          ].map((kpi) => {
            const temVar = kpi.variacao !== null && kpi.variacao !== undefined
            const varPos = temVar && (kpi.variacao as number) > 0
            const varNeg = temVar && (kpi.variacao as number) < 0
            const varLabel = kpi.suffix === 'p.p.'
              ? `${(kpi.variacao as number) > 0 ? '+' : ''}${kpi.variacao} p.p.`
              : `${varPos ? '+' : ''}${kpi.variacao}%`
            const varCor = kpi.label === 'Taxa de atraso'
              ? (varNeg ? 'text-green-600' : 'text-red-600')
              : (varPos ? 'text-green-600' : varNeg ? 'text-red-600' : 'text-gray-400')
            return (
              <div key={kpi.label} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <p className="text-xs text-gray-500 mb-1">{kpi.label}</p>
                <p className={`text-2xl font-bold ${kpi.cor}`}>{kpi.valor}</p>
                <div className="flex items-center gap-1 mt-0.5 h-4">
                  {temVar && (
                    <span className={`text-[11px] font-medium ${varCor}`}>
                      {varPos ? '↑' : varNeg ? '↓' : '→'} {varLabel}
                    </span>
                  )}
                  {kpi.sub && <span className="text-[11px] text-gray-400">{kpi.sub}</span>}
                </div>
              </div>
            )
          })}
        </div>

        {/* Produtividade por funcionário */}
        {metricasFunc.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Produtividade por Funcionário</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-3 font-medium text-gray-600">Funcionário</th>
                    <th className="text-center py-3 px-3 font-medium text-gray-600">Atrib.</th>
                    <th className="text-center py-3 px-3 font-medium text-gray-600">Concl.</th>
                    <th className="text-center py-3 px-3 font-medium text-gray-600">Andam.</th>
                    <th className="text-center py-3 px-3 font-medium text-gray-600">Pend.</th>
                    <th className="text-center py-3 px-3 font-medium text-gray-600">Não prev.</th>
                    <th className="text-center py-3 px-3 font-medium text-gray-600">Tempo prod.</th>
                    <th className="text-left py-3 px-3 font-medium text-gray-600 min-w-[120px]">Taxa</th>
                  </tr>
                </thead>
                <tbody>
                  {metricasFunc.map((m, i) => {
                    const taxa = m.atribuidas > 0 ? Math.round((m.concluidas / m.atribuidas) * 100) : 0
                    return (
                      <tr key={i} className="border-b border-gray-100 last:border-0">
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${getCorAvatar(m.nome)}`}>
                              {getIniciais(m.nome)}
                            </div>
                            <span className="font-medium text-gray-800">{m.nome}</span>
                          </div>
                        </td>
                        <td className="text-center py-3 px-3 text-gray-600">{m.atribuidas}</td>
                        <td className="text-center py-3 px-3 text-green-600 font-medium">{m.concluidas}</td>
                        <td className="text-center py-3 px-3 text-blue-600">{m.emAndamento}</td>
                        <td className="text-center py-3 px-3 text-gray-500">{m.pendentes}</td>
                        <td className="text-center py-3 px-3 text-purple-600 font-medium">{m.naoPrevistas || '-'}</td>
                        <td className="text-center py-3 px-3 text-gray-700 font-medium whitespace-nowrap">{m.tempoProdutivo > 0 ? formatarTempo(m.tempoProdutivo) : '-'}</td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden min-w-[50px]">
                              <div className="h-full rounded-full" style={{ width: `${taxa}%`, backgroundColor: getCorBarra(taxa) }} />
                            </div>
                            <span className="text-xs font-medium text-gray-700 min-w-[30px]">{taxa}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Gráficos: ranking + evolução diária */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {rankingTempo.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Ranking de Tempo Produtivo</h3>
              <ResponsiveContainer width="100%" height={Math.max(200, rankingTempo.length * 36)}>
                <BarChart data={rankingTempo} layout="vertical" margin={{ left: 20, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} unit="min" />
                  <YAxis type="category" dataKey="nome" tick={{ fontSize: 11 }} width={90} />
                  <Tooltip formatter={(v: any) => formatarTempo(Number(v) * 60)} />
                  <Bar dataKey="tempoMin" name="Tempo produtivo" fill={GREEN_DARK} radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="tempoMin" position="right" formatter={(v: any) => formatarTempo(Number(v) * 60)} style={{ fontSize: 10, fill: '#6B7280' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {evolucaoDiaria.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Evolução Diária</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={evolucaoDiaria}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="iniciadas" name="Iniciadas" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="concluidas" name="Concluídas" fill="#22C55E" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Gráficos: distribuição por status + prioridade */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {distStatus.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Distribuição por Status</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={distStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {distStatus.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 justify-center mt-2">
                {distStatus.map((s, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.name} ({s.value})
                  </span>
                ))}
              </div>
            </div>
          )}

          {distPrioridade.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Distribuição por Prioridade</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={distPrioridade} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {distPrioridade.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 justify-center mt-2">
                {distPrioridade.map((p, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                    {p.name} ({p.value})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Análise por setor */}
        {metricasSetor.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Análise por Setor</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-3 font-medium text-gray-600">Setor</th>
                    <th className="text-center py-3 px-3 font-medium text-gray-600">Total</th>
                    <th className="text-center py-3 px-3 font-medium text-gray-600">Concl.</th>
                    <th className="text-center py-3 px-3 font-medium text-gray-600">Pend.</th>
                    <th className="text-center py-3 px-3 font-medium text-gray-600">Atrasadas</th>
                    <th className="text-center py-3 px-3 font-medium text-gray-600">Tempo prod.</th>
                    <th className="text-left py-3 px-3 font-medium text-gray-600 min-w-[120px]">Taxa conclusão</th>
                  </tr>
                </thead>
                <tbody>
                  {metricasSetor.map((s, i) => (
                    <tr key={i} className="border-b border-gray-100 last:border-0">
                      <td className="py-3 px-3 font-medium text-gray-800">{s.setor}</td>
                      <td className="text-center py-3 px-3 text-gray-600">{s.total}</td>
                      <td className="text-center py-3 px-3 text-green-600 font-medium">{s.concluidas}</td>
                      <td className="text-center py-3 px-3 text-gray-500">{s.pendentes}</td>
                      <td className="text-center py-3 px-3 text-red-600 font-medium">{s.atrasadas || '-'}</td>
                      <td className="text-center py-3 px-3 text-gray-700 font-medium whitespace-nowrap">{s.tempoProdutivo > 0 ? formatarTempo(s.tempoProdutivo) : '-'}</td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden min-w-[50px]">
                            <div className="h-full rounded-full" style={{ width: `${s.taxaConclusao}%`, backgroundColor: getCorBarra(s.taxaConclusao) }} />
                          </div>
                          <span className="text-xs font-medium text-gray-700 min-w-[30px]">{s.taxaConclusao}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Atividades não previstas */}
        {naoPrevistasLista.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-purple-500" />
              Atividades não previstas ({naoPrevistasLista.length})
            </h3>
            <div className="space-y-2">
              {naoPrevistasLista.slice(0, 20).map((a) => {
                const func = a.funcionarios[0]
                const tempo = func?.tempo_gasto_segundos || 0
                const isConcluida = a.status === 'concluido' || a.status === 'concluida'
                return (
                  <div key={a.id} className="flex items-center justify-between gap-2 p-3 rounded-lg border-l-4 border-purple-400 bg-purple-50/30">
                    <div className="min-w-0 flex-1">
                      <h4 className="font-medium text-gray-800 text-sm truncate">{a.titulo}</h4>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-gray-500">
                        {func && <span>{func.funcionario_nome}</span>}
                        {isConcluida && tempo > 0 && <span className="text-green-700 font-medium">⏱ {formatarTempo(tempo)}</span>}
                        <span>{formatarData(a.data_inicio)}</span>
                      </div>
                    </div>
                    <span className="px-2 py-1 rounded-full text-xs font-medium flex-shrink-0" style={{ backgroundColor: (STATUS_CORES[a.status] || '#E5E7EB') + '20', color: STATUS_CORES[a.status] || '#6B7280' }}>
                      {STATUS_LABELS[a.status] || a.status}
                    </span>
                  </div>
                )
              })}
            </div>
            {naoPrevistasLista.length > 20 && (
              <p className="text-xs text-gray-400 mt-2 text-center">Mostrando 20 de {naoPrevistasLista.length}</p>
            )}
          </div>
        )}

        {/* Imprevistos do período */}
        {imprevistosFiltrados.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <span className="text-amber-500">⚠️</span>
              Imprevistos do período ({imprevistosFiltrados.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-medium text-gray-600">Quando</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">Tipo</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">Atividade</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">Funcionário</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">Descrição</th>
                    <th className="text-center py-2 px-3 font-medium text-gray-600">Impacto</th>
                  </tr>
                </thead>
                <tbody>
                  {imprevistosFiltrados.slice(0, 30).map((i) => (
                    <tr key={i.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 px-3 text-gray-500 whitespace-nowrap">{formatarDataHora(i.ocorrido_at)}</td>
                      <td className="py-2 px-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                          {i.tipo}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-gray-700 truncate max-w-[180px]">{i.atividade_titulo}</td>
                      <td className="py-2 px-3 text-gray-600">{i.funcionario_nome}</td>
                      <td className="py-2 px-3 text-gray-500 truncate max-w-[200px]">{i.descricao || '-'}</td>
                      <td className="py-2 px-3 text-center text-gray-600 whitespace-nowrap">
                        {i.impacto_minutos != null ? `${i.impacto_minutos}min` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {imprevistosFiltrados.length > 30 && (
              <p className="text-xs text-gray-400 mt-2 text-center">Mostrando 30 de {imprevistosFiltrados.length}</p>
            )}
          </div>
        )}

        {/* Lista detalhada de atividades */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            Atividades detalhadas ({atividadesFiltradas.length})
          </h3>
          {atividadesFiltradas.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Nenhuma atividade no período selecionado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-medium text-gray-600">Título</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">Responsáveis</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">Período</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-600">Status</th>
                    <th className="text-center py-2 px-3 font-medium text-gray-600">Tempo</th>
                  </tr>
                </thead>
                <tbody>
                  {atividadesFiltradas.slice(0, 50).map((a) => {
                    const tempo = a.funcionarios.reduce((s, af) => s + (af.tempo_gasto_segundos || 0), 0)
                    return (
                      <tr key={a.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                        <td className="py-2 px-3 text-gray-800 font-medium max-w-[200px] truncate">
                          {a.titulo}
                          {a.nao_prevista && (
                            <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700">Não prevista</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-gray-600 max-w-[180px] truncate">
                          {a.funcionarios.map((af) => af.funcionario_nome).join(', ')}
                        </td>
                        <td className="py-2 px-3 text-gray-500 whitespace-nowrap">{formatarData(a.data_inicio)}</td>
                        <td className="py-2 px-3">
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: (STATUS_CORES[a.status] || '#E5E7EB') + '20', color: STATUS_CORES[a.status] || '#6B7280' }}>
                            {STATUS_LABELS[a.status] || a.status}
                          </span>
                          {a.atrasada && (
                            <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Atrasada</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center text-gray-700 font-medium whitespace-nowrap">
                          {tempo > 0 ? formatarTempo(tempo) : '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {atividadesFiltradas.length > 50 && (
            <p className="text-xs text-gray-400 mt-2 text-center">Mostrando 50 de {atividadesFiltradas.length}</p>
          )}
        </div>
      </div>
    </div>
  )
}
