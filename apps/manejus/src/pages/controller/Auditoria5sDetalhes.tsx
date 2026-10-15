import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth, formatDate, getFazendaIdForUser } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Card, DetailLayout } from '@gestaup/ui'
import { SECOES_5S } from '../../features/relatorioAuditoria5s/itens'
import { resultadoRegistro, type RegistroAuditoria5s } from '../../features/relatorioAuditoria5s/agregacao'

interface RegistroRow extends RegistroAuditoria5s {
  fazenda_id: string
  created_at: string
}

const COR_OK = '#10B981'
const COR_ALERTA = '#F59E0B'
const COR_RUIM = '#EF4444'

const corPercentual = (p: number | null) => (p === null ? '#9CA3AF' : p >= 90 ? COR_OK : p >= 70 ? COR_ALERTA : COR_RUIM)
const corNota = (n: number | null | undefined) => (typeof n !== 'number' ? '#9CA3AF' : n >= 4 ? COR_OK : n >= 2 ? COR_ALERTA : COR_RUIM)
const textoPercentual = (p: number | null) => (p === null ? '-' : `${p.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`)

function Indicador({ titulo, valor, detalhe, cor }: { titulo: string; valor: string; detalhe?: string; cor?: string }) {
  return (
    <div className="rounded-xl border border-border-base bg-surface-2/50 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-content-muted">{titulo}</p>
      <p className="mt-0.5 text-2xl font-bold leading-tight text-content-strong" style={cor ? { color: cor } : undefined}>
        {valor}
      </p>
      {detalhe && <p className="text-xs text-content-muted">{detalhe}</p>}
    </div>
  )
}

function Meta({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-sm text-content-strong">
      <span className="text-content-muted">{rotulo}</span>
      <span className="font-semibold">{valor}</span>
    </span>
  )
}

export function Auditoria5sDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registro, setRegistro] = useState<RegistroRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [mostrarConformes, setMostrarConformes] = useState(false)

  useEffect(() => {
    const carregar = async () => {
      if (!id || !user) return
      setLoadError(null)
      const fazendaId = await getFazendaIdForUser(user.id)
      if (!fazendaId) {
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('registros_auditoria_5s')
        .select('*')
        .eq('id', id)
        .eq('fazenda_id', fazendaId)
        .is('deleted_at', null)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          setRegistro(null)
        } else {
          console.error('Erro ao buscar auditoria 5S:', error)
          setLoadError(error.message || 'Erro ao buscar registro')
        }
      } else {
        setRegistro(data as RegistroRow)
      }
      setLoading(false)
    }
    carregar()
  }, [id, user])

  const resultado = registro ? resultadoRegistro(registro) : null

  // Itens N de todos os pilares, com a evidência registrada (observação, foto, pendência)
  const naoConformes = registro
    ? SECOES_5S.flatMap((secao) =>
        secao.itens
          .filter((item) => registro.itens?.[item.chave] === 'N')
          .map((item) => ({ secao: secao.titulo, item, evidencia: registro.nao_conformidades?.[item.chave] as Record<string, any> | undefined }))
      )
    : []

  return (
    <DetailLayout
      loading={loading}
      loadError={loadError}
      notFound={!registro}
      onBack={() => navigate('/controller/checklists/auditoria-5s')}
      title="Detalhes da Auditoria 5S"
    >
      {() => (
        <div className="space-y-4 sm:space-y-6">
          <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm" disableHover>
            <div className="flex flex-wrap items-center gap-2">
              <Meta rotulo="Setor" valor={registro!.setor || '-'} />
              <Meta rotulo="Data" valor={formatDate(registro!.data)} />
              <Meta rotulo="Responsável" valor={registro!.responsavel || '-'} />
              {registro!.nome_usuario && <Meta rotulo="Registrado por" valor={registro!.nome_usuario} />}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Indicador titulo="Conformidade" valor={textoPercentual(resultado!.percentual)} cor={corPercentual(resultado!.percentual)} />
              <Indicador
                titulo="Nota do setor"
                valor={typeof registro!.nota_geral === 'number' ? `${registro!.nota_geral}/5` : '-'}
                detalhe={typeof registro!.nota_geral === 'number' ? undefined : 'Sem nota (auditoria antiga)'}
                cor={corNota(registro!.nota_geral)}
              />
              <Indicador titulo="Itens C / N" valor={`${resultado!.conformes} / ${resultado!.naoConformes}`} detalhe="conformes / não conformes" />
              <Indicador titulo="Não se aplica" valor={String(resultado!.naoAplicaveis)} detalhe="fora do percentual" />
            </div>
          </Card>

          <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm" disableHover>
            <h3 className="mb-3 text-base font-semibold text-content-strong">
              Não conformidades <span className="font-normal text-content-muted">({naoConformes.length})</span>
            </h3>
            {naoConformes.length === 0 ? (
              <p className="rounded-xl bg-green-500/10 px-4 py-3 text-sm font-medium text-green-700 dark:text-green-400">
                Nenhuma não conformidade nesta auditoria.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {naoConformes.map(({ secao, item, evidencia }) => (
                  <div key={item.chave} className="flex gap-3 rounded-xl border border-red-500/30 bg-red-500/5 p-3">
                    {evidencia?.foto_url && (
                      <a href={evidencia.foto_url} target="_blank" rel="noopener noreferrer" className="shrink-0" title="Abrir foto em tamanho real">
                        <img
                          src={evidencia.foto_url}
                          alt={`Foto: ${item.negativa}`}
                          className="h-24 w-24 rounded-lg border border-border-base object-cover sm:h-28 sm:w-28"
                        />
                      </a>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-red-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-red-700 dark:text-red-400">
                          {secao}
                        </span>
                        {evidencia?.pendencia && (
                          <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-400">
                            Pendente desde {formatDate(evidencia.pendencia.desde)}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm font-semibold leading-snug text-content-strong">{item.negativa}</p>
                      {evidencia?.observacao ? (
                        <p className="mt-1 text-sm text-content">“{evidencia.observacao}”</p>
                      ) : (
                        <p className="mt-1 text-xs italic text-content-muted">Sem observação registrada</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm" disableHover>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-content-strong">Resultado por pilar</h3>
              <button
                type="button"
                onClick={() => setMostrarConformes((v) => !v)}
                className="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-semibold text-content-strong transition-colors hover:bg-surface-2/70"
              >
                {mostrarConformes ? 'Ocultar itens' : 'Ver todos os itens'}
              </button>
            </div>

            <div className={`grid grid-cols-1 gap-3 ${mostrarConformes ? 'md:grid-cols-2 xl:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5'}`}>
              {SECOES_5S.map((secao, indice) => {
                const res = resultado!.secoes[indice]
                const obs = registro!.observacoes?.[secao.id]
                const itensVisiveis = secao.itens
                  .map((item, i) => ({ item, numero: i + 1, resposta: registro!.itens?.[item.chave] as string | undefined }))
                  .filter(() => mostrarConformes)
                return (
                  <div key={secao.id} className="flex flex-col rounded-xl border border-border-base p-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <h4 className="text-sm font-bold uppercase tracking-wide text-content-strong">{secao.titulo}</h4>
                      <span className="text-lg font-bold" style={{ color: corPercentual(res.percentual) }}>
                        {textoPercentual(res.percentual)}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`Conformidade de ${secao.titulo}: ${textoPercentual(res.percentual)}`}>
                      <div className="h-full rounded-full" style={{ width: `${res.percentual ?? 0}%`, backgroundColor: corPercentual(res.percentual) }} />
                    </div>
                    <p className="mt-1.5 text-xs text-content-muted">
                      {res.conformes} C ·{' '}
                      <span className={res.naoConformes > 0 ? 'font-semibold text-red-600 dark:text-red-400' : ''}>{res.naoConformes} N</span>
                      {res.naoAplicaveis > 0 ? ` · ${res.naoAplicaveis} –` : ''}
                      {res.naoConformes > 0 && !mostrarConformes ? ' (detalhe acima)' : ''}
                    </p>

                    {itensVisiveis.length > 0 ? (
                      <ul className="mt-3 space-y-1.5">
                        {itensVisiveis.map(({ item, numero, resposta }) => (
                          <li key={item.chave} className="flex items-start gap-2 text-sm">
                            <span
                              title={resposta === 'NA' ? 'Não se aplica' : undefined}
                              className={`mt-0.5 inline-flex h-5 w-6 shrink-0 items-center justify-center rounded text-[11px] font-bold ${
                                resposta === 'C'
                                  ? 'bg-green-500/15 text-green-700 dark:text-green-400'
                                  : resposta === 'N'
                                    ? 'bg-red-500/15 text-red-700 dark:text-red-400'
                                    : 'bg-surface-2 text-content-muted'
                              }`}
                            >
                              {resposta === 'NA' ? '–' : resposta || '?'}
                            </span>
                            <span className={resposta === 'N' ? 'font-medium text-content-strong' : 'text-content'}>
                              {numero}) {item.texto}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {obs && (
                      <p className="mt-3 border-t border-border-base pt-2 text-sm text-content-muted">
                        <span className="font-medium">Observações:</span> {obs}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      )}
    </DetailLayout>
  )
}
