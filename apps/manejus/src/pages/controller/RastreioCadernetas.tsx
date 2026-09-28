import { useEffect, useState, useMemo, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { Card, CardSkeleton } from '../../components/ui'
import { getFazendaIdForUser } from '../../utils/fazendaContext'
import {
  getRastreioUsuarios,
  getRastreioCadernetas,
  getRastreioCadernetasDetalhe,
  cadernetaLabel,
  CADERNETA_LABELS,
  type RastreioUsuario,
  type RastreioCaderneta,
  type RastreioDetalhe,
} from '../../services/rastreioService'

type PeriodoPreset = '7d' | '30d' | '90d' | 'tudo'

const PERIODO_LABELS: Record<PeriodoPreset, string> = {
  '7d': '7 dias',
  '30d': '30 dias',
  '90d': '90 dias',
  tudo: 'Tudo',
}

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function getPeriodoDias(preset: PeriodoPreset): number | null {
  if (preset === 'tudo') return null
  return preset === '7d' ? 7 : preset === '30d' ? 30 : 90
}

function getDataInicio(preset: PeriodoPreset): string | undefined {
  const dias = getPeriodoDias(preset)
  if (dias === null) return undefined
  const d = new Date()
  d.setDate(d.getDate() - dias)
  return d.toISOString().split('T')[0]
}

function getDataInicioAnterior(preset: PeriodoPreset): string | undefined {
  const dias = getPeriodoDias(preset)
  if (dias === null) return undefined
  const d = new Date()
  d.setDate(d.getDate() - dias * 2)
  return d.toISOString().split('T')[0]
}

function getDataFimAnterior(preset: PeriodoPreset): string | undefined {
  const dias = getPeriodoDias(preset)
  if (dias === null) return undefined
  const d = new Date()
  d.setDate(d.getDate() - dias - 1)
  return d.toISOString().split('T')[0]
}

function formatData(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function formatDataHora(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function diasDesde(iso: string | null): number | null {
  if (!iso) return null
  const d = new Date(iso)
  const agora = new Date()
  return Math.floor((agora.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
}

export function RastreioCadernetas() {
  const { user } = useAuth()
  const [fazendaId, setFazendaId] = useState<string | null>(null)
  const [periodo, setPeriodo] = useState<PeriodoPreset>('30d')
  const [usuarios, setUsuarios] = useState<RastreioUsuario[]>([])
  const [cadernetas, setCadernetas] = useState<RastreioCaderneta[]>([])
  const [detalhe, setDetalhe] = useState<RastreioDetalhe[]>([])
  const [allTimeUsuarios, setAllTimeUsuarios] = useState<RastreioUsuario[]>([])
  const [allDailyDetalhe, setAllDailyDetalhe] = useState<RastreioDetalhe[]>([])
  const [prevPeriodUsuarios, setPrevPeriodUsuarios] = useState<RastreioUsuario[]>([])
  const [loading, setLoading] = useState(true)
  const [usuarioSelecionado, setUsuarioSelecionado] = useState<string | null>(null)
  const [cadernetaSelecionada, setCadernetaSelecionada] = useState<string | null>(null)
  const [sortColumn, setSortColumn] = useState<'nome_usuario' | 'caderneta' | 'total_registros' | 'dias_ativos' | 'ultimo_registro'>('total_registros')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const loadFazenda = useCallback(async () => {
    if (!user) return
    const id = await getFazendaIdForUser(user.id)
    if (id) setFazendaId(id)
  }, [user])

  useEffect(() => { loadFazenda() }, [loadFazenda])

  const dataInicio = useMemo(() => getDataInicio(periodo), [periodo])
  const dataInicioAnterior = useMemo(() => getDataInicioAnterior(periodo), [periodo])
  const dataFimAnterior = useMemo(() => getDataFimAnterior(periodo), [periodo])

  // Carga principal: usuarios, cadernetas e detalhe diario do periodo atual
  // Sempre recarrega tudo (sem filtro de usuario) para a lista lateral
  useEffect(() => {
    if (!fazendaId) return
    setLoading(true)
    Promise.all([
      getRastreioUsuarios(fazendaId, dataInicio),
      getRastreioCadernetas(fazendaId, dataInicio),
      getRastreioCadernetasDetalhe(fazendaId, undefined, dataInicio),
    ]).then(([u, c, d]) => {
      setUsuarios(u)
      setCadernetas(c)
      setAllDailyDetalhe(d)
      setLoading(false)
    })
  }, [fazendaId, dataInicio])

  // Cross-filter: quando um usuario e selecionado, filtra cadernetas do estado existente
  // e recarrega apenas o detalhe diario (que e por usuario)
  const [filteredCadernetas, setFilteredCadernetas] = useState<RastreioCaderneta[]>([])
  const [filteredDailyDetalhe, setFilteredDailyDetalhe] = useState<RastreioDetalhe[]>([])

  useEffect(() => {
    if (!fazendaId) return
    if (usuarioSelecionado) {
      setFilteredCadernetas(cadernetas.filter((row) => row.nome_usuario === usuarioSelecionado))
      getRastreioCadernetasDetalhe(fazendaId, usuarioSelecionado, dataInicio).then(setFilteredDailyDetalhe)
    } else {
      setFilteredCadernetas(cadernetas)
      setFilteredDailyDetalhe(allDailyDetalhe)
    }
  }, [fazendaId, usuarioSelecionado, dataInicio, cadernetas, allDailyDetalhe])

  // Carga auxiliar: usuarios all-time (para usuarios parados) - independente do periodo
  useEffect(() => {
    if (!fazendaId) return
    getRastreioUsuarios(fazendaId).then(setAllTimeUsuarios)
  }, [fazendaId])

  // Carga auxiliar: periodo anterior (para tendencia) - depende do periodo
  useEffect(() => {
    if (!fazendaId) return
    if (dataInicioAnterior) {
      getRastreioUsuarios(fazendaId, dataInicioAnterior, dataFimAnterior).then(setPrevPeriodUsuarios)
    } else {
      setPrevPeriodUsuarios([])
    }
  }, [fazendaId, dataInicioAnterior, dataFimAnterior])

  // Detalhe do usuario selecionado
  useEffect(() => {
    if (!fazendaId || !usuarioSelecionado) {
      setDetalhe([])
      return
    }
    getRastreioCadernetasDetalhe(fazendaId, usuarioSelecionado, dataInicio).then(setDetalhe)
  }, [fazendaId, usuarioSelecionado, dataInicio])

  // === Metricas derivadas (usam dados filtrados quando usuario selecionado) ===

  // Dados efetivos: filtrados quando usuario selecionado, globais caso contrario
  const effectiveCadernetas = useMemo(() => {
    let base = usuarioSelecionado ? filteredCadernetas : cadernetas
    if (cadernetaSelecionada) {
      base = base.filter((c) => c.caderneta === cadernetaSelecionada)
    }
    return base
  }, [usuarioSelecionado, filteredCadernetas, cadernetas, cadernetaSelecionada])

  const effectiveDailyDetalhe = usuarioSelecionado ? filteredDailyDetalhe : allDailyDetalhe

  const totalRegistros = useMemo(() => {
    if (cadernetaSelecionada) {
      return effectiveCadernetas.reduce((s, c) => s + c.total_registros, 0)
    }
    if (usuarioSelecionado) {
      const u = usuarios.find((x) => x.nome_usuario === usuarioSelecionado)
      return u?.total_registros || 0
    }
    return usuarios.reduce((s, u) => s + u.total_registros, 0)
  }, [usuarios, usuarioSelecionado, cadernetaSelecionada, effectiveCadernetas])

  // Total global do período (sem filtro de usuário), para cálculo de participação
  const totalRegistrosPeriodo = useMemo(
    () => usuarios.reduce((s, u) => s + u.total_registros, 0),
    [usuarios]
  )

  // Percentual dos registros do usuário filtrado em relação ao total do período
  const participacaoUsuarioPct = useMemo(() => {
    if (!usuarioSelecionado || totalRegistrosPeriodo === 0) return null
    return (totalRegistros / totalRegistrosPeriodo) * 100
  }, [usuarioSelecionado, totalRegistros, totalRegistrosPeriodo])

  const cadernetasUsadasSet = useMemo(() => new Set(effectiveCadernetas.map((c) => c.caderneta)), [effectiveCadernetas])
  const totalCadernetasUsadas = cadernetasUsadasSet.size

  // 1. Cadernetas nunca usadas no periodo
  const cadernetasNuncaUsadas = useMemo(() => {
    return Object.keys(CADERNETA_LABELS).filter((k) => !cadernetasUsadasSet.has(k))
  }, [cadernetasUsadasSet])

  // 2. Cobertura por caderneta (ranking de todas as 20 por volume)
  const coberturaPorCaderneta = useMemo(() => {
    const porCaderneta: Record<string, number> = {}
    effectiveCadernetas.forEach((c) => { porCaderneta[c.caderneta] = (porCaderneta[c.caderneta] || 0) + c.total_registros })
    return Object.entries(CADERNETA_LABELS)
      .map(([key, label]) => ({ key, label, total: porCaderneta[key] || 0 }))
      .sort((a, b) => b.total - a.total)
  }, [effectiveCadernetas])

  const maxCadernetaTotal = useMemo(() => Math.max(1, ...coberturaPorCaderneta.map((c) => c.total)), [coberturaPorCaderneta])

  const cadernetaMaisUsada = coberturaPorCaderneta[0] || null

  // 3. Regularidade (media de registros por dia ativo)
  const regularidadeUsuarios = useMemo(() => {
    return usuarios.map((u) => ({
      ...u,
      regularidade: u.dias_ativos > 0 ? u.total_registros / u.dias_ativos : 0,
    }))
  }, [usuarios])

  // 4. Usuários parados (tem historico mas nada no periodo atual) - global, nao filtra por usuario
  const usuariosParados = useMemo(() => {
    if (usuarioSelecionado) return []
    const nomesAtuais = new Set(usuarios.map((u) => u.nome_usuario))
    return allTimeUsuarios
      .filter((u) => !nomesAtuais.has(u.nome_usuario))
      .sort((a, b) => (diasDesde(b.ultimo_registro) ?? 0) - (diasDesde(a.ultimo_registro) ?? 0))
  }, [allTimeUsuarios, usuarios, usuarioSelecionado])

  // 5. Distribuição por dia da semana (média por ocorrência do dia)
  const distribuicaoSemana = useMemo(() => {
    const sums = [0, 0, 0, 0, 0, 0, 0]
    const occ = [0, 0, 0, 0, 0, 0, 0]
    effectiveDailyDetalhe.forEach((d) => {
      const diaSemana = new Date(d.dia + 'T12:00:00').getDay()
      sums[diaSemana] += d.total
      occ[diaSemana] += 1
    })
    return sums.map((s, i) => occ[i] > 0 ? s / occ[i] : 0)
  }, [effectiveDailyDetalhe])

  const maxDiaSemana = useMemo(() => Math.max(1, ...distribuicaoSemana), [distribuicaoSemana])

  // 6. Tendência semanal (periodo atual vs anterior)
  const totalPeriodoAnterior = useMemo(() => {
    if (usuarioSelecionado) {
      const u = prevPeriodUsuarios.find((x) => x.nome_usuario === usuarioSelecionado)
      return u?.total_registros || 0
    }
    return prevPeriodUsuarios.reduce((s, u) => s + u.total_registros, 0)
  }, [prevPeriodUsuarios, usuarioSelecionado])
  const tendenciaDelta = useMemo(() => {
    if (totalPeriodoAnterior === 0) return null
    return ((totalRegistros - totalPeriodoAnterior) / totalPeriodoAnterior) * 100
  }, [totalRegistros, totalPeriodoAnterior])

  // Estado estruturado da tendência para distinguir os casos:
  // 'ok' = comparação válida, 'sem_anterior' = período anterior sem registros
  const tendenciaStatus: 'ok' | 'sem_anterior' = useMemo(() => {
    if (prevPeriodUsuarios.length === 0) return 'sem_anterior'
    if (totalPeriodoAnterior === 0) return 'sem_anterior'
    return 'ok'
  }, [periodo, prevPeriodUsuarios.length, totalPeriodoAnterior])

  // Cadernetas do usuario selecionado
  const cadernetasDoUsuario = useMemo(() => {
    if (!usuarioSelecionado) return []
    return [...effectiveCadernetas].sort((a, b) => b.total_registros - a.total_registros)
  }, [effectiveCadernetas, usuarioSelecionado])

  // Detalhe agregado por dia do usuario selecionado
  const detalhePorDia = useMemo(() => {
    const map: Record<string, number> = {}
    detalhe.forEach((d) => {
      const key = d.dia
      map[key] = (map[key] || 0) + d.total
    })
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).map(([dia, total]) => ({ dia, total }))
  }, [detalhe])

  const maxDiaTotal = useMemo(() => Math.max(1, ...detalhePorDia.map((d) => d.total)), [detalhePorDia])

  // Tabela "Registros por caderneta" ordenável
  const sortedCadernetas = useMemo(() => {
    const sorted = [...effectiveCadernetas]
    sorted.sort((a, b) => {
      let cmp = 0
      switch (sortColumn) {
        case 'nome_usuario': cmp = a.nome_usuario.localeCompare(b.nome_usuario); break
        case 'caderneta': cmp = cadernetaLabel(a.caderneta).localeCompare(cadernetaLabel(b.caderneta)); break
        case 'total_registros': cmp = a.total_registros - b.total_registros; break
        case 'dias_ativos': cmp = a.dias_ativos - b.dias_ativos; break
        case 'ultimo_registro': cmp = (a.ultimo_registro || '').localeCompare(b.ultimo_registro || ''); break
      }
      return sortDirection === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [effectiveCadernetas, sortColumn, sortDirection])

  const toggleSort = (col: typeof sortColumn) => {
    if (sortColumn === col) {
      setSortDirection((d) => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(col)
      setSortDirection('desc')
    }
  }

  const sortIndicator = (col: typeof sortColumn) => {
    if (sortColumn !== col) return ''
    return sortDirection === 'asc' ? ' ↑' : ' ↓'
  }

  if (!fazendaId && !loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-content-strong">Uso das Cadernetas</h1>
        <Card className="p-8 text-center text-content-muted">Nenhuma fazenda associada ao seu usuário.</Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-content-strong">Uso das Cadernetas</h1>
        <div className="flex gap-2">
          {(Object.keys(PERIODO_LABELS) as PeriodoPreset[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              aria-pressed={periodo === p}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                periodo === p
                  ? 'bg-primary text-white'
                  : 'bg-surface-2 text-content-muted hover:bg-surface-3'
              }`}
            >
              {PERIODO_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Banner de cross-filter ativo */}
      {usuarioSelecionado && !loading && (
        <div className="flex items-center justify-between bg-primary/10 border border-primary/20 rounded-lg px-4 py-2">
          <span className="text-sm text-primary dark:text-primary-light font-medium">
            Filtrando por: <strong>{usuarioSelecionado}</strong>, todas as métricas abaixo refletem apenas este usuário
          </span>
          <button
            onClick={() => setUsuarioSelecionado(null)}
            className="text-xs text-primary dark:text-primary-light hover:text-primary/80 font-medium"
          >
            ✕ limpar filtro
          </button>
        </div>
      )}

      {/* Banner de filtro por caderneta */}
      {cadernetaSelecionada && !loading && (
        <div className="flex items-center justify-between bg-primary/10 border border-primary/30 rounded-lg px-4 py-2">
          <span className="text-sm text-primary dark:text-primary-light font-medium">
            Filtrando por caderneta: <strong>{cadernetaLabel(cadernetaSelecionada)}</strong>
          </span>
          <button
            onClick={() => setCadernetaSelecionada(null)}
            className="text-xs text-primary dark:text-primary-light hover:text-primary/80 font-medium"
          >
            ✕ limpar filtro
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <CardSkeleton key={i} />)}
        </div>
      ) : (
        <>
          {/* Cards de resumo */}
          <div>
            <p className="text-xs text-content-faint mb-2">
              {periodo === 'tudo' ? 'Todo o histórico' : `Últimos ${PERIODO_LABELS[periodo]}`}
              {usuarioSelecionado ? ` · filtrado por ${usuarioSelecionado}` : ''}
              {cadernetaSelecionada ? ` · caderneta ${cadernetaLabel(cadernetaSelecionada)}` : ''}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-surface-1 p-4 border-0 shadow-sm">
              <p className="text-sm text-content-muted mb-1">{periodo === 'tudo' ? 'Usuários com histórico' : 'Usuários ativos no período'}</p>
              <p className="text-2xl font-bold text-content-strong">{usuarioSelecionado ? 1 : usuarios.length}</p>
            </Card>
            <Card className="bg-surface-1 p-4 border-0 shadow-sm">
              <p className="text-sm text-content-muted mb-1">Total de registros</p>
              <p className="text-2xl font-bold text-content-strong">{totalRegistros}</p>
              {tendenciaDelta !== null && periodo !== 'tudo' && (
                <p className={`text-xs mt-1 ${tendenciaDelta >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {tendenciaDelta >= 0 ? '↑' : '↓'} {Math.abs(tendenciaDelta).toFixed(0)}% vs período anterior
                </p>
              )}
            </Card>
            <Card className="bg-surface-1 p-4 border-0 shadow-sm">
              <p className="text-sm text-content-muted mb-1">Cadernetas usadas</p>
              <p className="text-2xl font-bold text-content-strong">{totalCadernetasUsadas}</p>
              <p className="text-xs text-content-faint mt-1">{cadernetasNuncaUsadas.length} parada{cadernetasNuncaUsadas.length !== 1 ? 's' : ''} de 20</p>
            </Card>
            <Card className="bg-surface-1 p-4 border-0 shadow-sm">
              <p className="text-sm text-content-muted mb-1">Usuários parados</p>
              <p className="text-2xl font-bold text-content-strong">{usuariosParados.length}</p>
              <p className="text-xs text-content-faint mt-1">registraram antes, mas não neste período</p>
            </Card>
            </div>
          </div>

          {/* Visão geral: distribuição semanal + tendência */}
          <div className={`grid grid-cols-1 gap-6 ${periodo === 'tudo' ? '' : 'lg:grid-cols-2'}`}>
            {/* Distribuicao por dia da semana */}
            <div>
              <h2 className="text-sm font-bold text-content-muted uppercase tracking-wide mb-3">
                Distribuição por dia da semana
              </h2>
              <Card className="bg-surface-1 p-4 border-0 shadow-sm">
                <p className="text-xs text-content-faint mb-2">Média de registros por ocorrência do dia</p>
                <div
                  className="flex justify-between gap-3 h-40 px-2"
                  role="img"
                  aria-label={`Média de registros por dia da semana: ${DIAS_SEMANA.map((d, i) => `${d} ${distribuicaoSemana[i].toFixed(1).replace('.', ',')}`).join(', ')}`}
                >
                  {distribuicaoSemana.map((total, idx) => {
                    const altura = Math.max(4, (total / maxDiaSemana) * 100)
                    const display = total > 0 ? total.toFixed(1).replace('.', ',') : '0'
                    return (
                      <div
                        key={idx}
                        className="flex flex-col items-center gap-1.5 flex-1"
                        title={`${DIAS_SEMANA[idx]}: média de ${display} registros`}
                      >
                        <span className="text-xs font-semibold text-content">{display}</span>
                        <div className="w-full flex-1 flex items-end">
                          <div
                            className="w-full bg-primary rounded-t-md transition-all hover:bg-primary/80"
                            style={{ height: `${altura}%` }}
                          />
                        </div>
                        <span className="text-xs text-content-faint">{DIAS_SEMANA[idx]}</span>
                      </div>
                    )
                  })}
                </div>
              </Card>
            </div>

            {/* Tendência semanal - oculta no modo "tudo" */}
            {periodo !== 'tudo' && (
            <div>
              <h2 className="text-sm font-bold text-content-muted uppercase tracking-wide mb-3">
                Tendência vs período anterior
              </h2>
              {tendenciaStatus === 'ok' ? (
                <Card className="bg-surface-1 p-4 border-0 shadow-sm h-40 flex items-center">
                  <div className="grid grid-cols-3 gap-4 w-full">
                    <div>
                      <p className="text-xs text-content-faint mb-1">{PERIODO_LABELS[periodo]} anteriores</p>
                      <p className="text-xl font-bold text-content">{totalPeriodoAnterior} <span className="text-xs font-normal text-content-faint">registros</span></p>
                      <p className="text-xs text-content-faint">{usuarioSelecionado ? '1 usuário' : `${prevPeriodUsuarios.length} usuário${prevPeriodUsuarios.length !== 1 ? 's' : ''}`}</p>
                    </div>
                    <div>
                      <p className="text-xs text-content-faint mb-1">Últimos {PERIODO_LABELS[periodo]}</p>
                      <p className="text-xl font-bold text-content">{totalRegistros} <span className="text-xs font-normal text-content-faint">registros</span></p>
                      <p className="text-xs text-content-faint">{usuarioSelecionado ? '1 usuário' : `${usuarios.length} usuário${usuarios.length !== 1 ? 's' : ''}`}</p>
                    </div>
                    <div>
                      <p className="text-xs text-content-faint mb-1">Variação</p>
                      <p className={`text-xl font-bold ${tendenciaDelta !== null && tendenciaDelta >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {tendenciaDelta !== null ? `${tendenciaDelta >= 0 ? '+' : ''}${tendenciaDelta.toFixed(1)}%` : '-'}
                      </p>
                      <p className="text-xs text-content-faint">
                        {tendenciaDelta !== null && tendenciaDelta >= 0 ? 'crescendo' : 'caindo'}
                      </p>
                    </div>
                  </div>
                </Card>
              ) : (
                <Card className="bg-surface-1 p-4 border-0 shadow-sm h-40 flex items-center justify-center">
                  <p className="text-sm text-content-faint text-center">
                    {allTimeUsuarios.length === 0
                      ? 'Fazenda sem histórico suficiente para comparar'
                      : 'Nenhum registro no período anterior'}
                  </p>
                </Card>
              )}
            </div>
            )}
          </div>

          {/* Lista de usuarios + detalhe */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <h2 className="text-sm font-bold text-content-muted uppercase tracking-wide mb-1">Usuários</h2>
              <p className="text-xs text-content-faint mb-3">lista global, independente de filtros</p>

              {/* Card de participação do usuário filtrado no total do período */}
              {usuarioSelecionado && !loading && participacaoUsuarioPct !== null && (
                <Card className="bg-surface-1 p-4 border-0 shadow-sm mb-3">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <p className="text-sm text-content-muted mb-1">Participação no período</p>
                      <p className="text-sm text-content">
                        <strong className="text-content-strong">{usuarioSelecionado}</strong> representa
                        {' '}<strong className="text-primary dark:text-primary-light text-lg">{participacaoUsuarioPct.toFixed(1).replace('.', ',')}%</strong>
                        {' '}dos registros do período
                      </p>
                      <p className="text-xs text-content-faint mt-1">
                        {totalRegistros} de {totalRegistrosPeriodo} registros
                        {usuarios.length > 1 ? ` · ${usuarios.length} usuários ativos no período` : ''}
                      </p>
                    </div>
                    <div className="flex-1 min-w-[120px] max-w-[180px]">
                      <div className="w-full h-2 bg-surface-2 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${Math.min(100, participacaoUsuarioPct)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </Card>
              )}
              <div className="space-y-2">
                {regularidadeUsuarios.length === 0 ? (
                  <Card className="p-6 text-center text-content-faint text-sm">Nenhum registro no período</Card>
                ) : (
                  regularidadeUsuarios.map((u) => {
                    const dias = diasDesde(u.ultimo_registro)
                    const ativo = dias !== null && dias <= 7
                    const isSelected = usuarioSelecionado === u.nome_usuario
                    return (
                      <button
                        key={u.nome_usuario}
                        onClick={() => setUsuarioSelecionado(isSelected ? null : u.nome_usuario)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${
                          isSelected
                            ? 'border-primary bg-primary/5'
                            : 'border-border-base hover:border-surface-3 bg-surface-1'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${ativo ? 'bg-green-500' : 'bg-surface-3'}`} aria-hidden="true" />
                            <span className="sr-only">{ativo ? 'ativo' : 'inativo'}</span>
                            <span className="font-semibold text-content-strong text-sm">{u.nome_usuario}</span>
                          </div>
                          <span className="text-xs text-content-faint">{u.total_registros}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-content-faint">
                          <span>{u.cadernetas_usadas} caderneta{u.cadernetas_usadas !== 1 ? 's' : ''}</span>
                          <span>{u.dias_ativos} dia{u.dias_ativos !== 1 ? 's' : ''}</span>
                          <span>{u.regularidade.toFixed(1)}/dia</span>
                          <span>últ. {formatData(u.ultimo_registro)}</span>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
            </div>

            {/* Detalhe do usuario selecionado */}
            <div className="lg:col-span-2">
              {!usuarioSelecionado ? (
                <>
                  <h2 className="text-sm font-bold text-content-muted uppercase tracking-wide mb-3">
                    Caderneta mais usada no período
                  </h2>
                  {cadernetaMaisUsada && cadernetaMaisUsada.total > 0 ? (
                    <Card className="bg-surface-1 p-4 border-0 shadow-sm mb-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-content-strong">{cadernetaLabel(cadernetaMaisUsada.key)}</p>
                          <p className="text-xs text-content-faint">no período selecionado</p>
                        </div>
                        <div className="text-right">
                          <div className="text-3xl font-bold text-primary dark:text-primary-light">{cadernetaMaisUsada.total}</div>
                          <div className="text-xs text-content-faint">registros</div>
                        </div>
                      </div>
                    </Card>
                  ) : null}

                  <h2 className="text-sm font-bold text-content-muted uppercase tracking-wide mb-3">
                    Registros por caderneta
                  </h2>
                  {effectiveCadernetas.length === 0 ? (
                    <Card className="p-6 text-center text-content-faint text-sm">Nenhum registro no período</Card>
                  ) : (
                    <div className="overflow-x-auto bg-surface-1 rounded-lg shadow-sm">
                      <table className="w-full text-sm">
                        <thead className="bg-surface-2 text-content-muted text-xs uppercase">
                          <tr>
                            <th className="text-left px-4 py-3 cursor-pointer hover:text-content" onClick={() => toggleSort('nome_usuario')}>Usuário{sortIndicator('nome_usuario')}</th>
                            <th className="text-left px-4 py-3 cursor-pointer hover:text-content" onClick={() => toggleSort('caderneta')}>Caderneta{sortIndicator('caderneta')}</th>
                            <th className="text-right px-4 py-3 cursor-pointer hover:text-content" onClick={() => toggleSort('total_registros')}>Total{sortIndicator('total_registros')}</th>
                            <th className="text-right px-4 py-3 cursor-pointer hover:text-content" onClick={() => toggleSort('dias_ativos')}>Dias{sortIndicator('dias_ativos')}</th>
                            <th className="text-left px-4 py-3 cursor-pointer hover:text-content" onClick={() => toggleSort('ultimo_registro')}>Último{sortIndicator('ultimo_registro')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                          {sortedCadernetas.map((c, i) => (
                            <tr
                              key={`${c.nome_usuario}-${c.caderneta}-${i}`}
                              className="hover:bg-surface-2 cursor-pointer"
                              onClick={() => setUsuarioSelecionado(c.nome_usuario)}
                            >
                              <td className="px-4 py-3 text-content-strong font-medium">{c.nome_usuario}</td>
                              <td className="px-4 py-3 text-content-muted">{cadernetaLabel(c.caderneta)}</td>
                              <td className="px-4 py-3 text-right font-semibold text-content-strong">{c.total_registros}</td>
                              <td className="px-4 py-3 text-right text-content-muted">{c.dias_ativos}</td>
                              <td className="px-4 py-3 text-content-muted text-xs">{formatDataHora(c.ultimo_registro)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-bold text-content-muted uppercase tracking-wide">
                      {usuarioSelecionado}
                    </h2>
                    <button
                      onClick={() => setUsuarioSelecionado(null)}
                      className="text-xs text-content-faint hover:text-content-muted"
                    >
                      ← voltar
                    </button>
                  </div>

                  {/* Breakdown por caderneta */}
                  <div className="space-y-2 mb-6">
                    {cadernetasDoUsuario.map((c) => (
                      <Card key={c.caderneta} className="bg-surface-1 p-3 border-0 shadow-sm">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-content-strong text-sm">{cadernetaLabel(c.caderneta)}</p>
                            <div className="flex items-center gap-3 text-xs text-content-faint mt-0.5">
                              <span>{c.total_registros} total</span>
                              <span>{c.dias_ativos} dias</span>
                              <span>{c.dias_ativos > 0 ? (c.total_registros / c.dias_ativos).toFixed(1) : '0'}/dia</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xl font-bold text-content-strong">{c.total_registros}</div>
                            <div className="text-xs text-content-faint">{formatData(c.primeiro_registro)} → {formatData(c.ultimo_registro)}</div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>

                  {/* Timeline diario */}
                  {detalhePorDia.length > 0 && (
                    <>
                      <h3 className="text-sm font-bold text-content-muted uppercase tracking-wide mb-3">
                        Atividade por dia
                      </h3>
                      <div className="bg-surface-1 rounded-lg shadow-sm p-4">
                        <p className="text-xs text-content-faint mb-2">registros por dia</p>
                        <div
                          className="flex gap-2 h-40 overflow-x-auto px-2"
                          role="img"
                          aria-label={`Registros por dia: ${detalhePorDia.map((d) => `${formatData(d.dia)} ${d.total}`).join(', ')}`}
                        >
                          {detalhePorDia.map((d) => {
                            const altura = Math.max(4, (d.total / maxDiaTotal) * 100)
                            return (
                              <div
                                key={d.dia}
                                className="flex flex-col items-center gap-1.5 flex-shrink-0 w-8"
                                title={`${formatData(d.dia)}: ${d.total} registros`}
                              >
                                <span className="text-xs font-semibold text-content">{d.total}</span>
                                <div className="w-full flex-1 flex items-end">
                                  <div
                                    className="w-full bg-primary rounded-t-md transition-all hover:bg-primary/80"
                                    style={{ height: `${altura}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-content-faint">{d.dia.slice(8)}/{d.dia.slice(5, 7)}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Análise de cadernetas: cobertura + sem registro */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Cobertura por caderneta (ranking das 20) */}
            <div>
              <h2 className="text-sm font-bold text-content-muted uppercase tracking-wide mb-3">Cobertura por caderneta</h2>
              <Card className="bg-surface-1 p-4 border-0 shadow-sm">
                <div className="space-y-2">
                  {coberturaPorCaderneta.map((c) => (
                    <button
                      key={c.key}
                      onClick={() => setCadernetaSelecionada(cadernetaSelecionada === c.key ? null : c.key)}
                      className={`flex items-center gap-3 w-full text-left p-1 rounded transition-colors ${
                        cadernetaSelecionada === c.key ? 'bg-primary/5' : 'hover:bg-surface-2'
                      }`}
                    >
                      <div className="w-32 text-xs text-content-muted truncate flex-shrink-0">{c.label}</div>
                      <div className="flex-1 bg-surface-2 rounded-full h-5 relative overflow-hidden">
                        <div
                          className={`h-full rounded-full ${c.total > 0 ? 'bg-primary' : 'bg-surface-3'}`}
                          style={{ width: `${Math.max(2, (c.total / maxCadernetaTotal) * 100)}%` }}
                        />
                      </div>
                      <div className="w-10 text-xs text-right text-content-muted flex-shrink-0">{c.total}</div>
                    </button>
                  ))}
                </div>
              </Card>
            </div>

            {/* Cadernetas nunca usadas */}
            <div>
              <h2 className="text-sm font-bold text-content-muted uppercase tracking-wide mb-3">
                Cadernetas sem registro no período
              </h2>
              {cadernetasNuncaUsadas.length === 0 ? (
                <Card className="p-6 text-center text-content-faint text-sm">Todas as 20 cadernetas tiveram uso no período</Card>
              ) : (
                <Card className="bg-surface-1 p-4 border-0 shadow-sm">
                  <div className="flex flex-wrap gap-2">
                    {cadernetasNuncaUsadas.map((key) => (
                      <span
                        key={key}
                        className="px-3 py-1.5 rounded-lg bg-surface-2 text-content-muted text-xs font-medium"
                      >
                        {cadernetaLabel(key)}
                      </span>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          </div>

          {/* Usuários parados */}
          {usuariosParados.length > 0 && (
            <div>
              <h2 className="text-sm font-bold text-content-muted uppercase tracking-wide mb-3">
                Usuários parados ({usuariosParados.length})
              </h2>
              <Card className="bg-surface-1 p-4 border-0 shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-content-faint text-xs uppercase border-b border-border-subtle">
                      <tr>
                        <th className="text-left pb-2">Usuário</th>
                        <th className="text-right pb-2">Histórico</th>
                        <th className="text-right pb-2">Cadernetas</th>
                        <th className="text-right pb-2">Dias ativos</th>
                        <th className="text-left pb-2">Último registro</th>
                        <th className="text-right pb-2">Parado há</th>
                        <th className="text-right pb-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {usuariosParados.map((u) => {
                        const paradoHa = diasDesde(u.ultimo_registro)
                        return (
                          <tr key={u.nome_usuario} className="hover:bg-surface-2">
                            <td className="py-2 text-content-strong font-medium">{u.nome_usuario}</td>
                            <td className="py-2 text-right text-content-muted">{u.total_registros}</td>
                            <td className="py-2 text-right text-content-muted">{u.cadernetas_usadas}</td>
                            <td className="py-2 text-right text-content-muted">{u.dias_ativos}</td>
                            <td className="py-2 text-content-muted text-xs">{formatData(u.ultimo_registro)}</td>
                            <td className="py-2 text-right">
                              <span className={`text-xs font-medium ${paradoHa !== null && paradoHa > 14 ? 'text-red-500' : 'text-orange-500'}`}>
                                {paradoHa !== null ? `${paradoHa} dia${paradoHa !== 1 ? 's' : ''}` : '-'}
                              </span>
                            </td>
                            <td className="py-2 text-right">
                              <button
                                onClick={() => setUsuarioSelecionado(u.nome_usuario)}
                                className="text-xs text-primary dark:text-primary-light hover:text-primary/80 font-medium"
                              >
                                ver histórico
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  )
}
