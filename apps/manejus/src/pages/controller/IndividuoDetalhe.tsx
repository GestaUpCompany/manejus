import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { formatDate, formatDateTime, toFarmDateOnly } from '@gestaup/shared'
import {
  Button,
  Card,
  ConfirmModal,
  DetailField,
  DetailLayout,
  DetailSection,
  EmptyState,
  Input,
  Modal,
  Select,
  formatValue,
  useToast,
} from '@gestaup/ui'
import {
  rotuloIndividuo,
  useIndividuoAcoes,
  useIndividuoDetalhe,
  type IndividuoResumo,
  type PartoIndividuo,
} from '../../hooks/useIndividuoDetalhe'
import { calcularEvolucaoPeso, calcularIdade, escalaPeso, gmdPeriodo, type PesagemEvolucao } from '../../utils/individuoPesagens'
import { statusEditaveis } from '../../utils/individualValidation'
import { montarDadosBaixa, motivoPadrao, motivosSaida, validarBaixa } from '../../utils/baixaIndividuo'

type Aba = 'resumo' | 'pesagens' | 'movimentacoes' | 'genealogia' | 'maternidade'

const ABAS: { id: Aba; label: string }[] = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'pesagens', label: 'Pesagens' },
  { id: 'movimentacoes', label: 'Movimentações' },
  { id: 'genealogia', label: 'Genealogia' },
  { id: 'maternidade', label: 'Maternidade' },
]

const th = 'px-3 py-2 text-left text-xs font-semibold text-content-muted uppercase tracking-wider'
const td = 'px-3 py-2 text-sm text-content'

const kg = (v: number | string | null | undefined, casas = 1) => {
  if (v === null || v === undefined || v === '') return '-'
  const n = Number(v)
  return Number.isFinite(n) ? `${n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })} kg` : '-'
}

const dinheiro = (v: number | string | null | undefined) => {
  if (v === null || v === undefined || v === '') return '-'
  const n = Number(v)
  return Number.isFinite(n) ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-'
}

const sinal = (n: number, casas: number) => `${n > 0 ? '+' : ''}${n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}`

function Badge({ children, tone }: { children: React.ReactNode; tone: 'verde' | 'amarelo' | 'vermelho' | 'neutro' }) {
  const tons = {
    verde: 'bg-green-500/10 text-green-800 dark:text-green-200',
    amarelo: 'bg-yellow-500/10 text-yellow-800 dark:text-yellow-200',
    vermelho: 'bg-red-500/10 text-red-800 dark:text-red-200',
    neutro: 'bg-surface-2 text-content-strong',
  }
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${tons[tone]}`}>{children}</span>
}

function statusTone(status: string): 'verde' | 'amarelo' | 'vermelho' | 'neutro' {
  if (status === 'Vivo') return 'verde'
  if (status === 'Morto') return 'vermelho'
  return 'amarelo'
}

function completudeBadge(syncStatus?: string | null) {
  if (syncStatus === 'manual_completo') return <Badge tone="verde">Completo</Badge>
  if (syncStatus === 'manual_incompleto') return <Badge tone="vermelho">Incompleto</Badge>
  if (syncStatus === 'automatico_incompleto') return <Badge tone="amarelo">Criado automaticamente</Badge>
  return <Badge tone="neutro">Não classificado</Badge>
}

function textoTipoParto(valor: unknown): string {
  if (Array.isArray(valor)) return valor.join(', ') || '-'
  if (typeof valor === 'string') return valor || '-'
  return '-'
}

/** Gráfico de linha da evolução do peso: série única, linha de 2px, marcadores com anel da superfície e tooltip no hover/foco. */
function GraficoPeso({ pontos }: { pontos: PesagemEvolucao[] }) {
  const [ativo, setAtivo] = useState<number | null>(null)
  const largura = 640
  const altura = 240
  const margem = { topo: 16, direita: 24, base: 32, esquerda: 56 }

  const geometria = useMemo(() => {
    const tempos = pontos.map((p) => new Date(p.data).getTime())
    const minT = Math.min(...tempos)
    const maxT = Math.max(...tempos)
    const pesos = pontos.map((p) => p.pesoKg)
    const minP = Math.min(...pesos)
    const maxP = Math.max(...pesos)
    const escala = escalaPeso(minP - Math.max((maxP - minP) * 0.1, 1), maxP + Math.max((maxP - minP) * 0.1, 1))
    const yMin = escala.min
    const yMax = escala.max
    const x = (t: number) =>
      maxT === minT
        ? margem.esquerda + (largura - margem.esquerda - margem.direita) / 2
        : margem.esquerda + ((t - minT) / (maxT - minT)) * (largura - margem.esquerda - margem.direita)
    const y = (p: number) => margem.topo + (1 - (p - yMin) / (yMax - yMin || 1)) * (altura - margem.topo - margem.base)
    const coords = pontos.map((p, i) => ({ x: x(tempos[i]), y: y(p.pesoKg) }))
    const ticks = escala.marcas
    return { coords, ticks, y }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pontos])

  const caminho = geometria.coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
  const pontoAtivo = ativo !== null ? pontos[ativo] : null
  const coordAtiva = ativo !== null ? geometria.coords[ativo] : null

  return (
    <div className="relative" onMouseLeave={() => setAtivo(null)}>
      <svg viewBox={`0 0 ${largura} ${altura}`} className="w-full h-auto" role="img" aria-label="Evolução do peso do animal ao longo das pesagens">
        {geometria.ticks.map((t) => (
          <g key={t}>
            <line x1={margem.esquerda} x2={largura - margem.direita} y1={geometria.y(t)} y2={geometria.y(t)} className="stroke-current text-border-base" strokeWidth={1} />
            <text x={margem.esquerda - 8} y={geometria.y(t) + 4} textAnchor="end" className="fill-current text-content-muted" fontSize={11}>
              {Math.round(t)}
            </text>
          </g>
        ))}
        <text x={margem.esquerda} y={altura - 8} className="fill-current text-content-muted" fontSize={11}>
          {formatDate(pontos[0].data)}
        </text>
        {pontos.length > 1 && (
          <text x={largura - margem.direita} y={altura - 8} textAnchor="end" className="fill-current text-content-muted" fontSize={11}>
            {formatDate(pontos[pontos.length - 1].data)}
          </text>
        )}
        {pontos.length > 1 && <path d={caminho} fill="none" className="stroke-current text-primary" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {geometria.coords.map((c, i) => (
          <g key={pontos[i].id}>
            <circle cx={c.x} cy={c.y} r={(ativo === i ? 6 : 4.5) + 2} className="fill-current text-surface-1" style={{ pointerEvents: 'none' }} />
            <circle cx={c.x} cy={c.y} r={ativo === i ? 6 : 4.5} className="fill-current text-primary" style={{ pointerEvents: 'none' }} />
            <circle
              cx={c.x}
              cy={c.y}
              r={16}
              fill="transparent"
              tabIndex={0}
              role="button"
              aria-label={`${formatDate(pontos[i].data)}: ${kg(pontos[i].pesoKg)}`}
              onMouseEnter={() => setAtivo(i)}
              onFocus={() => setAtivo(i)}
              onBlur={() => setAtivo(null)}
              style={{ outline: 'none' }}
            />
          </g>
        ))}
      </svg>
      {pontoAtivo && coordAtiva && (
        <div
          className="absolute z-10 pointer-events-none px-3 py-2 rounded-lg border border-border-base bg-surface-1 shadow-lg text-xs text-content"
          style={{
            left: `${(coordAtiva.x / largura) * 100}%`,
            top: `${(coordAtiva.y / altura) * 100}%`,
            transform: 'translate(-50%, calc(-100% - 12px))',
          }}
        >
          <div className="font-semibold text-content-strong">{kg(pontoAtivo.pesoKg)}</div>
          <div className="text-content-muted">{formatDate(pontoAtivo.data)}</div>
          {pontoAtivo.gmdKgDia !== null && (
            <div className="text-content-muted">
              {sinal(pontoAtivo.ganhoKg ?? 0, 1)} kg em {pontoAtivo.dias} d · GMD {sinal(pontoAtivo.gmdKgDia, 3)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function LinkIndividuo({ ind, onAbrir }: { ind?: IndividuoResumo | null; onAbrir: (id: string) => void }) {
  if (!ind) return <span className="text-content-muted">-</span>
  return (
    <button onClick={() => onAbrir(ind.id)} className="text-primary dark:text-primary-light hover:underline font-medium text-left">
      {rotuloIndividuo(ind)}
    </button>
  )
}

export function IndividuoDetalhe() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const abaParam = searchParams.get('aba') as Aba | null
  const aba: Aba = ABAS.some((a) => a.id === abaParam) ? (abaParam as Aba) : 'resumo'

  const { individuo, referencias, pesagens, movimentacoes, descendentes, partos } = useIndividuoDetalhe(id)
  const ind = individuo.data
  const { alterarStatus, excluir } = useIndividuoAcoes(ind)
  const ref = referencias.data

  const [modalStatus, setModalStatus] = useState(false)
  const [novoStatus, setNovoStatus] = useState('')
  const [dataSaida, setDataSaida] = useState('')
  const [motivoSaida, setMotivoSaida] = useState('')
  const [destinoSaida, setDestinoSaida] = useState('')
  const [errosBaixa, setErrosBaixa] = useState<Record<string, string>>({})
  const [modalExcluir, setModalExcluir] = useState(false)

  const evolucao = useMemo(() => calcularEvolucaoPeso(pesagens.data || []), [pesagens.data])
  const gmdMedio = gmdPeriodo(evolucao)
  const idade = calcularIdade(ind?.data_nascimento)

  const hojeFazenda = toFarmDateOnly(new Date().toISOString()) ?? new Date().toISOString().split('T')[0]

  const abrirIndividuo = (outroId: string) => navigate(`/controller/individuos/${outroId}`)
  const voltar = () => navigate('/controller/individuos')

  const trocarStatusNoModal = (status: string) => {
    setNovoStatus(status)
    setErrosBaixa({})
    if (status !== 'Vivo' && !motivoSaida) setMotivoSaida(motivoPadrao(status))
  }

  const confirmarStatus = async () => {
    const form = { status: novoStatus, dataSaida, motivoSaida, destinoSaida }
    const erros = validarBaixa(form, hojeFazenda)
    setErrosBaixa(erros)
    if (Object.keys(erros).length > 0) return
    try {
      await alterarStatus.mutateAsync(montarDadosBaixa(form))
      toast.success(novoStatus === 'Vivo' ? 'Animal reativado como Vivo.' : `Baixa registrada: ${novoStatus}.`)
      setModalStatus(false)
    } catch (error) {
      console.error('Erro ao alterar status:', error)
      toast.error('Não foi possível alterar o status.')
    }
  }

  const confirmarExclusao = async () => {
    try {
      await excluir.mutateAsync()
      toast.success('Indivíduo excluído.')
      navigate('/controller/individuos')
    } catch (error) {
      console.error('Erro ao excluir indivíduo:', error)
      toast.error('Não foi possível excluir o indivíduo.')
      setModalExcluir(false)
    }
  }

  const titulo = ind ? `Indivíduo ${rotuloIndividuo(ind)}` : 'Indivíduo'

  return (
    <DetailLayout
      loading={individuo.isLoading}
      loadError={individuo.error ? (individuo.error as Error).message || 'Erro ao buscar indivíduo' : null}
      notFound={!ind}
      onBack={voltar}
      onRetry={() => individuo.refetch()}
      title={titulo}
      actions={
        ind && (
          <>
            <Button onClick={() => navigate(`/controller/individuos/novo?edit=${ind.id}`)}>Editar</Button>
            <Button
              variant="secondary"
              onClick={() => {
                const status = statusEditaveis.includes(ind.status) ? ind.status : 'Vivo'
                setNovoStatus(status)
                setDataSaida(ind.data_saida ?? hojeFazenda)
                setMotivoSaida(ind.motivo_saida && motivosSaida.includes(ind.motivo_saida) ? ind.motivo_saida : motivoPadrao(status))
                setDestinoSaida(ind.destino_saida ?? '')
                setErrosBaixa({})
                setModalStatus(true)
              }}
            >
              Dar baixa / alterar status
            </Button>
            <Button variant="secondary" onClick={() => setModalExcluir(true)}>
              Excluir
            </Button>
          </>
        )
      }
    >
      {() => (
        <>
        <div className="space-y-4">
          {/* Cabeçalho resumido */}
          <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm" disableHover>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={statusTone(ind!.status)}>{ind!.status}</Badge>
              {completudeBadge(ind!.sync_status)}
              <span className="text-sm text-content-muted">
                {ind!.categoria} • {ind!.sexo} • {ind!.raca}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              <DetailField label="Peso atual" value={kg(ind!.peso_atual_kg)} />
              <DetailField label="Idade" value={idade ? `${idade.meses} meses (${idade.dias} dias)` : '-'} />
              <DetailField label="Lote" value={formatValue(ref?.lote)} />
              <DetailField label="Pasto" value={formatValue(ref?.pasto)} />
            </div>
          </Card>

          {/* Abas */}
          <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-border-base">
            {ABAS.map((a) => (
              <button
                key={a.id}
                role="tab"
                aria-selected={aba === a.id}
                onClick={() => setSearchParams(a.id === 'resumo' ? {} : { aba: a.id }, { replace: true })}
                className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  aba === a.id
                    ? 'border-primary text-primary dark:text-primary-light'
                    : 'border-transparent text-content-muted hover:text-content-strong'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>

          {aba === 'resumo' && (
            <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm" disableHover>
              <div className="space-y-6">
                <DetailSection title="Identificação">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <DetailField label="Brinco" value={formatValue(ind!.id_brinco)} />
                    <DetailField label="Chip" value={formatValue(ind!.id_chip)} />
                    <DetailField label="ID Manejo" value={formatValue(ind!.id_manejo)} />
                    <DetailField label="ID Provisório (cria)" value={formatValue(ind!.id_provisorio_cria)} />
                  </div>
                </DetailSection>

                <DetailSection title="Características">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <DetailField label="Sexo" value={formatValue(ind!.sexo)} />
                    <DetailField label="Raça" value={formatValue(ind!.raca)} />
                    <DetailField label="Categoria" value={formatValue(ind!.categoria)} />
                    <DetailField label="Classificação da matriz" value={formatValue(ind!.classificacao_matriz)} />
                    <DetailField label="Nº de partos" value={formatValue(ind!.numero_partos)} />
                    <DetailField label="Faixa de idade" value={formatValue(ind!.idade_era)} />
                  </div>
                </DetailSection>

                <DetailSection title="Nascimento, desmama e origem">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <DetailField label="Nascimento" value={formatDate(ind!.data_nascimento)} />
                    <DetailField label="Peso ao nascer" value={kg(ind!.peso_nascimento_kg)} />
                    <DetailField label="Desmama" value={formatDate(ind!.data_desmama)} />
                    <DetailField label="Peso na desmama" value={kg(ind!.peso_desmama_kg)} />
                    <DetailField label="Origem" value={formatValue(ind!.origem)} />
                  </div>
                </DetailSection>

                <DetailSection title="Localização">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <DetailField label="Lote" value={formatValue(ref?.lote)} />
                    <DetailField label="Pasto" value={formatValue(ref?.pasto)} />
                    <DetailField label="Setor" value={formatValue(ref?.setor)} />
                  </div>
                </DetailSection>

                <DetailSection title="Entrada na fazenda" highlighted>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <DetailField label="Data de entrada" value={formatDate(ind!.data_entrada_fazenda)} />
                    <DetailField label="PV de entrada" value={kg(ind!.pv_entrada_kg)} />
                    <DetailField label="Preço (R$/kg)" value={dinheiro(ind!.preco_entrada_reais_kg)} />
                    <DetailField label="Preço (R$/@)" value={dinheiro(ind!.preco_entrada_reais_arroba)} />
                    <DetailField label="Preço (R$/cabeça)" value={dinheiro(ind!.preco_entrada_reais_cabeca)} />
                    <DetailField label="Arroba do boi gordo" value={dinheiro(ind!.preco_arroba_boi_gordo)} />
                    <DetailField label="Ágio/Deságio" value={dinheiro(ind!.agio_desagio)} />
                    <DetailField label="Fornecedor" value={formatValue(ref?.fornecedor)} />
                    <DetailField label="Propriedade de origem" value={formatValue(ind!.propriedade_origem)} />
                    <DetailField label="Propriedade atual" value={formatValue(ind!.propriedade_atual)} />
                  </div>
                </DetailSection>

                <DetailSection title="Nutrição (herdada do lote)">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <DetailField label="Estratégia" value={formatValue(ind!.estrategia_nutricional_nome)} />
                    <DetailField label="GMD meta" value={ind!.gmd_kg_cab_dia ? `${Number(ind!.gmd_kg_cab_dia).toLocaleString('pt-BR')} kg/dia` : '-'} />
                    <DetailField label="Peso meta" value={kg(ind!.peso_meta_kg)} />
                  </div>
                </DetailSection>

                <DetailSection title="Rastreabilidade (SISBOV)">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <DetailField label="Inserção na rastreabilidade" value={formatDate(ind!.data_insercao_rastreabilidade)} />
                    <DetailField label="Liberação SISBOV" value={formatDate(ind!.data_liberacao_sisbov)} />
                  </div>
                </DetailSection>

                {ind!.status !== 'Vivo' && (
                  <DetailSection title="Saída do rebanho" highlighted>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <DetailField label="Data da saída" value={formatDate(ind!.data_saida)} />
                      <DetailField label="Motivo" value={formatValue(ind!.motivo_saida)} />
                      <DetailField label="Destino" value={formatValue(ind!.destino_saida)} />
                    </div>
                  </DetailSection>
                )}

                <DetailSection title="Registro">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <DetailField label="Criado em" value={formatDateTime(ind!.created_at)} />
                    <DetailField label="Atualizado em" value={formatDateTime(ind!.updated_at)} />
                  </div>
                </DetailSection>
              </div>
            </Card>
          )}

          {aba === 'pesagens' && (
            <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm" disableHover>
              {pesagens.isLoading ? (
                <p className="text-content-muted">Carregando pesagens...</p>
              ) : pesagens.error ? (
                <p className="text-red-500">Não foi possível carregar as pesagens.</p>
              ) : evolucao.length === 0 ? (
                <EmptyState title="Nenhuma pesagem registrada para este animal" />
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <DetailField label="Pesagens" value={String(evolucao.length)} />
                    <DetailField label="Última pesagem" value={`${kg(evolucao[evolucao.length - 1].pesoKg)} em ${formatDate(evolucao[evolucao.length - 1].data)}`} />
                    <DetailField label="Ganho total" value={evolucao.length > 1 ? `${sinal(evolucao[evolucao.length - 1].pesoKg - evolucao[0].pesoKg, 1)} kg` : '-'} />
                    <DetailField label="GMD médio" value={gmdMedio !== null ? `${sinal(gmdMedio, 3)} kg/dia` : '-'} />
                  </div>
                  <GraficoPeso pontos={evolucao} />
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-surface-2 border-b border-border-base">
                        <tr>
                          <th className={th}>Data</th>
                          <th className={th}>Peso</th>
                          <th className={th}>Dias</th>
                          <th className={th}>Ganho</th>
                          <th className={th}>GMD (kg/dia)</th>
                          <th className={th}>Manejo</th>
                          <th className={th}>Lote</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-base">
                        {[...evolucao].reverse().map((p) => {
                          const bruto = (pesagens.data || []).find((b) => b.id === p.id)
                          return (
                            <tr key={p.id}>
                              <td className={td}>{formatDate(p.data)}</td>
                              <td className={td}>{kg(p.pesoKg)}</td>
                              <td className={td}>{p.dias ?? '-'}</td>
                              <td className={td}>{p.ganhoKg !== null ? `${sinal(p.ganhoKg, 1)} kg` : '-'}</td>
                              <td className={td}>{p.gmdKgDia !== null ? sinal(p.gmdKgDia, 3) : '-'}</td>
                              <td className={td}>{formatValue(bruto?.tipo_manejo)}</td>
                              <td className={td}>{formatValue(bruto?.lote)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </Card>
          )}

          {aba === 'movimentacoes' && (
            <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm" disableHover>
              {movimentacoes.isLoading ? (
                <p className="text-content-muted">Carregando movimentações...</p>
              ) : movimentacoes.error ? (
                <p className="text-red-500">Não foi possível carregar as movimentações.</p>
              ) : (movimentacoes.data?.itens.length ?? 0) === 0 ? (
                <EmptyState title="Nenhuma movimentação registrada para este animal" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface-2 border-b border-border-base">
                      <tr>
                        <th className={th}>Data</th>
                        <th className={th}>Tipo</th>
                        <th className={th}>Origem</th>
                        <th className={th}>Destino</th>
                        <th className={th}>Categoria</th>
                        <th className={th}>Peso</th>
                        <th className={th}>Observação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-base">
                      {movimentacoes.data!.itens.map((m) => (
                        <tr key={m.id}>
                          <td className={td}>{formatDate(m.data)}</td>
                          <td className={td}>
                            {formatValue(m.motivo_movimentacao)}
                            {m.subtipo ? ` • ${m.subtipo}` : ''}
                          </td>
                          <td className={td}>{m.lote_origem_id ? movimentacoes.data!.lotes[m.lote_origem_id] || '-' : '-'}</td>
                          <td className={td}>{m.lote_destino_id ? movimentacoes.data!.lotes[m.lote_destino_id] || '-' : '-'}</td>
                          <td className={td}>{formatValue(m.categoria)}</td>
                          <td className={td}>{kg(m.peso_vivo_atual_kg)}</td>
                          <td className={td}>{formatValue(m.causa_observacao || m.observacao)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {aba === 'genealogia' && (
            <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm" disableHover>
              <div className="space-y-6">
                <DetailSection title="Ascendentes">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs font-medium text-content-muted uppercase">Pai</p>
                      <LinkIndividuo ind={ref?.pai} onAbrir={abrirIndividuo} />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-content-muted uppercase">Mãe</p>
                      <LinkIndividuo ind={ref?.mae} onAbrir={abrirIndividuo} />
                      {!ref?.mae && (ind!.categoria.toLowerCase().includes('ao pé') || ind!.origem === 'Nascimento') && (
                        <p className="text-xs text-content-muted mt-1">Mãe não vinculada.</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-content-muted uppercase">Mãe adotiva</p>
                      <LinkIndividuo ind={ref?.maeAdotiva} onAbrir={abrirIndividuo} />
                    </div>
                  </div>
                </DetailSection>

                <DetailSection title={`Descendentes diretos (${descendentes.data?.length ?? 0})`}>
                  {descendentes.isLoading ? (
                    <p className="text-content-muted">Carregando...</p>
                  ) : (descendentes.data?.length ?? 0) === 0 ? (
                    <p className="text-sm text-content-muted">Nenhum descendente cadastrado.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-surface-2 border-b border-border-base">
                          <tr>
                            <th className={th}>Identificação</th>
                            <th className={th}>Sexo</th>
                            <th className={th}>Categoria</th>
                            <th className={th}>Nascimento</th>
                            <th className={th}>Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-base">
                          {descendentes.data!.map((d) => (
                            <tr key={d.id}>
                              <td className={td}>
                                <LinkIndividuo ind={d} onAbrir={abrirIndividuo} />
                              </td>
                              <td className={td}>{formatValue(d.sexo)}</td>
                              <td className={td}>{formatValue(d.categoria)}</td>
                              <td className={td}>{formatDate(d.data_nascimento)}</td>
                              <td className={td}>{formatValue(d.status)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </DetailSection>
              </div>
            </Card>
          )}

          {aba === 'maternidade' && (
            <Card className="bg-surface-1 p-4 sm:p-6 border-0 shadow-sm" disableHover>
              {partos.isLoading ? (
                <p className="text-content-muted">Carregando registros...</p>
              ) : partos.error ? (
                <p className="text-red-500">Não foi possível carregar os registros de maternidade.</p>
              ) : (partos.data?.length ?? 0) === 0 ? (
                <EmptyState title="Nenhum registro de maternidade para este animal" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-surface-2 border-b border-border-base">
                      <tr>
                        <th className={th}>Data</th>
                        <th className={th}>Papel</th>
                        <th className={th}>Cria</th>
                        <th className={th}>Sexo</th>
                        <th className={th}>Peso da cria</th>
                        <th className={th}>Tipo de parto</th>
                        <th className={th}>Registro</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-base">
                      {partos.data!.map((p: PartoIndividuo) => (
                        <tr key={p.id}>
                          <td className={td}>{formatDate(p.data)}</td>
                          <td className={td}>
                            {p.individuo_id_cria === ind!.id ? 'Cria' : p.individuo_id_mae_adotiva === ind!.id ? 'Mãe adotiva' : 'Mãe'}
                          </td>
                          <td className={td}>
                            {p.individuo_id_cria && p.individuo_id_cria !== ind!.id ? (
                              <button onClick={() => abrirIndividuo(p.individuo_id_cria!)} className="text-primary dark:text-primary-light hover:underline font-medium">
                                {p.id_brinco_cria || p.id_provisorio_cria || 'Ver cria'}
                              </button>
                            ) : (
                              formatValue(p.id_brinco_cria || p.id_provisorio_cria)
                            )}
                          </td>
                          <td className={td}>{formatValue(p.sexo)}</td>
                          <td className={td}>{kg(p.peso_cria_kg)}</td>
                          <td className={td}>{textoTipoParto(p.tipo_parto)}</td>
                          <td className={td}>
                            <button onClick={() => navigate(`/controller/cadernetas/maternidade/${p.id}`)} className="text-primary dark:text-primary-light hover:underline font-medium">
                              Abrir
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </div>
      <Modal isOpen={modalStatus} onClose={() => setModalStatus(false)} title="Dar baixa / alterar status" size="sm">
        <div className="space-y-4">
          <Select
            label="Novo status"
            value={novoStatus}
            onChange={trocarStatusNoModal}
            options={statusEditaveis.map((s) => ({ value: s, label: s }))}
            placeholder="Selecione"
          />
          {errosBaixa.status && <p className="text-red-500 text-xs">{errosBaixa.status}</p>}
          {novoStatus && novoStatus !== 'Vivo' && (
            <>
              <div>
                <label className="block text-sm font-medium text-content mb-1">Data da saída</label>
                <Input type="date" value={dataSaida} max={hojeFazenda} onChange={(e) => setDataSaida(e.target.value)} />
                {errosBaixa.dataSaida && <p className="text-red-500 text-xs mt-1">{errosBaixa.dataSaida}</p>}
              </div>
              <div>
                <Select
                  label="Motivo da saída"
                  value={motivoSaida}
                  onChange={setMotivoSaida}
                  options={motivosSaida.map((m) => ({ value: m, label: m }))}
                  placeholder="Selecione"
                />
                {errosBaixa.motivoSaida && <p className="text-red-500 text-xs mt-1">{errosBaixa.motivoSaida}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-content mb-1">Destino (opcional)</label>
                <Input type="text" value={destinoSaida} placeholder="Comprador, frigorífico, fazenda..." onChange={(e) => setDestinoSaida(e.target.value)} />
              </div>
            </>
          )}
          <p className="text-xs text-content-muted">
            Registra o status, a data, o motivo e o destino do indivíduo. Não gera movimentação de saída nem muda a quantidade do lote. Para vendas, abates e transferências em lote use a Ordem de Serviço. Morte é registrada pela Caderneta de Morte.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalStatus(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmarStatus} disabled={alterarStatus.isPending || !novoStatus}>
              Salvar
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={modalExcluir}
        onClose={() => setModalExcluir(false)}
        onConfirm={confirmarExclusao}
        title="Excluir indivíduo"
        message={`Excluir ${ind ? rotuloIndividuo(ind) : 'este indivíduo'}?\nO registro sai das listagens, mas o histórico de pesagens e movimentações é mantido.${
          ind?.lote_atual ? '\nAtenção: o animal está em um lote e a exclusão não gera movimentação de saída.' : ''
        }`}
        confirmText="Excluir"
      />
        </>
      )}
    </DetailLayout>
  )
}
