import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@gestaup/supabase'
import logoManejus from '/images/manejus360.png'
import { gerarRelatorioMaternidadePDFPuppeteer } from '../../utils/relatorioMaternidadePDFPuppeteer'
import { ordenarPeriodo } from '../../features/relatorioGeral/periodo'
import {
  calcularResumoMaternidade,
  criaMorta,
  formatarDecimal,
  formatarPercentual,
  rotuloMes,
  temIntercorrencia,
  type DadosRelatorioMaternidade,
  type ItemDistribuicao,
} from '../../features/relatorioMaternidade/agregacao'

const GREEN_DARK = '#0F6437'
const RED = '#c94d46'
const GOLD = '#c28a27'
const EXTRATO_PAGINA = 100

interface RelatorioInfo {
  fazenda_id: string
  titulo: string
  tipo: string
  fazenda_nome?: string
  fazenda_logo_url?: string | null
}

interface Props {
  token: string
  relatorioInfo: RelatorioInfo
}

const inteiro = (v: number | null | undefined) => (Number(v) || 0).toLocaleString('pt-BR')

function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

function formatarDataISO(iso: string): string {
  const [a, m, d] = iso.split('-')
  return a && m && d ? `${d}/${m}/${a}` : iso
}

// Datas locais (sem toISOString, que desloca o dia por fuso).
function dataLocalISO(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

function Barras({ titulo, itens, cor = GREEN_DARK }: { titulo: string; itens: ItemDistribuicao[]; cor?: string }) {
  const topo = Math.max(...itens.map((i) => i.valor), 1)
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">
        {titulo} <span className="text-xs font-normal text-gray-400">({itens.length})</span>
      </h3>
      {itens.length === 0 ? (
        <p className="text-sm text-gray-500">Sem registros no período.</p>
      ) : (
        <div className="space-y-2">
          {itens.map((i) => (
            <div key={i.label} className="flex items-center gap-2 text-xs">
              <span className="w-1/3 truncate text-gray-700" title={i.label}>{i.label}</span>
              <span className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                <span className="block h-full rounded-full" style={{ width: `${Math.max(2, (i.valor / topo) * 100)}%`, backgroundColor: cor }} />
              </span>
              <span className="w-8 text-right font-semibold" style={{ color: cor }}>{inteiro(i.valor)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function RelatorioMaternidadePublico({ token, relatorioInfo }: Props) {
  const hoje = useMemo(() => new Date(), [])
  const [dataInicio, setDataInicio] = useState(() => dataLocalISO(new Date(hoje.getFullYear(), hoje.getMonth(), 1)))
  const [dataFim, setDataFim] = useState(() => dataLocalISO(hoje))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dados, setDados] = useState<DadosRelatorioMaternidade | null>(null)
  const [exportandoPDF, setExportandoPDF] = useState(false)
  const [busca, setBusca] = useState('')
  const [extratoVisivel, setExtratoVisivel] = useState(EXTRATO_PAGINA)

  const carregarDados = useCallback(async () => {
    if (!token) return
    try {
      setLoading(true)
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_dados_relatorio_maternidade', {
        p_token: token,
        p_data_inicio: dataInicio || null,
        p_data_fim: dataFim || null,
      })
      if (rpcError) {
        console.error('Erro ao carregar dados:', rpcError)
        setError('Erro ao carregar dados do relatório.')
        return
      }
      setDados(rpcData?.dados as DadosRelatorioMaternidade)
      setExtratoVisivel(EXTRATO_PAGINA)
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

  const registros = useMemo(() => dados?.registros ?? [], [dados])
  const resumo = useMemo(() => calcularResumoMaternidade(registros), [registros])
  const extrato = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return registros
    return registros.filter((r) =>
      [r.mae, r.cria, r.pasto, r.lote, r.raca, r.categoria_mae, r.tratamento, r.observacao, ...(r.tipo_parto ?? [])]
        .some((c) => (c ?? '').toLowerCase().includes(termo)),
    )
  }, [registros, busca])

  const exportarPDF = async () => {
    if (!dados) return
    setExportandoPDF(true)
    try {
      const blob = await gerarRelatorioMaternidadePDFPuppeteer({
        fazendaNome: relatorioInfo?.fazenda_nome ?? '',
        fazendaLogoUrl: relatorioInfo?.fazenda_logo_url,
        dados,
        resumo,
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const fazenda = (relatorioInfo?.fazenda_nome ?? 'Fazenda')
        .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[<>:"/\\|?*]+/g, '').trim() || 'Fazenda'
      link.download = `GestaUp - Maternidade - ${fazenda}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Erro ao gerar PDF:', err)
    } finally {
      setExportandoPDF(false)
    }
  }

  const kpis = [
    { valor: inteiro(resumo.partos), rotulo: 'Partos', sub: `${inteiro(resumo.crias)} ${resumo.crias === 1 ? 'cria registrada' : 'crias registradas'}`, cor: GREEN_DARK },
    { valor: inteiro(resumo.crias_vivas), rotulo: 'Crias vivas', sub: `${inteiro(resumo.machos)} machos · ${inteiro(resumo.femeas)} fêmeas`, cor: GREEN_DARK },
    { valor: formatarPercentual(resumo.taxa_perda), rotulo: 'Perda de crias', sub: `${inteiro(resumo.crias_mortas)} aborto/natimorto`, cor: resumo.crias_mortas > 0 ? RED : GREEN_DARK },
    { valor: resumo.peso_medio_kg == null ? '—' : `${formatarDecimal(resumo.peso_medio_kg)} kg`, rotulo: 'Peso médio ao nascer', sub: resumo.pesadas ? `${inteiro(resumo.pesadas)} pesadas` : 'sem pesagens', cor: GOLD },
  ]

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F5' }}>
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
                {relatorioInfo?.titulo || 'Relatório de Maternidade'}
              </h2>
              {relatorioInfo?.fazenda_nome && (
                <p className="text-[10px] text-gray-500 leading-tight">{relatorioInfo.fazenda_nome}</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {relatorioInfo?.fazenda_logo_url && (
                <div className="bg-white rounded-lg p-1 flex items-center justify-center">
                  <img
                    src={relatorioInfo.fazenda_logo_url}
                    alt={relatorioInfo?.fazenda_nome || 'Fazenda'}
                    className="h-8 w-auto max-w-[80px] object-contain"
                  />
                </div>
              )}
              <button
                onClick={exportarPDF}
                disabled={exportandoPDF || !dados}
                className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                style={{ color: GREEN_DARK, borderColor: GREEN_DARK }}
                title="Baixar relatório em PDF"
              >
                {exportandoPDF ? 'Gerando...' : 'Baixar PDF'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-gray-400">Gerado em {formatarDataHora(dados?.gerado_em)}</p>
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <label className="flex items-center gap-1">
              De
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => {
                  const [ini, fim] = ordenarPeriodo(e.target.value, dataFim)
                  setDataInicio(ini)
                  setDataFim(fim)
                }}
                className="rounded border border-gray-300 px-2 py-1"
              />
            </label>
            <label className="flex items-center gap-1">
              até
              <input
                type="date"
                value={dataFim}
                onChange={(e) => {
                  const [ini, fim] = ordenarPeriodo(dataInicio, e.target.value)
                  setDataInicio(ini)
                  setDataFim(fim)
                }}
                className="rounded border border-gray-300 px-2 py-1"
              />
            </label>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {loading && !dados ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <p className="text-gray-500">Carregando maternidade...</p>
          </div>
        ) : error || !dados ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <p className="text-gray-500">{error ?? 'Sem dados.'}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {kpis.map((k) => (
                <div key={k.rotulo} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <p className="text-2xl font-bold" style={{ color: k.cor }}>{k.valor}</p>
                  <p className="text-xs text-gray-600 mt-1">{k.rotulo}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{k.sub}</p>
                </div>
              ))}
            </div>

            {dados.registros_total > registros.length && (
              <div className="rounded-xl border px-4 py-3 text-xs" style={{ backgroundColor: '#fdf3e3', borderColor: '#eedcae', color: '#9a6b17' }}>
                Resumo calculado sobre {inteiro(registros.length)} dos {inteiro(dados.registros_total)} registros do período. Reduza o período para ver todos.
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Barras titulo="Nascimentos por mês" itens={resumo.por_mes.map((m) => ({ label: rotuloMes(m.mes), valor: m.crias }))} />
              <Barras titulo="Tipo de parto" itens={resumo.por_tipo_parto} cor={GOLD} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Barras titulo="Sexo das crias vivas" itens={resumo.por_sexo} />
              <Barras titulo="Raça das crias" itens={resumo.por_raca} />
              <Barras titulo="Categoria da mãe" itens={resumo.por_categoria_mae} />
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { valor: inteiro(resumo.matrizes_distintas), rotulo: 'Matrizes que pariram' },
                { valor: formatarPercentual(resumo.taxa_intercorrencia), rotulo: 'Partos com intercorrência', sub: `${inteiro(resumo.partos_com_intercorrencia)} (cesárea, auxílio, aborto ou natimorto)` },
                { valor: formatarDecimal(resumo.escore_medio), rotulo: 'Escore médio da matriz' },
                { valor: formatarDecimal(resumo.docilidade_media), rotulo: 'Docilidade média' },
              ].map((k) => (
                <div key={k.rotulo} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <p className="text-xl font-bold text-gray-900">{k.valor}</p>
                  <p className="text-xs text-gray-600 mt-1">{k.rotulo}</p>
                  {k.sub && <p className="text-[11px] text-gray-400 mt-0.5">{k.sub}</p>}
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <h3 className="px-4 py-3 text-sm font-semibold text-gray-900 border-b border-gray-100">
                Matrizes com mais intercorrências <span className="text-xs font-normal text-gray-400">({resumo.matrizes.length})</span>
              </h3>
              {resumo.matrizes.length === 0 ? (
                <p className="px-4 py-6 text-sm text-center text-gray-500">Nenhuma matriz identificada no período.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        {['Matriz', 'Categoria', 'Partos', 'Crias', 'Intercorrências', 'Medicamentos', 'Escore'].map((c, i) => (
                          <th key={c} className={`py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase ${i < 2 ? 'text-left' : 'text-right'}`}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {resumo.matrizes.map((m) => (
                        <tr key={m.mae} className="border-b border-gray-100 last:border-0">
                          <td className="py-2 px-4 font-medium text-gray-900">{m.mae}</td>
                          <td className="py-2 px-4 text-gray-600">{m.categoria ?? '—'}</td>
                          <td className="py-2 px-4 text-right text-gray-600">{inteiro(m.partos)}</td>
                          <td className="py-2 px-4 text-right text-gray-600">{inteiro(m.crias)}</td>
                          <td className="py-2 px-4 text-right font-medium" style={{ color: m.intercorrencias > 0 ? RED : '#111827' }}>{inteiro(m.intercorrencias)}</td>
                          <td className="py-2 px-4 text-right text-gray-600">{inteiro(m.medicamentos)}</td>
                          <td className="py-2 px-4 text-right text-gray-600">{formatarDecimal(m.escore_medio)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Barras titulo="Tratamentos das crias" itens={resumo.tratamentos} />
              <Barras titulo="Medicamentos" itens={resumo.medicamentos} cor={GOLD} />
              <Barras titulo="Partos por pasto" itens={resumo.por_pasto} />
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
                <h3 className="text-sm font-semibold text-gray-900">
                  Extrato de partos <span className="text-xs font-normal text-gray-400">({inteiro(extrato.length)})</span>
                </h3>
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => { setBusca(e.target.value); setExtratoVisivel(EXTRATO_PAGINA) }}
                  placeholder="Buscar matriz, cria, pasto, raça ou tratamento"
                  className="rounded border border-gray-300 px-2 py-1 text-xs flex-1 min-w-[160px] max-w-sm"
                />
              </div>
              {extrato.length === 0 ? (
                <p className="px-4 py-6 text-sm text-center text-gray-500">Nenhum parto no período.</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          {['Data', 'Matriz', 'Cria', 'Sexo', 'Raça', 'Peso', 'Parto', 'Local', 'Tratamento'].map((c) => (
                            <th key={c} className="py-2.5 px-3 text-left text-xs font-semibold text-gray-500 uppercase">{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {extrato.slice(0, extratoVisivel).map((r) => (
                          <tr key={r.id} className="border-b border-gray-100 last:border-0">
                            <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{formatarDataISO(r.data)}</td>
                            <td className="py-2 px-3 text-gray-900">{r.mae ?? '—'}</td>
                            <td className="py-2 px-3 text-gray-900">{r.cria ?? '—'}</td>
                            <td className="py-2 px-3 text-gray-600">{r.sexo ?? '—'}</td>
                            <td className="py-2 px-3 text-gray-600">{r.raca ?? '—'}</td>
                            <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{r.peso_cria_kg ? `${formatarDecimal(Number(r.peso_cria_kg))} kg` : '—'}</td>
                            <td className="py-2 px-3" style={{ color: criaMorta(r) ? RED : temIntercorrencia(r) ? GOLD : '#4b5563' }}>
                              {(r.tipo_parto ?? []).join(', ') || '—'}
                            </td>
                            <td className="py-2 px-3 text-gray-600">{[r.pasto, r.lote].filter(Boolean).join(' · ') || '—'}</td>
                            <td className="py-2 px-3 text-gray-600">{r.tratamento ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {extratoVisivel < extrato.length && (
                    <div className="px-4 py-3 border-t border-gray-100 text-center">
                      <button
                        onClick={() => setExtratoVisivel((v) => v + EXTRATO_PAGINA)}
                        className="rounded-full border px-3 py-1 text-xs"
                        style={{ borderColor: GREEN_DARK, color: GREEN_DARK }}
                      >
                        Mostrar mais ({inteiro(extrato.length - extratoVisivel)} restantes)
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            <p className="text-[11px] text-gray-400">
              Parto = grupo de crias com o mesmo vínculo (gêmeos contam como um parto). Cria viva exclui aborto e natimorto. Intercorrência = cesárea, parto auxiliado, aborto ou natimorto. Escore e docilidade são médias dos registros que informaram o valor.
            </p>
          </>
        )}
      </main>

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center">
        <p className="text-xs text-gray-400">
          Relatório gerado em {formatarDataHora(dados?.gerado_em)} · Manej'Us 360
        </p>
      </footer>
    </div>
  )
}
