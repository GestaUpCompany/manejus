import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@gestaup/shared'
import { supabase } from '@gestaup/supabase'
import { Card, DetailLayout, DetailSection, DetailField, formatValue, Table, Thead, Tbody, Tr, Th, Td } from '@gestaup/ui'
import { formatDate } from '@gestaup/shared'
import { getFazendaIdForUser } from '@gestaup/shared'

interface FabricaInsumoItem {
  id: string
  kg_previsto: number
  kg_produzido: number
  ordem: number
  insumo?: { nome: string } | null
}

function formatKg(value?: number | null) {
  if (value === null || value === undefined) return '-'
  return Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

interface Diff {
  kg: number
  pct: number | null
}

function calcDiff(previsto?: number | null, produzido?: number | null): Diff {
  const p = Number(previsto || 0)
  const kg = Number(produzido || 0) - p
  return { kg, pct: p > 0 ? (kg / p) * 100 : null }
}

function formatPct(value: number) {
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

function formatDiff(d: Diff, withUnit = true) {
  const sinal = d.kg > 0 ? '+' : ''
  return `${sinal}${formatKg(d.kg)}${withUnit ? ' kg' : ''}`
}

// Neutro dentro de ±2% do previsto; abaixo em âmbar; acima em vermelho.
function diffClass(d: Diff) {
  const ref = d.pct ?? (d.kg === 0 ? 0 : 100)
  if (Math.abs(ref) <= 2) return 'text-content-strong'
  return d.kg < 0 ? 'text-amber-700' : 'text-red-700'
}

interface GrupoInsumo {
  chave: string
  nome: string
  previsto: number
  produzido: number
  itens: FabricaInsumoItem[]
}

// Um insumo se repete quando o carregamento exige várias cargas de vagão (uma linha por pesagem).
// Agrupa por posição na formulação + nome, mantendo a ordem da primeira aparição.
function agruparInsumos(itens: FabricaInsumoItem[]): GrupoInsumo[] {
  const mapa = new Map<string, GrupoInsumo>()
  for (const item of itens) {
    const nome = item.insumo?.nome || '-'
    const chave = `${item.ordem}|${nome}`
    let g = mapa.get(chave)
    if (!g) {
      g = { chave, nome, previsto: 0, produzido: 0, itens: [] }
      mapa.set(chave, g)
    }
    g.previsto += Number(item.kg_previsto || 0)
    g.produzido += Number(item.kg_produzido || 0)
    g.itens.push(item)
  }
  return Array.from(mapa.values())
}

function KpiCard({
  label,
  value,
  hint,
  valueClassName = 'text-content-strong',
}: {
  label: string
  value: string
  hint?: string
  valueClassName?: string
}) {
  return (
    <div className="rounded-lg bg-surface-2 p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-content-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${valueClassName}`}>{value}</p>
      {hint && <p className="text-xs text-content-muted">{hint}</p>}
    </div>
  )
}

interface RegistroFabricaConfinamento {
  id: string
  fazenda_id: string
  data: string
  ordem_trato: number
  tipo: string
  total_previsto: number
  total_produzido: number
  concluido: boolean
  vagao?: { nome: string | null; marca: string; modelo: string; capacidade_kg: number | null } | null
  formulacao?: { nome: string } | null
  nome_usuario?: string | null
}

export function FabricaConfinamentoDetalhes() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [registro, setRegistro] = useState<RegistroFabricaConfinamento | null>(null)
  const [insumos, setInsumos] = useState<FabricaInsumoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [insumosErro, setInsumosErro] = useState<string | null>(null)
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())

  const alternarGrupo = (chave: string) =>
    setExpandidos((prev) => {
      const next = new Set(prev)
      if (next.has(chave)) next.delete(chave)
      else next.add(chave)
      return next
    })

  useEffect(() => {
    loadRegistro()
  }, [id, user])

  const loadRegistro = async () => {
    if (!id || !user) return

    setLoadError(null)
    const fazendaId = await getFazendaIdForUser(user.id)
    if (!fazendaId) {
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('registros_fabrica_confinamento')
      .select('*, vagao:vagoes(nome, marca, modelo, capacidade_kg), formulacao:formulacoes(nome)')
      .eq('id', id)
      .eq('fazenda_id', fazendaId)
      .is('deleted_at', null)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        setRegistro(null)
      } else {
        console.error('Erro ao buscar registro:', error)
        setLoadError(error.message || 'Erro ao buscar registro')
      }
      setLoading(false)
      return
    }

    setRegistro(data as RegistroFabricaConfinamento)

    const { data: insumosData, error: insumosError } = await supabase
      .from('registros_fabrica_confinamento_insumos')
      .select('*, insumo:insumos(nome)')
      .eq('registro_id', id)
      .order('ordem', { ascending: true })

    if (insumosError) {
      console.error('Erro ao buscar insumos do carregamento:', insumosError)
      setInsumosErro('Não foi possível carregar os insumos deste carregamento.')
    } else {
      setInsumos((insumosData as FabricaInsumoItem[]) || [])
    }

    setLoading(false)
  }

  const vagaoLabel = registro?.vagao
    ? (registro.vagao.nome || `${registro.vagao.marca} ${registro.vagao.modelo}`.trim())
    : null

  return (
    <DetailLayout
      loading={loading}
      loadError={loadError}
      notFound={!registro}
      onBack={() => navigate('/controller/cadernetas/fabrica-confinamento')}
      title="Detalhes do Carregamento de Vagão"
    >
      {() => {
        const r = registro!
        const total = calcDiff(r.total_previsto, r.total_produzido)
        const capacidade = r.vagao?.capacidade_kg
        const ocupacao = capacidade ? (Number(r.total_produzido) / capacidade) * 100 : null
        const somaPrevisto = insumos.reduce((s, i) => s + Number(i.kg_previsto || 0), 0)
        const somaProduzido = insumos.reduce((s, i) => s + Number(i.kg_produzido || 0), 0)
        const somaDiff = calcDiff(somaPrevisto, somaProduzido)
        const grupos = agruparInsumos(insumos)
        const cargasEstimadas = capacidade ? Math.ceil(Number(r.total_previsto) / capacidade) : null

        return (
          <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm" disableHover>
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-content-strong">
                    {formatDate(r.data)} · {r.ordem_trato}º trato
                  </p>
                  <p className="text-sm text-content-muted">
                    {formatValue(r.tipo)} · Registrado por {formatValue(r.nome_usuario)}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                    r.concluido
                      ? 'bg-green-100 text-green-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {r.concluido ? 'Concluído' : 'Em aberto'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <KpiCard label="Previsto" value={`${formatKg(r.total_previsto)} kg`} />
                <KpiCard label="Produzido" value={`${formatKg(r.total_produzido)} kg`} />
                <KpiCard
                  label="Diferença"
                  value={formatDiff(total)}
                  valueClassName={diffClass(total)}
                  hint={total.pct === null ? undefined : `${formatPct(total.pct)} do previsto`}
                />
              </div>

              <DetailSection title="Vagão e Formulação" highlighted>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <DetailField label="Vagão" value={formatValue(vagaoLabel)} />
                  <DetailField
                    label="Capacidade"
                    value={
                      capacidade
                        ? `${formatKg(capacidade)} kg${cargasEstimadas && cargasEstimadas > 1 ? ` · ≈ ${cargasEstimadas} cargas (estimativa)` : ocupacao !== null ? ` (${formatPct(ocupacao)} ocupado)` : ''}`
                        : '-'
                    }
                  />
                  <DetailField label="Formulação" value={formatValue(r.formulacao?.nome)} />
                </div>
              </DetailSection>

              <DetailSection title={`Insumos (${grupos.length})`}>
                {insumosErro && (
                  <p className="mb-2 text-sm text-amber-700">{insumosErro}</p>
                )}
                {insumos.length === 0 ? (
                  <p className="text-sm text-content-muted">Nenhum insumo registrado neste carregamento.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <Thead>
                        <Tr>
                          <Th>Insumo</Th>
                          <Th className="text-right">Previsto (kg)</Th>
                          <Th className="text-right">Produzido (kg)</Th>
                          <Th className="text-right">Diferença (kg)</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {grupos.flatMap((g) => {
                          const d = calcDiff(g.previsto, g.produzido)
                          const multi = g.itens.length > 1
                          const aberto = expandidos.has(g.chave)
                          const linhas = [
                            <Tr
                              key={g.chave}
                              className={multi ? 'cursor-pointer' : ''}
                              onClick={multi ? () => alternarGrupo(g.chave) : undefined}
                            >
                              <Td>
                                <span className="inline-flex items-center gap-2">
                                  {multi && (
                                    <span className="text-content-muted text-xs w-3" aria-hidden>
                                      {aberto ? '▾' : '▸'}
                                    </span>
                                  )}
                                  {g.nome}
                                  {multi && (
                                    <span className="text-xs text-content-muted">· {g.itens.length} pesagens</span>
                                  )}
                                </span>
                              </Td>
                              <Td className="text-right tabular-nums">{formatKg(g.previsto)}</Td>
                              <Td className="text-right tabular-nums">{formatKg(g.produzido)}</Td>
                              <Td className={`text-right tabular-nums ${diffClass(d)}`}>
                                {formatDiff(d, false)}
                                {d.pct !== null && (
                                  <span className="ml-1 text-xs text-content-muted">({formatPct(d.pct)})</span>
                                )}
                              </Td>
                            </Tr>,
                          ]
                          if (multi && aberto) {
                            g.itens.forEach((item, idx) => {
                              const di = calcDiff(item.kg_previsto, item.kg_produzido)
                              linhas.push(
                                <Tr key={item.id} className="bg-surface-2 text-content-muted">
                                  <Td className="pl-10 sm:pl-14 text-xs">Pesagem {idx + 1}</Td>
                                  <Td className="text-right tabular-nums text-xs">{formatKg(item.kg_previsto)}</Td>
                                  <Td className="text-right tabular-nums text-xs">{formatKg(item.kg_produzido)}</Td>
                                  <Td className="text-right tabular-nums text-xs">{formatDiff(di, false)}</Td>
                                </Tr>,
                              )
                            })
                          }
                          return linhas
                        })}
                        <Tr className="font-semibold border-t border-border">
                          <Td>Total</Td>
                          <Td className="text-right tabular-nums">{formatKg(somaPrevisto)}</Td>
                          <Td className="text-right tabular-nums">{formatKg(somaProduzido)}</Td>
                          <Td className={`text-right tabular-nums ${diffClass(somaDiff)}`}>{formatDiff(somaDiff, false)}</Td>
                        </Tr>
                      </Tbody>
                    </Table>
                  </div>
                )}
              </DetailSection>
            </div>
          </Card>
        )
      }}
    </DetailLayout>
  )
}
