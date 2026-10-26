import { useMemo } from 'react'
import {
  ROTULO_MOVIMENTACAO,
  totaisDosTanques,
  type DadosRelatorioEstoqueCombustivel,
} from '../../features/relatorioEstoqueCombustivel/agregacao'

const GREEN_DARK = '#0F6437'
const RED = '#c94d46'
const GOLD = '#c28a27'

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

function detalhe(m: DadosRelatorioEstoqueCombustivel['movimentacoes'][number]): string {
  if (m.tipo === 'entrada') return [m.fornecedor, m.nota_fiscal ? `NF ${m.nota_fiscal}` : ''].filter(Boolean).join(' · ')
  if (m.tipo === 'baixa') return [m.maquina, m.placa, m.motorista].filter(Boolean).join(' · ')
  return m.observacao ?? ''
}

interface Props {
  dados: DadosRelatorioEstoqueCombustivel
  mostrarExtrato?: boolean
}

// Blocos do estoque de combustível (KPIs, posição por tanque e extrato).
// Não busca dados, não tem cabeçalho nem seletor de período: quem usa decide isso.
export function EstoqueCombustivelSecao({ dados, mostrarExtrato = true }: Props) {
  const tanques = useMemo(() => dados.tanques ?? [], [dados])
  const movimentacoes = useMemo(() => dados.movimentacoes ?? [], [dados])
  const totais = useMemo(() => totaisDosTanques(tanques), [tanques])

  const kpis = [
    { valor: `${formatarNumero(totais.saldo_inicial_l)} L`, rotulo: 'Saldo inicial', cor: GREEN_DARK },
    { valor: `${formatarNumero(totais.entradas_l)} L`, rotulo: 'Entradas', sub: formatarMoeda(totais.entradas_valor), cor: GREEN_DARK },
    { valor: `${formatarNumero(totais.baixas_l)} L`, rotulo: 'Baixas (consumo)', sub: formatarMoeda(totais.baixas_valor), cor: GOLD },
    { valor: `${formatarNumero(totais.saldo_final_l)} L`, rotulo: 'Saldo final', sub: `Valor em estoque: ${formatarMoeda(totais.valor_estoque)}`, cor: totais.saldo_final_l < 0 ? RED : GREEN_DARK },
  ]

  return (
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

      {mostrarExtrato && <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
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
      </div>}
      <p className="text-[11px] text-gray-400">
        Valor em estoque = saldo final × custo médio atual do tanque. Saldos inicial e final reconstruídos pelo histórico de lançamentos.
      </p>
    </>
  )
}
