import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@gestaup/supabase'
import logoManejus from '/images/manejus360.png'
import { gerarRelatorioEstoqueCombustivelPDFPuppeteer } from '../../utils/relatorioEstoqueCombustivelPDFPuppeteer'
import { ordenarPeriodo } from '../../features/relatorioGeral/periodo'
import {
  ROTULO_MOVIMENTACAO,
  totaisDosTanques,
  type DadosRelatorioEstoqueCombustivel,
} from '../../features/relatorioEstoqueCombustivel/agregacao'

const GREEN_DARK = '#0F6437'
const RED = '#c94d46'
const GOLD = '#c28a27'

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

function formatarNumero(valor: number | null | undefined, casas = 2): string {
  if (valor === null || valor === undefined || isNaN(valor)) return '—'
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

function formatarMoeda(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || isNaN(valor)) return '—'
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarData(iso: string | null | undefined): string {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'
}

function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

// Datas locais (sem toISOString, que desloca o dia por fuso).
function dataLocalISO(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

function detalhe(m: DadosRelatorioEstoqueCombustivel['movimentacoes'][number]): string {
  if (m.tipo === 'entrada') return [m.fornecedor, m.nota_fiscal ? `NF ${m.nota_fiscal}` : ''].filter(Boolean).join(' · ')
  if (m.tipo === 'baixa') return [m.maquina, m.placa, m.motorista].filter(Boolean).join(' · ')
  return m.observacao ?? ''
}

export function RelatorioEstoqueCombustivelPublico({ token, relatorioInfo }: Props) {
  const hoje = useMemo(() => new Date(), [])
  const [dataInicio, setDataInicio] = useState(() => dataLocalISO(new Date(hoje.getFullYear(), hoje.getMonth(), 1)))
  const [dataFim, setDataFim] = useState(() => dataLocalISO(hoje))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dados, setDados] = useState<DadosRelatorioEstoqueCombustivel | null>(null)
  const [exportandoPDF, setExportandoPDF] = useState(false)

  const carregarDados = useCallback(async () => {
    if (!token) return
    try {
      setLoading(true)
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_dados_relatorio_estoque_combustivel', {
        p_token: token,
        p_data_inicio: dataInicio || null,
        p_data_fim: dataFim || null,
      })
      if (rpcError) {
        console.error('Erro ao carregar dados:', rpcError)
        setError('Erro ao carregar dados do relatório.')
        return
      }
      setDados(rpcData?.dados as DadosRelatorioEstoqueCombustivel)
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

  const tanques = useMemo(() => dados?.tanques ?? [], [dados])
  const movimentacoes = useMemo(() => dados?.movimentacoes ?? [], [dados])
  const totais = useMemo(() => totaisDosTanques(tanques), [tanques])

  const exportarPDF = async () => {
    if (!dados || tanques.length === 0) return
    setExportandoPDF(true)
    try {
      const blob = await gerarRelatorioEstoqueCombustivelPDFPuppeteer({
        fazendaNome: relatorioInfo?.fazenda_nome ?? '',
        fazendaLogoUrl: relatorioInfo?.fazenda_logo_url,
        dados,
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const fazenda = (relatorioInfo?.fazenda_nome ?? 'Fazenda')
        .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[<>:"/\\|?*]+/g, '').trim() || 'Fazenda'
      link.download = `GestaUp - Estoque de Combustivel - ${fazenda}.pdf`
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
    { valor: `${formatarNumero(totais.saldo_inicial_l)} L`, rotulo: 'Saldo inicial', cor: GREEN_DARK },
    { valor: `${formatarNumero(totais.entradas_l)} L`, rotulo: 'Entradas', sub: formatarMoeda(totais.entradas_valor), cor: GREEN_DARK },
    { valor: `${formatarNumero(totais.baixas_l)} L`, rotulo: 'Baixas (consumo)', sub: formatarMoeda(totais.baixas_valor), cor: GOLD },
    { valor: `${formatarNumero(totais.saldo_final_l)} L`, rotulo: 'Saldo final', sub: `Valor em estoque: ${formatarMoeda(totais.valor_estoque)}`, cor: totais.saldo_final_l < 0 ? RED : GREEN_DARK },
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
                {relatorioInfo?.titulo || 'Relatório de Estoque de Combustível'}
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
                disabled={exportandoPDF || tanques.length === 0}
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
          <p className="text-xs text-gray-400">
            Gerado em {formatarDataHora(dados?.gerado_em)} · {totais.total_tanques} {totais.total_tanques === 1 ? 'tanque' : 'tanques'}
          </p>
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
            <p className="text-gray-500">Carregando estoque de combustível...</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <p className="text-gray-500">{error}</p>
          </div>
        ) : tanques.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <p className="text-gray-500">Nenhum tanque de combustível cadastrado.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {kpis.map((k) => (
                <div key={k.rotulo} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <p className="text-2xl font-bold" style={{ color: k.cor }}>{k.valor}</p>
                  <p className="text-xs text-gray-600 mt-1">{k.rotulo}</p>
                  {k.sub && <p className="text-[11px] text-gray-400 mt-0.5">{k.sub}</p>}
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <h3 className="px-4 py-3 text-sm font-semibold text-gray-900 border-b border-gray-100">Posição por tanque</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {['Tanque', 'Combustível', 'Saldo inicial (L)', 'Entradas (L)', 'Baixas (L)', 'Ajustes (L)', 'Saldo final (L)', '% cap.', 'Custo médio', 'Valor em estoque'].map((c, i) => (
                        <th key={c} className={`py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase ${i < 2 ? 'text-left' : 'text-right'}`}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tanques.map((t) => (
                      <tr key={t.id} className="border-b border-gray-100 last:border-0">
                        <td className="py-2.5 px-4">
                          <span className="font-medium text-gray-900">{t.nome}</span>
                          {t.abaixo_limite && !t.negativo && (
                            <span className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: '#fdf3e3', color: GOLD }}>abaixo do limite</span>
                          )}
                          {t.negativo && (
                            <span className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: '#fdf6f5', color: RED }}>saldo negativo</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-gray-500">{t.combustivel}</td>
                        <td className="py-2.5 px-4 text-right text-gray-600">{formatarNumero(t.saldo_inicial_l)}</td>
                        <td className="py-2.5 px-4 text-right text-gray-600">{formatarNumero(t.entradas_l)}</td>
                        <td className="py-2.5 px-4 text-right text-gray-600">{formatarNumero(t.baixas_l)}</td>
                        <td className="py-2.5 px-4 text-right text-gray-600">{formatarNumero(t.ajustes_l)}</td>
                        <td className="py-2.5 px-4 text-right font-medium" style={{ color: t.negativo ? RED : '#111827' }}>{formatarNumero(t.saldo_final_l)}</td>
                        <td className="py-2.5 px-4 text-right text-gray-600">{t.pct_capacidade == null ? '—' : `${formatarNumero(t.pct_capacidade, 1)}%`}</td>
                        <td className="py-2.5 px-4 text-right text-gray-600">{formatarMoeda(t.custo_medio_l)}</td>
                        <td className="py-2.5 px-4 text-right font-medium text-gray-900">{formatarMoeda(t.valor_estoque)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-green-50/40 font-semibold">
                      <td className="py-2.5 px-4" colSpan={2}>Total</td>
                      <td className="py-2.5 px-4 text-right">{formatarNumero(totais.saldo_inicial_l)}</td>
                      <td className="py-2.5 px-4 text-right">{formatarNumero(totais.entradas_l)}</td>
                      <td className="py-2.5 px-4 text-right">{formatarNumero(totais.baixas_l)}</td>
                      <td className="py-2.5 px-4 text-right">{formatarNumero(totais.ajustes_l)}</td>
                      <td className="py-2.5 px-4 text-right">{formatarNumero(totais.saldo_final_l)}</td>
                      <td colSpan={2}></td>
                      <td className="py-2.5 px-4 text-right font-bold" style={{ color: GREEN_DARK }}>{formatarMoeda(totais.valor_estoque)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <h3 className="px-4 py-3 text-sm font-semibold text-gray-900 border-b border-gray-100">
                Extrato de movimentações <span className="text-xs font-normal text-gray-400">({movimentacoes.length})</span>
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {['Data', 'Tanque', 'Tipo', 'Detalhe', 'Variação (L)', 'R$/L', 'Valor', 'Saldo após (L)'].map((c, i) => (
                        <th key={c} className={`py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase ${i < 4 ? 'text-left' : 'text-right'}`}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {movimentacoes.map((m, idx) => (
                      <tr key={`${m.tanque_id}-${m.data}-${idx}`} className="border-b border-gray-100 last:border-0">
                        <td className="py-2 px-4 text-gray-600">{formatarData(m.data)}</td>
                        <td className="py-2 px-4 text-gray-900">{m.tanque}</td>
                        <td className="py-2 px-4 font-medium" style={{ color: m.tipo === 'entrada' ? GREEN_DARK : m.tipo === 'baixa' ? GOLD : '#4a5a8a' }}>{ROTULO_MOVIMENTACAO[m.tipo] ?? m.tipo}</td>
                        <td className="py-2 px-4 text-gray-500">{detalhe(m) || '—'}</td>
                        <td className="py-2 px-4 text-right" style={{ color: m.variacao_l < 0 ? RED : '#111827' }}>{m.variacao_l > 0 ? '+' : ''}{formatarNumero(m.variacao_l)}</td>
                        <td className="py-2 px-4 text-right text-gray-600">{m.preco_por_litro == null ? '—' : formatarNumero(m.preco_por_litro, 2)}</td>
                        <td className="py-2 px-4 text-right text-gray-600">{m.valor == null ? '—' : formatarMoeda(m.valor)}</td>
                        <td className="py-2 px-4 text-right font-medium" style={{ color: m.saldo_apos_l < 0 ? RED : '#111827' }}>{formatarNumero(m.saldo_apos_l)}</td>
                      </tr>
                    ))}
                    {movimentacoes.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-gray-500">Nenhuma movimentação no período.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-[11px] text-gray-400">
              Valor em estoque = saldo final × custo médio atual do tanque. Saldos inicial e final reconstruídos pelo histórico de lançamentos.
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
