import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@gestaup/supabase'
import logoManejus from '/images/manejus360.png'
import { gerarRelatorioEstoquePDFPuppeteer } from '../../utils/relatorioEstoquePDFPuppeteer'
import { ordenarPeriodo } from '../../features/relatorioGeral/periodo'
import {
  FILTROS_ESTOQUE,
  GRUPOS_ESTOQUE,
  chaveItem,
  classificarABC,
  filtrarItens,
  itensPorGrupo,
  ordenarItens,
  rotuloUnidadeCusto,
  textoCobertura,
  totaisDoGrupo,
  type CampoOrdenacaoEstoque,
  type DadosRelatorioEstoque,
  type FiltroEstoque,
  type ItemEstoque,
  type ItemTipoEstoque,
} from '../../features/relatorioEstoque/agregacao'
import {
  COBERTURA_ALVO_DIAS,
  COBERTURA_EXCESSO_DIAS,
  COBERTURA_RUPTURA_DIAS,
  ROTULO_SITUACAO,
  classificarSituacao,
  concentracaoABC,
  diasDoPeriodo,
  lerPeriodo,
  listaImobilizado,
  listaRepor,
  resumirDecisao,
  sugestaoReposicao,
  type SituacaoItem,
} from '../../features/relatorioEstoque/decisao'
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

type AbaDecisao = 'repor' | 'imobilizado' | 'itens'

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

const COR_CLASSE = {
  A: { backgroundColor: '#dff0e6', color: GREEN_DARK },
  B: { backgroundColor: '#fdf3e3', color: '#9a6b17' },
  C: { backgroundColor: '#eceff1', color: '#63736a' },
} as const

const COR_SITUACAO: Record<SituacaoItem, { backgroundColor: string; color: string }> = {
  ruptura: { backgroundColor: '#fdf6f5', color: RED },
  parado: { backgroundColor: '#fdf3e3', color: '#9a6b17' },
  excesso: { backgroundColor: '#fdf3e3', color: '#9a6b17' },
  ok: { backgroundColor: '#eef6f1', color: GREEN_DARK },
}

function motivoRepor(item: ItemEstoque): string {
  if (item.negativo) return 'Saldo negativo'
  if (item.em_alerta) return 'Abaixo do mínimo'
  return `Cobertura de ${Math.round(item.cobertura_dias ?? 0)} d (menos de ${COBERTURA_RUPTURA_DIAS} d)`
}

function PilulaSituacao({ situacao }: { situacao: SituacaoItem }) {
  return (
    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={COR_SITUACAO[situacao]}>
      {ROTULO_SITUACAO[situacao]}
    </span>
  )
}

interface Indicador {
  valor: string
  rotulo: string
  sub?: string
  cor: string
  ajuda?: string
  onClick?: () => void
}

export function RelatorioEstoquePublico({ token, relatorioInfo }: Props) {
  const hoje = useMemo(() => new Date(), [])
  const [usarPeriodo, setUsarPeriodo] = useState(true)
  const [dataInicio, setDataInicio] = useState(() => dataLocalISO(new Date(hoje.getFullYear(), hoje.getMonth(), 1)))
  const [dataFim, setDataFim] = useState(() => dataLocalISO(hoje))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dados, setDados] = useState<DadosRelatorioEstoque | null>(null)
  const [grupoAtivo, setGrupoAtivo] = useState<ItemTipoEstoque>('insumo')
  const [aba, setAba] = useState<AbaDecisao | null>(null)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<FiltroEstoque>('todos')
  const [campo, setCampo] = useState<CampoOrdenacaoEstoque>('valor_estoque')
  const [direcao, setDirecao] = useState<'asc' | 'desc'>('desc')
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
  const comPeriodo = dados?.tem_periodo === true
  // Escopo restrito permite só um grupo; 'todos' mostra os grupos com itens.
  const grupoDoEscopo = dados?.escopo === 'insumos' ? 'insumo' : dados?.escopo === 'formulacoes' ? 'formulacao' : null
  const gruposPresentes = useMemo(
    () => GRUPOS_ESTOQUE.filter((g) => itensPorGrupo(itens, g.key).length > 0 || g.key === grupoDoEscopo),
    [itens, grupoDoEscopo],
  )
  const grupoEfetivo = gruposPresentes.some((g) => g.key === grupoAtivo) ? grupoAtivo : (gruposPresentes[0]?.key ?? 'insumo')
  const itensGrupo = useMemo(() => itensPorGrupo(itens, grupoEfetivo), [itens, grupoEfetivo])
  // Resumo, listas de decisão e curva ABC acompanham a aba de grupo; busca/filtro só mexem na tabela.
  const abc = useMemo(() => classificarABC(itens), [itens])
  const dias = useMemo(
    () => (comPeriodo ? diasDoPeriodo(dados?.data_inicio, dados?.data_fim, dados?.gerado_em) : null),
    [comPeriodo, dados],
  )
  const resumo = useMemo(() => resumirDecisao(itensGrupo, comPeriodo, dias), [itensGrupo, comPeriodo, dias])
  const concentracao = useMemo(() => concentracaoABC(itensGrupo, abc), [itensGrupo, abc])
  const leitura = useMemo(() => lerPeriodo(resumo, concentracao), [resumo, concentracao])
  const situacaoDe = useCallback((i: ItemEstoque) => classificarSituacao(i, comPeriodo), [comPeriodo])
  const repor = useMemo(() => listaRepor(itensGrupo, comPeriodo), [itensGrupo, comPeriodo])
  const imobilizado = useMemo(() => listaImobilizado(itensGrupo, comPeriodo), [itensGrupo, comPeriodo])
  const resumoABC = useMemo(() => {
    const comValor = itensGrupo.filter((i) => abc.has(chaveItem(i)))
    const total = comValor.reduce((s, i) => s + i.valor_estoque, 0)
    return (['A', 'B', 'C'] as const).map((classe) => {
      const lista = comValor.filter((i) => abc.get(chaveItem(i)) === classe)
      const valor = lista.reduce((s, i) => s + i.valor_estoque, 0)
      return { classe, itens: lista.length, valor, pct: total > 0 ? (valor / total) * 100 : 0 }
    })
  }, [itensGrupo, abc])
  const itensVisiveis = useMemo(
    () => ordenarItens(filtrarItens(itensGrupo, busca, filtro, situacaoDe), campo, direcao),
    [itensGrupo, busca, filtro, campo, direcao, situacaoDe],
  )
  const abas: { key: AbaDecisao; rotulo: string; qtd?: number }[] = [
    { key: 'repor', rotulo: 'O que repor', qtd: repor.length },
    ...(comPeriodo ? [{ key: 'imobilizado' as const, rotulo: 'Parado e em excesso', qtd: imobilizado.length }] : []),
    { key: 'itens', rotulo: 'Todos os itens', qtd: itensGrupo.length },
  ]
  const abaEfetiva: AbaDecisao = aba && abas.some((a) => a.key === aba) ? aba : repor.length > 0 ? 'repor' : 'itens'
  const valorRepor = repor.reduce((s, i) => s + sugestaoReposicao(i).valor, 0)
  const valorImobilizado = imobilizado.reduce((s, i) => s + i.valor_estoque, 0)
  const totalOrigem = resumo.consumoPorOrigem.reduce((s, o) => s + o.valor, 0)

  const alternarOrdenacao = (novo: CampoOrdenacaoEstoque) => {
    if (novo === campo) {
      setDirecao(direcao === 'asc' ? 'desc' : 'asc')
    } else {
      setCampo(novo)
      setDirecao(novo === 'nome' ? 'asc' : 'desc')
    }
  }

  const irParaItens = (f: FiltroEstoque) => {
    setFiltro(f)
    setAba('itens')
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

  const cabecalhoSimples = (colunas: [string, 'left' | 'right'][]) => (
    <thead>
      <tr className="bg-gray-50 border-b border-gray-200">
        {colunas.map(([rotulo, alinhar]) => (
          <th key={rotulo} className={`py-2.5 px-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap ${alinhar === 'left' ? 'text-left' : 'text-right'}`}>{rotulo}</th>
        ))}
      </tr>
    </thead>
  )

  const vazio = (mensagem: string) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
      <p className="text-gray-500 text-sm">{mensagem}</p>
    </div>
  )

  const renderRepor = () => {
    if (repor.length === 0) return vazio('Nenhum item com risco de ruptura neste grupo.')
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            {cabecalhoSimples(comPeriodo
              ? [['Item', 'left'], ['Motivo', 'left'], ['Saldo', 'right'], ['Consumo/dia', 'right'], ['Cobertura', 'right'], ['Esgota em', 'right'], ['Sugestão de compra', 'right'], ['Valor estimado', 'right']]
              : [['Item', 'left'], ['Motivo', 'left'], ['Saldo', 'right'], ['Mínimo', 'right'], ['Sugestão de compra', 'right'], ['Valor estimado', 'right']])}
            <tbody>
              {repor.map((item) => {
                const un = item.unidade || 'kg'
                const sug = sugestaoReposicao(item)
                return (
                  <tr key={chaveItem(item)} className="border-b border-gray-100 last:border-0">
                    <td className="py-2.5 px-3 font-medium text-gray-900">{item.nome}</td>
                    <td className="py-2.5 px-3 text-gray-600 whitespace-nowrap">{motivoRepor(item)}</td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap" style={{ color: item.negativo ? RED : '#111827' }}>{formatarNumero(item.saldo_final ?? item.estoque_atual)} {un}</td>
                    {comPeriodo && <td className="py-2.5 px-3 text-right text-gray-600">{formatarNumero(item.consumo_medio_dia)}</td>}
                    {comPeriodo && <td className="py-2.5 px-3 text-right text-gray-600 whitespace-nowrap">{textoCobertura(item)}</td>}
                    {comPeriodo && <td className="py-2.5 px-3 text-right text-gray-600 whitespace-nowrap">{formatarData(item.data_esgotamento)}</td>}
                    {!comPeriodo && <td className="py-2.5 px-3 text-right text-gray-600">{item.estoque_minimo > 0 ? formatarNumero(item.estoque_minimo) : '—'}</td>}
                    <td className="py-2.5 px-3 text-right font-semibold text-gray-900 whitespace-nowrap">{sug.quantidade > 0 ? `${formatarNumero(sug.quantidade)} ${un}` : '—'}</td>
                    <td className="py-2.5 px-3 text-right text-gray-700">{item.sem_custo || sug.valor <= 0 ? '—' : formatarMoeda(sug.valor)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-green-50/40">
                <td className="py-2.5 px-3 font-semibold text-gray-900" colSpan={comPeriodo ? 7 : 5}>Reposição estimada ({repor.length} {plural(repor.length, 'item', 'itens')})</td>
                <td className="py-2.5 px-3 text-right font-bold" style={{ color: GREEN_DARK }}>{formatarMoeda(valorRepor)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-100">
          Sugestão de compra = {comPeriodo ? `o maior entre o necessário para chegar ao estoque mínimo e para cobrir ${COBERTURA_ALVO_DIAS} dias no ritmo de consumo do período` : 'o necessário para chegar ao estoque mínimo cadastrado'}. Do mais urgente ao menos urgente.
        </p>
      </div>
    )
  }

  const renderImobilizado = () => {
    if (imobilizado.length === 0) return vazio('Nenhum capital parado ou em excesso neste grupo.')
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            {cabecalhoSimples([['Item', 'left'], ['Situação', 'left'], ['Motivo', 'left'], ['Saldo', 'right'], ['Cobertura', 'right'], ['Valor parado', 'right'], ['% do total', 'right']])}
            <tbody>
              {imobilizado.map((item) => {
                const situacao = situacaoDe(item)
                return (
                  <tr key={chaveItem(item)} className="border-b border-gray-100 last:border-0">
                    <td className="py-2.5 px-3 font-medium text-gray-900">{item.nome}</td>
                    <td className="py-2.5 px-3"><PilulaSituacao situacao={situacao} /></td>
                    <td className="py-2.5 px-3 text-gray-600">{situacao === 'parado' ? 'Sem nenhuma saída no período' : `Cobertura acima de ${COBERTURA_EXCESSO_DIAS} d`}</td>
                    <td className="py-2.5 px-3 text-right text-gray-600 whitespace-nowrap">{formatarNumero(item.saldo_final ?? item.estoque_atual)} {item.unidade || 'kg'}</td>
                    <td className="py-2.5 px-3 text-right text-gray-600 whitespace-nowrap">{textoCobertura(item)}</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-gray-900">{formatarMoeda(item.valor_estoque)}</td>
                    <td className="py-2.5 px-3 text-right text-gray-600">{valorImobilizado > 0 ? `${formatarNumero((item.valor_estoque / valorImobilizado) * 100, 1)}%` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-green-50/40">
                <td className="py-2.5 px-3 font-semibold text-gray-900" colSpan={5}>Capital imobilizado ({imobilizado.length} {plural(imobilizado.length, 'item', 'itens')})</td>
                <td className="py-2.5 px-3 text-right font-bold" style={{ color: GREEN_DARK }}>{formatarMoeda(valorImobilizado)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-100">
          Parado: tem saldo e valor, mas não teve nenhuma saída no período. Em excesso: cobertura acima de {COBERTURA_EXCESSO_DIAS} dias no ritmo do período.
        </p>
      </div>
    )
  }

  const renderTabela = () => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {cabecalho('Item', 'nome', 'left')}
              {cabecalho('Tipo', null, 'left')}
              {cabecalho('ABC', null, 'left')}
              {cabecalho('Situação', null, 'left')}
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
                  <td className="py-2.5 px-3"><PilulaSituacao situacao={situacaoDe(item)} /></td>
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
                <td colSpan={comPeriodo ? 11 : 8} className="py-8 text-center text-gray-500">Nenhum item para os filtros selecionados.</td>
              </tr>
            )}
          </tbody>
          {itensVisiveis.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-green-50/40">
                <td className="py-2.5 px-3 font-semibold text-gray-900" colSpan={comPeriodo ? 10 : 7}>
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

  const variacao = resumo.variacaoPct != null
    ? `${resumo.variacaoPct >= 0 ? '+' : ''}${formatarNumero(resumo.variacaoPct, 1)}% vs início (aprox.)`
    : undefined
  const indicadores: Indicador[] = comPeriodo
    ? [
        { valor: formatarMoeda(resumo.valorEstoque), rotulo: 'Valor em estoque', sub: variacao ?? `${itensGrupo.length} ${plural(itensGrupo.length, 'item', 'itens')}`, cor: GREEN_DARK, ajuda: 'Saldo final × custo médio atual. A variação compara com o início do período, que é aproximado (saldo inicial × custo atual).' },
        { valor: formatarMoeda(resumo.consumoValor), rotulo: 'Consumo no período', sub: resumo.consumoDiaValor != null ? `${formatarMoeda(resumo.consumoDiaValor)} por dia${resumo.giro != null ? ` · giro ${formatarNumero(resumo.giro)}×` : ''}` : undefined, cor: GOLD, ajuda: 'Valor das saídas no período. Giro = consumo ÷ valor médio em estoque: quanto maior, menos tempo o dinheiro fica parado.' },
        { valor: formatarMoeda(resumo.reposicaoValor), rotulo: 'Reposição estimada', sub: `${resumo.contagem.ruptura} ${plural(resumo.contagem.ruptura, 'item a repor', 'itens a repor')}`, cor: resumo.contagem.ruptura > 0 ? RED : GREEN_DARK, ajuda: `Quanto custa levar os itens a repor até o maior entre o estoque mínimo e ${COBERTURA_ALVO_DIAS} dias de cobertura.`, onClick: () => setAba('repor') },
        { valor: formatarMoeda(resumo.capitalParadoExcesso), rotulo: 'Parado e em excesso', sub: `${formatarNumero(resumo.pctParadoExcesso, 1)}% do valor em estoque`, cor: resumo.capitalParadoExcesso > 0 ? GOLD : GREEN_DARK, ajuda: `Dinheiro em itens sem saída no período ou com cobertura acima de ${COBERTURA_EXCESSO_DIAS} dias.`, onClick: () => setAba('imobilizado') },
      ]
    : [
        { valor: formatarMoeda(resumo.valorEstoque), rotulo: 'Valor em estoque', sub: `${itensGrupo.length} ${plural(itensGrupo.length, 'item', 'itens')}`, cor: GREEN_DARK },
        { valor: String(resumo.contagem.ruptura), rotulo: 'Itens a repor', sub: 'abaixo do mínimo ou negativos', cor: resumo.contagem.ruptura > 0 ? RED : GREEN_DARK, onClick: () => setAba('repor') },
        { valor: String(resumo.semCusto), rotulo: 'Sem custo', sub: resumo.semCusto > 0 ? 'valor total subestimado' : undefined, cor: resumo.semCusto > 0 ? GOLD : GREEN_DARK, onClick: () => irParaItens('sem_custo') },
        { valor: String(resumo.negativos), rotulo: 'Saldos negativos', sub: resumo.negativos > 0 ? 'falta lançar entrada ou ajuste' : undefined, cor: resumo.negativos > 0 ? RED : GREEN_DARK, onClick: () => irParaItens('negativo') },
      ]
  const situacoes: Indicador[] = comPeriodo
    ? [
        { valor: String(resumo.contagem.ruptura), rotulo: 'Itens a repor', sub: `cobertura < ${COBERTURA_RUPTURA_DIAS} d, abaixo do mínimo ou negativo`, cor: resumo.contagem.ruptura > 0 ? RED : GREEN_DARK, onClick: () => setAba('repor') },
        { valor: String(resumo.contagem.parado), rotulo: 'Itens parados', sub: `${formatarMoeda(resumo.capital.parado)} sem saída no período`, cor: resumo.contagem.parado > 0 ? GOLD : GREEN_DARK, onClick: () => irParaItens('parado') },
        { valor: String(resumo.contagem.excesso), rotulo: 'Itens em excesso', sub: `${formatarMoeda(resumo.capital.excesso)} com cobertura > ${COBERTURA_EXCESSO_DIAS} d`, cor: resumo.contagem.excesso > 0 ? GOLD : GREEN_DARK, onClick: () => irParaItens('excesso') },
        { valor: String(resumo.contagem.ok), rotulo: 'Itens em ordem', sub: `${formatarMoeda(resumo.capital.ok)} em estoque`, cor: GREEN_DARK },
      ]
    : []

  const renderIndicador = (k: Indicador) => {
    const corpo = (
      <>
        <p className="text-xl font-bold" style={{ color: k.cor }}>{k.valor}</p>
        <p className="text-xs text-gray-600 mt-1">
          {k.rotulo}
          {k.ajuda && <span className="ml-1 text-gray-400 cursor-help" title={k.ajuda} aria-label={k.ajuda}>ⓘ</span>}
        </p>
        {k.sub && <p className="text-[11px] text-gray-400 mt-0.5">{k.sub}</p>}
      </>
    )
    const classes = 'bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-left'
    return k.onClick ? (
      <button key={k.rotulo} type="button" onClick={k.onClick} className={`${classes} hover:border-gray-400 transition-colors`}>{corpo}</button>
    ) : (
      <div key={k.rotulo} className={classes}>{corpo}</div>
    )
  }

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
            {comPeriodo ? 'Período' : 'Posição do estoque'} · gerado em {formatarDataHora(dados?.gerado_em)} · {itensGrupo.length} {plural(itensGrupo.length, 'item', 'itens')}
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
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">{indicadores.map(renderIndicador)}</div>
            {situacoes.length > 0 && <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">{situacoes.map(renderIndicador)}</div>}

            <div className="rounded-xl border-l-4 bg-white p-4 shadow-sm" style={{ borderLeftColor: GREEN_DARK }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: GREEN_DARK }}>{comPeriodo ? 'Leitura do período' : 'Leitura da posição'}</p>
              <ul className="mt-2 list-disc pl-5 text-sm text-gray-700 space-y-1">
                {leitura.map((frase) => <li key={frase}>{frase}</li>)}
              </ul>
              {(resumo.semCusto > 0 || (comPeriodo && resumo.negativos > 0) || resumo.comAjuste > 0) && (
                <p className="mt-2 text-xs text-gray-400">
                  Qualidade dos dados:{' '}
                  {[
                    resumo.semCusto > 0 ? `${resumo.semCusto} ${plural(resumo.semCusto, 'item sem custo cadastrado (o valor total está subestimado)', 'itens sem custo cadastrado (o valor total está subestimado)')}` : '',
                    comPeriodo && resumo.negativos > 0 ? `${resumo.negativos} ${plural(resumo.negativos, 'saldo negativo', 'saldos negativos')} (falta lançar entrada ou ajuste)` : '',
                    resumo.comAjuste > 0 ? `${resumo.comAjuste} ${plural(resumo.comAjuste, 'item teve', 'itens tiveram')} ajuste manual de saldo no período` : '',
                  ].filter(Boolean).join(' · ')}.
                </p>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap gap-1 border-b border-gray-200">
                {abas.map((a) => (
                  <button
                    key={a.key}
                    onClick={() => setAba(a.key)}
                    className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                      abaEfetiva === a.key ? 'text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                    style={abaEfetiva === a.key ? { borderBottomColor: GREEN_DARK } : undefined}
                  >
                    {a.rotulo}
                    {a.qtd != null && <span className="ml-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">{a.qtd}</span>}
                  </button>
                ))}
              </div>

              {abaEfetiva === 'repor' && renderRepor()}
              {abaEfetiva === 'imobilizado' && renderImobilizado()}
              {abaEfetiva === 'itens' && (
                <>
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
                      {FILTROS_ESTOQUE.filter((f) => comPeriodo || (f.key !== 'parado' && f.key !== 'excesso')).map((f) => (
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
                    Valor em estoque = saldo {comPeriodo ? 'final ' : ''}× custo médio atual do item (saldo negativo vale 0). {comPeriodo ? 'Saldos reconstruídos pelo histórico de lançamentos. Cobertura = saldo final ÷ consumo médio diário do período.' : ''}
                  </p>
                </>
              )}
            </div>

            {resumoABC.some((r) => r.itens > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <p className="text-sm font-semibold text-gray-900 mb-2">Curva ABC por valor em estoque</p>
                  <div className="flex gap-3">
                    {resumoABC.map((r) => (
                      <div key={r.classe} className="flex-1 rounded-lg p-3" style={COR_CLASSE[r.classe]}>
                        <p className="text-lg font-bold">{r.classe}</p>
                        <p className="text-xs">{r.itens} {plural(r.itens, 'item', 'itens')} · {formatarNumero(r.pct, 1)}% do valor</p>
                        <p className="text-[11px] opacity-80">{formatarMoeda(r.valor)}</p>
                      </div>
                    ))}
                  </div>
                  {concentracao.itensComValor > 0 && (
                    <p className="mt-3 text-sm text-gray-700">
                      <strong>{concentracao.itensA} de {concentracao.itensComValor} {plural(concentracao.itensComValor, 'item', 'itens')} ({formatarNumero(concentracao.pctItensA, 1)}%)</strong> formam a classe A e concentram <strong>{formatarNumero(concentracao.pctValorA, 1)}%</strong> do valor: é onde vale concentrar o controle e a negociação.
                    </p>
                  )}
                  <div className="mt-3 rounded-lg border-l-4 bg-amber-50/60 p-3 text-xs text-gray-600" style={{ borderLeftColor: GOLD }}>
                    <strong style={{ color: '#9a6b17' }}>Como ler a curva ABC.</strong> Ordena os itens do maior para o menor valor em estoque e soma o valor acumulado. <strong>A</strong>: os itens que somam até 80% do valor (poucos itens, muito dinheiro: controle de perto). <strong>B</strong>: de 80% a 95%. <strong>C</strong>: os 5% finais (muitos itens, pouco valor: controle simples). Calculada separadamente para insumos e formulações; itens sem saldo positivo ou sem custo ficam fora.
                  </div>
                </div>
                {comPeriodo && resumo.consumoPorOrigem.length > 1 && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                    <p className="text-sm font-semibold text-gray-900 mb-2">Para onde foi o consumo do período <span className="text-xs font-normal text-gray-400">({formatarMoeda(totalOrigem)})</span></p>
                    <ul className="space-y-2">
                      {resumo.consumoPorOrigem.slice(0, 6).map((o) => (
                        <li key={o.origem}>
                          <div className="flex justify-between text-xs text-gray-600">
                            <span>{o.rotulo}</span>
                            <span>{formatarMoeda(o.valor)} · {formatarNumero(totalOrigem > 0 ? (o.valor / totalOrigem) * 100 : 0, 1)}%</span>
                          </div>
                          <div className="mt-1 h-2 rounded bg-gray-100">
                            <div className="h-2 rounded" style={{ width: `${Math.max(2, totalOrigem > 0 ? (o.valor / resumo.consumoPorOrigem[0].valor) * 100 : 0)}%`, backgroundColor: GOLD }} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <details className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
              <summary className="cursor-pointer font-semibold text-gray-900">Como ler este relatório</summary>
              <dl className="mt-3 grid gap-x-8 gap-y-2 text-xs lg:grid-cols-2">
                <div><dt className="font-semibold text-gray-800">A repor</dt><dd>Saldo negativo, abaixo do estoque mínimo cadastrado{comPeriodo ? ` ou cobertura menor que ${COBERTURA_RUPTURA_DIAS} dias` : ''}. O item corre risco de faltar.</dd></div>
                {comPeriodo && <div><dt className="font-semibold text-gray-800">Parado</dt><dd>Tem saldo e valor em estoque, mas nenhuma saída no período: dinheiro imobilizado sem giro.</dd></div>}
                {comPeriodo && <div><dt className="font-semibold text-gray-800">Em excesso</dt><dd>Cobertura acima de {COBERTURA_EXCESSO_DIAS} dias no ritmo do período: comprou-se mais do que o consumo pede.</dd></div>}
                {comPeriodo && <div><dt className="font-semibold text-gray-800">Cobertura</dt><dd>Quantos dias o saldo final do item dura no consumo médio diário do período. É calculada por item: cada um gira num ritmo, então não existe uma cobertura única do estoque.</dd></div>}
                {comPeriodo && <div><dt className="font-semibold text-gray-800">Giro</dt><dd>Consumo do período em R$ ÷ valor médio em estoque. Quanto maior, menos tempo o dinheiro fica parado.</dd></div>}
                <div><dt className="font-semibold text-gray-800">Sugestão de compra</dt><dd>{comPeriodo ? `Quantidade para chegar ao maior entre o estoque mínimo e a cobertura de ${COBERTURA_ALVO_DIAS} dias no ritmo do período.` : 'Quantidade necessária para chegar ao estoque mínimo cadastrado.'}</dd></div>
                <div><dt className="font-semibold text-gray-800">Valor em estoque</dt><dd>Saldo {comPeriodo ? 'final ' : ''}× custo médio atual. Saldo negativo vale 0 e item sem custo vale 0, o que subestima o total.</dd></div>
              </dl>
            </details>
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
