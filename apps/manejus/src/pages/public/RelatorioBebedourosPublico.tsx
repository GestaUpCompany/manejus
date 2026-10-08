import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@gestaup/supabase'
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts'
import logoManejus from '/images/manejus360.png'
import { ordenarPeriodo } from '../../features/relatorioGeral/periodo'
import { gerarRelatorioBebedourosPDFPuppeteer } from '../../utils/relatorioBebedourosPDFPuppeteer'
import {
  calcularChecklist,
  calcularCronograma,
  calcularKPIsCronograma,
  calcularLimpezasDoDia,
  calcularMaisAtrasado,
  proximasNaJanela,
  textoPrazo,
  type ItemCronograma,
  type LimpezaDoDiaItem,
  type OcorrenciaCalculada,
} from '../../features/relatorioBebedouros/calculos'
import { cronogramaParaPDF, limpezaDoDiaParaPDF, ocorrenciaParaPDF } from '../../features/relatorioBebedouros/paraPdf'

const GREEN_DARK = '#0F6437'

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

interface RelatorioInfo {
  fazenda_id: string
  titulo: string
  tipo: string
  fazenda_nome?: string
  fazenda_logo_url?: string | null
}

interface Bebedouro {
  id: string
  nome: string
  capacidade: number | null
  meta_intervalo_limpeza: number | null
  ativo: boolean
}

interface Limpeza {
  id: string
  bebedouro_id: string
  bebedouro_nome: string
  data_limpeza: string
  responsavel: string | null
  observacao: string | null
}

interface RegistroBebedouro {
  id: string
  data: string
  numero_bebedouro: string | null
  leitura_bebedouro: number | null
  responsavel: string | null
  pasto: string | null
  lote: string | null
  observacao: string | null
  checklist: Record<string, { valor: boolean; observacao: string }> | null
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

export function RelatorioBebedourosPublico({ token, relatorioInfo }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bebedouros, setBebedouros] = useState<Bebedouro[]>([])
  const [todasLimpezas, setTodasLimpezas] = useState<Limpeza[]>([])
  const [registros, setRegistros] = useState<RegistroBebedouro[]>([])

  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [diaUnico, setDiaUnico] = useState('')
  const [bebedourosSelecionados, setBebedourosSelecionados] = useState<string[]>([])
  const [dropdownBebedourosAberto, setDropdownBebedourosAberto] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [exportandoPDF, setExportandoPDF] = useState(false)

  useEffect(() => {
    if (!dropdownBebedourosAberto) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownBebedourosAberto(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownBebedourosAberto])

  const toggleBebedouro = (id: string) => {
    setBebedourosSelecionados((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const periodoPadrao = useMemo(() => {
    const fim = new Date()
    const inicio = new Date()
    inicio.setDate(inicio.getDate() - 30)
    return {
      inicio: inicio.toISOString().split('T')[0],
      fim: `${fim.getFullYear()}-${String(fim.getMonth() + 1).padStart(2, '0')}-${String(fim.getDate()).padStart(2, '0')}`,
    }
  }, [])

  const periodoInicio = diaUnico || dataInicio || periodoPadrao.inicio
  const periodoFim = diaUnico || dataFim || periodoPadrao.fim

  const carregarDados = useCallback(async () => {
    if (!relatorioInfo?.fazenda_id) return
    try {
      setLoading(true)
      const fazendaId = relatorioInfo.fazenda_id

      const inicio = periodoInicio
      const fim = periodoFim

      const permitidosRes = await supabase.rpc('get_bebedouros_permitidos_relatorio', {
        p_token: token,
      })

      if (permitidosRes.error) {
        console.error('Erro ao carregar bebedouros permitidos:', permitidosRes.error)
        setError('Erro ao carregar dados do relatório.')
        setLoading(false)
        return
      }

      const bebedourosPermitidos = new Set(
        (permitidosRes.data || []).map((item: { bebedouro_id: string }) => item.bebedouro_id)
      )

      const [bebedourosRes, limpezasRes, registrosRes] = await Promise.all([
        supabase
          .from('bebedouros')
          .select('id, nome, capacidade, meta_intervalo_limpeza, ativo')
          .eq('fazenda_id', fazendaId)
          .is('deleted_at', null)
          .order('nome'),
        supabase
          .from('historico_limpezas_bebedouros')
          .select('id, bebedouro_id, data_limpeza, responsavel, observacao, bebedouro:bebedouros(nome)')
          .eq('fazenda_id', fazendaId)
          .lte('data_limpeza', fim + 'T23:59:59')
          .order('data_limpeza', { ascending: false }),
        supabase
          .from('registros_bebedouros')
          .select('id, data, numero_bebedouro, leitura_bebedouro, responsavel, pasto, lote, observacao, checklist')
          .eq('fazenda_id', fazendaId)
          .is('deleted_at', null)
          .gte('data', inicio + 'T00:00:00')
          .lte('data', fim + 'T23:59:59')
          .order('data', { ascending: false }),
      ])

      if (bebedourosRes.error || limpezasRes.error || registrosRes.error) {
        console.error('Erro ao carregar dados dos bebedouros:', bebedourosRes.error || limpezasRes.error || registrosRes.error)
        setError('Erro ao carregar dados do relatório.')
        setLoading(false)
        return
      }

      const bebedourosMapped: Bebedouro[] = (bebedourosRes.data || [])
        .filter((b: any) => bebedourosPermitidos.has(b.id))
        .map((b: any) => ({
          id: b.id,
          nome: b.nome,
          capacidade: b.capacidade ? Number(b.capacidade) : null,
          meta_intervalo_limpeza: b.meta_intervalo_limpeza,
          ativo: b.ativo,
        }))
      const nomesBebedourosPermitidos = new Set(bebedourosMapped.map((b) => b.nome))

      const limpezasMapped: Limpeza[] = (limpezasRes.data || [])
        .filter((l: any) => bebedourosPermitidos.has(l.bebedouro_id))
        .map((l: any) => ({
          id: l.id,
          bebedouro_id: l.bebedouro_id,
          bebedouro_nome: l.bebedouro?.nome || '—',
          data_limpeza: l.data_limpeza,
          responsavel: l.responsavel,
          observacao: l.observacao,
        }))

      const registrosMapped: RegistroBebedouro[] = (registrosRes.data || [])
        .filter((r: any) => r.numero_bebedouro && nomesBebedourosPermitidos.has(r.numero_bebedouro))
        .map((r: any) => ({
          id: r.id,
          data: r.data,
          numero_bebedouro: r.numero_bebedouro,
          leitura_bebedouro: r.leitura_bebedouro,
          responsavel: r.responsavel,
          pasto: r.pasto,
          lote: r.lote,
          observacao: r.observacao,
          checklist: r.checklist,
        }))

      setBebedouros(bebedourosMapped)
      setTodasLimpezas(limpezasMapped)
      setRegistros(registrosMapped)
      setError(null)
    } catch (err) {
      console.error('Erro:', err)
      setError('Erro inesperado ao carregar relatório.')
    } finally {
      setLoading(false)
    }
  }, [token, relatorioInfo, periodoInicio, periodoFim])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  const bebedourosFiltrados = useMemo(() => {
    if (bebedourosSelecionados.length === 0) return bebedouros
    return bebedouros.filter((b) => bebedourosSelecionados.includes(b.id))
  }, [bebedouros, bebedourosSelecionados])

  const registrosFiltrados = useMemo(() => {
    if (bebedourosSelecionados.length === 0) return registros
    const nomesSelecionados = bebedouros
      .filter((b) => bebedourosSelecionados.includes(b.id))
      .map((b) => b.nome)
    return registros.filter((r) => r.numero_bebedouro && nomesSelecionados.includes(r.numero_bebedouro))
  }, [registros, bebedourosSelecionados, bebedouros])

  const cronograma = useMemo(
    () => calcularCronograma(bebedourosFiltrados, todasLimpezas, periodoFim, periodoInicio, periodoFim),
    [bebedourosFiltrados, todasLimpezas, periodoInicio, periodoFim],
  )
  const limpezaKPIs = useMemo(() => calcularKPIsCronograma(cronograma), [cronograma])
  const maisAtrasado = useMemo(() => calcularMaisAtrasado(cronograma), [cronograma])
  const proximasSemana = useMemo(() => proximasNaJanela(cronograma, 7), [cronograma])

  const ehDiaUnico = diaUnico !== '' || (dataInicio !== '' && dataFim !== '' && dataInicio === dataFim)
  const diaUnicoEfetivo = diaUnico || (dataInicio !== '' && dataFim !== '' && dataInicio === dataFim ? dataInicio : '')

  const limpezasDoDia = useMemo(
    () => (ehDiaUnico ? calcularLimpezasDoDia(bebedourosFiltrados, todasLimpezas, diaUnicoEfetivo) : []),
    [ehDiaUnico, diaUnicoEfetivo, bebedourosFiltrados, todasLimpezas],
  )

  const checklist = useMemo(() => calcularChecklist(registrosFiltrados), [registrosFiltrados])
  const checklistKPIs = checklist.kpis

  const exportarPDF = async () => {
    if (bebedouros.length === 0) return
    try {
      setExportandoPDF(true)

      // KPIs de limpeza (modo dia único)
      const limpezaDiaKPIs = ehDiaUnico ? {
        limposNoDia: limpezasDoDia.length,
        dentroMeta: limpezasDoDia.filter((l) => l.statusLabel === 'Dentro da meta').length,
        acimaMeta: limpezasDoDia.filter((l) => l.statusLabel === 'Acima da meta').length,
        muitoAcima: limpezasDoDia.filter((l) => l.statusLabel === 'Muito acima da meta').length,
        intervaloMedio: (() => {
          const intervalos = limpezasDoDia.map((l) => l.intervalo).filter((v): v is number => v !== null)
          return intervalos.length > 0 ? Math.round(intervalos.reduce((s, v) => s + v, 0) / intervalos.length) : null
        })(),
      } : undefined

      const blob = await gerarRelatorioBebedourosPDFPuppeteer({
        titulo: relatorioInfo.titulo || 'Relatório de Bebedouros',
        fazendaNome: relatorioInfo.fazenda_nome,
        fazendaLogoUrl: relatorioInfo.fazenda_logo_url,
        dataInicio: periodoInicio,
        dataFim: periodoFim,
        ehDiaUnico,
        diaUnico: diaUnicoEfetivo || undefined,
        limpezaKPIs: !ehDiaUnico ? limpezaKPIs : undefined,
        maisAtrasado: !ehDiaUnico ? maisAtrasado : null,
        statusPorBebedouro: !ehDiaUnico ? cronograma.map(cronogramaParaPDF) : undefined,
        proximasSemana: !ehDiaUnico ? proximasSemana : undefined,
        limpezaDiaKPIs,
        limpezasDoDia: ehDiaUnico ? limpezasDoDia.map(limpezaDoDiaParaPDF) : undefined,
        checklistKPIs: checklistKPIs,
        itensRanking: checklist.ranking.map(({ label, pctNegativo, negativos, total }) => ({ label, pctNegativo, negativos, total })),
        ocorrencias: checklist.ocorrencias.map(ocorrenciaParaPDF),
        ocorrenciasPorBebedouro: checklist.ocorrenciasPorBebedouro,
      })

      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const nomeFazenda = relatorioInfo.fazenda_nome || 'Fazenda'
      link.download = `Gesta'Up - Relatório de Bebedouros ${nomeFazenda}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Erro ao exportar PDF com Puppeteer:', err)
      alert('Erro ao gerar PDF. Tente novamente.')
    } finally {
      setExportandoPDF(false)
    }
  }

  if (loading) {
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
                {relatorioInfo.titulo || 'Bebedouros'}
              </h2>
              {relatorioInfo.fazenda_nome && (
                <p className="text-[10px] text-gray-500 leading-tight">{relatorioInfo.fazenda_nome}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {relatorioInfo.fazenda_logo_url && (
                <div className="bg-white rounded-lg p-1 flex items-center justify-center">
                  <img src={relatorioInfo.fazenda_logo_url} alt={relatorioInfo.fazenda_nome || 'Fazenda'} className="h-8 w-auto max-w-[80px] object-contain" />
                </div>
              )}
              <button
                onClick={exportarPDF}
                disabled={exportandoPDF || bebedouros.length === 0}
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <Filtros
          dropdownRef={dropdownRef}
          bebedouros={bebedouros}
          bebedourosSelecionados={bebedourosSelecionados}
          setBebedourosSelecionados={setBebedourosSelecionados}
          dropdownAberto={dropdownBebedourosAberto}
          setDropdownAberto={setDropdownBebedourosAberto}
          toggleBebedouro={toggleBebedouro}
          dataInicio={dataInicio}
          setDataInicio={(v) => { setDataInicio(v); if (v) setDiaUnico('') }}
          dataFim={dataFim}
          setDataFim={(v) => { setDataFim(v); if (v) setDiaUnico('') }}
          diaUnico={diaUnico}
          setDiaUnico={(v) => { setDiaUnico(v); if (v) { setDataInicio(''); setDataFim('') } }}
          onLimpar={() => {
            setDataInicio('')
            setDataFim('')
            setDiaUnico('')
            setBebedourosSelecionados([])
          }}
        />

        <Secao titulo="1. Cronograma de limpeza dos bebedouros">
          {ehDiaUnico ? (
            <>
              <KPIsLimpezaDia limpezas={limpezasDoDia} />
              <TabelaLimpezasDia limpezas={limpezasDoDia} />
            </>
          ) : (
            <>
              <KPIsLimpeza kpis={limpezaKPIs} maisAtrasado={maisAtrasado} proximas={proximasSemana} />
              <TabelaCronograma itens={cronograma} dataReferencia={periodoFim} />
            </>
          )}
        </Secao>

        <Secao titulo="2. Pontos de atenção nos bebedouros">
          <KPIsChecklist kpis={checklistKPIs} />
          <GraficoProblemas ranking={checklist.ranking} />
          <OcorrenciasPorBebedouro itens={checklist.ocorrenciasPorBebedouro} />
          <TabelaOcorrencias ocorrencias={checklist.ocorrencias} />
        </Secao>
      </div>
    </div>
  )
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100" style={{ backgroundColor: '#FAFAF9' }}>
        <h2 className="text-base font-bold" style={{ color: '#0b6a42' }}>{titulo}</h2>
      </div>
      <div className="p-4 space-y-4">{children}</div>
    </section>
  )
}

function Filtros({
  dropdownRef,
  bebedouros,
  bebedourosSelecionados,
  setBebedourosSelecionados,
  dropdownAberto,
  setDropdownAberto,
  toggleBebedouro,
  dataInicio,
  setDataInicio,
  dataFim,
  setDataFim,
  diaUnico,
  setDiaUnico,
  onLimpar,
}: {
  dropdownRef: React.RefObject<HTMLDivElement>
  bebedouros: Bebedouro[]
  bebedourosSelecionados: string[]
  setBebedourosSelecionados: (ids: string[]) => void
  dropdownAberto: boolean
  setDropdownAberto: (v: boolean) => void
  toggleBebedouro: (id: string) => void
  dataInicio: string
  setDataInicio: (v: string) => void
  dataFim: string
  setDataFim: (v: string) => void
  diaUnico: string
  setDiaUnico: (v: string) => void
  onLimpar: () => void
}) {
  const atalhos: { label: string; inicio: number | 'mes'; fim: number }[] = [
    { label: 'Hoje', inicio: 0, fim: 0 },
    { label: '7 dias', inicio: -6, fim: 0 },
    { label: '30 dias', inicio: -29, fim: 0 },
    { label: 'Mês atual', inicio: 'mes', fim: 0 },
  ]

  const aplicarAtalho = (atalho: { label: string; inicio: number | 'mes'; fim: number }) => {
    const hoje = new Date()
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const fim = new Date(hoje)
    fim.setDate(fim.getDate() + atalho.fim)
    let inicio: Date
    if (atalho.inicio === 'mes') {
      inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
    } else {
      inicio = new Date(hoje)
      inicio.setDate(inicio.getDate() + atalho.inicio)
    }
    if (atalho.label === 'Hoje') {
      setDiaUnico(fmt(fim))
    } else {
      setDiaUnico('')
      setDataInicio(fmt(inicio))
      setDataFim(fmt(fim))
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className="flex flex-wrap gap-2 mb-3">
        {atalhos.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={() => aplicarAtalho(a)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-green-500 transition-colors"
          >
            {a.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
        <div ref={dropdownRef} className="relative">
          <label className="block text-xs font-medium text-gray-700 mb-1">Bebedouro</label>
          <button
            type="button"
            onClick={() => setDropdownAberto(!dropdownAberto)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-left bg-white hover:bg-gray-50 flex items-center justify-between"
          >
            <span className="truncate">
              {bebedourosSelecionados.length === 0
                ? 'Todos'
                : bebedourosSelecionados.length === 1
                  ? bebedouros.find((b) => b.id === bebedourosSelecionados[0])?.nome || '1 selecionado'
                  : `${bebedourosSelecionados.length} selecionados`}
            </span>
            <span className="text-gray-400 ml-2">{dropdownAberto ? '▲' : '▼'}</span>
          </button>
          {dropdownAberto && (
            <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
              <button
                type="button"
                onClick={() => setBebedourosSelecionados([])}
                className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 border-b border-gray-100"
              >
                <span className="w-4 h-4 rounded border border-gray-300 flex items-center justify-center shrink-0">
                  {bebedourosSelecionados.length === 0 && <span className="text-green-600 text-xs">✓</span>}
                </span>
                <span className="font-medium">Todos</span>
              </button>
              {bebedouros.map((b) => {
                const checked = bebedourosSelecionados.includes(b.id)
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => toggleBebedouro(b.id)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                  >
                    <span
                      className="w-4 h-4 rounded border flex items-center justify-center shrink-0"
                      style={{ borderColor: checked ? '#22C55E' : '#D1D5DB', backgroundColor: checked ? '#22C55E' : 'transparent' }}
                    >
                      {checked && <span className="text-white text-xs">✓</span>}
                    </span>
                    <span>{b.nome}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Dia único</label>
          <input
            type="date"
            value={diaUnico}
            onChange={(e) => setDiaUnico(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:ring-green-600"
            style={{
              borderColor: diaUnico ? '#0F6437' : '#D1D5DB',
              backgroundColor: diaUnico ? '#F0FDF4' : '#fff',
            }}
          />
        </div>
        <div>
          <label className={`block text-xs font-medium mb-1 ${diaUnico ? 'text-gray-300' : 'text-gray-700'}`}>Data Início</label>
          <input
            type="date"
            value={dataInicio}
            onChange={(e) => {
              const [ini, fim] = ordenarPeriodo(e.target.value, dataFim)
              setDataInicio(ini)
              setDataFim(fim)
            }}
            disabled={!!diaUnico}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:ring-1 focus:ring-green-600 disabled:bg-gray-50 disabled:text-gray-300"
          />
        </div>
        <div>
          <label className={`block text-xs font-medium mb-1 ${diaUnico ? 'text-gray-300' : 'text-gray-700'}`}>Data Fim</label>
          <input
            type="date"
            value={dataFim}
            onChange={(e) => {
              const [ini, fim] = ordenarPeriodo(dataInicio, e.target.value)
              setDataInicio(ini)
              setDataFim(fim)
            }}
            disabled={!!diaUnico}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:ring-1 focus:ring-green-600 disabled:bg-gray-50 disabled:text-gray-300"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={onLimpar}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Limpar filtros
          </button>
        </div>
      </div>
    </div>
  )
}

// === Componentes no padrão visual do PDF (kpi, alertas, selos, tabelas) ===
// Mesmas cores/estrutura do PDF; o status nunca depende só da cor (texto + símbolo).

const TONS_KPI: Record<string, { borda: string; valor: string; larg: number }> = {
  green: { borda: '#0b6a42', valor: '#0b6a42', larg: 3 },
  gold: { borda: '#c28a27', valor: '#9a6b17', larg: 3 },
  red: { borda: '#c94d46', valor: '#c94d46', larg: 5 },
  gray: { borda: '#9aa5a0', valor: '#4f5f56', larg: 3 },
}

function KpiCard({ valor, label, tom, simbolo, sub }: { valor: string | number; label: string; tom: keyof typeof TONS_KPI; simbolo?: string; sub?: string }) {
  const t = TONS_KPI[tom]
  return (
    <div className="rounded-md bg-white p-3" style={{ border: '1px solid #dce5df', borderTop: `${t.larg}px solid ${t.borda}`, minHeight: 88 }}>
      <div className="text-xl font-bold leading-tight" style={{ color: t.valor }}>{valor}</div>
      <div className="mt-1.5 text-xs" style={{ color: '#63736a' }}>{simbolo ? `${simbolo} ` : ''}{label}</div>
      {sub && <div className="mt-0.5 text-[11px]" style={{ color: '#8a9890' }}>{sub}</div>}
    </div>
  )
}

function KpiGrid({ children, colunas }: { children: React.ReactNode; colunas: number }) {
  const cls = colunas >= 6 ? 'md:grid-cols-6' : colunas === 5 ? 'md:grid-cols-5' : colunas === 4 ? 'md:grid-cols-4' : 'md:grid-cols-3'
  return <div className={`grid grid-cols-2 gap-3 ${cls}`}>{children}</div>
}

function AlertLine({ prefixo, texto, tom }: { prefixo: string; texto: string; tom: 'warn' | 'crit' }) {
  const crit = tom === 'crit'
  return (
    <div
      className="rounded-r-md px-3 py-2 text-sm"
      style={{
        borderLeft: `${crit ? 5 : 3}px solid ${crit ? '#c94d46' : '#c28a27'}`,
        backgroundColor: crit ? '#fef2f2' : '#fffaf0',
        color: '#52635a',
      }}
    >
      <strong style={{ color: crit ? '#991b1b' : '#805d12' }}>{prefixo}</strong> {texto}
    </div>
  )
}

const ESTILOS_SELO = {
  ok: { simbolo: '●', cor: '#0b6a42', fundo: '#e9f5ee', borda: '#9ccfb2', estilo: 'solid', larg: 1 },
  warn: { simbolo: '▲', cor: '#805d12', fundo: '#fffaf0', borda: '#e3c27a', estilo: 'solid', larg: 1 },
  crit: { simbolo: '■', cor: '#991b1b', fundo: '#fef2f2', borda: '#991b1b', estilo: 'solid', larg: 1.5 },
  none: { simbolo: '○', cor: '#4f5f56', fundo: '#ffffff', borda: '#9aa5a0', estilo: 'dashed', larg: 1 },
  nometa: { simbolo: '–', cor: '#4f5f56', fundo: 'transparent', borda: 'transparent', estilo: 'solid', larg: 1 },
} as const

const TIPO_POR_LABEL: Record<string, keyof typeof ESTILOS_SELO> = {
  'Em dia': 'ok',
  'Dentro da meta': 'ok',
  Atrasado: 'warn',
  'Acima da meta': 'warn',
  'Atraso crítico': 'crit',
  'Muito acima da meta': 'crit',
  'Sem registro': 'none',
  'Primeira limpeza': 'none',
  'Sem meta': 'nometa',
}

function Selo({ label }: { label: string }) {
  const e = ESTILOS_SELO[TIPO_POR_LABEL[label] ?? 'nometa']
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-px text-[11px] font-bold whitespace-nowrap"
      style={{ color: e.cor, backgroundColor: e.fundo, border: `${e.larg}px ${e.estilo} ${e.borda}` }}
    >
      <span aria-hidden="true">{e.simbolo}</span>
      {label}
    </span>
  )
}

function LegendaTabela({ diaUnico }: { diaUnico: boolean }) {
  const itens = diaUnico
    ? ['● Dentro da meta', '▲ Acima da meta', '■ Muito acima da meta', '○ Primeira limpeza']
    : ['● Em dia', '▲ Atrasado', '■ Atraso crítico', '○ Sem registro', '– Sem meta']
  return (
    <p className="text-xs" style={{ color: '#63736a' }}>
      Legenda: {itens.join(' · ')}{diaUnico ? '' : ' · ! prazo vencido'}
    </p>
  )
}

const TH = 'py-2 px-3 text-left text-[11px] font-bold text-white whitespace-nowrap'
const TH_STYLE = { backgroundColor: '#0b6a42' }

function TabelaVerde({ children, cabecalho }: { children: React.ReactNode; cabecalho: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-md border" style={{ borderColor: '#dce5df' }}>
      <table className="min-w-full text-[13px]">
        <thead><tr>{cabecalho}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function KPIsLimpeza({ kpis, maisAtrasado, proximas }: {
  kpis: ReturnType<typeof calcularKPIsCronograma>
  maisAtrasado: { nome: string; dias: number; meta: number } | null
  proximas: { nome: string; proximaLimpeza: string; diasParaProxima: number }[]
}) {
  const cards = [
    <KpiCard key="t" valor={kpis.total} label="Cadastrados" tom="green" />,
    <KpiCard key="o" valor={kpis.emDia} label="Dentro da meta" tom="green" simbolo="●" sub={`${kpis.pctEmDia}% dos bebedouros`} />,
    <KpiCard key="a" valor={kpis.atrasado} label="Atrasados" tom="gold" simbolo="▲" />,
    <KpiCard key="c" valor={kpis.critico} label="Atraso crítico" tom="red" simbolo="■" />,
    <KpiCard key="r" valor={kpis.semRegistro} label="Sem registro" tom="gray" simbolo="○" />,
  ]
  if (kpis.semMeta > 0) cards.push(<KpiCard key="m" valor={kpis.semMeta} label="Sem meta" tom="gray" simbolo="–" />)
  return (
    <div className="space-y-3">
      <KpiGrid colunas={cards.length}>{cards}</KpiGrid>
      {maisAtrasado && (
        <AlertLine
          tom="crit"
          prefixo="CRÍTICO — maior atraso:"
          texto={`${maisAtrasado.nome} com ${maisAtrasado.dias} dias desde a última limpeza. Meta: ${maisAtrasado.meta} dias.`}
        />
      )}
      {proximas.length > 0 && (
        <AlertLine
          tom="warn"
          prefixo="PRÓXIMOS 7 DIAS — limpezas previstas:"
          texto={`${proximas.length} bebedouro(s): ${proximas.slice(0, 8).map((p) => `${p.nome} (${formatarData(p.proximaLimpeza)})`).join(', ')}${proximas.length > 8 ? ` e mais ${proximas.length - 8}` : ''}.`}
        />
      )}
    </div>
  )
}

function KPIsLimpezaDia({ limpezas }: { limpezas: LimpezaDoDiaItem[] }) {
  const conta = (label: string) => limpezas.filter((l) => l.statusLabel === label).length
  const intervalos = limpezas.map((l) => l.intervalo).filter((v): v is number => v !== null)
  const intervaloMedio = intervalos.length > 0 ? Math.round(intervalos.reduce((s, v) => s + v, 0) / intervalos.length) : null
  return (
    <div className="space-y-3">
      <KpiGrid colunas={4}>
        <KpiCard valor={limpezas.length} label="Limpos no dia" tom="green" />
        <KpiCard valor={conta('Dentro da meta')} label="Dentro da meta" tom="green" simbolo="●" />
        <KpiCard valor={conta('Acima da meta')} label="Acima da meta" tom="gold" simbolo="▲" />
        <KpiCard valor={conta('Muito acima da meta')} label="Muito acima da meta" tom="red" simbolo="■" />
      </KpiGrid>
      {intervaloMedio !== null && (
        <span className="inline-block rounded-full px-3 py-0.5 text-xs font-bold" style={{ color: '#0b6a42', backgroundColor: '#f0f6f2', border: '1px solid #d3e4d9' }}>
          Intervalo médio: {intervaloMedio}d
        </span>
      )}
    </div>
  )
}

function TabelaCronograma({ itens, dataReferencia }: { itens: ItemCronograma[]; dataReferencia: string }) {
  if (itens.length === 0) {
    return <div className="text-center text-gray-400 py-8 bg-gray-50 rounded-lg">Nenhum bebedouro cadastrado.</div>
  }
  return (
    <div className="space-y-2">
      <p className="text-xs" style={{ color: '#63736a' }}>
        Última e próxima limpeza de cada bebedouro (próxima = última + meta), com prazo em relação a {formatarData(dataReferencia)}.
      </p>
      <TabelaVerde
        cabecalho={
          <>
            <th className={TH} style={TH_STYLE}>Bebedouro</th>
            <th className={TH} style={TH_STYLE}>Última limpeza</th>
            <th className={TH} style={TH_STYLE}>Próxima limpeza</th>
            <th className={TH} style={TH_STYLE}>Prazo</th>
            <th className={TH} style={TH_STYLE}>Status</th>
            <th className={`${TH} text-right`} style={TH_STYLE}>Meta</th>
            <th className={TH} style={TH_STYLE}>Responsável (última)</th>
            <th className={`${TH} text-right`} style={TH_STYLE}>No período</th>
          </>
        }
      >
        {itens.map((i, idx) => {
          const vencida = i.diasParaProxima !== null && i.diasParaProxima < 0
          const base = {
            backgroundColor: idx % 2 === 1 ? '#f7faf8' : '#fff',
            borderBottom: '1px solid #e5ebe7',
            color: vencida ? '#991b1b' : '#4f5f56',
            fontWeight: vencida ? 700 : 400,
          } as const
          return (
            <tr key={i.id}>
              <td className="py-2 px-3 whitespace-nowrap" style={{ ...base, borderLeft: vencida ? '4px solid #c94d46' : '4px solid transparent' }}>{i.nome}</td>
              <td className="py-2 px-3 whitespace-nowrap" style={base}>{i.ultimaLimpeza ? formatarData(i.ultimaLimpeza) : '—'}</td>
              <td className="py-2 px-3 whitespace-nowrap" style={{ ...base, fontWeight: 700, color: vencida ? '#991b1b' : '#26352e' }}>
                {i.proximaLimpeza ? formatarData(i.proximaLimpeza) : i.ultimaLimpeza ? 'Sem meta' : 'Pendente'}
              </td>
              <td className="py-2 px-3 whitespace-nowrap" style={base}>{vencida ? '! ' : ''}{textoPrazo(i.diasParaProxima)}</td>
              <td className="py-2 px-3" style={base}><Selo label={i.status.label} /></td>
              <td className="py-2 px-3 text-right" style={base}>{i.meta ? `${i.meta}d` : '—'}</td>
              <td className="py-2 px-3 whitespace-nowrap" style={base}>{i.responsavelUltima || '—'}</td>
              <td className="py-2 px-3 text-right" style={base}>{i.limpezasNoPeriodo}</td>
            </tr>
          )
        })}
      </TabelaVerde>
      <LegendaTabela diaUnico={false} />
    </div>
  )
}

function TabelaLimpezasDia({ limpezas }: { limpezas: LimpezaDoDiaItem[] }) {
  if (limpezas.length === 0) {
    return <div className="text-center text-gray-400 py-8 bg-gray-50 rounded-lg">Nenhum bebedouro foi limpo neste dia.</div>
  }
  return (
    <div className="space-y-2">
      <TabelaVerde
        cabecalho={
          <>
            <th className={TH} style={TH_STYLE}>Bebedouro</th>
            <th className={TH} style={TH_STYLE}>Limpeza anterior</th>
            <th className={TH} style={TH_STYLE}>Limpeza do dia</th>
            <th className={TH} style={TH_STYLE}>Próxima prevista</th>
            <th className={TH} style={TH_STYLE}>Status</th>
            <th className={TH} style={TH_STYLE}>Intervalo / meta</th>
            <th className={TH} style={TH_STYLE}>Responsável</th>
          </>
        }
      >
        {limpezas.map((l, idx) => {
          const base = { backgroundColor: idx % 2 === 1 ? '#f7faf8' : '#fff', borderBottom: '1px solid #e5ebe7', color: '#4f5f56' } as const
          return (
            <tr key={l.id}>
              <td className="py-2 px-3 whitespace-nowrap" style={base}>{l.nome}</td>
              <td className="py-2 px-3 whitespace-nowrap" style={base}>{l.dataLimpezaAnterior ? formatarData(l.dataLimpezaAnterior) : '—'}</td>
              <td className="py-2 px-3 whitespace-nowrap" style={base}>{formatarData(l.dataLimpeza)}</td>
              <td className="py-2 px-3 whitespace-nowrap font-bold" style={{ ...base, color: '#26352e' }}>{l.proximaPrevista ? formatarData(l.proximaPrevista) : 'Sem meta'}</td>
              <td className="py-2 px-3" style={base}><Selo label={l.statusLabel} /></td>
              <td className="py-2 px-3 whitespace-nowrap" style={base}>{l.intervalo === null ? '—' : `${l.intervalo}d`} / {l.meta ? `${l.meta}d` : '—'}</td>
              <td className="py-2 px-3 whitespace-nowrap" style={base}>{l.responsavel || '—'}</td>
            </tr>
          )
        })}
      </TabelaVerde>
      <LegendaTabela diaUnico />
    </div>
  )
}

function OcorrenciasPorBebedouro({ itens }: { itens: { bebedouro: string; quantidade: number }[] }) {
  if (itens.length === 0) return null
  return (
    <p className="text-sm" style={{ color: '#4f5f56' }}>
      <strong>Ocorrências por bebedouro:</strong> {itens.map((i) => `${i.bebedouro}: ${i.quantidade}`).join(' · ')}
    </p>
  )
}

function KPIsChecklist({ kpis }: { kpis: ReturnType<typeof calcularChecklist>['kpis'] }) {
  const ipm = kpis.itemMaisProblematico
  return (
    <div className="space-y-3">
      <KpiGrid colunas={3}>
        <KpiCard valor={kpis.totalRegistros} label="Registros no período" tom="green" />
        <KpiCard valor={kpis.comChecklist} label="Registros com checklist" tom="green" />
        <KpiCard valor={`${kpis.negativos} (${kpis.pctNegativos}%)`} label="Registros com ponto de atenção" tom="red" simbolo="!" />
      </KpiGrid>
      {ipm && (
        <AlertLine
          tom="warn"
          prefixo="ATENÇÃO — item mais problemático:"
          texto={`${ipm.label} com ${ipm.pctNegativo}% de respostas negativas (${ipm.negativos}/${ipm.total}).`}
        />
      )}
    </div>
  )
}

function GraficoProblemas({ ranking }: { ranking: ReturnType<typeof calcularChecklist>['ranking'] }) {
  if (ranking.length === 0 || ranking.every((r) => r.total === 0)) {
    return (
      <div className="text-center text-gray-400 py-6 bg-gray-50 rounded-lg">
        Nenhum checklist respondido no período.
      </div>
    )
  }

  const dados = ranking.map((item) => ({
    label: item.label,
    pctNegativo: item.pctNegativo,
    negativos: item.negativos,
    total: item.total,
    cor: '#c94d46',
  }))

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2" style={{ color: '#30463a' }}>Problemas mais frequentes nos checklists</h3>
      <div style={{ width: '100%', height: Math.max(180, dados.length * 44) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} layout="vertical" margin={{ top: 5, right: 80, bottom: 5, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
            <XAxis
              type="number"
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: '#6B7280' }}
              tickFormatter={(v) => `${v}%`}
            />
            <YAxis
              type="category"
              dataKey="label"
              tick={{ fontSize: 11, fill: '#374151' }}
              width={130}
            />
            <Tooltip
              cursor={{ fill: '#F9FAFB' }}
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null
                const d = payload[0].payload as typeof dados[number]
                return (
                  <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs space-y-1">
                    <p className="font-semibold text-gray-900">{d.label}</p>
                    <p className="text-gray-600">Negativos: <span className="font-medium" style={{ color: d.cor }}>{d.negativos}/{d.total}</span></p>
                    <p className="text-gray-600">% negativo: <span className="font-medium" style={{ color: d.cor }}>{d.pctNegativo}%</span></p>
                    <p className="text-gray-600">% conforme: <span className="font-medium">{100 - d.pctNegativo}%</span></p>
                  </div>
                )
              }}
            />
            <Bar dataKey="pctNegativo" radius={[0, 4, 4, 0]}>
              {dados.map((d, i) => (
                <Cell key={i} fill={d.cor} />
              ))}
              <LabelList
                dataKey="pctNegativo"
                position="right"
                formatter={((v: any, _e: any, props: any) => { const d = dados[props?.index ?? 0]; return d ? `${v}% (${d.negativos}/${d.total})` : `${v}%` }) as any}
                style={{ fontSize: 10, fill: '#6B7280' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function TabelaOcorrencias({ ocorrencias }: { ocorrencias: OcorrenciaCalculada[] }) {
  if (ocorrencias.length === 0) {
    return (
      <div className="rounded-md p-3 text-center text-sm" style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', color: '#15803d' }}>
        Nenhuma ocorrência negativa nos checklists do período.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold" style={{ color: '#30463a' }}>
        Ocorrências negativas <span className="font-normal text-xs" style={{ color: '#8a9890' }}>· {ocorrencias.length} ocorrência(s)</span>
      </h3>
      <TabelaVerde
        cabecalho={
          <>
            <th className={TH} style={TH_STYLE}>Data</th>
            <th className={TH} style={TH_STYLE}>Bebedouro</th>
            <th className={TH} style={TH_STYLE}>Itens negativos e observação de cada item</th>
            <th className={TH} style={TH_STYLE}>Observação geral</th>
            <th className={TH} style={TH_STYLE}>Responsável</th>
          </>
        }
      >
        {ocorrencias.map((o, idx) => {
          const base = { backgroundColor: idx % 2 === 1 ? '#f7faf8' : '#fff', borderBottom: '1px solid #e5ebe7', color: '#4f5f56' } as const
          return (
            <tr key={`${o.data}-${o.bebedouro}-${idx}`} className="align-top">
              <td className="py-2 px-3 whitespace-nowrap" style={base}>{formatarData(o.data)}</td>
              <td className="py-2 px-3" style={base}>{o.bebedouro}</td>
              <td className="py-2 px-3" style={base}>
                {o.itens.map((item) => (
                  <div key={item.label} className="mb-0.5">
                    <b style={{ color: '#26352e' }}>✕ {item.label}</b>
                    {item.obs && <span> — {item.obs}</span>}
                  </div>
                ))}
              </td>
              <td className="py-2 px-3" style={base}>{o.obsGeral || '—'}</td>
              <td className="py-2 px-3 whitespace-nowrap" style={base}>{o.responsavel || '—'}</td>
            </tr>
          )
        })}
      </TabelaVerde>
    </div>
  )
}
