import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@gestaup/supabase'
import logoManejus from '/images/manejus360.png'
import { gerarRelatorioFarmaciaPDFPuppeteer } from '../../utils/relatorioFarmaciaPDFPuppeteer'
import { ordenarPeriodo } from '../../features/relatorioGeral/periodo'
import {
  calcularResumoFarmacia,
  extratoFarmacia,
  formatarDecimal,
  formatarMoeda,
  type DadosRelatorioFarmacia,
  type ItemDistribuicao,
} from '../../features/relatorioFarmacia/agregacao'
import { ROTULO_ORIGEM, ROTULO_TIPO } from '../../features/estoqueFarmacia/logica'

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

const qtd = (v: number | null | undefined) => formatarDecimal(v, Number.isInteger(Number(v)) ? 0 : 1)
const inteiro = (v: number | null | undefined) => (Number(v) || 0).toLocaleString('pt-BR')

function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

function formatarDataISO(iso: string | null | undefined): string {
  if (!iso) return '—'
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
              <span className="w-24 text-right font-semibold" style={{ color: cor }}>{formatarMoeda(i.valor)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Tabela({ titulo, colunas, children, vazio, total }: { titulo: string; colunas: Array<[string, boolean?]>; children: React.ReactNode; vazio?: string; total: number }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <h3 className="px-4 py-3 text-sm font-semibold text-gray-900 border-b border-gray-100">
        {titulo} <span className="text-xs font-normal text-gray-400">({total})</span>
      </h3>
      {total === 0 ? (
        <p className="px-4 py-6 text-sm text-center text-gray-500">{vazio}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {colunas.map(([c, num]) => (
                  <th key={c} className={`py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase ${num ? 'text-right' : 'text-left'}`}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>{children}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function RelatorioFarmaciaPublico({ token, relatorioInfo }: Props) {
  const hoje = useMemo(() => new Date(), [])
  const [dataInicio, setDataInicio] = useState(() => dataLocalISO(new Date(hoje.getFullYear(), hoje.getMonth(), 1)))
  const [dataFim, setDataFim] = useState(() => dataLocalISO(hoje))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dados, setDados] = useState<DadosRelatorioFarmacia | null>(null)
  const [exportandoPDF, setExportandoPDF] = useState(false)
  const [busca, setBusca] = useState('')
  const [extratoVisivel, setExtratoVisivel] = useState(EXTRATO_PAGINA)

  const carregarDados = useCallback(async () => {
    if (!token) return
    try {
      setLoading(true)
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_dados_relatorio_farmacia', {
        p_token: token,
        p_data_inicio: dataInicio || null,
        p_data_fim: dataFim || null,
      })
      if (rpcError) {
        console.error('Erro ao carregar dados:', rpcError)
        setError('Erro ao carregar dados do relatório.')
        return
      }
      setDados(rpcData?.dados as DadosRelatorioFarmacia)
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

  const resumo = useMemo(() => (dados ? calcularResumoFarmacia(dados) : null), [dados])
  const extrato = useMemo(() => {
    if (!dados) return []
    const linhas = extratoFarmacia(dados)
    const termo = busca.trim().toLowerCase()
    if (!termo) return linhas
    return linhas.filter((l) =>
      [l.item, l.fornecedor, l.nota_fiscal, l.lote_produto, l.observacao, ROTULO_ORIGEM[l.origem ?? ''] ?? l.origem].some((c) => (c ?? '').toLowerCase().includes(termo)),
    )
  }, [dados, busca])

  const exportarPDF = async () => {
    if (!dados || !resumo) return
    setExportandoPDF(true)
    try {
      const blob = await gerarRelatorioFarmaciaPDFPuppeteer({
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
      link.download = `GestaUp - Farmacia - ${fazenda}.pdf`
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

  const kpis = resumo
    ? [
        { valor: formatarMoeda(resumo.valor_total), rotulo: 'Valor em estoque', sub: `${inteiro(resumo.total_itens)} itens controlados`, cor: GREEN_DARK },
        { valor: inteiro(resumo.a_repor), rotulo: 'Itens a repor', sub: `${inteiro(resumo.em_alerta)} em alerta`, cor: resumo.a_repor > 0 ? RED : GREEN_DARK },
        { valor: formatarMoeda(resumo.valor_entradas), rotulo: 'Entradas no período', sub: 'valor das compras', cor: GREEN_DARK },
        { valor: formatarMoeda(resumo.valor_baixas), rotulo: 'Consumo no período', sub: `${inteiro(resumo.lotes_vencidos + resumo.lotes_a_vencer)} lotes vencidos ou a vencer`, cor: GOLD },
      ]
    : []

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
                {relatorioInfo?.titulo || 'Relatório de Farmácia'}
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
            <p className="text-gray-500">Carregando farmácia...</p>
          </div>
        ) : error || !dados || !resumo ? (
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

            {dados.movimentacoes_total > dados.movimentacoes.length && (
              <div className="rounded-xl border px-4 py-3 text-xs" style={{ backgroundColor: '#fdf3e3', borderColor: '#eedcae', color: '#9a6b17' }}>
                Resumo calculado sobre {inteiro(dados.movimentacoes.length)} de {inteiro(dados.movimentacoes_total)} lançamentos: saldos podem estar incompletos.
              </div>
            )}
            {(resumo.divergencias > 0 || resumo.sem_custo > 0) && (
              <div className="rounded-xl border px-4 py-3 text-xs" style={{ backgroundColor: '#fdf3e3', borderColor: '#eedcae', color: '#9a6b17' }}>
                {resumo.divergencias > 0 && (
                  <p>
                    Saldo diferente do cadastro em: {resumo.itens.filter((i) => i.divergencia != null).map((i) => `${i.nome} (relatório ${qtd(i.saldo_final)}, cadastro ${qtd(i.saldo_final - (i.divergencia ?? 0))})`).join('; ')}. Costuma ser lançamento com data futura ou retroativa: confira as datas na tela de Farmácia.
                  </p>
                )}
                {resumo.sem_custo > 0 && (
                  <p>
                    {resumo.valor_total === 0
                      ? 'Nenhum item tem custo cadastrado: valor em estoque, entradas e consumo ficam em R$ 0,00. Informe o custo nas entradas para valorizar o estoque.'
                      : `${inteiro(resumo.sem_custo)} item(ns) com saldo ou movimento e sem custo (de ${inteiro(resumo.total_itens)} controlados): o valor em estoque sai subestimado.`}
                  </p>
                )}
              </div>
            )}

            {/* Blocos sem dados somem; os que sobram ocupam a linha (1 = largura total, 2 = lado a lado). */}
            {(resumo.por_tipo.length > 0 || resumo.baixas_por_origem.length > 0) && (
              <div className={`grid grid-cols-1 gap-6 ${resumo.por_tipo.length > 0 && resumo.baixas_por_origem.length > 0 ? 'lg:grid-cols-2' : ''}`}>
                {resumo.por_tipo.length > 0 && <Barras titulo="Valor em estoque por tipo" itens={resumo.por_tipo} />}
                {resumo.baixas_por_origem.length > 0 && <Barras titulo="Baixas por origem (valor)" itens={resumo.baixas_por_origem} cor={GOLD} />}
              </div>
            )}

            {resumo.itens_repor.length > 0 && <Tabela titulo="Itens a repor" total={resumo.itens_repor.length} vazio="Nenhum item abaixo do mínimo." colunas={[['Item'], ['Saldo', true], ['Mínimo', true], ['Falta', true], ['Cobertura', true]]}>
              {resumo.itens_repor.map((i) => (
                <tr key={i.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 px-3 font-medium text-gray-900">{i.nome}</td>
                  <td className="py-2 px-3 text-right" style={{ color: i.saldo_final < 0 ? RED : '#4b5563' }}>{qtd(i.saldo_final)}</td>
                  <td className="py-2 px-3 text-right text-gray-600">{qtd(i.estoque_minimo)}</td>
                  <td className="py-2 px-3 text-right font-medium" style={{ color: RED }}>{qtd(i.falta_para_minimo)}</td>
                  <td className="py-2 px-3 text-right text-gray-600">{i.cobertura_dias == null ? '—' : `${formatarDecimal(i.cobertura_dias, 0)} dias`}</td>
                </tr>
              ))}
            </Tabela>}

            {(resumo.validade.length > 0 || resumo.maiores_consumos.length > 0) && (
            <div className={`grid grid-cols-1 gap-6 ${resumo.validade.length > 0 && resumo.maiores_consumos.length > 0 ? 'lg:grid-cols-2' : ''}`}>
              {resumo.validade.length > 0 && <Tabela titulo={`Validade dos lotes (vencidos ou a até ${resumo.dias_alerta_validade} dias)`} total={resumo.validade.length} vazio="Nenhum lote vencido ou perto de vencer." colunas={[['Item'], ['Lote'], ['Validade'], ['Saldo', true], ['Prazo', true]]}>
                {resumo.validade.map((l, idx) => (
                  <tr key={`${l.item}-${l.lote}-${l.validade}-${idx}`} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 px-3 text-gray-900">{l.item}</td>
                    <td className="py-2 px-3 text-gray-600">{l.lote ?? '—'}</td>
                    <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{formatarDataISO(l.validade)}</td>
                    <td className="py-2 px-3 text-right text-gray-600">{qtd(l.saldo)}</td>
                    <td className="py-2 px-3 text-right whitespace-nowrap" style={{ color: l.situacao === 'vencido' ? RED : GOLD }}>
                      {l.dias == null ? '—' : l.situacao === 'vencido' ? `vencido há ${inteiro(Math.abs(l.dias))} d` : `${inteiro(l.dias)} d`}
                    </td>
                  </tr>
                ))}
              </Tabela>}
              {resumo.maiores_consumos.length > 0 && <Barras titulo="Maiores consumos (valor)" itens={resumo.maiores_consumos.map((i) => ({ label: i.nome, valor: i.baixas_valor }))} cor={GOLD} />}
            </div>
            )}

            <Tabela titulo="Posição por item" total={resumo.itens.length} vazio="Nenhum medicamento com controle de estoque." colunas={[['Item'], ['Saldo inicial', true], ['Entradas', true], ['Baixas', true], ['Saldo final', true], ['Custo médio', true], ['Valor', true], ['ABC', true]]}>
              {resumo.itens.map((i) => (
                <tr key={i.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 px-3 font-medium text-gray-900">{i.nome} <span className="text-xs text-gray-400">{i.unidade}</span></td>
                  <td className="py-2 px-3 text-right text-gray-600">{qtd(i.saldo_inicial)}</td>
                  <td className="py-2 px-3 text-right text-gray-600">{qtd(i.entradas)}</td>
                  <td className="py-2 px-3 text-right text-gray-600">{qtd(i.baixas)}</td>
                  <td className="py-2 px-3 text-right font-medium" style={{ color: i.em_alerta ? RED : '#111827' }}>{qtd(i.saldo_final)}</td>
                  <td className="py-2 px-3 text-right text-gray-600">{i.sem_custo ? 'sem custo' : formatarMoeda(i.custo_unitario)}</td>
                  <td className="py-2 px-3 text-right text-gray-600">{formatarMoeda(i.valor_estoque)}</td>
                  <td className="py-2 px-3 text-right text-gray-600">{i.curva ?? '—'}</td>
                </tr>
              ))}
            </Tabela>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
                <h3 className="text-sm font-semibold text-gray-900">
                  Extrato de movimentações <span className="text-xs font-normal text-gray-400">({inteiro(extrato.length)})</span>
                </h3>
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => { setBusca(e.target.value); setExtratoVisivel(EXTRATO_PAGINA) }}
                  placeholder="Buscar item, fornecedor, nota ou lote"
                  className="rounded border border-gray-300 px-2 py-1 text-xs flex-1 min-w-[160px] max-w-sm"
                />
              </div>
              {extrato.length === 0 ? (
                <p className="px-4 py-6 text-sm text-center text-gray-500">Nenhuma movimentação no período.</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          {['Data', 'Item', 'Tipo', 'Origem', 'Qtd', 'Valor', 'Saldo após', 'Lote / validade', 'Fornecedor'].map((c) => (
                            <th key={c} className="py-2.5 px-3 text-left text-xs font-semibold text-gray-500 uppercase">{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {extrato.slice(0, extratoVisivel).map((l) => (
                          <tr key={l.id} className="border-b border-gray-100 last:border-0">
                            <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{formatarDataISO(l.data)}</td>
                            <td className="py-2 px-3 text-gray-900">{l.item}</td>
                            <td className="py-2 px-3 text-gray-600">{ROTULO_TIPO[l.tipo_movimentacao] ?? l.tipo_movimentacao}</td>
                            <td className="py-2 px-3 text-gray-600">{ROTULO_ORIGEM[l.origem ?? ''] ?? l.origem ?? '—'}</td>
                            <td className="py-2 px-3 text-gray-600 whitespace-nowrap" style={{ color: l.variacao < 0 ? RED : undefined }}>
                              {l.tipo_movimentacao === 'reclassificacao' ? '⇄' : l.variacao > 0 ? '+' : ''}{qtd(l.tipo_movimentacao === 'reclassificacao' ? l.quantidade : l.variacao)}
                            </td>
                            <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{l.valor == null ? '—' : formatarMoeda(l.valor)}</td>
                            <td className="py-2 px-3 text-gray-600">{qtd(l.saldo_apos)}</td>
                            <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{[l.lote_produto, l.validade ? formatarDataISO(l.validade) : null].filter(Boolean).join(' · ') || '—'}</td>
                            <td className="py-2 px-3 text-gray-600">{l.fornecedor ?? '—'}</td>
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
              Saldo e lotes reconstruídos pelo histórico de lançamentos (saída pelo vencimento mais próximo). Consumo = baixas − estornos. Valor em estoque = saldo × custo médio atual. Curva ABC pelo valor em estoque: A até 80%, B até 95%.
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
