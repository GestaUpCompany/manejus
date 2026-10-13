import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, exportToXLSX, formatDate, getFazendaIdForUser, getFazendaNome } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Button, Card, Input, CardSkeleton } from '@gestaup/ui'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { AUDITORIA_5S_EXPORT_CONFIG } from '../../utils/exportConfigs'
import {
  evolucao,
  porPilar,
  porResponsavel,
  porSetor,
  rankingItens,
  resultadoRegistro,
  resumoGeral,
  setoresSemAuditoria,
  type RegistroAuditoria5s,
} from '../../features/relatorioAuditoria5s/agregacao'

interface RegistroRow extends RegistroAuditoria5s {
  fazenda_id: string
  created_at: string
}

interface SetorRow {
  id: string
  nome: string
}

const COR_OK = '#10B981'
const COR_ALERTA = '#F59E0B'
const COR_RUIM = '#EF4444'

const corPercentual = (p: number | null) => (p === null ? '#9CA3AF' : p >= 90 ? COR_OK : p >= 70 ? COR_ALERTA : COR_RUIM)
const textoPercentual = (p: number | null) => (p === null ? '-' : `${p.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`)
const rotuloPeriodo = (periodo: string, agrupamento: 'semana' | 'mes') =>
  agrupamento === 'mes' ? `${periodo.slice(5, 7)}/${periodo.slice(0, 4)}` : `${periodo.slice(8, 10)}/${periodo.slice(5, 7)}`

const LABEL = 'block text-xs sm:text-sm font-medium text-content mb-1 leading-tight'
const SELECT =
  'w-full rounded-lg border border-border-base bg-surface-1 px-3 py-2 text-sm text-content-strong focus:outline-none focus:ring-2 focus:ring-primary/40'

function Kpi({ titulo, valor, cor }: { titulo: string; valor: string; cor?: string }) {
  return (
    <Card className="bg-surface-1 p-4" disableHover>
      <p className="text-xs font-medium text-content-muted uppercase tracking-wider">{titulo}</p>
      <p className="mt-1 text-2xl font-bold text-content-strong" style={cor ? { color: cor } : undefined}>
        {valor}
      </p>
    </Card>
  )
}

export function Auditoria5s() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registros, setRegistros] = useState<RegistroRow[]>([])
  const [setores, setSetores] = useState<SetorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [fazendaNome, setFazendaNome] = useState<string | null>(null)
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [setorFiltro, setSetorFiltro] = useState('')
  const [responsavelFiltro, setResponsavelFiltro] = useState('')
  const [agrupamento, setAgrupamento] = useState<'semana' | 'mes'>('mes')

  useEffect(() => {
    let cancelado = false
    const carregar = async () => {
      if (!user) return
      const fazendaId = await getFazendaIdForUser(user.id)
      if (!fazendaId) {
        if (!cancelado) setLoading(false)
        return
      }
      getFazendaNome(fazendaId).then((n) => !cancelado && setFazendaNome(n))

      const [regs, sets] = await Promise.all([
        supabase
          .from('registros_auditoria_5s')
          .select('*')
          .eq('fazenda_id', fazendaId)
          .is('deleted_at', null)
          .order('data', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase.from('setores').select('id, nome').eq('fazenda_id', fazendaId).eq('ativo', true).is('deleted_at', null),
      ])
      if (cancelado) return
      if (regs.error) {
        console.error('Erro ao buscar auditorias 5S:', regs.error)
        setErro(regs.error.message || 'Erro ao buscar auditorias')
      } else {
        setRegistros((regs.data ?? []) as RegistroRow[])
      }
      if (!sets.error) setSetores((sets.data ?? []) as SetorRow[])
      setLoading(false)
    }
    carregar()
    return () => {
      cancelado = true
    }
  }, [user])

  const nomesSetores = useMemo(() => [...new Set(registros.map((r) => r.setor).filter(Boolean) as string[])].sort(), [registros])
  const nomesResponsaveis = useMemo(() => [...new Set(registros.map((r) => r.responsavel).filter(Boolean) as string[])].sort(), [registros])

  const filtrados = useMemo(
    () =>
      registros.filter((r) => {
        const dia = r.data.slice(0, 10)
        return (
          (!dataInicio || dia >= dataInicio) &&
          (!dataFim || dia <= dataFim) &&
          (!setorFiltro || r.setor === setorFiltro) &&
          (!responsavelFiltro || r.responsavel === responsavelFiltro)
        )
      }),
    [registros, dataInicio, dataFim, setorFiltro, responsavelFiltro]
  )

  const resumo = useMemo(() => resumoGeral(filtrados), [filtrados])
  const linhasSetor = useMemo(() => porSetor(filtrados), [filtrados])
  const pilares = useMemo(() => porPilar(filtrados), [filtrados])
  const itensCriticos = useMemo(() => rankingItens(filtrados).slice(0, 10), [filtrados])
  const pontos = useMemo(() => evolucao(filtrados, agrupamento), [filtrados, agrupamento])
  const responsaveis = useMemo(() => porResponsavel(filtrados), [filtrados])
  // Cobertura só faz sentido sem filtro de setor/responsável
  const semAuditoria = useMemo(
    () => (setorFiltro || responsavelFiltro ? [] : setoresSemAuditoria(setores, filtrados)),
    [setores, filtrados, setorFiltro, responsavelFiltro]
  )

  const limparFiltros = () => {
    setDataInicio('')
    setDataFim('')
    setSetorFiltro('')
    setResponsavelFiltro('')
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      <h2 className="text-xl sm:text-2xl font-bold text-content-strong">Auditoria 5S</h2>

      {erro && (
        <Card className="bg-surface-1 p-4 text-sm text-red-600" disableHover>
          {erro}
        </Card>
      )}

      <Card className="bg-surface-1 p-4 sm:p-6" disableHover>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
          <h3 className="text-base sm:text-lg font-semibold text-content-strong">Filtros</h3>
          <Button
            onClick={() => exportToXLSX(filtrados, AUDITORIA_5S_EXPORT_CONFIG, fazendaNome)}
            disabled={filtrados.length === 0}
            className="w-full sm:w-auto text-sm"
          >
            Exportar XLSX
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <div>
            <label className={LABEL}>Data início</label>
            <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="text-sm" />
          </div>
          <div>
            <label className={LABEL}>Data fim</label>
            <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="text-sm" />
          </div>
          <div>
            <label className={LABEL}>Setor</label>
            <select className={SELECT} value={setorFiltro} onChange={(e) => setSetorFiltro(e.target.value)}>
              <option value="">Todos</option>
              {nomesSetores.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Responsável</label>
            <select className={SELECT} value={responsavelFiltro} onChange={(e) => setResponsavelFiltro(e.target.value)}>
              <option value="">Todos</option>
              {nomesResponsaveis.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3">
          <Button variant="secondary" onClick={limparFiltros} className="w-full sm:w-auto text-sm">
            Limpar filtros
          </Button>
        </div>
      </Card>

      {registros.length === 0 ? (
        <Card className="bg-surface-1 p-4 sm:p-6 text-center" disableHover>
          <p className="text-content-muted">Nenhuma auditoria 5S registrada</p>
        </Card>
      ) : filtrados.length === 0 ? (
        <Card className="bg-surface-1 p-4 sm:p-6 text-center" disableHover>
          <p className="text-content-muted">Nenhuma auditoria encontrada com os filtros aplicados</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <Kpi titulo="Auditorias" valor={String(resumo.auditorias)} />
            <Kpi titulo="Conformidade média" valor={textoPercentual(resumo.percentual)} cor={corPercentual(resumo.percentual)} />
            <Kpi titulo="Itens não conformes" valor={String(resumo.itensNaoConformes)} />
            <Kpi titulo="Setores auditados" valor={String(resumo.setoresAuditados)} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <Card className="bg-surface-1 p-4 sm:p-6" disableHover>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-content-strong">Evolução da conformidade</h3>
                <select
                  className="rounded-lg border border-border-base bg-surface-1 px-2 py-1 text-xs text-content-strong"
                  value={agrupamento}
                  onChange={(e) => setAgrupamento(e.target.value as 'semana' | 'mes')}
                >
                  <option value="mes">Por mês</option>
                  <option value="semana">Por semana</option>
                </select>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={pontos.map((p) => ({ ...p, rotulo: rotuloPeriodo(p.periodo, agrupamento) }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="rotulo" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
                    <Tooltip formatter={(v) => [`${v}%`, 'Conformidade']} />
                    <Line type="monotone" dataKey="percentual" stroke={COR_OK} strokeWidth={2} dot />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="bg-surface-1 p-4 sm:p-6" disableHover>
              <h3 className="text-base font-semibold text-content-strong mb-3">Conformidade por pilar</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pilares.map((p) => ({ ...p, valor: p.percentual ?? 0 }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="titulo" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
                    <Tooltip formatter={(v) => [`${v}%`, 'Conformidade']} />
                    <Bar dataKey="valor" fill={COR_OK} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <Card className="bg-surface-1 p-4 sm:p-6 overflow-x-auto" disableHover>
              <h3 className="text-base font-semibold text-content-strong mb-3">Setores (pior conformidade primeiro)</h3>
              <table className="min-w-full divide-y divide-border-base text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-content-muted uppercase tracking-wider">
                    <th className="py-2 pr-4">Setor</th>
                    <th className="py-2 pr-4">Auditorias</th>
                    <th className="py-2 pr-4">Conformidade</th>
                    <th className="py-2">Última</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-base">
                  {linhasSetor.map((l) => (
                    <tr key={l.setor}>
                      <td className="py-2 pr-4 text-content-strong">{l.setor}</td>
                      <td className="py-2 pr-4 text-content-strong">{l.auditorias}</td>
                      <td className="py-2 pr-4 font-semibold" style={{ color: corPercentual(l.percentual) }}>
                        {textoPercentual(l.percentual)}
                      </td>
                      <td className="py-2 text-content-strong">{formatDate(l.ultimaData)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {semAuditoria.length > 0 && (
                <p className="mt-3 text-xs text-content-muted">
                  <span className="font-semibold">Sem auditoria no período:</span> {semAuditoria.join(', ')}
                </p>
              )}
            </Card>

            <Card className="bg-surface-1 p-4 sm:p-6 overflow-x-auto" disableHover>
              <h3 className="text-base font-semibold text-content-strong mb-3">Itens mais não conformes</h3>
              {itensCriticos.length === 0 ? (
                <p className="text-sm text-content-muted">Nenhum item não conforme no período.</p>
              ) : (
                <table className="min-w-full divide-y divide-border-base text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium text-content-muted uppercase tracking-wider">
                      <th className="py-2 pr-4">Item</th>
                      <th className="py-2 pr-4">Pilar</th>
                      <th className="py-2">Não conforme</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-base">
                    {itensCriticos.map((i) => (
                      <tr key={i.chave}>
                        <td className="py-2 pr-4 text-content-strong">{i.negativa}</td>
                        <td className="py-2 pr-4 text-content-strong">{i.secao}</td>
                        <td className="py-2 text-content-strong whitespace-nowrap">
                          {i.naoConformes}/{i.respondidos} ({textoPercentual(i.percentualNaoConforme)})
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>

          <Card className="bg-surface-1 p-4 sm:p-6 overflow-x-auto" disableHover>
            <h3 className="text-base font-semibold text-content-strong mb-3">Responsáveis</h3>
            <div className="flex flex-wrap gap-2">
              {responsaveis.map((r) => (
                <span key={r.responsavel} className="rounded-full bg-surface-2 px-3 py-1 text-xs text-content-strong">
                  {r.responsavel}: {r.auditorias} {r.auditorias === 1 ? 'auditoria' : 'auditorias'} ({textoPercentual(r.percentual)})
                </span>
              ))}
            </div>
          </Card>

          <Card className="bg-surface-1 overflow-x-auto" disableHover>
            <h3 className="text-base font-semibold text-content-strong p-4 sm:p-6 pb-3">Auditorias</h3>
            <table className="min-w-full divide-y divide-border-base">
              <thead className="bg-surface-2">
                <tr>
                  {['Data', 'Setor', 'Responsável', 'Conformidade', 'C', 'N'].map((h) => (
                    <th key={h} className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-surface-1 divide-y divide-border-base">
                {filtrados.map((r) => {
                  const res = resultadoRegistro(r)
                  return (
                    <tr
                      key={r.id}
                      onClick={() => navigate(`/controller/cadernetas/auditoria-5s/${r.id}`)}
                      className="cursor-pointer hover:bg-surface-2 transition-colors"
                    >
                      <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-sm text-content-strong">{formatDate(r.data)}</td>
                      <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-sm text-content-strong">{r.setor || '-'}</td>
                      <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-sm text-content-strong">{r.responsavel || '-'}</td>
                      <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-sm font-semibold" style={{ color: corPercentual(res.percentual) }}>
                        {textoPercentual(res.percentual)}
                      </td>
                      <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-sm text-content-strong">{res.conformes}</td>
                      <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-sm text-content-strong">{res.naoConformes}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  )
}
