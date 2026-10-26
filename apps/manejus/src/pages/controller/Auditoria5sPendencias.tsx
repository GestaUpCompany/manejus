import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Table, Thead, Tbody, Tr, Th, Td } from '@gestaup/ui'
import { exportToXLSX, formatDate } from '@gestaup/shared'
import { PENDENCIAS_5S_EXPORT_CONFIG } from '../../utils/exportConfigs'
import { SECOES_5S } from '../../features/relatorioAuditoria5s/itens'
import { diasEntre, pendenciasPorSetor, resumoPendencias5s, situacaoPlano5s, type PlanoAcao5s, type SituacaoPlano5s } from '../../features/pendencias5s/calculo'

interface RegistroParaPendencias {
  id: string
  data: string
  local_id?: string | null
  setor?: string | null
  setor_id?: string | null
  itens?: Record<string, any> | null
  nao_conformidades?: Record<string, any> | null
}

interface Props {
  registros: RegistroParaPendencias[]
  fazendaNome: string | null
  /** Só as pendências deste setor (chave = setor_id ou nome em minúsculas). */
  setorChave?: string | null
  /** Chamado ao remover o filtro de setor (some o chip e volta a todos). */
  onLimparSetor?: () => void
  /** Versão enxuta para dentro da visão por setor: sem filtros, sem KPI de setores e sem exportar. */
  compacto?: boolean
}

const LABEL = 'block text-xs sm:text-sm font-medium text-content mb-1 leading-tight'
const SELECT =
  'w-full rounded-lg border border-border-base bg-surface-1 px-3 py-2 text-sm text-content-strong focus:outline-none focus:ring-2 focus:ring-primary/40'

const textoDias = (dias: number) => (dias === 0 ? 'hoje' : `${dias} ${dias === 1 ? 'dia' : 'dias'}`)

const ROTULO_PLANO: Record<SituacaoPlano5s, { texto: string; classe: string }> = {
  sem_plano: { texto: 'Sem plano', classe: 'font-semibold text-red-500' },
  em_dia: { texto: 'Em andamento', classe: 'text-content-strong' },
  atrasado: { texto: 'Prazo vencido', classe: 'font-semibold text-red-500' },
  concluido: { texto: 'Medidas concluídas', classe: 'font-semibold text-green-600' },
}

/** Situação do plano de ação e as medidas ainda abertas (leitura; o plano é editado no PWA). */
function PlanoCelula({ plano, agora }: { plano: PlanoAcao5s | null; agora: string }) {
  const situacao = situacaoPlano5s(plano, agora)
  const { texto, classe } = ROTULO_PLANO[situacao]
  const abertas = plano?.medidas.filter((m) => !m.concluida) ?? []
  return (
    <div className="min-w-[12rem]">
      <span className={classe}>{texto}</span>
      {plano && (
        <span className="block text-xs text-content-muted">
          {plano.medidas.length - abertas.length}/{plano.medidas.length} medidas concluídas
        </span>
      )}
      {abertas.length > 0 && (
        <ul className="mt-1 list-disc pl-4 text-xs text-content">
          {abertas.slice(0, 3).map((m) => (
            <li key={m.id}>
              {m.descricao}
              {m.responsavel ? ` (${m.responsavel})` : ''}
              {m.prazo ? ` · prazo ${formatDate(m.prazo)}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Kpi({ titulo, valor, destaque }: { titulo: string; valor: string; destaque?: boolean }) {
  return (
    <Card className="bg-surface-1 p-4" disableHover>
      <p className="text-xs font-medium text-content-muted uppercase tracking-wider">{titulo}</p>
      <p className={`mt-1 text-2xl font-bold ${destaque ? 'text-amber-500' : 'text-content-strong'}`}>{valor}</p>
    </Card>
  )
}

/**
 * Pendências da Auditoria 5S: itens respondidos N que ainda não foram resolvidos.
 * Derivadas dos registros (sem tabela própria): o PWA pergunta ao auditor, na abertura seguinte do mesmo setor,
 * se cada item foi resolvido, e a resposta fica na própria auditoria (item C = resolvida; N = ainda pendente).
 */
export function Auditoria5sPendencias({ registros, fazendaNome, setorChave = null, onLimparSetor, compacto = false }: Props) {
  const navigate = useNavigate()
  const [pilarFiltro, setPilarFiltro] = useState('')
  const [setorFiltro, setSetorFiltro] = useState('')
  const [minDias, setMinDias] = useState(0)
  const [planoFiltro, setPlanoFiltro] = useState<'' | 'sem_plano' | 'atrasado'>('')
  const agora = useMemo(() => new Date().toISOString(), [])

  const { abertas: abertasTodas, resolvidas: resolvidasTodas } = useMemo(
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
  const abertas = useMemo(() => (setorChave ? abertasTodas.filter((p) => p.setorChave === setorChave) : abertasTodas), [abertasTodas, setorChave])
  const resolvidas = useMemo(() => (setorChave ? resolvidasTodas.filter((p) => p.setorChave === setorChave) : resolvidasTodas), [resolvidasTodas, setorChave])
  const nomeSetorFixo = setorChave ? (abertasTodas.find((p) => p.setorChave === setorChave)?.setor ?? resolvidasTodas.find((p) => p.setorChave === setorChave)?.setor ?? '') : ''

  const resumo = useMemo(() => resumoPendencias5s(abertas, resolvidas, agora), [abertas, resolvidas, agora])
  const setoresComPendencia = useMemo(() => [...new Set(abertas.map((p) => p.setor))].sort((a, b) => a.localeCompare(b)), [abertas])

  const filtradas = useMemo(
    () =>
      abertas.filter(
        (p) =>
          (!pilarFiltro || p.secao === pilarFiltro) &&
          (!setorFiltro || p.setor === setorFiltro) &&
          diasEntre(p.desde, agora) >= minDias &&
          (!planoFiltro || situacaoPlano5s(p.planoAcao, agora) === planoFiltro)
      ),
    [abertas, pilarFiltro, setorFiltro, minDias, planoFiltro, agora]
  )

  const recentes = useMemo(() => resolvidas.filter((r) => diasEntre(r.resolvidaEm, agora) <= 30).slice(0, compacto ? 5 : 15), [resolvidas, agora, compacto])

  const exportar = () =>
    exportToXLSX(
      filtradas.map((p) => ({
        setor: p.setor,
        pilar: p.secao,
        item: p.label,
        desde: p.desde,
        dias_em_aberto: diasEntre(p.desde, agora),
        ocorrencias: p.ocorrencias,
        observacao: p.observacao,
        foto_url: p.fotoUrl ?? '',
      })),
      PENDENCIAS_5S_EXPORT_CONFIG,
      fazendaNome
    )

  const abrirRegistro = (id: string | null) => {
    if (id) navigate(`/controller/checklists/auditoria-5s/${id}`)
  }

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      {setorChave && !compacto && (
        <div className="flex items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-3 py-1 text-content-strong">
            Setor: <b>{nomeSetorFixo || 'selecionado'}</b>
            {onLimparSetor && (
              <button type="button" onClick={onLimparSetor} className="font-bold text-content-muted hover:text-content-strong" aria-label="Remover filtro de setor">✕</button>
            )}
          </span>
        </div>
      )}

      <div className={`grid grid-cols-2 ${compacto ? 'lg:grid-cols-3' : 'lg:grid-cols-4'} gap-3 sm:gap-4`}>
        <Kpi titulo="Pendências abertas" valor={String(resumo.abertas)} destaque={resumo.abertas > 0} />
        {!compacto && <Kpi titulo="Setores afetados" valor={String(resumo.setoresAfetados)} />}
        <Kpi titulo="Mais antiga" valor={resumo.maisAntigaDias === null ? '-' : textoDias(resumo.maisAntigaDias)} />
        <Kpi
          titulo="Tempo médio de resolução"
          valor={resumo.tempoMedioResolucaoDias === null ? '-' : `${resumo.tempoMedioResolucaoDias.toLocaleString('pt-BR')} dias`}
        />
      </div>

      {!compacto && (
      <Card className="bg-surface-1 p-4 sm:p-6" disableHover>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
          <h3 className="text-base sm:text-lg font-semibold text-content-strong">Filtros</h3>
          <Button onClick={exportar} disabled={filtradas.length === 0} className="w-full sm:w-auto text-sm">
            Exportar XLSX
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div>
            <label className={LABEL}>Pilar</label>
            <select className={SELECT} value={pilarFiltro} onChange={(e) => setPilarFiltro(e.target.value)}>
              <option value="">Todos</option>
              {SECOES_5S.map((s) => (
                <option key={s.id} value={s.titulo}>
                  {s.titulo}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Setor</label>
            <select className={SELECT} value={setorFiltro} onChange={(e) => setSetorFiltro(e.target.value)}>
              <option value="">Todos</option>
              {setoresComPendencia.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Em aberto há pelo menos</label>
            <select className={SELECT} value={minDias} onChange={(e) => setMinDias(Number(e.target.value))}>
              {[0, 3, 7, 15, 30].map((d) => (
                <option key={d} value={d}>
                  {d === 0 ? 'Qualquer prazo' : `${d} dias`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Plano de ação</label>
            <select className={SELECT} value={planoFiltro} onChange={(e) => setPlanoFiltro(e.target.value as '' | 'sem_plano' | 'atrasado')}>
              <option value="">Todos</option>
              <option value="sem_plano">Sem plano</option>
              <option value="atrasado">Prazo vencido</option>
            </select>
          </div>
        </div>
      </Card>
      )}

      {abertas.length === 0 ? (
        <Card className="bg-surface-1 p-4 sm:p-6 text-center" disableHover>
          <p className="text-content-muted">Nenhuma pendência aberta nas auditorias 5S</p>
        </Card>
      ) : filtradas.length === 0 ? (
        <Card className="bg-surface-1 p-4 sm:p-6 text-center" disableHover>
          <p className="text-content-muted">Nenhuma pendência encontrada com os filtros aplicados</p>
        </Card>
      ) : (
        <Card className="bg-surface-1 overflow-x-auto" disableHover>
          <h3 className="text-base font-semibold text-content-strong p-4 sm:p-6 pb-3">Pendências abertas</h3>
          <Table>
            <Thead>
              <Tr>
                {!compacto && <Th>Setor</Th>}
                <Th>Pilar</Th>
                <Th>Não conformidade</Th>
                <Th>Desde</Th>
                <Th>Em aberto</Th>
                <Th>Auditorias</Th>
                <Th>Plano de ação</Th>
                <Th>Observação</Th>
                <Th>Foto</Th>
              </Tr>
            </Thead>
            <Tbody>
              {filtradas.map((p) => {
                const dias = diasEntre(p.desde, agora)
                return (
                  <Tr
                    key={`${p.setor}-${p.chave}`}
                    onClick={() => abrirRegistro(p.registroUltimoId)}
                    className="cursor-pointer hover:bg-surface-2 transition-colors"
                  >
                    {!compacto && <Td>{p.setor}</Td>}
                    <Td>{p.secao}</Td>
                    <Td>{p.label}</Td>
                    <Td>{formatDate(p.desde)}</Td>
                    <Td>
                      <span className={dias >= 7 ? 'font-semibold text-red-500' : dias >= 3 ? 'font-semibold text-amber-500' : ''}>{textoDias(dias)}</span>
                    </Td>
                    <Td>{p.ocorrencias}</Td>
                    <Td>
                      <PlanoCelula plano={p.planoAcao} agora={agora} />
                    </Td>
                    <Td>{p.observacao || '-'}</Td>
                    <Td>
                      {p.fotoUrl ? (
                        <a href={p.fotoUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-primary underline">
                          Ver foto
                        </a>
                      ) : (
                        '-'
                      )}
                    </Td>
                  </Tr>
                )
              })}
            </Tbody>
          </Table>
        </Card>
      )}

      {recentes.length > 0 && (
        <Card className="bg-surface-1 overflow-x-auto" disableHover>
          <h3 className="text-base font-semibold text-content-strong p-4 sm:p-6 pb-3">Resolvidas nos últimos 30 dias</h3>
          <Table>
            <Thead>
              <Tr>
                {!compacto && <Th>Setor</Th>}
                <Th>Não conformidade</Th>
                <Th>Aberta em</Th>
                <Th>Resolvida em</Th>
                <Th>Tempo para resolver</Th>
              </Tr>
            </Thead>
            <Tbody>
              {recentes.map((r) => (
                <Tr
                  key={`${r.setor}-${r.chave}-${r.resolvidaEm}`}
                  onClick={() => abrirRegistro(r.registroResolvidaId)}
                  className="cursor-pointer hover:bg-surface-2 transition-colors"
                >
                  {!compacto && <Td>{r.setor}</Td>}
                  <Td>{r.label}</Td>
                  <Td>{formatDate(r.abertaEm)}</Td>
                  <Td>{formatDate(r.resolvidaEm)}</Td>
                  <Td>{textoDias(diasEntre(r.abertaEm, r.resolvidaEm))}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Card>
      )}
    </div>
  )
}
