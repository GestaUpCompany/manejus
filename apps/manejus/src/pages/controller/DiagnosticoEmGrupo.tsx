import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, getFazendaIdForUser, formatDate, toFarmDateOnly, useLotes } from '@gestaup/shared'
import { Button, Card, EmptyState, Input, PageSkeleton, Select, useToast } from '@gestaup/ui'
import { useDiagnosticoEmGrupo, useFemeasDoLote, useFemeasDoLoteProtocolo, type FemeaDoLote } from '../../hooks/useReproducao'
import { useLotesProtocoloIatf } from '../../hooks/useProtocolosIatf'
import { cadernetaVisivelNaFazenda } from '../../utils/cadernetas'
import {
  CLASSE_STATUS_REPRODUTIVO,
  validarDiagnosticoEmGrupo,
  type DadosComunsDiagnostico,
  type LinhaDiagnosticoGrupo,
  type ResultadoDiagnostico,
} from '../../utils/reproducao'

const campoTabela =
  'px-2 py-1 bg-surface-1 text-content-strong border border-surface-3 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500'

const rotuloFemea = (f: FemeaDoLote) => f.id_brinco || f.id_manejo || f.id_chip || 'Sem identificação'

interface EstadoLinha {
  resultado: '' | ResultadoDiagnostico
  idade: string
}

export function DiagnosticoEmGrupo() {
  const { user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [fazendaId, setFazendaId] = useState<string | undefined>(undefined)
  const [carregando, setCarregando] = useState(true)
  const { data: lotes = [] } = useLotes(fazendaId)
  const [origem, setOrigem] = useState<'fazenda' | 'protocolo'>('fazenda')
  const [loteId, setLoteId] = useState('')
  const [loteProtocoloId, setLoteProtocoloId] = useState('')
  // Diagnóstico por lote de protocolo: em teste, só aparece na fazenda de testes (nas outras fica só o lote da fazenda)
  const protocoloLiberado = !!fazendaId && cadernetaVisivelNaFazenda('protocolo-iatf', fazendaId)
  const lotesProtocolo = useLotesProtocoloIatf(protocoloLiberado ? fazendaId : undefined)
  const [somenteCobertas, setSomenteCobertas] = useState(true)
  const [comuns, setComuns] = useState<DadosComunsDiagnostico>({ data: '', metodo: '', observacao: '' })
  const [estado, setEstado] = useState<Record<string, EstadoLinha>>({})
  const [erros, setErros] = useState<{ gerais: string[]; porFemea: Record<string, string> }>({ gerais: [], porFemea: {} })

  const femeasFazenda = useFemeasDoLote(fazendaId, !(protocoloLiberado && origem === 'protocolo') ? loteId || undefined : undefined)
  const femeasProtocolo = useFemeasDoLoteProtocolo(fazendaId, protocoloLiberado && origem === 'protocolo' ? loteProtocoloId || undefined : undefined)
  const modoProtocolo = protocoloLiberado && origem === 'protocolo'
  const femeas = modoProtocolo ? femeasProtocolo : femeasFazenda
  const selecionado = modoProtocolo ? loteProtocoloId : loteId
  const gravar = useDiagnosticoEmGrupo(fazendaId)

  useEffect(() => {
    if (!user) return
    getFazendaIdForUser(user.id)
      .then((id) => setFazendaId(id ?? undefined))
      .finally(() => setCarregando(false))
  }, [user])

  const hoje = toFarmDateOnly(new Date().toISOString()) ?? new Date().toISOString().slice(0, 10)
  useEffect(() => {
    setComuns((c) => (c.data ? c : { ...c, data: hoje }))
  }, [hoje])

  const visiveis = useMemo(
    () => (femeas.data ?? []).filter((f) => !somenteCobertas || f.status_reprodutivo === 'Coberta'),
    [femeas.data, somenteCobertas]
  )

  const linhas: LinhaDiagnosticoGrupo[] = useMemo(
    () =>
      (femeas.data ?? []).map((f) => ({
        individuoId: f.individuo_id,
        resultado: estado[f.individuo_id]?.resultado ?? '',
        idadeGestacaoDias: estado[f.individuo_id]?.idade ?? '',
        coberturaId: f.ultima_cobertura_id,
        coberturaData: f.ultima_cobertura_data,
      })),
    [femeas.data, estado]
  )
  const marcadas = linhas.filter((l) => l.resultado !== '').length

  const marcar = (id: string, patch: Partial<EstadoLinha>) =>
    setEstado((e) => ({ ...e, [id]: { ...(e[id] ?? { resultado: '', idade: '' }), ...patch } }))

  const marcarTodas = (resultado: '' | ResultadoDiagnostico) =>
    setEstado((e) => {
      const novo = { ...e }
      for (const f of visiveis) novo[f.individuo_id] = { resultado, idade: resultado === 'Prenha' ? novo[f.individuo_id]?.idade ?? '' : '' }
      return novo
    })

  const confirmar = async () => {
    const v = validarDiagnosticoEmGrupo(linhas, comuns, hoje)
    setErros(v)
    if (v.gerais.length > 0 || Object.keys(v.porFemea).length > 0) return
    try {
      const n = await gravar.mutateAsync({ linhas, comuns, protocoloLoteId: modoProtocolo ? loteProtocoloId : null })
      toast.success(`${n} diagnóstico(s) registrado(s).`)
      setEstado({})
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  if (carregando) return <PageSkeleton variant="list" />

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-content-strong">Diagnóstico de gestação em grupo</h2>
          <p className="text-sm text-content-muted mt-1 max-w-2xl">
            Escolha o lote, marque o resultado de cada fêmea e grave tudo de uma vez. Fêmeas sem marcação ficam de fora. Se
            um diagnóstico for recusado, nenhum é gravado.
          </p>
        </div>
        <Button variant="secondary" onClick={() => navigate('/controller/estacoes-monta')}>
          ← Estações de Monta
        </Button>
      </div>

      <Card className="p-4 space-y-4" disableHover>
        <div className={`grid grid-cols-1 gap-4 ${protocoloLiberado ? 'sm:grid-cols-5' : 'sm:grid-cols-4'}`}>
          {protocoloLiberado && (
            <Select
              label="Fêmeas de"
              value={origem}
              onChange={(v) => {
                setOrigem(v as 'fazenda' | 'protocolo')
                setEstado({})
                setErros({ gerais: [], porFemea: {} })
              }}
              options={[
                { value: 'fazenda', label: 'Lote da fazenda' },
                { value: 'protocolo', label: 'Lote de protocolo de IATF' },
              ]}
            />
          )}
          {!modoProtocolo ? (
            <Select
              label="Lote"
              value={loteId}
              onChange={(v) => {
                setLoteId(v)
                setEstado({})
                setErros({ gerais: [], porFemea: {} })
              }}
              options={[{ value: '', label: 'Selecione...' }, ...lotes.map((l) => ({ value: l.id, label: l.nome }))]}
            />
          ) : (
            <Select
              label="Lote de protocolo"
              value={loteProtocoloId}
              onChange={(v) => {
                setLoteProtocoloId(v)
                setEstado({})
                setErros({ gerais: [], porFemea: {} })
              }}
              options={[
                { value: '', label: 'Selecione...' },
                ...(lotesProtocolo.data ?? [])
                  .filter((l) => l.status !== 'Cancelado')
                  .map((l) => ({ value: l.id, label: `${l.nome} (D0 ${formatDate(l.data_d0)})` })),
              ]}
            />
          )}
          <Input label="Data do diagnóstico" type="date" max={hoje} value={comuns.data} onChange={(e) => setComuns((c) => ({ ...c, data: e.target.value }))} />
          <Select
            label="Método (opcional)"
            value={comuns.metodo}
            onChange={(v) => setComuns((c) => ({ ...c, metodo: v as DadosComunsDiagnostico['metodo'] }))}
            options={[
              { value: '', label: 'Não informar' },
              { value: 'Palpação', label: 'Palpação' },
              { value: 'Ultrassom', label: 'Ultrassom' },
              { value: 'Outro', label: 'Outro' },
            ]}
          />
          <Input label="Observação (opcional)" value={comuns.observacao} onChange={(e) => setComuns((c) => ({ ...c, observacao: e.target.value }))} />
        </div>
      </Card>

      {!selecionado ? (
        <EmptyState
          title={!modoProtocolo ? 'Selecione um lote' : 'Selecione um lote de protocolo'}
          description={!modoProtocolo ? 'As fêmeas vivas do lote aparecem aqui com o status reprodutivo.' : 'As fêmeas ativas do protocolo aparecem aqui com o status reprodutivo. Os diagnósticos gravados ficam ligados ao lote de protocolo.'}
        />
      ) : femeas.isLoading ? (
        <PageSkeleton variant="list" />
      ) : (femeas.data?.length ?? 0) === 0 ? (
        <EmptyState title="Nenhuma fêmea identificada neste lote" description="Só aparecem fêmeas cadastradas como indivíduos." />
      ) : (
        <Card className="p-4 space-y-3" disableHover>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-content">
              <input type="checkbox" checked={somenteCobertas} onChange={(e) => setSomenteCobertas(e.target.checked)} />
              Mostrar só as cobertas ({(femeas.data ?? []).filter((f) => f.status_reprodutivo === 'Coberta').length} de {femeas.data!.length})
            </label>
            <span className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => marcarTodas('Prenha')}>
                Todas prenhas
              </Button>
              <Button size="sm" variant="secondary" onClick={() => marcarTodas('Vazia')}>
                Todas vazias
              </Button>
              <Button size="sm" variant="secondary" onClick={() => marcarTodas('')}>
                Limpar
              </Button>
            </span>
          </div>

          {visiveis.length === 0 ? (
            <p className="text-sm text-content-muted">Nenhuma fêmea coberta neste lote. Desmarque o filtro para ver todas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface-2 border-b border-border-base">
                  <tr>
                    {['Fêmea', 'Categoria', 'Status', 'Última cobertura', 'Resultado', 'Idade da gestação (dias)'].map((t) => (
                      <th key={t} className="px-3 py-2 text-left text-xs font-semibold text-content-muted uppercase">
                        {t}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-base">
                  {visiveis.map((f) => {
                    const e = estado[f.individuo_id]
                    return (
                      <tr key={f.individuo_id}>
                        <td className="px-3 py-2 text-sm font-medium text-content-strong">{rotuloFemea(f)}</td>
                        <td className="px-3 py-2 text-sm text-content">{f.categoria ?? '-'}</td>
                        <td className="px-3 py-2 text-sm">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${CLASSE_STATUS_REPRODUTIVO[f.status_reprodutivo]}`}>
                            {f.status_reprodutivo}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-sm text-content">
                          {f.ultima_cobertura_data ? `${formatDate(f.ultima_cobertura_data)} (${f.dias_desde_cobertura} d)` : '-'}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className={campoTabela}
                            aria-label={`Resultado de ${rotuloFemea(f)}`}
                            value={e?.resultado ?? ''}
                            onChange={(ev) => marcar(f.individuo_id, { resultado: ev.target.value as '' | ResultadoDiagnostico, idade: '' })}
                          >
                            <option value="">-</option>
                            <option value="Prenha">Prenha</option>
                            <option value="Vazia">Vazia</option>
                            <option value="Inconclusivo">Inconclusivo</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          {e?.resultado === 'Prenha' ? (
                            <>
                              <input
                                className={`${campoTabela} w-24`}
                                inputMode="numeric"
                                aria-label={`Idade da gestação de ${rotuloFemea(f)}`}
                                value={e.idade}
                                onChange={(ev) => marcar(f.individuo_id, { idade: ev.target.value })}
                              />
                              {erros.porFemea[f.individuo_id] && <p className="text-xs text-red-600 mt-1">{erros.porFemea[f.individuo_id]}</p>}
                            </>
                          ) : (
                            erros.porFemea[f.individuo_id] && <p className="text-xs text-red-600">{erros.porFemea[f.individuo_id]}</p>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {erros.gerais.length > 0 && (
            <ul className="text-sm text-red-600 list-disc pl-5">
              {erros.gerais.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            <span className="text-sm text-content-muted">{marcadas} fêmea(s) marcada(s)</span>
            <Button onClick={confirmar} disabled={gravar.isPending || marcadas === 0}>
              {gravar.isPending ? 'Gravando...' : `Gravar diagnósticos (${marcadas})`}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
