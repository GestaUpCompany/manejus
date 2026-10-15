import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Table, Thead, Tbody, Tr, Th, Td } from '@gestaup/ui'
import { exportToXLSX, formatDate } from '@gestaup/shared'
import { PENDENCIAS_RODEIO_EXPORT_CONFIG } from '../../utils/exportConfigs'
import {
  ITENS_CHECKLIST_RODEIO,
  diasEntre,
  pendenciasPorLote,
  porItem,
  resumoPendencias,
} from '../../features/pendenciasRodeio/calculo'

interface RegistroParaPendencias {
  id: string
  data: string
  local_id?: string | null
  lote_id?: string | null
  lote?: string | null
  diagnosticos?: Record<string, any> | null
}

interface Props {
  registros: RegistroParaPendencias[]
  fazendaNome: string | null
}

const LABEL = 'block text-xs sm:text-sm font-medium text-content mb-1 leading-tight'
const SELECT =
  'w-full rounded-lg border border-border-base bg-surface-1 px-3 py-2 text-sm text-content-strong focus:outline-none focus:ring-2 focus:ring-primary/40'

const textoDias = (dias: number) => (dias === 0 ? 'hoje' : `${dias} ${dias === 1 ? 'dia' : 'dias'}`)

function Kpi({ titulo, valor, destaque }: { titulo: string; valor: string; destaque?: boolean }) {
  return (
    <Card className="bg-surface-1 p-4" disableHover>
      <p className="text-xs font-medium text-content-muted uppercase tracking-wider">{titulo}</p>
      <p className={`mt-1 text-2xl font-bold ${destaque ? 'text-amber-500' : 'text-content-strong'}`}>{valor}</p>
    </Card>
  )
}

/**
 * Pendências do checklist do Rodeio: condições persistentes (bebedouros/cochos, pastagem/lotação,
 * cercas/porteiras) marcadas como problema que ainda não foram resolvidas. Derivadas dos registros
 * (sem tabela própria): o PWA pergunta ao peão, no rodeio seguinte do lote, se cada item foi resolvido,
 * e a resposta fica no próprio registro (valor + marcador `pendencia`).
 */
export function RodeioPendencias({ registros, fazendaNome }: Props) {
  const navigate = useNavigate()
  const [itemFiltro, setItemFiltro] = useState('')
  const [loteFiltro, setLoteFiltro] = useState('')
  const [minDias, setMinDias] = useState(0)
  const agora = useMemo(() => new Date().toISOString(), [])

  const { abertas, resolvidas } = useMemo(
    () =>
      pendenciasPorLote(
        registros.map((r) => ({
          id: r.id,
          data: r.data,
          localId: r.local_id ?? null,
          diagnosticos: r.diagnosticos ?? null,
          loteId: r.lote_id ?? null,
          lote: r.lote ?? null,
        }))
      ),
    [registros]
  )

  const resumo = useMemo(() => resumoPendencias(abertas, resolvidas, agora), [abertas, resolvidas, agora])
  const linhasItem = useMemo(() => porItem(abertas, resolvidas), [abertas, resolvidas])
  const lotesComPendencia = useMemo(() => [...new Set(abertas.map((p) => p.lote))].sort((a, b) => a.localeCompare(b)), [abertas])

  const filtradas = useMemo(
    () =>
      abertas.filter(
        (p) =>
          (!itemFiltro || p.chave === itemFiltro) &&
          (!loteFiltro || p.lote === loteFiltro) &&
          diasEntre(p.desde, agora) >= minDias
      ),
    [abertas, itemFiltro, loteFiltro, minDias, agora]
  )

  const recentes = useMemo(() => resolvidas.filter((r) => diasEntre(r.resolvidaEm, agora) <= 30).slice(0, 15), [resolvidas, agora])

  const exportar = () =>
    exportToXLSX(
      filtradas.map((p) => ({
        lote: p.lote,
        item: p.label,
        desde: p.desde,
        dias_em_aberto: diasEntre(p.desde, agora),
        ocorrencias: p.ocorrencias,
        observacao: p.observacao,
        foto_url: p.fotoUrl ?? '',
      })),
      PENDENCIAS_RODEIO_EXPORT_CONFIG,
      fazendaNome
    )

  const abrirRegistro = (id: string | null) => {
    if (id) navigate(`/controller/cadernetas/rodeio/${id}`)
  }

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Kpi titulo="Pendências abertas" valor={String(resumo.abertas)} destaque={resumo.abertas > 0} />
        <Kpi titulo="Lotes afetados" valor={String(resumo.lotesAfetados)} />
        <Kpi titulo="Mais antiga" valor={resumo.maisAntigaDias === null ? '-' : textoDias(resumo.maisAntigaDias)} />
        <Kpi
          titulo="Tempo médio de resolução"
          valor={resumo.tempoMedioResolucaoDias === null ? '-' : `${resumo.tempoMedioResolucaoDias.toLocaleString('pt-BR')} dias`}
        />
      </div>

      <Card className="bg-surface-1 p-4 sm:p-6" disableHover>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
          <h3 className="text-base sm:text-lg font-semibold text-content-strong">Filtros</h3>
          <Button onClick={exportar} disabled={filtradas.length === 0} className="w-full sm:w-auto text-sm">
            Exportar XLSX
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <div>
            <label className={LABEL}>Item do checklist</label>
            <select className={SELECT} value={itemFiltro} onChange={(e) => setItemFiltro(e.target.value)}>
              <option value="">Todos</option>
              {ITENS_CHECKLIST_RODEIO.map((i) => (
                <option key={i.chave} value={i.chave}>
                  {i.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Lote</label>
            <select className={SELECT} value={loteFiltro} onChange={(e) => setLoteFiltro(e.target.value)}>
              <option value="">Todos</option>
              {lotesComPendencia.map((l) => (
                <option key={l} value={l}>
                  {l}
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
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {linhasItem.map((l) => (
            <span key={l.chave} className="rounded-full bg-surface-2 px-3 py-1 text-xs text-content-strong">
              {l.label}: {l.abertas} {l.abertas === 1 ? 'aberta' : 'abertas'} · {l.resolvidas} {l.resolvidas === 1 ? 'resolvida' : 'resolvidas'}
            </span>
          ))}
        </div>
      </Card>

      {abertas.length === 0 ? (
        <Card className="bg-surface-1 p-4 sm:p-6 text-center" disableHover>
          <p className="text-content-muted">Nenhuma pendência aberta nos lotes</p>
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
                <Th>Lote</Th>
                <Th>Item</Th>
                <Th>Desde</Th>
                <Th>Em aberto</Th>
                <Th>Registros</Th>
                <Th>Observação</Th>
                <Th>Foto</Th>
              </Tr>
            </Thead>
            <Tbody>
              {filtradas.map((p) => {
                const dias = diasEntre(p.desde, agora)
                return (
                  <Tr
                    key={`${p.lote}-${p.chave}`}
                    onClick={() => abrirRegistro(p.registroUltimoId)}
                    className="cursor-pointer hover:bg-surface-2 transition-colors"
                  >
                    <Td>{p.lote}</Td>
                    <Td>{p.label}</Td>
                    <Td>{formatDate(p.desde)}</Td>
                    <Td>
                      <span className={dias >= 7 ? 'font-semibold text-red-500' : dias >= 3 ? 'font-semibold text-amber-500' : ''}>{textoDias(dias)}</span>
                    </Td>
                    <Td>{p.ocorrencias}</Td>
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
                <Th>Lote</Th>
                <Th>Item</Th>
                <Th>Aberta em</Th>
                <Th>Resolvida em</Th>
                <Th>Tempo para resolver</Th>
              </Tr>
            </Thead>
            <Tbody>
              {recentes.map((r) => (
                <Tr
                  key={`${r.lote}-${r.chave}-${r.resolvidaEm}`}
                  onClick={() => abrirRegistro(r.registroResolvidaId)}
                  className="cursor-pointer hover:bg-surface-2 transition-colors"
                >
                  <Td>{r.lote}</Td>
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
