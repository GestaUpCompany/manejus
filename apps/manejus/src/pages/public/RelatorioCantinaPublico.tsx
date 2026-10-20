import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@gestaup/supabase'
import logoManejus from '/images/manejus360.png'
import { gerarRelatorioCantinaPDFPuppeteer } from '../../utils/relatorioCantinaPDFPuppeteer'
import { ordenarPeriodo } from '../../features/relatorioGeral/periodo'
import {
  FILTROS_CANTINA,
  ROTULO_ORIGEM,
  ROTULO_TIPO_MOVIMENTACAO,
  classificarABC,
  filtrarItens,
  itensDeAtencao,
  ordenarItens,
  rotuloUnidadeCusto,
  textoCobertura,
  totaisDosItens,
  type CampoOrdenacaoCantina,
  type ClasseABC,
  type DadosRelatorioCantina,
  type FiltroCantina,
} from '../../features/relatorioCantina/agregacao'

const GREEN_DARK = '#0F6437'
const RED = '#c94d46'
const GOLD = '#c28a27'
const LIMITE_EXTRATO = 200

type Aba = 'estoque' | 'operacao' | 'marmitas'

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

function formatarInteiro(valor: number | null | undefined): string {
  return (Number(valor) || 0).toLocaleString('pt-BR')
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

const COR_CLASSE: Record<ClasseABC, { bg: string; fg: string }> = {
  A: { bg: '#e3f1e9', fg: GREEN_DARK },
  B: { bg: '#fdf3e3', fg: '#9a6b17' },
  C: { bg: '#eef0f2', fg: '#5b6770' },
}

const CABECALHOS: { campo: CampoOrdenacaoCantina | null; rotulo: string; esq?: boolean }[] = [
  { campo: 'nome', rotulo: 'Item', esq: true },
  { campo: null, rotulo: 'Classificação', esq: true },
  { campo: null, rotulo: 'Saldo inicial' },
  { campo: 'entradas', rotulo: 'Entradas' },
  { campo: 'baixas', rotulo: 'Baixas' },
  { campo: null, rotulo: 'Ajustes' },
  { campo: 'saldo_final', rotulo: 'Saldo final' },
  { campo: 'cobertura_dias', rotulo: 'Cobertura' },
  { campo: null, rotulo: 'Mínimo' },
  { campo: 'custo_unitario', rotulo: 'Custo médio' },
  { campo: 'valor_estoque', rotulo: 'Valor' },
  { campo: null, rotulo: 'ABC' },
]

export function RelatorioCantinaPublico({ token, relatorioInfo }: Props) {
  const hoje = useMemo(() => new Date(), [])
  const [dataInicio, setDataInicio] = useState(() => dataLocalISO(new Date(hoje.getFullYear(), hoje.getMonth(), 1)))
  const [dataFim, setDataFim] = useState(() => dataLocalISO(hoje))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dados, setDados] = useState<DadosRelatorioCantina | null>(null)
  const [exportandoPDF, setExportandoPDF] = useState(false)
  const [aba, setAba] = useState<Aba>('estoque')
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<FiltroCantina>('todos')
  const [campo, setCampo] = useState<CampoOrdenacaoCantina>('nome')
  const [direcao, setDirecao] = useState<'asc' | 'desc'>('asc')
  const [extratoCompleto, setExtratoCompleto] = useState(false)

  const carregarDados = useCallback(async () => {
    if (!token) return
    try {
      setLoading(true)
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_dados_relatorio_cantina', {
        p_token: token,
        p_data_inicio: dataInicio || null,
        p_data_fim: dataFim || null,
      })
      if (rpcError) {
        console.error('Erro ao carregar dados:', rpcError)
        setError('Erro ao carregar dados do relatório.')
        return
      }
      setDados(rpcData?.dados as DadosRelatorioCantina)
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

  const itens = useMemo(() => dados?.itens ?? [], [dados])
  const movimentacoes = useMemo(() => dados?.movimentacoes ?? [], [dados])
  const totais = useMemo(() => totaisDosItens(itens), [itens])
  const abc = useMemo(() => classificarABC(itens), [itens])
  const atencao = useMemo(() => itensDeAtencao(itens), [itens])
  const visiveis = useMemo(
    () => ordenarItens(filtrarItens(itens, busca, filtro), campo, direcao),
    [itens, busca, filtro, campo, direcao],
  )
  const extratoVisivel = extratoCompleto ? movimentacoes : movimentacoes.slice(0, LIMITE_EXTRATO)

  const ordenarPor = (c: CampoOrdenacaoCantina) => {
    if (c === campo) setDirecao(direcao === 'asc' ? 'desc' : 'asc')
    else { setCampo(c); setDirecao(c === 'nome' ? 'asc' : 'desc') }
  }

  const exportarPDF = async () => {
    if (!dados) return
    setExportandoPDF(true)
    try {
      const blob = await gerarRelatorioCantinaPDFPuppeteer({
        fazendaNome: relatorioInfo?.fazenda_nome ?? '',
        fazendaLogoUrl: relatorioInfo?.fazenda_logo_url,
        dados,
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const fazenda = (relatorioInfo?.fazenda_nome ?? 'Fazenda')
        .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[<>:"/\\|?*]+/g, '').trim() || 'Fazenda'
      link.download = `GestaUp - Cantina - ${fazenda}.pdf`
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

  const op = dados?.operacao
  const marm = dados?.marmitas
  // Sem baixas valoradas (custo zero) não há custo por refeição a mostrar.
  const custoRefeicao = op && op.custo_baixas > 0 ? op.custo_por_refeicao : null
  const kpis = [
    { valor: formatarMoeda(totais.valor_total), rotulo: 'Valor em estoque', sub: `${totais.total_itens} ${totais.total_itens === 1 ? 'item' : 'itens'} com controle`, cor: GREEN_DARK },
    { valor: formatarMoeda(totais.valor_entradas), rotulo: 'Entradas no período', cor: GREEN_DARK },
    { valor: formatarMoeda(totais.valor_baixas), rotulo: 'Baixas (consumo)', cor: GOLD },
    { valor: formatarInteiro(op?.refeicoes_total), rotulo: 'Refeições', sub: custoRefeicao == null ? undefined : `${formatarMoeda(custoRefeicao)} por refeição`, cor: GREEN_DARK },
  ]

  const abas: { key: Aba; label: string }[] = [
    { key: 'estoque', label: 'Estoque' },
    { key: 'operacao', label: 'Operação' },
    { key: 'marmitas', label: 'Marmitas' },
  ]

  const q = dados?.qualidade
  const avisosQualidade: string[] = []
  if (q?.registros_sem_itens) avisosQualidade.push(`${q.registros_sem_itens} ${q.registros_sem_itens === 1 ? 'registro' : 'registros'} de saída/entrada sem itens detalhados (não movimentaram o estoque)`)
  if (q?.itens_sem_controle) avisosQualidade.push(`${q.itens_sem_controle} ${q.itens_sem_controle === 1 ? 'item usado' : 'itens usados'} em registros sem controle de estoque ativado`)
  if (q?.nomes_duplicados) avisosQualidade.push(`${q.nomes_duplicados} ${q.nomes_duplicados === 1 ? 'nome duplicado' : 'nomes duplicados'} no catálogo`)

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
                {relatorioInfo?.titulo || 'Relatório de Cantina'}
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
            <p className="text-gray-500">Carregando cantina...</p>
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
                  {k.sub && <p className="text-[11px] text-gray-400 mt-0.5">{k.sub}</p>}
                </div>
              ))}
            </div>

            {(atencao.length > 0 || avisosQualidade.length > 0) && (
              <div className="rounded-xl border p-4 text-sm" style={{ backgroundColor: '#fdf3e3', borderColor: '#eedcae', color: '#7a5410' }}>
                <p className="font-semibold mb-1">Pontos de atenção</p>
                <ul className="list-disc pl-5 space-y-0.5">
                  {totais.negativos > 0 && <li>{totais.negativos} {totais.negativos === 1 ? 'item com saldo negativo' : 'itens com saldo negativo'}.</li>}
                  {totais.em_alerta > 0 && <li>{totais.em_alerta} {totais.em_alerta === 1 ? 'item no mínimo ou abaixo' : 'itens no mínimo ou abaixo'}.</li>}
                  {totais.sem_custo > 0 && <li>{totais.sem_custo} {totais.sem_custo === 1 ? 'item sem custo cadastrado' : 'itens sem custo cadastrado'} (valor R$ 0,00).</li>}
                  {totais.divergencias > 0 && <li>{totais.divergencias} {totais.divergencias === 1 ? 'item com divergência' : 'itens com divergência'} entre o saldo reconstruído e o saldo gravado.</li>}
                  {avisosQualidade.map((a) => <li key={a}>{a}.</li>)}
                </ul>
              </div>
            )}

            <div className="flex gap-2 border-b border-gray-200">
              {abas.map((a) => (
                <button
                  key={a.key}
                  onClick={() => setAba(a.key)}
                  className="px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors"
                  style={{ color: aba === a.key ? GREEN_DARK : '#6b7280', borderColor: aba === a.key ? GREEN_DARK : 'transparent' }}
                >
                  {a.label}
                </button>
              ))}
            </div>

            {aba === 'estoque' && (
              <>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
                    <h3 className="text-sm font-semibold text-gray-900">Posição por item <span className="text-xs font-normal text-gray-400">({visiveis.length})</span></h3>
                    <input
                      type="search"
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      placeholder="Buscar item ou classificação"
                      className="rounded border border-gray-300 px-2 py-1 text-xs flex-1 min-w-[160px] max-w-xs"
                    />
                    <div className="flex flex-wrap gap-1">
                      {FILTROS_CANTINA.map((f) => (
                        <button
                          key={f.key}
                          onClick={() => setFiltro(f.key)}
                          className="rounded-full border px-2.5 py-0.5 text-[11px] transition-colors"
                          style={{
                            borderColor: filtro === f.key ? GREEN_DARK : '#d1d5db',
                            backgroundColor: filtro === f.key ? GREEN_DARK : 'white',
                            color: filtro === f.key ? 'white' : '#4b5563',
                          }}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          {CABECALHOS.map((c) => (
                            <th
                              key={c.rotulo}
                              onClick={c.campo ? () => ordenarPor(c.campo!) : undefined}
                              className={`py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase ${c.esq ? 'text-left' : 'text-right'} ${c.campo ? 'cursor-pointer select-none' : ''}`}
                            >
                              {c.rotulo}{c.campo && c.campo === campo ? (direcao === 'asc' ? ' ▲' : ' ▼') : ''}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {visiveis.map((i) => {
                          const classe = abc.get(i.id)
                          return (
                            <tr key={i.id} className="border-b border-gray-100 last:border-0">
                              <td className="py-2.5 px-3">
                                <span className="font-medium text-gray-900">{i.nome}</span>
                                {i.em_alerta && !i.negativo && <span className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: '#fdf3e3', color: GOLD }}>abaixo do mínimo</span>}
                                {i.negativo && <span className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: '#fdf6f5', color: RED }}>saldo negativo</span>}
                                {i.sem_custo && <span className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: '#eef2fa', color: '#4a5a8a' }}>sem custo</span>}
                                {i.divergencia != null && <span className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: '#eef2fa', color: '#4a5a8a' }} title={`Saldo reconstruído difere do gravado em ${formatarNumero(i.divergencia, 3)} ${i.unidade ?? ''}`}>divergência</span>}
                              </td>
                              <td className="py-2.5 px-3 text-gray-500">{i.classificacao ?? '—'}</td>
                              <td className="py-2.5 px-3 text-right text-gray-600">{formatarNumero(i.saldo_inicial)}</td>
                              <td className="py-2.5 px-3 text-right text-gray-600">{formatarNumero(i.entradas)}</td>
                              <td className="py-2.5 px-3 text-right text-gray-600">{formatarNumero(i.baixas)}</td>
                              <td className="py-2.5 px-3 text-right text-gray-600">{formatarNumero(i.ajustes)}</td>
                              <td className="py-2.5 px-3 text-right font-medium" style={{ color: i.negativo ? RED : '#111827' }}>{formatarNumero(i.saldo_final)} {i.unidade ?? ''}</td>
                              <td className="py-2.5 px-3 text-right text-gray-600">{textoCobertura(i)}</td>
                              <td className="py-2.5 px-3 text-right text-gray-600">{i.estoque_minimo > 0 ? formatarNumero(i.estoque_minimo) : '—'}</td>
                              <td className="py-2.5 px-3 text-right text-gray-600" title={rotuloUnidadeCusto(i)}>{formatarMoeda(i.custo_unitario)}</td>
                              <td className="py-2.5 px-3 text-right font-medium text-gray-900">{formatarMoeda(i.valor_estoque)}</td>
                              <td className="py-2.5 px-3 text-right">
                                {classe ? (
                                  <span className="rounded px-1.5 py-0.5 text-[11px] font-bold" style={{ backgroundColor: COR_CLASSE[classe].bg, color: COR_CLASSE[classe].fg }}>{classe}</span>
                                ) : '—'}
                              </td>
                            </tr>
                          )
                        })}
                        {visiveis.length === 0 && (
                          <tr>
                            <td colSpan={CABECALHOS.length} className="py-8 text-center text-gray-500">
                              {itens.length === 0 ? 'Nenhum item da cantina com controle de estoque.' : 'Nenhum item para o filtro escolhido.'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                      {visiveis.length > 0 && (
                        <tfoot>
                          <tr className="border-t-2 border-gray-200 bg-green-50/40 font-semibold">
                            <td className="py-2.5 px-3" colSpan={10}>Total em estoque (itens exibidos)</td>
                            <td className="py-2.5 px-3 text-right font-bold" style={{ color: GREEN_DARK }}>{formatarMoeda(visiveis.reduce((s, i) => s + i.valor_estoque, 0))}</td>
                            <td />
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <h3 className="px-4 py-3 text-sm font-semibold text-gray-900 border-b border-gray-100">
                    Extrato de movimentações <span className="text-xs font-normal text-gray-400">({formatarInteiro(dados.movimentacoes_total)})</span>
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          {['Data', 'Item', 'Tipo', 'Origem', 'Detalhe', 'Variação', 'Custo un.', 'Valor', 'Saldo após'].map((c, i) => (
                            <th key={c} className={`py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase ${i < 5 ? 'text-left' : 'text-right'}`}>{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {extratoVisivel.map((m, idx) => (
                          <tr key={`${m.item_id}-${m.data}-${idx}`} className="border-b border-gray-100 last:border-0">
                            <td className="py-2 px-3 text-gray-600">{formatarData(m.data)}</td>
                            <td className="py-2 px-3 text-gray-900">{m.item}</td>
                            <td className="py-2 px-3 font-medium" style={{ color: m.tipo === 'entrada' ? GREEN_DARK : m.tipo === 'ajuste' ? '#4a5a8a' : GOLD }}>{ROTULO_TIPO_MOVIMENTACAO[m.tipo] ?? m.tipo}</td>
                            <td className="py-2 px-3 text-gray-500">{ROTULO_ORIGEM[m.origem ?? ''] ?? m.origem ?? '—'}</td>
                            <td className="py-2 px-3 text-gray-500">{[m.fornecedor, m.observacao].filter(Boolean).join(' · ') || '—'}</td>
                            <td className="py-2 px-3 text-right" style={{ color: m.variacao < 0 ? RED : '#111827' }}>{m.variacao > 0 ? '+' : ''}{formatarNumero(m.variacao)} {m.unidade ?? ''}</td>
                            <td className="py-2 px-3 text-right text-gray-600">{m.custo_unitario == null ? '—' : formatarNumero(m.custo_unitario)}</td>
                            <td className="py-2 px-3 text-right text-gray-600">{m.valor == null ? '—' : formatarMoeda(m.valor)}</td>
                            <td className="py-2 px-3 text-right font-medium" style={{ color: m.saldo_apos < 0 ? RED : '#111827' }}>{formatarNumero(m.saldo_apos)}</td>
                          </tr>
                        ))}
                        {movimentacoes.length === 0 && (
                          <tr>
                            <td colSpan={9} className="py-8 text-center text-gray-500">Nenhuma movimentação no período.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {movimentacoes.length > LIMITE_EXTRATO && !extratoCompleto && (
                    <div className="px-4 py-3 border-t border-gray-100 text-center">
                      <button onClick={() => setExtratoCompleto(true)} className="text-xs font-medium underline" style={{ color: GREEN_DARK }}>
                        Mostrar todos os {formatarInteiro(movimentacoes.length)} lançamentos
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-gray-400">
                  Valor em estoque = saldo final × custo médio atual do item. Saldos inicial e final reconstruídos pelo histórico de lançamentos.
                </p>
              </>
            )}

            {aba === 'operacao' && op && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { rotulo: 'Cafés da manhã', valor: op.cafe_manha },
                    { rotulo: 'Lanches', valor: op.lanches },
                    { rotulo: 'Almoços', valor: op.almocos },
                    { rotulo: 'Jantares', valor: op.jantares },
                  ].map((k) => (
                    <div key={k.rotulo} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                      <p className="text-2xl font-bold" style={{ color: GREEN_DARK }}>{formatarInteiro(k.valor)}</p>
                      <p className="text-xs text-gray-600 mt-1">{k.rotulo}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-sm text-gray-700">
                  <p>{formatarInteiro(op.registros)} {op.registros === 1 ? 'registro' : 'registros'} de saída no período, com {formatarInteiro(op.refeicoes_total)} refeições.</p>
                  <p className="mt-1">
                    {custoRefeicao == null
                      ? 'Sem baixas valoradas no período para calcular o custo por refeição.'
                      : <>Custo por refeição = baixas do período ({formatarMoeda(op.custo_baixas)}) ÷ {formatarInteiro(op.refeicoes_total)} refeições = <strong>{formatarMoeda(custoRefeicao)}</strong>.</>}
                  </p>
                </div>
              </div>
            )}

            {aba === 'marmitas' && marm && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <h3 className="px-4 py-3 text-sm font-semibold text-gray-900 border-b border-gray-100">
                  Marmitas <span className="text-xs font-normal text-gray-400">({formatarInteiro(marm.quantidade)} marmitas · {formatarMoeda(marm.valor)})</span>
                </h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        {['Data', 'Fornecedor', 'Destinatário', 'Marmitas', 'R$/marmita', 'Valor'].map((c, i) => (
                          <th key={c} className={`py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase ${i < 3 ? 'text-left' : 'text-right'}`}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {marm.lista.map((m, idx) => (
                        <tr key={`${m.data}-${idx}`} className="border-b border-gray-100 last:border-0">
                          <td className="py-2 px-3 text-gray-600">{formatarData(m.data)}</td>
                          <td className="py-2 px-3 text-gray-900">{m.fornecedor ?? '—'}</td>
                          <td className="py-2 px-3 text-gray-600">{m.destinatario ?? '—'}</td>
                          <td className="py-2 px-3 text-right text-gray-600">{formatarInteiro(m.quantidade)}</td>
                          <td className="py-2 px-3 text-right text-gray-600">{m.preco_unitario == null ? '—' : formatarMoeda(m.preco_unitario)}</td>
                          <td className="py-2 px-3 text-right font-medium text-gray-900">{formatarMoeda(m.valor)}</td>
                        </tr>
                      ))}
                      {marm.lista.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-gray-500">Nenhuma marmita no período.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {marm.sem_preco > 0 && (
                  <p className="px-4 py-3 text-xs border-t border-gray-100" style={{ color: GOLD }}>
                    {marm.sem_preco} {marm.sem_preco === 1 ? 'registro sem preço unitário' : 'registros sem preço unitário'} (valor R$ 0,00).
                  </p>
                )}
              </div>
            )}
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
