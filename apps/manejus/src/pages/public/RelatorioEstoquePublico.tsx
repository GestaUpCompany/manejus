import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@gestaup/supabase'
import logoManejus from '/images/manejus360.png'
import { gerarRelatorioEstoquePDFPuppeteer } from '../../utils/relatorioEstoquePDFPuppeteer'
import {
  GRUPOS_ESTOQUE,
  itensPorGrupo,
  totaisDoGrupo,
  type DadosRelatorioEstoque,
  type ItemEstoque,
  type ItemTipoEstoque,
} from '../../features/relatorioEstoque/agregacao'
import { plural } from '../../features/relatorioPastagens/agregacao'

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

function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

export function RelatorioEstoquePublico({ token, relatorioInfo }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dados, setDados] = useState<DadosRelatorioEstoque | null>(null)
  const [grupoAtivo, setGrupoAtivo] = useState<ItemTipoEstoque>('insumo')
  const [exportandoPDF, setExportandoPDF] = useState(false)

  const carregarDados = useCallback(async () => {
    if (!token) return
    try {
      setLoading(true)
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('get_dados_relatorio_estoque', { p_token: token })

      if (rpcError) {
        console.error('Erro ao carregar dados:', rpcError)
        setError('Erro ao carregar dados do relatório.')
        setLoading(false)
        return
      }

      setDados(rpcData?.dados as DadosRelatorioEstoque)
      setError(null)
    } catch (err) {
      console.error('Erro:', err)
      setError('Erro inesperado ao carregar relatório.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  const itens = dados?.itens ?? []
  // Escopo restrito permite só um grupo; 'todos' mostra os grupos com itens.
  const grupoDoEscopo = dados?.escopo === 'insumos' ? 'insumo' : dados?.escopo === 'formulacoes' ? 'formulacao' : null
  const gruposPresentes = useMemo(
    () => GRUPOS_ESTOQUE.filter((g) => itensPorGrupo(itens, g.key).length > 0 || g.key === grupoDoEscopo),
    [itens, grupoDoEscopo],
  )
  const grupoEfetivo = gruposPresentes.some((g) => g.key === grupoAtivo) ? grupoAtivo : (gruposPresentes[0]?.key ?? 'insumo')
  const itensGrupo = useMemo(() => itensPorGrupo(itens, grupoEfetivo), [itens, grupoEfetivo])
  const totais = dados?.totais ?? totaisDoGrupo([])

  const exportarPDF = async () => {
    if (!dados || itens.length === 0) return
    setExportandoPDF(true)
    try {
      const blob = await gerarRelatorioEstoquePDFPuppeteer({
        fazendaNome: relatorioInfo?.fazenda_nome ?? '',
        fazendaLogoUrl: relatorioInfo?.fazenda_logo_url,
        dados,
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const fazenda = (relatorioInfo?.fazenda_nome ?? 'Fazenda')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[<>:"/\\|?*]+/g, '').trim() || 'Fazenda'
      const rotuloEscopo = dados.escopo === 'insumos' ? ' Insumos' : dados.escopo === 'formulacoes' ? ' Produtos' : ''
      link.download = `GestaUp - Estoque${rotuloEscopo} - ${fazenda}.pdf`
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

  const renderTabela = (lista: ItemEstoque[]) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase">Item</th>
              <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase">Tipo</th>
              <th className="text-right py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase">Estoque atual</th>
              <th className="text-right py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase">Custo médio</th>
              <th className="text-right py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase">Valor em estoque</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((item, idx) => (
              <tr key={`${item.item_tipo}-${item.nome}-${idx}`} className="border-b border-gray-100 last:border-0">
                <td className="py-2.5 px-4">
                  <span className="font-medium text-gray-900">{item.nome}</span>
                  {item.em_alerta && (
                    <span className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: '#fdf3e3', color: GOLD }}>
                      abaixo do mínimo
                    </span>
                  )}
                  {item.negativo && (
                    <span className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: '#fdf6f5', color: RED }}>
                      saldo negativo
                    </span>
                  )}
                </td>
                <td className="py-2.5 px-4 text-gray-500">{item.tipo || '—'}</td>
                <td className="py-2.5 px-4 text-right" style={{ color: item.negativo ? RED : '#111827' }}>
                  {formatarNumero(item.estoque_atual)} {item.unidade || 'kg'}
                </td>
                <td className="py-2.5 px-4 text-right text-gray-600">{formatarMoeda(item.custo_unitario)}</td>
                <td className="py-2.5 px-4 text-right font-medium text-gray-900">{formatarMoeda(item.valor_estoque)}</td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-gray-500">Nenhum item neste grupo.</td>
              </tr>
            )}
          </tbody>
          {lista.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-green-50/40">
                <td className="py-2.5 px-4 font-semibold text-gray-900" colSpan={4}>Valor total</td>
                <td className="py-2.5 px-4 text-right font-bold" style={{ color: GREEN_DARK }}>
                  {formatarMoeda(totaisDoGrupo(lista).valor_total)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F5F5' }}>
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
                {relatorioInfo?.titulo || 'Relatório de Estoque'}
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
                disabled={exportandoPDF || itens.length === 0}
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

      {/* Barra de contexto */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-400">
            Posição do estoque em {formatarDataHora(dados?.gerado_em)} · {totais.total_itens} {plural(totais.total_itens, 'item', 'itens')}
          </p>
          {dados?.escopo === 'todos' && (
            <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
              {GRUPOS_ESTOQUE.map((g) => (
                <button
                  key={g.key}
                  onClick={() => setGrupoAtivo(g.key)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    grupoEfetivo === g.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {loading ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <p className="text-gray-500">Carregando posição de estoque...</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <p className="text-gray-500">{error}</p>
          </div>
        ) : itens.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <p className="text-gray-500">Nenhum item de estoque encontrado para o escopo deste relatório.</p>
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <p className="text-2xl font-bold" style={{ color: GREEN_DARK }}>{formatarMoeda(totais.valor_total)}</p>
                <p className="text-xs text-gray-600 mt-1">Valor total em estoque</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <p className="text-2xl font-bold" style={{ color: GREEN_DARK }}>{totais.total_itens}</p>
                <p className="text-xs text-gray-600 mt-1">{plural(totais.total_itens, 'Item', 'Itens')} em estoque</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <p className="text-2xl font-bold" style={{ color: totais.em_alerta > 0 ? GOLD : GREEN_DARK }}>{totais.em_alerta}</p>
                <p className="text-xs text-gray-600 mt-1">Abaixo do estoque mínimo</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <p className="text-2xl font-bold" style={{ color: totais.negativos > 0 ? RED : GREEN_DARK }}>{totais.negativos}</p>
                <p className="text-xs text-gray-600 mt-1">Saldos negativos</p>
                {totais.negativos > 0 && (
                  <p className="text-[10px] text-gray-400 mt-1">Sinalizam lançamentos a saneamento, não entram no valor total</p>
                )}
              </div>
            </div>

            {renderTabela(itensGrupo)}
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
