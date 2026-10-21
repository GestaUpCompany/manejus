import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@gestaup/supabase'
import logoManejus from '/images/manejus360.png'
import { gerarRelatorioEstoquePDFPuppeteer } from '../../utils/relatorioEstoquePDFPuppeteer'
import { ordenarPeriodo } from '../../features/relatorioGeral/periodo'
import {
  FILTROS_ESTOQUE,
  GRUPOS_ESTOQUE,
  ROTULO_ORIGEM,
  ROTULO_TIPO_MOVIMENTACAO,
  chaveItem,
  classificarABC,
  filtrarItens,
  itensDeAtencao,
  itensPorGrupo,
  ordenarItens,
  rotuloUnidadeCusto,
  textoCobertura,
  totaisDoGrupo,
  type CampoOrdenacaoEstoque,
  type DadosRelatorioEstoque,
  type FiltroEstoque,
  type ItemTipoEstoque,
  type MovimentacaoEstoque,
} from '../../features/relatorioEstoque/agregacao'
import { plural } from '../../features/relatorioPastagens/agregacao'

const GREEN_DARK = '#0F6437'
const RED = '#c94d46'
const GOLD = '#c28a27'
const LIMITE_EXTRATO = 200

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

function detalheMovimentacao(m: MovimentacaoEstoque): string {
  if (m.tipo === 'entrada') return [m.fornecedor, m.nota_fiscal ? `NF ${m.nota_fiscal}` : ''].filter(Boolean).join(' · ')
  return m.observacao ?? ''
}

const COR_CLASSE = {
  A: { backgroundColor: '#dff0e6', color: GREEN_DARK },
  B: { backgroundColor: '#fdf3e3', color: '#9a6b17' },
  C: { backgroundColor: '#eceff1', color: '#63736a' },
} as const

export function RelatorioEstoquePublico({ token, relatorioInfo }: Props) {
  const hoje = useMemo(() => new Date(), [])
  const [usarPeriodo, setUsarPeriodo] = useState(true)
  const [dataInicio, setDataInicio] = useState(() => dataLocalISO(new Date(hoje.getFullYear(), hoje.getMonth(), 1)))
  const [dataFim, setDataFim] = useState(() => dataLocalISO(hoje))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dados, setDados] = useState<DadosRelatorioEstoque | null>(null)
  const [grupoAtivo, setGrupoAtivo] = useState<ItemTipoEstoque>('insumo')
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<FiltroEstoque>('todos')
  const [campo, setCampo] = useState<CampoOrdenacaoEstoque>('valor_estoque')
  const [direcao, setDirecao] = useState<'asc' | 'desc'>('desc')
  const [extratoCompleto, setExtratoCompleto] = useState(false)
  const [exportandoPDF, setExportandoPDF] = useState(false)

  const carregarDados = useCallback(async () => {
    if (!token) return
    try {
      setLoading(true)
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_dados_relatorio_estoque', {
        p_token: token,
        p_data_inicio: usarPeriodo ? dataInicio || null : null,
        p_data_fim: usarPeriodo ? dataFim || null : null,
      })
      if (rpcError) {
        console.error('Erro ao carregar dados:', rpcError)
        setError('Erro ao carregar dados do relatório.')
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
  }, [token, usarPeriodo, dataInicio, dataFim])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  const itens = useMemo(() => dados?.itens ?? [], [dados])
  const movimentacoes = useMemo(() => dados?.movimentacoes ?? [], [dados])
  const comPeriodo = dados?.tem_periodo === true
  // Escopo restrito permite só um grupo; 'todos' mostra os grupos com itens.
  const grupoDoEscopo = dados?.escopo === 'insumos' ? 'insumo' : dados?.escopo === 'formulacoes' ? 'formulacao' : null
  const gruposPresentes = useMemo(
    () => GRUPOS_ESTOQUE.filter((g) => itensPorGrupo(itens, g.key).length > 0 || g.key === grupoDoEscopo),
    [itens, grupoDoEscopo],
  )
  const grupoEfetivo = gruposPresentes.some((g) => g.key === grupoAtivo) ? grupoAtivo : (gruposPresentes[0]?.key ?? 'insumo')
  const itensGrupo = useMemo(() => itensPorGrupo(itens, grupoEfetivo), [itens, grupoEfetivo])
  // KPIs e curva ABC acompanham a aba ativa; busca/filtro só mexem na tabela.
  const totais = useMemo(() => totaisDoGrupo(itensGrupo), [itensGrupo])
  const abc = useMemo(() => classificarABC(itens), [itens])
  const resumoABC = useMemo(() => {
    const comValor = itensGrupo.filter((i) => abc.has(chaveItem(i)))
    const total = comValor.reduce((s, i) => s + i.valor_estoque, 0)
    return (['A', 'B', 'C'] as const).map((classe) => {
      const lista = comValor.filter((i) => abc.get(chaveItem(i)) === classe)
      const valor = lista.reduce((s, i) => s + i.valor_estoque, 0)
      return { classe, itens: lista.length, pct: total > 0 ? (valor / total) * 100 : 0 }
    })
  }, [itensGrupo, abc])
  const atencao = useMemo(() => itensDeAtencao(itensGrupo), [itensGrupo])
  const itensVisiveis = useMemo(
    () => ordenarItens(filtrarItens(itensGrupo, busca, filtro), campo, direcao),
    [itensGrupo, busca, filtro, campo, direcao],
  )
  const movimentacoesGrupo = useMemo(
    () => movimentacoes.filter((m) => m.item_tipo === grupoEfetivo),
    [movimentacoes, grupoEfetivo],
  )
  const negativos = useMemo(() => itensGrupo.filter((i) => i.negativo), [itensGrupo])
  const qtdNegativos = negativos.length
  const valorNegativo = negativos.reduce((s, i) => s + (i.valor_negativo ?? 0), 0)

  const alternarOrdenacao = (novo: CampoOrdenacaoEstoque) => {
    if (novo === campo) {
      setDirecao(direcao === 'asc' ? 'desc' : 'asc')
    } else {
      setCampo(novo)
      setDirecao(novo === 'nome' ? 'asc' : 'desc')
    }
  }

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
        .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[<>:"/\\|?*]+/g, '').trim() || 'Fazenda'
      const rotuloEscopo = dados.escopo === 'insumos' ? ' Insumos' : dados.escopo === 'formulacoes' ? ' Formulacoes' : ''
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

  const cabecalho = (rotulo: string, campoOrdem: CampoOrdenacaoEstoque | null, alinhar: 'left' | 'right' = 'right') => (
    <th
      key={rotulo}
      className={`py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap ${alinhar === 'left' ? 'text-left' : 'text-right'} ${campoOrdem ? 'cursor-pointer select-none hover:text-gray-800' : ''}`}
      onClick={campoOrdem ? () => alternarOrdenacao(campoOrdem) : undefined}
      aria-sort={campoOrdem && campo === campoOrdem ? (direcao === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      {rotulo}
      {campoOrdem && campo === campoOrdem ? (direcao === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  )

  const renderTabela = () => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {cabecalho('Item', 'nome', 'left')}
              {cabecalho('Tipo', null, 'left')}
              {cabecalho('ABC', null, 'left')}
              {comPeriodo && cabecalho('Saldo inicial', null)}
              {comPeriodo && cabecalho('Entradas', 'entradas')}
              {comPeriodo && cabecalho('Saídas', 'saidas')}
              {cabecalho(comPeriodo ? 'Saldo final' : 'Estoque atual', 'saldo_final')}
              {cabecalho('Mínimo', null)}
              {comPeriodo && cabecalho('Cobertura', 'cobertura_dias')}
              {cabecalho('Custo', 'custo_unitario')}
              {cabecalho('Valor em estoque', 'valor_estoque')}
            </tr>
          </thead>
          <tbody>
            {itensVisiveis.map((item) => {
              const classe = abc.get(chaveItem(item))
              const saldo = comPeriodo ? (item.saldo_final ?? item.estoque_atual) : item.estoque_atual
              const unidade = item.unidade || 'kg'
              return (
                <tr key={chaveItem(item)} className="border-b border-gray-100 last:border-0">
                  <td className="py-2.5 px-3">
                    <span className="font-medium text-gray-900">{item.nome}</span>
                    {item.em_alerta && (
                      <span className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: '#fdf3e3', color: GOLD }}>abaixo do mínimo</span>
                    )}
                    {item.negativo && (
                      <span className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: '#fdf6f5', color: RED }}>saldo negativo</span>
                    )}
                    {item.sem_custo && (
                      <span className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: '#fdf3e3', color: GOLD }}>sem custo</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-gray-500">{item.tipo || '—'}</td>
                  <td className="py-2.5 px-3">
                    {classe ? <span className="rounded px-1.5 py-0.5 text-xs font-bold" style={COR_CLASSE[classe]}>{classe}</span> : <span className="text-gray-300">—</span>}
                  </td>
                  {comPeriodo && <td className="py-2.5 px-3 text-right text-gray-600">{formatarNumero(item.saldo_inicial)}</td>}
                  {comPeriodo && <td className="py-2.5 px-3 text-right text-gray-600">{formatarNumero(item.entradas)}</td>}
                  {comPeriodo && <td className="py-2.5 px-3 text-right text-gray-600">{formatarNumero(item.saidas)}</td>}
                  <td className="py-2.5 px-3 text-right font-medium whitespace-nowrap" style={{ color: item.negativo ? RED : '#111827' }}>
                    {formatarNumero(saldo)} {unidade}
                  </td>
                  <td className="py-2.5 px-3 text-right text-gray-600">{item.estoque_minimo > 0 ? formatarNumero(item.estoque_minimo) : '—'}</td>
                  {comPeriodo && (
                    <td className="py-2.5 px-3 text-right text-gray-600 whitespace-nowrap" title={item.data_esgotamento ? `Esgota em ${formatarData(item.data_esgotamento)} no ritmo do período` : undefined}>
                      {textoCobertura(item)}
                    </td>
                  )}
                  <td className="py-2.5 px-3 text-right text-gray-600 whitespace-nowrap" title={rotuloUnidadeCusto(item)}>
                    {item.sem_custo ? '—' : `${formatarMoeda(item.custo_unitario)}/${unidade}`}
                  </td>
                  <td className="py-2.5 px-3 text-right font-medium text-gray-900">{formatarMoeda(item.valor_estoque)}</td>
                </tr>
              )
            })}
            {itensVisiveis.length === 0 && (
              <tr>
                <td colSpan={comPeriodo ? 11 : 7} className="py-8 text-center text-gray-500">Nenhum item para os filtros selecionados.</td>
              </tr>
            )}
          </tbody>
          {itensVisiveis.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-green-50/40">
                <td className="py-2.5 px-3 font-semibold text-gray-900" colSpan={comPeriodo ? 10 : 6}>
                  Valor total {itensVisiveis.length !== itensGrupo.length ? '(itens exibidos)' : ''}
                </td>
                <td className="py-2.5 px-3 text-right font-bold" style={{ color: GREEN_DARK }}>
                  {formatarMoeda(totaisDoGrupo(itensVisiveis).valor_total)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )

  const kpis = [
    { valor: formatarMoeda(totais.valor_total), rotulo: 'Valor em estoque', sub: `${totais.total_itens} ${plural(totais.total_itens, 'item', 'itens')}`, cor: GREEN_DARK },
    ...(comPeriodo
      ? [
          { valor: formatarMoeda(totais.valor_entradas), rotulo: 'Entradas no período', sub: undefined, cor: GREEN_DARK },
          { valor: formatarMoeda(totais.valor_saidas), rotulo: 'Saídas no período', sub: undefined, cor: GOLD },
        ]
      : []),
    { valor: String(totais.em_alerta), rotulo: 'Abaixo do estoque mínimo', sub: (totais.a_repor ?? 0) > 0 ? `${totais.a_repor} com reposição sugerida` : undefined, cor: totais.em_alerta > 0 ? GOLD : GREEN_DARK },
    { valor: String(totais.sem_custo ?? 0), rotulo: 'Sem custo', sub: (totais.sem_custo ?? 0) > 0 ? 'valor total subestimado' : undefined, cor: (totais.sem_custo ?? 0) > 0 ? GOLD : GREEN_DARK },
    { valor: String(qtdNegativos), rotulo: 'Saldos negativos', sub: valorNegativo > 0 ? `${formatarMoeda(valorNegativo)} fora do valor total` : undefined, cor: qtdNegativos > 0 ? RED : GREEN_DARK },
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

      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-gray-400">
            {comPeriodo ? 'Período' : 'Posição do estoque'} · gerado em {formatarDataHora(dados?.gerado_em)} · {totais.total_itens} {plural(totais.total_itens, 'item', 'itens')}
          </p>
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={usarPeriodo} onChange={(e) => setUsarPeriodo(e.target.checked)} />
              Filtrar por período
            </label>
            {usarPeriodo && (
              <>
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
              </>
            )}
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
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {loading && !dados ? (
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
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              {kpis.map((k) => (
                <div key={k.rotulo} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <p className="text-xl font-bold" style={{ color: k.cor }}>{k.valor}</p>
                  <p className="text-xs text-gray-600 mt-1">{k.rotulo}</p>
                  {k.sub && <p className="text-[11px] text-gray-400 mt-0.5">{k.sub}</p>}
                </div>
              ))}
            </div>

            {(atencao.length > 0 || resumoABC.some((r) => r.itens > 0)) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {resumoABC.some((r) => r.itens > 0) && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                    <p className="text-sm font-semibold text-gray-900 mb-2">Curva ABC por valor em estoque</p>
                    <div className="flex gap-3">
                      {resumoABC.map((r) => (
                        <div key={r.classe} className="flex-1 rounded-lg p-3" style={COR_CLASSE[r.classe]}>
                          <p className="text-lg font-bold">{r.classe}</p>
                          <p className="text-xs">{r.itens} {plural(r.itens, 'item', 'itens')} · {formatarNumero(r.pct, 1)}% do valor</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-2">A: até 80% do valor acumulado, B: até 95%, C: o restante. Itens sem saldo positivo ou sem custo ficam fora.</p>
                  </div>
                )}
                {atencao.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                    <p className="text-sm font-semibold text-gray-900 mb-2">Qualidade dos dados e reposição</p>
                    <ul className="text-xs text-gray-600 space-y-1">
                      {(totais.sem_custo ?? 0) > 0 && <li>{totais.sem_custo} {plural(totais.sem_custo ?? 0, 'item sem custo cadastrado', 'itens sem custo cadastrado')}: o valor total está subestimado.</li>}
                      {qtdNegativos > 0 && <li>{qtdNegativos} {plural(qtdNegativos, 'item com saldo negativo', 'itens com saldo negativo')}{valorNegativo > 0 ? ` (${formatarMoeda(valorNegativo)} que não entram no valor total)` : ''}: falta lançar entrada ou ajuste.</li>}
                      {totais.em_alerta > 0 && <li>{totais.em_alerta} {plural(totais.em_alerta, 'item', 'itens')} no estoque mínimo ou abaixo dele.</li>}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar item ou tipo"
                aria-label="Buscar item ou tipo"
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm w-full sm:w-64"
              />
              <div className="flex flex-wrap gap-1">
                {FILTROS_ESTOQUE.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFiltro(f.key)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      filtro === f.key ? 'text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                    style={filtro === f.key ? { backgroundColor: GREEN_DARK, borderColor: GREEN_DARK } : { borderColor: '#d1d5db' }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {renderTabela()}
            <p className="text-[11px] text-gray-400">
              Valor em estoque = saldo {comPeriodo ? 'final ' : ''}× custo médio atual do item (saldo negativo vale 0). {comPeriodo ? 'Saldos inicial e final reconstruídos pelo histórico de lançamentos. Cobertura = saldo final ÷ consumo médio diário do período.' : ''}
            </p>

            {comPeriodo && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <h3 className="px-4 py-3 text-sm font-semibold text-gray-900 border-b border-gray-100">
                  Extrato de movimentações <span className="text-xs font-normal text-gray-400">({movimentacoesGrupo.length})</span>
                </h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        {['Data', 'Item', 'Tipo', 'Origem', 'Detalhe', 'Variação', 'Custo', 'Valor', 'Saldo após'].map((c, i) => (
                          <th key={c} className={`py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase ${i < 5 ? 'text-left' : 'text-right'}`}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(extratoCompleto ? movimentacoesGrupo : movimentacoesGrupo.slice(0, LIMITE_EXTRATO)).map((m, idx) => (
                        <tr key={`${m.item}-${m.data}-${idx}`} className="border-b border-gray-100 last:border-0">
                          <td className="py-2 px-3 text-gray-600 whitespace-nowrap">{formatarData(m.data)}</td>
                          <td className="py-2 px-3 text-gray-900">{m.item}</td>
                          <td className="py-2 px-3 font-medium" style={{ color: m.tipo === 'entrada' || m.tipo === 'producao' ? GREEN_DARK : m.tipo === 'ajuste' ? '#4a5a8a' : GOLD }}>{ROTULO_TIPO_MOVIMENTACAO[m.tipo] ?? m.tipo}</td>
                          <td className="py-2 px-3 text-gray-500">{ROTULO_ORIGEM[m.origem ?? ''] ?? m.origem ?? '—'}</td>
                          <td className="py-2 px-3 text-gray-500">{detalheMovimentacao(m) || '—'}</td>
                          <td className="py-2 px-3 text-right whitespace-nowrap" style={{ color: m.variacao < 0 ? RED : '#111827' }}>
                            {m.variacao > 0 ? '+' : ''}{formatarNumero(m.variacao)} {m.unidade || 'kg'}
                          </td>
                          <td className="py-2 px-3 text-right text-gray-600">{m.custo_unitario == null ? '—' : formatarNumero(m.custo_unitario)}</td>
                          <td className="py-2 px-3 text-right text-gray-600">{m.valor == null ? '—' : formatarMoeda(m.valor)}</td>
                          <td className="py-2 px-3 text-right font-medium" style={{ color: m.saldo_apos < 0 ? RED : '#111827' }}>{formatarNumero(m.saldo_apos)}</td>
                        </tr>
                      ))}
                      {movimentacoesGrupo.length === 0 && (
                        <tr>
                          <td colSpan={9} className="py-8 text-center text-gray-500">Nenhuma movimentação no período.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {!extratoCompleto && movimentacoesGrupo.length > LIMITE_EXTRATO && (
                  <button
                    onClick={() => setExtratoCompleto(true)}
                    className="w-full border-t border-gray-100 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
                  >
                    Mostrar todos os {movimentacoesGrupo.length} lançamentos
                  </button>
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
