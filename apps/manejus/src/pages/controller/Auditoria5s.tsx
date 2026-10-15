import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { exportToXLSX, formatDate } from '@gestaup/shared'
import { Button, Card, Input, CardSkeleton } from '@gestaup/ui'
import { AUDITORIA_5S_EXPORT_CONFIG } from '../../utils/exportConfigs'
import { resultadoRegistro } from '../../features/relatorioAuditoria5s/agregacao'
import { pendenciasPorSetor } from '../../features/pendencias5s/calculo'
import { LABEL, SELECT, corNota, corPercentual, textoNota, textoPercentual } from '../../features/relatorioAuditoria5s/apresentacao'
import { useAuditorias5s } from '../../hooks/useAuditorias5s'
import { Auditoria5sPendencias } from './Auditoria5sPendencias'
import { Auditoria5sVisaoGeral } from './Auditoria5sVisaoGeral'
import { Auditoria5sSetor } from './Auditoria5sSetor'

type Aba = 'geral' | 'setor' | 'pendencias' | 'auditorias'

const ABAS: { valor: Aba; rotulo: string }[] = [
  { valor: 'geral', rotulo: 'Visão geral' },
  { valor: 'setor', rotulo: 'Por setor' },
  { valor: 'pendencias', rotulo: 'Pendências' },
  { valor: 'auditorias', rotulo: 'Auditorias' },
]

const PRESETS: { dias: number | null; rotulo: string }[] = [
  { dias: 30, rotulo: '30 dias' },
  { dias: 90, rotulo: '90 dias' },
  { dias: 365, rotulo: '12 meses' },
  { dias: null, rotulo: 'Tudo' },
]

/** YYYY-MM-DD de N dias atrás (data local do navegador). */
const diasAtras = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function Auditoria5s() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const abaParam = searchParams.get('aba')
  const aba: Aba = ABAS.some((a) => a.valor === abaParam) ? (abaParam as Aba) : 'geral'
  const setorChave = searchParams.get('setor')

  const { registros, setores, fazendaNome, loading, erro } = useAuditorias5s()
  const [dataInicio, setDataInicio] = useState(() => diasAtras(365))
  const [dataFim, setDataFim] = useState('')
  const [responsavelFiltro, setResponsavelFiltro] = useState('')
  const [setorLista, setSetorLista] = useState('')

  const irPara = (novaAba: Aba, setor?: string | null) => {
    const params: Record<string, string> = {}
    if (novaAba !== 'geral') params.aba = novaAba
    if (setor) params.setor = setor
    setSearchParams(params)
  }

  const nomesResponsaveis = useMemo(() => [...new Set(registros.map((r) => r.responsavel).filter(Boolean) as string[])].sort(), [registros])
  const nomesSetores = useMemo(() => [...new Set(registros.map((r) => r.setor).filter(Boolean) as string[])].sort(), [registros])

  // Período e responsável valem para a visão geral, por setor e lista. Pendências são o estado atual (histórico inteiro).
  const filtrados = useMemo(
    () =>
      registros.filter((r) => {
        const dia = r.data.slice(0, 10)
        return (!dataInicio || dia >= dataInicio) && (!dataFim || dia <= dataFim) && (!responsavelFiltro || r.responsavel === responsavelFiltro)
      }),
    [registros, dataInicio, dataFim, responsavelFiltro]
  )

  const pendencias = useMemo(
    () =>
      pendenciasPorSetor(
        registros.map((r) => ({
          id: r.id,
          data: r.data,
          localId: r.local_id ?? null,
          setor: r.setor ?? null,
          setorId: r.setor_id ?? null,
          itens: r.itens ?? null,
          naoConformidades: r.nao_conformidades ?? null,
        }))
      ),
    [registros]
  )

  const filtradosLista = useMemo(() => filtrados.filter((r) => !setorLista || r.setor === setorLista), [filtrados, setorLista])

  const limparFiltros = () => {
    setDataInicio(diasAtras(365))
    setDataFim('')
    setResponsavelFiltro('')
    setSetorLista('')
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

      <div role="tablist" aria-label="Visão da auditoria" className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1 sm:inline-grid sm:grid-cols-4 sm:w-[34rem]">
        {ABAS.map((op) => (
          <button
            key={op.valor}
            type="button"
            role="tab"
            aria-selected={aba === op.valor}
            onClick={() => irPara(op.valor, op.valor === 'setor' || op.valor === 'pendencias' ? setorChave : null)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${aba === op.valor ? 'bg-primary text-white shadow' : 'text-content hover:bg-surface-1'}`}
          >
            {op.rotulo}
          </button>
        ))}
      </div>

      {aba !== 'pendencias' && (
        <Card className="bg-surface-1 p-4 sm:p-6" disableHover>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div>
              <label className={LABEL}>Período</label>
              <div className="flex flex-wrap gap-1" role="group" aria-label="Períodos rápidos">
                {PRESETS.map((p) => {
                  const ativo = p.dias === null ? dataInicio === '' && dataFim === '' : dataInicio === diasAtras(p.dias) && dataFim === ''
                  return (
                    <button
                      key={p.rotulo}
                      type="button"
                      aria-pressed={ativo}
                      onClick={() => {
                        setDataInicio(p.dias === null ? '' : diasAtras(p.dias))
                        setDataFim('')
                      }}
                      className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${ativo ? 'bg-primary text-white' : 'bg-surface-2 text-content-strong hover:bg-surface-2/70'}`}
                    >
                      {p.rotulo}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="sm:w-40">
              <label className={LABEL}>Data início</label>
              <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="text-sm" />
            </div>
            <div className="sm:w-40">
              <label className={LABEL}>Data fim</label>
              <Input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="text-sm" />
            </div>
            <div className="sm:w-56">
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
            <Button variant="secondary" onClick={limparFiltros} className="w-full sm:w-auto text-sm">
              Limpar filtros
            </Button>
          </div>
          <p className="mt-3 text-xs text-content-muted">
            {filtrados.length} de {registros.length} auditorias no período. As pendências mostram sempre o estado atual, sem depender do período.
          </p>
        </Card>
      )}

      {aba === 'geral' && (
        <Auditoria5sVisaoGeral
          registros={filtrados}
          setores={setores}
          pendenciasAbertas={pendencias.abertas}
          fazendaNome={fazendaNome}
          onAbrirSetor={(chave) => irPara('setor', chave)}
          onVerPendencias={(chave) => irPara('pendencias', chave ?? null)}
        />
      )}

      {aba === 'setor' && (
        <Auditoria5sSetor
          registrosPeriodo={filtrados}
          todosRegistros={registros}
          setores={setores}
          setorChave={setorChave}
          pendenciasAbertas={pendencias.abertas}
          pendenciasResolvidas={pendencias.resolvidas}
          fazendaNome={fazendaNome}
          onSelecionar={(chave) => irPara(chave ? 'setor' : 'geral', chave)}
          onVerPendencias={(chave) => irPara('pendencias', chave)}
        />
      )}

      {aba === 'pendencias' && (
        <Auditoria5sPendencias registros={registros} fazendaNome={fazendaNome} setorChave={setorChave} onLimparSetor={() => irPara('pendencias')} />
      )}

      {aba === 'auditorias' && (
        <>
          <Card className="bg-surface-1 p-4 sm:p-6" disableHover>
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="sm:w-64">
                <label className={LABEL}>Setor</label>
                <select className={SELECT} value={setorLista} onChange={(e) => setSetorLista(e.target.value)}>
                  <option value="">Todos</option>
                  {nomesSetores.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                onClick={() => exportToXLSX(filtradosLista, AUDITORIA_5S_EXPORT_CONFIG, fazendaNome)}
                disabled={filtradosLista.length === 0}
                className="w-full sm:w-auto text-sm sm:ml-auto"
              >
                Exportar XLSX
              </Button>
            </div>
          </Card>

          {registros.length === 0 ? (
            <Card className="bg-surface-1 p-4 sm:p-6 text-center" disableHover>
              <p className="text-content-muted">Nenhuma auditoria 5S registrada</p>
            </Card>
          ) : filtradosLista.length === 0 ? (
            <Card className="bg-surface-1 p-4 sm:p-6 text-center" disableHover>
              <p className="text-content-muted">Nenhuma auditoria encontrada com os filtros aplicados</p>
            </Card>
          ) : (
            <Card className="bg-surface-1 overflow-x-auto" disableHover>
              <h3 className="text-base font-semibold text-content-strong p-4 sm:p-6 pb-3">Auditorias</h3>
              <table className="min-w-full divide-y divide-border-base">
                <thead className="bg-surface-2">
                  <tr>
                    {['Data', 'Setor', 'Responsável', 'Conformidade', 'Nota', 'C', 'N', '–'].map((h) => (
                      <th key={h} className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-content-muted uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-surface-1 divide-y divide-border-base">
                  {filtradosLista.map((r) => {
                    const res = resultadoRegistro(r)
                    return (
                      <tr
                        key={r.id}
                        onClick={() => navigate(`/controller/checklists/auditoria-5s/${r.id}`)}
                        className="cursor-pointer hover:bg-surface-2 transition-colors"
                      >
                        <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-sm text-content-strong">{formatDate(r.data)}</td>
                        <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-sm text-content-strong">{r.setor || '-'}</td>
                        <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-sm text-content-strong">{r.responsavel || '-'}</td>
                        <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-sm font-semibold" style={{ color: corPercentual(res.percentual) }}>
                          {textoPercentual(res.percentual)}
                        </td>
                        <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-sm font-semibold" style={{ color: corNota(r.nota_geral) }}>
                          {textoNota(r.nota_geral)}
                        </td>
                        <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-sm text-content-strong">{res.conformes}</td>
                        <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-sm text-content-strong">{res.naoConformes}</td>
                        <td className="px-4 sm:px-6 py-3 whitespace-nowrap text-sm text-content-strong">{res.naoAplicaveis}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
