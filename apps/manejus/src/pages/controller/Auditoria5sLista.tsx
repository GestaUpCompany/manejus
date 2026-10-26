import { Link, useNavigate } from 'react-router-dom'
import { formatDate } from '@gestaup/shared'
import { Table, Thead, Tbody, Tr, Th, Td } from '@gestaup/ui'
import { resultadoRegistro } from '../../features/relatorioAuditoria5s/agregacao'
import { corPercentual, textoNota, textoPercentual } from '../../features/relatorioAuditoria5s/apresentacao'
import type { RegistroAuditoria5sRow } from '../../hooks/useAuditorias5s'
import { Icone } from './Auditoria5sIcone'

const rotaDetalhe = (id: string) => `/controller/checklists/auditoria-5s/${id}`

// Texto com contraste AA nos dois temas (as cores de apresentacao.ts, como #10B981, ficam só nas barras)
const TEXTO_OK = 'text-green-700 dark:text-green-400'
const TEXTO_ALERTA = 'text-amber-700 dark:text-amber-400'
const TEXTO_RUIM = 'text-red-700 dark:text-red-400'
const FUNDO_OK = 'bg-green-500/10'
const FUNDO_ALERTA = 'bg-amber-500/10'
const FUNDO_RUIM = 'bg-red-500/10'
const NEUTRO = 'bg-surface-2 text-content-muted'

const tomPercentual = (p: number | null) => (p === null ? 'neutro' : p >= 90 ? 'ok' : p >= 70 ? 'alerta' : 'ruim')
const tomNota = (n: number | null | undefined) => (typeof n !== 'number' ? 'neutro' : n >= 4 ? 'ok' : n >= 2 ? 'alerta' : 'ruim')
const CLASSE_TEXTO = { ok: TEXTO_OK, alerta: TEXTO_ALERTA, ruim: TEXTO_RUIM, neutro: 'text-content-muted' } as const
const CLASSE_PILULA = { ok: `${FUNDO_OK} ${TEXTO_OK}`, alerta: `${FUNDO_ALERTA} ${TEXTO_ALERTA}`, ruim: `${FUNDO_RUIM} ${TEXTO_RUIM}`, neutro: NEUTRO } as const

function Conformidade({ percentual }: { percentual: number | null }) {
  return (
    <div className="flex items-center gap-2.5">
      <span aria-hidden="true" className="h-2 w-20 flex-shrink-0 overflow-hidden rounded-full bg-surface-3">
        <span className="block h-full rounded-full" style={{ width: `${percentual ?? 0}%`, backgroundColor: corPercentual(percentual) }} />
      </span>
      <span className={`text-sm font-bold tabular-nums ${CLASSE_TEXTO[tomPercentual(percentual)]}`}>{textoPercentual(percentual)}</span>
    </div>
  )
}

function Nota({ nota }: { nota: number | null | undefined }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${CLASSE_PILULA[tomNota(nota)]}`}>{textoNota(nota)}</span>
}

/** "22 C · 2 N · 1 N/A" para olhar; a frase completa fica para leitores de tela. */
function Itens({ conformes, naoConformes, naoAplicaveis }: { conformes: number; naoConformes: number; naoAplicaveis: number }) {
  return (
    <>
      <span aria-hidden="true" className="inline-flex items-center gap-2 text-sm tabular-nums text-content">
        <span>{conformes} C</span>
        <span className={naoConformes > 0 ? `font-bold ${TEXTO_RUIM}` : ''}>{naoConformes} N</span>
        {naoAplicaveis > 0 && <span>{naoAplicaveis} N/A</span>}
      </span>
      <span className="sr-only">
        {conformes} conformes, {naoConformes} não conformes, {naoAplicaveis} não se aplicam
      </span>
    </>
  )
}

const FOCO_LINK = 'rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1'

/**
 * Lista de auditorias. Em telas largas (xl, já descontada a barra lateral) é uma tabela; abaixo disso, cartões.
 * A data é um link de verdade (abre o detalhe por teclado); o clique na linha inteira continua valendo para o mouse.
 */
export function Auditoria5sLista({ registros }: { registros: RegistroAuditoria5sRow[] }) {
  const navigate = useNavigate()
  return (
    <>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:hidden">
        {registros.map((r) => {
          const res = resultadoRegistro(r)
          return (
            <li key={r.id}>
              <Link
                to={rotaDetalhe(r.id)}
                className={`relative block rounded-2xl border-2 border-border-base bg-surface-1 p-4 shadow-sm transition-colors hover:bg-surface-2 ${FOCO_LINK}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-content-strong">{r.setor || '-'}</p>
                    <p className="text-sm text-content">
                      {formatDate(r.data)} · {r.responsavel || '-'}
                    </p>
                  </div>
                  <Nota nota={r.nota_geral} />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <Conformidade percentual={res.percentual} />
                  <Itens conformes={res.conformes} naoConformes={res.naoConformes} naoAplicaveis={res.naoAplicaveis} />
                </div>
              </Link>
            </li>
          )
        })}
      </ul>

      {/* relative: os textos sr-only (position:absolute) da tabela ficam contidos e recortados por este contêiner de rolagem */}
      <div className="relative hidden overflow-x-auto rounded-2xl border-2 border-border-base bg-surface-1 shadow-lg xl:block">
        <Table>
          <caption className="sr-only">Auditorias 5S, da mais recente para a mais antiga. Selecione a data para abrir o detalhe.</caption>
          <Thead>
            <Tr>
              <Th scope="col">Data</Th>
              <Th scope="col">Setor</Th>
              <Th scope="col">Responsável</Th>
              <Th scope="col">Conformidade</Th>
              <Th scope="col">Nota</Th>
              <Th scope="col">Itens</Th>
              <Th scope="col">
                <span className="sr-only">Abrir</span>
              </Th>
            </Tr>
          </Thead>
          <Tbody>
            {registros.map((r) => {
              const res = resultadoRegistro(r)
              return (
                <Tr key={r.id} onClick={() => navigate(rotaDetalhe(r.id))} className="cursor-pointer">
                  <Td>
                    <Link to={rotaDetalhe(r.id)} onClick={(e) => e.stopPropagation()} className={`font-semibold text-primary hover:underline dark:text-green-400 ${FOCO_LINK}`}>
                      {formatDate(r.data)}
                    </Link>
                  </Td>
                  <Td>{r.setor || '-'}</Td>
                  <Td>{r.responsavel || '-'}</Td>
                  <Td>
                    <Conformidade percentual={res.percentual} />
                  </Td>
                  <Td>
                    <Nota nota={r.nota_geral} />
                  </Td>
                  <Td>
                    <Itens conformes={res.conformes} naoConformes={res.naoConformes} naoAplicaveis={res.naoAplicaveis} />
                  </Td>
                  <Td className="text-content-muted">
                    <Icone nome="seta" className="h-4 w-4" />
                  </Td>
                </Tr>
              )
            })}
          </Tbody>
        </Table>
      </div>
    </>
  )
}
