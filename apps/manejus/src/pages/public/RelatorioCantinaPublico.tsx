import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@gestaup/supabase'
import logoManejus from '/images/manejus360.png'
import { gerarRelatorioCantinaPDFPuppeteer } from '../../utils/relatorioCantinaPDFPuppeteer'
import { ordenarPeriodo } from '../../features/relatorioGeral/periodo'
import {
  classificarABC,
  filtrarItens,
  itensParaRepor,
  numeroComUnidade,
  ordenarItens,
  quantidadeComUnidade,
  rotuloUnidadeCusto,
  textoCobertura,
  totaisDosItens,
  type CampoOrdenacaoCantina,
  type ClasseABC,
  type DadosRelatorioCantina,
  type FiltroCantina,
  type MarmitasCantina,
  type RefeicaoMarmita,
} from '../../features/relatorioCantina/agregacao'

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

function formatarMoeda(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || isNaN(valor)) return '—'
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarInteiro(valor: number | null | undefined): string {
  return (Number(valor) || 0).toLocaleString('pt-BR')
}

function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

const ROTULOS_REFEICAO: [RefeicaoMarmita, string][] = [
  ['cafe_manha', 'Café da manhã'],
  ['lanche', 'Lanche'],
  ['almoco', 'Almoço'],
  ['jantar', 'Jantar'],
  ['nao_informada', 'Sem refeição informada'],
]

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

const FILTROS: { key: FiltroCantina; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'alerta', label: 'Abaixo do mínimo' },
  { key: 'negativo', label: 'Saldo negativo' },
]

const CABECALHOS: { campo: CampoOrdenacaoCantina | null; rotulo: string; esq?: boolean }[] = [
  { campo: 'nome', rotulo: 'Item', esq: true },
  { campo: null, rotulo: 'ABC' },
  { campo: 'saldo_final', rotulo: 'Saldo' },
  { campo: null, rotulo: 'Mínimo' },
  { campo: 'cobertura_dias', rotulo: 'Cobertura' },
  { campo: 'baixas', rotulo: 'Consumo' },
  { campo: 'valor_estoque', rotulo: 'Valor' },
]

// Marmitas ou pratos feitos: mesmo bloco, com a divisão de marmitas quando existe.
function MarmitasBloco({ dados }: { dados: MarmitasCantina }) {
  const empresas = dados.por_empresa ?? []
  const principais = empresas.slice(0, 8)
  const outras = empresas.slice(8)
  const somaOutras = (campo: 'quantidade' | 'valor') => outras.reduce((s, e) => s + (Number(e[campo]) || 0), 0)
  const refeicoes = ROTULOS_REFEICAO.filter(([chave]) => (dados.por_refeicao?.[chave] ?? 0) > 0)
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <h3 className="px-4 py-3 text-sm font-semibold text-gray-900 border-b border-gray-100">
        Marmitas <span className="text-xs font-normal text-gray-400">({formatarInteiro(dados.quantidade)} · {formatarMoeda(dados.valor)})</span>
      </h3>
      {dados.por_tipo ? (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="py-2.5 px-4 text-left text-xs font-semibold text-gray-500 uppercase">Quem consumiu</th>
                  <th className="py-2.5 px-4 text-right text-xs font-semibold text-gray-500 uppercase">Marmitas</th>
                  <th className="py-2.5 px-4 text-right text-xs font-semibold text-gray-500 uppercase">Valor</th>
                </tr>
              </thead>
              <tbody>
                {dados.por_tipo.interna.quantidade > 0 && (
                  <tr className="border-b border-gray-100">
                    <td className="py-2 px-4 text-gray-900">Funcionários</td>
                    <td className="py-2 px-4 text-right text-gray-600">{formatarInteiro(dados.por_tipo.interna.quantidade)}</td>
                    <td className="py-2 px-4 text-right text-gray-900">{formatarMoeda(dados.por_tipo.interna.valor)}</td>
                  </tr>
                )}
                {principais.map((e) => (
                  <tr key={e.empresa} className="border-b border-gray-100">
                    <td className="py-2 px-4 text-gray-900">{e.empresa}</td>
                    <td className="py-2 px-4 text-right text-gray-600">{formatarInteiro(e.quantidade)}</td>
                    <td className="py-2 px-4 text-right text-gray-900">{formatarMoeda(e.valor)}</td>
                  </tr>
                ))}
                {outras.length > 0 && (
                  <tr className="border-b border-gray-100">
                    <td className="py-2 px-4 text-gray-900">Outras ({outras.length})</td>
                    <td className="py-2 px-4 text-right text-gray-600">{formatarInteiro(somaOutras('quantidade'))}</td>
                    <td className="py-2 px-4 text-right text-gray-900">{formatarMoeda(somaOutras('valor'))}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {refeicoes.length > 0 && (
            <p className="px-4 py-3 text-xs text-gray-500 border-t border-gray-100">
              Por refeição: {refeicoes.map(([chave, rotulo]) => `${rotulo} ${formatarInteiro(dados.por_refeicao?.[chave])}`).join(' · ')}
            </p>
          )}
        </>
      ) : (
        <p className="px-4 py-3 text-sm text-gray-500">Divisão entre funcionários e empresas não registrada nestas marmitas.</p>
      )}
      {dados.sem_preco > 0 && (
        <p className="px-4 py-3 text-xs border-t border-gray-100" style={{ color: GOLD }}>
          {dados.sem_preco} {dados.sem_preco === 1 ? 'registro sem preço unitário' : 'registros sem preço unitário'}: valor não contabilizado.
        </p>
      )}
    </div>
  )
}

function PratosBloco({ dados }: { dados: MarmitasCantina }) {
  const medio = dados.quantidade > 0 && dados.valor > 0 ? formatarMoeda(dados.valor / dados.quantidade) : '—'
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">
        Pratos feitos <span className="text-xs font-normal text-gray-400">({formatarInteiro(dados.quantidade)} · {formatarMoeda(dados.valor)})</span>
      </h3>
      <div className="grid grid-cols-3 gap-3">
        {[
          { rotulo: 'Pratos', valor: formatarInteiro(dados.quantidade), cor: GREEN_DARK },
          { rotulo: 'Valor', valor: formatarMoeda(dados.valor), cor: GOLD },
          { rotulo: 'Preço médio', valor: medio, cor: GREEN_DARK },
        ].map((k) => (
          <div key={k.rotulo} className="rounded-lg bg-gray-50 p-3">
            <p className="text-lg font-bold" style={{ color: k.cor }}>{k.valor}</p>
            <p className="text-xs text-gray-600">{k.rotulo}</p>
          </div>
        ))}
      </div>
      {dados.sem_preco > 0 && (
        <p className="mt-3 text-xs" style={{ color: GOLD }}>
          {dados.sem_preco} {dados.sem_preco === 1 ? 'registro sem preço unitário' : 'registros sem preço unitário'}: valor não contabilizado.
        </p>
      )}
    </div>
  )
}

export function RelatorioCantinaPublico({ token, relatorioInfo }: Props) {
  const hoje = useMemo(() => new Date(), [])
  const [dataInicio, setDataInicio] = useState(() => dataLocalISO(new Date(hoje.getFullYear(), hoje.getMonth(), 1)))
  const [dataFim, setDataFim] = useState(() => dataLocalISO(hoje))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dados, setDados] = useState<DadosRelatorioCantina | null>(null)
  const [exportandoPDF, setExportandoPDF] = useState(false)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<FiltroCantina>('todos')
  const [campo, setCampo] = useState<CampoOrdenacaoCantina>('nome')
  const [direcao, setDirecao] = useState<'asc' | 'desc'>('asc')

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
  const totais = useMemo(() => totaisDosItens(itens), [itens])
  const abc = useMemo(() => classificarABC(itens), [itens])
  const repor = useMemo(() => itensParaRepor(itens), [itens])
  const visiveis = useMemo(
    () => ordenarItens(filtrarItens(itens, busca, filtro), campo, direcao),
    [itens, busca, filtro, campo, direcao],
  )

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
  const pratos = dados?.pratos_feitos
  const custoRefeicao = op && op.custo_baixas > 0 ? op.custo_por_refeicao : null
  const kpis = [
    { valor: formatarMoeda(totais.valor_total), rotulo: 'Valor em estoque', sub: `${formatarInteiro(totais.total_itens)} ${totais.total_itens === 1 ? 'item' : 'itens'}`, cor: GREEN_DARK },
    { valor: formatarMoeda(totais.valor_entradas), rotulo: 'Compras no período', cor: GREEN_DARK },
    { valor: formatarMoeda(totais.valor_baixas), rotulo: 'Consumo', cor: GOLD },
    { valor: custoRefeicao == null ? '—' : formatarMoeda(custoRefeicao), rotulo: 'Custo por refeição', sub: `${formatarInteiro(op?.refeicoes_total)} ${op?.refeicoes_total === 1 ? 'refeição' : 'refeições'}`, cor: GREEN_DARK },
  ]

  const temProntas = !!(marm?.quantidade || pratos?.quantidade)

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

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <h3 className="px-4 py-3 text-sm font-semibold text-gray-900 border-b border-gray-100">
                  Itens para repor <span className="text-xs font-normal text-gray-400">({repor.length})</span>
                </h3>
                {repor.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-center" style={{ color: GREEN_DARK }}>Nenhum item abaixo do mínimo.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          {['Item', 'Saldo', 'Mínimo', 'Cobertura'].map((c, i) => (
                            <th key={c} className={`py-2.5 px-4 text-xs font-semibold text-gray-500 uppercase ${i === 0 ? 'text-left' : 'text-right'}`}>{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {repor.map((i) => (
                          <tr key={i.id} className="border-b border-gray-100 last:border-0">
                            <td className="py-2 px-4 text-gray-900">{i.nome}</td>
                            <td className="py-2 px-4 text-right font-medium" style={{ color: i.negativo ? RED : '#111827' }}>{quantidadeComUnidade(i.saldo_final, i.unidade)}</td>
                            <td className="py-2 px-4 text-right text-gray-600">{numeroComUnidade(i.estoque_minimo, i.unidade)}</td>
                            <td className="py-2 px-4 text-right text-gray-600">{textoCobertura(i)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Refeições servidas <span className="text-xs font-normal text-gray-400">({formatarInteiro(op?.refeicoes_total)})</span></h3>
                <div className="space-y-2">
                  {[
                    { nome: 'Café da manhã', valor: op?.cafe_manha ?? 0 },
                    { nome: 'Lanche', valor: op?.lanches ?? 0 },
                    { nome: 'Almoço', valor: op?.almocos ?? 0 },
                    { nome: 'Jantar', valor: op?.jantares ?? 0 },
                  ].filter((r) => r.valor > 0).map((r) => {
                    const pct = op?.refeicoes_total ? (r.valor / op.refeicoes_total) * 100 : 0
                    return (
                      <div key={r.nome}>
                        <div className="flex justify-between text-xs text-gray-600">
                          <span>{r.nome}</span>
                          <span>{formatarInteiro(r.valor)} <span className="text-gray-400">({Math.round(pct)}%)</span></span>
                        </div>
                        <div className="h-2 rounded bg-gray-100 mt-1">
                          <div className="h-2 rounded" style={{ width: `${Math.max(2, pct)}%`, backgroundColor: GREEN_DARK }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

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
                  {FILTROS.map((f) => (
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
                            {i.sem_custo && <span className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: '#eef2fa', color: '#4a5a8a' }} title={rotuloUnidadeCusto(i)}>sem custo</span>}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {classe ? (
                              <span className="rounded px-1.5 py-0.5 text-[11px] font-bold" style={{ backgroundColor: COR_CLASSE[classe].bg, color: COR_CLASSE[classe].fg }}>{classe}</span>
                            ) : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium" style={{ color: i.negativo ? RED : '#111827' }}>{quantidadeComUnidade(i.saldo_final, i.unidade)}</td>
                          <td className="py-2.5 px-3 text-right text-gray-600">{i.estoque_minimo > 0 ? numeroComUnidade(i.estoque_minimo, i.unidade) : '—'}</td>
                          <td className="py-2.5 px-3 text-right text-gray-600">{textoCobertura(i)}</td>
                          <td className="py-2.5 px-3 text-right text-gray-600">{Number(i.baixas) > 0 ? quantidadeComUnidade(i.baixas, i.unidade) : '—'}</td>
                          <td className="py-2.5 px-3 text-right font-medium text-gray-900">{formatarMoeda(i.valor_estoque)}</td>
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
                        <td className="py-2.5 px-3" colSpan={6}>Total em estoque{visiveis.length !== itens.length ? ' (itens exibidos)' : ''}</td>
                        <td className="py-2.5 px-3 text-right font-bold" style={{ color: GREEN_DARK }}>{formatarMoeda(visiveis.reduce((s, i) => s + i.valor_estoque, 0))}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {temProntas && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                {marm && marm.quantidade > 0 && <div className="lg:col-span-2"><MarmitasBloco dados={marm} /></div>}
                {pratos && pratos.quantidade > 0 && <div className={marm && marm.quantidade > 0 ? '' : 'lg:col-span-3'}><PratosBloco dados={pratos} /></div>}
              </div>
            )}

            <p className="text-[11px] text-gray-400">
              Valor em estoque = saldo final × custo médio atual do item. ABC: A = itens que somam 80% do valor em estoque; B = até 95%; C = o restante. Cobertura = dias de estoque no ritmo de consumo do período.
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
