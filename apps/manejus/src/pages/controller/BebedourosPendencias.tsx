import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Table, Thead, Tbody, Tr, Th, Td } from '@gestaup/ui'
import { exportToXLSX, formatDate } from '@gestaup/shared'
import { PENDENCIAS_BEBEDOUROS_EXPORT_CONFIG } from '../../utils/exportConfigs'
import {
  ITENS_CHECKLIST_BEBEDOURO,
  diasEntre,
  pendenciasPorBebedouro,
  porItem,
  resumoPendencias,
} from '../../features/pendenciasBebedouros/calculo'

interface RegistroParaPendencias {
  id: string
  data: string
  local_id?: string | null
  numero_bebedouro?: string | null
  checklist?: Record<string, any> | null
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
 * Pendências do checklist de Bebedouros: itens marcados como problema que ainda não foram resolvidos.
 * Derivadas dos registros (sem tabela própria): o PWA pergunta ao peão, na abertura seguinte do bebedouro,
 * se cada item foi resolvido, e a resposta fica no próprio registro (valor + marcador `pendencia`).
 */
export function BebedourosPendencias({ registros, fazendaNome }: Props) {
  const navigate = useNavigate()
  const [itemFiltro, setItemFiltro] = useState('')
  const [bebedouroFiltro, setBebedouroFiltro] = useState('')
  const [minDias, setMinDias] = useState(0)
  const agora = useMemo(() => new Date().toISOString(), [])

  const { abertas, resolvidas } = useMemo(
    () =>
      pendenciasPorBebedouro(
        registros.map((r) => ({ id: r.id, data: r.data, localId: r.local_id ?? null, checklist: r.checklist ?? null, numeroBebedouro: r.numero_bebedouro ?? null }))
      ),
    [registros]
  )

  const resumo = useMemo(() => resumoPendencias(abertas, resolvidas, agora), [abertas, resolvidas, agora])
  const linhasItem = useMemo(() => porItem(abertas, resolvidas), [abertas, resolvidas])
  const bebedourosComPendencia = useMemo(() => [...new Set(abertas.map((p) => p.bebedouro))].sort((a, b) => a.localeCompare(b)), [abertas])

  const filtradas = useMemo(
    () =>
      abertas.filter(
        (p) =>
          (!itemFiltro || p.chave === itemFiltro) &&
          (!bebedouroFiltro || p.bebedouro === bebedouroFiltro) &&
          diasEntre(p.desde, agora) >= minDias
      ),
    [abertas, itemFiltro, bebedouroFiltro, minDias, agora]
  )

  const recentes = useMemo(() => resolvidas.filter((r) => diasEntre(r.resolvidaEm, agora) <= 30).slice(0, 15), [resolvidas, agora])

  const exportar = () =>
    exportToXLSX(
      filtradas.map((p) => ({
        bebedouro: p.bebedouro,
        item: p.label,
        desde: p.desde,
        dias_em_aberto: diasEntre(p.desde, agora),
        ocorrencias: p.ocorrencias,
        observacao: p.observacao,
        foto_url: p.fotoUrl ?? '',
      })),
      PENDENCIAS_BEBEDOUROS_EXPORT_CONFIG,
      fazendaNome
    )

  const abrirRegistro = (id: string | null) => {
    if (id) navigate(`/controller/cadernetas/bebedouros/${id}`)
  }

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Kpi titulo="Pendências abertas" valor={String(resumo.abertas)} destaque={resumo.abertas > 0} />
        <Kpi titulo="Bebedouros afetados" valor={String(resumo.bebedourosAfetados)} />
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
              {ITENS_CHECKLIST_BEBEDOURO.map((i) => (
                <option key={i.chave} value={i.chave}>
                  {i.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Bebedouro</label>
            <select className={SELECT} value={bebedouroFiltro} onChange={(e) => setBebedouroFiltro(e.target.value)}>
              <option value="">Todos</option>
              {bebedourosComPendencia.map((b) => (
                <option key={b} value={b}>
                  {b}
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
          <p className="text-content-muted">Nenhuma pendência aberta nos bebedouros</p>
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
                <Th>Bebedouro</Th>
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
                    key={`${p.bebedouro}-${p.chave}`}
                    onClick={() => abrirRegistro(p.registroUltimoId)}
                    className="cursor-pointer hover:bg-surface-2 transition-colors"
                  >
                    <Td>{p.bebedouro}</Td>
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
                <Th>Bebedouro</Th>
                <Th>Item</Th>
                <Th>Aberta em</Th>
                <Th>Resolvida em</Th>
                <Th>Tempo para resolver</Th>
              </Tr>
            </Thead>
            <Tbody>
              {recentes.map((r) => (
                <Tr
                  key={`${r.bebedouro}-${r.chave}-${r.resolvidaEm}`}
                  onClick={() => abrirRegistro(r.registroResolvidaId)}
                  className="cursor-pointer hover:bg-surface-2 transition-colors"
                >
                  <Td>{r.bebedouro}</Td>
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
