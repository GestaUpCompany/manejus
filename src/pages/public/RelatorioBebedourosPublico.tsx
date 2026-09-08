import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase } from '../../services/supabaseClient'
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts'
import logoManejus from '/images/manejus360.png'
import { gerarRelatorioBebedourosPDF } from '../../utils/relatorioBebedourosPDF'

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

const CHECKLIST_ITEMS: { key: string; label: string }[] = [
  { key: 'agua_suficiente', label: 'Água insuficiente' },
  { key: 'vazao_bebedouro_ideal', label: 'Vazão não ideal' },
  { key: 'espacamento_bebedouro_ideal', label: 'Espaçamento não ideal' },
  { key: 'boia_protecao_boas_condicoes', label: 'Bóia/proteção em más condições' },
  { key: 'aterro_acesso_bebedouro_ideal', label: 'Aterro/acesso não ideal' },
]

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

interface StatusLimpeza {
  bebedouro: Bebedouro
  ultimaLimpeza: string | null
  diasDesdeUltima: number | null
  meta: number | null
  statusLabel: string
  statusCor: string
  limpezasNoPeriodo: number
  observacaoUltima: string | null
}

interface OcorrenciaChecklist {
  id: string
  data: string
  bebedouro: string
  responsavel: string | null
  itensNegativos: { key: string; label: string; observacao: string }[]
  observacaoGeral: string | null
}

interface LimpezaKPIs {
  total: number
  emDia: number
  atrasado: number
  critico: number
  semRegistro: number
  pctEmDia: number
}

interface ChecklistItemRanking {
  key: string
  label: string
  conformes: number
  negativos: number
  total: number
  pctConforme: number
  pctNegativo: number
}

interface ChecklistKPIs {
  totalRegistros: number
  comChecklist: number
  negativos: number
  pctNegativos: number
  itensRanking: ChecklistItemRanking[]
  itemMaisProblematico: ChecklistItemRanking | null
}

interface LimpezaDoDia {
  id: string
  nome: string
  dataLimpeza: string
  responsavel: string | null
  observacao: string | null
  intervalo: number | null
  meta: number | null
  statusLabel: string
  statusCor: string
  dataLimpezaAnterior: string | null
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

function statusLimpeza(diasDesde: number | null, meta: number | null): { label: string; cor: string } {
  if (diasDesde === null) return { label: 'Sem registro', cor: '#6B7280' }
  if (!meta || meta <= 0) return { label: `${diasDesde}d`, cor: '#6B7280' }
  if (diasDesde <= meta) return { label: 'Em dia', cor: '#22C55E' }
  if (diasDesde <= Math.ceil(meta * 1.3)) return { label: 'Atrasado', cor: '#F59E0B' }
  return { label: 'Atraso crítico', cor: '#EF4444' }
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

  const limpezasFiltradas = useMemo(() => {
    const inicio = periodoInicio
    const fim = periodoFim
    return todasLimpezas.filter((l) => {
      if (bebedourosSelecionados.length > 0 && !bebedourosSelecionados.includes(l.bebedouro_id)) return false
      const data = l.data_limpeza.split('T')[0]
      return data >= inicio && data <= fim
    }).map((l) => {
      const dataLimpeza = l.data_limpeza.split('T')[0]
      const registroMatch = registros.find((r) => {
        const dataRegistro = r.data.split('T')[0]
        return r.numero_bebedouro === l.bebedouro_nome && dataRegistro === dataLimpeza
      })
      return {
        ...l,
        observacao: registroMatch?.observacao || null,
      }
    })
  }, [todasLimpezas, periodoInicio, periodoFim, registros, bebedourosSelecionados])

  const registrosFiltrados = useMemo(() => {
    if (bebedourosSelecionados.length === 0) return registros
    const nomesSelecionados = bebedouros
      .filter((b) => bebedourosSelecionados.includes(b.id))
      .map((b) => b.nome)
    return registros.filter((r) => r.numero_bebedouro && nomesSelecionados.includes(r.numero_bebedouro))
  }, [registros, bebedourosSelecionados, bebedouros])

  const statusPorBebedouro: StatusLimpeza[] = useMemo(() => {
    const fim = periodoFim
    // Normaliza para date-only (meia-noite local) para que a diferenca seja sempre
    // um numero inteiro de dias de calendario, independente de timezone ou horario.
    const toDateOnly = (dateStr: string) => {
      const d = new Date(dateStr.split('T')[0] + 'T00:00:00')
      d.setHours(0, 0, 0, 0)
      return d
    }
    const dataReferencia = toDateOnly(fim)

    return bebedourosFiltrados.map((b) => {
      const limpezasDoBebedouro = todasLimpezas
        .filter((l) => l.bebedouro_id === b.id)
        .sort((a, b2) => toDateOnly(b2.data_limpeza).getTime() - toDateOnly(a.data_limpeza).getTime())

      const ultima = limpezasDoBebedouro[0] || null
      const diasDesdeUltima = ultima
        ? Math.max(Math.round((dataReferencia.getTime() - toDateOnly(ultima.data_limpeza).getTime()) / (1000 * 60 * 60 * 24)), 0)
        : null

      const status = statusLimpeza(diasDesdeUltima, b.meta_intervalo_limpeza)
      const limpezasNoPeriodo = limpezasFiltradas.filter((l) => l.bebedouro_id === b.id).length

      return {
        bebedouro: b,
        ultimaLimpeza: ultima?.data_limpeza || null,
        diasDesdeUltima,
        meta: b.meta_intervalo_limpeza,
        statusLabel: status.label,
        statusCor: status.cor,
        limpezasNoPeriodo,
        observacaoUltima: ultima?.observacao || null,
      }
    })
  }, [bebedourosFiltrados, todasLimpezas, limpezasFiltradas, periodoFim])

  const limpezaKPIs: LimpezaKPIs = useMemo(() => {
    const total = statusPorBebedouro.length
    const emDia = statusPorBebedouro.filter((s) => s.statusLabel === 'Em dia').length
    const atrasado = statusPorBebedouro.filter((s) => s.statusLabel === 'Atrasado').length
    const critico = statusPorBebedouro.filter((s) => s.statusLabel === 'Atraso crítico').length
    const semRegistro = statusPorBebedouro.filter((s) => s.statusLabel === 'Sem registro').length
    const pctEmDia = total > 0 ? Math.round((emDia / total) * 100) : 0
    return { total, emDia, atrasado, critico, semRegistro, pctEmDia }
  }, [statusPorBebedouro])

  const maisAtrasado = useMemo(() => {
    const comDias = statusPorBebedouro.filter((s) => s.diasDesdeUltima !== null && s.statusLabel !== 'Em dia')
    if (comDias.length === 0) return null
    return comDias.reduce((max, s) => (s.diasDesdeUltima! > max.diasDesdeUltima! ? s : max))
  }, [statusPorBebedouro])

  const ehDiaUnico = diaUnico !== '' || (dataInicio !== '' && dataFim !== '' && dataInicio === dataFim)
  const diaUnicoEfetivo = diaUnico || (dataInicio !== '' && dataFim !== '' && dataInicio === dataFim ? dataInicio : '')

  const limpezasDoDia = useMemo(() => {
    if (!ehDiaUnico) return []
    const dia = diaUnicoEfetivo
    return bebedourosFiltrados
      .map((b) => {
        const limpezasDoBebedouro = todasLimpezas
          .filter((l) => l.bebedouro_id === b.id)
          .sort((a, b2) => new Date(b2.data_limpeza).getTime() - new Date(a.data_limpeza).getTime())
        const limpezaDoDia = limpezasDoBebedouro.find((l) => l.data_limpeza.split('T')[0] === dia)
        if (!limpezaDoDia) return null
        const idx = limpezasDoBebedouro.indexOf(limpezaDoDia)
        const anterior = limpezasDoBebedouro[idx + 1] || null
        const intervalo = anterior
          ? Math.max(Math.round((new Date(limpezaDoDia.data_limpeza).getTime() - new Date(anterior.data_limpeza).getTime()) / (1000 * 60 * 60 * 24)), 0)
          : null
        const meta = b.meta_intervalo_limpeza
        const status = !meta || meta <= 0
          ? { label: `${intervalo ?? 0}d`, cor: '#6B7280' }
          : intervalo === null
            ? { label: 'Primeira limpeza', cor: '#6B7280' }
            : intervalo <= meta
              ? { label: 'Dentro da meta', cor: '#22C55E' }
              : intervalo <= Math.ceil(meta * 1.3)
                ? { label: 'Acima da meta', cor: '#F59E0B' }
                : { label: 'Muito acima da meta', cor: '#EF4444' }
        return {
          id: b.id,
          nome: b.nome,
          dataLimpeza: limpezaDoDia.data_limpeza,
          responsavel: limpezaDoDia.responsavel,
          observacao: limpezaDoDia.observacao,
          intervalo,
          meta,
          statusLabel: status.label,
          statusCor: status.cor,
          dataLimpezaAnterior: anterior?.data_limpeza || null,
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => (b.intervalo ?? 0) - (a.intervalo ?? 0))
  }, [ehDiaUnico, diaUnicoEfetivo, bebedourosFiltrados, todasLimpezas])

  const checklistKPIs: ChecklistKPIs = useMemo(() => {
    const totalRegistros = registrosFiltrados.length
    const comChecklist = registrosFiltrados.filter((r) => r.checklist && Object.keys(r.checklist).length > 0)
    const negativos = comChecklist.filter((r) =>
      CHECKLIST_ITEMS.some((item) => r.checklist?.[item.key]?.valor === false)
    )
    const pctNegativos = comChecklist.length > 0 ? Math.round((negativos.length / comChecklist.length) * 100) : 0

    const itensRanking: ChecklistItemRanking[] = CHECKLIST_ITEMS.map((item) => {
      const total = comChecklist.length
      const conformes = comChecklist.filter((r) => r.checklist?.[item.key]?.valor === true).length
      const negativosItem = comChecklist.filter((r) => r.checklist?.[item.key]?.valor === false).length
      const pctConforme = total > 0 ? Math.round((conformes / total) * 100) : 0
      const pctNegativo = total > 0 ? Math.round((negativosItem / total) * 100) : 0
      return { key: item.key, label: item.label, conformes, negativos: negativosItem, total, pctConforme, pctNegativo }
    }).sort((a, b) => b.pctNegativo - a.pctNegativo)

    const itemMaisProblematico = itensRanking[0]?.pctNegativo > 0 ? itensRanking[0] : null

    return { totalRegistros, comChecklist: comChecklist.length, negativos: negativos.length, pctNegativos, itensRanking, itemMaisProblematico }
  }, [registrosFiltrados])

  const ocorrenciasNegativas: OcorrenciaChecklist[] = useMemo(() => {
    return registrosFiltrados
      .filter((r) => r.checklist)
      .map((r) => {
        const itensNegativos = CHECKLIST_ITEMS
          .filter((item) => r.checklist?.[item.key]?.valor === false)
          .map((item) => ({
            key: item.key,
            label: item.label,
            observacao: r.checklist?.[item.key]?.observacao || '',
          }))
        return {
          id: r.id,
          data: r.data,
          bebedouro: r.numero_bebedouro || 'Sem identificação',
          responsavel: r.responsavel,
          itensNegativos,
          observacaoGeral: r.observacao,
        }
      })
      .filter((o) => o.itensNegativos.length > 0)
      .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
  }, [registrosFiltrados])

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

      const limpezasDoDiaPDF = ehDiaUnico ? limpezasDoDia.map((l) => ({
        nome: l.nome,
        intervalo: l.intervalo,
        cor: l.statusCor,
        meta: l.meta,
        dataLimpeza: l.dataLimpeza,
        dataLimpezaAnterior: l.dataLimpezaAnterior,
        statusLabel: l.statusLabel,
        responsavel: l.responsavel,
      })) : undefined

      const statusPorBebedouroPDF = !ehDiaUnico ? statusPorBebedouro.map((s) => ({
        nome: s.bebedouro.nome,
        dias: s.diasDesdeUltima,
        cor: s.statusCor,
        meta: s.meta,
        ultimaLimpeza: s.ultimaLimpeza,
        limpezasNoPeriodo: s.limpezasNoPeriodo,
        statusLabel: s.statusLabel,
      })) : undefined

      const maisAtrasadoPDF = maisAtrasado ? {
        nome: maisAtrasado.bebedouro.nome,
        dias: maisAtrasado.diasDesdeUltima!,
        meta: maisAtrasado.meta!,
      } : null

      const ocorrenciasPDF = ocorrenciasNegativas.map((o) => ({
        data: o.data,
        bebedouro: o.bebedouro,
        itensNegativos: o.itensNegativos.map((i) => i.label).join(', '),
        obsItens: o.itensNegativos.map((i) => i.observacao).filter(Boolean).join('; '),
        obsGeral: o.observacaoGeral || '',
        responsavel: o.responsavel || '',
      }))

      const blob = await gerarRelatorioBebedourosPDF({
        titulo: relatorioInfo.titulo || 'Relatório de Bebedouros',
        fazendaNome: relatorioInfo.fazenda_nome,
        fazendaLogoUrl: relatorioInfo.fazenda_logo_url,
        dataInicio: periodoInicio,
        dataFim: periodoFim,
        ehDiaUnico,
        diaUnico: diaUnicoEfetivo || undefined,
        limpezaKPIs: !ehDiaUnico ? limpezaKPIs : undefined,
        maisAtrasado: !ehDiaUnico ? maisAtrasadoPDF : null,
        statusPorBebedouro: statusPorBebedouroPDF,
        limpezaDiaKPIs,
        limpezasDoDia: limpezasDoDiaPDF,
        checklistKPIs: {
          totalRegistros: checklistKPIs.totalRegistros,
          comChecklist: checklistKPIs.comChecklist,
          negativos: checklistKPIs.negativos,
          pctNegativos: checklistKPIs.pctNegativos,
          itemMaisProblematico: checklistKPIs.itemMaisProblematico ? {
            label: checklistKPIs.itemMaisProblematico.label,
            pctNegativo: checklistKPIs.itemMaisProblematico.pctNegativo,
            negativos: checklistKPIs.itemMaisProblematico.negativos,
            total: checklistKPIs.itemMaisProblematico.total,
          } : null,
        },
        itensRanking: checklistKPIs.itensRanking.map((r) => ({
          label: r.label,
          pctNegativo: r.pctNegativo,
          negativos: r.negativos,
          total: r.total,
        })),
        ocorrencias: ocorrenciasPDF,
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
      console.error('Erro ao exportar PDF:', err)
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

        <Secao titulo="1. Status de limpeza dos bebedouros">
          {ehDiaUnico ? (
            <>
              <KPIsLimpezaDia limpezas={limpezasDoDia} data={diaUnicoEfetivo} />
              <GraficoLimpezaDia limpezas={limpezasDoDia} onSelecionar={setBebedourosSelecionados} />
            </>
          ) : (
            <>
              <KPIsLimpeza kpis={limpezaKPIs} maisAtrasado={maisAtrasado} />
              <GraficoLimpeza status={statusPorBebedouro} onSelecionar={setBebedourosSelecionados} dataReferencia={diaUnico || dataFim || 'hoje'} />
            </>
          )}
        </Secao>

        <Secao titulo="2. Pontos de atenção nos bebedouros">
          <KPIsChecklist kpis={checklistKPIs} />
          <GraficoProblemas ranking={checklistKPIs.itensRanking} />
          <TabelaOcorrencias ocorrencias={ocorrenciasNegativas} />
        </Secao>
      </div>
    </div>
  )
}

function LegendaStatus({ diaUnico }: { diaUnico: boolean }) {
  const itens = diaUnico
    ? [
        { cor: '#22C55E', label: 'Dentro da meta', desc: 'intervalo até a meta' },
        { cor: '#F59E0B', label: 'Acima da meta', desc: 'passou até ~30% da meta' },
        { cor: '#EF4444', label: 'Muito acima da meta', desc: 'passou mais de ~30% da meta' },
        { cor: '#6B7280', label: 'Primeira limpeza', desc: 'sem intervalo anterior' },
      ]
    : [
        { cor: '#22C55E', label: 'Em dia', desc: 'limpo dentro da meta' },
        { cor: '#F59E0B', label: 'Atrasado', desc: 'passou até ~30% da meta' },
        { cor: '#EF4444', label: 'Atraso crítico', desc: 'passou mais de ~30% da meta' },
        { cor: '#6B7280', label: 'Sem registro', desc: 'nenhuma limpeza registrada' },
      ]
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-500 bg-gray-50 rounded-lg p-2.5 border border-gray-100">
      {itens.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: i.cor }} />
          <span className="font-medium text-gray-700">{i.label}</span>
          <span className="hidden sm:inline text-gray-400">({i.desc})</span>
        </span>
      ))}
    </div>
  )
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100" style={{ backgroundColor: '#FAFAF9' }}>
        <h2 className="text-base font-semibold text-gray-900">{titulo}</h2>
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
            onChange={(e) => setDataInicio(e.target.value)}
            disabled={!!diaUnico}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-600 focus:ring-1 focus:ring-green-600 disabled:bg-gray-50 disabled:text-gray-300"
          />
        </div>
        <div>
          <label className={`block text-xs font-medium mb-1 ${diaUnico ? 'text-gray-300' : 'text-gray-700'}`}>Data Fim</label>
          <input
            type="date"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
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

function KPIsLimpeza({ kpis, maisAtrasado }: { kpis: LimpezaKPIs; maisAtrasado: StatusLimpeza | null }) {
  const cards = [
    { label: 'Bebedouros cadastrados', valor: kpis.total, cor: '#111827' },
    { label: 'Dentro da meta', valor: kpis.emDia, subtitulo: `${kpis.pctEmDia}%`, cor: '#22C55E' },
    { label: 'Atrasados', valor: kpis.atrasado, cor: '#F59E0B' },
    { label: 'Atraso crítico', valor: kpis.critico, cor: '#EF4444' },
    { label: 'Sem registro', valor: kpis.semRegistro, cor: '#6B7280' },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-gray-200 p-4 text-center" style={{ borderLeftWidth: 4, borderLeftColor: c.cor }}>
            <p className="text-xs text-gray-500 uppercase tracking-wide">{c.label}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: c.cor }}>{c.valor}</p>
            {c.subtitulo && <p className="text-xs text-gray-500 mt-1">{c.subtitulo}</p>}
          </div>
        ))}
      </div>
      {maisAtrasado && (
        <div className="rounded-lg p-3 border" style={{ backgroundColor: '#FEF2F2', borderColor: '#FECACA' }}>
          <p className="text-sm text-gray-800">
            <span className="font-semibold">Maior atraso:</span> {maisAtrasado.bebedouro.nome} com {maisAtrasado.diasDesdeUltima} dias desde a última limpeza. Meta: {maisAtrasado.meta} dias.
          </p>
        </div>
      )}
    </div>
  )
}

function KPIsLimpezaDia({ limpezas, data }: { limpezas: LimpezaDoDia[]; data: string }) {
  const total = limpezas.length
  const dentroMeta = limpezas.filter((l) => l.statusLabel === 'Dentro da meta').length
  const acimaMeta = limpezas.filter((l) => l.statusLabel === 'Acima da meta').length
  const muitoAcima = limpezas.filter((l) => l.statusLabel === 'Muito acima da meta').length
  const primeiraLimpeza = limpezas.filter((l) => l.statusLabel === 'Primeira limpeza').length
  const intervalos = limpezas.map((l) => l.intervalo).filter((v): v is number => v !== null)
  const intervaloMedio = intervalos.length > 0 ? Math.round(intervalos.reduce((s, v) => s + v, 0) / intervalos.length) : null

  const cards = [
    { label: 'Limpos no dia', valor: total, cor: '#111827' },
    { label: 'Dentro da meta', valor: dentroMeta, cor: '#22C55E' },
    { label: 'Acima da meta', valor: acimaMeta, cor: '#F59E0B' },
    { label: 'Muito acima da meta', valor: muitoAcima, cor: '#EF4444' },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-gray-200 p-4 text-center" style={{ borderLeftWidth: 4, borderLeftColor: c.cor }}>
            <p className="text-xs text-gray-500 uppercase tracking-wide">{c.label}</p>
            <p className="text-3xl font-bold mt-1" style={{ color: c.cor }}>{c.valor}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-gray-600">
        {primeiraLimpeza > 0 && <span className="px-2 py-1 rounded-full bg-gray-100">{primeiraLimpeza} primeira limpeza (sem intervalo)</span>}
        {intervaloMedio !== null && <span className="px-2 py-1 rounded-full bg-gray-100">Intervalo médio: {intervaloMedio}d</span>}
        <span className="px-2 py-1 rounded-full bg-gray-100">Data: {formatarData(data)}</span>
      </div>
    </div>
  )
}

function GraficoLimpezaDia({ limpezas, onSelecionar }: { limpezas: LimpezaDoDia[]; onSelecionar: (ids: string[]) => void }) {
  if (limpezas.length === 0) {
    return (
      <div className="text-center text-gray-400 py-8 bg-gray-50 rounded-lg">
        Nenhum bebedouro foi limpo neste dia.
      </div>
    )
  }

  const dados = limpezas.map((l) => ({
    nome: l.nome,
    intervalo: l.intervalo ?? 0,
    semIntervalo: l.intervalo === null,
    cor: l.statusCor,
    meta: l.meta,
    responsavel: l.responsavel,
    observacao: l.observacao,
    statusLabel: l.statusLabel,
    dataLimpeza: l.dataLimpeza,
    dataLimpezaAnterior: l.dataLimpezaAnterior,
    id: l.id,
  }))

  const metas = dados.filter((d) => d.meta && d.meta > 0)
  const temMeta = metas.length > 0
  const maxMeta = temMeta ? Math.max(...metas.map((d) => d.meta!)) : 0
  const maxIntervalo = Math.max(...dados.map((d) => d.intervalo), maxMeta, 1)
  const limiteX = Math.ceil(maxIntervalo * 1.15)

  const renderBarraComMeta = (props: any) => {
    const { x, y, width, height, payload, fill } = props
    const meta = payload?.meta
    const intervalo = payload?.intervalo
    const elements: any[] = [
      <rect key="bar" x={x} y={y} width={Math.max(width, intervalo === 0 ? 4 : 0)} height={height} fill={fill} rx={4} ry={4} />
    ]
    if (meta && meta > 0 && intervalo > 0 && width > 0) {
      const metaX = x + (meta * width / intervalo)
      elements.push(
        <line
          key="meta"
          x1={metaX}
          y1={y - 3}
          x2={metaX}
          y2={y + height + 3}
          stroke="#0F6437"
          strokeWidth={2}
          strokeDasharray="4 3"
        />
      )
    }
    return <g>{elements}</g>
  }

  const handleClick = (d: any) => {
    const id = d.id ?? d.payload?.id
    onSelecionar([id])
  }

  return (
    <div>
      <LegendaStatus diaUnico={true} />
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700 mt-2">Intervalo desde a limpeza anterior</h3>
        <p className="text-xs text-gray-500">
          {temMeta ? 'Marca verde tracejada = meta individual' : 'Sem meta configurada'}
        </p>
      </div>
      <div style={{ width: '100%', height: Math.max(220, dados.length * 38) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} layout="vertical" margin={{ top: 5, right: 40, bottom: 5, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
            <XAxis
              type="number"
              domain={[0, limiteX]}
              tick={{ fontSize: 11, fill: '#6B7280' }}
              tickFormatter={(v) => `${v}d`}
            />
            <YAxis
              type="category"
              dataKey="nome"
              tick={{ fontSize: 11, fill: '#374151' }}
              width={110}
            />
            <Tooltip
              cursor={{ fill: '#F9FAFB' }}
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null
                const d = payload[0].payload as typeof dados[number]
                return (
                  <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs space-y-1">
                    <p className="font-semibold text-gray-900">{d.nome}</p>
                    <p className="text-gray-600">Limpo em: <span className="font-medium">{formatarData(d.dataLimpeza)}</span></p>
                    <p className="text-gray-600">Status: <span style={{ color: d.cor }} className="font-medium">{d.statusLabel}</span></p>
                    <p className="text-gray-600">Intervalo: <span className="font-medium">{d.semIntervalo ? 'Primeira limpeza' : `${d.intervalo}d`}</span></p>
                    <p className="text-gray-600">Meta: <span className="font-medium">{d.meta ? `${d.meta}d` : '—'}</span></p>
                    {d.dataLimpezaAnterior && <p className="text-gray-600">Limpeza anterior: <span className="font-medium">{formatarData(d.dataLimpezaAnterior)}</span></p>}
                    {d.responsavel && <p className="text-gray-600">Responsável: <span className="font-medium">{d.responsavel}</span></p>}
                    {d.observacao && <p className="text-gray-600">Obs: {d.observacao}</p>}
                    <p className="text-gray-400 italic mt-1">Clique na barra para filtrar</p>
                  </div>
                )
              }}
            />
            <Bar dataKey="intervalo" shape={renderBarraComMeta} activeBar={false} cursor="pointer" onClick={handleClick}>
              {dados.map((d, i) => (
                <Cell key={i} fill={d.cor} />
              ))}
              <LabelList
                dataKey="intervalo"
                position="right"
                formatter={((v: any, _entry: any, props: any) => {
                  const d = dados[props?.index ?? 0]
                  return d?.semIntervalo ? '1ª' : `${v}d`
                }) as any}
                style={{ fontSize: 10, fill: '#6B7280' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function GraficoLimpeza({ status, onSelecionar, dataReferencia }: { status: StatusLimpeza[]; onSelecionar: (ids: string[]) => void; dataReferencia: string }) {
  if (status.length === 0) {
    return (
      <div className="text-center text-gray-400 py-8 bg-gray-50 rounded-lg">
        Nenhum bebedouro cadastrado.
      </div>
    )
  }

  const todos = status
    .map((s) => ({
      nome: s.bebedouro.nome,
      dias: s.diasDesdeUltima ?? 0,
      semRegistro: s.diasDesdeUltima === null,
      cor: s.statusCor,
      meta: s.meta,
      ultimaLimpeza: s.ultimaLimpeza,
      limpezasNoPeriodo: s.limpezasNoPeriodo,
      observacao: s.observacaoUltima,
      statusLabel: s.statusLabel,
      id: s.bebedouro.id,
    }))
    .sort((a, b) => b.dias - a.dias)

  const dados = todos.filter((d) => !d.semRegistro)
  const semRegistro = todos.filter((d) => d.semRegistro)

  const metas = dados.filter((d) => d.meta && d.meta > 0)
  const temMeta = metas.length > 0
  const maxMeta = temMeta ? Math.max(...metas.map((d) => d.meta!)) : 0
  const maxDias = Math.max(...dados.map((d) => d.dias), maxMeta, 1)
  const limiteX = Math.ceil(maxDias * 1.15)

  const renderBarraComMeta = (props: any) => {
    const { x, y, width, height, payload, fill } = props
    const meta = payload?.meta
    const dias = payload?.dias
    const elements: any[] = [
      <rect key="bar" x={x} y={y} width={Math.max(width, dias === 0 ? 4 : 0)} height={height} fill={fill} rx={4} ry={4} />
    ]
    if (meta && meta > 0 && dias > 0 && width > 0) {
      const metaX = x + (meta * width / dias)
      elements.push(
        <line
          key="meta"
          x1={metaX}
          y1={y - 3}
          x2={metaX}
          y2={y + height + 3}
          stroke="#0F6437"
          strokeWidth={2}
          strokeDasharray="4 3"
        />
      )
    }
    return <g>{elements}</g>
  }

  return (
    <div>
      <LegendaStatus diaUnico={false} />
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700 mt-2">Dias desde a última limpeza por bebedouro</h3>
        <p className="text-xs text-gray-500">
          {temMeta ? 'Marca verde tracejada = meta individual de cada bebedouro' : 'Sem meta configurada'} · Referência: {dataReferencia === 'hoje' ? 'hoje' : formatarData(dataReferencia)}
        </p>
      </div>
      <div style={{ width: '100%', height: Math.max(220, dados.length * 38) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} layout="vertical" margin={{ top: 5, right: 40, bottom: 5, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
            <XAxis
              type="number"
              domain={[0, limiteX]}
              tick={{ fontSize: 11, fill: '#6B7280' }}
              tickFormatter={(v) => `${v}d`}
            />
            <YAxis
              type="category"
              dataKey="nome"
              tick={{ fontSize: 11, fill: '#374151' }}
              width={110}
            />
            <Tooltip
              cursor={{ fill: '#F9FAFB' }}
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null
                const d = payload[0].payload as typeof dados[number]
                return (
                  <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs space-y-1">
                    <p className="font-semibold text-gray-900">{d.nome}</p>
                    <p className="text-gray-600">Status: <span style={{ color: d.cor }} className="font-medium">{d.statusLabel}</span></p>
                    <p className="text-gray-600">Dias desde última: <span className="font-medium">{d.semRegistro ? 'Sem registro' : `${d.dias}d`}</span></p>
                    <p className="text-gray-600">Meta: <span className="font-medium">{d.meta ? `${d.meta}d` : '—'}</span></p>
                    <p className="text-gray-600">Última limpeza: <span className="font-medium">{formatarData(d.ultimaLimpeza || '')}</span></p>
                    <p className="text-gray-600">Limpezas no período: <span className="font-medium">{d.limpezasNoPeriodo}</span></p>
                    {d.observacao && <p className="text-gray-600">Obs: {d.observacao}</p>}
                    <p className="text-gray-400 italic mt-1">Clique na barra para filtrar</p>
                  </div>
                )
              }}
            />
            <Bar dataKey="dias" shape={renderBarraComMeta} activeBar={false} cursor="pointer" onClick={(d: any) => {
              const id = d.id ?? d.payload?.id
              onSelecionar([id])
            }}>
              {dados.map((d, i) => (
                <Cell key={i} fill={d.cor} />
              ))}
              <LabelList
                dataKey="dias"
                position="right"
                formatter={((v: any) => `${v}d`) as any}
                style={{ fontSize: 10, fill: '#6B7280' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {semRegistro.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-gray-600">
          <span className="font-medium text-gray-700">Bebedouros sem registros:</span>
          {semRegistro.map((d) => (
            <span key={d.id} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
              {d.nome}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function KPIsChecklist({ kpis }: { kpis: ChecklistKPIs }) {
  const { totalRegistros, comChecklist, negativos, pctNegativos, itemMaisProblematico } = kpis
  const corNegativos = '#EF4444'

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div className="rounded-xl border border-gray-200 p-4 text-center" style={{ borderLeftWidth: 4, borderLeftColor: '#6B7280' }}>
        <p className="text-xs text-gray-500 uppercase tracking-wide">Registros no período</p>
        <p className="text-3xl font-bold text-gray-900 mt-1">{totalRegistros}</p>
      </div>
      <div className="rounded-xl border border-gray-200 p-4 text-center" style={{ borderLeftWidth: 4, borderLeftColor: '#6B7280' }}>
        <p className="text-xs text-gray-500 uppercase tracking-wide">Registros com checklist</p>
        <p className="text-3xl font-bold text-gray-900 mt-1">{comChecklist}</p>
      </div>
      <div className="rounded-xl border border-gray-200 p-4 text-center" style={{ borderLeftWidth: 4, borderLeftColor: corNegativos }}>
        <p className="text-xs text-gray-500 uppercase tracking-wide">Registros com ponto de atenção</p>
        <p className="text-3xl font-bold mt-1" style={{ color: corNegativos }}>{negativos}</p>
        <p className="text-xs text-gray-500 mt-1">{comChecklist > 0 ? `${pctNegativos}% dos registros` : '—'}</p>
      </div>
      {itemMaisProblematico && (
        <div className="md:col-span-3 rounded-lg p-3 border" style={{ backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }}>
          <p className="text-sm text-gray-800">
            <span className="font-semibold">Item mais problemático:</span> {itemMaisProblematico.label} com {itemMaisProblematico.pctNegativo}% de respostas negativas ({itemMaisProblematico.negativos}/{itemMaisProblematico.total}).
          </p>
        </div>
      )}
    </div>
  )
}

function GraficoProblemas({ ranking }: { ranking: ChecklistItemRanking[] }) {
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
    cor: '#EF4444',
  }))

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-2">Problemas mais frequentes nos checklists</h3>
      <div style={{ width: '100%', height: Math.max(180, dados.length * 44) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dados} layout="vertical" margin={{ top: 5, right: 50, bottom: 5, left: 8 }}>
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
                formatter={(v: any) => `${v}%`}
                style={{ fontSize: 10, fill: '#6B7280' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function TabelaOcorrencias({ ocorrencias }: { ocorrencias: OcorrenciaChecklist[] }) {
  if (ocorrencias.length === 0) {
    return (
      <div className="rounded-lg p-4 text-center text-gray-500" style={{ backgroundColor: '#F0FDF4' }}>
        Nenhuma ocorrência negativa nos checklists do período.
      </div>
    )
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Ocorrências negativas</h3>
      <div className="overflow-x-auto rounded-lg border border-gray-200 max-h-96">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="text-left py-3 px-4 font-medium text-gray-600">Data</th>
              <th className="text-left py-3 px-4 font-medium text-gray-600">Bebedouro</th>
              <th className="text-left py-3 px-4 font-medium text-gray-600">Itens negativos</th>
              <th className="text-left py-3 px-4 font-medium text-gray-600">Observação do item</th>
              <th className="text-left py-3 px-4 font-medium text-gray-600">Observação geral</th>
              <th className="text-left py-3 px-4 font-medium text-gray-600">Responsável</th>
            </tr>
          </thead>
          <tbody>
            {ocorrencias.map((o) => (
              <tr key={o.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="py-3 px-4 text-gray-600 whitespace-nowrap">{formatarData(o.data)}</td>
                <td className="py-3 px-4 font-medium text-gray-900">{o.bebedouro}</td>
                <td className="py-3 px-4">
                  <div className="flex flex-wrap gap-1">
                    {o.itensNegativos.map((item) => (
                      <span
                        key={item.key}
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
                        style={{ backgroundColor: '#EF4444' }}
                      >
                        {item.label}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="py-3 px-4 text-gray-600 max-w-xs truncate">
                  {o.itensNegativos.map((i) => i.observacao).filter(Boolean).join('; ') || '—'}
                </td>
                <td className="py-3 px-4 text-gray-600 max-w-xs truncate">{o.observacaoGeral || '—'}</td>
                <td className="py-3 px-4 text-gray-600 whitespace-nowrap">{o.responsavel || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
